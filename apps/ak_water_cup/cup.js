'use strict';
/**
 * cup.js - Water Cup's physics and shapes, apart from the screen (kit/tools/test_water_cup.js checks them).
 *
 * The water moves as the cup of AK Cluster Layouts' JDM 1 (akakingj/idrive7-cluster-info, layout_arc_tach.js 0.41.x):
 * the same constants, drawn here with the kit's shapes instead of a shader.
 *   - sideways: the surface tilts to atan(gain x g), at most MAX_TILT, higher on the outside of the bend (where the
 *     driver is pushed; swap: Settings > Swap left / right, or the Car profile's)
 *   - fore and aft: braking sends it to the far side (its surface seen taller), accelerating to the near side
 *     (flatter): the surface's ellipse e x (1 + lon), lon = -gain x gLong within LON_MIN .. LON_MAX
 *   - each on a spring (1.2 a second, damping 0.09): it sloshes back a few times after a change
 *
 *   zeroer() -> feed({ gLat, gLong, speed, demo }, tMs) -> { lat, long } | null: each axis's offset learned while the car
 *              stands (over 2 s at <= 0.5 km/h, |g| <= 1, up to 50 samples; as Layouts' gZeroed: a car read 0.6-0.7 g
 *              idling, a slope parked on), taken off (not on demo data), then smoothed over about 150 ms; |g| > 3 dropped
 *   spring(lo, hi) -> step(target, dtMs) -> where it is, rounded to 0.004; step.reset(to)
 *   targets(g, gain, sx) -> { lat, lon }
 *   shapes(geo, lat, lon, level) -> { body, water, surface, far } (polygons in px; see the bottom)
 *   demoG(tMs) -> { gLat, gLong }: the demo's drive (a 14 s round: weaving, still, a stop, still)
 */
const MAX_TILT = 0.6, LON_MIN = -0.22, LON_MAX = 0.32, E = 0.42;
const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function zeroer() {
    const ax = { gLat: { z: 0, n: 0, s: null }, gLong: { z: 0, n: 0, s: null } };
    let still = 0, at = 0;
    return (d, t) => {
        if (!isNum(d.speed) || d.speed > 0.5) still = 0; else if (!still) still = t;
        const standing = still > 0 && t - still > 2000, dt = at ? Math.min(500, Math.max(0, t - at)) : 0;
        at = t;
        const k = dt > 0 ? 1 - Math.exp(-dt / 150) : 1;
        let any = false;
        ['gLat', 'gLong'].forEach((key) => {
            const g = d[key], a = ax[key];
            if (!isNum(g) || Math.abs(g) > 3) return;           // (a road car can't pull 3 g: a bad sample)
            if (!d.demo && standing && Math.abs(g) <= 1) { a.n = Math.min(a.n + 1, 50); a.z += (g - a.z) / a.n; }
            const v = g - (d.demo ? 0 : a.z);
            a.s = a.s === null ? v : a.s + (v - a.s) * k;
            any = true;
        });
        return any ? { lat: ax.gLat.s || 0, long: ax.gLong.s || 0 } : null;
    };
}

/** A spring towards its target: step(target, dt ms) -> where it is (rounded to 0.004). */
function spring(lo, hi) {
    const W = 2 * Math.PI * 1.2, Z = 0.09;
    let th = 0, v = 0;
    const step = (want, dt) => {
        if (!isNum(want)) want = 0;
        for (let left = Math.min(250, isNum(dt) ? dt : 0); left > 0; left -= 8) {
            const h = Math.min(8, left) / 1000;
            v += (-W * W * (th - want) - 2 * Z * W * v) * h;
            th = clamp(th + v * h, lo, hi);
        }
        return Math.round(Math.round(th / 0.004) * 0.004 * 1000) / 1000;
    };
    step.reset = (to) => { th = clamp(isNum(to) ? to : 0, lo, hi); v = 0; };
    step.moving = () => Math.abs(v) > 0.004;
    return step;
}

function targets(g, gain, sx) {
    if (!g) return { lat: 0, lon: 0 };
    return { lat: clamp(Math.atan(gain * sx * g.lat), -MAX_TILT, MAX_TILT), lon: clamp(-gain * g.long, LON_MIN, LON_MAX) };
}

/* ---------- the shapes ----------
 * geo = { cx, ry (the rim's middle), aR (the rim's half width), aB (the bottom's), H (rim to bottom), e }
 * (seen a little from above: the rim and the bottom ellipses, e their height to width)
 */
const N = 48;
/** The body's outline, inset by `inset` px: the left wall down, the bottom's near half, the right wall up (closed
 * along the rim's line). */
function bodyOf(geo, inset) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H, aBi = aB - inset, aRi = aR - inset, pts = [[cx - aRi, ry]];
    for (let i = 0; i <= N / 2; i++) {
        const a = Math.PI - (i / (N / 2)) * Math.PI;              // pi .. 0, through the near side (below)
        pts.push([cx + aBi * Math.cos(a), by + e * aBi * Math.sin(a)]);
    }
    pts.push([cx + aRi, ry]);
    return pts;
}
/** The polygon's part on the side of the line y = y0 - (x - cx) tan(t) where y is larger (below it): Sutherland-Hodgman. */
function below(poly, cx, y0, t) {
    const tn = Math.tan(t), f = (p) => p[1] - (y0 - (p[0] - cx) * tn), out = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
        if (fa >= 0) out.push(a);
        if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    return out;
}
function shapes(geo, lat, lon, level) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H, inset = Math.max(3, aR * 0.035);
    // (the glass's outline: the rim's far half over the top, so its tint fills the mouth too; the water's: the inner
    // walls closed along the rim's line)
    const body = bodyOf(geo, 0), inner = bodyOf(geo, inset);
    for (let i = N / 2 - 1; i >= 1; i--) { const a = Math.PI + (i / (N / 2)) * Math.PI; body.push([cx + aR * Math.cos(a), ry + e * aR * Math.sin(a)]); }
    // the water's surface: at `level` of the height on the cup's axis, tilted (sheared) by lat, its half width the
    // inner wall's there
    const yw = by - level * H, aw = aR + (aB - aR) * ((yw - ry) / H) - inset, bw = Math.max(0, (e + lon) * aw), tn = Math.tan(lat);
    const water = below(inner, cx, yw, lat);
    const surface = [], far = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * Math.PI, x = aw * Math.cos(a), y = yw - x * tn + bw * Math.sin(a);
        surface.push([cx + x, y]);
        if (Math.sin(a) <= 0) far.push([cx + x, y]);                 // (the far half: y up)
    }
    far.sort((p, q) => p[0] - q[0]);
    return { body, inner, water, surface, far, aw, bw, yw, rimY: ry, topOf: (x) => yw - (x - cx) * tn - bw * Math.sqrt(Math.max(0, 1 - ((x - cx) / aw) ** 2)) };
}
/** The highest the water reaches (px; smaller is higher): the surface's top and the water's. */
function highest(geo, lat, lon, level) {
    const s = shapes(geo, lat, lon, level);
    return Math.min(...s.surface.map((p) => p[1]).concat(s.water.map((p) => p[1])));
}

/** The demo's drive: a 14 s round - weaving (two 4 s waves, 0.5 g), 2 s still, a 1 s stop (-0.6 g), 3 s still. */
function demoG(t) {
    const s = ((t / 1000) % 14 + 14) % 14;
    if (s < 8) return { gLat: 0.5 * Math.sin(s / 4 * 2 * Math.PI), gLong: 0 };
    if (s >= 10 && s < 11) return { gLat: 0, gLong: -0.6 };
    return { gLat: 0, gLong: 0 };
}

module.exports = { MAX_TILT, LON_MIN, LON_MAX, E, zeroer, spring, targets, shapes, highest, below, demoG };
