# No-card hosting with Cloudflare Workers

Render may request billing verification even when **Free** is selected. Do not add payment details to get past that prompt. The alternative prepared here uses **Cloudflare Workers Free + SQLite-backed Durable Objects**, which Cloudflare advertises as available without a credit card. It needs a free Cloudflare account and access to this GitHub repository. No server installation, firewall change or router configuration is needed on your PC.

## Deploy from the existing GitHub repository

1. Sign up/sign in at [Cloudflare](https://dash.cloudflare.com/). Use **Workers Free**. No domain purchase is needed. Avoid R2, Containers, Workers Paid or other upgrades; this game does not require them. If your account unexpectedly requires payment details, stop and share only the wording of that prompt.
2. Open **Workers & Pages → Create application → Import a repository / Continue with GitHub**. Choose a **Worker**, rather than a static Pages project. Authorize Cloudflare's GitHub app for **dragonswper/FlyingCarsforfun only**, then select that repository and branch **main**. This connects the existing repo; it does not require a template clone or another GitHub repo.
3. Use the Worker name **flyingcarsforfun** and repository root **/**. Configure these commands:

   | Field | Value |
   | --- | --- |
   | Build command | `npm run cloudflare:check` |
   | Deploy command | `npm run cloudflare:deploy` |
   | Node version, if requested | `22` or newer |

   Workers Builds installs dependencies from `package-lock.json`. The build command performs a deployment dry run; the deploy command publishes the Worker, static game and its SQLite-backed Durable Object binding. The checked-in [wrangler.jsonc](../wrangler.jsonc) supplies the configuration. No API keys, guest secrets or account IDs need to be pasted into the source or chat. Git integration handles deployment authentication inside your Cloudflare account.
4. Deploy. Cloudflare assigns a URL similar to **https://flyingcarsforfun.YOUR-SUBDOMAIN.workers.dev**. Use the actual address it gives you. Send that public HTTPS address back so the public connection can be checked. The account deployment has not happened merely because the code passes local tests.
5. Open that address on both PCs. The updated game and server share the same HTTPS origin; on a fresh profile, the game selects **Dedicated Server** and fills the address automatically. If you already saved a preference, choose Dedicated Server and paste this URL. Both players choose the same mode, difficulty and **Oceania** matchmaking preference, then **Find Match**.
6. For a private match, use **Private Match → Custom Lobby → Dedicated Server** and share the complete **BCS** invite. Players choose a team or spectate; playing members select Ready and the owner starts. All five modes, bot fill, chat, rematches and 20-second reconnects use the same implementation as the Node service. Follow the existing [two-PC/cross-network checklist](dedicated-server.md#two-pc-and-cross-network-checks).

For later GitHub pushes, Workers Builds may redeploy automatically and end an active in-memory match. Disable automatic production builds in the Worker's build settings if you want to deploy manually between sessions. Keep production on **main** and avoid unnecessary preview deployments when conserving a shared free allowance.

## What runs and what stays free

- **Static game:** all current models, textures and scripts are included as Worker Static Assets. The largest asset is below the 25 MiB per-file limit, and the compressed server bundle is about 100 KiB, below the Free Worker limit. No R2 bucket, paid database, VM or GPU server is created.
- **Authority:** one named Durable Object runs the same 120 Hz physics, input validation, guest authentication, matchmaking and recovery code as Node. A SQLite class migration makes the namespace eligible for Workers Free; the game does not write profiles or match history into that database. The configuration permits **one concurrent match/lobby** and up to eight people in it.
- **Location:** the object requests an **Oceania location hint**. This is best effort and does not guarantee an Australian data centre, identical player ping or 100 ms latency. The dropdown filters opponents; the Worker address and object placement determine routing.
- **Transport:** game/API/assets requests enforce HTTPS. Browsers use WSS with normal certificate verification. Guest credentials and one-use tickets never appear in a URL, invite, Git or application log. One common transport-independent service enforces the same ownership, message/rate/capacity limits for both hosts.
- **Free quotas:** Durable Objects currently include **100,000 metered requests/day** and **13,000 GB-s/day** on Workers Free. Incoming WebSocket messages use a **20:1** metering discount; outgoing messages do not consume that request count. A pair of players sending 60 input messages/second each uses roughly 21,600 metered requests/hour before heartbeats, joins and other account usage. Four active drivers use roughly twice that. This is suitable for limited testing, not unlimited public play. Other Workers/objects on the account share allowances. On the Free plan, quota exhaustion causes failures rather than a paid upgrade; keep the account on Free.
- **Idle/restarts:** this real-time simulation deliberately uses active WebSockets and timers while people are connected, so active duration counts against the free allowance. The pump stops when no rooms, sockets or queues remain. Do not keep unused sessions open. Platform restarts/deployments end in-memory matches; a fresh search is then needed. Recovery only resumes a still-running match.

These limits were checked on **13 November 2026**. [Cloudflare's no-card offer](https://www.cloudflare.com/products/durable-objects/) · [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Location hints](https://developers.cloudflare.com/durable-objects/reference/data-location/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).

## Verification and optional developer commands

The local Cloudflare tests use the real **workerd** runtime through Miniflare, real HTTPS/WSS sockets and an ephemeral explicitly trusted certificate. They cover every mode, spectators, authoritative driving/practice, two-human matchmaking, shared chat, reconnecting to the same car while the other continues, invalid authentication/origins, request-size limits, free room capacity and cleanup. The existing suite continues to test the common 60-second bot deadline, prediction under latency/loss, rematches and Node hosting. These are cloud-workspace checks, not a deployed Cloudflare account or a measured Australian WAN session. Browser rendering and public OCE latency still require the two-PC test.

For an already prepared development machine or cloud workspace:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run cloudflare:check
```

The last command is a **local dry run**, not publication. A developer who already has authorized Cloudflare login can use `npm run cloudflare:deploy`; normal users can stay in the dashboard flow above. No such command has been run on your PC or against a Cloudflare account during preparation.
