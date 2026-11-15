# Rocket League camera research

Research date: 15 November 2026. Project inspected: FlyingCarsforfun, commit `9364762aa2c54aee8e002fed647a6fd9305d1ad9` (1.17.1). This is a research and implementation brief; camera code and the deployed game were not changed.

## Camera modes and terminology

Distinguish the classic driving camera, ball tracking, manual look input, the newer Free Look mode, and spectator cameras. Calling all of them “free cam” conceals different control and return behaviour.

| Mode | Purpose | Implication for this project |
| --- | --- | --- |
| Classic car/player cam | Follow the player car with a forward view and manual look controls | Keep automatic following and a temporary controller look override distinct |
| Ball cam | Track the ball as the car moves independently | Camera orientation must not be copied directly from the car's rolling chassis |
| Season 24 Free Look | Allow an independently chosen viewing direction | Treat as a separate optional control style, rather than changing classic car cam silently |
| Spectator/replay cameras | Watch the match from a different viewpoint | Do not equate these with a driver's manual look |

Psyonix's [official ball-cam introduction](https://www.rocketleague.com/news/five-tips-for-taking-your-game-from--potato--to--pro-) explains its field-awareness role. The [Season 24 announcement](https://www.rocketleague.com/news/rocket-league-heads-to-the-streets-in-season-24) and [v2.76 release notes](https://www.rocketleague.com/news/rocket-league-s24-patch-notes-v276) confirm a new Free Look mode for keyboard/mouse and controllers in September 2026, with an optional centre reticle. Older guides describe the classic system and cannot establish every setting of this new mode.

The official notes do not fully specify the new mode's recentering, toggle/hold interaction or every controller override. Those details need direct current-game testing before claiming exact parity. First-hand player reports suggest useful experiments, but are not a calibrated specification.

## Settings: what is documented

Epic's [camera-settings reference](https://www.epicgames.com/help/c-37599050/c-32343914/a14443106?lang=en-US) identifies FOV, height, angle, distance, stiffness, swivel speed, shake and the ball-cam indicator. FOV changes angular coverage; distance changes position. They are separate controls even when both make the car appear smaller.

Psyonix's [v1.37 notes](https://www.rocketleague.com/news/patch-notes-v1-37) explicitly describe a separate transition-speed setting for blending between player cam and ball cam. Swivelling and changing camera mode therefore need separate parameters. The same notes document transparent goalposts/walls, a visibility aid distinct from moving the camera.

Epic's [game-settings tips](https://www.epicgames.com/help/c-182/c-7261959845275/a13334808?lang=en-US) confirm that increasing stiffness reduces speed-related camera pullback. It is not merely an arbitrary position-smoothing slider. Epic also identifies disabling shake as a way to make viewing smoother.

### Historical experimental measurements

[Rocket Science's original camera experiment](https://rocketscience.fyi/know/videos/camera-settings) was published in 2016 and last revised in 2023. It measured speed-dependent FOV expansion, stiffness-dependent distance/angle changes, additional player-cam follow lag, and manual swivel timing. Reported examples include up to five degrees of FOV expansion before an additional supersonic change, and `distance + (1 - stiffness) * 114.7` at supersonic. These are historical measurements, not verified constants for the November 2026 build. Preserve them as experiments to repeat rather than copying their numbers into the browser client as authoritative values.

A [September 2026 Dignitas guide](https://dignitas.gg/articles/the-best-camera-settings-for-rocket-league) also describes separate swivel/transition controls and demonstrates stiffness at speed. Its suggested settings are player preferences, not an internal camera specification or a universal optimum.

## What our camera currently does

These findings come directly from the project's code, rather than the external guides:

| Area | Current implementation | Consequence |
| --- | --- | --- |
| Mode selection | `cameraMode` is a ball-cam boolean | No separate modern Free Look state |
| Ball targeting | Target is the ball position; camera yaw turns toward its horizontal bearing | Vertical aiming exists, but framing is a simple geometric approximation |
| Close/overhead ball | Keep the last yaw inside a 0.85 m horizontal radius | Avoids a yaw singularity; this threshold is our own design |
| Car following | Use the car's horizontal forward vector, with a fixed 4 rad/s heading limit | No measured native velocity/heading blend, reverse-camera rule or aerial pitch response |
| Stiffness | Position/target smoothing rate is `3 + 17 * stiffness` | No speed-based distance or angle response |
| FOV | Convert the selected horizontal FOV to vertical FOV for the viewport | Aspect conversion exists; there is no speed-based FOV response |
| Controller look | Eased offsets, with zero targets on release; ignored in ball cam | Implements the user's requested return and ball-cam input lock |
| Mouse look | Persistent orbit while dragging the middle button in car cam | Mixes a persistent look style with classic car following |
| Mode transitions | Position smoothing shares stiffness; ball-cam target is assigned directly | No independent, adjustable transition blend |
| Camera obstruction | Clamp the camera to rectangular arena bounds | No goal-frame/arena-geometry obstruction solver |
| Rendering | Follow the rendered/interpolated local car and ball | Preserve this path when changing the camera; do not follow raw arriving server snapshots |

Files: [camera controller](../dist/camera.js), [rendering/camera application](../dist/scene.js), [input handling](../dist/input.js), [camera preferences](../dist/preferences.js), and [current camera tests](../tests/camera.test.mjs).

Our current preset is **110° horizontal FOV, 270 cm distance, 100 cm height, -3° angle and 0.45 stiffness**. These are this project's chosen defaults, not a claim about Rocket League's factory defaults. There are currently no saved swivel-speed or transition-speed camera fields.

The user's earlier requirements intentionally lock manual camera input out of ball cam and make controller look return after release. Those preferences should be preserved unless explicitly changed. Researching native controls does not itself authorize replacing them.

## Recommended implementation order

The following is an engineering proposal informed by the sources and code audit, not a claim to have recovered Psyonix's source code.

1. **Separate the state and settings.** Represent classic car following, ball tracking and optional persistent Free Look explicitly. Give controller swivel, return smoothing and mode-transition speed their own parameters. Keep existing bindings and saved preferences compatible.
2. **Blend position and orientation together during mode changes.** Start from the view actually on screen, handle rapid toggling, and preserve the user's locked ball-cam policy. A smooth camera position alone does not prevent an abrupt aim change.
3. **Add measured speed response.** Pass rendered local-car velocity and supersonic state into camera calculation. Tune pullback, pitch and any dynamic FOV separately from the basic follow response. Re-measure current Rocket League before adopting historical coefficients.
4. **Improve framing and obstruction handling.** Test close ball passes, vertical alignment, goals, walls and ceilings. A collision sweep or equivalent geometry check is a proposal for our renderer, not a verified description of Rocket League's implementation. Consider goal-frame transparency as a separate presentation choice.
5. **Validate input and lifecycle behaviour.** Test stick release/deadzones, mouse orbit, camera toggling, kickoff, overtime, demolition/respawn, reconnect and return from menus. Preserve frame-rate-independent rendering and avoid inheriting chassis roll blindly.

Psyonix's [known-issues record](https://www.rocketleague.com/known-issues) specifically records fixes for a Free Look offset surviving into overtime, unintended camera roll when using Look at Ball on a wall, and inconsistent vertical swivel inversion across input devices. These are useful regression cases, not intended native behaviours to reproduce.

## Reference recording plan

Use the same arena, car, aspect ratio and camera settings in the original game and the browser version. Record each mode separately with identical manoeuvres: stationary swivel/release, steady acceleration and braking, reversing, a powerslide turn, an aerial roll, a wall-to-floor transition, a ball passing overhead, and rapid camera toggles. Record reset cases separately. Compare distance, yaw/pitch, framing and settling time across frame rates; keep controller spring return and persistent Free Look in separate trials.

The original camera's complete speed curves, collision rules, framing weights and transition equations were not established by the public sources reviewed here. No original Rocket League executable was run or measured in this workspace. A faithful recreation can be developed from this brief, but exact 1:1 behaviour requires that controlled comparison.
