# Camera gameplay update — 1.18 / 1.18.1

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

## 1.18.1 close-ball camera hotfix

Close ball contact exposed two missing protections: the arena solver could retract the camera inside the player's visual model, and a straight position blend could cut across the car during opposite-facing camera transitions. The ball sightline could also run through the body when the car was over or beside the ball. The shared physics hitbox is smaller than several supplied vehicle models, so it cannot determine visual camera clearance.

The follow arm now blends its bearing, elevation and radius along an orbit. Each selected vehicle supplies cached visual bounds, including a small suspension margin, and a minimum arm radius adds near-plane clearance. Short distance settings are extended only as required for safety. If a wall or goal blocks that radius, the camera searches nearby available directions and refines the result against the arena boundary. The fallback pivot also includes the goal-post/crossbar thickness.

Only the local driver's vehicle fades briefly when it blocks a nearby ball. If an impossible trapped pose still places the eye inside the body, that local visual is hidden until the camera clears it. Normal opacity returns when the sightline clears; menus, replays and spectator views restore the vehicle's original material settings. Transparent custom finishes retain their original opacity and depth settings. This changes presentation, not car/ball collisions, handling or multiplayer prediction.

Bounds and material lists are cached when a vehicle is created. Per-frame obstruction checks use an oriented box rather than triangle raycasts. Opaque and faded shader variants warm up during loading to avoid adding a first-contact shader compilation hitch. Ball-cam manual input lock and the level horizon remain in place.

## Verification

**332 automated tests pass**, including the actual Fennec obstructing the ball, flipping/close-range near-plane clearance, opposite-facing transitions at 30–240 Hz, wall/goal/ceiling retraction, all selectable vehicle bounds, local-only fading and transparent-material restoration. They also cover speed effects and their off switch, maximum stiffness, smooth/rapid mode toggles, independent swivel/transition settings, controller/mouse release, persistent Free Look/recentring, roll-independent ball cam, angle wrapping, reset state, saved-binding migration and Escape handling. The suite retains all driving-timing, ball-response, physics, controller, matchmaking, private-lobby, all-mode secure server and reconnect regressions.

A rendered Chromium check also exercised the actual Options and gameplay flow: legacy camera values survived, controller look returned, Free Look held direction, simulated R3 and keyboard recenter worked, ball cam rejected manual look, driving increased FOV, the speed-effects off switch worked, settings survived reload, and lower camera controls remained reachable at a smaller viewport. Camera settings were tested in a software-rendered cloud browser; this does not measure a player's GPU FPS or physically connected Xbox/PlayStation controller.

The hotfix also has a deterministic rendered fixture using the actual stadium, vehicle and ball: car over a nearby ball, directly above the ball, short-distance/tilted contact and normal driving. The fixture is test tooling outside the shipped client; it does not expose a gameplay state editor.

Use the [live game](https://flyingcarsforfun.connstors.workers.dev), hard refresh all players, and start a fresh match with **boost-circuit-1.18.1**. Test steady driving, reversing, wall transitions, a close/overhead ball, rapid toggles and a reset. Saved classic look behaviour and the optional persistent mode should be evaluated separately.
