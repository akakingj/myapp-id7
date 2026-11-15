'use strict';
// Redline's turn signals and lane change warning on the HUD (hud-signals.js, 2.0.57): where they go (under the tach,
// at its place with the tach off), the car's values decoded, the layers against a stand-in cluster-render (flashing in
// step, each switch on its own, gone while the HUD is hidden), the tach switched off (its layer see-through), the
// directions kept clear of them. Node 8 compatible.
//   node kit/tools/test_redline_signals.js
const fs = require('fs');
const path = require('path');
const TH = require('./redline_test_harness');
const { TMP, SHM } = TH.claimsDir('redline-signals-');
const ROOT = TH.ROOT;

let cr = null;
TH.hookKit({ clusterRender: TH.fakeClusterRender({ set: 'merge', onCreate: (c) => { cr = c; } }) });
const Hud = require(path.join(ROOT, 'apps', 'redline', 'hud'));
const S = require(path.join(ROOT, 'apps', 'redline', 'hud-signals'));
const { Canvas } = require(path.join(ROOT, 'kit', 'runtime', 'canvas'));
const { spec, def } = TH.redlineDefaults();
const C = TH.counter(), ok = C.ok;
const sleep = TH.sleep;
const st = (v) => ({ get: (k) => (k in v ? v[k] : def[k]) });
const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const ids = (r) => [r.x, r.y].join(',');

// ---- where they go --------------------------------------------------------------------------------------------------
{
    const scene = Hud.scene(), t = Hud.placeOf(st({}));
    ok(JSON.stringify(t) === JSON.stringify({ x: 200, y: 76, w: 400, h: 130 }), 'the tach at the top of a G20\'s glass (' + JSON.stringify(t) + ')');
    const p = S.signalsPlace(t, true, scene);
    // as the demo image: the signs at the tach's ends, the arrows inside them, under it
    ok(ids(p.lcw.left) === '200,214' && ids(p.arrow.left) === '240,224' && ids(p.arrow.right) === '530,224' && ids(p.lcw.right) === '566,214',
        'under the tach: left sign 200, arrow 240; right arrow 530, sign 566; at y 214 / 224 (' + [ids(p.lcw.left), ids(p.arrow.left), ids(p.arrow.right), ids(p.lcw.right)].join(' ') + ')');
    ok(p.lcw.right.x + p.lcw.right.w === t.x + t.w && p.lcw.left.y === t.y + t.h + 8, 'flush with the tach\'s right end, 8 px under it');
    const top = S.signalsPlace(t, false, scene);
    ok(top.lcw.left.y === 76 && top.arrow.left.y === 86 && top.arrow.right.x === 530 && top.lcw.left.x === 200, 'the tach off: the same places at its top (y 76 / 86)');
    const W = Hud.G20_WINDOW, inW = (r) => r.x >= W.x && r.y >= W.y && r.x + r.w <= W.x + W.w && r.y + r.h <= W.y + W.h;
    ok(['left', 'right'].every((s) => inW(p.arrow[s]) && inW(p.lcw[s]) && inW(top.arrow[s]) && inW(top.lcw[s])), 'all inside a G20\'s seen part, either way');
    // HUD looks > Place warns for the signals too: a low tach puts them under the seen part
    ok(!Object.keys(Hud.outsideAll(st({}))).length && !Object.keys(Hud.outsideAll(st({ hudTach: false }))).length, 'Place: nothing outside at the defaults, tach on or off');
    ok(Hud.outsideAll(st({ hudY: 120 })).bottom === 22 && !Hud.outsideGlass(Hud.placeOf(st({ hudY: 120 }))).bottom, 'Place: the tach low, the signals under it 22 px past the seen part (the tach itself inside)');
    ok(!Hud.outsideAll(st({ hudY: 120, hudTurnSignals: false, hudLaneWarn: false })).bottom, '... not with them off');
    ok(ov(p.band, t) === 0, 'under the tach, not over it');
    // a small tach: the sides still well apart; moved: they follow
    const small = S.signalsPlace(Hud.placeOf(st({ hudSize: 40 })), true, scene);
    ok(small.arrow.right.x - (small.arrow.left.x + 30) >= 100, 'a 40 % tach: the arrows still ' + (small.arrow.right.x - small.arrow.left.x - 30) + ' px apart');
    const moved = S.signalsPlace(Hud.placeOf(st({ hudX: 60, hudY: 20 })), true, scene);
    ok(moved.lcw.left.x === 260 && moved.lcw.left.y === 234, 'they move with the tach\'s position');
    // the tach at the scene's foot: above it rather than off the scene
    const low = Hud.placeOf(st({ hudY: 280 })), lp = S.signalsPlace(low, true, scene);
    ok(lp.band.y + lp.band.h <= scene.h && ov(lp.band, low) === 0, 'a tach at the foot: the signals above it (' + lp.band.y + ')');
    // iDrive 8's small HUD: inside it, either way
    Hud.useScene('map:874x749,hud:353x203');
    const S8 = Hud.scene(), in8 = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= S8.w && r.y + r.h <= S8.h;
    let out = 0;
    [40, 70, 100].forEach((sz) => [-120, 0, 280].forEach((x) => [-120, 0, 220].forEach((y) => [true, false].forEach((on) => {
        const q = S.signalsPlace(Hud.placeOf(st({ hudSize: sz, hudX: x, hudY: y })), on, S8);
        if (!['left', 'right'].every((s) => in8(q.arrow[s]) && in8(q.lcw[s]))) out++;
    }))));
    ok(!out, 'iDrive 8: every Size / Position, the signals inside its HUD (' + out + ' out)');
    Hud.useScene('');
    ok(Hud.scene().w === 800, 'back to iDrive 7\'s scene');
}

// ---- the directions keep clear of them --------------------------------------------------------------------------------
{
    const on = st({}), off = st({ hudTurnSignals: false, hudLaneWarn: false }), only = st({ hudTach: false });
    const n = Hud.navPlaceOf(on), b = Hud.blockOf(on);
    ok(ov(n, b) === 0 && ov(n, Hud.BMW_SPEED) === 0 && b.y + b.h === 258, 'the directions clear of the tach and the signals under it (' + JSON.stringify(n) + ')');
    ok(JSON.stringify(Hud.blockOf(off)) === JSON.stringify(Hud.placeOf(off)), 'signals off: the tach alone is kept clear');
    ok(Hud.blockOf(only).h === 44 && Hud.blockOf(only).y === 76, 'the tach off: only the signals at the top');
    let clash = 0;
    [60, 80, 100, 120].forEach((sz) => [-80, 0, 80].forEach((x) => [-40, 0, 40, 100].forEach((y) => {
        const s = st({ hudSize: sz, hudX: x, hudY: y }), r = Hud.navPlaceOf(s), p = S.signalsPlace(Hud.placeOf(s), true, Hud.scene());
        if (['left', 'right'].some((side) => ov(r, p.arrow[side]) || ov(r, p.lcw[side]))) clash++;
    })));
    ok(!clash, 'no size or position puts the directions over a signal (' + clash + ')');
}

// ---- the car's values ----------------------------------------------------------------------------------------------
{
    ok(S.direction(1) === 'left' && S.direction(3) === 'left' && S.direction(2) === 'right' && S.direction(4) === 'right' && S.direction(8) === 'both' && S.direction(0) === 'off',
        'controlIndicateDirection: tap / steady left, right, hazards, off');
    ok(S.direction('DAUER_BLINKEN_RECHTS_EIN') === 'right' && S.direction('TIPP_BLINKEN_LINKS_EIN') === 'left', 'as the enum\'s names (a G05)');
    ok(S.direction(0, 9) === 'left' && S.direction(0, 'DAUERBLINKEN_RECHTS') === 'right' && S.direction(0, 6) === 'both' && S.direction(undefined, 0) === 'off' && S.direction(undefined, undefined) === null,
        'activeFunctionIndicateDirection when the control says off or nothing');
    ok(JSON.stringify(S.decodeLca({ statusLaneChangeWarningLeft: 'NO_WARNING', statusLaneChangeWarningRight: { name: 'WARNING_LEVEL_1' } })) === JSON.stringify({ left: false, right: true }),
        'the lane change warning per side (names)');
    ok(JSON.stringify(S.decodeLca({ x: { statusLaneChangeWarningLeft: 2, statusLaneChangeWarningRight: 0 } })) === JSON.stringify({ left: true, right: false }), '... numbers, however wrapped');
    // watchCar: both interfaces, the handlers fed as the car sends
    const subs = {};
    const ctx = { signals: { watch: (iface, inst, handlers) => { subs[iface] = handlers; return Promise.resolve({ available: true }); } } };
    // (a log without debug: the value still read)
    const w = S.watchCar(ctx, { info() {}, warn() {} });
    ok(subs[S.S_LIGHT] && subs[S.S_LIGHT].StatusFunctionsIndicators && subs[S.S_LIGHT].StatusFunctionsIndicators2 && subs[S.S_LCA] && subs[S.S_LCA].assistedDrivingViewLcaInput,
        'watches both light fields and the lane change broadcast');
    subs[S.S_LIGHT].StatusFunctionsIndicators2({ controlIndicateDirection: 4, activeFunctionIndicateDirection: 8 });
    ok(w.indicator() === 'right', 'a right signal read');
    ok(w.laneChange() === null, 'no lane change data: null (nothing shown)');
    subs[S.S_LCA].assistedDrivingViewLcaInput({ statusLaneChangeWarningLeft: 1 });
    ok(w.laneChange() && w.laneChange().left === true && w.laneChange().right === false, 'a car beside on the left');
    // app.json carries both, optional
    const L = spec.signals[S.S_LIGHT], A = spec.signals[S.S_LCA];
    ok(L && L._optional && L.StatusFunctionsIndicators === 's' && L.StatusFunctionsIndicators2 === 's', 'app.json: the light module\'s fields, optional');
    ok(A && A._optional && A._broadcasts && A._broadcasts.indexOf('assistedDrivingViewLcaInput') >= 0, 'app.json: the lane change broadcast, optional');
    ['hudTach', 'hudTurnSignals', 'hudLaneWarn'].forEach((k) => { const s = spec.settings.find((x) => x.key === k); ok(s && s.type === 'bool' && s.default === true, k + ': a switch, on by default'); });
}

// ---- the pictures ----------------------------------------------------------------------------------------------------
{
    const a = new Canvas(S.ARROW.w, S.ARROW.h); S.drawArrow(a, 'left');
    const px = (cv, x, y) => Array.from(cv.d.slice((y * cv.w + x) * 4, (y * cv.w + x) * 4 + 4));
    ok(px(a, 3, 12)[1] > 150 && px(a, 3, 12)[3] > 200 && px(a, 28, 2)[3] === 0, 'a left arrow: green at its tip, see-through around');
    const l = new Canvas(S.LCW.w, S.LCW.h); S.drawLaneSign(l, 'right');
    const red = [], yel = [];
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) { const p = px(l, x, y); if (p[3] > 200 && p[0] > 200 && p[1] < 80) red.push(x); if (p[3] > 200 && p[0] > 200 && p[1] > 180) yel.push(x); }
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    ok(red.length > 40 && yel.length > 40 && mean(red) > mean(yel), 'the right sign: this car yellow, the other red behind it to the right');
}

(async () => {
    // what reaches Settings > Logs (lines starting "hud: "): the subscription, the first values, each warning's change,
    // and whether the car's service answered at all (a car without the assistant's lane change warning: not available)
    {
        const subs2 = {}, got = [];
        const ctx2 = { signals: { watch: (iface, inst, handlers) => { subs2[iface] = handlers; return Promise.resolve({ available: iface === S.S_LIGHT }); } } };
        S.watchCar(ctx2, { info: (m) => got.push(m), warn() {} }, { reportMs: [40] });
        await sleep(10);
        subs2[S.S_LIGHT].StatusFunctionsIndicators({ controlIndicateDirection: 3 });
        await sleep(60);
        const LV = require(path.join(ROOT, 'apps', 'redline', 'logview.js'));
        const shown = got.filter((m) => LV.IMPORTANT.redline({ level: 'INFO', msg: m }));
        ok(shown.length === got.length && got.length >= 5, 'every signal line shows in Settings > Logs (' + got.length + ')');
        ok(got.indexOf('hud: turn signals: left (indicators 3 / undefined)') >= 0, 'a turn signal\'s change logged');
        ok(got.indexOf('hud: lane change warning: service not available, 0 received') >= 0 && got.indexOf('hud: turn signals: service available, 1 received') >= 0,
            'after a while: whether each service answered and how much came (' + got.filter((m) => /service/.test(m)).join(' | ') + ')');
        const got2 = [];
        const subs3 = {};
        S.watchCar({ signals: { watch: (iface, inst, h) => { subs3[iface] = h; return Promise.resolve({ available: true }); } } }, { info: (m) => got2.push(m) }, { reportMs: [] });
        await sleep(10);
        [{ statusLaneChangeWarningRight: 'WARNING_LEVEL_1' }, { statusLaneChangeWarningRight: 'WARNING_LEVEL_1' }, { statusLaneChangeWarningRight: 'NO_WARNING' }, {}, {}]
            .forEach((v) => subs3[S.S_LCA].assistedDrivingViewLcaInput(v));
        ok(got2.filter((m) => /raw/.test(m)).length === 3 && got2.indexOf('hud: lane change warning: right') >= 0 && got2.filter((m) => m === 'hud: lane change warning: none').length === 1,
            'the first three values raw, and each warning\'s change once (' + got2.filter((m) => !/raw/.test(m)).join(' | ') + ')');
    }
    fs.mkdirSync(SHM);
    fs.writeFileSync(path.join(SHM, 'redline'), JSON.stringify({ held: false, at: Date.now() }) + '\n');
    const v = Object.assign({}, def, { hud: 'on', hudStyle: 'standard', hudFps: 30 }), fns = [];
    const settings = { get: (k) => v[k], set: (k, x) => { v[k] = x; fns.forEach((f) => f(k, x)); }, onChange: (f) => fns.push(f), item: () => null };
    let dir = 'off', lcw = null, mode = 'sport', kmh = 50;
    const src = { data: () => ({ rpm: 2500, gear: 3, stage: 'D', speed: kmh, oil: 95, coolant: 92 }), shiftPoint: () => ({ rpm: 6200, cold: false }), redline: () => 6550,
        maxRpm: () => 8000, driveMode: () => mode, indicator: () => dir, laneChange: () => lcw };
    const lines = [];
    const log = { info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m), debug() {} };
    const h = Hud.start({ settings: settings, log: log, dataDir: TMP }, src);
    await sleep(150);
    const tachRef = cr.images()[0];
    ok(cr.images().length === 1, 'no signal: the tach alone, no signal layers made');
    // a left turn: the arrows made (both, see-through between flashes), the left one lit in step
    dir = 'left';
    await sleep(60);
    const s1 = h.signals();
    ok(s1.refs.arrow.left && s1.arrow.left === true, 'left signal: the left arrow lit within a tick');
    ok(cr.layers[s1.refs.arrow.left].x === 240 && cr.layers[s1.refs.arrow.left].y === 224 && cr.layers[s1.refs.arrow.left].z > cr.layers[tachRef].z, 'at 240,224, above the tach');
    ok(!s1.arrow.right, 'the right one dark');
    // flashing: lit 335 ms, dark 303 ms (sampled through two periods)
    const seen = [];
    for (let i = 0; i < 52; i++) { seen.push(h.signals().arrow.left ? 1 : 0); await sleep(25); }
    const flips = seen.filter((x, i) => i && x !== seen[i - 1]).length, litShare = seen.reduce((a, b) => a + b, 0) / seen.length;
    ok(flips >= 2 && flips <= 5 && litShare > 0.35 && litShare < 0.7, 'flashes about as the cluster\'s (' + flips + ' changes, lit ' + Math.round(litShare * 100) + ' %)');
    const pixBefore = cr.frames.filter((f) => f.ref === s1.refs.arrow.left).length;
    ok(pixBefore === 1, 'the arrow\'s picture sent once; flashing switches its opacity only');
    // let go: dark
    dir = 'off'; await sleep(60);
    ok(!h.signals().arrow.left && !h.signals().arrow.right, 'let go: the arrows dark');
    // hazards: both
    dir = 'both'; await sleep(40);
    ok(h.signals().arrow.left && h.signals().arrow.right, 'hazards: both lit');
    dir = 'off'; await sleep(60);
    // the lane change warning on the right
    lcw = { left: false, right: true }; await sleep(60);
    const s2 = h.signals();
    ok(s2.lcw.right === true && !s2.lcw.left && cr.layers[s2.refs.lcw.right].x === 566 && cr.layers[s2.refs.lcw.right].y === 214, 'a car on the right: its sign at 566,214');
    lcw = null; await sleep(60);
    ok(!h.signals().lcw.right, 'no more data: the sign goes');
    // each switch on its own
    settings.set('hudTurnSignals', false); dir = 'right'; lcw = { left: true, right: false }; await sleep(80);
    ok(!h.signals().arrow.right && h.signals().lcw.left === true, 'turn signals off: no arrows, the lane change warning still');
    settings.set('hudTurnSignals', true); settings.set('hudLaneWarn', false); await sleep(80);
    ok(!h.signals().lcw.left && (h.signals().arrow.right !== null), 'lane change off: no sign, the arrows still');
    settings.set('hudLaneWarn', true); await sleep(60);
    // hidden by the driving mode (Comfort on Don't show): the signals go with the tach
    mode = 'comfort'; await sleep(120);
    ok(!cr.layers[tachRef] && !h.signals().arrow.right && !h.signals().lcw.left, 'Comfort hidden: the tach and the signals gone');
    mode = 'sport'; await sleep(150);
    // the tach switched off: its layer see-through, the signals at its top
    settings.set('hudTach', false); await sleep(150);
    const t2 = cr.images().filter((r) => cr.layers[r].iw === 400)[0];
    const last = cr.frames.filter((f) => f.ref === t2).pop();
    let opaque = 0;
    if (last) for (let i = 3; i < last.px.length; i += 4) if (last.px[i]) opaque++;
    ok(t2 && last && !last.rects && opaque === 0, 'the tach off: its layer kept, sent whole and see-through (' + opaque + ' px not)');
    const fr = cr.frames.length; await sleep(120);
    ok(cr.frames.filter((f) => f.ref === t2).length === cr.frames.filter((f, i) => i < fr && f.ref === t2).length, '... and nothing sent after');
    const s3 = h.signals();
    ok(cr.layers[s3.refs.lcw.left].y === 76 && cr.layers[s3.refs.arrow.right].y === 86, 'the signals moved to the top (' + cr.layers[s3.refs.lcw.left].y + ')');
    ok(/HUD: /.test(h.status()), 'status still a HUD line (' + h.status() + ')');
    settings.set('hudTach', true); await sleep(150);
    const back = cr.frames.filter((f) => f.ref === t2).pop();
    let lit = 0;
    for (let i = 3; i < back.px.length; i += 4) if (back.px[i]) lit++;
    ok(lit > 1000 && cr.layers[h.signals().refs.lcw.left].y === 214, 'the tach back: drawn again, the signals under it');
    // "Play on HUD": the left signal from 1 s of the loop (the car's own signals not used meanwhile)
    dir = 'off'; lcw = null;
    kmh = 0; h.play(); await sleep(1150);
    ok(h.signals().arrow.left === true && !h.signals().arrow.right, 'Play on HUD: the left signal flashes from 1 s');
    h.stopPlay(); kmh = 50; await sleep(60);
    ok(!h.signals().arrow.left, 'stopped: dark again');
    // BMW's content over the HUD (target parked): the signals step aside with the tach, back after
    dir = 'left'; await sleep(60);
    ok(h.signals().arrow.left !== null, 'flashing before');
    cr.h.target('hud', 'parked', 'bmw'); await sleep(60);
    ok(!h.signals().arrow.left && !h.signals().arrow.right, 'BMW\'s content over the HUD: the arrows off');
    cr.h.target('hud', 'shown', ''); await sleep(400);
    const seenBack = []; for (let i = 0; i < 30; i++) { seenBack.push(h.signals().arrow.left); await sleep(25); }
    ok(seenBack.indexOf(true) >= 0, 'shown again: flashing');
    // Comfort's own place (its own setup, 40 px lower): the signals there with its tach
    v.hudComfortMode = 'own'; v.hudComfortSetup = { hudY: 40 }; mode = 'comfort'; await sleep(200);
    ok(cr.layers[h.signals().refs.lcw.left] && cr.layers[h.signals().refs.arrow.left].y === 264, 'Comfort\'s own place: the signals under its tach (' + cr.layers[h.signals().refs.arrow.left].y + ')');
    v.hudComfortMode = 'hide'; v.hudComfortSetup = {}; mode = 'sport'; await sleep(200);
    ok(cr.layers[h.signals().refs.arrow.left].y === 224, 'back in Sport: back under Sport\'s tach');
    dir = 'off'; await sleep(60);
    // the test pattern: the samples drawn at their places
    settings.set('hud', 'test'); await sleep(100);
    const tp = cr.frames[cr.frames.length - 1];
    const tpx = (x, y) => tp.px.slice((y * 800 + x) * 4, (y * 800 + x) * 4 + 4);
    ok(tpx(243, 236)[1] > 150 && tpx(243, 236)[3] > 200, 'the test pattern shows the left arrow at its place');
    // the driving mode's own place: they follow it; the HUD off: all gone
    settings.set('hud', 'off'); await sleep(80);
    ok(!h.signals().refs.arrow.left && !h.signals().arrow.left, 'HUD off: the signal layers dropped');
    // on again: a new connection, the layers made again
    settings.set('hud', 'on'); await sleep(150); dir = 'right'; await sleep(60);
    ok(h.signals().refs.arrow.right && h.signals().arrow.right === true && cr.layers[h.signals().refs.arrow.right], 'HUD on again: the arrows made anew and flashing');
    dir = 'off';
    h.stop();
    console.log((C.fails ? C.fails + ' of ' : '') + C.checks + ' Redline HUD signal checks' + (C.fails ? ' failed' : ' passed'));
    TH.rmTree(TMP);
    process.exit(C.fails ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
