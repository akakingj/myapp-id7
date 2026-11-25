// cockpit.js - the MGU demo's driver's seat: the steering wheel, the pedals and the centre console (the gear selector
// with its buttons, the iDrive controller), drawn as the car has them laid out (original drawings: no maker's marks).
// They show what the car's values say (the steering angle, the accelerator, braking, the indicators, the gear, the
// drive mode, the engine) and what the controller does (turns, pushes, presses), whoever does it: the mouse wheel or
// keys over the centre display, or these drawings themselves. Each can be used too: drag the wheel, press the pedals,
// move the lever, press P, the drive modes and START/STOP, turn, push and press the controller, its HOME and BACK.
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

// the centre console: the gear selector and its buttons (left), the iDrive controller (right), as the car's are laid
// out (an original drawing: the layout and the labels only)
const KX = 452, KY = 172;                     // (the controller's middle)
const CONSOLE = `
<svg class="ck-svg" viewBox="0 0 620 300" aria-label="센터 콘솔: 기어와 iDrive 컨트롤러">
  <defs>
    <radialGradient id="ckTouch" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#262b32"/><stop offset="1" stop-color="#090a0c"/></radialGradient>
    <linearGradient id="ckChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e6eb"/><stop offset=".45" stop-color="#8b929b"/><stop offset=".55" stop-color="#6c727b"/><stop offset="1" stop-color="#d9dde3"/></linearGradient>
    <linearGradient id="ckPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2025"/><stop offset="1" stop-color="#121417"/></linearGradient>
    <linearGradient id="ckGlass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05060a"/><stop offset=".35" stop-color="#3a414c"/><stop offset=".5" stop-color="#1b1f26"/><stop offset="1" stop-color="#07080b"/></linearGradient>
  </defs>
  <!-- the panel and its trim -->
  <path d="M 30 4 L 590 4 Q 616 4 616 30 L 616 270 Q 616 296 590 296 L 46 296 Q 4 296 4 254 L 4 30 Q 4 4 30 4 Z" fill="url(#ckPanel)" stroke="url(#ckChrome)" stroke-width="3"/>
  <!-- left: the small buttons, start/stop, the drive modes, auto hold -->
  <g class="ck-btns" font-family="system-ui, sans-serif" font-size="10" font-weight="600" text-anchor="middle">
    <g class="ck-btn" data-btn="dsc" transform="translate(56 26)"><rect x="-40" y="-12" width="80" height="24" rx="5"/><text y="3.5">DSC OFF</text></g>
    <g class="ck-btn off" data-btn="park" transform="translate(56 56)"><rect x="-40" y="-12" width="80" height="24" rx="5"/><text y="3.5">PARK ASSIST</text></g>
    <g class="ck-btn off" data-btn="cam" transform="translate(56 86)"><rect x="-40" y="-12" width="80" height="24" rx="5"/><text y="3.5">CAMERA</text></g>
    <g class="ck-btn ck-start" data-btn="start" transform="translate(56 138)">
      <circle r="27" fill="url(#ckChrome)"/><circle class="ck-lamp" r="23" fill="#15181c"/>
      <text y="-5" font-size="8">START</text><text y="4" font-size="8">ENGINE</text><text y="13" font-size="8">STOP</text>
    </g>
    <g class="ck-btn ck-mode" data-btn="SPORT" transform="translate(56 190)"><rect x="-40" y="-13" width="80" height="26" rx="5"/><rect class="ck-led" x="-36" y="-2" width="4" height="4" rx="1"/><text x="4" y="3.5">SPORT</text></g>
    <g class="ck-btn ck-mode" data-btn="COMFORT" transform="translate(56 220)"><rect x="-40" y="-13" width="80" height="26" rx="5"/><rect class="ck-led" x="-36" y="-2" width="4" height="4" rx="1"/><text x="4" y="3.5">COMFORT</text></g>
    <g class="ck-btn ck-mode" data-btn="ECO PRO" transform="translate(56 250)"><rect x="-40" y="-13" width="80" height="26" rx="5"/><rect class="ck-led" x="-36" y="-2" width="4" height="4" rx="1"/><text x="4" y="3.5">ECO PRO</text></g>
    <g class="ck-btn ck-hold" data-btn="autoh" transform="translate(56 279)"><rect x="-40" y="-11" width="80" height="22" rx="5"/><rect class="ck-led" x="-36" y="-2" width="4" height="4" rx="1"/><text x="4" y="3.5">AUTO H</text></g>
  </g>
  <!-- the gear selector: its tray, the marks, the lever (monostable: it comes back), the parking brake -->
  <rect x="108" y="14" width="168" height="214" rx="14" fill="#0a0b0d" stroke="#2a2e35"/>
  <g class="ck-gears" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">
    <text class="ck-g" data-g="R" x="252" y="86" font-size="15">R</text>
    <text class="ck-g" data-g="N" x="252" y="116" font-size="15">N</text>
    <text class="ck-g" data-g="D" x="252" y="146" font-size="15">D</text>
    <path d="M 240 92 L 264 92 M 240 122 L 264 122" stroke="#3a4049" stroke-width="1.2"/>
    <text class="ck-g" data-g="S" x="138" y="182" font-size="12">M/S</text>
    <text class="ck-g ck-gm" data-g="-" x="138" y="160" font-size="15">−</text>
    <text class="ck-g ck-gm" data-g="+" x="138" y="206" font-size="15">+</text>
  </g>
  <g class="ck-lever">
    <path d="M 168 52 C 168 40 176 32 192 32 C 208 32 216 40 216 52 L 222 176 C 222 196 210 206 192 206 C 174 206 162 196 162 176 Z" fill="url(#ckGlass)" stroke="#0a0b0d" stroke-width="1.5"/>
    <path d="M 178 46 C 182 40 188 38 194 38" stroke="#9aa4b1" stroke-width="2" fill="none" opacity=".6"/>
    <g class="ck-pbtn"><rect x="178" y="58" width="28" height="22" rx="4" fill="#15181c" stroke="#4a515b"/><text x="192" y="74" font-family="system-ui, sans-serif" font-size="13" font-weight="700" text-anchor="middle">P</text></g>
  </g>
  <g class="ck-btn ck-epb" data-btn="epb">
    <rect x="108" y="238" width="168" height="54" rx="12" fill="#16191d" stroke="#2a2e35"/>
    <circle cx="192" cy="265" r="15" fill="none" stroke-width="2"/><text x="192" y="270.5" font-family="system-ui, sans-serif" font-size="14" font-weight="700" text-anchor="middle">P</text>
  </g>
  <!-- right: the controller's own panel -->
  <rect x="290" y="14" width="314" height="278" rx="24" fill="#16191d" stroke="#2a2e35"/>
  <g fill="none" stroke="#0a0b0d" stroke-width="2.2" stroke-linecap="round">
    <path d="M 404 30 Q 412 70 414 100"/><path d="M 500 30 Q 492 70 490 100"/>
    <path d="M 330 62 L 380 62"/><path d="M 524 62 L 574 62"/>
    <path d="M 384 268 Q 384 248 400 236"/><path d="M 520 268 Q 520 248 504 236"/>
  </g>
  <g class="ck-btns" font-family="system-ui, sans-serif" font-size="11" font-weight="600" text-anchor="middle">
    <g class="ck-btn off" data-btn="media" transform="translate(355 44)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">MEDIA</text></g>
    <g class="ck-btn" data-btn="home" transform="translate(452 36)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">HOME</text></g>
    <g class="ck-btn off" data-btn="map" transform="translate(549 44)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">MAP</text></g>
    <g class="ck-btn off" data-btn="tel" transform="translate(355 82)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">TEL</text></g>
    <g class="ck-btn off" data-btn="nav" transform="translate(549 82)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">NAV</text></g>
    <g class="ck-btn" data-btn="back" transform="translate(350 274)"><rect x="-34" y="-13" width="68" height="26" rx="6"/><text y="4">BACK</text></g>
    <g class="ck-btn off" data-btn="option" transform="translate(554 274)"><rect x="-38" y="-13" width="76" height="26" rx="6"/><text y="4">OPTION</text></g>
  </g>
  <!-- which way it was turned: an arc that shows for a moment -->
  <g class="ck-turn" transform="translate(${KX} ${KY})">
    <path class="cw" d="M 30 -76 A 82 82 0 0 1 76 -30" fill="none" stroke="#3d9cff" stroke-width="4" stroke-linecap="round"/><path class="cw" d="M 79 -19 L 82 -35 L 68 -31 Z" fill="#3d9cff"/>
    <path class="ccw" d="M -30 -76 A 82 82 0 0 0 -76 -30" fill="none" stroke="#3d9cff" stroke-width="4" stroke-linecap="round"/><path class="ccw" d="M -79 -19 L -82 -35 L -68 -31 Z" fill="#3d9cff"/>
  </g>
  <g transform="translate(${KX} ${KY})">
    <g class="ck-knob">
      <circle r="72" fill="#060708"/>
      <g class="ck-rot" data-part="knob">
        <circle r="69" fill="url(#ckChrome)"/>
        <circle r="66" fill="none" stroke="#3a3f46" stroke-width="7" stroke-dasharray="1.5 2.4" opacity=".8"/>
      </g>
      <circle r="58" fill="#0d0f12" stroke="#4d535c" stroke-width="1"/>
      <circle class="ck-pad" r="56" fill="url(#ckTouch)"/>
      <!-- the arrows printed on the touchpad: the one pushed lights -->
      <g class="ck-arrows">
        <path data-dir="N" d="M -9 -33 L 0 -42 L 9 -33"/><path data-dir="S" d="M -9 33 L 0 42 L 9 33"/>
        <path data-dir="W" d="M -33 -9 L -42 0 L -33 9"/><path data-dir="E" d="M 33 -9 L 42 0 L 33 9"/>
      </g>
      <circle class="ck-dot" r="4" fill="#2c3139"/>
    </g>
  </g>
</svg>`;

export function makeCockpit({ $, el, ctl, manualSet, send, car }) {
  const box = $('#cockpit');
  const card = (cls, title, svg, foot) => el('div', { className: 'ck-card ' + cls }, el('div', { className: 'ck-title', textContent: title }), el('div', { className: 'ck-draw', innerHTML: svg }), foot);
  const wheelOut = el('span', { className: 'ck-val' }), pedalOut = el('span', { className: 'ck-val' }), ctlOut = el('span', { className: 'ck-val' }), gearOut = el('span', { className: 'ck-val ck-gearout' });
  const indL = el('button', { className: 'ck-ind l', textContent: '◀', title: '왼쪽 방향지시등' }), indR = el('button', { className: 'ck-ind r', textContent: '▶', title: '오른쪽 방향지시등' });
  const wheelCard = card('ck-wheel', '핸들', WHEEL, el('div', { className: 'ck-foot' }, wheelOut));
  wheelCard.querySelector('.ck-draw').append(indL, indR);
  const pedalCard = card('ck-pedals', '페달', PEDALS, el('div', { className: 'ck-foot' }, pedalOut));
  const ctlCard = card('ck-ctl', '센터 콘솔 · 기어 · iDrive 컨트롤러', CONSOLE, el('div', { className: 'ck-foot' }, gearOut, el('span', { className: 'ck-sep', textContent: '|' }), ctlOut));
  box.replaceChildren(wheelCard, pedalCard, ctlCard);

  const wheelRot = wheelCard.querySelector('.ck-rot'), knob = ctlCard.querySelector('.ck-knob'), knobRot = ctlCard.querySelector('.ck-knob .ck-rot');
  const lever = ctlCard.querySelector('.ck-lever');
  const accel = pedalCard.querySelector('.ck-accel .ck-mv'), brake = pedalCard.querySelector('.ck-brake .ck-mv');
  const K = { angle: 0, tilt: null, press: false, turnT: null, autoH: false, hand: { steer: null, pedal: null, brake: null } };

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
    // the console: the gear lit, the drive mode's light, the engine (running: START/STOP lit), the parking brake (in P)
    const st = String(v.stage || 'P'), mode = String(v.driveMode || 'COMFORT'), on = (Number(v.rpm) || 0) > 300;
    ctlCard.querySelectorAll('.ck-g').forEach((g) => g.classList.toggle('on', g.dataset.g === st || (g.dataset.g === 'S' && (st === 'S' || st === 'M')) || (/[-+]/.test(g.dataset.g) && st === 'M')));
    ctlCard.querySelector('.ck-pbtn').classList.toggle('on', st === 'P');
    ctlCard.querySelectorAll('.ck-mode').forEach((m) => m.classList.toggle('on', m.dataset.btn === mode || (m.dataset.btn === 'SPORT' && mode === 'SPORT+')));
    ctlCard.querySelector('.ck-start').classList.toggle('on', on);
    ctlCard.querySelector('.ck-epb').classList.toggle('on', !!((car.extra && car.extra.tt) || {}).park);
    const tt = (car.extra && car.extra.tt) || {};
    ctlCard.querySelector('.ck-hold').classList.toggle('on', !!tt.autoH);
    ctlCard.querySelector('[data-btn="dsc"]').classList.toggle('on', !!tt.dscOff);
    gearOut.textContent = '기어 ' + (/^[DSM]$/.test(st) ? st + (v.gear || '') : st) + ' · ' + (mode === 'SPORT+' ? 'SPORT+' : mode) + (on ? '' : car.kind === 'phev' ? ' · 엔진 정지 (전기)' : ' · 시동 꺼짐');
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
  function btn(name, text) {
    const b = ctlCard.querySelector('[data-btn="' + name + '"]');
    if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 220); }
    say(text || name.toUpperCase());
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
  // pushed off the middle (a drag past its edge) pushes it that way; the arrows on it push it too
  {
    const svg = svgOf(ctlCard);
    let acc = 0;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      acc += e.deltaMode === 1 ? e.deltaY / 3 : e.deltaMode === 2 ? e.deltaY * 3 : e.deltaY / 60;
      const n = Math.trunc(acc);
      if (n) { acc -= n; ctl.turn(n); }
    }, { passive: false });
    const atKnob = (e) => { const p = local(svg, e); return { x: p.x - KX, y: p.y - KY }; };
    drag(knob, (e) => {
      const p0 = atKnob(e), r = Math.hypot(p0.x, p0.y);
      if (r > 74) return null;
      const arrow = e.target.closest && e.target.closest('[data-dir]');
      if (arrow) { ctl.tilt(arrow.dataset.dir); return { move: () => {}, end: () => ctl.tilt(null) }; }
      if (r > 57) {                                // the ring: turned, a detent every 15 degrees
        let prev = Math.atan2(p0.y, p0.x), acc2 = 0;
        return {
          move: (ev) => { const p = atKnob(ev), a = Math.atan2(p.y, p.x); let d = a - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; prev = a; acc2 += d * 180 / Math.PI; while (Math.abs(acc2) >= 15) { const sg = Math.sign(acc2); acc2 -= sg * 15; ctl.turn(sg); } },
          end: () => {},
        };
      }
      // (held still a moment: pressed; moved off the middle first: pushed that way; a quick click: a press)
      let dir = null, pressed = false;
      const t = setTimeout(() => { if (!dir) { pressed = true; ctl.press(true); } }, 140);
      return {
        move: (ev) => {
          if (pressed) return;
          const p = atKnob(ev), dx = p.x - p0.x, dy = p.y - p0.y;
          const want = Math.hypot(dx, dy) < 16 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
          if (want === dir) return;
          clearTimeout(t);
          if (dir) ctl.tilt(null);
          dir = want;
          if (dir) ctl.tilt(dir);
        },
        end: () => { clearTimeout(t); if (pressed) ctl.press(false); else if (dir) ctl.tilt(null); else { ctl.press(true); setTimeout(() => ctl.press(false), 90); } },
      };
    });
    // the buttons: HOME and BACK the controller's; the drive modes (SPORT again: SPORT+); START/STOP the engine;
    // AUTO H a light only; the rest are there to look at
    const TIP = { home: 'HOME: 홈 (앱 목록), H 키', back: 'BACK: 뒤로, Backspace 키', start: 'START/STOP: 시동 켜기 · 끄기 (직접 조절로 바뀜)', SPORT: 'SPORT (한 번 더: SPORT+)', COMFORT: 'COMFORT', 'ECO PRO': 'ECO PRO',
      autoh: 'AUTO H: 계기판에 표시', dsc: 'DSC OFF: 계기판에 표시', epb: '주차 브레이크: 누르면 걸림, 다시 누르면 풀림 (계기판에 표시)' };
    ctlCard.querySelectorAll('.ck-btn').forEach((b) => {
      const name = b.dataset.btn;
      b.append(Object.assign(document.createElementNS(NS, 'title'), { textContent: TIP[name] || name.toUpperCase() + ': 데모에는 없는 버튼' }));
      b.addEventListener('click', () => {
        if (name === 'home') ctl.home();
        else if (name === 'back') ctl.back();
        else if (name === 'SPORT' || name === 'COMFORT' || name === 'ECO PRO') { const m = name === 'SPORT' && car.v.driveMode === 'SPORT' ? 'SPORT+' : name; manualSet({ driveMode: m }, true); btn(name, m); }
        else if (name === 'start') { const was = (Number(car.v.rpm) || 0) > 300; engine(); btn(name, was ? '시동 끔' : '시동 켬'); }
        else if (name === 'autoh' || name === 'dsc' || name === 'epb') {
          // (AUTO H, DSC OFF, the parking brake: their lights on the cluster; pressed again, off)
          const k = { autoh: 'autoH', dsc: 'dscOff', epb: 'park' }[name], was = !!((car.extra && car.extra.tt) || {})[k];
          send({ t: 'tt', k, v: !was });
          btn(name, name === 'epb' ? (was ? '주차 브레이크 풀림' : '주차 브레이크 걸림') : (name === 'autoh' ? 'AUTO H ' : 'DSC OFF ') + (was ? '끔' : '켬'));
        }
        else btn(name);
      });
    });
    // the lever: pushed forward or pulled back and let go (R, N, D, as the car's: once a step), to the left for S and
    // there forward / back for M − / +, to the right from S back to D; P on its top; the marks too
    const gearTo = (stage, gear) => manualSet({ stage, gear: /^[DSM]$/.test(stage) ? Math.max(1, Math.min(8, gear || Number(car.v.gear) || 1)) : 0 });
    function shift(d) {
      const st = String(car.v.stage || 'P'), g = Number(car.v.gear) || 1;
      if (st === 'S' || st === 'M') {
        if (d === 'N') gearTo('M', g - 1); else if (d === 'S') gearTo('M', g + 1); else if (d === 'E') gearTo('D');
      } else if (d === 'N') gearTo(st === 'D' ? 'N' : 'R');
      else if (d === 'S') gearTo(st === 'R' ? 'N' : 'D');
      else if (d === 'W' && st === 'D') gearTo('S');
      say({ N: '레버 앞으로', S: '레버 뒤로', W: '레버 왼쪽', E: '레버 오른쪽' }[d]);
    }
    drag(lever, (e) => {
      const p0 = local(svg, e), onP = e.target.closest && e.target.closest('.ck-pbtn');
      let dir = null;
      return {
        move: (ev) => {
          const p = local(svg, ev), dx = p.x - p0.x, dy = p.y - p0.y;
          dir = Math.hypot(dx, dy) < 12 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
          const o = { N: [0, -16], S: [0, 16], E: [12, 0], W: [-14, 0] }[dir] || [0, 0];
          lever.style.transform = `translate(${o[0]}px, ${o[1]}px)`;
        },
        end: () => { lever.style.transform = ''; if (dir) shift(dir); else if (onP) { gearTo('P'); say('P'); } },
      };
    });
    ctlCard.querySelectorAll('.ck-g').forEach((g) => g.addEventListener('click', () => {
      const k = g.dataset.g, gr = Number(car.v.gear) || 1;
      if (k === '-' || k === '+') gearTo('M', gr + (k === '+' ? 1 : -1)); else gearTo(k);
    }));
  }
  /** START/STOP: running, the engine stops (standing, in P); stopped, it starts (idling) */
  function engine() {
    if ((Number(car.v.rpm) || 0) > 300) manualSet({ rpm: 0, speed: 0, stage: 'P', gear: 0, pedal: 0, throttle: 0, torque: 0, gLong: 0 });
    else manualSet({ rpm: 750, throttle: 3 });
  }
  return { veh, turn, press, tilt, btn };
}
