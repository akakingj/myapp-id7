'use strict';
/**
 * test_car_profile.js - the Car profile (apps/car_profile) and the kit's settings that follow it (mgu.js Settings,
 * app.json "profile"), on the PC.
 *
 *   node kit/tools/test_car_profile.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carprofile-'));
const FILE = path.join(dir, 'car-profile.json');
process.env.MGU_CAR_PROFILE = FILE;
const P = require(path.join(ROOT, 'apps', 'car_profile', 'profile'));

// the real Settings class without the SDK (as hu-stub.js and test_runtime.js cut it)
const src = fs.readFileSync(path.join(ROOT, 'kit', 'runtime', 'mgu.js'), 'utf8').replace(/\r\n/g, '\n');
const cls = src.match(/class Settings[\s\S]*?\n}\n/)[0];
const quiet = { info() {}, warn() {}, error() {} };
let n = 0;
const settingsIn = (schema, saved) => {
    const dd = path.join(dir, 'app' + (n++));
    fs.mkdirSync(dd);
    if (saved) fs.writeFileSync(path.join(dd, 'settings.json'), JSON.stringify(saved));
    const S = new Function('fs', 'path', 'DATA_DIR', 'log', cls + '\nreturn Settings;')(fs, path, dd, quiet);
    return new S(schema);
};
const fakeProfile = (vals) => {
    const s = { v: vals, get(k) { return this.v[k]; } };
    return s;
};
// the file's mtime moves on with each write (the poll looks at it), even within one millisecond
let tick = Date.now() / 1000 - 1000;
const writeProfile = (values) => { P.publish(fakeProfile(values), 'test'); tick += 5; fs.utimesSync(FILE, tick, tick); };
const clear = () => { try { fs.unlinkSync(FILE); } catch (e) { /* none */ } };

const SCHEMA = [
    { key: 'speedUnit', label: 'Speed unit', type: 'choice', default: 'kmh', options: [['kmh', 'km/h'], ['mph', 'mph']], profile: 'speedUnit' },
    { key: 'distUnit', label: 'Distance unit', type: 'choice', default: 'm', options: [['m', 'metres'], ['ft', 'feet']], profile: 'speedUnit', profileMap: { kmh: 'm', mph: 'ft' } },
    { key: 'redline', label: 'Redline', type: 'number', unit: 'rpm', default: 0, labels: { 0: 'Auto' }, steps: [0, 6000, 7000], profile: 'redline' },
    { key: 'torqueUnit', label: 'Torque unit', type: 'choice', default: 'nm', options: [['nm', 'Nm'], ['kgm', 'kgm']], profile: 'torqueUnit' },
    { key: 'maxKgm', label: 'Torque gauge max', type: 'number', default: 100, steps: [40, 100], when: { torqueUnit: 'kgm' } },
    { key: 'theme', label: 'Theme', type: 'choice', default: 'm_tricolour', options: [['m_tricolour', 'M']] },
];

const cases = {
    'publish: only what is set, readable by every app, the same file not rewritten'() {
        clear();
        const vals = P.publish(fakeProfile({ engine: 'app', redline: 6000, rpmScale: -1, speedUnit: 'mph', torqueUnit: 'kgm' }), '1.0.0');
        assert.deepStrictEqual(vals, { redline: 6000, speedUnit: 'mph', torqueUnit: 'kgm' });
        const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        assert.deepStrictEqual(doc, { v: 1, app: 'car_profile', version: '1.0.0', values: vals });
        assert.strictEqual(fs.statSync(FILE).mode & 0o777, 0o644);
        fs.utimesSync(FILE, 1000, 1000);
        P.publish(fakeProfile({ redline: 6000, speedUnit: 'mph', torqueUnit: 'kgm' }), '1.0.0');
        assert.strictEqual(fs.statSync(FILE).mtime.getTime(), 1000 * 1000, 'unchanged: not written again');
        assert(!fs.readdirSync(dir).some((f) => /\.tmp$/.test(f)), 'no temp file left');
    },
    'no profile: each app its own values'() {
        clear();
        const s = settingsIn(SCHEMA, { speedUnit: 'mph', redline: 7000 });
        assert.strictEqual(s.get('speedUnit'), 'mph');
        assert.strictEqual(s.get('redline'), 7000);
        assert.strictEqual(s.held('speedUnit'), false);
    },
    'a profile: its values over the app\'s, kept for what it leaves out'() {
        clear();
        writeProfile({ speedUnit: 'mph', redline: 6000, torqueUnit: 'kgm' });
        const s = settingsIn(SCHEMA, { speedUnit: 'kmh', redline: 7000, theme: 'm_tricolour' });
        assert.strictEqual(s.get('speedUnit'), 'mph');
        assert.strictEqual(s.get('redline'), 6000);
        assert.strictEqual(s.get('distUnit'), 'ft', 'profileMap: the speed unit\'s mph -> feet (a distance unit by the speed unit)');
        assert.strictEqual(s.get('theme'), 'm_tricolour', 'a setting without "profile"');
        assert.strictEqual(s.values.speedUnit, 'kmh', 'the app\'s own value kept');
        assert.strictEqual(s.display('redline'), '6000 rpm');
        assert.strictEqual(s.display('speedUnit'), 'mph');
        assert.strictEqual(s.shown(SCHEMA[4]), true, '"when" goes by the profile\'s value (kgm)');
        assert.strictEqual(s.held('redline'), true);
    },
    'a value the setting can\'t take is left to the app'() {
        clear();
        writeProfile({ speedUnit: 'knots', redline: 'high', torqueUnit: 'lbft' });
        const s = settingsIn(SCHEMA, { speedUnit: 'mph', redline: 7000 });
        assert.strictEqual(s.get('speedUnit'), 'mph');
        assert.strictEqual(s.get('redline'), 7000);
        assert.strictEqual(s.get('torqueUnit'), 'nm', 'lb-ft is not among this app\'s options');
        assert.strictEqual(s.held('torqueUnit'), false);
    },
    'Auto (0) passes through as Auto'() {
        clear();
        writeProfile({ redline: 0 });
        const s = settingsIn(SCHEMA, { redline: 7000 });
        assert.strictEqual(s.get('redline'), 0);
        assert.strictEqual(s.display('redline'), 'Auto');
    },
    'Auto (0) to a setting without 0 among its values: left to the app'() {
        clear();
        writeProfile({ redline: 0 });
        const s = settingsIn([{ key: 'redline', label: 'Redline', type: 'number', unit: 'rpm', default: 7000, steps: [6000, 7000], profile: 'redline' }], { redline: 6000 });
        assert.strictEqual(s.get('redline'), 6000);
        assert.strictEqual(s.held('redline'), false);
    },
    'held: not changed in the app'() {
        clear();
        writeProfile({ redline: 6000 });
        const s = settingsIn(SCHEMA, { redline: 7000 });
        s.cycle('redline');
        assert.strictEqual(s.values.redline, 7000, 'cycle does nothing while the profile sets it');
        s.cycle('speedUnit');
        assert.strictEqual(s.get('speedUnit'), 'mph', 'a setting the profile leaves out still changes');
    },
    'a change of the profile reaches the listeners; gone, the app\'s own values come back'() {
        clear();
        const s = settingsIn(SCHEMA, { redline: 7000, speedUnit: 'kmh' });
        const seen = [];
        s.onChange((k, v) => seen.push([k, v]));
        writeProfile({ redline: 6000 });
        s._pollProfile();
        assert.deepStrictEqual(seen, [['redline', 6000]]);
        s._pollProfile();
        assert.strictEqual(seen.length, 1, 'no change: no call');
        writeProfile({ redline: 6000, speedUnit: 'mph' });
        s._pollProfile();
        assert.deepStrictEqual(seen.slice(1), [['speedUnit', 'mph'], ['distUnit', 'ft']], 'the distance unit with the speed unit');
        clear();
        s._pollProfile();
        assert.deepStrictEqual(seen.slice(3), [['speedUnit', 'kmh'], ['distUnit', 'm'], ['redline', 7000]].sort((a, b) => (SCHEMA.findIndex((x) => x.key === a[0]) - SCHEMA.findIndex((x) => x.key === b[0]))));
        assert.strictEqual(s.get('redline'), 7000);
    },
    'a broken file is not taken (and looked at again)'() {
        clear();
        fs.writeFileSync(FILE, '{"v": 1, "values": {"redline": 60');
        const s = settingsIn(SCHEMA, { redline: 7000 });
        assert.strictEqual(s.get('redline'), 7000);
        writeProfile({ redline: 6000 });
        s._pollProfile();
        assert.strictEqual(s.get('redline'), 6000);
        fs.writeFileSync(FILE, JSON.stringify({ v: 2, values: { redline: 5000 } }));
        tick += 5; fs.utimesSync(FILE, tick, tick);
        s._pollProfile();
        assert.strictEqual(s.get('redline'), 7000, 'another format version: not followed');
    },
    'the shift point (0: Auto, a value; -1 each app) and the cold guard (on / off to a switch)'() {
        clear();
        const schema = [
            { key: 'shiftAt', label: 'Shift point', type: 'number', unit: 'rpm', default: 6500, labels: { 0: 'Auto (redline - 300)' }, steps: [0, 6000, 6500], profile: 'shiftAt' },
            { key: 'coldGuard', label: 'Cold-engine rev guard', type: 'bool', default: true, profile: 'coldGuard', profileMap: { on: true, off: false } },
        ];
        const vals = P.publish(fakeProfile({ shiftAt: 0, coldGuard: 'off' }), '1.1.0');
        assert.deepStrictEqual(vals, { shiftAt: 0, coldGuard: 'off' }, '0 (Auto) is set (Each app is -1)');
        tick += 5; fs.utimesSync(FILE, tick, tick);
        const s = settingsIn(schema, { shiftAt: 6500, coldGuard: true });
        assert.strictEqual(s.get('shiftAt'), 0);
        assert.strictEqual(s.get('coldGuard'), false);
        assert.strictEqual(s.display('coldGuard'), 'Off');
        writeProfile({ coldGuard: 'on' });
        s._pollProfile();
        assert.strictEqual(s.get('coldGuard'), true);
        assert.strictEqual(s.get('shiftAt'), 6500, 'left to the app again');
    },
    'the G-force: no direction setting anywhere (every app as the driver feels it), the circle\'s size still shared'() {
        clear();
        const read = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', id, 'app.json'), 'utf8')).settings;
        const pick = (id, k) => read(id).find((x) => x.key === k);
        assert(P.KEYS.indexOf('gLat') < 0 && P.KEYS.indexOf('gLong') < 0, 'no G direction in the profile');
        ['gforce', 'car_vitals', 'ak_water_cup'].forEach((id) => ['flipLat', 'flipLong'].forEach((k) => assert(!pick(id, k), id + ' ' + k)));
        fs.readdirSync(path.join(ROOT, 'apps')).forEach((id) => {
            let st = [];
            try { st = read(id) || []; } catch (e) { return; }
            st.forEach((x) => assert(x.profile !== 'gLat' && x.profile !== 'gLong', id + ' ' + x.key + ': ' + x.profile));
        });
        ['gforce', 'car_vitals'].forEach((id) => assert.strictEqual(pick(id, id === 'gforce' ? 'scale' : 'gScale').profile, 'gMax'));
        const schema = [pick('gforce', 'scale')];
        P.publish(fakeProfile({ gMax: 2 }), '1.1.0');
        tick += 5; fs.utimesSync(FILE, tick, tick);
        const s = settingsIn(schema, { scale: 1.5 });
        assert.strictEqual(s.get('scale'), 2);
    },
    'the boost gauge\'s top: the car\'s own gauges by their end in psi, each with its bar; M Vitals\' choice takes 30 as its "30"'() {
        clear();
        const read = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', id, 'app.json'), 'utf8')).settings;
        const cp = read('car_profile');
        const own = settingsIn(cp, { boostMax: 30, pressUnit: 'bar' });
        assert.strictEqual(own.display('boostMax'), '30 psi / 2.0 bar', 'the same in every pressure unit');
        own.set('boostMax', 45); assert.strictEqual(own.display('boostMax'), '45 psi / 3.0 bar');
        assert.deepStrictEqual(cp.find((x) => x.key === 'boostMax').steps, [0, 15, 20, 30, 45]);
        const vit = read('car_vitals').filter((x) => x.key === 'boostMax');
        P.publish(fakeProfile({ boostMax: 30 }), '1.7.5');
        tick += 5; fs.utimesSync(FILE, tick, tick);
        assert.strictEqual(settingsIn(vit, { boostMax: 'car' }).get('boostMax'), '30');
        P.publish(fakeProfile({ boostMax: 15 }), '1.7.5');
        tick += 5; fs.utimesSync(FILE, tick, tick);
        assert.strictEqual(settingsIn(vit, { boostMax: 'car' }).get('boostMax'), '15');
        // Auto: the car's own sport display's end (M Vitals' "car"); the apps' own setting is the Car profile's alone
        own.set('boostMax', 0); assert.strictEqual(own.display('boostMax'), 'Auto (the car\'s Sport Display)');
        P.publish(fakeProfile({ boostMax: 0 }), '1.7.5');
        tick += 5; fs.utimesSync(FILE, tick, tick);
        assert.strictEqual(settingsIn(vit, { boostMax: '20' }).get('boostMax'), 'car');
        assert.deepStrictEqual([vit[0].default, vit[0].hidden], ['car', true]);
    },
    'every app.json "profile" is one the Car profile sets, with values it can give'() {
        const cp = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'car_profile', 'app.json'), 'utf8'));
        const byKey = {};
        cp.settings.forEach((s) => { byKey[s.key] = s; });
        assert.deepStrictEqual(Object.keys(byKey).filter((k) => P.KEYS.indexOf(k) >= 0), P.KEYS, 'profile.js KEYS = the app\'s settings, in order');
        assert(cp.settings.every((s) => !s.profile), 'the Car profile follows no profile itself');
        // (Boost gauge up to is set here alone and starts at Auto, what the apps show without the profile; the engine
        // starts at Auto (from the car), 1.12.0: the kind of car found goes to every app; engineAuto: that change, once)
        // (1.13.0: the rev gauges' end, the redline and the speedometer on Auto too: the car's own cluster's for its kind)
        const AUTO = { engine: 'auto', speedMax: 'auto', rpmScale: 0, redline: 0, boostMax: 0, powerMax: 0, torqueMax: 0 };
        assert(cp.settings.filter((s) => !s.hidden).every((s) => s.default === (AUTO[s.key] !== undefined ? AUTO[s.key] : s.type === 'choice' ? 'app' : -1)), 'everything starts at Each app, the engine and the gauges at Auto');
        assert(byKey.engineAuto.hidden === true && byKey.gaugesAuto.hidden === true, 'engineAuto, gaugesAuto are not shown');
        assert.deepStrictEqual(byKey.boostMax.steps, [0, 15, 20, 30, 45], 'Boost gauge up to: Auto, or one of the car\'s own gauges');
        let followers = 0;
        fs.readdirSync(path.join(ROOT, 'apps')).forEach((app) => {
            const f = path.join(ROOT, 'apps', app, 'app.json');
            if (!fs.existsSync(f) || app === 'car_profile') return;
            (JSON.parse(fs.readFileSync(f, 'utf8')).settings || []).filter((s) => s.profile).forEach((s) => {
                followers++;
                const p = byKey[s.profile];
                assert(p, app + '.' + s.key + ': no Car profile setting "' + s.profile + '"');
                if (s.type === 'choice') {
                    const own = s.options.map((o) => o[0]);
                    // (a number of the profile's to a choice's value: its figure as text, as mgu.js fromProfile)
                    const all = p.options ? p.options.map((o) => o[0]).filter((v) => v !== 'app') : (p.steps || []).filter((v) => v !== -1);
                    const given = all.map((v) => (s.profileMap && s.profileMap[v] !== undefined ? s.profileMap[v] : String(v)));
                    const lost = given.filter((v) => own.indexOf(v) < 0);
                    // a value the app can't show is left to the app (fromProfile), but every one should land
                    assert.deepStrictEqual(lost, [], app + '.' + s.key + ': the profile can give ' + lost.join(', ') + ', the app has no such option');
                } else if (s.type === 'bool') {
                    // a choice of the profile's ('on' / 'off') to an app's switch: each one mapped to true or false
                    const given = p.options.map((o) => o[0]).filter((v) => v !== 'app');
                    given.forEach((v) => assert(s.profileMap && typeof s.profileMap[v] === 'boolean', app + '.' + s.key + ': the profile\'s ' + v + ' to no true / false'));
                } else {
                    assert.strictEqual(s.type, 'number', app + '.' + s.key);
                    // every number the profile can give is one of the setting's own (its drop-down shows it, the HMI's
                    // list too): 0 only where it is one of them or Auto
                    // (a profileMap: the profile's number to the app's own, eDrive's km for the profile's miles)
                    const own = (v) => (s.profileMap && s.profileMap[v] !== undefined ? s.profileMap[v] : v);
                    const lost = (p.steps || []).filter((v) => v > 0 || (v === 0 && ((s.labels && s.labels['0'] !== undefined) || (s.steps || []).indexOf(0) >= 0)))
                        .filter((v) => (s.steps || []).indexOf(own(v)) < 0);
                    assert.deepStrictEqual(lost, [], app + '.' + s.key + ': the profile can give ' + lost.join(', ') + ', not in its list');
                }
            });
        });
        assert(followers >= 30, 'the apps follow it: ' + followers);
    },
};

let failed = 0;
for (const name of Object.keys(cases)) {
    try { cases[name](); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}
fs.rmSync ? fs.rmSync(dir, { recursive: true, force: true }) : null;
console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
