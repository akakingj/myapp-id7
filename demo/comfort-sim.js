'use strict';
/**
 * demo/comfort-sim.js - the Comfort tool (IterioDev's iteriodev-comfort, akakingj/myapp-comfort tools/iteriodev-comfort)
 * as the MGU demo's stand-in: its control socket /run/iteriodev-comfort/ctl.sock (JSON lines, comfort.js "request"),
 * so the apps that drive it (Seats, Ambient Light, 재민's Seats Easy Access) run against a car's two front seats and
 * its ambient light. The real tool moves the seats through the seat modules (UDS); here the seats move in the demo's
 * own numbers (hall counts 8192..57344 as seat.js reads them), and the light's settings are kept as ambient.js keeps
 * them (its settings(), loaded from the repository at run time - nothing of it is copied here).
 *
 *   const sim = require('./comfort-sim').start({ path, file, veh: () => Veh.v, ambientJs, log });
 *   sim.state()   // what the tool pushes: { parked, carOn, ambient, seats, settings }
 *
 * Nothing here talks to a car. One server for every app, as the one tool on the car.
 */
const fs = require('fs');
const net = require('net');

const AXES = ['SLV', 'SHV', 'LNV', 'SNV', 'KHV'];
const ORDER = ['LNV', 'SLV', 'SHV', 'SNV', 'KHV'];                 // a recall: backrest first, then the seat (seat.js)
const MIN = 8192, MAX = 57344, SPEED = 5000;                       // counts, counts a second
const JOG_MS = 900, TICK_MS = 100;
const SEATS = ['driver', 'passenger'];
// a G20's light modules as the demo's own list (zone: where the app lists it)
const MODULES = [['Dash line driver', 'dash'], ['Dash line centre', 'dash'], ['Dash line passenger', 'dash'], ['Centre stack tray', 'console'],
    ['Footwell driver front', 'footwell'], ['Footwell passenger front', 'footwell'], ['Driver door front line', 'doors'], ['Passenger door front line', 'doors']]
    .map(([name, zone], i) => ({ bus: 'lin2', nad: i + 1, name, zone, fault: false }));

function start(o) {
    const log = o.log || (() => {});
    let amb = null;
    try { if (o.ambientJs) amb = require(o.ambientJs); } catch (e) { log('comfort: ambient.js: ' + e.message); }
    const pos0 = () => ({ SLV: 30000, SHV: 26000, LNV: 33000, SNV: 30000, KHV: 28000 });
    let data = { pos: { driver: pos0(), passenger: pos0() }, memories: { driver: [null, null, null], passenger: [null, null, null] },
        exit: { driver: null, passenger: null }, pre: { driver: null, passenger: null }, room: null, settings: { easyExit: true }, ambient: null };
    try { data = Object.assign(data, JSON.parse(fs.readFileSync(o.file, 'utf8'))); } catch (e) { /* the first run */ }
    const settingsOf = (cur, p) => {
        if (amb && amb.settings) return amb.settings(cur, p);
        const out = Object.assign({ on: true, rgb: [255, 120, 40], bright: 70, follow: false, zones: {}, modes: { on: false, rgb: {} } }, cur || {});
        if (p && typeof p === 'object') ['on', 'rgb', 'bright', 'follow', 'zones', 'modes'].forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
        return out;
    };
    data.ambient = settingsOf(data.ambient, null);
    const modules = MODULES;
    let saveT = null;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(o.file, JSON.stringify(data, null, 1)); } catch (e) { /* the demo's folder */ } }, 300); };

    const veh = () => (o.veh && o.veh()) || {};
    const parked = () => { const v = veh(); return !(v.speed > 2); };
    const carOn = () => true;                                                   // (the demo's car: ignition on)
    // the drive mode as the tool reads it (ambient.js MODES numbers)
    const MODE = { COMFORT: 4, SPORT: 1, 'SPORT+': 2, SPORT_PLUS: 2, 'ECO PRO': 7, ECO_PRO: 7 };
    let motion = null, job = null, jobSeat = null, target = null;
    const clamp = (x) => Math.max(MIN, Math.min(MAX, x));
    const per = (f) => ({ driver: f('driver'), passenger: f('passenger') });
    const status = () => ({ state: {
        parked: parked(), carOn: carOn(),
        ambient: { settings: data.ambient, carOn: true, lit: !!data.ambient.on, mode: MODE[String(veh().driveMode || '').toUpperCase()] || 4,
            modules: modules.map((m) => ({ id: amb && amb.key ? amb.key(m) : m.bus + '.' + m.nad, name: m.name, zone: m.zone, fault: !!m.fault })) },
        seats: { pos: data.pos, moving: motion ? { seat: motion.seat, axis: motion.axis } : job && target ? { seat: jobSeat, axis: target.axis || null } : null,
            job, jobSeat, memories: data.memories, roomOut: !!data.room, wheel: false,
            axes: per(() => AXES.slice()), hall: per(() => true), found: per(() => 'ok'),
            exit: per((s) => !!data.exit[s]), pre: per((s) => !!data.pre[s]) },
        settings: data.settings } });
    const clients = new Set();
    let pushT = null;
    const push = () => { if (pushT) return; pushT = setTimeout(() => { pushT = null; const l = JSON.stringify(status()) + '\n'; clients.forEach((c) => { try { c.write(l); } catch (e) { /* gone */ } }); }, 100); };

    function halt() { motion = null; job = null; jobSeat = null; target = null; push(); }
    function goTo(seat, to, kind) {          // a recall: each axis in ORDER, one after the other
        motion = null; job = kind; jobSeat = seat; target = { seat, to: Object.assign({}, to), axis: null };
        push();
    }
    setInterval(() => {
        const dt = TICK_MS / 1000;
        if (motion) {
            if (Date.now() > motion.until) { motion = null; push(); return; }
            const p = data.pos[motion.seat], n = clamp(p[motion.axis] + motion.dir * SPEED * dt);
            if (n === p[motion.axis]) { motion = null; push(); return; }   // the end stop
            p[motion.axis] = n; save(); push();
            return;
        }
        if (job && target) {
            if (job === 'gentleman' && !parked()) { halt(); return; }       // (the Gentleman moves only parked: seat.js)
            const p = data.pos[target.seat], ax = ORDER.find((a) => typeof target.to[a] === 'number' && Math.abs(p[a] - target.to[a]) > 8);
            if (!ax) {
                if (job === 'exit') data.pre[target.seat] = data.pre[target.seat] || null;
                job = null; jobSeat = null; target = null; save(); push(); return;
            }
            target.axis = ax;
            const d = target.to[ax] - p[ax];
            p[ax] = clamp(p[ax] + Math.sign(d) * Math.min(Math.abs(d), SPEED * dt));
            save(); push();
        }
    }, TICK_MS).unref();

    function request(c, q) {
        const seatOk = q.seat === 'driver' || q.seat === 'passenger';
        if (q.op === 'ambient') { data.ambient = settingsOf(data.ambient, q.settings); save(); }
        else if (q.op === 'jog' && seatOk && AXES.indexOf(q.axis) >= 0 && (q.dir === 1 || q.dir === -1)) {
            if (!job) motion = { seat: q.seat, axis: q.axis, dir: q.dir, until: Date.now() + JOG_MS };
        } else if (q.op === 'stop') halt();
        else if (q.op === 'memory' && seatOk && [0, 1, 2].indexOf(q.slot) >= 0) {
            if (q.save) { data.memories[q.seat][q.slot] = Object.assign({}, data.pos[q.seat]); save(); }
            else if (data.memories[q.seat][q.slot]) goTo(q.seat, data.memories[q.seat][q.slot], 'memory');
        } else if (q.op === 'exit') {
            const seat = seatOk ? q.seat : 'driver';
            if (q.save) { data.exit[seat] = Object.assign({}, data.pos[seat]); save(); }
            else if (data.exit[seat] && data.pre[seat]) { const back = data.pre[seat]; data.pre[seat] = null; goTo(seat, back, 'back'); }
            else if (data.exit[seat] && parked()) { data.pre[seat] = Object.assign({}, data.pos[seat]); goTo(seat, data.exit[seat], 'exit'); }
        } else if (q.op === 'set' && q.settings && typeof q.settings.easyExit === 'boolean') { data.settings.easyExit = q.settings.easyExit; save(); }
        else if (q.op === 'gentleman') {
            if (!parked()) { /* parked only */ } else if (data.room) { const back = data.room; data.room = null; goTo('passenger', back, 'gentleman'); }
            else { data.room = Object.assign({}, data.pos.passenger); goTo('passenger', { SLV: MAX - 400, LNV: Math.min(MAX, data.pos.passenger.LNV + 12000) }, 'gentleman'); }
            save();
        } else if (q.op === 'diag') { c.write(JSON.stringify({ diag: { id: q.id, ok: false, error: 'demo: no car' } }) + '\n'); return; }
        push();
    }

    const srv = net.createServer((c) => {
        clients.add(c);
        let buf = '';
        c.setEncoding('utf8');
        c.on('data', (d) => {
            buf += d;
            for (let n; (n = buf.indexOf('\n')) >= 0; buf = buf.slice(n + 1)) {
                let q;
                try { q = JSON.parse(buf.slice(0, n)); } catch (e) { continue; }
                if (q && typeof q === 'object') { try { request(c, q); } catch (e) { log('comfort: ' + e.message); } }
            }
        });
        c.on('error', () => {});
        c.on('close', () => clients.delete(c));
        c.write(JSON.stringify(status()) + '\n');                    // (the tool's first push on a new connection)
    });
    if (process.platform !== 'win32') { try { fs.unlinkSync(o.path); } catch (e) { /* none */ } }
    srv.on('error', (e) => log('comfort: socket: ' + e.message));
    srv.listen(o.path, () => log('demo: Comfort tool (demo) on ' + o.path));
    // the drive mode or the car moving changes what it pushes (parked, the light's mode): once a second
    setInterval(() => { if (clients.size) push(); }, 1000).unref();
    return { state: () => status().state, close: () => {
        try { srv.close(); } catch (e) { /* closed */ }
        if (process.platform !== 'win32') { try { fs.unlinkSync(o.path); } catch (e) { /* gone */ } }
    } };
}

module.exports = { start };
