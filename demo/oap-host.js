'use strict';
/**
 * demo/oap-host.js - an app of IterioDev's (akakingj/myapp-comfort: Seats, Ambient Light, Turn View, Drive Recorder,
 * Tailscale) in the MGU demo, as the head unit runs it: its own code from its package (the .tgz the Store installs:
 * src/*.js under javascript/, its renderer/ screens drawn by the GPU renderer - the demo's, as for every app), with a
 * stand-in for what the head unit's oap-sdk gives it:
 *
 *   OnlineApp        the start (a tile tap: ENTRY_POINT; a rebuild while the app list shows: in the background), the
 *                    RHMI application with its host states (one per screen; open / close as the HMI's stack: BACK,
 *                    HOME and the app's tile from the page), shutdown on SIGTERM
 *   someipBuilders   FrontCCU (the iDrive controller from the page), Vehicle2 statusCarSpeed2 (the demo's car); any
 *                    other service is "not offered" (as on a car without it: the apps say so on their screens)
 *   logging          the SDK logger: the demo's log
 *
 * The tools they talk to (/run/<tool>/ctl.sock) are the demo's: demo/comfort-sim.js stands in for the Comfort tool;
 * a tool not stood in for is not running (the app shows its own "install the tool" note).
 *
 *   node -r demo/preload.js demo/oap-host.js <tree> <dataDir>     (forked by demo/server.js; IPC as kit/tools/hu-stub.js's runLive)
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const EventEmitter = require('events');

const TREE = path.resolve(process.argv[2]);
const send = (m) => { if (process.connected) { try { process.send(m); } catch (e) { /* the server is gone */ } } };
const fmt = (a) => a.map((x) => (x && x.stack) ? x.stack : (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
// (these apps write every line of their log to stderr: the demo's log as info; a crash still comes as an error)
console.log = (...a) => send({ t: 'log', l: 'info', s: fmt(a) });
console.info = console.log;
console.warn = (...a) => send({ t: 'log', l: 'warn', s: fmt(a) });
console.error = (...a) => send({ t: 'log', l: /\b(failed|error|Error|ERR)\b/.test(fmt(a)) ? 'warn' : 'info', s: fmt(a) });
process.on('uncaughtException', (e) => { send({ t: 'log', l: 'error', s: 'demo: ' + (e && e.stack || e) }); setTimeout(() => process.exit(1), 50); });

const pkg = JSON.parse(fs.readFileSync(path.join(TREE, 'package.json'), 'utf8'));
const ID = pkg.name;
const CLOSED = process.env.MGU_EMU_CLOSED === '1';
let veh = {};

/* ---------------- RHMI: the host states, the HMI's stack ---------------- */
class Comp extends EventEmitter {
    constructor(name) { super(); this.name = name; this.value = null; }
    updateResources() { return Promise.resolve(); }
    setValue(v) { this.value = v; return Promise.resolve(); }
    setVisible() { return Promise.resolve(); }
    setEnabled() { return Promise.resolve(); }
}
const rhmi = new EventEmitter();
const comps = {};
let entry = null;
const stack = [];
rhmi.getByName = (n) => { if (!comps[n]) { comps[n] = new Comp(n); if (!entry) entry = n; } return comps[n]; };
const stackChanged = () => {
    rhmi.emit('applicationStackChanged', stack.length ? { ROOT_APP: stack.slice() } : { HOME: true });
    send({ t: 'screens', stack: stack.slice() });
};
const shown = (n, on) => { const c = comps[n]; if (!c) return; c.emit('visible', { visible: on }); c.emit('focus', { focus: on }); };
rhmi.openState = (n) => {
    rhmi.getByName(n);
    const top = stack[stack.length - 1];
    if (top === n) return Promise.resolve();
    const at = stack.indexOf(n);
    if (at >= 0) stack.splice(at + 1).reverse().forEach((x) => shown(x, false));
    else { if (top) shown(top, false); stack.push(n); }
    shown(n, true);
    stackChanged();
    return Promise.resolve();
};
rhmi.closeState = (n) => {
    const at = stack.indexOf(n);
    if (at < 0) return Promise.resolve();
    const top = at === stack.length - 1;
    stack.splice(at, 1);
    shown(n, false);
    if (top && stack.length) shown(stack[stack.length - 1], true);
    stackChanged();
    return Promise.resolve();
};
rhmi.mapEntryState = () => Promise.resolve();
rhmi.openEntryState = () => (entry ? rhmi.openState(entry) : Promise.resolve());
const back = () => { const top = stack[stack.length - 1]; if (top) rhmi.closeState(top); };
const home = () => { stack.slice().reverse().forEach((n) => rhmi.closeState(n)); };

/* ---------------- oap-sdk: OnlineApp, the SDK logger, the SOME/IP proxies ---------------- */
class OnlineApp extends EventEmitter {
    constructor() {
        super();
        this.rhmiApplication = rhmi;
        this.startReason = CLOSED ? 'AUTOSTART' : 'ENTRY_POINT';
        this.appDescription = { application: { entryPoints: [] } };
    }
    start() { setImmediate(() => this.emit('initialized')); return Promise.resolve(); }
    getVisibilityData() { return { reason: this.startReason }; }
    getEntryPoints() { return []; }
    getLastExecutedEntryPointUuid() { return CLOSED ? null : 'demo-entry'; }
    initialized() {
        send({ t: 'spec', spec: { id: ID, title: process.env.DEMO_TITLE || pkg.productName || ID, version: pkg.version, settings: [], screens: [] }, values: {} });
        return Promise.resolve();
    }
    destroyBundles() { return Promise.resolve(); }
}
['registerActive', 'registerInactive', 'registerHmiVisible', 'unregisterHmiVisible'].forEach((k) => { OnlineApp.prototype[k] = () => Promise.resolve(); });
let theApp = null;
const Host = new Proxy(OnlineApp, { construct(t, a, nt) { const o = Reflect.construct(t, a, nt); theApp = o; return o; } });
const logger = { info: console.log, warn: console.warn, error: console.error, debug: () => {} };
const logging = { getSDKLogger: () => logger, getLogger: () => logger };

// FrontCCU's knob state, as the car hands it over (enums by name)
const PUSH = ['KEINE_BETAETIGUNG', 'DREHGEBER_KURZ_GEDRUECKT', 'DREHGEBER_LANG_GEDRUECKT'];
const DEFL = { 0: 'MITTELSTELLUNG', 1: 'NORD_KURZ_GEDRUECKT', 4: 'OST_KURZ_GEDRUECKT', 7: 'SUED_KURZ_GEDRUECKT', 10: 'WEST_KURZ_GEDRUECKT' };
const field = (get) => {
    const subs = [];
    return { subs, subscribe(fn) { subs.push(fn); return Promise.resolve(); }, unsubscribe(fn) { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); return Promise.resolve(); },
        getValue() { return Promise.resolve(get ? get() : undefined); }, get() { return Promise.resolve(get ? get() : undefined); } };
};
let ccuNow = { frontSequenceNumberOperatingElement: 0, frontRotaryEncoderOperation: 0, frontRotaryEncoderPushButton: PUSH[0], frontRotaryEncoderDeflection: DEFL[0] };
const frontCcu = { statusRotaryEncoderState: field(() => ccuNow) };
const speed = () => ({ speedVehicleCentreOfGravity: Math.round(Math.max(0, Number(veh.speed) || 0) * 64) });
const vehicle2 = { statusCarSpeed2: field(speed) };
const OFFERED = { 'de.bmw.infotainment.controlelements.FrontCCU': frontCcu, 'de.bmw.infotainment.vehicle.Vehicle2': vehicle2 };
const someipBuilders = {
    buildAndInitTypedProxy(iface, inst, timeout) {
        if (OFFERED[iface]) return Promise.resolve(OFFERED[iface]);
        const ms = Math.min(3000, typeof timeout === 'number' ? timeout : (timeout && timeout.timeoutMs) || 3000);
        return new Promise((res, rej) => setTimeout(() => rej(new Error('waitUntilAvailable(' + iface + ', ' + inst + ') timed out (the demo has no such service)')), ms));
    },
};
const SDK = { 'oap-sdk/src/core/OnlineApp.js': Host, 'oap-sdk/src/core/OnlineApp': Host, 'oap-sdk/src/logging/logging': logging, 'oap-sdk/src/logging/logging.js': logging,
    'oap-sdk/src/someip/someipBuilders': someipBuilders, 'oap-sdk/src/someip/someipBuilders.js': someipBuilders };
const load = Module._load;
Module._load = function (request, parent, isMain) {
    if (typeof request === 'string' && request.indexOf('oap-sdk') === 0) {
        if (SDK[request]) return SDK[request];
        throw new Error('demo: no stand-in for ' + request);
    }
    return load.apply(this, arguments);
};

/* ---------------- the page (IPC: as kit/tools/hu-stub.js's runLive) ---------------- */
process.on('message', (m) => {
    if (!m) return;
    if (m.t === 'veh') { veh = m.v || {}; vehicle2.statusCarSpeed2.subs.forEach((f) => { try { f(speed()); } catch (e) { /* the app's */ } }); }
    else if (m.t === 'ccu') {
        const e = m.ev || {}, last = ccuNow;
        ccuNow = { frontSequenceNumberOperatingElement: e.seq, frontRotaryEncoderOperation: e.knob, frontRotaryEncoderPushButton: PUSH[e.pb] || PUSH[0], frontRotaryEncoderDeflection: DEFL[e.df] || DEFL[0] };
        frontCcu.statusRotaryEncoderState.subs.forEach((f) => { try { f(ccuNow); } catch (x) { /* the app's */ } });
        // (the HMI's own: a push left is BACK)
        if (e.df === 10 && last.frontRotaryEncoderDeflection !== DEFL[10]) back();
    } else if (m.t === 'hmi') {
        if (m.a === 'back') back();
        else if (m.a === 'home') home();
        else if (m.a === 'open') {
            const to = m.screen && comps[m.screen] ? m.screen : stack[stack.length - 1] || entry;
            if (theApp && !stack.length) theApp.emit('entryPointExecute', 'demo-entry');
            if (to) rhmi.openState(to);
        }
    }
});
process.on('disconnect', () => process.exit(0));
process.on('SIGTERM', () => { if (theApp) theApp.emit('shutdown', 'demo'); setTimeout(() => process.exit(0), 800); });

const main = path.join(TREE, 'javascript', 'main.js');
require(main);
send({ t: 'loaded' });
