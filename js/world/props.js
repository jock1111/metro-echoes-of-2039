// Prop builders: procedural geometry, upgraded with shipped glTF models when available.
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { buildHuman, setCharacterAssets } from './characters.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const SPH = new THREE.SphereGeometry(1, 12, 10);
const PLANE = new THREE.PlaneGeometry(1, 1);

// set by buildLevel — model swaps fall back to procedural when absent
let ASSETS = null;
export function setPropAssets(a) { ASSETS = a; }
export { setCharacterAssets };

// wrap a model so its base sits at y=0, centered in x/z
function grounded(g) {
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  g.position.x -= c.x; g.position.z -= c.z; g.position.y -= box.min.y;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

export function B(w, h, d, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
export function C(r, h, mat, x = 0, y = 0, z = 0, radial = null) {
  const m = new THREE.Mesh(radial || CYL, mat);
  m.scale.set(r, h, r); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function S(r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(SPH, mat);
  m.scale.set(r, r, r); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
export function P(w, h, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(PLANE, mat);
  m.scale.set(w, h, 1); m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export function barrel(M, open = false) {
  const model = ASSETS && ASSETS.model('barrel_03');
  if (model) {
    const g = grounded(model);
    if (open) {
      const fire = C(0.26, 0.03, M.fire, 0, 0.88, 0);
      g.add(fire); g.userData.fire = fire;
    }
    return g;
  }
  const g = new THREE.Group();
  g.add(C(0.32, 0.92, M.rust, 0, 0.46, 0));
  g.add(C(0.335, 0.04, M.steelDark, 0, 0.25, 0));
  g.add(C(0.335, 0.04, M.steelDark, 0, 0.68, 0));
  if (open) {
    const fire = C(0.28, 0.03, M.fire, 0, 0.9, 0);
    g.add(fire); g.userData.fire = fire;
  }
  return g;
}

export function stove(M) {
  const g = new THREE.Group();
  // legs
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]])
    g.add(B(0.05, 0.18, 0.05, M.steelDark, x, 0.09, z));
  // firebox body
  g.add(B(0.55, 0.5, 0.5, M.steelDark, 0, 0.43, 0));
  g.add(B(0.57, 0.04, 0.52, M.rust, 0, 0.7, 0));           // top plate
  // feed door + hinge + handle
  g.add(B(0.3, 0.26, 0.03, M.rust, 0, 0.42, 0.26));
  g.add(B(0.04, 0.04, 0.05, M.steel, 0.12, 0.42, 0.28));
  // fire glow slit
  const glow = B(0.24, 0.03, 0.02, M.fire, 0, 0.3, 0.27, false);
  g.add(glow); g.userData.fire = glow;
  // chimney pipe up + elbow
  g.add(C(0.07, 1.4, M.rustPipe, 0, 1.4, -0.12));
  g.add(C(0.09, 0.06, M.rust, 0, 0.78, -0.12));
  const elbow = C(0.07, 0.4, M.rustPipe, 0, 2.1, -0.3); elbow.rotation.x = Math.PI / 2; g.add(elbow);
  // kettle / pot on top
  g.add(C(0.12, 0.16, M.steelDark, 0.14, 0.8, 0.05));
  g.add(C(0.13, 0.02, M.rust, 0.14, 0.89, 0.05));
  const spout = C(0.02, 0.12, M.steelDark, 0.26, 0.82, 0.05); spout.rotation.z = 0.7; g.add(spout);
  return g;
}

export function crate(M, s = 1) {
  const g = new THREE.Group();
  g.add(B(0.8 * s, 0.55 * s, 0.55 * s, M.wood, 0, 0.275 * s, 0));
  g.add(B(0.7 * s, 0.02, 0.45 * s, M.rubber, 0, 0.545 * s, 0)); // dark interior under the lid
  g.add(B(0.06 * s, 0.55 * s, 0.57 * s, M.steelDark, -0.3 * s, 0.275 * s, 0));
  g.add(B(0.06 * s, 0.55 * s, 0.57 * s, M.steelDark, 0.3 * s, 0.275 * s, 0));
  // hinged lid
  const lid = new THREE.Group();
  lid.position.set(0, 0.52 * s, -0.285 * s);
  lid.add(B(0.82 * s, 0.06 * s, 0.57 * s, M.wood, 0, 0.03 * s, 0.285 * s));
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

export function milCrate(M) {
  const model = ASSETS && ASSETS.model('old_military_crate');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(B(0.9, 0.45, 0.5, M.canvasCloth2, 0, 0.225, 0));
  g.add(B(0.92, 0.05, 0.52, M.steelDark, 0, 0.45, 0));
  g.add(B(0.1, 0.45, 0.52, M.steelDark, -0.35, 0.225, 0));
  g.add(B(0.1, 0.45, 0.52, M.steelDark, 0.35, 0.225, 0));
  return g;
}

export function sandbags(M, w = 2.4, rows = 3) {
  const g = new THREE.Group();
  for (let r = 0; r < rows; r++) {
    const n = Math.floor(w / 0.45);
    for (let i = 0; i < n; i++) {
      const bag = B(0.46, 0.2, 0.3, M.canvasCloth, -w / 2 + 0.23 + i * 0.45 + (r % 2) * 0.2, 0.1 + r * 0.19, (Math.random() - 0.5) * 0.06);
      bag.rotation.y = (Math.random() - 0.5) * 0.25;
      g.add(bag);
    }
  }
  return g;
}

export function bed(M) {
  const g = new THREE.Group();
  g.add(B(0.9, 0.12, 2.0, M.steelDark, 0, 0.28, 0));
  g.add(B(0.85, 0.14, 1.9, M.mattress, 0, 0.4, 0));
  g.add(B(0.85, 0.08, 1.1, M.blanket, 0, 0.48, 0.35));
  g.add(B(0.5, 0.1, 0.35, M.canvasCloth2, 0, 0.5, -0.7));
  for (const [x, z] of [[-0.4, -0.95], [0.4, -0.95], [-0.4, 0.95], [0.4, 0.95]])
    g.add(B(0.06, 0.3, 0.06, M.steelDark, x, 0.15, z));
  g.add(B(0.9, 0.5, 0.05, M.steelDark, 0, 0.5, -1.0));
  return g;
}

export function tent(M, cloth = null) {
  const g = new THREE.Group();
  const mat = cloth || M.canvasCloth;
  const geo = new THREE.CylinderGeometry(1.5, 1.5, 2.6, 3, 1);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2; m.rotation.z = Math.PI / 2;
  m.scale.set(1, 1, 0.75);
  m.position.y = 0.95;
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.add(B(2.4, 0.05, 2.5, M.rubber, 0, 0.03, 0));
  return g;
}

export function table(M, w = 1.4, d = 0.7) {
  const g = new THREE.Group();
  g.add(B(w, 0.05, d, M.wood, 0, 0.78, 0));
  for (const [x, z] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]])
    g.add(B(0.06, 0.78, 0.06, M.wood, x, 0.39, z));
  return g;
}

export function chair(M) {
  const g = new THREE.Group();
  g.add(B(0.42, 0.04, 0.42, M.wood, 0, 0.45, 0));
  g.add(B(0.42, 0.5, 0.04, M.wood, 0, 0.72, -0.19));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]])
    g.add(B(0.04, 0.45, 0.04, M.wood, x, 0.225, z));
  return g;
}

export function shelf(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(B(1.6, 0.04, 0.45, M.steelDark, 0, 0.3 + i * 0.5, 0));
  g.add(B(0.05, 1.85, 0.45, M.steelDark, -0.78, 0.92, 0));
  g.add(B(0.05, 1.85, 0.45, M.steelDark, 0.78, 0.92, 0));
  // clutter
  for (let i = 0; i < 6; i++) {
    g.add(B(0.15 + Math.random() * 0.2, 0.15 + Math.random() * 0.2, 0.2, Math.random() < 0.5 ? M.wood : M.canvasCloth2,
      -0.6 + Math.random() * 1.2, 0.42 + (i % 3) * 0.5, (Math.random() - 0.5) * 0.15));
  }
  return g;
}

export function locker(M) {
  const g = new THREE.Group();
  // hollow shell: back, sides, top, bottom
  g.add(B(0.6, 1.9, 0.03, M.panel, 0, 0.95, -0.21));
  g.add(B(0.03, 1.9, 0.45, M.panel, -0.285, 0.95, 0));
  g.add(B(0.03, 1.9, 0.45, M.panel, 0.285, 0.95, 0));
  g.add(B(0.6, 0.03, 0.45, M.panel, 0, 1.885, 0));
  g.add(B(0.6, 0.03, 0.45, M.panel, 0, 0.015, 0));
  g.add(B(0.54, 0.02, 0.4, M.steelDark, 0, 1.1, 0)); // interior shelf
  g.add(B(0.2, 0.16, 0.22, M.canvasCloth2, -0.1, 1.2, -0.05)); // forgotten kit
  // hinged door
  const door = new THREE.Group();
  door.position.set(-0.285, 0, 0.225);
  door.add(B(0.57, 1.86, 0.025, M.panel, 0.285, 0.95, 0));
  door.add(B(0.02, 0.12, 0.04, M.steelDark, 0.5, 0.95, 0.03)); // handle
  for (let i = 0; i < 3; i++) door.add(B(0.3, 0.015, 0.01, M.rubber, 0.285, 1.5 + i * 0.06, 0.014)); // vents
  g.add(door);
  g.userData.door = door;
  return g;
}

export function lantern(M) {
  const g = new THREE.Group();
  g.add(C(0.09, 0.03, M.steelDark, 0, 0.02, 0));
  g.add(C(0.06, 0.16, M.lampWarm, 0, 0.13, 0));
  g.add(C(0.08, 0.03, M.steelDark, 0, 0.23, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 12, Math.PI), M.steelDark);
  handle.position.y = 0.25; g.add(handle);
  return g;
}

export function fluorTube(M, on = true) {
  const g = new THREE.Group();
  g.add(B(1.3, 0.06, 0.12, M.steelDark, 0, 0, 0));
  const tube = C(0.03, 1.2, on ? M.lampCold.clone() : M.lampOff, 0, -0.05, 0);
  tube.rotation.z = Math.PI / 2;
  g.add(tube);
  g.userData.tube = tube;
  return g;
}

export function tunnelLamp(M, on = true) {
  const g = new THREE.Group();
  g.add(B(0.16, 0.1, 0.1, M.steelDark, 0, 0.05, 0));
  const bulb = S(0.07, on ? M.lampWarm.clone() : M.lampOff, 0, -0.05, 0);
  g.add(bulb);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 5, 10), M.steelDark);
  cage.rotation.x = Math.PI / 2; cage.position.y = -0.05; g.add(cage);
  g.userData.bulb = bulb;
  return g;
}

export function emergencyLight(M) {
  const g = new THREE.Group();
  g.add(B(0.18, 0.08, 0.1, M.steelDark, 0, 0.04, 0));
  const dome = S(0.08, M.lampRed.clone(), 0, -0.03, 0);
  dome.scale.y = 0.6;
  g.add(dome);
  g.userData.bulb = dome;
  return g;
}

export function pipesRun(M, len, n = 3, y = 2.6) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const p = C(0.06 + i * 0.025, len, i === 1 ? M.rustPipe : M.steelDark, 0, y + i * 0.22, 0);
    p.rotation.x = Math.PI / 2;
    g.add(p);
    for (let z = -len / 2 + 3; z < len / 2; z += 6) {
      const ring = C(0.09 + i * 0.025, 0.08, M.rust, 0, y + i * 0.22, z);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
  }
  // valve
  const v = C(0.16, 0.05, M.rust, 0, y + 0.22, -len / 4);
  v.rotation.z = Math.PI / 2;
  g.add(v);
  return g;
}

export function cable(M, pts, r = 0.02) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 24, r, 5);
  const m = new THREE.Mesh(geo, M.rubber);
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

export function railTrack(M, len) {
  const g = new THREE.Group();
  for (const x of [-0.75, 0.75]) {
    const rail = B(0.07, 0.14, len, M.rail, x, 0.07, 0);
    g.add(rail);
    // rail foot flange
    g.add(B(0.13, 0.03, len, M.rail, x, 0.015, 0));
  }
  const sleeperGeo = new THREE.BoxGeometry(1.9, 0.09, 0.22);
  const count = Math.floor(len / 0.7);
  const inst = new THREE.InstancedMesh(sleeperGeo, M.wood, count);
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    // worn sleepers: slight yaw/roll variance, a few sunken
    eu.set((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.05);
    q.setFromEuler(eu);
    const sink = Math.random() < 0.15 ? 0.02 : 0;
    mat4.compose(new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.045 - sink, -len / 2 + 0.35 + i * 0.7), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, mat4);
  }
  inst.receiveShadow = true;
  g.add(inst);
  // tie plates + bolts where rails cross sleepers
  const plateGeo = new THREE.BoxGeometry(0.2, 0.02, 0.26);
  const plates = new THREE.InstancedMesh(plateGeo, M.rust, count * 2);
  let pi = 0;
  for (let i = 0; i < count; i++) {
    for (const x of [-0.75, 0.75]) {
      mat4.makeTranslation(x, 0.1, -len / 2 + 0.35 + i * 0.7);
      plates.setMatrixAt(pi++, mat4);
    }
  }
  plates.receiveShadow = true;
  g.add(plates);
  return g;
}

// Explorable metro carriage (81-717 style). Length along Z, interior floor at y=0.15.
// Collider envelope is fixed by level.js trainColliders: W=2.9, H=2.9, doors at ±len/4
// with a 1.3m clear gap. Do not change those dimensions without updating the colliders.
export function trainCar(M, opts = {}) {
  const g = new THREE.Group();
  const W = 2.9, H = 2.9, L = opts.len || 14;
  const floorY = 0.15;
  const wallX = W / 2 - 0.05;                 // 1.4 — side-wall plane used by colliders
  const doorZ = opts.doorZ ?? [-L / 4, L / 4];
  const DH = 0.65;                            // half door gap (1.3m clear) — matches colliders
  const sillY = floorY + 1.0, headY = floorY + 2.3;   // window band
  const ceilY = floorY + H - 0.3;             // interior ceiling

  // instancing helper for repeated fittings (rivets, straps, bolts…) — one draw call each
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
    _v = new THREE.Vector3(), _s = new THREE.Vector3();
  const inst = (geo, mat, list, shadow = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      _e.set(t.r ? t.r[0] : 0, t.r ? t.r[1] : 0, t.r ? t.r[2] : 0); _q.setFromEuler(_e);
      _v.set(t.p[0], t.p[1], t.p[2]);
      _s.set(t.s ? t.s[0] : 1, t.s ? t.s[1] : 1, t.s ? t.s[2] : 1);
      _m4.compose(_v, _q, _s); im.setMatrixAt(i, _m4);
    });
    im.castShadow = shadow; im.receiveShadow = true;
    g.add(im); return im;
  };

  // ================= UNDERFRAME & FLOOR =================
  g.add(B(W - 0.2, 0.22, L - 0.4, M.steelDark, 0, floorY - 0.18, 0));   // main underframe
  g.add(B(W, 0.1, L, M.trainIn, 0, floorY, 0));                          // floor slab
  g.add(B(0.9, 0.012, L - 0.6, M.rubber, 0, floorY + 0.056, 0, false));  // anti-slip aisle
  for (const side of [-1, 1]) {
    g.add(B(0.12, 0.014, L - 0.6, M.steelDark, side * (W / 2 - 0.35), floorY + 0.057, 0, false));
    g.add(B(0.06, 0.5, L - 1.2, M.train, side * (W / 2 - 0.02), floorY - 0.35, 0)); // side skirt
  }

  // ================= ROOF =================
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(W / 2 + 0.1, W / 2 + 0.1, L, 18, 1, true, 0, Math.PI), M.train);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  roof.scale.set(1, 1, 0.45);
  roof.position.y = floorY + H - 0.6;
  roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  const ribGeo = new THREE.TorusGeometry(W / 2 + 0.08, 0.025, 5, 16, Math.PI);
  const ribs = [];
  for (let z = -L / 2 + 1; z < L / 2 - 0.5; z += 2) ribs.push({ p: [0, floorY + H - 0.6, z], r: [0, Math.PI / 2, Math.PI / 2], s: [1, 1, 0.45] });
  inst(ribGeo, M.steelDark, ribs);
  for (const z of [-L / 3, L / 3]) {           // roof ventilator domes
    g.add(C(0.22, 0.12, M.steelDark, 0, floorY + H - 0.28, z));
    g.add(C(0.26, 0.04, M.rust, 0, floorY + H - 0.2, z));
  }

  // ================= SIDE WALLS, WINDOWS & DOORS =================
  for (const side of [-1, 1]) {
    const x = side * wallX;
    g.add(B(0.08, 1.0, L, M.train, x, floorY + 0.5, 0));                 // lower wall
    g.add(B(0.08, 0.55, L, M.train, x, floorY + H - 0.55, 0));           // upper wall
    // vertical panel seams on the lower wall (pressed-steel body panels)
    for (let z = -L / 2 + 1.4; z < L / 2 - 0.7; z += 1.4) {
      if (doorZ.some(dz => Math.abs(z - dz) < DH + 0.3)) continue;
      g.add(B(0.02, 0.96, 0.03, M.steelDark, x + side * 0.045, floorY + 0.5, z, false));
    }
    // window band: pillars, gasketed panes, some smashed
    const segs = [[-L / 2, doorZ[0] - DH], [doorZ[0] + DH, doorZ[1] - DH], [doorZ[1] + DH, L / 2]];
    for (const [z0, z1] of segs) {
      const len = z1 - z0; if (len <= 0) continue;
      const n = Math.max(1, Math.round(len / 1.4));
      for (let i = 0; i <= n; i++) g.add(B(0.09, headY - sillY, 0.12, M.train, x, (sillY + headY) / 2, z0 + (len * i) / n));
      // continuous sill + header rails
      g.add(B(0.1, 0.07, len, M.steelDark, x, sillY - 0.02, (z0 + z1) / 2));
      g.add(B(0.1, 0.07, len, M.steelDark, x, headY + 0.02, (z0 + z1) / 2));
      for (let i = 0; i < n; i++) {
        const paneZ = z0 + (len * (i + 0.5)) / n, paneW = len / n - 0.14;
        g.add(B(0.05, 0.06, paneW + 0.1, M.steelDark, x, headY - 0.03, paneZ));
        g.add(B(0.05, 0.06, paneW + 0.1, M.steelDark, x, sillY + 0.03, paneZ));
        if (Math.random() < 0.3) {
          for (let s = 0; s < 3; s++) {        // jagged shards left in a broken frame
            const shard = B(0.02, 0.15 + Math.random() * 0.2, 0.1 + Math.random() * 0.15, M.glass, x, sillY + 0.1 + Math.random() * 0.1, paneZ - paneW / 2 + Math.random() * paneW, false);
            shard.rotation.x = (Math.random() - 0.5) * 0.4; g.add(shard);
          }
        } else {
          g.add(B(0.03, headY - sillY - 0.1, paneW, M.glass, x, (sillY + headY) / 2, paneZ, false));
          g.add(B(0.035, headY - sillY - 0.06, 0.03, M.rubber, x, (sillY + headY) / 2, paneZ - paneW / 2, false)); // gasket
          g.add(B(0.035, headY - sillY - 0.06, 0.03, M.rubber, x, (sillY + headY) / 2, paneZ + paneW / 2, false));
        }
      }
    }
    // doorways: frame, recessed sliding leaf + pocket, exterior grab handles, route board
    for (const dz of doorZ) {
      g.add(B(0.1, 2.2, 0.12, M.steelDark, x, floorY + 1.1, dz - DH));   // posts
      g.add(B(0.1, 2.2, 0.12, M.steelDark, x, floorY + 1.1, dz + DH));
      g.add(B(0.1, 0.16, DH * 2 + 0.12, M.steelDark, x, floorY + 2.26, dz)); // header
      g.add(B(0.06, 0.05, DH * 2, M.rubber, x, floorY + 0.03, dz, false));   // threshold
      // leaf slid open into its pocket (a sliver visible at the trailing edge)
      const leaf = B(0.05, 2.05, 0.5, M.trainIn, x + side * 0.02, floorY + 1.05, dz + DH + 0.28);
      g.add(leaf);
      g.add(B(0.055, 0.5, 0.3, M.glass, x + side * 0.02, floorY + 1.5, dz + DH + 0.28, false)); // leaf window
      g.add(B(0.07, 2.1, 0.55, M.train, x + side * 0.05, floorY + 1.05, dz + DH + 0.3));        // pocket panel
      // vertical grab handles either side of the door
      for (const off of [-DH - 0.18, DH + 0.18]) {
        const h = C(0.02, 1.5, M.steel, x + side * 0.09, floorY + 1.1, dz + off);
        g.add(h);
        g.add(B(0.05, 0.05, 0.05, M.steelDark, x + side * 0.07, floorY + 1.8, dz + off, false));
        g.add(B(0.05, 0.05, 0.05, M.steelDark, x + side * 0.07, floorY + 0.4, dz + off, false));
      }
      // destination / route board above the door
      const board = P(0.9, 0.22, M.lampOff, x + side * 0.05, floorY + 2.5, dz);
      board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(board);
    }
    // exterior rivet lines (instanced)
    const rivets = [];
    for (let z = -L / 2 + 0.4; z < L / 2 - 0.3; z += 0.5) {
      rivets.push({ p: [x + side * 0.05, floorY + 0.95, z] });
      rivets.push({ p: [x + side * 0.05, floorY + 0.12, z] });
    }
    inst(new THREE.BoxGeometry(0.02, 0.02, 0.02), M.steelDark, rivets, false);
  }

  // ================= END WALLS =================
  for (const end of [-1, 1]) {
    const z = end * (L / 2 - 0.05);
    g.add(B(W / 2 - 0.5, H - 0.4, 0.08, M.train, -(W / 4 + 0.25), floorY + (H - 0.4) / 2, z));
    g.add(B(W / 2 - 0.5, H - 0.4, 0.08, M.train, W / 4 + 0.25, floorY + (H - 0.4) / 2, z));
    g.add(B(1.0, 0.5, 0.08, M.train, 0, floorY + H - 0.65, z));           // gangway header
    g.add(B(1.0, 0.06, 0.1, M.steelDark, 0, floorY + 2.2, z));            // gangway frame
    // end windows
    for (const sx of [-1, 1]) g.add(B(0.5, 0.6, 0.03, M.glass, sx * (W / 4 + 0.25), floorY + 1.7, z + end * 0.05, false));
    // head / tail light clusters
    for (const sx of [-1, 1]) {
      g.add(C(0.09, 0.06, M.steelDark, sx * 0.9, floorY + 0.5, z + end * 0.06));
      g.add(C(0.06, 0.03, end < 0 ? M.lampWarm : M.lampRed, sx * 0.9, floorY + 0.5, z + end * 0.09));
    }
    // coupler + buffer gear below the gangway
    g.add(B(0.3, 0.25, 0.5, M.steelDark, 0, floorY - 0.35, z + end * 0.2));
    const coupler = C(0.09, 0.4, M.rust, 0, floorY - 0.35, z + end * 0.45); coupler.rotation.x = Math.PI / 2; g.add(coupler);
    for (const sx of [-1, 1]) { const buf = C(0.1, 0.12, M.rust, sx * 0.7, floorY - 0.3, z + end * 0.12); buf.rotation.x = Math.PI / 2; g.add(buf); }
    // car number board
    const num = P(0.7, 0.24, M.lampOff, 0, floorY + H - 0.4, z + end * 0.05);
    num.rotation.y = end > 0 ? 0 : Math.PI; g.add(num);
  }

  // ================= INTERIOR: SEATS =================
  for (const side of [-1, 1]) {
    const sx = side * (W / 2 - 0.35);
    for (let z = -L / 2 + 1.2; z < L / 2 - 1; z += 2.2) {
      if (doorZ.some(dz => Math.abs(z - dz) < 1.2)) continue;
      // bench frame + legs
      g.add(B(0.45, 0.06, 1.7, M.steelDark, sx, floorY + 0.42, z));
      for (const lz of [-0.7, 0.7]) g.add(B(0.4, 0.4, 0.06, M.steelDark, sx, floorY + 0.2, z + lz));
      // worn seat cushion + backrest against the wall
      g.add(B(0.44, 0.09, 1.66, M.mattress, sx, floorY + 0.49, z));
      g.add(B(0.08, 0.55, 1.66, M.mattress, side * (W / 2 - 0.12), floorY + 0.82, z));
      // seat dividers / armrests
      for (const lz of [-0.83, 0, 0.83]) g.add(B(0.42, 0.05, 0.05, M.steel, sx, floorY + 0.55, z + lz, false));
    }
  }
  // a collapsed, torn seat near one end
  const fallen = B(0.45, 0.08, 1.4, M.wood, 0.3, floorY + 0.12, -L / 2 + 2.2);
  fallen.rotation.z = 0.4; fallen.rotation.y = 0.3; g.add(fallen);
  const tornCushion = B(0.4, 0.06, 0.6, M.mattress, 0.5, floorY + 0.08, -L / 2 + 2.6, false);
  tornCushion.rotation.y = 0.6; g.add(tornCushion);

  // ================= INTERIOR: STANCHIONS & RAILS =================
  for (const dz of doorZ) {
    for (const px of [-0.7, 0.7]) g.add(C(0.025, H - 0.6, M.steel, px, floorY + (H - 0.6) / 2, dz));
  }
  // centre stanchions between doors
  for (let z = -L / 2 + 2.4; z < L / 2 - 2; z += 2.6) {
    if (doorZ.some(dz => Math.abs(z - dz) < 1.0)) continue;
    g.add(C(0.025, H - 0.6, M.steel, 0, floorY + (H - 0.6) / 2, z));
  }
  // overhead grab rails (both sides + centre) with hanging straps (instanced)
  const strapDrop = [], strapLoop = [];
  const loopGeo = new THREE.TorusGeometry(0.05, 0.012, 5, 10);
  for (const rx of [-(W / 2 - 0.5), 0, W / 2 - 0.5]) {
    const rail = C(0.02, L - 2, M.steel, rx, floorY + H - 0.55, 0);
    rail.rotation.x = Math.PI / 2; g.add(rail);
    for (let z = -L / 2 + 1.6; z < L / 2 - 1.4; z += 1.1) {
      if (doorZ.some(dz => Math.abs(z - dz) < 0.9)) continue;
      strapDrop.push({ p: [rx, floorY + H - 0.66, z] });
      strapLoop.push({ p: [rx, floorY + H - 0.78, z] });
    }
  }
  inst(new THREE.BoxGeometry(0.02, 0.16, 0.02), M.rubber, strapDrop, false);
  inst(loopGeo, M.rubber, strapLoop, false);
  // luggage racks
  for (const side of [-1, 1]) {
    const rack = B(0.4, 0.03, L - 1.6, M.steelDark, side * (W / 2 - 0.32), floorY + H - 0.75, 0);
    rack.rotation.z = side * 0.12; g.add(rack);
    g.add(B(0.03, 0.12, L - 1.6, M.steelDark, side * (W / 2 - 0.14), floorY + H - 0.7, 0));
  }

  // ================= INTERIOR: CEILING & LIGHTS =================
  g.add(B(W - 0.5, 0.04, L - 0.8, M.trainIn, 0, ceilY + 0.12, 0, false)); // ceiling panel
  const nFix = Math.max(2, Math.round(L / 3.5));
  for (let i = 0; i < nFix; i++) {
    const z = -L / 2 + 1.2 + (i * (L - 2.4)) / Math.max(1, nFix - 1);
    g.add(B(0.5, 0.06, 0.18, M.steelDark, 0, ceilY + 0.06, z));
    const broken = Math.random() < 0.35;
    const tube = B(0.44, 0.03, 0.12, broken ? M.lampOff : M.lampOff, 0, ceilY + 0.02, z, false);
    if (broken) { tube.rotation.z = 0.3; tube.position.y -= 0.06; }   // one tube hanging loose
    g.add(tube);
  }
  // advert / route-map frames above the windows
  for (const side of [-1, 1]) {
    for (let z = -L / 2 + 2; z < L / 2 - 1.5; z += 3) {
      if (doorZ.some(dz => Math.abs(z - dz) < 1.2)) continue;
      const fr = P(0.7, 0.3, M.paper, side * (W / 2 - 0.09), floorY + 2.5, z);
      fr.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(fr);
    }
  }

  // ================= BOGIES & RUNNING GEAR =================
  for (const z of [-L / 2 + 2, L / 2 - 2]) {
    g.add(B(2.2, 0.4, 2.4, M.steelDark, 0, -0.3, z));                   // bogie frame
    for (const dz of [-0.8, 0.8]) {
      const axle = C(0.06, 1.9, M.steelDark, 0, -0.55, z + dz); axle.rotation.z = Math.PI / 2; g.add(axle);
      for (const dx of [-0.85, 0.85]) {
        const wheel = C(0.32, 0.1, M.steelDark, dx, -0.55, z + dz); wheel.rotation.z = Math.PI / 2; g.add(wheel);
        const tyre = C(0.34, 0.06, M.rust, dx, -0.55, z + dz); tyre.rotation.z = Math.PI / 2; g.add(tyre);
        const hub = C(0.1, 0.12, M.steel, dx, -0.55, z + dz); hub.rotation.z = Math.PI / 2; g.add(hub);
        // axle box + leaf spring
        g.add(B(0.22, 0.24, 0.2, M.rust, dx, -0.32, z + dz));
        g.add(B(0.16, 0.08, 0.5, M.steelDark, dx, -0.18, z + dz));
      }
      g.add(B(1.8, 0.1, 0.1, M.rust, 0, -0.55, z + dz));                // brake rigging
    }
    const brakeCyl = C(0.12, 0.5, M.rust, 0.9, -0.3, z); brakeCyl.rotation.x = Math.PI / 2; g.add(brakeCyl);
    g.add(B(0.3, 0.3, 0.8, M.rust, -0.9, -0.3, z));
  }
  // underfloor battery box, air tanks, compressor, conduit
  g.add(B(1.2, 0.4, 2.2, M.steelDark, 0, -0.3, 0));
  const airTank = C(0.18, 1.6, M.rust, -0.6, -0.35, 0); airTank.rotation.x = Math.PI / 2; g.add(airTank);
  const airTank2 = C(0.15, 1.2, M.rust, 0.6, -0.35, 0.4); airTank2.rotation.x = Math.PI / 2; g.add(airTank2);
  g.add(B(0.5, 0.35, 0.6, M.panel, 0.3, -0.32, -1.6));                  // compressor
  const conduit = C(0.04, L - 3, M.rubber, 0.4, -0.18, 0); conduit.rotation.x = Math.PI / 2; g.add(conduit);

  // ================= WEATHERING & DAMAGE =================
  const grime = P(W - 0.4, L - 1, M.dirt, 0, floorY + 0.06, 0);
  grime.rotation.x = -Math.PI / 2; g.add(grime);
  // graffiti on the exterior flank (platform-facing side)
  const graf = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: TX.graffitiTexture('МЕТРО 2039', '#5a6a7a'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  graf.scale.set(2.6, 1.1, 1);
  graf.position.set(-wallX - 0.06, floorY + 0.55, -L / 2 + 2.4); graf.rotation.y = -Math.PI / 2; g.add(graf);
  // a dented / scorched panel near one door
  const dent = B(0.02, 0.7, 0.9, M.rust, -wallX - 0.05, floorY + 0.5, doorZ[1] + 1.6, false);
  dent.rotation.y = 0.04; g.add(dent);
  // broken glass + debris scattered on the floor
  for (let i = 0; i < 6; i++) {
    const sh = B(0.06 + Math.random() * 0.08, 0.01, 0.05 + Math.random() * 0.06, M.glass,
      (Math.random() - 0.5) * (W - 1), floorY + 0.06, -L / 2 + 1 + Math.random() * (L - 2), false);
    sh.rotation.y = Math.random() * Math.PI; g.add(sh);
  }
  g.userData.floorY = floorY;
  return g;
}

export function rubble(M, r = 1.2, n = 8) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = 0.15 + Math.random() * 0.4;
    const m = B(s, s * (0.5 + Math.random()), s, Math.random() < 0.7 ? M.concreteDark : M.rust,
      (Math.random() - 0.5) * r * 2, s * 0.25, (Math.random() - 0.5) * r * 2);
    m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
    g.add(m);
  }
  // twisted rebar poking out of the concrete
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const len = 0.3 + Math.random() * 0.5;
    const bar = C(0.012, len, M.rust, (Math.random() - 0.5) * r * 1.6, 0.1, (Math.random() - 0.5) * r * 1.6);
    bar.rotation.set(Math.random() * 1.2 - 0.6, Math.random() * Math.PI, Math.random() * 1.2 - 0.6);
    g.add(bar);
  }
  const dust = P(r * 2.4, r * 2.4, M.dirt, 0, 0.012, 0);
  dust.rotation.x = -Math.PI / 2;
  g.add(dust);
  return g;
}

export function barricade(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = B(1.8, 0.16, 0.05, M.wood, (Math.random() - 0.5) * 0.3, 0.3 + i * 0.32, (Math.random() - 0.5) * 0.2);
    p.rotation.z = (Math.random() - 0.5) * 0.35;
    p.rotation.y = (Math.random() - 0.5) * 0.4;
    g.add(p);
  }
  g.add(B(0.12, 1.7, 0.12, M.wood, -0.7, 0.85, 0));
  g.add(B(0.12, 1.7, 0.12, M.wood, 0.7, 0.85, 0));
  return g;
}

export function generator(M) {
  const g = new THREE.Group();
  // skid frame
  g.add(B(1.7, 0.12, 1.1, M.steelDark, 0, 0.06, 0));
  for (const [x, z] of [[-0.75, -0.45], [0.75, -0.45], [-0.75, 0.45], [0.75, 0.45]])
    g.add(B(0.12, 0.1, 0.12, M.rubber, x, 0.02, z)); // vibration mounts
  // engine block with cooling fins
  g.add(B(0.9, 0.65, 0.7, M.panel, -0.25, 0.5, 0));
  for (let i = 0; i < 6; i++) g.add(B(0.86, 0.03, 0.74, M.steelDark, -0.25, 0.28 + i * 0.09, 0));
  // cylinder head + exhaust manifold
  g.add(B(0.5, 0.18, 0.4, M.rust, -0.25, 0.92, 0));
  const exhaust = C(0.06, 1.3, M.rustPipe, 0.15, 1.5, -0.25);
  g.add(exhaust);
  const muffler = C(0.12, 0.5, M.rust, 0.15, 1.15, -0.25);
  g.add(muffler);
  // alternator (cylinder) + belt drive
  const alt = C(0.22, 0.45, M.steelDark, 0.55, 0.45, 0);
  alt.rotation.z = Math.PI / 2;
  g.add(alt);
  const pulley1 = C(0.12, 0.04, M.rust, 0.32, 0.45, 0);
  pulley1.rotation.z = Math.PI / 2; g.add(pulley1);
  const pulley2 = C(0.08, 0.04, M.rust, 0.32, 0.75, 0);
  pulley2.rotation.z = Math.PI / 2; g.add(pulley2);
  g.add(B(0.03, 0.34, 0.05, M.rubber, 0.32, 0.6, 0)); // belt
  // fuel tank on top with cap + line
  g.add(B(0.7, 0.3, 0.5, M.rust, -0.25, 1.15, 0.1));
  g.add(C(0.07, 0.05, M.hazard, -0.45, 1.32, 0.1));
  const fuelLine = C(0.015, 0.5, M.steelDark, -0.1, 0.95, 0.28);
  fuelLine.rotation.x = 0.4; g.add(fuelLine);
  // control box with gauges
  g.add(B(0.45, 0.35, 0.12, M.steelDark, 0.55, 0.85, 0.35));
  for (const dx of [-0.1, 0.1]) {
    const gauge = C(0.055, 0.03, M.paper, 0.55 + dx, 0.9, 0.42);
    gauge.rotation.x = Math.PI / 2; g.add(gauge);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 14), M.steelDark);
    rim.position.set(0.55 + dx, 0.9, 0.43); g.add(rim);
    const needle = B(0.008, 0.04, 0.01, M.rubber, 0.55 + dx, 0.91, 0.44);
    needle.rotation.z = dx * 3; g.add(needle);
  }
  // starter lever
  const lever = B(0.05, 0.35, 0.05, M.hazard, -0.6, 0.9, 0.5);
  lever.rotation.x = 0.5;
  g.add(lever);
  g.userData.lever = lever;
  // output cable snaking to the floor
  g.add(cable(M, [new THREE.Vector3(0.6, 0.7, 0.3), new THREE.Vector3(0.9, 0.3, 0.6), new THREE.Vector3(1.2, 0.03, 0.9)], 0.025));
  // warning stripe + oil stain
  const stripe = P(1.6, 0.15, new THREE.MeshStandardMaterial({ map: M.tex.hazard, roughness: 0.8 }), 0, 0.14, 0.56);
  g.add(stripe);
  const oil = P(1.2, 0.9, M.dirt, 0.2, 0.015, 0.3);
  oil.rotation.x = -Math.PI / 2; g.add(oil);
  return g;
}

export function radioConsole(M) {
  const g = new THREE.Group();
  g.add(B(3.2, 0.9, 0.8, M.panel, 0, 0.45, 0));
  g.add(B(3.2, 0.06, 0.9, M.steelDark, 0, 0.93, 0));
  // angled panel
  const panel = B(3.0, 0.7, 0.1, M.steelDark, 0, 1.35, -0.25);
  panel.rotation.x = -0.35;
  g.add(panel);
  const screens = [];
  for (let i = 0; i < 3; i++) {
    const scr = P(0.5, 0.35, M.screen.clone(), -1 + i, 1.36, -0.19);
    scr.rotation.x = -0.35;
    g.add(scr); screens.push(scr);
  }
  // dials & switches
  for (let i = 0; i < 10; i++) {
    const dial = C(0.035, 0.04, i % 3 === 0 ? M.hazard : M.steel, -1.3 + i * 0.29, 1.05, -0.12);
    dial.rotation.x = Math.PI / 2 - 0.35;
    g.add(dial);
  }
  for (let i = 0; i < 6; i++) {
    g.add(B(0.03, 0.08, 0.03, M.steel, -1.2 + i * 0.45, 0.98, 0.25));
  }
  // rack towers
  for (const x of [-2.0, 2.0]) {
    g.add(B(0.7, 2.2, 0.6, M.panel, x, 1.1, -0.1));
    for (let i = 0; i < 5; i++) {
      g.add(B(0.55, 0.25, 0.03, M.steelDark, x, 0.4 + i * 0.4, 0.21));
      const led = S(0.02, i % 2 ? M.lampGreen.clone() : M.lampRed.clone(), x + 0.2, 0.4 + i * 0.4, 0.23);
      g.add(led);
    }
  }
  // microphone
  g.add(C(0.02, 0.25, M.steelDark, 0.8, 1.05, 0.3));
  g.add(S(0.05, M.rubber, 0.8, 1.2, 0.3));
  // the actual transmitter unit — a real vintage set on the desk
  const radio = ASSETS && ASSETS.model('vintage_radio_transceiver');
  if (radio) {
    const r = grounded(radio);
    r.position.set(-0.6, 0.96, 0.05);
    r.rotation.y = 0.15;
    g.add(r);
  }
  g.userData.screens = screens;
  return g;
}

export function breakerPanel(M) {
  const g = new THREE.Group();
  g.add(B(0.7, 1.0, 0.15, M.panel, 0, 0, 0));
  g.add(B(0.6, 0.9, 0.03, M.steelDark, 0, 0, 0.08));
  const lever = B(0.08, 0.3, 0.08, M.hazard, 0, -0.1, 0.14);
  lever.rotation.x = 0.6;
  g.add(lever);
  g.add(P(0.5, 0.15, new THREE.MeshBasicMaterial({ map: null, color: 0x8a7a1e }), 0, 0.35, 0.1));
  g.userData.lever = lever;
  return g;
}

// Swing door: pivot at hinge edge. Returns {group, pivot, panel}
export function doorMetal(M, w = 1.2, h = 2.3) {
  const g = new THREE.Group();
  g.add(B(0.15, h + 0.15, 0.25, M.steelDark, -w / 2 - 0.07, (h + 0.15) / 2, 0));
  g.add(B(0.15, h + 0.15, 0.25, M.steelDark, w / 2 + 0.07, (h + 0.15) / 2, 0));
  g.add(B(w + 0.3, 0.15, 0.25, M.steelDark, 0, h + 0.1, 0));
  const pivot = new THREE.Group();
  pivot.position.set(-w / 2, 0, 0);
  const panel = B(w, h, 0.08, M.panel, w / 2, h / 2, 0);
  pivot.add(panel);
  pivot.add(B(0.05, 0.3, 0.05, M.steel, w - 0.15, h / 2, 0.08));
  g.add(pivot);
  g.userData.pivot = pivot;
  g.userData.panel = panel;
  return g;
}

export function securityGate(M, w = 6.8, h = 5.2) {
  const g = new THREE.Group();
  // frame
  g.add(B(0.5, h + 0.4, 0.6, M.steelDark, -w / 2 - 0.25, (h + 0.4) / 2, 0));
  g.add(B(0.5, h + 0.4, 0.6, M.steelDark, w / 2 + 0.25, (h + 0.4) / 2, 0));
  g.add(B(w + 1.0, 0.5, 0.6, M.steelDark, 0, h + 0.25, 0));
  // sliding panel
  const panel = new THREE.Group();
  const slab = B(w, h, 0.25, M.hazard, 0, h / 2, 0);
  panel.add(slab);
  for (let i = 0; i < 5; i++) panel.add(B(w, 0.12, 0.3, M.steelDark, 0, 0.5 + i * 1.1, 0));
  panel.add(B(1.2, 0.5, 0.3, M.steelDark, 0, h / 2, 0));
  g.add(panel);
  g.userData.panel = panel;
  return g;
}

export function corpse(M) {
  const g = new THREE.Group();
  const torso = B(0.5, 0.22, 0.7, M.cloth, 0, 0.12, 0);
  g.add(torso);
  g.add(S(0.14, M.fleshDark, 0, 0.14, -0.5));
  g.add(B(0.14, 0.14, 0.6, M.cloth, -0.3, 0.08, 0.1));
  g.add(B(0.14, 0.14, 0.6, M.cloth, 0.3, 0.08, 0.15));
  g.add(B(0.16, 0.14, 0.7, M.cloth, -0.12, 0.08, 0.75));
  g.add(B(0.16, 0.14, 0.7, M.cloth, 0.14, 0.08, 0.7));
  const blood = P(1.6, 1.6, M.blood, 0, 0.02, 0.1);
  blood.rotation.x = -Math.PI / 2;
  g.add(blood);
  return g;
}

export function notePaper(M) {
  const g = new THREE.Group();
  const p = P(0.22, 0.3, M.paper, 0, 0.01, 0);
  p.rotation.x = -Math.PI / 2;
  p.rotation.z = Math.random() * 0.8;
  g.add(p);
  return g;
}

export function pickupMesh(M, kind) {
  const g = new THREE.Group();
  if (kind === 'pistolAmmo' || kind === 'rifleAmmo') {
    g.add(B(0.22, 0.12, 0.15, kind === 'rifleAmmo' ? M.canvasCloth2 : M.wood, 0, 0.06, 0));
    for (let i = 0; i < 4; i++) g.add(C(0.015, 0.07, M.hazard, -0.07 + i * 0.045, 0.15, 0));
  } else if (kind === 'medkit') {
    g.add(B(0.28, 0.16, 0.2, new THREE.MeshStandardMaterial({ color: 0x8a2a22, roughness: 0.7 }), 0, 0.08, 0));
    g.add(B(0.12, 0.03, 0.03, M.paper, 0, 0.17, 0));
    g.add(B(0.03, 0.03, 0.12, M.paper, 0, 0.17, 0));
  } else if (kind === 'filter') {
    g.add(C(0.08, 0.14, M.steelDark, 0, 0.07, 0));
    g.add(C(0.085, 0.03, M.hazard, 0, 0.15, 0));
  } else if (kind === 'battery') {
    g.add(B(0.14, 0.22, 0.08, M.steelDark, 0, 0.11, 0));
    g.add(B(0.1, 0.06, 0.09, M.hazard, 0, 0.16, 0));
  } else if (kind === 'fuel') {
    const model = ASSETS && ASSETS.model('metal_jerrycan');
    if (model) { g.add(grounded(model)); return g; }
    g.add(B(0.35, 0.45, 0.2, new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6, metalness: 0.4 }), 0, 0.225, 0));
    g.add(C(0.04, 0.08, M.steelDark, 0.1, 0.49, 0));
    g.add(B(0.15, 0.05, 0.05, M.steelDark, -0.05, 0.48, 0));
  } else if (kind === 'rifle') {
    g.add(B(0.06, 0.08, 0.9, M.steelDark, 0, 0.06, 0));
    g.add(B(0.05, 0.12, 0.3, M.wood, 0, 0.04, -0.35));
    g.add(B(0.04, 0.15, 0.08, M.wood, 0, -0.02, 0.1));
    g.add(B(0.03, 0.1, 0.2, M.steelDark, 0, -0.03, 0.25));
  }
  return g;
}

export function signPlane(tex, w, h) {
  const m = new THREE.Mesh(PLANE, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.scale.set(w, h, 1);
  m.receiveShadow = true;
  return m;
}

export function decalPlane(tex, w, h, basic = true) {
  const mat = basic
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 });
  const m = new THREE.Mesh(PLANE, mat);
  m.scale.set(w, h, 1);
  return m;
}

export function pillar(M, h = 7) {
  const g = new THREE.Group();
  g.add(B(0.9, h, 0.9, M.tiles, 0, h / 2, 0));
  g.add(B(1.2, 0.25, 1.2, M.concreteDark, 0, 0.12, 0));
  g.add(B(1.2, 0.25, 1.2, M.concreteDark, 0, h - 0.12, 0));
  return g;
}

export function chains(M, n, len, spread = 1.5) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const l = len * (0.6 + Math.random() * 0.4);
    const c = C(0.015, l, M.steelDark, (Math.random() - 0.5) * spread, -l / 2, (Math.random() - 0.5) * spread);
    g.add(c);
    if (Math.random() < 0.4) {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI * 1.5), M.steelDark);
      hook.position.set(c.position.x, -l, c.position.z);
      g.add(hook);
    }
  }
  return g;
}

export function ventFan(M) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 20), M.rust);
  g.add(ring);
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = B(0.5, 0.14, 0.03, M.steelDark, 0.26, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI) / 2;
    b.rotation.x = 0.5;
    holder.add(b);
    blades.add(holder);
  }
  g.add(blades);
  g.userData.blades = blades;
  return g;
}

export function puddle(M, r, rad = false) {
  const geo = new THREE.CircleGeometry(r, 18);
  const m = new THREE.Mesh(geo, rad ? M.radPuddle : M.puddle);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.receiveShadow = true;
  m.scale.set(1, 0.6 + Math.random() * 0.5, 1);
  return m;
}

export function machineBlock(M, w, h, d) {
  const g = new THREE.Group();
  g.add(B(w, h, d, M.panel, 0, h / 2, 0));
  g.add(B(w + 0.1, 0.15, d + 0.1, M.steelDark, 0, h + 0.05, 0));
  // pipes on top
  const p = C(0.1, w * 0.8, M.rustPipe, 0, h + 0.2, 0);
  p.rotation.z = Math.PI / 2;
  g.add(p);
  // vents & gauges
  g.add(B(w * 0.4, h * 0.3, 0.05, M.steelDark, -w * 0.2, h * 0.55, d / 2 + 0.03));
  g.add(C(0.08, 0.04, M.lampOff, w * 0.25, h * 0.7, d / 2 + 0.04));
  g.add(C(0.08, 0.04, M.hazard, w * 0.25, h * 0.45, d / 2 + 0.04));
  const stripe = P(w, 0.2, new THREE.MeshStandardMaterial({ map: M.tex.hazard, roughness: 0.8 }), 0, 0.15, d / 2 + 0.02);
  g.add(stripe);
  return g;
}

export function tank(M, r = 0.8, h = 2.4) {
  const g = new THREE.Group();
  g.add(C(r, h, M.rust, 0, h / 2, 0));
  const cap = S(r, M.rust, 0, h, 0);
  cap.scale.y = 0.4;
  g.add(cap);
  g.add(C(r + 0.03, 0.06, M.steelDark, 0, h * 0.3, 0));
  g.add(C(r + 0.03, 0.06, M.steelDark, 0, h * 0.7, 0));
  return g;
}

export function antenna(M, h = 3) {
  const g = new THREE.Group();
  g.add(C(0.03, h, M.steel, 0, h / 2, 0));
  for (let i = 0; i < 3; i++) {
    const y = h * (0.6 + i * 0.15);
    g.add(B(0.8 - i * 0.2, 0.02, 0.02, M.steel, 0, y, 0));
  }
  return g;
}

// Articulated human — used for NPCs and scavengers. Rig lives in characters.js.
export function humanBody(M, opts = {}) {
  return buildHuman(M, opts);
}

// ---- dressing props: shipped glTF models with procedural fallbacks ----

export function trashCan(M) {
  const model = ASSETS && ASSETS.model('metal_trash_can');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(C(0.28, 0.9, M.rust, 0, 0.45, 0));
  g.add(C(0.3, 0.04, M.steelDark, 0, 0.92, 0));
  return g;
}

export function cementBag(M) {
  const model = ASSETS && ASSETS.model('cement_bag');
  if (model) return grounded(model);
  const g = new THREE.Group();
  const bag = B(0.45, 0.16, 0.65, M.paper, 0, 0.08, 0);
  bag.rotation.y = 0.2;
  g.add(bag);
  return g;
}

export function ammoBox(M) {
  const model = ASSETS && ASSETS.model('ammo_box');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(B(0.26, 0.18, 0.1, M.canvasCloth2, 0, 0.09, 0));
  g.add(B(0.28, 0.03, 0.12, M.steelDark, 0, 0.19, 0));
  return g;
}

export function toolbox(M) {
  const model = ASSETS && ASSETS.model('metal_toolbox');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(B(0.4, 0.16, 0.3, M.rust, 0, 0.08, 0));
  g.add(B(0.42, 0.04, 0.32, M.steelDark, 0, 0.18, 0));
  g.add(B(0.12, 0.03, 0.04, M.steelDark, 0, 0.22, 0));
  return g;
}

export function pipeAssembly(M) {
  const model = ASSETS && ASSETS.model('modular_industrial_pipes_01');
  if (model) return grounded(model);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(C(0.05 + i * 0.02, 1.9, i === 1 ? M.rustPipe : M.steelDark, i * 0.18, 0.95, 0));
  return g;
}

// dead hanging fixture (no light — the functional lamps stay procedural). Origin = ceiling attach point.
export function hangingLamp(M) {
  const model = ASSETS && ASSETS.model('hanging_industrial_lamp');
  if (model) {
    const g = grounded(model);
    const wrap = new THREE.Group();
    g.position.y = -1.36; // cord top at origin
    wrap.add(g);
    return wrap;
  }
  const g = new THREE.Group();
  g.add(C(0.01, 0.8, M.rubber, 0, -0.4, 0));
  const shade = C(0.22, 0.15, M.steelDark, 0, -0.85, 0);
  g.add(shade);
  g.add(S(0.06, M.lampOff, 0, -0.92, 0));
  return g;
}

export function powerBox(M) {
  const model = ASSETS && ASSETS.model('power_box_01');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(B(0.5, 0.5, 0.09, M.panel, 0, 0.25, 0));
  g.add(B(0.4, 0.4, 0.02, M.steelDark, 0, 0.25, 0.05));
  return g;
}

export function decorCrate(M) {
  const model = ASSETS && ASSETS.model('wooden_crate_01');
  if (model) return grounded(model);
  return crate(M, 0.9);
}

export function fieldRadio(M) {
  const model = ASSETS && ASSETS.model('vintage_radio_transceiver');
  if (model) return grounded(model);
  const g = new THREE.Group();
  g.add(B(0.5, 0.3, 0.25, M.panel, 0, 0.15, 0));
  g.add(C(0.03, 0.04, M.lampGreen, -0.15, 0.2, 0.14));
  g.add(C(0.02, 0.3, M.steelDark, 0.2, 0.4, -0.1));
  return g;
}