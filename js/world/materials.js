// Shared materials: shipped PBR sets (assets/) when available, procedural fallback otherwise.
import * as THREE from 'three';
import * as TX from '../core/textures.js';

function rep(tex, x, y) {
  const t = tex.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

function mutantSkinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#9aa08c'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(70,76,60,${0.10 + Math.random() * 0.22})`;
    x.beginPath();
    x.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 26, 4 + Math.random() * 18, Math.random() * 3, 0, 7);
    x.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const v = 110 + Math.random() * 60;
    x.fillStyle = `rgba(${v | 0},${(v + 4) | 0},${(v - 14) | 0},0.12)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMaterials(assets = null) {
  const concrete = TX.concreteTexture();
  const concreteDark = TX.concreteTexture('#3f4042');
  const tiles = TX.tileTexture();
  const floor = TX.platformFloorTexture();
  const ballast = TX.ballastTexture();
  const rust = TX.rustMetalTexture();
  const train = TX.trainExteriorTexture();
  const trainIn = TX.rustMetalTexture('#4c4a42');
  const wood = TX.woodTexture();
  const panel = TX.metalPanelTexture();
  const hazard = TX.hazardTexture();
  const ceil = TX.ceilingTexture();

  const M = {};
  const pbr = (key, set, repeat, extra = {}) => {
    const m = assets && assets.pbr(set, repeat, extra);
    if (m) { M[key] = m; return true; }
    return false;
  };

  // --- PBR path (CC0 Poly Haven sets, see assets/ATTRIBUTION.md) ---
  pbr('concrete', 'cracked_concrete_wall', [2, 2]);
  pbr('concreteDark', 'cracked_concrete_wall', [2, 2], { color: 0x6e6e6c });
  pbr('tiles', 'long_white_tiles', [4, 2], { color: 0xbdb9ac, roughness: 0.72, metalness: 0.04 });
  pbr('tilesBig', 'long_white_tiles', [8, 3], { color: 0xbdb9ac, roughness: 0.72, metalness: 0.04 });
  pbr('floor', 'concrete_floor_worn_001', [6, 6], { color: 0x8f8b82 });
  pbr('floorTunnel', 'concrete_floor_worn_001', [2, 24], { color: 0x85817a });
  pbr('ballast', 'gravel', [3, 40]);
  pbr('rust', 'rusty_metal_02', [1, 1], { color: 0xb5b1a9, metalness: 0.3 });
  pbr('rustPipe', 'rusty_metal_02', [3, 1], { color: 0xaaa69e, metalness: 0.35 });
  pbr('trainIn', 'rusty_metal_02', [2, 1], { color: 0x8a867c, metalness: 0.15 });
  pbr('wood', 'weathered_brown_planks', [1, 1]);
  pbr('panel', 'rusty_metal_02', [1, 1], { color: 0x848c94, metalness: 0.35 });
  pbr('ceiling', 'cracked_concrete_wall', [6, 6], { color: 0x7c7c7e });
  pbr('ceilingTunnel', 'cracked_concrete_wall', [2, 20], { color: 0x7c7c7e, side: THREE.DoubleSide });
  pbr('rail', 'rusty_metal_02', [1, 8], { color: 0x8a7a68, metalness: 0.6 });
  pbr('grate', 'metal_grate_rusty', [2, 2], { metalness: 0.4 });

  // The glazed-tile set ships a low roughness map that reads as wet gloss under the
  // tube lights. Decades of grime matte real metro tile, so drop the gloss map and
  // keep a uniform ceramic roughness (normal map still carries the grout relief).
  for (const k of ['tiles', 'tilesBig']) {
    const m = M[k];
    if (m && m.roughnessMap) { m.roughnessMap = null; m.roughness = 0.8; m.needsUpdate = true; }
  }
  // Same for the ceiling: the shipped roughness map leaves wet-looking specular streaks
  // under every lamp. Dry, dust-caked concrete should not mirror the tubes.
  for (const k of ['ceiling', 'ceilingTunnel']) {
    const m = M[k];
    if (m && m.roughnessMap) { m.roughnessMap = null; m.roughness = 0.97; m.needsUpdate = true; }
  }
  // Push floor relief so wear/cracks read at grazing angles instead of a flat slab.
  for (const k of ['floor', 'floorTunnel']) {
    const m = M[k];
    if (m) m.normalScale.set(1.4, 1.4);
  }

  // --- procedural fallback for anything the PBR path didn't cover ---
  const proc = {
    concrete: { map: rep(concrete, 2, 2), roughness: 0.95 },
    concreteDark: { map: rep(concreteDark, 2, 2), roughness: 0.97 },
    tiles: { map: rep(tiles, 4, 2), roughness: 0.72, metalness: 0.04 },
    tilesBig: { map: rep(tiles, 8, 3), roughness: 0.72, metalness: 0.04 },
    floor: { map: rep(floor, 6, 6), roughness: 0.85 },
    floorTunnel: { map: rep(floor, 2, 24), roughness: 0.9 },
    ballast: { map: rep(ballast, 3, 40), roughness: 1 },
    rust: { map: rep(rust, 1, 1), roughness: 0.75, metalness: 0.45 },
    rustPipe: { map: rep(rust, 3, 1), roughness: 0.7, metalness: 0.5 },
    trainIn: { map: rep(trainIn, 2, 1), roughness: 0.8, metalness: 0.2 },
    wood: { map: rep(wood, 1, 1), roughness: 0.9 },
    panel: { map: rep(panel, 1, 1), roughness: 0.6, metalness: 0.55 },
    ceiling: { map: rep(ceil, 6, 6), roughness: 0.95 },
    ceilingTunnel: { map: rep(ceil, 2, 20), roughness: 0.95, side: THREE.DoubleSide },
    rail: { map: rep(rust, 1, 8), color: 0x8a7a68, roughness: 0.5, metalness: 0.7 },
  };
  // train keeps its procedural soviet-green albedo either way (ribbed siding)
  proc.train = { map: rep(train, 3, 1), roughness: 0.6, metalness: 0.4 };
  const relief = {
    concrete: [2.2, 0.95, 0.1], concreteDark: [2.2, 0.97, 0.08], tiles: [1.6, 0.72, 0.16],
    tilesBig: [1.6, 0.72, 0.16], floor: [1.8, 0.85, 0.15], floorTunnel: [1.8, 0.9, 0.12],
    ballast: [3.2, 1, 0.05], rust: [1.8, 0.75, 0.25], rustPipe: [1.6, 0.7, 0.25],
    train: [1.5, 0.6, 0.3], trainIn: [1.6, 0.8, 0.2], wood: [2, 0.9, 0.12],
    panel: [1.4, 0.6, 0.3], ceiling: [1.8, 0.95, 0.08], ceilingTunnel: [1.8, 0.95, 0.08],
    rail: [1.5, 0.5, 0.3],
  };
  for (const [k, params] of Object.entries(proc)) {
    if (M[k]) continue;
    const m = new THREE.MeshStandardMaterial(params);
    const [strength, rb, rv] = relief[k] || [1.5, 0.85, 0.15];
    const maps = TX.deriveMaps(params.map, { strength, roughBase: rb, roughVar: rv });
    m.normalMap = rep(maps.normal, params.map.repeat.x, params.map.repeat.y);
    m.roughnessMap = rep(maps.rough, params.map.repeat.x, params.map.repeat.y);
    M[k] = m;
  }

  // Worn parkerized gunmetal for viewmodels: scratched normal + roughness variation so the
  // slide/receiver catch lamp glints and read as machined metal, not flat grey plastic.
  const gunMaps = TX.deriveMaps(TX.metalPanelTexture(), { strength: 1.1, roughBase: 0.46, roughVar: 0.3 });
  for (const t of [gunMaps.normal, gunMaps.rough]) { t.repeat.set(2, 2); t.needsUpdate = true; }
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x474c52, metalness: 0.72, roughness: 0.5, normalMap: gunMaps.normal, roughnessMap: gunMaps.rough });
  gunmetal.normalScale.set(0.6, 0.6);
  const gunmetalDark = new THREE.MeshStandardMaterial({ color: 0x2b2f34, metalness: 0.65, roughness: 0.58, normalMap: gunMaps.normal, roughnessMap: gunMaps.rough });
  gunmetalDark.normalScale.set(0.5, 0.5);

  Object.assign(M, {
    hazard: new THREE.MeshStandardMaterial({ map: rep(hazard, 2, 1), roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5a6066, roughness: 0.45, metalness: 0.8 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.55, metalness: 0.7 }),
    gunmetal, gunmetalDark,
    rubber: new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 0.95 }),
    canvasCloth: new THREE.MeshStandardMaterial({ color: 0x4a4a38, roughness: 1 }),
    canvasCloth2: new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1 }),
    mattress: new THREE.MeshStandardMaterial({ color: 0x5a5244, roughness: 1 }),
    blanket: new THREE.MeshStandardMaterial({ color: 0x4a3038, roughness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.9, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.55 }),
    puddle: new THREE.MeshPhongMaterial({ color: 0x0a0e10, specular: 0x3d4750, shininess: 64, transparent: true, opacity: 0.92 }),
    radPuddle: new THREE.MeshPhongMaterial({ color: 0x1a2a12, specular: 0x4a6a3a, shininess: 60, transparent: true, opacity: 0.9, emissive: 0x1a3a0a, emissiveIntensity: 0.4 }),
    flesh: new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.85 }),
    fleshDark: new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.9 }),
    mutantSkin: new THREE.MeshStandardMaterial({ map: mutantSkinTexture(), roughness: 0.62 }),
    mutantFlesh: new THREE.MeshStandardMaterial({ color: 0x666c5c, roughness: 0.7 }),
    mutantBone: new THREE.MeshStandardMaterial({ color: 0xcfc9b4, roughness: 0.55 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x3f3a33, roughness: 1 }),
    blood: new THREE.MeshBasicMaterial({ map: TX.bloodTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    dirt: new THREE.MeshBasicMaterial({ map: TX.dirtDecalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    // emissives
    lampWarm: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    lampCold: new THREE.MeshBasicMaterial({ color: 0xcfe8ff }),
    lampRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    lampGreen: new THREE.MeshBasicMaterial({ color: 0x3aff6a }),
    lampOff: new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.4 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x2a4a3a }),
    screenOn: new THREE.MeshBasicMaterial({ color: 0x4aff8a }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.9 }),
    eyeGlow: new THREE.MeshBasicMaterial({ color: 0xc8ff4a }),
  });

  // environment reflection strength: metals catch the lamps, concrete stays dead
  const envI = { steel: 0.5, steelDark: 0.45, gunmetal: 0.85, gunmetalDark: 0.7, rail: 0.4, rust: 0.3, rustPipe: 0.3, train: 0.3, trainIn: 0.2, panel: 0.35, glass: 0.6, tiles: 0.15, tilesBig: 0.15, lampOff: 0.3, grate: 0.35 };
  for (const k of Object.keys(M)) {
    const m = M[k];
    if (m && m.isMeshStandardMaterial) m.envMapIntensity = envI[k] ?? 0.12;
  }
  M.tex = { concrete, concreteDark, tiles, floor, ballast, rust, train, trainIn, wood, panel, hazard, ceil };
  return M;
}