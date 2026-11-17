'use strict';
/*
 * test_water_cup.js - Water Cup (apps/ak_water_cup): its water stays in the cup, its springs stay in bounds, a still
 * cup sends no frames, a hidden-then-shown cup doesn't jump, and it asks the car for nothing (no diagnostics).
 *   node kit/tools/test_water_cup.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'ak_water_cup');
const C = require(path.join(APP, 'cup'));
const spec = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok ' + name); };

const GEO = { cx: 800, ry: 140, aR: 150, aB: 107, H: 300, e: C.E };
const levels = spec.settings.find((s) => s.key === 'level').steps;

ok('the water stays in the cup at every tilt, fore-and-aft end and level', () => {
    for (const level of levels) for (const lat of [-C.MAX_TILT, -0.3, 0, 0.3, C.MAX_TILT]) for (const lon of [C.LON_MIN, 0, C.LON_MAX]) {
        const s = C.shapes(GEO, lat, lon, level);
        // the water body under the rim's line, the surface's ends under the rim, its far edge under the rim's far curve
        s.water.forEach(([, y]) => assert(y >= GEO.ry - 1e-6, 'water over the rim: ' + [lat, lon, level]));
        const tn = Math.tan(lat);
        [-1, 1].forEach((side) => assert(s.yw - side * s.aw * tn > GEO.ry, 'the surface\'s end over the rim: ' + [lat, lon, level, side]));
        s.surface.forEach(([x, y]) => {
            const dx = x - GEO.cx;
            assert(Math.abs(dx) <= GEO.aR, 'out past the rim');
            assert(y >= GEO.ry - GEO.e * Math.sqrt(GEO.aR * GEO.aR - dx * dx) - 1e-6, 'the surface over the rim\'s far edge: ' + [lat, lon, level]);
        });
        assert(s.water.length >= 3 && s.surface.every((p) => p.every(Number.isFinite)));
    }
});

ok('the springs stay in bounds, finite, at any frame time', () => {
    const a = C.spring(-C.MAX_TILT, C.MAX_TILT);
    for (const dt of [0, 8, 16, 250, 5000, -5, NaN, undefined]) for (const want of [5, -5, NaN, 0.3, Infinity]) {
        const v = a(want, dt);
        assert(Number.isFinite(v) && v >= -C.MAX_TILT && v <= C.MAX_TILT, dt + ' ' + want + ' -> ' + v);
    }
    const b = C.spring(C.LON_MIN, C.LON_MAX);
    for (let i = 0; i < 300; i++) { const v = b(i % 50 < 25 ? 1 : -1, 16); assert(v >= C.LON_MIN && v <= C.LON_MAX); }
    // it sloshes back past the target after a step, then settles
    const s = C.spring(-1, 1); let over = false, v = 0;
    for (let i = 0; i < 60; i++) { v = s(0.3, 16); if (v > 0.31) over = true; }
    for (let i = 0; i < 2000; i++) v = s(0.3, 16);
    assert(over && Math.abs(v - 0.3) < 0.005, 'sloshes, then settles: ' + v);
});

ok('the G: zeroed while standing, smoothed, bad samples dropped; targets outside of the bend', () => {
    const z = C.zeroer();
    let g;
    for (let t = 0; t < 5000; t += 50) g = z({ gLat: 0.65, gLong: -0.1, speed: 0 }, t);      // idling, a slope
    assert(Math.abs(g.lat) < 0.05 && Math.abs(g.long) < 0.05, 'zeroed: ' + JSON.stringify(g));
    for (let t = 5000; t < 7000; t += 50) g = z({ gLat: 0.65 + 0.4, gLong: -0.1, speed: 40 }, t);
    assert(Math.abs(g.lat - 0.4) < 0.02, 'a bend\'s 0.4 g: ' + g.lat);
    const before = g.lat; g = z({ gLat: 9, gLong: 9, speed: 40 }, 7050);
    assert(!g || Math.abs(g.lat - before) < 1e-9, 'a 9 g sample dropped');
    // a left bend (the car's lateral G > 0): the water higher on the right, the outside
    assert(C.targets({ lat: 0.4, long: 0 }, 2.2, 1).lat > 0 && C.targets({ lat: 0.4, long: 0 }, 2.2, -1).lat < 0);
    // braking: to the far side (taller); accelerating: the near side
    assert(C.targets({ lat: 0, long: -0.5 }, 2.2, 1).lon > 0 && C.targets({ lat: 0, long: 0.5 }, 2.2, 1).lon < 0);
    assert.deepStrictEqual(C.targets(null, 2.2, 1), { lat: 0, lon: 0 });
});

ok('the demo drives: weaving, a stop, still between', () => {
    const at = (s) => C.demoG(s * 1000);
    assert(Math.abs(at(1).gLat - 0.5) < 1e-9 && Math.abs(at(3).gLat + 0.5) < 1e-9);
    assert.deepStrictEqual(at(9), { gLat: 0, gLong: 0 });
    assert.strictEqual(at(10.5).gLong, -0.6);
    assert.deepStrictEqual(at(12), { gLat: 0, gLong: 0 });
});

ok('it asks the car for nothing: no diagnostics, read-only signals only', () => {
    const src = fs.readdirSync(APP).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
    assert(!/kit\/(diag|readonly-diag|ecus|dids|sgbd)\b/.test(src), 'no diagnostics module');
    Object.values(spec.signals).forEach((fields) => Object.values(fields).forEach((m) => assert.strictEqual(m, 'rs')));
    assert(!spec.autostart, 'opens only when opened');
});

// the app itself: frames only while the water moves; back after a gap without a jump
(async () => {
    const kit = path.join(ROOT, 'kit/runtime');
    let app = null, sample = null, loopFn = null, frames = 0, lastWords = null;
    class FakeCar { onSample(fn) { sample = fn; } data() { return { demo: false }; } }
    const load = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === './kit/mgu') return { run: (a) => { app = a; } };
        if (req === './kit/car') return FakeCar;
        if (req.startsWith('./kit/')) return load.call(this, path.join(kit, req.slice(6)), parent, isMain);
        return load.call(this, req, parent, isMain);
    };
    require(path.join(APP, 'main'));
    Module._load = load;
    const { Recorder } = require(path.join(kit, 'record'));
    const themes = require(path.join(kit, 'themes'));
    const vals = { gain: 2.2, level: 0.5, flipLat: false, theme: 'm_tricolour', skin: 'classic', demo: 'off' };
    await app.start({
        ui: { image: async (k, cv) => { frames++; lastWords = Array.from(cv.words()); } }, settings: { get: (k) => vals[k], onChange() {} },
        log: { info() {}, warn() {}, error() {} }, theme: () => themes.theme(vals.theme, vals.skin), canvas: (w, h) => new Recorder(w, h),
        onLayout() {}, loop: (name, fps, fn) => { loopFn = fn; },
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const run = async (ms, g) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (g) sample(Object.assign({ speed: 60 }, g), Date.now()); await loopFn(); await wait(16); } };
    await run(300, { gLat: 0, gLong: 0 });
    // a bend: frames while it sloshes
    frames = 0; await run(600, { gLat: 0.35, gLong: 0 });
    assert(frames > 10, 'frames while the water moves: ' + frames); n++; console.log('ok frames while it sloshes (' + frames + ')');
    // held: it settles, then nothing more is sent
    await run(9000, { gLat: 0.35, gLong: 0 });
    frames = 0; await run(1000, { gLat: 0.35, gLong: 0 });
    assert.strictEqual(frames, 0, 'still: no frames'); n++; console.log('ok a still cup sends no frames');
    // hidden 3 s while the G changes, then shown: it starts where the G is now (one frame, no slosh after it)
    const t0 = Date.now(); while (Date.now() - t0 < 3000) { sample({ gLat: -0.2, gLong: 0, speed: 60 }, Date.now()); await wait(50); }
    frames = 0; await loopFn(); const first = frames;
    await run(800, { gLat: -0.2, gLong: 0 });
    assert(first === 1 && frames <= 2, 'shown again: one frame and still (' + frames + ')'); n++; console.log('ok shown again without a jump');
    assert(lastWords && lastWords.length > 100);
    console.log(n + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
