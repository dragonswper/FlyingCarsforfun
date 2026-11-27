# Live game and dedicated server

**Play:** https://flyingcarsforfun.connstors.workers.dev

The same address serves the updated browser game and its secure dedicated game service. The older ChatGPT-hosted link remains on its previous build; use the Cloudflare address for the current client/server. The server reports **boost-circuit-1.31.0**, and its public client protocol matches the tested source.

The Colour Court visual update adds brighter illustrated fields and a new hardwood Hoops bowl, while keeping v1.31 gameplay compatibility. [Artwork and checks](color-court-update.md).

Version 1.31 Overdrive adds party matchmaking, adaptive network smoothing, smarter aerial bots, Replay Studio, private mutators, garage loadouts, mobile tuning, Hoops and two solo challenges in three original Blender venues. Refresh every player’s tab for the new shared rules. [Details and checks](release-1.31.md).

Version 1.30 adds the solo Circuit Cup, local career milestones, daily challenges, cosmetics and progress backups. [Details and checks](release-1.30.md).

Version 1.29 adds a 24-drill offline Academy, local medals, practice tools and original Blender training guides. [Details and checks](release-1.29.md).

Version 1.28.2 makes friend invitations create or reuse a shared lobby and renders each joined player’s selected car in the menu. Party members can invite mutual friends; brief lobby reconnects preserve the showroom. [Friend flow, permissions and checks](release-1.28.2.md).

Version 1.28.1 fixes the version-mismatch dead end in online searches, permits the verified v1.27/v1.28 clients, and adds a one-click update action for incompatible builds. [Compatibility and verification](release-1.28.1.md).

Version 1.28.0 adds the presentation animation system, original Blender pennants, Full/Reduced animation controls and a reorganised server runtime. The menu, garage, music and match dialogs share a cleaner desktop/mobile design. [Changes, performance evidence and checks](release-1.28.md).

Version 1.27.0 gives all eleven fields original Blender sky domes, including sunsets, moonlit clouds, winter aurora and orbital stars. [Map skies, source and checks](release-1.27.md).

Version 1.26.0 reworks dedicated snapshot delivery and guest prediction allocation, publishes all dedicated modes at 30 Hz after physics catch-up, and adds saved frame-rate limits with a 60 FPS default. [Measurements and testing](release-1.26.md). Reload every client for the matching binary-snapshot build.

Version 1.25.1 adds C-17 visual clearance at ramps, walls, ceilings and goal interiors, with camera self-obstruction tracking. [Cause and verification](release-1.25.1.md).

Version 1.25.0 adds natural turf, shots and saves with match points, a tappable six-column scoreboard, winning-team MVP and improved bot teamplay/recovery. [Controls, scoring rules and verification](release-1.25.md).

Version 1.24.1 reduces collision CPU/allocation work, allocates grass detail on demand, prepares field shaders during loading and removes unused headless replay copies. [Optimization measurements and verification](release-1.24.1.md).

Version 1.24.0 adds five original Blender arenas, including Christmas and Halloween themes. Online rotation now covers eleven fields; private hosts can select any of them. [New fields, editable source and checks](release-1.24.md).

Version 1.23.2 makes every game under Online Match choose a shared random field, including online practice, bot fill and rematches. Rematches avoid the previous field. [Random arena behavior and validation](release-1.23.2.md).

Version 1.23.1 fixes compact mobile menus, garage and matchmaking layout. [Mobile changes and checks](release-1.23.1.md). Version 1.23 adds the original Harbourworks stadium, saved HUD layouts and fullscreen/mobile menu improvements. [Field and HUD controls](release-1.23.md). Version 1.22 reduces broadcast work, lowers idle server/render cadence and adds a touch-controlled mobile browser preview with lighter models. [Mobile controls and performance measurements](release-1.22.md). Version 1.21 adds persistent browser player IDs, friends, live presence, shared lobby discovery/invites, load-time music and the reference van. Frostvale Festival, camera/ceiling-driving updates and Cinematic rendering remain available. Winterlight Park, Neon City and Evergreen Grove remain available. Private Match hosts can select a fixed field in Arena/Host Options; everyone in their lobby receives that field.

## Join with a friend

1. Open the Cloudflare game address on both PCs and reload any old game tab.
2. Select **Online Match → Dedicated Server**. A fresh browser profile fills the server URL automatically; if necessary, paste **https://flyingcarsforfun.connstors.workers.dev**.
3. Choose the same game mode, bot difficulty and **Oceania** region on both PCs, then **Find Match**. Public 1v1/2v2 searches fill empty driving slots with server bots after 60 seconds. Region preferences must match; they do not force a physical server location.
4. For private play, use **Private Match → Custom Lobby → Dedicated Server**. Create the lobby, copy its complete **BCS** invite and send it to your friend. Choose teams or spectate, select Ready for active players, then let the owner start.

The free configuration permits **one simultaneous lobby/match**, including spectators. Finish or leave that session before starting another. Free daily allowances apply. The deployment requests Oceania placement; it does not promise an Australian data centre, equal ping or 100 ms latency.

## Public verification — 13 November 2026

A bounded check used the real public HTTPS and WSS endpoints with normal certificate verification. It created isolated test sessions, then closed them and confirmed zero rooms/queued players remained.

The check verified:

- The game page, matching build, automatic endpoint configuration and essential stadium/car/ball asset endpoints.
- BCS join, team choice, Ready/Start and two independently controlled client cars receiving authoritative movement.
- A spectator joining the running match.
- One chat message reaching both players and the spectator.
- A guest losing its connection and returning to the **same car, simulation and match**, while the other client's match time continued.
- Two automated humans entering a separate matchmaking queue, reaching the same server match and receiving no browser-host privileges.
- Test lobbies and queue entries being released afterwards.

The two test clients ran in one cloud workspace and connected over the public internet. This confirms live transport/server behavior; it does **not** measure Australian player ping, WebGL performance, controller inputs, full rendered UI behavior or two separate home networks. The cloud test's latency is not a prediction for your location. Use [the two-PC and cross-network checklist](dedicated-server.md#two-pc-and-cross-network-checks) for that final test.

## Optional developer check

With the repository and Node dependencies already available:

```sh
node scripts/check-live-dedicated.mjs https://flyingcarsforfun.connstors.workers.dev
```

The script refuses to start if the shared server is busy. Its matchmaking probe uses an unusual valid duration to avoid ordinary UI queues; it logs no credentials, invite codes or raw game packets. It creates temporary sessions, so run it between games. In a development environment requiring an outbound proxy, Node fetch must use that proxy (`NODE_USE_ENV_PROXY=1` on supported Node versions); the optional `https-proxy-agent` package must also be available, directly or via `BOOST_CIRCUIT_RTC_TEST_DEPS`. None of this tooling is required to play in the browser.

## Browser authentication fix

A separate Chromium check found that calling the stored native fetch with the credentials object as its receiver fails with “Illegal invocation,” before either authentication API request is sent. The corrected client binds fetch to its global Window. Both authentication steps and two-context joining were then verified in Chromium against the public server using the staged client fix. If the old search-stopped error remains after publication, reload the game fully to replace the already loaded JavaScript module. The server URL shown above is correct; changing ping preferences or matchmaking region does not fix this particular authentication error.
