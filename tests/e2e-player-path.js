// Category B automated simulation; shortcuts and invocation are documented in TEST-RESULTS-5.0.md.

(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function makeDriver(G) {
    const input = G.input;
    const sens = () => G.settings.sensitivity * 0.0021;
    const frame = (dt = 1 / 60) => G.debug.frame(dt);
    const frames = (n, dt) => { for (let i = 0; i < n; i++) frame(dt); };

    const key = (code, down) => {
      document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    };
    const tap = (code) => { key(code, true); frame(); key(code, false); };

    // mouse-look equivalent: feed the same deltas a real mouse would produce
    const aim = (yaw, pitch) => {
      input.mouseDX = (G.player.yaw - yaw) / sens();
      input.mouseDY = (G.player.pitch - pitch) / sens();
      frame();
    };
    const aimAt = (x, y, z) => {
      const e = G.player.eyePos();
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      const h = Math.hypot(dx, dz);
      aim(Math.atan2(-dx, -dz), Math.atan2(dy, h));
    };
    const yawTo = (x, z) => {
      const dx = x - G.player.pos.x, dz = z - G.player.pos.z;
      return Math.atan2(-dx, -dz);
    };

    const hold = (code, on) => key(code, on);
    function walkTo(x, z, tol = 0.5, maxFrames = 900) {
      hold('KeyW', true);
      let stuck = 0, lastX = G.player.pos.x, lastZ = G.player.pos.z;
      for (let i = 0; i < maxFrames; i++) {
        aim(yawTo(x, z), G.player.pitch * 0.9);
        frame();
        const d = Math.hypot(x - G.player.pos.x, z - G.player.pos.z);
        if (d < tol) { hold('KeyW', false); frames(3); return true; }
        const moved = Math.hypot(G.player.pos.x - lastX, G.player.pos.z - lastZ);
        stuck = moved < 0.02 ? stuck + 1 : 0;
        lastX = G.player.pos.x; lastZ = G.player.pos.z;
        if (stuck > 40) { // sidestep around whatever is blocking
          hold('KeyW', false); hold('KeyD', true); frames(24); hold('KeyD', false);
          hold('KeyW', true); stuck = 0;
        }
      }
      hold('KeyW', false); frames(3);
      return Math.hypot(x - G.player.pos.x, z - G.player.pos.z) < tol + 0.4;
    }

    // walk near a target, look at it, press E (the normal interact path)
    function interactAt(x, y, z, standX, standZ, radius = 1.6) {
      const ok = walkTo(standX, standZ, 0.4);
      aimAt(x, y, z);
      frames(2);
      tap('KeyE');
      frames(6);
      return ok;
    }

    const click = (id) => document.getElementById(id).click();

    // opportunistic combat: fire the pistol at the nearest live enemy ahead
    function shootNearest(maxDist = 10) {
      let best = null, bd = maxDist;
      for (const e of G.enemies) {
        if (e.dead || !G.physics.los(G.player.eyePos(), e.eyePos(), 'enemy')) continue;
        const d = e.pos.distanceTo(G.player.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return false;
      for (let i = 0; i < 90 && !best.dead; i++) {
        aimAt(best.pos.x, best.pos.y + 0.95 - best.duckK * 0.6, best.pos.z);
        input.lmb = true; input.lmbJust = true; frame(); input.lmbJust = false;
      }
      input.lmb = false;
      frames(4);
      return true;
    }

    return { G, input, frame, frames, key, tap, aim, aimAt, walkTo, interactAt, click, shootNearest, sleep };
  }

  async function run(G) {
    const d = makeDriver(G);
    const R = [];
    const stage = (name, pass, detail) => R.push({ name, pass: !!pass, detail });
    const L = G.level;
    const step = () => G.mission.step;

    // ---- New Game via the menu button ----
    G.game.setState('menu');
    d.frames(2);
    d.click('btn-new');
    await d.sleep(1000);           // the menu's own loading delay
    d.input.enabled = true; d.input.locked = true;   // emulate engaged pointer lock headless
    G.god = true;                  // survive contact; enemies still engage via movement
    d.frames(10);
    stage('new-game', G.state === 'playing', `state=${G.state} step=${step()} pos=${G.player.pos.toArray().map(v => v.toFixed(1))}`);

    // ---- walk to Lev and talk (dialogue advanced with E) ----
    d.walkTo(-1, -8); d.walkTo(-1, -23); d.walkTo(-5.2, -24.8);
    d.aimAt(-6.5, 1.2, -25.3); d.frames(2);
    // a nearer pickup can win the crosshair score on the first E; retry until dialogue opens
    let talkedState = G.state;
    for (let i = 0; i < 3 && G.state !== 'dialogue'; i++) { d.tap('KeyE'); d.frames(6); talkedState = G.state; }
    let guard = 0;
    while (G.state === 'dialogue' && guard++ < 20) { d.tap('KeyE'); d.frames(4); }
    stage('talk-lev', talkedState === 'dialogue' && !L.doors.stationGate.locked, `dialogue=${talkedState} gateUnlocked=${!L.doors.stationGate.locked} step=${step()}`);

    // ---- open the station gate and enter the tunnel ----
    d.walkTo(-1, -25.5); d.walkTo(0, -26.5);
    d.aimAt(0, 1.2, -27.7); d.frames(2); d.tap('KeyE'); d.frames(60);
    const gateOpen = L.doors.stationGate.open;
    d.walkTo(0, -31);
    stage('station-gate', gateOpen && G.player.pos.z < -28, `open=${gateOpen} z=${G.player.pos.z.toFixed(1)}`);

    // ---- tunnel traversal (left walkway around the derailed car) ----
    let maxNear = 0;
    const near = () => G.enemies.filter(e => !e.dead && e.pos.distanceTo(G.player.pos) < 12).length;
    const path = [[-2.2, -40], [-2.2, -55], [-2.2, -70], [-2.2, -85], [-2.2, -100]];
    let tunnelOk = true;
    for (const [x, z] of path) {
      tunnelOk = d.walkTo(x, z) && tunnelOk;
      maxNear = Math.max(maxNear, near());
      if (near() > 0) d.shootNearest(9);
    }
    stage('tunnel-move', tunnelOk && G.player.pos.z < -95, `z=${G.player.pos.z.toFixed(1)} enemiesEngaged=${maxNear}`);

    // ---- checkpoint fuel pickup (around the sandbags, approach the table from the east
    //      so the can is the nearest interactable and the note behind it cannot win the crosshair) ----
    d.walkTo(-1.0, -103); d.walkTo(-0.4, -105.6); d.walkTo(1.2, -108.6);
    d.walkTo(3.1, -108.0); d.walkTo(3.1, -106.6);
    d.aimAt(2.3, 0.65, -106.5); d.frames(2); d.tap('KeyE'); d.frames(6);
    if (G.state === 'note') { d.click('note-reader'); d.frames(4); d.aimAt(2.3, 0.65, -106.5); d.frames(2); d.tap('KeyE'); d.frames(6); }
    const hasFuel = G.player.inv.fuel > 0;
    stage('fuel-pickup', hasFuel, `fuel=${G.player.inv.fuel}`);

    // ---- generator: pour fuel + pull lever ----
    d.walkTo(3.6, -110); d.walkTo(6.8, -117);
    d.aimAt(8.2, 0.9, -118); d.frames(2); d.tap('KeyE'); d.frames(10);   // pour
    d.aimAt(8.2, 0.9, -118); d.frames(2); d.tap('KeyE'); d.frames(40);   // start
    const genRun = L.state.generator === 'running';
    stage('generator', genRun, `generator=${L.state.generator} step=${step()}`);

    // ---- security gate (powered) ----
    d.walkTo(4.0, -117); d.walkTo(1.0, -119); d.walkTo(-2.2, -124);
    d.walkTo(-2.2, -132); d.walkTo(-2.2, -143); d.walkTo(0, -146);
    d.aimAt(0, 1.4, -147.5); d.frames(2); d.tap('KeyE'); d.frames(90);
    const secOpen = L.doors.securityGate.open;
    d.walkTo(0, -152);
    stage('security-gate', secOpen && G.player.pos.z < -148, `open=${secOpen} z=${G.player.pos.z.toFixed(1)}`);

    // ---- facility traversal ----
    // The machine at (0.5, -198) spans x[-2, 3]; pass west of it.
    let facOk = true;
    for (const [x, z] of [[-2, -158], [-2, -170], [-2, -184], [-3.6, -192], [-3.6, -201], [0, -205]]) {
      let ok = d.walkTo(x, z);
      // a live lurker body can block the waypoint; kill it the way a player would, then retry
      if (!ok && near() > 0) { d.shootNearest(9); ok = d.walkTo(x, z); }
      facOk = ok && facOk;
      maxNear = Math.max(maxNear, near());
      if (near() > 0) d.shootNearest(9);
    }
    stage('facility-move', facOk && G.player.pos.z < -200, `z=${G.player.pos.z.toFixed(1)}`);

    // ---- save checkpoint via pause menu, then resume ----
    // Esc pauses by exiting pointer lock in a real browser; emulate that lock loss headless
    d.input.locked = false; d.input.onLockChange(false); d.frames(4);
    const paused = G.state === 'paused';
    d.click('btn-save'); d.frames(4);
    d.click('btn-resume'); d.frames(4);
    d.input.locked = true;
    stage('save-resume', paused && G.state === 'playing', `paused=${paused} resumed=${G.state}`);

    // ---- control room door + breaker + transmitter ----
    d.walkTo(0, -206);
    d.aimAt(0, 1.2, -207.6); d.frames(2); d.tap('KeyE'); d.frames(60);
    // hostile scavengers hold the control room; defend through them the way a player would
    const crWalk = (x, z) => {
      let ok = d.walkTo(x, z);
      if (!ok && near() > 0) { d.shootNearest(9); ok = d.walkTo(x, z); }
      if (near() > 0) d.shootNearest(9);
      return ok;
    };
    crWalk(0, -212); crWalk(0, -220); crWalk(6.2, -228);
    d.aimAt(7.6, 1.5, -228); d.frames(2); d.tap('KeyE'); d.frames(20);
    const breaker = L.state.breaker;
    crWalk(2, -232);
    for (let attempt = 0; attempt < 3 && !L.state.radioPlayed; attempt++) {
      d.walkTo(0, -235.3, 0.2);
      d.aimAt(0, 1.2, -236.6); d.frames(2); d.tap('KeyE'); d.frames(30);
    }
    if (L.state.radioPlayed) d.frames(1620);
    stage('finale', breaker && L.state.radioPlayed && L.state.logSpawned,
      `breaker=${breaker} radioPlayed=${L.state.radioPlayed} log=${L.state.logSpawned} step=${step()} pos=${G.player.pos.toArray().map(v => v.toFixed(1))}`);

    if (L.state.logSpawned) {
      d.walkTo(0.9, -235.8, 0.2);
      d.aimAt(0.9, 1.11, -236.9); d.frames(2); d.tap('KeyE'); d.frames(4);
    }
    const logOpened = G.state === 'note' && G.readingNote === 'note_log';
    if (G.state === 'note') d.click('note-reader');
    d.frames(4);
    stage('mission-complete', logOpened && G.mission.done && G.state === 'complete',
      `logOpened=${logOpened} done=${G.mission.done} state=${G.state}`);
    await d.sleep(1200);

    // Direct damage is a disclosed simulation shortcut for this death-state check.
    G.god = false;
    G.player.damage(999, 'E2E death check', true);
    d.frames(10); await d.sleep(1100);
    const died = G.state === 'dead';
    d.click('btn-restart'); d.frames(20);
    stage('death-restart', died && G.state === 'playing' && G.player.hp > 0, `died=${died} state=${G.state} hp=${G.player.hp}`);

    const passed = R.filter(r => r.pass).length;
    return { pass: passed === R.length, passed, total: R.length, stages: R };
  }

  window.MetroE2E = { run };
})();