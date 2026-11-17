'use strict';
/**
 * Water Cup - a clear cup of water on the screen, sloshing with the car's G.
 *
 * Nothing else on the page: no figures (G-Force shows the G). The water moves as the cup of AK Cluster Layouts' JDM 1
 * (cup.js: the same constants), drawn with the kit's shapes (record.js: polygons, lines), worked out every frame;
 * a frame goes out only when the water moved (0.004), so a still cup costs nothing.
 *
 *   - input: the car's acceleration (kit car.js 'accel', CDS2's mass-centre G, read-only, no diagnostics) and its
 *     speed (standing: the zero learned), each axis zeroed and smoothed as Layouts' gZeroed (cup.js zeroer)
 *   - no G for over 3 s (the car off, asleep): the water levels out slowly
 *   - shown again after a while: the springs start where the G is now (no jump, no slosh from the gap)
 *   - demo data (Settings > Demo data, or the Car profile's): a drive of its own (cup.js demoG)
 * Settings: Slosh strength (x the G, 2.2 as Layouts), Water level, Swap left / right (the Car profile's "Swap G left /
 * right" where it sets one), skin, colour theme, layout, renderer, demo data (the Car profile's).
 */
const mgu = require('./kit/mgu');
const { withAlpha } = require('./kit/canvas');
const G = require('./kit/gauges');
const Car = require('./kit/car');
const C = require('./cup');

const W = 1600, H = 520;
const WATER = '#3f8fd4', FOAM = '#86c4f2', GLASS = '#e4ecf4';

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const car = new Car(ctx, ['accel', 'speed']);
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
            return C.targets(gOk ? g : null, Number(settings.get('gain')) || 2.2, settings.get('flipLat') ? -1 : 1);
        };
        settings.onChange(() => { force = true; });
        ctx.onLayout(() => { force = true; });

        // the cup: about 80 % of the page's height, in its middle (the rim 56 : the bottom 40, as Layouts')
        const geo = { cx: W / 2, ry: 140, aR: 150, aB: 107, H: 300, e: C.E };

        async function render() {
            const now = Date.now(), dt = last ? now - last : 0, w = want();
            last = now;
            // (back after a gap - hidden, a slow frame: start where the G is now)
            if (!dt || dt > 1000) { lat.reset(w.lat); lon.reset(w.lon); }
            const a = lat(w.lat, dt), b = lon(w.lon, dt), level = Number(settings.get('level')) || 0.5;
            const key = a + ',' + b + ',' + level + ',' + demo;
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
            G.frame(cv, t, ['Water cup'], 0, [demo && { text: 'DEMO' }]);
            await ui.image('MAIN_GFX', cv);
        }

        ctx.loop('MAIN', 30, render);
        render().then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});

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
