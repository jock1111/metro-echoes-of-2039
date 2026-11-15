# TEST RESULTS — Update 6.0 (measured 2026-11-11)

All automated results below were produced by running the suites against a live game page
(`node server.js` → http://localhost:8039, New Game clicked, frames driven through the game's own
`step()` because the embedded test page is backgrounded and does not receive RAF). No result is
simulated or invented. Categories are kept separate.

## A. Unit / regression (module-level, real code paths)

`tests/combat-obstruction.js` — **8/8 pass**
(unobstructed hit; static/door/train block + tracer clip; door open restores; partial cover
standing vs crouched; narrow-cover burst interrupt; mutant melee blocked by closed door).

`tests/character-assets.js` — **8/8 pass**
- C1 manifest character loads: `has=true clips=death,idle,run,walk parts=25`
- C2 independent clones: `boneIsolated=true sharedBones=0 sharedInverses=false`
- C3 root motion: `xzPinned=true bob=true allTracksBoneBound=true`
- C4 validation: `rename=true noClips=true zeroDur=true goodAccepted=true`
- C5 fallback: `missing=true throwing=true unknownRole=true`
- C6 live rigs: `levNative=true headMoved=true idleW=1.00 mutantProcedural=true mutantAttack=true`
- C7 disabled gate: `disabled=true native=false foreignRigUntouched=true`
- C8 procedural with empty nativeClips: `native=false disabled=false idlePlays=true`

## B. Automated in-game integration (15/15 pass)

`tests/automated-tests.js`, final build:
1 startup & asset pipeline — meshes=2584 enemies=6 models=12 texSets=9 postOk=true hdr=true
2 inventory & pointer-lock state — pass (real pointer lock needs a user click)
3 movement & collision — forward=2.88m wallStopZ=-27.60
4 shooting & reloading — shotsFired=1 magAfterReload=8 reserveUsed=6
5 mutant & scavenger encounters — mutantReact/scavSeeksCover/meleeResolved/mutantDeath=true
6 generator & checkpoint — fueled/running/gate/saveRestore=true
7 containers & loot persistence — lootGranted/opened/persisted/dropSpawned=true
8 gas mask & radiation — maskOn=true radRate=9.0 filter=88.0 maskOff=true
9 radio cinematic interruption save/load — started/interrupted/restarted/logSpawned=true
10 full mission flow — intro/breaker/log/complete=true finalStep=7
11 graphics settings & shaders — low=61.6/90.1% med=60.6/88.1% high=64.9/91.6% shaders=83
12 death & restart — death=true state=dead restartHp=100 alive=true
13 combat LOS cover — exposedDmg>0 blockedDmg=0 tracerAtWall=true coverAccrued>0 coverAfter=0
14 animation clips — loco/postures/hitAdditive/deathPosTrack/deathFull/mutAttack/humanShoot=true
15 animation transitions sync to AI — loco/aimUp/aimDown/hit/attack/death/clamped/loadSnap=true

Benchmark note: figures are fps / frame-budget share measured with `renderer.info` +
`gl.finish()` in the embedded browser (manual frame drive, 1280×720). They are **not** a
real-hardware gameplay measurement.

## C. Human-input acceptance — INCOMPLETE (owed)

Not performed by the agent. Runbook for the owner (real keyboard/mouse, no debug/god):
1. `node server.js`, open http://localhost:8039, click NEW GAME.
2. Station: walk to Lev's shelter (west wall). Confirm Lev is a clothed rigged figure, breathing
   idle, facing the room; talk to him (E) — dialogue completes.
3. Loot the shelter table/shelves; check inventory (Tab/I) and the note.
4. Tunnel: follow the tracks; confirm work lamps, train interior light, rubble collision.
5. Generator room: fuel the generator (E), breaker on; checkpoint saves.
6. Facility: encounter the mutant — confirm hunched silhouette, claw swipe, death collapse;
   scavenger seeks cover and shoots only with line of sight.
7. K-12 control: console interaction, final transmission, mission complete screen.
8. Death test: stand in the open until killed; restart from checkpoint works.
9. Rifle: pick up, ADS (right mouse), reload (R), recoil; pistol swap (1/2).
10. Gas mask (G) in the rad zone; filter drains; mask off restores.
11. Save/load mid-mission; radio cinematic can be interrupted and resumed.
12. Settings: cycle low/med/high; no shader errors; exit to menu and continue.
Record anything that feels wrong; the automated suites cannot judge feel.

## D. Visual evidence (in-game screenshots, matched cameras)

Before: `screenshots/v5/final_{lev,lev_close,station,tunnel,generator,facility,control,mutant,pistol,rifle}.png`
After:  `screenshots/v6/final_{same names}.png`
Animation evidence (v6 only): `final_lev_walk.png` (mid-stride on the real rig),
`final_lev_death.png` (authored collapse on the real rig).
Console during all runs: no errors; only expected warnings (optional native clips absent for
Lev; deliberate rejection warnings emitted by C4/C5/C7).

## E. Quality gates

| Gate | Status |
|------|--------|
| Real rigged character visible + animated in a game screenshot | MET (Lev, C1/C6 + 4 screenshots) |
| License allows use + redistribution, recorded | MET (CC-BY 4.0, ATTRIBUTION.md, source copy kept) |
| Empty-nativeClips freeze bug fixed + regressions | MET (C3/C4/C7/C8, 15/15) |
| Frightening mutant redesign | MET with disclosure (procedural, not rigged) |
| Coherent Lev shelter rebuild | MET |
| Detailed rifle + hands, contracts preserved | MET |
| Local lighting, no exposure shortcut | MET (exposure 0.92 unchanged) |
| Model validation + two independent instances | MET (C2, grounding/facing measured) |
| Gunfire obstruction + mutant melee preserved | MET (8/8) |
| 15 integration + 12-stage flow kept, tests added | MET (15/15 + 8 new; stage flow = test 10) |
| Matched before/after + animated evidence + metrics | MET |
| Human-input playthrough | **INCOMPLETE** (runbook above) |
| v6.0 ZIP deliverable | MET (METRO-ECHOES-OF-2039-v6.0.zip, no temp artifacts) |