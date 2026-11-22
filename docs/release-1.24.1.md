# 1.24.1 — Optimization update

Play: https://flyingcarsforfun.connstors.workers.dev — reload all players for **boost-circuit-1.24.1**.

This update reduces work in the shared car collision solver, grass allocation and match loading. It also removes unused replay recording from the dedicated authority. All eleven arenas and the existing game modes remain available.

## Collision CPU and allocation

Profiling the previous version identified car/arena collision solving and temporary-vector garbage collection as major costs. Chassis support queries now reuse their internal basis vectors and cache the last orientation. A changed quaternion, including a mid-solve wall-to-ceiling turn, updates the basis immediately. These internal vectors never escape through contacts.

The solver skips surfaces that cannot reach the chassis or curved transitions, using a conservative bound that includes the retained-contact skin. Non-unit orientations use the full original path. Contact handling, collision iterations and physics/network frequencies are unchanged.

A separate comparison against the 1.24.0 solver tested **4,000** ground, aerial, wall, corner, ceiling, goal, out-of-bounds and non-unit-orientation cases. Positions, velocities, rotations, impact values and contact normals/gaps matched exactly. Recorded states and events also produced identical trace hashes for two 40-second match scenarios.

The same cloud machine measured these headless CPU workloads (median of five runs; elapsed time to simulate 40 seconds, including trace generation):

| Workload | 1.24.0 | 1.24.1 | Elapsed-time reduction |
| --- | ---: | ---: | ---: |
| 2v2 with Expert bots | 227.8 ms | 210.6 ms | 7.6% |
| Eight human-controlled cars | 309.8 ms | 227.3 ms | 26.6% |

A 500,000-query support check created **zero** cloned temporary vectors, versus 1,500,000 previously, with the same accumulated result. These measurements are controlled CPU benchmarks, not browser frame rates or latency guarantees. Scheduling and JIT warmup affect elapsed timings.

Run the portable benchmark with:

```sh
node --expose-gc scripts/benchmark-optimization.mjs
```

Optionally pass a second checkout's `dist/` directory to run the same workload against another release. The output includes timing samples, trace hashes, support-query clone counts and initial grass-buffer bytes.

## Graphics and loading

Grass offsets and variation buffers now allocate when grass is first visible, sized to the requested detail. Default/off/mobile startup avoids **1,800,000 bytes** of grass attributes and their initialization loop. Low grass creates 480,000 bytes; High grows to the original 1,800,000-byte budget. Repeated quality changes reuse capacity, and deterministic prefixes preserve the existing blade layout. Growing releases the old GPU bindings before replacing the attributes. A smaller explicitly requested capacity is honored.

Match preparation now waits for arena/model downloads, selects the shared field, uploads its pitch texture and prepares shader variants before signalling readiness. Both dedicated and browser-hosted sessions, private rooms, bot fallback and bot rematches use this path. Leaving during a download prevents it from selecting an old field over a newer menu or match. Shader work is moved into loading; this does not eliminate every driver or first-use upload cost.

The dedicated server no longer creates local camera-replay snapshots it never uses. Browser hosts keep their replay history, and networked clients continue recording their received states for visible replays.

## Verification

All **432 automated tests** pass, including wall/ceiling driving, inverted recovery, ball prediction, guest reconciliation, rematches, controller/mobile settings and arena checks. New tests cover support geometry/cache invalidation, temporary-vector allocations, lazy grass capacity/layout, headless replay equivalence and preparation/cancellation ordering. Syntax checks and the Cloudflare dry-run build pass.

A two-context Chromium check loaded the same Orbital Station for both players, moved both to Red Rock Canyon after a voted rematch, then drove the guest. The software renderer triggered connection recovery while drawing the fields; the test recovered and completed without JavaScript errors. It is not a physical-device smoothness measurement. The graphics check exercises grass Off/Low/High/Off/Low with actual GPU draw counts and drives afterward. Physical phone frame rates, separate home networks and OCE latency require player testing.
