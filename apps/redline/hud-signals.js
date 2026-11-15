'use strict';
/**
 * hud-signals.js - the turn signal arrows and the lane change warning on Redline's HUD, as Cluster Info draws them
 * (idrive7-cluster-info apps/akakingj_cluster_info: overlay.js drawArrow / drawLaneSign, indicators.js, dap.js): an
 * arrow each side, green while that side flashes in step with the cluster's own, and outside it a sign while the car's
 * driving assistant says a car is beside or coming up behind on that side (this car yellow, the other's bonnet red).
 *
 * Where (signalsPlace): under the tach when it shows, the left sign at the tach's left edge with its arrow beside it, the
 * right arrow and sign ending at its right edge; at the tach's own place when the tach itself is switched off (setting
 * hudTach), so they stay at the top of what the HUD shows. They move with the tach's Size and Position.
 *
 * Four small image layers, each drawn once: flashing switches only their opacity (a few bytes, no pixels).
 * Settings: hudTurnSignals, hudLaneWarn (each on its own), hudTach (the tach itself).
 */
const { Canvas } = require('./kit/canvas');

const ARROW = { w: 30, h: 24 }, LCW = { w: 34, h: 44 };
const LCW_GAP = 6;          // between a sign and its arrow
const BELOW_GAP = 8;        // between the tach's foot and the signals
const MIN_SPAN = 240;       // the two sides at least this far apart (a small tach): left and right read apart
const INDICATOR_GREEN = '#22d046', LCW_SELF = '#ffd200', LCW_OTHER = '#ff2a1a';
// the cluster's own arrow (Cluster Info, measured over 39 flashes of a video): 335 ms lit of 638, the head unit told
// about 40 ms after the cluster's first flash; gone 1200 ms after the stalk is let go (no flicker on a tap)
const BLINK_ON_MS = 335, BLINK_OFF_MS = 303, BLINK_LEAD_MS = 40, LINGER_MS = 1200, TICK_MS = 25;
const SIDES = ['left', 'right'];

const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The three switches: { tach, turn, lane } (all on unless switched off). */
function signalsOf(settings) {
    return { tach: settings.get('hudTach') !== false, turn: settings.get('hudTurnSignals') !== false, lane: settings.get('hudLaneWarn') !== false };
}

/**
 * Where the signals go for the tach's place t ({ x, y, w, h }) in a scene { w, h }: tachOn, under it (above it where
 * that doesn't fit, as on iDrive 8's small HUD; else at the scene's foot); otherwise at its top. Returns
 * { arrow: { left, right }, lcw: { left, right }, band } ({ x, y, w, h } each; band spans them all).
 */
function signalsPlace(t, tachOn, scene) {
    const span = Math.min(Math.max(t.w, MIN_SPAN), scene.w);
    const x0 = clamp(Math.round(t.x + t.w / 2 - span / 2), 0, Math.max(0, scene.w - span));
    let y = t.y;
    if (tachOn) {
        y = t.y + t.h + BELOW_GAP;
        if (y + LCW.h > scene.h) { const up = t.y - BELOW_GAP - LCW.h; y = up >= 0 ? up : scene.h - LCW.h; }
    }
    y = clamp(y, 0, Math.max(0, scene.h - LCW.h));
    const ay = y + Math.round((LCW.h - ARROW.h) / 2);
    const r = (x, yy, s) => ({ x: x, y: yy, w: s.w, h: s.h });
    return {
        lcw: { left: r(x0, y, LCW), right: r(x0 + span - LCW.w, y, LCW) },
        arrow: { left: r(x0 + LCW.w + LCW_GAP, ay, ARROW), right: r(x0 + span - LCW.w - LCW_GAP - ARROW.w, ay, ARROW) },
        band: { x: x0, y: y, w: span, h: LCW.h },
    };
}

/**
 * A turn signal arrow pointing left or right, on a transparent ground: the iDrive 7 cluster's own shape (a triangle head
 * the arrow's full height and a bit over half its length, a shaft a little over two fifths of its height), solid green.
 */
function drawArrow(cv, dir) {
    const w = cv.w, h = cv.h, m = 1;            // 1 px clear for the anti-aliased edge
    const L = w - 2 * m, H = h - 2 * m, head = L * 0.56, bar = H * 0.42;
    cv.clear([0, 0, 0, 0]);
    const tip = dir === 'left' ? m : w - m, base = dir === 'left' ? m + head : w - m - head, end = dir === 'left' ? w - m : m;
    cv.convex([[tip, h / 2], [base, m], [base, h - m]], INDICATOR_GREEN);
    // the shaft overlaps the head by a pixel, so no seam shows between them
    const x0 = Math.min(base, end) - (dir === 'left' ? 1 : 0), x1 = Math.max(base, end) + (dir === 'left' ? 0 : 1);
    cv.fillRect(x0, h / 2 - bar / 2, x1 - x0, bar, INDICATOR_GREEN);
}

/** A car seen from above, nose up, in its box x, y, w x h, in col (windows a dark shade of it); cut at the canvas' foot. */
function drawCar(cv, x, y, w, h, col) {
    const rgb = [1, 3, 5].map((i) => parseInt(col.slice(i, i + 2), 16));
    const dark = '#' + rgb.map((v) => Math.round(v * 0.22).toString(16).padStart(2, '0')).join('');
    const X = (f) => x + w * f, Y = (f) => y + h * f;
    const rect = (x0, y0, ww, hh, c) => { const a = Math.max(0, y0), b = Math.min(cv.h, y0 + hh); if (b > a) cv.fillRect(x0, a, ww, b - a, c); };
    cv.roundRect(X(0.12), Y(0.02), w * 0.76, Math.min(h * 0.96, cv.h - Y(0.02) + w * 0.30), w * 0.30, col);
    rect(x, Y(0.30), w * 0.14, h * 0.08, col);                                       // the mirrors
    rect(X(0.86), Y(0.30), w * 0.14, h * 0.08, col);
    if (Y(0.43) <= cv.h) cv.convex([[X(0.22), Y(0.30)], [X(0.78), Y(0.30)], [X(0.70), Y(0.43)], [X(0.30), Y(0.43)]], dark);   // windscreen
    if (Y(0.84) <= cv.h) cv.convex([[X(0.30), Y(0.74)], [X(0.70), Y(0.74)], [X(0.76), Y(0.84)], [X(0.24), Y(0.84)]], dark);   // rear window
    rect(X(0.20), Y(0.47), w * 0.05, h * 0.22, dark);                                // the side windows
    rect(X(0.75), Y(0.47), w * 0.05, h * 0.22, dark);
}
/** The lane change warning's sign for one side: this car (yellow) ahead, the other's bonnet (red) behind it and outward. */
function drawLaneSign(cv, side) {
    cv.clear([0, 0, 0, 0]);
    const cw = Math.round(cv.w * 0.50), ch = Math.round(cv.h * 0.70);
    const inner = side === 'left' ? cv.w - cw : 0, outer = side === 'left' ? 0 : cv.w - cw;
    drawCar(cv, inner, 0, cw, ch, LCW_SELF);
    drawCar(cv, outer, cv.h - Math.round(ch * 0.48), cw, ch, LCW_OTHER);
}

/*
 * The car's signals, read only: the turn signals from the body's light module (de.bmw.body.Light, either field may be
 * the one the car fills) and the lane change warning from the driving assistant's lateral collision avoidance (a car
 * without the assistant sends none: nothing shown). As Cluster Info's indicators.js and dap.js.
 */
const ACTIVE_LEFT = [7, 9, 18, 20, 22], ACTIVE_RIGHT = [8, 10, 19, 21, 23], ACTIVE_BOTH = [1, 5, 6, 11, 12, 13, 16, 17, 24, 25];
const CONTROL = { BLINKEN_AUS: 0, TIPP_BLINKEN_LINKS_EIN: 1, TIPP_BLINKEN_RECHTS_EIN: 2, DAUER_BLINKEN_LINKS_EIN: 3,
    DAUER_BLINKEN_RECHTS_EIN: 4, BEIDSEITIGES_BLINKEN_EIN: 8 };
const ACTIVE = { BLINKEN_AUS: 0, CRASH_BLINKEN: 1, REVERSIER_BLINKEN: 2, QUITTIERUNGSBLINKEN_SCHAERFEN: 3,
    QUITTIERUNGSBLINKEN_ENTSCHAERFEN: 4, DWA_BLINKEN: 5, WARNBLINKEN_MANUELL: 6, DAUERBLINKEN_LINKS: 7, DAUERBLINKEN_RECHTS: 8,
    TIPPBLINKEN_LINKS: 9, TIPPBLINKEN_RECHTS: 10, UEBERFALLALARM: 11, FAS_WARNBLINKEN_AUSPRAEGUNG_1: 12, AUFFAHRWARNBLINKEN: 13,
    ANKUENDIGUNGSBLINKEN_OEFFNEN: 14, ANKUENDIGUNGSBLINKEN_SCHLIESSEN: 15, WARNBLINKEN_NACH_GEFAHRENBREMSUNG: 16,
    WARNBLINKEN_VON_RCP: 17, FAS_RICHTUNGSBLINKEN_LOWPRIO_LINKS: 18, FAS_RICHTUNGSBLINKEN_LOWPRIO_RECHTS: 19,
    FAS_RICHTUNGSBLINKEN_MIDPRIO_LINKS: 20, FAS_RICHTUNGSBLINKEN_MIDPRIO_RECHTS: 21, FAS_RICHTUNGSBLINKEN_HIGHPRIO_LINKS: 22,
    FAS_RICHTUNGSBLINKEN_HIGHPRIO_RECHTS: 23, FAS_WARNBLINKEN_AUSPRAEGUNG_2: 24, FAS_WARNBLINKEN_AUSPRAEGUNG_3: 25,
    ANKUENDIGUNGSBLINKEN_REMOTE_MOTORSTART: 26 };
const enumOf = (x, names) => (typeof x === 'string' && x in names ? names[x] : x);
/** The first value under key however deep the binding wraps it. */
function one(v, key, depth) {
    if (!v || typeof v !== 'object' || (depth || 0) > 6) return undefined;
    if (key in v) return v[key];
    for (const k of Object.keys(v)) { const r = one(v[k], key, (depth || 0) + 1); if (r !== undefined) return r; }
    return undefined;
}
/** The direction from controlIndicateDirection (c) and activeFunctionIndicateDirection (a): 'off' | 'left' | 'right' | 'both', or null. */
function direction(c, a) {
    c = enumOf(c, CONTROL); a = enumOf(a, ACTIVE);
    let dir = null;
    if (c === 1 || c === 3) dir = 'left'; else if (c === 2 || c === 4) dir = 'right'; else if (c === 8) dir = 'both'; else if (c === 0) dir = 'off';
    if (dir === null || (dir === 'off' && isNum(a) && a > 0 && a < 250)) {
        dir = ACTIVE_LEFT.indexOf(a) >= 0 ? 'left' : ACTIVE_RIGHT.indexOf(a) >= 0 ? 'right' : ACTIVE_BOTH.indexOf(a) >= 0 ? 'both' : a === 0 ? 'off' : dir;
    }
    return dir;
}
const nameOf = (v) => (v && typeof v === 'object' ? (v.name !== undefined ? v.name : v.value) : v);
const warnOn = (v) => { const n = nameOf(v); return typeof n === 'string' ? /WARNING/.test(n) && !/^NO_/.test(n) : isNum(n) && n > 0; };
/** The lane change warning's sides from an assistedDrivingViewLcaInput: { left, right }. */
function decodeLca(v) {
    return { left: warnOn(one(v, 'statusLaneChangeWarningLeft')), right: warnOn(one(v, 'statusLaneChangeWarningRight')) };
}
const S_LIGHT = 'de.bmw.body.Light';
const S_LCA = 'de.bmw.dass.driverassistanceapplications.AssistedDrivingViewLateralCollisionAvoidance';

/**
 * Watch the car's turn signals and lane change warning (ctx.signals). Returns { indicator() ('off' | 'left' | 'right' |
 * 'both'), laneChange() ({ left, right }, null once nothing has come for 3 s), status() }.
 */
function watchCar(ctx, log) {
    const st = { dir: 'off', lcw: null, lcwAt: 0, seen: { light: 0, lca: 0 }, sub: {} };
    const onLight = (what) => (v) => {
        st.seen.light++;
        const c = one(v, 'controlIndicateDirection'), a = one(v, 'activeFunctionIndicateDirection');
        const dir = direction(c, a);
        if (!dir || dir === st.dir) return;
        st.dir = dir;                    // (before the log line: a log that throws can't keep the value out)
        try { log.debug('turn signals: ' + dir + ' (' + what + ' ' + c + ' / ' + a + ')'); } catch (e) { /* no debug log */ }
    };
    const onLca = (v) => {
        st.seen.lca++;
        st.lcw = decodeLca(v); st.lcwAt = Date.now();
        if (st.seen.lca <= 3) log.info('lane change warning raw: ' + JSON.stringify(v).slice(0, 400));
    };
    const watch = (iface, handlers, what) => {
        if (!ctx.signals || !ctx.signals.watch) { st.sub[what] = 'no signals'; return; }
        Promise.resolve(ctx.signals.watch(iface, '1', handlers, log))
            .then((s) => { st.sub[what] = s && s.error ? 'error: ' + s.error : 'subscribed'; log.info('hud: ' + what + ' ' + st.sub[what]); })
            .catch((e) => { st.sub[what] = 'error: ' + e; });
    };
    watch(S_LIGHT, { StatusFunctionsIndicators: onLight('indicators'), StatusFunctionsIndicators2: onLight('indicators 2') }, 'turn signals');
    watch(S_LCA, { assistedDrivingViewLcaInput: onLca }, 'lane change warning');
    return {
        indicator: () => st.dir,
        laneChange: () => (st.lcw && Date.now() - st.lcwAt < 3000 ? st.lcw : null),
        status: () => ({ turn: st.sub['turn signals'] || 'waiting', lane: st.sub['lane change warning'] || 'waiting', seen: Object.assign({}, st.seen) }),
    };
}

/** "Play on HUD": the left signal from 1 s to 4 s of each 10 s loop, the right from 6 s to 9 s with a car beside on the right. */
function demoSignals(ms) {
    const t = ((ms % 10000) + 10000) % 10000;
    return { dir: t >= 1000 && t < 4000 ? 'left' : t >= 6000 && t < 9000 ? 'right' : 'off', lcw: { left: false, right: t >= 6500 && t < 9000 } };
}

/**
 * The layers on cluster-render: client() the client (or null), log. update(s) every TICK_MS with s = { show, turn,
 * lane, dir, lcw, place (signalsPlace) }; drop() when the client goes. state() for the tests.
 */
function createSignals(client, log, now) {
    now = now || Date.now;
    const refs = { arrow: { left: 0, right: 0 }, lcw: { left: 0, right: 0 } };
    const lit = { arrow: { left: null, right: null }, lcw: { left: null, right: null } };
    let placed = '', blinkFrom = 0, lastDir = 'off', heldDir = '', offSince = -Infinity, armed = false, refusedLogged = false;
    const key = (p) => SIDES.map((s) => [p.arrow[s].x, p.arrow[s].y, p.lcw[s].x, p.lcw[s].y].join(',')).join('|');

    function make(kind, side, p) {
        const cr = client();
        if (refs[kind][side] || !cr) return refs[kind][side];
        const size = kind === 'arrow' ? ARROW : LCW, r = p[kind][side];
        const c = new Canvas(size.w, size.h);
        if (kind === 'arrow') drawArrow(c, side); else drawLaneSign(c, side);
        // above the tach and the directions (z 0)
        const ref = cr.image({ target: 'hud', klass: 'overlay', z: 12, x: r.x, y: r.y, w: size.w, h: size.h, iw: size.w, ih: size.h, visible: false, opacity: 0 });
        if (!ref) { if (!refusedLogged) { refusedLogged = true; log.warn('hud: a signal layer refused by the client'); } return 0; }
        cr.pixels(ref, null, Buffer.from(c.d.buffer, c.d.byteOffset, c.d.length));
        refs[kind][side] = ref;
        return ref;
    }
    /** One layer on (opacity 1) or off; only a change goes to the renderer. */
    function set(kind, side, on, p) {
        if (lit[kind][side] === on) return;
        const ref = on ? make(kind, side, p) : refs[kind][side];
        const cr = client();
        if (!cr || (on && !ref)) return;
        if (ref) cr.set(ref, { visible: on, opacity: on ? 1 : 0 });
        lit[kind][side] = on;
    }
    function hideAll() {
        SIDES.forEach((s) => { set('arrow', s, false); set('lcw', s, false); });
        lastDir = 'off'; armed = false;
    }
    function update(s) {
        if (!s || !s.show) { hideAll(); return; }
        const cr = client();
        if (!cr) return;
        const p = s.place;
        // the tach moved (Size, Position, the driving mode's own place, the tach switched off): the layers with it
        const k = key(p);
        if (k !== placed) {
            placed = k;
            SIDES.forEach((side) => ['arrow', 'lcw'].forEach((kind) => { if (refs[kind][side]) cr.set(refs[kind][side], p[kind][side]); }));
        }
        // the lane change warning: each side while the car says so
        const w = s.lane ? s.lcw : null;
        SIDES.forEach((side) => set('lcw', side, !!(w && w[side]), p));
        // the arrows: flashing from the moment the direction comes, in step with the cluster's; the same direction back
        // within LINGER_MS of a let-go (a tap, a value between flashes) keeps the flashing's step
        const dir = s.turn ? s.dir || 'off' : 'off', tm = now();
        if (dir === 'off') {
            if (lastDir !== 'off') { offSince = tm; heldDir = lastDir; }
            lastDir = 'off';
            SIDES.forEach((side) => set('arrow', side, false));
            if (armed && tm - offSince > LINGER_MS) armed = false;
            return;
        }
        if (dir !== lastDir) {
            if (!(armed && dir === heldDir && tm - offSince <= LINGER_MS)) blinkFrom = tm - BLINK_LEAD_MS;
            lastDir = dir;
        }
        armed = true;
        const on = (tm - blinkFrom) % (BLINK_ON_MS + BLINK_OFF_MS) < BLINK_ON_MS;
        SIDES.forEach((side) => set('arrow', side, on && (dir === side || dir === 'both'), p));
    }
    /** The client went (closed): its layers with it. */
    function drop() {
        const cr = client();
        if (cr) SIDES.forEach((side) => ['arrow', 'lcw'].forEach((kind) => { if (refs[kind][side]) cr.drop(refs[kind][side]); }));
        SIDES.forEach((side) => { refs.arrow[side] = 0; refs.lcw[side] = 0; lit.arrow[side] = null; lit.lcw[side] = null; });
        placed = ''; lastDir = 'off'; armed = false;
    }
    return {
        update: update, drop: drop, hide: hideAll,
        state: () => ({ arrow: Object.assign({}, lit.arrow), lcw: Object.assign({}, lit.lcw), refs: { arrow: Object.assign({}, refs.arrow), lcw: Object.assign({}, refs.lcw) } }),
    };
}

/** The samples in the test pattern: both arrows and both signs at their places, drawn into cv (the scene). */
function drawSamples(cv, p, sg) {
    SIDES.forEach((side) => {
        if (sg.turn) { const c = new Canvas(ARROW.w, ARROW.h); drawArrow(c, side); cv.blit(c, p.arrow[side].x, p.arrow[side].y); }
        if (sg.lane) { const c = new Canvas(LCW.w, LCW.h); drawLaneSign(c, side); cv.blit(c, p.lcw[side].x, p.lcw[side].y); }
    });
}

module.exports = { signalsOf, signalsPlace, drawArrow, drawLaneSign, drawSamples, direction, decodeLca, watchCar, createSignals, demoSignals,
    ARROW, LCW, TICK_MS, BLINK_ON_MS, BLINK_OFF_MS, BLINK_LEAD_MS, LINGER_MS, S_LIGHT, S_LCA };
