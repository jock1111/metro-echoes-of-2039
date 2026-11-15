// Mission "The Last Signal" — objectives, dialogue, scripted events, cinematic.
import * as THREE from 'three';

const OBJECTIVES = [
  'Talk to Lev, the radio operator',
  'Enter the north tunnel — reach the security gate',
  'Find diesel, restart the generator to power the gate',
  'Cross the maintenance facility — stay quiet or fight',
  'Find the source of the signal in relay room K-12',
  'Restore power to the transmitter — throw the main breaker',
  'Activate the transmitter',
  'Read the operator’s log on the console',
];

const DIALOGUES = {
  lev_intro: [
    ['Lev', 'Viktor. You came. I wasn\'t sure anyone would.'],
    ['Lev', 'Three nights ago, relay K-12 started broadcasting. An emergency loop. Same voice, same words, every forty minutes.'],
    ['Lev', 'K-12 has been dead for six years. We sealed that section ourselves.'],
    ['Lev', 'Two patrols went north to check. Neither came back. Borya hears singing past the checkpoint. Singing, Viktor.'],
    ['Lev', 'Take the north tunnel. Find the transmitter. Shut it down. And if it calls you by name — don\'t answer.'],
  ],
  lev_after: [
    ['Lev', 'The loop is still out there. Go, before I lose my nerve.'],
  ],
  borya: [
    ['Borya', 'Gate\'s yours. Past the checkpoint, keep your light low and your boots quieter. Things down there hunt by sound.'],
    ['Borya', 'If the green water glows — mask on, or don\'t breathe at all.'],
  ],
  borya_after: [
    ['Borya', 'You hear that? Exactly. Nothing. That\'s what scares me.'],
  ],
};

export class Mission {
  constructor(G) {
    this.G = G;
    this.step = 0;
    this.dialogueQueue = [];
    this.dialogueIdx = 0;
    this.cineT = -1;
    this.cineEvents = [];
    this.done = false;
  }

  objective() { return OBJECTIVES[Math.min(this.step, OBJECTIVES.length - 1)]; }

  setStep(n) {
    if (n <= this.step) return;
    this.step = n;
    this.G.ui.setObjective(this.objective());
    this.G.audio.play('objective', { vol: 0.7 });
    this.G.game.autosave();
  }

  talkTo(id) {
    const key = id === 'lev' ? (this.step === 0 ? 'lev_intro' : 'lev_after') : (this.step <= 1 ? 'borya' : 'borya_after');
    this.startDialogue(DIALOGUES[key], () => {
      if (key === 'lev_intro') {
        this.G.level.doors.stationGate.locked = false;
        this.setStep(1);
        this.G.ui.hint('The north gate is unlocked.', 4);
      }
    });
  }

  startDialogue(lines, onEnd = null) {
    this.dialogueQueue = lines;
    this.dialogueIdx = 0;
    this.onDialogueEnd = onEnd;
    this.G.game.setState('dialogue');
    this.G.ui.showDialogue(lines[0][0], lines[0][1]);
    this.G.audio.play('ui_click', { vol: 0.4 });
  }

  advanceDialogue() {
    this.dialogueIdx++;
    if (this.dialogueIdx >= this.dialogueQueue.length) {
      this.G.ui.hideDialogue();
      this.G.game.setState('playing');
      const cb = this.onDialogueEnd; this.onDialogueEnd = null;
      if (cb) cb();
    } else {
      const [sp, tx] = this.dialogueQueue[this.dialogueIdx];
      this.G.ui.showDialogue(sp, tx);
      this.G.audio.play('ui_click', { vol: 0.4 });
    }
  }

  useGenerator() {
    const G = this.G, L = G.level;
    const s = L.state.generator;
    if (s === 'running') { G.ui.hint('She\'s running. The gate has power.'); return; }
    if (s === 'empty') {
      if (G.player.inv.fuel > 0) {
        G.player.inv.fuel--;
        L.state.generator = 'fueled';
        G.audio.play('pickup', { vol: 0.8 });
        G.ui.hint('Tank filled. Now pull the starter lever.');
        G.ui.pickupToast('Diesel poured');
      } else {
        G.ui.hint('Dry tank. There were fuel cans at the checkpoint.', 4.5);
        G.audio.play('dryfire', { vol: 0.5 });
      }
      return;
    }
    // fueled → start
    L.state.generator = 'running';
    G.audio.play('generator_start', { pos: L.generator.pos, vol: 1, verb: 0.5 });
    G.audio.startLoop('generator', 'generator', L.generator.pos, 0.9);
    G.game.emitNoise(L.generator.pos, 30, 'generator');
    L.generator.lever.rotation.x = -0.5;
    // gate state changes immediately; only the light warm-up is delayed
    const sg = L.doors.securityGate;
    sg.open = true; sg.target = 4.6; sg.collider.enabled = false;
    G.audio.play('gate', { pos: new THREE.Vector3(0, 2, -148), vol: 1, verb: 0.6 });
    G.ui.hint('The security gate is opening.', 4);
    setTimeout(() => {
      if (G.level !== L || L.state.generator !== 'running') return;
      L.generatorLight.intensity = 20;
      L.generatorTube.material = G.materials.lampCold;
      // tunnel lamps wake
      for (const tl of L.tunnelLamps) {
        if (!tl.on) { tl.on = true; tl.light.intensity = 12; tl.bulb.material = G.materials.lampWarm; }
      }
    }, 2100);
    if (this.step === 2) this.setStep(3);
  }

  touchGate() {
    const G = this.G;
    if (G.level.state.generator !== 'running') {
      G.ui.hint('No power. The generator room is back along the tunnel — east side.', 5);
      G.audio.play('dryfire', { vol: 0.5 });
      if (this.step < 2) this.setStep(2);
    }
  }

  useBreaker() {
    const G = this.G, L = G.level;
    if (L.state.breaker) { G.ui.hint('Power is on.'); return; }
    L.state.breaker = true;
    L.breaker.lever.rotation.x = -0.6;
    G.audio.play('breaker', { pos: new THREE.Vector3(7.6, 1.5, -228), vol: 1 });
    L.consoleGlow.intensity = 7;
    for (const s of L.radio.screens) s.material = G.materials.screenOn;
    G.ui.hint('Transmitter powered.');
    if (this.step < 6) this.setStep(6);
  }

  useRadio() {
    const G = this.G, L = G.level;
    if (!L.state.breaker) { G.ui.hint('Dead console. Find the main breaker.'); return; }
    if (L.state.radioPlayed) {
      // a save interrupted the transmission — let it replay until the log exists
      if (!L.state.logSpawned && this.cineT < 0) this.startCinematic();
      else G.ui.hint('The console is silent.');
      return;
    }
    L.state.radioPlayed = true;
    this.startCinematic();
  }

  startCinematic() {
    const G = this.G, L = G.level;
    this.cineT = 0;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.cineEvents = [
      [0.2, () => { G.audio.play('radio_static_burst', { pos: L.radio.pos, vol: 0.9 }); G.audio.startLoop('radio_static', 'radio_static', L.radio.pos, 0.5); }],
      [1.2, () => G.audio.play('morse', { pos: L.radio.pos, vol: 0.7 })],
      [2.6, () => { G.audio.play('radio_voice', { pos: L.radio.pos, vol: 0.9, syllables: 10 }); G.ui.subtitle('K-12 loop', '…this is relay K-12… emergency protocol… all stations, respond…', 4.5); }],
      [7.2, () => { G.audio.play('radio_voice', { pos: L.radio.pos, vol: 0.9, syllables: 12, pitch: 0.9 }); G.ui.subtitle('K-12 loop', '…survivors of Zastava… rescue convoy inbound… respond… respond…', 4.5); }],
      [11.8, () => { G.audio.play('stinger', { vol: 0.8 }); G.player.trauma = 0.7; for (const f of L.flicker) f.speed = 4; }],
      [13.2, () => { G.audio.play('whisper', { vol: 0.9 }); G.ui.subtitle('???', '…Viktor…', 3); }],
      [16.4, () => { G.audio.play('radio_voice', { pos: L.radio.pos, vol: 1, syllables: 8, pitch: 0.55 }); G.ui.subtitle('???', '…Viktor… we see your light… come north…', 4); }],
      [20.6, () => {
        G.audio.stopLoop('radio_static');
        L.consoleGlow.intensity = 0;
        for (const s of L.radio.screens) s.material = G.materials.screen;
        G.audio.play('breaker', { vol: 0.8 });
        G.player.trauma = 1;
      }],
      [21.4, () => { G.audio.play('distant_screech', { pos: V(0, 2, -260), vol: 0.6, verb: 0.9 }); G.ui.subtitle('', 'The transmission dies. Far to the north, something answers it.', 4.5); }],
      [25.5, () => {
        for (const f of L.flicker) f.speed = 1;
        L.spawnLog();
        this.setStep(7);
        G.ui.hint('A log book lies on the console.', 4);
        this.cineT = -1;
      }],
    ];
    this.cineIdx = 0;
    G.ui.setObjective('Listen to the transmission');
  }

  onNoteRead(noteId) {
    if (noteId === 'note_log' && this.step >= 7 && !this.done) {
      this.done = true;
      this.G.game.completeMission();
    }
  }

  update(dt) {
    const G = this.G, L = G.level;
    // position triggers
    if (this.step === 1 && G.player.pos.z < -100) this.setStep(2);
    if (this.step === 3 && G.player.pos.z < -206) this.setStep(4);
    if (this.step === 4 && G.player.pos.z < -212) this.setStep(5);
    // scripted: something slams the security gate from the far side
    if (this.step >= 2 && !L.state.gateBang && G.player.pos.z < -141) {
      L.state.gateBang = true;
      G.audio.play('gate', { pos: new THREE.Vector3(0, 2, -148), vol: 1, verb: 0.7 });
      G.audio.play('distant_boom', { pos: new THREE.Vector3(0, 2, -150), vol: 0.8, verb: 0.6 });
      G.player.trauma = Math.min(1, G.player.trauma + 0.5);
      G.ui.subtitle('', 'Something slams the gate from the far side. Once. Then nothing.', 4);
    }
    // scripted: a shape crosses the facility hall ahead
    if (this.step === 3 && !L.state.encounterDone && G.player.pos.z < -154) {
      L.state.encounterDone = true;
      G.audio.play('distant_screech', { pos: new THREE.Vector3(0, 2, -172), vol: 0.7, verb: 0.7 });
      G.ui.subtitle('', 'A shape crosses the hall ahead — fast, low, wrong.', 3.5);
      G.player.trauma = Math.min(1, G.player.trauma + 0.35);
      L.startShadowCross();
      const m1 = G.enemies.find(e => e.id === 'm1' && !e.dead);
      if (m1) { m1.investigatePos.set(G.player.pos.x, 0, -166); m1.setState('investigate'); }
    }
    // cinematic timeline
    if (this.cineT >= 0) {
      this.cineT += dt;
      while (this.cineIdx < this.cineEvents.length && this.cineEvents[this.cineIdx][0] <= this.cineT) {
        this.cineEvents[this.cineIdx][1]();
        this.cineIdx++;
      }
    }
  }

  serialize() { return { step: this.step, done: this.done }; }
  deserialize(d) {
    this.step = d.step; this.done = d.done;
    this.G.ui.setObjective(this.objective());
  }
}