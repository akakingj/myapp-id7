'use strict';
/**
 * detect.js - which car this is, for Engine: Auto (from the car): a plug-in hybrid, an M car, a diesel or a petrol car.
 *
 *   const d = detect.create({ dataDir, log, onChange });
 *   d.handlers()   -> [[iface, { field: fn }], ...] to watch (app.json "signals" has them)
 *   d.kind()       -> 'phev' | 'm' | 'diesel' | 'petrol' | null (nothing seen yet)
 *   d.sport()      -> { kw, nm }: the Sport Display's most power and torque (sportMax), null till they come
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

/*
 * The Sport Display's most power and torque (FES statusVehicleDynamicEngineMaxValue: displayMaximumValuePower,
 * displayMaximumValueTorque; its power and torque gauges' 100 %). Taken as kW and Nm, as the car's signals have
 * power and torque (statusActualValueTorque2 in Nm) and as the G20 range spans them: 320d 140 kW / 400 Nm, 320i
 * 135 / 300, 330i 190 / 400, 330e 215 / 420 (with its electric motor), M340i 275 / 500, M3 353 - 375 / 550 - 650. A
 * torque under 100 is taken as kgm (x 9.80665). Kept only within 60 - 600 kW and 150 - 1000 Nm, with the power at
 * 0.2 - 0.9 kW a Nm (every G20 is 0.34 - 0.65); 65535 or 0: none.
 */
function sportMax(v) {
    const p = v && v.displayMaximumValuePower, t0 = v && v.displayMaximumValueTorque;
    const t = typeof t0 === 'number' && t0 > 0 && t0 < 100 ? Math.round(t0 * 9.80665) : t0;
    const kw = typeof p === 'number' && p >= 60 && p <= 600 ? Math.round(p) : null;
    const nm = typeof t === 'number' && t >= 150 && t <= 1000 ? Math.round(t) : null;
    if (kw && nm && (kw / nm < 0.2 || kw / nm > 0.9)) return { kw: null, nm: null };
    return { kw, nm };
}

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
        if (k === kind && (what[0] !== 'kw' && what[0] !== 'nm')) return;
        if (log) log.info('car: ' + (k === kind ? '' : k + ', ') + why);
        kind = k;
        if (opts.onChange) { try { opts.onChange(k); } catch (e) { if (log) log.warn('car: ' + e); } }
    };
    const mode = (v) => {
        const m = v && typeof v === 'object' ? v.actualValueModeDrivingExperience : undefined;
        if (phevMode(m)) note(['phev', true], 'its drive modes are a plug-in hybrid\'s: ' + m);
    };
    return {
        handlers: () => [
            ['de.bmw.infotainment.drivingexcitement.FES', { statusSwitchDriveDynamicSport2: mode, statusFESVehicleDynamicSwitchHMI: mode,
                statusVehicleDynamicEngineMaxValue: (v) => {
                    const m = sportMax(v);
                    if (m.kw && found.kw !== m.kw) note(['kw', m.kw], 'Sport Display: ' + m.kw + ' kW');
                    if (m.nm && found.nm !== m.nm) note(['nm', m.nm], 'Sport Display: ' + m.nm + ' Nm');
                } }],
            ['de.bmw.infotainment.misc.MDrive', { controlDisplayMSystems: (v) => { if (mMode(v)) note(['m', true], 'its M engine modes'); } }],
            ['de.bmw.infotainment.vehicle.Vehicle2', { statusVehiclePartType: (v) => {
                const t = Engine.typeOf(v && v.typeEngine);
                if (t) note(['fuel', t], 'its engine type: ' + (v && v.typeEngine));
            } }],
        ],
        kind: () => kind,
        /** The Sport Display's most power (kW) and torque (Nm), each null till it has come. */
        sport: () => ({ kw: found.kw || null, nm: found.nm || null }),
    };
}

module.exports = { create, phevMode, mMode, kindOf, sportMax };
