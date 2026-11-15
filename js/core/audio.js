// Fully synthesized audio — Web Audio API, no audio assets.
import * as THREE from 'three';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.geigerRate = 0;
    this.geigerAcc = 0;
    this.onGeiger = null;
    this.breath = { mask: false, intensity: 0.35, timer: 0, phase: 0, active: false };
    this.heart = { active: false, timer: 0 };
    this.ambTimers = { creak: 4, drip: 1, rumble: 12, distant: 20 };
    this.zone = 'station';
    this.dripSpots = [];
    this.loopHandles = new Map();
    this._listenerPos = new THREE.Vector3();
    this.occlusion = null; // set by main: (from, to) => true if clear line between
  }

  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 0.8;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10; this.comp.ratio.value = 4; this.comp.knee.value = 8;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    // soft-clip stage so stacked transients saturate gently instead of hard-clipping
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(1.4 * x) / Math.tanh(1.4);
    }
    this.shaper.curve = curve;
    this.master.connect(this.comp); this.comp.connect(this.shaper); this.shaper.connect(ctx.destination);

    // generated tunnel reverb impulse
    const len = ctx.sampleRate * 1.9;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5;
      }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.28;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    // shared noise buffers
    this.white = this._noiseBuffer(2, false);
    this.brown = this._noiseBuffer(3, true);
    this.started = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v * 0.8; }

  _noiseBuffer(sec, brown) {
    const sr = this.ctx.sampleRate, b = this.ctx.createBuffer(1, sr * sec, sr);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return b;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    this._listenerPos.copy(pos);
  }

  _out(pos, verbSend = 0.25) {
    // returns input node; routes dry + reverb, positional if pos given
    const ctx = this.ctx;
    const input = ctx.createGain();
    if (pos) {
      // walls muffle: no line of sight → lowpass + quieter, less reverb send
      const blocked = this.occlusion && this._listenerPos.lengthSq() > 0 && !this.occlusion(this._listenerPos, pos);
      let dry = input;
      if (blocked) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0.7;
        input.connect(lp); lp.connect(g); dry = g;
        verbSend *= 0.35;
      }
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = 2.5; p.maxDistance = 70; p.rolloffFactor = 1.1;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      dry.connect(p); p.connect(this.master);
      input._panner = p;
      const send = ctx.createGain(); send.gain.value = verbSend;
      p.connect(send); send.connect(this.verb);
    } else {
      input.connect(this.master);
      const send = ctx.createGain(); send.gain.value = verbSend;
      input.connect(send); send.connect(this.verb);
    }
    return input;
  }

  _osc(type, freq, t0, dur, gainEnv, dest, detune = 0, freqEnd = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    if (freqEnd > 0) {
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    }
    const g = ctx.createGain();
    gainEnv(g.gain, t0, dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  _noise(t0, dur, gainEnv, dest, filter = null, brown = false) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = brown ? this.brown : this.white;
    s.loop = true;
    let node = s;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q || 1;
      if (filter.sweepTo) f.frequency.linearRampToValueAtTime(filter.sweepTo, t0 + dur);
      s.connect(f); node = f;
    }
    const g = ctx.createGain(); gainEnv(g.gain, t0, dur);
    node.connect(g); g.connect(dest);
    s.start(t0); s.stop(t0 + dur + 0.05);
    return { source: s, filter: node !== s ? node : null, gain: g };
  }

  static _adsr(attack, peak, decay) {
    return (param, t0, dur) => {
      param.setValueAtTime(0.0001, t0);
      param.linearRampToValueAtTime(peak, t0 + attack);
      param.exponentialRampToValueAtTime(0.0001, t0 + dur);
    };
  }

  play(name, opts = {}) {
    if (!this.ctx) return null;
    const fn = this._sounds[name];
    if (!fn) { console.warn('unknown sound', name); return null; }
    const t0 = this.ctx.currentTime + (opts.delay || 0);
    const out = this._out(opts.pos, opts.verb ?? 0.25);
    const vol = opts.vol ?? 1;
    const pitch = opts.pitch ?? 1;
    fn.call(this._sounds, this, t0, out, vol, pitch, opts);
    return out;
  }

  // ---- looping positional sounds (generator, buzz, static) ----
  startLoop(id, name, pos, vol = 1) {
    if (!this.ctx || this.loopHandles.has(id)) return;
    const out = this._out(pos, 0.2);
    const stop = this._loops[name](this, out, vol);
    this.loopHandles.set(id, { out, stop });
  }
  stopLoop(id) {
    const h = this.loopHandles.get(id);
    if (h) { try { h.stop(); } catch (e) {} h.out.disconnect(); this.loopHandles.delete(id); }
  }
  moveLoop(id, pos) {
    const h = this.loopHandles.get(id);
    if (h && h.out._panner) {
      const p = h.out._panner;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    }
  }

  update(dt, playerPos) {
    if (!this.ctx) return;
    // geiger
    if (this.geigerRate > 0.05) {
      this.geigerAcc += dt * this.geigerRate;
      while (this.geigerAcc > 1) {
        this.geigerAcc -= 1;
        if (Math.random() < 0.85) { this.play('geiger', { vol: 0.5 + Math.random() * 0.4, verb: 0.05 }); if (this.onGeiger) this.onGeiger(); }
      }
    } else this.geigerAcc = 0;
    // breathing
    if (this.breath.active) {
      this.breath.timer -= dt;
      if (this.breath.timer <= 0) {
        const cycle = this.breath.intensity > 0.7 ? 2.1 : 3.4;
        this.breath.phase = 1 - this.breath.phase;
        this.breath.timer = cycle / 2;
        this.play(this.breath.phase ? 'breath_in' : 'breath_out', {
          vol: 0.25 + this.breath.intensity * 0.55, verb: 0.02,
          mask: this.breath.mask, pitch: 0.9 + this.breath.intensity * 0.25,
        });
      }
    }
    // heartbeat
    if (this.heart.active) {
      this.heart.timer -= dt;
      if (this.heart.timer <= 0) { this.heart.timer = 0.95; this.play('heartbeat', { vol: 0.8, verb: 0.05 }); }
    }
    // ambient scheduling
    const T = this.ambTimers;
    T.creak -= dt; T.drip -= dt; T.rumble -= dt; T.distant -= dt;
    if (T.creak <= 0) {
      T.creak = 7 + Math.random() * 16;
      const p = this._randAround(playerPos, 18);
      this.play('creak', { pos: p, vol: 0.25 + Math.random() * 0.3, pitch: 0.7 + Math.random() * 0.6, verb: 0.6 });
    }
    if (T.drip <= 0) {
      T.drip = 0.6 + Math.random() * 2.2;
      const spots = this.dripSpots.length ? this.dripSpots : null;
      const p = spots ? spots[Math.random() * spots.length | 0] : this._randAround(playerPos, 12);
      this.play('drip', { pos: p, vol: 0.3 + Math.random() * 0.35, pitch: 0.8 + Math.random() * 0.5, verb: 0.7 });
    }
    if (T.rumble <= 0) {
      T.rumble = 16 + Math.random() * 24;
      this.play('rumble', { vol: 0.25 + Math.random() * 0.25, verb: 0.5 });
    }
    if (T.distant <= 0) {
      T.distant = 22 + Math.random() * 35;
      if (this.zone === 'facility' || this.zone === 'tunnel') {
        this.play(Math.random() < 0.5 ? 'distant_screech' : 'distant_boom', { pos: this._randAround(playerPos, 35), vol: 0.2, verb: 0.8 });
      } else {
        this.play('distant_boom', { pos: this._randAround(playerPos, 40), vol: 0.15, verb: 0.8 });
      }
    }
  }

  _randAround(pos, r) {
    const a = Math.random() * Math.PI * 2, d = r * (0.4 + Math.random() * 0.6);
    return new THREE.Vector3(pos.x + Math.cos(a) * d, pos.y + 1 + Math.random() * 2, pos.z + Math.sin(a) * d);
  }

  setZone(z) { this.zone = z; }
}

// ================= one-shot sound registry =================
AudioEngine.prototype._sounds = {
  pistol(a, t0, out, vol, pitch) {
    const e = AudioEngine._adsr(0.002, 0.5 * vol, 0.1);
    a._noise(t0, 0.14, e, out, { type: 'highpass', freq: 900 });
    a._noise(t0, 0.1, AudioEngine._adsr(0.001, 0.4 * vol, 0.09), out, { type: 'lowpass', freq: 500 });
    a._osc('square', 160 * pitch, t0, 0.09, (p, t, d) => {
      p.setValueAtTime(0.35 * vol, t); p.exponentialRampToValueAtTime(0.001, t + d);
    }, out);
    // tunnel tail
    a._noise(t0 + 0.02, 0.5, AudioEngine._adsr(0.01, 0.16 * vol, 0.5), out, { type: 'bandpass', freq: 700, q: 0.7 });
  },
  rifle(a, t0, out, vol, pitch) {
    a._noise(t0, 0.18, AudioEngine._adsr(0.002, 0.55 * vol, 0.16), out, { type: 'highpass', freq: 600 });
    a._noise(t0, 0.14, AudioEngine._adsr(0.001, 0.45 * vol, 0.12), out, { type: 'lowpass', freq: 350 });
    a._osc('sawtooth', 110 * pitch, t0, 0.12, (p, t, d) => {
      p.setValueAtTime(0.38 * vol, t); p.exponentialRampToValueAtTime(0.001, t + d);
    }, out);
    a._noise(t0 + 0.03, 0.6, AudioEngine._adsr(0.01, 0.2 * vol, 0.55), out, { type: 'bandpass', freq: 500, q: 0.6 });
  },
  enemy_rifle(a, t0, out, vol, pitch) { this.rifle(a, t0, out, vol * 0.9, pitch * 0.92); },
  dryfire(a, t0, out, vol) {
    a._osc('square', 2200, t0, 0.025, AudioEngine._adsr(0.001, 0.25 * vol, 0.02), out);
    a._noise(t0 + 0.03, 0.03, AudioEngine._adsr(0.001, 0.2 * vol, 0.03), out, { type: 'highpass', freq: 3000 });
  },
  reload(a, t0, out, vol, pitch, opts) {
    const kind = opts.kind || 'pistol';
    const clack = (t, f, v) => {
      a._noise(t, 0.05, AudioEngine._adsr(0.001, v * vol, 0.045), out, { type: 'bandpass', freq: f, q: 2 });
      a._osc('sine', f * 0.4, t, 0.04, AudioEngine._adsr(0.001, v * 0.5 * vol, 0.035), out);
    };
    if (kind === 'pistol') { clack(t0, 900, 0.5); clack(t0 + 0.55, 1300, 0.6); clack(t0 + 1.05, 2000, 0.7); }
    else { clack(t0, 700, 0.55); clack(t0 + 0.7, 1000, 0.6); clack(t0 + 1.3, 1600, 0.5); clack(t0 + 1.75, 2200, 0.75); }
  },
  draw_weapon(a, t0, out, vol) {
    a._noise(t0, 0.12, AudioEngine._adsr(0.01, 0.2 * vol, 0.1), out, { type: 'bandpass', freq: 800, q: 1 });
    a._noise(t0 + 0.1, 0.05, AudioEngine._adsr(0.001, 0.3 * vol, 0.04), out, { type: 'bandpass', freq: 1800, q: 2 });
  },
  footstep(a, t0, out, vol, pitch, opts) {
    const surf = opts.surface || 'concrete';
    if (surf === 'metal') {
      a._noise(t0, 0.09, AudioEngine._adsr(0.001, 0.4 * vol, 0.08), out, { type: 'bandpass', freq: 900 * pitch, q: 1.5 });
      a._osc('sine', 140 * pitch, t0, 0.08, AudioEngine._adsr(0.001, 0.3 * vol, 0.07), out);
    } else if (surf === 'water') {
      a._noise(t0, 0.16, AudioEngine._adsr(0.004, 0.45 * vol, 0.14), out, { type: 'highpass', freq: 1200 });
      a._noise(t0, 0.1, AudioEngine._adsr(0.002, 0.25 * vol, 0.09), out, { type: 'lowpass', freq: 500 });
    } else {
      a._noise(t0, 0.07, AudioEngine._adsr(0.001, 0.35 * vol, 0.06), out, { type: 'lowpass', freq: 600 * pitch });
      a._osc('sine', 75 * pitch, t0, 0.07, AudioEngine._adsr(0.001, 0.35 * vol, 0.06), out);
    }
  },
  jump_land(a, t0, out, vol) {
    a._noise(t0, 0.12, AudioEngine._adsr(0.001, 0.5 * vol, 0.1), out, { type: 'lowpass', freq: 400 });
    a._osc('sine', 65, t0, 0.12, AudioEngine._adsr(0.001, 0.5 * vol, 0.1), out);
  },
  breath_in(a, t0, out, vol, pitch, opts) {
    const f = opts.mask ? 350 : 550;
    a._noise(t0, 1.1, (p, t) => {
      p.setValueAtTime(0.001, t); p.linearRampToValueAtTime(0.32 * vol, t + 0.45); p.linearRampToValueAtTime(0.001, t + 1.05);
    }, out, { type: 'bandpass', freq: f * pitch, q: 0.8 });
  },
  breath_out(a, t0, out, vol, pitch, opts) {
    const f = opts.mask ? 250 : 400;
    a._noise(t0, 1.2, (p, t) => {
      p.setValueAtTime(0.001, t); p.linearRampToValueAtTime(0.28 * vol, t + 0.25); p.linearRampToValueAtTime(0.001, t + 1.15);
    }, out, { type: 'bandpass', freq: f * pitch, q: 0.7 });
  },
  geiger(a, t0, out, vol) {
    a._noise(t0, 0.012, AudioEngine._adsr(0.001, 0.4 * vol, 0.01), out, { type: 'highpass', freq: 4000 });
  },
  heartbeat(a, t0, out, vol) {
    a._osc('sine', 55, t0, 0.12, AudioEngine._adsr(0.005, 0.4 * vol, 0.1), out);
    a._osc('sine', 50, t0 + 0.22, 0.1, AudioEngine._adsr(0.005, 0.45 * vol, 0.08), out);
  },
  growl(a, t0, out, vol, pitch) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 68 * pitch;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 12;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 260; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(0.5 * vol, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + 1.4); lfo.start(t0); lfo.stop(t0 + 1.4);
    a._noise(t0, 1.2, AudioEngine._adsr(0.15, 0.2 * vol, 1.1), out, { type: 'lowpass', freq: 300 });
  },
  screech(a, t0, out, vol, pitch) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(800 * pitch, t0); o.frequency.exponentialRampToValueAtTime(280 * pitch, t0 + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(0.55 * vol, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.7);
    a._noise(t0, 0.5, AudioEngine._adsr(0.02, 0.3 * vol, 0.45), out, { type: 'highpass', freq: 1500 });
  },
  distant_screech(a, t0, out, vol) { this.screech(a, t0, out, vol * 0.5, 0.6); },
  mutant_hit(a, t0, out, vol) {
    a._osc('sine', 380, t0, 0.14, AudioEngine._adsr(0.002, 0.4 * vol, 0.12), out, 0, 120);
    a._noise(t0, 0.1, AudioEngine._adsr(0.002, 0.3 * vol, 0.08), out, { type: 'lowpass', freq: 600 });
  },
  mutant_die(a, t0, out, vol) {
    this.screech(a, t0, out, vol * 0.8, 0.75);
    a._noise(t0 + 0.3, 0.4, AudioEngine._adsr(0.02, 0.4 * vol, 0.35), out, { type: 'lowpass', freq: 300 });
  },
  human_hit(a, t0, out, vol) {
    a._osc('sine', 220, t0, 0.12, AudioEngine._adsr(0.002, 0.35 * vol, 0.1), out, 0, 90);
    a._noise(t0, 0.08, AudioEngine._adsr(0.002, 0.25 * vol, 0.07), out, { type: 'lowpass', freq: 500 });
  },
  human_die(a, t0, out, vol) {
    a._osc('sine', 180, t0, 0.5, AudioEngine._adsr(0.01, 0.4 * vol, 0.45), out, 0, 60);
    a._noise(t0 + 0.15, 0.35, AudioEngine._adsr(0.02, 0.35 * vol, 0.3), out, { type: 'lowpass', freq: 350 });
  },
  shout(a, t0, out, vol, pitch) {
    const ctx = a.ctx;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.22;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(190 * pitch, t); o.frequency.linearRampToValueAtTime(140 * pitch, t + 0.18);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 750; f.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.3 * vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
    }
  },
  bullet_impact(a, t0, out, vol, pitch) {
    a._noise(t0, 0.05, AudioEngine._adsr(0.001, 0.4 * vol, 0.04), out, { type: 'bandpass', freq: 2200 * pitch, q: 1 });
    a._osc('sine', 300 * pitch, t0, 0.04, AudioEngine._adsr(0.001, 0.2 * vol, 0.03), out);
  },
  flesh_hit(a, t0, out, vol) {
    a._noise(t0, 0.09, AudioEngine._adsr(0.001, 0.5 * vol, 0.08), out, { type: 'lowpass', freq: 350 });
    a._osc('sine', 120, t0, 0.08, AudioEngine._adsr(0.001, 0.4 * vol, 0.07), out);
  },
  ricochet(a, t0, out, vol, pitch) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2800 * pitch, t0); o.frequency.exponentialRampToValueAtTime(900 * pitch, t0 + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12 * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.35);
  },
  door(a, t0, out, vol) {
    a._noise(t0, 1.1, AudioEngine._adsr(0.15, 0.35 * vol, 1.0), out, { type: 'bandpass', freq: 280, q: 2, sweepTo: 160 });
    a._osc('sawtooth', 70, t0, 1.0, AudioEngine._adsr(0.2, 0.15 * vol, 0.9), out);
    a._noise(t0 + 0.95, 0.12, AudioEngine._adsr(0.002, 0.5 * vol, 0.1), out, { type: 'lowpass', freq: 300 });
  },
  gate(a, t0, out, vol) {
    a._noise(t0, 2.6, AudioEngine._adsr(0.3, 0.5 * vol, 2.4), out, { type: 'bandpass', freq: 200, q: 1.5, sweepTo: 100 });
    a._osc('sawtooth', 45, t0, 2.5, AudioEngine._adsr(0.3, 0.3 * vol, 2.3), out);
    a._noise(t0 + 2.4, 0.25, AudioEngine._adsr(0.005, 0.45 * vol, 0.2), out, { type: 'lowpass', freq: 250 });
    a._osc('sine', 60, t0 + 2.4, 0.3, AudioEngine._adsr(0.005, 0.4 * vol, 0.25), out);
  },
  pickup(a, t0, out, vol) {
    a._noise(t0, 0.08, AudioEngine._adsr(0.005, 0.2 * vol, 0.07), out, { type: 'bandpass', freq: 1500, q: 1 });
    a._osc('sine', 660, t0 + 0.05, 0.06, AudioEngine._adsr(0.005, 0.12 * vol, 0.05), out);
  },
  paper(a, t0, out, vol) {
    a._noise(t0, 0.3, AudioEngine._adsr(0.03, 0.18 * vol, 0.25), out, { type: 'highpass', freq: 2500 });
  },
  ui_click(a, t0, out, vol) {
    a._osc('sine', 1100, t0, 0.04, AudioEngine._adsr(0.002, 0.15 * vol, 0.03), out);
  },
  objective(a, t0, out, vol) {
    a._osc('sine', 520, t0, 0.15, AudioEngine._adsr(0.01, 0.18 * vol, 0.13), out);
    a._osc('sine', 780, t0 + 0.14, 0.2, AudioEngine._adsr(0.01, 0.18 * vol, 0.18), out);
  },
  flashlight(a, t0, out, vol) {
    a._osc('square', 1800, t0, 0.02, AudioEngine._adsr(0.001, 0.2 * vol, 0.015), out);
    a._noise(t0 + 0.02, 0.03, AudioEngine._adsr(0.001, 0.15 * vol, 0.025), out, { type: 'highpass', freq: 3500 });
  },
  mask_on(a, t0, out, vol) {
    a._noise(t0, 0.35, AudioEngine._adsr(0.05, 0.3 * vol, 0.3), out, { type: 'bandpass', freq: 500, q: 1, sweepTo: 250 });
    a._osc('sine', 200, t0 + 0.3, 0.1, AudioEngine._adsr(0.01, 0.2 * vol, 0.08), out);
  },
  mask_off(a, t0, out, vol) {
    a._noise(t0, 0.3, AudioEngine._adsr(0.03, 0.3 * vol, 0.25), out, { type: 'bandpass', freq: 300, q: 1, sweepTo: 700 });
  },
  cough(a, t0, out, vol) {
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.28;
      a._noise(t, 0.16, AudioEngine._adsr(0.008, 0.35 * vol, 0.14), out, { type: 'bandpass', freq: 420, q: 0.8, sweepTo: 260 });
      a._osc('sawtooth', 130 - i * 15, t, 0.12, AudioEngine._adsr(0.01, 0.12 * vol, 0.1), out);
    }
  },
  beep(a, t0, out, vol) {
    a._osc('square', 1240, t0, 0.07, AudioEngine._adsr(0.004, 0.14 * vol, 0.06), out);
    a._osc('square', 1240, t0 + 0.14, 0.07, AudioEngine._adsr(0.004, 0.14 * vol, 0.06), out);
  },
  heal(a, t0, out, vol) {
    a._noise(t0, 0.4, AudioEngine._adsr(0.05, 0.2 * vol, 0.35), out, { type: 'highpass', freq: 3000 });
    a._osc('sine', 440, t0 + 0.35, 0.12, AudioEngine._adsr(0.01, 0.1 * vol, 0.1), out);
  },
  battery(a, t0, out, vol) {
    a._noise(t0, 0.06, AudioEngine._adsr(0.002, 0.3 * vol, 0.05), out, { type: 'bandpass', freq: 1200, q: 2 });
    a._osc('sine', 880, t0 + 0.1, 0.15, AudioEngine._adsr(0.01, 0.12 * vol, 0.13), out);
  },
  filter_swap(a, t0, out, vol) {
    a._noise(t0, 0.15, AudioEngine._adsr(0.02, 0.3 * vol, 0.12), out, { type: 'bandpass', freq: 600, q: 2, sweepTo: 900 });
    a._noise(t0 + 0.25, 0.06, AudioEngine._adsr(0.002, 0.35 * vol, 0.05), out, { type: 'bandpass', freq: 1400, q: 2 });
  },
  generator_start(a, t0, out, vol) {
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * 0.45;
      a._noise(t, 0.3, AudioEngine._adsr(0.01, 0.5 * vol, 0.25), out, { type: 'lowpass', freq: 300 });
      a._osc('sawtooth', 40 + i * 8, t, 0.35, AudioEngine._adsr(0.02, 0.35 * vol, 0.3), out);
    }
    a._osc('sawtooth', 75, t0 + 1.9, 0.8, AudioEngine._adsr(0.2, 0.4 * vol, 0.7), out);
  },
  generator_fail(a, t0, out, vol) {
    for (let i = 0; i < 3; i++) {
      a._noise(t0 + i * 0.4, 0.25, AudioEngine._adsr(0.01, 0.4 * vol, 0.2), out, { type: 'lowpass', freq: 280 });
    }
    a._osc('sawtooth', 55, t0 + 1.2, 0.5, AudioEngine._adsr(0.01, 0.3 * vol, 0.45), out, 0, 20);
  },
  breaker(a, t0, out, vol) {
    a._noise(t0, 0.06, AudioEngine._adsr(0.001, 0.5 * vol, 0.05), out, { type: 'bandpass', freq: 800, q: 1.5 });
    a._osc('sine', 120, t0 + 0.05, 0.2, AudioEngine._adsr(0.01, 0.3 * vol, 0.18), out);
    a._noise(t0 + 0.1, 0.3, AudioEngine._adsr(0.02, 0.15 * vol, 0.25), out, { type: 'highpass', freq: 4000 });
  },
  radio_static_burst(a, t0, out, vol) {
    a._noise(t0, 0.8, AudioEngine._adsr(0.05, 0.4 * vol, 0.7), out, { type: 'bandpass', freq: 1400, q: 0.5 });
    for (let i = 0; i < 10; i++) {
      a._noise(t0 + Math.random() * 0.7, 0.015, AudioEngine._adsr(0.001, 0.3 * vol, 0.012), out, { type: 'highpass', freq: 3000 });
    }
  },
  radio_voice(a, t0, out, vol, pitch, opts) {
    // garbled formant speech — meaning carried by subtitles
    const ctx = a.ctx;
    const syllables = opts.syllables || 8;
    let t = t0;
    for (let i = 0; i < syllables; i++) {
      const dur = 0.1 + Math.random() * 0.16;
      const base = (110 + Math.random() * 60) * pitch;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.3), t + dur);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 400 + Math.random() * 600; f1.Q.value = 2.5;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1200 + Math.random() * 1200; f2.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.22 * vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.03 + (Math.random() < 0.2 ? 0.15 : 0);
    }
    a._noise(t0, t - t0, AudioEngine._adsr(0.05, 0.08 * vol, t - t0), out, { type: 'bandpass', freq: 1500, q: 0.6 });
  },
  morse(a, t0, out, vol, pitch, opts) {
    const pattern = opts.pattern || [0.12, 0.12, 0.12, 0.35, 0.35, 0.12, 0.12, 0.35];
    let t = t0;
    for (const d of pattern) {
      a._osc('sine', 840, t, d, AudioEngine._adsr(0.005, 0.2 * vol, d), out);
      t += d + 0.12;
    }
  },
  creak(a, t0, out, vol, pitch) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 * pitch, t0);
    o.frequency.linearRampToValueAtTime(62 * pitch, t0 + 1.4);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 320 * pitch; f.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(0.35 * vol, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
    o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 1.7);
  },
  drip(a, t0, out, vol, pitch) {
    a._osc('sine', 1500 * pitch, t0, 0.05, AudioEngine._adsr(0.001, 0.3 * vol, 0.045), out, 0, 700 * pitch);
  },
  rumble(a, t0, out, vol) {
    a._noise(t0, 3.2, (p, t) => {
      p.setValueAtTime(0.001, t); p.linearRampToValueAtTime(0.5 * vol, t + 1.2); p.linearRampToValueAtTime(0.001, t + 3.1);
    }, out, { type: 'lowpass', freq: 90 }, true);
  },
  distant_boom(a, t0, out, vol) {
    a._noise(t0, 1.8, AudioEngine._adsr(0.05, 0.5 * vol, 1.6), out, { type: 'lowpass', freq: 120 }, true);
    a._osc('sine', 38, t0, 1.5, AudioEngine._adsr(0.05, 0.4 * vol, 1.4), out);
  },
  stinger(a, t0, out, vol) {
    for (const f of [220, 233, 311, 466]) {
      a._osc('sine', f, t0, 2.6, (p, t) => {
        p.setValueAtTime(0.001, t); p.linearRampToValueAtTime(0.14 * vol, t + 0.5); p.linearRampToValueAtTime(0.001, t + 2.5);
      }, out, Math.random() * 14 - 7);
    }
    a._noise(t0, 2.4, AudioEngine._adsr(0.4, 0.12 * vol, 2.2), out, { type: 'bandpass', freq: 800, q: 0.6 });
  },
  whisper(a, t0, out, vol) {
    a._noise(t0, 2.2, (p, t) => {
      p.setValueAtTime(0.001, t); p.linearRampToValueAtTime(0.25 * vol, t + 0.8); p.linearRampToValueAtTime(0.001, t + 2.1);
    }, out, { type: 'bandpass', freq: 2200, q: 0.8, sweepTo: 1200 });
  },
  splash(a, t0, out, vol) {
    a._noise(t0, 0.2, AudioEngine._adsr(0.005, 0.4 * vol, 0.17), out, { type: 'highpass', freq: 1000 });
  },
};

// ================= loops =================
AudioEngine.prototype._loops = {
  generator(a, out, vol) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = ctx.createGain(); g.gain.value = 0.22 * vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 8.2;
    const lg = ctx.createGain(); lg.gain.value = 0.06 * vol;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(out);
    o.start(); o2.start(); lfo.start();
    return () => { o.stop(); o2.stop(); lfo.stop(); };
  },
  buzz(a, out, vol) {
    const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.035 * vol;
    o.connect(f); f.connect(g); g.connect(out); o.start();
    return () => o.stop();
  },
  radio_static(a, out, vol) {
    const ctx = a.ctx;
    const s = ctx.createBufferSource(); s.buffer = a.white; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.12 * vol;
    s.connect(f); f.connect(g); g.connect(out); s.start();
    return () => s.stop();
  },
  fire(a, out, vol) {
    const ctx = a.ctx;
    const s = ctx.createBufferSource(); s.buffer = a.brown; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.3 * vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1;
    const lg = ctx.createGain(); lg.gain.value = 0.1 * vol;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(out); s.start(); lfo.start();
    return () => { s.stop(); lfo.stop(); };
  },
  wind(a, out, vol) {
    const ctx = a.ctx;
    const s = ctx.createBufferSource(); s.buffer = a.brown; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.12 * vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.07 * vol;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(out); s.start(); lfo.start();
    return () => { s.stop(); lfo.stop(); };
  },
};