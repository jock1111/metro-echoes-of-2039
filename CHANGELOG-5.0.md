# METRO: ECHOES OF 2039 — Update 5.0 changelog

**Release:** v5.0 · 2026-11-11 · fan-made, noncommercial, fully offline
**Scope:** character quality, combat reliability, and *verified* gameplay. No new areas or missions;
no engine change; all existing systems preserved and improved in place.

---

## P1 — Combat correctness (enemy gunfire line-of-sight)
- Enemy rifle fire now respects solid cover: a closed door / wall between shooter and player blocks
  the hit (raycast LOS), not just distance. Tracers stop at the blocking surface.
- Cover accrual and decay verified: exposed fire damages, fully-covering fire does not.
- **Fixed a mutant-melee crash:** the lurker strike's LOS check referenced an undefined global `G`
  (`js/ai/enemies.js`), throwing `ReferenceError` whenever a swipe completed in range. Now uses the
  instance reference (`this.G.physics.los`). Caught by the full-path playthrough, not the unit suite.

## P2 — Character asset pipeline (replace mannequins)
- Added a replacement-ready glTF character pipeline (`js/world/characters.js`): a manifest
  (`assets/manifest.json → characters`) can swap a redistributable rigged model into any role
  (Lev / Borya / scavenger / mutant), with Mixamo-style bone + clip mapping onto the game's joint
  contract and animation states. Verified end-to-end against a rigged fixture.
- **Honest disclosure:** v5.0 ships **no** high-quality character models. Mixamo's licence forbids
  redistribution, so the fixture used for verification is *not* shipped. Characters remain the
  original procedural rigs (layered clothing/gear, two-bone limbs, named joints). See
  `assets/ATTRIBUTION.md` for the missing roster and a CC0 sourcing guide.

## P3 — Genuine combat animations
- Real baked animation tracks (locomotion idle/walk/run, aim up/down, additive hit flinch, full-body
  death with position track, mutant attack, human shoot) driven by a state machine synced to AI.
- Additive combat layer blends over locomotion; transitions clamp and snap correctly on load.

## P4 — Obvious graphics problems fixed
- **Lev's radio corner:** removed the green colour wash; warm lantern key + dim green status lamp;
  dressed composition (note, mug, cable, shelf, bed, poster). The underlying human model remains
  visibly primitive; improved lighting does not substitute for a high-quality replacement.
- **Derailed-train tunnel:** was near-black between two unlit lamps; added a maintenance work light
  and a faint cool rear fill so the derailment and car body read while staying moody.
- **Generator room:** boosted/repositioned the cool fill so the generator, gauges, flywheel, shelf
  and hanging lamp are legible before power-on (the running generator adds the bright key later).
- **Mutant silhouette:** reduced the oversized torso/hump and retained ribs, spine spikes,
  claws, bent legs and glowing eyes. It is still a stylized primitive-based creature, not a
  realistic replacement model; screenshots show the actual result.
- **First-person weapons:** gunmetal PBR materials, pistol side detail, fill/rim viewmodel lights;
  verified in the actual play pose (bottom-right), pistol and rifle.
- Roughness/lighting/shadow tuning throughout; dark horror atmosphere preserved (no exposure/bloom
  blanket raise). Train proportions and station/tunnel geometry rebuilt in 4.x retained.

## P5 — First-15-minutes feel
- Pause menu now shows a compact controls reference (previously only on the main menu).
- Loading tips mix practical survival guidance (pack/batteries/filters, aim/crouch, radiation/mask)
  with the atmospheric lines.
- Opening objective banner + start hint + pickup/fuel/generator/gate hints verified present and
  populated; HUD (objective, health, ammo) confirmed live.

## P6 — Three-category testing
- **A (unit/integration):** `tests/automated-tests.js` — 15/15 pass against a live instance.
- **B (automated simulation):** `tests/e2e-player-path.js` — **12/12 passed**, New Game → Lev →
  gates → tunnel → fuel → generator → facility → breaker → full transmission → read/close log →
  completion → death/restart. Traversal and objectives use movement, aiming, E and menu clicks;
  no teleport or direct mission-progression calls. Shortcuts: god mode, manual frame-stepping,
  synthetic input/mouse deltas, emulated pointer lock, enemy-state/LOS queries for targeting,
  480×270 low-quality render, and a direct damage call for the death check.
- Fixed the simulation route around existing machinery, ammunition-wasting shots at covered
  enemies, the too-distant transmitter approach, and the missing log-reading completion assertion.
- **C (real browser, human): NOT VERIFIED.** A runnable human test checklist is supplied in
  `TEST-RESULTS-5.0.md`; it is not evidence that a human playthrough passed.
- Full results, untested features, and measured performance: `TEST-RESULTS-5.0.md`.

## P7 — Clean release + loading
- Asset loading now overlaps textures, prop models and characters concurrently (was sequential
  per category). No controlled before/after load-time improvement is claimed.
- Release ZIP excludes all `.tmp` dev artifacts (CDP helpers, fixtures, scratch screenshots);
  ships runtime assets, tests, docs and representative screenshots only.

## P8 — Quality gates
- 27 files pass `node --check`; 148 local references resolve; 15/15 integration tests and
  12/12 simulated path stages pass. Real canvas inspection screenshots and a synchronized
  render-only benchmark are included. Human gameplay verification remains an unmet gate.

---

## Known limitations (stated plainly)
- Characters and mutants are **procedural rigs**, not scanned/AAA models. The pipeline is ready for
  redistributable rigged replacements; none are bundled (licence constraints). Not photorealistic.
- Category C (human playthrough) is provided as a runbook; automated verification covers A and B.
- Pointer lock and real OS mouse input cannot be exercised in the headless inspection environment;
  the playthrough emulates engaged lock and feeds mouse deltas at the input layer.

## Attribution
- Prop models & textures: Poly Haven (CC0), bundled under `assets/`. See `assets/ATTRIBUTION.md`.
- Three.js r170 (MIT), vendored under `vendor/`.
- Original story, level design, procedural characters/rigs and code: this fan project.
- Not affiliated with Dmitry Glukhovsky or 4A Games. Metro is a trademark of its respective owners.