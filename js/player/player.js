// First-person player: movement, survival systems, flashlight, gas mask.
import * as THREE from 'three';

const EYE_STAND = 1.62, EYE_CROUCH = 0.92;
const H_STAND = 1.78, H_CROUCH = 1.05;
const RADIUS = 0.32;

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(-4, 0, 2);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.height = H_STAND; this.eye = EYE_STAND;
    this.crouched = false;
    this.grounded = true;
    this.hp = 100; this.maxHp = 100;
    this.dead = false;
    this.inv = { pistolAmmo: 24, rifleAmmo: 0, medkit: 1, filter: 1, battery: 1, fuel: 0 };
    this.hasRifle = false;
    this.maskOn = false;
    this.filterTime = 90;
    this.battery = 100;
    this.flashOn = false;
    this.radRate = 0;
    this.bobPhase = 0; this.bobAmp = 0;
    this.landDip = 0; this.landVel = 0;
    this.trauma = 0;
    this.stepAcc = 0;
    this.speed2D = 0;
    this.sprinting = false;
    this.ads = false;
    this.lastDamageT = 0;
    this._eye = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._flashDir = new THREE.Vector3(0, 0, -1);
    this._zeroVel = new THREE.Vector3();

    // flashlight (scene-space, lags behind camera for weight)
    this.flash = new THREE.SpotLight(0xfff2d8, 0, 42, 0.36, 0.5, 1.7);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.camera.near = 0.2;
    this.flash.shadow.camera.far = 42;
    this.flash.shadow.bias = -0.002;
    G.scene.add(this.flash);
    G.scene.add(this.flash.target);
    this.flashTargetPos = new THREE.Vector3();
  }

  reset(cp) {
    this.pos.copy(cp.pos); this.vel.set(0, 0, 0);
    this.yaw = cp.yaw; this.pitch = 0;
    this.hp = this.maxHp; this.dead = false;
    this.crouched = false; this.height = H_STAND; this.eye = EYE_STAND;
    this.trauma = 0; this.landDip = 0;
  }

  eyePos() { return this._eye.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  lookDir() {
    return this._dir.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  update(dt) {
    const G = this.G, input = G.input;
    if (this.dead) return;

    // ---- look ----
    const sens = G.settings.sensitivity * 0.0021;
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens * (G.settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));

    // ---- crouch ----
    const wantCrouch = input.down('ControlLeft') || input.down('KeyC');
    if (wantCrouch && !this.crouched) { this.crouched = true; }
    else if (!wantCrouch && this.crouched) {
      // check headroom before standing
      if (G.physics._clearAt(this.pos.x, this.pos.y + 0.05, this.pos.z, { r: RADIUS, h: H_STAND })) this.crouched = false;
    }
    const targetH = this.crouched ? H_CROUCH : H_STAND;
    const targetEye = this.crouched ? EYE_CROUCH : EYE_STAND;
    this.height += (targetH - this.height) * Math.min(1, dt * 10);
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);

    // ---- movement ----
    const mx = input.moveX, mz = input.moveZ;
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(-this._fwd.z, 0, this._fwd.x);
    this._target.set(0, 0, 0).addScaledVector(this._fwd, mz).addScaledVector(this._right, mx);
    if (this._target.lengthSq() > 0) this._target.normalize();
    this.sprinting = input.down('ShiftLeft') && mz > 0 && !this.crouched && !this.ads;
    const speed = this.crouched ? 1.5 : this.sprinting ? 5.4 : this.ads ? 1.9 : 3.1;
    this._target.multiplyScalar(speed);
    const accel = this.grounded ? 34 : 8;
    this.vel.x += (this._target.x - this.vel.x) * Math.min(1, accel * dt / 3);
    this.vel.z += (this._target.z - this.vel.z) * Math.min(1, accel * dt / 3);
    // friction when no input
    if (mx === 0 && mz === 0 && this.grounded) {
      const f = Math.max(0, 1 - dt * 11);
      this.vel.x *= f; this.vel.z *= f;
    }
    // jump
    if (input.pressed('Space') && this.grounded && !this.crouched) {
      this.vel.y = 4.4; this.grounded = false;
      G.game.emitNoise(this.pos, 7, 'step');
    }
    this.vel.y -= 13.5 * dt;
    if (this.vel.y < -30) this.vel.y = -30;

    const wasGrounded = this.grounded;
    const fallSpeed = this.vel.y;
    // ignore enemy colliders: their boxes must not act as ground or walls —
    // separation is handled by soft push below so combat never pops the player upward
    this.grounded = G.physics.move(this.pos, { r: RADIUS, h: this.height }, this.vel, dt, null, 'enemy');
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz), minD = 0.62;
      if (d < minD && Math.abs(this.pos.y - e.pos.y) < 1.6) {
        const push = (minD - d) * Math.min(1, dt * 14);
        if (d > 0.001) { this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push; }
        else this.pos.x += push;
        this._zeroVel.set(0, 0, 0);
        G.physics.move(this.pos, { r: RADIUS, h: this.height }, this._zeroVel, 0, null, 'enemy');
      }
    }
    if (this.grounded && !wasGrounded && fallSpeed < -5) {
      this.landVel = fallSpeed * 0.02;
      G.audio.play('jump_land', { vol: Math.min(1, -fallSpeed / 12) });
      G.game.emitNoise(this.pos, 9, 'step');
      if (fallSpeed < -13) this.damage(Math.min(35, (-fallSpeed - 13) * 4), 'The fall broke you.');
    }

    this.speed2D = Math.hypot(this.vel.x, this.vel.z);

    // ---- head bob & land dip ----
    const bobScale = G.settings.bob * (this.ads ? 0.25 : 1);
    if (this.grounded && this.speed2D > 0.4) {
      this.bobPhase += dt * this.speed2D * 1.9;
      this.bobAmp += (Math.min(1, this.speed2D / 3.1) - this.bobAmp) * Math.min(1, dt * 6);
    } else this.bobAmp += (0 - this.bobAmp) * Math.min(1, dt * 6);
    this.landVel += (-this.landDip * 90 - this.landVel * 12) * dt;
    this.landDip += this.landVel * dt;

    // ---- footsteps ----
    if (this.grounded && this.speed2D > 0.5) {
      this.stepAcc += this.speed2D * dt;
      const stride = this.crouched ? 0.62 : this.sprinting ? 0.95 : 0.78;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const surf = this._surface();
        G.audio.play('footstep', { vol: this.crouched ? 0.25 : this.sprinting ? 0.7 : 0.45, surface: surf, pitch: 0.9 + Math.random() * 0.2 });
        G.game.emitNoise(this.pos, this.crouched ? 2.2 : this.sprinting ? 13 : 6.5, 'step');
      }
    }

    // ---- camera ----
    const bobY = Math.sin(this.bobPhase * 2) * 0.032 * this.bobAmp * bobScale;
    const bobX = Math.cos(this.bobPhase) * 0.02 * this.bobAmp * bobScale;
    const breathe = Math.sin(G.engine.elapsed * 1.1) * 0.006;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const cam = G.engine.camera;
    cam.position.set(
      this.pos.x + bobX * Math.cos(this.yaw) + (Math.random() - 0.5) * sh * 0.12,
      this.pos.y + this.eye + bobY + this.landDip + breathe + (Math.random() - 0.5) * sh * 0.12,
      this.pos.z - bobX * Math.sin(this.yaw) + (Math.random() - 0.5) * sh * 0.12
    );
    const roll = -mx * 0.012 + Math.cos(this.bobPhase) * 0.004 * this.bobAmp * bobScale + (Math.random() - 0.5) * sh * 0.05;
    cam.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.06, this.yaw, roll);

    // ---- flashlight ----
    if (input.pressed('KeyF')) this.toggleFlash();
    if (this.flashOn) {
      this.battery -= dt * 0.5;
      if (this.battery <= 0) { this.battery = 0; this.flashOn = false; G.ui.hint('Flashlight died. Use a battery (Tab).'); }
    }
    let flashI = this.flashOn ? 70 : 0;
    if (this.flashOn && this.battery < 15 && Math.random() < 0.12) flashI *= 0.25;
    this.flash.intensity += (flashI - this.flash.intensity) * Math.min(1, dt * 18);
    // laggy follow
    const eye = this.eyePos();
    this.flash.position.copy(eye).addScaledVector(this._right, 0.12).addScaledVector(this._fwd, 0.05);
    this.flash.position.y -= 0.08;
    this._flashDir.lerp(this.lookDir(), Math.min(1, dt * 14)).normalize();
    this.flash.target.position.copy(this.flash.position).addScaledVector(this._flashDir, 10);

    // ---- gas mask ----
    if (input.pressed('KeyG')) this.toggleMask();
    if (this.maskOn) {
      const inRad = this.radRate > 0.5;
      this.filterTime -= dt * (inRad ? 2 : 1);
      if (this.filterTime > 20) this.filterWarned = false;
      else if (!this.filterWarned && this.filterTime > 0) {
        this.filterWarned = true;
        G.audio.play('beep', { vol: 0.8 });
        G.ui.hint('Filter almost spent — swap soon (Tab).', 4);
      }
      if (this.filterTime > 0 && this.filterTime < 10) {
        this._beepT = (this._beepT ?? 0) - dt;
        if (this._beepT <= 0) { this._beepT = 1.5; G.audio.play('beep', { vol: 0.5, pitch: 1.35 }); }
      } else this._beepT = 0;
      if (this.filterTime <= 0) {
        this.filterTime = 0; this.maskOn = false;
        G.ui.setMask(false);
        G.audio.play('mask_off', { vol: 0.8 });
        G.audio.play('cough', { vol: 0.9, delay: 0.25 });
        G.ui.hint('Filter exhausted! Swap in a new one (Tab).');
      }
    }

    // ---- radiation ----
    let rate = 0;
    const ep = this.eyePos();
    for (const z of G.level.radZones) if (z.box.containsPoint(ep)) rate = Math.max(rate, z.rate);
    this.radRate = rate;
    G.audio.geigerRate = rate * 2.2;
    if (rate > 0 && !this.maskOn) this.damage(rate * 0.55 * dt, 'Radiation took you.', true);

    // ---- audio state ----
    G.audio.breath.active = true;
    G.audio.breath.mask = this.maskOn;
    G.audio.breath.intensity = this.sprinting ? 1 : this.hp < 30 ? 0.75 : 0.35;
    G.audio.heart.active = this.hp < 30;
    G.audio.setListener(cam.position, this.lookDir());

    // zone
    for (const z of G.level.zones) {
      if (z.box.containsPoint(this.pos)) { G.audio.setZone(z.name); this.zone = z.name; break; }
    }
    // localized haze: the tunnel/facility sit thicker than the lived-in station
    const fogTarget = { station: 0.028, tunnel: 0.046, facility: 0.038, control: 0.030 }[this.zone] ?? 0.035;
    const fog = G.engine.scene.fog;
    fog.density += (fogTarget - fog.density) * Math.min(1, dt * 1.5);
  }

  _surface() {
    const p = this.pos;
    for (const z of this.G.level.radZones) if (z.box.containsPoint(p)) return 'water';
    // train interiors (approx rects)
    if (Math.abs(p.x - 0.7) < 1.6 && p.z > -77.5 && p.z < -62.5 && p.y > 0) return 'metal';
    if (Math.abs(p.x - 5.2) < 1.6 && p.z > -14.5 && p.z < -1.5 && p.y > -0.6 && p.y < 0.5) return 'metal';
    if (p.x > 3.5 && this.zone === 'station') return 'concrete';
    return 'concrete';
  }

  toggleFlash() {
    const G = this.G;
    if (!this.flashOn && this.battery <= 0) { G.ui.hint('No battery charge. Use a battery (Tab).'); G.audio.play('dryfire', { vol: 0.5 }); return; }
    this.flashOn = !this.flashOn;
    G.audio.play('flashlight', { vol: 0.7 });
    G.game.emitNoise(this.pos, 3, 'click');
  }

  toggleMask() {
    const G = this.G;
    if (!this.maskOn && this.filterTime <= 0) {
      if (this.inv.filter > 0) { this.inv.filter--; this.filterTime = 90; }
      else { G.ui.hint('No working filter. Find one.'); G.audio.play('dryfire', { vol: 0.5 }); return; }
    }
    this.maskOn = !this.maskOn;
    G.audio.play(this.maskOn ? 'mask_on' : 'mask_off', { vol: 0.9 });
    G.ui.setMask(this.maskOn);
  }

  useMedkit() {
    if (this.inv.medkit <= 0 || this.hp >= this.maxHp) return false;
    this.inv.medkit--; this.hp = Math.min(this.maxHp, this.hp + 55);
    this.G.audio.play('heal', { vol: 0.9 });
    return true;
  }
  useBattery() {
    if (this.inv.battery <= 0 || this.battery > 60) return false;
    this.inv.battery--; this.battery = Math.min(100, this.battery + 65);
    this.G.audio.play('battery', { vol: 0.9 });
    return true;
  }
  useFilter() {
    if (this.inv.filter <= 0) return false;
    if (this.maskOn && this.filterTime > 45) { this.G.ui.hint('Current filter is still good.'); return false; }
    this.inv.filter--; this.filterTime = 90;
    this.filterWarned = false;
    if (!this.maskOn) {
      this.maskOn = true;
      this.G.ui.setMask(true);
      this.G.audio.play('mask_on', { vol: 0.9 });
    }
    this.G.audio.play('filter_swap', { vol: 0.9 });
    return true;
  }

  damage(amount, cause = 'The dark took you.', silent = false) {
    if (this.dead) return;
    this.hp -= amount;
    this.lastDamageT = this.G.engine.elapsed;
    if (!silent) {
      this.trauma = Math.min(1, this.trauma + 0.35);
      this.G.ui.flashDamage(Math.min(1, amount / 30));
      this.G.audio.play('flesh_hit', { vol: 0.6 });
    }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.G.game.onDeath(cause); }
  }

  serialize() {
    return {
      pos: this.pos.toArray(), yaw: this.yaw, hp: this.hp, inv: { ...this.inv },
      hasRifle: this.hasRifle, maskOn: this.maskOn, filterTime: this.filterTime,
      battery: this.battery, flashOn: this.flashOn,
    };
  }
  deserialize(d) {
    this.pos.fromArray(d.pos); this.yaw = d.yaw; this.hp = d.hp;
    Object.assign(this.inv, d.inv);
    this.hasRifle = d.hasRifle; this.maskOn = d.maskOn;
    this.filterTime = d.filterTime; this.battery = d.battery; this.flashOn = d.flashOn;
    this.dead = false; this.vel.set(0, 0, 0);
    this.G.ui.setMask(this.maskOn);
  }
}