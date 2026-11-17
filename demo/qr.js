'use strict';
/**
 * qr.js - a QR code for a short text (the demo's address, for the phone's camera): byte mode, error correction L,
 * versions 1 to 5 (up to 106 bytes), mask 0. After Project Nayuki's QR Code generator (MIT), cut down to that.
 *
 *   qr(text) -> [[true, false, ...], ...] (rows of modules, true = dark), or null when the text is too long
 */
const CAP = [null, [26, 7], [44, 10], [70, 15], [100, 20], [134, 26]];   // version -> [codewords, error correction] (one block)

function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
}
function ecc(data, degree) {
    const div = new Array(degree).fill(0); div[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) { div[j] = mul(div[j], root); if (j + 1 < degree) div[j] ^= div[j + 1]; }
        root = mul(root, 0x02);
    }
    const res = new Array(degree).fill(0);
    data.forEach((b) => { const f = b ^ res.shift(); res.push(0); div.forEach((c, i) => { res[i] ^= mul(c, f); }); });
    return res;
}

function qr(text) {
    const bytes = Array.from(Buffer.from(String(text), 'utf8'));
    let ver = 1;
    while (ver <= 5 && bytes.length + 2 > CAP[ver][0] - CAP[ver][1]) ver++;
    if (ver > 5) return null;
    const [total, ecLen] = CAP[ver], dataLen = total - ecLen;
    // the data: mode 0100 (bytes), its count (8 bits), the bytes, a terminator, then the pad bytes
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, dataLen * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    for (let p = 0xec; data.length < dataLen; p ^= 0xec ^ 0x11) data.push(p);
    const words = data.concat(ecc(data, ecLen));

    const size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
            if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver >= 2) {
        const p = size - 7;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(p + dx, p + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // the format: error correction L (01), mask 0
    const fdata = (1 << 3) | 0;
    let rem = fdata;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fb = ((fdata << 10) | rem) ^ 0x5412, bit = (i) => ((fb >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
    // the codewords, two columns at a time from the bottom right, zigzag
    let k = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let v = 0; v < size; v++) {
            for (let j = 0; j < 2; j++) {
                const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
                if (!fn[y][x] && k < words.length * 8) { m[y][x] = ((words[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
            }
        }
    }
    // mask 0: (x + y) even, on everything but the function patterns
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
    return m;
}

module.exports = { qr };
