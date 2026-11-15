// First-person weapons: procedural viewmodels, ADS, recoil, reload, hitscan.
import * as THREE from 'three';

function muzzleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.3, 'rgba(255,180,80,0.8)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  // spikes
  ctx.strokeStyle = 'rgba(255,220,150,0.9)'; ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPistol(M) {
  const g = new THREE.Group();
  const steel = M.gunmetal, rust = M.rust;
  const gripMat = M.wood.clone(); gripMat.color.set(0x4a3c2a);
  // reciprocating slide (slide body + serrations + sights ride together)
  const slide = new THREE.Group();
  slide.add(mkBox(0.05, 0.07, 0.24, steel, 0, 0.02, -0.05));
  for (let i = 0; i < 5; i++) slide.add(mkBox(0.052, 0.05, 0.004, M.gunmetalDark, 0, 0.02, 0.04 + i * 0.012));
  slide.add(mkBox(0.008, 0.015, 0.008, steel, 0, 0.065, -0.16));
  slide.add(mkBox(0.02, 0.012, 0.01, steel, 0, 0.062, 0.06));
  g.add(slide);
  // frame
  g.add(mkBox(0.045, 0.05, 0.2, rust, 0, -0.035, -0.03));
  // barrel
  const barrel = mkCyl(0.014, 0.1, steel, 0, 0.02, -0.2);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  // grip
  const grip = mkBox(0.045, 0.13, 0.06, gripMat, 0, -0.11, 0.05);
  grip.rotation.x = 0.25; g.add(grip);
  // trigger guard
  const tg = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), steel);
  tg.rotation.z = Math.PI; tg.position.set(0, -0.075, -0.02); g.add(tg);
  // hammer
  g.add(mkBox(0.012, 0.02, 0.015, rust, 0, 0.045, 0.09));
  // ejection port
  g.add(mkBox(0.02, 0.025, 0.05, M.gunmetalDark, 0.026, 0.03, -0.02));
  // trigger
  g.add(mkBox(0.008, 0.03, 0.008, M.gunmetalDark, 0, -0.06, -0.01));
  // slide-stop + takedown lever on the left face so the slide isn't a plain slab
  g.add(mkBox(0.006, 0.012, 0.05, M.gunmetalDark, -0.026, 0.0, -0.02));
  g.add(mkBox(0.006, 0.01, 0.02, M.gunmetalDark, -0.026, -0.02, 0.02));
  // grip checkering + magazine baseplate (ride the grip so they drop with the mag)
  grip.add(mkBox(0.048, 0.012, 0.064, M.gunmetalDark, 0, -0.07, 0));
  for (let i = 0; i < 3; i++) {
    grip.add(mkBox(0.046, 0.005, 0.004, M.gunmetalDark, 0, -0.03 + i * 0.03, -0.031));
    grip.add(mkBox(0.046, 0.005, 0.004, M.gunmetalDark, 0, -0.03 + i * 0.03, 0.031));
  }
  // right hand on the grip (rides along when the mag drops on reload)
  const handR = mkHand(M, { side: 1 });
  handR.position.set(0, -0.01, 0.01);
  grip.add(handR);
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.26);
  g.userData.magMesh = grip;
  g.userData.slide = slide;
  return g;
}

function buildRifle(M) {
  const g = new THREE.Group();
  const steel = M.gunmetal, dark = M.gunmetalDark;
  // Keep the supplied PBR maps; local tints never change shared world materials.
  const wood = M.wood.clone(); wood.color.multiplyScalar(0.78); wood.roughness = 0.86;
  const gripMat = M.rubber.clone(); gripMat.color.set(0x30322d);
  const wear = steel.clone(); wear.color.set(0x646963); wear.roughness = 0.64;
  wear.normalScale.multiplyScalar(0.65);

  // Pressed lower receiver with an actual ejection opening, not a black decal.
  const port = [[-0.086, 0.006], [0.043, 0.006], [0.048, 0.012],
    [0.048, 0.024], [-0.081, 0.024], [-0.086, 0.019]];
  g.add(mkProfile([[-0.211, -0.024], [-0.195, -0.039], [0.083, -0.039],
    [0.118, -0.019], [0.118, 0.026], [0.096, 0.037], [-0.185, 0.037],
    [-0.211, 0.02]], 0.049, steel, 0.0025, [port]));
  const leftPlate = mkProfile([[-0.175, -0.024], [0.089, -0.024], [0.102, -0.011],
    [0.096, 0.027], [-0.171, 0.027], [-0.186, 0.011]], 0.003, dark, 0.001);
  leftPlate.position.x = -0.026; g.add(leftPlate);
  // Tapered, rolled top cover: a crowned octagonal section and pinched end caps.
  g.add(mkLoft([[-0.207, 0.026, 0.021, 0.012], [-0.191, 0.029, 0.027, 0.022],
    [0.074, 0.029, 0.026, 0.021], [0.106, 0.025, 0.02, 0.014]], steel));
  for (const side of [-1, 1]) {
    g.add(mkTube([[side * 0.026, 0.03, -0.178], [side * 0.026, 0.032, -0.06],
      [side * 0.024, 0.03, 0.077]], 0.0008, wear));
    for (const z of [-0.176, -0.145, 0.072, 0.096]) {
      g.add(mkRod([side * 0.024, -0.015, z], [side * 0.029, -0.015, z], 0.0033, 0.0028, steel));
    }
  }
  g.add(mkRod([0, 0.033, 0.104], [0, 0.033, 0.119], 0.007, 0.005, dark)); // cover latch

  // Tapered stock neck, dropped heel and raised cheek comb, all joined surfaces.
  g.add(mkLoft([[0.106, -0.012, 0.019, 0.027], [0.145, -0.023, 0.021, 0.03],
    [0.205, -0.037, 0.026, 0.039], [0.292, -0.049, 0.029, 0.05],
    [0.34, -0.052, 0.027, 0.05]], wood));
  g.add(mkLoft([[0.155, -0.005, 0.017, 0.006], [0.198, -0.003, 0.024, 0.009],
    [0.28, -0.004, 0.026, 0.009], [0.319, -0.011, 0.023, 0.006]], wood));
  g.add(mkLoft([[0.112, -0.014, 0.022, 0.029], [0.128, -0.018, 0.023, 0.03]], dark));
  g.add(mkLoft([[0.337, -0.052, 0.029, 0.052], [0.349, -0.052, 0.03, 0.053],
    [0.354, -0.052, 0.026, 0.049]], M.rubber));
  for (let i = 0; i < 6; i++) {
    const y = -0.018 - i * 0.013;
    g.add(mkTube([[-0.019, y, 0.354], [0, y, 0.355], [0.019, y, 0.354]], 0.001, dark));
  }
  // Stock sling loop and its mounting boss.
  g.add(mkRod([-0.026, -0.067, 0.279], [-0.034, -0.067, 0.279], 0.004, 0.004, steel));
  g.add(mkTube([[-0.036, -0.066, 0.27], [-0.039, -0.077, 0.27],
    [-0.039, -0.078, 0.293], [-0.036, -0.066, 0.293]], 0.002, dark, true));

  const grip = mkProfile([[-0.024, 0.047], [0.014, 0.05], [0.027, 0.027],
    [0.03, -0.052], [0.019, -0.062], [-0.016, -0.055], [-0.025, -0.03]], 0.034, gripMat, 0.004);
  grip.position.set(0, -0.1, 0.02); grip.rotation.x = 0.3; g.add(grip);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      grip.add(mkTube([[side * 0.019, -0.036 + i * 0.015, -0.008],
        [side * 0.0205, -0.029 + i * 0.015, 0.016]], 0.0012, dark));
    }
  }

  // A real curved magazine section: both edges are cubic curves, with pressed ribs.
  // Geometry is offset inside this ZERO-origin pivot; reload overwrites position.y.
  const mag = new THREE.Group();
  const magShape = new THREE.Shape();
  magShape.moveTo(0.058, -0.026); magShape.lineTo(0.136, -0.026);
  magShape.bezierCurveTo(0.137, -0.105, 0.158, -0.173, 0.202, -0.232);
  magShape.lineTo(0.155, -0.258);
  magShape.bezierCurveTo(0.102, -0.197, 0.08, -0.129, 0.058, -0.026);
  magShape.closePath();
  mag.add(mkProfile(magShape, 0.04, dark, 0.003));
  mag.add(mkProfile([[-0.06, -0.029], [-0.138, -0.029], [-0.141, -0.061],
    [-0.066, -0.062]], 0.044, steel, 0.001));
  mag.add(mkProfile([[-0.149, -0.249], [-0.157, -0.263], [-0.209, -0.235],
    [-0.2, -0.225]], 0.048, steel, 0.002));
  const front = new THREE.CubicBezierCurve3(new THREE.Vector3(0, -0.026, -0.136),
    new THREE.Vector3(0, -0.105, -0.137), new THREE.Vector3(0, -0.173, -0.158), new THREE.Vector3(0, -0.232, -0.202));
  const back = new THREE.CubicBezierCurve3(new THREE.Vector3(0, -0.026, -0.058),
    new THREE.Vector3(0, -0.129, -0.08), new THREE.Vector3(0, -0.197, -0.102), new THREE.Vector3(0, -0.258, -0.155));
  for (const side of [-1, 1]) {
    for (const across of [0.22, 0.5, 0.78]) {
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const t = 0.19 + i * 0.073;
        const p = back.getPoint(t).lerp(front.getPoint(t), across);
        points.push([side * 0.023, p.y, p.z]);
      }
      mag.add(mkTube(points, 0.0018, steel));
    }
  }
  g.add(mag);

  // Forged trigger guard has a through-hole and a separate curved trigger.
  g.add(mkProfile([[0.015, -0.04], [0.018, -0.082], [0.003, -0.101],
    [-0.033, -0.103], [-0.058, -0.084], [-0.054, -0.041]], 0.012, dark, 0.001,
  [[[0.008, -0.047], [0.011, -0.079], [-0.001, -0.093], [-0.031, -0.095],
    [-0.05, -0.08], [-0.048, -0.047]]]));
  g.add(mkTube([[0, -0.041, -0.013], [0, -0.061, -0.024], [0, -0.079, -0.016]], 0.003, steel));
  g.add(mkProfile([[-0.057, -0.039], [-0.05, -0.052], [-0.062, -0.066],
    [-0.075, -0.063], [-0.069, -0.049]], 0.023, steel, 0.0015)); // magazine release

  // Stepped barrel, gas piston housing and clamped, genuinely vented fore-end.
  g.add(mkRod([0, 0.01, -0.209], [0, 0.01, -0.548], 0.0125, 0.0095, steel, 16));
  g.add(mkRod([0, 0.045, -0.216], [0, 0.045, -0.432], 0.009, 0.007, dark, 12));
  g.add(mkLoft([[-0.407, -0.012, 0.023, 0.025], [-0.385, -0.013, 0.029, 0.028],
    [-0.26, -0.014, 0.033, 0.028], [-0.216, -0.011, 0.03, 0.028],
    [-0.204, -0.007, 0.026, 0.022]], wood));
  const vents = [];
  for (let i = 0; i < 4; i++) {
    const z = -0.375 + i * 0.037;
    vents.push([[z, 0.033], [z + 0.021, 0.033], [z + 0.025, 0.037],
      [z + 0.025, 0.045], [z + 0.004, 0.045], [z, 0.041]]);
  }
  for (const side of [-1, 1]) {
    const shroud = mkProfile([[-0.395, 0.024], [-0.219, 0.024], [-0.219, 0.049],
      [-0.236, 0.055], [-0.381, 0.052], [-0.395, 0.044]], 0.003, dark, 0.001, vents);
    shroud.position.x = side * 0.025; g.add(shroud);
    // Longitudinal finger groove in the wood, following its tapered shoulder.
    g.add(mkTube([[side * 0.027, -0.001, -0.38], [side * 0.032, -0.001, -0.3],
      [side * 0.029, 0.001, -0.232]], 0.0016, gripMat));
  }
  g.add(mkLoft([[-0.391, 0.05, 0.019, 0.004], [-0.375, 0.053, 0.024, 0.005],
    [-0.237, 0.055, 0.024, 0.005], [-0.219, 0.049, 0.022, 0.004]], dark));
  for (const z of [-0.402, -0.215]) {
    g.add(mkLoft([[z - 0.005, 0.005, 0.029, 0.04], [z + 0.005, 0.005, 0.03, 0.041]], steel));
    g.add(mkRod([-0.032, 0.009, z], [0.033, 0.009, z], 0.003, 0.003, wear));
  }
  g.add(mkProfile([[-0.446, 0.005], [-0.416, 0.005], [-0.416, 0.053],
    [-0.431, 0.056], [-0.446, 0.037]], 0.023, dark, 0.002));
  g.add(mkRod([0, 0.01, -0.445], [0, 0.01, -0.423], 0.015, 0.015, steel));

  // Sight stations and post height match the old FP/ADS alignment (-Z forward).
  g.add(mkProfile([[-0.512, 0.009], [-0.486, 0.009], [-0.49, 0.06],
    [-0.505, 0.06]], 0.014, dark, 0.0015));
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0025, 8, 24, Math.PI * 1.5), steel);
  hood.position.set(0, 0.066, -0.5); hood.rotation.z = Math.PI * 0.75; g.add(hood);
  g.add(mkRod([0, 0.052, -0.5], [0, 0.0775, -0.5], 0.0025, 0.0015, steel));
  g.add(mkLoft([[0.023, 0.049, 0.013, 0.008], [0.061, 0.049, 0.016, 0.008]], dark));
  const notch = new THREE.Shape();
  notch.moveTo(-0.017, 0.052); notch.lineTo(0.017, 0.052);
  notch.lineTo(0.017, 0.074); notch.lineTo(0.006, 0.074);
  notch.lineTo(0.005, 0.064); notch.lineTo(-0.005, 0.064);
  notch.lineTo(-0.006, 0.074); notch.lineTo(-0.017, 0.074); notch.closePath();
  const rear = mkExtruded(notch, 0.009, dark, 0.0007);
  rear.position.z = 0.05; g.add(rear);
  g.add(mkRod([-0.019, 0.058, 0.046], [0.022, 0.058, 0.046], 0.003, 0.003, steel));

  // Open muzzle crown and four brake windows, rather than a capped cylinder.
  const collar = (z, length, outer, inner, material) => {
    const profile = [[inner, -length / 2], [outer, -length / 2], [outer, length / 2],
      [inner, length / 2], [inner, -length / 2]].map(p => new THREE.Vector2(...p));
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), material);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(0, 0.01, z); g.add(mesh);
  };
  collar(-0.547, 0.012, 0.016, 0.0065, dark);
  collar(-0.577, 0.006, 0.018, 0.007, wear);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const x = Math.cos(a) * 0.014, y = 0.01 + Math.sin(a) * 0.014;
    g.add(mkRod([x, y, -0.553], [x, y, -0.574], 0.0035, 0.0035, dark));
  }

  // Carrier and handle ride a zero-origin bolt group, including its grip grooves.
  const bolt = new THREE.Group();
  const carrier = mkProfile([[-0.079, 0.006], [0.022, 0.006], [0.029, 0.013],
    [0.019, 0.025], [-0.074, 0.025]], 0.009, dark, 0.001);
  carrier.position.x = 0.016; bolt.add(carrier);
  bolt.add(mkRod([0.019, 0.017, -0.004], [0.046, 0.017, 0.002], 0.0045, 0.004, steel));
  bolt.add(mkRod([0.046, 0.017, -0.014], [0.046, 0.017, 0.02], 0.0065, 0.005, dark));
  for (let i = 0; i < 4; i++) {
    bolt.add(mkRod([0.046, 0.017, -0.01 + i * 0.007],
      [0.046, 0.017, -0.008 + i * 0.007], 0.0068, 0.0068, steel));
  }
  g.add(bolt);
  // Left thumb selector, pivot, detent marks, and a stamped reinforcing seam.
  g.add(mkRod([-0.026, -0.009, 0.061], [-0.033, -0.009, 0.061], 0.008, 0.007, steel));
  const selector = mkProfile([[0.065, -0.006], [0.026, -0.017], [0.017, -0.016],
    [0.016, -0.023], [0.029, -0.025], [0.066, -0.012]], 0.003, steel, 0.001);
  selector.position.x = -0.033; g.add(selector);
  for (let i = 0; i < 3; i++) {
    const z = 0.037 + i * 0.012;
    g.add(mkTube([[-0.0285, 0.005, z], [-0.0285, 0.01, z - 0.003]], 0.0007, wear));
  }
  g.add(mkTube([[-0.029, -0.009, -0.15], [-0.029, -0.011, -0.095],
    [-0.029, -0.009, -0.047]], 0.0014, steel));
  // Sparse edge nicks, kept on exposed edges instead of coating everything in rust.
  for (let i = 0; i < 5; i++) {
    const z = -0.166 + i * 0.044;
    g.add(mkTube([[-0.026, 0.027, z], [-0.027, 0.024, z + 0.005]], 0.0006, wear));
  }

  const handR = mkHand(M, { side: 1 });
  handR.position.set(0, -0.105, 0.02); handR.rotation.x = 0.3; g.add(handR);
  const handL = mkHand(M, { fingersUp: true, side: -1 });
  handL.position.set(0, -0.06, -0.3); g.add(handL);
  handL.userData.base = handL.position.clone();
  g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.58);
  g.userData.magMesh = mag;
  g.userData.handL = handL;
  g.userData.bolt = bolt;
  return g;
}

function mkBox(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function mkCyl(r, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), mat);
  m.position.set(x, y, z);
  return m;
}

// Small local geometry helpers. Dimensions are metres, with -Z down the barrel.
function mkExtruded(shape, width, mat, bevel = 0.002) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, steps: 1, curveSegments: 12,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  geometry.translate(0, 0, -width / 2);
  // Extrude's default UVs are in metres: scale to a useful viewmodel texel density.
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
  return new THREE.Mesh(geometry, mat);
}

function mkProfile(points, width, mat, bevel = 0.002, holes = []) {
  // Author side silhouettes as [z, y]; extrusion thickness becomes the local X axis.
  const shape = Array.isArray(points) ? new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y))) : points;
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([z, y]) => new THREE.Vector2(-z, y))));
  const mesh = mkExtruded(shape, width, mat, bevel);
  mesh.geometry.rotateY(Math.PI / 2);
  return mesh;
}

function mkLoft(sections, mat, round = false) {
  // Increasing-Z stations: [z, centreY, halfWidth, halfHeight, centreX = 0].
  // The octagon gives stocks/covers broad faces with bevelled shoulders; rounded
  // sections give palms and cloth a continuous, non-cylindrical silhouette.
  const outline = round
    ? Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)])
    : [[1, 0.55], [0.7, 1], [-0.7, 1], [-1, 0.55], [-1, -0.55], [-0.7, -1], [0.7, -1], [1, -0.55]];
  const n = outline.length, stride = n + 1;
  const positions = [], uv = [], indices = [];
  for (let i = 0; i < sections.length; i++) {
    const [z, y, rx, ry, x = 0] = sections[i];
    for (let j = 0; j <= n; j++) {
      const [u, v] = outline[j % n];
      positions.push(x + u * rx, y + v * ry, z);
      uv.push(j / n, (z - sections[0][0]) / 0.18);
      if (i < sections.length - 1 && j < n) {
        const a = i * stride + j, b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Separate cap vertices keep end faces flat without distorting the side normals.
  for (const end of [0, sections.length - 1]) {
    const [z, y, rx, ry, x = 0] = sections[end];
    const center = positions.length / 3;
    positions.push(x, y, z); uv.push(0.5, 0.5);
    for (const [u, v] of outline) {
      positions.push(x + u * rx, y + v * ry, z); uv.push(u / 2 + 0.5, v / 2 + 0.5);
    }
    for (let j = 0; j < n; j++) {
      const a = center + 1 + j, b = center + 1 + (j + 1) % n;
      if (end === 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Weld only the UV seam's normals; the two vertices retain distinct UVs.
  const normal = geometry.getAttribute('normal');
  const averaged = new THREE.Vector3();
  for (let i = 0; i < sections.length; i++) {
    const a = i * stride, b = a + n;
    averaged.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b),
      normal.getZ(a) + normal.getZ(b)).normalize();
    normal.setXYZ(a, averaged.x, averaged.y, averaged.z);
    normal.setXYZ(b, averaged.x, averaged.y, averaged.z);
  }
  return new THREE.Mesh(geometry, mat);
}

function mkRod(a, b, radiusA, radiusB, mat, segments = 10) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), segments), mat);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function mkTube(points, radius, mat, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, (points.length - 1) * 4), radius, 6, closed), mat);
}

function mkOval(size, mat, position) {
  // Unit-radius sphere, explicitly scaled to HALF the requested dimensions.
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
  mesh.scale.set(size[0] / 2, size[1] / 2, size[2] / 2);
  mesh.position.set(...position);
  return mesh;
}

// Anatomical gloved grip and support poses, shared by pistol and rifle.
function mkHand(M, opts = {}) {
  const g = new THREE.Group(), side = opts.side ?? 1;
  const glove = M.rubber.clone(); glove.color.set(0x282b29); glove.roughness = 0.9;
  const sleeve = M.canvasCloth || M.cloth;
  const panels = M.canvasCloth2 || sleeve;
  if (opts.fingersUp) {
    // Broad metacarpal pad below the fore-end; fingers wrap across and up its side.
    g.add(mkLoft([[-0.043, 0.009, 0.016, 0.01, side * 0.012],
      [-0.027, 0.006, 0.026, 0.015, side * 0.012], [0.023, 0.006, 0.026, 0.016, side * 0.012],
      [0.054, -0.009, 0.019, 0.019, side * 0.015]], glove, true));
    for (let i = 0; i < 4; i++) {
      const z = -0.031 + i * 0.019, reach = i === 3 ? 0.047 : 0.059;
      const r = i === 3 ? 0.006 : 0.007;
      g.add(mkTube([[side * 0.028, 0.008, z], [side * 0.006, 0.007, z - 0.002],
        [-side * 0.028, 0.017, z - 0.002], [-side * 0.039, 0.038, z],
        [-side * 0.028, reach, z + 0.001]], r, glove));
      g.add(mkOval([r * 2.2, 0.018, r * 2.3], panels, [-side * 0.039, 0.034, z]));
      g.add(mkOval([r * 2, r * 2, r * 2], glove, [-side * 0.028, reach, z + 0.001]));
    }
    // Opposed thumb and thenar pad, separate from the four curling fingers.
    g.add(mkOval([0.027, 0.029, 0.037], glove, [side * 0.027, 0.013, 0.026]));
    g.add(mkTube([[side * 0.027, 0.016, 0.03], [side * 0.04, 0.037, 0.01],
      [side * 0.039, 0.057, -0.014], [side * 0.025, 0.064, -0.026]], 0.008, glove));
    g.add(mkOval([0.016, 0.016, 0.021], glove, [side * 0.025, 0.064, -0.026]));
    g.add(mkOval([0.008, 0.025, 0.049], panels, [side * 0.038, 0.002, 0.001]));
  } else {
    // Asymmetric palm alongside the grip, narrowing into a wrist rather than a box.
    g.add(mkLoft([[-0.025, -0.004, 0.009, 0.026, side * 0.023],
      [-0.012, -0.001, 0.016, 0.035, side * 0.023], [0.022, -0.005, 0.016, 0.032, side * 0.022],
      [0.056, -0.015, 0.019, 0.02, side * 0.016]], glove, true));
    for (let i = 0; i < 4; i++) {
      const y = 0.032 - i * 0.018, r = i === 3 ? 0.006 : 0.007;
      const tip = i === 0 ? [-side * 0.002, y - 0.005, -0.055]
        : [-side * 0.014, y - 0.005, -0.024];
      g.add(mkTube([[side * 0.03, y, -0.009], [side * 0.033, y + 0.001, -0.029],
        [side * 0.009, y - 0.003, i === 0 ? -0.051 : -0.04], tip], r, glove));
      g.add(mkOval([0.015, r * 2.2, 0.017], panels, [side * 0.034, y, -0.025]));
      g.add(mkOval([r * 2, r * 2, r * 2], glove, tip));
    }
    g.add(mkOval([0.029, 0.031, 0.034], glove, [side * 0.023, 0.013, 0.024]));
    g.add(mkTube([[side * 0.026, 0.019, 0.031], [side * 0.005, 0.037, 0.021],
      [-side * 0.02, 0.032, 0.004], [-side * 0.026, 0.013, -0.01]], 0.008, glove));
    g.add(mkOval([0.016, 0.021, 0.016], glove, [-side * 0.026, 0.013, -0.01]));
    g.add(mkOval([0.009, 0.047, 0.035], panels, [side * 0.038, -0.005, 0.006]));
  }
  // A continuous tapered sleeve with asymmetric elbow drift and sewn-in folds.
  g.add(mkLoft([[0.039, -0.013, 0.02, 0.021, side * 0.016],
    [0.071, -0.018, 0.025, 0.024, side * 0.017],
    [0.091, -0.024, 0.026, 0.024, side * 0.018]], glove, true));
  g.add(mkLoft([[0.078, -0.021, 0.028, 0.026, side * 0.017],
    [0.102, -0.028, 0.033, 0.029, side * 0.019], [0.119, -0.034, 0.036, 0.032, side * 0.021],
    [0.131, -0.04, 0.032, 0.028, side * 0.023], [0.151, -0.049, 0.037, 0.034, side * 0.026],
    [0.193, -0.069, 0.038, 0.034, side * 0.033], [0.208, -0.078, 0.035, 0.031, side * 0.035],
    [0.227, -0.089, 0.041, 0.036, side * 0.038], [0.29, -0.124, 0.043, 0.038, side * 0.047],
    [0.389, -0.178, 0.045, 0.04, side * 0.06]], sleeve, true));
  g.add(mkLoft([[0.073, -0.02, 0.029, 0.026, side * 0.017],
    [0.082, -0.022, 0.03, 0.027, side * 0.018],
    [0.096, -0.026, 0.03, 0.027, side * 0.019]], panels, true));
  // Stitched cuff edging and an outer sleeve seam follow the cloth, not floating rings.
  const cuffEdge = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    cuffEdge.push([side * 0.018 + Math.cos(a) * 0.0305, -0.023 + Math.sin(a) * 0.0275, 0.085]);
  }
  g.add(mkTube(cuffEdge, 0.0008, sleeve, true));
  g.add(mkTube([[side * 0.052, -0.028, 0.108], [side * 0.064, -0.049, 0.151],
    [side * 0.072, -0.071, 0.195], [side * 0.09, -0.124, 0.29]], 0.0009, panels));
  return g;
}

export const WEAPON_DEFS = {
  pistol: { name: 'KLYK', mode: 'SEMI', dmg: 34, magSize: 8, auto: false, fireDelay: 0.19, spread: 0.010, adsSpread: 0.0025, recoil: 0.028, reloadTime: 1.5, range: 60 },
  rifle: { name: 'BURYA', mode: 'AUTO', dmg: 24, magSize: 30, auto: true, fireDelay: 0.109, spread: 0.022, adsSpread: 0.006, recoil: 0.017, reloadTime: 2.2, range: 80 },
};

export class Weapons {
  constructor(G) {
    this.G = G;
    this.current = 'pistol';
    this.mags = { pistol: 8, rifle: 0 };
    this.state = 'idle'; // idle | reload | switch
    this.stateT = 0;
    this.fireTimer = 0;
    this.ads = false;
    this.adsK = 0;
    this.recoilK = 0;
    this.swayX = 0; this.swayY = 0;
    this.sprintK = 0;
    this.switchTo = null;
    this.bobPhase = 0;
    this.cycleK = 0;        // slide/bolt reciprocation after a shot
    this.inspectT = -1;     // weapon-inspect timeline (-1 = inactive)
    this.inspectK = 0;
    this.landK = 0;         // landing inertia dip
    this.wasGrounded = true;

    const cam = G.engine.camera;
    this.rig = new THREE.Group();
    cam.add(this.rig);
    G.scene.add(cam); // camera must be in scene for children to render

    this.models = { pistol: buildPistol(G.materials), rifle: buildRifle(G.materials) };
    for (const k of Object.keys(this.models)) {
      this.models[k].visible = k === 'pistol';
      this.rig.add(this.models[k]);
    }
    // muzzle flash
    this.flashTex = muzzleTexture();
    this.flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flashMesh.visible = false;
    this.rig.add(this.flashMesh);
    this.flashLight = new THREE.PointLight(0xffa050, 0, 7, 1.8);
    G.scene.add(this.flashLight);
    this.flashT = 0;

    // Shaped viewmodel light: a warm key from the upper left models the slide/receiver and
    // grip, a cool rim from the right separates the silhouette from the dark world.
    this.fill = new THREE.PointLight(0xfff0dd, 0.9, 2.4, 2);
    this.fill.position.set(-0.2, 0.28, -0.3);
    cam.add(this.fill);
    this.rim = new THREE.PointLight(0x9fb8d8, 0.45, 2.0, 2);
    this.rim.position.set(0.45, 0.05, -0.05);
    cam.add(this.rim);

    this._rayDir = new THREE.Vector3();
    this._rayOrigin = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
  }

  def() { return WEAPON_DEFS[this.current]; }
  reserve() { return this.current === 'pistol' ? this.G.player.inv.pistolAmmo : this.G.player.inv.rifleAmmo; }
  setReserve(n) { if (this.current === 'pistol') this.G.player.inv.pistolAmmo = n; else this.G.player.inv.rifleAmmo = n; }

  giveRifle() {
    this.G.player.hasRifle = true;
    if (this.mags.rifle === 0) this.mags.rifle = 30;
  }

  update(dt) {
    const G = this.G, input = G.input, p = G.player;
    const def = this.def();
    this.fireTimer -= dt;

    // ---- switching ----
    if (this.state !== 'switch') {
      let want = null;
      if (input.pressed('Digit1')) want = 'pistol';
      if (input.pressed('Digit2') && p.hasRifle) want = 'rifle';
      if (input.wheel !== 0 && p.hasRifle) want = this.current === 'pistol' ? 'rifle' : 'pistol';
      if (want && want !== this.current) {
        this.state = 'switch'; this.stateT = 0; this.switchTo = want;
        G.audio.play('draw_weapon', { vol: 0.5 });
      }
    }

    // ---- ADS ----
    this.ads = input.rmb && this.state === 'idle' && !p.sprinting && this.inspectT < 0;
    p.ads = this.ads;
    this.adsK += ((this.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 11);
    this.sprintK += ((p.sprinting && p.speed2D > 2 ? 1 : 0) - this.sprintK) * Math.min(1, dt * 8);
    const cam = G.engine.camera;
    const targetFov = this.ads ? 55 : 75 + this.sprintK * 6;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 11); cam.updateProjectionMatrix(); }

    // ---- inspect (I): tilt the weapon over to look at it; any combat input cancels ----
    if (input.pressed('KeyI') && this.state === 'idle' && this.inspectT < 0 && !p.sprinting) {
      this.inspectT = 0;
      G.audio.play('draw_weapon', { vol: 0.3 });
    }
    if (this.inspectT >= 0) {
      this.inspectT += dt;
      if (this.inspectT > 1.7 || this.state !== 'idle' || input.lmb || input.rmb || p.sprinting) this.inspectT = -1;
    }
    this.inspectK += ((this.inspectT >= 0 ? 1 : 0) - this.inspectK) * Math.min(1, dt * 10);

    // ---- landing inertia ----
    if (p.grounded && !this.wasGrounded) this.landK = 1;
    this.wasGrounded = p.grounded;
    this.landK += (0 - this.landK) * Math.min(1, dt * 7);
    // slide/bolt return spring
    this.cycleK += (0 - this.cycleK) * Math.min(1, dt * 14);

    // ---- reload ----
    if (input.pressed('KeyR') && this.state === 'idle' && this.inspectT < 0 && this.mags[this.current] < def.magSize && this.reserve() > 0) {
      this.state = 'reload'; this.stateT = 0;
      G.audio.play('reload', { vol: 0.8, kind: this.current });
    }

    // ---- fire ----
    const wantFire = def.auto ? input.lmb : input.lmbJust;
    if (wantFire && this.state === 'idle' && this.inspectT < 0 && this.fireTimer <= 0 && !p.sprinting) {
      if (this.mags[this.current] > 0) this.shoot();
      else {
        this.fireTimer = 0.25;
        G.audio.play('dryfire', { vol: 0.7 });
        if (this.reserve() > 0) this.autoReload();
        else G.ui.hint('Out of ammunition.');
      }
    }

    // ---- state timers ----
    if (this.state === 'reload') {
      this.stateT += dt;
      if (this.stateT >= def.reloadTime) {
        const need = def.magSize - this.mags[this.current];
        const take = Math.min(need, this.reserve());
        this.mags[this.current] += take; this.setReserve(this.reserve() - take);
        this.state = 'idle';
      }
    } else if (this.state === 'switch') {
      this.stateT += dt;
      if (this.stateT >= 0.22 && this.switchTo) {
        this.models[this.current].visible = false;
        this.current = this.switchTo;
        this.models[this.current].visible = true;
        this.switchTo = null;
        G.ui.setWeapon(this.def());
      }
      if (this.stateT >= 0.45) this.state = 'idle';
    }

    // ---- viewmodel animation ----
    const model = this.models[this.current];
    const baseX = 0.24, baseY = -0.22, baseZ = this.current === 'pistol' ? -0.42 : -0.5;
    const adsX = 0, adsY = this.current === 'pistol' ? -0.088 : -0.082, adsZ = this.current === 'pistol' ? -0.3 : -0.34;
    // slide / bolt reciprocation
    if (model.userData.slide) model.userData.slide.position.z = this.cycleK * 0.035;
    if (model.userData.bolt) model.userData.bolt.position.z = this.cycleK * 0.045;
    // inspect pose: roll the weapon toward the camera, turn it over mid-inspect
    const ik = this.inspectK;
    const ip = this.inspectT >= 0 ? Math.min(1, this.inspectT / 1.7) : 0;
    const turn = Math.sin(ip * Math.PI);
    const insX = -0.13 * ik, insY = 0.07 * ik, insZ = 0.05 * ik;
    const insRX = 0.22 * ik + turn * 0.15, insRY = 0.55 * ik + turn * 0.5, insRZ = -0.75 * ik;
    // sway from mouse
    this.swayX += (-input.mouseDX * 0.0006 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (input.mouseDY * 0.0006 - this.swayY) * Math.min(1, dt * 8);
    // bob
    const bobK = p.bobAmp * G.settings.bob * (this.ads ? 0.2 : 1) * (1 - ik);
    const bx = Math.cos(p.bobPhase) * 0.012 * bobK;
    const by = Math.sin(p.bobPhase * 2) * 0.01 * bobK;
    // recoil spring
    this.recoilK += (0 - this.recoilK) * Math.min(1, dt * 9);
    // reload dip
    let reloadDip = 0, reloadRot = 0;
    if (this.state === 'reload') {
      const k = this.stateT / def.reloadTime;
      reloadDip = Math.sin(Math.min(1, k) * Math.PI) * 0.13;
      reloadRot = Math.sin(Math.min(1, k) * Math.PI) * 0.5;
      const mag = model.userData.magMesh;
      if (mag) mag.position.y = -Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.12;
      const handL = model.userData.handL;
      if (handL) {
        const reach = Math.sin(Math.min(1, k * 1.25) * Math.PI);
        const b = handL.userData.base;
        handL.position.set(b.x, b.y - reach * 0.09, b.z + reach * 0.19);
      }
    } else {
      if (model.userData.magMesh) model.userData.magMesh.position.y = 0;
      const handL = model.userData.handL;
      if (handL) handL.position.copy(handL.userData.base);
    }
    // switch dip
    let switchDip = 0;
    if (this.state === 'switch') switchDip = Math.sin(Math.min(1, this.stateT / 0.45) * Math.PI) * 0.25;
    // sprint: weapon lowered and canted, sway reduced
    const sprintDip = this.sprintK * 0.11;
    const swayScale = (1 - this.sprintK * 0.6) * (1 - ik);

    const k = this.adsK;
    this.rig.position.set(
      baseX + (adsX - baseX) * k + bx * (1 - k) + this.swayX * swayScale + insX,
      baseY + (adsY - baseY) * k + by * (1 - k) + this.swayY * swayScale - reloadDip - switchDip - sprintDip - this.landK * 0.05 + insY,
      baseZ + (adsZ - baseZ) * k + this.recoilK * 0.07 + this.sprintK * 0.06 + insZ
    );
    this.rig.rotation.set(
      this.recoilK * 0.18 + reloadRot + this.swayY * 1.4 + this.sprintK * 0.28 + this.landK * 0.06 + insRX,
      this.swayX * 1.6 + (1 - k) * 0.03 + this.sprintK * 0.12 + insRY,
      (1 - k) * 0.02 + this.swayX * 0.8 + this.sprintK * 0.18 + insRZ
    );

    // muzzle flash decay
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashMesh.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity = 26 * (this.flashT / 0.05);
    }

    G.ui.setAmmo(this.mags[this.current], this.reserve(), def);
    G.ui.setCrosshairSpread(this.currentSpread() * 900, this.ads);
  }

  autoReload() {
    const def = this.def();
    if (this.state === 'idle' && this.reserve() > 0) {
      this.state = 'reload'; this.stateT = 0;
      this.G.audio.play('reload', { vol: 0.8, kind: this.current });
    }
  }

  currentSpread() {
    const def = this.def();
    const p = this.G.player;
    let s = this.ads ? def.adsSpread : def.spread;
    s *= 1 + p.speed2D * 0.25;
    if (!p.grounded) s *= 2;
    if (p.crouched) s *= 0.7;
    return s;
  }

  shoot() {
    const G = this.G, def = this.def(), p = G.player;
    this.mags[this.current]--;
    this.fireTimer = def.fireDelay;
    this.recoilK = Math.min(1.6, this.recoilK + 1);
    this.cycleK = 1;
    p.pitch += def.recoil * (0.7 + Math.random() * 0.6) * (this.ads ? 0.6 : 1);
    p.yaw += (Math.random() - 0.5) * def.recoil * 0.5;
    p.trauma = Math.min(1, p.trauma + 0.08);

    // sound + noise
    G.audio.play(this.current, { vol: 0.95, pitch: 0.95 + Math.random() * 0.1, verb: 0.5 });
    G.game.emitNoise(p.pos, 45, 'shot');

    // muzzle flash
    const model = this.models[this.current];
    this._muzzleWorld.copy(model.userData.muzzle);
    model.localToWorld(this._muzzleWorld);
    this.flashMesh.position.copy(this.rig.position).add(model.userData.muzzle.clone().applyEuler(this.rig.rotation));
    this.flashMesh.rotation.z = Math.random() * Math.PI;
    this.flashMesh.visible = true;
    this.flashMesh.scale.setScalar(0.8 + Math.random() * 0.5);
    this.flashT = 0.05;
    this.flashLight.position.copy(this._muzzleWorld);
    this.flashLight.intensity = 26;

    // shell
    const right = this._tmp.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    G.effects.shell(G.engine.camera.position.clone().addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.1, 0)), right);

    // hitscan
    const spread = this.currentSpread();
    this._rayOrigin.copy(G.engine.camera.position);
    this._rayDir.copy(p.lookDir());
    this._rayDir.x += (Math.random() - 0.5) * spread * 2;
    this._rayDir.y += (Math.random() - 0.5) * spread * 2;
    this._rayDir.z += (Math.random() - 0.5) * spread * 2;
    this._rayDir.normalize();

    // enemy physics boxes must not block the hit-sphere test against their own bodies
    const worldHit = G.physics.raycast(this._rayOrigin, this._rayDir, def.range, 'enemy');
    let hitDist = worldHit ? worldHit.dist : def.range;
    let hitEnemy = null, headshot = false;

    for (const e of G.enemies) {
      if (e.dead) continue;
      const hit = e.raycastHit(this._rayOrigin, this._rayDir, hitDist);
      if (hit && hit.dist < hitDist) { hitDist = hit.dist; hitEnemy = e; headshot = hit.head; }
    }

    const hitPoint = this._rayOrigin.clone().addScaledVector(this._rayDir, hitDist);
    G.effects.tracer(this._muzzleWorld, hitPoint);

    if (hitEnemy) {
      const dmg = def.dmg * (headshot ? 2.2 : 1);
      hitEnemy.damage(dmg, this._rayDir, headshot);
      G.effects.burst(hitPoint, { count: 14, color: 0x8a1a12, speed: 2.5, life: 0.5, grav: 7 });
      G.audio.play('flesh_hit', { pos: hitPoint, vol: 0.8 });
      G.ui.hitmarker(hitEnemy.dead);
      G.stats.hits++;
      if (hitEnemy.dead) G.stats.kills++;
    } else if (worldHit) {
      const n = worldHit.normal;
      G.effects.impactDecal(hitPoint, n);
      G.effects.burst(hitPoint, { count: 8, color: 0xffcc66, speed: 2.5, life: 0.35, grav: 8, dir: n });
      G.effects.burst(hitPoint, { count: 6, color: 0x777777, speed: 1, life: 0.7, grav: 2, dir: n });
      G.audio.play('bullet_impact', { pos: hitPoint, vol: 0.7, pitch: 0.8 + Math.random() * 0.5 });
      if (Math.random() < 0.3) G.audio.play('ricochet', { pos: hitPoint, vol: 0.4, pitch: 0.7 + Math.random() * 0.6 });
    }
    G.stats.shots++;
  }

  serialize() { return { current: this.current, mags: { ...this.mags } }; }
  deserialize(d) {
    this.mags = { ...d.mags };
    this.models[this.current].visible = false;
    this.current = d.current;
    this.models[this.current].visible = true;
    this.state = 'idle';
    this.G.ui.setWeapon(this.def());
  }
}