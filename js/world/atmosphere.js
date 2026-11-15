// Dust motes + fake volumetric light shafts.
import * as THREE from 'three';

export class Atmosphere {
  constructor(scene, quality = 'medium') {
    this.scene = scene;
    const count = quality === 'low' ? 250 : quality === 'high' ? 900 : 550;
    this.count = count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
      seed[i] = Math.random() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.seeds = seed;
    this.base = pos.slice();
    const mat = new THREE.PointsMaterial({
      color: 0x9aa8b0, size: 0.02, sizeAttenuation: true,
      transparent: true, opacity: 0.4, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.shafts = [];
  }

  // cone of light under a lamp
  addShaft(x, y, z, height = 4, radius = 1.6, color = 0x8a9ab0, opacity = 0.05) {
    if (!Atmosphere.shaftTex) {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
      Atmosphere.shaftTex = new THREE.CanvasTexture(c);
    }
    const geo = new THREE.ConeGeometry(radius, height, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      alphaMap: Atmosphere.shaftTex,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y - height / 2, z);
    this.scene.add(m);
    this.shafts.push(m);
    return m;
  }

  update(dt, t, camPos) {
    const pos = this.points.geometry.attributes.position.array;
    // wrap cloud around camera
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      let x = this.base[i * 3] + Math.sin(t * 0.12 + s) * 0.6;
      let y = this.base[i * 3 + 1] + Math.sin(t * 0.07 + s * 2) * 0.4 - (t * 0.05 + s) % 6;
      let z = this.base[i * 3 + 2] + Math.cos(t * 0.1 + s) * 0.6;
      // relative wrap
      x = camPos.x + ((x - camPos.x + 15) % 30 + 30) % 30 - 15;
      y = ((y % 6) + 6) % 6;
      z = camPos.z + ((z - camPos.z + 15) % 30 + 30) % 30 - 15;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < this.shafts.length; i++) {
      this.shafts[i].material.opacity = 0.04 + Math.sin(t * 0.5 + i * 2) * 0.012;
    }
  }
}