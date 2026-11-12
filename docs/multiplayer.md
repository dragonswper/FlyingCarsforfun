# Private multiplayer

Boost Circuit 1.6 adds two-human room-code matches without changing the static hosting model or requiring a game installation.

## Use

Choose **Private Match**, choose the mode/length, then **Host Match**. Send the displayed code, such as `ABCD-2345`, to one friend. They open the same game (or a compatible deployment), enter the code and choose **Join Match**, then **Ready**. The host chooses **Start Match**.

Supported rooms:

| Choice | Human slots | Bots |
| --- | --- | --- |
| 1v1 head to head | Host: Blue, Guest: Orange | None |
| 2v2 opposing teams | One human on each team | One on each team |
| 2v2 teammates vs bots | Both humans: Blue | Two Orange bots |

Both players retain their own camera, input, video and audio preferences. Their selected car/paint is exchanged; default blue paint becomes orange for an Orange-team human so the teams remain readable. Guest camera, boost, score, results and synthesized engine sound use the guest's car. Only the host can start, restart or rematch. Either player can request skipping a goal replay. A guest opening its menu sends neutral controls while the match continues. The host's menu pauses the match for both players. Switching away from the host tab pauses it until the host resumes. Leaving or losing either peer ends the room; there is no host migration or in-progress rejoin.

**Website access and room access are separate.** At implementation-time verification, the Sites URL was owner-private. For a private Site, a friend needs to be allowed through its sharing settings before opening the URL; both players can also use another static deployment of the repository. Check the current Share settings for the live audience. A room code does not bypass the website's access controls. No site sharing policy is changed by creating a room.

## What the supplied repositories contribute

| Source inspected | Useful material | Integration |
| --- | --- | --- |
| [NetplayJS](https://github.com/rameshvarun/netplayjs), tree `c6f888a65d49b8a2f09d0654b29becde25ec060f`, ISC | WebRTC peer setup, game-agnostic WebSocket signaling, private queue keys, authoritative corrections and input prediction | Its documented signaling format is adapted by the original small transport. Its public shared service bootstraps the browsers. The full framework, React UI, autoserializer and rollback engine are not bundled. ISC notice included. |
| [Multicore](https://github.com/trevorhoner/Multicore), tree `0eb400ea79f098797c17f458b70fa5634775440a`, AGPL-3.0 | Modular infrastructure and explicit game-version compatibility | At inspection the tree contained eight documentation/license files and no running server or game adapter. Version-compatibility ideas inform an explicit protocol/build handshake. No Multicore implementation code is copied. |

Relevant NetplayJS files: [client.ts](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-client/src/matchmaking/client.ts), [peerconnection.ts](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-client/src/matchmaking/peerconnection.ts), [rollback.ts](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-client/src/netcode/rollback.ts), [matchmaking-protocol.ts](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-common/matchmaking-protocol.ts), [queue.ts](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-server/src/queue.ts), [server README](https://github.com/rameshvarun/netplayjs/tree/c6f888a65d49b8a2f09d0654b29becde25ec060f/netplayjs-server). Multicore's relevant reference is [GAME_VERSIONING.md](https://github.com/trevorhoner/Multicore/blob/0eb400ea79f098797c17f458b70fa5634775440a/GAME_VERSIONING.md).

## Architecture

`network-protocol.js` defines the application protocol/build, code alphabet, validation, control normalization and bounded remote-input queue. `network-transport.js` adapts the NetplayJS signaling messages to two native WebRTC data channels. `network-state.js` serializes authoritative state, validates snapshots, predicts the guest's car and interpolates remote poses. `network-room.js` owns the lobby/ready/start lifecycle, explicit host role, match IDs, snapshots, events, heartbeat and cleanup. `room-ui.js` owns the room dialog. The existing renderer follows the local player's ID, including on the Orange team.

Codes contain eight independently generated symbols from a 32-symbol alphabet: 40 random bits generated with `crypto.getRandomValues`. Spaces/dashes and letter case are normalized; ambiguous 0/O and 1/I are rejected. The code becomes a game-specific private queue key. No public room directory or random matchmaking is exposed. Unused host rooms expire after ten minutes. A guest times out after 25 seconds with a message covering an absent/full room or a blocked connection. A code connects only one guest, and is not available for joining once that pair is matched.

The NetplayJS server chooses a random WebRTC signaling initiator. This is independent of our explicit application host: the player who selects Host always owns the simulation. A `hello` checks protocol 1 and build `boost-circuit-1.6.0`. Incompatible builds close with a reload message. Both data channels must be open and the local hello sent before early packets are delivered; this prevents room configuration from arriving before peer identity is checked. ICE candidates arriving before the remote description are buffered.

The host runs the existing simulation at 120 Hz, consumes controls only for the guest's assigned car and owns ball/car collisions, boost collection, goals, clock, bots and results. Clients cannot submit positions or scores as inputs. Guest input frames have monotonically increasing sequence numbers; duplicate/old frames are rejected, controls are clamped, queue sizes are bounded and a 300 ms gap releases held controls. Redundant input frames are sent at up to 60 messages per second.

The host sends complete snapshots at up to 30 Hz, including input acknowledgements, poses, velocities, car jump/boost state, score, clock and pad timers. The guest predicts only its own car and replays still-unacknowledged controls after correction. Ball and remote-car rendering use an 85 ms interpolation buffer. Kickoffs/teleports snap instead of interpolating across the field. Guest prediction approximates contacts until the next authoritative correction; it does not decide goals or execute peer bots. Arrays and histories are bounded.

The reliable ordered `control` channel carries version checks, readiness, starts, pause, events, rematch and leaving. The unordered `realtime` channel uses `maxRetransmits: 0` for inputs and snapshots, with sequence checks, redundant inputs and backpressure limits. Reliable event messages also include an authoritative state so final stats do not depend on a dropped datagram. Every match has a new ID; old-match packets are ignored. Heartbeats measure peer RTT and terminate an unresponsive room after 15 seconds. Connected WebRTC failure has an eight-second recovery grace; failed negotiation and closed data channels produce explicit room errors and release timers/sockets/peer connections.

The host is trusted for a private match. This is not dedicated-server anti-cheat, deterministic full-world rollback, ranked matchmaking, host migration, an online account system or four-human networking. The original numeric physics and local modes remain available.

## Hosting and external dependencies

The game remains a static `dist/` folder. Neither the players nor the static host need a Node game server. WebRTC is opened only after Host/Join; local modes do not connect to the service. No microphone/camera stream is requested.

The default bootstrap endpoint is NetplayJS's public `wss://netplayjs.varunramesh.net/`. It registers the browsers, matches their shared private queue key and forwards offers, answers and ICE candidates. The application uses the ICE list returned by that service. Inspection returned STUN and TURN URLs; their credentials are held only in the peer connection and are not logged or stored in the repository. Gameplay travels directly between browsers where possible and through an ICE-provided TURN relay where needed. Both rendering and physics remain on player devices.

The shared service and its relay connectivity are best-effort external dependencies. Some networks can block WebRTC or its relay endpoints. A static GitHub repository alone cannot introduce peers. For independent operation, deploy a compatible [NetplayJS signaling server](https://github.com/rameshvarun/netplayjs/tree/master/netplayjs-server), configure its server-side `ICE_SERVERS` with appropriate STUN/TURN, and change `SIGNAL_URL` in `dist/network-protocol.js` to its secure WebSocket endpoint. Do not put private long-lived TURN secrets in a static client. No server provisioning or changes to the user's computer were performed for this release.

## Verification

`npm run check` and `npm test` require no installed production dependencies. The release has 86 passing tests, including 16 network behavior/transport tests. Delay/loss coverage uses a deterministic ten-second simulated link with jitter, reordered state and lost input/state datagrams. This verifies bounded state and recovery behavior, not an internet latency guarantee.

The optional live check uses two actual Node WebRTC peers with the production application transport and room code. It reaches the public NetplayJS service through the cloud workspace's inherited HTTPS proxy, then uses same-container host ICE candidates for the data route. It exercises the handshake, Ready/Start, hundreds of acknowledged guest controls, snapshots/prediction, host pause/resume, authoritative final scores, rematch and disconnect cleanup. Repeated testing found and fixed the early-channel startup race; the automated regression checks local-open-before-packet ordering.

To reproduce that developer check with disposable, test-only dependencies:

```sh
npm install --prefix /tmp/boost-circuit-rtc --no-save --ignore-scripts werift@0.27.0 ws@8.22.2 https-proxy-agent@7.0.6
BOOST_CIRCUIT_RTC_TEST_DEPS=/tmp/boost-circuit-rtc node scripts/check-live-multiplayer.mjs
```

These dependencies are not shipped with the game and are not required to play or run the normal tests. No browser was installed or substituted for the missing managed `cua_repl.js` tooling. Browser UI/input, physical controllers, real GPU performance and separate-home-network/NAT/relay traversal remain unverified. The room is playable code with a tested WebRTC data path, with those concrete limits.
