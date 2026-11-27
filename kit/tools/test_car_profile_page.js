'use strict';

// Car profile's page with a stubbed head unit: every row is a place for the iDrive controller and a tap, and pressed
// it opens that setting's values (kit/sheet.js) on the one set; a value chosen or Back brings the page back.
//   node kit/tools/test_car_profile_page.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..'), KIT = path.join(ROOT, 'kit', 'runtime');
const MAIN = path.join(ROOT, 'apps', 'car_profile', 'main.js');
const P = require(path.join(ROOT, 'apps', 'car_profile', 'profile.js'));
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'car_profile', 'app.json'), 'utf8'));
process.env.MGU_CAR_PROFILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cp-page-')), 'car-profile.json');
const { Recorder } = require(path.join(KIT, 'record'));
const themes = require(path.join(KIT, 'themes'));
// the real Settings class without the SDK (as test_car_profile.js cuts it)
const src = fs.readFileSync(path.join(KIT, 'mgu.js'), 'utf8').replace(/\r\n/g, '\n');
const DD = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-page-data-'));
const Settings = new Function('fs', 'path', 'DATA_DIR', 'log', src.match(/class Settings[\s\S]*?\n}\n/)[0] + '\nreturn Settings;')(fs, path, DD, { info() {}, warn() {}, error() {} });

let app = null;
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === './kit/mgu') return { run(a) { app = a; } };
    if (req.startsWith('./kit/')) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.call(this, req, parent, isMain);
};

let n = 0;
const check = (name, fn) => fn().then(() => { n++; console.log('ok   ' + name); });

(async () => {
    require(MAIN);
    const settings = new Settings(SPEC.settings);
    let frame = null, last = null, sheet = null, opened = null, tab = null;
    const log = { info() {}, warn(m) { throw new Error('warned: ' + m); }, error(m) { throw new Error('error: ' + m); } };
    settings.onChange = settings.onChange || (() => {});
    const ctx = {
        spec: SPEC, settings, log,
        ui: { image: async () => {}, open: async (s) => { opened = s; } },
        theme: () => themes.theme('m_tricolour'), loop: (name, fps, fn) => { frame = fn; },
        canvas: (w, h) => {
            last = new Recorder(w, h);
            // (the texts drawn, for where they end)
            const text = last.text.bind(last); last.texts = [];
            last.text = (str, x, y, size, c, o) => { last.texts.push({ str: String(str), x, y, size, o }); return text(str, x, y, size, c, o); };
            return last;
        },
        sheet: (sh) => { sheet = sh; return true; },
        onTab: (fn) => { tab = fn; },
    };
    ctx.background = await app.background(ctx);
    await app.start(ctx);
    await frame();
    const targets = () => last.targets.filter((q) => /^row_/.test(q.key));

    await check('a place on one of the two tabs for every setting, none overlapping', async () => {
        const all = [];
        for (const i of [1, 0]) {
            await tab(i);
            const t = targets();
            t.forEach((a) => t.forEach((b) => {
                if (a === b) return;
                const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
                assert(apart, a.key + ' over ' + b.key);
            }));
            t.forEach((q) => assert(q.y >= 46 && q.y + q.h <= 520, q.key + ' on the page'));
            all.push(...t);
        }
        assert.deepStrictEqual(all.map((q) => q.key.slice(4)).sort(), SPEC.settings.filter((s) => !s.hidden).map((s) => s.key).sort());
    });
    await check('the apps that follow each setting: on its row, whole, inside it (11 px at least)', async () => {
        let seen = 0;
        for (const i of [0, 1]) {
            await tab(i); await frame();
            for (const q of targets()) {
                const who = (P.FOLLOW[q.key.slice(4)] || []).join(', ');
                if (!who) continue;
                const t = last.texts.filter((x) => x.str === who && x.x >= q.x && x.x < q.x + q.w && x.y > q.y && x.y < q.y + q.h + 4).pop();
                assert(t, q.key + ': its list drawn');
                assert(t.size >= 11, q.key + ' at ' + t.size + ' px');
                const right = t.x + last.textWidth(who, t.size, t.o), end = q.x + q.w - 12;
                assert(right <= end + 0.5, q.key + ': ends at ' + right.toFixed(1) + ', the row at ' + end);
                seen++;
            }
            last.texts.length = 0;
        }
        assert.strictEqual(seen, SPEC.settings.filter((s) => (P.FOLLOW[s.key] || []).length).length, 'every one looked at');
    });
    await check('Electric range when full: in km, in miles with mph, in both while the speed unit is each app\'s', async () => {
        const was = [settings.get('speedUnit'), settings.get('eFullKm')];
        settings.set('eFullKm', 50);
        settings.set('speedUnit', 'app');
        assert.strictEqual(settings.display('eFullKm'), '50 km / 31 mi');
        settings.set('speedUnit', 'kmh');
        assert.strictEqual(settings.display('eFullKm'), '50 km');
        settings.set('speedUnit', 'mph');
        assert.strictEqual(settings.display('eFullKm'), '31 mi');
        settings.set('eFullKm', -1);
        assert.strictEqual(settings.display('eFullKm'), 'Each app');
        settings.set('speedUnit', 'app');
        sheet = null;
        for (const i of [0, 1]) { await tab(i); await frame(); if (targets().some((q) => q.key === 'row_eFullKm')) break; }
        targets().find((q) => q.key === 'row_eFullKm').run();
        const rows = sheet.draw(new Recorder(1600, 520), themes.theme('m_tricolour'));
        assert(last && rows.length > 0);
        assert(sheet.rows().some((r) => r.label === '50 km / 31 mi'), 'its values\' list in both');
        sheet.back(); sheet = null;
        settings.set('speedUnit', was[0]); settings.set('eFullKm', was[1]);
    });
    await check('the colour theme only with the classic skin (or each app\'s)', async () => {
        await tab(1);
        assert(targets().some((q) => q.key === 'row_theme'));
        settings.set('skin', 'idrive7'); await frame();
        assert(!targets().some((q) => q.key === 'row_theme'), 'hidden with iDrive 7');
        settings.set('skin', 'app'); await tab(0);
    });
    await check('pressed: its values, on the one set; the knob and a press set the next and close', async () => {
        targets().find((q) => q.key === 'row_redline').run();
        assert(sheet && sheet.open && sheet.open.key === 'redline', 'the redline\'s values open');
        assert.strictEqual(sheet.sub, 1, 'on Auto (1.13.0: where it starts)');
        sheet.move(1); sheet.move(1);
        assert.strictEqual(await sheet.press(), 'close');
        assert.strictEqual(settings.get('redline'), 4500, '4000, then 4500');
        sheet.draw(new Recorder(1600, 520), themes.theme('m_tricolour'));
    });
    await check('Back: the page again, nothing changed', async () => {
        sheet = null;
        targets().find((q) => q.key === 'row_pressUnit').run();
        assert.strictEqual(sheet.open.key, 'pressUnit');
        sheet.move(-5);
        assert.strictEqual(await sheet.press(), 'close', 'Back (above the list) closes');
        assert.strictEqual(settings.get('pressUnit'), 'app');
        sheet = null;
        targets().find((q) => q.key === 'row_hotGearbox').run();
        assert.strictEqual(sheet.back(), 'close');
    });
    await check('a tap on a value: set, the page back', async () => {
        sheet = null;
        targets().find((q) => q.key === 'row_hotOil').run();
        const rows = sheet.draw(new Recorder(1600, 520), themes.theme('m_tricolour'));
        const row130 = rows.filter((q) => q.i !== undefined).find((q) => q.i === SPEC.settings.find((s) => s.key === 'hotOil').steps.indexOf(130));
        assert(row130, 'the 130 row on the sheet');
        assert.strictEqual(await row130.act(), 'close');
        assert.strictEqual(settings.get('hotOil'), 130);
        await frame();
    });
    await check('no sheet (another renderer): the HMI\'s settings', async () => {
        ctx.sheet = () => false;
        await targets().find((q) => q.key === 'row_engine').run();
        assert.strictEqual(opened, 'SETTINGS');
    });
    await check('Electric range when full saved in miles (before 1.9.0): in km once, Each app kept', async () => {
        const file = path.join(DD, 'settings.json');
        const start = async (saved) => {
            fs.writeFileSync(file, JSON.stringify(saved));
            const s = new Settings(SPEC.settings);
            await app.background(Object.assign({}, ctx, { settings: s }));
            return [s, JSON.parse(fs.readFileSync(file, 'utf8'))];
        };
        let [s, onDisk] = await start({ eFull: 31 });
        assert.strictEqual(s.get('eFullKm'), 50, '31 mi: 50 km');
        assert.strictEqual(onDisk.eFull, undefined, 'the miles gone from the file');
        assert.strictEqual(onDisk.eFullKm, 50);
        [s] = await start({ eFull: 37 });
        assert.strictEqual(s.get('eFullKm'), 60, '37 mi: 60 km (59.5, the nearest)');
        [s, onDisk] = await start({ eFull: -1 });
        assert.strictEqual(s.get('eFullKm'), -1, 'Each app stays');
        assert.strictEqual(onDisk.eFull, undefined);
        [s] = await start({ eFullKm: -1 });
        assert.strictEqual(s.get('eFullKm'), -1, 'set back to Each app later: left as it is');
    });
    await check('Engine on Auto (1.12.0) and the gauges (1.13.0): their default; Each app left as it came goes to Auto once, chosen later it stays', async () => {
        const file = path.join(DD, 'settings.json');
        const start = async (saved) => {
            fs.writeFileSync(file, JSON.stringify(saved));
            const s = new Settings(SPEC.settings);
            await app.background(Object.assign({}, ctx, { settings: s }));
            return s;
        };
        assert.strictEqual(SPEC.settings.find((x) => x.key === 'engine').default, 'auto');
        let s = await start({ engine: 'app' });
        assert.strictEqual(s.get('engine'), 'auto', 'Each app as it came: Auto');
        assert.strictEqual(s.get('engineAuto'), true);
        s = await start({ engine: 'app', engineAuto: true });
        assert.strictEqual(s.get('engine'), 'app', 'Each app chosen after: stays');
        s = await start({ engine: 'diesel' });
        assert.strictEqual(s.get('engine'), 'diesel', 'a type chosen: stays');
        // (1.13.0) the gauges left on Each app as they came: Auto, once; set otherwise, or Each app chosen after: kept
        s = await start({ engineAuto: true, rpmScale: -1, redline: 6500, speedMax: 'app' });
        assert.deepStrictEqual([s.get('rpmScale'), s.get('redline'), s.get('speedMax'), s.get('gaugesAuto')], [0, 6500, 'auto', true]);
        s = await start({ engineAuto: true, gaugesAuto: true, rpmScale: -1, speedMax: 'app' });
        assert.deepStrictEqual([s.get('rpmScale'), s.get('speedMax')], [-1, 'app']);
    });
    await check('Engine on Auto: the kind of car found, for the apps and on its row (a 530e\'s drive modes: a plug-in hybrid)', async () => {
        const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-car-'));
        const watched = {};
        const signals = { watch: (iface, inst, h) => { watched[iface] = Object.assign(watched[iface] || {}, h); return Promise.resolve({}); } };
        const s = new Settings(SPEC.settings);
        s.set('engine', 'auto');
        const c2 = Object.assign({}, ctx, { settings: s, signals, dataDir: dd });
        c2.background = await app.background(c2);
        const prof = () => JSON.parse(fs.readFileSync(process.env.MGU_CAR_PROFILE, 'utf8')).values.engine;
        assert.strictEqual(prof(), 'auto', 'nothing seen yet: Auto, each app reads the car');
        watched['de.bmw.infotainment.vehicle.Vehicle2'].statusVehiclePartType({ typeEngine: 'BENZIN_DIREKTEINSPRITZUNG' });
        assert.strictEqual(prof(), 'petrol');
        watched['de.bmw.infotainment.drivingexcitement.FES'].statusFESVehicleDynamicSwitchHMI({ actualValueModeDrivingExperience: 17 });
        assert.strictEqual(prof(), 'phev', 'HYBRID (17): a plug-in hybrid, over petrol');
        watched['de.bmw.infotainment.vehicle.Vehicle2'].statusVehiclePartType({ typeEngine: 'BENZIN_DIREKTEINSPRITZUNG' });
        assert.strictEqual(prof(), 'phev', 'and stays one');
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dd, 'car.json'), 'utf8')).phev, true, 'kept for the next start');
        await app.start(c2);
        assert.strictEqual(s.display('engine'), 'Auto (from the car)  \u00b7  Plug-in hybrid (petrol)', 'its row says what was found');
        // the gauges on Auto, as the G20's own cluster: a plug-in hybrid's petrol engine (a 330i's) 7000, red from 6000, 260
        const all = () => JSON.parse(fs.readFileSync(process.env.MGU_CAR_PROFILE, 'utf8')).values;
        s.set('rpmScale', 0); s.set('redline', 0); s.set('speedMax', 'auto');
        assert.deepStrictEqual([all().rpmScale, all().redline, all().speedMax], [7000, 6000, '260']);
        assert.strictEqual(s.display('speedMax'), 'Auto (from the car)  \u00b7  260 km/h (160 mph)');
        assert.ok(/^Auto  \u00b7  7000 rpm/.test(s.display('rpmScale')), s.display('rpmScale'));
        s.set('engine', 'diesel');
        assert.strictEqual(prof(), 'diesel', 'a type chosen: that one');
        assert.deepStrictEqual([all().rpmScale, all().redline, all().speedMax], [6000, 5000, '260'], 'a 320d\'s: 6000, red from 5000');
        s.set('engine', 'm');
        assert.deepStrictEqual([all().rpmScale, all().redline, all().speedMax], [8000, 7200, '330'], 'an M3\'s: 8000, red from 7200, 330');
        s.set('redline', 6500); s.set('speedMax', '260');
        assert.deepStrictEqual([all().rpmScale, all().redline, all().speedMax], [8000, 6500, '260'], 'set by hand: that one');
        s.set('engine', 'app'); s.set('speedMax', 'auto');
        assert.deepStrictEqual([all().rpmScale, all().speedMax], [0, undefined], 'no kind of car: Auto as each app has it, the speedometer each app\'s');
        // an M car by its M engine modes; a diesel by its engine type; a petrol car's modes (1 - 14) are no plug-in hybrid's
        const Detect = require(path.join(ROOT, 'apps', 'car_profile', 'detect.js'));
        assert.strictEqual(Detect.kindOf({ m: true, fuel: 'petrol' }), 'm');
        assert.strictEqual(Detect.kindOf({ fuel: 'diesel' }), 'diesel');
        assert.ok(Detect.mMode({ controlDisplayEngineMode: 2 }) && !Detect.mMode({ controlDisplayEngineMode: 0 }));
        assert.ok(!Detect.phevMode(5) && !Detect.phevMode('SPORT_PLUS') && Detect.phevMode('PHEV_SPORT') && Detect.phevMode(20));
    });
    console.log(n + ' passed');
})().catch((e) => { console.error('FAIL ' + (e && e.stack || e)); process.exit(1); });
