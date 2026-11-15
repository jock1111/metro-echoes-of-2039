// Enemies: Tunnel Mutant (melee hunter) & Hostile Scavenger (ranged, cover).
// States: idle / patrol / suspicious / investigate / combat / search / return / dead
import * as THREE from 'three';
import { humanBody, B, C, S } from '../world/props.js';
import { buildMutant as buildMutantRig } from '../world/characters.js';
import { CharacterAnimator } from './animation.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function buildMutant(M) {
  return buildMutantRig(M);
}

function buildScavenger(M) {
  const g = humanBody(M, { cloth: M.canvasCloth2, mask: Math.random() < 0.5, rig: true });
  // rifle in right hand
  const rifle = new THREE.Group();
  rifle.add(B(0.05, 0.07, 0.7, M.steelDark, 0, 0, -0.1));
  rifle.add(B(0.045, 0.09, 0.2, M.wood, 0, -0.02, 0.25));
  rifle.add(B(0.04, 0.12, 0.06, M.wood, 0, -0.08, 0.05));
  rifle.position.set(0, -0.5, -0.15);
  rifle.rotation.x = -0.2;
  g.userData.parts.armRPivot.add(rifle);
  g.userData.rifle = rifle;
  return g;
}

let ENEMY_UID = 0;

export class Enemy {
  constructor(G, spawn) {
    this.G = G;
    this.id = spawn.id;
    this.uid = ENEMY_UID++;
    this.type = spawn.type;
    this.pos = spawn.pos.clone();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.patrol = spawn.patrol.map(p => p.clone());
    this.cover = (spawn.cover || []).map(p => p.clone());
    this.patrolIdx = 0;
    this.state = 'patrol';
    this.stateT = 0;
    this.thinkT = Math.random() * 0.12;
    this.lastKnown = new THREE.Vector3();
    this.investigatePos = new THREE.Vector3();
    this.attackT = 0; this.attackWindup = 0; this.lungeT = 0;
    this.burstLeft = 0; this.burstT = 0; this.shootT = 0; this.reloadT = 0;
    this.burstsFired = 0;
    this.flinchT = 0;
    this.dead = false;
    this.deathT = 0;
    this.walkPhase = 0;
    this.speed2D = 0;
    this.stuckT = 0; this.sidestepT = 0; this.sidestepDir = 1; this.blockedT = 0;
    this.lookYaw = 0;
    this.growlT = 3 + Math.random() * 5;
    this.repositionT = 0;
    this.coverTarget = null;
    this.coverApproachT = 0;

    if (this.type === 'mutant') {
      this.hp = 70; this.maxHp = 70;
      this.speedPatrol = 1.5; this.speedChase = 5.1;
      this.sightRange = 15; this.sightFov = 1.9;
      this.attackRange = 1.9; this.attackDmg = 16;
      this.group = buildMutant(G.materials);
      this.eyeH = 1.35;
    } else {
      this.hp = 90; this.maxHp = 90;
      this.speedPatrol = 2.0; this.speedChase = 3.4;
      this.sightRange = 24; this.sightFov = 1.7;
      this.attackRange = 30; this.attackDmg = 9;
      this.group = buildScavenger(G.materials);
      this.eyeH = 1.6;
    }
    this.group.position.copy(this.pos);
    G.scene.add(this.group);
    this.parts = this.group.userData.parts;
    this.animator = new CharacterAnimator(this.group);
    // physical presence
    this.collider = G.physics.addBoxCenter(this.pos.x, this.pos.y + 0.85, this.pos.z, 0.6, 1.7, 0.6, 'enemy');
    this._eye = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._avoidDir = new THREE.Vector3();
    this.duckK = 0; this.peekT = 0; this.ducking = false;
  }

  eyePos() { return this._eye.set(this.pos.x, this.pos.y + this.eyeH - this.duckK * 0.7, this.pos.z); }

  raycastHit(origin, dir, maxDist) {
    // head & body spheres (drop with the scavenger when it ducks behind cover)
    const drop = this.duckK * 0.6;
    const headC = this._tmp.set(this.pos.x, this.pos.y + (this.type === 'mutant' ? 1.35 : 1.6) - drop, this.pos.z);
    const bodyC = new THREE.Vector3(this.pos.x, this.pos.y + 0.95 - drop, this.pos.z);
    const headR = this.type === 'mutant' ? 0.24 : 0.2;
    const bodyR = 0.45;
    const hitSphere = (c, r) => {
      const oc = c.clone().sub(origin);
      const t = oc.dot(dir);
      if (t < 0 || t > maxDist) return null;
      const d2 = oc.lengthSq() - t * t;
      if (d2 > r * r) return null;
      return t - Math.sqrt(r * r - d2);
    };
    const th = hitSphere(headC, headR);
    const tb = hitSphere(bodyC, bodyR);
    if (th !== null && (tb === null || th < tb)) return { dist: th, head: true };
    if (tb !== null) return { dist: tb, head: false };
    return null;
  }

  hear(pos, radius, type) {
    if (this.dead) return;
    const d = this.pos.distanceTo(pos);
    if (d > radius) return;
    if (this.type === 'mutant' && type === 'shot') {
      this.lastKnown.copy(pos);
      this.setState('combat');
      this.screech();
    } else if (this.state === 'patrol' || this.state === 'idle' || this.state === 'return') {
      this.investigatePos.copy(pos);
      // distant non-gunfire noise: turn and look first, then move in
      if (type !== 'shot' && d > radius * 0.55) this.setState('suspicious');
      else this.setState('investigate');
      if (this.type === 'scavenger' && type === 'shot') this.shout();
    } else if (this.state === 'investigate' || this.state === 'search') {
      this.investigatePos.copy(pos);
      this.lastKnown.copy(pos);
    }
  }

  alertNearby() {
    for (const e of this.G.enemies) {
      if (e === this || e.dead) continue;
      if (e.pos.distanceTo(this.pos) < 14) {
        e.lastKnown.copy(this.lastKnown);
        if (e.state !== 'combat') e.setState('combat');
      }
    }
  }

  setState(s) {
    if (this.state === s || this.dead) return;
    this.state = s; this.stateT = 0;
    if (s === 'combat' && this.type === 'mutant') this.alertNearby();
  }

  screech() { this.G.audio.play('screech', { pos: this.eyePos(), vol: 0.9, pitch: 0.9 + Math.random() * 0.2, verb: 0.5 }); }
  growl() { this.G.audio.play('growl', { pos: this.eyePos(), vol: 0.7, pitch: 0.85 + Math.random() * 0.3, verb: 0.4 }); }
  shout() {
    this.G.audio.play('shout', { pos: this.eyePos(), vol: 0.85, pitch: 0.9 + Math.random() * 0.2, verb: 0.4 });
    const lines = ['Contact! I see him!', 'There! By the machines!', 'He\'s here — flush him out!'];
    this.G.ui.subtitle('Scavenger', lines[Math.random() * lines.length | 0], 2.2);
  }

  canSeePlayer() {
    const p = this.G.player;
    if (p.dead) return false;
    const d = this.pos.distanceTo(p.pos);
    let range = this.sightRange;
    // visibility modifiers
    let vis = 1;
    if (p.crouched) vis *= 0.45;
    if (p.sprinting) vis *= 1.4;
    if (p.flashOn) vis *= 1.6;
    if (p.zone === 'tunnel' || p.zone === 'facility') vis *= p.flashOn ? 1.0 : 0.55;
    range *= vis;
    if (d > range) return false;
    // fov
    const to = this._tmp.copy(p.pos).sub(this.pos); to.y = 0; to.normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (to.dot(fwd) < Math.cos(this.sightFov / 2) && d > 2.5) return false;
    // LOS
    return this.G.physics.los(this.eyePos(), p.eyePos(), 'enemy');
  }

  think() {
    const p = this.G.player;
    const sees = this.canSeePlayer();
    if (sees) {
      this.lastKnown.copy(p.pos);
      if (this.state !== 'combat') {
        if (this.type === 'mutant') this.screech(); else this.shout();
      }
      this.setState('combat');
    } else if (this.type === 'mutant' && p.flashOn && !p.dead && this.state !== 'combat') {
      // mutants hunt the light: a flashlight beam sweeping over them gives the player away
      const d = this.pos.distanceTo(p.pos);
      if (d < 16) {
        const to = this._tmp.copy(this.eyePos()).sub(p.eyePos()).normalize();
        if (to.dot(p.lookDir()) > 0.93 && this.G.physics.los(p.eyePos(), this.eyePos(), 'enemy')) {
          this.lastKnown.copy(p.pos);
          this.screech();
          this.setState('combat');
        }
      }
    }
    switch (this.state) {
      case 'patrol': {
        const wp = this.patrol[this.patrolIdx];
        if (Math.hypot(this.pos.x - wp.x, this.pos.z - wp.z) < 0.6) {
          this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
          this.blockedT = 0;
          if (Math.random() < 0.4) this.setState('idle');
        }
        break;
      }
      case 'idle':
        if (this.stateT > 2.5 + Math.random() * 3) this.setState('patrol');
        break;
      case 'suspicious':
        if (this.stateT > 1.6) this.setState('investigate');
        break;
      case 'investigate': {
        const d = this.pos.distanceTo(this.investigatePos);
        if (d < 1.0 || this.stateT > 12) {
          this.lookYaw = this.yaw + Math.PI * (0.5 + Math.random());
          this.setState('search');
        }
        break;
      }
      case 'combat': {
        if (!sees && this.stateT > 5) this.setState('search');
        break;
      }
      case 'search': {
        if (this.stateT > 7 + Math.random() * 4) this.setState('return');
        break;
      }
      case 'return': {
        const wp = this.patrol[this.patrolIdx];
        if (this.pos.distanceTo(wp) < 0.8) this.setState('patrol');
        break;
      }
    }
  }

  moveToward(target, speed, dt) {
    const to = this._target.copy(target).sub(this.pos); to.y = 0;
    const d = to.length();
    if (d < 0.05) { this.vel.x = this.vel.z = 0; return d; }
    to.divideScalar(d);
    // whisker avoidance: steer around corners, trains and props instead of grinding into them
    if (this.sidestepT <= 0) this.avoidObstacles(to);
    // sidestep when stuck
    if (this.sidestepT > 0) {
      const px = -to.z * this.sidestepDir, pz = to.x * this.sidestepDir;
      to.set(px, 0, pz);
    }
    this.vel.x = to.x * speed;
    this.vel.z = to.z * speed;
    // face movement
    const targetYaw = Math.atan2(-to.x, -to.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 7);
    return d;
  }

  // probe ahead; if blocked, pick the steered direction with the most clearance + goal progress
  avoidObstacles(to) {
    const G = this.G;
    const origin = this._tmp.set(this.pos.x, this.pos.y + 0.9, this.pos.z);
    const ahead = G.physics.raycast(origin, to, 1.4, 'enemy');
    if (!ahead || ahead.dist > 1.15) return;
    let bestScore = -1, bx = to.x, bz = to.z;
    for (const a of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = to.x * ca - to.z * sa, dz = to.x * sa + to.z * ca;
      const dir = this._avoidDir.set(dx, 0, dz);
      const hit = G.physics.raycast(origin, dir, 1.8, 'enemy');
      const clear = hit ? hit.dist : 1.8;
      const prog = dx * to.x + dz * to.z;
      const score = clear + prog * 0.9;
      if (score > bestScore) { bestScore = score; bx = dx; bz = dz; }
    }
    to.set(bx, 0, bz).normalize();
  }

  faceToward(target, dt, rate = 7) {
    const to = this._target.copy(target).sub(this.pos); to.y = 0;
    if (to.lengthSq() < 1e-6) return;
    to.normalize();
    const targetYaw = Math.atan2(-to.x, -to.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * rate);
  }

  update(dt) {
    const G = this.G, p = G.player;
    if (this.dead) {
      this.deathT += dt;
      // the death clip (hips drop + topple, clamped on the final pose) drives the corpse
      this.animator.update(dt, {});
      return;
    }
    this.stateT += dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.12; this.think(); }

    const prevX = this.pos.x, prevZ = this.pos.z;
    let speed = 0;

    switch (this.state) {
      case 'idle':
        this.vel.x = this.vel.z = 0;
        this.yaw += Math.sin(G.engine.elapsed * 0.5 + this.uid) * dt * 0.3;
        break;
      case 'suspicious':
        this.vel.x = this.vel.z = 0;
        this.faceToward(this.investigatePos, dt, 4);
        break;
      case 'patrol':
      case 'return':
        speed = this.speedPatrol;
        this.moveToward(this.patrol[this.patrolIdx], speed, dt);
        break;
      case 'investigate':
        speed = this.speedPatrol * 1.4;
        this.moveToward(this.investigatePos, speed, dt);
        break;
      case 'search': {
        speed = this.speedPatrol;
        if (!this._searchTarget || this.pos.distanceTo(this._searchTarget) < 0.8 || this.stateT % 3 < dt) {
          this._searchTarget = this.lastKnown.clone().add(V3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        }
        this.moveToward(this._searchTarget, speed, dt);
        break;
      }
      case 'combat':
        if (this.type === 'mutant') this.combatMutant(dt);
        else this.combatScavenger(dt);
        break;
    }

    // gravity & collision
    this.vel.y -= 13.5 * dt;
    G.physics.move(this.pos, { r: 0.34, h: 1.7 }, this.vel, dt, this.collider, 'enemy');
    this.collider.box.min.set(this.pos.x - 0.3, this.pos.y, this.pos.z - 0.3);
    this.collider.box.max.set(this.pos.x + 0.3, this.pos.y + 1.7, this.pos.z + 0.3);

    // stuck detection → sidestep (after physics so `moved` reflects real displacement)
    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    if ((this.vel.x !== 0 || this.vel.z !== 0) && moved < dt * 0.3) {
      this.stuckT += dt; this.blockedT += dt;
      if (this.stuckT > 0.4 && this.sidestepT <= 0) {
        this.sidestepT = 0.5 + Math.random() * 0.4;
        this.sidestepDir = Math.random() < 0.5 ? 1 : -1;
        this.stuckT = 0;
      }
      // waypoint truly unreachable → give up on it instead of sidestepping forever
      if (this.blockedT > 2.2) {
        this.blockedT = 0;
        if (this.state === 'patrol' || this.state === 'return') {
          this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
        } else if (this.state === 'investigate') {
          this.setState('search');
        }
      }
    } else { this.stuckT = 0; this.blockedT = Math.max(0, this.blockedT - dt * 2); }
    this.sidestepT -= dt;

    // progress check: sidestepping along a wall forever still counts as blocked
    const goal = (this.state === 'patrol' || this.state === 'return') ? this.patrol[this.patrolIdx]
      : this.state === 'investigate' ? this.investigatePos : null;
    if (goal) {
      if (goal !== this._goalRef) { this._goalRef = goal; this._goalBest = Infinity; this._goalStall = 0; this._goalCheckT = 0; }
      const gd = Math.hypot(this.pos.x - goal.x, this.pos.z - goal.z);
      this._goalCheckT += dt;
      if (this._goalCheckT >= 0.5) {
        this._goalCheckT = 0;
        if (gd < this._goalBest - 0.1) { this._goalBest = gd; this._goalStall = 0; }
        else this._goalStall += 0.5;
        if (this._goalStall >= 3) {
          this._goalRef = null;
          if (this.state === 'investigate') this.setState('search');
          else this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length;
        }
      }
    } else this._goalRef = null;

    this.speed2D = Math.hypot(this.vel.x, this.vel.z);
    this.group.position.copy(this.pos);
    if (this.type !== 'mutant') this.group.position.y -= this.duckK * 0.45;
    this.group.rotation.y = this.yaw;

    // animation: locomotion via AnimationMixer + AI-synced upper-body layer
    const P = this.parts;
    if (this.type === 'mutant') {
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = this.state === 'combat' ? 2 + Math.random() * 3 : 6 + Math.random() * 9;
        this.growl();
      }
      this.animator.update(dt, { speed: this.speed2D });
      if (this.attackWindup > 0) this.group.position.y -= 0.1 * (1 - this.attackWindup / 0.32);
    } else {
      if (this.state === 'combat') {
        const to = this._tmp.copy(p.pos).sub(this.pos);
        const targetYaw = Math.atan2(-to.x, -to.z);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * Math.min(1, dt * 8);
      }
      this.animator.update(dt, {
        speed: this.speed2D,
        combat: this.state === 'combat',
        reload: this.reloadT > 0,
        duck: this.duckK,
        shoot: this.burstT > 0.12,
      });
      if (P.head && this.state === 'suspicious') P.head.rotation.y += Math.sin(this.stateT * 3) * 0.45;
    }
    // flinch timer (the additive hit clip handles the visual recoil); kept for AI stagger logic
    if (this.flinchT > 0) this.flinchT -= dt;
  }

  combatMutant(dt) {
    const p = this.G.player;
    const d = this.pos.distanceTo(p.pos);
    this.attackT -= dt;
    if (this.lungeT > 0) { this.lungeT -= dt; return; } // ride the strike momentum
    if (this.attackWindup > 0) {
      this.attackWindup -= dt;
      this.vel.x = this.vel.z = 0;
      if (this.attackWindup <= 0) {
        // lunge: throw the body forward with the strike
        const to = this._tmp.copy(p.pos).sub(this.pos); to.y = 0;
        if (to.lengthSq() > 0.01) {
          to.normalize();
          this.vel.x = to.x * 3.2; this.vel.z = to.z * 3.2;
          this.lungeT = 0.22;
        }
        // strike — only connects if nothing solid intervenes (a closed door or
        // wall between lurker and player must block the swipe, not just distance)
        if (d < this.attackRange + 0.5 && !p.dead && this.G.physics.los(this.eyePos(), p.eyePos(), 'enemy')) {
          p.damage(this.attackDmg + Math.random() * 6, 'The lurker tore you apart.');
          this.G.audio.play('screech', { pos: this.eyePos(), vol: 0.7, pitch: 1.2 });
        }
        this.attackT = 1.1 + Math.random() * 0.4;
      }
      return;
    }
    if (d < this.attackRange && this.attackT <= 0) {
      this.attackWindup = 0.32;
      this.animator.trigger('attack'); // one-shot claw swipe synced to the windup→strike timing
      this.G.audio.play('growl', { pos: this.eyePos(), vol: 0.9, pitch: 1.3 });
      return;
    }
    // chase last known (or player if visible)
    const sees = this.canSeePlayer();
    if (sees && d < this.attackRange * 0.75) {
      // hold striking distance instead of walking inside the player
      this.vel.x = this.vel.z = 0;
      if (d < 1.0) {
        const away = this._tmp.copy(this.pos).sub(p.pos); away.y = 0;
        if (away.lengthSq() > 0.01) { away.normalize(); this.vel.x = away.x * 1.2; this.vel.z = away.z * 1.2; }
      }
      this.faceToward(p.pos, dt, 8);
    } else {
      this.moveToward(sees ? p.pos : this.lastKnown, this.speedChase, dt);
    }
    if (d < 3.5 && this.speed2D > 3) {
      // lunge bob
      this.group.position.y += Math.abs(Math.sin(this.animator.t * 9)) * 0.1;
    }
  }

  combatScavenger(dt) {
    const p = this.G.player;
    const d = this.pos.distanceTo(p.pos);
    const sees = this.canSeePlayer();
    this.shootT -= dt;
    this.repositionT -= dt;

    // reload cycle
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      this.vel.x = this.vel.z = 0;
      this.faceToward(p.pos, dt, 5);
      if (this.reloadT <= 0) this.burstsFired = 0;
      return;
    }

    // choose genuinely protective cover: prefer spots that shield the body but allow a peek to return fire
    if (this.cover.length && (this.repositionT <= 0 || d < 5)) {
      let best = null, bestScore = -1e9;
      const pe = p.eyePos();
      for (const c of this.cover) {
        const distToP = c.distanceTo(p.pos);
        const shielded = !this.G.physics.los(c.clone().setY(0.9), pe, 'enemy');
        const canPeek = this.G.physics.los(c.clone().setY(1.6), pe, 'enemy');
        const band = (distToP > 5 && distToP < 22) ? 6 : 0;
        const score = (shielded ? 14 : 0) + (canPeek ? 4 : 0) + band - c.distanceTo(this.pos) * 0.4;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      this.coverTarget = best;
      this.coverApproachT = 0;
      this.repositionT = 4 + Math.random() * 4;
    }

    const atCover = this.coverTarget && this.pos.distanceTo(this.coverTarget) < 0.7;
    if (this.coverTarget && !atCover) {
      this.coverApproachT += dt;
      // unreachable cover (blocked by props or friendlies) must not silence the scavenger forever
      if (this.coverApproachT < 2.5) {
        this.moveToward(this.coverTarget, this.speedChase, dt);
        return;
      }
      this.coverTarget = null;
    }
    // peek/duck cycle: duck behind protective cover, rise briefly to fire
    const shieldedHere = atCover && !this.G.physics.los(this.pos.clone().setY(this.pos.y + 0.9), p.eyePos(), 'enemy');
    this.peekT -= dt;
    if (this.peekT <= 0) {
      this.ducking = !this.ducking;
      this.peekT = this.ducking ? 1.4 + Math.random() * 1.2 : 0.7 + Math.random() * 0.5;
    }
    const wantDuck = shieldedHere && this.ducking;
    this.duckK += ((wantDuck ? 1 : 0) - this.duckK) * Math.min(1, dt * 8);
    if (d < 4.5) {
      // too close for comfort: back away while keeping the gun up
      const away = this._tmp.copy(this.pos).sub(p.pos); away.y = 0;
      if (away.lengthSq() > 0.01) {
        away.normalize();
        this.vel.x = away.x * this.speedChase * 0.8;
        this.vel.z = away.z * this.speedChase * 0.8;
      }
    } else { this.vel.x = this.vel.z = 0; }
    this.faceToward(p.pos, dt, 6);

    if (sees && this.shootT <= 0 && this.duckK < 0.5) {
      // fire burst
      this.burstLeft = 3;
      this.burstT = 0;
      this.shootT = 1.7 + Math.random() * 1.2;
      this.burstsFired++;
      if (this.burstsFired >= 4) {
        this.reloadT = 2.6;
        this.G.audio.play('reload', { pos: this.eyePos(), vol: 0.5, kind: 'rifle' });
      }
    }
    if (this.burstLeft > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.14;
        this.burstLeft--;
        this.fireAtPlayer();
      }
    }
    // lost him → push toward last known
    if (!sees && this.stateT > 3.5) {
      this.coverTarget = null;
      this.moveToward(this.lastKnown, this.speedPatrol * 1.3, dt);
    }
  }

  fireAtPlayer() {
    const G = this.G, p = G.player;
    if (p.dead) return;
    const from = this.eyePos().clone();
    from.y -= 0.15;
    const aim = p.eyePos().clone();
    aim.y -= 0.2;
    const d = from.distanceTo(aim);
    G.audio.play('enemy_rifle', { pos: from, vol: 0.85, verb: 0.5 });
    G.effects.burst(from, { count: 4, color: 0xffcc66, speed: 1.5, life: 0.12, grav: 0 });
    // accuracy (difficulty model unchanged)
    let hitChance = 0.38 - d * 0.008;
    if (p.sprinting) hitChance -= 0.14;
    if (p.crouched) hitChance -= 0.08;
    if (this.speed2D > 0.5) hitChance -= 0.1;
    const onTarget = Math.random() < Math.max(0.05, hitChance);
    const target = aim.clone();
    if (!onTarget) {
      target.x += (Math.random() - 0.5) * 2.2;
      target.y += (Math.random() - 0.5) * 1.6;
      target.z += (Math.random() - 0.5) * 2.2;
    }
    const dir = target.clone().sub(from);
    const range = dir.length() || 0.001;
    dir.divideScalar(range);
    // A bullet is stopped by the first solid surface along its path. This is
    // re-checked for every shot in the burst, so a player who steps behind a
    // wall, closed door, train or cover after the burst begins takes no damage,
    // and the tracer terminates at the real impact instead of drawing through it.
    const worldHit = G.physics.raycast(from, dir, range + 3, 'enemy');
    const reachesTarget = !worldHit || worldHit.dist >= range - 0.05;
    const playerHit = onTarget && reachesTarget;
    const end = playerHit ? target : (worldHit ? worldHit.point : target);
    G.effects.tracer(from, end);
    if (playerHit) {
      p.damage(this.attackDmg + Math.random() * 5, 'Gunfire in the dark.');
      G.effects.burst(end, { count: 4, color: 0xb03030, speed: 1.6, life: 0.22, grav: 5 });
    } else if (worldHit) {
      G.effects.burst(worldHit.point, { count: 5, color: 0xffcc66, speed: 2, life: 0.3, grav: 6, dir: worldHit.normal });
    }
  }

  damage(dmg, dir, headshot) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flinchT = 0.2;
    this.animator.trigger('hit');
    this.lastKnown.copy(this.G.player.pos);
    if (this.state !== 'combat') {
      this.setState('combat');
      if (this.type === 'mutant') this.screech(); else this.shout();
    }
    if (this.type === 'mutant') {
      this.G.audio.play('mutant_hit', { pos: this.eyePos(), vol: 0.8 });
      // stagger: interrupt the windup so sustained fire keeps it off balance
      this.attackWindup = 0; this.attackT = Math.max(this.attackT, 0.35);
    } else {
      this.G.audio.play('human_hit', { pos: this.eyePos(), vol: 0.8 });
      // under fire → break for protective cover immediately
      this.repositionT = 0; this.ducking = true; this.peekT = 0.6;
    }
    // knockback
    if (dir) { this.vel.x += dir.x * 1.5; this.vel.z += dir.z * 1.5; }
    if (this.hp <= 0) this.die();
  }

  die(fromLoad = false) {
    this.dead = true;
    this.deathT = 0;
    this.collider.enabled = false;
    this.vel.set(0, 0, 0);
    if (!fromLoad) this.animator.trigger('death');
    if (this.type === 'mutant') this.G.audio.play('mutant_die', { pos: this.eyePos(), vol: 0.9, verb: 0.5 });
    else {
      this.G.audio.play('human_die', { pos: this.eyePos(), vol: 0.9, verb: 0.5 });
      if (!fromLoad) this.G.game.spawnDrop(this.pos, 'rifleAmmo', 10 + (Math.random() * 8 | 0));
    }
    // eyes dim
    if (this.parts.eyeL) { this.parts.eyeL.material = new THREE.MeshBasicMaterial({ color: 0x3a4a1a }); this.parts.eyeR.material = this.parts.eyeL.material; }
  }

  serialize() { return { id: this.id, hp: this.hp, dead: this.dead, pos: this.pos.toArray() }; }
  deserialize(d) {
    this.hp = d.hp;
    this.pos.fromArray(d.pos);
    this.group.position.copy(this.pos);
    if (d.dead && !this.dead) { this.die(true); this.deathT = 5; this.animator.finishDeath(); }
  }
}