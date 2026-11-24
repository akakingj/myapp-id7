// cockpit.js - the MGU demo's driver's seat: the steering wheel, the pedals and the iDrive controller, drawn as the
// car has them (original drawings: no maker's marks). They show what the car's values say (the steering angle, the
// accelerator, braking, the indicators) and what the controller does (turns, pushes, presses), whoever does it: the
// mouse wheel or keys over the centre display, or these drawings themselves. Each can be used too: drag the wheel,
// press the pedals, turn, push and press the controller, its MENU and BACK.
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------------- the drawings (viewBox units; each turns or moves about its own centre) ---------------- */
const WHEEL = `
<svg class="ck-svg" viewBox="-110 -110 220 220" aria-label="핸들">
  <defs>
    <radialGradient id="ckPad" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#2b3038"/><stop offset="1" stop-color="#121418"/></radialGradient>
    <linearGradient id="ckSpoke" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4049"/><stop offset="1" stop-color="#1b1e23"/></linearGradient>
    <linearGradient id="ckRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b525c"/><stop offset=".45" stop-color="#1f2328"/><stop offset="1" stop-color="#3a4048"/></linearGradient>
  </defs>
  <g class="ck-rot" data-part="wheel">
    <circle r="94" fill="none" stroke="url(#ckRim)" stroke-width="20"/>
    <circle r="104" fill="none" stroke="#5a616b" stroke-width="1"/>
    <circle r="84" fill="none" stroke="#08090b" stroke-width="1.2"/>
    <circle r="94" fill="none" stroke="#6b737e" stroke-width=".7" stroke-dasharray="2 2.4" opacity=".7"/>
    <!-- (the grips at a quarter to three: perforated) -->
    <path d="M -93 -32 A 99 99 0 0 0 -93 32" transform="scale(1.01)" fill="none" stroke="#0d0f12" stroke-width="17" stroke-dasharray="1.4 2.2"/>
    <path d="M 93 -32 A 99 99 0 0 1 93 32" transform="scale(1.01)" fill="none" stroke="#0d0f12" stroke-width="17" stroke-dasharray="1.4 2.2"/>
    <!-- (the centre mark at the top: where straight ahead is) -->
    <rect x="-4" y="-103" width="8" height="18" rx="1.5" fill="#ff8a3d"/>
    <!-- spokes: across, and the double one down -->
    <path d="M -86 -6 C -64 -10 -48 -14 -34 -12 L -32 14 C -50 16 -66 14 -86 12 Z" fill="url(#ckSpoke)" stroke="#0b0c0e"/>
    <path d="M 86 -6 C 64 -10 48 -14 34 -12 L 32 14 C 50 16 66 14 86 12 Z" fill="url(#ckSpoke)" stroke="#0b0c0e"/>
    <path d="M -28 30 L -16 87 L 16 87 L 28 30 L 13 34 L 0 66 L -13 34 Z" fill="url(#ckSpoke)" stroke="#0b0c0e"/>
    <!-- buttons on the spokes -->
    <g fill="#262a31" stroke="#0b0c0e" stroke-width=".8">
      <rect x="-76" y="-4" width="11" height="8" rx="2.5"/><rect x="-62" y="-6" width="11" height="8" rx="2.5"/><rect x="-62" y="5" width="11" height="8" rx="2.5"/><rect x="-48" y="-1" width="9" height="9" rx="4.5"/>
      <rect x="65" y="-4" width="11" height="8" rx="2.5"/><rect x="51" y="-6" width="11" height="8" rx="2.5"/><rect x="51" y="5" width="11" height="8" rx="2.5"/><rect x="39" y="-1" width="9" height="9" rx="4.5"/>
    </g>
    <!-- the pad -->
    <path d="M -38 -22 C -38 -36 -26 -40 0 -40 C 26 -40 38 -36 38 -22 L 34 22 C 32 36 18 42 0 42 C -18 42 -32 36 -34 22 Z" fill="url(#ckPad)" stroke="#07080a" stroke-width="1.5"/>
    <circle r="9" cy="-6" fill="#1f2329" stroke="#3a4049" stroke-width="1.2"/>
    <circle r="3" cy="-6" fill="#3a4049"/>
  </g>
</svg>`;

const CONTROLLER = `
<svg class="ck-svg" viewBox="-120 -92 240 184" aria-label="iDrive 컨트롤러">
  <defs>
    <radialGradient id="ckTouch" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#2a2f37"/><stop offset="1" stop-color="#0b0d10"/></radialGradient>
    <linearGradient id="ckChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ced6"/><stop offset=".5" stop-color="#6d737c"/><stop offset="1" stop-color="#d3d7de"/></linearGradient>
    <linearGradient id="ckBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e23"/><stop offset="1" stop-color="#0f1114"/></linearGradient>
  </defs>
  <rect x="-116" y="-88" width="232" height="176" rx="26" fill="url(#ckBase)" stroke="#2b3038"/>
  <!-- the buttons: media, phone, map above; menu, back, option below -->
  <g class="ck-btns" font-family="system-ui, sans-serif" font-size="10" font-weight="600" text-anchor="middle">
    <g class="ck-btn off" data-btn="media" transform="translate(-74 -66)"><rect x="-26" y="-11" width="52" height="22" rx="7"/><text y="3.5">MEDIA</text></g>
    <g class="ck-btn off" data-btn="com" transform="translate(-86 -24)"><rect x="-22" y="-11" width="44" height="22" rx="7"/><text y="3.5">COM</text></g>
    <g class="ck-btn off" data-btn="map" transform="translate(-86 18)"><rect x="-22" y="-11" width="44" height="22" rx="7"/><text y="3.5">MAP</text></g>
    <g class="ck-btn" data-btn="menu" transform="translate(74 -66)"><rect x="-26" y="-11" width="52" height="22" rx="7"/><text y="3.5">MENU</text></g>
    <g class="ck-btn" data-btn="back" transform="translate(86 -24)"><rect x="-22" y="-11" width="44" height="22" rx="7"/><text y="3.5">BACK</text></g>
    <g class="ck-btn off" data-btn="option" transform="translate(86 18)"><rect x="-22" y="-11" width="44" height="22" rx="7"/><text y="3.5">OPTION</text></g>
  </g>
  <!-- which way it was pushed -->
  <g class="ck-arrows" fill="#3d9cff">
    <path data-dir="N" d="M 0 -76 L 7 -67 L -7 -67 Z"/><path data-dir="S" d="M 0 76 L 7 67 L -7 67 Z"/>
    <path data-dir="W" d="M -66 0 L -57 -7 L -57 7 Z"/><path data-dir="E" d="M 66 0 L 57 -7 L 57 7 Z"/>
  </g>
  <!-- which way it was turned: an arc that shows for a moment -->
  <g class="ck-turn">
    <path class="cw" d="M 24 -56 A 61 61 0 0 1 58 -22" fill="none" stroke="#3d9cff" stroke-width="3.5" stroke-linecap="round"/><path class="cw" d="M 60 -14 L 63 -27 L 51 -24 Z" fill="#3d9cff"/>
    <path class="ccw" d="M -24 -56 A 61 61 0 0 0 -58 -22" fill="none" stroke="#3d9cff" stroke-width="3.5" stroke-linecap="round"/><path class="ccw" d="M -60 -14 L -63 -27 L -51 -24 Z" fill="#3d9cff"/>
  </g>
  <g class="ck-knob">
    <circle r="50" fill="#07080a"/>
    <g class="ck-rot" data-part="knob">
      <circle r="47" fill="url(#ckChrome)"/>
      <circle r="47" fill="none" stroke="#3a3f46" stroke-width="6" stroke-dasharray="1.6 2.5" opacity=".75"/>
      <rect x="-1.5" y="-47" width="3" height="7" fill="#ff8a3d"/>
    </g>
    <circle r="38" fill="#101215" stroke="#565c65" stroke-width="1"/>
    <circle class="ck-pad" r="34" fill="url(#ckTouch)"/>
    <circle class="ck-dot" r="5" fill="#3a4049"/>
  </g>
</svg>`;

const PEDALS = `
<svg class="ck-svg" viewBox="0 0 200 180" aria-label="페달">
  <defs>
    <linearGradient id="ckRubber" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a1d21"/><stop offset=".5" stop-color="#2c3037"/><stop offset="1" stop-color="#1a1d21"/></linearGradient>
    <linearGradient id="ckAlu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c838d"/><stop offset=".5" stop-color="#c7ccd3"/><stop offset="1" stop-color="#7c838d"/></linearGradient>
  </defs>
  <rect x="0" y="160" width="200" height="20" fill="#0d0f12"/>
  <!-- the brake: hanging from above -->
  <g class="ck-brake">
    <rect x="56" y="0" width="8" height="62" fill="#2a2e34"/>
    <g class="ck-mv">
      <rect x="18" y="56" width="84" height="58" rx="10" fill="url(#ckAlu)" stroke="#0b0c0e"/>
      <g fill="#1b1e22"><rect x="26" y="66" width="68" height="5" rx="2.5"/><rect x="26" y="78" width="68" height="5" rx="2.5"/><rect x="26" y="90" width="68" height="5" rx="2.5"/><rect x="26" y="102" width="68" height="5" rx="2.5"/></g>
    </g>
  </g>
  <!-- the accelerator: standing on the floor, hinged at its foot -->
  <g class="ck-accel">
    <g class="ck-mv">
      <rect x="124" y="30" width="50" height="130" rx="9" fill="url(#ckAlu)" stroke="#0b0c0e"/>
      <g fill="#1b1e22"><rect x="131" y="42" width="36" height="4" rx="2"/><rect x="131" y="56" width="36" height="4" rx="2"/><rect x="131" y="70" width="36" height="4" rx="2"/><rect x="131" y="84" width="36" height="4" rx="2"/><rect x="131" y="98" width="36" height="4" rx="2"/><rect x="131" y="112" width="36" height="4" rx="2"/><rect x="131" y="126" width="36" height="4" rx="2"/><rect x="131" y="140" width="36" height="4" rx="2"/></g>
    </g>
    <rect x="132" y="156" width="34" height="8" rx="3" fill="#2a2e34"/>
  </g>
</svg>`;

export function makeCockpit({ $, el, ctl, manualSet, send, car }) {
  const box = $('#cockpit');
  const card = (cls, title, svg, foot) => el('div', { className: 'ck-card ' + cls }, el('div', { className: 'ck-title', textContent: title }), el('div', { className: 'ck-draw', innerHTML: svg }), foot);
  const wheelOut = el('span', { className: 'ck-val' }), pedalOut = el('span', { className: 'ck-val' }), ctlOut = el('span', { className: 'ck-val' });
  const indL = el('button', { className: 'ck-ind l', textContent: '◀', title: '왼쪽 방향지시등' }), indR = el('button', { className: 'ck-ind r', textContent: '▶', title: '오른쪽 방향지시등' });
  const wheelCard = card('ck-wheel', '핸들', WHEEL, el('div', { className: 'ck-foot' }, wheelOut));
  wheelCard.querySelector('.ck-draw').append(indL, indR);
  const pedalCard = card('ck-pedals', '페달', PEDALS, el('div', { className: 'ck-foot' }, pedalOut));
  const ctlCard = card('ck-ctl', 'iDrive 컨트롤러', CONTROLLER, el('div', { className: 'ck-foot' }, ctlOut));
  box.replaceChildren(wheelCard, pedalCard, ctlCard);

  const wheelRot = wheelCard.querySelector('.ck-rot'), knob = ctlCard.querySelector('.ck-knob'), knobRot = ctlCard.querySelector('.ck-rot');
  const accel = pedalCard.querySelector('.ck-accel .ck-mv'), brake = pedalCard.querySelector('.ck-brake .ck-mv');
  const K = { angle: 0, tilt: null, press: false, turnT: null, hand: { steer: null, pedal: null, brake: null } };

  /* ---------------- what the car says ---------------- */
  function veh() {
    const v = car.v, x = car.extra || {};
    const steer = K.hand.steer !== null ? K.hand.steer : Number(v.steer) || 0;
    wheelRot.style.transform = `rotate(${steer}deg)`;
    wheelOut.textContent = '조향각 ' + (steer > 0 ? '+' : '') + Math.round(steer) + '°' + (Math.abs(steer) < 3 ? ' (직진)' : steer < 0 ? ' (왼쪽)' : ' (오른쪽)');
    const ind = x.indicator || 'off';
    indL.classList.toggle('on', ind === 'left' || ind === 'both'); indR.classList.toggle('on', ind === 'right' || ind === 'both');
    const p = K.hand.pedal !== null ? K.hand.pedal : clamp(Number(v.pedal) || 0, 0, 100);
    // (braking: the hand's, or the drive's: slowing down with the accelerator up)
    const b = K.hand.brake !== null ? K.hand.brake : car.mode === 'auto' ? (car.phase === 'brake' ? 0.7 : 0) : clamp(-(Number(v.gLong) || 0) / 0.9, 0, 1) * (p < 1 ? 1 : 0);
    accel.style.transform = `scaleY(${1 - 0.28 * p / 100})`;
    accel.style.filter = `brightness(${1 - 0.35 * p / 100})`;
    brake.style.transform = `translateY(${b * 22}px) scale(${1 - 0.06 * b})`;
    brake.style.filter = `brightness(${1 - 0.35 * b})`;
    pedalOut.textContent = '가속 ' + Math.round(p) + '%' + (b > 0.05 ? ' · 브레이크' : '') + (car.mode === 'auto' ? ' · 자동 주행' : '');
  }

  /* ---------------- what the controller did (from here, the keys or the mouse wheel over the screen) ---------------- */
  const DIR_KO = { N: '위', S: '아래', E: '오른쪽', W: '왼쪽' };
  function say(s) { ctlOut.textContent = s; }
  function turn(n) {
    K.angle += n * 15;                          // (a detent: 24 a turn)
    knobRot.style.transform = `rotate(${K.angle}deg)`;
    ctlCard.classList.remove('cw', 'ccw'); void ctlCard.offsetWidth; ctlCard.classList.add(n > 0 ? 'cw' : 'ccw');
    clearTimeout(K.turnT); K.turnT = setTimeout(() => ctlCard.classList.remove('cw', 'ccw'), 350);
    say(n > 0 ? '돌림 ▶ 시계 방향 (+' + n + ')' : '돌림 ◀ 반시계 방향 (' + n + ')');
  }
  function press(on) { K.press = on; knob.classList.toggle('pressed', on); if (on) say('누름'); }
  function tilt(d) {
    K.tilt = d;
    const o = { N: [0, -10], S: [0, 10], E: [10, 0], W: [-10, 0] }[d] || [0, 0];
    knob.style.transform = `translate(${o[0]}px, ${o[1]}px)`;
    ctlCard.querySelectorAll('.ck-arrows path').forEach((a) => a.classList.toggle('on', a.dataset.dir === d));
    if (d) say('밀기: ' + DIR_KO[d]);
  }
  function btn(name) {
    const b = ctlCard.querySelector('[data-btn="' + name + '"]');
    if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 220); }
    say(name.toUpperCase());
  }
  say('휠·키·마우스로 조작');

  /* ---------------- using them ---------------- */
  const svgOf = (card) => card.querySelector('svg');
  /** a pointer's place in an svg's own units */
  const local = (svg, e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function drag(target, on) {
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const move = on(e);
      if (!move) return;
      e.preventDefault();
      try { target.setPointerCapture(e.pointerId); } catch (x) { /* gone */ }
      const mv = (ev) => { if (ev.pointerId === e.pointerId) move.move(ev); };
      const end = (ev) => { if (ev.pointerId !== e.pointerId) return; target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); move.end(ev); };
      target.addEventListener('pointermove', mv); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
    });
  }
  // the wheel: turned by its rim; a double click: straight ahead
  {
    const svg = svgOf(wheelCard);
    let last = 0;
    const set = (deg) => { K.hand.steer = clamp(Math.round(deg), -450, 450); veh(); const t = performance.now(); if (t - last > 40) { last = t; manualSet({ steer: K.hand.steer }); } };
    drag(svg, (e) => {
      const a0 = Math.atan2(local(svg, e).y, local(svg, e).x), s0 = Number(car.v.steer) || 0;
      let prev = a0, acc = 0;
      return {
        move: (ev) => { const p = local(svg, ev), a = Math.atan2(p.y, p.x); let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; prev = a; acc += d; set(s0 + acc * 180 / Math.PI); },
        end: () => { if (K.hand.steer !== null) manualSet({ steer: K.hand.steer }); K.hand.steer = null; },
      };
    });
    svg.addEventListener('dblclick', () => { manualSet({ steer: 0 }); veh(); });
    indL.onclick = () => send({ t: 'extra', k: 'indicator', v: (car.extra || {}).indicator === 'left' ? 'off' : 'left' });
    indR.onclick = () => send({ t: 'extra', k: 'indicator', v: (car.extra || {}).indicator === 'right' ? 'off' : 'right' });
  }
  // the pedals: pressed while held (down: further); let go, they come back
  {
    const svg = svgOf(pedalCard);
    const pedal = (which) => drag(svg.querySelector(which === 'accel' ? '.ck-accel' : '.ck-brake'), (e) => {
      const y0 = local(svg, e).y;
      const put = (y) => {
        const f = clamp(0.25 + (y - y0) / 70, 0, 1);
        if (which === 'accel') { K.hand.pedal = Math.round(f * 100); manualSet({ pedal: K.hand.pedal, throttle: K.hand.pedal }); } else { K.hand.brake = f; manualSet({ pedal: 0, throttle: 0, gLong: -Math.round(f * 90) / 100 }); }
        veh();
      };
      put(y0);
      return {
        move: (ev) => put(local(svg, ev).y),
        end: () => { if (which === 'accel') { K.hand.pedal = null; manualSet({ pedal: 0, throttle: 0 }); } else { K.hand.brake = null; manualSet({ gLong: 0 }); } veh(); },
      };
    });
    pedal('accel'); pedal('brake');
  }
  // the controller: the mouse wheel over it turns it; the ring dragged round turns it; the middle pressed presses it,
  // pushed off the middle (a drag past its edge) pushes it that way; MENU and BACK
  {
    const svg = svgOf(ctlCard);
    let acc = 0;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      acc += e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY * 3 : e.deltaY / 60;
      const n = Math.trunc(acc);
      if (n) { acc -= n; ctl.turn(n); }
    }, { passive: false });
    drag(knob, (e) => {
      const p0 = local(svg, e), r = Math.hypot(p0.x, p0.y);
      if (r > 52) return null;
      if (r > 36) {                                // the ring: turned, a detent every 15 degrees
        let prev = Math.atan2(p0.y, p0.x), acc2 = 0;
        return {
          move: (ev) => { const p = local(svg, ev), a = Math.atan2(p.y, p.x); let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; prev = a; acc2 += d * 180 / Math.PI; while (Math.abs(acc2) >= 15) { const s = Math.sign(acc2); acc2 -= s * 15; ctl.turn(s); } },
          end: () => {},
        };
      }
      // (held still a moment: pressed; moved off the middle first: pushed that way; a quick click: a press)
      let dir = null, pressed = false;
      const t = setTimeout(() => { if (!dir) { pressed = true; ctl.press(true); } }, 140);
      return {
        move: (ev) => {
          if (pressed) return;
          const p = local(svg, ev), dx = p.x - p0.x, dy = p.y - p0.y;
          const want = Math.hypot(dx, dy) < 14 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
          if (want === dir) return;
          clearTimeout(t);
          if (dir) ctl.tilt(null);
          dir = want;
          if (dir) ctl.tilt(dir);
        },
        end: () => { clearTimeout(t); if (pressed) ctl.press(false); else if (dir) ctl.tilt(null); else { ctl.press(true); setTimeout(() => ctl.press(false), 90); } },
      };
    });
    ctlCard.querySelectorAll('.ck-arrows path').forEach((a) => drag(a, () => { ctl.tilt(a.dataset.dir); return { move: () => {}, end: () => ctl.tilt(null) }; }));
    ctlCard.querySelectorAll('.ck-btn').forEach((b) => {
      const name = b.dataset.btn;
      if (b.classList.contains('off')) { b.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: name.toUpperCase() + ': 데모에는 없는 버튼' })); b.onclick = () => btn(name); return; }
      b.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: name === 'menu' ? 'MENU: 홈 (앱 목록), H 키' : 'BACK: 뒤로, Backspace 키' }));
      b.onclick = () => (name === 'menu' ? ctl.home() : ctl.back());
    });
  }
  return { veh, turn, press, tilt, btn };
}
