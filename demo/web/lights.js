// lights.js - the cluster's warning and indicator lights, where the car's ID7 cluster has them (the G20 owner's
// display guide, "Warning and indicator lights", its numbers in brackets): the fixed chamber lights in the housing
// beside the screen (left: turn [5], high beam [4], its assistant [3], low beam [2], side lights [1]; right: turn [16],
// fog [17], rear fog [18], engine [19], DSC OFF [20]) and those the cluster draws on its screen in their own places,
// clear of its scales (brakes [9], tyre pressure [8], ABS [7], DSC [6], lane departure [10]; AUTO H [13], parking
// brake [14], steering [15]; the turn signals by the driver camera's cowl [11, 12]; airbag [21], seat belts [22, 23]).
// Original symbols, drawn simply. Each is on when the car says so (the indicators and hazard lights, night: low beam
// and side lights, the console's parking brake, AUTO H and DSC OFF) or switched on in the panel; all on: the bulb check.
const NS = 'http://www.w3.org/2000/svg';

/* ---------------- the symbols (a 40 x 40 box each) ---------------- */
const LAMP = 'M 22 9 C 33 9 36 15 36 20 C 36 25 33 31 22 31 Z';
const SYM = {
  turnL: '<path d="M 4 20 L 18 7 L 18 14 L 36 14 L 36 26 L 18 26 L 18 33 Z" fill="currentColor"/>',
  turnR: '<path d="M 36 20 L 22 7 L 22 14 L 4 14 L 4 26 L 22 26 L 22 33 Z" fill="currentColor"/>',
  high: `<path d="${LAMP}" fill="currentColor"/><path d="M 4 12 H 17 M 4 17 H 17 M 4 22 H 17 M 4 27 H 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  highAssist: `<path d="${LAMP}" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 4 12 H 16 M 4 17 H 16 M 4 22 H 16 M 4 27 H 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><text x="27" y="25" font-size="12" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif">A</text>`,
  low: `<path d="${LAMP}" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M 5 13 L 17 16 M 5 19 L 17 22 M 5 25 L 17 28" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  side: '<path d="M 15 12 A 8 8 0 0 0 15 28 Z M 25 12 A 8 8 0 0 1 25 28 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 3 14 L 9 16 M 3 20 H 9 M 3 26 L 9 24 M 37 14 L 31 16 M 37 20 H 31 M 37 26 L 31 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  fogFront: `<path d="${LAMP}" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 4 13 L 15 15 M 4 20 L 15 22 M 4 27 L 15 29" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M 10 8 Q 7 14 10 20 Q 13 26 10 32" fill="none" stroke="currentColor" stroke-width="2"/>`,
  fogRear: '<path d="M 18 9 C 7 9 4 15 4 20 C 4 25 7 31 18 31 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 23 13 H 36 M 23 20 H 36 M 23 27 H 36" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M 30 8 Q 27 14 30 20 Q 33 26 30 32" fill="none" stroke="currentColor" stroke-width="2"/>',
  engine: '<path d="M 6 16 H 10 V 12 H 15 V 9 H 24 V 12 H 28 L 31 15 H 35 V 27 H 31 L 28 31 H 12 L 10 27 H 6 Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>',
  dscOff: '<path d="M 9 17 L 12 10 H 28 L 31 17 V 23 H 9 Z" fill="currentColor"/><path d="M 9 27 Q 13 24 16 27 T 22 27 M 19 31 Q 23 28 26 31 T 32 31" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="20" y="40" font-size="8" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif">OFF</text>',
  dsc: '<path d="M 9 15 L 12 8 H 28 L 31 15 V 21 H 9 Z" fill="currentColor"/><path d="M 8 26 Q 12 22 16 26 T 24 26 M 16 32 Q 20 28 24 32 T 32 32" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  abs: '<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 7 10 A 15 15 0 0 0 7 30 M 33 10 A 15 15 0 0 1 33 30" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="20" y="23.5" font-size="8.5" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif">ABS</text>',
  brake: '<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 7 10 A 15 15 0 0 0 7 30 M 33 10 A 15 15 0 0 1 33 30" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M 20 13 V 22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="27" r="1.8" fill="currentColor"/>',
  tpms: '<path d="M 9 30 C 5 25 5 14 9 9 M 31 30 C 35 25 35 14 31 9 M 9 30 H 31 M 9 9 L 12 12 M 31 9 L 28 12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M 12 34 H 28" stroke="currentColor" stroke-width="2.6" stroke-dasharray="3 2"/><path d="M 20 12 V 22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="26.5" r="1.8" fill="currentColor"/>',
  airbag: '<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M 8 14 L 16 14 L 20 26 L 30 26 L 30 31 L 16 31 Z" fill="currentColor"/><path d="M 22 13 L 21 21" stroke="currentColor" stroke-width="2.4"/><circle cx="29" cy="14" r="7" fill="currentColor"/>',
  lane: '<path d="M 6 6 L 3 34 M 34 6 L 37 34" stroke="currentColor" stroke-width="2.4" stroke-dasharray="5 4"/><path d="M 13 23 L 15 15 H 25 L 27 23 V 30 H 13 Z" fill="currentColor"/>',
  autoH: '<text x="20" y="25" font-size="13" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif">AUTO H</text>',
  park: '<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M 7 10 A 15 15 0 0 0 7 30 M 33 10 A 15 15 0 0 1 33 30" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="20" y="25" font-size="14" font-weight="800" text-anchor="middle" fill="currentColor" font-family="system-ui, sans-serif">P</text>',
  steer: '<circle cx="18" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="3"/><path d="M 6 18 H 30 M 18 22 V 32" stroke="currentColor" stroke-width="3"/><path d="M 35 8 V 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="35" cy="30" r="2" fill="currentColor"/>',
  belt: '<circle cx="20" cy="8" r="4.5" fill="currentColor"/><path d="M 12 36 V 21 Q 12 14 20 14 Q 28 14 28 21 V 36" fill="currentColor"/><path d="M 13 15 L 30 34" stroke="#000" stroke-width="2.6"/><path d="M 13 15 L 30 34" stroke="currentColor" stroke-width="1.2"/>',
  beltRear: '<g fill="currentColor"><circle cx="9" cy="12" r="3.5"/><path d="M 4 34 V 22 Q 4 17 9 17 Q 14 17 14 22 V 34 Z"/><circle cx="20" cy="12" r="3.5"/><path d="M 15 34 V 22 Q 15 17 20 17 Q 25 17 25 22 V 34 Z"/><circle cx="31" cy="12" r="3.5"/><path d="M 26 34 V 22 Q 26 17 31 17 Q 36 17 36 22 V 34 Z"/></g>',
};
/* ---------------- the lights: where (the 1920 x 720 screen's coordinates, from the guide's picture), colour, name ----------------
 * where L / R: the housing's chamber column beside the screen, y its height on the screen; cam: the turn signals by
 * the camera's cowl (index.html #turnL / #turnR); otherwise on the screen at x, y. */
const G = '#2fd27a', A = '#ffad1f', R = '#ff3b30', B = '#3d7bff';
const LIGHTS = [
  { k: 'turnL', where: 'cam', c: G, name: '왼쪽 방향지시등 (화면 · 하우징)', link: '방향지시등 · 비상등' },
  { k: 'turnR', where: 'cam', c: G, name: '오른쪽 방향지시등 (화면 · 하우징)', link: '방향지시등 · 비상등' },
  // the housing, left [5 4 3 · 2 1]
  { k: 'turnL', where: 'L', y: 310, c: G, name: '왼쪽 방향지시등 (하우징)', dup: true },
  { k: 'high', where: 'L', y: 378, c: B, name: '상향등' },
  { k: 'highAssist', where: 'L', y: 446, c: G, name: '상향등 보조' },
  { k: 'low', where: 'L', y: 564, c: G, name: '하향등', link: '밤' },
  { k: 'side', where: 'L', y: 622, c: G, name: '미등', link: '밤' },
  // the housing, right [16 17 18 · 19 20]
  { k: 'turnR', where: 'R', y: 310, c: G, name: '오른쪽 방향지시등 (하우징)', dup: true },
  { k: 'fogFront', where: 'R', y: 378, c: G, name: '안개등' },
  { k: 'fogRear', where: 'R', y: 436, c: A, name: '뒤 안개등' },
  { k: 'engine', where: 'R', y: 526, c: A, name: '엔진 이상' },
  { k: 'dscOff', where: 'R', y: 622, c: A, name: 'DSC OFF · DTC', link: '콘솔 DSC OFF' },
  // the screen, left of the speed scale [10 9 8 7 6]
  { k: 'lane', x: 104, y: 166, c: G, name: '차선 이탈 경고' },
  { k: 'brakeRed', x: 40, y: 220, c: R, sym: 'brake', name: '브레이크 시스템' },
  { k: 'tpms', x: 34, y: 282, c: A, name: '타이어 공기압' },
  { k: 'abs', x: 28, y: 342, c: A, name: 'ABS' },
  { k: 'dsc', x: 28, y: 400, c: A, name: 'DSC' },
  // the screen, right of the rev scale [13 14 15]
  { k: 'autoH', x: 1800, y: 182, c: G, w: 74, name: 'AUTO H', link: '콘솔 AUTO H' },
  { k: 'park', x: 1866, y: 230, c: G, name: '주차 브레이크', link: '콘솔 주차 브레이크' },
  { k: 'steer', x: 1866, y: 288, c: A, name: '조향 시스템' },
  // the bottom row [23 22 21]
  { k: 'beltRear', x: 556, y: 684, c: R, name: '뒷좌석 안전벨트' },
  { k: 'belt', x: 606, y: 684, c: R, name: '안전벨트' },
  { k: 'airbag', x: 650, y: 684, c: R, name: '에어백' },
];
const NO_LINK = {};

export function makeLights({ $, el, send, car }) {
  const icon = (L, size) => `<svg viewBox="0 0 ${L.w ? 80 : 40} 40" width="${size * (L.w ? 2 : 1)}" height="${size}" style="color:${L.c}" aria-hidden="true">${L.w ? `<g transform="translate(20 0)">${SYM[L.sym || L.k]}</g>` : SYM[L.sym || L.k]}</svg>`;
  // the chamber lights: in the housing beside the screen, each at its height
  ['L', 'R'].forEach((side) => {
    $('#chamber' + side).replaceChildren(...LIGHTS.filter((L) => L.where === side).map((L) => {
      const cell = el('div', { className: 'ch-slot', title: L.name, innerHTML: icon(L, 40) });
      cell.dataset.k = L.k; cell.style.top = (L.y / 7.2) + '%';
      return cell;
    }));
  });
  // those on the screen, at their places (half as big again as the symbols' box: about the car's own)
  const view = $('#telltaleView');
  view.innerHTML = LIGHTS.filter((L) => L.x !== undefined).map((L) => `<g data-k="${L.k}" transform="translate(${L.x - (L.w ? 60 : 30)} ${L.y - 30}) scale(1.5)" style="color:${L.c}"><title>${L.name}</title>${L.w ? `<g transform="translate(20 0)">${SYM[L.sym || L.k]}</g>` : SYM[L.sym || L.k]}</g>`).join('');

  /* the panel: a switch for each (lit while the car says so too), all on (the bulb check), all off */
  const box = $('#ttList');
  box.replaceChildren(...LIGHTS.filter((L) => !L.dup).map((L) => el('button', { className: 'tt', 'data-k': L.k, title: L.name + (L.link ? ' (연동: ' + L.link + ')' : ''), innerHTML: icon(L, 18) + '<span>' + L.name + (L.link ? ' <i>연동</i>' : '') + '</span>', on: { click: () => send({ t: 'tt', k: L.k, v: !((car.extra.tt || NO_LINK)[L.k]) }) } })));
  $('#ttAll').onclick = () => send({ t: 'tt', all: true });
  $('#ttNone').onclick = () => send({ t: 'tt', all: false });

  /** on: switched on in the panel, or what the car says (the indicators blink) */
  function state(k, blinkOn) {
    const x = car.extra || {}, v = car.v || {}, tt = x.tt || NO_LINK, ind = x.indicator || 'off';
    if (k === 'turnL') return (tt.turnL || ind === 'left' || ind === 'both') && blinkOn;
    if (k === 'turnR') return (tt.turnR || ind === 'right' || ind === 'both') && blinkOn;
    if (k === 'low' || k === 'side') return !!(tt[k] || x.night);
    return !!tt[k];
  }
  let last = '';
  function frame() {
    const blinkOn = Math.floor(performance.now() / 400) % 2 === 0;
    const keys = Array.from(new Set(LIGHTS.map((L) => L.k)));
    const on = keys.map((k) => (state(k, blinkOn) ? 1 : 0)).join(''), key = on + JSON.stringify((car.extra || {}).tt || NO_LINK);
    if (key === last) return;
    last = key;
    keys.forEach((k, i) => {
      const lit = on[i] === '1';
      document.querySelectorAll('[data-k="' + k + '"]').forEach((e) => {
        if (e.classList.contains('tt')) e.classList.toggle('on', !!((car.extra.tt || NO_LINK)[k]) || (lit && !/^turn/.test(k)));
        else e.classList.toggle('lit', lit);
      });
    });
  }
  /** the turn signals by the camera: { l, r } lit now (blinking) */
  const turn = () => { const b = Math.floor(performance.now() / 400) % 2 === 0; return { l: state('turnL', b), r: state('turnR', b) }; };
  return { frame, turn };
}
