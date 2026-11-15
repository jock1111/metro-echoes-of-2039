// Character rigs (Update 5.0). A replacement-ready glTF pipeline swaps in redistributable rigged
// models when present (see below); otherwise these original procedural rigs are the fallback —
// capsule bodies, layered clothing/gear, two-bone limbs with named joints for the animation system.
// Human faces +Z; mutant faces -Z. Joint aliases (armLPivot etc.) preserved for legacy code.
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 14, 12);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 8);

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat, x, y, z) { const m = mesh(BOX, mat, x, y, z); m.scale.set(w, h, d); return m; }
function sph(r, mat, x, y, z) { const m = mesh(SPH, mat, x, y, z); m.scale.set(r, r, r); return m; }
// capsule limb: radius r, total length L hanging along -Y from the joint
function limb(r, L, mat, x = 0, y = 0, z = 0) {
  const cyl = Math.max(0.01, L - 2 * r);
  const m = mesh(new THREE.CapsuleGeometry(r, cyl, 4, 10), mat, x, y - L / 2, z);
  return m;
}
function cyl(r, h, mat, x, y, z) { const m = mesh(CYL, mat, x, y, z); m.scale.set(r, h, r); return m; }
function cone(r, h, mat, x, y, z) { const m = mesh(CONE, mat, x, y, z); m.scale.set(r, h, r); return m; }
function joint(name, x, y, z, parent) {
  const j = new THREE.Group(); j.name = name; j.position.set(x, y, z);
  if (parent) parent.add(j);
  return j;
}

// ---------------------------------------------------------------- glTF character pipeline (5.0)
// Set by buildLevel. When a redistributable rigged character is listed in assets/manifest.json
// under `characters`, it replaces the procedural rig for that role; otherwise the procedural
// fallback below is used. v5.0 ships NO high-quality character models — see assets/ATTRIBUTION.md
// for the missing roster and a CC0 sourcing guide. The pipeline is verified end-to-end with a
// rigged fixture so a supplied model drops straight in.
let CHAR_ASSETS = null;
export function setCharacterAssets(a) { CHAR_ASSETS = a; }

// Maps a glTF skeleton + clip set onto the game's joint contract and animation states.
// boneMap: game joint -> glTF bone name; clipMap: game state -> glTF clip name.
// Defaults target a Mixamo-style rig (verified against a 49-bone soldier fixture). A manifest
// entry may override either map via its `boneMap` / `clipMap` fields for other packs.
const MIXAMO_BONES = {
  hips: 'mixamorigHips', spine: 'mixamorigSpine', chest: 'mixamorigSpine1',
  neck: 'mixamorigNeck', head: 'mixamorigHead',
  shoulderL: 'mixamorigLeftArm', elbowL: 'mixamorigLeftForeArm',
  shoulderR: 'mixamorigRightArm', elbowR: 'mixamorigRightForeArm',
  wristL: 'mixamorigLeftHand', wristR: 'mixamorigRightHand',
  hipL: 'mixamorigLeftUpLeg', kneeL: 'mixamorigLeftLeg', ankleL: 'mixamorigLeftFoot',
  hipR: 'mixamorigRightUpLeg', kneeR: 'mixamorigRightLeg', ankleR: 'mixamorigRightFoot',
};
const HUMAN_CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death' };
const CHARACTER_DEFS = {
  lev: { asset: 'lev', height: 1.8, boneMap: MIXAMO_BONES, clipMap: HUMAN_CLIPS },
  borya: { asset: 'borya', height: 1.8, boneMap: MIXAMO_BONES, clipMap: HUMAN_CLIPS },
  scavenger: { asset: 'scavenger', height: 1.8, boneMap: MIXAMO_BONES, clipMap: HUMAN_CLIPS },
  mutant: { asset: 'mutant', height: 1.5, boneMap: MIXAMO_BONES, clipMap: { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Attack', death: 'Death' } },
};

const REQUIRED_JOINTS = Object.keys(MIXAMO_BONES);
const HUMAN_STATES = ['idle', 'walk', 'run', 'death', 'aim', 'reload', 'duck', 'talk', 'shoot', 'hit'];
const MUTANT_STATES = ['idle', 'walk', 'run', 'attack', 'death', 'hit'];

function hasMotion(track) {
  const cubic = !!track.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline;
  const stride = track.getValueSize(), size = stride / (cubic ? 3 : 1);
  const offset = cubic ? size : 0;
  for (let i = 0; i < track.times.length; i++) {
    for (let j = 0; j < size; j++) {
      if (Math.abs(track.values[i * stride + offset + j] - track.values[offset + j]) > 1e-6) return true;
      if (cubic && (Math.abs(track.values[i * stride + j]) > 1e-6 ||
        Math.abs(track.values[i * stride + 2 * size + j]) > 1e-6)) return true;
    }
  }
  return false;
}

// Only bone TRS tracks may survive. Resolve and rewrite bindings to cloned bone UUIDs so neither
// ambiguous names nor '.position'/scene-root tracks can reach gameplay or normalization Groups.
function nativeClip(clip, g, skinBones, hips, filtered) {
  if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || !Array.isArray(clip.tracks)) return null;
  const root = g.userData.animationRoot;
  const rootBones = new Set();
  for (let b = hips; b && b !== root; b = b.parent) rootBones.add(b);
  const tracks = [];
  for (const original of clip.tracks) {
    try {
      const path = THREE.PropertyBinding.parseTrackName(original.name);
      let bone = THREE.PropertyBinding.findNode(root, g.userData.sourceNodeUUIDs?.[path.nodeName] || path.nodeName);
      if (path.objectName === 'bones') {
        const bones = bone?.skeleton?.bones || [];
        bone = bones.find(b => b.name === path.objectIndex) || bones[Number(path.objectIndex)];
      } else if (path.objectName) bone = null;
      const prop = path.propertyName, index = path.propertyIndex;
      const size = prop === 'quaternion' ? 4 : 3;
      const component = index !== undefined;
      const cubic = !!original.createInterpolant?.isInterpolantFactoryMethodGLTFCubicSpline;
      if (!skinBones.has(bone) || bone === root || !['position', 'quaternion', 'scale'].includes(prop) ||
        (component && (prop === 'quaternion' || !['x', 'y', 'z'].includes(index))) ||
        original.ValueTypeName !== (component ? 'number' : prop === 'quaternion' ? 'quaternion' : 'vector') ||
        original.getValueSize() !== (component ? 1 : size) * (cubic ? 3 : 1) ||
        original.times.length < 2 || !original.values.every(Number.isFinite) ||
        !original.times.every((t, i, ts) => Number.isFinite(t) && t >= 0 && (!i || t > ts[i - 1])) ||
        original.times[original.times.length - 1] > clip.duration) {
        filtered.count++; continue;
      }
      if (prop === 'position' && rootBones.has(bone) && component && index !== 'y') {
        filtered.count++; continue;
      }
      const track = original.clone();
      track.name = `${bone.uuid}.${prop}${component ? `[${index}]` : ''}`;
      if (prop === 'position' && rootBones.has(bone) && !component) {
        // Pin horizontal hips/root motion to the authored rest position, not the first keyframe.
        // glTF CUBICSPLINE stores in-tangent, value, out-tangent for every key.
        const stride = cubic ? 9 : 3;
        for (let i = 0; i < track.values.length; i += stride) {
          if (cubic) {
            track.values[i] = track.values[i + 2] = track.values[i + 6] = track.values[i + 8] = 0;
          }
          const value = i + (cubic ? 3 : 0);
          track.values[value] = bone.position.x;
          track.values[value + 2] = bone.position.z;
        }
      }
      tracks.push(track);
    } catch { filtered.count++; }
  }
  if (!tracks.some(hasMotion)) return null;
  // Native states are full-body replacements, never the procedural additive poses.
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, THREE.NormalAnimationBlendMode);
}

// Focused validation seam for browser tests and the builder. Missing maps use Mixamo defaults;
// explicit overrides are complete contracts (an empty/partial map must not silently pass).
export function validateCharacterRig(g, role) {
  const def = CHARACTER_DEFS[role];
  const reject = reason => { console.warn(`[character:${role}] fallback: ${reason}`); return null; };
  if (!def || !g?.userData.animationRoot || g.userData.animationRoot === g) return reject('missing visual rig');
  const root = g.userData.animationRoot;
  let ancestor = root.parent;
  while (ancestor && ancestor !== g) ancestor = ancestor.parent;
  if (ancestor !== g) return reject('visual rig is outside gameplay group');
  const meta = g.userData.characterMeta || {};
  const boneMap = meta.boneMap === undefined ? def.boneMap : meta.boneMap;
  const clipMap = meta.clipMap === undefined ? def.clipMap : meta.clipMap;
  if (!boneMap || typeof boneMap !== 'object' || !clipMap || typeof clipMap !== 'object') return reject('invalid bone/clip mapping');
  const nodes = new Set(); root.traverse(o => nodes.add(o));
  const skinBones = new Set();
  let invalidSkeleton = false;
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    if (!o.skeleton?.bones.length) { invalidSkeleton = true; return; }
    for (const b of o.skeleton.bones) {
      if (!b?.isBone || !nodes.has(b)) invalidSkeleton = true;
      skinBones.add(b);
    }
  });
  if (invalidSkeleton || !skinBones.size) return reject('missing or external skeleton bones');
  const parts = {}, missing = [], used = new Set();
  for (const joint of REQUIRED_JOINTS) {
    const name = boneMap[joint];
    const matches = typeof name === 'string' && name ? [...skinBones].filter(b => b.name === name) : [];
    const bone = matches[0];
    if (matches.length !== 1 || used.has(bone) || bone === root) missing.push(joint);
    else { parts[joint] = bone; used.add(bone); }
  }
  if (missing.length) return reject(`missing/ambiguous joints: ${missing.join(', ')}`);
  const states = role === 'mutant' ? MUTANT_STATES : HUMAN_STATES;
  const required = role === 'mutant' ? ['idle', 'walk', 'run', 'attack', 'death'] :
    role === 'scavenger' ? ['idle', 'walk', 'run', 'death'] : ['idle'];
  const raw = g.userData.glTFClips || {}, nativeClips = {}, filtered = { count: 0 };
  for (const state of states) {
    if (typeof clipMap[state] !== 'string' || !clipMap[state]) continue;
    const clip = nativeClip(raw[clipMap[state]], g, skinBones, parts.hips, filtered);
    if (clip) nativeClips[state] = clip;
  }
  const absent = required.filter(state => !nativeClips[state]);
  if (absent.length) return reject(`missing/ineffective required clips: ${absent.join(', ')}`);
  const optional = states.filter(state => !required.includes(state) && !nativeClips[state]);
  if (optional.length) console.warn(`[character:${role}] optional clips unavailable: ${optional.join(', ')}`);
  if (filtered.count) console.warn(`[character:${role}] ignored ${filtered.count} unsafe/unbound animation tracks`);
  return { parts, nativeClips };
}

// Sample assets can carry branding textures; a manifest `surface: "survivor"` entry
// re-dresses the rig in plain worn fatigues so it reads as a Metro resident.
function survivorSurface(g) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#585a49'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 62 + Math.random() * 46;
    x.fillStyle = `rgba(${v | 0},${(v + 2) | 0},${(v - 12) | 0},0.16)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 14; i++) {
    x.fillStyle = `rgba(38,38,30,${0.05 + Math.random() * 0.12})`;
    x.beginPath();
    x.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 6 + Math.random() * 22, Math.random() * 3, 0, 7);
    x.fill();
  }
  x.strokeStyle = 'rgba(30,30,24,0.35)'; x.lineWidth = 1;
  for (let y = 24; y < 256; y += 42) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
  x.strokeStyle = 'rgba(28,28,22,0.3)';
  for (let y = 26; y < 256; y += 42) for (let px = 4; px < 256; px += 8) { x.beginPath(); x.moveTo(px, y); x.lineTo(px + 3, y); x.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0x8f9083, roughness: 0.94, metalness: 0 });
  g.userData.visual.traverse(o => {
    if (!o.isMesh) return;
    o.material = mat;
    o.castShadow = true; o.receiveShadow = true;
  });
}

// Build a rigged glTF character mapped to the game contract, or null for the existing fallback.
// The optional assets argument lets tests exercise failures without changing the live registry.
export function buildGLBCharacter(role, animKind, assets = CHAR_ASSETS) {
  const def = CHARACTER_DEFS[role];
  if (!def || !assets) return null;
  try {
    if (!assets.hasCharacter(def.asset)) return null;
    const g = assets.character(def.asset, { height: def.height });
    if (!g) return null;
    const valid = validateCharacterRig(g, role);
    if (!valid) return null;
    const { parts, nativeClips } = valid;
    if (g.userData.characterMeta?.surface === 'survivor') survivorSurface(g);
    // legacy aliases used by enemies.js (weapon attach) and level.js (NPC gestures)
    parts.armL = parts.shoulderL; parts.armR = parts.shoulderR;
    parts.armLPivot = parts.wristL; parts.armRPivot = parts.wristR;
    parts.legL = parts.hipL; parts.legR = parts.hipR;
    parts.legLPivot = parts.hipL; parts.legRPivot = parts.hipR;
    g.userData.parts = parts;
    g.userData.animKind = animKind;
    g.userData.nativeClips = nativeClips;
    g.userData.isGLBCharacter = true;
    return g;
  } catch (err) {
    console.warn(`[character:${role}] fallback: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------- human
export function buildHuman(M, opts = {}) {
  const role = opts.character || (opts.rig ? 'scavenger' : 'survivor');
  const glb = buildGLBCharacter(role, 'human');
  if (glb) return glb;
  const cloth = opts.cloth || M.cloth;
  const jacket = opts.jacket || M.canvasCloth;
  const pants = opts.pants || M.canvasCloth2;
  const skin = opts.skin || M.flesh;
  const g = new THREE.Group();
  const parts = {};

  const hips = joint('hips', 0, 0.95, 0, g);
  const spine = joint('spine', 0, 0.12, 0, hips);
  const chest = joint('chest', 0, 0.22, 0, spine);
  const neck = joint('neck', 0, 0.26, 0, chest);
  const head = joint('head', 0, 0.10, 0, neck);

  // pelvis + belt
  hips.add(box(0.30, 0.16, 0.20, pants, 0, 0.02, 0));
  hips.add(box(0.32, 0.05, 0.22, M.rubber, 0, 0.10, 0));
  // torso: tapered capsule under an open jacket shell
  const torsoMesh = limb(0.16, 0.46, cloth, 0, 0.24, 0);
  torsoMesh.scale.set(1.2, 1, 0.8);
  spine.add(torsoMesh);
  parts.torso = torsoMesh;
  // jacket body + collar + hem
  chest.add(box(0.36, 0.30, 0.24, jacket, 0, 0.02, 0));
  chest.add(box(0.38, 0.06, 0.26, jacket, 0, 0.16, 0)); // shoulder yoke
  chest.add(box(0.20, 0.06, 0.10, jacket, 0, 0.20, 0.10)); // collar
  chest.add(box(0.34, 0.10, 0.22, jacket, 0, -0.16, 0)); // hem
  // chest rig / straps
  if (opts.rig) {
    chest.add(box(0.30, 0.16, 0.06, M.canvasCloth2, 0, 0.02, -0.14));
    for (let i = 0; i < 3; i++) chest.add(box(0.08, 0.10, 0.05, M.canvasCloth, -0.10 + i * 0.10, -0.02, -0.18));
    chest.add(box(0.05, 0.26, 0.02, M.rubber, -0.10, 0.05, -0.13));
    chest.add(box(0.05, 0.26, 0.02, M.rubber, 0.10, 0.05, -0.13));
    chest.add(box(0.26, 0.10, 0.10, M.canvasCloth, 0, 0.10, 0.15)); // bedroll
  }
  // neck + head
  neck.add(cyl(0.05, 0.08, skin, 0, 0.02, 0));
  const skull = sph(0.105, skin, 0, 0.06, 0);
  skull.scale.set(0.095, 0.115, 0.105);
  head.add(skull);
  // jaw / brow / nose give the face a read at distance
  head.add(box(0.10, 0.05, 0.06, skin, 0, 0.00, 0.06));
  head.add(box(0.11, 0.025, 0.04, skin, 0, 0.09, 0.08));
  head.add(box(0.025, 0.035, 0.03, skin, 0, 0.05, 0.10));
  // headgear
  if (opts.hood) {
    const hood = sph(0.125, jacket, 0, 0.07, -0.01);
    hood.scale.set(0.12, 0.13, 0.12);
    head.add(hood);
    head.add(box(0.16, 0.05, 0.10, jacket, 0, -0.02, -0.06));
  } else {
    const beanie = sph(0.112, opts.hatMat || M.canvasCloth2, 0, 0.10, 0);
    beanie.scale.set(0.105, 0.075, 0.105);
    head.add(beanie);
    head.add(cyl(0.105, 0.03, opts.hatMat || M.canvasCloth2, 0, 0.055, 0));
  }
  parts.head = head;
  // gas mask option
  if (opts.mask) {
    const mask = sph(0.10, M.rubber, 0, 0.045, 0.05);
    mask.scale.set(0.085, 0.095, 0.075);
    head.add(mask);
    head.add(cyl(0.035, 0.06, M.steelDark, 0, -0.01, 0.11));
    head.add(sph(0.028, M.glass, -0.045, 0.075, 0.085));
    head.add(sph(0.028, M.glass, 0.045, 0.075, 0.085));
    parts.mask = mask;
  }

  // arms: shoulder -> elbow -> wrist
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const sh = joint('shoulder' + tag, side * 0.21, 0.16, 0, chest);
    const el = joint('elbow' + tag, 0, -0.26, 0, sh);
    const wr = joint('wrist' + tag, 0, -0.24, 0, el);
    sh.add(sph(0.075, jacket, 0, 0, 0)); // deltoid
    sh.add(limb(0.055, 0.26, jacket, 0, 0, 0));
    el.add(limb(0.048, 0.24, jacket, 0, 0, 0));
    el.add(box(0.07, 0.05, 0.07, M.rubber, 0, -0.20, 0)); // cuff
    const hand = box(0.06, 0.09, 0.04, M.rubber, 0, -0.05, 0);
    wr.add(hand);
    wr.add(box(0.02, 0.05, 0.03, M.rubber, side * 0.035, -0.04, 0.01)); // thumb
    parts['arm' + tag] = sh; parts['arm' + tag + 'Pivot'] = sh; parts['shoulder' + tag] = sh;
    parts['elbow' + tag] = el; parts['wrist' + tag] = wr; parts['hand' + tag] = hand;
  }
  // legs: hip -> knee -> ankle
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const hp = joint('hip' + tag, side * 0.10, 0, 0, hips);
    const kn = joint('knee' + tag, 0, -0.44, 0, hp);
    const an = joint('ankle' + tag, 0, -0.42, 0, kn);
    hp.add(limb(0.075, 0.44, pants, 0, 0, 0));
    kn.add(limb(0.06, 0.42, pants, 0, 0, 0));
    kn.add(box(0.09, 0.06, 0.09, M.rubber, 0, -0.02, 0.02)); // knee pad
    an.add(box(0.10, 0.08, 0.24, M.rubber, 0, -0.04, 0.05)); // boot
    an.add(box(0.10, 0.05, 0.10, M.rubber, 0, -0.02, -0.04)); // heel
    parts['leg' + tag] = hp; parts['leg' + tag + 'Pivot'] = hp;
    parts['knee' + tag] = kn; parts['ankle' + tag] = an;
  }
  parts.hips = hips; parts.spine = spine; parts.chest = chest; parts.neck = neck;
  g.userData.parts = parts;
  g.userData.animKind = 'human';
  return g;
}

// ---------------------------------------------------------------- mutant
export function buildMutant(M) {
  const glb = buildGLBCharacter('mutant', 'mutant');
  if (glb) return glb;
  const skin = M.mutantSkin, flesh = M.mutantFlesh, bone = M.mutantBone;
  const g = new THREE.Group();
  const parts = {};

  const hips = joint('hips', 0, 0.86, 0.06, g);
  // Posture lives above the animated spine so baked clips cannot cancel the hunch.
  const posture = joint('posture', 0, 0, 0, hips);
  posture.rotation.x = 0.5;
  const spine = joint('spine', 0, 0.16, 0.06, posture);
  spine.rotation.x = 0.45; // hunch
  const chest = joint('chest', 0, 0.24, 0.02, spine);
  const neck = joint('neck', 0, 0.20, -0.10, chest);
  const head = joint('head', 0, 0.06, -0.10, neck);

  // gaunt torso + shoulder hump
  const torsoMesh = limb(0.15, 0.6, skin, 0, 0.2, 0);
  torsoMesh.scale.set(1.05, 1, 0.8);
  spine.add(torsoMesh);
  parts.torso = torsoMesh;
  const hump = sph(0.2, skin, 0, 0.16, 0.12);
  hump.scale.set(0.19, 0.15, 0.17);
  chest.add(hump);
  // shoulder yoke blends the arm balls into the torso silhouette
  const yoke = sph(0.2, skin, 0, 0.15, 0.01);
  yoke.scale.set(0.21, 0.075, 0.10);
  yoke.rotation.x = 0.2; chest.add(yoke);
  // rib ridges
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const rib = box(0.02, 0.22, 0.04, flesh, side * 0.19, 0.02 - i * 0.02, -0.02 - i * 0.06);
    rib.rotation.z = side * 0.25; chest.add(rib);
  }
  // spine spikes
  for (let i = 0; i < 5; i++) {
    const sp = cone(0.03, 0.16 - i * 0.02, flesh, 0, 0.10 + i * 0.09, 0.14 - i * 0.03);
    sp.rotation.x = 0.7; spine.add(sp);
  }
  // head: elongated skull, deep jaw, teeth, overhanging brow, sunken eyes (faces -Z)
  const skull = sph(0.14, flesh, 0, 0, 0);
  skull.scale.set(0.115, 0.105, 0.19);
  skull.rotation.z = 0.12;
  head.add(skull);
  const jaw = sph(0.1, skin, 0, -0.075, -0.08);
  jaw.scale.set(0.062, 0.042, 0.10);
  jaw.rotation.z = 0.08;
  head.add(jaw); parts.jaw = jaw;
  for (let i = 0; i < 5; i++) head.add(cone(0.007, 0.05, bone, -0.05 + i * 0.025, -0.105, -0.15));
  const brow = box(0.17, 0.04, 0.09, skin, 0, 0.055, -0.13);
  brow.rotation.x = -0.25; head.add(brow);
  parts.eyeL = sph(0.014, M.eyeGlow, -0.05, 0.015, -0.175);
  parts.eyeR = sph(0.014, M.eyeGlow, 0.05, 0.02, -0.175);
  head.add(parts.eyeL, parts.eyeR);
  parts.head = head;

  // long clawed arms reaching past the knees
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const sh = joint('shoulder' + tag, side * 0.26, 0.14 + (side < 0 ? 0.05 : 0), -0.02, chest);
    const el = joint('elbow' + tag, 0, -0.42, 0, sh);
    const wr = joint('wrist' + tag, 0, -0.40, 0, el);
    const delt = sph(0.09, skin, 0, -0.02, 0);
    delt.scale.set(0.09, 0.07, 0.08); sh.add(delt);
    sh.add(limb(0.055, 0.42, skin, 0, 0, 0));
    el.add(limb(0.045, 0.40, flesh, 0, 0, 0));
    for (let f = -1; f <= 1; f++) {
      const claw = cone(0.014, 0.18, bone, f * 0.035, -0.12, -0.02);
      claw.rotation.x = 0.5; wr.add(claw);
    }
    parts['arm' + tag] = sh; parts['shoulder' + tag] = sh; parts['elbow' + tag] = el; parts['wrist' + tag] = wr;
  }
  // digitigrade legs
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const hp = joint('hip' + tag, side * 0.13, 0, 0.02, hips);
    const kn = joint('knee' + tag, 0, -0.40, 0.06, hp);
    const an = joint('ankle' + tag, 0, -0.38, -0.08, kn);
    hp.add(limb(0.09, 0.40, skin, 0, 0, 0));
    kn.add(limb(0.05, 0.38, flesh, 0, 0, 0));
    an.add(box(0.12, 0.06, 0.26, skin, 0, -0.03, -0.05));
    for (let f = -1; f <= 1; f++) an.add(cone(0.012, 0.08, bone, f * 0.035, -0.04, -0.17));
    parts['leg' + tag] = hp; parts['knee' + tag] = kn; parts['ankle' + tag] = an;
  }
  // tail chain
  let parent = hips;
  for (let i = 0; i < 3; i++) {
    const t = joint('tail' + i, 0, i === 0 ? 0.02 : -0.06, 0.14, parent);
    t.rotation.x = 0.5;
    t.add(limb(0.035 - i * 0.008, 0.2, skin, 0, 0, 0));
    parts['tail' + i] = t; parent = t;
  }
  parts.hips = hips; parts.spine = spine; parts.chest = chest; parts.neck = neck;
  g.userData.parts = parts;
  g.userData.animKind = 'mutant';
  return g;
}