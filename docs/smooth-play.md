# Guest movement, custom lobbies and floor contacts — 1.14

The reported symptoms were repeated guest movement corrections despite delivered inputs, a custom-lobby `maxPeople` exception while joining, and short flips stopping against the floor.

## Guest movement

The previous client stored up to 120 input frames but replayed only the newest 48 after an authoritative state. At 120 Hz that is a 400 ms replay budget. On a 600 ms acknowledgement window, movement from the other 200 ms was discarded and then repeatedly corrected. Reconciliation now replays the full bounded one-second input window. Older frames remain bounded; arbitrarily long outages still require recovery rather than unbounded replay.

The old replay also advanced the ball and other cars for the full input acknowledgement window. That includes both network directions, while an authoritative world snapshot is about one direction old. World replay now uses the measured half-RTT separately from the local input history, avoiding double extrapolation.

Rendering preserves a decaying correction offset when ordinary snapshots arrive. New input motion is applied directly to the predicted pose. Ordinary differences no longer trigger the old four-metre snap or ease all driving movement toward a moving target. Initial states, kickoff/phase changes, respawns and large true teleports still reset explicitly. Remote presentation uses an 85–220 ms jitter buffer with bounded 120 ms extrapolation; its timeline does not reverse when jitter changes. Visual chassis positions respect floor support during orientation smoothing.

`window.boostCircuit.getPerformance().prediction` exposes bounded diagnostic counts, the latest correction magnitude and interpolation delay. Game/network ping and routing remain in Options → Network. These changes improve presentation and correctness; they do not remove real internet delay or make different routes have equal ping.

## Custom-lobby join

A guest emitted its Connecting state before room options arrived. The screen immediately read `room.options.maxPeople`, throwing the exception in the supplied screenshot. Rooms now have safe initial options, and the UI also handles missing options/members. Team/ready controls wait for the local member. The create, actual BC2 join, team, Ready and Start sequence is tested through the real room callbacks and UI renderer together.

## Ground contact and flips

A short jump could bring the nose into contact early in a dodge. That contact was treated as a landing or stopped the dodge torque, leaving the car halfway through a turn. The dodge now retains a bounded spin phase through a light floor scrape and allows wheel landing near completion. The existing angular speed limit and jump constants remain unchanged. Opposing pitch still cancels the pitch portion of a dodge; roof recovery and wall driving remain available. Dodge progress is included in authoritative snapshots so reconciliation preserves it.

A final arena projection now follows ball/car impulses, which could previously push a tilted or stacked car beneath the floor until a later step. Short front/back/side flips finish and land in regression simulations, with non-penetration checked every step. These are analytic handling changes, not a claim of exact native Rocket League contact behavior.

## Separate server

The optional **Dedicated Server** connection runs the authoritative 120 Hz loop in Node.js. The owner and guests are both clients; browser graphics and pause menus do not control server stepping. It supports 2–8 people, spectators, time/team selection, late spectators, chat, reconnect and rematches. BCS invites include the endpoint. Browser-hosted BC2 rooms continue to work.

[Server setup and limits](dedicated-server.md) include a local-only first test and the HTTPS/WSS requirement for internet play. No server was installed or run on the user's PC and no PC network settings were changed. The Node dependency was installed only in the cloud project.

## Verification

**246 automated tests pass**, along with JavaScript syntax and static HTML/module checks. Coverage includes full 600 ms input reconciliation, immediate local motion, one-way world replay, monotonic jitter presentation, floor-safe rendering, all four short dodge directions, stacked contact correction, dodge-state replication, actual lobby UI transitions and real dedicated-server sockets.

Actual public-signaling/WebRTC tests also passed direct-first admission and forced fallback renegotiation, with seven accepted samples per client and 98 acknowledged guest controls in each scenario. A four-client session passed two players/two spectators, independent reconnect, shared bounded chat, mutual rematch and cleanup. Recovery took **12.259 seconds**, with **119** inputs acknowledged before the drop and **98** after reset.

Those WebRTC data routes and the dedicated socket tests were local to the cloud container. The forced fallback check verifies SDP/ICE renegotiation, not public TURN traversal. They do not measure the user's two Australian computers. The managed browser-control tool is unavailable, so browser-rendered feel, GPU FPS, physical controllers and public server TLS/NAT routing remain unverified. No substitute browser or game preview was installed.

All players must reload for **boost-circuit-1.14.0**; a dedicated server must run matching source. The hosted game's current Public audience is preserved.
