// METRO: ECHOES OF 2039 — main orchestrator.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Physics } from './core/physics.js';
import { Assets } from './core/assets.js';
import { buildMaterials } from './world/materials.js';
import { buildLevel, NOTES, pickupName } from './world/level.js';
import { Atmosphere } from './world/atmosphere.js';
import { Player } from './player/player.js';
import { Weapons, WEAPON_DEFS } from './combat/weapons.js';
import { Effects } from './combat/effects.js';
import { Enemy } from './ai/enemies.js';
import { Mission } from './game/mission.js';
import { UI } from './ui/ui.js';
import * as SAVE from './game/save.js';
import { pickupMesh } from './world/props.js';

const TIPS = [
  'The dark is honest. It\'s the light that lies.',
  'Filters don\'t last. Neither do you.',
  'They hear everything. Walk like the dead.',
  'A bullet spent is a bullet you can\'t spend later.',
  'If the radio knows your name, it was never a rescue.',
  'Crouch. Breathe. Listen. Then move.',
  'Tab opens your pack: batteries for the light, filters for the mask, meds for the bleeding.',
  'Hold RMB to aim. Crouch to steady your breath before the shot.',
  'Green glowing water means radiation. Mask on (G) before you wade in.',
];

const G = {
  state: 'boot',
  settings: { quality: 'medium', sensitivity: 1, volume: 0.8, invertY: false, bob: 0.7 },
  stats: { shots: 0, hits: 0, kills: 0, loot: 0, time: 0 },
  god: false,
  enemies: [],
  dynamicPickups: [],
};
window.__game = G;

function fatal(msg) {
  const el = document.getElementById('fatal-error');
  el.textContent = 'METRO: ECHOES OF 2039 failed to start.\n\n' + msg + '\n\nUse a modern browser (Chrome/Edge/Firefox) with WebGL enabled.';
  el.classList.remove('hidden');
}

boot().catch((e) => { console.error(e); fatal(e.message || String(e)); });

async function boot() {
  const canvas = document.getElementById('game-canvas');
  G.engine = new Engine(canvas);
  G.scene = G.engine.scene;
  G.input = new Input(canvas);
  G.audio = new AudioEngine();
  G.physics = new Physics();
  G.audio.occlusion = (a, b) => G.physics.los(a, b, 'enemy');
  G.ui = new UI(G);

  // settings
  const saved = SAVE.loadSettings();
  if (saved) Object.assign(G.settings, saved);
  applySettings();

  // shipped CC0 assets (glTF models + PBR sets); procedural fallback if absent
  G.ui.setLoading(0.05, 'Loading assets…');
  G.assets = new Assets(G.engine.renderer);
  await G.assets.load((k) => G.ui.setLoading(0.05 + k * 0.3, 'Loading assets…'));
  G.materials = buildMaterials(G.assets);

  G.ui.setLoading(0.4, 'Pouring concrete…');
  G.level = buildLevel(G);
  G.ui.setLoading(0.6, 'Stringing lights…');

  G.atmosphere = new Atmosphere(G.scene, G.settings.quality);
  // light shafts under key lamps
  G.atmosphere.addShaft(-4, 6.6, -22, 5.5, 2.2, 0x8a9ab0, 0.045);
  G.atmosphere.addShaft(-4, 6.6, -10, 5.5, 2.2, 0x8a9ab0, 0.04);
  G.atmosphere.addShaft(-7.2, 1.6, -8.2, 1.6, 0.9, 0xff8a40, 0.05);
  G.atmosphere.addShaft(-3.0, 2.8, -36, 2.6, 1.1, 0xd8b080, 0.04);
  G.atmosphere.addShaft(5, 7.0, -162, 6, 2.6, 0x8a9ab0, 0.035);

  G.effects = new Effects(G.scene);
  G.player = new Player(G);
  G.weapons = new Weapons(G);
  G.mission = new Mission(G);
  spawnEnemies();
  G.ui.setLoading(0.85, 'Waking the dark…');

  wireMenus();
  wireInput();

  G.engine.setQuality(G.settings.quality);
  G.ui.els['btn-continue'].disabled = !SAVE.hasSave();
  G.ui.setLoading(1, '');
  setState('menu');
  G.ui.hide('loading-screen');

  // debug helpers (console)
  G.debug = {
    teleport: (x, y, z) => { G.player.pos.set(x, y, z); G.player.vel.set(0, 0, 0); },
    step: (n) => G.mission.setStep(n),
    give: () => {
      Object.assign(G.player.inv, { pistolAmmo: 96, rifleAmmo: 120, medkit: 5, filter: 5, battery: 5, fuel: 1 });
      G.weapons.giveRifle(); G.ui.hint('Debug: supplies granted');
    },
    god: () => { G.god = !G.god; G.ui.hint('God mode: ' + G.god); },
    frame: (dt = 1 / 60) => step(dt),
    state: () => console.log(G.state, 'step', G.mission.step, 'pos', G.player.pos.toArray().map(v => v.toFixed(1)).join(',')),
  };

  requestAnimationFrame(loop);
}

function spawnEnemies() {
  for (const s of G.level.enemySpawns) G.enemies.push(new Enemy(G, s));
}

// ---------------- state machine ----------------
function setState(s) {
  const prev = G.state;
  G.state = s;
  const ui = G.ui;
  if (s === 'menu') {
    ui.hideMenus(); ui.show('main-menu'); ui.setHUDVisible(false);
    G.input.enabled = false; G.input.unlock();
    ui.els['btn-continue'].disabled = !SAVE.hasSave();
  } else if (s === 'playing') {
    ui.hideMenus(); ui.setHUDVisible(true);
    G.input.enabled = true; G.input.lock();
    // the E press that closed a dialogue/note must not re-trigger the same interactable next frame
    if (prev === 'dialogue' || prev === 'note') G.input.justPressed.delete('KeyE');
    if (prev === 'menu' || prev === 'boot') ui.setObjective(G.mission.cineT >= 0 ? 'Listen to the transmission' : G.mission.objective());
  } else if (s === 'paused') {
    ui.show('pause-menu');
    G.input.enabled = false; G.input.unlock();
  } else if (s === 'dialogue') {
    G.input.enabled = true; G.input.lock(); // re-lock when resuming from pause mid-dialogue
  } else if (s === 'note') {
    G.input.enabled = true; G.input.lock();
  } else if (s === 'inventory') {
    G.input.enabled = false; G.input.unlock();
    ui.openInventory();
  } else if (s === 'dead') {
    G.input.enabled = false; G.input.unlock();
    ui.setHUDVisible(false);
    setTimeout(() => { if (G.state === 'dead') ui.showDeath(G.deathCause || ''); }, 900);
  } else if (s === 'complete') {
    G.input.enabled = false; G.input.unlock();
    ui.setHUDVisible(false);
  }
}
G.game = {
  setState,
  // ---------------- world reset ----------------
  resetWorld() {
    const L = G.level, p = G.player;
    // player
    p.reset(L.playerStart);
    Object.assign(p.inv, { pistolAmmo: 24, rifleAmmo: 0, medkit: 1, filter: 1, battery: 1, fuel: 0 });
    p.hasRifle = false; p.maskOn = false; p.filterTime = 90; p.battery = 100; p.flashOn = false;
    G.ui.setMask(false);
    // weapons
    G.weapons.deserialize({ current: 'pistol', mags: { pistol: 8, rifle: 0 } });
    // enemies
    for (const e of G.enemies) { G.scene.remove(e.group); e.collider.enabled = false; }
    G.enemies.length = 0;
    spawnEnemies();
    // pickups
    for (const dp of G.dynamicPickups) {
      G.scene.remove(dp.mesh);
      const idx = L.interactables.findIndex(i => i.id === 'pick_' + dp.id);
      if (idx >= 0) L.interactables.splice(idx, 1);
      const pi = L.pickups.indexOf(dp);
      if (pi >= 0) L.pickups.splice(pi, 1);
    }
    G.dynamicPickups.length = 0;
    for (const pk of L.pickups) { pk.taken = false; pk.mesh.visible = true; }
    // doors
    const sg = L.doors.stationGate;
    sg.open = false; sg.locked = true; sg.angle = 0; sg.target = 0; sg.pivot.rotation.y = 0; sg.collider.enabled = true;
    const sec = L.doors.securityGate;
    sec.open = false; sec.y = 0; sec.target = 0; sec.panel.position.y = 0; sec.collider.enabled = true;
    const fd = L.doors.facilityDoor;
    fd.open = false; fd.angle = 0; fd.target = 0; fd.pivot.rotation.y = 0; fd.collider.enabled = true;
    // generator
    L.state.generator = 'empty';
    L.generator.lever.rotation.x = 0.5;
    L.generatorLight.intensity = 0;
    L.generatorTube.material = G.materials.lampOff;
    G.audio.stopLoop('generator');
    for (const tl of L.tunnelLamps) {
      tl.on = tl.initOn;
      tl.light.intensity = tl.initOn ? 12 : 0;
      tl.bulb.material = tl.initOn ? G.materials.lampWarm : G.materials.lampOff;
    }
    // breaker / radio
    L.state.breaker = false;
    L.breaker.lever.rotation.x = 0.6;
    L.consoleGlow.intensity = 0;
    for (const s of L.radio.screens) s.material = G.materials.screen;
    L.state.radioPlayed = false;
    if (L.logPickup) {
      G.scene.remove(L.logPickup.mesh);
      const idx = L.interactables.findIndex(i => i.id === 'note_note_log');
      if (idx >= 0) L.interactables.splice(idx, 1);
      const pi = L.pickups.indexOf(L.logPickup);
      if (pi >= 0) L.pickups.splice(pi, 1);
      L.logPickup = null;
    }
    L.state.logSpawned = false;
    G.audio.stopLoop('radio_static');
    for (const f of L.flicker) f.speed = 1;
    // containers & scripted events
    for (const c of L.containers) {
      c.opened = false; c.angle = 0; c.target = 0;
      if (c.kind === 'locker') c.pivot.rotation.y = 0; else c.pivot.rotation.x = 0;
    }
    L.state.encounterDone = false; L.state.gateBang = false;
    if (L.shadow) { L.root.remove(L.shadow.group); L.shadow = null; }
    L.radioT = 14;
    // mission & stats
    G.mission.step = 0; G.mission.done = false; G.mission.cineT = -1;
    G.stats = { shots: 0, hits: 0, kills: 0, loot: 0, time: 0 };
    G.ui.setObjective(G.mission.objective());
  },

  // ---------------- save ----------------
  collectSave() {
    const L = G.level;
    return {
      v: 1,
      player: G.player.serialize(),
      weapons: G.weapons.serialize(),
      mission: G.mission.serialize(),
      stats: { ...G.stats },
      generator: L.state.generator,
      breaker: L.state.breaker,
      radioPlayed: L.state.radioPlayed,
      logSpawned: L.state.logSpawned,
      doors: {
        stationGate: { open: L.doors.stationGate.open, locked: L.doors.stationGate.locked },
        securityGate: { open: L.doors.securityGate.open },
        facilityDoor: { open: L.doors.facilityDoor.open },
      },
      taken: L.pickups.filter(p => p.taken).map(p => p.id),
      enemies: G.enemies.map(e => e.serialize()),
      drops: G.dynamicPickups.filter(p => !p.taken).map(p => ({ kind: p.kind, count: p.count, pos: p.srcPos.toArray() })),
      containers: L.containers.filter(c => c.opened).map(c => c.id),
      encounterDone: L.state.encounterDone,
      gateBang: L.state.gateBang,
    };
  },
  autosave() {
    SAVE.saveGame(G.game.collectSave());
    G.ui.els['btn-continue'].disabled = false;
  },
  applySave(d) {
    G.game.resetWorld();
    const L = G.level;
    G.player.deserialize(d.player);
    G.weapons.deserialize(d.weapons);
    G.mission.deserialize(d.mission);
    G.stats = { ...d.stats };
    for (const id of d.taken) {
      const pk = L.pickups.find(p => p.id === id);
      if (pk) { pk.taken = true; pk.mesh.visible = false; }
    }
    // doors
    const sg = L.doors.stationGate;
    sg.locked = d.doors.stationGate.locked;
    if (d.doors.stationGate.open) { sg.open = true; sg.target = -1.9; sg.angle = -1.9; sg.pivot.rotation.y = -1.9; sg.collider.enabled = false; }
    if (d.doors.securityGate.open) { const s = L.doors.securityGate; s.open = true; s.target = 4.6; s.y = 4.6; s.panel.position.y = 4.6; s.collider.enabled = false; }
    if (d.doors.facilityDoor.open) { const f = L.doors.facilityDoor; f.open = true; f.target = -1.9; f.angle = -1.9; f.pivot.rotation.y = -1.9; f.collider.enabled = false; }
    // generator
    if (d.generator !== 'empty') {
      L.state.generator = d.generator;
      if (d.generator === 'running') {
        L.generator.lever.rotation.x = -0.5;
        L.generatorLight.intensity = 20;
        L.generatorTube.material = G.materials.lampCold;
        G.audio.startLoop('generator', 'generator', L.generator.pos, 0.9);
        for (const tl of L.tunnelLamps) if (!tl.on) { tl.on = true; tl.light.intensity = 12; tl.bulb.material = G.materials.lampWarm; }
        // a save taken in the 2s spin-up window must not leave the gate shut forever
        const sg2 = L.doors.securityGate;
        sg2.open = true; sg2.target = 4.6; sg2.y = 4.6; sg2.panel.position.y = 4.6; sg2.collider.enabled = false;
      }
    }
    if (d.breaker) {
      L.state.breaker = true;
      L.breaker.lever.rotation.x = -0.6;
      L.consoleGlow.intensity = d.radioPlayed ? 0 : 7;
      for (const s of L.radio.screens) s.material = d.radioPlayed ? G.materials.screen : G.materials.screenOn;
    }
    L.state.radioPlayed = d.radioPlayed;
    if (d.radioPlayed && !d.logSpawned) {
      // save taken mid-transmission: restart the cinematic so the log still spawns
      L.consoleGlow.intensity = 7;
      for (const s of L.radio.screens) s.material = G.materials.screenOn;
      G.mission.startCinematic();
    }
    if (d.logSpawned) L.spawnLog();
    for (const ed of d.enemies) {
      const e = G.enemies.find(x => x.id === ed.id);
      if (e) e.deserialize(ed);
    }
    for (const dr of d.drops || []) G.game.spawnDrop(new THREE.Vector3().fromArray(dr.pos), dr.kind, dr.count);
    for (const id of d.containers || []) {
      const c = L.containers.find(x => x.id === id);
      if (c) {
        c.opened = true; c.target = c.kind === 'locker' ? -1.9 : -1.25; c.angle = c.target;
        if (c.kind === 'locker') c.pivot.rotation.y = c.angle; else c.pivot.rotation.x = c.angle;
      }
    }
    L.state.encounterDone = !!d.encounterDone;
    L.state.gateBang = !!d.gateBang;
  },

  // ---------------- interactions ----------------
  takePickup(p) {
    if (p.taken) return;
    if (p.kind === 'note') { G.game.readNote(p); return; }
    if (p.kind === 'rifle') {
      G.weapons.giveRifle();
      G.ui.pickupToast('“Burya” improvised rifle — press 2');
      G.ui.hint('Rifle acquired. 1 / 2 to switch weapons.', 4);
    } else {
      G.player.inv[p.kind] = (G.player.inv[p.kind] || 0) + p.count;
      G.ui.pickupToast('+ ' + pickupName(p.kind, p.count));
      if (p.kind === 'fuel' && G.mission.step === 2) G.ui.hint('Diesel acquired. Back to the generator room.', 4);
    }
    p.taken = true; p.mesh.visible = false;
    G.audio.play('pickup', { vol: 0.8 });
    G.stats.loot++;
  },
  readNote(p) {
    const n = NOTES[p.noteId];
    if (!n) return;
    G.ui.showNote(n.title, n.body);
    G.audio.play('paper', { vol: 0.8 });
    G.readingNote = p.noteId;
    setState('note');
  },
  closeNote() {
    G.ui.hideNote();
    const id = G.readingNote; G.readingNote = null;
    setState('playing');
    if (id) G.mission.onNoteRead(id);
  },
  toggleDoor(key) {
    const d = G.level.doors[key];
    if (!d) return;
    if (d.locked) { G.ui.hint('Locked. Lev has the key — talk to him.'); G.audio.play('dryfire', { vol: 0.5 }); return; }
    d.open = !d.open;
    d.target = d.open ? -1.9 : 0;
    G.audio.play('door', { pos: d.group.position, vol: 0.9, verb: 0.4 });
    G.game.emitNoise(d.group.position, 8, 'door');
  },
  searchContainer(c) {
    if (c.opened) return;
    c.opened = true;
    c.target = c.kind === 'locker' ? -1.9 : -1.25;
    G.audio.play('door', { pos: c.pos, vol: c.kind === 'locker' ? 0.6 : 0.45, pitch: c.kind === 'locker' ? 0.8 : 1.3, verb: 0.4 });
    G.game.emitNoise(c.pos, 5, 'search');
    if (!c.loot.length) { G.ui.hint('Nothing but dust and dead moths.'); return; }
    for (const [kind, count] of c.loot) G.player.inv[kind] = (G.player.inv[kind] || 0) + count;
    G.ui.pickupToast('+ ' + c.loot.map(([k, n]) => pickupName(k, n)).join(' · '));
    G.audio.play('pickup', { vol: 0.8 });
    G.stats.loot += c.loot.length;
  },
  emitNoise(pos, radius, type) {
    for (const e of G.enemies) e.hear(pos, radius, type);
  },
  spawnDrop(pos, kind, count) {
    const id = 'drop_' + Math.random().toString(36).slice(2, 8);
    const mesh = pickupMesh(G.materials, kind);
    mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    G.scene.add(mesh);
    const p = { id, kind, count, mesh, pos: new THREE.Vector3(pos.x, pos.y + 0.25, pos.z), srcPos: pos.clone(), taken: false, baseY: pos.y + 0.05, seed: Math.random() * 9 };
    G.level.pickups.push(p);
    G.dynamicPickups.push(p);
    G.level.interactables.push({
      id: 'pick_' + id, pos: p.pos, radius: 1.7,
      prompt: () => p.taken ? '' : `Take ${pickupName(kind, count)}`,
      action: (g) => g.game.takePickup(p), enabled: () => !p.taken,
    });
  },
  onDeath(cause) {
    if (G.god) { G.player.hp = 100; G.player.dead = false; return; }
    G.deathCause = cause;
    G.audio.play('stinger', { vol: 0.7 });
    G.audio.breath.active = false; G.audio.heart.active = false;
    setState('dead');
  },
  completeMission() {
    setState('complete');
    G.ui.fade(true);
    G.audio.play('objective', { vol: 0.8 });
    setTimeout(() => {
      G.ui.showComplete(G.stats);
      G.ui.fade(false);
    }, 1100);
  },
};

// ---------------- menu wiring ----------------
function wireMenus() {
  const ui = G.ui;
  const click = (id, fn) => document.getElementById(id).addEventListener('click', () => { G.audio.init(); G.audio.resume(); G.audio.play('ui_click', { vol: 0.6 }); fn(); });

  click('btn-new', () => {
    G.game.resetWorld();
    G.game.autosave();
    ui.hideMenus(); ui.show('loading-screen');
    ui.setLoading(0.3, TIPS[Math.random() * TIPS.length | 0]);
    G.input.lock();
    setTimeout(() => {
      ui.setLoading(1, '');
      ui.hide('loading-screen');
      setState('playing');
      ui.hint('Find Lev at the radio table. WASD to move, E to interact.', 5);
    }, 700);
  });
  click('btn-continue', () => {
    const d = SAVE.loadGame();
    if (!d) return;
    G.game.applySave(d);
    ui.hideMenus();
    setState('playing');
    ui.hint('Checkpoint restored.', 2.5);
  });
  click('btn-settings', () => { ui.hide('main-menu'); ui.show('settings-menu'); G.settingsReturn = 'main-menu'; });
  click('btn-pause-settings', () => { ui.hide('pause-menu'); ui.show('settings-menu'); G.settingsReturn = 'pause-menu'; });
  click('btn-settings-back', () => { ui.hide('settings-menu'); ui.show(G.settingsReturn || 'main-menu'); SAVE.saveSettings(G.settings); });
  click('btn-exit', () => { ui.hide('main-menu'); ui.show('exit-screen'); });
  click('btn-exit-back', () => { ui.hide('exit-screen'); ui.show('main-menu'); });
  click('btn-resume', () => { ui.hide('pause-menu'); setState(G.pauseReturn || 'playing'); });
  click('btn-save', () => { G.game.autosave(); ui.hint('Checkpoint saved.'); G.audio.play('pickup', { vol: 0.6 }); });
  click('btn-quit', () => { ui.hide('pause-menu'); setState('menu'); });
  click('btn-restart', () => {
    const d = SAVE.loadGame();
    ui.hide('death-screen');
    if (d) { G.game.applySave(d); setState('playing'); }
    else { G.game.resetWorld(); setState('playing'); }
  });
  click('btn-death-menu', () => { ui.hide('death-screen'); setState('menu'); });
  click('btn-complete-menu', () => { ui.hide('complete-screen'); setState('menu'); });

  // settings inputs
  const q = document.getElementById('set-quality');
  q.value = G.settings.quality;
  q.addEventListener('change', () => { G.settings.quality = q.value; G.engine.setQuality(q.value); SAVE.saveSettings(G.settings); });
  const sens = document.getElementById('set-sensitivity');
  sens.value = G.settings.sensitivity;
  sens.addEventListener('input', () => {
    G.settings.sensitivity = Number(sens.value);
    document.getElementById('val-sensitivity').textContent = G.settings.sensitivity.toFixed(2);
  });
  const vol = document.getElementById('set-volume');
  vol.value = G.settings.volume;
  vol.addEventListener('input', () => {
    G.settings.volume = Number(vol.value);
    G.audio.setVolume(G.settings.volume);
    document.getElementById('val-volume').textContent = Math.round(G.settings.volume * 100) + '%';
  });
  const inv = document.getElementById('set-inverty');
  inv.checked = G.settings.invertY;
  inv.addEventListener('change', () => { G.settings.invertY = inv.checked; });
  const bob = document.getElementById('set-bob');
  bob.value = G.settings.bob;
  bob.addEventListener('input', () => {
    G.settings.bob = Number(bob.value);
    document.getElementById('val-bob').textContent = Math.round(G.settings.bob * 100) + '%';
  });
}

function applySettings() {
  G.audio.setVolume(G.settings.volume);
  document.getElementById('val-sensitivity').textContent = G.settings.sensitivity.toFixed(2);
  document.getElementById('val-volume').textContent = Math.round(G.settings.volume * 100) + '%';
  document.getElementById('val-bob').textContent = Math.round(G.settings.bob * 100) + '%';
}

// ---------------- input / state glue ----------------
function wireInput() {
  G.input.onLockChange = (locked) => {
    if (locked) return;
    // inventory/menu/death unlocks are intentional; only unexpected lock loss pauses
    if (G.state === 'playing') { G.pauseReturn = 'playing'; setState('paused'); }
    else if (G.state === 'dialogue' || G.state === 'note') { G.pauseReturn = G.state; setState('paused'); }
  };
  G.engine.renderer.domElement.addEventListener('click', () => {
    if (G.state === 'playing' && !G.input.locked) G.input.lock();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (G.state === 'playing') setState('inventory');
      else if (G.state === 'inventory') { G.ui.closeInventory(); setState('playing'); }
    }
    if (e.code === 'KeyE') {
      if (G.state === 'dialogue') G.mission.advanceDialogue();
      else if (G.state === 'note') G.game.closeNote();
    }
    if (e.code === 'Escape') {
      if (G.state === 'inventory') { G.ui.closeInventory(); setState('playing'); }
    }
  });
  document.getElementById('note-reader').addEventListener('click', () => { if (G.state === 'note') G.game.closeNote(); });
  document.getElementById('dialogue-box').addEventListener('click', () => { if (G.state === 'dialogue') G.mission.advanceDialogue(); });
}

// ---------------- interaction detection ----------------
const _toTarget = new THREE.Vector3();
function updateInteraction() {
  const p = G.player;
  const eye = p.eyePos();
  const dir = p.lookDir();
  let best = null, bestScore = -1e9;
  for (const it of G.level.interactables) {
    if (it.enabled && !it.enabled()) continue;
    const d = eye.distanceTo(it.pos);
    if (d > it.radius) continue;
    _toTarget.copy(it.pos).sub(eye).normalize();
    const dot = _toTarget.dot(dir);
    if (dot < 0.45 && d > 1.1) continue;
    const text = typeof it.prompt === 'function' ? it.prompt() : it.prompt;
    if (!text) continue;
    // prefer what the crosshair is actually on, then closeness
    const score = dot * 2 - d * 0.35;
    if (score <= bestScore) continue;
    best = it; bestScore = score; best._text = text;
  }
  G.ui.setInteraction(best ? best._text : null);
  if (best && G.input.pressed('KeyE')) best.action(G);
}

// ---------------- main loop ----------------
function step(dt) {
  G.engine.elapsed += dt;
  const t = G.engine.elapsed;

  if (G.state === 'playing') {
    G.stats.time += dt;
    G.player.update(dt);
    G.weapons.update(dt);
    for (const e of G.enemies) e.update(dt);
    G.mission.update(dt);
    G.level.update(dt, t);
    G.atmosphere.update(dt, t, G.engine.camera.position);
    G.effects.update(dt);
    G.audio.update(dt, G.player.pos);
    updateInteraction();
    // HUD
    G.ui.setHealth(G.player.hp);
    G.ui.setFilter(G.player.filterTime, G.player.maskOn);
    G.ui.setBattery(G.player.battery);
    G.ui.setRad(G.player.radRate);
  } else if (G.state === 'dialogue' || G.state === 'note' || G.state === 'inventory') {
    G.level.update(dt, t);
    G.atmosphere.update(dt, t, G.engine.camera.position);
    G.effects.update(dt);
    G.audio.update(dt, G.player.pos);
    G.audio.setListener(G.engine.camera.position, G.player.lookDir());
  } else if (G.state === 'menu') {
    // cinematic menu backdrop: slow drift over the station camp
    const cam = G.engine.camera;
    cam.position.set(-5.5 + Math.sin(t * 0.07) * 0.6, 2.1 + Math.sin(t * 0.11) * 0.15, 3.5);
    cam.lookAt(-7.2, 1.0, -9);
    G.level.update(dt, t);
    G.atmosphere.update(dt, t, cam.position);
    G.effects.update(dt);
  }
  G.ui.update(dt);
  G.input.endFrame();
  G.engine.render();
}

function loop() {
  requestAnimationFrame(loop);
  step(Math.min(0.05, G.engine.clock.getDelta()));
}