'use strict';
/**
 * hud-signals.js - the turn signal arrows on Redline's HUD, as Cluster Info draws them (idrive7-cluster-info
 * apps/akakingj_cluster_info: overlay.js drawArrow, indicators.js): an arrow each side, green while that side flashes,
 * in step with the cluster's own.
 *
 * Where (signalsPlace): under the tach when it shows, 40 px in from each of its ends; at the tach's own place when the
 * tach itself is switched off (setting hudTach), so they stay at the top of what the HUD shows (not above y 114 there,
 * scene.sigTop + 10: the top of a G20's glass at 86 was cut off on the car). They move with the tach's Size and Position.
 *
 * Two small image layers, each drawn once: flashing switches only their opacity (a few bytes, no pixels).
 * Settings: hudTurnSignals, hudTach (the tach itself).
 *
 * (2.0.57..2.0.61 also drew a lane change warning beside each arrow, from the driving assistant's lane change service:
 * on two G20 / G21 the head unit has no such service, "not available", so 2.0.62 took it out.)
 */
const { Canvas } = require('./kit/canvas');

const ARROW = { w: 30, h: 24 };
const INSET = 40;           // each arrow this far in from the tach's end (where the lane change sign sat, before 2.0.62)
const BELOW_GAP = 8;        // between the tach's foot and the arrows
const TOP_PAD = 10;         // the arrows' top place: scene.sigTop + 10 (y 114 on iDrive 7, as Cluster Info's)
const MIN_SPAN = 240;       // the two sides at least this far apart (a small tach): left and right read apart
const INDICATOR_GREEN = '#22d046';
// the cluster's own arrow (Cluster Info, measured over 39 flashes of a video): 335 ms lit of 638, the head unit told
// about 40 ms after the cluster's first flash; gone 1200 ms after the stalk is let go (no flicker on a tap)
const BLINK_ON_MS = 335, BLINK_OFF_MS = 303, BLINK_LEAD_MS = 40, LINGER_MS = 1200, TICK_MS = 25;
const SIDES = ['left', 'right'];

const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The two switches: { tach, turn } (both on unless switched off). */
function signalsOf(settings) {
    return { tach: settings.get('hudTach') !== false, turn: settings.get('hudTurnSignals') !== false };
}

/**
 * Where the arrows go for the tach's place t ({ x, y, w, h }) in a scene { w, h }: tachOn, under it (above it where
 * that doesn't fit, as on iDrive 8's small HUD; else at the scene's foot); otherwise at its top. Returns
 * { arrow: { left, right }, band } ({ x, y, w, h } each; band spans both).
 */
function signalsPlace(t, tachOn, scene) {
    const span = Math.min(Math.max(t.w, MIN_SPAN), scene.w);
    const x0 = clamp(Math.round(t.x + t.w / 2 - span / 2), 0, Math.max(0, scene.w - span));
    // (with the tach off, never above scene.sigTop + 10: on the owner's G20 Cluster Info's arrows at y 86 lost their
    // top, 2026-11-15, so their top place is 114, where Cluster Info's sit)
    let y = Math.max(t.y + TOP_PAD, (scene.sigTop || 0) + TOP_PAD);
    if (tachOn) {
        y = t.y + t.h + BELOW_GAP;
        if (y + ARROW.h > scene.h) { const up = t.y - BELOW_GAP - ARROW.h; y = up >= 0 ? up : scene.h - ARROW.h; }
    }
    y = clamp(y, 0, Math.max(0, scene.h - ARROW.h));
    const r = (x) => ({ x: x, y: y, w: ARROW.w, h: ARROW.h });
    const left = r(x0 + INSET), right = r(x0 + span - INSET - ARROW.w);
    return { arrow: { left: left, right: right }, band: { x: left.x, y: y, w: right.x + ARROW.w - left.x, h: ARROW.h } };
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

/*
 * The car's turn signals, read only, from the body's light module (de.bmw.body.Light, either field may be the one the
 * car fills). As Cluster Info's indicators.js.
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
const S_LIGHT = 'de.bmw.body.Light';

/**
 * Watch the car's turn signals (ctx.signals). Returns { indicator() ('off' | 'left' | 'right' | 'both'), status() }.
 */
function watchCar(ctx, log, opts) {
    const st = { dir: 'off', seen: { light: 0 }, sub: {}, res: {}, logged: { dir: 0 } };
    const info = (m) => { try { log.info(m); } catch (e) { /* no log */ } };
    const onLight = (what) => (v) => {
        st.seen.light++;
        const c = one(v, 'controlIndicateDirection'), a = one(v, 'activeFunctionIndicateDirection');
        const dir = direction(c, a);
        if (!dir || dir === st.dir) return;
        st.dir = dir;                    // (before the log line: a log that throws can't keep the value out)
        // the first few changes in Settings > Logs (lines starting "hud: "), so a drive shows the signals arrive
        if (st.logged.dir < 6) { st.logged.dir++; info('hud: turn signals: ' + dir + ' (' + what + ' ' + c + ' / ' + a + ')'); }
    };
    /* After a while, whether the car's service answered at all and how much came (Settings > Logs): "not available",
     * a head unit without it; available with nothing received, a car that sends it only to its own displays. */
    const report = (what, key) => () => {
        const r = st.res[what];
        info('hud: ' + what + ': service ' + (r && r.available ? 'available' : 'not available') + ', ' + st.seen[key] + ' received');
    };
    const later = (f, ms) => { const tm = setTimeout(f, ms); if (tm && tm.unref) tm.unref(); };
    const watch = (iface, handlers, what, key) => {
        if (!ctx.signals || !ctx.signals.watch) { st.sub[what] = 'no signals'; return; }
        Promise.resolve(ctx.signals.watch(iface, '1', handlers, log))
            .then((s) => {
                st.res[what] = s || {};
                st.sub[what] = s && s.error ? 'error: ' + s.error : 'subscribed';
                info('hud: ' + what + ' ' + st.sub[what]);
                ((opts && opts.reportMs) || [20000, 180000]).forEach((ms) => later(report(what, key), ms));
            })
            .catch((e) => { st.sub[what] = 'error: ' + e; info('hud: ' + what + ' error: ' + e); });
    };
    watch(S_LIGHT, { StatusFunctionsIndicators: onLight('indicators'), StatusFunctionsIndicators2: onLight('indicators 2') }, 'turn signals', 'light');
    return {
        indicator: () => st.dir,
        status: () => ({ turn: st.sub['turn signals'] || 'waiting', seen: Object.assign({}, st.seen), available: !!(st.res['turn signals'] || {}).available }),
    };
}

/** "Play on HUD": the left signal from 1 s to 4 s of each 10 s loop, the right from 6 s to 9 s. */
function demoSignals(ms) {
    const t = ((ms % 10000) + 10000) % 10000;
    return { dir: t >= 1000 && t < 4000 ? 'left' : t >= 6000 && t < 9000 ? 'right' : 'off' };
}

/**
 * The layers on cluster-render: client() the client (or null), log. update(s) every TICK_MS with s = { show, turn,
 * dir, place (signalsPlace) }; drop() when the client goes. state() for the tests.
 */
function createSignals(client, log, now) {
    now = now || Date.now;
    const refs = { arrow: { left: 0, right: 0 } };
    const lit = { arrow: { left: null, right: null } };
    let placed = '', blinkFrom = 0, lastDir = 'off', heldDir = '', offSince = -Infinity, armed = false, refusedLogged = false;
    const key = (p) => SIDES.map((s) => [p.arrow[s].x, p.arrow[s].y].join(',')).join('|');

    function make(kind, side, p) {
        const cr = client();
        if (refs[kind][side] || !cr) return refs[kind][side];
        const size = ARROW, r = p[kind][side];
        const c = new Canvas(size.w, size.h);
        drawArrow(c, side);
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
        SIDES.forEach((s) => set('arrow', s, false));
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
            SIDES.forEach((side) => { if (refs.arrow[side]) cr.set(refs.arrow[side], p.arrow[side]); });
        }
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
        if (cr) SIDES.forEach((side) => { if (refs.arrow[side]) cr.drop(refs.arrow[side]); });
        SIDES.forEach((side) => { refs.arrow[side] = 0; lit.arrow[side] = null; });
        placed = ''; lastDir = 'off'; armed = false;
    }
    return {
        update: update, drop: drop, hide: hideAll,
        state: () => ({ arrow: Object.assign({}, lit.arrow), refs: { arrow: Object.assign({}, refs.arrow) } }),
    };
}

/** The samples in the test pattern: both arrows at their places, drawn into cv (the scene). */
function drawSamples(cv, p, sg) {
    if (!sg.turn) return;
    SIDES.forEach((side) => { const c = new Canvas(ARROW.w, ARROW.h); drawArrow(c, side); cv.blit(c, p.arrow[side].x, p.arrow[side].y); });
}

module.exports = { signalsOf, signalsPlace, drawArrow, drawSamples, direction, watchCar, createSignals, demoSignals,
    ARROW, TICK_MS, BLINK_ON_MS, BLINK_OFF_MS, BLINK_LEAD_MS, LINGER_MS, S_LIGHT };
