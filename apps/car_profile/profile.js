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
const KEYS = ['engine', 'lightStart', 'lightRed', 'shiftAt', 'rpmScale', 'redline', 'coldLimit', 'lightMode', 'coldGuard', 'warmOil',
    'warmCoolant', 'warmGearbox', 'hotOil', 'hotCoolant', 'hotGearbox', 'speedUnit', 'distUnit', 'tempUnit', 'pressUnit', 'fuelUnit', 'torqueUnit', 'powerUnit',
    'skin', 'theme', 'layout', 'renderer', 'demo', 'clock', 'timeZone', 'tankLitres', 'fuelFrom', 'eFull', 'gMax', 'speedMax', 'boostMax'];
const FOLLOW = {
    // (Plug-in hybrid: the AK clusters' Vehicle; the other apps take a plug-in hybrid as their own setting says: Auto, petrol)
    engine: ['M Vitals', 'Redline', 'Warm-Up', 'Virtual Dyno', 'AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
    // the shift lights: yellow from, red from (0: Auto, the redline), the warning at the shift point (0: Auto, each
    // app's redline less 300; 0.3.x: was "so many before the redline"), the rev scale's end; the redline (the limiter)
    lightStart: ['Redline', 'AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
    lightRed: ['Redline', 'AK Cluster', 'AK Cluster ID8'],
    shiftAt: ['Redline', 'Warm-Up', 'AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
    rpmScale: ['M Vitals', 'Redline', 'Virtual Dyno', 'AK Cluster', 'AK Cluster ID8'],
    redline: ['M Vitals', 'Redline', 'Warm-Up', 'AK Cluster', 'AK Cluster ID8'],
    coldLimit: ['Redline', 'Warm-Up', 'AK Cluster', 'AK Cluster ID8'],
    lightMode: ['Redline'],
    coldGuard: ['Redline', 'Warm-Up', 'AK Cluster', 'AK Cluster ID8'],
    warmOil: ['Redline', 'Warm-Up', 'AK Cluster', 'AK Cluster ID8'],
    warmCoolant: ['Warm-Up'],
    warmGearbox: ['Warm-Up'],
    // too hot (red) from: each one at that temperature and above
    hotOil: ['M Vitals', 'Redline', 'Warm-Up', 'AK Cluster'],
    hotCoolant: ['M Vitals', 'Redline', 'Warm-Up', 'AK Cluster'],
    hotGearbox: ['M Vitals', 'Redline', 'Warm-Up', 'AK Cluster'],
    speedUnit: ['M Vitals', 'Redline', 'Drag Timer', 'Brake Test', 'G-Force', 'AK Cluster', 'AK Cluster ID8'],
    distUnit: ['Brake Test', 'eDrive'],
    tempUnit: ['M Vitals', 'Redline HUD', 'Warm-Up', 'eDrive', 'Transmission Config', 'Live Data', 'AK Cluster', 'AK Cluster ID8'],
    pressUnit: ['M Vitals', 'Redline HUD', 'Live Data', 'AK Cluster', 'AK Cluster ID8'],
    fuelUnit: ['Redline HUD', 'AK Cluster', 'AK Cluster ID8'],
    torqueUnit: ['M Vitals', 'Redline HUD', 'Virtual Dyno', 'AK Cluster'],
    powerUnit: ['M Vitals', 'Redline HUD', 'Virtual Dyno', 'AK Cluster'],
    // the look of every app with a Skin setting (kit/runtime/themes.js SKINS): these apps and the AK Cluster apps
    skin: ['All apps, AK Cluster too'],
    // the screens: colours (with the classic skin), full screen or standard, the renderer, demo data
    theme: ['All apps with a colour theme, AK Cluster Info too'],
    layout: ['All apps with a screen layout, AK Cluster Info too'],
    renderer: ['All apps with a renderer setting, AK Cluster Info too'],
    demo: ['All apps with demo data, AK Cluster too'],
    // the AK clusters' clock, and their fuel and battery figures
    clock: ['AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
    timeZone: ['AK Cluster', 'AK Cluster Centre'],
    tankLitres: ['Water Cup', 'AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
    // the fuel gauge's figure: the engine unit's tank level, or the litres over the tank's size
    fuelFrom: ['AK Cluster', 'AK Cluster ID8'],
    eFull: ['AK Cluster', 'AK Cluster Centre'],
    // the G-force circles' size (g), where the dot goes in a bend (out: as the driver feels it), braking up or down
    gMax: ['G-Force', 'M Vitals', 'AK Cluster'],
    // where the speedometers end (km/h), and the boost gauges (bar, each app showing it in its pressure unit)
    speedMax: ['AK Cluster', 'AK Cluster ID8'],
    boostMax: ['M Vitals', 'AK Cluster', 'AK Cluster Centre', 'AK Cluster ID8'],
};
// ('AK Cluster': the cluster apps of akakingj/idrive7-cluster-info, Layouts / Centre / Info, which read this file too;
// 'AK Cluster ID8': akakingj/myapp-cluster-high's, the same way)

const file = () => process.env.MGU_CAR_PROFILE || '/dev/shm/car-profile.json';
const isSet = (v) => v !== undefined && v !== null && v !== 'app' && v !== -1;

/** The values the profile sets now: { key: value } for each one not left to each app. */
function valuesOf(settings) {
    const o = {};
    KEYS.forEach((k) => { const v = settings.get(k); if (isSet(v)) o[k] = v; });
    return o;
}

/** Write the profile from settings when it differs from the file (or there is none). Returns the values. */
function publish(settings, version, log) {
    const f = file(), values = valuesOf(settings);
    const text = JSON.stringify({ v: 1, app: 'car_profile', version: version || '', values }, null, 1);
    try { if (fs.readFileSync(f, 'utf8') === text) return values; } catch (e) { /* none yet */ }
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, text, { mode: 0o644 });
    try { fs.chmodSync(tmp, 0o644); } catch (e) { /* the mode given above */ }
    fs.renameSync(tmp, f);
    if (log) log.info('car profile written: ' + JSON.stringify(values));
    return values;
}

module.exports = { KEYS, FOLLOW, file, isSet, valuesOf, publish };
