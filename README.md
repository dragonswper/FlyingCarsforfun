# Boost Circuit — Car Soccer
 
An original browser-native 3D car-soccer game inspired by Rocket League, written from scratch with a custom fixed-step simulation and Three.js rendering. This repository is the standalone browser game and optional dedicated-server source for **FlyingCarsforfun**.
 
It includes Champions Field and many more arenas, 16 selectable vehicles, the supplied Rocket League ball, tests, model credits and research notes.
 
## Play
 
**Hosted game:** https://flyingcarsforfun.connstors.workers.dev

**Private admin:** `/admin` uses a PIN plus an expiring email code. [Private setup and transport security](docs/admin-security.md). Admin access stays locked until the server secrets and email service are configured.

**Latest update — 1.31 Overdrive:** Party matchmaking, adaptive networking, aerial bot tactics, Replay Studio, private mutators, saved garage loadouts, mobile tuning and three new modes with original Blender venues. Refresh all players’ tabs. [v1.31 notes and testing](docs/release-1.31.md). [v1.30 Cup & Clubhouse](docs/release-1.30.md). [Connection route test](https://flyingcarsforfun.connstors.workers.dev/connection-test).
 
The live Cloudflare game includes the dedicated server. Choose **Online Match → Dedicated Server**, then pick the same mode and **Oceania** on both PCs.
 
**Source:** https://github.com/dragonswper/FlyingCarsforfun
 
Use Share to control who can open the hosted game. For private access, invite friends before using the link together; a room code does not grant website access. Both players can also use another static deployment of this source. All rendering runs on each player's GPU; browser-hosted rooms run physics on their host, while dedicated matches run it on the independent server. No game installation or cloud GPU is required, and there are no separate game accounts.
 
## Controls
 
| Keyboard / mouse | Action |
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
| V / R3 | Recenter camera (rebindable) |
| Tab | Match stats |
| R / T | Practice reset / next drill |
| Escape | Pause / open match menu (a guest's online menu does not pause the host) |
| Enter | Skip goal replay |
| Enter or Y / G | Text chat / quick chat (Y and G are editable bindings; Enter skips goal replays) |
 
**Standard controller:** RT/LT drive, left stick steer/pitch, A jump, B boost, X powerslide, Y camera, LB/RB air roll, Start pause, View scoreboard, D-pad up reset, D-pad down next shot. PlayStation uses the corresponding Cross/Circle/Square/Triangle and L1/R1/L2/R2 buttons under standard browser mapping. Options → Controls rebinds buttons/axes. D-pad left/right opens quick/text chat. Menus use A/Cross to select, B/Circle to return and D-pad/left stick to navigate; text fields offer an on-screen keyboard. Physical hardware/browser mapping remains unverified interactively.
 
Phones (since 1.22) get multitouch driving and camera controls; Options → Interface → Edit HUD Layout lets you drag, resize and set opacity of HUD elements.
 
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
 
The garage includes Fennec (default, including bots), Octane, Striker GT, Rally RS, Bottled Car, cHe, Cyberpunk Bike, C-17 Globemaster, Randy Marsh, Ridiculous Vehicle, Viking Battle Vehicle, Sci-fi Three-Wheeler, Wooden Golf Cart, Autorickshaw, Infantry Fighting Vehicle and Bonnie Blue's Van. Vehicles have rolling wheels, front steering and boost flames. Paintable bodies support four finishes; supplied novelty bodies retain their artwork. The presentation includes selectable fields, goal nets/frames, particles, the supplied Rocket League ball, a ground locator, ball/free cameras, scoreboard, boost meter, stats, recorded engine audio and original synthesized sound effects. Garage options, camera/audio choices, the selected field and local career records persist in this browser. All bodies use the same game hitbox and handling; the bike and plane are novelty choices.
 
## Run and verify from source
 
Playing the hosted game requires no installation. If Node.js 22+ is already available and you choose to run the source:
 
```
node scripts/serve.mjs
# http://127.0.0.1:4173
npm run check
npm test
```
 
No `npm install` or build is needed. `dist/` includes its rendering library, font and illustrations and makes no CDN requests. Serve over HTTP/HTTPS rather than opening a `file://` URL. The optional development server binds only to 127.0.0.1. On a static host, publish the contents of `dist/`.
 
Local modes make no multiplayer requests. Selecting Online Match, Host or Join uses the public NetplayJS WebSocket service for introductions, its advertised ICE servers for connectivity, and WebRTC data channels for gameplay. See the multiplayer architecture, hosting and verification notes.
 
The tests cover simulation, geometry, input mappings, static assets and HTTP serving. They do not verify WebGL output, browser layout, physical controller behavior, audio output or GPU performance. See the verification notes.
 
## Update history (oldest to newest)
 
### Fennec model update
The default vehicle uses the supplied Fennec FBX, converted to a self-contained 6.4 MiB GLB. All four wheels have separate rolling pivots; the front pair steer independently using Ackermann-style angles. Wheel rotation follows signed speed and each actual wheel radius, including reversing. Chassis pitch, roll and suspension motion respond to acceleration and steering. Physics orientation still drives jumps, dodges and aerial rolls. Replays record speed/steering for the same animation. Paint variants use separate material instances while geometry/textures are shared safely between cars. The source FBX had no animation clips; movement is implemented procedurally.
 
### Champions Field update
The stadium uses the uploaded Champions Field architecture, adapted to the game's coordinate system and materials. Its stands, trophies and eight banner textures are retained. The obstructing cage/dome is omitted. The model uses 105 draw batches instead of 2,751 source parts and occupies 20.0 MiB instead of 36.9 MiB. Quantization is decoded by the bundled Three.js loader without a separate codec. Low graphics hides seat batches. This is an adaptation of the supplied recreation.
 
### Smoothness and graphics
Graphics defaults to Auto, which adjusts resolution and seat detail when frame times stay high. It uses an offline simplified Champions Field of about 268,000 triangles, retaining all 105 architecture batches, the banners and stadium silhouette. Balanced fixes the normal Auto starting profile; Low lowers resolution further; High loads the original full-detail stadium and realtime shadows. Existing Low preferences are retained; the previous default High preference migrates to Auto once.
 
The pitch uses 35 draw submissions instead of 238. All boost pads render in three instanced submissions, and collision/goal particles share one bounded reusable mesh. Fixed-step pose interpolation smooths car, ball and replay motion across display refresh rates. Shader preparation happens before the lobby opens. Hidden tabs pause matches rather than building up catch-up work. Turn on Settings → Performance display to see approximate FPS. These are measured reductions in rendering work, not a guaranteed frame-rate increase. All 43 automated checks pass.
 
### 1.4 — Core mechanics and settings
Cross-checks the supplied RocketSim, RLBot-Beast, rl_ball_sym and RocketGPU repositories against rl.source.gs. Adds a collision-mesh-derived corner outline, offset Octane/Fennec contacts, source jump/boost timing, spin-aware ball friction, shared bounce prediction, proper goal/assist scoring and four bot behavior levels: Rookie, Pro, All-Star and Expert. Boost pickups are now spheres and still use three instanced draws.
 
Options is organized into Camera, Controls, Interface, Video and Audio. Camera includes horizontal FOV, distance/height in centimetres, angle and stiffness. Controls supports keyboard/mouse rebinding with conflict checks, steering/aerial sensitivity, deadzones and pitch inversion. Audio adds master volume. Preferences persist locally, and restoring camera/controls leaves career data intact. The physics remains an original browser implementation with documented approximations. Native CUDA, Rust and RLBot installations are not required. All 65 automated tests pass.
 
### 1.5 — Menu and HUD update
Classic field-front menus: left-side slanted navigation, a bottom player banner, blue glass Options tabs, a compact blue/orange score clock, a segmented amber boost dial, red ball-cam indicator, gold kickoff/goal messages, player nameplates and a scorer banner in replays. Exhibition and Training have separate selections. Options → Interface controls HUD size (70–120%), nameplates and the optional speed display. Keyboard hints follow saved bindings. The scoreboard groups teams and displays score, goals, assists and saves. Menus support click, keyboard focus, arrow navigation and Escape to go back.
 
The UI uses local HTML/CSS/SVG and 57 KB of subset Rajdhani fonts, with no screenshot backgrounds, remote font requests or added WebGL draw calls for the HUD. Nameplate elements are pooled and follow interpolated car positions. The requested Game UI Database page was blocked (robots/HTTP 403), so public Rocket League screenshots from Interface In Game were inspected instead. This is a close visual recreation with the game's own branding, not verified pixel parity. 70 automated tests pass.
 
### 1.6 — Private multiplayer
1. Choose Private Match → Host Match, select the mode/length and send the eight-character code to your friend.
2. Your friend opens the game, chooses Private Match, enters the code and selects Join Match → Ready.
3. The host selects Start Match. The host also controls restarts and rematches.
Both players use their own GPU, camera settings, controls, car selection and paint. Doubles supports opposing human teams or a human team against bots. A room supports two humans. The host can pause both players; a guest's menu only releases that guest's controls. Keep the host tab visible while playing. Leaving or losing the host ends the room.
 
The implementation adapts NetplayJS's signaling protocol and authoritative-state ideas (ISC notice included). The host simulates both humans and all bots at 120 Hz. Guests send bounded control frames and receive authoritative snapshots at up to 30 Hz. Guest-car prediction replays unacknowledged inputs; remote poses interpolate through a short buffer. Held controls reset after a 300 ms input gap. Room codes use 40 random bits, expire after ten unused minutes, and connect one guest. Game builds must match. 86 automated tests pass, plus a real two-peer WebRTC check; an early-channel handshake race found in a live run is fixed and covered by a regression test.
 
### 1.8 — Garage, ball cam and ramps
Wall contacts remain attached through the ramp, and roof/bumper scrapes absorb spin instead of forcing a sudden upright landing. Ball cam tracks the ball with a level horizon; turn it off to orbit using middle-mouse drag or the controller right stick. Garage also offers Octane, cHe, Cyberpunk Bike and C-17 Globemaster. The supplied 3D Rocket League ball replaces the procedural ball. Optional vehicle models load on selection or private-opponent preparation; Ready/Start waits for both appearances. Reload both players' pages after this update. All 114 automated tests pass.
 
### 1.8.1
Press Jump (default Spacebar / controller A) while resting upside down to hop and flip back onto your wheels. One press is enough. Normal jumps and aerial dodges keep their existing controls.
 
### 1.9 — Online Match
Choose Online Match to search for a real opponent for up to 60 seconds. A connected opponent starts a five-minute casual 1v1 automatically after both vehicles load; an empty search starts a clearly labeled local bot match using your selected bot difficulty. Cancel or Escape leaves the queue. Keep the tab visible while searching. Private room codes remain available.
 
### 1.10
Guest controls recover after long input gaps and predict ball/vehicle contacts immediately. Brief drops hold the same match for a 20-second reconnect window. Either player can request a rematch or choose Find Next Match. Online Match and Options → Network save region/ping preferences; the HUD warns about high ping, update loss and stalled connections. Mouse chord release, controller steering/look return and pitch flip cancellation are fixed.
 
### 1.11 — Custom lobbies, controllers and novelty vehicles
Private Match → Custom Lobby supports 2–8 people, selectable teams/spectators (including the host) and 1–30 minute matches. Controller menus, an on-screen keyboard and saved button/axis bindings are included. Names save locally; text/quick chat is editable. Garage adds seven supplied novelty vehicles, and the supplied stadium's inner field/goals replace the generated geometry while keeping boost pads. 193 automated tests pass, plus an actual four-client WebRTC session.
 
### 1.12 — Names and chat
Use Edit Name on your profile bar or pause menu to save a custom username on this browser/device. Chat is visible in the match HUD, pause menu, lobbies and results; Enter / Y opens text chat during play (Enter still skips goal replays). Everyone in the current room, including spectators, shares the newest five messages. A sixth removes the oldest; the entire feed clears five minutes after the first message, without extending the deadline for new messages. Late joiners and reconnecting players receive the current feed. 203 automated tests pass, plus a real four-client WebRTC check.
 
### 1.13 — Network routing
Online matches use Warn and connect by default so high ping does not repeatedly reject casual opponents. Enforce Ping Limit still honors either player's strict preference. Connections try a direct route before the shared relay, with a full direct window after signaling completes; the ping check warms up and uses seven spaced gameplay-channel samples. Options → Network → Connection Details separates game response from native network ping and shows direct/relayed routing when available. Both Australian players can select Oceania to share a regional queue; this does not move a relay or guarantee 100 ms. 224 automated tests pass.
 
### 1.14 — Guest movement and optional dedicated server
Guest movement replays the full 600 ms acknowledgement window, separates world extrapolation from input replay and smooths corrections without delaying new input. Custom BC2 join no longer crashes before room options arrive. Short front/back/side flips can finish through light ground scrapes, and collision impulses are followed by floor projection. Private Match → Custom Lobby → Dedicated Server adds an optional independent 120 Hz Node server; all players connect as clients using full BCS invites. 246 automated tests pass, plus real WebRTC checks.
 
### 1.15 — Dedicated server
Thresholded client reconciliation compares matching acknowledged input states. The dedicated server simulates acknowledged inputs at 120 Hz, supports every game mode, server matchmaking, 60-second bot fill, authenticated guest reconnects and HTTPS/WSS. Optional Render route (if your account permits no-card deployment): one Free Singapore server using the included Blueprint; no payment method, paid database or GPU is required. The free service has sleep/CPU/bandwidth limits and cannot guarantee 100 ms in Australia. All 280 automated tests pass, including real HTTPS/WSS sessions on Node and Cloudflare's local workerd runtime. All clients and the server must reload matching source.
 
### No-card hosting
Deploy using a free Cloudflare account. The Worker serves the game and the authoritative server together, requests Oceania placement and uses the same tested gameplay/networking code. No paid database, R2 bucket, domain or PC installation is required. Render may request billing verification even on its Free plan; do not add payment details to work around it. The older ChatGPT-hosted site remains on its previous published build; use the Cloudflare Play link above for the updated client and server.
 
### Browser authentication fix
The client now calls native browser fetch with its correct receiver. This fixes "Could not authenticate with the secure server" before a search can begin. Refresh the game after deployment. A Chromium regression check reproduces the old failure and verifies the fix; all 280 automated tests pass.
 
### 1.16 — Local ball response
Your own ball touches survive older snapshots until the server acknowledges the input, with immediate impact feedback and a gradual handoff to authoritative motion. The server discards stale movement backlogs while preserving jump presses. Connection Details reports the server input buffer. 295 automated tests pass, including 180–220 ms contact tests with missing/reordered snapshots. This improves local response; genuine server ping still applies to confirmed results and other players.
 
### 1.17.1 — Smoother server driving
Reconciliation accounts for physics steps the server simulated while holding controls between packets, preventing movement from being replayed twice. Fresh controls realign the input clock after long rendering hitches. Online cars and the ball interpolate between fixed physics steps at the display's frame timing. 307 automated tests pass, including uneven 30–240 FPS timing and missing packets at 200 ms.
 
### 1.18 — Camera gameplay
Speed-aware pullback/FOV, independently adjustable swivel, return and mode-transition speeds, smooth camera switching, and goal/wall/ramp camera clearance. Classic Car Cam remains the default; optional Free Look keeps your viewing direction. Use V / R3 to recenter (rebindable). Ball cam retains its manual-look lock and level horizon. Saved controls migrate, and the 1.17 driving fixes are retained. 322 tests pass, plus rendered browser checks.
 
### 1.18.1 — Close-ball camera fix
Camera transitions orbit around the car and maintain clearance measured from the selected vehicle's visual model. Wall/goal retraction searches for an available view outside the car; your own vehicle briefly fades when it blocks a nearby ball. Opponents keep their normal appearance. Faded shaders warm up during loading. 332 tests pass, including actual-model and near-plane regressions.
 
### 1.19 — Three new fields and engine audio
Choose Winterlight Park (snow/Christmas), Neon City or Evergreen Grove alongside Champions Field. Map choices work in solo play, private lobbies and dedicated matches. The engine has recorded Sport exhaust, a deeper Muscle profile, an Electric profile, revs/shifts, boost and tyre sound, independent volume controls and a preview button. 344 tests pass, with rendered map and audio checks.
 
### 1.20 — Frostvale Festival, camera stability and ceiling driving
A fifth field assembled from your Christmas village, tree, lights, mountain-road and snow assets, plus Lobby Radio with both supplied songs. Free cam keeps a stable direction through aerial tricks and smooths wall avoidance; cars can continue onto the field ceiling and inside goal roofs. Options → Video → Cinematic enables richer lighting, soft shadows and short grass on turf, with independent controls.
 
### 1.21 — Friends and shared lobbies
Permanent browser IDs, name/ID search, mutual friend requests, online status, invitations, a live player count and public/friends/invite-only lobby discovery. Lobby Radio starts on load where allowed, with first-interaction fallback. The photo-based Bonnie Blue's Van is selectable with animated wheels.
 
### 1.22 — Performance and mobile preview
Shared world snapshots reduce server broadcast work; waiting lobbies run at a lower cadence, while match physics remains 120 Hz. Fields load their own assets on demand. Phones get smaller Fennec/stadium models, adaptive graphics, multitouch driving, camera controls and responsive menus.
 
### 1.23 — Harbourworks and custom HUD layouts
An original Blender-built dockside stadium, saved drag/resize/opacity controls for desktop and both phone orientations, touch mirroring, clearer mobile menus and fullscreen/home-screen help. Select Harbourworks in any field selector; use Options → Interface → Edit HUD Layout.
 
### 1.23.1 — Compact mobile menus
Smaller navigation and garage cards, music in its own sheet, a fixed matchmaking action row, and connection options under an expandable section. Layout detection also covers desktop-site mode.
 
### 1.23.2 — Random online arenas
Every game under Online Match uses a shared random field, including bot fill, online practice and rematches. Rematches avoid the previous arena; both clients prepare the next field before starting. Reload all players for the matching build.
 
### 1.24.0 — Five original Blender arenas
Yuletide Market (Christmas), Halloween Hollow, Sunset Coast, Red Rock Canyon and Orbital Station join the eleven-field online rotation and all arena selectors. Editable .blend files, optimized GLBs and Blender-rendered previews are included.
 
### 1.24.1 — Optimization update
Less collision CPU/allocation work, grass buffers allocated on demand, field shader preparation during match loading and lighter dedicated replay bookkeeping.
 
### 1.25.0 — Turf, points and teamplay
Curved wind-animated grass, detailed turf surfaces, shots/saves and match-point feedback, a tappable scoreboard, winning-team MVP, and improved bot kickoffs, defense, shot placement and recovery.
 
### 1.25.1 — Aircraft corner clearance
Prevents the C-17 artwork from clipping into ramps while retaining shared car physics; camera protection follows the adjusted model.
 
### 1.26.0 — Network and frame-budget update
Shared binary snapshots, fresher 30 Hz dedicated updates, bounded prediction buffers and saved frame-rate limits. Eight-player snapshot benchmarks use about 68% fewer bytes and 84% less preparation/send CPU.
 
### 1.27.0 — Skies for all eleven maps
Original Blender sky domes with themed clouds, sunsets, moons, stars and a winter aurora. One lightweight background draw per field.
 
### 1.28.0 — Motion, menus and server runtime
A dedicated animation system, original Blender pennants, better vehicle/pickup motion, reduced-motion controls, refined desktop/mobile menus and a modular authoritative server with bounded scheduling, shared APIs and reliable profile saves.
 
### 1.28.1 — Matchmaking version fix (latest)
Compatible v1.27/v1.28 clients can play together after visual updates. Truly incompatible servers show an update action with Reload Game and visible connection settings.
 
## Research and credits
 
See the research notes for sources, implementation decisions and differences. The game/interface code and procedural models are original (MIT). Supplied model artwork and its rendered garage thumbnails retain their own licenses; see the model credits.
 
- Supplied Fennec/Octane, Champions Field and C-17 artwork is adapted under CC BY 4.0.
- Bottled Car and Cyberpunk Bike use CC BY-NC 4.0; cHe uses CC BY-NC-SA 4.0.
- The ball, Randy, Ridiculous and Viking archives did not identify usable creator/license notices.
- The sci-fi vehicle, golf cart and IFV identify CC BY 4.0; the rickshaw identifies Sketchfab Standard. Their terms remain in their import records.
- The festival artwork and two user-supplied music tracks retain their separate rights; see the holiday and music credits.
- Three.js 0.170.0 is MIT licensed (license in `dist/vendor/`). Rajdhani by Indian Type Foundry (current UI) and Barlow Condensed by Jeremy Tribby (retained original asset) are SIL OFL licensed (licenses in `dist/assets/fonts/`).
- Cover and procedural-car illustrations are original SVGs. Reference images were reviewed only and are not distributed.
No original Rocket League audio or accounts are bundled. Ranked matchmaking, original accounts, cosmetic inventories and advanced original-game mechanics such as reliable flip resets/wavedashes are outside this release.
 
The project was created in a cloud workspace. No software was installed and no settings were changed on the user's PC. Browser local storage is used for optional preferences and career data. No native process, filesystem or shell access is exposed by the game.
