# Core mechanics and settings update

This release uses the supplied repositories as references for a browser-native implementation. It does not bundle a C++/CUDA engine, install a native bot framework, or claim bit-identical Rocket League simulation. All bot levels use the same vehicle and ball physics as the player.

## Reviewed sources

| Source | Inspected revision | Applied here |
| --- | --- | --- |
| [RocketSim](https://github.com/ZealanL/RocketSim) | `c2baacb8f4b441dd8505e63c2aeb5a1679b60b02` | Constants, jump/boost timing, speed limits, hit impulses, spawn layouts and boost triggers |
| [RLBot-Beast](https://github.com/NicEastvillage/RLBot-Beast) | `bc22b3cc672af11696113d25094a4dd514424d37` | Utility priorities, defending, interception, aiming behind the ball, recovery and boost-routing ideas |
| [rl_ball_sym](https://github.com/VirxEC/rl_ball_sym) | `b2fbb79bd401d9323d59d5516cf7f229050f1ee9` | Ball drag/spin/friction model and the standard corner mesh's horizontal wall profile |
| [RocketGPU](https://github.com/thecosmicskye/RocketGPU) | `791c203db7cc9cf2888f292fcd7f0ab3c233bdf5` | Cross-checks for contacts, source steering curves, arena planes and prediction-friendly simulation structure |
| [rl.source.gs physics](https://rl.source.gs/physics/) and [Fennec](https://rl.source.gs/items/bodies/fennec/) | Build `26349479`, extracted 6 November 2026 | Raw game-file figures, Fennec/Octane dimensions and offsets |
| [rl.source.gs points](https://rl.source.gs/points/), [arenas](https://rl.source.gs/arenas/), [mutators](https://rl.source.gs/mutators/), [bots](https://rl.source.gs/bots/) and [about](https://rl.source.gs/about/) | Same build | Scoring, catalogue scope and distinctions between configuration, cosmetics and behavior |
| [RLGym constants](https://github.com/RLGym/rlgym/blob/main/rlgym/rocket_league/common_values.py) | Reviewed 12 November 2026 | Additional checks for goal dimensions, scoring threshold, pad coordinates and units |

The four supplied repositories are MIT-licensed; their notices are retained in `dist/vendor/references/`. The website is a reference database, not a 3D asset pack or an AI implementation. Its bot catalogue describes names/loadouts; the new AI is original code. Its about page states that it does not supply arena collision sizes/pad locations or audio. We used attributed figures and links, not a wholesale republished item database or an unlicensed artwork pack.

A useful imported asset is the MIT `rl_ball_sym` standard-corner collision mesh. The 21 horizontal cross-section vertices at a height of 512 source units are converted to metres in `dist/field-profile.js`; endpoints are clipped to the side/back planes. This retains the straight diagonal section and its rounded joins. Collision planes and the rendered pitch use the same profile. Generic corner-radius constants were not substituted for the mesh.

## Numeric audit

The client uses metres and seconds, with +Y up and +Z toward the orange goal. Source position units are centimetres. Native mass constants retain the 180:30 ratio. Raw force/torque fields are not assumed to be SI values; conversions below include the appropriate mass and source-unit factors.

| Quantity | Source figure / expression | Runtime selection |
| --- | --- | --- |
| Side/back planes | 4096 / 5120 units | 40.96 / 51.2 m |
| Ceiling plane | Native simulators: 2048 units | 20.48 m |
| Floor ramp | 256 units | 2.56 m; analytic transition |
| Goal half-width / height | 892.755 / 642.775 units | 8.92755 / 6.42775 m |
| Goal scoring centre threshold | 5124.25 + 91.25 units | 52.155 m |
| Ball collision / visual / rest height | 91.25 / 95 / 93.15 units | 0.9125 / 0.95 / 0.9315 m |
| Gravity | 650 units/s² | 6.5 m/s² downward |
| Car / ball maximum speed | 2300 / 6000 units/s | 23 / 60 m/s |
| Car / ball angular cap | 5.5 / 6 radians/s | 5.5 / 6 radians/s |
| Mass constants | Car 180; ball 30 | Same ratio in contact impulses |
| Ground boost acceleration | 178500 ÷ 180 ÷ 100 | 9.916666… m/s² |
| Air boost contribution | RocketSim: (3175 ÷ 3) ÷ 100 | 10.583333… m/s²; separate air throttle |
| Fuel use / starting fuel | RocketSim: 100 ÷ 3 | 33⅓ units/s; 33⅓ starting units |
| Minimum boost duration | 0.1 seconds | 0.1 seconds |
| Jump impulse velocity | 52500 ÷ 180 ÷ 100 | 2.916666… m/s |
| Held jump acceleration | 262500 ÷ 180 ÷ 100 | 14.583333… m/s² |
| Jump hold / minimum hold | 0.2 / 0.025 seconds | Same; initial acceleration scale 0.62 |
| Second-jump window | 1.25 seconds after jump hold ends | Same |
| Fennec hitbox family | Octane | Shared analytic Octane collider |
| Published raw box L/W/H | 118.01 / 84.2 / 36.16 units | 1.1801 / 0.842 / 0.3616 m |
| Box forward / upward offset | 13.88 / 20.75 units | 0.1388 / 0.2075 m |
| Vehicle origin resting height | RocketSim: 17 units | 0.17 m; visual adapter preserves wheel contact |
| Small / large pickup | 12 / 100 fuel; 4 / 10 s cooldown | Same |
| Pickup cylinder radius | 144 / 208 units | 1.44 / 2.08 m |
| Pickup centre height | 70 / 73 units | 0.70 / 0.73 m; decorative spheres rendered separately |
| Pickup height tolerance | 95 units | 0.95 m |
| Supersonic hysteresis | 2200 on; 2100 maintain; 1 s grace | 22 / 21 m/s; 1 second |
| Demolition respawn | 3 seconds | 3 seconds |
| Goal / assist / save points | 100 / 50 / 50 | Same for implemented awards |
| Assist window | 5 seconds | 5 seconds |

Important source differences are explicit. RLGym's older ceiling helper lists 2044, while the supplied native simulators construct their ceiling plane at 2048; this implementation selects 2048. The website displays fuel rates rounded to `0.333`, whereas RocketSim uses `1/3`; the latter is used so a full tank lasts three seconds. RocketSim's Bullet box dimensions differ from the published raw hitbox sizes. We use the raw box for our analytic solver rather than silently mixing Bullet margins into it. The imported art retains its authored proportions and is not used as the collision shape.

## Resulting behavior

- Ball prediction advances a copy with the same ball step as live play, including bounces, spin transfer and drag. All bots share a cached path. Contact invalidation respects a minimum refresh interval, rather than rebuilding a path for every car every tick.
- Car-ball contact uses the offset oriented box, mass/inertia response and a relative-speed extra-hit curve. The 0.35 vertical and 0.65 forward direction factors are based on RocketSim's game-hit adjustment.
- Jump hold cannot restart after release. Directional dodges use aerial directional input/deadzone, so holding the controller throttle alone produces a vertical second jump. Air rotation and ball spin use their source caps.
- Supersonic state has hysteresis. Demolitions require actual box overlap, closing contact and a forward impact cone. Simple touches and demolitions no longer receive invented score bonuses; goals/assists use their reference points.
- Rookie, Pro, All-Star and Expert differ in reaction, planning cadence, aiming error, look-ahead and maneuvers. Priorities include saves, clears, getting behind the ball, teammate coverage, boost collection and recovery. These are behavior tiers, not claims of equivalent ranked skill or imported learned policies.
- Settings provide horizontal FOV, distance, height, angle, stiffness, keyboard/mouse rebinding, sensitivity, controller/dodge deadzones, pitch inversion, audio volume and existing graphics controls. Values are normalized and saved in browser storage; camera/control resets do not erase career records.
- Boost pickups are actual sphere meshes. Their three instanced draw submissions and separate gameplay triggers are retained.

## Deliberate approximations and verification

This is an analytic JavaScript solver, not Bullet/Unreal. The wall profile is faithful to the imported horizontal section, but floor/ceiling transitions, suspension, friction constraints, collision ordering and some flip/recovery behavior remain approximations. Wheel-down contact damping, lateral-grip tuning and the bot profiles are design parameters, not extracted official values. The original optional car bodies share the same collider for fair local play.

Automated checks verify numeric conversions, jump/boost timing, box offsets, rounded boundaries, trajectory consistency, scores, four bot levels, shared prediction, stable long matches, FOV conversion, rebinding and settings structure. They do not establish bit-level parity or competitive bot rank. Managed browser tooling is unavailable, so interactive settings, real controllers/audio, rendered pixels and device FPS remain unverified. No native program or PC setting is required or changed.
