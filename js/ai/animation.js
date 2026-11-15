// Character animation (Update 5.0). Every state is a real THREE.AnimationClip played through
// an AnimationMixer — nothing here is a per-frame procedural rotation dressed up as a clip.
//   * locomotion (idle / walk / run): full baked quaternion clips, cross-faded and speed-paced.
//   * sustained combat postures (aim / reload / duck / talk): additive clips layered over
//     locomotion, weight driven by AI state.
//   * impulses (shoot / hit / mutant attack): additive one-shot clips, triggered by game events.
//   * death: a full one-shot clip (hips drop + topple) that clamps on the final pose.
// A rigged glTF character can supply its own clips via root.userData.nativeClips; the animator
// then plays those instead (replacement-ready pipeline, see core/assets.js + world/characters.js).
import * as THREE from 'three';

const E = new THREE.Euler();
const Q = new THREE.Quaternion();

// Bake a pose function into an AnimationClip. A joint value is either [rx,ry,rz] (rotation only)
// or { r:[rx,ry,rz], p:[x,y,z] } (rotation + local position). Position tracks are emitted only
// for joints that actually use them, so the rest pose keeps its authored offsets everywhere else.
function bakeClip(name, dur, fps, joints, poseFn) {
  const steps = Math.max(2, Math.round(dur * fps));
  const times = new Array(steps + 1);
  const qv = {}, pv = {}, hasP = {};
  for (const j of joints) { qv[j] = []; pv[j] = []; hasP[j] = false; }
  for (let i = 0; i <= steps; i++) {
    times[i] = (i / steps) * dur;
    const pose = poseFn(i / steps); // phase 0..1
    for (const j of joints) {
      const v = pose[j];
      let r = [0, 0, 0], p = null;
      if (v && !Array.isArray(v)) { r = v.r || [0, 0, 0]; p = v.p || null; }
      else if (v) r = v;
      E.set(r[0], r[1], r[2]);
      Q.setFromEuler(E);
      qv[j].push(Q.x, Q.y, Q.z, Q.w);
      if (p) { hasP[j] = true; pv[j].push(p[0], p[1], p[2]); }
      else pv[j].push(0, 0, 0);
    }
  }
  const tracks = [];
  for (const j of joints) {
    tracks.push(new THREE.QuaternionKeyframeTrack(j + '.quaternion', times, qv[j]));
    if (hasP[j]) tracks.push(new THREE.VectorKeyframeTrack(j + '.position', times, pv[j]));
  }
  return new THREE.AnimationClip(name, dur, tracks);
}

const TAU = Math.PI * 2;
const sin = p => Math.sin(p * TAU);
const cos = p => Math.cos(p * TAU);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const bump = p => Math.sin(clamp01(p) * Math.PI);          // 0 → 1 → 0 impulse envelope
const easeOut = x => { const c = clamp01(x); return 1 - (1 - c) * (1 - c); };

// ---------------------------------------------------------------- human poses
const HUMAN_JOINTS = ['hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];

function humanIdle(p) {
  const b = sin(p); // one breath per cycle
  return {
    spine: [0.02 + b * 0.015, 0, 0],
    chest: [b * 0.01, 0, 0],
    head: [0.02 - b * 0.01, sin(p * 0.5) * 0.06, 0],
    shoulderL: [0.04 + b * 0.02, 0, 0.06],
    shoulderR: [0.04 + b * 0.02, 0, -0.06],
    elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0],
    hipL: [0, 0, 0.02], hipR: [0, 0, -0.02],
    kneeL: [0.04, 0, 0], kneeR: [0.04, 0, 0],
  };
}
function humanWalk(p) {
  const s = sin(p), c = cos(p);
  return {
    hips: [0, s * 0.06, 0],
    spine: [0.06, -s * 0.05, 0],
    head: [-0.04, s * 0.03, 0],
    shoulderL: [-s * 0.35, 0, 0.05], shoulderR: [s * 0.35, 0, -0.05],
    elbowL: [-0.25 - Math.max(0, s) * 0.2, 0, 0], elbowR: [-0.25 - Math.max(0, -s) * 0.2, 0, 0],
    hipL: [s * 0.5, 0, 0], hipR: [-s * 0.5, 0, 0],
    kneeL: [Math.max(0, -s) * 0.7 + 0.08, 0, 0], kneeR: [Math.max(0, s) * 0.7 + 0.08, 0, 0],
    ankleL: [-s * 0.2, 0, 0], ankleR: [s * 0.2, 0, 0],
  };
}
function humanRun(p) {
  const s = sin(p);
  return {
    hips: [0.05, s * 0.08, 0],
    spine: [0.18, -s * 0.07, 0],
    chest: [0.06, 0, 0],
    head: [-0.12, s * 0.04, 0],
    shoulderL: [-s * 0.6, 0, 0.08], shoulderR: [s * 0.6, 0, -0.08],
    elbowL: [-0.9 - Math.max(0, s) * 0.3, 0, 0], elbowR: [-0.9 - Math.max(0, -s) * 0.3, 0, 0],
    hipL: [s * 0.85, 0, 0], hipR: [-s * 0.85, 0, 0],
    kneeL: [Math.max(0, -s) * 1.2 + 0.15, 0, 0], kneeR: [Math.max(0, s) * 1.2 + 0.15, 0, 0],
    ankleL: [-s * 0.3, 0, 0], ankleR: [s * 0.3, 0, 0],
  };
}
// sustained rifle aim: weapon shoulder raised, support arm across, head level
function humanAim() {
  return {
    shoulderR: [-1.25, 0, -0.10], elbowR: [-0.25, 0, 0],
    shoulderL: [-1.05, 0.35, 0.15], elbowL: [-0.55, 0, 0],
    head: [-0.06, 0, 0], chest: [0.02, 0, 0],
  };
}
// support hand drops to the mag well, head dips to watch the reload
function humanReload() {
  return {
    shoulderL: [0.5, -0.2, 0], elbowL: [-0.9, 0, 0],
    head: [0.25, 0, 0], spine: [0.06, 0, 0],
  };
}
// fold into cover
function humanDuck() {
  return {
    spine: [0.30, 0, 0], head: [-0.20, 0, 0],
    hipL: [0.2, 0, 0], hipR: [0.2, 0, 0],
    kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0],
  };
}
function humanTalk(p) {
  return {
    head: [0, sin(p) * 0.18, 0],
    shoulderR: [-0.3 + sin(p * 1.3) * 0.12, 0, 0],
    elbowR: [-0.5, 0, 0],
  };
}
// recoil impulse: shoulder kicks back, chest absorbs, head snaps up
function humanShoot(p) {
  const k = bump(p);
  return {
    shoulderR: [0.14 * k, 0, 0], elbowR: [0.06 * k, 0, 0],
    chest: [-0.05 * k, 0, 0], head: [0.04 * k, 0, 0],
  };
}
// flinch: torso recoils away from the hit
function humanHit(p) {
  const k = bump(p);
  return {
    spine: [-0.20 * k, 0, 0.05 * k], head: [-0.14 * k, 0, 0],
    shoulderR: [0.12 * k, 0, 0], shoulderL: [0.10 * k, 0, 0],
  };
}
// collapse: hips drop and rotate, spine folds, limbs go limp, ends flat on the ground
function humanDeath(p) {
  const k = Math.min(1, p * 1.4);
  const e = 1 - (1 - k) * (1 - k);
  return {
    hips: { r: [0.5 * e, 0, 0.9 * e], p: [0, 0.95 - 0.62 * e, 0] },
    spine: [0.7 * e, 0, 0.2 * e], chest: [0.4 * e, 0, 0],
    head: [0.5 * e, 0.3 * e, 0],
    shoulderL: [0.4 * e, 0, 0.5 * e], shoulderR: [-0.3 * e, 0, -0.6 * e],
    elbowL: [0.5 * e, 0, 0], elbowR: [0.4 * e, 0, 0],
    hipL: [0.6 * e, 0, 0.2 * e], hipR: [0.3 * e, 0, -0.2 * e],
    kneeL: [0.9 * e, 0, 0], kneeR: [0.6 * e, 0, 0],
  };
}

// ---------------------------------------------------------------- mutant poses
const MUTANT_JOINTS = HUMAN_JOINTS.concat(['tail0', 'tail1', 'tail2']);

function mutantIdle(p) {
  const b = sin(p);
  return {
    spine: [0.45 + b * 0.03, 0, 0],
    head: [0.1 - b * 0.03, sin(p * 0.5) * 0.15, 0],
    shoulderL: [0.15 + b * 0.03, 0, 0.12], shoulderR: [0.15 + b * 0.03, 0, -0.12],
    elbowL: [-0.25, 0, 0], elbowR: [-0.25, 0, 0],
    hipL: [0.1, 0, 0], hipR: [0.1, 0, 0],
    kneeL: [-0.2, 0, 0], kneeR: [-0.2, 0, 0],
    tail0: [0.5 + b * 0.06, sin(p) * 0.1, 0], tail1: [0.3, sin(p + 0.2) * 0.12, 0], tail2: [0.3, sin(p + 0.4) * 0.14, 0],
  };
}
function mutantWalk(p) {
  const s = sin(p);
  return {
    hips: [0.05, s * 0.08, 0],
    spine: [0.5, -s * 0.06, 0],
    head: [0.15, s * 0.05, 0],
    shoulderL: [-s * 0.4 + 0.1, 0, 0.1], shoulderR: [s * 0.4 + 0.1, 0, -0.1],
    elbowL: [-0.3 - Math.max(0, s) * 0.2, 0, 0], elbowR: [-0.3 - Math.max(0, -s) * 0.2, 0, 0],
    hipL: [s * 0.55 + 0.1, 0, 0], hipR: [-s * 0.55 + 0.1, 0, 0],
    kneeL: [-Math.max(0, -s) * 0.7 - 0.15, 0, 0], kneeR: [-Math.max(0, s) * 0.7 - 0.15, 0, 0],
    ankleL: [s * 0.25, 0, 0], ankleR: [-s * 0.25, 0, 0],
    tail0: [0.5, s * 0.12, 0], tail1: [0.3, s * 0.15, 0], tail2: [0.3, s * 0.18, 0],
  };
}
function mutantRun(p) {
  const s = sin(p);
  return {
    hips: [0.1, s * 0.1, 0],
    spine: [0.62, -s * 0.08, 0],
    chest: [0.1, 0, 0],
    head: [0.2, s * 0.05, 0],
    shoulderL: [-s * 0.7 + 0.2, 0, 0.12], shoulderR: [s * 0.7 + 0.2, 0, -0.12],
    elbowL: [-0.5 - Math.max(0, s) * 0.3, 0, 0], elbowR: [-0.5 - Math.max(0, -s) * 0.3, 0, 0],
    hipL: [s * 0.9 + 0.15, 0, 0], hipR: [-s * 0.9 + 0.15, 0, 0],
    kneeL: [-Math.max(0, -s) * 1.1 - 0.2, 0, 0], kneeR: [-Math.max(0, s) * 1.1 - 0.2, 0, 0],
    ankleL: [s * 0.35, 0, 0], ankleR: [-s * 0.35, 0, 0],
    tail0: [0.6, s * 0.15, 0], tail1: [0.35, s * 0.18, 0], tail2: [0.35, s * 0.2, 0],
  };
}
// claw swipe: coil arms back (windup), throw forward (impact), recover. Continuous, zero at ends.
// The forward peak lands at phase 0.6 ≈ 0.32 s, matching the AI windup→strike timing.
function mutantAttack(p) {
  let coil, throwK;
  if (p < 0.4) { coil = easeOut(p / 0.4); throwK = 0; }
  else if (p < 0.6) { const s = (p - 0.4) / 0.2; coil = 1 - s; throwK = s; }
  else { const r = (p - 0.6) / 0.4; coil = 0; throwK = 1 - r; }
  const shoulder = -2.0 * coil + 0.9 * throwK;
  const elbow = -0.6 * coil - 0.2 * throwK;
  const spine = -0.18 * coil + 0.35 * throwK;
  const head = -0.3 * coil + 0.25 * throwK;
  const splay = 0.3 * coil + 0.2 * throwK;
  return {
    shoulderL: [shoulder, 0, splay], shoulderR: [shoulder, 0, -splay],
    elbowL: [elbow, 0, 0], elbowR: [elbow, 0, 0],
    spine: [spine, 0, 0], head: [head, 0, 0],
  };
}
function mutantHit(p) {
  const k = bump(p);
  return {
    spine: [-0.25 * k, 0, 0.06 * k], head: [-0.2 * k, 0, 0],
    shoulderL: [0.2 * k, 0, 0], shoulderR: [0.2 * k, 0, 0],
  };
}
function mutantDeath(p) {
  const k = Math.min(1, p * 1.4);
  const e = 1 - (1 - k) * (1 - k);
  return {
    hips: { r: [0.3 * e, 0, 1.3 * e], p: [0, 0.86 - 0.55 * e, 0.06] },
    spine: [0.5 * e, 0, 0.3 * e], chest: [0.3 * e, 0, 0],
    head: [0.4 * e, 0.4 * e, 0],
    shoulderL: [0.5 * e, 0, 0.6 * e], shoulderR: [-0.4 * e, 0, -0.7 * e],
    elbowL: [0.4 * e, 0, 0], elbowR: [0.5 * e, 0, 0],
    hipL: [0.5 * e, 0, 0.2 * e], hipR: [0.4 * e, 0, -0.2 * e],
    kneeL: [-0.7 * e, 0, 0], kneeR: [-0.5 * e, 0, 0],
    tail0: [0.3 * e, 0.4 * e, 0], tail1: [0.2 * e, 0.5 * e, 0], tail2: [0.2 * e, 0.6 * e, 0],
  };
}

const CLIP_CACHE = {};
function clipsFor(kind) {
  if (CLIP_CACHE[kind]) return CLIP_CACHE[kind];
  const mutant = kind === 'mutant';
  const joints = mutant ? MUTANT_JOINTS : HUMAN_JOINTS;
  // identity rest pose: additive clips are made relative to this, so their offsets are the
  // pose itself and layer cleanly on top of whatever locomotion is playing.
  const rest = bakeClip('rest', 0.1, 1, joints, () => ({}));
  const additive = (name, dur, fps, fn) =>
    THREE.AnimationUtils.makeClipAdditive(bakeClip(name, dur, fps, joints, fn), 0, rest);
  const loco = mutant
    ? { idle: mutantIdle, walk: mutantWalk, run: mutantRun, idleDur: 3.2, walkDur: 0.9, runDur: 0.55 }
    : { idle: humanIdle, walk: humanWalk, run: humanRun, idleDur: 4.0, walkDur: 0.8, runDur: 0.5 };
  const clips = {
    idle: bakeClip('idle', loco.idleDur, 12, joints, loco.idle),
    walk: bakeClip('walk', loco.walkDur, 16, joints, loco.walk),
    run: bakeClip('run', loco.runDur, 16, joints, loco.run),
    hit: additive('hit', 0.26, 20, mutant ? mutantHit : humanHit),
    death: bakeClip('death', 0.9, 20, joints, mutant ? mutantDeath : humanDeath),
  };
  if (mutant) {
    clips.attack = additive('attack', 0.54, 24, mutantAttack);
  } else {
    clips.aim = additive('aim', 0.4, 12, humanAim);
    clips.reload = additive('reload', 0.4, 12, humanReload);
    clips.duck = additive('duck', 0.4, 12, humanDuck);
    clips.talk = additive('talk', 2.4, 12, humanTalk);
    clips.shoot = additive('shoot', 0.18, 24, humanShoot);
  }
  CLIP_CACHE[kind] = clips;
  return clips;
}

const ONESHOT = { death: 1, hit: 1, shoot: 1, attack: 1 };

// ---------------------------------------------------------------- animator
export class CharacterAnimator {
  constructor(root) {
    this.root = root;
    this.kind = root.userData.animKind || 'human';
    this.parts = root.userData.parts;
    this.mixer = new THREE.AnimationMixer(root.userData.animationRoot || root);
    this.disabled = false;
    this.dead = false;
    this.current = 'idle';
    this.t = Math.random() * 10;
    this.actions = {};
    this.additive = {};
    this.oneshot = {};
    this._shootHeld = false;
    this._oneShot = null;

    const native = root.userData.nativeClips;
    const usable = clip => clip && Number.isFinite(clip.duration) && clip.duration > 0 &&
      Array.isArray(clip.tracks) && clip.tracks.some(t => t.times?.length >= 2 && t.values?.length > 0);
    const gltf = root.userData.isGLBCharacter || root.userData.glTFClips;
    if (usable(native?.idle) && (!gltf || root.userData.animationRoot)) {
      // These clips have been bound/sanitized by the character pipeline. Native states replace
      // the full body; weights are normalized explicitly, including interrupted cross-fades.
      this.native = true;
      for (const k in native) {
        const clip = native[k];
        if (!usable(clip)) continue;
        const a = this.mixer.clipAction(clip);
        a.blendMode = THREE.NormalAnimationBlendMode;
        if (ONESHOT[k]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.setEffectiveWeight(0);
        this.actions[k] = a;
      }
      this.actions.idle.setEffectiveWeight(1); this.actions.idle.play();
      this.mixer.addEventListener('finished', e => {
        if (this._oneShot && e.action === this.actions[this._oneShot.name]) this._nativeFinished = e.action;
      });
      return;
    }

    this.native = false;
    // Empty native metadata on a procedural rig is harmless. An unvalidated glTF, however,
    // must never receive the baked procedural poses (different bind axes/rest offsets).
    if (gltf) {
      this.disabled = true;
      console.warn('[character animation] rejected glTF without usable native idle/visual rig');
      return;
    }
    const clips = clipsFor(this.kind);
    for (const k of ['idle', 'walk', 'run']) {
      const a = this.mixer.clipAction(clips[k]);
      a.play();
      this.actions[k] = a;
    }
    this.actions.idle.setEffectiveWeight(1);
    this.actions.walk.setEffectiveWeight(0);
    this.actions.run.setEffectiveWeight(0);

    // sustained additive postures (human only; the mutant has no rifle / dialogue)
    this.w = { aim: 0, reload: 0, duck: 0, talk: 0 };
    if (this.kind === 'human') {
      for (const k of ['aim', 'reload', 'duck', 'talk']) {
        const a = this.mixer.clipAction(clips[k]);
        a.blendMode = THREE.AdditiveAnimationBlendMode;
        a.setEffectiveWeight(0);
        a.play();
        this.additive[k] = a;
      }
    }
    // event-driven one-shots
    const mkOne = (k, isAdditive) => {
      const a = this.mixer.clipAction(clips[k]);
      if (isAdditive) a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = !isAdditive; // additive impulses return to zero; death holds its pose
      a.setEffectiveWeight(0);
      this.oneshot[k] = a;
    };
    mkOne('hit', true);
    mkOne('death', false);
    if (this.kind === 'mutant') mkOne('attack', true);
    else mkOne('shoot', true);
  }

  _transitionNative(name, duration = 0.22, restart = false) {
    const to = this.actions[name];
    if (!to) return;
    const weights = {};
    for (const k in this.actions) weights[k] = this.actions[k].getEffectiveWeight();
    if (restart || !to.isRunning()) to.reset();
    to.enabled = true; to.setEffectiveTimeScale(1); to.setEffectiveWeight(weights[name]); to.play();
    this._nativeBlend = { name, duration, elapsed: 0, weights };
  }

  _blendNative(dt) {
    const blend = this._nativeBlend;
    if (!blend) return;
    blend.elapsed += dt;
    const t = Math.min(1, blend.elapsed / blend.duration);
    for (const k in this.actions) {
      const a = this.actions[k];
      const target = k === blend.name ? 1 : 0;
      const weight = blend.weights[k] + (target - blend.weights[k]) * t;
      a.setEffectiveWeight(weight);
      if (t === 1 && !target) { a.stop(); a.setEffectiveWeight(0); }
    }
    if (t === 1) this._nativeBlend = null;
  }

  setLocomotion(name) {
    if (this.disabled || this.dead || name === this.current) return;
    const to = this.actions[name];
    if (!to) return;
    if (this.native) {
      this.current = name;
      if (!this._oneShot) this._transitionNative(name);
      return;
    }
    const from = this.actions[this.current];
    to.enabled = true; to.setEffectiveTimeScale(1); to.setEffectiveWeight(1);
    to.play(); // activate the incoming clip (native mode starts only idle); no-op if already active
    if (from && from !== to) from.crossFadeTo(to, 0.22, false);
    else to.fadeIn(0.22);
    this.current = name;
  }

  // Fire an event clip: 'hit', 'shoot', 'attack' (impulses) or 'death' (terminal).
  trigger(name) {
    if (this.disabled || this.dead) return;
    if (name === 'death') {
      this.dead = true;
      if (this.native) {
        if (this.actions.death) {
          this._oneShot = { name };
          this._transitionNative(name, 0.12, true);
        }
        return;
      }
      for (const k in this.actions) this.actions[k].fadeOut(0.25);
      for (const k in this.additive) this.additive[k].setEffectiveWeight(0);
      for (const k in this.oneshot) if (k !== 'death') this.oneshot[k].stop();
      const a = this.oneshot.death;
      a.reset(); a.setEffectiveWeight(1); a.fadeIn(0.12); a.play();
      return;
    }
    if (this.native) {
      if (!ONESHOT[name] || !this.actions[name]) return;
      this._oneShot = { name };
      this._transitionNative(name, 0.08, true);
      return;
    }
    const a = this.oneshot[name];
    if (!a) return;
    a.reset(); a.setEffectiveWeight(1); a.play();
  }

  // Snap straight to the final death pose (used when restoring a saved corpse).
  finishDeath() {
    if (this.disabled) return;
    this.dead = true;
    const a = this.native ? this.actions.death : this.oneshot.death;
    if (this.native) {
      this._nativeBlend = null;
      this._nativeFinished = null;
      this._oneShot = null;
      for (const k in this.actions) { this.actions[k].stop(); this.actions[k].setEffectiveWeight(0); }
    } else {
      for (const k in this.actions) this.actions[k].stop();
      for (const k in this.additive) this.additive[k].setEffectiveWeight(0);
      for (const k in this.oneshot) if (k !== 'death') this.oneshot[k].stop();
    }
    if (a) { a.reset(); a.setEffectiveWeight(1); a.time = a.getClip().duration; a.play(); a.paused = true; }
    this.mixer.update(0);
  }

  // ctx: { speed, combat, reload, talk, duck, shoot }
  update(dt, ctx = {}) {
    if (this.disabled) return;
    this.t += dt;
    if (this.native) {
      const speed = ctx.speed || 0;
      if (!this.dead) {
        let want = 'idle';
        if (ctx.reload && this.actions.reload) want = 'reload';
        else if (ctx.duck && this.actions.duck) want = 'duck';
        else if ((ctx.combat || ctx.aim) && this.actions.aim) want = 'aim';
        else if (ctx.talk && this.actions.talk) want = 'talk';
        else if (speed > 3.2 && this.actions.run) want = 'run';
        else if (speed > 0.25 && this.actions.walk) want = 'walk';
        this.setLocomotion(want);
        const shoot = !!ctx.shoot;
        if (shoot && !this._shootHeld) this.trigger('shoot');
        this._shootHeld = shoot;
        if (!this._oneShot && (want === 'walk' || want === 'run')) {
          this.actions[want].setEffectiveTimeScale(Math.max(0.4, speed / (want === 'run' ? 5 : 2)));
        }
      }
      this._blendNative(dt);
      this.mixer.update(dt);
      // Use the mixer's finish event, not a wall-clock timer: action time scales may differ.
      // Clamp the outgoing pose until the recovery cross-fade, avoiding a frame of bind pose.
      if (this._oneShot && !this.dead && this._nativeFinished === this.actions[this._oneShot.name]) {
        this._oneShot = null;
        this._transitionNative(this.current, 0.12);
      }
      this._nativeFinished = null;
      return;
    }
    if (this.dead) { this.mixer.update(dt); return; }

    const speed = ctx.speed || 0;
    this.setLocomotion(speed > 3.2 ? 'run' : speed > 0.25 ? 'walk' : 'idle');
    // pace the cycle to actual ground speed so feet don't slide
    const clip = this.current;
    const ref = clip === 'run' ? 5.0 : clip === 'walk' ? 2.0 : 1;
    this.actions[clip].setEffectiveTimeScale(clip === 'idle' ? 1 : Math.max(0.4, speed / ref));

    if (this.kind === 'human') {
      const w = this.w;
      const target = {
        aim: ctx.combat ? 1 : 0,
        reload: ctx.reload ? 1 : 0,
        duck: ctx.duck || 0,
        talk: ctx.talk ? 1 : 0,
      };
      for (const k in w) {
        w[k] += (target[k] - w[k]) * Math.min(1, dt * 9);
        this.additive[k].setEffectiveWeight(w[k]);
      }
      const shoot = !!ctx.shoot;
      if (shoot && !this._shootHeld) this.trigger('shoot');
      this._shootHeld = shoot;
    }
    this.mixer.update(dt);
  }

  stop() { this.mixer.stopAllAction(); }
}