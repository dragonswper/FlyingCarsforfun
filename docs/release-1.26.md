# 1.26 — network and frame-budget update

This update reworks the dedicated server's snapshot delivery and the browser's prediction/render scheduling. The server was serializing the same world separately for every player; the guest allocated fresh history arrays and reconciliation vectors continually. Uncapped desktop drawing could also compete with input and physics on busy devices.

## Server and transport

- The authority builds one binary world frame per update and adds independent sequence, ACK and input-timeline headers for each recipient. Every sent packet owns its bytes. Positions, rotations and vehicle dynamics use float32 values; match clocks retain float64 precision, and integer scores remain exact. This carries the complete state needed for prediction, including roof recovery, flips and training metadata.
- All dedicated modes now publish at 30 Hz, including larger matches previously at 20 Hz. Fixed 120 Hz physics catches up first and then publishes the final state, avoiding an unnecessarily old snapshot after a timer hitch.
- Realtime backpressure drops obsolete sends and resumes with the newest state. Skipped sends do not create artificial packet-loss sequence gaps. Reliable lobby, event, chat and reconnect messages keep their existing JSON handling.
- Frames have a version, declared byte length and bounded player/text counts. The decoder rejects unsupported, truncated, oversized and non-finite data; existing semantic state validation still runs before reconciliation. Authentication, input validation, WSS/TLS, lobby limits, friends and the free Cloudflare deployment remain in place.

## Browser and rendering

- Prediction reuses bounded history objects/arrays, reconciliation scratch vectors and the pending-input array. Input responds locally; correction still compares the acknowledged server timeline and blends visual error.
- **Options → Display → Frame Rate Limit** saves 30, 60, 90, 120, 144 FPS or Display Refresh. The default is 60 FPS; phones remain capped at 60. Inputs and 120 Hz physics continue between skipped draws. Auto quality evaluates the chosen frame target, including a deliberate 30 FPS limit.
- Existing camera protection, aircraft surface clearance, vehicles, fields, turf, scoring, controls and match rules are retained. This is a focused replacement of the busy runtime paths, not a replacement of the entire game or its artwork.

## Measurements and checks

In the same cloud workspace, `scripts/benchmark-snapshots.mjs` measured three batches of 1,000 eight-player publishes. The median fell from **258.97 ms to 41.47 ms** per batch, approximately **84% less snapshot preparation/send CPU**. Bytes across 3,000 publishes fell from **133,449,209 to 43,368,000**, approximately **68% less per publish**. With the larger-match cadence increasing from 20 to 30 Hz, corresponding snapshot traffic still falls by approximately 51%. These figures concern the snapshot path, not total server CPU or a promised player FPS.

`scripts/benchmark-prediction.mjs` tracks history quaternion arrays during 5,000 deterministic prediction steps with delayed authority updates: the previous client produced 5,000 distinct arrays per run; the new client reused 17. The one-second history window remains bounded at 121 entries. Additional driving trials transport actual binary frames at 30/60/144 FPS and 50/150/200 ms RTT with 3% missing packets, jitter and repeated 220 ms render hitches. They report zero stalled measured frames or instantaneous snapshot displacement and remain within the existing speed/correction tolerances.

Two Chromium clients over a local, explicitly trusted HTTPS/WSS fixture received 622 binary frames (424,204 bytes) while testing guest driving, authoritative shots/saves, scoreboards, MVP, a shared randomized rematch and a saved frame-cap change during play. All modes, private joins, reconnects, spectators, encryption and malformed-frame handling also have automated coverage. All 465 tests, the syntax check and Cloudflare dry-run pass before publication, followed by public build/asset and secure multiplayer checks.

These are software-rendered cloud and deterministic checks. They do not establish physical-phone FPS or eliminate the 180–220 ms geographic/network RTT reported by Australian players. Ball touches and driving remain locally predicted; shared confirmed outcomes and remote players still depend on the network route.

## Try the update

Reload the game on **every player's device** and confirm version **1.26.0**. Start with **Auto graphics** and **60 FPS**. If a device struggles, use Low/Mobile graphics or 30 FPS; a fast high-refresh display can select a higher limit. Test private joins and matchmaking across two home networks, drive/flip on walls and ceilings, touch the ball repeatedly, and compare responsiveness, visible corrections and FPS separately from the ping number. No paid host, dependency installation or change to your PC is required.
