# METRO: ECHOES OF 2039 — Update 4.0 changelog

"Visual realism, character animation & playable immersion."
Applied directly to the existing v3.0 project. **No rebuild, no engine switch, no replacement of
functional systems.** Three.js r170, native ES modules, no build step, fully offline.

---

## 1. Characters & animation (§2, §3)

- `js/world/characters.js` — rebuilt human and mutant rigs from named joints (hips / spine /
  chest / neck / head / shoulder / elbow / wrist / hip / knee / ankle) with correct human
  proportions (~1.8 m), clothing layers, gear, gloves, boots and gas-mask heads. Legacy joint
  aliases kept so existing AI code binds unchanged.
- `js/ai/animation.js` — real `AnimationMixer` locomotion: procedural clips baked to
  `QuaternionKeyframeTracks` (idle / walk / run / attack / death), cross-faded (0.22 s) and driven
  by the **existing AI state machine**, not decorative loops. Smoothed upper-body overlays
  (aim / hit / look) applied after `mixer.update`.
- Hitboxes unchanged (AABB colliders); AI, collision and combat logic preserved.
- Limitation: rigs are original procedural meshes, not licensed scanned humans. No external
  rigged glTF was bundled because none with a compatible redistribution licence was available
  offline; this is disclosed rather than hidden.

## 2. World geometry (§4)

- `js/world/props.js` `trainCar()` fully rewritten: rounded roof with ribs and ventilators,
  panel-seamed sides, gasketed / broken windows, sliding doors with pockets and grab handles,
  bench seats with cushions and dividers, stanchions + overhead rails + strap loops, luggage
  racks, ceiling light fixtures (some broken / hanging), bogies with wheels / tyres / axle boxes /
  leaf springs / brake rigging, underfloor battery box and air tanks, coupler + buffers,
  rivets (instanced), graffiti and dent / grime decals. **The v3.0 train collider contract is
  preserved exactly** (W 2.9 / H 2.9 / floor / wall / door gaps / end walls / roof), so collision
  and interior exploration behave as before.
- Zastava station: kitchen / heating corner (wood stove + kettle + prep table), exposed wiring /
  conduit and a ventilation duct with a spinning fan, damaged / missing tile patches, gate
  defence (barricade + sandbags) that keeps the gate opening clear.
- Tunnels: drainage channel with periodic grate covers, recessed cable / refuge niches at varied
  stations, leak streaks and spall at varied heights, a collapsed side junction with rubble and
  signage — breaking the repeated modular look.
- Repeated fittings use `InstancedMesh` (rivets, straps, roof ribs, grates) to keep draw calls down.

## 3. Weapons (§5)

- `js/combat/weapons.js` — pistol slide and rifle bolt are separate moving groups; cycling kicks
  them on fire. Added weapon **inspection** (I): a timed pose that rolls the weapon to show its
  side, cancels on fire / aim / sprint / reload. Landing dip, sway and inertia retained.
- `js/combat/effects.js` — persistent **bullet-hole impact decals** (procedural crack + spall
  texture, capped at 48, polygon-offset) placed on the hit surface normal.
- Shooting, ammo, reload and ADS logic unchanged; verified by automated tests 1 / 4 / 5.

## 4. Lighting, materials & grading (§6)

- De-glossed surfaces: station tile PBR sets ship a low (glazed) roughness map that read as wet
  sparkle under the tube lights — the gloss map is dropped for a uniform matte ceramic roughness
  (normal map keeps grout relief). Puddle / rad-puddle Phong specular reduced and broadened.
- Fixed the green radio-lamp wash on Lev: the indicator is now a dim, short-range glow on the
  radio face only.
- Shadow variation: the camp fire (the station's warm key) now casts flickering shadows
  (512 cube map, per-light size override honoured by `Engine.setQuality`); the flashlight remains
  the primary shadow-casting light.
- Localized fog: `scene.fog.density` now eases per zone (station clearer, tunnel / facility thicker,
  control room clearer) instead of one global value.
- Bloom / grading unchanged and restrained (single ACES tone-map in the composite pass, exposure
  0.92). **The game was not made brighter overall.**

## 5. Level design & player experience (§7)

- Wayfinding / identity: maintenance-bay sign on the security-gate header, a K-12 direction sign
  beside the facility exit, and a large painted K-12 backdrop behind the relay console as the
  finale's landmark anchor.
- Existing pacing retained: warm safe station → dark flickering tunnel → mixed facility →
  red-lit control room; the breaker / transmitter power-up beat still plays and survives save/load.

## 6. Tests (§8)

- Retained the v3.0 12-case in-browser suite (`tests/automated-tests.js`) — all pass.
- Added `tests/e2e-player-path.js`: a genuine player-path end-to-end run driven **only through
  normal controls** (real DOM key/mouse events, menu button clicks, the input layer). It never
  calls mission functions directly and never teleports; traversal uses real movement, collision
  and interaction. See `TEST-RESULTS-5.0.md` for the honest per-stage outcome (consolidated verified report).

## 7. Performance & deliverables (§9, §12)

- Real measured frame time / draw calls / triangles / textures / memory recorded in
  `TEST-RESULTS-5.0.md` (current-build measurements, not a historical v4 benchmark). Representative
  current-build screenshots are in `screenshots/`; no matched before/after comparison is claimed.
- This archive: runnable game, local assets, source, README, attribution, this changelog,
  tests + results, screenshots, known limitations.

## Known limitations

- Character rigs are original procedural meshes (no licensed scanned-human glTF bundled).
- The headless end-to-end run enables god mode so enemy contact cannot end the path early;
  enemies still engage via movement/noise. Combat correctness is covered by automated test 5.
- Pause in a real browser is Esc-exits-pointer-lock; the headless E2E emulates that lock loss.
- SSAO/bloom require medium/high quality; low quality falls back to direct rendering.