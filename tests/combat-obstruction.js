import * as THREE from 'three';
import { Physics } from '../js/core/physics.js';
import { Enemy } from '../js/ai/enemies.js';

export function runCombatObstructionTests() {
  const results = [];
  const random = Math.random;
  Math.random = () => 0;
  const test = (name, fn) => {
    try { results.push({ name, pass: !!fn() }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
  };
  const physics = new Physics();
  const player = {
    pos: new THREE.Vector3(0, 0, 8), hp: 1000, dead: false, crouched: false,
    eyePos() { return this.pos.clone().add(new THREE.Vector3(0, this.crouched ? 1 : 1.6, 0)); },
    damage(n) { this.hp -= n; },
  };
  let tracerEnd;
  const G = { physics, player, audio: { play() {} }, effects: { burst() {}, tracer(from, to) { tracerEnd = to.clone(); } } };
  const shooter = { G, speed2D: 0, attackDmg: 9, eyePos: () => new THREE.Vector3(0, 1.6, 0) };
  const fire = () => {
    const hp = player.hp;
    Enemy.prototype.fireAtPlayer.call(shooter);
    return hp - player.hp;
  };
  try {
    test('unobstructed aimed shot hits', () => fire() === 9);
    for (const tag of ['static', 'door', 'train']) {
      test(`${tag} blocks gunfire and clips tracer`, () => {
        const barrier = physics.addBoxCenter(0, 1.5, 4, 4, 3, 0.4, tag);
        const damage = fire();
        barrier.enabled = false;
        return damage === 0 && Math.abs(tracerEnd.z - 3.8) < 1e-6;
      });
    }
    test('door opening restores the shot path', () => {
      const door = physics.addBoxCenter(0, 1.5, 4, 2, 3, 0.2, 'door');
      const shut = fire(); door.enabled = false;
      return shut === 0 && fire() === 9;
    });
    test('partial cover allows exposed aim, blocks crouched aim', () => {
      const cover = physics.addBoxCenter(0, 0.6, 4, 3, 1.2, 0.4);
      const standing = fire(); player.crouched = true;
      const crouched = fire(); player.crouched = false; cover.enabled = false;
      return standing === 9 && crouched === 0;
    });
    test('stepping behind narrow cover interrupts a burst', () => {
      const cover = physics.addBoxCenter(0, 1.5, 4, 0.6, 3, 0.3);
      player.pos.x = 2; const exposed = fire();
      player.pos.x = 0; const blocked = fire();
      cover.enabled = false;
      return exposed === 9 && blocked === 0;
    });
    test('mutant strike respects a closed door at impact', () => {
      player.pos.set(0, 0, 1.1);
      const mutant = {
        G, pos: new THREE.Vector3(), vel: new THREE.Vector3(), _tmp: new THREE.Vector3(),
        attackT: 0, attackWindup: 0.01, lungeT: 0, attackRange: 1.9, attackDmg: 16,
        eyePos: () => new THREE.Vector3(0, 1.35, 0),
      };
      const door = physics.addBoxCenter(0, 1.5, 0.55, 2, 3, 0.1, 'door');
      const hp = player.hp;
      Enemy.prototype.combatMutant.call(mutant, 0.02);
      const blocked = player.hp === hp;
      door.enabled = false; mutant.attackWindup = 0.01; mutant.lungeT = 0;
      Enemy.prototype.combatMutant.call(mutant, 0.02);
      return blocked && hp - player.hp === 16;
    });
  } finally { Math.random = random; }
  return { passed: results.filter(r => r.pass).length, total: results.length, results };
}
