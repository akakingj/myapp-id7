'use strict';
/**
 * detect.js - which car this is, for Engine: Auto (from the car): a plug-in hybrid, an M car, a diesel or a petrol car.
 *
 *   const d = detect.create({ dataDir, log, onChange });
 *   d.handlers()   -> [[iface, { field: fn }], ...] to watch (app.json "signals" has them)
 *   d.kind()       -> 'phev' | 'm' | 'diesel' | 'petrol' | null (nothing seen yet)
 *
 * What it goes by, as the apps that read these already do:
 *   - a plug-in hybrid: its own drive modes (FES actualValueModeDrivingExperience 15 - 22, PHEV_SPORT to
 *     BATTERY_CONTROL, or a name with PHEV / XTRABOOST; AK Cluster ID8's vehicle.js phevModeOf). A 530e's log
 *     (Nov 27 2026) had them; a petrol or diesel car's modes are 1 - 14.
 *   - an M car: the M engine modes (MDrive controlDisplayMSystems.controlDisplayEngineMode 1 - 3, COMFORT / SPORT /
 *     SPORT_PLUS; AK Cluster ID8's mEngineModeOf).
 *   - diesel or petrol: Vehicle2.statusVehiclePartType typeEngine (kit/engine.js).
 * A plug-in hybrid before an M car before diesel / petrol. What was found is kept in the data folder (car.json), so a
 * start knows it at once; a plug-in hybrid or an M car once seen stays one.
 */
const fs = require('fs');
const path = require('path');
const Engine = require('./kit/engine');

const PHEV_NUMBERS = { 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1 };

/** A drive mode (a name or its wire number) that only a plug-in hybrid has. */
function phevMode(v) {
    if (typeof v === 'number') return !!PHEV_NUMBERS[v];
    if (typeof v !== 'string') return false;
    const s = v.toUpperCase();
    return /PHEV/.test(s) || (/(XTRA|EXTRA)_?BOOST/.test(s) && !/NOT|INACTIVE|OFF|INVALID/.test(s));
}
/** An M engine mode (COMFORT / SPORT / SPORT_PLUS, by name or 1 - 3). */
function mMode(v) {
    const n = v && typeof v === 'object' ? v.controlDisplayEngineMode : v;
    return n === 1 || n === 2 || n === 3 || n === 'KOMFORT' || n === 'SPORT' || n === 'SPORT_PLUS';
}
const kindOf = (f) => (f.phev ? 'phev' : f.m ? 'm' : f.fuel === 'diesel' || f.fuel === 'petrol' ? f.fuel : null);

function create(opts) {
    const log = opts.log, file = opts.dataDir ? path.join(opts.dataDir, 'car.json') : null;
    let found = {};
    try { found = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { /* none yet */ }
    let kind = kindOf(found);
    const note = (what, why) => {
        if (found[what[0]] === what[1]) return;
        found[what[0]] = what[1];
        const k = kindOf(found);
        if (file) { try { fs.writeFileSync(file, JSON.stringify(found)); } catch (e) { if (log) log.warn('car: cannot save ' + file); } }
        if (k === kind) return;
        if (log) log.info('car: ' + k + ' (' + why + ')');
        kind = k;
        if (opts.onChange) { try { opts.onChange(k); } catch (e) { if (log) log.warn('car: ' + e); } }
    };
    const mode = (v) => {
        const m = v && typeof v === 'object' ? v.actualValueModeDrivingExperience : undefined;
        if (phevMode(m)) note(['phev', true], 'its drive modes are a plug-in hybrid\'s: ' + m);
    };
    return {
        handlers: () => [
            ['de.bmw.infotainment.drivingexcitement.FES', { statusSwitchDriveDynamicSport2: mode, statusFESVehicleDynamicSwitchHMI: mode }],
            ['de.bmw.infotainment.misc.MDrive', { controlDisplayMSystems: (v) => { if (mMode(v)) note(['m', true], 'its M engine modes'); } }],
            ['de.bmw.infotainment.vehicle.Vehicle2', { statusVehiclePartType: (v) => {
                const t = Engine.typeOf(v && v.typeEngine);
                if (t) note(['fuel', t], 'its engine type: ' + (v && v.typeEngine));
            } }],
        ],
        kind: () => kind,
    };
}

module.exports = { create, phevMode, mMode, kindOf };
