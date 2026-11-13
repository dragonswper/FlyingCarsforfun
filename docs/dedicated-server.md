# Secure dedicated server — free hosting and two-PC setup

The Node.js 22+ service runs authoritative physics at **120 Hz** independently of any player's browser. Every browser predicts its own car and receives server snapshots at **30 Hz** (20 Hz with more than two cars). Rendering uses each player's GPU; the server does not need a GPU. Both the game page and the game service can run on one free Render web service.

## Free option: Render Singapore

[Deploy the Free service](https://render.com/deploy?repo=https://github.com/dragonswper/FlyingCarsforfun)

The repository includes [render.yaml](../render.yaml): **one `plan: free` Node web service in Singapore**, one simultaneous room, no database, disk, paid background worker or additional service. Automatic redeployment is off so a later repository update cannot unexpectedly restart your match.

1. Create/sign into a **free Render account**. Keep **no payment method** on it. If Render requires billing details for your account, stop; this project has no paid-hosting authorization.
2. Open the deploy link above. If the GitHub repository is private, grant Render's GitHub app access to **this repository only**. Review that the only resource has **Free** selected and the region is **Singapore**. Deploy it.
3. Wait until Render shows the service as live. Open its assigned **https://…onrender.com** address. This serves the updated game as well as the server. Do not guess the address from the service name.
4. Open **Online Match**. On a fresh browser profile, a game served by this Node service selects **Dedicated Server** and fills its own URL automatically. Otherwise choose it and paste the HTTPS service address. Select **1v1 Duel** or **2v2 Doubles**. Both players use the same server, mode, difficulty and matchmaking region, then **Find Match**.
5. For private play, open **Private Match → Custom Lobby**, select **Dedicated Server**, enter the same HTTPS address, select a game mode, size and length, then **Host Custom Lobby**. Send the **complete BCS invite** to the other player. Both the owner and guests select a team or spectate; active players select Ready, then the owner starts.

The server URL is public configuration, not a secret. No API key is needed by the game. Do not paste account passwords or deployment access tokens into chat or the repository. The existing static game can also connect to this service once it has matching client source; use its Dedicated Server URL field.

**Free-tier limits, checked 13 November 2026:** Render has no Australian server region; Singapore is the closest available option. Free web services sleep after 15 minutes without inbound HTTP/WebSocket activity and need about a minute to wake. The client allows time for that cold start before its separate 60-second matchmaking search. The workspace has 750 free instance hours/month and bandwidth/build quotas. Without a payment method, exceeding bandwidth suspends free services instead of billing; builds stop when their allowance is exhausted. Normal active game traffic keeps a match awake. No artificial keep-alive service is configured. Free CPU is shared/limited, so this template initially allows **one match at a time**. Do not use this hobby tier as a promise of always-on or production service.

All matches and guest sessions are held in memory. Sleep, deployment or a process restart ends them; players create/search again. A network interruption can reconnect to a running match for 20 seconds, but cannot restore a restarted server's lost memory. Keep the server's dashboard available during tests. Deployment is an account action: the template is ready, but a public service URL exists only after your account deploys it.

Official sources: [free limits](https://render.com/docs/free), [regions](https://render.com/docs/regions), [WebSockets](https://render.com/docs/websocket), [deploy button](https://render.com/docs/deploy-to-render).

## Modes and matchmaking

| Mode | Driving slots | Server behavior |
| --- | --- | --- |
| Duel | 2, one per team | Matches two humans; after 60 seconds fills an empty slot with a bot |
| Doubles | 4, two per team | Matches four humans; after 60 seconds starts with the available humans and fills missing slots with bots |
| Free play | 1 | Starts immediately, unlimited boost, authoritative ball reset; friends may join as spectators |
| Training | 1 | Starts immediately, five drills, authoritative reset/next shot; friends may spectate |
| Custom | Up to 8 | Creates a lobby immediately; people choose teams/spectate and the owner starts; no automatic bot fill |

Private lobbies can select **any of these modes** and include spectators in the 2–8 person room limit. Duel/Doubles private games fill unused driving slots with bots. Free play/training preserve one driving slot and allow other members to watch. The owner may spectate and a remaining member takes ownership if the owner leaves intentionally. Everyone playing must request a rematch; spectators do not block it. Find Next Match leaves the current session and uses the selected queue. Matchmaking partitions by mode, duration, bot difficulty and selected region. A region preference filters people; **the server URL, not that dropdown, selects the physical server**. Choose identical options to search together.

A three-sample WebSocket round trip measures ping before entering a server queue. The default **Warn and Connect** permits higher ping with a warning. **Enforce Ping Limit** rejects a server above that player's selected limit. This does not lower latency. The HUD continues to measure game response and warns about latency, unstable timing, stalled updates or reconnects.

## Encryption and authentication

- The browser accepts **HTTPS/WSS only**, including local tests. It rejects plaintext, URL credentials and query-string tokens.
- HTTPS issues an unguessable, server-owned guest credential, held in the room's browser memory. An authenticated HTTPS request exchanges it for a one-use, 30-second WebSocket ticket. The ticket goes in the first encrypted message, never a URL or invite.
- The server owns guest IDs and recovery tokens. A client-chosen name/token cannot impersonate another session. Guest sessions expire after four hours. These are authenticated **guest sessions**, not verified personal accounts or ranked identities. Names remain local preferences and are sanitized as text.
- Server input is clamped and sequenced, simulated once per fixed tick, bounded and neutralized when stale. Only assigned active drivers can control their cars; client positions, time deltas and scores are ignored. Owner-only lobby operations, origin restrictions, message/rate/capacity limits and chat rate limits are enforced.
- No credentials, private keys, personal profiles, invites or raw packets are written to application logs. Credentials and matches do not survive a server restart. Auth API responses are not cached. Keep TLS keys outside Git; `.gitignore` and `.dockerignore` exclude common secret files.
- **Render** terminates public HTTPS/WSS at its managed TLS ingress and forwards requests within its platform to Node. The explicit `TLS_PROXY=render` configuration accepts only forwarded HTTPS and requires Render's environment/public origin. This is encrypted browser-to-provider traffic, not a claim that the provider's internal hop is end-to-end TLS to the Node process. If you require TLS up to the process itself, use **direct TLS** below. Never expose a trusted-proxy Node listener directly to the internet: an attacker could otherwise forge forwarding headers.
- Browser-hosted BC2/legacy rooms retain encrypted WebRTC/DTLS with secure WSS signaling. They are independent of the dedicated service.

## Other hosts / direct TLS / Docker

The server is portable: Node.js 22+, `npm ci --ignore-scripts`, then `npm run server`. It now **refuses to start without TLS or an explicitly configured trusted HTTPS ingress**. A TLS-enabled host provides certificate/key files readable by its unprivileged process:

```sh
TLS_CERT_FILE=/existing/tls/server.crt TLS_KEY_FILE=/existing/tls/server.key npm run server
```

This defaults to **127.0.0.1:8787**, accessible only on that server. For cross-network play use the host's public HTTPS/WSS ingress on port 443, or explicitly choose a publicly reachable interface and port with appropriate certificate/DNS/network rules. The public certificate must be trusted and match the hostname. No certificate checks are disabled. A self-signed test certificate requires an explicit trusted test client; do not disable browser security or install certificates on someone else's PC.

[Dockerfile](../Dockerfile) packages the same service as an unprivileged container. [compose.yaml](../compose.yaml) mounts an existing TLS directory read-only, drops capabilities and binds only a loopback port. It does not provision a VM, install Docker, create certificates, open a router or change a firewall. For an already prepared host:

```sh
TLS_DIRECTORY=/existing/tls docker compose up --build
```

Do not run system/network setup on the user's PC without their separate approval. Hosting on an existing personal computer may avoid a server bill but uses its power/internet and can require firewall/router changes or an outbound tunnel. Render's public WSS option avoids inbound NAT configuration on either player's computer. Restricted networks may still block WebSockets; no transport can promise access from every firewall.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Listener port; Render supplies its own |
| `BIND_ADDRESS` | `127.0.0.1` | Listener interface; Render template explicitly uses `0.0.0.0` inside its managed service |
| `MAX_ROOMS` | `8` | Room cap, 1–64; Free template deliberately sets 1 |
| `SERVER_REGION` | `singapore` | Health metadata, not a traffic-routing mechanism |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` | unset | Direct TLS certificate chain/private key paths |
| `TLS_PROXY` | unset | `render` for Render's ingress; `trusted` only behind your own protected HTTPS reverse proxy |
| `PUBLIC_ORIGIN` | unset | Required public HTTPS origin for a custom trusted proxy; Render supplies `RENDER_EXTERNAL_URL` |
| `ALLOWED_ORIGINS` | existing public game | Comma-separated authorized browser origins; the server's own HTTPS origin is also accepted |

No `.env` file is automatically loaded. Set variables through the provider's settings or your shell. A proxy must support WebSocket upgrades on **/multiplayer**, preserve the origin and forward the original HTTPS scheme. Direct TLS encrypts through to Node; a proxy deployment's internal transport depends on that provider/proxy. `/health` is a public, non-secret readiness endpoint; managed platforms may probe it on local HTTP. Authentication, matchmaking, game packets, chat and assets require secure ingress.

## Two-PC and cross-network checks

1. Deploy the same source build for client and server. Reload both PCs. Open the **same game URL**; the new Render deployment serves the matching client automatically. If using the old static page, confirm its version first.
2. On the same network, both PCs select Dedicated Server, identical URL/1v1/Oceania/difficulty, and Find Match. Confirm they share a match, have different local cars and both show **DEDICATED MATCH** with measured game ping.
3. Drive, reverse, jump, flip, boost and touch the ball simultaneously. Neither browser should wait for input confirmation. Check **Settings → Network** and, if debugging, `boostCircuit.getPerformance().prediction` in the console. Compare correction count/pending inputs rather than FPS alone. Repeat 2v2 with four humans, and a single search that gets server bots only after 60 seconds.
4. Create a BCS custom lobby; copy its **entire invite including the encoded server address**. On PC two, Join Lobby, pick the opposite team and Ready. Have the owner spectate and start with another active driver. Repeat with each mode and a late spectator. Chat must reach everyone.
5. Briefly disconnect one client's network for a few seconds. Restore it within 20 seconds. That client should return to the same car/match; the other client should continue. Test an intentional departure, rematch consent and Find Next Match separately. A deliberate server restart should instead show a clear restart/closed-session result.
6. Repeat with PC two on a **different home network or a phone hotspot**. Both clients make outbound WSS connections to the public server; neither needs port forwarding. A localhost or private LAN invite cannot work across houses.
7. For network emulation, use a controlled test network with 50/100/150 ms RTT, jitter and roughly 1–3% loss; restore normal settings afterwards. Do not interpret a browser HTTP-only throttle as a complete WebSocket/network emulator. Record both clients' ping, prediction diagnostics, FPS and whether contacts were delayed. Never include tokens/packets in a public recording/log.

A nearby server removes the browser host's simulation advantage and a distant peer relay. Each player's route still differs, so their ping cannot be forced equal. Singapore is a free starting point, **not a guarantee of 100 ms in Australia**. TCP/WSS is simple to deploy across NAT but retransmissions can stall later packets; prediction/interpolation mask brief gaps, not several seconds of congestion. Public-region latency, prolonged packet loss, browser rendering and real two-house play require the checks above; the automated results do not substitute for them.

See [implementation and automated evidence](online-server.md) and [Git workflow](git-workflow.md).
