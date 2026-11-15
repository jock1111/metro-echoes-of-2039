// Dev tool: package the CC-BY CesiumMan rig (assets/characters/cesium_man.glb) as the
// in-game Lev character with a full state set. Walk is the asset's own clip; Run is the
// same cycle time-compressed; Idle and Death are authored keyframes on the real skeleton.
// Authored frame is Z-up (node 0), so vertical = local Z and yaw = local Z rotation.
import fs from 'node:fs';

const SRC = 'assets/characters/cesium_man.glb';
const OUT = 'assets/characters/lev.glb';
const b = fs.readFileSync(SRC);
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let bin = b.slice(20 + jsonLen + 8);

const N = name => json.nodes.findIndex(n => n.name === name);
const HIP = N('Skeleton_torso_joint_1'), CHEST = N('torso_joint_3'), NECK = N('Skeleton_neck_joint_1'),
  HEAD = N('Skeleton_neck_joint_2'), AR = N('Skeleton_arm_joint_R'), AL = N('Skeleton_arm_joint_L__4_'),
  LL = N('leg_joint_L_1'), LR = N('leg_joint_R_1'), KL = N('leg_joint_L_2'), KR = N('leg_joint_R_2');
const chunks = [];
let off = bin.length;
function accessor(arr, type, componentType = 5126, minMax) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (off % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  const bv = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
  chunks.push(buf); off += buf.length;
  const ac = json.accessors.length;
  const count = arr.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[type]);
  const a = { bufferView: bv, componentType, count, type };
  if (minMax) { a.min = minMax[0]; a.max = minMax[1]; }
  json.accessors.push(a);
  return ac;
}
const q = (axis, ang) => {
  const s = Math.sin(ang / 2);
  return axis === 'x' ? [s, 0, 0, Math.cos(ang / 2)] : axis === 'y' ? [0, s, 0, Math.cos(ang / 2)] : [0, 0, s, Math.cos(ang / 2)];
};
const QI = [0, 0, 0, 1];
function clip(name, channels) {
  const samplers = [], chans = [];
  for (const [node, path, times, values] of channels) {
    const input = accessor(new Float32Array(times), 'SCALAR', 5126, [[times[0]], [times[times.length - 1]]]);
    const output = accessor(new Float32Array(values.flat()), path === 'rotation' ? 'VEC4' : 'VEC3');
    samplers.push({ input, output, interpolation: 'LINEAR' });
    chans.push({ sampler: samplers.length - 1, target: { node, path } });
  }
  json.animations.push({ name, channels: chans, samplers });
}

json.animations[0].name = 'Walk';
const walk = json.animations[0];
const runChannels = walk.channels.map(c => {
  const s = walk.samplers[c.sampler];
  const timesAcc = json.accessors[s.input];
  const bv = json.bufferViews[timesAcc.bufferView];
  const times = Array.from(new Float32Array(bin.buffer, bin.byteOffset + bv.byteOffset, timesAcc.count));
  return [c.target.node, c.target.path, times.map(t => t * 0.6), null, s.output];
});
{
  const samplers = [], chans = [];
  for (const [node, path, times, , out] of runChannels) {
    const input = accessor(new Float32Array(times), 'SCALAR', 5126, [[times[0]], [times[times.length - 1]]]);
    samplers.push({ input, output: out, interpolation: walk.samplers[walk.channels.find(c => c.target.node === node && c.target.path === path).sampler].interpolation });
    chans.push({ sampler: samplers.length - 1, target: { node, path } });
  }
  json.animations.push({ name: 'Run', channels: chans, samplers });
}

const T = [0, 1.5, 3];
const D = [0, 0.35, 0.9];
// Walk's first key is a passing pose: arms at sides, legs straight. Use it as the
// standing base so authored clips never fall back to the raised-arm bind pose.
function readChannel(node, path) {
  const c = walk.channels.find(c => c.target.node === node && c.target.path === path);
  if (!c) return null;
  const s = walk.samplers[c.sampler];
  const ia = json.accessors[s.input], oa = json.accessors[s.output];
  const ib = json.bufferViews[ia.bufferView], ob = json.bufferViews[oa.bufferView];
  const n = path === 'rotation' ? 4 : 3;
  const times = Array.from(new Float32Array(bin.buffer, bin.byteOffset + ib.byteOffset + (ia.byteOffset || 0), ia.count));
  const values = Array.from(new Float32Array(bin.buffer, bin.byteOffset + ob.byteOffset + (oa.byteOffset || 0), oa.count * n));
  return { times, values, n };
}
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const base = new Map();
// Standing key = both ankles lowest (double support). Knee angle alone picks push-off,
// where the trailing leg is straight but airborne. FK over the authored node tree.
const qmul = mul;
function qrot(qv, v) {
  const [x, y, z, w] = qv;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
function nodeLocal(n) {
  if (n.matrix) {
    const m = n.matrix;
    return { t: [m[12], m[13], m[14]], q: [0, 0, 0, 1] };
  }
  return { t: n.translation || [0, 0, 0], q: n.rotation || [0, 0, 0, 1] };
}
function fkAt(key) {
  const world = new Map();
  const visit = (i, pq, pt) => {
    const { t, q } = nodeLocal(json.nodes[i]);
    const wq = qmul(pq, q), wp = pt.map((c, j) => c + qrot(pq, t)[j]);
    world.set(i, { q: wq, p: wp });
    for (const c of json.nodes[i].children || []) visit(c, wq, wp);
  };
  for (const r of json.scenes[0].nodes) visit(r, [0, 0, 0, 1], [0, 0, 0]);
  const rot = i => {
    const c = walk.channels.find(c => c.target.node === i && c.target.path === 'rotation');
    if (!c) return world.get(i).q;
    const ch = readChannel(i, 'rotation');
    return ch.values.slice(key * 4, key * 4 + 4);
  };
  // second pass with animated rotations
  const world2 = new Map();
  const visit2 = (i, pq, pt) => {
    const { t } = nodeLocal(json.nodes[i]);
    const q = rot(i);
    const wq = qmul(pq, q), wp = pt.map((c, j) => c + qrot(pq, t)[j]);
    world2.set(i, { q: wq, p: wp });
    for (const c of json.nodes[i].children || []) visit2(c, wq, wp);
  };
  for (const r of json.scenes[0].nodes) visit2(r, [0, 0, 0, 1], [0, 0, 0]);
  return world2;
}
const ANK_L = N('leg_joint_L_3'), ANK_R = N('leg_joint_R_3');
const nKeys = readChannel(HIP, 'translation').times.length;
let key = 0, best = Infinity;
for (let i = 0; i < nKeys; i++) {
  const w = fkAt(i);
  const sum = w.get(ANK_L).p[2] + w.get(ANK_R).p[2];
  if (sum < best) { best = sum; key = i; }
}
for (const c of walk.channels) {
  if (c.target.path !== 'rotation') continue;
  const ch = readChannel(c.target.node, 'rotation');
  base.set(c.target.node, ch.values.slice(key * 4, key * 4 + 4));
}
const hipWalk = readChannel(HIP, 'translation');
const standHip = hipWalk.values.slice(key * 3, key * 3 + 3);
console.log('standing key', key, 'ankleSum', best.toFixed(3));
const sway = { [HEAD]: q('z', 0.07), [CHEST]: q('x', 0.02), [AR]: q('x', 0.05), [AL]: q('x', -0.05) };
const idleChannels = [[HIP, 'translation', T, [standHip, [standHip[0], standHip[1], standHip[2] + 0.008], standHip]]];
for (const [node, bq] of base) {
  const d = sway[node] || QI;
  idleChannels.push([node, 'rotation', T, [bq, mul(bq, d), bq]]);
}
clip('Idle', idleChannels);
const collapse = {
  [CHEST]: [q('x', 0.4), q('x', 1.15)], [NECK]: [q('x', 0.25), q('x', 0.5)],
  [LL]: [q('x', -0.4), q('x', -0.9)], [LR]: [q('x', -0.3), q('x', -0.7)],
  [KL]: [q('x', 0.5), q('x', 1.0)], [KR]: [q('x', 0.4), q('x', 0.8)],
  [AR]: [q('x', 0.3), q('x', 0.7)], [AL]: [q('x', 0.25), q('x', 0.6)],
};
const deathChannels = [[HIP, 'translation', D, [standHip, [standHip[0], standHip[1] + 0.02, 0.45], [standHip[0], standHip[1] + 0.05, 0.13]]]];
for (const [node, bq] of base) {
  const d = collapse[node] || [QI, QI];
  deathChannels.push([node, 'rotation', D, [bq, mul(bq, d[0]), mul(bq, d[1])]]);
}
clip('Death', deathChannels);

const tail = (4 - (off % 4)) % 4;
if (tail) { chunks.push(Buffer.alloc(tail)); off += tail; }
bin = Buffer.concat([bin, ...chunks]);
json.buffers[0].byteLength = bin.length;

let jb = Buffer.from(JSON.stringify(json), 'utf8');
const jp = (4 - (jb.length % 4)) % 4;
if (jp) jb = Buffer.concat([jb, Buffer.alloc(jp, 0x20)]);
const total = 12 + 8 + jb.length + 8 + bin.length;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jh, jb, bh, bin]));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes; clips:', json.animations.map(a => a.name).join(', '));
