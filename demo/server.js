'use strict';
/**
 * demo/server.js - the MGU demo: every app of this repository (akakingj/myapp-id7) and of akakingj/myapp-cluster running on your
 * computer as in the car, in one browser window:
 *
 *   - the centre display (the MGU): the HMI's app list, an app's own screen when its icon is tapped (touch, the iDrive
 *     knob from the keyboard and mouse wheel), drawn by the car's own draw engine (kit/emu/web/gfx, WebAssembly)
 *   - the instrument cluster and the HUD: what the AK Cluster apps draw there, from their own code, as the KOMBI draws
 *     it (their GLSL, WebGL)
 *   - one car for every app: an automatic drive or your own values (the panel), and each app's settings
 *
 *   node demo/server.js [--cluster ../myapp-cluster] [--styles ../myapp-cluster-high] [--data <folder>] [--port 8077] [--no-open]
 *   (Windows: MGU_데모_실행.bat, which also fetches the newest code of both repositories first)
 *
 * The apps are not copied or changed for the demo: each is built from apps/<id> as the MGU Store builds it (this repo:
 * kit/tools/build.py --preview-only --language ko; the cluster repo: its tools/mgu/stage.js) and run with its own kit
 * (kit/tools/hu-stub.js). demo/preload.js stands in for the car around them (signals, the cluster's renderer, /dev/shm).
 * So a change to an app shows here as it is, with nothing to change in the demo; a save while the demo runs rebuilds
 * and restarts that app.
 *
 * Apps that start with the car (app.json "autostart" / "startType": "autostart": Car profile, the AK Cluster apps,
 * Warm-Up, Ambient config) run all the time in the background, as in the car, so the cluster is drawn whichever app
 * is on the centre display. One app at a time is on the centre display (the renderer's socket); tapping an autostart
 * app's icon brings that very app to the front (it restarts once).
 *
 * Built on kit/tools/emu.js (the live emulator, commit 512e8e6): its WebSocket, renderer daemon, ticks, touch and
 * controller are kept as they are (marked "from kit/tools/emu.js" below).
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync, fork, exec } = require('child_process');

const DEMO_VERSION = '1.8.2';
const A = path.resolve(__dirname, '..');                       // this repository (akakingj/myapp-id7)
const WEB = path.join(__dirname, 'web');
const GFX = path.join(A, 'kit', 'emu', 'web', 'gfx');            // the car's draw engine as WebAssembly (GPL-3.0-or-later)
const PRELOAD = path.join(__dirname, 'preload.js');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
let PORT = Number(opt('--port', 8077));
const OPEN = !flag('--no-open');
const BG = (() => { const b = opt('--bg', null); return b ? path.resolve(b) : null; })();
const Touch = { on: !flag('--no-touch') };
/** the cluster apps' repository: --cluster, else beside this one */
const B = (() => {
    const o = opt('--cluster', null);
    const c = [o, process.env.DEMO_CLUSTER, path.join(A, '..', 'myapp-cluster')].filter(Boolean).map((p) => path.resolve(p));
    return c.find((p) => fs.existsSync(path.join(p, 'apps')) && fs.existsSync(path.join(p, 'tools', 'mgu', 'stage.js'))) || null;
})();
/** AK Cluster ID8 (akakingj/myapp-cluster-high: the owner's modification of waliworld's MGU Styles, kept with its
 *  author's leave): --styles, else beside the cluster repository. Only its app akakingj_cluster_id8 is listed (any other
 *  folder there is not run); it is built with its own kit and run with this repository's hu-stub.js (the same MGU
 *  App Kit). Optional: without that repository the demo runs without it. */
const STYLES_APP = 'akakingj_cluster_id8';
const C = (() => {
    const o = opt('--styles', null);
    const c = [o, process.env.DEMO_STYLES, B && path.join(B, '..', 'myapp-cluster-high'), path.join(A, '..', 'myapp-cluster-high')].filter(Boolean).map((p) => path.resolve(p));
    return c.find((p) => fs.existsSync(path.join(p, 'apps', STYLES_APP, 'app.json')) && fs.existsSync(path.join(p, 'kit', 'tools', 'build.py'))) || null;
})();
/** the demo's own files (each app's settings, the shared /dev/shm files, the cluster apps' staged code): --data */
const DATA = path.resolve(opt('--data', path.join(__dirname, '.data')));
const SHM = path.join(DATA, 'shm');
const STAGE = path.join(DATA, 'stage');
[DATA, SHM, STAGE, path.join(SHM, 'run', 'waze-on-cluster')].forEach((d) => fs.mkdirSync(d, { recursive: true }));
let HOSTS = [];
const setHosts = () => { HOSTS = ['localhost:' + PORT, '127.0.0.1:' + PORT]; };
setHosts();
// the renderer's socket: a named pipe on Windows (demo/preload.js lets kit/renderd.js take it)
const SOCK = process.platform === 'win32' ? '\\\\.\\pipe\\mgu-demo-' + process.pid : path.join(os.tmpdir(), 'mgu-demo-' + process.pid + '.sock');
const MAX_MSG = 24 << 20;                       // a bigger message ends the connection (PROTOCOL.md "Framing")
const PAGE_BEHIND = 8 << 20, PAGE_GONE = 64 << 20;   // bytes queued to a page: frames wait for it / it is closed

/* ---------------- Python for this repository's build (kit/tools/build.py) ---------------- */
const PY = (() => {
    const c = process.env.DEMO_PYTHON ? [[process.env.DEMO_PYTHON]] : process.platform === 'win32' ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']];
    for (const [cmd, ...a] of c) {
        try {
            const r = spawnSync(cmd, a.concat(['-c', 'import sys; print(sys.version_info[0])']), { encoding: 'utf8', windowsHide: true, timeout: 15000 });
            if (r.status === 0 && String(r.stdout).trim() === '3') return { cmd, args: a };
        } catch (e) { /* not this one */ }
    }
    return null;
})();

/* ---------------- the apps: both repositories ---------------- */
const koOf = (root) => { try { return JSON.parse(fs.readFileSync(path.join(root, 'kit', 'runtime', 'locales', 'ko.json'), 'utf8')); } catch (e) { return {}; } };
let REG = {};
function scanApps() {
    const reg = {};
    [[A, 'A'], [B, 'B'], [C, 'C']].forEach(([root, repo]) => {
        if (!root) return;
        const ko = koOf(root);
        let dirs = [];
        try { dirs = fs.readdirSync(path.join(root, 'apps')); } catch (e) { return; }
        dirs.forEach((id) => {
            if (repo === 'B' && !/^akakingj_/.test(id)) return;        // (the cluster repository: the AK apps only)
            if (repo === 'C' && id !== STYLES_APP) return;   // (its one app: AK Cluster ID8)
            if (reg[id]) return;
            let j;
            try { j = JSON.parse(fs.readFileSync(path.join(root, 'apps', id, 'app.json'), 'utf8')); } catch (e) { return; }
            reg[id] = { id, root, repo, title: ko[j.title] || j.title || id, version: j.version || '', auto: !!(j.autostart || j.startType === 'autostart'),
                hasDemo: (j.settings || []).some((s) => s.key === 'demo'), hasShow: (j.settings || []).some((s) => s.key === 'show') };
        });
    });
    REG = reg;
    return reg;
}
scanApps();
const listApps = () => Object.keys(REG).sort();
const appTitles = () => listApps().reduce((o, id) => { o[id] = REG[id].title; return o; }, {});
let appId = null;                                // the app on the centre display (none: the app list)

/** apps/<id> built as the Store builds it: { dir } (the staged tree hu-stub.js runs), or { error } */
function buildApp(id) {
    const a = REG[id];
    if (!a) return Promise.resolve({ error: 'no app ' + id });
    if (a.repo === 'B') {
        // the cluster repository's own stager (JavaScript; as its build.py --language ko for what runs here)
        return new Promise((res) => setImmediate(() => {
            try {
                const f = require.resolve(path.join(B, 'tools', 'mgu', 'stage.js'));
                delete require.cache[f];
                res({ dir: require(f).stageApp(id, STAGE, 'ko') });
            } catch (e) { res({ error: String(e && e.stack || e) }); }
        }));
    }
    if (!PY) return Promise.resolve({ error: 'Python 3 was not found: this repository\'s apps are built with kit/tools/build.py.\nInstall Python 3 (python.org, "Add to PATH") and start the demo again.' });
    // (AK Cluster ID8: its own kit/tools/build.py in its own tree, in Korean as the Store builds it)
    const root = a.repo === 'C' ? C : A, lang = ['--language', 'ko'];
    return new Promise((res) => {
        let out = '';
        const p = spawn(PY.cmd, PY.args.concat([path.join(root, 'kit', 'tools', 'build.py'), '--preview-only'], lang, [id]), { cwd: root, windowsHide: true });
        p.stdout.on('data', (d) => { out += d; });
        p.stderr.on('data', (d) => { out += d; });
        p.on('error', (e) => { out += String(e); });
        p.on('close', (code) => res(code === 0 ? { dir: path.join(root, 'dist', id), out } : { error: out || 'build.py exit ' + code }));
    });
}

/** first run of an app here: the car's data (setting "demo" Auto), and the AK Cluster Layouts shown on the cluster */
function seedSettings(id, dir) {
    const f = path.join(dir, 'settings.json');
    if (fs.existsSync(f)) return;
    const a = REG[id], v = {};
    if (a.hasDemo) v.demo = 'auto';                 // (the demo's car comes as the car's signals)
    if (a.hasShow && id === 'akakingj_cluster_layouts') v.show = 'on';
    if (Object.keys(v).length) fs.writeFileSync(f, JSON.stringify(v, null, 1));
}
const dataDir = (id) => { const d = path.join(DATA, 'apps', id); fs.mkdirSync(d, { recursive: true }); return d; };

/** an app's process: hu-stub.js of its own repository, demo/preload.js first; fg: on the renderer's socket */
function forkApp(id, dir, fg, closed) {
    const a = REG[id], data = dataDir(id);
    seedSettings(id, data);
    const env = Object.assign({}, process.env, { DEMO_SHM: SHM, DEMO_APP: id, MGU_EMU_CLOSED: closed ? '1' : '' });
    delete env.MGU_RENDERD_FILE;
    if (fg) env.MGU_RENDERD_SOCKET = SOCK; else delete env.MGU_RENDERD_SOCKET;
    if (a.repo !== 'A') env.KIT_DIR = path.join(dir, 'source', 'javascript', 'kit');
    if (a.repo === 'C') env.MGU_EMU_BACKGROUND = '1';            // (MGU Styles draws the cluster from impl.background)
    // (MGU Styles' tree has no hu-stub.js: this repository's runs it, the app with its own kit)
    const stub = path.join(a.repo === 'C' ? A : a.root, 'kit', 'tools', 'hu-stub.js');
    return fork(stub, [dir, data], { cwd: data, env, execArgv: ['-r', PRELOAD], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
}

/* ---------------- WebSocket (RFC 6455), server side (from kit/tools/emu.js) ---------------- */
const pages = new Set();
class Ws {
    constructor(sock, head) {
        this.sock = sock; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.stale = false;
        sock.setNoDelay(true);
        sock.on('data', (d) => this._data(d));
        sock.on('close', () => { this.open = false; pages.delete(this); });
        sock.on('error', () => {});
        // a page that fell behind has missed frames: it gets the connection so far once it has read its backlog
        sock.on('drain', () => { if (this.stale && this.open) { this.stale = false; replay(this); } });
        if (head && head.length) this._data(head);
    }
    _data(d) {
        this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
        for (;;) {
            const b = this.buf;
            if (b.length < 2) return;
            const fin = b[0] & 0x80, op = b[0] & 15, masked = b[1] & 0x80;
            let len = b[1] & 127, o = 2;
            if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); o = 4; } else if (len === 127) { if (b.length < 10) return; len = b.readUInt32BE(2) * 4294967296 + b.readUInt32BE(6); o = 10; }
            if (!masked) { this.close(1002); return; }               // a client's frames are always masked
            if (len > 1 << 20) { this.close(1009); return; }
            const mo = o;
            o += 4;
            if (b.length < o + len) return;
            const p = Buffer.from(b.slice(o, o + len));
            for (let i = 0; i < p.length; i++) p[i] ^= b[mo + (i & 3)];
            this.buf = b.slice(o + len);
            if (op === 8) { this.close(); return; }
            if (op === 9) { this._frame(10, p); continue; }
            if (op === 10) continue;
            if (op === 0 && this.frag) {
                this.frag.parts.push(p);
                if (this.frag.parts.reduce((n, x) => n + x.length, 0) > 1 << 20) { this.close(1009); return; }
                if (fin) { const f = this.frag; this.frag = null; this._msg(f.op, Buffer.concat(f.parts)); }
                continue;
            }
            if (!fin) { this.frag = { op, parts: [p] }; continue; }
            this._msg(op, p);
        }
    }
    _msg(op, p) {
        if (op !== 1) return;
        let m;
        try { m = JSON.parse(p.toString('utf8')); } catch (e) { return; }
        if (!m || typeof m !== 'object') return;
        try { onPage(this, m); } catch (e) { console.error('page message: ' + (e.stack || e)); }
    }
    _frame(op, p) {
        if (!this.open) return;
        const n = p.length, h = Buffer.alloc(n < 126 ? 2 : n < 65536 ? 4 : 10);
        h[0] = 0x80 | op;
        if (n < 126) h[1] = n; else if (n < 65536) { h[1] = 126; h.writeUInt16BE(n, 2); } else { h[1] = 127; h.writeUInt32BE(Math.floor(n / 4294967296), 2); h.writeUInt32BE(n >>> 0, 6); }
        this.sock.write(h); this.sock.write(p);
    }
    send(x) {
        if (!this.open) return;
        const q = this.sock.writableLength;
        if (q > PAGE_GONE) { this.sock.destroy(); this.open = false; pages.delete(this); return; }
        if (Buffer.isBuffer(x)) {
            // frames for a page that does not keep up wait (it gets a replay when it has caught up)
            if (q > PAGE_BEHIND) { this.stale = true; return; }
            if (this.stale) return;
            this._frame(2, x);
        } else this._frame(1, Buffer.from(JSON.stringify(x)));
    }
    close(code) {
        if (!this.open) return;
        const p = Buffer.alloc(2); p.writeUInt16BE(code || 1000, 0);
        this._frame(8, p); this.open = false; pages.delete(this); this.sock.end();
    }
}
const toPages = (x) => pages.forEach((w) => w.send(x));


/* ---------------- http: the page, /gfx, /icon, /ws (this computer only: 127.0.0.1, Host and Origin checked) ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.map': 'application/json' };
// another site's page in the browser (Origin) or a DNS name pointed at 127.0.0.1 (Host) gets nothing
const ours = (req) => HOSTS.indexOf(String(req.headers.host)) >= 0 && (!req.headers.origin || HOSTS.some((h) => req.headers.origin === 'http://' + h));
const inside = (f, dir) => f.indexOf(dir + path.sep) === 0;
const server = http.createServer((req, res) => {
    const fail = (code) => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(String(code)); };
    try {
        if (!ours(req)) { fail(403); return; }
        let u;
        try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { fail(400); return; }
        if (u.indexOf('\0') >= 0) { fail(400); return; }
        // an app's tile icon: /icon/<id>.png, for the apps the demo has only
        const ic = /^\/icon\/([A-Za-z0-9_-]+)\.png$/.exec(u);
        if (ic && !REG[ic[1]]) { fail(404); return; }
        let f;
        if (ic) f = path.join(REG[ic[1]].root, 'apps', ic[1], 'icon.png');
        else if (u === '/bg' && BG) f = BG;
        else if (u.indexOf('/gfx/') === 0) { f = path.join(GFX, path.normalize(u.slice(5)).replace(/^([/\\])+/, '')); if (!inside(f, GFX)) { fail(403); return; } }
        else { f = path.join(WEB, u === '/' ? 'index.html' : path.normalize(u).replace(/^([/\\])+/, '')); if (!inside(f, WEB)) { fail(403); return; } }
        fs.readFile(f, (e, d) => {
            if (e) { fail(404); return; }
            // (cross-origin isolated: a finer performance.now() for the draw times; everything the page loads is from here)
            res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store',
                'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
            res.end(d);
        });
    } catch (e) { fail(500); }
});
server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (x) { sock.destroy(); } });
server.on('upgrade', (req, sock, head) => {
    sock.on('error', () => {});
    const key = req.headers['sec-websocket-key'];
    if (req.url.split('?')[0] !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !ours(req)) { sock.destroy(); return; }
    const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
    const ws = new Ws(sock, head);
    pages.add(ws);
    ws.send(hello());
    if (App.spec) ws.send({ t: 'spec', spec: App.spec, values: App.values });
    ws.send({ t: 'screens', stack: App.stack, closed: App.closed });
    ws.send(App.status);
    ws.send({ t: 'log', lines: App.log.slice(-300) });
    ws.send(vehMsg());
    ws.send(bgMsg());
    clusterReplay(ws);
    if (App.soft) ws.send({ t: 'soft', png: App.soft });
    replay(ws);
});
function hello() {
    return { t: 'hello', apps: listApps(), titles: appTitles(), auto: listApps().filter((id) => REG[id].auto), repo: listApps().reduce((o, id) => { o[id] = REG[id].repo; return o; }, {}),
        app: appId, bg: !!BG, touch: Touch.on, demo: DEMO_VERSION, cluster: clusterGeometry(), sources: sourcesInfo(), python: !!PY };
}
/** what each repository is (the launcher writes .demo-source.json: branch and commit) */
function sourcesInfo() {
    const one = (root, name) => {
        if (!root) return { name, missing: true };
        let s = {};
        try { s = JSON.parse(fs.readFileSync(path.join(root, '.demo-source.json'), 'utf8')); } catch (e) { /* not from the launcher */ }
        if (!s.commit) { try { s.commit = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim(); } catch (e) { /* no git */ } }
        if (!s.branch) { try { s.branch = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim(); } catch (e) { /* no git */ } }
        return Object.assign({ name }, s);
    };
    return [one(A, 'myapp-id7'), one(B, 'myapp-cluster')].concat(C ? [one(C, 'myapp-cluster-high')] : []);
}
/** the cluster's glass as the car shows it, from Cluster Layouts' layout_common.js (its own measurements of the car):
 *  the map's place, the car's bottom strip, the driver camera's cowl, the slanted top corners, the stock warning
 *  lights, the KOMBI's dark boxes (gear readout, eDrive, an M car's two) */
function clusterGeometry() {
    const g = { map: { x: 416, y: 120, w: 1088, h: 480 }, stripY: 646 };
    if (!B) return g;
    const f = path.join(B, 'apps', 'akakingj_cluster_layouts', 'layout_common.js');
    try {
        Object.keys(require.cache).forEach((k) => { if (k.indexOf(path.join(B, 'apps', 'akakingj_cluster_layouts')) === 0) delete require.cache[k]; });
        const C = require(f), box = (b) => (b && isFinite(b.x) && isFinite(b.w) ? { x: b.x, y: b.y, w: b.w, h: b.h } : null);
        if (box(C.MAP)) g.map = box(C.MAP);
        if (isFinite(C.STRIP_Y)) g.stripY = C.STRIP_Y;
        g.notch = box(C.NOTCH); g.telltales = box(C.TELLTALES); g.gearbox = box(C.GEARBOX_HOLE); g.edrive = box(C.EDRIVE_HOLE);
        g.mHoles = Array.isArray(C.M_HOLES) ? C.M_HOLES.map(box).filter(Boolean) : [];
        // the hidden top corners (inCorner): their edge, found point by point along the top
        if (typeof C.inCorner === 'function') {
            const edge = [];
            for (let x = 0; x <= 960; x += 8) {
                if (!C.inCorner(x, 0)) { edge.push([x, 0]); break; }
                let lo = 0, hi = 720;
                while (hi - lo > 0.5) { const m = (lo + hi) / 2; if (C.inCorner(x, m)) lo = m; else hi = m; }
                edge.push([x, Math.round(lo * 10) / 10]);
            }
            if (edge.length > 1) g.corner = edge;            // (the left one; the right one is its mirror)
        }
    } catch (e) {
        try {
            const src = fs.readFileSync(f, 'utf8');
            const m = src.match(/MAP\s*=\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/);
            if (m) g.map = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
            const sy = src.match(/STRIP_Y\s*=\s*(\d+)/);
            if (sy) g.stripY = +sy[1];
        } catch (x) { /* the defaults */ }
    }
    return g;
}

/* ---------------- renderer daemon (kit/renderd/PROTOCOL.md), ticks, touch, the controller (from kit/tools/emu.js) ---------------- */
const M = { HELLO: 1, PLACE: 2, SHOW: 3, ATLAS: 4, RAMP: 5, LAYER: 6, FRAME: 7, DROP_LAYER: 8, M9: 9, M10: 10, DROP_IMAGE: 11, FPS: 12, VIDEO: 13, DROP_VIDEO: 14 };
const E = { READY: 101, TICK: 102, ERROR: 103, STATS: 104, CCU: 105, TOUCH: 105, CLOSED: 106 };
const X = { MODE: 0x4d520001, GRAB: 0x4d520002, PIXMAP: 0x4d520003, PIXELS: 0x4d520004, PALETTE: 0x4d520005, READY: 0x4d520101, STATE: 0x4d520102, CCU: 0x4d520103 };
// shortest payload per type (bytes), as kit/renderd/src/main.c checks them; shorter: "bad message"
const MIN = { 2: 28, 3: 4, 4: 12, 5: 8, 6: 12, 8: 4, 9: 4, 10: 4, 11: 4, 12: 4, 13: 8, 14: 4 };
MIN[X.MODE] = 4; MIN[X.GRAB] = 4; MIN[X.PIXMAP] = 20; MIN[X.PIXELS] = 4; MIN[X.PALETTE] = 4 + 768;
const SCREEN = { w: 1920, h: 720 };
const BACK_COL = { w: 84, h: 530, head: 76 };   // the HMI's home (in its strip) and back arrow column: must match display.js HMI.left / colEnd / status.h
const T0 = Date.now();
let R = null;                                   // the app's connection
let pageFps = 60;
// late: no tick 200 ms after a frame; stalled: the pages do not paint (frames count as drawn when they come);
// reading: a stalled frame waits for the pages to take it; pageAt: the last page tick (ms)
const Tick = { busy: false, want: false, n: 0, last: 0, timer: null, headless: null, late: null, stalled: false, reading: null, pageAt: 0 };
/** a new app connection: no timer of the old one ticks it */
function tickReset() {
    clearTimeout(Tick.late); clearTimeout(Tick.reading); clearImmediate(Tick.reading);
    Object.assign(Tick, { busy: false, want: false, late: null, stalled: false, reading: null, pageAt: 0 });
}

/** A daemon->client message: u32 words (any number: written as its low 32 bits) or a raw payload. */
function msg(type, words, raw) {
    const p = raw || Buffer.alloc(words.length * 4);
    if (!raw) words.forEach((w, i) => p.writeUInt32LE((Number(w) || 0) >>> 0, i * 4));
    const b = Buffer.alloc(8 + p.length + ((4 - (p.length & 3)) & 3));
    b.writeUInt32LE(type, 0); b.writeUInt32LE(b.length - 8, 4); p.copy(b, 8);
    return b;
}
let connSent = '';
const connInfo = () => (R ? { t: 'conn', on: true, app: R.app, dialect: R.dialect || 'undecided', shown: R.visible, grab: R.grab, claims: R.claims.length, place: R.place, fps: R.fps } : { t: 'conn', on: false });
/** the renderer's view to the pages, when it changed */
const connChanged = () => { const c = connInfo(), j = JSON.stringify(c); if (j !== connSent) { connSent = j; toPages(c); } };
const toApp = (b) => { if (R && !R.sock.destroyed) R.sock.write(b); };
class Bad extends Error {}

const daemon = net.createServer((sock) => {
    if (R) { R.sock.destroy(); R = null; }
    const c = R = {
        sock, id: App.childId || appId, app: '?', dialect: null, visible: false, onScreen: false, grab: false, claims: [], place: null, fps: 0,
        cache: { hello: null, mode: null, place: null, claim: null, grab: null, fps: null, show: null, frame: null, res: new Map() },
        parts: [], n: 0, need: 8, gesture: null,
    };
    tickReset();
    toPages({ t: 'reset', app: c.id });
    const drop = (why) => { appLog('error', 'renderer: bad message (' + why + '), connection closed'); sock.destroy(); };
    sock.on('data', (d) => {
        if (R !== c || sock.destroyed) return;
        c.parts.push(d); c.n += d.length;
        if (c.n < c.need) return;
        const b = c.parts.length === 1 ? c.parts[0] : Buffer.concat(c.parts, c.n);
        let o = 0, bad = null;
        while (b.length - o >= 8) {
            const type = b.readUInt32LE(o), len = b.readUInt32LE(o + 4);
            if (len > MAX_MSG) { bad = len + ' bytes'; break; }
            if (b.length - o < 8 + len) break;
            try { handle(c, type, b.slice(o + 8, o + 8 + len), b.slice(o, o + 8 + len)); } catch (e) { bad = 'type ' + type + ': ' + (e instanceof Bad ? e.message : e); break; }
            o += 8 + len;
        }
        if (o) toPages(b.slice(0, o));
        if (bad) { drop(bad); return; }
        const rest = b.slice(o);
        c.parts = rest.length ? [Buffer.from(rest)] : []; c.n = rest.length;
        // the size is known from the header: a message over the limit ends the connection before it is buffered
        c.need = rest.length >= 8 ? 8 + rest.readUInt32LE(4) : 8;
        if (c.need > 8 + MAX_MSG) drop(rest.readUInt32LE(4) + ' bytes');
    });
    sock.on('error', () => {});
    sock.on('close', () => { if (R === c) { R = null; connChanged(); } });
});
daemon.on('error', (e) => { console.error('emu: renderer socket: ' + e.message); cleanup(1); });

/** One client->renderer message: what the daemon must know (dialect, placement, claims, grab, ticks) and the replay cache. Throws Bad for a malformed one. */
function handle(c, type, p, whole) {
    const C = c.cache, u = (i) => p.readUInt32LE(i * 4);
    if (MIN[type] && p.length < MIN[type]) throw new Bad(p.length + ' bytes');
    const res = (key, keep) => { C.res.delete(key); if (keep) C.res.set(key, [whole]); };
    switch (type) {
    case M.HELLO: {
        const f = p.toString('utf8').split('\0');
        c.app = f[0];
        C.hello = whole;
        c.touch = Touch.on;                 // (what this connection was offered: the app reads it here only)
        if (f.slice(1).indexOf('proto=mgu-render/1') >= 0) {
            c.dialect = 'native';
            // version 1, layer mode, caps: touch routing (if on) | controller gate | pixmaps; no embed; app area; pixmap side; 60 Hz
            toApp(msg(X.READY, [1, 1, (c.touch ? 1 : 0) | 2 | 8, 0, 0, 0, 0, 108, 82, 1790, 638, 2048, 60000]));
        }
        toApp(msg(E.READY, [4, SCREEN.w, SCREEN.h, c.touch ? 1 : 0]));
        appLog('info', 'renderer: ' + c.app + ' connected' + (c.dialect ? ', mgu-render/1' : ''));
        connChanged();
        break;
    }
    case X.MODE: C.mode = whole; if (c.place) wantTick(); break;
    case M.PLACE: {
        const pl = { x: p.readInt32LE(0), y: p.readInt32LE(4), w: p.readInt32LE(8), h: p.readInt32LE(12), s: p.readFloatLE(16), ox: p.readFloatLE(20), oy: p.readFloatLE(24) };
        if (pl.w < 1 || pl.h < 1 || pl.w > 4096 || pl.h > 4096 || !(pl.s > 0.05 && pl.s < 8)) throw new Bad('placement');
        // a new size or scale: the renderer drops the app's resources (the app sends them again)
        if (!c.place || pl.w !== c.place.w || pl.h !== c.place.h || pl.s !== c.place.s) C.res.clear();
        c.place = pl; C.place = whole;
        wantTick();
        break;
    }
    case M.SHOW:
        c.visible = !!u(0); C.show = whole;
        if (c.visible) wantTick(); else state(c);
        connChanged();
        break;
    case M.ATLAS: if (12 + u(1) * u(2) > p.length || u(1) > 4096 || u(2) > 4096) throw new Bad('atlas size'); res('atlas:' + u(0), true); break;
    case M.RAMP: if (u(1) > 64 || p.length < 8 + u(1) * 4) throw new Bad('ramp'); res('ramp:' + u(0), true); break;
    case M.LAYER: res('layer:' + u(0), true); break;
    case M.DROP_LAYER: res('layer:' + u(0), false); break;
    case M.FRAME:
        C.frame = whole;
        Tick.busy = true; wantTick();
        // nobody watching: take frames at 10 a second
        if (!pages.size && !Tick.headless) Tick.headless = setTimeout(() => { Tick.headless = null; drawn(); }, 100);
        else if (pages.size) late();
        break;
    case M.M9: {
        // upstream IMAGE or IterioDev's CLAIM (src/dialect.c)
        const w = p.length >= 12 ? u(1) : 0, h = p.length >= 12 ? u(2) : 0;
        if (!c.dialect) c.dialect = w >= 1 && w <= 4096 && h >= 1 && h <= 4096 && p.length >= 12 + w * h * 4 ? 'upstream' : 'iterio';
        if (c.dialect === 'upstream') {
            if (w < 1 || h < 1 || w > 4096 || h > 4096 || p.length < 12 + w * h * 4) throw new Bad('image size');
            res('img:' + u(0), true);
            break;
        }
        const n = u(0);
        if (n > 16 || p.length < 4 + n * 16) throw new Bad('claims');
        c.claims = [];
        for (let i = 0; i < n; i++) c.claims.push({ x: p.readFloatLE(4 + i * 16), y: p.readFloatLE(8 + i * 16), w: p.readFloatLE(12 + i * 16), h: p.readFloatLE(16 + i * 16) });
        C.claim = whole;
        connChanged();
        break;
    }
    case M.M10:
        if (!c.dialect) c.dialect = p.length === 4 ? 'upstream' : 'iterio';
        if (c.dialect === 'upstream') { c.grab = !!u(0); C.grab = whole; connChanged(); break; }
        if (p.length < 12 || u(1) < 1 || u(2) < 1 || u(1) > 1024 || u(2) > 1024 || p.length !== 12 + u(1) * u(2) * 4) throw new Bad('image size');
        res('img:' + u(0), true);
        break;
    case M.DROP_IMAGE: if (!c.dialect) c.dialect = 'iterio'; res('img:' + u(0), false); break;
    case M.FPS: if (c.dialect !== 'upstream') { c.fps = Math.min(1000, u(0)); C.fps = whole; connChanged(); } break;
    case M.VIDEO: if (c.dialect !== 'upstream') res('video:' + u(0), true); break;
    case M.DROP_VIDEO: res('video:' + u(0), false); break;
    case X.GRAB: c.grab = !!u(0); C.grab = whole; connChanged(); break;
    case X.PIXMAP: {
        const w = u(1), h = u(2), f = u(3);
        // (a bad size or format is the renderer's ERROR, not a dropped client: nothing to keep then)
        if (w < 1 || h < 1 || w > 2048 || h > 2048 || f < 1 || f > 3) { res('img:' + u(0), false); break; }
        C.res.delete('img:' + u(0));
        C.res.set('img:' + u(0), { pixmap: whole, w, h, bpp: f === 3 ? 1 : 4, px: null });
        break;
    }
    case X.PIXELS: pixels(C.res.get('img:' + u(0)), p); break;
    case X.PALETTE: res('pal:' + u(0), true); break;
    default: break;
    }
}

/**
 * X_PIXELS: the rects written into a copy of the pixmap here, so the replay is one full write
 * however many updates came (memory: the pixmap's size, at most 16 MiB).
 */
function pixels(e, p) {
    if (p.length < 8) throw new Bad('pixel rects');
    const n = p.readUInt32LE(4);
    if (n < 1 || n > 64 || p.length < 8 + n * 16) throw new Bad('pixel rects');
    if (!e || !e.pixmap) return;                    // no such pixmap: the renderer's ERROR
    if (!e.px) e.px = Buffer.alloc(e.w * e.h * e.bpp);
    let o = 8 + n * 16;
    for (let i = 0; i < n; i++) {
        const x = p.readUInt32LE(8 + i * 16), y = p.readUInt32LE(12 + i * 16), w = p.readUInt32LE(16 + i * 16), h = p.readUInt32LE(20 + i * 16);
        const row = w * e.bpp;
        if (x + w > e.w || y + h > e.h || o + row * h > p.length) throw new Bad('pixel rect');
        for (let r = 0; r < h; r++) p.copy(e.px, ((y + r) * e.w + x) * e.bpp, o + r * row, o + (r + 1) * row);
        o += row * h;
    }
}

/** A page that connects now (or made a new renderer) gets the connection so far: HELLO, placement, the resources, the last frame. */
function replay(ws) {
    ws.send(connInfo());
    if (!R || !R.cache.hello) return;
    const C = R.cache, list = [C.hello, C.mode, C.place];
    C.res.forEach((v, k) => {
        if (Array.isArray(v)) { list.push.apply(list, v); return; }
        list.push(v.pixmap);
        if (v.px) {
            const head = Buffer.alloc(24);
            head.writeUInt32LE(Number(k.slice(4)), 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(v.w, 16); head.writeUInt32LE(v.h, 20);
            list.push(msg(X.PIXELS, null, Buffer.concat([head, v.px])));
        }
    });
    list.push(C.claim, C.grab, C.fps, C.show, C.frame);
    ws.send({ t: 'reset', app: R.id });
    ws.send(Buffer.concat(list.filter(Boolean)));
}

/** X_STATE (native): mode, on screen (shown with a frame drawn), in front (always: no foreground gate here). */
function state(c) {
    const on = c.visible && !!c.cache.frame;
    if (on === c.onScreen) return;
    if (c.dialect === 'native') toApp(msg(X.STATE, [1, on ? 1 : 0, 1]));
    c.onScreen = on;
    connChanged();
}

/* TICK: the app sends its next frame when the last one is drawn (the page's {t:'tick'}), at most fps a second */
function wantTick() { Tick.want = true; pump(); }
/**
 * A page ticks from requestAnimationFrame, which a page that is not painted (a background tab, a hidden pane, a
 * minimised window) does not run: no tick 200 ms after a frame, and the frames count as drawn when they come (pump
 * keeps the FPS cap, and a frame still queued to a page holds the next: the pages' reading paces it) until a page
 * ticks at a refresh rate again (two ticks within 100 ms: a hidden pane's stray tick about once a second is not).
 */
function late() {
    if (Tick.stalled) { afterRead(); return; }
    if (!Tick.late) Tick.late = setTimeout(() => { Tick.late = null; if (Tick.busy && pages.size) { Tick.stalled = true; drawn(); } }, 200);
}
/**
 * Stalled: the frame counts as drawn once nothing is queued to a page (written to the socket; polled, as 'drain'
 * comes only after a write over the socket's high-water mark). One wait at a time; a page that goes holds nothing.
 */
function afterRead() {
    if (Tick.reading) return;
    const poll = () => {
        Tick.reading = null;
        if (!Tick.stalled || !Tick.busy) return;
        if (Array.from(pages).some((x) => x.open && x.sock.writableLength)) { Tick.reading = setTimeout(poll, 2); return; }
        drawn();
    };
    Tick.reading = setImmediate(poll);
}
function drawn() { Tick.busy = false; if (R) state(R); pump(); }
function pump() {
    // (no ticks for a hidden app: it is not on screen, as when the user left it for the app picker)
    if (!R || !R.visible || !Tick.want || Tick.busy || Tick.timer) return;
    const caps = [pageFps, R.fps].filter((x) => x > 0), cap = caps.length ? Math.min.apply(null, caps) : 0;
    const wait = cap ? Tick.last + 1000 / cap - Date.now() : 0;
    if (wait > 1) { Tick.timer = setTimeout(() => { Tick.timer = null; pump(); }, wait); return; }
    Tick.want = false; Tick.last = Date.now();
    toApp(msg(E.TICK, [++Tick.n, Date.now() - T0]));
}

/* touch: a gesture that starts inside a claim is the app's (TOUCH, logical px); one outside goes to the HMI, which
   hides a claiming app (CLOSED). Without touch routing every gesture is the HMI's. The HMI's part: home and back in
   its column; a tap released elsewhere goes to the app process, which presses the HMI bar button under it (if any). */
function touch(m) {
    const c = R, x = Number(m.x), y = Number(m.y), ph = Number(m.phase);
    if (!isFinite(x) || !isFinite(y) || [1, 2, 3].indexOf(ph) < 0) return;
    if (ph === 1) {
        let mine = false;
        if (c && c.touch && c.visible && c.place && c.claims.length) {
            const lx = (x - c.place.x - c.place.ox) / c.place.s, ly = (y - c.place.y - c.place.oy) / c.place.s;
            mine = c.claims.some((r) => lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h);
            if (!mine) {
                // hidden until the app shows itself again: a page that connects meanwhile draws nothing
                toApp(msg(E.CLOSED, [])); c.visible = false; c.cache.show = msg(M.SHOW, [0]); state(c); connChanged();
            }
        }
        // the HMI's own column (the app's surface leaves it see-through): home at the top, back below
        const col = x < BACK_COL.w && y < BACK_COL.h;
        if (col) {
            const a = y < BACK_COL.head ? 'home' : 'back';
            toChild({ t: 'hmi', a }); appLog('info', 'HMI: ' + a);
        }
        // (with touch routing too: a tap outside the claims is the HMI's, so it presses an HMI bar button there, as on the car)
        Hmi.down = mine || col ? null : { x, y };
        if (c) c.gesture = mine;
    }
    if (ph === 3 && Hmi.down) {
        const d = Hmi.down;
        Hmi.down = null;
        if (Math.abs(x - d.x) < 30 && Math.abs(y - d.y) < 30) toChild({ t: 'tap', x: d.x, y: d.y });
    }
    if (!c || !c.gesture || !c.place) return;
    const lx = (x - c.place.x - c.place.ox) / c.place.s, ly = (y - c.place.y - c.place.oy) / c.place.s;
    const b = Buffer.alloc(12);
    b.writeUInt32LE(ph, 0); b.writeFloatLE(lx, 4); b.writeFloatLE(ly, 8);
    toApp(msg(E.TOUCH, null, b));
    if (ph === 3) c.gesture = false;
}
const Hmi = { down: null };          // a gesture the HMI has (where it went down)

/* the iDrive controller: FrontCCU state (knob counter, press, push). To the app as X_CCU / CCU while it grabs (and is
   shown); the FrontCCU signal always; the HMI moves its focus when nobody grabs */
const Ccu = { seq: 0, knob: 0, pb: 0, df: 0 };
const TILT = { N: 1, E: 4, S: 7, W: 10 };       // FrontCCU deflection, short push (display.js TILT, doom controls.js DEFL)
function ccu(m) {
    if (m.turn) {
        let n = Math.max(-64, Math.min(64, Math.round(Number(m.turn)) || 0));
        while (n) { const s = Math.max(-16, Math.min(16, n)); n -= s; Ccu.knob = (Ccu.knob + s) & 0xffff; ccuSend(); }
        return;
    }
    if (m.press !== undefined) Ccu.pb = m.press ? 1 : 0;
    if (m.tilt !== undefined) Ccu.df = TILT[m.tilt] || 0;
    ccuSend();
}
function ccuSend() {
    Ccu.seq = (Ccu.seq + 1) & 255;
    const grabbed = !!(R && R.grab && R.visible);
    if (grabbed) {
        const b = Buffer.alloc(8);
        b[0] = Ccu.seq; b.writeUInt16BE(Ccu.knob, 1); b[3] = Ccu.pb; b[4] = Ccu.df;
        toApp(msg(R.dialect === 'native' ? X.CCU : E.CCU, null, b));
    }
    toChild({ t: 'ccu', grabbed, ev: { seq: Ccu.seq, knob: Ccu.knob, pb: Ccu.pb, df: Ccu.df } });
}

// STATS once a second: the page's renderer numbers (the panel's figures are the page's own, in one window)
let gstats = null;
const u32 = (x) => Math.max(0, Math.min(0xffffffff, Math.round(Number(x)) || 0));
setInterval(() => {
    try {
        if (R && R.visible && gstats) toApp(msg(E.STATS, [u32(gstats.fps), u32(gstats.avgMs * 1000), u32(gstats.maxMs * 1000)].concat(R.dialect === 'native' ? [0] : [])));
    } catch (e) { console.error('emu: stats: ' + e); }
}, 1000).unref();


/* ---------------- the page's messages ---------------- */
function onPage(ws, m) {
    switch (m.t) {
    case 'tick': {
        // (stalled: a page that paints again ticks twice within 100 ms; a lone tick leaves the server's pace as it is)
        const now = Date.now();
        if (!Tick.stalled || now - Tick.pageAt < 100) { clearTimeout(Tick.late); Tick.late = null; Tick.stalled = false; }
        Tick.pageAt = now;
        if (Tick.busy) drawn();
        break;
    }
    case 'fps': pageFps = Math.max(0, Math.min(1000, Number(m.n) || 0)); pump(); break;
    case 'gstats': gstats = { fps: m.fps, avgMs: m.avgMs, maxMs: m.maxMs }; break;
    case 'touch': touch(m); break;
    case 'ccu': ccu(m); break;
    case 'hmi':
        if (['back', 'home', 'open'].indexOf(m.a) < 0) break;
        appLog('info', 'HMI: ' + m.a + (m.screen ? ' ' + m.screen : ''));
        if (m.a === 'open') {
            App.openNext = false;                       // (the app shown now is the one asked for)
            if (!App.child) { App.openNext = true; if (!App.building && appId) build(); break; }   // crashed: start it, opened
        }
        toChild({ t: 'hmi', a: m.a, screen: m.screen && String(m.screen) });
        break;
    case 'click': toChild({ t: 'click', id: String(m.id) }); break;
    case 'set': toChild({ t: 'set', k: String(m.k), v: m.v }); break;
    // another app (its tile in the app list): opened when it has started
    case 'app': if (REG[m.id] && m.id !== appId) { appId = m.id; App.openNext = true; build(); } else if (m.id === appId && !App.child && !App.building) { App.openNext = true; build(); } break;
    case 'restart': if (appId) build(); break;
    // the car (demo/preload.js gives it to every app): the automatic drive or the panel's values
    case 'vehmode': Veh.mode = m.mode === 'manual' ? 'manual' : 'auto'; if (Veh.mode === 'auto') Veh.auto = { phase: 'idle', t: 0 }; toPages(vehMsg()); break;
    case 'vehset':
        if (m.v && typeof m.v === 'object') {
            if (!m.keep) Veh.mode = 'manual';             // (keep: the drive mode, set while the drive goes on)
            Object.keys(m.v).forEach((k) => {
                if (!Object.prototype.hasOwnProperty.call(VEH0, k)) return;
                const x = m.v[k];
                if (typeof VEH0[k] === 'number' && isFinite(Number(x))) Veh.v[k] = Number(x);
                else if (typeof VEH0[k] === 'string' && typeof x === 'string' && x.length < 40) Veh.v[k] = x;
            });
            if (/^[DSM]$/.test(Veh.v.stage) && !(Veh.v.gear >= 1)) Veh.v.gear = 1;
            if (!/^[DSM]$/.test(Veh.v.stage)) Veh.v.gear = 0;
            vehSend();
            pages.forEach((w) => { if (w !== ws) w.send(vehMsg()); });
        }
        break;
    case 'extra':
        if (Object.prototype.hasOwnProperty.call(EXTRA0, m.k) && typeof m.v === typeof EXTRA0[m.k]) {
            if (m.k === 'indicator' && ['off', 'left', 'right', 'both'].indexOf(m.v) < 0) break;
            Veh.extra[m.k] = m.v; writeWaze(); vehSend(); toPages(vehMsg());
        }
        break;
    // the page's renderer found a malformed message: end the connection as the car's daemon does
    case 'drop': if (R) { appLog('error', 'renderer: bad message (' + String(m.why).slice(0, 200) + '), connection closed'); R.sock.destroy(); } break;
    // what the car's renderer sends the app as ERROR (an upload past its limits, a bad pixmap, ...)
    case 'rerror': if (R) toApp(msg(E.ERROR, null, Buffer.from(String(m.s).slice(0, 256)))); break;
    case 'replay': replay(ws); break;
    // the renderer offers touch routing or not: the app reads that when it connects, so it reconnects now
    case 'touch-routing':
        if (!!m.on === Touch.on) break;
        Touch.on = !!m.on;
        appLog('info', 'demo: touch routing ' + (Touch.on ? 'on (the kit runs the screen)' : 'off (the slim bar over the HMI\'s buttons)'));
        toPages({ t: 'touchmode', on: Touch.on });
        toChild({ t: 'reconnect' });
        break;
    default: break;
    }
}

/* ---------------- the app on the centre display: build, child process, live reload ---------------- */
const App = { closed: true, opened: false, openNext: false, child: null, childId: null, gen: 0, exiting: null, deferred: null, loading: false, dirs: {},
    status: { t: 'status', s: 'idle', app: null, text: '' }, log: [], spec: null, values: null, stack: [], soft: null, building: false, again: false };
function appLog(l, s) {
    const lines = String(s).replace(/\s+$/, '').split('\n').map((x) => [l, x]);
    App.log.push.apply(App.log, lines);
    if (App.log.length > 2000) App.log.splice(0, App.log.length - 1500);
    toPages({ t: 'log', lines });
    if (l === 'error' || /^(demo|renderer):/.test(s)) console.log((l === 'error' ? '! ' : '  ') + lines.map((x) => x[1]).join('\n    '));
}
function setStatus(s, text, id) { App.status = { t: 'status', s, app: id || appId, text: text || '' }; toPages(App.status); console.log('demo: ' + (id || appId) + ' ' + s); }
const toChild = (m) => { if (App.child && App.child.connected) App.child.send(m); };

function build() {
    if (!appId) return;
    // (also not while a new app loads its modules: the build would rewrite them under it)
    if (App.building || App.loading) { App.again = true; return; }
    const id = appId, t0 = Date.now();
    App.building = true;
    setStatus('building', '', id);
    // one process an app: its background copy goes first
    bgStop(id).then(() => queuedBuild(id)).then((r) => {
        App.building = false;
        if (App.again || id !== appId) { App.again = false; build(); return; }
        if (r.error) {
            appLog('error', 'demo: ' + id + ' did not build\n' + r.error);
            // a newly chosen app that does not build: the one running stays the current app
            if (App.childId && id !== App.childId && App.child) { appId = App.childId; App.openNext = false; }
            setStatus('build-error', r.error, id);
            if (App.deferred && !App.child) start(App.deferred);
            bgSync();
            return;
        }
        App.dirs[id] = r.dir;
        appLog('info', 'demo: built ' + id + ' in ' + (Date.now() - t0) + ' ms');
        start(id);
    });
}

/** The running app goes; cb once it has exited (an app on its way out is waited for, whoever asked first). */
function stop(cb) {
    const ch = App.child;
    App.child = null;
    if (ch && ch.exitCode === null && ch.signalCode === null) {
        App.exiting = new Promise((res) => {
            const k = setTimeout(() => ch.kill('SIGKILL'), 1500);
            ch.once('exit', () => { clearTimeout(k); res(); });
        });
        ch.kill('SIGTERM');
    }
    (App.exiting || Promise.resolve()).then(cb);
}

/** The built app in a new child on the renderer's socket (the newest start wins). */
function start(id) {
    const gen = ++App.gen;
    stop(() => {
        if (gen !== App.gen || App.child) return;
        if (App.building) { App.deferred = id; return; }
        App.deferred = null;
        setStatus('starting', '', id);
        App.stack = []; App.soft = null;
        toPages({ t: 'soft', png: null });              // (the old app's picture in the HMI goes)
        // the user left the app (the app list shows): a rebuilt app starts without opening; a newly chosen app opens
        App.opened = false;
        const ch = App.child = forkApp(id, App.dirs[id], true, App.closed && !App.openNext);
        App.openNext = false;
        App.childId = id; App.loading = true;
        Owner.set(id, ch);
        bgSync();                                       // (the app that was in front goes on in the background, if it starts with the car)
        const loaded = () => { if (App.child !== ch && App.child) return; App.loading = false; if (App.again) { App.again = false; build(); } };
        const lines = (l) => (d) => { if (App.child === ch) String(d).split('\n').filter((x) => x.trim()).forEach((x) => appLog(l, x)); };
        ch.stdout.on('data', lines('info'));
        ch.stderr.on('data', lines('error'));
        ch.on('error', (e) => appLog('error', 'demo: app process: ' + e.message));
        ch.on('message', (m) => {
            if (m.t === 'cluster') { onCluster(id, ch, m); return; }
            if (App.child !== ch) return;
            if (m.t === 'log') appLog(m.l, m.s);
            else if (m.t === 'loaded') loaded();
            else if (m.t === 'spec') {
                App.spec = m.spec; App.values = m.values;
                toPages({ t: 'spec', spec: m.spec, values: m.values });
                setStatus('running', '', id);
                vehSendTo(ch);
            } else if (m.t === 'settings') { App.values = m.values; toPages(m); }
            else if (m.t === 'screens') {
                // closed: the app's last screen went (BACK, HOME) - the HMI's app list shows until it is opened again
                App.stack = m.stack;
                if (m.stack.length) { App.opened = true; App.closed = false; } else if (App.opened) App.closed = true;
                toPages({ t: 'screens', stack: m.stack, closed: App.closed });
            }
            else if (m.t === 'soft') { App.soft = m.png; toPages({ t: 'soft', png: m.png }); }
            else if (m.t === 'focus' || m.t === 'note') toPages(m);
        });
        ch.on('exit', (code, sig) => {
            if (Owner.get(id) === ch) { Owner.delete(id); clusterGone(id); }
            if (App.child === ch || !App.child) loaded();
            if (App.child !== ch) return;
            App.child = null;
            setStatus('exited', 'exit ' + (sig || code), id);
            appLog('error', 'demo: the app exited (' + (sig || 'code ' + code) + '); save a file or press Restart');
        });
    });
}


/* ---------------- the apps that start with the car: always running, in the background ---------------- */
const Bg = new Map();          // id -> { child, building, stopping, error }
const Owner = new Map();       // id -> the process whose cluster layers count (one process an app)
const isFront = (id) => id === appId || id === App.childId;
function bgSync() {
    listApps().forEach((id) => {
        const want = REG[id].auto && !isFront(id), b = Bg.get(id);
        if (want && !b) bgStart(id);
        else if (!want && b) bgStop(id);
    });
    toPages(bgMsg());
}
function bgStart(id) {
    const b = { child: null, building: true, stopping: false, error: false };
    Bg.set(id, b);
    queuedBuild(id).then((r) => {
        b.building = false;
        if (Bg.get(id) !== b || b.stopping) return;
        if (r.error) { b.error = true; appLog('error', 'demo: ' + id + ' (background) did not build\n' + r.error); toPages(bgMsg()); return; }
        const ch = b.child = forkApp(id, r.dir, false, true);
        Owner.set(id, ch);
        const errLines = (d) => String(d).split('\n').filter((x) => x.trim()).forEach((x) => appLog('error', '[' + id + '] ' + x));
        ch.stdout.on('data', () => {});
        ch.stderr.on('data', errLines);
        ch.on('error', (e) => appLog('error', '[' + id + '] ' + e.message));
        ch.on('message', (m) => {
            if (m.t === 'cluster') onCluster(id, ch, m);
            else if (m.t === 'log' && m.l === 'error') appLog('error', '[' + id + '] ' + m.s);
            else if (m.t === 'spec') vehSendTo(ch);
        });
        ch.on('exit', (code, sig) => {
            if (Owner.get(id) === ch) { Owner.delete(id); clusterGone(id); }
            if (Bg.get(id) === b) {
                Bg.delete(id);
                if (!b.stopping) { appLog('warn', 'demo: ' + id + ' (background) exited (' + (sig || code) + '): again in 3 s'); setTimeout(bgSync, 3000); }
            }
            toPages(bgMsg());
        });
        toPages(bgMsg());
    });
}
/** the background copy goes (resolves once it has exited) */
function bgStop(id) {
    const b = Bg.get(id);
    if (!b) return Promise.resolve();
    b.stopping = true;
    Bg.delete(id);
    const ch = b.child;
    toPages(bgMsg());
    if (!ch || ch.exitCode !== null || ch.signalCode !== null) return Promise.resolve();
    return new Promise((res) => {
        const k = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) { /* gone */ } }, 1500);
        ch.once('exit', () => { clearTimeout(k); res(); });
        ch.kill('SIGTERM');
    });
}
function bgMsg() {
    const apps = {};
    listApps().filter((id) => REG[id].auto).forEach((id) => {
        const b = Bg.get(id);
        apps[id] = isFront(id) ? 'front' : !b ? 'off' : b.error ? 'error' : b.building ? 'building' : 'running';
    });
    return { t: 'bg', apps };
}

/* ---------------- the car: one for every app (demo/preload.js: kit/sim.js and data.js give these) ---------------- */
// (the cluster demo's car: tools/cluster_demo.html in akakingj/myapp-cluster)
const VEH0 = { pedal: 0, throttle: 3, speed: 0, rpm: 750, gear: 0, stage: 'P', driveMode: 'COMFORT', boostActual: -0.6, torque: 20, timing: 10, hpfp: 60, lpfp: 5.2,
    oil: 96, coolant: 90, gearbox: 78, iat: 31, outside: 20, fuelPct: 55, frange: 520, steer: 0, yaw: 0, gLat: 0, gLong: 0, tyreP: 2.5, tyreT: 25, soc: 70, kw: 0, battTemp: 26, erange: 30 };
const EXTRA0 = { waze: 'cluster', hudPct: 70, night: false, indicator: 'off' };   // indicator: off | left | right | both (hazards)
const Veh = { mode: 'auto', v: Object.assign({}, VEH0), extra: Object.assign({}, EXTRA0), auto: { phase: 'idle', t: 0 } };
try { const s = JSON.parse(fs.readFileSync(path.join(DATA, 'car.json'), 'utf8')); Object.assign(Veh.extra, s.extra || {}); if (s.mode === 'manual') { Veh.mode = 'manual'; Object.assign(Veh.v, s.v || {}); } } catch (e) { /* the defaults */ }
const KMH_PER_1000 = [0, 9, 15, 23, 31, 39, 48, 57, 66];
function stepAuto(dt) {
    const a = Veh.auto, d = Veh.v;
    a.t += dt;
    const near = (v, to, rate) => v + Math.max(-rate * dt, Math.min(rate * dt, to - v)), prev = d.speed;
    if (a.phase === 'idle') {
        Object.assign(d, { stage: 'P', gear: 0, speed: 0 }); d.rpm = near(d.rpm, 750, 3000); d.boostActual = near(d.boostActual, -0.6, 2); d.torque = near(d.torque, 20, 300); d.pedal = 0; d.throttle = 3;
        if (a.t > 2) { Veh.auto = { phase: 'accel', t: 0 }; d.stage = 'D'; d.gear = 1; }
    } else if (a.phase === 'accel') {
        d.rpm = Math.min(6300, d.rpm + 2600 * dt / Math.max(1, d.gear * 0.55)); d.speed = d.rpm / 1000 * KMH_PER_1000[d.gear];
        d.boostActual = near(d.boostActual, 1.15, 3); d.torque = near(d.torque, 350, 900); d.pedal = near(d.pedal, 100, 400); d.throttle = near(d.throttle, 100, 300); d.timing = near(d.timing, 6, 20); d.hpfp = near(d.hpfp, 250, 400);
        if (d.rpm >= 6200 && d.gear < 8) { d.gear++; d.rpm = d.speed / KMH_PER_1000[d.gear] * 1000; }
        if (d.speed >= 150) Veh.auto = { phase: 'cruise', t: 0 };
    } else if (a.phase === 'cruise') {
        while (d.gear < 8 && d.speed / KMH_PER_1000[d.gear] * 1000 > 2600) d.gear++;
        d.speed = near(d.speed, 120, 15); d.rpm = d.speed / KMH_PER_1000[d.gear] * 1000;
        d.boostActual = near(d.boostActual, 0.05, 2); d.torque = near(d.torque, 90, 600); d.pedal = near(d.pedal, 22, 200); d.throttle = near(d.throttle, 14, 200); d.timing = near(d.timing, 24, 20); d.hpfp = near(d.hpfp, 90, 300);
        d.steer = 60 * Math.sin(a.t * 1.3); d.yaw = 6 * Math.sin(a.t * 1.3); d.gLat = 0.35 * Math.sin(a.t * 1.3);
        if (a.t > 5) Veh.auto = { phase: 'brake', t: 0 };
    } else {
        d.speed = Math.max(0, d.speed - 32 * dt);
        while (d.gear > 1 && d.speed / KMH_PER_1000[d.gear] * 1000 < 1200) d.gear--;
        d.rpm = Math.max(750, d.speed / KMH_PER_1000[d.gear] * 1000);
        d.boostActual = near(d.boostActual, -0.65, 2); d.torque = near(d.torque, 0, 600); d.pedal = 0; d.throttle = 2; d.timing = near(d.timing, 14, 20);
        d.steer = near(d.steer, 0, 120); d.yaw = near(d.yaw, 0, 20); d.gLat = near(d.gLat, 0, 1);
        if (d.speed <= 0) Veh.auto = { phase: 'idle', t: 0 };
    }
    d.gLong = Math.max(-1.2, Math.min(1.2, ((d.speed - prev) / 3.6 / Math.max(dt, 0.001)) / 9.81));
    const hard = Veh.auto.phase === 'accel';
    d.oil = near(d.oil, hard ? 108 : 98, 0.6); d.coolant = near(d.coolant, hard ? 96 : 90, 0.4);
    d.iat = near(d.iat, hard ? 42 : 30, 1.5); d.tyreT = near(d.tyreT, hard ? 45 : 35, 0.5);
    d.kw = hard ? near(d.kw, 45, 60) : Veh.auto.phase === 'brake' ? near(d.kw, -25, 60) : near(d.kw, 3, 40);
}
/** what each app gets: the panel's values and what follows from them */
function vehOut() {
    const v = Veh.v, P = v.tyreP, T = v.tyreT;
    return Object.assign({}, v, {
        engineOn: v.rpm > 300, boostTarget: Math.max(0, v.boostActual + 0.05), battMin: v.battTemp - 1, battMax: v.battTemp + 1,
        indicator: Veh.extra.indicator, night: !!Veh.extra.night,
        tyres: { p: { FL: P - 0.02, FR: P, RL: P + 0.1, RR: P + 0.08 }, t: { FL: T - 1, FR: T, RL: T + 2, RR: T + 1 } },
    });
}
const vehMsg = () => ({ t: 'veh', mode: Veh.mode, v: Veh.v, extra: Veh.extra, phase: Veh.auto.phase });
const children = () => [App.child].concat(Array.from(Bg.values()).map((b) => b.child)).filter((c) => c && c.connected);
/** the car's own signals, as kit/tools/hu-stub.js feeds them (its "manual" signals: raw values, 20 a second): the apps
 *  see a live car, not their demo drive (the setting "demo" goes to Auto there) */
function sigOf() {
    const v = Veh.v, st = String(v.stage || 'P');
    return { rpm: v.rpm, speed: v.speed, coolant: v.coolant, oil: v.oil, gLong: v.gLong, gLat: v.gLat, torque: v.torque,
        gear: /^[DSM]$/.test(st) ? 'D' + Math.max(1, Math.min(9, v.gear | 0 || 1)) : st === 'R' ? 'R' : st === 'N' ? 'N' : 'P' };
}
function vehSendTo(ch) { if (ch && ch.connected) { try { ch.send({ t: 'veh', v: vehOut() }); ch.send({ t: 'sig', mode: 'manual', v: sigOf() }); } catch (e) { /* gone */ } } }
function vehSend() { const m = { t: 'veh', v: vehOut() }, g = { t: 'sig', mode: 'manual', v: sigOf() }; children().forEach((c) => { try { c.send(m); c.send(g); } catch (e) { /* gone */ } }); }
let vehLast = Date.now(), vehPage = 0, vehSaved = '';
setInterval(() => {
    const now = Date.now(), dt = Math.min(0.2, (now - vehLast) / 1000);
    vehLast = now;
    if (Veh.mode === 'auto') stepAuto(dt);
    vehSend();
    if (pages.size && now - vehPage >= 100) { vehPage = now; toPages(vehMsg()); }
    const keep = JSON.stringify({ mode: Veh.mode, v: Veh.mode === 'manual' ? Veh.v : undefined, extra: Veh.extra });
    if (keep !== vehSaved) { vehSaved = keep; try { fs.writeFileSync(path.join(DATA, 'car.json'), keep); } catch (e) { /* not kept */ } }
}, 50).unref();
/** the Waze map's place (Cluster Info reads waze-on-cluster's status.json to put its panel on the map) */
function writeWaze() {
    const w = Veh.extra.waze, pct = Number(Veh.extra.hudPct) || 70;
    const s = { state: w === 'cluster' ? 'showing' : 'hidden', target: 'map', cluster: w === 'cluster' ? 1 : 0, hud: w === 'hud' ? 1 : 0,
        hud_state: w === 'hud' ? 'showing' : 'hidden', hud_width_pct: pct, hud_x: 0, hud_y: 0 };
    try { fs.writeFileSync(path.join(SHM, 'run', 'waze-on-cluster', 'status.json'), JSON.stringify(s)); } catch (e) { /* the panel goes */ }
}

/* ---------------- the cluster: each app's layers (demo/preload.js), to the page ---------------- */
const Cl = new Map();          // id -> { layers, px: Map(key -> { rev, px }) }
const FS = {};                 // a shader's id -> its GLSL
function onCluster(id, ch, m) {
    if (Owner.get(id) !== ch) return;                 // (a process on its way out)
    const fsNew = m.fsNew || {};
    Object.assign(FS, fsNew);
    let st = Cl.get(id);
    if (!st) { st = { layers: [], px: new Map() }; Cl.set(id, st); }
    const layers = m.layers || [], keys = new Set();
    layers.forEach((L) => { keys.add(L.k); if (L.px) st.px.set(L.k, { rev: L.rev, px: L.px }); });
    st.px.forEach((v, k) => { if (!keys.has(k)) st.px.delete(k); });
    st.layers = layers.map((L) => { if (!L.px) return L; const o = Object.assign({}, L); delete o.px; return o; });
    toPages({ t: 'cluster', app: id, layers, fsNew });
}
/** the layout's map window (Cluster Layouts' map_window.js writes it for Waze on cluster while the layout shows the map): the
 *  page draws the map's place there, over the layout; none while a layout covers the map */
let mapWin = null, mapWinSent = 'x';
function readMapWin() {
    let r = null;
    try {
        const f = path.join(SHM, 'cluster-info', 'map_window.txt'), st = fs.statSync(f);
        const m = /^panel (\d+) (\d+) (\d+) (\d+)/.exec(fs.readFileSync(f, 'utf8'));
        if (m && Date.now() - st.mtimeMs < 3500) r = { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
    } catch (e) { /* none */ }
    mapWin = r;
    const j = JSON.stringify(r);
    if (j !== mapWinSent) { mapWinSent = j; toPages({ t: 'mapwin', r }); }
}
setInterval(readMapWin, 500).unref();
function clusterGone(id) { if (Cl.delete(id)) toPages({ t: 'cluster', app: id, layers: [], fsNew: {} }); }
function clusterReplay(ws) {
    ws.send({ t: 'cluster-reset', fs: FS });
    ws.send({ t: 'mapwin', r: mapWin });
    Cl.forEach((st, id) => ws.send({ t: 'cluster', app: id, fsNew: {}, layers: st.layers.map((L) => { const p = st.px.get(L.k); return p ? Object.assign({}, L, { px: p.px, rev: p.rev }) : L; }) }));
}

/* ---------------- live reload: a save under apps/ or a kit rebuilds the apps it touches ---------------- */
let watchers = [];
/** a file app.json's assets name (the build downloads it into the app's folder) */
function assetOf(root, id, rel) {
    try {
        const a = JSON.parse(fs.readFileSync(path.join(root, 'apps', id, 'app.json'), 'utf8')).assets;
        const f = rel.split(/[/\\]/).slice(1).join('/');
        return Array.isArray(a) && a.some((x) => x && x.file && (f === x.file || f.indexOf(x.file + '.') === 0));
    } catch (e) { return false; }
}
function watchAll() {
    watchers.forEach((w) => w.close());
    const dirs = [[A, 'apps'], [A, 'kit/runtime'], [B, 'apps'], [B, 'shared'], [B, 'kit/runtime'], [C, 'apps'], [C, 'kit/runtime']].filter(([r]) => r).map(([r, d]) => [r, path.join(r, d)]);
    let t = null, hit = new Set(), rescan = false;
    const kick = (root, dir) => (ev, f) => {
        if (f && /(^|[/\\])\.|~$|\.swp$|\.tmp$/.test(String(f))) return;            // editor temp files
        const rel = String(f || '');
        if (path.basename(dir) === 'apps') {
            const id = rel.split(/[/\\]/)[0];
            if (REG[id] && assetOf(root, id, rel)) return;                        // (a file the build downloads, as Doom's WAD: not a change)
            if (!REG[id] || /app\.json$/.test(rel)) rescan = true;
            if (id) hit.add(id);
        } else listApps().filter((id) => REG[id].root === root).forEach((id) => hit.add(id));
        clearTimeout(t);
        t = setTimeout(() => {
            const ids = Array.from(hit); hit = new Set();
            if (rescan) { rescan = false; scanApps(); toPages(hello()); }
            appLog('info', 'demo: changed: ' + ids.filter((id) => REG[id]).join(', '));
            if (appId && ids.indexOf(appId) >= 0) build();
            ids.filter((id) => Bg.has(id)).forEach((id) => { bgStop(id).then(() => bgSync()); });
        }, 300);
    };
    watchers = dirs.filter(([, d]) => fs.existsSync(d)).map(([root, d]) => {
        let w;
        try { w = fs.watch(d, { recursive: true }, kick(root, d)); } catch (e) { w = fs.watch(d, kick(root, d)); }   // (recursive: macOS, Windows, Linux on Node 20+)
        w.on('error', (e) => appLog('warn', 'demo: watching ' + d + ': ' + e.message));
        return w;
    });
}
// (one build of an app at a time: the background copy and the front one share its folder)
const buildQ = {};
const buildOnce = buildApp;
function queuedBuild(id) { const p = (buildQ[id] || Promise.resolve()).then(() => buildOnce(id)); buildQ[id] = p.catch(() => {}); return p; }

/* ---------------- go ---------------- */
function openBrowser(url) {
    const cmd = process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
    exec(cmd, () => {});
}
if (process.platform !== 'win32') { try { fs.unlinkSync(SOCK); } catch (e) { /* none */ } }
let tries = 0;
server.on('listening', () => {
    const url = 'http://127.0.0.1:' + PORT + '/';
    const src = sourcesInfo().map((s) => s.name + (s.missing ? ' (없음)' : ' ' + (s.branch || '') + ' ' + (s.commit || ''))).join(' · ');
    console.log('');
    console.log('MGU demo ' + DEMO_VERSION + '   ' + url);
    console.log('  ' + src);
    console.log('  apps: ' + listApps().length + (B ? '' : '  (the cluster repository was not found: --cluster <folder>)') + (PY ? '' : '  (no Python 3: this repository\'s apps cannot be built)'));
    console.log('  (close this window or Ctrl+C to stop the demo)');
    writeWaze();
    watchAll();
    bgSync();
    if (OPEN) openBrowser(url);
});
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries++ < 20) { PORT++; setHosts(); server.listen(PORT, '127.0.0.1'); return; }
    console.error('demo: ' + e.message); cleanup(1);
});
daemon.listen(SOCK, () => server.listen(PORT, '127.0.0.1'));
function cleanup(code) {
    watchers.forEach((w) => w.close());
    [App.child].concat(Array.from(Bg.values()).map((b) => b.child)).forEach((ch) => { if (ch) { try { ch.kill('SIGKILL'); } catch (e) { /* gone */ } } });
    if (process.platform !== 'win32') { try { fs.unlinkSync(SOCK); } catch (e) { /* gone */ } }
    process.exit(code || 0);
}
process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));
process.on('exit', () => { [App.child].concat(Array.from(Bg.values()).map((b) => b.child)).forEach((ch) => { if (ch) { try { ch.kill('SIGKILL'); } catch (e) { /* gone */ } } }); });
