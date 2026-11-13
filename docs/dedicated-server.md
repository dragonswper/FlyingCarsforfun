# Optional dedicated game server

This server runs the authoritative game simulation on Node.js at 120 Hz. Each browser connects as a client, including the lobby owner. Rendering remains on each player's GPU. The server needs no GPU and does not load 3D models into a renderer.

The server package is included in this repository. It has been tested in the cloud workspace. It has not been installed or started on your PC, and no firewall/router settings have been changed.

## Local test

Requires **Node.js 22 or newer**. Download this repository or clone it, then open a terminal in its root directory:

```sh
npm ci --ignore-scripts
npm run server
```

Open **http://127.0.0.1:8787/** in two browser tabs. This serves the same game and all its assets. In **Private Match → Custom Lobby**:

1. Set **Connection** to **Dedicated Server**.
2. Enter **http://127.0.0.1:8787** as the server URL. The client converts it to the WebSocket endpoint.
3. Choose the lobby size and time, then select **Host Custom Lobby**.
4. Copy the complete **BCS** invite. It includes the server address. The controller keyboard also supports URL fields and their punctuation.
5. Paste it in the other tab's custom-lobby invite field and join.
6. Choose Blue, Orange or Spectate. Playing members select Ready; the owner selects Start Match.

The default listener is **127.0.0.1**, so this first test is local to the server computer. Stop it with **Ctrl+C**.

## Other computers

For a trusted LAN test, explicitly choose a network listener before starting. For example, in PowerShell:

```powershell
$env:BIND_ADDRESS = "0.0.0.0"
npm run server
```

Players must open the server computer's reachable LAN address, such as **http://192.168.1.50:8787/**, and use that same address in the Dedicated Server field. The example address must be replaced with the server computer's actual address. A localhost invite points back to the joining player's own machine and cannot connect a friend to your server.

For the existing **HTTPS hosted game**, enter a reachable **wss://** endpoint with a trusted certificate. Plain **ws://** is rejected on that page because browsers block mixed-content connections. A TLS reverse proxy/tunnel or direct TLS configuration can provide WSS. This package does not install or configure one, open router ports, or change a PC firewall. Those are separate setup choices to review before making system/network changes. LAN HTTP pages may also lack browser features that require a secure context; production play should use HTTPS/WSS.

A nearby server can avoid a distant peer relay and remove the host browser's rendering from the simulation loop. It cannot guarantee equal ping: each player's route to the server still matters. For Australian players, a reachable Australian server is preferable to a distant deployment. Running the server on the gaming PC still shares that computer's CPU; a separate machine isolates it further.

## Configuration

Set these process environment variables before `npm run server`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP/WebSocket listener port |
| `BIND_ADDRESS` | `127.0.0.1` | Network interface to listen on |
| `MAX_ROOMS` | `8` | Maximum concurrent rooms, clamped to 1–64 |
| `TLS_CERT_FILE` | unset | PEM certificate file for direct HTTPS/WSS |
| `TLS_KEY_FILE` | unset | PEM key file for direct HTTPS/WSS |
| `ALLOWED_ORIGINS` | current hosted game | Comma-separated browser origins allowed to use WebSockets; the server's own page origin is also accepted |

The browser endpoint is **/multiplayer**. **GET /health** reports availability, the game build and room count. A reverse proxy must support WebSocket upgrades and preserve the path. TLS files and proxy credentials stay outside Git. No environment file is automatically read.

## Behavior

- 2–8 people, up to four per team, with no slot reserved for the server.
- The owner can play or spectate, change pre-match settings and start after all players are ready.
- All players use the same client prediction and correction path.
- The simulation continues while a player's menu is open.
- Late arrivals spectate until the next match; chat and current state are synchronized.
- Both playing members must consent to a rematch; spectators do not block it.
- Brief socket losses retain the same slot and match for up to 20 seconds.
- An owner who leaves intentionally passes management to a remaining player.
- Empty rooms are released. Rooms are held in memory and do not survive a server process restart.

BC2 invites continue to use browser-hosted WebRTC. BCS invites use the separately configured server. Public automatic matchmaking remains the existing peer queue; the dedicated option is for custom rooms. Every client and server must use the same game build.

The dedicated transport uses WebSockets/TCP. Congestion or packet loss can still stall TCP delivery; input queues and state send buffers are bounded, and the HUD keeps showing measured connection quality. This is a working optional server path, not a claim that every network can achieve the same latency.

## Verification

Real local sockets cover room creation/join, two player IDs, eight-person capacity, owner permissions/spectating, input acknowledgements, a server loop independent of browser frames, reconnect, late spectators, shared chat, rematch consent, owner transfer, empty-room cleanup, origin/version validation and public-file boundaries. See [movement and lobby release notes](smooth-play.md).

Browser rendering, independent-home-network routing and public WSS/certificate deployment have not been verified in this workspace. The local tests do not measure your Australian internet connection.
