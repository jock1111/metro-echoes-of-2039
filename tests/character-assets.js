// METRO: ECHOES OF 2039 — Update 6.0 character asset regression suite.
// Classic script: assigns window.MetroCharTests. Run against a live game instance:
//   fetch('tests/character-assets.js').then(r => r.text()).then(eval)
//     .then(() => MetroCharTests.ready)
//     .then(() => MetroCharTests.runAll(window.__game)).then(console.table)
// Exercises the real glTF pipeline (assets/characters/lev.glb): validation, independent
// skinned clones, root-motion pinning, animator gating and procedural fallback.
(function () {
  let CH = null, AN = null;
  const ready = (async () => {
    CH = await import('/js/world/characters.js');
    AN = await import('/js/ai/animation.js');
    return true;
  })();

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });
  const bone = (g, name) => {
    let found = null;
    g.userData.animationRoot.traverse(o => { if (o.isBone && o.name === name) found = o; });
    return found;
  };

  test('C1. manifest character loads with full rig + clip set', (G) => {
    const has = G.assets.hasCharacter('lev');
    const g = CH.buildGLBCharacter('lev', 'human');
    const clips = g ? Object.keys(g.userData.nativeClips).sort().join(',') : '';
    const joints = g ? Object.keys(g.userData.parts).length : 0;
    const ok = has && !!g && g.userData.isGLBCharacter === true &&
      ['death', 'idle', 'run', 'walk'].every(k => g.userData.nativeClips[k]) && joints >= 17;
    return { pass: ok, detail: `has=${has} clips=${clips} parts=${joints}` };
  });

  test('C2. two instances are independent skinned clones', (G) => {
    const a = CH.buildGLBCharacter('lev', 'human');
    const b = CH.buildGLBCharacter('lev', 'human');
    if (!a || !b) return { pass: false, detail: 'build failed' };
    const ha = bone(a, 'Skeleton_neck_joint_2'), hb = bone(b, 'Skeleton_neck_joint_2');
    const before = hb.quaternion.clone();
    ha.quaternion.set(0.4, 0.2, 0.1, 0.9);
    const untouched = hb.quaternion.equals(before);
    const uuidsA = new Set(); a.userData.animationRoot.traverse(o => { if (o.isBone) uuidsA.add(o.uuid); });
    let shared = 0; b.userData.animationRoot.traverse(o => { if (o.isBone && uuidsA.has(o.uuid)) shared++; });
    const skA = [], skB = [];
    a.userData.animationRoot.traverse(o => { if (o.isSkinnedMesh) skA.push(o.skeleton); });
    b.userData.animationRoot.traverse(o => { if (o.isSkinnedMesh) skB.push(o.skeleton); });
    const invShared = skA[0].boneInverses === skB[0].boneInverses;
    return { pass: untouched && shared === 0 && !invShared, detail: `boneIsolated=${untouched} sharedBones=${shared} sharedInverses=${invShared}` };
  });

  test('C3. walk clip root motion pinned, vertical bob kept', (G) => {
    const g = CH.buildGLBCharacter('lev', 'human');
    const hips = g.userData.parts.hips;
    const track = g.userData.nativeClips.walk.tracks.find(t => t.name === hips.uuid + '.position');
    if (!track) return { pass: false, detail: 'no hips position track' };
    let xzFixed = true, yMoves = false;
    for (let i = 0; i < track.times.length; i++) {
      if (Math.abs(track.values[i * 3] - track.values[0]) > 1e-6) xzFixed = false;
      if (Math.abs(track.values[i * 3 + 2] - track.values[2]) > 1e-6) xzFixed = false;
      if (Math.abs(track.values[i * 3 + 1] - track.values[1]) > 1e-4) yMoves = true;
    }
    const root = g.userData.animationRoot;
    const skin = new Set(); root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.bones.forEach(b => skin.add(b.uuid)); });
    const allBound = g.userData.nativeClips.walk.tracks.every(t => skin.has(t.name.split('.')[0]));
    return { pass: xzFixed && yMoves && allBound, detail: `xzPinned=${xzFixed} bob=${yMoves} allTracksBoneBound=${allBound}` };
  });

  test('C4. validation rejects broken rigs and dead clips', (G) => {
    const good = CH.buildGLBCharacter('lev', 'human');
    const renamed = CH.buildGLBCharacter('lev', 'human');
    bone(renamed, 'Skeleton_neck_joint_2').name = 'NotAHead';
    const rejectRename = CH.validateCharacterRig(renamed, 'lev') === null;
    const noClips = CH.buildGLBCharacter('lev', 'human');
    noClips.userData.glTFClips = {};
    const rejectNoClips = CH.validateCharacterRig(noClips, 'lev') === null;
    const deadClip = CH.buildGLBCharacter('lev', 'human');
    deadClip.userData.glTFClips = Object.assign({}, deadClip.userData.glTFClips, { Idle: new (good.userData.glTFClips.Idle.constructor)('Idle', 0, []) });
    const rejectDead = CH.validateCharacterRig(deadClip, 'lev') === null;
    const goodOk = !!CH.validateCharacterRig(good, 'lev');
    return { pass: rejectRename && rejectNoClips && rejectDead && goodOk, detail: `rename=${rejectRename} noClips=${rejectNoClips} zeroDur=${rejectDead} goodAccepted=${goodOk}` };
  });

  test('C5. missing/throwing asset registry falls back to null', (G) => {
    const missing = CH.buildGLBCharacter('lev', 'human', { hasCharacter: () => false });
    const throwing = CH.buildGLBCharacter('lev', 'human', { hasCharacter: () => { throw new Error('io'); } });
    const unknown = CH.buildGLBCharacter('nobody', 'human');
    return { pass: missing === null && throwing === null && unknown === null, detail: `missing=${missing === null} throwing=${throwing === null} unknownRole=${unknown === null}` };
  });

  test('C6. live Lev animates natively; mutant stays procedural', (G) => {
    const lev = G.level.npcs.find(n => n.id === 'lev');
    const a = lev.animator;
    const head = bone(lev.group, 'Skeleton_neck_joint_2');
    const q0 = head.quaternion.clone();
    for (let i = 0; i < 40; i++) a.update(1 / 60, { speed: 0, talk: false });
    const moved = !head.quaternion.equals(q0);
    const idleWeight = a.actions.idle.getEffectiveWeight();
    const m = G.enemies.find(e => e.id === 'm1') || G.enemies[0];
    const ma = m.animator;
    const ok = a.native === true && !a.disabled && moved && idleWeight > 0.99 &&
      ma.native === false && !ma.disabled && !!ma.oneshot.attack;
    return { pass: ok, detail: `levNative=${a.native} headMoved=${moved} idleW=${idleWeight.toFixed(2)} mutantProcedural=${!ma.native} mutantAttack=${!!ma.oneshot.attack}` };
  });

  test('C7. glTF rig without usable idle is disabled, not posed', (G) => {
    const g = CH.buildGLBCharacter('lev', 'human');
    g.userData.nativeClips = { idle: new (g.userData.glTFClips.Idle.constructor)('Empty', 0, []) };
    const a = new AN.CharacterAnimator(g);
    const head = bone(g, 'Skeleton_neck_joint_2');
    const q0 = head.quaternion.clone();
    a.update(0.5, { speed: 0, talk: false });
    const untouched = head.quaternion.equals(q0);
    return { pass: a.disabled === true && !a.native && untouched, detail: `disabled=${a.disabled} native=${!!a.native} foreignRigUntouched=${untouched}` };
  });

  test('C8. procedural rig with empty nativeClips still animates', (G) => {
    const g = CH.buildHuman(G.materials, { character: 'scavenger' });
    if (g.userData.isGLBCharacter) return { pass: false, detail: 'expected procedural scavenger (no manifest entry)' };
    g.userData.nativeClips = {};
    const a = new AN.CharacterAnimator(g);
    const head = g.userData.parts.head;
    const q0 = head.quaternion.clone();
    for (let i = 0; i < 30; i++) a.update(1 / 60, { speed: 0, talk: false });
    const moved = !head.quaternion.equals(q0);
    return { pass: !a.native && !a.disabled && moved && !!a.actions.idle, detail: `native=${!!a.native} disabled=${a.disabled} idlePlays=${moved}` };
  });

  window.MetroCharTests = {
    ready, tests,
    runAll(G) {
      return tests.map(t => {
        try { const r = t.fn(G); return { name: t.name, pass: !!r.pass, detail: r.detail }; }
        catch (e) { return { name: t.name, pass: false, detail: 'EXCEPTION: ' + e.message }; }
      });
    },
  };
})();