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
 *   - the fuel: KombiIF.statusRangeTankStatus (the car's tank level, litres, read-only), over Settings > Fuel tank size
 *     (the Car profile's where it sets one; 59 L); demo data: a tank of its own going down (tofu.js demoFuel)
 * Settings: Slosh strength (x the G, 2.2 as Layouts), Water level, Fuel tofu, Fuel tank size, skin, colour theme, layout, renderer, demo data (the Car profile's).
 */
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const Car = require('./kit/car');
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
        // the fuel in the tank (litres), as the car last sent it (sent on change: kept, however old)
        let litres = null;
        const car = new Car(ctx, ['accel', 'speed'], { 'de.bmw.infotainment.KombiIF': {
            statusRangeTankStatus: (v) => { const l = T.fuelLitres(v); if (l !== null) litres = l; },
        } });
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
                const pct = demo ? T.demoFuel(now) : T.fuelPct(litres, Number(settings.get('tankLitres')) || 59);
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
            // the water, its surface (lighter), the far edge's glint where it rides up the glass
            if (s.water.length >= 3) cv.fill(s.water, withAlpha(WATER, 0.85));
            cv.fill(s.surface, FOAM);
            cv.stroke(s.far, 3, withAlpha('#ffffff', 0.55));
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
