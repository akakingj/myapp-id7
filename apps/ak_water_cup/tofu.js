'use strict';
/**
 * tofu.js - Water Cup's fuel tofu, apart from the screen (kit/tools/test_water_cup.js checks it).
 *
 * Ten blocks of tofu beside the cup, two rows of five: one block for each tenth of the tank. As the fuel goes down
 * they go, the top row first (its right end first), then the bottom row; the last one left is the bottom row's left.
 *   - the fuel: KombiIF.statusRangeTankStatus (the car's own tank level, litres; read-only, no diagnostics), its
 *     field's name differs by car (as AK Cluster Centre's rangesOf: a "fuel / tank" + "level / fill" leaf, not a
 *     saddle tank's left or right half), over the tank's size (Settings > Fuel tank size, the Car profile's)
 *   - blocks = ceil(fuel / 10 %), so a drop left still shows one; a change needs 1.5 % past the step (the level
 *     swings in a bend: no block blinking in and out)
 *   - no fuel signal yet: ten empty places
 *
 *   fuelLitres(v) -> litres or null      fuelPct(litres, tank) -> 0 .. 100 or null
 *   count(pct, prev) -> 0 .. 10          demoFuel(tMs) -> % (the demo: full to 5 % in 60 s, round again)
 *   blocks(geo, shear) -> [{ i, row, col, top, front, side }] (polygons in px; see the bottom)
 */
const N = 10, PER_ROW = 5, HYST = 1.5;
const isNum = (v) => typeof v === 'number' && isFinite(v);

/** Every number in a signal's value with its key: [{ key, v }]. */
function leaves(v, key, out) {
    out = out || [];
    if (v && typeof v === 'object') Object.keys(v).forEach((k) => leaves(v[k], k, out));
    else out.push({ key: key === undefined ? '' : key, v });
    return out;
}

/** The tank's level in litres from a statusRangeTankStatus value, or null (0xFFFE and up: no value). */
function fuelLitres(v) {
    let whole = null, half = null;
    leaves(v).forEach((l) => {
        const n = l.v, key = String(l.key).toLowerCase();
        if (!isNum(n) || n < 0 || n >= 0xFFFE) return;
        if (!(/level|fill|inhalt|volume|liter/.test(key) && /fuel|tank|kraftstoff/.test(key))) return;
        if (/left|right|links|rechts/.test(key)) { if (half === null) half = n; } else if (whole === null) whole = n;
    });
    return whole !== null ? whole : half;
}

function fuelPct(litres, tank) {
    if (!isNum(litres) || !isNum(tank) || tank <= 0) return null;
    return Math.max(0, Math.min(100, litres / tank * 100));
}

/** How many blocks: ceil(pct / 10); kept at prev while pct is within HYST % of the step between them. */
function count(pct, prev) {
    if (!isNum(pct)) return isNum(prev) ? prev : null;
    const want = Math.max(0, Math.min(N, Math.ceil(pct / 10 - 1e-9)));
    if (!isNum(prev) || want === prev) return want;
    // (the step between prev and want: prev's lower edge going down, its upper edge going up)
    const edge = want < prev ? (prev - 1) * 10 : prev * 10;
    return Math.abs(pct - edge) < HYST && Math.abs(want - prev) === 1 ? prev : want;
}

function demoFuel(t) {
    const s = ((t / 1000) % 60 + 60) % 60;
    return 100 - s / 60 * 95;
}

/* ---------- the shapes ----------
 * geo = { x0, y0 (the top row's front face, top left), w, h (a front face), dx, dy (the top face's depth: right and
 * up), gap (between blocks), rowGap (from a row's bottom to the next row's top face) }
 * Block i: 0 .. 4 the bottom row left to right, 5 .. 9 the top row; blocks i < count are shown.
 * shear: px the blocks' tops lean right (the wobble; - left), the bottoms stay put.
 */
function blocks(geo, shear) {
    const { x0, y0, w, h, dx, dy, gap, rowGap } = geo, s = isNum(shear) ? shear : 0, out = [];
    for (let i = 0; i < N; i++) {
        const row = i < PER_ROW ? 1 : 0, col = i % PER_ROW;                 // (row 0 the top one)
        const x = x0 + col * (w + gap), y = y0 + row * (h + rowGap + dy);
        const fl = [x + s, y], fr = [x + w + s, y], br = [x + w, y + h], bl = [x, y + h];
        out.push({
            i, row, col,
            front: [fl, fr, br, bl],
            top: [fl, [x + dx + s, y - dy], [x + w + dx + s, y - dy], fr],
            side: [fr, [x + w + dx + s, y - dy], [x + w + dx, y + h - dy], br],
        });
    }
    return out;
}
/** The tray under a row: { x, y, w, h }. */
function tray(geo, row) {
    const { x0, y0, w, h, dx, dy, gap, rowGap } = geo, y = y0 + row * (h + rowGap + dy) + h;
    return { x: x0 - 12, y: y - 4, w: PER_ROW * w + (PER_ROW - 1) * gap + dx + 24, h: 12 };
}

module.exports = { N, PER_ROW, HYST, leaves, fuelLitres, fuelPct, count, demoFuel, blocks, tray };
