# METRO: ECHOES OF 2039

An unofficial, noncommercial fan-made survival-horror FPS tribute inspired by the Metro series.
Original story and level design. Environment textures and prop models are CC0 (Poly Haven),
bundled locally in `assets/`; everything else (geometry, audio, UI) is generated in code.
Not affiliated with Dmitry Glukhovsky or 4A Games.

## Run it

Requires Node.js (any recent version) and a modern browser (Chrome / Edge / Firefox).
From the folder you extracted this archive into:

```bash
cd metro-echoes-of-2039     # whatever you named the extracted folder
node server.js
```

Then open **http://localhost:8039** and click **NEW GAME**.

Alternative: `python -m http.server 8039` in the same folder works too.
Any static file server works — there is no build step and no external dependencies
(Three.js is vendored in `vendor/`, all textures/models are local in `assets/`).
The game runs fully offline; nothing is fetched from the network at runtime.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Shift | Sprint (loud!) |
| Ctrl / C | Crouch (quiet) |
| Space | Jump |
| E | Interact / advance dialogue |
| F | Flashlight (uses battery) |
| G | Gas mask (uses filter time) |
| R | Reload |
| I | Inspect weapon |
| LMB | Fire |
| RMB | Aim down sights |
| 1 / 2 / wheel | Switch weapons |
| Tab | Inventory (use medkits, filters, batteries) |
| Esc | Pause |

## The mission — "The Last Signal"

1. Talk to **Lev** at the radio table in Zastava station.
2. Head through the north gate into the tunnel.
3. The security gate is dead — find diesel at the checkpoint, fuel the generator (east side room), pull the lever.
4. Cross the maintenance facility. The lurkers hunt by sound: crouch, kill your light, or fight.
5. In relay room K-12: throw the main breaker, activate the transmitter, and listen.
6. Read the operator's log.

Checkpoints autosave at every objective. Death restarts from the last checkpoint.

## Update 6.1 — "Gameplay acceptance attempt & release validation"

Continues the existing 6.0 project. The actual New Game button was clicked and the game reached its
normal start state in the in-app browser, but its page could not stay visible/foregrounded: pointer
lock remained false, movement could not be verified and RAF stopped in the hidden tab. No mission
completion or gameplay reliability is claimed, and no gameplay behavior was changed without a
reproducible defect. See `TEST-RESULTS-6.1.md` for observed evidence, unverified gates and a
visible-window manual full-playthrough runbook; see `CHANGELOG-6.1.md` for release scope.

## Update 6.0 — "Real 3D assets, visual rebuild & animation integration"

Built directly on the existing 5.0 codebase (no rewrite, no engine switch). Lev is now a **real
rigged, animated glTF character** (CesiumMan © 2017 Cesium, CC-BY 4.0 — attribution and modification
list in `assets/ATTRIBUTION.md`), with authored Idle/Run/Death clips on its skeleton and an original
worn-fatigues material; the native-clip pipeline validates rigs, pins root motion and keeps
independent skinned clones. The shelter, rifle/hands and mutant were visually rebuilt; local task
lighting added without touching global exposure. 31 automated tests pass (15 integration + 8 new
character regressions + 8 combat obstruction); matched v5/v6 screenshots and animation evidence in
`screenshots/`. Full details in `CHANGELOG-6.0.md`; measured results and the human-input runbook
(still owed) in `TEST-RESULTS-6.0.md`.

## Update 5.0 — "Character quality, combat reliability & verified gameplay"

Built directly on the existing 4.0 codebase (no rewrite, no engine switch, no new areas). Focus is
real, verifiable quality: enemy gunfire now respects cover; a mutant-melee crash was fixed; characters
use a replacement-ready rigged-glTF pipeline (no AAA models bundled — see `assets/ATTRIBUTION.md`);
combat animations are real baked tracks synced to AI; the darkest areas (derailed-train tunnel,
generator room) and the mutant silhouette were reworked; weapon viewmodels use gunmetal PBR; the pause
menu shows controls; asset loading is parallelised. Full details in `CHANGELOG-5.0.md`; three-category
test results (unit / automated playthrough / human runbook) in `TEST-RESULTS-5.0.md`.

## Update 4.0 — "Visual realism, character animation & playable immersion"

Built directly on the existing 3.0 codebase (no rewrite, no engine switch). Full details in
`CHANGELOG-4.0.md`; measured test / benchmark results in `TEST-RESULTS-5.0.md` (the current verified
report, which re-covers these systems and supersedes the 4.0 notes).

- **Animated characters** — rebuilt human/mutant rigs with named joints and correct proportions,
  driven by a real `AnimationMixer` cross-faded locomotion/attack/death clip set synced to the
  existing AI (not decorative loops). Original procedural meshes (no licensed scanned-human glTF
  was available offline; disclosed in the changelog).
- **Rebuilt train / station / tunnels** — detailed subway car (bogies, doors, seats, rails, straps,
  broken glass, graffiti) that preserves the exact v3.0 collision contract; station kitchen/heating,
  wiring/vent, damaged tiles, gate defence; tunnel drainage, refuge niches, leaks, collapsed junction.
- **Weapons** — moving pistol slide / rifle bolt, weapon inspection (I), landing dip, and persistent
  bullet-hole impact decals. Shooting/ammo/reload unchanged.
- **Cinematic lighting** — de-glossed tile/puddle surfaces, fixed the green radio-lamp wash on Lev,
  flickering fire shadows, zone-localized fog, restrained bloom and a single ACES grade. Not brighter overall.
- **Wayfinding** — maintenance-bay and K-12 signage plus a painted K-12 backdrop anchoring the finale.
- **Automated player-path simulation** — `tests/e2e-player-path.js` exercises New Game → Lev → gate →
  fuel → generator → security gate → control room → finale → save/reload → death restart. This is a
  simulation, not genuine keyboard/mouse acceptance: it manually advances `debug.frame`, writes
  mouse/input state, forces pointer-lock state, enables god mode, invokes a direct damage check, and
  clicks UI elements programmatically. It can catch progression regressions but cannot prove a player
  can complete the mission through visible, normal input.

### Running the player-path simulation

With the game open at `http://localhost:8039`, paste into DevTools:

```js
fetch('tests/e2e-player-path.js').then(r => r.text()).then(eval)
  .then(() => MetroE2E.run(window.__game)).then(console.log)
```

This runs longer than a single DevTools evaluation; await the returned promise. For Node-based
regressions use `npm test`. A genuine visible-browser playthrough must use the displayed controls and
must not invoke the simulation or debug helpers.

## Update 3.0 — "Echoes" polish pass

Built on top of the existing 2.0 codebase (no rewrite). Highlights:

- **Real PBR asset pipeline** — `js/core/assets.js` loads a local manifest of CC0 Poly Haven
  texture sets (diffuse / normal / roughness) and glTF prop models. Props swap to the scanned
  models when assets are present and fall back to procedural geometry otherwise, so the game
  never references a missing file. See `assets/ATTRIBUTION.md`.
- **Believable underground** — world-scale UVs on walls/floors/ceilings (no more stretched
  concrete), weathered tile and cracked-concrete surfaces, rusty pipes and machinery, detailed
  tracks/sleepers, dressed camps, generator room, facility and control room clutter.
- **Weapons & hands** — gloved hands rigged to the grips, magazine-drop reload reach, darker
  weathered wood furniture, cleaner pistol/rifle silhouettes.
- **Corrected post-processing** — single ACES tone-map in the composite pass (no double
  tone-mapping), tuned exposure and ambient so stations read moody instead of washed out;
  SSAO/bloom verified on medium/high with a safe low-quality fallback.
- **Audio envelopes fixed at the source** — hit/death/generator/drip gains no longer click or
  blow out; compression is a safety net, not the fix.
- **Save/restore robustness** — interrupting the final radio transmission and reloading safely
  restarts the cinematic instead of soft-locking the objective; 2.0 saves still load.
- **Smarter enemies** — scavengers pick cover that actually blocks line of sight and duck/peek
  behind it; being shot forces a reposition. Mutants use whisker raycasts to steer around
  corners, trains and props instead of grinding into them.
- **Living station** — Lev and Borya idle-animate (breathing, head turns, radio fiddling);
  a smuggler's stash crate with a chalk-mark note adds an optional exploration reward.
- **Automated test suite** — `tests/automated-tests.js`, 12 in-browser cases covering startup,
  inventory/pointer-lock, movement/collision, shooting/reload, both enemy types, generator +
  checkpoint, containers/loot persistence, mask/radiation, cinematic interruption, full mission,
  graphics settings, and death/restart. Real captured screenshots live in `screenshots/`.

### Running the tests

With the game open at http://localhost:8039, paste into devtools:

```js
fetch('tests/automated-tests.js').then(r => r.text()).then(eval)
  .then(() => MetroTests.runAll(window.__game)).then(console.table)
```

Every assertion reads live game state; results are reported, not invented.

## Update 2.0

- **Searchable lockers & supply crates** — station gate lockers, a checkpoint crate, facility
  workers' lockers, and the K-12 lockers can be searched (E). Some are empty. Searching makes
  a little noise. Opened containers stay open across save/load.
- **Motion-sensitive lights** — some lamps stutter when you move fast near them. Walk.
- **Scripted encounters** — something slams the security gate from the far side; a shape
  crosses the maintenance hall ahead. Once each, no random spawns.
- **Station radio** — Lev's set occasionally crackles with dispatch chatter from other stations.
- **Flashlight discipline** — mutants notice a flashlight beam sweeping over them, even in the dark.
- **Combat fixes** — enemies no longer act as platforms (you can't stand on a lurker's head);
  mutants hold striking distance instead of clipping inside you; scavenger ammo drops are
  saved with the checkpoint instead of duplicating on every load.
- **Graphics** — SSAO + bloom post-processing (medium/high), procedural environment reflections
  on metal and glass, bump-mapped concrete/rust/wood, hinged locker doors and crate lids.
- **Survival** — repeating warning beep under 10s of filter; mask overlay always syncs with
  filter state; pointer lock survives inventory, dialogue, and note reading correctly.

## Debug console helpers

Open browser devtools (F12) while playing:

```js
__game.debug.teleport(0, 0, -150)  // x, y, z
__game.debug.give()                // all supplies + rifle
__game.debug.god()                 // toggle invincibility
__game.debug.step(3)               // jump to objective
__game.debug.state()               // print state / position
__game.debug.frame(1/60)           // advance one simulation+render frame manually
```

## Tech

- Three.js r170 (WebGL), native ES modules, no bundler
- CC0 PBR textures + glTF props (local), procedural canvas textures & geometry as fallback
- Fully synthesized Web Audio
- AABB physics with sliding collision, slab raycasts for bullets & AI line-of-sight
- Enemy state machines: patrol / idle / suspicious / investigate / combat / search / return
- localStorage checkpoint saves, adjustable quality / sensitivity / volume / head-bob

## Project layout

```
index.html          all UI layers
css/style.css       dark industrial UI
server.js           zero-dependency static server
vendor/             Three.js module build + GLTFLoader
assets/             CC0 textures, glTF models, manifest, ATTRIBUTION.md
js/core/            engine, input, audio synth, physics, textures, assets, post
js/world/           materials, props, level, atmosphere
js/player/          FPS controller + survival systems
js/combat/          weapons, effects
js/ai/              mutant & scavenger AI
js/game/            mission, save/load
js/ui/              HUD & menus
js/main.js          orchestrator
tests/              automated in-browser test suite
screenshots/        real captured frames from the test run
```