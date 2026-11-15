// Static AABB collision world + slab raycasts. Fast, no mesh traversal.
import * as THREE from 'three';

export class Physics {
  constructor() {
    this.colliders = []; // {box: Box3, enabled, tag}
    this._tmp = new THREE.Vector3();
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'static') {
    const c = { box: new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)), enabled: true, tag };
    this.colliders.push(c);
    return c;
  }

  addBoxCenter(cx, cy, cz, w, h, d, tag = 'static') {
    return this.addBox(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, tag);
  }

  remove(c) { c.enabled = false; }
  restore(c) { c.enabled = true; }

  // Move an AABB (center at feet+halfHeight) with axis-separated sliding.
  // pos = feet position (Vector3, mutated). size = {r, h} radius & height.
  move(pos, size, vel, dt, ignore = null, ignoreTag = null) {
    const EPS = 0.002;
    const steps = Math.max(1, Math.ceil((vel.length() * dt) / (size.r * 0.8)));
    const sdt = dt / steps;
    let grounded = false;
    for (let s = 0; s < steps; s++) {
      // Y
      pos.y += vel.y * sdt;
      let b = this._boxAt(pos, size);
      for (const c of this.colliders) {
        if (!c.enabled || c === ignore || (ignoreTag && c.tag === ignoreTag) || !b.intersectsBox(c.box)) continue;
        // require real horizontal overlap (not just touching)
        if (b.min.x >= c.box.max.x - EPS || b.max.x <= c.box.min.x + EPS ||
            b.min.z >= c.box.max.z - EPS || b.max.z <= c.box.min.z + EPS) continue;
        if (vel.y <= 0 && b.min.y < c.box.max.y && b.max.y > c.box.max.y) {
          pos.y = c.box.max.y; vel.y = 0; grounded = true;
        } else if (vel.y > 0 && b.max.y > c.box.min.y && b.min.y < c.box.min.y) {
          pos.y = c.box.min.y - size.h; vel.y = 0;
        }
        b = this._boxAt(pos, size);
      }
      // X
      pos.x += vel.x * sdt;
      b = this._boxAt(pos, size);
      for (const c of this.colliders) {
        if (!c.enabled || c === ignore || (ignoreTag && c.tag === ignoreTag) || !b.intersectsBox(c.box)) continue;
        if (b.min.y >= c.box.max.y - EPS || b.max.y <= c.box.min.y + EPS ||
            b.min.z >= c.box.max.z - EPS || b.max.z <= c.box.min.z + EPS) continue;
        // step-up over low obstacles (curbs, rubble <= 0.35)
        const stepH = c.box.max.y - pos.y;
        if (stepH > 0 && stepH <= 0.35 && this._clearAt(pos.x, c.box.max.y + 0.01, pos.z, size)) {
          pos.y = c.box.max.y + 0.001; grounded = true;
        } else if (vel.x > 0) pos.x = c.box.min.x - size.r - 0.001;
        else if (vel.x < 0) pos.x = c.box.max.x + size.r + 0.001;
        else pos.x = (pos.x < (c.box.min.x + c.box.max.x) / 2) ? c.box.min.x - size.r - 0.001 : c.box.max.x + size.r + 0.001;
        b = this._boxAt(pos, size);
      }
      // Z
      pos.z += vel.z * sdt;
      b = this._boxAt(pos, size);
      for (const c of this.colliders) {
        if (!c.enabled || c === ignore || (ignoreTag && c.tag === ignoreTag) || !b.intersectsBox(c.box)) continue;
        if (b.min.y >= c.box.max.y - EPS || b.max.y <= c.box.min.y + EPS ||
            b.min.x >= c.box.max.x - EPS || b.max.x <= c.box.min.x + EPS) continue;
        const stepH = c.box.max.y - pos.y;
        if (stepH > 0 && stepH <= 0.35 && this._clearAt(pos.x, c.box.max.y + 0.01, pos.z, size)) {
          pos.y = c.box.max.y + 0.001; grounded = true;
        } else if (vel.z > 0) pos.z = c.box.min.z - size.r - 0.001;
        else if (vel.z < 0) pos.z = c.box.max.z + size.r + 0.001;
        else pos.z = (pos.z < (c.box.min.z + c.box.max.z) / 2) ? c.box.min.z - size.r - 0.001 : c.box.max.z + size.r + 0.001;
        b = this._boxAt(pos, size);
      }
    }
    return grounded;
  }

  _boxAt(pos, size) {
    return new THREE.Box3(
      new THREE.Vector3(pos.x - size.r, pos.y, pos.z - size.r),
      new THREE.Vector3(pos.x + size.r, pos.y + size.h, pos.z + size.r)
    );
  }

  _clearAt(x, y, z, size) {
    const b = new THREE.Box3(
      new THREE.Vector3(x - size.r, y, z - size.r),
      new THREE.Vector3(x + size.r, y + size.h, z + size.r)
    );
    for (const c of this.colliders) {
      if (c.enabled && b.intersectsBox(c.box)) return false;
    }
    return true;
  }

  // Slab raycast against enabled colliders. Returns {dist, point, normal} or null.
  raycast(origin, dir, maxDist = 100, ignoreTag = null) {
    let best = null, bestT = maxDist;
    for (const c of this.colliders) {
      if (!c.enabled || (ignoreTag && c.tag === ignoreTag)) continue;
      const b = c.box;
      let tmin = 0, tmax = bestT, axis = -1, sign = 0;
      let ok = true;
      for (let i = 0; i < 3; i++) {
        const o = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
        const d = i === 0 ? dir.x : i === 1 ? dir.y : dir.z;
        const mn = i === 0 ? b.min.x : i === 1 ? b.min.y : b.min.z;
        const mx = i === 0 ? b.max.x : i === 1 ? b.max.y : b.max.z;
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        let s = -1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin > 0.0001 && tmin < bestT) {
        bestT = tmin;
        const n = new THREE.Vector3();
        if (axis === 0) n.x = sign; else if (axis === 1) n.y = sign; else if (axis === 2) n.z = sign;
        best = { dist: tmin, normal: n, collider: c };
      }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.dist);
    return best;
  }

  // true if line of sight between two points is unobstructed
  los(a, b, ignoreTag = null) {
    const dir = this._tmp.copy(b).sub(a);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    const hit = this.raycast(a, dir, dist - 0.05, ignoreTag);
    return !hit;
  }

  pointInBox(p, box) { return box.containsPoint(p); }
}