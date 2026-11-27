'use strict';
/**
 * demo/tgz.js - a .tgz unpacked with Node alone (zlib + the tar format: ustar, GNU long names, pax paths), for the
 * packages the demo runs as the Store installs them (akakingj/myapp-comfort's apps/<id>/<id>@<version>.tgz, the
 * packages 재민's tools/store-build.js makes). Files and folders only; links and anything outside the folder are
 * refused.
 *
 *   untgz(file, dest)  -> [relative paths written]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function untgz(file, dest) {
    const buf = zlib.gunzipSync(fs.readFileSync(file));
    const out = [], root = path.resolve(dest);
    let o = 0, longName = null, paxName = null;
    const str = (h, a, b) => { const s = h.slice(a, b).toString('utf8'); const z = s.indexOf('\0'); return z >= 0 ? s.slice(0, z) : s; };
    while (o + 512 <= buf.length) {
        const h = buf.slice(o, o + 512);
        if (h.every((b) => b === 0)) break;
        const size = parseInt(str(h, 124, 136).trim() || '0', 8) || 0;
        const type = h[156] ? String.fromCharCode(h[156]) : '0';
        let name = str(h, 0, 100);
        const prefix = h.slice(257, 262).toString() === 'ustar' ? str(h, 345, 500) : '';
        if (prefix) name = prefix + '/' + name;
        const data = buf.slice(o + 512, o + 512 + size);
        o += 512 + Math.ceil(size / 512) * 512;
        if (type === 'L') { longName = str(data, 0, data.length); continue; }
        if (type === 'x') { const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8')); paxName = m ? m[1] : null; continue; }
        if (type === 'g') continue;
        if (longName) { name = longName; longName = null; }
        if (paxName) { name = paxName; paxName = null; }
        name = name.replace(/\\/g, '/').replace(/^\.\//, '');
        if (!name || name === '.') continue;
        const to = path.resolve(root, name);
        if (to !== root && to.indexOf(root + path.sep) !== 0) throw new Error('unsafe path in ' + path.basename(file) + ': ' + name);
        if (type === '5') { fs.mkdirSync(to, { recursive: true }); continue; }
        if (type !== '0' && type !== '7') continue;                       // (links and devices: not taken)
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, data);
        out.push(name);
    }
    return out;
}

module.exports = { untgz };
