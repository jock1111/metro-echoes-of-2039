# METRO: ECHOES OF 2039 — Update 6.0 "Real 3D assets, visual rebuild & animation integration"

Built directly on the v5.0 codebase (same engine, same files, no rebuild). Every claim below is
backed by a live-page test run or a captured in-game screenshot; gates that are not met are
marked incomplete.

## 1. Real rigged character: Lev (quality gate — MET)

- `assets/characters/lev.glb` — a genuine skinned, rigged humanoid (19 joints, 1 skinned mesh),
  derived from **CesiumMan © 2017 Cesium, CC-BY 4.0** (Khronos glTF Sample Assets). Source URL,
  author, license and modification list: `assets/ATTRIBUTION.md`. Unmodified source kept at
  `assets/characters/cesium_man.glb`.
- Clips: `Walk` (the asset's own cycle), `Run` (same cycle ×0.6 time), `Idle` and `Death`
  (**original keyframes authored on the real skeleton** by `tools/build-lev-glb.mjs`; the standing
  base is sampled from the walk cycle's double-support frame via forward kinematics).
- `assets/manifest.json` `characters.lev` now populated (boneMap, clipMap, rotationY, height,
  surface). When the asset is present the procedural mannequin is **not** used.
- In-game material: original procedural worn-fatigues canvas texture (`survivorSurface`), not the
  asset's branded texture.
- Verified live: `animator.native === true`, idle weight 1.0, head/limb bones move under
  `update()`, root stays pinned at the shelter; screenshots `screenshots/v6/final_lev.png`,
  `final_lev_close.png`, `final_lev_walk.png` (mid-stride), `final_lev_death.png` (collapse).
- Orientation/grounding verified numerically (ankle heights ≈0.19 m both feet, knee-forward and
  elbow-back vectors agree on facing; `rotationY` set from that measurement).

## 2. Native animation validation & freeze-bug fix (MET)

- `js/core/assets.js` `cloneRig`: per-instance skeleton, cloned boneInverses, hierarchy checks;
  rejects instead of half-binding.
- `js/world/characters.js` `validateCharacterRig`: 17 required joints, unique bone matches,
  required clips per role, track sanitising (bone-TRR only, UUID rebinding, root-motion pinning
  with CUBICSPLINE awareness, dead-clip rejection).
- `js/ai/animation.js`: usability gate; a glTF rig without a usable idle is **disabled**, never
  posed with procedural clips; procedural rigs with empty `nativeClips` still animate; explicit
  weight-normalised cross-fades; `finished` handling for one-shots.
- `js/world/level.js`: NPC loop skips procedural gesture code for native rigs.
- Regression suite `tests/character-assets.js` (C1–C8): **8/8 pass**, including two independent
  instances, root-motion pinning, broken-rig rejection, fallback paths, disabled-gate behaviour.

## 3. Mutant redesign (MET with disclosure — procedural, not rigged)

No redistributable rigged creature could be sourced offline (see ATTRIBUTION). The mutant is an
**original procedural redesign**: posture group above the animated spine (hunch can no longer be
cancelled by baked clips), shoulder yoke, elongated clawed arms, digitigrade legs, mottled sickly
skin canvas texture, elongated skull with deep jaw/brow and sunken glowing eyes. Joint contract
unchanged, so all existing mutant animation/AI tests still pass. Screenshot:
`screenshots/v6/final_mutant.png` (3/4 view showing the hunched silhouette).

## 4. Lev shelter rebuild (MET)

Corrugated canopy on wood posts/beams, painted concrete back panel with jagged outline, plaster
patch, `СВЯЗЬ / 04` sign, folded curtain, cable runs, power box, shelf stock, table radio/lantern,
chair, lockers; tile wainscot on station walls. Local lighting: warm key spot (shadow-casting),
lantern point, cool tube fill. Screenshot: `final_lev.png`, `final_lev_close.png`.

## 5. Rifle & hands (MET)

`js/combat/weapons.js` rebuilt: pressed receiver with ejection port, rolled top cover, tapered
wood stock, curved ribbed magazine, forged trigger guard, stepped barrel/gas tube/vented
fore-end, anatomical hands with sleeves. Reload/recoil/ADS contracts preserved
(`muzzle`, `magMesh`, `handL.base`, `bolt`, `slide`); tests 4/14/15 pass. Screenshot:
`final_rifle.png`, `final_pistol.png`.

## 6. Local lighting (MET)

Task spots/lamps added in tunnel, generator room, facility, K-12 control; station wall tiles.
No global exposure change (`toneMappingExposure` stays 0.92). Screenshots: `final_tunnel.png`,
`final_generator.png`, `final_facility.png`, `final_control.png`, `final_station.png`.

## 7. Testing (31/31 automated pass on the final build)

- `tests/automated-tests.js` — 15/15 (includes full mission flow, death/restart, save/load,
  graphics settings, animation/AI sync).
- `tests/character-assets.js` — 8/8 (new).
- `tests/combat-obstruction.js` — 8/8 (gunfire LOS + mutant melee through doors/cover).
- Details, categories and the human-input runbook: `TEST-RESULTS-6.0.md`.

## 8. Before/after evidence

`screenshots/v5/final_*.png` (preserved v5 baselines) vs `screenshots/v6/final_*.png`
(matched cameras: lev, lev_close, station, tunnel, generator, facility, control, mutant, pistol,
rifle) plus v6-only animation evidence (lev_walk, lev_death).

## 9. Incomplete / disclosed limitations

- **Human-input playthrough gate: INCOMPLETE.** Automated suites drive the game through its own
  update loop; a real keyboard/mouse acceptance run is still owed (runbook in TEST-RESULTS-6.0.md).
- Lev is a stylized humanoid (CesiumMan proportions), not a photoreal survivor; no facial clips;
  optional talk/aim/reload clips absent for the native rig (NPC dialogue plays idle).
- Borya, scavenger and mutant remain procedural (disclosed above).
- Performance figures were measured in the automated in-app browser with manually driven frames,
  not on real gameplay hardware.