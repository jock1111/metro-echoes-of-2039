# METRO: ECHOES OF 2039 — Update 6.1 "Gameplay acceptance attempt & release validation"

Update 6.1 continues the existing v6.0 project. No gameplay code or controls were changed: the available browser targets could not be kept visible and foregrounded long enough to validate pointer lock or ordinary movement, so there was no reproducible gameplay defect to fix safely.

## Acceptance attempt (partial; full playthrough NOT verified)

- Started the existing local server at `http://localhost:8039/` (HTTP 200).
- In the in-app browser, clicked the actual **NEW GAME** menu button. The loading screen appeared, then the game reached `playing` at its normal start position `(-4, 0, 2)` with 100 HP and objective “Talk to Lev, the radio operator”.
- Checked `document.pointerLockElement` and `G.input.locked`: both remained empty/false. A real browser-key press and CDP `Input.dispatchKeyEvent` did not move the player.
- The in-app page reported `document.visibilityState === 'hidden'`; its animation clock stopped advancing when automation yielded. `Page.setWebLifecycleState('active')` only made it visible briefly; Chrome returned it to hidden. CDP canvas mouse press/release did not acquire pointer lock.
- Tried a separate Chrome process/profile on CDP port 9222. Its game page was also hidden and unfocused (`hasFocus() === false`, game elapsed time remained near zero). The isolated process exited before a foreground gameplay attempt could be established.
- No teleport, mission/objective mutation, debug-frame stepping, injected input-state mutation, or god mode was used in this acceptance attempt. The legacy `tests/e2e-player-path.js` was not used as acceptance: inspection shows it sets `input.locked`, sets `G.god = true`, feeds look deltas, and advances `G.debug.frame()` directly.

## What changed

- Added this evidence-based report and the reproducible owner runbook in `TEST-RESULTS-6.1.md`.
- Updated README version/status information and package metadata to 6.1.0.
- No gameplay fixes or feedback changes are claimed: normal movement, interactions, combat and mission progression could not be observed in this environment. Do not treat the v6.0 automated simulation results as proof of full-player playability.

## Release status

A v6.1 archive is provided for review, but the primary release gate remains **INCOMPLETE** until the manual, visible-browser playthrough in `TEST-RESULTS-6.1.md` is actually run and recorded. No new gameplay screenshot or hardware-performance measurement was captured in this update.