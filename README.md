# Boost Circuit — Car Soccer

An original browser-native 3D car-soccer recreation inspired by Rocket League, written from scratch with a custom fixed-step simulation and Three.js rendering.

**Play:** https://boost-circuit-arena.bobistheman2049.chatgpt.site

**Source:** https://github.com/dragonswper/fortnite_broswer/tree/main/games/boost-circuit

The Sites link is owner-private. All rendering and physics run on the player's device. No game installation, cloud GPU, account or executable is required. Desktop keyboard/mouse or a standard gamepad is required; touch driving is not included.

## Playable modes

- **Duel:** you against one local bot.
- **Doubles:** you and a bot teammate against two bots.
- **Free play:** no match clock, unlimited boost, ball reset and session summary.
- **Training:** five 15-second drills: a straight shot, left/right approaches, an aerial and a save.

Matches can last two or five minutes. Kickoffs have a three-second countdown; the match clock starts on the first ball touch. At zero, a live ball remains playable until it touches down. A tied match goes to sudden-death overtime. Goals show a short recorded-position replay that can be skipped.

## Driving and physics

- Throttle, reverse, braking, speed-sensitive steering and powersliding.
- Boost with limited fuel in matches; 28 small pads (+12, four-second recharge) and six full pads (ten-second recharge).
- Hold-sensitive jumping, double jump, directional dodge, air pitch/yaw/roll and boosted aerials.
- Rounded floor/wall transitions, wall driving, ceiling collision and wheel-down recovery.
- Ball gravity, bounce, drag, spin, oriented car hitboxes and collision impulses.
- Opponent bumps, supersonic demolitions and three-second respawns.
- A physics loop at 120 Hz, independent of rendering, with bounded catch-up under heavy rendering load.

Arena scale, some constants and jump behavior follow public community measurements. Handling, tyre contacts, wall adhesion, contact impulses and bots are original approximations. This is not a binary-compatible port or a claim of exact Rocket League physics.

## Presentation

The supplied Fennec model (default, including all bot cars), optional procedural Striker GT and Rally RS cars, four paint finishes, a night stadium, instanced crowd, goal nets/frames, boost flames, impact particles, a patterned ball, ground locator, ball/car cameras, scoreboard, boost meter, stats and synthesized audio. Garage options and local career records persist in this browser.

The Fennec model was supplied by the user and is credited to Jako under CC BY 4.0. Its source artwork is separate from the MIT-licensed game code. No original Rocket League audio or accounts are bundled. Online multiplayer, ranked matchmaking, original accounts, cosmetics and advanced original-game mechanics such as reliable flip resets/wavedashes are outside this release.

## Controls

| Keyboard/mouse | Action |
| --- | --- |
| W / S | Throttle, brake, reverse; pitch down/up in air |
| A / D | Steering; yaw in air |
| Shift or left mouse | Boost |
| Space or right mouse | Jump; hold for a higher jump |
| Second jump + direction | Directional dodge |
| Ctrl | Powerslide |
| Q / E | Air roll |
| C | Ball/car camera |
| Tab | Match stats |
| R / T | Practice reset / next drill |
| Escape | Pause |
| Enter | Skip goal replay |

Standard controller: RT/LT drive, left stick steer/pitch, A jump, B boost, X powerslide, Y camera, LB/RB air roll, Start pause, View scoreboard, D-pad up reset, D-pad down next shot. Controller layouts can vary by browser/hardware and remain unverified interactively.

## Run and verify from source

Playing the hosted game requires no installation. If Node.js 22+ is already available and you choose to run the source:

```sh
node scripts/serve.mjs
# http://127.0.0.1:4173
npm run check
npm test
```

No npm install or build is needed. `dist/` includes its rendering library, font and illustrations and makes no CDN requests. Serve over HTTP/HTTPS rather than opening a file:// URL. The optional development server binds only to 127.0.0.1. On a static host, publish the contents of dist/.

The tests cover simulation, geometry, input mappings, static assets and HTTP serving. They do not verify WebGL output, browser layout, physical controller behavior, audio output or GPU performance. See [verification](docs/verification.md).

## Research and credits

See [research notes](docs/research.md) for sources, implementation decisions and differences. The game/interface code and procedural models are original. The Fennec is user-supplied third-party artwork, adapted under CC BY 4.0; see [model credits](docs/model-replacements.md). Three.js 0.170.0 is MIT licensed; its license is in dist/vendor/. Barlow Condensed by Jeremy Tribby is SIL OFL licensed; its license is in dist/assets/fonts/. Cover and garage illustrations are original SVGs. Reference images were reviewed only and are not distributed.

The project was created in a cloud workspace. No software was installed and no settings were changed on the user's PC. Browser local storage is used for optional preferences and career data. No native process, filesystem or shell access is exposed by the game.

## Fennec model update

The default vehicle now uses the supplied Fennec FBX, converted to a self-contained 6.4 MiB GLB. All four wheels have separate rolling pivots; the front pair steer independently using Ackermann-style angles. Wheel rotation follows signed speed and each actual wheel radius, including reversing. Chassis pitch, roll and suspension motion respond to acceleration and steering. Physics orientation still drives jumps, dodges and aerial rolls. Replays record speed/steering for the same animation. Paint variants use separate material instances while geometry/textures are shared safely between cars.

The source FBX had no animation clips; movement is implemented procedurally. See [model preparation and credits](docs/model-replacements.md).
