// Pooled particle bursts, tracers, shell casings, bullet-hole decals.
import * as THREE from 'three';

const MAX = 600;

function bulletHoleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  // dark punched centre
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 12);
  g.addColorStop(0, 'rgba(8,8,8,0.95)');
  g.addColorStop(0.6, 'rgba(20,18,16,0.8)');
  g.addColorStop(1, 'rgba(20,18,16,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 12, 0, 7); ctx.fill();
  // radial cracks / spall
  ctx.strokeStyle = 'rgba(15,13,11,0.7)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, len = 10 + Math.random() * 18;
    ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5);
    ctx.lineTo(32 + Math.cos(a) * len, 32 + Math.sin(a) * len); ctx.stroke();
  }
  // light spall ring
  ctx.strokeStyle = 'rgba(120,115,105,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32, 32, 9, 0, 7); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, grav: 0, color: new THREE.Color() });
    this.geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.mat = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tracers = [];
    this.shells = [];
    this.shellGeo = new THREE.BoxGeometry(0.012, 0.012, 0.03);
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 });
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.008, 0.008, 1);
    // bullet-hole decals (capped pool, oldest recycled)
    this.decals = [];
    this.decalMax = 48;
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalMat = new THREE.MeshBasicMaterial({ map: bulletHoleTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  impactDecal(pos, normal) {
    if (!normal) return;
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(pos).addScaledVector(normal, 0.012);
    m.lookAt(pos.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.07 + Math.random() * 0.06;
    m.scale.set(s, s, 1);
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > this.decalMax) {
      const old = this.decals.shift();
      this.scene.remove(old);
    }
  }

  burst(pos, { count = 12, color = 0xffcc66, speed = 3, life = 0.5, grav = 6, dir = null, spread = 1 } = {}) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.alive) continue;
      p.alive = true;
      p.pos.copy(pos);
      p.vel.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(speed * spread);
      if (dir) p.vel.addScaledVector(dir, speed * (0.5 + Math.random() * 0.8));
      p.life = p.maxLife = life * (0.5 + Math.random() * 0.8);
      p.grav = grav;
      p.color.set(color).multiplyScalar(0.6 + Math.random() * 0.6);
      if (++spawned >= count) break;
    }
  }

  tracer(from, to) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    const d = to.clone().sub(from);
    const len = d.length();
    m.position.copy(from).addScaledVector(d, 0.5);
    m.scale.z = len;
    m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ m, life: 0.06 });
  }

  shell(pos, right) {
    const m = new THREE.Mesh(this.shellGeo, this.shellMat);
    m.position.copy(pos);
    this.scene.add(m);
    this.shells.push({
      m, life: 1.4,
      vel: right.clone().multiplyScalar(1.5 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0)),
      rot: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
    });
  }

  update(dt) {
    let n = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      this.positions[n * 3] = p.pos.x; this.positions[n * 3 + 1] = p.pos.y; this.positions[n * 3 + 2] = p.pos.z;
      this.colors[n * 3] = p.color.r * k; this.colors[n * 3 + 1] = p.color.g * k; this.colors[n * 3 + 2] = p.color.b * k;
      n++;
    }
    // hide unused
    for (let i = n; i < MAX; i++) this.positions[i * 3 + 1] = -100;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, MAX);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.m.material.opacity = Math.max(0, t.life / 0.06) * 0.7;
      if (t.life <= 0) { this.scene.remove(t.m); t.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.m.position.addScaledVector(s.vel, dt);
      s.m.rotation.x += s.rot.x * dt; s.m.rotation.y += s.rot.y * dt;
      if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.vel.set(0, 0, 0); s.rot.set(0, 0, 0); }
      if (s.life <= 0) { this.scene.remove(s.m); this.shells.splice(i, 1); }
    }
  }
}