// THE LAST SIGNAL — connected level: station, tunnels, facility, control room.
import * as THREE from 'three';
import * as P from './props.js';
import * as TX from '../core/textures.js';
import { CharacterAnimator } from '../ai/animation.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const NOTES = {
  note_beds: { title: 'Shift roster — Zastava', body: 'March 12. Water pump duty: Gosha.\nMarch 13. North tunnel watch: Borya, DOUBLE SHIFT.\nMarch 14. Nobody goes past the checkpoint. Nobody.\n\nIf you can read this, you are still alive. Do your shift.' },
  note_station_wall: { title: 'A letter, never sent', body: 'Mama,\n\nThey say the surface is clearing. They say birds came back to the dead city. I don\'t believe them. Down here the dark is honest.\n\nI keep your photo in my helmet. The glass is cracked but your face is not.\n\nYour Alyosha.' },
  note_train: { title: 'Scrawled on a seat', body: 'We hid in this car for three days. It was singing outside. Not a person. Not an animal. A voice like a wire pulled tight.\n\nDima went out to look. The singing stopped when he screamed.\n\nDon\'t follow the voice. — K.' },
  note_corpse: { title: 'Bloodstained page', body: 'Filter log: 4 left. Used one at the green water. The counter screams there but the water glows like spring. I drank it. God forgive me, I was so thirsty.\n\nMy hands won\'t stop shaking. If you find this, take the filters. Breathe for me.' },
  note_checkpoint: { title: 'Patrol order № 17', body: 'To all patrols of the northern line:\n\n1. Do not investigate voices in the sealed section.\n2. Do not answer the radio if it calls you by name.\n3. Report any light that moves against the draft.\n\nCommand knows what it is doing. Command does not answer questions.\n— Sgt. Malinin' },
  note_generator: { title: 'Maintenance tag', body: 'GEN-4: starves for diesel. Siphon from the checkpoint truck cans if you must. Prime it twice, then pull the lever HARD.\n\nWhen she runs, the gate listens. When she dies, the gate shuts and God help whoever is on the wrong side.\n— Engineer Yudin' },
  note_facility: { title: 'Torn notebook', body: 'Day 9 in the maintenance hall. The things here were people once — the tags on their wrists say so. They hate the light. They hear EVERYTHING.\n\nI move when the machines hum. I freeze when they go quiet.\n\nThree of them. Maybe more. I count their eyes at night.' },
  note_log: { title: 'Operator\'s log — K-12 relay', body: 'Final entry.\n\nThe emergency loop was a lie. There is no rescue convoy. There never was. The signal is a net, and we are the fish. It calls, and the hungry ones come to see who answers.\n\nI stayed to keep it transmitting. If it stops, they will know we are gone — and come looking.\n\nIt knows your name now. It said "Viktor".\n\nDon\'t answer. Don\'t ever answer.\n— Operator R. Sokolov' },
  note_train_cache: { title: 'Smuggler\'s chalk mark', body: 'If you found this car, you were not meant to.\n\nThe crate is false-bottomed. Take what is under it and tell no one at Zastava — least of all the man who watches the gate.\n\nSome of us still remember the surface. Some of us still plan to see it again.\n\n— G.' },
};

export function buildLevel(G) {
  const M = G.materials;
  P.setPropAssets(G.assets || null);
  P.setCharacterAssets(G.assets || null);
  const scene = G.scene;
  const phys = G.physics;
  const root = new THREE.Group();
  scene.add(root);

  const L = {
    root,
    interactables: [],
    pickups: [],
    doors: {},
    containers: [],
    flicker: [],
    fans: [],
    dripSpots: [],
    zones: [],
    radZones: [],
    enemySpawns: [],
    npcs: [],
    checkpoints: {},
    shadow: null,
    state: { generator: 'empty', breaker: false, radioPlayed: false, logSpawned: false, encounterDone: false, gateBang: false },
  };

  const add = (obj, x = 0, y = 0, z = 0, ry = 0) => {
    obj.position.set(x, y, z); obj.rotation.y = ry; root.add(obj); return obj;
  };
  const col = (cx, cy, cz, w, h, d, tag) => phys.addBoxCenter(cx, cy, cz, w, h, d, tag);
  const interact = (id, pos, radius, prompt, action, enabled = null) => {
    const it = { id, pos, radius, prompt, action, enabled };
    L.interactables.push(it); return it;
  };
  const pickup = (id, kind, count, x, y, z, noteId = null) => {
    const mesh = add(P.pickupMesh(M, kind), x, y, z);
    const p = { id, kind, count, mesh, pos: V3(x, y + 0.2, z), taken: false, noteId, baseY: y, seed: Math.random() * 9 };
    L.pickups.push(p);
    interact('pick_' + id, p.pos, 1.7,
      () => p.taken ? '' : (kind === 'note' ? 'Read note' : `Take ${pickupName(kind, count)}`),
      (g) => g.game.takePickup(p),
      () => !p.taken);
    return p;
  };
  const note = (id, x, y, z) => {
    const mesh = add(P.notePaper(M), x, y, z);
    const p = { id, kind: 'note', count: 1, mesh, pos: V3(x, y + 0.15, z), taken: false, noteId: id, baseY: y, seed: Math.random() * 9 };
    L.pickups.push(p);
    interact('note_' + id, p.pos, 1.7, () => 'Read note', (g) => g.game.readNote(p), () => !p.taken);
    return p;
  };
  const light = (color, intensity, dist, x, y, z, decay = 1.8) => {
    const l = new THREE.PointLight(color, intensity, dist, decay);
    l.position.set(x, y, z); root.add(l); return l;
  };
  const taskLight = (color, intensity, distance, position, target, angle = 0.8) => {
    const l = new THREE.SpotLight(color, intensity, distance, angle, 0.65, 2);
    l.position.fromArray(position); l.target.position.fromArray(target);
    root.add(l, l.target); return l;
  };
  const flicker = (l, mesh, base, speed = 1) => { const f = { l, mesh, base, speed, seed: Math.random() * 100, t: 0, motionRadius: 0 }; L.flicker.push(f); return f; };
  // searchable container: loot is granted on first search; door/lid swings open
  const searchable = (id, mesh, x, y, z, ry, loot, kind = 'locker') => {
    add(mesh, x, y, z, ry);
    const pivot = kind === 'locker' ? mesh.userData.door : mesh.userData.lid;
    const c = { id, kind, mesh, pivot, opened: false, angle: 0, target: 0, loot, pos: V3(x, y + (kind === 'locker' ? 1.0 : 0.55), z) };
    L.containers.push(c);
    interact('cont_' + id, c.pos, 1.9,
      () => c.opened ? '' : (kind === 'locker' ? 'Search locker' : 'Pry open crate'),
      (g) => g.game.searchContainer(c));
    return c;
  };

  // world-scale texel density: clone a material so its maps tile every `tile` meters
  // regardless of surface size (stops 120m tunnel walls from stretching one tile).
  const scaledCache = new Map();
  function scaledMat(mat, w, h, tile = 2) {
    const rx = Math.max(0.5, w / tile), ry = Math.max(0.5, h / tile);
    const key = mat.uuid + '|' + rx.toFixed(2) + '|' + ry.toFixed(2);
    if (scaledCache.has(key)) return scaledCache.get(key);
    const m = mat.clone();
    for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) {
      if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(rx, ry); m[k].needsUpdate = true; }
    }
    scaledCache.set(key, m);
    return m;
  }

  function wallX(x, z1, z2, h, mat, y0 = 0, t = 0.35) {
    const m = P.B(t, h, z2 - z1, scaledMat(mat, z2 - z1, h), x, y0 + h / 2, (z1 + z2) / 2);
    root.add(m); col(x, y0 + h / 2, (z1 + z2) / 2, t, h, z2 - z1);
    return m;
  }
  function wallZ(z, x1, x2, h, mat, y0 = 0, t = 0.35) {
    const m = P.B(x2 - x1, h, t, scaledMat(mat, x2 - x1, h), (x1 + x2) / 2, y0 + h / 2, z);
    root.add(m); col((x1 + x2) / 2, y0 + h / 2, z, x2 - x1, h, t);
    return m;
  }
  function floorRect(x1, z1, x2, z2, y, mat) {
    const m = P.B(x2 - x1, 0.2, z2 - z1, scaledMat(mat, x2 - x1, z2 - z1), (x1 + x2) / 2, y - 0.1, (z1 + z2) / 2, false);
    m.receiveShadow = true; root.add(m);
    col((x1 + x2) / 2, y - 0.1, (z1 + z2) / 2, x2 - x1, 0.2, z2 - z1);
    return m;
  }
  function ceilRect(x1, z1, x2, z2, y, mat) {
    const m = P.B(x2 - x1, 0.2, z2 - z1, scaledMat(mat, x2 - x1, z2 - z1), (x1 + x2) / 2, y + 0.1, (z1 + z2) / 2, false);
    root.add(m);
    return m;
  }

  // ============================================================
  // SECTION A — ZASTAVA STATION (inhabited)
  // ============================================================
  floorRect(-10, -28, 3.5, 8, 0, M.floor);
  floorRect(3.5, -28, 10, 8, -1.15, M.ballast);
  ceilRect(-10, -28, 10, 8, 7, M.ceiling);
  wallX(-10, -28, 8, 7, M.concrete);
  wallX(10, -28, 8, 7, M.concrete);
  wallZ(8, -10, 10, 7, M.concrete);
  wallZ(-28, -10, -1.3, 7, M.concrete);
  wallZ(-28, 1.3, 10, 7, M.concrete);
  wallZ(-28, -1.3, 1.3, 7, M.concrete, 2.5);
  root.add(P.B(0.035, 1.65, 30, scaledMat(M.tilesBig, 30, 1.65), -9.80, 0.825, -7));
  root.add(P.B(0.035, 1.65, 36, scaledMat(M.tilesBig, 36, 1.65), 9.80, 0.825, -10));
  root.add(P.B(8.4, 1.65, 0.035, scaledMat(M.tilesBig, 8.4, 1.65), 5.65, 0.825, -27.80));
  // platform edge
  col(3.5, -0.575, -10, 0.25, 1.15, 36);
  const edge = P.B(0.25, 1.15, 36, M.concreteDark, 3.5, -0.575, -10);
  root.add(edge);
  const edgeLine = P.P(0.3, 36, new THREE.MeshStandardMaterial({ map: M.tex.hazard, roughness: 0.85 }), 3.2, 0.012, -10);
  edgeLine.rotation.x = -Math.PI / 2; root.add(edgeLine);
  // steps down to trench (south)
  for (let i = 0; i < 3; i++) {
    const y = -0.38 * (i + 1);
    const s = P.B(2.0, 0.4, 0.8, M.concreteDark, 6.5, y + 0.2 - 0.4, 6.6 - i * 0.8);
    root.add(s); col(6.5, y + 0.2 - 0.4, 6.6 - i * 0.8, 2.0, 0.4, 0.8);
  }
  // rails in trench
  add(P.railTrack(M, 34), 6.7, -1.15, -10);
  // columns
  for (const z of [-22, -14, -6, 2]) add(P.pillar(M, 7), -3.5, 0, z), col(-3.5, 3.5, z, 0.95, 7, 0.95);
  // ceiling beams
  for (const z of [-24, -16, -8, 0, 6]) root.add(P.B(20, 0.4, 0.5, M.concreteDark, 0, 6.8, z, false));

  // parked storage train in trench
  const stationCar = add(P.trainCar(M, { len: 12 }), 5.2, -0.5, -8);
  trainColliders(5.2, -0.5, -8, 12, 0);
  add(P.crate(M), 5.2, -0.35, -11); add(P.crate(M, 0.8), 5.6, -0.35, -5);
  add(P.lantern(M), 5.2, -0.35, -8.5);
  light(0xffa050, 5, 6, 5.2, 0.4, -8.5);
  // optional exploration reward: a false-bottomed stash hidden in the parked car
  searchable('train_cache', P.crate(M), 5.2, -0.35, -3.4, 0.2, [['medkit', 1], ['rifleAmmo', 12]], 'crate');
  col(5.2, -0.07, -3.4, 0.8, 0.56, 0.55);
  note('note_train_cache', 5.0, 0.22, -3.4);

  // camp: tents, fire, beds
  add(P.tent(M), -7.8, 0, -5, 0.3); col(-7.8, 0.8, -5, 2.4, 1.6, 2.6);
  add(P.tent(M, M.canvasCloth2), -7.8, 0, -11.5, -0.2); col(-7.8, 0.8, -11.5, 2.4, 1.6, 2.6);
  const fireBarrel = add(P.barrel(M, true), -7.2, 0, -8.2);
  col(-7.2, 0.46, -8.2, 0.66, 0.92, 0.66);
  const fireLight = light(0xff7a30, 26, 13, -7.2, 1.3, -8.2);
  // the camp fire is the station's warm key — let it throw flickering shadows
  fireLight.castShadow = true;
  fireLight._shadowSize = 512;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.camera.near = 0.2;
  fireLight.shadow.camera.far = 13;
  fireLight.shadow.bias = -0.003;
  flicker(fireLight, fireBarrel.userData.fire, 26, 3.5);
  for (const z of [-15.5, -17.5, -19.5]) { add(P.bed(M), -8.6, 0, z, Math.PI / 2); col(-8.6, 0.3, z, 2.0, 0.6, 0.95); }
  add(P.shelf(M), -9.5, 0, -21.5, Math.PI / 2); col(-9.5, 0.9, -21.5, 0.5, 1.85, 1.6);
  add(P.crate(M), -8.8, 0, -13.8); col(-8.8, 0.28, -13.8, 0.8, 0.56, 0.55);
  add(P.crate(M, 0.7), -8.6, 0.55, -13.9);
  add(P.barrel(M), -9.3, 0, -2.5); col(-9.3, 0.46, -2.5, 0.66, 0.92, 0.66);
  add(P.barrel(M), -9.3, 0, -1.6); col(-9.3, 0.46, -1.6, 0.66, 0.92, 0.66);
  // camp clutter
  add(P.trashCan(M), -9.4, 0, -6.2); col(-9.4, 0.49, -6.2, 0.6, 0.98, 0.6);
  add(P.decorCrate(M), -5.6, 0, -13.2, 0.4); col(-5.6, 0.18, -13.2, 0.85, 0.36, 0.45);
  add(P.cementBag(M), -9.2, 0, -14.6, 0.3);
  add(P.cementBag(M), -9.15, 0.17, -14.55, -0.4);
  add(P.ammoBox(M), -9.5, 0.82, -21.2, Math.PI / 2);
  // kitchen / heating corner: wood stove + prep table against the west wall
  const stove = add(P.stove(M), -9.35, 0, 3.0, Math.PI / 2);
  col(-9.35, 0.45, 3.0, 0.6, 0.9, 0.6);
  const stoveLight = light(0xff7a30, 6, 6, -9.0, 0.7, 3.0);
  flicker(stoveLight, stove.userData.fire, 6, 2.2);
  add(P.table(M, 1.2, 0.6), -8.5, 0, 3.0, Math.PI / 2); col(-8.5, 0.4, 3.0, 0.6, 0.8, 1.2);
  add(P.crate(M, 0.6), -8.5, 0.8, 2.7);
  add(P.barrel(M), -9.4, 0, 4.6); col(-9.4, 0.46, 4.6, 0.66, 0.92, 0.66);
  // exposed wiring / conduit + ventilation duct along the west wall
  add(P.pipesRun(M, 20, 2, 5.4), -9.75, 0, -12);
  root.add(P.cable(M, [V3(-9.7, 5.2, -2), V3(-9.6, 4.6, -8), V3(-9.7, 5.1, -14), V3(-9.6, 4.7, -22)], 0.03));
  const ventDuct = P.B(0.5, 0.5, 10, M.steelDark, -9.6, 6.0, -14, false); root.add(ventDuct);
  const vfan = add(P.ventFan(M), -9.5, 6.0, -9.2, Math.PI / 2);
  L.fans.push(vfan.userData.blades);
  // damaged / missing tile patches on the platform walls
  for (const [x, z, ry] of [[-9.82, -3, Math.PI / 2], [-9.82, -16, Math.PI / 2], [9.82, -12, -Math.PI / 2]]) {
    const spall = P.decalPlane(TX.dirtDecalTexture(), 1.6, 1.4);
    add(spall, x, 1.6, z, ry);
    root.add(P.B(0.06, 0.9, 1.1, M.concreteDark, x + (x < 0 ? 0.02 : -0.02), 1.5, z, false));
  }
  // defensive barricade + sandbags by the north gate
  add(P.barricade(M), 2.6, 0, -26.4, -0.35); col(2.6, 0.8, -26.4, 1.8, 1.6, 0.4);
  add(P.sandbags(M, 1.8, 3), -2.4, 0, -26.6, 0.15); col(-2.4, 0.3, -26.6, 1.8, 0.6, 0.5);
  // dead hanging fixtures over the platform
  add(P.hangingLamp(M), -4, 7.0, -18);
  add(P.hangingLamp(M), 1.5, 7.0, -6, 0.5);
  // lanterns on crates
  add(P.lantern(M), -8.8, 0.55, -13.8);
  light(0xffa050, 4, 5, -8.8, 1.0, -13.8);

  const shelterPaint = M.concrete.clone();
  shelterPaint.color.setHex(0x53635b); shelterPaint.roughness = 0.98;
  const shelterRoof = M.panel.clone();
  shelterRoof.color.setHex(0x716c60); shelterRoof.side = THREE.DoubleSide;
  const roofGeo = new THREE.PlaneGeometry(5.2, 4.65, 64, 2);
  const roofVerts = roofGeo.attributes.position;
  for (let i = 0; i < roofVerts.count; i++) {
    const x = roofVerts.getX(i), y = roofVerts.getY(i);
    roofVerts.setZ(i, Math.sin(x * 31) * 0.026 + Math.sin(y * 0.8) * 0.07);
  }
  roofGeo.computeVertexNormals();
  const shelterCanopy = new THREE.Mesh(roofGeo, shelterRoof);
  shelterCanopy.rotation.x = -Math.PI / 2;
  shelterCanopy.castShadow = true; shelterCanopy.receiveShadow = true;
  add(shelterCanopy, -7.2, 3.25, -25.5);
  for (const z of [-27.65, -23.35]) {
    root.add(P.B(5.4, 0.16, 0.12, M.wood, -7.2, 3.13, z));
    root.add(P.B(0.12, 3.12, 0.12, M.wood, -9.72, 1.56, z));
    col(-9.72, 1.56, z, 0.12, 3.12, 0.12);
  }
  root.add(P.B(0.12, 0.15, 4.6, M.steelDark, -4.65, 3.13, -25.5));
  const paintOutline = new THREE.Shape();
  paintOutline.moveTo(-2.4, 0.08);
  for (const [x, y] of [[2.4,0.08],[2.4,1.38],[2.15,1.41],[2.05,1.26],[1.89,1.46],[0.8,1.52],[0.62,1.38],[0.4,1.53],[-0.9,1.48],[-1.15,1.33],[-1.3,1.49],[-2.4,1.45]]) paintOutline.lineTo(x,y);
  paintOutline.closePath();
  const paintPanel = new THREE.Mesh(new THREE.ShapeGeometry(paintOutline), shelterPaint);
  paintPanel.receiveShadow = true;
  add(paintPanel, -7.25, 0, -27.80);
  const plasterPatch = new THREE.Shape();
  plasterPatch.moveTo(-1.8,0);
  for (const [x,y] of [[1.8,0],[1.72,0.8],[1.45,0.95],[1.6,1.25],[0.8,1.28],[0.55,1.41],[-0.7,1.32],[-0.83,1.12],[-1.65,1.2]]) plasterPatch.lineTo(x,y);
  plasterPatch.closePath();
  const patch = new THREE.Mesh(new THREE.ShapeGeometry(plasterPatch), M.concreteDark);
  add(patch, -7.35, 1.52, -27.795);
  const shelterSign = P.signPlane(TX.signTexture(['СВЯЗЬ / 04', 'KEEP THIS FREQUENCY CLEAR'], {bg:'#28342e',fg:'#c4bea1',w:512,h:128}), 2.45, 0.61);
  add(shelterSign, -6.55, 2.51, -27.72);
  const curtainMat = M.canvasCloth.clone(); curtainMat.side = THREE.DoubleSide;
  const curtainGeo = new THREE.PlaneGeometry(1.1, 2.6, 24, 12);
  const curtainVerts = curtainGeo.attributes.position;
  for (let i=0;i<curtainVerts.count;i++) {
    const x=curtainVerts.getX(i), y=curtainVerts.getY(i);
    curtainVerts.setZ(i, Math.sin(x*24)*0.07 + Math.sin(y*2+x)*0.02);
    curtainVerts.setY(i,y + Math.cos(x*11)*0.025*(1-y/1.3));
  }
  curtainGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curtainGeo,curtainMat);
  curtain.castShadow=true; curtain.receiveShadow=true;
  add(curtain,-9.03,1.72,-25.65,Math.PI/2);
  col(-9.03,1.4,-25.65,0.08,2.4,1.1);
  root.add(P.cable(M,[V3(-9.6,2.95,-27.6),V3(-8.1,2.65,-27.55),V3(-6.2,2.9,-27.55),V3(-4.8,2.7,-27.55)],0.025));
  add(P.powerBox(M),-5.15,1.85,-27.66);
  root.add(P.cable(M,[V3(-5.15,1.6,-27.5),V3(-5.1,0.3,-27.4),V3(-6.2,0.05,-26.2),V3(-6.5,0.81,-24.65)],0.018));
  const radioTable = add(P.table(M, 1.6, 0.8), -6.5, 0, -24.5);
  col(-6.5, 0.4, -24.5, 1.6, 0.8, 0.8);
  const fieldRadio = add(P.fieldRadio(M), -6.5, 0.8, -24.5, 0.2);
  add(P.chair(M), -6.5, 0, -23.6, Math.PI);
  // Faint green status lamp only. A decay-2 point light this close to the set washes the
  // whole table green, so keep it tiny and lift it off the radio face.
  light(0x3aff6a, 0.1, 0.6, -6.35, 1.05, -24.3);
  // Warm desk lamp as the corner's key light: models Lev and the set instead of flat ambient.
  add(P.lantern(M), -7.15, 0.8, -24.3);
  light(0xffb066, 3.2, 4.5, -7.05, 1.35, -24.2);
  add(P.tunnelLamp(M, true), -6.95, 2.86, -24.0);
  const levKey = taskLight(0xffd2a2, 18, 7, [-6.95,2.75,-24.0], [-6.4,1.25,-25.5], 0.95);
  levKey.castShadow = true; levKey._shadowSize = 512;
  levKey.shadow.mapSize.set(512,512); levKey.shadow.bias = -0.0008; levKey.shadow.normalBias = 0.018;
  add(P.fluorTube(M,true), -8.4, 2.85, -27.3);
  light(0x89bbcb, 3.5, 4.5, -8.2, 2.65, -27.1);
  // working clutter so the corner reads as lived-in, not an empty tile box
  add(P.notePaper(M), -6.05, 0.81, -24.35, 0.4);
  add(P.C(0.035, 0.09, M.steelDark, -5.95, 0.845, -24.65));
  add(P.cable(M, [V3(-6.9, 0.85, -24.6), V3(-8.4, 0.4, -25.4), V3(-9.8, 0.7, -25.4)], 0.015));
  add(P.shelf(M), -9.5, 1.5, -23.6, Math.PI / 2);
  add(P.bed(M), -8.7, 0, -26.6, Math.PI / 2);
  col(-8.7, 0.3, -26.6, 1.0, 0.6, 2.0);
  add(P.signPlane(TX.posterTexture('СВЯЗЬ', 'ЕСТЬ ЖИЗНЬ'), 1.0, 1.4), -9.8, 2.3, -21.5, Math.PI / 2);
  // NPC Lev (operator) — olive jacket + lighter skin so he reads as a person, not a mannequin
  const lev = add(P.humanBody(M, { cloth: M.cloth, jacket: M.canvasCloth, skin: M.flesh, character: 'lev' }), -6.5, 0, -25.3, 0);
  L.npcs.push({ id: 'lev', group: lev, pos: V3(-6.5, 0, -25.3), name: 'Lev — radio operator' });
  interact('npc_lev', V3(-6.5, 1.2, -25.3), 2.4, () => 'Talk to Lev', (g) => g.mission.talkTo('lev'));
  // NPC Borya (guard) near gate
  const borya = add(P.humanBody(M, { cloth: M.cloth, mask: false, character: 'borya' }), 1.8, 0, -26, Math.PI * 0.9);
  L.npcs.push({ id: 'borya', group: borya, pos: V3(1.8, 0, -26), name: 'Borya — gate watch' });
  interact('npc_borya', V3(1.8, 1.2, -26), 2.4, () => 'Talk to Borya', (g) => g.mission.talkTo('borya'));
  col(1.8, 0.9, -26, 0.5, 1.8, 0.4, 'npc');

  // station lighting
  const tubePositions = [[-4, -22], [-4, -10], [-4, 2], [1.5, -16]];
  tubePositions.forEach(([x, z], i) => {
    const t = add(P.fluorTube(M, true), x, 6.7, z);
    const l = light(0xbfd8ff, 38, 18, x, 6.2, z);
    if (i === 1 || i === 3) flicker(l, t.userData.tube, 38, 1);
  });
  // station signage
  const stationSign = P.signPlane(TX.signTexture(['ЗАСТАВА'], { bg: '#2a2e34', fg: '#d8dce0', w: 512, h: 128 }), 4.2, 1.05);
  add(stationSign, -9.8, 3.6, -10, Math.PI / 2);
  const stationSign2 = P.signPlane(TX.signTexture(['ZASTAVA'], { bg: '#2a2e34', fg: '#d8dce0', w: 512, h: 128 }), 3.2, 0.8);
  add(stationSign2, -3.5, 4.2, -14, 0);
  const exitSign = P.signPlane(TX.signTexture(['ВЫХОД В ТОННЕЛЬ', 'NORTH TUNNEL'], { bg: '#1e2a1e', fg: '#9ad89a', w: 512, h: 160 }), 2.6, 0.8);
  add(exitSign, 0, 3.2, -27.8, 0);
  // posters & graffiti
  add(P.decalPlane(TX.posterTexture('БДИТЕЛЬНОСТЬ', 'VIGILANCE IS LIFE'), 1.1, 1.65, false), -9.8, 2.4, -6, Math.PI / 2);
  add(P.decalPlane(TX.posterTexture('МОЛЧАНИЕ', 'SILENCE SAVES', 1), 1.1, 1.65, false), -9.8, 2.4, 0.5, Math.PI / 2);
  add(P.decalPlane(TX.graffitiTexture('МЫ ЖИВЫ', '#5a6a7a'), 3.2, 1.6), -9.8, 2.6, -17, Math.PI / 2);
  add(P.decalPlane(TX.graffitiTexture('2039', '#6a3a30'), 2.0, 1.0), 9.8, 2.2, -20, -Math.PI / 2);
  // dirt decals
  for (const [x, z, s] of [[-6, -8, 3], [-2, -18, 4], [1, -24, 2.5], [-8, -22, 2]]) {
    const d = P.decalPlane(TX.dirtDecalTexture(), s, s);
    d.rotation.x = -Math.PI / 2; add(d, x, 0.012, z);
  }

  // station gate (swing door)
  const gateA = add(P.doorMetal(M, 2.6, 2.5), 0, 0, -28);
  const gateACol = col(0, 1.25, -28, 2.6, 2.5, 0.15, 'door');
  L.doors.stationGate = { group: gateA, pivot: gateA.userData.pivot, collider: gateACol, open: false, angle: 0, target: 0, locked: true };
  interact('door_station', V3(0, 1.2, -27.7), 2.2,
    () => L.doors.stationGate.locked ? 'Gate locked — talk to Lev' : (L.doors.stationGate.open ? 'Close gate' : 'Open gate'),
    (g) => g.game.toggleDoor('stationGate'));

  // station pickups & notes
  pickup('st_ammo', 'pistolAmmo', 12, 5.2, -0.35, -6.5);
  pickup('st_med', 'medkit', 1, -9.5, 1.32, -21.5);
  pickup('st_batt', 'battery', 1, -6.0, 0.82, -24.3);
  note('note_beds', -8.6, 0.52, -17.5);
  note('note_station_wall', -8.8, 0.56, -13.8);
  // guard lockers by the north gate
  searchable('st_lock1', P.locker(M), -3.6, 0, -27.5, 0, [['pistolAmmo', 10], ['battery', 1]]);
  col(-3.6, 0.95, -27.5, 0.6, 1.9, 0.45);
  searchable('st_lock2', P.locker(M), -4.3, 0, -27.5, 0, []);
  col(-4.3, 0.95, -27.5, 0.6, 1.9, 0.45);

  L.checkpoints[0] = { pos: V3(-4, 0, 2), yaw: 0 };
  L.checkpoints[1] = { pos: V3(-1, 0, -24), yaw: 0 };

  // ============================================================
  // SECTION B — NORTH TUNNEL
  // ============================================================
  const T0 = -28, T1 = -148;
  // walkway & track bed
  floorRect(-3.4, T1, -1.4, T0, 0, M.floorTunnel);
  floorRect(-1.4, T1, 3.4, T0, -0.35, M.ballast);
  add(P.railTrack(M, 118), 1.0, -0.35, -88);
  // walls (with alcove openings)
  // left wall x=-3.4: opening z[-93,-89] for alcove 2
  wallX(-3.4, T1, -93, 3.2, M.concreteDark);
  wallX(-3.4, -89, T0, 3.2, M.concreteDark);
  wallX(-3.4, -93, -89, 3.2, M.concreteDark, 2.4);
  // right wall x=3.4: openings z[-37,-33] alcove1, z[-120,-114] gen room
  wallX(3.4, T1, -120, 3.2, M.concreteDark);
  wallX(3.4, -114, -37, 3.2, M.concreteDark);
  wallX(3.4, -33, T0, 3.2, M.concreteDark);
  wallX(3.4, -120, -114, 3.2, M.concreteDark, 2.4);
  wallX(3.4, -37, -33, 3.2, M.concreteDark, 2.4);
  // arch ceiling
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, T0 - T1, 20, 1, true, 0, Math.PI), M.ceilingTunnel);
  arch.rotation.x = -Math.PI / 2;
  arch.position.set(0, 2.9, (T0 + T1) / 2);
  arch.receiveShadow = true;
  root.add(arch);
  // tunnel end caps handled by gate & station wall
  // pipes along right wall
  add(P.pipesRun(M, 116, 3, 2.2), 3.15, 0, -88);
  // cables along left wall
  for (const y of [2.5, 2.65]) {
    root.add(P.cable(M, [V3(-3.25, y, T0), V3(-3.25, y - 0.15, -60), V3(-3.25, y, -100), V3(-3.25, y - 0.1, T1)], 0.025));
  }
  // walkway curb
  const curb = P.B(0.15, 0.35, 118, M.concreteDark, -1.4, -0.175, -88);
  root.add(curb); col(-1.4, -0.175, -88, 0.15, 0.35, 118);

  // alcove 1 (right, z -38..-32)
  floorRect(3.4, -38, 6.6, -32, 0, M.floor);
  ceilRect(3.4, -38, 6.6, -32, 2.6, M.ceiling);
  wallX(6.6, -38, -32, 2.6, M.concreteDark);
  wallZ(-38, 3.4, 6.6, 2.6, M.concreteDark);
  wallZ(-32, 3.4, 6.6, 2.6, M.concreteDark);
  add(P.shelf(M), 6.2, 0, -35, -Math.PI / 2); col(6.2, 0.9, -35, 0.5, 1.85, 1.6);
  add(P.crate(M), 4.5, 0, -36.5); col(4.5, 0.28, -36.5, 0.8, 0.56, 0.55);
  add(P.ammoBox(M), 6.2, 0.82, -34.6, -Math.PI / 2);
  pickup('al1_batt', 'battery', 1, 6.2, 1.32, -34);
  pickup('al1_ammo', 'pistolAmmo', 8, 4.5, 0.56, -36.5);

  // derailed train car blocking the tunnel
  const car = add(P.trainCar(M, { len: 14 }), 0.7, 0.2, -70, 0.07);
  car.rotation.z = 0.05;
  trainColliders(0.7, 0.2, -70, 14, 0.07);
  add(P.rubble(M, 1.4, 10), -2.2, 0, -62);
  add(P.rubble(M, 1.0, 7), 2.5, -0.35, -79);
  // interior loot
  pickup('train_rifle', 'rifle', 1, 0.7, 0.35, -71.5);
  pickup('train_ammo', 'rifleAmmo', 20, 0.2, 0.35, -68);
  pickup('train_med', 'medkit', 1, 1.2, 0.35, -73);
  note('note_train', 0.7, 0.35, -66.8);
  const carLamp = add(P.tunnelLamp(M, false), 0.7, 2.9, -70);
  // maintenance work light so the derailment reads in the dark tunnel; faint cool fill at the rear
  add(P.tunnelLamp(M, true), 3.2, 2.9, -66);
  light(0xffd9a0, 9, 11, 3.0, 2.6, -66);
  taskLight(0xffcd8f, 28, 14, [3.0,2.6,-66], [0.5,1.2,-69], 0.95);
  add(P.tunnelLamp(M,true), -2.95, 2.7, -61.7);
  light(0x90b4ce, 5.5, 9, -2.75, 2.5, -61.7);
  light(0x8fb8d8, 3.5, 9, -1.6, 2.5, -77);
  // blood inside
  const bloodIn = P.decalPlane(TX.bloodTexture(), 1.4, 1.4);
  bloodIn.rotation.x = -Math.PI / 2; add(bloodIn, 1.0, 0.37, -74.5);

  // radiation zone
  L.radZones.push({ box: new THREE.Box3(V3(-1.4, -1, -95), V3(3.4, 2.5, -86)), rate: 9 });
  for (const [x, z, r] of [[0.5, -89, 1.6], [2.2, -92, 1.3], [1.2, -87.5, 1.0], [2.8, -88.5, 0.8]]) {
    add(P.puddle(M, r, true), x, -0.35, z);
  }
  const radLight = light(0x4aff6a, 5, 9, 1.2, 0.4, -90);
  flicker(radLight, null, 5, 0.4);
  const radSign = P.signPlane(TX.radiationSignTexture(), 0.9, 0.9);
  add(radSign, -3.2, 1.8, -90, Math.PI / 2);
  L.dripSpots.push(V3(1, 0.5, -89), V3(2.5, 0.5, -92));
  // alcove 2 (left, z -95..-88) — filters & corpse
  floorRect(-6.6, -95, -3.4, -88, 0, M.floor);
  ceilRect(-6.6, -95, -3.4, -88, 2.6, M.ceiling);
  wallX(-6.6, -95, -88, 2.6, M.concreteDark);
  wallZ(-95, -6.6, -3.4, 2.6, M.concreteDark);
  wallZ(-88, -6.6, -3.4, 2.6, M.concreteDark);
  add(P.corpse(M), -5.5, 0, -92.5, 1.2);
  pickup('al2_filter', 'filter', 2, -5.9, 0.05, -91.5);
  note('note_corpse', -5.2, 0.05, -93.3);

  // military checkpoint
  add(P.sandbags(M, 2.6, 4), 1.9, -0.35, -104, 0.1); col(1.9, 0.2, -104, 2.6, 0.85, 0.5);
  add(P.sandbags(M, 1.6, 3), -2.6, 0, -107, Math.PI / 2); col(-2.6, 0.2, -107, 0.5, 0.7, 1.6);
  add(P.table(M, 1.2, 0.6), 2.3, -0.35, -106.5); col(2.3, 0.05, -106.5, 1.2, 0.8, 0.6);
  add(P.milCrate(M), 2.6, -0.35, -102.5); col(2.6, -0.12, -102.5, 0.9, 0.45, 0.5);
  add(P.milCrate(M), 2.6, 0.1, -102.6);
  add(P.ammoBox(M), 2.55, 0.46, -106.35, 0.3);
  add(P.toolbox(M), -2.5, -0.35, -103.2, 0.8);
  add(P.barricade(M), -2.2, 0, -101.5, 0.4);
  pickup('cp_fuel', 'fuel', 1, 2.3, 0.45, -106.5);
  pickup('cp_rammo', 'rifleAmmo', 15, 2.6, 0.55, -102.5);
  pickup('cp_pammo', 'pistolAmmo', 8, -2.5, 0.05, -105.5);
  note('note_checkpoint', 2.0, 0.46, -106.3);
  searchable('cp_crate', P.crate(M), -2.6, 0, -104.5, 0.15, [['rifleAmmo', 12]], 'crate');
  col(-2.6, 0.28, -104.5, 0.8, 0.56, 0.55);
  const cpSign = P.signPlane(TX.signTexture(['КПП-7', 'CHECKPOINT'], { bg: '#2a2a20', fg: '#c8c8a8', w: 256, h: 128 }), 1.2, 0.6);
  add(cpSign, 3.2, 2.0, -104, -Math.PI / 2);

  // generator room (right, z -124..-112)
  floorRect(3.4, -124, 11, -112, 0, M.floor);
  ceilRect(3.4, -124, 11, -112, 3.2, M.ceiling);
  wallX(11, -124, -112, 3.2, M.concreteDark);
  wallZ(-124, 3.4, 11, 3.2, M.concreteDark);
  wallZ(-112, 3.4, 11, 3.2, M.concreteDark);
  const gen = add(P.generator(M), 8.2, 0, -118, -Math.PI / 2);
  col(8.2, 0.7, -118, 1.1, 1.4, 1.7);
  L.generator = { group: gen, pos: V3(8.2, 0.8, -118), lever: gen.userData.lever };
  const genLight = light(0xffd9a0, 0, 14, 7, 2.9, -118);
  L.generatorLight = genLight;
  add(P.tunnelLamp(M,true), 9.65, 2.65, -116.4);
  taskLight(0xffba70, 18, 7, [9.65,2.5,-116.4], [8.2,0.8,-118], 0.9);
  const genTube = add(P.fluorTube(M, false), 7, 3.0, -118);
  L.generatorTube = genTube.userData.tube;
  add(P.shelf(M), 10.5, 0, -115, -Math.PI / 2); col(10.5, 0.9, -115, 0.5, 1.85, 1.6);
  add(P.barrel(M), 10.3, 0, -121.5); col(10.3, 0.46, -121.5, 0.66, 0.92, 0.66);
  add(P.barrel(M), 9.5, 0, -122); col(9.5, 0.46, -122, 0.66, 0.92, 0.66);
  add(P.toolbox(M), 7, 0, -120.6, 0.5);
  add(P.pipeAssembly(M), 10.6, 0, -113.2);
  add(P.powerBox(M), 10.9, 1.2, -116, -Math.PI / 2);
  // Dim always-on practicals so the room is navigable and the generator reads before it is
  // powered — still moody, not pitch black (the running generator adds the bright key later).
  add(P.emergencyLight(M), 3.6, 2.4, -113);
  light(0xff6a3a, 1.7, 7, 4.0, 2.3, -114);
  light(0x8fb8d8, 3.2, 10, 7.2, 2.9, -118);
  add(P.hangingLamp(M), 7, 3.2, -115);
  pickup('gen_batt', 'battery', 1, 10.5, 1.32, -114.5);
  note('note_generator', 8.2, 0.1, -116.8);
  const genSign = P.signPlane(TX.signTexture(['ГЕНЕРАТОРНАЯ', 'GENERATOR'], { bg: '#2a2416', fg: '#d8c86a', w: 512, h: 160 }), 2.2, 0.7);
  add(genSign, 3.25, 2.5, -117, -Math.PI / 2);
  interact('generator', V3(8.2, 0.9, -118), 2.3,
    () => {
      const s = L.state.generator;
      if (s === 'running') return 'Generator running';
      if (s === 'fueled') return 'Pull starter lever';
      return G.player.inv.fuel > 0 ? 'Pour fuel into generator' : 'Generator — dry tank (find diesel)';
    },
    (g) => g.mission.useGenerator());

  // tunnel dressing
  add(P.rubble(M, 1.1, 8), -2.5, 0, -45);
  add(P.rubble(M, 0.9, 6), 2.8, -0.35, -135);
  add(P.barricade(M), 2.2, -0.35, -52, -0.3);
  const graf1 = P.decalPlane(TX.graffitiTexture('ОНИ СЛЫШАТ', '#6a2a22'), 3.4, 1.7);
  add(graf1, -3.2, 1.9, -130, Math.PI / 2);
  const graf2 = P.decalPlane(TX.graffitiTexture('НЕ ОТВЕЧАЙ', '#4a5a6a'), 3.0, 1.5);
  add(graf2, 3.2, 1.8, -58, -Math.PI / 2);
  const bloodT = P.decalPlane(TX.bloodTexture(), 2.2, 2.2);
  bloodT.rotation.x = -Math.PI / 2; add(bloodT, -2.2, 0.012, -131);
  add(P.corpse(M), 2.4, -0.35, -136, -0.6);
  for (const [x, z, r] of [[-2.4, -50, 1.2], [1.5, -110, 1.5], [-2.0, -140, 1.0], [2.5, -44, 0.9]]) {
    add(P.puddle(M, r), x, x < -1.4 ? 0 : -0.35, z);
    L.dripSpots.push(V3(x, 0.6, z));
  }
  // drainage channel along the track bed with periodic grate covers
  root.add(P.B(0.34, 0.03, 118, M.concreteDark, 3.05, -0.36, -88, false));
  for (let z = -34; z > -146; z -= 8) root.add(P.B(0.34, 0.02, 0.7, M.grate, 3.05, -0.33, z, false));
  // recessed cable / refuge niches in the left wall (breaks the uniform arch)
  for (const z of [-46, -76, -101, -136]) {
    root.add(P.B(0.12, 0.9, 0.7, M.concreteDark, -3.32, 1.5, z, false));      // dark recess
    root.add(P.B(0.06, 1.0, 0.08, M.concrete, -3.28, 1.5, z - 0.38, false));  // frame
    root.add(P.B(0.06, 1.0, 0.08, M.concrete, -3.28, 1.5, z + 0.38, false));
    root.add(P.B(0.06, 0.08, 0.84, M.concrete, -3.28, 2.0, z, false));
    for (const dy of [1.3, 1.6]) { const pipe = P.C(0.03, 0.5, M.rustPipe, -3.3, dy, z); pipe.rotation.x = Math.PI / 2; root.add(pipe); }
  }
  // leak streaks + spall on the tunnel shell at varied heights
  for (const [x, z, y, ry] of [[-3.25, -52, 2.2, Math.PI / 2], [3.25, -66, 2.4, -Math.PI / 2], [-3.25, -112, 2.0, Math.PI / 2], [3.25, -128, 2.3, -Math.PI / 2]]) {
    const leak = P.decalPlane(TX.dirtDecalTexture(), 0.7, 1.8);
    add(leak, x, y, z, ry);
  }
  // sealed side junction (collapsed maintenance passage) on the right wall
  root.add(P.B(0.15, 2.2, 1.6, M.concreteDark, 3.3, 1.1, -82, false));        // dark opening
  root.add(P.B(0.1, 2.3, 0.12, M.concrete, 3.26, 1.15, -82.85, false));       // jamb
  root.add(P.B(0.1, 2.3, 0.12, M.concrete, 3.26, 1.15, -81.15, false));
  root.add(P.B(0.1, 0.14, 1.8, M.concrete, 3.26, 2.3, -82, false));          // lintel
  add(P.rubble(M, 0.9, 7), 2.9, -0.35, -82);
  const jSign = P.signPlane(TX.signTexture(['ПРОХОД ЗАВАЛЕН', 'PASSAGE COLLAPSED'], { bg: '#2a2020', fg: '#c8a8a8', w: 256, h: 128 }), 1.1, 0.55);
  add(jSign, 3.2, 2.6, -82, -Math.PI / 2);
  // tunnel lamps
  const lampZ = [[-36, true, true], [-54, false, false], [-72, false, false], [-90, true, true], [-108, true, false], [-126, false, false]];
  L.tunnelLamps = [];
  for (const [z, on, flick] of lampZ) {
    const lamp = add(P.tunnelLamp(M, on), -3.25, 2.9, z);
    const l = light(0xffd9a0, on ? 12 : 0, 13, -3.0, 2.7, z);
    if (flick) { const f = flicker(l, lamp.userData.bulb, 12, 1.4); if (z === -90) f.motionRadius = 8; }
    L.tunnelLamps.push({ z, light: l, bulb: lamp.userData.bulb, on, initOn: on });
  }
  // emergency light near gate
  const em = add(P.emergencyLight(M), 0, 3.4, -144);
  const emL = light(0xff2a1a, 7, 10, 0, 3.1, -144);
  flicker(emL, em.userData.bulb, 7, 0.7);

  // security gate
  const gate = add(P.securityGate(M, 6.8, 5.0), 0, 0, -148);
  const gateCol = col(0, 2.5, -148, 6.8, 5.0, 0.3, 'door');
  L.doors.securityGate = { group: gate, panel: gate.userData.panel, collider: gateCol, open: false, y: 0, target: 0 };
  interact('gate_security', V3(0, 1.4, -147.5), 2.6,
    () => L.doors.securityGate.open ? '' : (L.state.generator === 'running' ? 'Gate powered — opening' : 'Security gate — no power'),
    (g) => g.mission.touchGate(), () => !L.doors.securityGate.open);
  // identity sign on the gate header, read on arrival from the tunnel
  const facSign = P.signPlane(TX.signTexture(['ТЕХНИЧЕСКИЙ ОТСЕК', 'MAINTENANCE BAY'], { bg: '#20242a', fg: '#c8ccd0', w: 512, h: 128 }), 4.6, 1.15);
  add(facSign, 0, 5.7, -147.8, 0);

  L.checkpoints[2] = { pos: V3(-2.4, 0, -58), yaw: 0 };
  L.checkpoints[3] = { pos: V3(0, 0, -152), yaw: 0 };

  // ============================================================
  // SECTION C — MAINTENANCE FACILITY
  // ============================================================
  const F0 = -148, F1 = -208;
  floorRect(-11, F1, 11, F0, 0, M.floor);
  ceilRect(-11, F1, 11, F0, 7.5, M.ceiling);
  wallX(-11, F1, F0, 7.5, M.concrete);
  wallX(11, F1, F0, 7.5, M.concrete);
  // south wall (entry from gate) with opening
  wallZ(F0, -11, -3.4, 7.5, M.concrete);
  wallZ(F0, 3.4, 11, 7.5, M.concrete);
  wallZ(F0, -3.4, 3.4, 7.5, M.concrete, 5.0);
  // north wall with door opening x[-1.2,1.2]
  wallZ(F1, -11, -1.2, 7.5, M.concrete);
  wallZ(F1, 1.2, 11, 7.5, M.concrete);
  wallZ(F1, -1.2, 1.2, 7.5, M.concrete, 2.5);
  // beams & chains
  for (const z of [-156, -168, -180, -192, -202]) root.add(P.B(22, 0.5, 0.6, M.concreteDark, 0, 7.2, z, false));
  add(P.chains(M, 6, 2.2, 2), -4, 7.1, -170);
  add(P.chains(M, 5, 1.8, 1.5), 5, 7.1, -188);
  // machinery (cover)
  const machines = [
    [-5, -160, 3, 2.5, 3], [4.5, -166, 4, 2.2, 2.5], [-3, -178, 2.5, 2, 4],
    [6, -186, 3, 3, 2], [-7, -192, 2, 2.5, 3], [0.5, -198, 5, 2, 2],
  ];
  for (const [x, z, w, h, d] of machines) {
    add(P.machineBlock(M, w, h, d), x, 0, z);
    col(x, h / 2, z, w, h, d);
  }
  add(P.tank(M, 0.9, 3), -9.5, 0, -155); col(-9.5, 1.5, -155, 1.8, 3, 1.8);
  add(P.tank(M, 0.9, 3), -9.5, 0, -158.5); col(-9.5, 1.5, -158.5, 1.8, 3, 1.8);
  add(P.tank(M, 1.1, 3.4), 9.8, 0, -175); col(9.8, 1.7, -175, 2.2, 3.4, 2.2);
  add(P.pipesRun(M, 58, 4, 3.2), -10.7, 0, -178);
  add(P.pipesRun(M, 58, 3, 4.2), 10.7, 0, -178);
  const fan = add(P.ventFan(M), 0, 5.5, F1 + 0.3, 0);
  L.fans.push(fan.userData.blades);
  // rubble & corpses
  add(P.rubble(M, 1.5, 10), 8, 0, -152);
  add(P.rubble(M, 1.2, 8), -8, 0, -205);
  add(P.corpse(M), 2, 0, -172, 2.1);
  add(P.corpse(M), -5.5, 0, -186, -0.8);
  const bloodF = P.decalPlane(TX.bloodTexture(), 2.6, 2.6);
  bloodF.rotation.x = -Math.PI / 2; add(bloodF, 2, 0.012, -172);
  const grafF = P.decalPlane(TX.graffitiTexture('ТИШЕ', '#5a3a2a'), 2.6, 1.3);
  add(grafF, -10.8, 2.2, -180, Math.PI / 2);
  // facility loot
  add(P.crate(M), -8.5, 0, -164); col(-8.5, 0.28, -164, 0.8, 0.56, 0.55);
  pickup('f_ammo1', 'rifleAmmo', 18, -8.5, 0.56, -164);
  add(P.crate(M), 8.8, 0, -195); col(8.8, 0.28, -195, 0.8, 0.56, 0.55);
  pickup('f_med', 'medkit', 1, 8.8, 0.56, -195);
  pickup('f_filter', 'filter', 1, -9.2, 0.05, -197);
  pickup('f_batt', 'battery', 1, 5.5, 0.05, -158);
  add(P.milCrate(M), -1.5, 0, -155); col(-1.5, 0.225, -155, 0.9, 0.45, 0.5);
  pickup('f_ammo2', 'pistolAmmo', 10, -1.5, 0.46, -155);
  note('note_facility', 0.5, 2.05, -197.5);
  // workers' lockers by the facility entrance
  searchable('f_lock1', P.locker(M), -10.5, 0, -152.5, Math.PI / 2, [['filter', 1], ['pistolAmmo', 8]]);
  col(-10.5, 0.95, -152.5, 0.45, 1.9, 0.6);
  searchable('f_lock2', P.locker(M), -10.5, 0, -153.3, Math.PI / 2, []);
  col(-10.5, 0.95, -153.3, 0.45, 1.9, 0.6);
  // maintenance clutter
  add(P.cementBag(M), -8, 0, -170, 0.5);
  add(P.cementBag(M), -8.4, 0, -170.6, -0.3);
  add(P.cementBag(M), -8.1, 0.17, -170.2, 1.1);
  add(P.trashCan(M), 9.5, 0, -155); col(9.5, 0.49, -155, 0.6, 0.98, 0.6);
  add(P.pipeAssembly(M), -10.5, 0, -185);
  add(P.decorCrate(M), 7.5, 0, -160, 0.2); col(7.5, 0.18, -160, 0.85, 0.36, 0.45);
  add(P.toolbox(M), 4.5, 2.2, -166, 0.9);
  add(P.hangingLamp(M), -2, 7.5, -172);
  add(P.hangingLamp(M), 4, 7.5, -196, 0.7);
  // the hanging shades are props; give them actual pools of light so the hall isn't black
  light(0xffd9a0, 16, 13, -2, 6.1, -172);
  light(0xffd9a0, 13, 12, 4, 6.1, -196);
  add(P.fluorTube(M,true), -9.9, 2.9, -164, Math.PI/2);
  light(0xa4bacb, 9, 10, -9.5, 2.65, -164);
  taskLight(0xd3dcdf, 30, 16, [5,6.7,-162], [-4,0.6,-166], 0.7);
  add(P.tunnelLamp(M,true), 6.2, 3.1, -181);
  light(0xffb878, 7, 9, 6, 2.9, -181);
  // rad corner with reward
  L.radZones.push({ box: new THREE.Box3(V3(7.5, -0.5, -206), V3(11, 2.5, -200)), rate: 4 });
  add(P.puddle(M, 1.4, true), 9.3, 0, -203);
  pickup('f_rad_batt', 'battery', 1, 9.5, 0.05, -204.5);
  const radSign2 = P.signPlane(TX.radiationSignTexture(), 0.8, 0.8);
  add(radSign2, 10.8, 1.8, -203, -Math.PI / 2);
  // facility lights
  const wl1 = add(P.fluorTube(M, true), 5, 7.2, -162);
  const wl1L = light(0xbfd8ff, 26, 20, 5, 6.7, -162);
  flicker(wl1L, wl1.userData.tube, 26, 1.2).motionRadius = 9;
  const wl2 = add(P.fluorTube(M, true), -6, 7.2, -190);
  light(0xffd9a0, 18, 16, -6, 6.7, -190);
  const exitSign2 = P.signPlane(TX.signTexture(['ВЫХОД', 'EXIT'], { bg: '#12240f', fg: '#4aff6a', w: 256, h: 96 }), 1.4, 0.5);
  add(exitSign2, 0, 3.0, F1 + 0.2, 0);
  light(0x3aff6a, 3, 5, 0, 2.8, F1 + 0.5);
  // label what lies beyond the exit door so the route to the finale reads
  const k12Dir = P.signPlane(TX.signTexture(['K-12', 'RELAY CONTROL'], { bg: '#1a2028', fg: '#a8b8c8', w: 256, h: 128 }), 1.6, 0.8);
  add(k12Dir, 2.6, 2.4, F1 + 0.2, 0);
  // puddles
  for (const [x, z, r] of [[-2, -158, 1.6], [6, -178, 1.3], [-6, -199, 1.4]]) {
    add(P.puddle(M, r), x, 0, z);
    L.dripSpots.push(V3(x, 0.6, z));
  }

  // facility exit door
  const doorF = add(P.doorMetal(M, 2.4, 2.5), 0, 0, F1);
  const doorFCol = col(0, 1.25, F1, 2.4, 2.5, 0.15, 'door');
  L.doors.facilityDoor = { group: doorF, pivot: doorF.userData.pivot, collider: doorFCol, open: false, angle: 0, target: 0, locked: false };
  interact('door_facility', V3(0, 1.2, F1 + 0.4), 2.2,
    () => L.doors.facilityDoor.open ? 'Close door' : 'Open door',
    (g) => g.game.toggleDoor('facilityDoor'));

  L.checkpoints[4] = { pos: V3(0, 0, -212), yaw: 0 };
  L.checkpoints[5] = L.checkpoints[4];
  L.checkpoints[6] = L.checkpoints[4];
  L.checkpoints[7] = L.checkpoints[4];

  // ============================================================
  // SECTION D — K-12 RADIO CONTROL ROOM
  // ============================================================
  const C0 = -208, C1 = -240;
  floorRect(-8, C1, 8, C0, 0, M.floor);
  ceilRect(-8, C1, 8, C0, 4.5, M.ceiling);
  wallX(-8, C1, C0, 4.5, M.concrete);
  wallX(8, C1, C0, 4.5, M.concrete);
  wallZ(C1, -8, 8, 4.5, M.concrete);
  // south wall shared with facility north (already built with opening)
  // console
  const console_ = add(P.radioConsole(M), 0, 0, -237.2, 0);
  col(0, 0.7, -237.2, 4.8, 1.4, 1.0);
  L.radio = { group: console_, pos: V3(0, 1.2, -236.8), screens: console_.userData.screens };
  const consoleGlow = light(0x4aff8a, 0, 8, 0, 1.6, -236);
  L.consoleGlow = consoleGlow;
  add(P.tunnelLamp(M,true), 2.9, 3.3, -238.4);
  taskLight(0x89a8ba, 15, 8, [2.9,3.15,-238.4], [0,1,-237], 1.0);
  light(0xd9b783, 3, 5, -2.8, 2.6, -235.7);
  interact('radio', V3(0, 1.2, -236.6), 2.4,
    () => {
      if (!L.state.breaker) return 'Transmitter — no power';
      if (L.state.radioPlayed) return 'Transmitter — silent';
      return 'Activate transmitter';
    },
    (g) => g.mission.useRadio());
  // breaker panel on right wall
  const breaker = add(P.breakerPanel(M), 7.8, 1.5, -228, -Math.PI / 2);
  L.breaker = { group: breaker, lever: breaker.userData.lever };
  interact('breaker', V3(7.6, 1.5, -228), 2.0,
    () => L.state.breaker ? 'Breaker — ON' : 'Throw main breaker',
    (g) => g.mission.useBreaker());
  // furniture & cover
  add(P.table(M, 1.6, 0.7), -3.5, 0, -230); col(-3.5, 0.4, -230, 1.6, 0.8, 0.7);
  add(P.chair(M), -3.5, 0, -229.2, Math.PI);
  add(P.table(M, 1.4, 0.7), 3.5, 0, -226); col(3.5, 0.4, -226, 1.4, 0.8, 0.7);
  searchable('c_lock1', P.locker(M), -7.5, 0, -220, Math.PI / 2, [['medkit', 1], ['rifleAmmo', 15]]);
  col(-7.5, 0.95, -220, 0.5, 1.9, 0.6);
  searchable('c_lock2', P.locker(M), -7.5, 0, -221, Math.PI / 2, []);
  col(-7.5, 0.95, -221, 0.5, 1.9, 0.6);
  add(P.shelf(M), 7.5, 0, -218, -Math.PI / 2); col(7.5, 0.9, -218, 0.5, 1.85, 1.6);
  add(P.crate(M), -6, 0, -235); col(-6, 0.28, -235, 0.8, 0.56, 0.55);
  add(P.antenna(M, 2.5), 5, 0, -238.5);
  add(P.corpse(M), -5, 0, -232, 0.4);
  add(P.powerBox(M), -7.9, 1.3, -224, Math.PI / 2);
  add(P.ammoBox(M), -2.5, 0, -235, 0.6);
  add(P.toolbox(M), 3, 0, -234, -0.4);
  add(P.hangingLamp(M), -3, 4.5, -232);
  const bloodC = P.decalPlane(TX.bloodTexture(), 2, 2);
  bloodC.rotation.x = -Math.PI / 2; add(bloodC, -5, 0.012, -232);
  pickup('c_med', 'medkit', 1, -3.5, 0.82, -230);
  pickup('c_ammo', 'rifleAmmo', 20, 3.5, 0.82, -226);
  pickup('c_filter', 'filter', 1, 7.5, 1.32, -217.5);
  // control room lights
  const cl = add(P.fluorTube(M, true), 0, 4.3, -224);
  const clL = light(0xffd9a0, 14, 14, 0, 3.9, -224);
  flicker(clL, cl.userData.tube, 14, 0.8).motionRadius = 7;
  const em2 = add(P.emergencyLight(M), 0, 3.2, C0 + 0.3);
  light(0xff2a1a, 4, 7, 0, 2.9, C0 + 0.6);
  const cSign = P.signPlane(TX.signTexture(['K-12', 'RELAY CONTROL'], { bg: '#1a2028', fg: '#a8b8c8', w: 256, h: 128 }), 1.6, 0.8);
  add(cSign, -7.8, 2.6, -228, Math.PI / 2);
  // large painted backdrop behind the console — the finale's landmark anchor
  const cStencil = P.signPlane(TX.signTexture(['K-12', 'RELAY CONTROL'], { bg: '#232830', fg: '#5a6a7a', w: 512, h: 256 }), 5.0, 2.5);
  add(cStencil, 0, 2.7, C1 + 0.2, 0);

  // ============================================================
  // ZONES, SPAWNS, START
  // ============================================================
  L.zones.push(
    { box: new THREE.Box3(V3(-12, -3, -28), V3(12, 9, 10)), name: 'station' },
    { box: new THREE.Box3(V3(-12, -3, -148), V3(12, 9, -28)), name: 'tunnel' },
    { box: new THREE.Box3(V3(-12, -3, -208), V3(12, 9, -148)), name: 'facility' },
    { box: new THREE.Box3(V3(-9, -3, -242), V3(9, 9, -208)), name: 'control' },
  );
  L.enemySpawns.push(
    { id: 'm0', type: 'mutant', pos: V3(1.8, -0.35, -84), patrol: [V3(1.8, -0.35, -84), V3(-1.8, 0, -88), V3(1.0, -0.35, -80)] },
    { id: 'm1', type: 'mutant', pos: V3(-5, 0, -165), patrol: [V3(-5, 0, -165), V3(-8, 0, -172), V3(-2, 0, -170), V3(-6, 0, -158)] },
    { id: 'm2', type: 'mutant', pos: V3(5, 0, -180), patrol: [V3(5, 0, -180), V3(8, 0, -190), V3(2, 0, -192), V3(7, 0, -172)] },
    { id: 'm3', type: 'mutant', pos: V3(-2, 0, -196), patrol: [V3(-2, 0, -196), V3(-6, 0, -202), V3(3, 0, -203), V3(0, 0, -190)] },
    { id: 's1', type: 'scavenger', pos: V3(0, 0, -222), patrol: [V3(-4, 0, -218), V3(4, 0, -224), V3(-2, 0, -228)], cover: [V3(-3.5, 0, -231.2), V3(3.5, 0, -227.2), V3(-6, 0, -236)] },
    { id: 's2', type: 'scavenger', pos: V3(3, 0, -233), patrol: [V3(3, 0, -233), V3(-3, 0, -231), V3(4, 0, -227)], cover: [V3(3.5, 0, -227.2), V3(-3.5, 0, -231.2), V3(0, 0, -236.2)] },
  );
  L.playerStart = { pos: V3(-4, 0, 2), yaw: 0 };
  L.logPickup = null; // spawned after cinematic

  // ambient dust drip spots in station
  L.dripSpots.push(V3(6.7, 0.2, -16), V3(-2, 0.5, -26));

  // ---------- door / gate animation & flicker ----------
  L.update = (dt, t) => {
    for (const key of ['stationGate', 'facilityDoor']) {
      const d = L.doors[key];
      d.angle += (d.target - d.angle) * Math.min(1, dt * 4);
      d.pivot.rotation.y = d.angle;
      if (d.open && Math.abs(d.angle - d.target) > 0.5) d.collider.enabled = false;
      else if (!d.open && Math.abs(d.angle) < 0.1) d.collider.enabled = true;
    }
    const sg = L.doors.securityGate;
    sg.y += (sg.target - sg.y) * Math.min(1, dt * 1.2);
    sg.panel.position.y = sg.y;
    sg.collider.enabled = sg.y < 2.0;
    // flicker lights (motion-sensitive ones stutter when the player moves nearby)
    for (const f of L.flicker) {
      f.t -= dt;
      if (f.t <= 0) {
        let speed = f.speed, dropout = 0.06;
        if (f.motionRadius) {
          const d = Math.hypot(G.player.pos.x - f.l.position.x, G.player.pos.z - f.l.position.z);
          if (d < f.motionRadius && G.player.speed2D > 2.2) { speed = 6; dropout = 0.35; }
        }
        f.t = 0.05 + Math.random() * 0.25 / speed;
        const r = Math.random();
        let v;
        if (r < dropout) v = f.base * 0.08;
        else if (r < dropout + 0.09) v = f.base * (0.3 + Math.random() * 0.4);
        else v = f.base * (0.85 + Math.random() * 0.25);
        f.l.intensity = v;
        if (f.mesh && f.mesh.material.color) {
          if (!f.mesh.userData.baseColor) f.mesh.userData.baseColor = f.mesh.material.color.clone();
          f.mesh.material.color.copy(f.mesh.userData.baseColor).multiplyScalar(Math.max(0.08, v / f.base));
        }
      }
    }
    // searchable container doors / lids
    for (const c of L.containers) {
      if (c.angle !== c.target) {
        c.angle += (c.target - c.angle) * Math.min(1, dt * 5);
        if (Math.abs(c.angle - c.target) < 0.01) c.angle = c.target;
        if (c.kind === 'locker') c.pivot.rotation.y = c.angle; else c.pivot.rotation.x = c.angle;
      }
    }
    // scripted shadow crossing the facility hall
    if (L.shadow) {
      const s = L.shadow; s.t += dt;
      const k = s.t / 1.6;
      if (k >= 1) { root.remove(s.group); L.shadow = null; }
      else {
        s.group.position.set(-9 + k * 17.5, Math.abs(Math.sin(s.t * 14)) * 0.12, -170 - k * 3.5);
        s.group.rotation.y = -Math.PI / 2 - 0.2;
        s.legL.rotation.x = Math.sin(s.t * 14) * 0.9;
        s.legR.rotation.x = -Math.sin(s.t * 14) * 0.9;
        s.stepT -= dt;
        if (s.stepT <= 0) { s.stepT = 0.16; G.audio.play('footstep', { pos: s.group.position, vol: 0.35, surface: 'metal', pitch: 1.5 }); }
      }
    }
    // station radio chatter from Lev's set
    L.radioT = (L.radioT ?? 14) - dt;
    if (L.radioT <= 0) {
      L.radioT = 26 + Math.random() * 22;
      if (G.state === 'playing' && G.player.zone === 'station') {
        const rp = V3(-6.5, 1.2, -24.5);
        G.audio.play('radio_static_burst', { pos: rp, vol: 0.18 });
        G.audio.play('radio_voice', { pos: rp, vol: 0.32, syllables: 6, pitch: 0.9 + Math.random() * 0.2 });
        const lines = [
          '…Polyanka to Zastava… water convoy delayed again…',
          '…any station on the line, report surface conditions…',
          '…keep your masks dry. The spores are early this year…',
          '…Zastava, your signal is fading… say again…',
        ];
        G.ui.subtitle('Radio', lines[Math.random() * lines.length | 0], 3.5);
      }
    }
    for (const fan of L.fans) fan.rotation.z += dt * 1.5;
    // ambient survivor life: Lev works the radio dials, Borya watches the tunnel mouth
    for (const npc of L.npcs) {
      if (!npc.animator) npc.animator = new CharacterAnimator(npc.group);
      if (npc.baseYaw === undefined) npc.baseYaw = npc.group.rotation.y;
      const tt = t + npc.pos.x * 0.7;
      const talking = G.state === 'dialogue' && npc.id === 'lev';
      npc.animator.update(dt, { speed: 0, talk: talking ? 1 : 0 });
      const P = npc.animator.parts;
      if (npc.animator.native) continue;
      if (npc.id === 'lev') {
        P.shoulderR.rotation.x += -0.5 + Math.sin(tt * 1.7) * 0.15;
        P.elbowR.rotation.x += -0.4;
        P.head.rotation.y += Math.sin(tt * 0.6) * 0.15;
      } else {
        P.head.rotation.y += Math.sin(tt * 0.4) * 0.4;
        npc.group.rotation.y = npc.baseYaw + Math.sin(tt * 0.3) * 0.08;
      }
      npc.group.position.y = npc.pos.y + Math.sin(tt * 1.1) * 0.012;
    }
    // pickup bob
    for (const p of L.pickups) {
      if (!p.taken && p.kind !== 'note') p.mesh.position.y = p.baseY + Math.sin(t * 2 + p.seed) * 0.02;
      if (!p.taken && p.kind !== 'note') p.mesh.rotation.y = t * 0.5 + p.seed;
    }
  };

  L.spawnLog = () => {
    if (L.logPickup) return;
    L.logPickup = note('note_log', 0.9, 0.96, -236.9);
    L.state.logSpawned = true;
  };

  // one-shot scripted scare: a silhouette sprints across the facility hall
  L.startShadowCross = () => {
    if (L.shadow) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x04050a });
    const torso = P.B(0.45, 0.6, 0.3, mat, 0, 1.05, 0); torso.rotation.x = 0.6; g.add(torso);
    g.add(P.S(0.15, mat, 0, 1.35, -0.3));
    const legL = P.B(0.12, 0.8, 0.12, mat, -0.12, 0.4, 0);
    const legR = P.B(0.12, 0.8, 0.12, mat, 0.12, 0.4, 0);
    g.add(legL, legR);
    g.add(P.B(0.1, 0.7, 0.1, mat, -0.3, 1.0, -0.2));
    g.add(P.B(0.1, 0.7, 0.1, mat, 0.3, 1.0, -0.2));
    g.position.set(-9, 0, -170);
    root.add(g);
    L.shadow = { group: g, t: 0, legL, legR, stepT: 0 };
  };

  function trainColliders(cx, cy, cz, len, yaw) {
    // approximate: side walls with door gaps at ±len/4, end walls, floor, roof
    const W = 2.9, H = 2.9, floorY = cy + 0.15;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const local = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
    const doorZ = [-len / 4, len / 4];
    for (const side of [-1, 1]) {
      const segs = [[-len / 2, doorZ[0] - 0.65], [doorZ[0] + 0.65, doorZ[1] - 0.65], [doorZ[1] + 0.65, len / 2]];
      for (const [z0, z1] of segs) {
        const [wx, wz] = local(side * (W / 2 - 0.05), (z0 + z1) / 2);
        col(wx, floorY + 1.3, wz, 0.15, 2.6, z1 - z0, 'train');
      }
      // door header
      for (const dz of doorZ) {
        const [wx, wz] = local(side * (W / 2 - 0.05), dz);
        col(wx, floorY + 2.45, wz, 0.15, 0.5, 1.3, 'train');
      }
    }
    for (const end of [-1, 1]) {
      const [wx, wz] = local(0, end * (len / 2 - 0.05));
      col(wx, floorY + 1.3, wz, W, 2.6, 0.15, 'train');
    }
    // floor
    const [fx, fz] = local(0, 0);
    col(fx, floorY - 0.05, fz, W, 0.1, len, 'train');
    // roof
    col(fx, floorY + H - 0.15, fz, W, 0.2, len, 'train');
  }

  return L;
}

export function pickupName(kind, count) {
  const names = {
    pistolAmmo: 'Pistol rounds', rifleAmmo: 'Rifle rounds', medkit: 'Medkit',
    filter: 'Gas mask filter', battery: 'Battery', fuel: 'Diesel canister', rifle: '“Burya” rifle',
  };
  return (names[kind] || kind) + (count > 1 ? ` ×${count}` : '');
}