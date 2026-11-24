# 1.28 — motion, menus and server runtime

The game now has a dedicated `dist/animation/` presentation layer. All 16 garage
bodies share signed wheel rotation, steering, acceleration lean and bounded
landing suspension, while supplied character/action clips retain their existing
speed-driven behavior. Boost ignition and release ease smoothly instead of
appearing/disappearing abruptly. Pads retain their spherical pickups and add a
short eased respawn. Cosmetic animation never changes the shared collision
shape, authoritative position or input prediction.

Every field receives four team pennants created in Blender. The editable
`art/stadium-pennant.blend` and reproducible generator are included. Its 192-triangle,
6 KB export is shared across the eleven fields; pennants and poles add two
instanced draws, no textures or network messages. Wind animates explicitly named
forest foliage without updating frozen instance transforms. Existing snow/grass
effects share the ambient clock. Display → Animation Motion offers Device,
Full and Reduced settings, saved in this browser. Reduced motion retains wheel
and steering feedback while stopping optional ambient motion and body rocking.

The UI uses a consistent navy/steel/blue palette, readable sports headings,
clear primary/secondary actions, restrained surfaces and visible focus states.
The desktop garage has a fixed header/close button and scrolling catalogue.
Match settings scroll inside their panel while Find Match and Back remain
reachable. Music opens a populated dialog on desktop and mobile using one set
of audio controls. Advanced connection details start collapsed and remember a
manual expansion through resizing. Small portrait settings rows stack their
selects; long player names truncate within the profile card. Saved HUD anchors
and custom layouts remain available.

The server folder has domain modules for adapters, HTTP, runtime, sessions,
transport, input, authentication, matchmaking, social profiles and storage.
Stable root exports preserve existing deployment/import paths. Node and
Cloudflare now share the bounded session/ticket/social API. Physics remains
120 Hz with 30 Hz binary snapshots and up to 60 Hz input sends. The scheduler
limits a callback to 12 physics steps, carries a bounded short debt and publishes
the newest world once after catch-up. Idle/pause/lobby transitions reset debt.
The input path decodes each frame directly instead of constructing a temporary
`RemoteInputs` parser and arrays for every accepted frame.

Standalone profile transactions now serialize before creating their drafts:
simultaneous saves cannot replace one another with an older copy. Writes use
atomic rename; a failed transaction does not block later saves. Cloudflare
continues using its existing SQLite Durable Object storage, name and migration.
Anonymous rolling callback/debt counters are available in `/health`; supported
modes and protocol features are advertised in `/server-config.json`. TLS,
origin-bound admission, single-use tickets, input validation, reconnects,
matchmaking, spectators, chat and friends retain their existing behavior.

See [`server/README.md`](../server/README.md) for extension points and
[`dist/animation/README.md`](../dist/animation/README.md) for animation ownership,
budgets and Blender regeneration. The existing free hosting configuration stays
in place. Lower simulation/allocation overhead can reduce server-side stalls;
it cannot remove distance, routing delays or the players' 180–220 ms round trip.
No zero-lag or physical-phone frame-rate claim is made from cloud tests.

## Verification

Chromium renders and drives all eleven fields, swaps and drives all 16 vehicle
bodies, and verifies saved reduced motion and the device preference without
JavaScript or shader errors. UI acceptance covers desktop, small landscape and
320–390 px portrait widths, reachable actions, 44 px compact touch targets,
keyboard settings, music controls, garage scrolling and readable primary-button
contrast. Existing camera/surface-clearance and deterministic driving trials
retain their checks at 30–240 FPS, 50–200 ms latency, 3% missing packets and
render hitches. Both server adapters exercise all five modes, late spectators,
private joins, reconnects, matchmaking and malformed requests.

The deterministic eight-client benchmark runs 5,000 physics ticks with actual
input decoding and binary snapshot serialization, three runs per repetition.
Two alternating repetitions on the idle workspace measured median CPU time of
330–339 ms on v1.27 and 298–300 ms here, approximately 9–12% less. Each run
sent the same 15,352,952 bytes. This measures server CPU only; the earlier
background-browser runs are excluded. [Recorded results](benchmarks/runtime-1.28.json).

All **482 automated tests**, the recursive JavaScript syntax check and the
Cloudflare deployment dry-run pass before publication. New checks cover bounded
scheduling/debt, input validation, split UTF-8/request limits on the shared API,
Node HTTPS error responses, concurrent profile saves, animation isolation,
respawns, reduced motion and the actual Blender pennant export.
