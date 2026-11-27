'use strict';
/**
 * Car profile - one place for the car's engine values and units, followed by the other apps.
 *
 * Settings: the engine (Auto / Diesel / Petrol / Plug-in hybrid), the shift lights (yellow at, red at, the shift now
 * warning), where the rev gauges end, the engine's top rpm (the redline, its limiter), cold rev limit, when oil and
 * coolant count as warm, when oil, coolant and gearbox count as too hot (red), and the speed (the distances with it),
 * temperature, pressure, fuel use, torque and power units. Each one starts at "Each app": until it is set here, every
 * app keeps its own setting - but the engine, which starts on Auto (from the car, 1.12.0): the kind of car found
 * (detect.js: a plug-in hybrid, an M car, a diesel or a petrol car) is written for the apps.
 * What is set is written for the other apps (profile.js: /dev/shm/car-profile.json). Their kit follows it for the
 * settings that name it (app.json "profile") and shows those settings with the profile's value, not changeable there.
 * Uninstalled (or everything back on "Each app"), every app has its own settings again: from the next start of the
 * head unit, or at once with "Each app".
 * It runs from the platform's start (app.json "autostart"): the profile is there for the other apps without opening it.
 * Page, two tabs: Car (the engine, warm-up and too hot, the units) and Display and clock (the skin, colour theme,
 * screen layout, renderer and demo data; the AK clusters' clock, fuel tank and electric range, which comes up at every
 * start; where the G-force circle, the speedometers and the boost gauges end): the groups with each
 * value and the apps that follow it (what a value does in its values' list: app.json "help"); in the header, whether
 * anything is set for them.
 * Each row is a place for the iDrive controller and a tap: pressed, its values' list (kit/sheet.js) over the page.
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const P = require('./profile');
const { listSheet } = require('./kit/sheet');
const Detect = require('./detect');

const W = 1600, H = 520;

async function background(bg) {
    const { settings, log, spec } = bg;
    const state = { at: 0, error: '', car: null };
    // Engine: Auto (from the car): which car this is (detect.js), written for the apps in its place
    const car = Detect.create({ dataDir: bg.dataDir, log, onChange: () => write() });
    state.car = car;
    const write = () => {
        try { P.publish(settings, spec.version, log, car.kind(), car.sport()); state.at = Date.now(); state.error = ''; } catch (e) { state.error = String(e && e.message || e); log.warn('car profile: ' + state.error); }
    };
    // (1.12.0: the engine starts on Auto. One left on Each app as it came, before Auto was the default, goes to Auto once)
    if (!settings.get('engineAuto')) {
        if (settings.get('engine') === 'app') { settings.set('engine', 'auto'); log.info('Engine: Auto (from the car), the new default'); }
        settings.set('engineAuto', true);
    }
    // (1.13.0: the rev gauges' end, the redline and the speedometer start on Auto too - the car's own cluster's for the
    // kind of car. Those left on Each app as they came go to Auto once)
    if (!settings.get('gaugesAuto')) {
        const was = [];
        [['rpmScale', -1, 0], ['redline', -1, 0], ['speedMax', 'app', 'auto']].forEach(([k, each, auto]) => {
            if (settings.get(k) === each) { settings.set(k, auto); was.push(k); }
        });
        if (was.length) log.info('Auto (from the car), the new default: ' + was.join(', '));
        settings.set('gaugesAuto', true);
    }
    // (1.14.0: the yellow, the red and the shift warning start on Auto as well - the car's own cluster's, the shift
    // warning where its red turns solid. Those left on Each app go to Auto once)
    if (!settings.get('lightsAuto')) {
        const was = ['lightStart', 'lightRed', 'shiftAt'].filter((k) => settings.get(k) === -1);
        was.forEach((k) => settings.set(k, 0));
        if (was.length) log.info('Auto (from the car), the new default: ' + was.join(', '));
        settings.set('lightsAuto', true);
    }
    if (bg.signals && bg.signals.watch) {
        car.handlers().forEach(([iface, handlers]) => {
            bg.signals.watch(iface, '1', handlers, log, { pollMs: 5000 })
                .then((r) => { if (r && r.error) log.warn('car: ' + iface + ': ' + r.error); })
                .catch((e) => log.warn('car: ' + iface + ': ' + e));
        });
    }
    // (Electric range when full is in km, shown in miles with mph: one set in miles before 1.9.0 moves once, to the
    // nearest of its values; the apps that read it in miles follow their own again)
    const v = settings.values || {};
    if (typeof v.eFull === 'number') {
        const mi = v.eFull, km = mi * 1.609344, steps = ((settings.item && settings.item('eFullKm')) || {}).steps || [];
        const to = mi > 0 ? steps.filter((x) => x > 0).reduce((a, b) => (a === null || Math.abs(b - km) < Math.abs(a - km) ? b : a), null) : null;
        delete v.eFull;                         // (saved without it with eFullKm: once)
        settings.set('eFullKm', to !== null ? to : settings.get('eFullKm'));
        if (to !== null) log.info('Electric range when full: ' + mi + ' mi is ' + to + ' km now');
    }
    write();
    settings.onChange((key) => { if (P.KEYS.indexOf(key) >= 0) write(); });
    // written again should it be gone (another start of the head unit's tmpfs, a hand cleaning /dev/shm)
    const timer = setInterval(write, 30000);
    if (timer.unref) timer.unref();
    return { state, write };
}

mgu.run({
    background,
    async start(ctx) {
        const { ui, settings } = ctx;
        const { state } = ctx.background || await background(ctx);
        // Engine on Auto: the kind of car found, by it ("Auto (from the car)  ·  Plug-in hybrid (petrol)")
        const display = settings.display.bind(settings);
        // (and the gauges on Auto: what they are for that kind of car, "Auto  ·  7000 rpm")
        settings.display = (key) => {
            const d = display(key), found = state.car ? state.car.kind() : null;
            const opt = (k, v) => (((settings.item && settings.item(k)) || {}).options || []).find((x) => x[0] === v);
            if (key === 'engine') {
                const o = settings.get('engine') === 'auto' && found ? opt('engine', found) : null;
                return o ? d + '  \u00b7  ' + o[1] : d;
            }
            // (the power and torque gauges on Auto: the Sport Display's most, once the car has sent it)
            if ((key === 'powerMax' || key === 'torqueMax') && settings.get(key) === 0) {
                const sp = state.car ? state.car.sport() : {}, n = key === 'powerMax' ? sp.kw : sp.nm, it = settings.item && settings.item(key);
                return n && it && settings.numberText ? d + '  \u00b7  ' + settings.numberText(Object.assign({}, it, { labels: null }), n) : d;
            }
            const g = P.gaugesOf(P.kindOf(settings, found)), v = settings.get(key);
            const auto0 = ['rpmScale', 'redline', 'lightRed', 'shiftAt', 'lightStart'].indexOf(key) >= 0 && v === 0;
            if (!g || !auto0 && !(key === 'speedMax' && v === 'auto')) return d;
            const s = settings.item && settings.item(key);
            // (the yellow on Auto has a figure for an M car only: the others' rows say Auto as it is)
            if (key !== 'speedMax' && !g[key]) return d;
            const shown = key === 'speedMax' ? (opt('speedMax', g.speedMax) || [])[1] : s && settings.numberText ? settings.numberText(s, g[key]) : String(g[key]);
            return shown ? d + '  \u00b7  ' + shown : d;
        };
        const items = (ctx.spec.settings || []).filter((s) => P.KEYS.indexOf(s.key) >= 0);
        // (a value kept in one unit and shown in another's, "unitBy": with that unit on Each app, in every unit the
        // apps may show it in - "50 km / 31 mi" - on the rows and in the values' lists alike)
        const numberText = settings.numberText && settings.numberText.bind(settings);
        // (the power and torque gauges' ends, kept in kW and Nm: shown in hp and kgm - the owner's - or in the power and
        // torque units set here; kgm to a tenth: 420 Nm is 42.8 kgm)
        const SHOWN = { powerMax: { app: ['hp', 1.34102, 0], hp: ['hp', 1.34102, 0], ps: ['PS', 1.35962, 0], kw: ['kW', 1, 0] },
            torqueMax: { app: ['kgm', 0.101972, 1], kgm: ['kgm', 0.101972, 1], nm: ['Nm', 1, 0], lbft: ['lb-ft', 0.737562, 0] } };
        const shownIn = (s, v) => {
            const u = SHOWN[s.key][settings.get(s.unitBy)] || SHOWN[s.key].app;
            return (v * u[1]).toFixed(u[2]) + ' ' + u[0];
        };
        if (numberText) {
            settings.numberText = (s, v) => (SHOWN[s.key] && typeof v === 'number' && !(s.labels && s.labels[String(v)] !== undefined) ? shownIn(s, v)
                : s.unitBy && s.units && typeof v === 'number' && !(s.labels && s.labels[String(v)] !== undefined)
                && !P.isSet(settings.get(s.unitBy))
                ? [numberText(s, v)].concat(Object.keys(s.units).map((k) => Math.round(v * (s.units[k].mul || 1) + (s.units[k].add || 0)) + ' ' + s.units[k].unit)).join(' / ')
                : numberText(s, v));
        }

        /**
         * A row pressed (the iDrive controller or a tap): its values' list over the page, the one set marked; a
         * value chosen, or Back, and the page is back. Where the kit can't draw it (another renderer): the HMI's
         * settings.
         */
        function edit(s) {
            const sh = listSheet(settings, null, { version: ctx.spec.version });
            const own = settings.schema.find((x) => x.key === s.key) || s;
            const vals = own.type === 'choice' ? (own.options || []).map((o) => o[0]) : own.steps || [];
            sh.settings = true;
            sh.group = own.group || null;
            sh.focus = Math.max(0, settings.schema.filter((x) => (x.group || null) === sh.group && (!settings.shown || settings.shown(x))).findIndex((x) => x.key === own.key));
            sh.open = own;
            sh.sub = Math.max(0, vals.indexOf(settings.get(own.key)));
            sh.controller = true;
            let direct = true;      // opened from the page: done with this one value
            const choose = sh.choose, back = sh.back;
            sh.choose = function () { const was = direct && !!this.open; const r = choose.call(this); return was ? 'close' : r; };
            sh.back = function () { if (direct && this.open && !this.child) return 'close'; direct = false; return back.call(this); };
            sh.onClose = () => render();
            if (ctx.sheet && ctx.sheet(sh)) return null;
            return ui.open('SETTINGS');
        }

        function row(cv, t, x, y, w, s, pitch) {
            const v = settings.get(s.key), on = P.isSet(v);
            // the whole row: the controller's place (in order down the columns) and a tap
            cv.target(x - 12, y - 2, w + 24, Math.min(50, pitch - 4), () => edit(s), 'row_' + s.key, 8);
            // (the name smaller where it would reach the value: the value always whole)
            const val = settings.display(s.key), vw = cv.textWidth(val, 23, { font: 'bold' }), room = w - vw - 16;
            const ls = cv.textWidth(s.label, 21) <= room ? 21 : Math.max(15, Math.floor(21 * room / Math.max(1, cv.textWidth(s.label, 21))));
            cv.text(s.label, x, y + 20, ls, t.text);
            cv.text(val, x + w, y + 20, 23, on ? (t.sel || t.accent) : t.dim, { align: 'right', font: 'bold' });
            const who = (P.FOLLOW[s.key] || []).join(', ');
            // (the apps that follow it: smaller where the list would run past the panel, 11 at least; what the value
            // does: its "help", in its values' list)
            if (who) cv.text(who, x, y + 42, Math.max(11, Math.min(15, Math.floor(15 * w / Math.max(1, cv.textWidth(who, 15))))), on ? t.dim : withAlpha(t.dim, 0.55));
            cv.fillRect(x, y + 51, w, 1, withAlpha(t.tick || t.dim, 0.25));
        }

        let page = 0;
        const TABS = ['Car', 'Display and clock'];
        function render() {
            const t = ctx.theme();
            const cv = ctx.canvas(W, H).clear(t.bg);
            const gap = 16, pw = Math.floor((W - gap * 4) / 3), top = G.TOP + 4, bottom = G.pageBottom(cv) - 8;
            // (a row offered only with another value, "when": the colour theme with the classic skin)
            const group = (g) => items.filter((s) => s.group === g && (!settings.shown || settings.shown(s)));
            const column = (i, panels) => {
                // each panel's rows 56 apart, 52 where two share a column; the last panel down to the page's bottom
                // (a lone panel of more than 7 rows: closer, so they fit down to the page's bottom)
                const x = gap + i * (pw + gap);
                let y = top;
                panels.forEach(([g, title], k) => {
                    // (a panel of more than one group: their rows one after the other)
                    const rows = [].concat.apply([], [].concat(g).map(group)), last = k === panels.length - 1;
                    const pitch = panels.length > 1 ? 52 : Math.min(56, Math.floor((bottom - top - 62) / Math.max(1, rows.length)));
                    const p = G.panel(cv, t, x, y, pw, last ? bottom - y : 64 + rows.length * pitch, title);
                    rows.forEach((s, j) => row(cv, t, p.x + 22, p.y + 58 + j * pitch, p.w - 44, s, pitch));
                    y = p.y + p.h + gap;
                });
            };
            if (page === 0) {
                column(0, [['Engine', 'Engine']]);
                // warm-up and too hot in one panel: seven rows as the other columns (with the gearbox oil's warm-up, two panels
                // of four and three no longer fit the page)
                column(1, [[['Warm-up', 'Too hot'], 'Warm-up and too hot']]);
                column(2, [['Units', 'Units']]);
            } else {
                // the screens' look (every app), then the AK clusters' clock and a plug-in hybrid's battery (1.15.0: the
                // fuel's two rows gone)
                column(0, [['Display', 'Display']]);
                // (the clock's two rows; under them the gauges' ends: the G-force circle, the speedometer, boost)
                column(1, [['Clock', 'Clock'], [['G-force', 'Gauges'], 'Gauges']]);
                // (under the battery: which AK cluster comes up at every start)
                column(2, [['Battery', 'Battery'], ['Cluster', 'Cluster']]);
            }
            // whether the other apps have it, in the header (each text translated whole)
            const n = Object.keys(P.valuesOf(settings, state.car && state.car.kind(), state.car && state.car.sport())).length;
            const badge = state.error ? { text: 'Not written for the apps', color: 'crit' }
                : n ? { text: 'Set for the apps', color: t.sel || t.accent } : { text: 'Nothing set: each app as it is', color: t.dim };
            G.frame(cv, t, TABS, page, [badge]);
            return ui.image('MAIN_GFX', cv);
        }

        if (ctx.onTab) ctx.onTab((i) => { page = i === 1 ? 1 : 0; return render(); });
        settings.onChange(() => render());
        ctx.loop('MAIN', 2, render);
        render().then(() => ctx.log.info('first frame done')).catch((e) => ctx.log.warn('first render: ' + e));
    },
});
