'use strict';
/**
 * sheet.js - pages the kit draws over an app's own page with the GPU renderer (full-screen
 * layout, mgu-render/1): the settings and cards such as the Service app's item details.
 *
 * A sheet is driven by the display (display.js openSheet):
 *   draw(r, t)  draw on r (a 1600 x 520 Recorder, the app's page coordinates); returns the touch
 *               targets [{ x, y, w, h, act }] (act(): what a tap does; 'close' closes the sheet)
 *   move(d)     controller knob: d clicks (+ = clockwise)
 *   press()     controller press; back(): tilt left. Both return 'close' to close the sheet.
 *   top()       (optional) the controller is at the sheet's top: pushed up, it goes to the header's tabs
 *   title       the header's text
 *
 *   listSheet(settings)     the app's settings: a row per setting, a list of values to pick from; opts.extra: the
 *                           app's own rows at the very bottom ({ label, value, open() -> a sheet shown in its place,
 *                           its Back / 'close' back to the settings })
 *   cardSheet(spec)         a card: title, rows of label and value, action buttons
 *   list(), pill()          the settings' scrolling rows and round buttons, for an app's own sheets
 *
 * iDrive 7 skin (t.skin, themes.js): flat rows with fine dividers, the focused one in the orange focus gradient, radio
 * buttons at the left, a check box for a switch, a setting's value under its name. The settings are split as the head
 * unit's own menus: the list on the left (48 %), and on the right a read-only preview of the focused row - the values
 * of a setting (the saved one marked), the settings of a group - or, in a value list, the focused value against the
 * saved one. Nothing changes until a row is pressed.
 */
const { withAlpha } = require('./canvas');
const G = require('./gauges');
const { t: translate } = require('./i18n');

const W = 1600, TOP = 46, BOTTOM = 512;
const ROW_H = 66, GAP = 8;
const SK = (t) => !!(t && t.skin === 'idrive7');
const SK_ROW = 76;                       // iDrive 7: a row's height (name, and its value under it), no gap
const SPLIT = Math.round(W * 0.48);      // iDrive 7: where the settings' list ends and the preview starts

/* ---------------- drawing helpers ---------------- */
function pill(r, t, x, y, w, h, label, on, opts) {
    const o = opts || {}, S = t.sel || t.accent;
    const c = o.color || S;
    if (SK(t)) {
        // a flat button with a fine frame; the controller on it (or a primary one): the focus gradient
        if (on && !o.color) G.focusFill(r, t, x, y, w, h, 2);
        else if (on) r.roundRect(x, y, w, h, 3, withAlpha(c, 0.8));
        else { r.roundRect(x, y, w, h, 3, withAlpha('#ffffff', 0.04)); r.strokeRoundRect(x, y, w, h, 3, 1.5, o.color ? withAlpha(o.color, 0.8) : t.line); }
        r.text(label, x + w / 2, y + h / 2 + 9, 26, on ? '#ffffff' : o.color || t.text, { align: 'center', font: 'label' });
        return;
    }
    r.roundRect(x, y, w, h, h / 2, on ? withAlpha(c, 0.9) : withAlpha('#ffffff', 0.08));
    if (!on) r.strokeRoundRect(x, y, w, h, h / 2, 1.5, withAlpha(o.color || '#ffffff', o.color ? 0.7 : 0.22));
    r.text(label, x + w / 2, y + h / 2 + 9, 24, on ? '#ffffff' : o.color || t.text, { align: 'center', font: 'bold', spacing: 1 });
}
function toggle(r, t, x, y, on) {
    const S = t.sel || t.accent, w = 76, h = 38;
    r.roundRect(x, y, w, h, h / 2, on ? S : withAlpha('#ffffff', 0.16));
    r.circle(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 5, '#ffffff');
}
/** iDrive 7: a radio button (silver ring, red dot when on) centred at (cx, cy); a check box (orange tick when on) at (x, y). */
function radio7(r, t, cx, cy, on, dim) {
    r.circle(cx, cy, 15, dim ? '#7d7c81' : '#bdbcc0');
    r.circle(cx, cy, 12.8, '#08080a');
    if (on) r.circle(cx, cy, 8.5, dim ? withAlpha('#f32d2e', 0.7) : '#f32d2e');
}
function check7(r, t, x, y, on, dim) {
    r.strokeRoundRect(x, y, 30, 30, 2, 2, dim ? '#7d7c81' : '#bdbcc0');
    if (on) { const c = dim ? withAlpha(t.sel || t.accent, 0.7) : t.sel || t.accent; r.line(x + 6, y + 15, x + 12, y + 22, 4, c); r.line(x + 12, y + 22, x + 25, y + 7, 4, c); }
}
function chevron(r, t, x, y, c) {
    r.line(x, y - 9, x + 9, y, 3, c);
    r.line(x + 9, y, x, y + 9, 3, c);
}
/** The size, size at most and 15 at least, at which s takes w px (a setting's help: made smaller, not cut). */
function sizeFor(r, s, size, w) { return Math.max(15, Math.min(size, Math.floor(size * w / Math.max(1, r.textWidth(s, size))))); }
function fit(r, s, size, w, font) {
    s = translate(String(s));
    if (r.textWidth(s, size, { font }) <= w) return s;
    while (s.length > 1 && r.textWidth(s + '...', size, { font }) > w) s = s.slice(0, -1);
    return s + '...';
}

/**
 * A scrolling list of rows: rows = [{ label, value, kind: 'toggle'|'more'|'radio', on }].
 * Draws them from y0, keeps row `focus` in view (smooth), returns the rows' rects.
 */
function list(r, t, key, rows, focus, y0, controller, opts) {
    if (SK(t)) return list7(r, t, key, rows, focus, y0, controller, opts || {});
    // (r.extra: the page reaches lower on screen, display.js)
    const S = t.sel || t.accent, bottom = BOTTOM + (r.extra || 0), H = bottom - y0;
    const total = rows.length * (ROW_H + GAP) - GAP;
    const fy = focus * (ROW_H + GAP);
    // st.y: where the list should be; st.show: where it is drawn (glides there, follows a finger at once).
    // The focused row is brought into view when the focus moves, so a finger can scroll it away.
    const st = list.scroll[key] || (list.scroll[key] = { y: 0, show: 0, focus: -1, drag: false });
    if (st.focus !== focus) {
        st.focus = focus;
        if (fy < st.y) st.y = fy;
        if (fy + ROW_H > st.y + H) st.y = fy + ROW_H - H;
    }
    st.y = Math.max(0, Math.min(st.y, Math.max(0, total - H)));
    st.show = st.drag || Math.abs(st.y - st.show) < 0.5 ? st.y : st.show + (st.y - st.show) * 0.35;
    const sy = st.show;
    const rects = [];
    r.clip(0, y0, W, H);
    rows.forEach((row, i) => {
        const y = y0 + i * (ROW_H + GAP) - sy;
        if (y + ROW_H < y0 || y > bottom) return;
        const x = 40, w = W - 80, on = i === focus && controller;
        r.roundRect(x, y, w, ROW_H, 14, on ? withAlpha(S, 0.22) : withAlpha('#ffffff', 0.05));
        if (on) r.strokeRoundRect(x, y, w, ROW_H, 14, 2, S);
        const cy = y + ROW_H / 2;
        let right = x + w - 28;
        if (row.kind === 'toggle') { toggle(r, t, right - 76, cy - 19, row.on); right -= 100; } else if (row.kind === 'more') { chevron(r, t, right - 9, cy, t.dim); right -= 34; } else if (row.kind === 'radio') {
            r.circle(right - 15, cy, 15, row.on ? S : withAlpha('#ffffff', 0.25));
            r.circle(right - 15, cy, row.on ? 6 : 12, row.on ? '#ffffff' : t.bg);
            right -= 44;
        }
        const vw = row.value != null ? Math.min(560, r.textWidth(String(row.value), 26)) : 0;
        // (row.color: a row of the kit's own that must stand out, e.g. Stop all in red)
        if (row.color) r.roundRect(x, y, 8, ROW_H, 4, row.color);
        if (row.value != null) r.text(fit(r, row.value, 26, 560), right, cy + 9, 26, row.color || (row.on && row.kind === 'radio' ? t.text : t.dim), { align: 'right' });
        r.text(fit(r, row.label, 28, right - vw - 40 - (x + 28)), x + 28, cy + 10, 28, row.color || t.text, row.color ? { font: 'bold' } : undefined);
        rects.push({ i, x, y: Math.max(y, y0), w, h: Math.min(y + ROW_H, bottom) - Math.max(y, y0) });
    });
    r.noclip();
    if (total > H) {
        // scroll position
        const bh = Math.max(40, H * H / total), by = y0 + (H - bh) * (sy / (total - H));
        r.roundRect(W - 22, by, 6, bh, 3, withAlpha('#ffffff', 0.3));
    }
    return rects;
}
list.scroll = {};

/**
 * list() in the iDrive 7 skin: flat rows of SK_ROW px, a fine divider under each, the focused row in the focus gradient
 * (always where opts.always, else once the controller is used, as the classic list). A row's value goes under its name,
 * a radio button to its left, a switch's check box and a "more" row's corner mark to its right.
 * opts: { x, w } (default: the page's width less 40 px each side), always.
 */
function list7(r, t, key, rows, focus, y0, controller, opts) {
    const bottom = BOTTOM + (r.extra || 0), H = bottom - y0, RH = SK_ROW;
    const x = opts.x != null ? opts.x : 40, w = opts.w != null ? opts.w : W - 80;
    const total = rows.length * RH, fy = focus * RH;
    const st = list.scroll[key] || (list.scroll[key] = { y: 0, show: 0, focus: -1, drag: false });
    if (st.focus !== focus) {
        st.focus = focus;
        if (fy < st.y) st.y = fy;
        if (fy + RH > st.y + H) st.y = fy + RH - H;
    }
    st.y = Math.max(0, Math.min(st.y, Math.max(0, total - H)));
    st.show = st.drag || Math.abs(st.y - st.show) < 0.5 ? st.y : st.show + (st.y - st.show) * 0.35;
    const sy = st.show, rects = [];
    r.clip(x, y0, w, H);
    rows.forEach((row, i) => {
        const y = y0 + i * RH - sy;
        if (y + RH < y0 || y > bottom) return;
        const on = i === focus && (controller || opts.always);
        r.fillRect(x, y, w, RH, withAlpha('#ffffff', 0.035));
        if (on) G.focusFill(r, t, x, y, w, RH, 2);
        r.fillRect(x, y + RH - 1, w, 1, t.line);
        const cy = y + RH / 2;
        let left = x + 28, right = x + w - 24;
        if (row.kind === 'radio') { radio7(r, t, left + 15, cy, row.on); left += 48; }
        if (row.kind === 'toggle') { check7(r, t, right - 30, cy - 15, row.on); right -= 52; }
        if (row.kind === 'more') { const bx = x + w - 16, by = y + RH - 14; r.quad([[bx - 12, by], [bx, by], [bx, by - 12], [bx, by - 12]], on ? '#ffffff' : '#d8d7da'); right -= 24; }
        const hasVal = row.value != null && String(row.value) !== '';
        if (hasVal) {
            r.text(fit(r, row.label, 28, right - left), left, y + 34, 28, t.text);
            r.text(fit(r, row.value, 22, right - left), left, y + 63, 22, on ? '#e8e2de' : t.dim);
        } else r.text(fit(r, row.label, 28, right - left), left, cy + 10, 28, t.text);
        rects.push({ i, x, y: Math.max(y, y0), w, h: Math.min(y + RH, bottom) - Math.max(y, y0) });
    });
    r.noclip();
    if (total > H) {
        const bh = Math.max(40, H * H / total), by = y0 + (H - bh) * (sy / (total - H));
        r.fillRect(x + w - 4, by, 3, bh, withAlpha('#ffffff', 0.45));
    }
    return rects;
}

/* ---------------- settings ---------------- */
function values(s, settings) {
    if (s.type === 'choice') return (s.options || []).map((o) => [o[0], o[1]]);
    if (s.type === 'number') {
        // a value's text in the unit chosen (mgu.js Settings.numberText: "labels", "unitBy")
        const text = (v) => (settings && settings.numberText ? settings.numberText(s, v)
            : s.labels && s.labels[String(v)] !== undefined ? s.labels[String(v)] : String(v) + (s.unit ? ' ' + s.unit : ''));
        return (s.steps || []).map((v) => [v, text(v) + (s.markDefault && v === s.default ? ' (default)' : '')]);
    }
    return null;
}

/**
 * opts: { version (the app's, shown at the settings' top), extra (() => the app's own rows at the bottom),
 *         first (() => the kit's own rows at the very top, e.g. Stop all) }
 */
function listSheet(settings, title, opts) {
    const version = opts && opts.version;
    // the app's own rows after its settings (top level only): [{ label, value (text or () => text), open(), color }]
    const extra = () => { try { return (opts && opts.extra && opts.extra()) || []; } catch (e) { return []; } };
    const first = () => { try { return (opts && opts.first && opts.first()) || []; } catch (e) { return []; } };
    const valueOf = (x) => (typeof x.value === 'function' ? x.value() : x.value);
    // the settings offered now (settings.shown: "hidden", "when"); those with one "group" are one row that
    // opens their own list ({ group, items })
    const offered = () => (settings.shown ? settings.schema.filter((s) => settings.shown(s)) : settings.schema.filter((s) => !s.hidden));
    const entries = (group) => {
        const out = group ? [] : first().map((x) => ({ extra: x }));
        offered().forEach((s) => {
            if (group) { if (s.group === group) out.push(s); return; }
            if (!s.group) { out.push(s); return; }
            if (!out.some((e) => e.group === s.group)) out.push({ group: s.group, items: [] });
        });
        if (!group) extra().forEach((x) => out.push({ extra: x }));
        return out;
    };
    // a setting the Car profile app sets now: its value shown, not changed here (mgu.js Settings.held)
    const held = (s) => !!(s && s.key && settings.held && settings.held(s.key));
    const sh = {
        title: title || 'Settings',
        focus: 0, open: null, sub: 0,        // open: the setting whose values are listed
        group: null, gfocus: 0,              // group: the group whose settings are listed (focus kept in gfocus)
        controller: false,                  // the controller was used: show where it is
        child: null,                         // an extra row's own sheet, shown in the settings' place
        rows() {
            if (this.open) {
                const cur = settings.get(this.open.key);
                return values(this.open, settings).map((v) => ({ label: v[1], kind: 'radio', on: v[0] === cur }));
            }
            return entries(this.group).map((s) => (s.extra ? { label: s.extra.label, value: valueOf(s.extra), kind: s.extra.color ? null : 'more', color: s.extra.color }
                : s.group && !s.key ? { label: s.group, kind: 'more' }
                : s.type === 'bool' ? { label: s.label, kind: 'toggle', on: !!settings.get(s.key) }
                    : { label: s.label, value: settings.display(s.key), kind: values(s) && !held(s) ? 'more' : null }));
        },
        draw(r, t) {
            // (its taps through fromChild too, so its Back / 'close' comes back here)
            // (a child that fails to draw is dropped, and the error goes to display.js's log: the settings come
            // back on the next frame rather than a blank sheet)
            if (this.child) {
                try { return (this.child.draw(r, t) || []).map((q) => Object.assign({}, q, { act: () => this.fromChild(q.act && q.act()) })); } catch (e) { this.child = null; throw e; }
            }
            r.clear(t.bg);
            const rows = this.rows();
            // a switch that hid settings below the focus ("when"): the focus stays on the list
            if (!this.open) this.focus = Math.min(this.focus, rows.length - 1);
            if (SK(t)) return this.drawSplit(r, t, rows);
            const targets = [];
            // the list first, then the header over the rows scrolled up under it (the software path draws past a clip)
            const rects = list(r, t, this.key(), rows, this.open ? this.sub : this.focus, TOP + 74, this.controller);
            r.noclip();
            r.fillRect(0, 0, W, TOP + 74, t.bg);
            // the header's tab names the sheet; a value list names its setting here
            if (this.open || this.group) r.text(this.open ? this.open.label : this.group, 44, TOP + 40, 32, t.text, { font: 'bold' });
            else if (version) r.text('Version ' + version, 44, TOP + 38, 24, t.dim);
            // Back (a value list) / Done (the settings): top right
            const bw = 150, bx = W - 40 - bw, by = TOP + 8;
            // (a value list: what the setting does, app.json "help", after its name)
            if (this.open && this.open.help) {
                const hx = 44 + Math.ceil(r.textWidth(translate(this.open.label), 32, { font: 'bold' })) + 28;
                const h = translate(this.open.help), hs = sizeFor(r, h, 22, bx - 24 - hx);
                if (bx - 24 - hx > 120) r.text(fit(r, h, hs, bx - 24 - hx), hx, TOP + 38, hs, t.dim);
            }
            // (the controller reaches it turning up from the first row: place -1)
            pill(r, t, bx, by, bw, 46, this.open || this.group ? 'Back' : 'Done', this.controller && (this.open ? this.sub : this.focus) === -1);
            targets.push({ x: bx - 10, y: by - 6, w: bw + 20, h: 58, act: () => this.back() });
            rects.forEach((q) => targets.push(Object.assign(q, { act: () => { if (this.open) this.sub = q.i; else this.focus = q.i; return this.choose(); } })));
            return targets;
        },
        /** The iDrive 7 skin's settings: the list on the left, a preview of the focused row on the right (read only). */
        drawSplit(r, t, rows) {
            const targets = [], y0 = TOP + 74, at = this.open ? this.sub : this.focus;
            // the list first, then the header over the rows scrolled up under it (the software path draws past a clip)
            const rects = list(r, t, this.key(), rows, at, y0, this.controller, { x: 24, w: SPLIT - 24, always: true });
            r.noclip();
            r.fillRect(0, 0, W, y0, t.bg);
            if (this.open || this.group) r.text(this.open ? this.open.label : this.group, 44, TOP + 42, 32, t.text);
            else if (version) r.text('Version ' + version, 44, TOP + 40, 24, t.dim);
            const bw = 150, bx = W - 40 - bw, by = TOP + 8;
            pill(r, t, bx, by, bw, 46, this.open || this.group ? 'Back' : 'Done', this.controller && at === -1);
            targets.push({ x: bx - 10, y: by - 6, w: bw + 20, h: 58, act: () => this.back() });
            rects.forEach((q) => targets.push(Object.assign(q, { act: () => { if (this.open) this.sub = q.i; else this.focus = q.i; return this.choose(); } })));
            // between the two: the divider, and an orange mark level with the focused row where it has a preview
            const bottom = BOTTOM + (r.extra || 0), px = SPLIT + 40, pw = W - px - 32;
            r.fillRect(SPLIT, y0, 1, bottom - y0, t.line);
            const pv = this.preview();
            const fr = rects.find((q) => q.i === at);
            if (fr && pv.rows.length && !this.open) { const cy = fr.y + fr.h / 2; r.line(SPLIT + 12, cy - 11, SPLIT + 22, cy, 3, t.sel || t.accent); r.line(SPLIT + 22, cy, SPLIT + 12, cy + 11, 3, t.sel || t.accent); }
            r.clip(px, y0, pw + 8, bottom - y0);
            let y = y0;
            if (pv.text) { r.text(fit(r, pv.text, 34, pw), px, y + 46, 34, t.text); y += 70; }
            if (pv.note) { r.text(fit(r, pv.note, 24, pw), px, y + 30, 24, t.dim); y += 48; }
            if (pv.help) { const hs = sizeFor(r, pv.help, 22, pw); r.text(fit(r, pv.help, hs, pw), px, y + 30, hs, t.dim); y += 44; }
            pv.rows.forEach((row) => {
                if (y > bottom) return;
                const cy = y + 32;
                let left = px + 8;
                if (row.kind === 'radio') { radio7(r, t, left + 15, cy, row.on, true); left += 48; }
                if (row.kind === 'toggle') check7(r, t, px + pw - 38, cy - 15, row.on, true);
                r.text(fit(r, row.label, 26, pw - (left - px) - (row.value != null ? 220 : 50)), left, cy + 9, 26, t.dim);
                if (row.value != null) r.text(fit(r, row.value, 22, 200), px + pw - 8, cy + 8, 22, '#8f8d92', { align: 'right' });
                r.fillRect(px, y + 63, pw, 1, withAlpha(t.line, 0.8));
                y += 64;
            });
            r.noclip();
            return targets;
        },
        /**
         * What the right side shows: { text, note, help, rows } - a setting's values (the saved one on), a group's
         * settings, a switch's state; in a value list, the focused value, the saved one and what the setting does
         * (app.json "help").
         */
        preview() {
            const none = { rows: [] };
            if (this.open) {
                const vs = values(this.open, settings), v = vs[this.sub];
                if (!v) return none;
                const cur = vs.find((q) => q[0] === settings.get(this.open.key));
                return { text: v[1], note: !cur ? null : cur[0] !== v[0] ? translate('Saved') + ': ' + translate(String(cur[1])) : translate('Saved'),
                    help: this.open.help ? translate(this.open.help) : null, rows: [] };
            }
            const s = entries(this.group)[this.focus];
            if (!s) return none;
            if (s.extra) return { text: valueOf(s.extra) != null ? String(valueOf(s.extra)) : null, rows: [] };
            if (s.group && !s.key) {
                return { rows: entries(s.group).map((c) => (c.type === 'bool' ? { label: c.label, kind: 'toggle', on: !!settings.get(c.key) }
                    : { label: c.label, value: settings.display(c.key) })) };
            }
            if (held(s)) return { text: settings.display(s.key), note: translate('Car profile'), rows: [] };
            if (s.type === 'bool') return { text: translate(settings.get(s.key) ? 'On' : 'Off'), rows: [] };
            const vs = values(s, settings);
            if (vs) { const cur = settings.get(s.key); return { rows: vs.map((v) => ({ label: v[1], kind: 'radio', on: v[0] === cur })) }; }
            return { text: settings.display(s.key), rows: [] };
        },
        key() { return this.open ? 'v_' + this.open.key : this.group ? 'g_' + this.group : 'settings'; },
        /** the controller is on Done / Back: pushed up from here it goes to the header's tabs */
        top() { if (this.child) return this.child.top ? this.child.top() : false; return (this.open ? this.sub : this.focus) === -1; },
        /** touch: the list moved by dy (px, + = further down the list) while the finger is on it */
        scroll(dy) {
            if (this.child) { if (this.child.scroll) this.child.scroll(dy); return; }
            const st = list.scroll[this.key()];
            if (st) { st.y += dy; st.drag = true; }
        },
        release() { if (this.child) { if (this.child.release) this.child.release(); return; } const st = list.scroll[this.key()]; if (st) st.drag = false; },
        /** what the child sheet's press / back / tap returned: its 'close' brings the settings back */
        fromChild(res) { return Promise.resolve(res).then((v) => { if (v === 'close') this.child = null; return null; }); },
        move(d) {
            if (this.child) { this.child.move(d); return; }
            this.controller = true;
            const n = this.rows().length;
            if (this.open) this.sub = Math.max(-1, Math.min(n - 1, this.sub + d));
            else this.focus = Math.max(-1, Math.min(n - 1, this.focus + d));
        },
        press() {
            if (this.child) return this.fromChild(this.child.press());
            this.controller = true;
            if ((this.open ? this.sub : this.focus) === -1) { const r = this.back(); if (this.open === null) this.focus = Math.max(0, this.focus); return r; }
            return this.choose();
        },
        choose() {
            if (this.open) {
                const v = values(this.open, settings)[this.sub];
                if (v && v[0] !== settings.get(this.open.key)) settings.set(this.open.key, v[0], 'user');
                this.open = null;
                return null;
            }
            const s = entries(this.group)[this.focus];
            if (!s) return null;
            // (an open() that throws leaves the settings as they are; display.js logs it)
            if (s.extra) { const c = s.extra.open && s.extra.open(); if (c) this.child = c; return null; }
            if (s.group && !s.key) { this.group = s.group; this.gfocus = this.focus; this.focus = 0; return null; }
            if (held(s)) return null;      // the Car profile sets it (Settings.held): changed in Car profile
            if (s.type === 'bool') settings.set(s.key, !settings.get(s.key), 'user');
            else if (values(s)) {
                this.open = s;
                this.sub = Math.max(0, values(s).findIndex((v) => v[0] === settings.get(s.key)));
            } else settings.cycle(s.key, 'user');
            return null;
        },
        back() {
            if (this.child) return this.fromChild(this.child.back());
            if (this.open) { this.open = null; return null; }
            if (this.group) { this.group = null; this.focus = this.gfocus; return null; }
            return 'close';
        },
    };
    return sh;
}

/* ---------------- card ---------------- */
/**
 * spec: { title, heading, subtitle, color, rows: [[label, value]], note, actions: [{ label, run, color, primary }] }
 * (rows / note / actions may be functions, read on each frame). An action's run() may return
 * 'close' (or a promise of it).
 */
function cardSheet(spec) {
    const get = (k) => (typeof spec[k] === 'function' ? spec[k]() : spec[k]);
    const sh = {
        title: spec.title || '',
        focus: 0, controller: false, onClose: null,
        draw(r, t) {
            r.clear(t.bg);
            const targets = [];
            const actions = get('actions') || [];
            this.focus = Math.max(-1, Math.min(this.focus, actions.length - 1));
            const x = 40, y = TOP + 6, w = W - 80, h = BOTTOM + (r.extra || 0) - y - 4;
            const sk = SK(t);
            r.roundRect(x, y, w, h, sk ? 0 : 18, withAlpha('#ffffff', sk ? 0.03 : 0.05));
            const accent = get('color') || t.sel || t.accent;
            r.roundRect(x, y, sk ? 4 : 8, h, sk ? 0 : 4, accent);
            r.text(fit(r, get('heading') || '', 40, w - 260, 'bold'), x + 44, y + 64, 40, t.text, { font: 'bold' });
            const sub = get('subtitle');
            if (sub) r.text(fit(r, sub, 24, w - 90), x + 44, y + 102, 24, accent);
            // close: top right
            const cw = 150, cx = x + w - cw - 24, cy = y + 24;
            pill(r, t, cx, cy, cw, 46, 'Close', this.controller && this.focus === -1);
            targets.push({ x: cx - 10, y: cy - 6, w: cw + 20, h: 58, act: () => 'close' });
            // label / value tiles
            const rows = (get('rows') || []).filter(Boolean);
            const tw = (w - 88 - (rows.length - 1) * 20) / Math.max(1, rows.length), ty = y + 136, th = 132;
            rows.forEach((rw, i) => {
                const tx = x + 44 + i * (tw + 20);
                if (sk) { r.fillRect(tx, ty, tw, 1, t.line); r.fillRect(tx, ty + th - 1, tw, 1, t.line); } else r.roundRect(tx, ty, tw, th, 14, withAlpha('#ffffff', 0.06));
                r.text(sk ? String(rw[0]) : String(rw[0]).toUpperCase(), tx + 24, ty + 40, sk ? 22 : 20, t.dim, sk ? { font: 'label' } : { font: 'bold', spacing: 1.5 });
                r.text(fit(r, rw[1] == null ? '--' : rw[1], 44, tw - 48, sk ? 'label' : 'bold'), tx + 24, ty + 102, 44, rw[2] || t.text, { font: sk ? 'label' : 'bold' });
            });
            const note = get('note');
            if (note) r.text(fit(r, note, 24, w - 88), x + 44, ty + th + 50, 24, t.dim);
            // actions: bottom right
            let ax = x + w - 24;
            const ay = y + h - 24 - 58;
            for (let i = actions.length - 1; i >= 0; i--) {
                const a = actions[i], aw = Math.max(200, r.textWidth(a.label, 24, { font: 'bold' }) + 80);
                ax -= aw;
                pill(r, t, ax, ay, aw, 58, a.label, this.controller ? i === this.focus : !!a.primary, { color: a.color });   // (-1: Close)
                targets.push({ x: ax, y: ay, w: aw, h: 58, act: () => a.run && a.run() });
                ax -= 20;
            }
            return targets;
        },
        move(d) {
            this.controller = true;
            const n = (get('actions') || []).length;
            this.focus = Math.max(-1, Math.min(n - 1, this.focus + d));     // -1: Close
        },
        press() {
            this.controller = true;
            if (this.focus === -1) return 'close';
            const a = (get('actions') || [])[this.focus];
            return a && a.run ? a.run() : null;
        },
        back() { return 'close'; },
        /** on Close: pushed up, the controller goes to the header's tabs */
        top() { return this.focus === -1; },
    };
    return sh;
}

module.exports = { listSheet, cardSheet, list, pill, TOP };
