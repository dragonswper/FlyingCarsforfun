# Live game and dedicated server

**Play:** https://flyingcarsforfun.connstors.workers.dev

The same address serves the updated browser game and its secure dedicated game service. The older ChatGPT-hosted link remains on its previous build; use the Cloudflare address for the current client/server. The server reports **boost-circuit-1.17.1**, and its public client protocol matches the tested source.

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
