# Camera gameplay update — 1.18

This release applies the [camera research](camera-research.md) to driving in every local and multiplayer mode. It preserves the 1.17.1 prediction/input-timing changes and uses the same rendered car/ball poses. No simulation constants, server hosting resources or PC settings are changed.

## Playing and settings

**C / Y / Triangle** still toggles ball cam, subject to saved bindings. Ball cam tracks the ball automatically, ignores manual look input and keeps a level horizon through car rolls. Close/overhead crossings use bounded view rotation rather than a sudden half-turn.

In **Options → Camera → Ball cam off**, choose:

- **Classic Car Cam** (default): automatically follows the car; right-stick or middle-mouse look returns after release.
- **Free Look — Keeps Direction**: follows the car's position while retaining the viewing direction you choose. Controller and mouse input can change that direction independently of the car's heading. This is optional and does not change the ball-cam input lock.

**V / Right Stick Click (R3)** recentres the view. Both bindings are editable in Controls. Existing custom V/R3 uses are preserved during migration: the new action receives an available keyboard key or becomes unbound on the controller rather than replacing an established control. The camera settings show the actual bindings. Classic remains the default for older saved camera preferences.

The original FOV, distance, height, angle and stiffness controls remain. Four additional saved sliders separate different behaviours:

| Setting | Range | Default | Effect |
| --- | --- | --- | --- |
| Look / swivel speed | 1–10 | 5 | Manual controller look speed |
| Camera switch speed | 0.5–2 | 1.2 | How quickly position and aim blend when switching/recentring |
| Look return speed | 1–10 | 5 | How quickly classic look recentres after release |
| Speed effects | 0–1 | 1 | Strength of speed-based distance, angle and FOV changes; zero disables them |

Restoring Camera Defaults restores these choices without changing controls or career data. Settings remain scrollable on smaller displays and accessible through the existing controller menu navigation. Escape now prevents the browser from immediately cancelling the pause dialog that the same keypress opened.

## Motion and tuning

Stiffness affects following and speed pullback. At maximum stiffness, car cam keeps its follow arm anchored; lower values ease the arm and allow more speed pullback. Controller swivel and return have their own rates. Mode changes blend both camera position and viewing direction from the pose actually visible, including when a player toggles again before the prior blend finishes. Yaw takes the shortest path, and camera roll is not inherited from the chassis.

Reversing changes classic car-cam following direction. Aerial camera pitch uses a small, smoothed contribution from rendered movement rather than blindly copying car pitch/roll. Practice reset, training changes, phase changes, demolitions/respawns, large teleports and reconnect transitions reset transient camera state. Free Look is not accidentally retained through a new kickoff or respawn.

The browser-specific speed tuning is deliberately adjustable. Using smoothed speed fraction `r` and strength `s`, pullback is up to `0.9 × (1 - stiffness) × s × r²` metres; speed FOV adds up to `s × (5 × r² + 2 × supersonicBlend)` degrees. A small stiffness-dependent angle adjustment accompanies pullback. Thus the default 110° base horizontal FOV can grow toward 117° at full speed, while setting Speed Effects to zero retains the chosen base FOV/distance. Aspect conversion remains horizontal-to-vertical for the current viewport.

These values are conservative original tuning informed by the published behaviour, not a claim to have recovered Psyonix's current proprietary curves. Historical Rocket Science coefficients were not copied as verified November 2026 constants. The implementation recreates the documented distinctions and offers controls for feel; exact native parity still needs controlled comparison in Rocket League.

## Obstruction handling

The camera sweeps a small analytic volume from a safe pivot to its desired position. It accounts for pitch boundaries, rounded corners/ramps, goal openings, net roof/back and posts. It can shorten the follow arm when obstructed and ease it outward afterwards. A clear goal-mouth path remains open; a path crossing a wall is blocked even if its endpoint lies inside the net.

This uses the game's calibrated collision dimensions rather than raycasting every stadium triangle each frame. It is an efficient approximation for the adapted Champions Field, not a full arbitrary-mesh camera solver. Spectator and replay framing remain separate from the driving camera.

## Verification

**322 automated tests pass**, including speed effects and their off switch, maximum stiffness, refresh-rate independence at 30–240 Hz, smooth/rapid mode toggles, independent swivel/transition settings, controller/mouse release, persistent Free Look/recentring, roll-independent ball cam, angle wrapping, close-ball crossings, wall/goal/post/roof clearance, reset state, saved-binding migration and Escape handling. The suite retains all driving-timing, ball-response, physics, controller, matchmaking, private-lobby, all-mode secure server and reconnect regressions.

A rendered Chromium check also exercised the actual Options and gameplay flow: legacy camera values survived, controller look returned, Free Look held direction, simulated R3 and keyboard recenter worked, ball cam rejected manual look, driving increased FOV, the speed-effects off switch worked, settings survived reload, and lower camera controls remained reachable at a smaller viewport. Camera settings were tested in a software-rendered cloud browser; this does not measure a player's GPU FPS or physically connected Xbox/PlayStation controller.

Use the [live game](https://flyingcarsforfun.connstors.workers.dev), hard refresh all players, and start a fresh match with **boost-circuit-1.18.0**. Test steady driving, reversing, wall transitions, an overhead ball, rapid toggles and a reset. Saved classic look behaviour and the optional persistent mode should be evaluated separately.
