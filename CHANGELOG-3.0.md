# METRO: ECHOES OF 2039 — Update 3.0 changelog

Update 3.0 is a polish-and-believability pass built **on top of the existing 2.0 codebase**.
No systems were rewritten from scratch; every change edits the v2.0 files in place.
The game still runs with `node server.js` → http://localhost:8039, fully offline.

---

## 1. Bugs fixed (reliability first)

### Audio gain envelopes (fixed at the source, `js/core/audio.js`)
- `mutant_hit`, `human_hit`, `human_die`, `generator_fail`, `drip` previously scheduled gain
  ramps that started/ended at non-zero values or overlapped, producing clicks and blow-outs.
  Each voice now ramps from 0 → peak → 0 with explicit `setValueAtTime` anchors and
  `linearRamp`/`exponentialRamp` tails that reach silence before the node stops.
- Master compression/soft-clipping remains only as a safety net, not the primary fix.

### Save / restore during the final radio sequence (`js/game/mission.js`, `js/main.js`)
- Saving mid-transmission and reloading used to leave `radioPlayed=true` with the operator's
  log never spawned, soft-locking the last objective.
- `applySave` now detects `radioPlayed && !logSpawned` and safely **restarts the cinematic**
  from the beginning instead of resuming a half-finished timeline. Objectives stay completable.
- Existing v2.0 saves still load (field-compatible deserialization).

### Checkpoint / world restoration (`js/main.js` `resetWorld`/`applySave`)
- Enemy hp/death/position, dynamic ammo drops, opened containers, inventory, generator/breaker/
  gate state and pointer-lock all round-trip through collect/apply save. Verified by tests 6, 7, 9.
- The `E` press that closes a dialogue/note no longer re-triggers the same interactable on the
  next frame (input `justPressed` cleared on state transition).

### Prop/asset reference safety
- `barrel()` fire child is now exposed via `userData.fire` in **both** the model and procedural
  paths, so the camp-fire flicker never indexes a missing child after the model swap.
- `hangingLamp()` model path is re-anchored to the ceiling so it hangs like the procedural version.
- The parked-train stash uses a lidded crate (`P.crate`) so the searchable-lid animation has a
  valid pivot (a lidless military crate would have crashed the lid update).

---

## 2. Visual believability (geometry & materials, not just lighting)

### Asset pipeline (`js/core/assets.js`, `assets/`)
- New `Assets` loader reads `assets/manifest.json`: 9 CC0 Poly Haven texture sets
  (diffuse + normal + roughness) and 12 glTF prop models (~47 MB), all bundled locally.
- Correct color spaces: diffuse → sRGB, normal/roughness → linear; repeat wrapping.
- `pbr(name, repeat, extra)` caches `MeshStandardMaterial`; `model(name, …)` clones glTF scenes.
- `GLTFLoader` vendored at `vendor/loaders/GLTFLoader.js` with its `BufferGeometryUtils` import.
- `props.js` builders swap to scanned models when assets are present and keep a procedural
  fallback otherwise — **no missing-model/texture references are possible**.
- Attribution in `assets/ATTRIBUTION.md` (all CC0).

### World-scale surfacing (`js/world/level.js`, `js/world/materials.js`)
- Added `scaledMat()` so large walls/floors/ceilings repeat textures per metre instead of
  stretching a 0..1 UV over 100 m. Eliminates the smeared/streaked concrete look.
- Worn concrete floor + tunnel floor tints tuned darker so stations read damp and underground.

### Dressing & detail
- Station camp, alcove, checkpoint, generator room, facility hall and control room received
  trash cans, cement bags, ammo boxes, toolboxes, pipe assemblies, power boxes and hanging lamps.
- Lev's table gets a field radio transceiver; the parked train hides a smuggler's stash crate.
- Weapons: gloved hands rigged to the grips (right hand rides the magazine drop), reload reach
  animation for the support hand, darker weathered wood furniture, cleaner silhouettes.

---

## 3. Post-processing & lighting correctness (`js/core/post.js`, `js/core/engine.js`)

- All pass materials set `toneMapped:false`; the composite performs a **single** ACES tone-map +
  linear→sRGB conversion. Fixes the double-tone-map / duplicate-`RRTAndODTFit` shader error.
- Exposure lowered 1.15 → 0.92 and hemisphere ambient 0.5 → 0.3 to remove the washed-out beige
  station look; fog kept dense and dark.
- SSAO sample count scales with quality (high 12 / medium 6); post disabled on low.
- Verified `post.ok` and `post.hdr` true; low/medium/high all render a healthy, non-black frame
  (see test 11). Flashlight shadows, falloff, wet-floor roughness and dust particles retained.

---

## 4. Gameplay feel & enemy AI (`js/ai/enemies.js`, `js/combat/weapons.js`)

- **Protection-first cover**: scavengers score cover by whether it *blocks* line of sight at
  body height, then whether they can peek over it, then distance band — not merely "has LOS".
- **Duck / peek cycle**: at shielded cover scavengers crouch (`duckK`) behind it and rise to fire;
  firing is gated on being raised. Being shot forces an immediate reposition + duck.
- **Mutant obstacle avoidance**: whisker raycasts ahead of the movement direction pick the
  clearest steering angle, so mutants round corners, trains and props instead of grinding in.
- Hit reactions: mutants flinch and reset their attack windup when shot; scavengers shout,
  duck and re-select cover. Death topples with limp limbs and dimmed eyes.

---

## 5. World immersion (`js/world/level.js`)

- Lev and Borya idle-animate: breathing, head turns, Lev fiddling with the radio.
- New note `note_train_cache` (smuggler's chalk mark) + a false-bottomed stash crate in the
  parked train (medkit + rifle ammo) as an optional exploration reward.
- Location-reactive ambience and scripted encounters from 2.0 retained.

---

## 6. Automated test results (real, captured in-browser)

Suite: `tests/automated-tests.js` (12 cases). Run against a live instance; every assertion reads
real game state. **Result: 12 / 12 passed. Zero console errors or warnings.**

| # | Case | Result | Detail |
|---|------|--------|--------|
| 1 | startup & asset pipeline | PASS | meshes=1986 enemies=6 models=12 texSets=9 postOk=true hdr=true |
| 2 | inventory & pointer-lock | PASS | inventory=true resume=true lockApi=true |
| 3 | movement & collision | PASS | forward=2.88m wallStopZ=-27.60 (wall at -28) |
| 4 | shooting & reloading | PASS | shotsFired=1 magAfterReload=8 reserveUsed=6 |
| 5 | mutant & scavenger encounters | PASS | mutantReact=true scavSeeksCover=true mutantDeath=true |
| 6 | generator & checkpoint | PASS | fueled=true running=true gate=true step=3 saveRestore=true |
| 7 | containers & loot persistence | PASS | lootGranted=true opened=true persisted=true dropSpawned=true |
| 8 | gas mask & radiation | PASS | maskOn=true radRate=9.0 filter=88.0 maskOff=true |
| 9 | cinematic interruption save/load | PASS | started=true interrupted=true restarted=true logSpawned=true step=7 |
| 10 | full mission flow | PASS | intro=true breaker=true log=true complete=true finalStep=7 |
| 11 | graphics settings & shaders | PASS | low=62.3/89.8% med=63.4/88.6% high=63.6/88.6% shaders=55 |
| 12 | death & restart | PASS | death=true state=dead restartHp=100 alive=true |

(Test 11 numbers are average frame luma / non-black pixel percentage from `gl.readPixels`.)

### Screenshots (actually captured, in `screenshots/`)
- `final_station.png` — Zastava platform, train, tiled walls, pistol.
- `final_rifle.png` — station camp with the rifle + gloved hands.
- `final_tunnel.png` / `final_tunnel_lit.png` — track bed, sleepers, cracked concrete, pipes.
- `final_generator.png` — GEN-4 room: machine, gauges, barrels, shelf, hanging lamp.
- `final_facility.png` — maintenance hall, lurker silhouette, blood decal.
- `final_control.png` — relay room K-12: consoles, server racks, operator table.

---

## 7. Remaining limitations

- Pointer lock and audio start require a real user click (browser policy); the automated suite
  verifies the lock/unlock API path but cannot grant a genuine gesture headlessly.
- Screenshots were captured via canvas readback in a hidden automation page at 1280×720; they
  are real frames but not a substitute for playing with a mouse.
- AI navigation is steering + whisker avoidance, not a navmesh; very tight prop clusters can
  still cause brief sidesteps before an enemy gives up on an unreachable waypoint.
- Low quality disables post-processing and shadows by design (fallback for weak GPUs).
- Asset bundle adds ~47 MB; first load decodes textures/models (a short boot pause is normal).

---

## 8. Run it

```bash
cd <extracted folder>
node server.js
# open http://localhost:8039 → NEW GAME
```

No build step, no network access at runtime. See `README.md` for controls and the mission walk-through.