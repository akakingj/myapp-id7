'use strict';
/**
 * test_g_direction.js - every app's G as the driver feels it (no setting since Car profile 1.6.0): the kit's G-force
 * circle (M Vitals) puts the dot right in a left bend (the car's lateral G > 0) and down accelerating, up braking;
 * G-Force's own circle the same (its source: x = cx + lat, y = cy + lon).
 *   node kit/tools/test_g_direction.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'kit', 'runtime', 'gauges'));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok ' + name); };

function dotAt(lat, long) {
    const circles = [], texts = [];
    const cv = { textScale: 1, blit() {}, circle(x, y, r) { circles.push({ x, y, r }); }, text(s, x, y) { texts.push({ s, x, y }); return 0; } };
    const t = { tick: '#888888', dim: '#888888', accent: '#ff0000', text: '#ffffff', name: 'test' };
    // (a fresh centre each time: the dot glides from where it was at the same place)
    const cx = 400 + Math.random() * 100, cy = 300;
    G.gmeter(cv, t, cx, cy, 100, { lat, long, trail: [], max: 1.5 });
    const dot = circles.find((c) => c.r === 10);
    return { dx: dot.x - cx, dy: dot.y - cy };
}

ok('the kit\'s circle: right in a left bend, left in a right one', () => {
    assert(dotAt(0.5, 0).dx > 20, 'left bend (lateral G > 0): right');
    assert(dotAt(-0.5, 0).dx < -20, 'right bend: left');
});
ok('the kit\'s circle: down accelerating, up braking', () => {
    assert(dotAt(0, 0.4).dy > 20, 'accelerating: down (back)');
    assert(dotAt(0, -0.6).dy < -20, 'braking: up');
});
ok('G-Force\'s circle the same way round, BRAKE on top, no swap settings left', () => {
    const src = fs.readFileSync(path.join(ROOT, 'apps', 'gforce', 'main.js'), 'utf8');
    assert(/const P = \(lat, lon\) => \[cx \+ G\.clamp\(lat \/ max[^\]]*\]*, cy \+ G\.clamp\(lon \/ max/.test(src), 'x = cx + lat, y = cy + lon');
    assert(!/flipLat|flipLong/.test(src));
    assert(/'BRAKE', cx, cy - r - 20/.test(src), 'BRAKE on top');
    const kit = fs.readFileSync(path.join(ROOT, 'kit', 'runtime', 'gauges.js'), 'utf8');
    assert(!/flipLat|flipLong/.test(kit.slice(kit.indexOf('function gmeter'))));
});
console.log(n + ' passed');
