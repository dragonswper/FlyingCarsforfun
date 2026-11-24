# Authoritative service

The Node and Cloudflare adapters run the same simulation/session implementation.
Existing root import paths are compatibility exports; deployment commands and
the existing Cloudflare Durable Object migration keep their stable entry points.

```
adapters/   Node HTTPS/WSS and Cloudflare Worker/Durable Object
http/       Shared bounded session, ticket and social HTTP API
runtime/    Game orchestration, fixed-step scheduling, metrics, capabilities
session/    Authoritative game session and shared match lifecycle
transport/  Reliable and binary snapshot sending/backpressure
input/      Validated 120 Hz control timeline
auth/       Anonymous guest sessions and single-use origin-bound tickets
matchmaking/ Mode/region grouping and 60-second bot fallback
social/     Profiles, friends, presence, invitations and lobby discovery
storage/    Serialized atomic Node profile persistence
cli.mjs     Standalone configuration and graceful shutdown
```

Physics remains 120 Hz, inputs are sent at up to 60 Hz and snapshots at 30 Hz.
Idle/lobby cadence is 10 Hz. `FixedStepScheduler` permits at most 12 fixed steps
per callback and retains up to 150 ms of short debt; time beyond that is counted
as discarded debt rather than causing an unbounded catch-up spiral. Rooms publish
the freshest state once after catch-up. Paused/lobby time is never simulated.

`/health` includes anonymous bounded-window timing/debt counters. No player names,
addresses, credentials, invite codes or positions appear there. `/server-config.json`
advertises supported modes and protocol features for future clients. HTTP bodies
are limited to 4096 bytes in both adapters; WebSocket packets and input queues
retain their existing validation and bounded sizes.

`FileProfileStore.transaction` serializes commits before cloning the draft. A
failed transaction does not block subsequent saves; successful snapshots replace
the private 0600 profile file by atomic rename. Cloudflare continues using its
existing SQLite Durable Object storage. No migration or paid service is added.

For a new mode, implement shared rules/options in `dist/server-options.js` and
the shared simulation first, update capabilities, then exercise matchmaking,
private joins, late spectators, reconnect and rematch on **both** adapters. For a
new transport, adapt the socket contract and retain TLS, admission and bounded
backpressure. Do not accept client positions or client time deltas as authority.

Checks: `npm test`, `npm run check`, `npm run cloudflare:check`.
CPU benchmark: `node scripts/benchmark-runtime.mjs output.json` on an idle machine.
Deployment and two-PC verification: [`docs/dedicated-server.md`](../docs/dedicated-server.md).
