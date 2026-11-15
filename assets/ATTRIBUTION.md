# Asset attribution

All files under `assets/textures/` and `assets/models/` are from **Poly Haven**
(https://polyhaven.com) and licensed **CC0 1.0 Universal (Public Domain Dedication)**.
No attribution is legally required; credit is given here as good practice.

Downloaded at 1K resolution (JPG diffuse / OpenGL normal / roughness; glTF + JPG textures).

## Textures
- cracked_concrete_wall
- concrete_floor_worn_001
- dirty_tiles
- rusty_metal_02
- rusty_painted_metal
- gravel
- weathered_brown_planks
- metal_grate_rusty
- long_white_tiles

## Models
- metal_jerrycan
- old_military_crate
- barrel_03
- vintage_radio_transceiver
- hanging_industrial_lamp
- power_box_01
- metal_toolbox
- wooden_crate_01
- metal_trash_can
- cement_bag
- ammo_box
- modular_industrial_pipes_01

Everything else in the game (procedural textures, geometry, audio) is generated in code.

## Characters — Update 6.0

### Lev — bundled rigged character (CC-BY 4.0, attribution required)

`assets/characters/lev.glb` is derived from **CesiumMan** by **Cesium** (© 2017 Cesium),
from the Khronos glTF Sample Assets collection:

- Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan
- Binary fetched: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb
- License: **Creative Commons Attribution 4.0 International (CC-BY 4.0)** —
  https://creativecommons.org/licenses/by/4.0/
- Unmodified source copy kept at `assets/characters/cesium_man.glb` for license compliance.

Modifications made for this game (documented per CC-BY 4.0 §3(a)(1)(B)):
- Rig and skinned mesh unchanged (19 joints, 1 skinned mesh). The asset's own walk cycle is
  bundled as the `Walk` clip; `Run` is the same cycle time-compressed ×0.6.
- `Idle` and `Death` are **original keyframe clips authored for this project** on the asset's
  skeleton by `tools/build-lev-glb.mjs` (standing pose sampled from the walk cycle's
  double-support frame; breathing sway; forward collapse). They are not Cesium animations.
- The branded Cesium texture is **not used in game**: `js/world/characters.js`
  (`survivorSurface`) replaces the material with an original procedural worn-fatigues canvas
  texture. The source texture remains inside the unmodified `cesium_man.glb` only.
- In-game orientation/scale set via `assets/manifest.json` (`rotationY`, target height 1.8 m).

Credit line for redistribution: *"Lev character rig based on CesiumMan © 2017 Cesium,
CC-BY 4.0, via Khronos glTF Sample Assets; modified (clips, material) for METRO: ECHOES OF 2039."*

### Remaining roles — original procedural rigs (disclosed)

Borya, the hostile scavenger and the tunnel mutant are **original procedural rigs** built in
`js/world/characters.js`: layered clothing and gear (jacket, chest rig, pouches, bedroll, knee
pads, boots), a face with jaw/brow/nose, optional hood/beanie/gas-mask, and named two-bone limbs.
The Update 6.0 mutant is a hunched creature rig (posture group above the animated spine, shoulder
yoke, rib ridges, spine spikes, elongated clawed arms, digitigrade legs, tail, mottled sickly skin
texture, sunken glowing eyes). These are stylized primitive-based figures — **not photorealistic,
not rigged glTF assets** — driven by the baked animation system in `js/ai/animation.js`
(idle/walk/run + additive aim/reload/duck/talk/shoot/hit/attack/death).

| Role | v6.0 status |
|------|-------------|
| `lev` | **bundled rigged glTF (CesiumMan, CC-BY 4.0)** + authored Idle/Run/Death clips |
| `borya` | procedural fallback (no redistributable rigged model bundled) |
| `scavenger` | procedural fallback (no redistributable rigged model bundled) |
| `mutant` | procedural redesign (no redistributable rigged creature bundled) |

### Replacement-ready glTF pipeline (verified)

A genuine pipeline is implemented and verified end-to-end so a redistributable rigged model can
replace any procedural rig with **no code changes**:

- `js/core/assets.js` — `Assets.character(name)` clones a rigged glTF with an **independent,
  re-bound skeleton** (`cloneRig`), rescales it to a target height, and exposes its clips.
- `js/world/characters.js` — `buildGLBCharacter(role)` maps the model's bones and clips onto the
  game's joint contract (`boneMap`) and animation states (`clipMap`), then returns it in place of
  the procedural rig. `js/ai/animation.js` plays the model's **own native clips** (cross-faded
  locomotion + one-shot events) when present.
- Verified against a real 49-bone rigged humanoid fixture: bones map, clips map, height scales,
  locomotion animates the skeleton (foot travels ~0.56 m between walk frames), and two instances
  keep independent skeletons. The fixture was a Mixamo model used **only for local verification**
  and is **not shipped** (see licensing below).

### Missing high-quality models (explicit disclosure)

Borya, the scavenger and the mutant would still benefit from redistributable rigged models;
**none is bundled for those roles** (see table above). Lev is the one bundled rigged character.

**Why the others are not bundled.** A genuine sourcing effort was made:
- **Mixamo** (e.g. Soldier) — royalty-free to *use*, but its license **prohibits redistribution**
  of the raw assets, so it cannot ship in a redistributable ZIP. Used only as a local test fixture.
- **Quaternius** (CC0, redistributable) — the *Universal Base Characters* pack is a rigged humanoid
  in glTF, but downloads are routed through **itch.io** (interactive gate, not automatable here),
  and the base characters ship **without animations** (the *Universal Animation Library* is a
  separate pack requiring retargeting). No appropriate CC0 rigged+animated humanoid could be
  fetched and bundled offline.

### How to drop in a CC0 model (sourcing guide)

1. Obtain a redistributable rigged humanoid GLB (e.g. Quaternius *Universal Base Characters* +
   *Universal Animation Library*, both **CC0**: https://quaternius.com — via itch.io). Retarget the
   animation library onto the character rig in Blender and export a single `.glb` with clips.
2. Place it at `assets/characters/<role>.glb`.
3. Populate the empty `characters` block in `assets/manifest.json`:
   ```json
   "characters": {
     "scavenger": {
       "gltf": "characters/scavenger.glb",
       "boneMap": { "hips": "mixamorigHips", "...": "..." },
       "clipMap": { "idle": "Idle", "walk": "Walk", "run": "Run" }
     }
   }
   ```
   `boneMap`/`clipMap` are optional; the defaults target a Mixamo-style rig. Override them to match
   your model's bone and clip names (e.g. Quaternius' universal rig). The mutant also accepts an
   `attack` clip. No code changes are required — the pipeline picks the model up automatically.

## Vendored Three.js r170 — MIT License

Copyright 2010-2024 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.