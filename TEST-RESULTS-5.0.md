# Update 5.0 — verification results

Date: 2026-11-11. Tested in the local Chromium-based inspection browser, using the running
`node server.js` game at `http://localhost:8039`. No engine switch or new mission was introduced.

## Release status

- **A — unit/integration: 15/15 passed.** Includes a regression check that resolves a mutant
  melee strike, gunfire/cover checks, animation clips/transitions, and mission/save systems.
- **B — automated gameplay simulation: 12/12 passed**, including reading the operator's log
  and reaching `state=complete`. Final run took **137.0 seconds wall time**.
- **C — unmodified, real-input human gameplay: NOT VERIFIED.** The checklist below is still
  outstanding. A and B do not prove ordinary mouse/pointer-lock behavior or survival balance.
- **High-quality external characters: NOT SHIPPED.** Lev, Borya, scavengers and mutants remain
  procedural rigs. The rigged-glTF replacement pipeline exists; this is not an AAA/photorealistic
  character release. See `assets/ATTRIBUTION.md` for missing roles and licensing limitations.

## A — unit/integration results

Source: `tests/automated-tests.js`. These tests reset the world, place actors directly, grant
supplies, invoke gameplay functions and advance simulation time. They are not a player walkthrough.
The final run used a 1280×720 viewport; the graphics test switches low/medium/high quality.

| Test | Result and measured evidence |
|---|---|
| 1. Startup/assets | PASS: 2,503 meshes, 6 enemies, 12 loaded prop models, 9 texture sets; post-processing and HDR active |
| 2. Inventory/state | PASS: inventory disables input; resume enables input; lock/unlock API present. Actual pointer lock not tested |
| 3. Movement/collision | PASS: forward travel 2.88 m; closed station gate stops player at z=-27.60 |
| 4. Shooting/reloading | PASS: one shot consumed; reload finished with 8 in magazine and 6 reserve rounds consumed |
| 5. Encounters/melee | PASS: mutant reacts, scavenger reselects cover, melee windup resolves and damages player without throwing, death disables collider |
| 6. Generator/checkpoint | PASS: fueled/running states, security gate, objective step 3, save restoration |
| 7. Containers/loot | PASS: loot granted once, open state persists, dynamic drop spawned |
| 8. Mask/radiation | PASS: mask toggles, radiation rate 9.0, filter decreases to 88.0 |
| 9. Interrupted transmission | PASS: starts, interrupts, resumes after save/load; log spawns at step 7 |
| 10. Mission functions | PASS: intro, breaker, log, completion via direct function calls |
| 11. Rendering settings | PASS: low luma/non-black 62.2/94%; medium 59.7/91.3%; high 60.0/91.5%; 67 shader programs |
| 12. Death/reset | PASS: death state then world reset restores health to 100 |
| 13. Gunfire/cover | PASS: exposed damage 1380.54; wall-blocked damage **0** across 400 shots; tracer ends at wall. Exposed-to-covered damage 275.87 → **0** |
| 14. Baked animation tracks | PASS: locomotion, additive postures/hit/attack/shoot; full death clip has position track, 16 tracks, duration 0.90 s |
| 15. Animation transitions | PASS: idle/walk/run selection, aim rise/decay, one-shot expiry, death clamp, loaded-death snap |

Test 13 isolates the firing lane: it temporarily disables existing colliders and inserts one wall,
then restores the collider list. It proves the raycast/impact logic, not every possible cover angle
in the level. Exposure damage is randomized and need not match these exact numbers on another run.
The glTF fixture verification performed during development is separate from these 15 tests; the
licensed external fixture is not in the release archive and cannot be rerun from the ZIP alone.

## B — automated gameplay simulation results

Source: `tests/e2e-player-path.js`. Movement goes through the real player physics and collision
system; pickups, dialogue, doors, generator, breaker, transmitter and log use E/menu interaction.
There are **no teleports, direct objective setters, or direct mission-completion calls** in this path.

Disclosed shortcuts:
- God mode keeps the pilot alive during the route; this is not proof the route is survivable unaided.
- Manually stepped 1/60-second simulation frames, in addition to any browser animation frames.
- Synthetic DOM keyboard events and menu clicks; mouse deltas and firing state are supplied to
  the input layer. Pointer-lock state is emulated, not acquired through a real OS mouse gesture.
- The driver reads enemy positions, health and LOS to aim and decide when to fire.
- Low rendering quality, 480×270 viewport. Every `G.debug.frame()` still renders the game.
- A direct lethal `player.damage()` call tests death/restart after completion; this is not a
  naturally incurred death. The restart itself uses the actual menu button.
- New Game and checkpoints overwrite the inspection browser's local test save.

| Stage | Final observed result |
|---|---|
| New Game | PASS: playing, step 0, position (-4.3, 0, 2.0) |
| Talk to Lev | PASS: dialogue opens, station gate unlocks, step 1 |
| Station gate | PASS: open, player z=-30.7 |
| Tunnel | PASS: z=-99.6, enemy engagement observed |
| Fuel pickup | PASS: inventory fuel=1 |
| Generator | PASS: running, step 3 |
| Security gate | PASS: open, z=-151.6 |
| Facility | PASS: z=-204.7; route walks west around the machine at (0.5,-198) |
| Save/resume | PASS: paused then playing through menu controls |
| Transmission | PASS: breaker=true, radioPlayed=true, logSpawned=true, step 7; position (0,0,-235.3) |
| Mission completion | PASS: operator log opened and closed, done=true, state=complete |
| Death/restart | PASS: death screen then playing from checkpoint; health approximately 58.98 after simulation frames |

Earlier runs failed at the fuel approach, generator-room exit, facility machinery and transmitter
radius. These were investigated rather than counted as passes. The facility obstacle was a real
machine, not an invisible wall: the test route was corrected, and the collider was preserved.
The test now waits through the full transmission and reads the log instead of treating transmitter
activation alone as mission completion. This table is one final passing run, not a long soak test.

During the final B run, the CDP listener captured no `Runtime.exceptionThrown` events or warning/error
`Log.entryAdded` events. This is not a full network trace or a guarantee of zero console messages.
A prior real game exception in mutant melee (`G is not defined`) was fixed to use `this.G`; test A5
now checks that a strike actually resolves. A separate Node CDP-helper shutdown assertion and a
failed batch screenshot transfer occurred outside the game. Neither was counted as a game-test pass;
the final A result above came from a separate successful invocation.

## C — real-input human test checklist (not executed)

Run `node server.js`, open `http://localhost:8039` in a visible Chrome/Edge/Firefox window,
and click New Game. Do not enable god mode, change inventory, teleport, call mission functions,
or run the simulation scripts. Record browser/GPU, resolution, quality, failures and completion.

- [ ] Click canvas and confirm real pointer lock, mouse look, sensitivity and inverse-Y behavior.
- [ ] Test WASD, sprint, crouch, jump, stamina recovery; open/close inventory and pause; resume focus.
- [ ] Talk to Lev and open the station gate. Confirm readable objective, dialogue and controls.
- [ ] Follow the tunnel; explore the derailed train for the rifle; verify pistol/rifle fire,
      aim, reload, inspection and weapon switching with physical controls.
- [ ] Test flashlight drain and battery use; mask/filter changes; radiation, medkits and inventory.
- [ ] Collect checkpoint fuel, fuel/start the generator, pass the powered security gate.
- [ ] Cross the facility, bypassing the broad machine near the exit on its west side. Test mutant
      chase, attack, flinch and death without player/enemy clipping or animation stalls.
- [ ] In K-12, expose briefly to scavenger fire, then move fully behind solid cover. Confirm damage
      stops behind full-height cover and tracers do not pass through it; test a closed door too.
- [ ] Throw the breaker, approach the transmitter, activate it, listen for about 26 seconds,
      open and close the operator's log, confirm the completion screen.
- [ ] Separately test natural death/restart, manual save/Continue, and save/restore during transmission.
- [ ] Repeat low/medium/high and window resize; listen for audio clipping and interruption artifacts.

Outstanding: real pointer lock/OS mouse input, subjective first-15-minute feel, audible quality,
unassisted survival difficulty, all optional loot routes, rifle pickup during the full path,
long-session memory behavior, other browsers, multiple resolutions and multiple hardware GPUs.

## Reproduce A and B

Use a separate browser profile or back up your save first. Both suites modify game state and saves.
Do not run them concurrently or navigate/reload while either is executing.

Browser console, with the local game fully loaded:

```js
await fetch('tests/automated-tests.js').then(r => r.text()).then(s => (0, eval)(s));
const a = await MetroTests.runAll(window.__game);
console.table(a.results);
```

For the separate simulated route:

```js
await fetch('tests/e2e-player-path.js').then(r => r.text()).then(s => (0, eval)(s));
const b = await MetroE2E.run(window.__game);
console.table(b.stages);
```

Use a nonzero viewport. A hidden 0×0 browser view invalidates the graphics readback test. The final
A run was 1280×720; B was 480×270 low quality. Do not reinterpret either script as Category C.

## Measured render-only benchmark

Hardware reported by WebGL: **NVIDIA GeForce RTX 4060 Ti**, ANGLE Direct3D11. Browser reports
Chromium 150.0.7871.250 / Electron 43.8.4 on Windows. This is hardware rendering, not SwiftShader.

Method: 1280×720 drawing buffer, device scale 1; paused facility inspection camera at
(0,1.6,-168), looking at (0,1.3,-192), fog density 0.038; first-person meshes hidden. Five warm-up
renders per preset, then 30 samples. Each sample calls `engine.render()` followed by `gl.finish()`
so GPU completion is included rather than command submission alone. Renderer counters accumulate
all passes per sample, including shadow maps and post-processing, not just the last fullscreen quad.

| Preset | Mean ms | Median ms | p95 ms | Draw calls/frame | Triangles/frame | Resident geometries | Resident textures | Shader programs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Low | 10.94 | 9.90 | 17.90 | 1,092 | 294,708 | 898 | 125 | 68 |
| Medium | 12.18 | 12.50 | 15.00 | 2,015 | 461,581 | 898 | 126 | 68 |
| High | 9.28 | 9.00 | 11.70 | 2,015 | 461,581 | 898 | 126 | 68 |

Reported used JavaScript heap after the run: **51,747,559 bytes** (about 49.4 MiB). Geometry/texture
figures are object counts resident in this inspection session, not VRAM bytes or clean-boot counts.
No VRAM-byte measurement or long-duration memory-leak claim is made.

**These are not gameplay FPS measurements.** AI/physics/input/HUD updates and normal frame pacing
are excluded. This is one short static view, not a map-wide benchmark. The non-monotonic preset
timings reflect sampling/caching/system variation and do not demonstrate that high is faster than
medium. No before/after speedup or controlled cold-load improvement is claimed.

To repeat, load `tests/automated-tests.js`, pause an inspection session, position the camera as
above at the same viewport/DPR, hide its first-person meshes, and run:

```js
const result = MetroTests.benchmark(window.__game, 30);
console.table(result.samples);
```

Reload the page afterward to restore normal play. The benchmark restores the prior quality preset
and renderer counter-reset setting. Different camera poses, runtime history, hardware, background
load and DPR will change results.

## Visual evidence

Nine PNGs in `screenshots/` were captured directly from the running v5 WebGL canvas at **1280×720,
high quality**. These are inspection-camera renders, not frames from an unmodified human playthrough.
The world was reset and stepped for 0.5 seconds to initialize animated poses, then paused. The camera
was placed for each view and the corresponding gameplay-zone fog density applied. Environmental
views hide the first-person weapon; pistol/rifle views use its actual update-driven play pose.
No AI imagery, offline relighting or image edits were used. DOM HUD/menu overlays are not in these
canvas-only captures. These are current-build views, not a matched before/after comparison.

| File | Evidence / remaining visual limitation |
|---|---|
| `final_lev.png` | Warm radio-desk lighting and props; visibly primitive human/clothing, repetitive tiled walls |
| `final_station.png` | Platform, columns, station carriage and mixed practical lighting |
| `final_tunnel.png` | Derailed carriage and narrow bypass; train body remains deliberately dark |
| `final_generator.png` | Unpowered generator-room layout and local cool/warm lights |
| `final_facility.png` | Machinery, bypass spaces and pools of light; large surfaces remain simple |
| `final_control.png` | K-12 room, breaker/transmitter composition and scavenger silhouette |
| `final_mutant.png` | Actual animated procedural mutant; rounded primitive anatomy is still obvious |
| `final_pistol.png` | Pistol viewmodel in its play pose, with material highlights |
| `final_rifle.png` | Rifle viewmodel in its play pose; still procedural, not a scanned weapon |

## Static and packaging checks

- `node --check`: **27/27** JavaScript files, including runtime, tests, vendored modules and server.
- **148 local references** checked: static relative imports, import-map Three.js target, manifest
  textures/models, glTF image/buffer URIs and HTML/CSS references; **0 missing**.
- **12 glTF prop models**, **9 texture sets**, and an empty `characters` manifest map.
- Local server root returns HTTP 200; runtime uses bundled assets and the vendored renderer.
- Release allowlist retains runtime, tests, README/changelogs, this report, attribution and nine
  selected screenshots. `.tmp`, fixtures, intermediate downloads, previous ZIPs and duplicate
  screenshots are not included. Workspace development files are not deleted.
- Package version is 5.0.0. Missing historical `TEST-RESULTS-4.0.md` references were redirected
  to this current report rather than inventing historical measurements.
