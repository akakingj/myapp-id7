// editor.js - the MGU demo's layout editor: AK Cluster Layouts' Custom 1, 2 and 3 (myapp-cluster
// apps/akakingj_cluster_layouts/custom.js). The design is data: pieces of the kinds every layout there uses (dials,
// readouts, labels, bars, boxes, lines), each in its rectangle on the 1920 x 720 panel, and the colours of their roles.
// The page edits it over the cluster (outlines to drag and resize) and in the editor below; the demo server keeps it
// and hands it to the running Layouts app, which draws it on the cluster within a second, as the car would.
const W = 1920, H = 720;
const NS = 'http://www.w3.org/2000/svg';

/* ---------------- names (Korean, for the page; the design itself keeps the app's keys) ---------------- */
const TYPES = {
  dial: { name: '원형 계기', color: '#4fc3f7' }, readout: { name: '숫자', color: '#ffd54f' }, label: { name: '글자', color: '#e0e0e0' },
  bar: { name: '막대', color: '#81c784' }, box: { name: '상자', color: '#ba68c8' }, line: { name: '선', color: '#90a4ae' },
};
const ROLE_NAMES = {
  bg: '배경', text: '글자', dim: '흐린 글자', glow: '글자 빛번짐', accent: '강조', red: '빨강 (레드존·R)', yellow: '노랑 (rpm 경고)', track: '막대 바탕',
  face0: '다이얼 면 (가운데)', face1: '다이얼 면 (가장자리)', bezel: '다이얼 테두리', bezel2: '테두리 그림자', tick: '큰 눈금', minor: '작은 눈금', num: '눈금 숫자',
  needle: '바늘', hub: '바늘 중심', boxTop: '상자 위', boxBottom: '상자 아래', boxEdge: '상자 테두리', line: '선',
};
const SRC_MAIN = { speed: '속도', rpm: '엔진 회전수', gear: '기어', outside: '바깥 온도' };
const LOOKS = [['', '기본'], ['sport', '스포츠'], ['efficient', '에코']];
const DRIVE = [['COMFORT', '컴포트'], ['SPORT', '스포츠'], ['ECO PRO', '에코 프로']];
const FONT_NAMES = { bold: '굵게 (Barlow SemiBold)', light: '얇게 (Barlow)', wide: '넓게 (Michroma)', orb: '미래형 (Orbitron)' };
const ALIGNS = [[0, '왼쪽'], [0.5, '가운데'], [1, '오른쪽']];

/* ---------------- new pieces and starting designs ---------------- */
const NEW = {
  dial: () => ({ type: 'dial', src: 'speed', x: 740, y: 160, w: 440, h: 440 }),
  readout: () => ({ type: 'readout', src: 'speed', x: 760, y: 280, w: 400, h: 100 }),
  label: () => ({ type: 'label', text: 'TEXT', x: 810, y: 300, w: 300, h: 36 }),
  bar: () => ({ type: 'bar', src: 'rpm', x: 660, y: 330, w: 600, h: 24, segments: 0 }),
  box: () => ({ type: 'box', x: 710, y: 180, w: 500, h: 360, radius: 20 }),
  line: () => ({ type: 'line', x: 660, y: 360, w: 600, h: 3 }),
};
const TEMPLATES = {
  twin: { name: '원형 계기 두 개', pieces: [
    { type: 'box', x: 712, y: 176, w: 496, h: 400, radius: 24 },
    { type: 'dial', src: 'speed', x: 150, y: 160, w: 470, h: 470 },
    { type: 'dial', src: 'rpm', x: 1300, y: 160, w: 470, h: 470 },
    { type: 'readout', src: 'gear', x: 860, y: 196, w: 200, h: 120 },
    { type: 'line', x: 760, y: 330, w: 400, h: 2 },
    { type: 'readout', src: 'speed', x: 760, y: 346, w: 400, h: 110, unit: false },
    { type: 'bar', src: 'rpm', x: 760, y: 470, w: 400, h: 14, segments: 0 },
    { type: 'readout', src: 'oil', x: 740, y: 512, w: 210, h: 34, name: 'short' },
    { type: 'readout', src: 'coolant', x: 970, y: 512, w: 210, h: 34, name: 'short' },
  ] },
  big: { name: '가운데 큰 속도', pieces: [
    { type: 'bar', src: 'rpm', x: 200, y: 150, w: 1520, h: 22, segments: 40 },
    { type: 'readout', src: 'speed', x: 560, y: 220, w: 800, h: 220, unit: false },
    { type: 'readout', src: 'gear', x: 1440, y: 260, w: 220, h: 160 },
    { type: 'readout', src: 'rpm', x: 240, y: 300, w: 320, h: 60, align: 0 },
    { type: 'line', x: 300, y: 500, w: 1320, h: 2 },
    { type: 'readout', src: 'boost', x: 300, y: 520, w: 400, h: 44, name: 'short' },
    { type: 'readout', src: 'oil', x: 760, y: 520, w: 400, h: 44, name: 'short' },
    { type: 'readout', src: 'coolant', x: 1220, y: 520, w: 400, h: 44, name: 'short' },
  ] },
  empty: { name: '빈 화면', pieces: [] },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const overlap = (a, b) => !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function makeEditor({ $, el, send, geo, log }) {
  const E = { on: false, info: null, designs: {}, slot: 1, sel: -1, undo: [], redo: [], look: '', grid: 10, outlines: true, saved: true, saveT: null, lastSave: 0, drag: null };
  const view = $('#editView'), box = $('#editor'), btn = $('#editBtn');

  /* ---------------- the design ---------------- */
  const blank = (slot) => ({ v: 1, slot, title: 'Custom ' + slot, font: 'bold', colors: {}, looks: {}, pieces: [] });
  const D = () => E.designs[E.slot] || (E.designs[E.slot] = blank(E.slot));
  const roles = () => (E.info && E.info.roles) || {};
  const max = () => (E.info && E.info.max) || 36;
  /** a piece's rectangle as the app draws it (custom.js: kept inside the panel; a dial square) */
  function fit(p) {
    if (p.type === 'dial') { const s = clamp(Math.round(+p.w || 400), 60, 720); p.w = p.h = s; } else { p.w = clamp(Math.round(+p.w || 100), 1, W); p.h = clamp(Math.round(+p.h || 40), 1, H); }
    p.x = clamp(Math.round(+p.x || 0), 0, W - p.w); p.y = clamp(Math.round(+p.y || 0), 0, H - p.h);
    return p;
  }
  function change(fn, quiet) {
    E.undo.push(JSON.stringify(E.designs)); if (E.undo.length > 200) E.undo.shift();
    E.redo = [];
    fn(D());
    D().pieces.forEach(fit);
    saveSoon(); draw(); if (!quiet) panel(); else refresh();
  }
  function undo(back) {
    const from = back ? E.undo : E.redo, to = back ? E.redo : E.undo;
    if (!from.length) return;
    to.push(JSON.stringify(E.designs));
    E.designs = JSON.parse(from.pop());
    if (E.sel >= D().pieces.length) E.sel = -1;
    saveSoon(); draw(); panel();
  }
  function saveSoon(now) {
    E.saved = false; status();
    clearTimeout(E.saveT);
    const go = () => {
      E.saveT = null; E.lastSave = Date.now();
      send({ t: 'custom-save', designs: [1, 2, 3].map((s) => E.designs[s]).filter((d) => d && (d.pieces.length || d.title !== 'Custom ' + d.slot || Object.keys(d.colors || {}).length)) });
      E.saved = true; status();
    };
    // (while dragging: twice a second, so the cluster follows; otherwise just after the last change)
    if (now || (E.drag && Date.now() - E.lastSave > 500)) go(); else E.saveT = setTimeout(go, E.drag ? 500 : 200);
  }

  /* ---------------- checks: what the car would hide or can't draw ---------------- */
  function cornerY(x) {   // the glass's top corner edge at x (left; the right one its mirror): above it is hidden
    const c = geo() && geo().corner;
    if (!c || c.length < 2) return 0;
    const xx = x > W / 2 ? W - x : x;
    for (let i = 1; i < c.length; i++) if (xx <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; return y0 + (y1 - y0) * (xx - x0) / ((x1 - x0) || 1); }
    return 0;
  }
  function warnsOf(p, i) {
    const g = geo() || {}, out = [];
    if (i >= max()) out.push(['err', max() + '개를 넘어 그려지지 않음']);
    const r = { x: p.x, y: p.y, w: p.w, h: p.h };
    if (isFinite(g.stripY) && p.y + p.h > g.stripY) out.push(['warn', '순정 하단 줄에 가려짐']);
    if (overlap(r, g.notch)) out.push(['warn', '운전자 카메라에 가려짐']);
    if (p.y < cornerY(p.x) || p.y < cornerY(p.x + p.w)) out.push(['warn', '위쪽 모서리에 잘림']);
    if (overlap(r, g.telltales)) out.push(['warn', '순정 경고등 자리']);
    if ([g.gearbox, g.edrive].concat(g.mHoles || []).some((b) => overlap(r, b))) out.push(['info', '계기판 자체 상자 자리 (차·상황에 따라 보임)']);
    if (p.type === 'label') {
      const chars = E.info && E.info.chars && E.info.chars[D().font || 'bold'];
      const bad = chars ? Array.from(new Set(Array.from(String(p.text || '')).filter((c) => c !== ' ' && chars.indexOf(c) < 0))) : [];
      if (bad.length) out.push(['err', '글꼴에 없는 글자: ' + bad.slice(0, 8).join(' ') + (/[가-힣]/.test(bad.join('')) ? ' (한글 불가)' : '')]);
      if (!String(p.text || '').trim()) out.push(['warn', '글자가 비어 있음']);
      if (String(p.text || '').length > 40) out.push(['warn', '40자까지만 그려짐']);
    }
    return out;
  }

  /* ---------------- over the cluster: the outlines, to pick, drag and resize ---------------- */
  const svg = (tag, a) => { const e = document.createElementNS(NS, tag); Object.entries(a || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  function srcName(p) {
    if (p.type === 'label') return '"' + String(p.text || '').slice(0, 14) + '"';
    if (p.type === 'box' || p.type === 'line') return '';
    if (SRC_MAIN[p.src]) return SRC_MAIN[p.src];
    const r = E.info && (E.info.readouts.find((x) => x.k === p.src) || E.info.gauges.find((x) => x.k === p.src));
    return r ? (r.long || r.label || r.short || p.src) : String(p.src || '');
  }
  function draw() {
    view.replaceChildren();
    if (!E.on) return;
    const ps = D().pieces;
    ps.forEach((p, i) => {
      const t = TYPES[p.type] || TYPES.line, sel = i === E.sel, bad = warnsOf(p, i).some((w) => w[0] !== 'info');
      if (!E.outlines && !sel) return;
      const g = svg('g', { 'data-i': i, class: 'ep' + (sel ? ' sel' : '') });
      const r = svg('rect', { x: p.x, y: p.y, width: Math.max(p.w, 4), height: Math.max(p.h, 4), fill: sel ? t.color + '22' : 'transparent', stroke: bad ? '#ff5252' : t.color,
        'stroke-width': sel ? 4 : 2.5, 'stroke-dasharray': sel ? '' : '12 7', rx: p.type === 'dial' ? p.w / 2 : 0 });
      g.append(r);
      const lbl = svg('text', { x: p.x + 6, y: Math.max(20, p.y - 7), fill: bad ? '#ff8a80' : t.color, 'font-size': 20, 'font-family': 'Malgun Gothic, sans-serif' });
      lbl.textContent = (i + 1) + ' ' + t.name + (srcName(p) ? ' · ' + srcName(p) : '');
      g.append(lbl);
      if (sel) {
        const hs = p.type === 'dial' ? [['se', p.x + p.w, p.y + p.h], ['sw', p.x, p.y + p.h], ['ne', p.x + p.w, p.y], ['nw', p.x, p.y]]
          : [['se', p.x + p.w, p.y + p.h], ['sw', p.x, p.y + p.h], ['ne', p.x + p.w, p.y], ['nw', p.x, p.y], ['e', p.x + p.w, p.y + p.h / 2], ['w', p.x, p.y + p.h / 2], ['s', p.x + p.w / 2, p.y + p.h], ['n', p.x + p.w / 2, p.y]];
        hs.forEach(([k, x, y]) => g.append(svg('rect', { class: 'eh', 'data-h': k, x: x - 11, y: y - 11, width: 22, height: 22, fill: '#fff', stroke: t.color, 'stroke-width': 3 })));
      }
      view.append(g);
    });
    // the selected one last (on top), so its handles can be taken
    const s = view.querySelector('.ep.sel'); if (s) view.append(s);
  }
  const at = (e) => { const b = view.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; };
  const snap = (v, e) => (E.grid > 1 && !e.altKey ? Math.round(v / E.grid) * E.grid : Math.round(v));
  view.addEventListener('pointerdown', (e) => {
    if (!E.on) return;
    const g = e.target.closest('.ep'), h = e.target.getAttribute && e.target.getAttribute('data-h');
    if (!g) { E.sel = -1; draw(); panel(); return; }
    const i = +g.getAttribute('data-i');
    if (E.sel !== i) { E.sel = i; draw(); panel(); }
    const p = D().pieces[i];
    E.undo.push(JSON.stringify(E.designs)); E.redo = [];
    E.drag = { id: e.pointerId, h, from: at(e), p0: clone(p), moved: false };
    view.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  view.addEventListener('pointermove', (e) => {
    const d = E.drag;
    if (!d || d.id !== e.pointerId) return;
    const now = at(e), dx = now.x - d.from.x, dy = now.y - d.from.y, p = D().pieces[E.sel], o = d.p0;
    if (!p) return;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    if (!d.h) { p.x = snap(o.x + dx, e); p.y = snap(o.y + dy, e); } else {
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (/w/.test(d.h)) x0 = snap(o.x + dx, e); if (/e/.test(d.h)) x1 = snap(o.x + o.w + dx, e);
      if (/n/.test(d.h)) y0 = snap(o.y + dy, e); if (/s/.test(d.h)) y1 = snap(o.y + o.h + dy, e);
      if (p.type === 'dial') {
        // (square: the larger of the two moves; the corner across stays)
        const s = clamp(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), 60, 720);
        p.w = p.h = s; p.x = /w/.test(d.h) ? o.x + o.w - s : o.x; p.y = /n/.test(d.h) ? o.y + o.h - s : o.y;
      } else {
        p.x = Math.min(x0, x1); p.y = Math.min(y0, y1); p.w = Math.max(1, Math.abs(x1 - x0)); p.h = Math.max(1, Math.abs(y1 - y0));
      }
    }
    fit(p); draw(); refresh(); saveSoon();
  });
  const end = (e) => {
    const d = E.drag;
    if (!d || d.id !== e.pointerId) return;
    E.drag = null;
    if (!d.moved) E.undo.pop(); else { saveSoon(true); panel(); }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  // keys over the editor (before the page's controller keys): nudge, delete, undo, copy
  window.addEventListener('keydown', (e) => {
    if (!E.on) return;
    const inField = e.target.closest && e.target.closest('input, select, textarea');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z') && !inField) { undo(!e.shiftKey); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y') && !inField) { undo(false); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (inField) return;
    const p = D().pieces[E.sel];
    const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (p && mv) { change((d) => { d.pieces[E.sel].x += mv[0]; d.pieces[E.sel].y += mv[1]; }, true); }
    else if (p && (e.key === 'Delete' || e.key === 'Backspace')) remove();
    else if (p && mod && (e.key === 'd' || e.key === 'D')) dup();
    else if (e.key === 'Escape') { E.sel = -1; draw(); panel(); }
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  /* ---------------- the editor below the cluster ---------------- */
  const btnEl = (text, fn, attrs) => el('button', Object.assign({ textContent: text, on: { click: fn } }, attrs || {}));
  const field = (label, ctl, cls) => el('label', { className: 'ef' + (cls ? ' ' + cls : '') }, el('span', { textContent: label }), ctl);
  const numIn = (v, lo, hi, step, set) => el('input', { type: 'number', value: v, min: lo, max: hi, step: step || 1, on: { change: (e) => { const n = Number(e.target.value); if (isFinite(n)) set(clamp(n, lo, hi)); } } });
  const selIn = (v, opts, set) => { const s = el('select', { on: { change: (e) => set(e.target.value) } }); opts.forEach(([k, n]) => s.append(el('option', { value: String(k), textContent: n }))); s.value = String(v); return s; };
  const chk = (v, set) => el('input', { type: 'checkbox', checked: !!v, on: { change: (e) => set(e.target.checked) } });
  const range = (v, lo, hi, step, set) => {
    const out = el('span', { className: 'rv', textContent: String(v) });
    const r = el('input', { type: 'range', min: lo, max: hi, step, value: v, on: { input: (e) => { out.textContent = e.target.value; }, change: (e) => set(Number(e.target.value)) } });
    return el('span', { className: 'rg' }, r, out);
  };
  /** a piece's colour: one of the layout's colours (a role), or its own */
  function colourIn(v, dflt, set) {
    const own = isHex(v);
    const s = el('select');
    Object.keys(ROLE_NAMES).forEach((k) => s.append(el('option', { value: k, textContent: ROLE_NAMES[k] + (k === dflt ? ' (기본)' : '') })));
    s.append(el('option', { value: '#', textContent: '직접 고르기…' }));
    s.value = own ? '#' : (v && ROLE_NAMES[v] ? v : dflt);
    const pal = palette();
    const c = el('input', { type: 'color', value: own ? v : pal[s.value] || '#ffffff', on: { change: (e) => set(e.target.value) } });
    c.hidden = !own;
    s.onchange = () => { if (s.value === '#') { c.hidden = false; set(c.value); } else set(s.value === dflt ? undefined : s.value); };
    return el('span', { className: 'cl' }, s, c);
  }
  function palette(look) {
    const d = D(), out = Object.assign({}, roles());
    const put = (src) => { if (src) Object.keys(out).forEach((k) => { if (isHex(src[k])) out[k] = src[k]; }); };
    put(d.colors); if (look) put(d.looks && d.looks[look]);
    return out;
  }
  function srcOpts(type) {
    const info = E.info || { readouts: [], gauges: [] };
    if (type === 'dial') return [['speed', '속도'], ['rpm', '엔진 회전수']].concat(info.gauges.map((g) => [g.k, '작은 계기: ' + (g.label || g.k)]));
    const rs = info.readouts.filter((r) => r.k !== 'gear').map((r) => [r.k, (r.long || r.short || r.k) + (r.short && r.long ? ' (' + r.short + ')' : '')]);
    if (type === 'bar') return [['speed', '속도'], ['rpm', '엔진 회전수']].concat(rs);
    return [['speed', '속도'], ['rpm', '엔진 회전수'], ['gear', '기어'], ['outside', '바깥 온도']].concat(rs);
  }
  const setP = (k, quiet) => (v) => change((d) => { const p = d.pieces[E.sel]; if (v === undefined) delete p[k]; else p[k] = v; }, quiet);

  function props() {
    const p = D().pieces[E.sel];
    if (!p) return [el('div', { className: 'dim', textContent: '계기판 위의 조각을 누르거나 목록에서 고르세요. 끌어서 옮기고, 흰 네모로 크기를 바꿉니다.' })];
    const out = [el('div', { className: 'eh2' }, el('b', { textContent: (E.sel + 1) + '. ' + (TYPES[p.type] || {}).name }), el('span', { className: 'dim', textContent: ' ' + srcName(p) }))];
    const geom = el('div', { className: 'eg' }, field('X', numIn(p.x, 0, W, 1, setP('x'))), field('Y', numIn(p.y, 0, H, 1, setP('y'))));
    if (p.type === 'dial') geom.append(field('크기', numIn(p.w, 60, 720, 1, (v) => change((d) => { const q = d.pieces[E.sel]; q.w = q.h = v; }))));
    else geom.append(field('너비', numIn(p.w, 1, W, 1, setP('w'))), field('높이' + (p.type === 'readout' || p.type === 'label' ? ' (글자 크기)' : ''), numIn(p.h, 1, H, 1, setP('h'))));
    out.push(geom);
    const f = el('div', { className: 'eg' });
    if (p.type === 'dial') {
      f.append(field('표시할 값', selIn(p.src || 'speed', srcOpts('dial'), setP('src'))));
      if (p.src === 'speed' || p.src === 'rpm' || !p.src) f.append(field('눈금 숫자', chk(p.numerals !== false, (v) => setP('numerals')(v ? undefined : false))));
      f.append(field('테두리', chk(p.bezel !== false, (v) => setP('bezel')(v ? undefined : false))));
      const arc = p.arc || [-135, 135];
      f.append(field('시작 각도', numIn(arc[0], -180, 0, 5, (v) => setP('arc')([v, arc[1]]))), field('끝 각도', numIn(arc[1], 0, 180, 5, (v) => setP('arc')([arc[0], v]))));
    } else if (p.type === 'readout') {
      f.append(field('표시할 값', selIn(p.src || 'speed', srcOpts('readout'), setP('src'))));
      if (p.src !== 'gear') f.append(field('단위', chk(p.unit !== false, (v) => setP('unit')(v ? undefined : false))));
      if (!SRC_MAIN[p.src || 'speed']) f.append(field('이름 붙이기', selIn(p.name || 'none', [['none', '없음'], ['short', '짧게 (OIL)'], ['long', '길게 (ENGINE OIL)']], (v) => setP('name')(v === 'none' ? undefined : v))));
      if (p.src === 'rpm') f.append(field('경고 색 (노랑/빨강)', chk(p.rpmColors !== false, (v) => setP('rpmColors')(v ? undefined : false))));
      f.append(field('색', colourIn(p.color, 'text', setP('color'))), field('정렬', selIn(p.align === undefined ? 0.5 : p.align, ALIGNS, (v) => setP('align')(Number(v)))),
        field('빛번짐', range(p.glow === undefined ? 0.25 : p.glow, 0, 1, 0.05, setP('glow'))), field('자간', range(p.tracking || 0, -0.2, 1, 0.02, setP('tracking'))));
    } else if (p.type === 'label') {
      f.append(field('글자 (영문·숫자)', el('input', { type: 'text', value: p.text || '', maxLength: 40, on: { change: (e) => setP('text')(e.target.value) } }), 'wide'),
        field('색', colourIn(p.color, 'dim', setP('color'))), field('정렬', selIn(p.align === undefined ? 0.5 : p.align, ALIGNS, (v) => setP('align')(Number(v)))),
        field('빛번짐', range(p.glow === undefined ? 0.1 : p.glow, 0, 1, 0.05, setP('glow'))), field('자간', range(p.tracking === undefined ? 0.1 : p.tracking, -0.2, 1, 0.02, setP('tracking'))));
    } else if (p.type === 'bar') {
      f.append(field('표시할 값', selIn(p.src || 'rpm', srcOpts('bar'), setP('src'))), field('칸 수 (0: 이어진 막대)', numIn(p.segments || 0, 0, 60, 1, setP('segments'))),
        field('채움 색', colourIn(p.fill, 'accent', setP('fill'))), field('끝 색', colourIn(p.fill2, 'accent', setP('fill2'))), field('바탕 색', colourIn(p.track, 'track', setP('track'))));
    } else if (p.type === 'box') {
      f.append(field('위 색', colourIn(p.fill, 'boxTop', setP('fill'))), field('아래 색', colourIn(p.fill2, 'boxBottom', setP('fill2'))), field('테두리 색', colourIn(p.edge, 'boxEdge', setP('edge'))),
        field('모서리 둥글기', numIn(p.radius === undefined ? 12 : p.radius, 0, 200, 1, setP('radius'))), field('테두리 두께', numIn(p.border === undefined ? 1.5 : p.border, 0, 12, 0.5, setP('border'))));
    } else if (p.type === 'line') {
      f.append(field('색', colourIn(p.color, 'line', setP('color'))));
    }
    out.push(f);
    const ws = warnsOf(p, E.sel);
    if (ws.length) out.push(el('ul', { className: 'ew' }, ...ws.map(([k, s]) => el('li', { className: k, textContent: s }))));
    out.push(el('div', { className: 'btns' }, btnEl('↑ 뒤로', () => move(-1), { title: '먼저 그림 (다른 조각 아래)' }), btnEl('↓ 앞으로', () => move(1), { title: '나중에 그림 (다른 조각 위)' }),
      btnEl('복제', dup, { title: 'Ctrl+D' }), btnEl('삭제', remove, { className: 'danger', title: 'Delete' })));
    return out;
  }
  function move(by) {
    const i = E.sel, j = i + by;
    if (j < 0 || j >= D().pieces.length) return;
    change((d) => { const t = d.pieces[i]; d.pieces[i] = d.pieces[j]; d.pieces[j] = t; });
    E.sel = j; draw(); panel();
  }
  function dup() { const i = E.sel; change((d) => { const q = clone(d.pieces[i]); q.x += 20; q.y += 20; d.pieces.splice(i + 1, 0, q); }); E.sel = i + 1; draw(); panel(); }
  function remove() { const i = E.sel; change((d) => d.pieces.splice(i, 1)); E.sel = -1; draw(); panel(); }
  function add(type) { change((d) => d.pieces.push(fit(NEW[type]()))); E.sel = D().pieces.length - 1; draw(); panel(); }

  function list() {
    const ps = D().pieces;
    const rows = ps.map((p, i) => {
      const ws = warnsOf(p, i), worst = ws.some((w) => w[0] === 'err') ? 'err' : ws.some((w) => w[0] === 'warn') ? 'warn' : '';
      return el('div', { className: 'er' + (i === E.sel ? ' sel' : '') + (i >= max() ? ' over' : ''), on: { click: () => { E.sel = i; draw(); panel(); } } },
        el('span', { className: 'dot', style: 'background:' + (TYPES[p.type] || TYPES.line).color }), el('span', { textContent: (i + 1) + '. ' + (TYPES[p.type] || {}).name }),
        el('span', { className: 'dim', textContent: srcName(p) }), el('span', { className: 'wd ' + worst, textContent: worst ? '!' : '' }));
    });
    return rows.length ? rows : [el('div', { className: 'dim', textContent: '조각이 없습니다. 위에서 추가하거나 시작 모양을 고르세요.' })];
  }
  function colours() {
    const d = D(), look = E.look, src = look ? ((d.looks || (d.looks = {}))[look] || {}) : (d.colors || {}), pal = palette(look);
    const tabs = el('div', { className: 'seg2' }, ...LOOKS.map(([k, n]) => btnEl(n, () => { E.look = k; panel(); }, { className: k === look ? 'on' : '' })));
    const rows = Object.keys(ROLE_NAMES).filter((k) => roles()[k]).map((k) => {
      const own = isHex(src[k]);
      const c = el('input', { type: 'color', value: pal[k], on: { change: (e) => change((x) => { const t = look ? (x.looks[look] = x.looks[look] || {}) : (x.colors = x.colors || {}); t[k] = e.target.value; }) } });
      const reset = own ? btnEl('×', () => change((x) => { const t = look ? x.looks[look] : x.colors; delete t[k]; if (look && !Object.keys(t).length) delete x.looks[look]; }), { className: 'small', title: look ? '기본 색으로' : '앱의 기본 색으로' }) : el('span');
      return el('div', { className: 'ec' + (own ? ' own' : '') }, c, el('span', { textContent: ROLE_NAMES[k] }), reset);
    });
    return [tabs, el('div', { className: 'note dim', textContent: look ? '이 주행 모드에서만 바뀌는 색 (나머지는 기본 색)' : '레이아웃의 색. 조각마다 이 중 하나를 쓰거나 직접 고릅니다.' }), el('div', { className: 'ecs' }, ...rows)];
  }
  function checks() {
    const ps = D().pieces, all = [];
    if (ps.length > max()) all.push(['err', '조각 ' + ps.length + '개: ' + max() + '개까지만 그려집니다']);
    if (!ps.length) all.push(['info', '빈 레이아웃: 차에서는 "CUSTOM ' + E.slot + '" 글자만 보입니다']);
    let holes = 0;
    ps.forEach((p, i) => warnsOf(p, i).forEach(([k, s]) => { if (k === 'info') holes++; else all.push([k, (i + 1) + '. ' + (TYPES[p.type] || {}).name + ': ' + s]); }));
    if (!all.some((x) => x[0] !== 'info')) all.unshift(['ok', '가려지거나 빠지는 조각 없음']);
    if (holes) all.push(['info', '조각 ' + holes + '개가 계기판 자체 상자 자리와 겹침 (보통은 문제 없음: 안내선 보기로 확인)']);
    return el('ul', { className: 'ew' }, ...all.slice(0, 30).map(([k, s]) => el('li', { className: k, textContent: s })));
  }
  function files() {
    const fileIn = el('input', { type: 'file', accept: '.json,.js,application/json', hidden: true, on: { change: (e) => { const f = e.target.files[0]; if (f) f.text().then(importText); e.target.value = ''; } } });
    return [el('div', { className: 'btns' },
      btnEl('JSON 내보내기', () => download('custom' + E.slot + '.json', JSON.stringify(D(), null, 1)), { title: '이 슬롯의 디자인 (다시 불러오기, 다른 PC로 옮기기)' }),
      btnEl('불러오기…', () => fileIn.click(), { title: '내보낸 JSON 또는 custom_layouts.js' }),
      btnEl('앱에 넣을 파일', appFile, { className: 'primary', title: 'custom_layouts.js: 커스텀 1-3 모두' }), fileIn),
    el('div', { className: 'note dim', innerHTML: '차에 넣기: <b>앱에 넣을 파일</b>(custom_layouts.js)을 myapp-cluster의 <code>apps/akakingj_cluster_layouts/</code>에 넣고 배포 → 차에서 Store 업데이트 → Cluster Layouts 설정의 레이아웃: <b>커스텀 ' + E.slot + '</b>' })];
  }
  function download(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function appFile() {
    const list = [1, 2, 3].map((s) => E.designs[s]).filter((d) => d && d.pieces.length);
    const text = '/**\n * custom_layouts.js - Custom 1, 2 and 3 as they ship with the app (custom.js draws them; a design in the data folder\'s\n' +
      ' * custom_layouts.json comes first). Made in the MGU demo\'s layout editor, ' + new Date().toISOString().slice(0, 10) + '.\n */\nmodule.exports = ' + JSON.stringify(list, null, 2) + ';\n';
    download('custom_layouts.js', text);
  }
  function importText(text) {
    let j;
    try { j = JSON.parse(String(text).replace(/^[\s\S]*?module\.exports\s*=\s*/, '').replace(/;\s*$/, '')); } catch (e) { log('warn', '레이아웃 편집기: 읽을 수 없는 파일 (' + e.message + ')'); return; }
    const arr = Array.isArray(j) ? j : Array.isArray(j.layouts) ? j.layouts : [j];
    const ok = arr.filter((d) => d && typeof d === 'object' && Array.isArray(d.pieces));
    if (!ok.length) { log('warn', '레이아웃 편집기: 디자인이 없는 파일'); return; }
    change((cur) => {
      if (ok.length === 1) { E.designs[E.slot] = Object.assign(blank(E.slot), clone(ok[0]), { slot: E.slot }); return; }
      ok.forEach((d) => { const s = Number(d.slot); if ([1, 2, 3].indexOf(s) >= 0) E.designs[s] = Object.assign(blank(s), clone(d)); });
    });
    E.sel = -1; draw(); panel();
    log('info', '레이아웃 편집기: ' + ok.length + '개 불러옴');
  }

  function status() {
    const s = box.querySelector('#edState');
    if (s) s.textContent = (E.saved ? '저장됨 · 계기판에 1초 안에 반영' : '저장 중…');
    const n = box.querySelector('#edCount');
    if (n) { n.textContent = '조각 ' + D().pieces.length + ' / ' + max(); n.className = D().pieces.length > max() ? 'err' : 'dim'; }
  }
  /** the parts that change while dragging: the list, the selected piece's numbers, the checks */
  function refresh() {
    const l = box.querySelector('#edList'); if (l) l.replaceChildren(...list());
    const c = box.querySelector('#edChecks'); if (c) c.replaceChildren(checks());
    const p = D().pieces[E.sel], g = box.querySelector('#edProps .eg');
    if (p && g) { const ins = g.querySelectorAll('input'); const vals = p.type === 'dial' ? [p.x, p.y, p.w] : [p.x, p.y, p.w, p.h]; ins.forEach((x, i) => { if (document.activeElement !== x && vals[i] !== undefined) x.value = vals[i]; }); }
    status();
  }
  function panel() {
    if (!E.on) return;
    const d = D();
    const info = E.info;
    const slots = el('div', { className: 'seg2' }, ...[1, 2, 3].map((s) => btnEl('커스텀 ' + s + (E.designs[s] && E.designs[s].pieces.length ? '' : ' (빈칸)'), () => { E.slot = s; E.sel = -1; send({ t: 'custom-show', slot: s }); draw(); panel(); }, { className: s === E.slot ? 'on' : '' })));
    const head = el('div', { className: 'ehd' }, el('b', { textContent: '레이아웃 편집기' }), slots, el('span', { id: 'edCount' }), el('span', { className: 'sp' }),
      el('span', { id: 'edState', className: 'dim' }),
      btnEl('↶', () => undo(true), { title: '되돌리기 (Ctrl+Z)', disabled: !E.undo.length }), btnEl('↷', () => undo(false), { title: '다시 하기 (Ctrl+Y)', disabled: !E.redo.length }),
      btnEl('편집 끝', () => toggle(false), { className: 'primary', title: '편집을 마치고 원래 레이아웃으로' }));
    const addRow = el('div', { className: 'btns' }, ...Object.keys(NEW).map((k) => btnEl('+ ' + TYPES[k].name, () => add(k))));
    const tpl = selIn('', [['', '시작 모양 고르기…']].concat(Object.keys(TEMPLATES).map((k) => [k, TEMPLATES[k].name])), (v) => {
      if (!TEMPLATES[v]) return;
      if (d.pieces.length && !window.confirm('지금 조각을 모두 지우고 "' + TEMPLATES[v].name + '"(으)로 시작할까요? (되돌리기 가능)')) { panel(); return; }
      change((x) => { x.pieces = clone(TEMPLATES[v].pieces); }); E.sel = -1; draw(); panel();
    });
    const view1 = el('div', { className: 'eg' },
      field('격자', selIn(E.grid, [[1, '없음'], [5, '5 px'], [10, '10 px'], [20, '20 px']], (v) => { E.grid = Number(v); })),
      field('윤곽선', chk(E.outlines, (v) => { E.outlines = v; draw(); })),
      field('주행 모드로 보기', selIn('', [['', '—']].concat(DRIVE), (v) => { if (v) { send({ t: 'vehset', v: { driveMode: v }, keep: true }); E.look = v === 'SPORT' ? 'sport' : v === 'ECO PRO' ? 'efficient' : ''; panel(); } })));
    const fonts = (info && info.fonts) || ['bold', 'light', 'wide', 'orb'];
    const meta = el('div', { className: 'eg' },
      field('이름 (앱 목록에 보임)', el('input', { type: 'text', value: d.title || '', maxLength: 24, on: { change: (e) => change((x) => { x.title = e.target.value.slice(0, 24); }) } }), 'wide'),
      field('글꼴', selIn(fonts.indexOf(d.font) >= 0 ? d.font : 'bold', fonts.map((f) => [f, FONT_NAMES[f] || f]), (v) => change((x) => { x.font = v; }))),
      field('', btnEl('이 슬롯 비우기', () => { if (window.confirm('커스텀 ' + E.slot + '의 조각과 색을 모두 지울까요? (되돌리기 가능)')) { change(() => { E.designs[E.slot] = blank(E.slot); }); E.sel = -1; draw(); panel(); } }, { className: 'danger' })));
    const col = (title, ...kids) => el('div', { className: 'ecol' }, el('h3', { textContent: title }), ...kids);
    const warn = !info ? el('div', { className: 'ew err', textContent: 'AK Cluster Layouts가 없습니다 (myapp-cluster 폴더 확인)' })
      : info.missing ? el('div', { className: 'ew err', textContent: 'myapp-cluster의 Cluster Layouts가 커스텀 레이아웃 이전 버전입니다 (0.53.0 이상 필요): 데모 업데이트를 받으세요' })
        : info.error ? el('div', { className: 'ew err', textContent: 'Cluster Layouts를 읽지 못함: ' + info.error }) : null;
    box.replaceChildren(head, ...(warn ? [warn] : []), el('div', { className: 'ecols' },
      col('조각', addRow, tpl, el('div', { id: 'edList', className: 'el' }, ...list())),
      col('선택한 조각', el('div', { id: 'edProps' }, ...props())),
      col('레이아웃', meta, el('h4', { textContent: '색' }), ...colours(), el('h4', { textContent: '검사' }), el('div', { id: 'edChecks' }, checks()),
        el('h4', { textContent: '보기' }), view1, el('h4', { textContent: '파일' }), ...files())));
    status();
  }

  /* ---------------- on and off ---------------- */
  function toggle(on) {
    if (on === E.on) return;
    E.on = on;
    document.body.classList.toggle('editing', on);
    btn.classList.toggle('on', on);
    btn.textContent = on ? '✏️ 편집 중' : '✏️ 레이아웃 편집';
    if (on) { send({ t: 'custom-show', slot: E.slot }); panel(); } else { send({ t: 'custom-done' }); box.replaceChildren(); }
    draw();
    window.dispatchEvent(new Event('resize'));
  }
  btn.onclick = () => toggle(!E.on);

  return {
    hello(m) {
      E.info = m.custom || null;
      btn.disabled = !E.info;
      btn.title = E.info ? 'AK Cluster Layouts의 커스텀 1-3을 계기판 위에서 만듭니다' : 'AK Cluster Layouts가 없습니다';
      this.designs(m.designs || [], true);
    },
    designs(list, first) {
      const by = {};
      (list || []).forEach((d) => { if (d && [1, 2, 3].indexOf(Number(d.slot)) >= 0 && Array.isArray(d.pieces)) by[Number(d.slot)] = Object.assign(blank(Number(d.slot)), d); });
      // (none here yet: the designs that ship with the app, to start from)
      if (first && !Object.keys(by).length && E.info && Array.isArray(E.info.shipped)) E.info.shipped.forEach((d) => { if (d && [1, 2, 3].indexOf(Number(d.slot)) >= 0) by[Number(d.slot)] = Object.assign(blank(Number(d.slot)), d); });
      E.designs = by;
      if (E.sel >= D().pieces.length) E.sel = -1;
      draw(); panel();
    },
    geo() { draw(); if (E.on) refresh(); },
    get on() { return E.on; },
  };
}
