# Car profile

One place for the car's engine values and units. Set them here once and the other apps follow them.

| Setting | Followed by |
|---|---|
| Engine (Auto / Diesel / Petrol / Petrol, M car / Plug-in hybrid) | M Vitals, Redline, Warm-Up, Virtual Dyno, AK Cluster Layouts and Centre (*Engine*, the same five: an M car is a petrol car there), AK Cluster ID8 (*Engine*, the same five; an M car and a plug-in hybrid: its layers keep clear of the M display's boxes and the eDrive box) |
| Yellow light at | Redline (*Lights from*), AK Cluster Layouts (the amber zone of ID6 M and ID7 M, Track's and GT3's tach turning yellow, Simple's rpm), AK Cluster Centre (*Shift light: starts at*), AK Cluster ID8 (*Yellow light at*: where the shift lights begin) |
| Red light at (Auto: the redline) | AK Cluster Layouts (the red zone, Simple's rpm red), AK Cluster ID8 (*Red light at*: the red zone) |
| Shift now warning at (the shift point; Auto: the redline less 300) | Redline (its fixed one), Warm-Up, AK Cluster Layouts, AK Cluster Centre (*Shift light: flashes at*), AK Cluster ID8 (*Shift now warning at*: the shift lights flash, the speed and the gear blink red) |
| Gauge goes up to (the end of the rev scale) | M Vitals, Redline, Virtual Dyno (*Graph up to*), AK Cluster, AK Cluster ID8 (*Gauge goes up to*) |
| Engine's top rpm (redline: the limiter) | M Vitals, Redline, Warm-Up, AK Cluster, AK Cluster ID8 (*Engine's top rpm*) |
| Cold rev limit | Redline, Warm-Up, AK Cluster, AK Cluster ID8 |
| Redline app: light style (shift point / rev bar) | Redline |
| Cold-engine rev guard (On / Off) | Redline, Warm-Up, AK Cluster, AK Cluster ID8 (*Cold engine*) |
| Oil is warm at | Redline, Warm-Up, AK Cluster, AK Cluster ID8 |
| Coolant is warm at | Warm-Up |
| Oil is too hot at | M Vitals (*Oil temp warning*), Redline (HUD and page), Warm-Up (*OIL HOT*), AK Cluster, AK Cluster ID8 (Toro's oil gauge, M Track's oil row, M Sport's oil strip: their red) |
| Coolant is too hot at | M Vitals (*Coolant temp warning*), Redline (HUD and page), Warm-Up (the coolant gauge's red), AK Cluster, AK Cluster ID8 (Toro's coolant gauge, M Track's coolant row) |
| Gearbox is too hot at | M Vitals (*Gearbox temp warning*), Redline HUD, Warm-Up (*GEARBOX HOT*), AK Cluster, AK Cluster ID8 (its gearbox gauge and row) |
| Speed unit | M Vitals, Redline, Drag Timer, Brake Test, G-Force, AK Cluster, AK Cluster ID8 |
| Distance unit | Brake Test (km -> metres, miles -> feet), eDrive |
| Temperature unit | M Vitals, Redline HUD, Warm-Up, eDrive, Transmission Config, Live Data, AK Cluster, AK Cluster ID8 |
| Pressure unit | M Vitals, Redline HUD (boost and tyres), Live Data, AK Cluster, AK Cluster ID8 |
| Fuel use unit | Redline HUD, AK Cluster Layouts and AK Cluster ID8 (*Fuel economy unit*: each of the four) |
| Torque unit, Power unit | M Vitals, Redline HUD, Virtual Dyno, AK Cluster, AK Cluster ID8 |
| Fuel tank size | Water Cup, AK Cluster Layouts and Centre, AK Cluster ID8 |
| Fuel % from (Engine unit (OBD tank level) / Litres / tank size) | AK Cluster Layouts, AK Cluster ID8: the fuel gauge's figure |
| Electric range when full (miles) | AK Cluster Layouts and Centre, AK Cluster ID8: a plug-in hybrid's electric range from its charge while the car gives none (ID8: its battery gauge against it too) |
| Clock (12 / 24 hours) | AK Cluster Layouts and Centre, AK Cluster ID8 (the time itself is the car's own clock's) |
| G-force circle up to (1, 1.2, 1.5, 2 g) | G-Force (*Circle size*), M Vitals (*G-force circle size*), AK Cluster Layouts (JDM 2's G meter), AK Cluster ID8 (Toro's G meter) |
| Speedometer up to (260 km/h, most BMWs; 330 km/h, an M car) | AK Cluster Layouts (every speedometer), AK Cluster ID8 (M Sport's) |
| Boost gauge up to (the car's own gauges: 15, 20 or 30 psi - in bar 2.0, in kPa 200 - or 45 psi, 3.0 bar, 300 kPa; each numbered as the car's: 0 5 10 15, 0 10 20, 0 10 20 30, 0 15 30 45 psi, 0.0 1.0 2.0, 0.0 1.0 2.0 3.0 bar; Auto: the car's own Sport Display's gauge end, the least at or over it (within 5 %). Set here alone: the apps have no setting of their own for it) | M Vitals (*Boost gauge max*), AK Cluster Layouts and Centre (every boost gauge and bar), AK Cluster ID8 (Toro's boost gauge, M Track Mode's boost rows) |

Every setting starts at **Each app**: until it is set here, each app keeps its own setting, so installing the app
changes nothing. Boost gauge up to, set here alone, starts at *Auto*, as the apps show it without the Car profile. A setting the profile sets shows the profile's value in the other app's Settings and can't be changed
there (no arrow on its row); set it back to *Each app* here and the app's own value is back.

## One shift point, one rev limit

The apps work the cold engine out the same way (the kit's `engine.js`, `Engine.coldShift`, and the AK Cluster apps
alike): the **shift point** is *Shift point* (an rpm; on *Auto* the redline less 300); with the *Cold-engine rev guard* on it is
pulled down while the oil is colder than *Oil is warm at*, from the *Cold rev limit* with the oil at 30 °C rising in a
straight line (on *Auto*: diesel 3000, petrol 4500 rpm). Redline flashes there and shows it as its cold *LIMIT*; Warm-Up
shows the same number as its rev limit while cold (the redline once warm); AK Cluster Centre's shift light (Auto) and
warm-up page the same; AK Cluster Layouts' red zone starts at the redline above it.

For every app to show the same numbers, set the redline here: on *Auto* Redline uses the limit it learned from the
limiter, M Vitals and Warm-Up the engine's (petrol 7000, diesel 5000), the AK Cluster apps their own setting. Redline's
learned shift point (per gear, setting *Shift point*: learned) is its own; the others use the fixed one.

## One way for the G

Each app drew the G its own way: G-Force's dot went inward in a bend (where the car turns), M Vitals' outward (where
you are pushed); braking on top in some, at the bottom in others. Since Car profile 1.6.0 there is no setting for it:
every app moves the dot as the driver feels the G - right in a left bend, down (back) accelerating, up braking, BRAKE
on top - G-Force, M Vitals, Water Cup (its water higher on the outside of the bend), AK Cluster Layouts (JDM 2's G meter,
JDM 1's cup). *G-force circle up to* sizes the circles alike.

## One set of too-hot temperatures

The *Too hot* group sets where each app turns the oil, coolant and gearbox temperature red: at that temperature and
above, the same in every app (M Vitals' tiles, Redline's HUD readouts and the oil and water on its page, Warm-Up's
*OIL HOT - EASE OFF*, and in AK Cluster the readouts, the temperature gauges' red zones, Centre's Warnings and Info's
panel). Left at *Each app*, each keeps its own: Redline 130 / 112 / 120 °C, M Vitals 125 / 112 / 120, Warm-Up oil
125, AK Cluster 130 / 118 / 115. M Vitals' gearbox tiles are red, not amber, from there.

The choices: oil and coolant 110-140 °C, gearbox 80-130 °C (in 5s). A BMW with a map-controlled thermostat runs its
coolant hotter at part load (around 105-112 °C) than under full load: a coolant value of 110 can turn the coolant red
in everyday driving.

## How it works

- The app runs from the head unit's start (`autostart`) and writes what is set to `/dev/shm/car-profile.json`
  (`profile.js`), again whenever a setting changes. The apps run as users of their own and can't read each other's
  data folders; `/dev/shm` is readable by all of them, and is emptied at every start of the head unit, which is why
  the app writes it again each time from its own saved settings. It doesn't have to be opened.
- In the other apps, the kit's settings (`kit/runtime/mgu.js` `Settings`) follow it for every setting with
  `"profile": "<name>"` in their `app.json` (`"profileMap"` where the two name a value differently). They look at the
  file every 3 s; a change reaches the app as a change of the setting would (the gauges' scale, the redline, the units
  redraw at once).
- A value an app can't take, a name the profile leaves to each app, a file in another format (`"v"` other than 1), or
  no file at all: the app uses its own setting. Uninstalling Car profile gives every app its own settings back at the
  next start of the head unit (at once if everything is set back to *Each app* first). No app requires it.

File format:

```json
{ "v": 1, "app": "car_profile", "version": "1.0.0",
  "values": { "redline": 6000, "rpmScale": 7000, "torqueUnit": "kgm", "speedUnit": "kmh" } }
```

Other apps can read the same file: only the values set are in it; unknown names are to be ignored. **AK Cluster**
(akakingj/idrive7-cluster-info: Cluster Layouts, Centre and Info) does: its red zone and shift point, its cold-engine
guard, its too-hot temperatures and its units follow it the same way. Its shift point is worked out as Redline's fixed one (*Shift point*, on Auto the redline
less 300, lowered while the oil is cold from the cold rev limit at 30 °C to normal at *Oil is warm
at*); Redline's learned per-gear shift point is Redline's own. The profile's *Auto* (0) for the redline, the rev scale
and the cold rev limit is left to each cluster app's own setting (they have no Auto).

Tests: `node kit/tools/test_car_profile.js`.
