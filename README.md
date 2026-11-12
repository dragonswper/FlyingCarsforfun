# Boost Circuit — Car Soccer

Complete standalone game source for **FlyingCarsforfun**, including the Champions Field stadium, animated Fennec and Bottled Car, tests, model credits and research.

An original browser-native 3D car-soccer recreation inspired by Rocket League, written from scratch with a custom fixed-step simulation and Three.js rendering.

**Play:** https://boost-circuit-arena.bobistheman2049.chatgpt.site

**Source:** https://github.com/dragonswper/FlyingCarsforfun

**1.7:** Select **Garage → Bottled Car** for the new novelty vehicle, with rolling wheels, front steering, suspension, boost flames and the existing paint finishes. The whole bottle assembly is retained and uses the same collision/handling as the other cars. The optional model loads when selected, or when a private-match opponent uses it; both players prepare their chosen bodies before Ready/Start. Reload both players' pages after this update so game builds match.

The hosted game's Share settings control who can open it. Allow your friend to visit a private Site or choose public access before using that link together; a room code does not grant website access. Both players can also use another static deployment of this source. All rendering runs on each player's GPU; the room host runs the authoritative physics. No game installation or cloud GPU is required. The game has no separate game accounts. Desktop keyboard/mouse or a standard gamepad is required; touch driving is not included.

## Playable modes

- **Duel:** you against one local bot.
- **Doubles:** you and a bot teammate against two bots.
- **Free play:** no match clock, unlimited boost, ball reset and session summary.
- **Training:** five 15-second drills: a straight shot, left/right approaches, an aerial and a save.
- **Private match:** two humans connected by room code; play 1v1, opposing 2v2 teams with a bot each, or two teammates against two bots.

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

The supplied Fennec model (default, including all bot cars), optional procedural Striker GT and Rally RS cars, the supplied Bottled Car novelty body, four paint finishes, the supplied Champions Field stadium architecture, detailed stands, goal nets/frames, boost flames, impact particles, a patterned ball, ground locator, ball/car cameras, scoreboard, boost meter, stats and synthesized audio. Garage options and local career records persist in this browser.

The Fennec model by Jako and Champions Field model by Prabhu Ram / virtualmakes were supplied by the user and adapted under CC BY 4.0. Bottled Car by Urizel is adapted under CC BY-NC 4.0 for noncommercial use. Their artwork is separate from the game code. No original Rocket League audio or accounts are bundled. Ranked matchmaking, original accounts, cosmetic inventories and advanced original-game mechanics such as reliable flip resets/wavedashes are outside this release.

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
| Escape | Pause / open match menu (guest's online menu does not pause the host) |
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

Local modes make no multiplayer requests. Selecting Host or Join uses the public NetplayJS WebSocket service for introductions, its advertised ICE servers for connectivity, and WebRTC data channels for gameplay. See [multiplayer architecture, hosting and verification](docs/multiplayer.md).

The tests cover simulation, geometry, input mappings, static assets and HTTP serving. They do not verify WebGL output, browser layout, physical controller behavior, audio output or GPU performance. See [verification](docs/verification.md).

## Research and credits

See [research notes](docs/research.md) for sources, implementation decisions and differences. The game/interface code and procedural models are original. Fennec and Champions Field are user-supplied third-party artwork adapted under CC BY 4.0; Bottled Car and its garage thumbnail are adapted under CC BY-NC 4.0. See [model credits](docs/model-replacements.md). Three.js 0.170.0 is MIT licensed; its license is in dist/vendor/. Rajdhani by Indian Type Foundry (current UI) and Barlow Condensed by Jeremy Tribby (retained original asset) are SIL OFL licensed; licenses are in dist/assets/fonts/. Cover and procedural-car illustrations are original SVGs. Reference images were reviewed only and are not distributed.

The project was created in a cloud workspace. No software was installed and no settings were changed on the user's PC. Browser local storage is used for optional preferences and career data. No native process, filesystem or shell access is exposed by the game.

## Fennec model update

The default vehicle now uses the supplied Fennec FBX, converted to a self-contained 6.4 MiB GLB. All four wheels have separate rolling pivots; the front pair steer independently using Ackermann-style angles. Wheel rotation follows signed speed and each actual wheel radius, including reversing. Chassis pitch, roll and suspension motion respond to acceleration and steering. Physics orientation still drives jumps, dodges and aerial rolls. Replays record speed/steering for the same animation. Paint variants use separate material instances while geometry/textures are shared safely between cars.

The source FBX had no animation clips; movement is implemented procedurally. See [model preparation and credits](docs/model-replacements.md).

## Champions Field update

The default stadium now uses the uploaded Champions Field architecture, adapted to the game's coordinate system and materials. Its stands, trophies and eight banner textures are retained. The cinematic source's inner pitch and outer shell are replaced with collision-aligned turf, ramps, walls, goals and interactive boost pads. This is an adaptation of the supplied recreation, not an exact port of the official map.

The model uses 105 draw batches instead of 2,751 source parts and occupies 20.0 MiB instead of 36.9 MiB. Quantization is decoded by the bundled Three.js loader without downloading a separate codec. Low graphics hides seat batches. The Fennec steering, rolling wheels and suspension continue to work. See [model preparation and credits](docs/model-replacements.md).

## Smoothness and graphics

Graphics now defaults to **Auto**, which adjusts resolution and seat detail when frame times stay high. It uses an offline simplified Champions Field with about 268,000 triangles, retaining all 105 architecture batches, the banners and stadium silhouette. **Balanced** fixes the normal Auto starting profile; **Low** lowers resolution further; **High** loads the original full-detail stadium and realtime shadows. Existing Low preferences are retained; the previous default High preference migrates to Auto once.

The pitch uses 35 draw submissions instead of 238. All boost pads render in three instanced submissions, and collision/goal particles share one bounded reusable mesh. Fixed-step pose interpolation smooths car, ball and replay motion across display refresh rates. Cars, wheels, physics, gameplay dimensions and saved career records are retained. Shader preparation happens before the lobby opens. Hidden tabs pause matches rather than building up catch-up work.

These are measured reductions in rendering work, not a guaranteed frame-rate increase. All 43 automated checks pass; interactive browser performance remains unverified in this workspace. See [verification](docs/verification.md). Turn on **Settings → Performance display** to see approximate FPS on your device.

## Core mechanics and settings

The 1.4 update cross-checks the supplied RocketSim, RLBot-Beast, rl_ball_sym and RocketGPU repositories against rl.source.gs. It adds a collision-mesh-derived corner outline, offset Octane/Fennec contacts, source jump/boost timing, spin-aware ball friction, shared bounce prediction, proper goal/assist scoring and four bot behavior levels: Rookie, Pro, All-Star and Expert. The boost pickups are now spheres and still use three instanced draws.

Options is organized into Camera, Controls, Interface, Video and Audio. Camera includes **horizontal FOV**, distance/height in centimetres, angle and stiffness. Controls supports keyboard/mouse rebinding with conflict checks, steering/aerial sensitivity, deadzones and pitch inversion. Audio adds master volume. Preferences persist locally, and restoring camera/controls leaves career data intact.

The physics remains an original browser implementation with documented approximations, rather than a claim of bit-identical native simulation. [Read the core source/value audit](docs/core-research.md). Native CUDA, Rust and RLBot installations are not required. All **65 automated tests** pass; interactive browser verification remains unavailable in the managed workspace.

## Menu and HUD update — 1.5

The interface now follows the classic Rocket League field-front menus: left-side slanted navigation, a bottom player banner, blue glass Options tabs, a compact blue/orange score clock, a segmented amber boost dial, red ball-cam indicator, gold kickoff/goal messages, player nameplates and a scorer banner in replays. Exhibition and Training have separate selections. Garage customization keeps the live Fennec visible; all previous car, paint, camera, control, difficulty and graphics choices remain available.

**Options → Interface** controls HUD size (70–120%), nameplates and the optional speed display. Keyboard hints follow saved bindings. The scoreboard groups teams and displays score, goals, assists and saves. Menus support click, keyboard focus, arrow navigation and Escape to go back. Gameplay supports the existing standard gamepad mapping.

The requested Game UI Database page was blocked by robots/HTTP 403 in the workspace. Public Rocket League screenshots from Interface In Game were inspected instead; [the reference notes](docs/ui-references.md) identify the exact images and visual limits. This is a close visual recreation with the game's own branding and implemented local features, not verified pixel parity. Pass, shop, online/social and unrelated screens are omitted.

The UI uses local HTML/CSS/SVG and 57 KB of subset Rajdhani fonts, with no screenshot backgrounds, remote font requests or added WebGL draw calls for the HUD. Nameplate elements are pooled and follow interpolated car positions. The simulation and optimized stadium assets are retained. **70 automated tests pass**; actual browser layout, GPU performance, audio and hardware-controller testing remain unverified in this managed workspace.

## Private multiplayer — 1.6

1. Choose **Private Match → Host Match**, select the mode/length and send the eight-character code to your friend.
2. Your friend opens the game, chooses **Private Match**, enters the code and selects **Join Match → Ready**.
3. The host selects **Start Match**. The host also controls restarts and rematches.

Both players use their own GPU, camera settings, controls, car selection and paint. The guest sees its own boost, speed, stats and camera. Doubles supports opposing human teams or a human team against bots. A room supports **two humans**. The host can pause both players; a guest's menu only releases that guest's controls. Keep the host tab visible while playing. Leaving or losing the host ends the room; create a new code to reconnect.

The implementation adapts [NetplayJS](https://github.com/rameshvarun/netplayjs)'s signaling protocol and authoritative-state ideas. [Multicore](https://github.com/trevorhoner/Multicore) currently provides planning documents rather than working networking code; its version-compatibility guidance informed the handshake. This does not import Multicore's AGPL code. NetplayJS's ISC notice is included. The original network implementation keeps the game buildless.

The host simulates both humans and all bots at 120 Hz. Guests send bounded control frames and receive authoritative snapshots at up to 30 Hz. Guest-car prediction replays unacknowledged inputs; remote poses interpolate through a short buffer. Controls and match events use different WebRTC channel delivery rules so stale motion updates can be dropped. Held controls reset after a 300 ms input gap. Room codes use 40 random bits, expire after ten unused minutes, and connect one guest. Game builds must match.

**86 automated tests pass.** A separate real WebRTC check with two Node peers also exercises the public signaling service, readiness, guest driving, snapshots, pause/resume, final stats, rematches and disconnect cleanup. A repeated live run found an early-channel handshake race, which is fixed and covered by a regression test. Browser interaction and separate-home-network/NAT traversal remain unverified. The shared service and its ICE/TURN availability are external dependencies; self-hosting instructions and exact limits are in [the multiplayer notes](docs/multiplayer.md).
