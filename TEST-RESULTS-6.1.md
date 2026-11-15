# TEST RESULTS — Update 6.1: real-input acceptance attempt

## Status summary

**Full normal-player playthrough: NOT VERIFIED.** Startup and clicking NEW GAME were observed; pointer lock did not engage in the available browser environment. Consequently movement, mouse look, Lev interaction, combat, pickups, generator, security gate, control room, mission completion, Lev in-game animation, and save/load animation continuation were not tested in this run. No result is inferred for them.

## Observed this run

- Existing `node server.js` endpoint: `http://localhost:8039/` returned HTTP 200.
- In-app browser snapshot before launch showed the real menu and **NEW GAME** button.
- Clicked that button using browser UI automation. Loading (“DESCENDING”) appeared; after load, the game was `playing`, at `[-4, 0, 2]`, HP 100, mission step 0, objective “Talk to Lev, the radio operator”, inventory fuel 0 / pistol ammo 24. This verifies menu launch only.
- `document.pointerLockElement === null`, `G.input.locked === false`. The page reported `document.visibilityState === 'hidden'`; browser press-key and CDP `Input.dispatchKeyEvent` produced no player displacement. The game elapsed clock did not advance while hidden.
- A CDP `Input.dispatchMouseEvent` press/release at the game canvas did not acquire pointer lock. A final reload/click attempt began in hidden `boot` with the menu button rectangle present and ended in hidden `menu`; because the browser never rendered a trusted visible button click there, this attempt is inconclusive about pointer-lock behavior on a real visible click. `Page.setWebLifecycleState('active')` briefly reported visible, but after yielding to the host the page was hidden again and RAF/game time stopped.
- A separate Chrome launch was attempted. Its `localhost:8039` page reported hidden and unfocused, and its elapsed time remained near zero. The process exited before it could be used for a foreground test.
- Screenshot capture returned `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE` because the in-app browser had no visible surface. **No new gameplay screenshot was produced.**
- The only console item observed on the page was the existing warning that optional native Lev clips (aim/reload/duck/talk/shoot/hit) are unavailable. This is not a newly reproduced animation defect.

## Acceptance gates

| Action | Result | Evidence / reason |
|---|---|---|
| Serve and open game | PASS | HTTP 200; game page loaded |
| Click NEW GAME | PASS | Loading screen then normal playing state/objective/start position |
| Acquire pointer lock | BLOCKED | `pointerLockElement=null`, `G.input.locked=false`; hidden/unfocused page; trusted CDP canvas click did not engage it |
| Walk / look around | NOT TESTED | Held-key events did not move the player; page RAF suspended while hidden |
| Talk to Lev | NOT TESTED | Requires working pointer lock/movement and targeting |
| Equip/fire weapons; fight without invincibility | NOT TESTED | No active normal-input gameplay session |
| Collect supplies | NOT TESTED | No active normal-input gameplay session |
| Fuel/start generator | NOT TESTED | No active normal-input gameplay session |
| Open security gate | NOT TESTED | No active normal-input gameplay session |
| Reach radio room and complete mission | NOT TESTED | No active normal-input gameplay session |
| Inspect Lev animation during play/save-load | NOT TESTED | No visible gameplay frames or normal save/load session |
| Actual FPS/frame-time/memory/GPU | NOT MEASURED | Hidden-page benchmark is not a valid replacement for a visible hardware run |

## Important test classification

The v6.0 report’s 31/31 automated results are historical and were not rerun for this update. They are automated regressions/simulation, not evidence of normal-player completion. In particular, `tests/e2e-player-path.js` is not an eligible normal-control acceptance run: it directly changes pointer-lock state, enables god mode, feeds mouse-look deltas to the game input object, uses debug frame stepping, and skips parts of the ordinary visible interaction path. It was inspected but not executed here.

No gameplay code was changed because this attempt did not reproduce a gameplay defect independent of the hidden/unfocused browser limitation. Pointer-lock reliability in a user-visible browser remains an open question, not a passed gate.

## Reproducible manual full-playthrough procedure

Run this with a visible Chrome/Edge window and a real foreground mouse/keyboard. Keep god/debug tools off. Record the browser console and a continuous screen recording or dated screenshots at each numbered gate; if input fails, note the exact step and visible state.

1. From the project folder run `node server.js`; open `http://localhost:8039/` in a normal visible browser window.
2. Click **NEW GAME**. If the pointer is not captured after the load screen, click once inside the game canvas. Confirm the pointer is hidden/captured; press Esc once and confirm the pause menu, then **RESUME** and re-capture if prompted.
3. Hold W and move the mouse. Confirm the player moves and view turns; release keys and confirm movement stops. Record HP, ammo and the objective.
4. Walk to the west-side radio table/shelter and aim at Lev. Confirm the “Talk to Lev” prompt; press E through all dialogue. Confirm objective advances and the north gate unlocks. Observe idle while standing and moving limbs/head; do not use a screenshot pose/debug tool.
5. Loot visible shelter/checkpoint supplies using on-screen prompts; open/close inventory with Tab and verify item counts. Read/close a note with its displayed prompt.
6. Open the north/station gate using E and traverse the tunnel along the visible path. Verify rubble collision, lamp visibility and enemy reactions. Fight only with normal weapon/ammo/health; record any stuck enemy or blocked route.
7. At the checkpoint, find and collect the diesel can using its prompt. Verify the pickup toast/inventory count and note whether interaction selects the intended object.
8. Go to the generator room on the east side. At the generator, press E once to pour fuel and again to start it. Verify the prompt/hint, generator sound/light and security gate opening.
9. Traverse the facility toward K-12. Observe hit reactions, damage feedback, enemy line of sight and collision. Do not enable invincibility or skip encounters. If killed, use the normal checkpoint restart and record the result.
10. Reach relay room K-12. Open the control-room door through its prompt, interact with the main breaker, then activate the radio console. Let the transmission finish normally.
11. Find and read the operator’s log on the console. Confirm the mission-complete screen appears. Record total time, deaths, remaining HP/ammo and any inaccessible item/objective.
12. Before ending, test a normal checkpoint save/reload from the pause menu and verify Lev/NPC animation resumes if visible at the saved location. Capture the final screen and console errors.

## Delivery contents and limitations

`METRO-ECHOES-OF-2039-v6.1.zip` contains the current playable project, required local assets/vendor, scripts, tests, v5/v6 visual baselines, and the v6.1 status documents. Existing screenshots are visual-review evidence from earlier work, **not** screenshots from a v6.1 playthrough. The full-playthrough gate and actual-hardware performance gate remain open pending the manual run above.