'use strict';
/**
 * Water Cup - a clear cup of water on the screen, sloshing with the car's G.
 *
 * Beside it (Settings > Fuel tofu, on by default) ten blocks of tofu, two rows of five, one for each tenth of the fuel in
 * the tank (tofu.js): they go as the fuel goes, and wobble a little with the water. Over them the shop's sign,
 * 東河豆腐亀島本店 (its glyphs this app's own: sign_font.js, kit fonts.register).
 *
 * No figures on the page (G-Force shows the G, the cluster the fuel). The water moves as the cup of AK Cluster Layouts' JDM 1
 * (cup.js: the same constants), drawn with the kit's shapes (record.js: polygons, lines), worked out every frame;
 * a frame goes out only when the water moved (0.004), so a still cup costs nothing.
 *
 *   - input: the car's acceleration (kit car.js 'accel', CDS2's mass-centre G, read-only, no diagnostics) and its
 *     speed (standing: the zero learned), each axis zeroed and smoothed as Layouts' gZeroed (cup.js zeroer)
 *   - no G for over 3 s (the car off, asleep): the water levels out slowly
 *   - shown again after a while: the springs start where the G is now (no jump, no slosh from the gap)
 *   - demo data (Settings > Demo data, or the Car profile's): a drive of its own (cup.js demoG)
 *   - the fuel: the engine unit's own tank level, % (OBD PID 0x2F, as AK Cluster Layouts and Live Data), read every
 *     10 s while the tofu shows, over the kit's read-only link (readonly-diag.js: reads only; never while parked);
 *     its last answer held, ten empty places till it first answers (1.3.0: the car's litres over a tank size and
 *     Settings > Fuel tank size gone); demo data: a tank of its own going down (tofu.js demoFuel)
 * Settings: Slosh strength (x the G, 2.2 as Layouts), Water level, Fuel tofu, skin, colour theme, layout, renderer, demo data (the Car profile's).
 */
const mgu = require('./kit/mgu');
const { withAlpha, mix } = require('./kit/canvas');
const G = require('./kit/gauges');
const Car = require('./kit/car');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { DidReader } = require('./kit/dids');
const C = require('./cup');
const T = require('./tofu');
const fonts = require('./kit/fonts');
const SIGN = require('./sign_font');
fonts.register(SIGN.family, SIGN);

const W = 1600, H = 520;
const WATER = '#3f8fd4', FOAM = '#86c4f2', GLASS = '#e4ecf4';
const BOARD = { wood: '#3a281a', edge: '#7a5a3a', ink: '#f3ead6' };
const TOFU = { top: '#fffdf4', front: '#f1ecdd', side: '#d8d0bb', edge: '#b9b09a', empty: '#e4ecf4', tray: '#5a4632', low: '#f0a030' };

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const car = new Car(ctx, ['accel', 'speed']);
        // the fuel in the tank, %: the engine unit's own level (config.dme.tank: UDS F42F, else OBD 01 2F), asked every
        // 10 s while the tofu shows, one at a time; the last answer kept (null till the first)
        const dme = Object.assign({ ecu: 0x12, tank: [] }, (ctx.spec && ctx.spec.config && ctx.spec.config.dme) || {});
        let fuel = null, tankAt = 0, tankBusy = false, rd = null;
        const askTank = (now) => {
            if (tankBusy || now - tankAt < 10000 || !dme.tank.length) return;
            tankAt = now; tankBusy = true;
            if (!rd) { const link = new ReadOnlyDiag(ctx.signals, log); link.init().catch((e) => log.warn('diagnostic link: ' + e)); rd = new DidReader(link, { ecu: dme.ecu }); }
            rd.value('tank', dme.tank)
                .then((v) => { if (typeof v === 'number' && isFinite(v)) fuel = Math.max(0, Math.min(100, v)); })
                .catch((e) => log.warn('tank level: ' + e))
                .then(() => { tankBusy = false; });
        };
        const zero = C.zeroer();
        let g = null, gAt = 0, demo = false;
        car.onSample((d, t) => {
            demo = !!d.demo;
            const src = d.demo ? Object.assign({}, d, C.demoG(t)) : d;
            const z = zero(src, t);
            if (z) { g = z; gAt = Date.now(); }
        });

        // the springs, and what was last drawn
        const lat = C.spring(-C.MAX_TILT, C.MAX_TILT), lon = C.spring(C.LON_MIN, C.LON_MAX);
        let last = 0, drawn = null, force = true;
        const want = () => {
            // (no G for over 3 s: level)
            const now = Date.now(), gOk = g && now - gAt < 3000;
            return C.targets(gOk ? g : null, Number(settings.get('gain')) || 2.2, 1);
        };
        settings.onChange(() => { force = true; });
        ctx.onLayout(() => { force = true; });

        // the cup: about 80 % of the page's height, in its middle (the rim 56 : the bottom 40, as Layouts')
        // (with the tofu: the cup to the left, the two rows to its right, the pair in the page's middle)
        const geo = { cx: W / 2, ry: 140, aR: 150, aB: 107, H: 300, e: C.E };
        const TG = { x0: 850, y0: 200, w: 78, h: 58, dx: 26, dy: 20, gap: 12, rowGap: 64 };
        let tofuN = null;

        async function render() {
            const now = Date.now(), dt = last ? now - last : 0, w = want();
            last = now;
            // (back after a gap - hidden, a slow frame: start where the G is now)
            if (!dt || dt > 1000) { lat.reset(w.lat); lon.reset(w.lon); }
            const a = lat(w.lat, dt), b = lon(w.lon, dt), level = Number(settings.get('level')) || 0.5;
            const tofu = settings.get('tofu') !== false;
            if (tofu) {
                if (!demo) askTank(now);
                const pct = demo ? T.demoFuel(now) : fuel;
                tofuN = T.count(pct, tofuN);
            }
            geo.cx = tofu ? 470 : W / 2;
            const key = a + ',' + b + ',' + level + ',' + demo + ',' + (tofu ? tofuN : '-');
            if (!force && key === drawn) return;                  // (still: no frame)
            drawn = key; force = false;

            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            const s = C.shapes(geo, a, b, level), { cx, ry, aR, aB, e } = geo, by = ry + geo.H;
            // the glass behind: a faint tint, the bottom's far half
            cv.fill(s.body, withAlpha(GLASS, 0.06));
            cv.fill(ellipse(cx, by, aB, e * aB, Math.PI, 2 * Math.PI), withAlpha(GLASS, 0.05));
            cv.stroke(ellipse(cx, by, aB, e * aB, Math.PI, 2 * Math.PI), 2, withAlpha(GLASS, 0.25));
            cv.stroke(ellipse(cx, ry, aR, e * aR, Math.PI, 2 * Math.PI), 3, withAlpha(GLASS, 0.55));
            water(cv, geo, s, a, b);
            // the glass in front: a veil, two sheens down the walls, the outline, the rim's near half, the bottom's
            cv.fill(s.body, withAlpha('#ffffff', 0.04));
            sheen(cv, geo, -0.62, 14, 0.2);
            sheen(cv, geo, 0.72, 6, 0.12);
            cv.line(cx - aR, ry, cx - aB, by, 3, withAlpha(GLASS, 0.85));
            cv.line(cx + aR, ry, cx + aB, by, 3, withAlpha(GLASS, 0.85));
            cv.stroke(ellipse(cx, by, aB, e * aB, 0, Math.PI), 3, withAlpha(GLASS, 0.85));
            cv.stroke(ellipse(cx, ry, aR, e * aR, 0, Math.PI), 4, withAlpha(GLASS, 0.9));
            if (tofu) drawTofu(cv, TG, tofuN, a);
            G.frame(cv, t, ['Water cup'], 0, [demo && { text: 'DEMO' }]);
            await ui.image('MAIN_GFX', cv);
        }

        ctx.loop('MAIN', 30, render);
        render().then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});

/*
 * The water as water (as Cluster Layouts' JDM 1 cup: shaders.js CUP_FS): deeper and denser towards the bottom (layers
 * of a gradient), the light bent bright along the walls under it, a glow gathered on the bottom, a few bubbles on the wall;
 * its surface the sky's reflection to the far side and see-through to the near (layers along its tilt), a highlight, rings
 * of ripples while it sloshes, the meniscus along the near edge and the far edge's glint where it rides up the glass.
 */
function water(cv, geo, s, lat, lon) {
    const { cx, ry, aB, H, e } = geo, by = ry + H, tn = Math.tan(lat), line = (x) => s.yw - (x - cx) * tn;
    const slosh = Math.min(1, Math.abs(lat) / 0.3 + Math.abs(lon) * 3);
    if (s.water.length >= 3) {
        // one fill, then layers from ever lower down over it (nested, so no seams): denser towards the bottom
        const ys = s.water.map((p) => p[1]), top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys), N = 20;
        cv.fill(s.water, withAlpha(mix(WATER, '#ffffff', 0.18), 0.62));
        for (let i = 1; i < N; i++) {
            const band = C.between(s.water, cx, top + (bottom - top) * i / N, bottom + 1, 0);
            if (band.length >= 3) cv.fill(band, withAlpha(mix(WATER, '#000000', 0.45), 0.09));
        }
        // the light bent along the walls: a strip down each inner wall, under the surface
        [-1, 1].forEach((side) => {
            const inset = Math.max(3, geo.aR * 0.035), wT = geo.aR - inset, wB = aB - inset;
            const strip = [[cx + side * (wT - 14), ry], [cx + side * (wT - 4), ry], [cx + side * (wB - 4), by], [cx + side * (wB - 14), by]];
            const under = C.below(strip, cx, s.yw + 2, lat);
            if (under.length >= 3) cv.fill(under, withAlpha(mix(FOAM, '#ffffff', 0.3), 0.22));
        });
        // the light gathered on the bottom, soft
        [1, 0.75, 0.5].forEach((k) => {
            const glow = C.below(C.ellipsePts(cx, by - 0.15 * e * aB, 0.75 * aB * k, 0.75 * e * aB * k, 32), cx, s.yw + 4, lat);
            if (glow.length >= 3) cv.fill(glow, withAlpha(mix(FOAM, '#ffffff', 0.4), 0.08));
        });
        // bubbles on the wall, well under the surface
        [[0.5, 0.74, 3.2], [-0.34, 0.88, 2.4], [-0.6, 0.62, 2.8], [0.12, 0.95, 2.0]].forEach(([fx, fy, r]) => {
            const y = ry + fy * H, w = geo.aR + (aB - geo.aR) * fy, x = cx + fx * w;
            if (y < line(x) + s.bw + r + 3) return;
            cv.arc(x, y, r - 0.8, r + 0.8, 0, 360, withAlpha('#ffffff', 0.45));
            cv.circle(x - 0.35 * r, y - 0.35 * r, Math.max(1, 0.4 * r), withAlpha('#ffffff', 0.6));
        });
    }
    // the surface: far (the sky in it) to near (the water through it), layered along its tilt
    cv.fill(s.surface, withAlpha(mix(WATER, FOAM, 0.5), 0.92));
    for (let i = 1; i < 16; i++) {
        const band = C.between(s.surface, cx, s.yw - s.bw - 1, s.yw + s.bw * (1 - i / 8), lat);
        if (band.length >= 3) cv.fill(band, withAlpha(mix(FOAM, '#ffffff', 0.45), 0.065));
    }
    // ripples, more while it sloshes: rings round the middle of the surface
    if (slosh > 0.05) [0.45, 0.72].forEach((k) => cv.stroke(tilted(cx, s.yw, s.aw * k, s.bw * k, tn), 2, withAlpha('#ffffff', 0.1 + 0.12 * slosh)));
    // the highlight, a soft patch towards the far left, lying on the tilted surface
    const hx = cx - 0.38 * s.aw, hy = line(hx) - 0.3 * s.bw;
    cv.fill(tilted(hx, hy, 0.3 * s.aw, 0.24 * s.bw, tn), withAlpha('#ffffff', 0.18));
    cv.fill(tilted(hx, hy, 0.16 * s.aw, 0.12 * s.bw, tn), withAlpha('#ffffff', 0.28));
    // the meniscus along the near edge (a bright line, a shade inside it), the far edge's glint
    const nearHalf = s.surface.filter((p) => p[1] >= line(p[0]) - 0.01).sort((p, q) => p[0] - q[0]);
    cv.stroke(nearHalf, 2, withAlpha('#ffffff', 0.55));
    cv.stroke(nearHalf.map((p) => [p[0] + (cx - p[0]) * 0.03, p[1] - 3]), 2, withAlpha(mix(WATER, '#000000', 0.5), 0.3));
    cv.stroke(s.far, 3, withAlpha(mix(FOAM, '#ffffff', 0.6), 0.75));
}
/** An ellipse round (cx, cy) sheared by the surface's tilt (tn, its tan), as the surface is. */
function tilted(cx, cy, a, b, tn) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * 2 * Math.PI, x = a * Math.cos(t); pts.push([cx + x, cy - x * tn + b * Math.sin(t)]); }
    return pts;
}
/** The fuel tofu: the trays, the empty places' outlines, the blocks left (n; null: no fuel signal yet, all empty),
 * leaning with the water's tilt (lat, radians: a few px). One block left: its edges amber. */
function drawTofu(cv, geo, n, lat) {
    const shear = Math.round(lat * 12), bs = T.blocks(geo, shear), left = n === null ? 0 : n;
    // the shop's sign over the rows: a wooden board, the name across it
    const r0 = T.tray(geo, 0), sy = geo.y0 - geo.dy - 72;
    cv.roundRect(r0.x, sy, r0.w, 54, 6, BOARD.wood);
    cv.strokeRoundRect(r0.x, sy, r0.w, 54, 6, 2, withAlpha(BOARD.edge, 0.9));
    cv.text(SIGN.text, r0.x + r0.w / 2, sy + 41, 36, BOARD.ink, { font: SIGN.family, literal: true, align: 'center', spacing: 8 });
    [0, 1].forEach((row) => { const r = T.tray(geo, row); cv.roundRect(r.x, r.y, r.w, r.h, 4, withAlpha(TOFU.tray, 0.9)); });
    bs.forEach((b) => {
        if (b.i >= left) {
            const f = T.blocks(geo, 0)[b.i];
            cv.stroke(f.front.concat([f.front[0]]), 2, withAlpha(TOFU.empty, 0.16));
            cv.stroke([f.front[0], f.top[1], f.top[2], f.side[2], f.front[2]], 2, withAlpha(TOFU.empty, 0.1));
            return;
        }
        const edge = left === 1 ? TOFU.low : TOFU.edge;
        cv.quad(b.side, TOFU.side);
        cv.quad(b.top, TOFU.top);
        cv.quad(b.front, TOFU.front);
        cv.stroke(b.front.concat([b.front[0]]), 2, withAlpha(edge, left === 1 ? 0.95 : 0.7));
        cv.stroke([b.front[0], b.top[1], b.top[2], b.side[2], b.front[2]], 2, withAlpha(edge, left === 1 ? 0.95 : 0.6));
    });
}
/** Points along an ellipse from angle a0 to a1 (radians; 0 .. pi the near half, below). */
function ellipse(cx, cy, a, b, a0, a1) {
    const pts = [], n = 32;
    for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]); }
    return pts;
}
/** A sheen down the glass: a band at `at` of the half width (- left), w px wide, alpha a. */
function sheen(cv, geo, at, w, a) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H;
    const x0 = cx + at * aR, x1 = cx + at * aB, y0 = ry + e * aR * Math.sqrt(1 - at * at) + 10, y1 = by + e * aB * Math.sqrt(1 - at * at) - 14;
    cv.quad([[x0, y0], [x0 + w, y0], [x1 + w * aB / aR, y1], [x1, y1]], withAlpha('#ffffff', a));
}
