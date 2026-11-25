# 1.28.1 — matchmaking across compatible releases

Online searches previously required an exact application build string at
authentication and on every lobby/configuration response. A tab left open on
v1.27 or v1.28 could therefore stop with “Game versions differ” after a visual
update, even though its simulation and binary snapshots were unchanged. A
saved address pointing at an older server produced the same dead end. The
live v1.28 client and server were aligned during diagnosis; the original
screenshot alone cannot distinguish an old loaded module from a different
saved endpoint.

The dedicated authority now admits only the explicitly verified compatible
builds: **1.27.0, 1.28.0 and 1.28.1**. Each authenticated connection keeps its
negotiated build for reliable welcome, lobby, configuration and reconnect
responses. Shared packets are never mutated, binary snapshots are unchanged,
and all players still use the same authoritative simulation. Changing the
claimed build within an authenticated connection remains invalid. Unknown
or unverified versions are rejected; this does not disable version checks.

`/server-config.json` advertises supported builds. New clients check that
metadata before allocating a guest session or WebSocket. A genuinely
incompatible server reports the local/server versions, reveals Connection &
Ping Settings and offers **Reload Game**. Changing the server address makes
Find Match available again. Reload preserves the current route, invitation,
username, key bindings, HUD layouts and other saved preferences. Discovery
failures or older servers without that endpoint still use the authenticated
handshake rather than being blocked by the optional check.

The current game remains at
https://flyingcarsforfun.connstors.workers.dev/. An open compatible v1.27/v1.28
client can retry against this server; a normal reload installs the new update
and its recovery UI. A separate old self-hosted server must be updated or
replaced in Connection & Ping Settings.

## Verification

Unmodified archived v1.27 and v1.28 clients were exercised against the new
Node authority, alongside the new client. Private joins, two-human matchmaking,
driving, same-car reconnect and a shared rematch passed. Committed tests pin
the legacy gameplay, catalog and binary-schema hashes so future rule changes
require removing or revalidating those compatibility entries. Node and
Cloudflare tests verify per-client build tags in a mixed-version game, preserve
strict authentication and reject unsupported builds or changed build claims.

Chromium checks at desktop, phone portrait and phone landscape sizes verify the
visible update action, zero attempted sockets to an incompatible endpoint,
saved preferences through reload and a successful online session after
correcting the server address. No JavaScript errors were reported.

For future releases, retain a legacy entry only while its gameplay and wire
format match. The server does not translate physics or accept arbitrary older
versions. Compatibility changes are isolated from transport encryption,
credential storage and the simulation tick rate.

All **491 automated tests**, the recursive syntax check and the Cloudflare
deployment dry-run pass before release. Discovery exposes build metadata only
to allowed browser origins; credential, WebSocket and input validation remain
active. Public deployment is verified against the saved source and tested with
secure private sessions, reconnects and matchmaking.
