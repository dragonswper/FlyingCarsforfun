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
admin/      PIN verification, expiring email codes and private operational APIs
matchmaking/ Whole-party tickets, team packing, socket transfers and 60-second bot fallback
social/     Profiles, friends, presence, invitations and lobby discovery
storage/    Serialized atomic Node profile persistence
cli.mjs     Standalone configuration and graceful shutdown
```

`GameService` owns the squad registry. `SquadCoordinator` preserves authenticated
membership while moving live sockets between lobby and match sessions. Queue
packing places a two-person party on one team; arrivals, role changes and
connection loss cancel its ticket. Only its leader can search or move the group.
Public searches use regulation rules. Private Custom/Hoops options are normalized
by the same whitelist used by browser prediction.

`maxRooms` bounds active/preparing matches. Ordinary lobby admissions are separately
bounded (eight by default), with reserved bounded capacity for returning groups.
A busy authority keeps searches waiting. Transfers and load aborts invalidate
client preparation generations; loaders must check both generation and live link
before acknowledging. Preparation/reconnect uses a 60-second grace, while live
play retains its short watchdog. Never reset the Durable Object name/migration
to deploy this change: it would split discovery and existing profiles.

Physics remains 120 Hz, inputs are sent at up to 60 Hz and snapshots at 30 Hz.
Idle/lobby cadence is 10 Hz. `FixedStepScheduler` permits at most 12 fixed steps
per callback and retains up to 150 ms of short debt; time beyond that is counted
as discarded debt rather than causing an unbounded catch-up spiral. Rooms publish
the freshest state once after catch-up. Paused/lobby time is never simulated.

`/api/admin/overview` includes bounded-window timing/debt counters after two-step admin authentication. Public `/health` keeps minimal build/room/queue status. No player names,
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

Admin setup and security boundaries: [admin-security.md](../docs/admin-security.md). Private settings are required; no PIN-only or development bypass is available.
