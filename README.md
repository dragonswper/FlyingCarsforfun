# Boost Circuit — Car Soccer

Standalone browser game and optional dedicated-server source for **FlyingCarsforfun**, including Champions Field, 15 selectable vehicles, the supplied Rocket League ball, tests, model credits and research.

An original browser-native 3D car-soccer recreation inspired by Rocket League, written from scratch with a custom fixed-step simulation and Three.js rendering.

**Play:** https://flyingcarsforfun.connstors.workers.dev

The live Cloudflare game includes the dedicated server. Choose **Online Match → Dedicated Server**, the same mode and **Oceania** on both PCs. [Live verification and connection steps](docs/live-server.md).

**Source:** https://github.com/dragonswper/FlyingCarsforfun

**Browser authentication fix:** The client now calls native browser fetch with its correct receiver. This fixes “Could not authenticate with the secure server” before a search can begin. Refresh the game after deployment. A Chromium regression check reproduces the old failure and verifies the fix; all **280 automated tests pass**.

**No-card hosting:** [Deploy using a free Cloudflare account](docs/cloudflare-free.md). The Worker serves the game and the authoritative server together, requests Oceania placement and uses the same tested gameplay/networking code. No paid database, R2 bucket, domain or PC installation is required. Render may request billing verification even on its Free plan; do not add payment details to work around it.

**1.15:** Thresholded client reconciliation compares matching acknowledged input states. The dedicated server simulates acknowledged inputs at 120 Hz, supports every game mode, server matchmaking, 60-second bot fill, authenticated guest reconnects and HTTPS/WSS. **Optional Render route, if your account permits no-card deployment:** [deploy one Free Singapore server](https://render.com/deploy?repo=https://github.com/dragonswper/FlyingCarsforfun) using the included Blueprint; no payment method, paid database or GPU is required. The free service has sleep/CPU/bandwidth limits and cannot guarantee 100 ms in Australia. [Free hosting and two-PC instructions](docs/dedicated-server.md) · [Implementation/testing](docs/online-server.md) · [Git workflow](docs/git-workflow.md). All **280 automated tests pass**, including real HTTPS/WSS sessions on Node and Cloudflare’s local workerd runtime. All clients and the server must reload matching source. The older ChatGPT-hosted Site remains on its previous published build while its source access is blocked; use the Cloudflare Play link above for the updated client and server.

**1.14:** Guest movement replays the full 600 ms acknowledgement window, separates world extrapolation from input replay and smooths corrections without delaying new input. Custom BC2 join no longer crashes before room options arrive. Short front/back/side flips can finish through light ground scrapes, and collision impulses are followed by floor projection. **Private Match → Custom Lobby → Dedicated Server** adds an optional independent 120 Hz Node server; all players connect as clients using full BCS invites. [Movement/lobby details](docs/smooth-play.md) · [Server setup](docs/dedicated-server.md). All **246 automated tests pass**, plus real WebRTC checks. Reload every player and use matching server source.

**1.13:** Online matches use **Warn and connect** by default so high ping does not repeatedly reject casual opponents. **Enforce Ping Limit** still honors either player's strict preference. Connections try a direct route before the shared relay, with a full direct window after signaling completes; the ping check warms up and uses seven spaced gameplay-channel samples instead of the slowest of three startup probes. **Options → Network → Connection Details** separates game response from native network ping and shows direct/relayed routing when available. Both Australian players can select **Oceania** to share a regional queue; this does not move a relay or guarantee 100 ms. [Routing, settings and verification](docs/ping-and-routing.md). All **224 automated tests pass**, plus actual direct/restart and four-client WebRTC checks. Reload all clients for this network build.

**1.12:** Use **Edit Name** on your profile bar or pause menu to save a custom username on this browser/device. **Chat** is visible in the match HUD, pause menu, lobbies and results; **Enter / Y** opens text chat during play (**Enter** still skips goal replays). Everyone in the current room, including spectators, shares the newest **five messages**. A sixth removes the oldest; the entire feed clears **five minutes after the first message**, without extending the deadline for new messages. Late joiners and reconnecting players receive the current feed. [Details and verification](docs/chat-and-profile.md). All **203 automated tests pass**, plus a real four-client WebRTC check. Reload every player's page for the new network build.

**1.11:** **Private Match → Custom Lobby** supports 2–8 people, selectable teams/spectators (including the host) and 1–30 minute matches. Controller menus, an on-screen keyboard and saved button/axis bindings are included. Names save locally; text/quick chat is editable. Garage adds seven supplied novelty vehicles, and the supplied stadium’s inner field/goals replace the generated geometry while keeping boost pads. [Release details, controls and limits](docs/community-update.md). All **193 automated tests pass**, plus an actual four-client WebRTC session.

**1.10:** Guest controls recover after long input gaps and predict ball/vehicle contacts immediately. Brief drops hold the same match for a **20-second reconnect window**. Either player can request a rematch or choose **Find Next Match**. Online Match and **Options → Network** save region/ping preferences; the HUD warns about high ping, update loss and stalled connections. Mouse chord release, controller steering/look return and pitch flip cancellation are fixed. [Details and verification](docs/network-recovery.md). Both players must reload for this build.

**1.9:** Choose **Online Match** to search for a real opponent for up to **60 seconds**. A connected opponent starts a five-minute casual 1v1 automatically after both vehicles load; an empty search starts a clearly labeled local bot match using your selected bot difficulty. Cancel or Escape leaves the queue. Keep the tab visible while searching. Both players must reload for the matching game build. Private room codes remain available.

**1.8.1:** Press **Jump (default Spacebar / controller A)** while resting upside down to hop and flip back onto your wheels. One press is enough. Normal jumps and aerial dodges keep their existing controls. Both players should reload before joining a room.

**1.8:** Wall contacts remain attached through the ramp, and roof/bumper scrapes absorb spin instead of forcing a sudden upright landing. Ball cam tracks the ball with a level horizon; turn it off to orbit using middle-mouse drag or the controller right stick. **Garage** now also offers **Octane, cHe, Cyberpunk Bike and C-17 Globemaster**. The supplied 3D Rocket League ball replaces the procedural ball. Optional vehicle models load on selection or private-opponent preparation; Ready/Start waits for both appearances. **Reload both players' pages** after this update so physics builds match. All **114 automated tests pass**; browser rendering and device FPS remain unverified.

Use **Share** to control who can open the hosted game. For private access, invite friends before using the link together; a room code does not grant website access. Both players can also use another static deployment of this source. All rendering runs on each player's GPU; browser-hosted rooms run physics on their host, while dedicated matches run it on the independent server. No game installation or cloud GPU is required. The game has no separate game accounts. Desktop keyboard/mouse or a standard gamepad is required; touch driving is not included.

## Playable modes

- **Online match:** browser-hosted casual 1v1, or dedicated-server 1v1/2v2. Server queues fill missing seats with server bots after 60 seconds. The dedicated option also starts free play, training and custom sessions.
- **Duel:** you against one local bot.
- **Doubles:** you and a bot teammate against two bots.
- **Free play:** no match clock, unlimited boost, ball reset and session summary.
- **Training:** five 15-second drills: a straight shot, left/right approaches, an aerial and a save.
- **Custom private lobby:** 2–8 people, up to four per team, spectators and host-selected 1–30 minute length. Choose roles/teams before start; active-match arrivals spectate until the next match.
- **Private match:** two humans connected by room code; play 1v1, opposing 2v2 teams with a bot each, or two teammates against two bots.

Exhibition and legacy private matches can last two or five minutes; custom lobbies support one to thirty minutes. Kickoffs have a three-second countdown; the match clock starts on the first ball touch. At zero, a live ball remains playable until it touches down. A tied match goes to sudden-death overtime. Goals show a short recorded-position replay that can be skipped.

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

The garage includes Fennec (default, including bots), Octane, Striker GT, Rally RS, Bottled Car, cHe, Cyberpunk Bike, C-17 Globemaster, Randy Marsh, Ridiculous Vehicle, Viking Battle Vehicle, Sci-fi Three-Wheeler, Wooden Golf Cart, Autorickshaw and Infantry Fighting Vehicle. Vehicles have rolling wheels, front steering and boost flames. Paintable bodies support four finishes; supplied novelty bodies retain their artwork. The presentation includes Champions Field, goal nets/frames, particles, the supplied Rocket League ball, a ground locator, ball/free cameras, scoreboard, boost meter, stats and synthesized audio. Garage options and local career records persist in this browser. All bodies use the same game hitbox and handling; the bike and plane are novelty choices.

The supplied Fennec/Octane, Champions Field and C-17 artwork is adapted under CC BY 4.0. Bottled Car and Cyberpunk Bike use CC BY-NC 4.0; cHe uses CC BY-NC-SA 4.0. The ball, Randy, Ridiculous and Viking archives did not identify usable creator/license notices. The new sci-fi vehicle, golf cart and IFV identify CC BY 4.0; the rickshaw identifies Sketchfab Standard. Their separate terms remain in their import records. Their artwork is separate from the MIT game code; [model credits](docs/model-replacements.md) identify sources and modifications. No original Rocket League audio or accounts are bundled. Ranked matchmaking, original accounts, cosmetic inventories and advanced original-game mechanics such as reliable flip resets/wavedashes are outside this release.

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
| C | Toggle ball/free camera |
| Middle-mouse drag / controller right stick | Orbit in free camera only |
| Tab | Match stats |
| R / T | Practice reset / next drill |
| Escape | Pause / open match menu (guest's online menu does not pause the host) |
| Enter | Skip goal replay |
| Enter or Y / G | Text chat / quick chat (Y and G are editable bindings; Enter skips goal replays) |

Standard controller: RT/LT drive, left stick steer/pitch, A jump, B boost, X powerslide, Y camera, LB/RB air roll, Start pause, View scoreboard, D-pad up reset, D-pad down next shot. PlayStation uses the corresponding Cross/Circle/Square/Triangle and L1/R1/L2/R2 buttons under standard browser mapping. Options → Controls rebinds buttons/axes. D-pad left/right opens quick/text chat. Menus use A/Cross to select, B/Circle to return and D-pad/left stick to navigate; text fields offer an on-screen keyboard. Physical hardware/browser mapping remains unverified interactively.

## Run and verify from source

Playing the hosted game requires no installation. If Node.js 22+ is already available and you choose to run the source:

```sh
node scripts/serve.mjs
# http://127.0.0.1:4173
npm run check
npm test
```

No npm install or build is needed. `dist/` includes its rendering library, font and illustrations and makes no CDN requests. Serve over HTTP/HTTPS rather than opening a file:// URL. The optional development server binds only to 127.0.0.1. On a static host, publish the contents of dist/.

Local modes make no multiplayer requests. Selecting Online Match, Host or Join uses the public NetplayJS WebSocket service for introductions, its advertised ICE servers for connectivity, and WebRTC data channels for gameplay. See [multiplayer architecture, hosting and verification](docs/multiplayer.md).

The tests cover simulation, geometry, input mappings, static assets and HTTP serving. They do not verify WebGL output, browser layout, physical controller behavior, audio output or GPU performance. See [verification](docs/verification.md).

## Research and credits

See [research notes](docs/research.md) for sources, implementation decisions and differences. The game/interface code and procedural models are original. Supplied model artwork and its rendered garage thumbnails retain their own licenses; see [model credits](docs/model-replacements.md). Three.js 0.170.0 is MIT licensed; its license is in dist/vendor/. Rajdhani by Indian Type Foundry (current UI) and Barlow Condensed by Jeremy Tribby (retained original asset) are SIL OFL licensed; licenses are in dist/assets/fonts/. Cover and procedural-car illustrations are original SVGs. Reference images were reviewed only and are not distributed.

The project was created in a cloud workspace. No software was installed and no settings were changed on the user's PC. Browser local storage is used for optional preferences and career data. No native process, filesystem or shell access is exposed by the game.

## Fennec model update

The default vehicle now uses the supplied Fennec FBX, converted to a self-contained 6.4 MiB GLB. All four wheels have separate rolling pivots; the front pair steer independently using Ackermann-style angles. Wheel rotation follows signed speed and each actual wheel radius, including reversing. Chassis pitch, roll and suspension motion respond to acceleration and steering. Physics orientation still drives jumps, dodges and aerial rolls. Replays record speed/steering for the same animation. Paint variants use separate material instances while geometry/textures are shared safely between cars.

The source FBX had no animation clips; movement is implemented procedurally. See [model preparation and credits](docs/model-replacements.md).

## Champions Field update

The stadium uses the uploaded Champions Field architecture, adapted to the game's coordinate system and materials. Its stands, trophies and eight banner textures are retained. Version 1.11 also uses the supplied inner turf, ramps and goals, calibrated to the solver, with the existing interactive boost pads and pitch markings. The obstructing cage/dome is omitted. See [inner geometry calibration](docs/champions-inner.md). This is an adaptation of the supplied recreation.

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
