// hud.js - the HUD's own picture, as the car's Head-Up Display shows it (the owner's display guide: full image, or
// reduced height): the street ahead and its name, the turn with its distance, the speed with the speed limit's sign,
// the lanes to take; with the driving assistant on (full image): the car ahead and the distance kept to it, steering
// assist, the cruise control's set speed, the next limit and no overtaking. Drawn line by line (original drawings), the demo's values; an app's HUD layers (Waze on the
// HUD) go over it as on the car. Reduced height: the same rows in a lower, shorter picture.
const FONT = 'Segoe UI, "Malgun Gothic", Arial, sans-serif';

export function makeHud({ $ }) {
  const cv = $('#hudMock'), c = cv.getContext('2d');
  const S = { dist: 300, lastT: 0 };

  function sign(x, y, r, n) {           // a speed limit's sign: white, a red ring, the number
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = '#d8191b'; c.lineWidth = r * 0.22; c.beginPath(); c.arc(x, y, r * 0.86, 0, 7); c.stroke();
    c.fillStyle = '#111'; c.font = '700 ' + Math.round(r * (n >= 100 ? 0.78 : 0.95)) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), x, y + r * 0.05);
  }
  function car(x, y, w) {               // the car ahead, from behind
    const h = w * 0.62;
    c.fillStyle = '#c9ced6'; c.beginPath(); c.moveTo(x - w * 0.36, y - h * 0.55); c.lineTo(x + w * 0.36, y - h * 0.55); c.lineTo(x + w * 0.46, y - h * 0.1); c.lineTo(x - w * 0.46, y - h * 0.1); c.closePath(); c.fill();
    c.fillStyle = '#5a626d'; c.fillRect(x - w * 0.3, y - h * 0.48, w * 0.6, h * 0.28);
    c.fillStyle = '#d8dde4'; c.fillRect(x - w * 0.5, y - h * 0.12, w, h * 0.42);
    c.fillStyle = '#e04a3f'; c.fillRect(x - w * 0.46, y - h * 0.04, w * 0.2, h * 0.1); c.fillRect(x + w * 0.26, y - h * 0.04, w * 0.2, h * 0.1);
    c.fillStyle = '#2a2f36'; c.fillRect(x - w * 0.44, y + h * 0.28, w * 0.18, h * 0.14); c.fillRect(x + w * 0.26, y + h * 0.28, w * 0.18, h * 0.14);
  }
  function assist(x, y, set, next) {    // the driving assistant: the car ahead, the distance (green bars), the lanes kept, steering, the set speed
    const G = '#4cd964';
    car(x, y, 80);
    for (let i = 0; i < 4; i++) {
      const t = y + 32 + i * 16, half = 46 + i * 9;
      c.fillStyle = 'rgba(76,217,100,' + (0.95 - i * 0.12) + ')'; c.beginPath(); c.moveTo(x - half, t); c.lineTo(x + half, t); c.lineTo(x + half + 4, t + 10); c.lineTo(x - half - 4, t + 10); c.closePath(); c.fill();
    }
    c.strokeStyle = G; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 62, y + 12); c.lineTo(x - 108, y + 108); c.moveTo(x + 62, y + 12); c.lineTo(x + 108, y + 108); c.stroke();
    // steering assist: the wheel, and the lane change it may make (the arrow out to the left)
    c.beginPath(); c.arc(x, y + 124, 22, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(x - 22, y + 120); c.lineTo(x + 22, y + 120); c.moveTo(x, y + 124); c.lineTo(x, y + 146); c.stroke();
    c.beginPath(); c.moveTo(x - 36, y + 112); c.lineTo(x - 70, y + 76); c.stroke();
    c.fillStyle = G; c.beginPath(); c.moveTo(x - 80, y + 64); c.lineTo(x - 58, y + 70); c.lineTo(x - 74, y + 88); c.closePath(); c.fill();
    // the set speed, its symbol (an arc with a mark) over it
    c.beginPath(); c.arc(x + 136, y + 108, 22, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.beginPath(); c.moveTo(x + 124, y + 82); c.lineTo(x + 118, y + 72); c.stroke();
    c.fillStyle = G; c.font = '700 40px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(String(set), x + 136, y + 150);
    // the next limit: a plain sign
    if (next) {
      const sx = 40, sy = y + 128;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(sx, sy, 22, 0, 7); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 3; c.beginPath(); c.arc(sx, sy, 19, 0, 7); c.stroke();
      c.fillStyle = '#111'; c.font = '700 ' + (next >= 100 ? 17 : 21) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(next), sx, sy + 1);
    }
  }
  function noPassing(x, y, r) {         // no overtaking: a red ring, a red car beside a black one
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = '#d8191b'; c.lineWidth = r * 0.22; c.beginPath(); c.arc(x, y, r * 0.86, 0, 7); c.stroke();
    const one = (cx, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(cx - r * 0.17, y - r * 0.24); c.lineTo(cx + r * 0.17, y - r * 0.24); c.lineTo(cx + r * 0.25, y - r * 0.02); c.lineTo(cx + r * 0.25, y + r * 0.2); c.lineTo(cx - r * 0.25, y + r * 0.2); c.lineTo(cx - r * 0.25, y - r * 0.02); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(cx - r * 0.12, y - r * 0.18, r * 0.24, r * 0.12); };
    one(x - r * 0.27, '#d8191b'); one(x + r * 0.27, '#111');
  }
  function lanes(x, y, w, h) {          // the lanes: straight on in the left four, the turn in the right two (to take)
    const n = 6, lw = w / n;
    c.strokeStyle = '#d7dde5'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.moveTo(x + w, y); c.lineTo(x + w, y + h); c.stroke();
    c.setLineDash([6, 6]); c.beginPath(); for (let i = 1; i < n; i++) { c.moveTo(x + i * lw, y); c.lineTo(x + i * lw, y + h); } c.stroke(); c.setLineDash([]);
    for (let i = 0; i < n; i++) {
      const cx = x + i * lw + lw / 2, turn = i >= n - 2, take = turn;
      c.strokeStyle = c.fillStyle = take ? '#ffffff' : '#7d8692'; c.lineWidth = h * 0.09; c.lineCap = 'round';
      c.beginPath();
      if (turn) { c.moveTo(cx - lw * 0.12, y + h * 0.85); c.lineTo(cx - lw * 0.12, y + h * 0.45); c.quadraticCurveTo(cx - lw * 0.12, y + h * 0.25, cx + lw * 0.12, y + h * 0.25); }
      else { c.moveTo(cx, y + h * 0.85); c.lineTo(cx, y + h * 0.3); }
      c.stroke();
      c.beginPath();
      if (turn) { const ax = cx + lw * 0.26, ay = y + h * 0.25; c.moveTo(ax, ay); c.lineTo(ax - lw * 0.16, ay - h * 0.13); c.lineTo(ax - lw * 0.16, ay + h * 0.13); }
      else { c.moveTo(cx, y + h * 0.12); c.lineTo(cx - lw * 0.16, y + h * 0.34); c.lineTo(cx + lw * 0.16, y + h * 0.34); }
      c.closePath(); c.fill();
    }
    // (this car's lane: an orange mark in the left one)
    c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(x + lw / 2, y + h * 0.78); c.lineTo(x + lw / 2 - 6, y + h * 0.95); c.lineTo(x + lw / 2 + 6, y + h * 0.95); c.fill();
  }
  function road(x, y, w, h) {           // the streets ahead in perspective, the route turning right, this car
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(60,70,84,0)'); g.addColorStop(1, 'rgba(60,70,84,.9)');
    c.strokeStyle = g; c.lineCap = 'butt';
    const P = (u, v) => [x + u * w, y + v * h];
    const line = (pts, wd) => { c.lineWidth = wd; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(...P(...p)) : c.moveTo(...P(...p)))); c.stroke(); };
    line([[0.28, 0], [0.18, 1]], 10); line([[0.62, 0], [0.86, 1]], 10); line([[0.02, 0.86], [0.98, 0.86]], 10); line([[0.1, 0.62], [0.95, 0.6]], 8);
    line([[0.45, 0.06], [0.36, 1]], 12);
    // the route: up, then right; its arrow; the street it turns into
    c.strokeStyle = '#fff'; c.lineWidth = Math.max(5, h * 0.06); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(...P(0.42, 0.9)); c.lineTo(...P(0.43, 0.38)); c.lineTo(...P(0.62, 0.36)); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(...P(0.74, 0.34)); c.lineTo(...P(0.62, 0.22)); c.lineTo(...P(0.62, 0.48)); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(200,206,214,.8)'; c.lineWidth = Math.max(3, h * 0.025); c.beginPath(); c.moveTo(...P(0.74, 0.33)); c.lineTo(...P(1, 0.3)); c.stroke();
    c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(...P(0.42, 0.78)); c.lineTo(...P(0.36, 0.98)); c.lineTo(...P(0.42, 0.93)); c.lineTo(...P(0.48, 0.98)); c.closePath(); c.fill();
  }
  /** v: the car's values; x: the extras (limit, hudSize full | low, hudNav, acc: the set speed, 0 off); waze: the app's map is on the HUD */
  function draw(v, x, waze) {
    const now = performance.now(), dt = Math.min(1, (now - (S.lastT || now)) / 1000); S.lastT = now;
    const speed = Math.round(Number(v.speed) || 0), low = x.hudSize === 'low', nav = x.hudNav !== false && !waze, limit = Number(x.limit) || 0;
    // (the turn coming nearer at the car's speed; passed: the next one)
    S.dist -= (Number(v.speed) || 0) / 3.6 * dt; if (S.dist < 0) S.dist = 400;
    const H = low ? 264 : 480;
    if (cv.height !== H) cv.height = H;
    c.clearRect(0, 0, 800, H);
    const row = H - 92;                               // (the bottom row: the speed, its sign, the lanes)
    if (nav) {
      c.fillStyle = '#f2f4f7'; c.font = '600 ' + (low ? 30 : 38) + 'px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      c.fillText('세종대로', 776, low ? 34 : 58);
      if (!low) { c.fillStyle = 'rgba(220,225,232,.5)'; c.fillRect(0, 78, 800, 2); }
      road(low ? 470 : 430, low ? 44 : 92, low ? 290 : 360, low ? row - 52 : row - 102);
      c.fillStyle = '#f2f4f7'; c.font = '600 ' + (low ? 30 : 36) + 'px ' + FONT; c.textAlign = 'right';
      const d = S.dist >= 100 ? Math.round(S.dist / 50) * 50 : Math.round(S.dist / 10) * 10;
      c.fillText(d + ' m', 784, row - (low ? 12 : 22));
    }
    const acc = Number(x.acc) || 0;
    if (acc && !low) assist(176, 214, acc, limit && limit < 100 ? 100 : limit && limit < 120 ? 120 : 0);
    let sx = 18;
    if (limit) { sign(sx + 40, row + 48, 40, limit); sx += 90; }
    c.fillStyle = '#fff'; c.font = '600 80px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(String(speed), sx, row + 80);
    const sw = c.measureText(String(speed)).width;
    c.font = '600 22px ' + FONT; c.fillText('km/h', sx + sw + 6, row + 30);
    if (acc && limit) noPassing(sx + sw + 118, row + 48, 34);
    if (!low) { c.fillStyle = 'rgba(220,225,232,.45)'; c.fillRect(sx - 4, row + 2, Math.max(150, sw + 70), 2); }
    if (nav) lanes(470, row + 8, 300, 76);
  }
  return { draw };
}
