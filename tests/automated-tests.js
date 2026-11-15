// METRO: ECHOES OF 2039 — automated in-browser test suite (Update 3.0, Phase 6).
// Classic script: assigns window.MetroTests. Run against a live game instance:
//   fetch('tests/automated-tests.js').then(r => r.text()).then(eval)
//     .then(() => MetroTests.runAll(window.__game)).then(console.table)
// Every assertion reads real game state — no invented results.
(function () {
  const V3 = (x, y, z) => new (window.__game.scene.position.constructor)(x, y, z);

  function frames(G, n, dt = 1 / 60) { for (let i = 0; i < n; i++) G.debug.frame(dt); }

  function fresh(G) {
    G.game.resetWorld();
    G.state = 'playing';
    G.input.enabled = true;
    G.god = true; // keep the test pilot alive unless a test disables it
    G.player.pos.copy(G.level.playerStart.pos);
    G.player.yaw = G.level.playerStart.yaw;
    G.player.vel.set(0, 0, 0);
    frames(G, 5);
  }

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  test('1. startup & asset pipeline', (G) => {
    const meshes = (() => { let n = 0; G.scene.traverse(o => { if (o.isMesh) n++; }); return n; })();
    const models = G.assets ? Object.keys(G.assets.models || {}).length : 0;
    const sets = G.assets ? Object.keys(G.assets.sets || {}).length : 0;
    const ok = !!G.level && G.enemies.length === 6 && meshes > 500 && G.engine.post.ok;
    return { pass: ok, detail: `meshes=${meshes} enemies=${G.enemies.length} models=${models} texSets=${sets} postOk=${G.engine.post.ok} hdr=${G.engine.post.hdr}` };
  });

  test('2. inventory & pointer-lock state', (G) => {
    fresh(G);
    G.game.setState('inventory');
    const invOk = G.state === 'inventory' && G.input.enabled === false;
    G.game.setState('playing');
    const playOk = G.state === 'playing' && G.input.enabled === true;
    // pointer lock itself needs a user gesture; verify the lock request path exists
    const lockApi = typeof G.input.lock === 'function' && typeof G.input.unlock === 'function';
    return { pass: invOk && playOk && lockApi, detail: `inventory=${invOk} resume=${playOk} lockApi=${lockApi} (real pointer lock requires a click)` };
  });

  test('3. movement & collision', (G) => {
    fresh(G);
    const z0 = G.player.pos.z;
    G.input.keys.add('KeyW');
    frames(G, 60);
    G.input.keys.delete('KeyW');
    const moved = z0 - G.player.pos.z;
    // drive into the station north wall (z=-28) and confirm we cannot pass it
    G.player.pos.set(0, 0, -26); G.player.yaw = 0; G.player.vel.set(0, 0, 0);
    G.input.keys.add('KeyW');
    frames(G, 120);
    G.input.keys.delete('KeyW');
    const blocked = G.player.pos.z > -28.2;
    return { pass: moved > 1 && blocked, detail: `forward=${moved.toFixed(2)}m wallStopZ=${G.player.pos.z.toFixed(2)} (wall at -28)` };
  });

  test('4. shooting & reloading', (G) => {
    fresh(G);
    G.debug.give();
    G.weapons.deserialize({ current: 'pistol', mags: { pistol: 8, rifle: 30 } });
    const mag0 = G.weapons.mags.pistol;
    G.input.lmb = true; G.input.lmbJust = true;
    frames(G, 3);
    G.input.lmb = false; G.input.lmbJust = false;
    const fired = mag0 - G.weapons.mags.pistol;
    // reload
    G.weapons.mags.pistol = 2;
    const reserve0 = G.player.inv.pistolAmmo;
    G.input.justPressed.add('KeyR');
    frames(G, 120); // 1.5s reload
    const reloaded = G.weapons.mags.pistol === 8 && G.player.inv.pistolAmmo < reserve0;
    return { pass: fired >= 1 && reloaded, detail: `shotsFired=${fired} magAfterReload=${G.weapons.mags.pistol} reserveUsed=${reserve0 - G.player.inv.pistolAmmo}` };
  });

  test('5. mutant & scavenger encounters', (G) => {
    fresh(G);
    G.debug.give();
    const mut = G.enemies.find(e => e.type === 'mutant');
    const scav = G.enemies.find(e => e.type === 'scavenger');
    // mutant: damage reacts + alerts
    mut.lastKnown.copy(G.player.pos); mut.setState('combat');
    const hp0 = mut.hp;
    mut.damage(20, V3(0, 0, 1), false);
    const mutReact = mut.hp === hp0 - 20 && mut.state === 'combat' && mut.flinchT > 0;
    // scavenger: being shot forces a cover reselect
    scav.repositionT = 99;
    scav.damage(10, V3(0, 0, 1), false);
    const scavCover = scav.repositionT === 0 && scav.state === 'combat';
    mut.pos.copy(G.player.pos); mut.pos.z -= 1.1;
    mut.attackWindup = 0.01;
    const playerHp = G.player.hp;
    mut.combatMutant(0.02);
    const meleeResolved = G.player.hp < playerHp;
    mut.damage(999, V3(0, 0, 1), true);
    const mutDead = mut.dead && mut.collider.enabled === false;
    return { pass: mutReact && scavCover && meleeResolved && mutDead,
      detail: `mutantReact=${mutReact} scavSeeksCover=${scavCover} meleeResolved=${meleeResolved} mutantDeath=${mutDead}` };
  });

  test('6. generator & checkpoint progression', (G) => {
    fresh(G);
    G.debug.give(); // includes fuel
    G.mission.setStep(2);
    G.player.inv.fuel = 1;
    G.mission.useGenerator(); // empty → fueled
    const fueled = G.level.state.generator === 'fueled';
    G.mission.useGenerator(); // fueled → running
    const running = G.level.state.generator === 'running';
    const gateOpen = G.level.doors.securityGate.open === true;
    frames(G, 10);
    const stepAdv = G.mission.step === 3;
    // checkpoint restore: collect + reapply a save mid-tunnel
    G.player.pos.set(0, 0, -120);
    const save = G.game.collectSave();
    G.game.applySave(save);
    const restored = G.level.state.generator === 'running' && G.level.doors.securityGate.open;
    return { pass: fueled && running && gateOpen && stepAdv && restored, detail: `fueled=${fueled} running=${running} gate=${gateOpen} step=${G.mission.step} saveRestore=${restored}` };
  });

  test('7. containers & loot persistence', (G) => {
    fresh(G);
    const c = G.level.containers.find(x => x.loot.length);
    const before = G.player.inv[c.loot[0][0]] || 0;
    G.game.searchContainer(c);
    const granted = (G.player.inv[c.loot[0][0]] || 0) === before + c.loot[0][1];
    const opened = c.opened;
    // persistence across save/load
    const save = G.game.collectSave();
    G.game.applySave(save);
    const c2 = G.level.containers.find(x => x.id === c.id);
    const persisted = c2.opened === true;
    // dynamic drop spawns + is collectible
    const drops0 = G.dynamicPickups.length;
    G.game.spawnDrop(V3(G.player.pos.x + 1, 0, G.player.pos.z), 'rifleAmmo', 5);
    const dropSpawned = G.dynamicPickups.length === drops0 + 1;
    return { pass: granted && opened && persisted && dropSpawned, detail: `lootGranted=${granted} opened=${opened} persisted=${persisted} dropSpawned=${dropSpawned}` };
  });

  test('8. gas mask & radiation', (G) => {
    fresh(G);
    G.player.filterTime = 90;
    G.player.toggleMask();
    const maskOn = G.player.maskOn === true;
    // stand in the tunnel radiation zone (z -95..-86)
    G.player.pos.set(1, 0, -90); G.player.vel.set(0, 0, 0);
    frames(G, 60);
    const radDetected = G.player.radRate > 0.5;
    const filterDrain = G.player.filterTime < 90;
    G.player.toggleMask();
    const maskOff = G.player.maskOn === false;
    return { pass: maskOn && radDetected && filterDrain && maskOff, detail: `maskOn=${maskOn} radRate=${G.player.radRate.toFixed(1)} filter=${G.player.filterTime.toFixed(1)} maskOff=${maskOff}` };
  });

  test('9. radio cinematic interruption save/load', (G) => {
    fresh(G);
    G.debug.give();
    G.mission.setStep(6);
    G.level.state.breaker = true;
    G.mission.useRadio(); // starts cinematic, radioPlayed=true
    const cineStarted = G.mission.cineT >= 0 && G.level.state.radioPlayed;
    // interrupt mid-transmission (cineT ~ 5s, log not yet spawned)
    frames(G, 300);
    const midCine = G.mission.cineT >= 0 && !G.level.state.logSpawned;
    const save = G.game.collectSave();
    G.game.applySave(save); // must safely restart the cinematic
    const restarted = G.mission.cineT >= 0;
    // let it finish → log spawns, objective advances
    G.mission.update(30);
    const logSpawned = G.level.state.logSpawned === true && G.mission.step >= 7;
    return { pass: cineStarted && midCine && restarted && logSpawned, detail: `started=${cineStarted} interrupted=${midCine} restarted=${restarted} logSpawned=${logSpawned} step=${G.mission.step}` };
  });

  test('10. full mission flow', (G) => {
    fresh(G);
    G.debug.give();
    G.mission.talkTo('lev');
    while (G.state === 'dialogue') G.mission.advanceDialogue(); // finish intro → unlocks gate, step 1
    const s1 = G.mission.step >= 1;
    G.player.pos.set(0, 0, -101); frames(G, 3); // → step 2
    G.player.inv.fuel = 1; G.mission.useGenerator(); G.mission.useGenerator(); // running → step 3
    G.player.pos.set(0, 0, -207); frames(G, 3); // → step 4
    G.player.pos.set(0, 0, -213); frames(G, 3); // → step 5
    G.mission.useBreaker(); // → step 6
    const s6 = G.mission.step >= 6;
    G.mission.useRadio();
    G.mission.update(30); // run cinematic to completion → step 7 + log
    const s7 = G.mission.step >= 7 && G.level.state.logSpawned;
    G.mission.onNoteRead('note_log'); // → complete
    const done = G.mission.done === true;
    return { pass: s1 && s6 && s7 && done, detail: `intro=${s1} breaker=${s6} log=${s7} complete=${done} finalStep=${G.mission.step}` };
  });

  test('11. graphics settings & shader compilation', (G) => {
    fresh(G);
    const gl = G.engine.renderer.getContext();
    const read = () => {
      G.engine.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, nb = 0; const n = px.length / 4;
      for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += l; if (l > 8) nb++; }
      return { luma: +(sum / n).toFixed(1), nonBlack: +(100 * nb / n).toFixed(1) };
    };
    const out = {};
    let allOk = true;
    for (const q of ['low', 'medium', 'high']) {
      G.engine.setQuality(q);
      frames(G, 4);
      const r = read();
      out[q] = r;
      if (r.nonBlack < 50 || r.luma < 5) allOk = false; // black-screen guard
    }
    G.engine.setQuality('medium');
    const progs = G.engine.renderer.info.programs.length;
    return { pass: allOk && G.engine.post.ok, detail: `low=${out.low.luma}/${out.low.nonBlack}% med=${out.medium.luma}/${out.medium.nonBlack}% high=${out.high.luma}/${out.high.nonBlack}% shaders=${progs}` };
  });

  test('12. death & restart', (G) => {
    fresh(G);
    G.god = false;
    G.player.hp = 5;
    G.player.damage(100, 'Test execution.');
    const died = G.player.dead === true && G.state === 'dead';
    // restart from checkpoint
    G.game.resetWorld();
    G.state = 'playing'; G.input.enabled = true;
    frames(G, 5);
    const revived = G.player.dead === false && G.player.hp === G.player.maxHp && G.state === 'playing';
    G.god = true;
    return { pass: died && revived, detail: `death=${died} state=dead restartHp=${G.player.hp} alive=${revived}` };
  });

  test('13. combat line-of-sight — cover blocks gunfire', (G) => {
    fresh(G);
    G.god = false;
    const scav = G.enemies.find(e => e.type === 'scavenger');
    const P = G.player, phys = G.physics;
    // Category A unit test: isolate the bullet raycast from level geometry by
    // disabling every collider, then insert exactly one test wall. fireAtPlayer
    // only raycasts (no movement), so this is a controlled, deterministic lane.
    const saved = phys.colliders.map(c => c.enabled);
    const baseLen = phys.colliders.length;
    for (const c of phys.colliders) c.enabled = false;
    scav.pos.set(0, 0, 0); scav.vel.set(0, 0, 0); scav.dead = false; scav.hp = scav.maxHp;
    scav.duckK = 0; scav.speed2D = 0; scav.collider.enabled = false;
    P.pos.set(0, 0, 8); P.vel.set(0, 0, 0); P.dead = false; P.hp = 100000;
    P.crouched = false; P.sprinting = false;
    // spy on tracer endpoints to prove they stop at the real impact surface
    const origTracer = G.effects.tracer.bind(G.effects);
    let lastEnd = null;
    G.effects.tracer = (from, to) => { lastEnd = to.clone(); origTracer(from, to); };
    const fire = (n) => { for (let i = 0; i < n; i++) scav.fireAtPlayer(); };
    const losClear = () => phys.los(scav.eyePos(), P.eyePos(), 'enemy');

    // A) exposed target in the open → some shots land
    const hpA0 = P.hp; fire(400); const exposedDmg = hpA0 - P.hp;
    const exposedOk = exposedDmg > 0 && losClear();

    // B) solid wall across the lane → zero damage, tracer ends at the wall
    const wall = phys.addBoxCenter(0, 1.5, 4, 4, 3, 0.4, 'static');
    const blockedLos = !losClear();
    const hpB0 = P.hp; fire(400); const blockedDmg = hpB0 - P.hp;
    const tracerAtWall = !!lastEnd && Math.abs(lastEnd.z - 4) < 0.3;
    const blockedOk = blockedDmg === 0 && blockedLos && tracerAtWall;

    // C) move behind cover mid-fight: damage accrues exposed, then stops dead
    wall.enabled = false; P.hp = 100000;
    fire(60); const hpCmid = P.hp; const accrued = 100000 - hpCmid;
    wall.enabled = true; fire(400); const afterCover = hpCmid - P.hp;
    const coverOk = accrued > 0 && afterCover === 0;

    // restore the world exactly
    G.effects.tracer = origTracer;
    phys.colliders.length = baseLen;
    phys.colliders.forEach((c, i) => { c.enabled = saved[i]; });
    P.hp = P.maxHp; G.god = true;
    return {
      pass: exposedOk && blockedOk && coverOk,
      detail: `exposedDmg=${exposedDmg} blockedDmg=${blockedDmg} tracerAtWall=${tracerAtWall} coverAccrued=${accrued} coverAfter=${afterCover}`,
    };
  });

  test('14. animation clips — real baked tracks + additive combat layer', (G) => {
    const scav = G.enemies.find(e => e.type === 'scavenger');
    const mut = G.enemies.find(e => e.type === 'mutant');
    const ha = scav.animator, ma = mut.animator;
    const ADDITIVE = 2501; // THREE.AdditiveAnimationBlendMode
    // locomotion: full quaternion clips covering every joint (human 15, mutant 18)
    const locoOk = ['idle', 'walk', 'run'].every(k =>
      ha.actions[k].getClip().tracks.length >= 15 && ma.actions[k].getClip().tracks.length >= (ma.native ? 1 : 18));
    // human sustained postures are additive clips, not procedural overlays
    const postureOk = ['aim', 'reload', 'duck', 'talk'].every(k => ha.additive[k] && ha.additive[k].blendMode === ADDITIVE);
    const hitAdditive = ha.oneshot.hit.blendMode === ADDITIVE && (ma.native ? !!ma.actions.hit : ma.oneshot.hit.blendMode === ADDITIVE);
    // death is a FULL clip with a real hips.position track (the body actually drops + topples)
    const deathTracks = ha.oneshot.death.getClip().tracks;
    const deathHasPos = deathTracks.some(t => t.name === 'hips.position' && t.ValueTypeName === 'vector');
    const deathFull = ha.oneshot.death.blendMode !== ADDITIVE;
    const mutantAttack = ma.native ? !!ma.actions.attack : !!ma.oneshot.attack && ma.oneshot.attack.blendMode === ADDITIVE;
    const humanShoot = !!ha.oneshot.shoot && ha.oneshot.shoot.blendMode === ADDITIVE;
    const ok = locoOk && postureOk && hitAdditive && deathHasPos && deathFull && mutantAttack && humanShoot;
    const dc = ha.oneshot.death.getClip();
    return { pass: ok, detail: `loco=${locoOk} postures=${postureOk} hitAdditive=${hitAdditive} deathPosTrack=${deathHasPos} deathFull=${deathFull} mutAttack=${mutantAttack} humanShoot=${humanShoot} death=${dc.tracks.length}tracks/${dc.duration.toFixed(2)}s` };
  });

  test('15. animation transitions sync to AI state', (G) => {
    fresh(G);
    const scav = G.enemies.find(e => e.type === 'scavenger');
    const mut = G.enemies.find(e => e.type === 'mutant');
    const ha = scav.animator, ma = mut.animator;
    // locomotion selected by ground speed
    ha.update(0.016, { speed: 0 }); const idle = ha.current;
    ha.update(0.016, { speed: 2 }); const walk = ha.current;
    ha.update(0.016, { speed: 5 }); const run = ha.current;
    const locoSync = idle === 'idle' && walk === 'walk' && run === 'run';
    // combat raises the additive aim weight; leaving combat decays it
    for (let i = 0; i < 30; i++) ha.update(0.016, { speed: 0, combat: true });
    const aimUp = ha.w.aim > 0.8;
    for (let i = 0; i < 40; i++) ha.update(0.016, { speed: 0, combat: false });
    const aimDown = ha.w.aim < 0.1;
    // hit impulse fires then expires (LoopOnce additive returns to zero)
    ha.trigger('hit');
    const hitRunning = ha.oneshot.hit.isRunning();
    for (let i = 0; i < 30; i++) ha.update(0.016, {}); // 0.48s > 0.26s clip
    const hitExpired = !ha.oneshot.hit.isRunning();
    // mutant claw-swipe impulse
    ma.trigger('attack');
    const atkRunning = (ma.native ? ma.actions.attack : ma.oneshot.attack).isRunning();
    // death is terminal and clamps on the final pose; finishDeath snaps a loaded corpse
    ha.trigger('death');
    const deathDead = ha.dead === true;
    for (let i = 0; i < 70; i++) ha.update(0.016, {}); // 1.12s > 0.9s clip
    const deathDur = ha.oneshot.death.getClip().duration;
    const deathClamped = ha.oneshot.death.time >= deathDur - 1e-3;
    ma.finishDeath();
    const mutantDeath = ma.native ? ma.actions.death : ma.oneshot.death;
    const maSnap = ma.dead === true && mutantDeath.time >= mutantDeath.getClip().duration - 1e-3;
    const ok = locoSync && aimUp && aimDown && hitRunning && hitExpired && atkRunning && deathDead && deathClamped && maSnap;
    return { pass: ok, detail: `loco=${locoSync}(${idle}/${walk}/${run}) aimUp=${aimUp} aimDown=${aimDown} hit=${hitRunning}->${hitExpired} attack=${atkRunning} death=${deathDead} clamped=${deathClamped} loadSnap=${maSnap}` };
  });

  async function runAll(G, shot) {
    const results = [];
    for (const t of tests) {
      try {
        const r = t.fn(G);
        results.push({ name: t.name, pass: !!r.pass, detail: r.detail || '' });
        if (shot) { try { await shot('test_' + t.name.split('.')[0], G.player.pos.x, G.player.pos.y, G.player.pos.z, G.player.yaw, 0); } catch (e) { /* screenshot optional */ } }
      } catch (e) {
        results.push({ name: t.name, pass: false, detail: 'EXCEPTION: ' + (e && e.message || e) });
      }
    }
    const passed = results.filter(r => r.pass).length;
    return { passed, total: results.length, results };
  }

  function benchmark(G, sampleCount = 30) {
    const engine = G.engine, renderer = engine.renderer, gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const result = {
      userAgent: navigator.userAgent,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      position: engine.camera.position.toArray(),
      sampleCount,
      samples: [],
    };
    const previousQuality = engine.quality, autoReset = renderer.info.autoReset;
    try {
      renderer.info.autoReset = false;
      for (const quality of ['low', 'medium', 'high']) {
        engine.setQuality(quality);
        for (let i = 0; i < 5; i++) { engine.render(); gl.finish(); }
        const times = [];
        for (let i = 0; i < sampleCount; i++) {
          renderer.info.reset();
          const start = performance.now();
          engine.render();
          // Synchronize GPU completion rather than measuring command submission alone.
          gl.finish();
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        result.samples.push({
          quality,
          meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
          medianMs: +times[Math.floor(times.length / 2)].toFixed(2),
          p95Ms: +times[Math.ceil(times.length * 0.95) - 1].toFixed(2),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs.length,
          canvas: `${renderer.domElement.width}x${renderer.domElement.height}`,
        });
      }
    } finally {
      renderer.info.autoReset = autoReset;
      engine.setQuality(previousQuality);
    }
    result.jsHeapBytes = performance.memory?.usedJSHeapSize ?? null;
    return result;
  }

  window.MetroTests = { runAll, tests, benchmark };
})();