'use strict';
/*
 * test_water_cup.js - Water Cup (apps/ak_water_cup): its water stays in the cup, its springs stay in bounds, a still
 * cup sends no frames, a hidden-then-shown cup doesn't jump, and it only reads (the read-only link, for the tank
 * level); its fuel tofu: the engine unit's own tank level, a block for each tenth, no blinking at a step.
 *   node kit/tools/test_water_cup.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'ak_water_cup');
const C = require(path.join(APP, 'cup'));
const T = require(path.join(APP, 'tofu'));
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

ok('the fuel: the engine unit\'s own tank level (UDS F42F, else OBD 01 2F), a full and an empty tank in range', () => {
    const d = spec.config.dme;
    assert.strictEqual(d.ecu, 0x12);
    assert.deepStrictEqual(d.tank.map((c) => c.did || 'OBD ' + c.obd), ['F42F', 'OBD 2F']);
    d.tank.forEach((c) => [0, 255].forEach((raw) => { const v = raw * c.factor + c.offset; assert(v >= c.min && v <= c.max, raw + ' -> ' + v); }));
    assert(!spec.settings.some((x) => x.key === 'tankLitres'), 'no tank size (1.3.0)');
});

ok('the tofu: a block for each tenth, the last drop still one, no blinking at a step', () => {
    assert.strictEqual(T.count(100, null), 10);
    assert.strictEqual(T.count(95, null), 10);
    assert.strictEqual(T.count(90, null), 9);
    assert.strictEqual(T.count(0.5, null), 1, 'a drop left: one');
    assert.strictEqual(T.count(0, null), 0);
    assert.strictEqual(T.count(null, 6), 6, 'no reading: kept');
    assert.strictEqual(T.count(null, null), null);
    // swinging round 60 % (a bend): 7 stays 7 until under 58.5, then 6 stays 6 until over 61.5
    let k = T.count(65, null);
    [61, 59.5, 58.6, 60.9].forEach((p) => { k = T.count(p, k); assert.strictEqual(k, 7, p + ' -> ' + k); });
    k = T.count(58.4, k); assert.strictEqual(k, 6);
    [59.9, 61.4, 60.2].forEach((p) => { k = T.count(p, k); assert.strictEqual(k, 6, p + ' -> ' + k); });
    k = T.count(61.6, k); assert.strictEqual(k, 7);
    assert.strictEqual(T.count(20, 9), 2, 'a big jump (filled up, or a first reading) goes straight there');
    for (let t = 0; t < 120000; t += 500) { const p = T.demoFuel(t); assert(p >= 5 - 1e-9 && p <= 100); }
});

ok('the tofu stays on the page, clear of the cup, at any wobble', () => {
    const TG = { x0: 850, y0: 200, w: 78, h: 58, dx: 26, dy: 20, gap: 12, rowGap: 64 };
    const cupRight = 470 + 150;
    for (const sh of [-8, 0, 8]) T.blocks(TG, sh).forEach((b) => [].concat(b.front, b.top, b.side).forEach(([x, y]) => {
        assert(Number.isFinite(x) && Number.isFinite(y));
        assert(x > cupRight + 40 && x < 1600 - 40 && y > 60 && y < 520 - 40, 'off the page or on the cup: ' + [b.i, x, y]);
    }));
    [0, 1].forEach((r) => { const t = T.tray(TG, r); assert(t.x > cupRight + 40 && t.x + t.w < 1560 && t.y + t.h < 480); });
    // the rows apart, the order: 0 .. 4 the bottom row from the left, the top row's right end the first to go
    const bs = T.blocks(TG, 0);
    assert(bs[0].front[0][1] > bs[9].front[0][1] && bs[0].front[0][0] < bs[4].front[0][0] && bs[9].front[0][0] > bs[5].front[0][0]);
    assert(bs[5].front[3][1] < bs[0].top[1][1], 'the top row clear of the bottom row\'s tops');
});

ok('the sign: its eight glyphs its own (the shared CJK atlas lacks them), kept in its own family', () => {
    const S = require(path.join(APP, 'sign_font'));
    const fonts = require(path.join(ROOT, 'kit/runtime/fonts'));
    assert.strictEqual(S.text, '東河豆腐亀島本店');
    assert(fonts.register(S.family, S));
    const f = fonts.get(S.family, 36, S.text);
    assert.strictEqual(f.family, S.family, 'not switched to the shared cjk atlas');
    for (const c of S.text) assert(f.glyphs[c.codePointAt(0)] && f.glyphs[c.codePointAt(0)][2] > 0, 'glyph ' + c);
    assert.strictEqual(fonts.get('label', 24, '本').family, 'cjk', 'other families still switch');
    assert(!fonts.register('bad', { sizes: null }));
    const TG = { x0: 850, y0: 200, w: 78, h: 58, dx: 26, dy: 20, gap: 12, rowGap: 64 }, r = T.tray(TG, 0), sy = TG.y0 - TG.dy - 72;
    assert(sy > 50 && sy + 54 < TG.y0 - TG.dy, 'the board under the header, over the top row');
    assert(fonts.measure(f, S.text) * 36 / f.size + 7 * 8 < r.w - 24, 'the name fits the board');
});

ok('it only reads: the read-only diagnostic link (reads only, never parked), read-only signals', () => {
    const src = fs.readdirSync(APP).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
    assert(!/kit\/(diag|ecus|sgbd)\b/.test(src), 'no diagnostics module but the read-only one');
    assert(/require\('\.\/kit\/readonly-diag'\)/.test(src));
    // (the link's transport; the car's state, listened to so nothing is asked while it is parked: kit/diag.js)
    Object.entries(spec.signals).forEach(([iface, fields]) => { if (!/InternalTasu$|VehicleCondition$/.test(iface)) Object.values(fields).forEach((m) => assert.strictEqual(m, 'rs')); });
    assert.strictEqual(spec.signals['de.bmw.infrastructure.VehicleCondition'].VehicleCondition, 's');
    assert(!spec.autostart, 'opens only when opened');
});

// the app itself: frames only while the water moves; back after a gap without a jump
(async () => {
    const kit = path.join(ROOT, 'kit/runtime');
    let app = null, sample = null, loopFn = null, frames = 0, lastWords = null;
    // the engine unit's tank level, as the stubbed read-only link answers it
    let tankPct = null, asked = 0;
    class FakeCar { constructor() {} onSample(fn) { sample = fn; } data() { return { demo: false }; } }
    class FakeLink { constructor() {} init() { return Promise.resolve(this); } }
    class FakeReader { constructor() {} async value(k) { asked++; return k === 'tank' ? tankPct : null; } }
    const load = Module._load;
    Module._load = function (req, parent, isMain) {
        if (req === './kit/mgu') return { run: (a) => { app = a; } };
        if (req === './kit/car') return FakeCar;
        if (req === './kit/readonly-diag') return { ReadOnlyDiag: FakeLink };
        if (req === './kit/dids') return { DidReader: FakeReader };
        if (req.startsWith('./kit/')) return load.call(this, path.join(kit, req.slice(6)), parent, isMain);
        return load.call(this, req, parent, isMain);
    };
    require(path.join(APP, 'main'));
    Module._load = load;
    const { Recorder } = require(path.join(kit, 'record'));
    const themes = require(path.join(kit, 'themes'));
    const vals = { gain: 2.2, level: 0.5, flipLat: false, tofu: true, theme: 'm_tricolour', skin: 'classic', demo: 'off' };
    await app.start({
        ui: { image: async (k, cv) => { frames++; lastWords = Array.from(cv.words()); } }, settings: { get: (k) => vals[k], onChange() {} }, spec,
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
    // the fuel: asked every 10 s (the first at once); a new block count sends one frame; the same count, nothing
    assert(asked >= 1, 'the tank level asked');
    const answer = async (pct) => { tankPct = pct; await new Promise((r) => setTimeout(r, 10)); };
    const next = async (pct) => { await answer(pct); asked = 0; while (!asked) await run(250, { gLat: -0.2, gLong: 0 }); await answer(pct); };
    frames = 0; await next(69.5); await run(300, { gLat: -0.2, gLong: 0 });
    assert.strictEqual(frames, 1, 'fuel read: one frame (' + frames + ')');
    frames = 0; await next(68.6); await run(300, { gLat: -0.2, gLong: 0 });                    // (still 7 blocks)
    assert.strictEqual(frames, 0, 'the same blocks: no frame'); n++; console.log('ok the tofu: a frame only when a block goes');
    frames = 0; await next(null); await run(300, { gLat: -0.2, gLong: 0 });
    assert.strictEqual(frames, 0, 'the unit silent: the last held'); n++; console.log('ok the engine unit silent: its last level held');
    vals.tofu = false;
    frames = 0; await run(300, { gLat: -0.2, gLong: 0 });
    assert.strictEqual(frames, 1, 'tofu off: one frame (the cup back in the middle)');
    asked = 0; frames = 0; tankPct = 5; await run(11000, { gLat: -0.2, gLong: 0 });
    assert.strictEqual(asked, 0, 'tofu off: not asked'); assert.strictEqual(frames, 0, 'tofu off: the fuel draws nothing'); n++; console.log('ok tofu off: the tank not asked');
    assert(lastWords && lastWords.length > 100);
    console.log(n + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
