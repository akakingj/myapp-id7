// demo.js - the MGU demo's page (demo/server.js): the centre display as kit/emu/web/emu-app.js draws it (the app's
// renderer stream through the car's draw engine, gfx/mgu-gfx.js as WebAssembly; mouse = touchscreen, keyboard / wheel =
// iDrive controller; the HMI's app list), the cluster and the HUD the AK Cluster apps draw (WebGL), and the panel: one
// car for every app, the open app's settings. Sections marked "from kit/emu/web/emu-app.js" are that file's.
const W = 1920, H = 720;
const $ = (s) => document.querySelector(s);
const el = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'on') Object.entries(v).forEach(([n, f]) => e.addEventListener(n, f)); else if (k in e) e[k] = v; else e.setAttribute(k, v); });
  kids.forEach((k) => e.append(k));
  return e;
};
let canvas = $('#screen');
const stage = $('#stage');

/* ---------------- the renderer (may not be built yet) (from kit/emu/web/emu-app.js) ---------------- */
// One renderer per app connection run; a new one (fresh canvas, the old one destroyed) for another app, after the
// WebGL context was lost, or when the shared glyph atlases are full (reset() keeps them, as the car's daemon does).
let gfx = null, gfxErr = null, gfxMod = null, gfxApp = null, gfxGen = 0, errSeen = 0;
let pending = null;         // bytes that come while a new renderer is being made wait for it
let awaitReset = false;     // a replay was asked for: bytes before its 'reset' are dropped
const gfxLog = (l) => (s) => addLog([[l, 'renderer: ' + s]]);
async function newGfx(app, replayAfter) {
  const gen = ++gfxGen;
  gfxApp = app; errSeen = 0;
  if (gfx) { try { gfx.destroy(); } catch (e) { /* lost already */ } gfx = null; }
  pending = [];
  const c = el('canvas', { id: 'screen', width: W, height: H });
  canvas.replaceWith(c); canvas = c;
  let g = null;
  try { g = await gfxMod.createGfx(c, { log: gfxLog('debug'), warn: gfxLog('warn'), onLost: () => { if (gen === gfxGen) renew('WebGL context lost'); } }); } catch (e) { gfxErr = e; console.warn('renderer:', e); }
  if (gen !== gfxGen) { if (g) g.destroy(); return; }    // a newer one was asked for meanwhile
  gfx = g;
  const q = pending; pending = null;
  if (replayAfter) { awaitReset = true; send({ t: 'replay' }); } else q.forEach(onBinary);
}
/** a new renderer with the connection so far (the server replays it) */
function renew(why) { addLog([['warn', 'renderer: ' + why + ': starting a new one']]); newGfx(gfxApp, true); }
try { gfxMod = await import('./gfx/mgu-gfx.js'); await newGfx(null); } catch (e) { gfxErr = e; console.warn('renderer:', e); }

/* ---------------- WebSocket ---------------- */
let ws = null;
const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const S = { app: null, spec: null, values: {}, stack: [], closed: true, status: 'connecting', conn: { on: false }, focus: null, titles: {}, auto: [] };
// what arrived from the app (for the stats and "renderer not built")
const rx = { frames: 0, msgs: 0, bytes: 0, types: {}, sawFrame: false, feedErr: null };
const NAMES = { 1: 'HELLO', 2: 'PLACE', 3: 'SHOW', 4: 'ATLAS', 5: 'RAMP', 6: 'LAYER', 7: 'FRAME', 8: 'DROP_LAYER', 9: 'IMAGE/CLAIM', 10: 'GRAB/IMAGE', 11: 'DROP_IMAGE', 12: 'FPS', 13: 'VIDEO', 14: 'DROP_VIDEO',
  0x4d520001: 'X_MODE', 0x4d520002: 'X_GRAB', 0x4d520003: 'X_PIXMAP', 0x4d520004: 'X_PIXELS', 0x4d520005: 'X_PALETTE' };

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { send({ t: 'fps', n: Number($('#fps').value) }); conn(true); };
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') { onText(JSON.parse(e.data)); return; }
    if (awaitReset) return;
    const u8 = new Uint8Array(e.data);
    if (pending) pending.push(u8); else onBinary(u8);
  };
  ws.onclose = () => { conn(false); setStatus('disconnected'); setTimeout(connect, 1000); };
}
function conn(on) { const c = $('#conn'); c.textContent = on ? '연결됨' : '데모 꺼짐'; c.className = 'pill ' + (on ? 'running' : 'disconnected'); }

function onBinary(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let show = false;
  for (let o = 0; o + 8 <= u8.length;) {
    const t = dv.getUint32(o, true), len = dv.getUint32(o + 4, true);
    rx.types[t] = (rx.types[t] || 0) + 1; rx.msgs++;
    if (t === 7) { rx.frames++; rx.sawFrame = true; }
    if (t === 3) show = true;
    o += 8 + len;
  }
  rx.bytes += u8.length;
  if (!gfx) return;
  let r = 0;
  try { r = gfx.feed(u8); } catch (e) { r = -1; rx.feedErr = e; }
  if (r === 1) { const ms = gfx.stats().lastMs; draws.n++; draws.sum += ms; if (ms > draws.max) draws.max = ms; }
  if (r < 0 && gfx.stats().lost) return;      // (onLost makes a new renderer)
  // a malformed message: the car's daemon ends the connection ("bad message"); the app reconnects
  if (r < 0 && !rx.dropped) {
    rx.dropped = true;
    const why = (gfx.stats().error || (rx.feedErr && rx.feedErr.message) || 'bad message');
    addLog([['error', 'renderer: client dropped: ' + why]]);
    send({ t: 'drop', why });
  }
  if (show || (r === 1 && !$('#overlay').hidden)) overlay();
}

function onText(m) {
  switch (m.t) {
  case 'hello':
    S.app = m.app; S.titles = m.titles || {}; S.auto = m.auto || [];
    $('#touchroute').checked = m.touch !== false;
    $('#ver').textContent = 'v' + m.demo;
    $('#src').textContent = (m.sources || []).map((s) => s.name + ': ' + (s.missing ? '없음' : (s.branch || '?') + ' ' + (s.commit || '') + (s.date ? ' (' + s.date + ')' : ''))).join('\n') + (m.python ? '' : '\nPython 3 없음: idrive7-apps 앱은 빌드할 수 없습니다');
    if (m.cluster) { geoNow = m.cluster; Cluster.geo(m.cluster); }
    buildPicker(m.apps, S.titles);
    if (m.bg) { const b = $('#bgimg'); b.src = '/bg?' + Date.now(); b.hidden = false; }
    $('#log').replaceChildren();
    break;
  case 'spec': S.spec = m.spec; S.values = m.values || {}; S.app = m.spec.id; P.busy = null; picker(); buildSettings(); renderHmi(); $('#appname').textContent = m.spec.title; $('#version').textContent = m.spec.version; break;
  case 'settings': S.values = m.values; syncSettings(); break;
  case 'status': setStatus(m.s, m.text, m.app); break;
  case 'reset':
    awaitReset = false; rx.feedErr = null; rx.dropped = false; rx.types = {};
    if (!gfxMod) break;
    if (!gfx || (gfxApp !== null && m.app !== gfxApp) || gfx.stats().atlasFull) newGfx(m.app);
    else { gfxApp = m.app; errSeen = 0; gfx.reset(); }
    break;
  case 'log': addLog(m.lines); break;
  case 'conn': S.conn = m; break;
  case 'screens': S.stack = m.stack; S.closed = !!m.closed; renderHmi(); picker(); break;
  case 'focus': S.focus = m.id; renderHmi(); break;
  case 'soft': { const s = $('#soft'); if (m.png) { s.src = 'data:image/png;base64,' + m.png; s.hidden = false; } else { s.hidden = true; s.removeAttribute('src'); } break; }
  case 'touchmode': $('#touchroute').checked = !!m.on; break;
  case 'note': toast(m.s, true); break;
  // the demo's own: the car, the background apps, the cluster
  case 'veh': Car.update(m); break;
  case 'bg': bgList(m.apps); break;
  case 'cluster-reset': Cluster.reset(m.fs); break;
  case 'cluster': Cluster.layers(m.app, m.layers, m.fsNew); break;
  case 'mapwin': Cluster.mapWin(m.r); break;
  default: break;
  }
  overlay();
}
/* ---------------- frames: tick after each drawn one, stats (from kit/emu/web/emu-app.js) ---------------- */
// every figure in the panel is this page's, over one window (about a second): frames shown, what came in, the draws
let shown = 0, lastStat = performance.now(), rx0 = { frames: 0, msgs: 0, bytes: 0 };
// each draw (gfx.feed draws on arrival, between two refreshes too): the CPU time of its draw calls, not the GPU's
const draws = { n: 0, sum: 0, max: 0 };
function raf(now) {
  // the frames received were drawn on arrival (gfx.feed); this refresh shows them: the app may send the next
  if (rx.sawFrame) { rx.sawFrame = false; shown++; send({ t: 'tick' }); }
  if (now - lastStat >= 1000) {
    let st = null;
    try { st = gfx ? gfx.stats() : null; } catch (e) { /* destroyed */ }
    if (st) {
      // errors the car's renderer sends the app (ERROR): logged here and passed on
      if (st.errors.count > errSeen) st.errors.last.slice(0, Math.min(4, st.errors.count - errSeen)).reverse().forEach((s) => { addLog([['warn', 'renderer error: ' + s]]); send({ t: 'rerror', s }); });
      errSeen = st.errors.count;
      if (st.atlasFull && !pending) renew('glyph atlas full');
    }
    const dt = (now - lastStat) / 1000, per = (x) => Math.round(x / dt), fps = per(shown);
    const avg = draws.n ? draws.sum / draws.n : null, max = draws.n ? draws.max : null;
    if (st) send({ t: 'gstats', fps, avgMs: avg || 0, maxMs: max || 0 });
    const c = S.conn;
    // (not cross-origin isolated, e.g. another host's page: performance.now() in 0.1 ms steps)
    $('#rstats').textContent = `${fps} fps  ` + (st ? `draw (CPU${self.crossOriginIsolated ? '' : ', 0.1 ms steps'}) ${fmt(avg)} ms avg, ${fmt(max)} max` : 'renderer not built') +
      `\n${per(rx.frames - rx0.frames)} frames/s  ${per(rx.msgs - rx0.msgs)} msgs/s  ${kb((rx.bytes - rx0.bytes) / dt)}/s`;
    $('#rconn').textContent = c.on ? `${c.app} · ${c.dialect}${c.shown ? ' · shown' : ' · hidden'}${c.grab ? ' · controller held' : ''}${c.claims ? ' · ' + c.claims + ' claims' : ''}${c.fps ? ' · app cap ' + c.fps : ''}` +
      (c.place ? `\nplace ${c.place.x},${c.place.y} ${c.place.w}x${c.place.h} ×${(+c.place.s).toFixed(3)}` : '') : 'no app connected';
    shown = 0; draws.n = draws.sum = draws.max = 0; lastStat = now; rx0 = { frames: rx.frames, msgs: rx.msgs, bytes: rx.bytes };
    overlay();
  }
  requestAnimationFrame(raf);
}
const fmt = (x) => (x == null ? '-' : (+x).toFixed(3));
const kb = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' kB');

/* ---------------- what covers the screen ---------------- */
function overlay() {
  const o = $('#overlay');
  let html = null;
  if (S.status === 'disconnected') html = '<div>데모가 꺼져 있습니다</div><div class="mono">mgu_demo.bat 을 다시 실행하세요</div>';
  else if (S.status === 'exited') html = '<div>앱이 종료됐습니다</div><div class="mono">로그를 보고, 패널의 [다시 빌드]를 누르세요</div>';
  else if (S.closed) html = null;                // (the HMI's app list shows)
  else if (S.status === 'building' || S.status === 'starting') html = '<div>' + esc(S.titles[S.app] || S.app || '') + '</div><div class="mono">' + (S.status === 'building' ? '빌드 중…' : '시작 중…') + '</div>';
  else if (!gfx) {
    const top = Object.entries(rx.types).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${NAMES[t] || t} ${n}`).join(' · ');
    html = '<div>렌더러를 만들지 못했습니다 (WebGL 2 필요)</div><div class="mono">' + esc(gfxErr ? String(gfxErr.message || gfxErr).slice(0, 140) : '') +
      '</div><div class="mono">received ' + rx.msgs + ' messages, ' + rx.frames + ' frames, ' + kb(rx.bytes) + (top ? '<br>' + top : '') + '</div>';
  } else if (menuOnly()) {
    // an HMI-native screen (a menu): the HMI draws it on the car, the demo does not
    const m = topScreen(), btns = (m.items || []).filter((i) => i[0] === 'button').map((i) => i[2] || i[1]);
    html = '<div>' + esc(m.title || m.name) + ': 차에서는 HMI가 직접 그리는 메뉴 화면입니다</div><div class="mono">패널의 [고급: HMI 버튼]에서 누르세요' +
      (btns.length ? ': ' + esc(btns.join(' · ')) : '') + '</div>';
  }
  o.hidden = html === null;
  if (html !== null && o.dataset.html !== html) { o.innerHTML = html; o.dataset.html = html; }
}
/** the shown screen (the top of the app's stack) from the app's spec */
const topScreen = () => ((S.spec && S.spec.screens) || []).find((s) => s.name === S.stack[S.stack.length - 1]);
/** a menu screen on top and no surface of the app's shown (#soft, the HMI's image of a canvas screen, is not the menu) */
function menuOnly() {
  const m = topScreen();
  if (!m || m.kind !== 'menu') return false;
  try { return !gfx.stats().visible; } catch (e) { return false; }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* ---------------- touch: the mouse on the screen, in screen px (from kit/emu/web/emu-app.js) ---------------- */
let down = null;
const at = (e) => { const r = stage.getBoundingClientRect(); return { x: Math.round((e.clientX - r.left) * W / r.width), y: Math.round((e.clientY - r.top) * H / r.height) }; };
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, #picker')) return;
  try { stage.setPointerCapture(e.pointerId); } catch (x) { /* a pointer already gone */ }
  stage.focus({ preventScroll: true });
  down = e.pointerId;
  send(Object.assign({ t: 'touch', phase: 1 }, at(e)));
});
stage.addEventListener('pointermove', (e) => { if (down === e.pointerId) send(Object.assign({ t: 'touch', phase: 2 }, at(e))); });
const up = (e) => { if (down !== e.pointerId) return; down = null; send(Object.assign({ t: 'touch', phase: 3 }, at(e))); };
stage.addEventListener('pointerup', up);
stage.addEventListener('pointercancel', up);
// the focus ring only when Tab brought the focus here: Safari and Edge count stage.focus() (above, and at load) as :focus-visible
let tabbed = false;
document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tabbed = true; }, true);
document.addEventListener('pointerdown', () => { tabbed = false; stage.classList.remove('kbd-focus'); }, true);
stage.addEventListener('focus', () => stage.classList.toggle('kbd-focus', tabbed));
stage.addEventListener('blur', () => stage.classList.remove('kbd-focus'));

/* ---------------- the controller: wheel and keys ---------------- */
let wheel = 0;
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheel += e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY * 3 : e.deltaY / 60;
  const n = Math.trunc(wheel);
  if (n) { wheel -= n; if (S.closed) pickMove(n); else send({ t: 'ccu', turn: n }); }
}, { passive: false });
const TILT = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
// keys belong to the panel's controls while one has the focus (and to the browser with a modifier)
const held = new Set();
const typing = (e) => !!(e.target.closest && e.target.closest('#panel, input, select, textarea, button')) || e.metaKey || e.ctrlKey || e.altKey;
document.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const k = e.key;
  // the app picker has the controller while it shows (the app is not on screen); BACK and HOME leave it there
  if (S.closed) {
    if (k === '[' || k === ']') pickMove(k === ']' ? 1 : -1);
    else if (TILT[k]) pickMove({ N: -5, S: 5, E: 1, W: -1 }[TILT[k]]);
    else if (k === 'Enter') { if (!e.repeat) pickOpen(P.focus); }
    else if (k === 'o' || k === 'O') pickOpen(P.tiles.findIndex((t) => t.id === S.app));
    else if (!(k === 'Backspace' || k === 'h' || k === 'H' || k === 'Home')) return;
    e.preventDefault();
    return;
  }
  if (k === '[' || k === ']') send({ t: 'ccu', turn: k === ']' ? 1 : -1 });
  else if (k === 'Enter') { if (!e.repeat) { held.add(k); send({ t: 'ccu', press: true }); } }
  else if (TILT[k]) { if (!e.repeat) { held.add(k); send({ t: 'ccu', tilt: TILT[k] }); } }
  else if (k === 'Backspace') send({ t: 'hmi', a: 'back' });
  else if (k === 'h' || k === 'H' || k === 'Home') send({ t: 'hmi', a: 'home' });
  else if (k === 'o' || k === 'O') send({ t: 'hmi', a: 'open' });
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  if (!held.delete(e.key)) return;              // (only a press or push this page sent)
  if (e.key === 'Enter') send({ t: 'ccu', press: false });
  else if (TILT[e.key]) send({ t: 'ccu', tilt: null });
});
window.addEventListener('blur', () => { send({ t: 'ccu', press: false }); send({ t: 'ccu', tilt: null }); });

/* ---------------- panel: app, HMI ---------------- */
const STATUS_KO = { idle: '대기', connecting: '연결 중', building: '빌드 중', starting: '시작 중', running: '실행 중', exited: '종료됨', 'build-error': '빌드 실패', disconnected: '데모 꺼짐' };
function setStatus(s, text, app) {
  S.status = s;
  const p = $('#status'); p.textContent = STATUS_KO[s] || s; p.className = 'pill ' + s;
  if (app && (s === 'building' || s === 'starting')) $('#appname').textContent = S.titles[app] || app;
  const b = $('#builderr');
  if (s === 'build-error') { b.textContent = text || ''; b.hidden = false; toast('빌드 실패: 로그를 보세요 (이전에 빌드된 앱이 있으면 그대로 실행)'); } else if (s === 'running') { b.hidden = true; toast(null); }
  if (s === 'build-error' && P.busy) { P.busy = null; picker(); }
  overlay();
}
let toastT = null;
function toast(t, info) { const e = $('#toast'); clearTimeout(toastT); e.hidden = !t; e.classList.toggle('info', !!info); e.textContent = t || ''; if (t) toastT = setTimeout(() => { e.hidden = true; }, 6000); }
$('#restart').onclick = () => send({ t: 'restart' });
$('#shot').onclick = () => screenshot().catch((e) => { console.warn('screenshot:', e); toast('저장 실패: ' + (e.message || e)); });

/* ---------------- screenshot: the centre display as shown, a 1920 x 720 PNG (from kit/emu/web/emu-app.js) ---------------- */
// The HMI around the app (the stage's other parts: a copy of their HTML drawn as an SVG image, at 1920 x 720, so
// --u is 1 px) under the renderer's own picture of the app (gfx.readPixels, see-through where the HMI shows).
async function screenshot() {
  const out = el('canvas', { width: W, height: H }), g = out.getContext('2d');
  const copy = stage.cloneNode(true);
  copy.querySelectorAll('canvas, #overlay, #toast').forEach((e) => e.remove());
  copy.classList.remove('kbd-focus');
  copy.style.cssText = `width:${W}px;height:${H}px;border-radius:0;box-shadow:none`;
  // an SVG image loads nothing: its pictures go in as data URLs
  await Promise.all([...copy.querySelectorAll('img')].map(async (im) => {
    if (im.hidden || !im.getAttribute('src') || im.src.startsWith('data:')) return;
    try {
      const b = await (await fetch(im.src)).blob();
      im.src = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
    } catch (e) { im.remove(); }
  }));
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n');
  const bs = getComputedStyle(document.body);       // (the copy is outside <body>: its font and colour come along)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="font:${bs.font.replace(/"/g, "'")};color:${bs.color}"><style>${css.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</style>${new XMLSerializer().serializeToString(copy)}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  g.drawImage(img, 0, 0, W, H);
  // the app, as the renderer shows it (not while the HMI's app picker has the screen)
  if (gfx && getComputedStyle(canvas).visibility !== 'hidden') {
    const px = gfx.readPixels(), layer = el('canvas', { width: W, height: H });
    layer.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, px.length), W, H), 0, 0);
    g.drawImage(layer, 0, 0);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const a = el('a', { href: URL.createObjectURL(blob), download: `mgu-${S.app || 'screen'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.querySelectorAll('[data-hmi]').forEach((b) => { b.onclick = () => send({ t: 'hmi', a: b.dataset.hmi }); });
$('#touchroute').onchange = (e) => send({ t: 'touch-routing', on: e.target.checked });
$('#fps').onchange = (e) => send({ t: 'fps', n: Number(e.target.value) });

function renderHmi() {
  $('#stack').textContent = S.stack.length ? S.stack.join(' › ') : S.closed ? '(앱 목록)' : '(열린 화면 없음)';
  $('#soft').style.visibility = S.stack.length ? '' : 'hidden';       // the app's screen is gone: so is the HMI's image of it
  const screens = (S.spec && S.spec.screens) || [];
  $('#screens').replaceChildren(...(screens.length > 1 ? screens.map((s) => el('button', { textContent: s.name + ' 열기', title: s.kind, on: { click: () => send({ t: 'hmi', a: 'open', screen: s.name }) } })) : []));
  // the shown screen's HMI buttons (the bar of a canvas screen, a menu's entries): pressed as the HMI would
  const top = topScreen();
  const btns = !top ? [] : top.kind === 'canvas' ? (top.buttons || []).map((b) => [b[0], b[1]]) : (top.items || []).filter((i) => i[0] === 'button').map((i) => [i[1], i[2]]);
  $('#hmibtns').replaceChildren(...btns.map(([id, label]) => el('button', { textContent: label || id, title: id, className: id === S.focus ? 'focus' : '', on: { click: () => send({ t: 'click', id }) } })));
}

/* ---------------- panel: settings, from the app's app.json (in Korean, as the Store builds it) ---------------- */
function buildSettings() {
  const f = $('#settings');
  f.replaceChildren();
  let sec = null;
  for (const s of S.spec.settings || []) {
    if (s.hidden) continue;
    if (typeof s.section === 'string' && s.section !== sec) { sec = s.section; f.append(el('div', { className: 'sec', textContent: sec })); }
    const id = 'set-' + s.key;
    let c;
    if (s.type === 'bool') c = el('input', { type: 'checkbox', id });
    else if (s.type === 'choice' || (s.type === 'number' && s.steps)) {
      const opts = s.type === 'choice' ? s.options : s.steps.map((v) => [v, (s.labels && s.labels[String(v)]) || v + (s.unit ? ' ' + s.unit : '')]);
      c = el('select', { id }, ...opts.map((o, i) => el('option', { value: String(i), textContent: o[1] })));
      c._vals = opts.map((o) => o[0]);
    } else c = el('input', { type: s.type === 'number' ? 'number' : 'text', id });
    c.dataset.key = s.key;
    c.onchange = () => {
      const v = c.type === 'checkbox' ? c.checked : c._vals ? c._vals[Number(c.value)] : s.type === 'number' ? Number(c.value) : c.value;
      send({ t: 'set', k: s.key, v });
    };
    f.append(el('div', { className: 'set-row' }, el('label', { htmlFor: id, textContent: s.label || s.key, title: s.key }), c));
  }
  syncSettings();
}
function syncSettings() {
  document.querySelectorAll('#settings [data-key]').forEach((c) => {
    if (c === document.activeElement && c.tagName !== 'SELECT') return;
    const v = S.values[c.dataset.key];
    if (c.type === 'checkbox') c.checked = !!v;
    else if (c._vals) { const i = c._vals.findIndex((x) => x === v || String(x) === String(v)); c.value = String(Math.max(0, i)); }
    else c.value = v == null ? '' : v;
  });
}

/* ---------------- panel: the apps that start with the car ---------------- */
const BG_KO = { running: '실행 중', front: '화면에 열림', building: '빌드 중', error: '빌드 실패', off: '꺼짐' };
function bgList(apps) {
  $('#bglist').replaceChildren(...Object.keys(apps).flatMap((id) => [el('span', { textContent: S.titles[id] || id }), el('span', { className: 'st ' + apps[id], textContent: BG_KO[apps[id]] || apps[id] })]));
}

/* ---------------- panel: the car (the server's; every app and the cluster get it) ---------------- */
const SLIDERS = [
  ['주행', [['speed', '속도', 0, 260, 1, 'km/h'], ['rpm', 'rpm', 0, 8000, 50, ''], ['gear', '기어 단수', 0, 8, 1, ''], ['pedal', '가속 페달', 0, 100, 1, '%'], ['throttle', '스로틀', 0, 100, 1, '%'],
    ['gLong', '종G', -1.2, 1.2, 0.01, 'g'], ['gLat', '횡G', -1.2, 1.2, 0.01, 'g'], ['steer', '조향각', -450, 450, 5, '°'], ['yaw', '요레이트', -40, 40, 1, '°/s']]],
  ['엔진', [['torque', '토크', 0, 500, 1, 'Nm'], ['boostActual', '부스트', -0.8, 1.6, 0.01, 'bar'], ['timing', '점화시기', -5, 40, 0.5, '°'], ['hpfp', '고압 연료', 0, 350, 1, 'bar'], ['lpfp', '저압 연료', 0, 8, 0.1, 'bar']]],
  ['온도', [['oil', '오일', 20, 150, 1, '°C'], ['coolant', '냉각수', 20, 130, 1, '°C'], ['gearbox', '미션오일', 20, 130, 1, '°C'], ['iat', '흡기온', -10, 80, 1, '°C'], ['outside', '외기온', -20, 45, 1, '°C']]],
  ['연료·타이어', [['fuelPct', '연료', 0, 100, 1, '%'], ['frange', '주행가능거리', 0, 900, 5, 'km'], ['tyreP', '타이어 공기압', 1.6, 3.2, 0.01, 'bar'], ['tyreT', '타이어 온도', 0, 90, 1, '°C']]],
  ['PHEV', [['soc', '배터리', 0, 100, 1, '%'], ['kw', '배터리 출력', -60, 100, 0.5, 'kW'], ['battTemp', '배터리 온도', -5, 50, 1, '°C'], ['erange', '전기 주행거리', 0, 80, 1, 'km']]],
];
const STAGES = ['P', 'R', 'N', 'D', 'S', 'M'];
const MODES = [['COMFORT', 'Comfort'], ['SPORT', 'Sport'], ['SPORT+', 'Sport+'], ['ECO PRO', 'Eco Pro']];
const WAZE = [['off', '안 씀'], ['cluster', '계기판에'], ['hud', 'HUD에']];
const INDS = [['off', '끔'], ['left', '◀ 왼쪽'], ['right', '오른쪽 ▶'], ['both', '⚠ 비상등']];
const NIGHTS = [[false, '낮'], [true, '밤']];
const PHASE_KO = { idle: '정차', accel: '가속', cruise: '순항', brake: '감속' };
const Car = { mode: 'auto', v: {}, extra: {}, els: {}, sendT: null, sentAt: 0 };
function seg(box, items, onPick) {
  box.replaceChildren(...items.map(([v, t]) => el('button', { textContent: t, 'data-v': String(v), on: { click: () => onPick(v) } })));
}
const segSync = (box, v) => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
function buildCar() {
  $('#vehmode').querySelectorAll('button').forEach((b) => { b.onclick = () => send({ t: 'vehmode', mode: b.dataset.v }); });
  seg($('#stageSeg'), STAGES.map((s) => [s, s]), (v) => manualSet({ stage: v, gear: /^[DSM]$/.test(v) ? Math.max(1, Car.v.gear || 1) : 0 }));
  seg($('#modeSeg'), MODES, (v) => manualSet({ driveMode: v }, true));
  seg($('#wazeSeg'), WAZE, (v) => send({ t: 'extra', k: 'waze', v }));
  seg($('#indSeg'), INDS, (v) => send({ t: 'extra', k: 'indicator', v }));
  seg($('#nightSeg'), NIGHTS, (v) => send({ t: 'extra', k: 'night', v }));
  const box = $('#sliders');
  SLIDERS.forEach(([group, list]) => {
    const g = el('div', { className: 'vgroup' }, el('div', { textContent: group }));
    list.forEach(([k, label, min, max, step, unit]) => {
      const out = el('span');
      const r = el('input', { type: 'range', min, max, step, id: 'veh-' + k, 'aria-label': label });
      r.oninput = () => { Car.v[k] = Number(r.value); show(k); manualSet({ [k]: Number(r.value) }); };
      Car.els[k] = { r, out, step, unit };
      g.append(el('div', { className: 'slider' }, el('label', { htmlFor: 'veh-' + k, textContent: label }), r, out));
    });
    box.append(g);
  });
}
function show(k) {
  const e = Car.els[k], v = Number(Car.v[k]);
  if (!e || !isFinite(v)) return;
  if (document.activeElement !== e.r) e.r.value = v;
  e.out.textContent = (e.step < 1 ? v.toFixed(e.step < 0.1 ? 2 : 1) : Math.round(v)) + (e.unit ? ' ' + e.unit : '');
}
/** a value set by hand: manual mode (the drive stops where it is); at most 30 updates a second; driveMode keeps the drive going */
function manualSet(v, keepAuto) {
  Object.assign(Car.v, v);
  if (keepAuto && Car.mode === 'auto') { send({ t: 'vehset', v, keep: true }); syncCar(); return; }
  Car.mode = 'manual'; syncCar();
  Car.pend = Object.assign(Car.pend || {}, v);
  const go = () => { Car.sendT = null; Car.sentAt = performance.now(); send({ t: 'vehset', v: Car.pend }); Car.pend = null; };
  if (!Car.sendT) Car.sendT = setTimeout(go, Math.max(0, Car.sentAt + 33 - performance.now()));
}
Car.update = (m) => {
  Car.mode = m.mode; Car.extra = m.extra || {};
  // (a value being dragged here stays as the hand has it)
  Object.keys(m.v).forEach((k) => { if (!Car.els[k] || document.activeElement !== Car.els[k].r) Car.v[k] = m.v[k]; });
  Car.phase = m.phase;
  syncCar();
};
function syncCar() {
  segSync($('#vehmode'), Car.mode);
  $('#phase').textContent = Car.mode === 'auto' ? (PHASE_KO[Car.phase] || '') : '';
  segSync($('#stageSeg'), Car.v.stage); segSync($('#modeSeg'), Car.v.driveMode); segSync($('#wazeSeg'), Car.extra.waze);
  segSync($('#indSeg'), Car.extra.indicator || 'off'); segSync($('#nightSeg'), !!Car.extra.night);
  $('#sliders').classList.toggle('auto', Car.mode === 'auto');
  Object.keys(Car.els).forEach(show);
}

/* ---------------- the cluster and the HUD: what the AK Cluster apps make (demo/preload.js), drawn as the KOMBI would ----------------
 * Each app's layers on the cluster render service's targets: 'panel' (the whole cluster, 1920 x 720), 'map' (the map's
 * place, 1088 x 480) and 'hud' (800 x 480). Effects: the app's own GLSL on a quad (WebGL); images: its RGBA pixels;
 * assets: textures the effects sample. Drawn in the service's order: class (ambient, content, overlay, alert), z, the
 * order they were made. */
const VS = '#version 100\nattribute vec2 a_position;\nuniform mat4 u_mvp;\nvarying vec2 v_uv;\nvoid main() {\n    v_uv = vec2(a_position.x, 1.0 - a_position.y);\n    gl_Position = u_mvp * vec4(a_position, 0.0, 1.0);\n}';
const CLS = { ambient: 0, content: 1, overlay: 2, alert: 3 };
const APP_ORDER = ['akakingj_cluster_layouts', 'akakingj_cluster_centre', 'akakingj_cluster_info'];
const Cluster = (() => {
  const FS = {};                       // shader id -> GLSL
  const apps = new Map();              // app -> layers
  const px = new Map();                // 'app/key' -> { rev, data: Uint8Array }
  const errors = new Set();
  let geo = { map: { x: 416, y: 120, w: 1088, h: 480 }, stripY: 646 };
  // where the map shows: its slot on the stock cluster; over a layout only in the layout's map window (map_window.js)
  let win = null, panelOn = false;
  const mapRect = () => (panelOn ? win : geo.map);
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  function renderer(cv) {
    const gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) errors.add(gl.getShaderInfoLog(s) + '\n' + String(src).slice(0, 160)); return s; };
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const vs = sh(gl.VERTEX_SHADER, VS);
    const progs = {}, tex = new Map();       // tex: 'app/key' -> { t, rev }
    const program = (id) => {
      if (progs[id]) return progs[id];
      if (!FS[id]) return { bad: true };
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS[id])); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { errors.add('link: ' + gl.getProgramInfoLog(p)); return (progs[id] = { bad: true }); }
      return (progs[id] = { p, aloc: gl.getAttribLocation(p, 'a_position'), locs: {}, mvp: gl.getUniformLocation(p, 'u_mvp'), time: gl.getUniformLocation(p, 'u_time') });
    };
    const loc = (pr, n, arr) => { const k = n + (arr ? '[]' : ''); if (!(k in pr.locs)) pr.locs[k] = gl.getUniformLocation(pr.p, arr ? n + '[0]' : n) || gl.getUniformLocation(pr.p, n); return pr.locs[k]; };
    /** the asset's texture, uploaded again when its pixels changed */
    function texture(key, a) {
      const p = px.get(key);
      if (!p) return null;
      let e = tex.get(key);
      if (e && e.rev === p.rev) return e.t;
      if (!e) { e = { t: gl.createTexture(), rev: -1 }; tex.set(key, e); }
      gl.bindTexture(gl.TEXTURE_2D, e.t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const fmt = a.fmt === 'r8' ? gl.LUMINANCE : gl.RGBA;
      if (a.fmt === 'r8' || a.fmt === 'rgba8') gl.texImage2D(gl.TEXTURE_2D, 0, fmt, a.w, a.h, 0, fmt, gl.UNSIGNED_BYTE, p.data);
      const f = a.smp === 'bilinear' ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      e.rev = p.rev;
      return e.t;
    }
    return {
      draw(list, assets, W, H) {
        gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const T = performance.now() / 1000;
        for (const [app, L] of list) {
          const pr = program(L.fs); if (pr.bad) continue;
          gl.useProgram(pr.p);
          gl.enableVertexAttribArray(pr.aloc); gl.vertexAttribPointer(pr.aloc, 2, gl.FLOAT, false, 0, 0);
          gl.uniformMatrix4fv(pr.mvp, false, new Float32Array([2 * L.w / W, 0, 0, 0, 0, 2 * L.h / H, 0, 0, 0, 0, 1, 0, 2 * L.x / W - 1, 1 - 2 * (L.y + L.h) / H, 0, 1]));
          for (const n in L.u) {
            const [v, t] = L.u[n], l = loc(pr, n, !!t); if (!l) continue;
            const ww = t === 'mat4' ? 16 : t === 'vec4' ? 4 : t === 'vec3' ? 3 : t === 'vec2' ? 2 : t === 'float' ? 1 : v.length;
            if (ww === 16) gl.uniformMatrix4fv(l, false, v); else if (ww === 1) gl.uniform1fv(l, v); else if (ww === 2) gl.uniform2fv(l, v); else if (ww === 3) gl.uniform3fv(l, v); else gl.uniform4fv(l, v);
          }
          if (pr.time) gl.uniform1f(pr.time, T);
          let unit = 0;
          for (const s in L.b) {
            const key = app + '/' + L.b[s], a = assets.get(key);
            const t = a && texture(key, a);
            if (!t) continue;
            gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc(pr, s), unit); unit++;
          }
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      },
      forget(keep) { tex.forEach((e, k) => { if (!keep.has(k)) { gl.deleteTexture(e.t); tex.delete(k); } }); },
    };
  }
  const R = { panel: renderer($('#glPanel')), map: renderer($('#glMap')) };
  const hudGl = document.createElement('canvas'); hudGl.width = 800; hudGl.height = 480;
  R.hud = renderer(hudGl);
  const imgCache = new Map();          // 'app/key' -> { rev, cv }
  function imageOf(key, L) {
    const p = px.get(key);
    if (!p || !L.iw || !L.ih || p.data.length < L.iw * L.ih * 4) return null;
    let e = imgCache.get(key);
    if (e && e.rev === p.rev) return e.cv;
    if (!e) { e = { cv: document.createElement('canvas'), rev: -1 }; imgCache.set(key, e); }
    e.cv.width = L.iw; e.cv.height = L.ih;
    e.cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, L.iw * L.ih * 4), L.iw, L.ih), 0, 0);
    e.rev = p.rev;
    return e.cv;
  }
  let dirty = true, timeUsed = false;
  function draw() {
    const all = [];
    const assets = new Map();
    apps.forEach((layers, app) => layers.forEach((L) => { if (L.kind === 'asset') assets.set(app + '/' + L.k, L); else all.push([app, L]); }));
    const order = (a) => { const i = APP_ORDER.indexOf(a); return i < 0 ? 9 : i; };
    const num = (k) => Number(String(k).split(':').pop()) || 0;
    all.sort((a, b) => (CLS[a[1].cls] ?? 1) - (CLS[b[1].cls] ?? 1) || (a[1].z - b[1].z) || order(a[0]) - order(b[0]) || num(a[1].k) - num(b[1].k));
    const vis = all.filter(([, L]) => L.vis && L.w > 0 && L.h > 0);
    const on = (t, kind) => vis.filter(([, L]) => L.target === t && L.kind === kind);
    if (R.panel) R.panel.draw(on('panel', 'effect'), assets, 1920, 720);
    panelOn = on('panel', 'effect').length > 0;
    const mr = mapRect();
    if (R.map) R.map.draw(mr ? on('map', 'effect') : [], assets, 1088, 480);
    const hudFx = on('hud', 'effect');
    if (R.hud) R.hud.draw(hudFx, assets, 800, 480);
    timeUsed = vis.some(([, L]) => L.kind === 'effect' && FS[L.fs] && /u_time/.test(FS[L.fs]));
    // images: the panel's and the map's over the cluster, the HUD's on the HUD
    const o = $('#ovl').getContext('2d'); o.clearRect(0, 0, 1920, 720);
    const h = $('#hud2d').getContext('2d'); h.clearRect(0, 0, 800, 480);
    if (hudFx.length) h.drawImage(hudGl, 0, 0);
    vis.filter(([, L]) => L.kind === 'image').forEach(([app, L]) => {
      const cv = imageOf(app + '/' + L.k, L);
      if (!cv) return;
      const g = L.target === 'hud' ? h : o;
      let x = L.x, y = L.y, w = L.w, hh = L.h;
      if (L.target === 'map') { if (!mr) return; const k = mr.w / 1088, ky = mr.h / 480; x = mr.x + L.x * k; y = mr.y + L.y * ky; w = L.w * k; hh = L.h * ky; }
      g.save(); g.globalAlpha = L.op == null ? 1 : L.op; g.drawImage(cv, x, y, w, hh); g.restore();
    });
    // what shows of the stock cluster: nothing over the whole panel (no layout shown) -> the sketch of the stock dials
    placeMap(mr);
    const note = $('#clusterNote');
    if (!panelOn) { note.style.display = 'flex'; note.innerHTML = '순정 계기판 (모형)<small>' + (vis.length ? '계기판 앱이 지도 자리 · HUD에만 그리는 중' : 'AK Cluster Layouts · Centre가 꺼져 있습니다 (각 앱 설정의 "계기판에 표시")') + '</small>'; }
    else note.style.display = 'none';
    $('#mock').style.display = panelOn ? 'none' : '';
    const used = new Set([...px.keys()]);
    Object.values(R).forEach((r) => r && r.forget(used));
    imgCache.forEach((e, k) => { if (!used.has(k)) imgCache.delete(k); });
    const err = $('#clusterErr');
    if (errors.size) { err.style.display = 'block'; err.textContent = '셰이더 오류:\n' + Array.from(errors).slice(0, 4).join('\n\n'); } else err.style.display = 'none';
    $('#clusterInfo').textContent = Array.from(apps.keys()).map((a) => (S.titles[a] || a) + ' ' + apps.get(a).filter((L) => L.kind !== 'asset' && L.vis).length).join(' · ') + (apps.size ? ' 레이어' : '');
  }
  let placed = '';
  function placeMap(r) {
    const k = JSON.stringify(r);
    if (k === placed) return;
    placed = k;
    [$('#glMap'), $('#map')].forEach((e) => { if (r) Object.assign(e.style, { left: r.x / 19.2 + '%', top: r.y / 7.2 + '%', width: r.w / 19.2 + '%', height: r.h / 7.2 + '%' }); e.style.visibility = r ? '' : 'hidden'; });
  }
  function blink() {
    const d = (Car.extra && Car.extra.indicator) || 'off', on = d !== 'off' && Math.floor(performance.now() / 400) % 2 === 0;   // (about the cluster's flash)
    $('#turnL').style.display = on && (d === 'left' || d === 'both') ? 'block' : 'none';
    $('#turnR').style.display = on && (d === 'right' || d === 'both') ? 'block' : 'none';
  }
  function frame() {
    blink();
    if (dirty || timeUsed) { dirty = false; try { draw(); } catch (e) { console.warn('cluster:', e); } }
    strip();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    geo(g) { geo = g; $('#strip').style.top = g.stripY / 7.2 + '%'; placed = ''; dirty = true; glassView(); },
    mapWin(r) { win = r || null; placed = ''; dirty = true; },
    reset(fs) { Object.keys(FS).forEach((k) => delete FS[k]); Object.assign(FS, fs || {}); apps.clear(); px.clear(); errors.clear(); dirty = true; },
    layers(app, layers, fsNew) {
      Object.assign(FS, fsNew || {});
      if (!layers || !layers.length) { apps.delete(app); [...px.keys()].forEach((k) => { if (k.startsWith(app + '/')) px.delete(k); }); dirty = true; return; }
      const keep = new Set();
      layers.forEach((L) => {
        const key = app + '/' + L.k;
        keep.add(key);
        if (L.px) { px.set(key, { rev: L.rev, data: b64(L.px) }); delete L.px; }
      });
      [...px.keys()].forEach((k) => { if (k.startsWith(app + '/') && !keep.has(k)) px.delete(k); });
      apps.set(app, layers);
      dirty = true;
    },
  };
})();

/* ---------------- the real car's glass: what of the panel shows on the car (Cluster Layouts' layout_common.js) ----------------
 * glass: the slanted top corners and the driver camera's cowl hide what is under them, as on the car;
 * guides: also the KOMBI's own places a layout keeps clear of (warning lights, gear and eDrive boxes, an M car's
 * boxes, the bottom strip, the map) */
let geoNow = null;
const CV_KEY = 'mguDemo.carView';
let carView = (() => { try { return localStorage.getItem(CV_KEY) || 'glass'; } catch (e) { return 'glass'; } })();
function glassView(g) {
  if (g) geoNow = g;
  g = geoNow || {};
  const sv = $('#glassView');
  $('#carView').value = carView;
  if (carView === 'off') { sv.innerHTML = ''; return; }
  const out = [];
  // the corners: the left edge as measured, the right its mirror; hidden (black), the glass's edge a thin line
  if (g.corner && g.corner.length > 1) {
    const L = g.corner, R = L.map(([x, y]) => [1920 - x, y]);
    const poly = (pts, corner) => '<path d="M' + corner + ' L' + pts.map((p) => p.join(' ')).join(' L') + ' Z" fill="#000"/>';
    out.push(poly(L, '0 0'), poly(R, '1920 0'));
    out.push('<polyline points="' + L.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="#3b424c" stroke-width="3"/>');
    out.push('<polyline points="' + R.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="#3b424c" stroke-width="3"/>');
  }
  // the camera's cowl over the top middle: dark, its lower corners rounded, the camera's lens in it
  if (g.notch) {
    const n = g.notch, r = Math.min(36, n.h / 2), x2 = n.x + n.w, y2 = n.y + n.h;
    out.push('<path d="M' + n.x + ' ' + n.y + ' V' + (y2 - r) + ' Q' + n.x + ' ' + y2 + ' ' + (n.x + r) + ' ' + y2 + ' H' + (x2 - r) + ' Q' + x2 + ' ' + y2 + ' ' + x2 + ' ' + (y2 - r) + ' V' + n.y + ' Z" fill="#07080a" stroke="#3b424c" stroke-width="3"/>');
    const cx = n.x + n.w / 2, cy = n.y + n.h * 0.42;
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="15" fill="#111419" stroke="#2a3038" stroke-width="3"/><circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#1d2b3d"/>');
    [-44, 44].forEach((dx) => out.push('<circle cx="' + (cx + dx) + '" cy="' + cy + '" r="5" fill="#1a1216"/>'));   // (its infrared lights)
    if (carView === 'guides') out.push('<text x="' + cx + '" y="' + (y2 - 14) + '" fill="#8792a0" font-size="20" text-anchor="middle" font-family="Malgun Gothic, sans-serif">운전자 카메라</text>');
  }
  if (carView === 'guides') {
    const rect = (b, label, color) => {
      if (!b) return;
      out.push('<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" fill="' + color + '14" stroke="' + color + '" stroke-width="2.5" stroke-dasharray="10 7"/>');
      out.push('<text x="' + (b.x + 8) + '" y="' + (b.y + 22) + '" fill="' + color + '" font-size="18" font-family="Malgun Gothic, sans-serif">' + label + '</text>');
    };
    rect(g.telltales, '순정 경고등', '#ffb74d');
    rect(g.gearbox, '기어 표시 박스 (하단바 숨김일 때)', '#4fc3f7');
    rect(g.edrive, 'eDrive (PHEV)', '#81c784');
    (g.mHoles || []).forEach((b, i) => rect(b, 'M 박스 ' + (i + 1), '#ce93d8'));
    rect(g.map, '지도 자리', '#90a4ae');
    if (isFinite(g.stripY)) out.push('<line x1="0" x2="1920" y1="' + g.stripY + '" y2="' + g.stripY + '" stroke="#ef9a9a" stroke-width="2.5" stroke-dasharray="14 8"/><text x="12" y="' + (g.stripY - 8) + '" fill="#ef9a9a" font-size="18" font-family="Malgun Gothic, sans-serif">순정 하단 줄</text>');
  }
  sv.innerHTML = out.join('');
}
$('#carView').onchange = (e) => { carView = e.target.value; try { localStorage.setItem(CV_KEY, carView); } catch (x) { /* this visit only */ } glassView(); };

/* the stock cluster's dials (a sketch: while no layout draws the whole panel), its bottom strip, the Waze map's place */
function drawMock() {
  const c = $('#mock').getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, 1920, 720);
  const dial = (cx, label, max, step) => {
    c.save(); c.translate(cx, 345);
    c.strokeStyle = '#26323f'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 178, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
    c.fillStyle = '#556678'; c.font = '600 24px Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = 0; v <= max; v += step) { const a = Math.PI * 0.75 + (v / max) * Math.PI * 1.5; c.fillText(String(v), Math.cos(a) * 142, Math.sin(a) * 142); }
    c.fillStyle = '#3a4757'; c.font = '17px Segoe UI, Malgun Gothic, sans-serif'; c.fillText(label, 0, 110);
    c.restore();
  };
  dial(208, '순정 속도계 (모형)', 260, 40); dial(1712, '순정 rpm (모형)', 8, 1);
}
drawMock();
let stripLast = 0;
function strip() {
  const now = performance.now();
  if (now - stripLast < 200) return;
  stripLast = now;
  const d = Car.v, x = Car.extra || {};
  if (d.speed === undefined) return;
  const n = new Date(), hh = n.getHours(), mm = String(n.getMinutes()).padStart(2, '0');
  $('#sRange').querySelector('b').textContent = String(Math.round(d.frange));
  $('#sTime').textContent = hh + ':' + mm;
  $('#sMode').textContent = d.driveMode === 'SPORT+' ? 'SPORT PLUS' : d.driveMode;
  $('#sGear').textContent = /^[DSM]$/.test(d.stage) ? d.stage + (d.gear || '') : d.stage;
  $('#sTemp').textContent = (d.outside >= 0 ? '+' : '') + Number(d.outside).toFixed(1) + '°C';
  $('#map').style.display = x.waze === 'cluster' ? 'flex' : 'none';
  $('#hudMap').style.display = x.waze === 'hud' ? 'block' : 'none';
  $('#hudSpeed').innerHTML = Math.round(d.speed) + '<small>km/h</small>';
}
$('#carlook').onchange = (e) => $('#cluster').classList.toggle('car', e.target.checked);
$('#shotCluster').onclick = () => {
  const out = el('canvas', { width: 1920, height: 720 }), g = out.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 720);
  ['#mock', '#glPanel', '#ovl'].forEach((s) => { const c = $(s); if (c.style.display !== 'none') g.drawImage(c, 0, 0); });
  const m = $('#glMap'), r = m.getBoundingClientRect(), cr = $('#cluster').getBoundingClientRect();
  g.drawImage(m, (r.left - cr.left) * 1920 / cr.width, (r.top - cr.top) * 720 / cr.height, r.width * 1920 / cr.width, r.height * 720 / cr.height);
  out.toBlob((b) => { const a = el('a', { href: URL.createObjectURL(b), download: 'cluster-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
};

/* ---------------- log ---------------- */
function addLog(lines) {
  const box = $('#log'), stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
  for (const [l, s] of lines) box.append(el('div', { className: l, textContent: s }));
  while (box.childElementCount > 600) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}
$('#clearlog').onclick = () => $('#log').replaceChildren();

/* ---------------- the HMI's app picker ("Installed Apps") (from kit/emu/web/emu-app.js) ----------------
 * Shown while the user has left the app (BACK on its last screen, HOME): the server's {t:'screens', closed}. The app
 * is then hidden as on the car (no SHOW, no ticks); the knob, push and press move the focus here. The current app's
 * tile opens it again ({t:'hmi', a:'open'}), another app's tile starts that one ({t:'app'}: it opens once started).
 * Sizes in the screen's 1920 x 720 px (emu.css .pk-*). */
// the order of the tiles on the car (the user's photo of it); apps not listed follow by name
// (the demo: Car profile and the AK Cluster apps first, then the car's own order)
const ORDER = ['car_profile', 'akakingj_cluster_layouts', 'akakingj_cluster_centre', 'akakingj_cluster_info', 'brake_test', 'warmup', 'service', 'redline', 'gforce', 'ak_water_cup', 'edrive', 'dyno', 'dtc_scanner', 'draggy', 'doom', 'car_vitals'];
const PK = { cols: 5, row: 236, padTop: 18, padBottom: 30, view: 640, track: 590 };   // (emu.css: grid rows, padding, .pk-body / .pk-bar height)
const P = { tiles: [], focus: 0, scroll: 0, busy: null, shown: false };
function buildPicker(apps, titles) {
  const ids = ORDER.filter((k) => apps.includes(k)).concat(apps.filter((a) => !ORDER.includes(a)));
  P.tiles = ids.map((id) => ({ id, title: titles[id] || id }));
  $('.pk-grid').replaceChildren(...P.tiles.map((t, i) => {
    const icon = el('img', { src: '/icon/' + encodeURIComponent(t.id) + '.png', alt: '', draggable: false });
    t.el = el('div', { className: 'pk-tile', role: 'option', 'aria-label': t.title, 'data-i': i }, icon, el('span', { textContent: t.title }));
    return t.el;
  }));
  picker();
}
/** show or hide the picker for S.closed; on showing, the focus goes to the current app's tile */
function picker() {
  const on = S.closed && P.tiles.length > 0;
  if (on && !P.shown) { const i = P.tiles.findIndex((t) => t.id === S.app); pickFocus(i < 0 ? 0 : i); }
  P.shown = on;
  $('#picker').hidden = !on;
  stage.classList.toggle('pk', on);              // (the HMI's chrome: the picker's look, or a running app's)
  P.tiles.forEach((t) => t.el.classList.toggle('busy', t.id === P.busy));
  overlay();
}
const pkRows = () => Math.ceil(P.tiles.length / PK.cols);
const pkMax = () => Math.max(0, PK.padTop + pkRows() * PK.row + PK.padBottom - PK.view);
function pickScroll(y) {
  P.scroll = Math.max(0, Math.min(pkMax(), y));
  $('.pk-grid').style.transform = `translateY(calc(var(--u) * ${-P.scroll}))`;
  const content = PK.view + pkMax(), th = Math.max(40, PK.track * PK.view / content), tb = $('.pk-thumb');
  tb.style.height = `calc(var(--u) * ${th})`;
  tb.style.top = `calc(var(--u) * ${pkMax() ? (PK.track - th) * P.scroll / pkMax() : 0})`;
  $('.pk-bar').hidden = !pkMax();
}
function pickFocus(i) {
  P.focus = Math.max(0, Math.min(P.tiles.length - 1, i));
  P.tiles.forEach((t, k) => { t.el.classList.toggle('focus', k === P.focus); t.el.setAttribute('aria-selected', k === P.focus); });
  // the focused row whole in view
  const top = PK.padTop + Math.floor(P.focus / PK.cols) * PK.row;
  if (top < P.scroll + PK.padTop) pickScroll(top - PK.padTop);
  else if (top + PK.row > P.scroll + PK.view) pickScroll(top + PK.row - PK.view + PK.padBottom);
  else pickScroll(P.scroll);
}
const pickMove = (d) => pickFocus(P.focus + d);
function pickOpen(i) {
  const t = P.tiles[i];
  if (!t) return;
  pickFocus(i);
  if (t.id === P.busy) return;                    // (starting already)
  // the running app's tile opens it again; while another one starts, the running app's tile switches back to it
  if (t.id === S.app && !P.busy) { send({ t: 'hmi', a: 'open' }); return; }
  P.busy = t.id; picker();
  toast(null);
  send({ t: 'app', id: t.id });
}
// touch: a tap opens, a drag scrolls (in screen px: the stage's CSS size maps back to 1920 wide)
{
  const body = $('.pk-body');
  let d = null;
  body.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { body.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
    stage.focus({ preventScroll: true });           // (the keys drive the picker from here on)
    const tile = e.target.closest('.pk-tile');
    d = { id: e.pointerId, y: e.clientY, s: P.scroll, k: W / stage.getBoundingClientRect().width, i: tile ? Number(tile.dataset.i) : -1, drag: false };
  });
  body.addEventListener('pointermove', (e) => {
    if (!d || d.id !== e.pointerId) return;
    const dy = (e.clientY - d.y) * d.k;
    if (!d.drag && Math.abs(dy) > 14) d.drag = true;
    if (d.drag) pickScroll(d.s - dy);
  });
  const end = (e) => { if (!d || d.id !== e.pointerId) return; const x = d; d = null; if (e.type === 'pointerup' && !x.drag && x.i >= 0) pickOpen(x.i); };
  body.addEventListener('pointerup', end);
  body.addEventListener('pointercancel', end);
}

/* ---------------- layout: the cluster over the centre display, both 1920 x 720, as large as fit; the panel at the right ---------------- */
function layout() {
  const vw = document.documentElement.clientWidth;
  const narrow = vw < 1000;
  document.body.classList.toggle('narrow', narrow);
  const m = $('#main'), cs = getComputedStyle(m), px = (k) => parseFloat(cs[k]) || 0;
  const aw = m.getBoundingClientRect().width - px('paddingLeft') - px('paddingRight');
  const fixed = ['#capCluster', '#capStage', '#legend'].reduce((n, s) => n + ($(s).offsetHeight || 0), 0) + 5 * px('rowGap');
  const ah = (narrow ? window.innerHeight * 0.9 : m.clientHeight) - px('paddingTop') - px('paddingBottom') - fixed;
  const w = Math.max(240, Math.floor(Math.min(aw, ah / 2 * W / H)));
  [stage, $('#cluster')].forEach((e) => { if (e.style.width !== w + 'px') e.style.width = w + 'px'; });
  ['#capCluster', '#capStage'].forEach((s) => { $(s).style.width = w + 'px'; $(s).style.alignSelf = 'center'; });
}
const ro = new ResizeObserver(() => layout());
ro.observe($('#main'));
window.addEventListener('resize', layout);
const clock = () => { $('#hmi-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };   // (24 h, as the car)
setInterval(clock, 10000); clock();

buildCar();
layout();
connect();
requestAnimationFrame(raf);
stage.focus();
