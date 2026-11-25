'use strict';
/**
 * demo/preload.js - loaded first in every app process of the MGU demo (node -r, demo/server.js). The app itself runs
 * unchanged with its own kit (kit/tools/hu-stub.js); this file only stands in for what a PC does not have:
 *
 *   car       kit/sim.js (the demo drive car.js and Live Data use) gives the demo panel's values instead of its own
 *             drive: one car for every app and the cluster (IPC {t:'veh', v} from the server, 20 a second)
 *   readings  the cluster apps' data.js (shared/data.js): the panel's boost, intake air, gearbox oil, drive mode ...
 *             over its own demo values
 *   cluster   cluster_render_client.js: the real client, but with no socket - what the app makes (layers, uniforms,
 *             binds, pixels) is kept as the client keeps it and sent to the server (IPC {t:'cluster'}), which the page
 *             draws with WebGL as the KOMBI would
 *   files     /dev/shm/... and /run/... (the apps' shared files: Car profile, Cluster Info's providers, the Waze map's
 *             status) go to the demo's own folder (DEMO_SHM), so they work on Windows too
 *   Windows   the renderer's socket is a named pipe there: kit/renderd.js takes it (fs.statSync says "socket")
 *
 * Nothing here is app-specific: an app changed in apps/ runs here as changed.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const SHM = process.env.DEMO_SHM || '';
const APP_ID = process.env.DEMO_APP || '';
const send = (m) => { if (process.send && process.connected) { try { process.send(m); } catch (e) { /* the server is gone */ } } };

/* ---------------- files: /dev/shm and /run into the demo's folder ---------------- */
if (SHM) {
    const map = (p) => {
        if (typeof p !== 'string') return p;
        const q = p.replace(/\\/g, '/');
        if (q.startsWith('/dev/shm/') || q === '/dev/shm') return path.join(SHM, q.slice('/dev/shm'.length));
        if (q.startsWith('/run/')) return path.join(SHM, 'run', q.slice(5));
        return p;
    };
    const one = ['readFile', 'readFileSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'existsSync', 'stat', 'statSync',
        'lstat', 'lstatSync', 'mkdir', 'mkdirSync', 'readdir', 'readdirSync', 'unlink', 'unlinkSync', 'open', 'openSync', 'access', 'accessSync',
        'utimes', 'utimesSync', 'watch', 'watchFile', 'unwatchFile', 'createReadStream', 'createWriteStream', 'rmSync', 'rm', 'chmod', 'chmodSync', 'truncate', 'truncateSync'];
    const two = ['rename', 'renameSync', 'copyFile', 'copyFileSync'];
    one.forEach((k) => { const f = fs[k]; if (typeof f === 'function') fs[k] = function (p, ...a) { return f.call(this, map(p), ...a); }; });
    two.forEach((k) => { const f = fs[k]; if (typeof f === 'function') fs[k] = function (p, q, ...a) { return f.call(this, map(p), map(q), ...a); }; });
    if (fs.promises) ['readFile', 'writeFile', 'stat', 'mkdir', 'readdir', 'unlink', 'access'].forEach((k) => { const f = fs.promises[k]; if (typeof f === 'function') fs.promises[k] = function (p, ...a) { return f.call(this, map(p), ...a); }; });
    // (a folder an app writes into without making it first)
    ['cluster-info', 'cluster-layouts', 'mgu-hud', 'run'].forEach((d) => { try { fs.mkdirSync(path.join(SHM, d), { recursive: true }); } catch (e) { /* there */ } });
}

/* ---------------- Windows: the renderer's named pipe counts as a socket ---------------- */
if (process.platform === 'win32') {
    const st = fs.statSync;
    fs.statSync = function (p, ...a) {
        if (typeof p === 'string' && /^\\\\[.?]\\pipe\\/.test(p)) return { isSocket: () => true, isFile: () => false, isDirectory: () => false, size: 0, mtimeMs: 0 };
        return st.call(this, p, ...a);
    };
}

/* ---------------- the car: the panel's values ---------------- */
// (kit/tools/hu-stub.js feeds the car's main signals itself, from the server's {t:'sig'}; the ones it has no feed for
// go here through its signals stub: hu.feed, the head unit object it makes - found as the EventEmitter that has it)
let VEH = null, vehAt = 0, lightKey = '', lightAt = 0;
const emitters = [];
// the turn signal lever / the function blinking (indicators.js in Cluster Info, hud-signals.js in Redline)
const IND = { off: ['BLINKEN_AUS', 'BLINKEN_AUS'], left: ['DAUER_BLINKEN_LINKS_EIN', 'DAUERBLINKEN_LINKS'],
    right: ['DAUER_BLINKEN_RECHTS_EIN', 'DAUERBLINKEN_RECHTS'], both: ['BEIDSEITIGES_BLINKEN_EIN', 'WARNBLINKEN_MANUELL'] };
const huFeed = () => { const h = emitters.find((e) => typeof e.feed === 'function'); return h ? h.feed : null; };
process.on('message', (m) => {
    if (!m || m.t !== 'veh') return;
    VEH = m.v; vehAt = Date.now();
    const feed = huFeed();
    if (!feed) return;
    try {
        // the sport display's boost (FES): hundredths of a bar over atmosphere (Cluster Info's BOOST, Redline's)
        if (typeof VEH.boostActual === 'number') feed('de.bmw.infotainment.drivingexcitement.FES', 'statusSwitchDriveDynamicSport2', { displayBoostPressure: Math.max(0, Math.min(253, Math.round(VEH.boostActual * 100))) });
        // the turn signals (Light.StatusFunctionsIndicators / 2: Cluster Info's and Redline's HUD arrows, Ambient config) and
        // day / night (the light sensor): as the car hands them over, by name; when they change, and every second
        const key = VEH.indicator + '|' + VEH.night, now = Date.now();
        if (key !== lightKey || now - lightAt > 1000) {
            lightKey = key; lightAt = now;
            const L = IND[VEH.indicator] || IND.off;
            const v = { controlIndicateDirection: L[0], activeFunctionIndicateDirection: L[1] };
            feed('de.bmw.body.Light', 'StatusFunctionsIndicators', v);
            feed('de.bmw.body.Light', 'StatusFunctionsIndicators2', v);
            feed('de.bmw.infotainment.vehicle.Vehicle', 'statusDayNightChangeOver', { dayNightChangeOver: VEH.night ? 'NACHT' : 'TAG' });
        }
        // the selected gear (AK Cluster ID8's gear): when it changes, as the car sends it, and every second
        const sel = selectOf(VEH);
        if (sel && (sel !== selSent || now - selAt > 1000)) {
            selSent = sel; selAt = now;
            feed('de.bmw.infrastructure.VehicleInformation', 'DataPowerTrain2', { statusGearSelectionDrive: sel });
        }
    } catch (e) { /* an app without it */ }
    try { if (Date.now() - slowAt >= 1000) { slowAt = Date.now(); slowSignals(feed, VEH); } } catch (e) { /* an app without them */ }
});
/* The car's slower signals, as the car hands them over (raw values, as kit/runtime/car.js and AK Cluster ID8's
   src/car/vehicle.js read them), once a second from the panel: the cluster's time and trip computer, the outside
   temperature, the drive mode, the drive battery, the engine's kind (the selected gear: above, when it changes). (Apps on data.js have them from the panel already.) */
let slowAt = 0, selSent = 0, selAt = 0;
const SELECT = { P: 3, R: 2, N: 1 };
/** The selected gear as DataPowerTrain2.statusGearSelectionDrive: N 1, R 2, P 3, D / S / M with gear n: 4 + n. */
const selectOf = (v) => SELECT[v.stage] || (/^[DSM]$/.test(v.stage) && v.gear >= 1 && v.gear <= 9 ? 4 + (v.gear | 0) : 0);
// (the panel's drive modes, as the car names them)
const MODE_NAMES = { COMFORT: 'COMFORT', SPORT: 'SPORT_DYNAMIC', 'SPORT+': 'SPORT_EXPERT', SPORT_PLUS: 'SPORT_EXPERT', 'ECO PRO': 'ECO_PRO_EFFICIENT', ECO_PRO: 'ECO_PRO_EFFICIENT' };
// (a plug-in hybrid names them its own way: the eDrive mode in the name, which says plug-in hybrid to the apps)
const PHEV_MODES = { COMFORT: 'PHEV_HYBRID_STANDARD', SPORT: 'PHEV_SPORT_STANDARD', 'SPORT+': 'PHEV_SPORT_PLUS', SPORT_PLUS: 'PHEV_SPORT_PLUS', 'ECO PRO': 'PHEV_HYBRID_ECO', ECO_PRO: 'PHEV_HYBRID_ECO' };
const TANK_L = 59, ODO_KM = 12345, AVG_L100 = 8.4;
function slowSignals(feed, v) {
    const num = (x) => typeof x === 'number' && isFinite(x);
    const d = new Date();
    feed('de.bmw.infotainment.KombiIF', 'statusShowTimeDate', { statusDisplayClockTimeDate: 1, displayHour: d.getHours(), displayMinute: d.getMinutes(), displaySecond: d.getSeconds() });
    feed('de.bmw.infotainment.KombiIF', 'statusRangeTankStatus', {
        range: num(v.frange) ? Math.max(0, Math.min(4094, Math.round(v.frange))) : 4095,
        fluidLevelFuelTank: num(v.fuelPct) ? Math.max(0, Math.min(254, Math.round(TANK_L * v.fuelPct / 100))) : 255,
        mileageKilometre: ODO_KM,
    });
    feed('de.bmw.infotainment.KombiIF', 'statusBordcomputerAverage', { consumptionAverage1BC1: Math.round(AVG_L100 * 10), statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM' });
    if (num(v.erange)) feed('de.bmw.infotainment.KombiIF', 'displayRangeElectricVehicle', { displayRangeElectricVehicle: Math.max(0, Math.round(v.erange)) });
    if (num(v.outside)) feed('de.bmw.infrastructure.EnvironmentalInformation', 'ExteriorTemperature', { temperatureExterior: Math.max(0, Math.min(254, Math.round((v.outside + 40) / 0.5))) });
    const mode = (v.vtype === 'phev' ? PHEV_MODES : MODE_NAMES)[String(v.driveMode || '').toUpperCase()];
    // the engine's kind (kit/runtime/engine.js reads it for its Auto: petrol or diesel; a plug-in hybrid's: HYBRIDMOTOR)
    if (v.typeEngine) feed('de.bmw.infotainment.vehicle.Vehicle2', 'statusVehiclePartType', { typeEngine: v.typeEngine });
    if (mode) feed('de.bmw.infotainment.drivingexcitement.FES', 'statusFESVehicleDynamicSwitchHMI', { actualValueModeDrivingExperience: mode });
    if (num(v.soc)) feed('de.bmw.infotainment.drivingexcitement.Efficiencytainment2', 'statusChargeOfBatteryHybrid', { displayChargingConditionHighVoltageStorage: Math.max(0, Math.min(100, Math.round(v.soc))) });
}
const fresh = () => VEH && Date.now() - vehAt < 3000;
const CORE = ['rpm', 'speed', 'gear', 'gLong', 'gLat', 'coolant', 'oil', 'torque', 'throttle'];

function panelSim(RealSim) {
    /* kit/sim.js's class: sample() the panel's car (its own drive until the server sends one) */
    return class PanelSim extends RealSim {
        sample(now) {
            const own = super.sample(now);
            if (!fresh()) return own;
            const v = VEH, o = {};
            Object.keys(v).forEach((k) => { if (typeof v[k] === 'number' || typeof v[k] === 'string' || typeof v[k] === 'boolean') o[k] = v[k]; });
            CORE.forEach((k) => { if (typeof v[k] !== 'number') o[k] = own[k]; });
            o.throttle = typeof v.pedal === 'number' ? v.pedal / 100 : own.throttle;   // (sim.js: 0..1, the pedal)
            o.gear = /^[DSM]$/.test(v.stage) ? Math.max(1, v.gear | 0) : 0;
            return o;
        }
    };
}

/* the readings data.js has from the car's other services and the engine unit: the panel's over its demo values */
const OVER = ['boostActual', 'boostTarget', 'iat', 'gearbox', 'outside', 'timing', 'hpfp', 'lpfp', 'pedal', 'throttle', 'fuelPct', 'fuelLevel',
    'frange', 'trange', 'steer', 'yaw', 'driveMode', 'mode', 'stage', 'soc', 'kw', 'battTemp', 'battMin', 'battMax', 'erange'];
function wrapData(mod) {
    if (!mod || typeof mod.startData !== 'function' || own(mod.startData, '__demoData')) return mod;
    const orig = mod.startData;
    const startData = function () {
        const D = orig.apply(this, arguments);
        if (!D || typeof D.data !== 'function') return D;
        const data = D.data.bind(D);
        D.data = function () {
            const o = data();
            if (!fresh() || !o) return o;
            const v = VEH;
            OVER.forEach((k) => { if (v[k] !== undefined && v[k] !== null) o[k] = v[k]; });
            if (v.tyres) o.tyres = v.tyres;
            if (typeof o.iat === 'number' && typeof o.outside === 'number') o.iatRise = o.iat - o.outside;
            if (typeof v.fuelPct === 'number') { o.fuelPct = v.fuelPct; o.fuelPctFrom = 'engine'; }
            if (typeof o.kw === 'number') { o.kwOut = Math.max(0, o.kw); o.kwIn = Math.max(0, -o.kw); }
            return o;
        };
        return D;
    };
    Object.defineProperty(startData, '__demoData', { value: true });
    return Object.assign({}, mod, { startData });
}

/* ---------------- the cluster: the real client with no socket ---------------- */
const clients = [];
function demoRender(mod) {
    if (!mod || typeof mod.ClusterRender !== 'function' || own(mod.ClusterRender, '__demoRender')) return mod;
    const Real = mod.ClusterRender;
    class DemoRender extends Real {
        constructor(app, p) { super(app, p); this._demoN = clients.length; clients.push(this); this._rev = new Map(); }
        connect() {
            this.closed = false;
            if (this.ready) return;
            this.connected = true; this.ready = true; this.backend = 'demo'; this.targets = 'panel map hud';
            setImmediate(() => { if (!this.closed) { this.emit('ready'); this.emit('target', 'panel', 'shown', this.app, '', false, false); } });
        }
        close() { this.closed = true; this.ready = false; this.connected = false; }
        _open() {}
        _write() {}
        _send() {}
        _pump() {}
        status() { setImmediate(() => this.emit('status', 'MGU demo: the cluster drawn on the PC')); }
        pixels(ref, rects, px) { const ok = super.pixels(ref, rects, px); if (ok) this._rev.set(ref, (this._rev.get(ref) || 0) + 1); return ok; }
    }
    Object.defineProperty(DemoRender, '__demoRender', { value: true });
    return Object.assign({}, mod, { ClusterRender: DemoRender });
}

/* every ~33 ms: the layers of every client, the shaders and pixels only when new (the server keeps them for the page) */
const fsIds = new Map();
const sentRev = new Map();
let lastJson = '';
function snapshot() {
    if (!clients.length) return;
    const fsNew = {};
    const layers = [];
    clients.forEach((c, ci) => {
        if (c.closed) return;
        c.layers.forEach((l, ref) => {
            const o = l.opts, key = ci + ':' + ref;
            const L = { k: key, kind: l.kind, target: o.target };
            if (l.kind === 'asset') {
                Object.assign(L, { w: o.w, h: o.h, fmt: o.format || 'rgba8', smp: o.sampling || 'nearest' });
            } else {
                Object.assign(L, { cls: o.klass || 'content', z: o.z || 0, x: o.x || 0, y: o.y || 0, w: o.w || 0, h: o.h || 0, vis: o.visible !== false, op: o.opacity === undefined ? 1 : o.opacity });
                if (o.contend) L.contend = 1;
                if (l.kind === 'effect') {
                    let id = fsIds.get(o.fs);
                    if (id === undefined) { id = APP_ID + '#' + fsIds.size; fsIds.set(o.fs, id); fsNew[id] = o.fs; }
                    L.fs = id;
                    if (o.vs) L.vs = o.vs;
                    L.u = {};
                    Object.keys(l.uniforms).forEach((uk) => { const m = l.uniforms[uk]; if (!m.part) L.u[m.name] = [String(m.v).split(' ').map(Number), m.type || '']; });
                    L.b = {};
                    Object.keys(l.binds).forEach((bk) => { const b = l.binds[bk]; L.b[b.msg.sampler] = ci + ':' + b.asset; });
                    if (l.anims && l.anims.size) L.anims = Array.from(l.anims.values()).map((a) => ({ p: a.property, n: a.name, keys: a.keys, loop: a.loop, i: a.interp }));
                } else if (l.kind === 'image') {
                    Object.assign(L, { iw: l.iw, ih: l.ih });
                }
            }
            if (l.image && l.have) {
                const rev = c._rev.get(ref) || 0;
                L.rev = rev;
                if (sentRev.get(key) !== rev) { sentRev.set(key, rev); L.px = l.image.toString('base64'); }
            }
            layers.push(L);
        });
    });
    const msg = { t: 'cluster', app: APP_ID, layers, fsNew };
    const j = JSON.stringify(msg);
    if (j === lastJson) return;
    lastJson = j;
    send(msg);
}
setInterval(snapshot, 33).unref();

/* ---------------- AK Cluster ID8's engine unit ---------------- */
// (its readings the bus does not carry are asked of the engine unit, UDS 22, through the kit's read-only link:
// src/car/engine.js. Here the panel answers the first identifier of each, as the car's DME would; every other
// one, and anything but a read, is refused. Only in AK Cluster ID8's process: other apps keep their own demo.)
const ID8 = process.argv.some((a) => /akakingj_cluster_id8/.test(a));
const AMB_HPA = 1013;
function dmeReply(did) {
    const v = fresh() ? VEH : {}, on = (typeof v.rpm === 'number' ? v.rpm : 800) > 400;
    const bytes = (n, raw) => { raw = Math.max(0, Math.min(Math.pow(256, n) - 1, Math.round(raw))); const b = []; for (let i = n - 1; i >= 0; i--) b.push((raw >> (8 * i)) & 0xff); return b; };
    switch (did) {
        case 0x580F: return bytes(1, ((typeof v.iat === 'number' ? v.iat : 31) + 48) / 0.75);                 // intake air, C
        case 0x5853: return bytes(2, (on ? 14.2 : 12.4) * 1000);                                              // battery, mV
        case 0x4436: return bytes(2, AMB_HPA + (on ? 1500 + Math.min(3000, (v.rpm || 0) * 0.6) : 0));        // oil, hPa absolute
        case 0x4201: return bytes(2, AMB_HPA / 0.0390625);                                                    // ambient, hPa
        default: return null;
    }
}
function demoDiag(mod) {
    class DemoDiag {
        constructor() { this.misses = {}; }
        async init() { return this; }
        get available() { return true; }
        wake() { this.misses = {}; }
        cancel() {}
        async physical(ecu, sid, data) {
            const did = sid === 0x22 && data && data.length >= 2 ? (data[0] << 8) | data[1] : -1;
            const r = ecu === 0x12 && did >= 0 ? dmeReply(did) : null;
            return r ? [0x62, data[0], data[1]].concat(r) : [0x7F, sid, 0x31];
        }
    }
    return Object.assign({}, mod, { ReadOnlyDiag: DemoDiag });
}

/* ---------------- the hooks, by the module's file ---------------- */
// (marks are own properties: a class's static is inherited - ClusterRender extends EventEmitter)
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
const swapped = new WeakMap();
function swap(mod, make) { if (!swapped.has(mod)) swapped.set(mod, make(mod)); return swapped.get(mod); }
const load = Module._load;
Module._load = function (request, parent, isMain) {
    // hu-stub.js's EventEmitter: its head unit object (hu.feed) is kept, for the signals above
    if (request === 'events' && parent && /hu-stub\.js$/.test(parent.filename || '')) {
        const EE = load.apply(this, arguments);
        if (!own(EE, '__demoHu')) Object.defineProperty(EE, '__demoHu', { value: class extends EE { constructor(...a) { super(...a); if (emitters.length < 2) emitters.push(this); } } });
        return EE.__demoHu;
    }
    const mod = load.apply(this, arguments);
    let file = '';
    try { file = Module._resolveFilename(request, parent, isMain); } catch (e) { return mod; }
    const base = path.basename(file), dir = path.basename(path.dirname(file));
    if (base === 'sim.js' && dir === 'kit' && typeof mod === 'function') return swap(mod, panelSim);
    if (base === 'cluster_render_client.js' && mod && typeof mod.ClusterRender === 'function') return swap(mod, demoRender);
    if (base === 'data.js' && mod && typeof mod.startData === 'function') return swap(mod, wrapData);
    if (base === 'readonly-diag.js' && ID8 && mod && typeof mod.ReadOnlyDiag === 'function') return swap(mod, demoDiag);
    return mod;
};
