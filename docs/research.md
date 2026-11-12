# Rocket League research and implementation notes

Research date: 11 November 2026. This is an independent browser game with original implementation and artwork.

## Sources reviewed

- [Psyonix: Five Tips for Taking Your Game from “Potato” to “Pro”](https://www.rocketleague.com/news/five-tips-for-taking-your-game-from--potato--to--pro-): ball cam, deliberate kickoffs, forward dodges, aerial recovery, training and the risks of wall shots informed the controls and mode structure.
- [Psyonix: Play Menu Changes](https://www.rocketleague.com/news/first-look-play-menu-changes-coming-to-rocket-league): reviewed the official menu illustration and the separation of match/offline/training activities. The shipped interface uses its own branding and artwork, with a showroom, mode selector, garage, blue/orange match HUD and clear play action.
- [RLGym: game values](https://rlgym.org/Cheatsheets/game_values/) and [its maintained constants](https://github.com/RLGym/rlgym/blob/main/rlgym/rocket_league/common_values.py): used as community references for field proportions, goal opening, ball/car speed limits, boost consumption, gravity, masses and simulation rate. Browser coordinates use metres with Y up, rather than the reference's centimetres with Z up.
- [RLBot: Useful Game Values](https://wiki.rlbot.org/v5/botmaking/useful-game-values/): reviewed pad placement/refill/recharge, goal depth, rounded wall transitions and bounce information. The game contains 34 pads at documented standard-field positions.
- [RLBot: The Physics of Jumping](https://wiki.rlbot.org/v5/botmaking/jumping-physics/): jump impulse, the brief hold bonus, sticky-force behavior and the second-jump window informed the first-jump/second-jump model.
- [Psyonix: Xbox Title Update 5](https://www.rocketleague.com/news/xbox-title-update-5?lang=fr): reference for the upward-counting overtime display.

These community technical references are measurements and tools maintained by their authors, not a disclosure of Psyonix's proprietary physics source. Their numerical values are a starting point, not proof of identical behavior.

## What was implemented

The custom simulation advances at 120 Hz. Rendering reads its state separately. Position units are metres. Cars have acceleration, braking, speed-dependent yaw, lateral grip/powerslide, jump hold, second jump/dodge, local-axis air rotation, forward boost and fuel consumption. Ground and wall normals guide surface driving across quarter-cylinder fillets. Car-ball contact uses an oriented box, a sphere and a mass-based impulse. Grounded bumper-shot impulses are flattened to make playable low shots; jumping underneath the ball retains full-height pop contacts. Ball motion includes gravity, bounce, drag, rolling and spin. Posts/crossbars use capsule collisions.

Scoring requires the entire ball to cross the opening. Kickoffs, clock-start-on-touch, live-ball zero time, overtime, celebration, reset and results are separate phases. Recorded snapshots provide a visual goal replay without rerunning physics. Bots use the same car controls, approach around the ball to its shooting side, and choose attack/defense roles; they do not teleport the ball or force goals. Kickoff reaction differences and alternating contact order reduce fixed update-order bias.

The visual scene is authored from geometry: two original body silhouettes, wheels/rims, cabin, lights, spoiler, exhausts, a patterned ball, turf texture, goal netting, transparent boundaries, ramps, stepped stands and an instanced crowd. Original UI/cover assets are bundled locally.

## Deliberate approximations and missing systems

The game uses a simple wheel-contact radius for arena contacts and an oriented body box for ball hits. It does not reproduce Bullet/Unreal tyre suspension, all proprietary contact impulses or advanced handling exploits. Ground/wall adhesion and automated wheel-down recovery are forgiving approximations. Bots are deterministic steering agents, not the original game's bots or a learned competitive controller. The standard arena is approximated by an octagon with circular floor fillets; transitions are not an exact copy of a production stadium mesh.

The short replay stores positions/orientations, not a downloadable native replay. Audio is synthesized. Modes are local single-player with bots; there is no online networking, split-screen, accounts, original item economy, workshop support, season/ranked progression or exact training-pack compatibility. Not every original-game mechanic is implemented.

## Verification boundary

Unit/integration checks cover physics math, goals/clock, boost, controls, finite scene geometry, asset resolution and a long-running bot simulation. Browser-control tools were unavailable in the managed environment, so interactive feel, WebGL shading, real gamepads, audio and frame rate remain unverified. That limit is stated in the release instead of presenting automated geometry checks as human playtesting.

## User-supplied Fennec update — 12 November 2026

The supplied Fennec replaces the default car visuals and all bot car visuals. Source: [Fennec by Jako](https://sketchfab.com/3d-models/fennec-rocket-league-car-5b43b50b6eeb4a12a29671df3418f57a), listed as CC Attribution by the Sketchfab API. This model is separate from the original procedural artwork described above. Four wheel meshes were already separate in the supplied FBX; there were no animation actions. The conversion adds stable pivots, forward/up alignment, embedded resized textures and runtime wheel/chassis animation.
