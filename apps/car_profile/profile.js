'use strict';
/**
 * profile.js - the Car profile as the other apps read it: /dev/shm/car-profile.json
 *
 *   { "v": 1, "app": "car_profile", "version": "1.0.0", "values": { "redline": 6000, "speedUnit": "kmh", ... } }
 *
 * Only what is set is in it: a value left to each app ("app", -1) is not. The kit's settings (mgu.js Settings)
 * follow it for a setting with "profile": name in an app's app.json, over the app's own value, which they keep for
 * whatever the profile leaves out. Written whole (a temp file renamed over it) and readable by every app (0644): the
 * apps run as users of their own and can't read each other's data folders. /dev/shm is emptied at each start of the
 * head unit, so the app (app.json "autostart") writes it again from its own settings at each start.
 */
const fs = require('fs');

// what the profile sets, in Settings order; FOLLOW: the apps that follow each (their app.json "profile")
const KEYS = ['engine', 'lightStart', 'lightRed', 'shiftAt', 'rpmScale', 'redline', 'coldLimit', 'coldGuard', 'warmOil',
    'warmCoolant', 'warmGearbox', 'hotOil', 'hotCoolant', 'hotGearbox', 'speedUnit', 'tempUnit', 'pressUnit', 'fuelUnit', 'torqueUnit', 'powerUnit',
    'skin', 'theme', 'layout', 'renderer', 'demo', 'clusterStart', 'clock', 'tankLitres', 'fuelFrom', 'eFullKm', 'gMax', 'speedMax', 'boostMax',
    'powerMax', 'torqueMax'];
const FOLLOW = {
    // (the AK clusters' Car > Engine, Layouts, Centre and ID8 alike, has the same five; the other apps take a plug-in hybrid
    // as their own setting says: Auto, petrol)
    engine: ['M Vitals', 'Redline', 'Warm-Up', 'Virtual Dyno', 'AK Cluster Layouts, Centre and ID8'],
    // the shift lights: yellow from, red from (0: Auto, the redline), the warning at the shift point (0: Auto, each
    // app's redline less 300; 0.3.x: was "so many before the redline"), the rev scale's end; the redline (the limiter)
    lightStart: ['Redline', 'AK Cluster Layouts, Centre and ID8'],
    lightRed: ['Redline', 'AK Cluster Layouts and ID8'],
    shiftAt: ['Redline', 'Warm-Up', 'AK Cluster Layouts, Centre and ID8'],
    rpmScale: ['M Vitals', 'Redline', 'Virtual Dyno', 'AK Cluster Layouts and ID8'],
    redline: ['M Vitals', 'Redline', 'Warm-Up', 'AK Cluster Layouts, Centre and ID8'],
    coldLimit: ['Redline', 'Warm-Up', 'AK Cluster Layouts, Centre and ID8'],
    coldGuard: ['Redline', 'Warm-Up', 'AK Cluster Layouts, Centre and ID8'],
    warmOil: ['Redline', 'Warm-Up', 'every AK Cluster app'],
    warmCoolant: ['Warm-Up'],
    warmGearbox: ['Warm-Up'],
    // too hot (red) from: each one at that temperature and above
    hotOil: ['M Vitals', 'Redline', 'Warm-Up', 'every AK Cluster app'],
    hotCoolant: ['M Vitals', 'Redline', 'Warm-Up', 'every AK Cluster app'],
    hotGearbox: ['M Vitals', 'Redline', 'Warm-Up', 'every AK Cluster app'],
    speedUnit: ['M Vitals', 'Redline', 'Drag Timer', 'Brake Test', 'G-Force', 'eDrive', 'Live Data', 'AK Cluster Layouts, Centre and ID8'],
    tempUnit: ['M Vitals', 'Redline HUD', 'Warm-Up', 'eDrive', 'Transmission Config', 'Live Data', 'every AK Cluster app'],
    pressUnit: ['M Vitals', 'Redline HUD', 'Live Data', 'every AK Cluster app'],
    fuelUnit: ['Redline HUD', 'AK Cluster Layouts and ID8'],
    torqueUnit: ['M Vitals', 'Redline HUD', 'Virtual Dyno', 'every AK Cluster app'],
    powerUnit: ['M Vitals', 'Redline HUD', 'Virtual Dyno', 'AK Cluster Layouts, Centre and ID8'],
    // the look of every app with a Skin setting (kit/runtime/themes.js SKINS): these apps and the AK Cluster apps
    skin: ['All apps, every AK Cluster app too'],
    // the screens: colours (with the classic skin), full screen or standard, the renderer, demo data
    theme: ['All apps with a colour theme, AK Cluster Info too'],
    layout: ['All apps with a screen layout, AK Cluster Info too'],
    renderer: ['All apps with a renderer setting, AK Cluster Info too'],
    demo: ['All apps with demo data, AK Cluster Layouts, Centre and Info too'],
    // which AK cluster comes up at every start (its Show on the cluster on, ahead of the other)
    clusterStart: ['AK Cluster Layouts and ID8'],
    // the AK clusters' clock, and their fuel and battery figures
    clock: ['AK Cluster Layouts, Centre and ID8'],
    tankLitres: ['Water Cup', 'AK Cluster Layouts, Centre and ID8'],
    // the fuel gauge's figure: the engine unit's tank level, or the litres over the tank's size
    fuelFrom: ['AK Cluster Layouts and ID8'],
    eFullKm: ['eDrive', 'AK Cluster Layouts, Centre and ID8'],
    // the G-force circles' size (g), where the dot goes in a bend (out: as the driver feels it), braking up or down
    gMax: ['G-Force', 'M Vitals', 'AK Cluster Layouts and ID8'],
    // where the speedometers end (km/h), and the boost gauges (bar, each app showing it in its pressure unit)
    speedMax: ['AK Cluster Layouts and ID8'],
    boostMax: ['M Vitals', 'AK Cluster Layouts, Centre and ID8'],
    // the engine's most power and torque, where the power and torque gauges end (Auto: the car's Sport Display's)
    powerMax: ['M Vitals', 'AK Cluster Layouts and ID8'],
    torqueMax: ['AK Cluster Layouts and ID8'],
};
// (AK Cluster Layouts, Centre and Info: the cluster apps of akakingj/idrive7-cluster-info, each named where it follows
// one, as their app.json "profile" says; AK Cluster ID8: akakingj/myapp-cluster-high's, the same way; every AK Cluster
// app: the four)

const file = () => process.env.MGU_CAR_PROFILE || '/dev/shm/car-profile.json';
const isSet = (v) => v !== undefined && v !== null && v !== 'app' && v !== -1;

/**
 * The values the profile sets now: { key: value } for each one not left to each app. The engine on Auto: the kind of
 * car found (detect.js: 'phev', 'm', 'diesel' or 'petrol'), so every app follows the same; 'auto' (each app reads
 * the car itself) until one is found.
 */
function valuesOf(settings, carKind, sport) {
    const o = {};
    KEYS.forEach((k) => { const v = settings.get(k); if (isSet(v)) o[k] = v; });
    if (o.engine === 'auto' && carKind) o.engine = carKind;
    // the gauges on Auto: as the car's own cluster has them, for the kind of car (G20)
    const g = gaugesOf(kindOf(settings, carKind));
    if (o.rpmScale === 0 && g) o.rpmScale = g.rpmScale;
    if (o.redline === 0 && g) o.redline = g.redline;
    if (o.speedMax === 'auto') { if (g) o.speedMax = g.speedMax; else delete o.speedMax; }
    // the power and torque gauges on Auto: the car's Sport Display's most (detect.js), none (each app's) till it has sent it
    if (o.powerMax === 0) { if (sport && sport.kw) o.powerMax = sport.kw; else delete o.powerMax; }
    if (o.torqueMax === 0) { if (sport && sport.nm) o.torqueMax = sport.nm; else delete o.torqueMax; }
    return o;
}

/*
 * The rev and speed gauges as BMW's own cluster has them (iDrive 7, G20 3 Series; the owner's photos of Nov 27 2026):
 * a 320d's ends at 6 with red from 5, a 320i's and 330i's at 7 with red from 6 (an M340i's from about 6.5, the same
 * kind of car here), an M3's at 8 with red from 7.2 (yellow from 6.5) and its speedometer at 330; the others' at 260.
 * A plug-in hybrid (330e) shows Power % on Electric and Hybrid, its petrol engine's revs (a 330i's) on Sport.
 * redline: where the red begins, as the apps take it (the lights' red, the shift point 300 under it).
 */
const G20 = {
    diesel: { rpmScale: 6000, redline: 5000, speedMax: '260' },
    petrol: { rpmScale: 7000, redline: 6000, speedMax: '260' },
    phev: { rpmScale: 7000, redline: 6000, speedMax: '260' },
    m: { rpmScale: 8000, redline: 7200, speedMax: '330' },
};
/** The kind of car the gauges go by: the engine set here, or on Auto the one found (detect.js); null: not known. */
function kindOf(settings, carKind) {
    const e = settings.get('engine');
    return G20[e] ? e : e === 'auto' && G20[carKind] ? carKind : null;
}
const gaugesOf = (kind) => G20[kind] || null;

/** Write the profile from settings when it differs from the file (or there is none). Returns the values. */
function publish(settings, version, log, carKind, sport) {
    const f = file(), values = valuesOf(settings, carKind, sport);
    const text = JSON.stringify({ v: 1, app: 'car_profile', version: version || '', values }, null, 1);
    try { if (fs.readFileSync(f, 'utf8') === text) return values; } catch (e) { /* none yet */ }
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, text, { mode: 0o644 });
    try { fs.chmodSync(tmp, 0o644); } catch (e) { /* the mode given above */ }
    fs.renameSync(tmp, f);
    if (log) log.info('car profile written: ' + JSON.stringify(values));
    return values;
}

module.exports = { KEYS, FOLLOW, file, isSet, valuesOf, publish, G20, kindOf, gaugesOf };
