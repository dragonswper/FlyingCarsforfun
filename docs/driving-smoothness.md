# Smoother dedicated-server driving — 1.17

The previous update protected predicted ball touches. This update addresses repeated speed changes and stutter while driving online, including when throttle and steering stay constant.

## Two causes

**Replayed held-input time.** The server advances physics at 120 Hz, including between input packets. Its input acknowledgement identifies the most recent actual control it consumed. That acknowledgement can stay unchanged while the server continues driving with held controls. The client compared that later car state against its older prediction at the acknowledgement, then replayed pending inputs for time the server had already simulated. Even a steady connection with ordinary packet/frame jitter could repeatedly speed up or pull back the car.

The server now tracks its simulated input timeline separately from acknowledgements and includes that timeline in each player's snapshots. The client compares the corresponding historical pose and only replays input steps beyond that timeline. Late controls replace held controls without putting old physics time back in the queue. Real jump press edges remain bounded and are applied once. ACKs still describe consumed controls; missing packets are not falsely acknowledged. Physics still advances once per server tick, and clients cannot advance it using a submitted time delta or position.

After a long rendering hitch, the browser deliberately limits physics catch-up. Its input clock can then fall behind even while packets continue arriving within the connection timeout. The server now realigns that sequence clock to fresh controls when the skew exceeds eight ticks, without rewinding or advancing physics. This prevents a slow frame from leaving every later snapshot ahead of the client's prediction history. Regressions verify recovery after repeated 220 ms rendering pauses and an actively sending slower client clock.

**Fixed-step presentation.** Local play already interpolated between physics states. Online play displayed the newest own-car and ball prediction directly. Uneven frame timing therefore produced uneven movement distances; a 144/240 Hz display could render repeated positions between the 120 Hz steps. The online renderer now interpolates its two latest predicted poses using the real frame accumulator. It preserves the interpolated visible pose through ordinary corrections, and resets the buffer for phase changes, respawns and genuine teleports. Camera tracking follows the same rendered car.

The presentation buffer adds at most one physics step, about **8.3 ms**, while controls continue to simulate immediately. It changes presentation rather than engine acceleration, handling constants, collisions or the authoritative score. The existing predicted-touch protection and immediate impact effects remain in place.

## Evidence and limits

A live Chromium baseline on 1.16 used two independent browser contexts, normal HTTPS/WSS certificate verification and the public Cloudflare server. At **213 ms game ping from the cloud workspace**, it recorded 12 repeated-ACK snapshots, a 95th-percentile car correction of **0.34 m**, and **27.5%** 95th-percentile rendered-speed variation relative to physical speed during steady steering/throttle. This reproduces the problem without needing contact with another car or the ball.

The same public browser driving check on the first 1.17 deployment, at the same **213 ms** ping and over **510 rendered frames**, reduced that measured speed variation to **0.1%** and the 95th-percentile correction to **0 m**. Both runs saw 12 repeated-ACK snapshots; the update handles them rather than requiring a reduction in network delay. A separate rendered WebGL session passed lobby creation, Ready/Start and keyboard driving, and the live predicted-ball test still preserved a touch through six older snapshots with no erased impulse or duplicate impact effect. Software-rendered cloud FPS is not evidence of player GPU performance.

The new deterministic driving trial advances server ticks, render frames and packet arrivals on independent clocks. It includes uneven frame intervals, approximately 3% missing input/snapshot packets, jitter and reordered updates. At 200 ms RTT, the old path produced **77%** 95th-percentile speed error in the 60 FPS scenario. The updated path produces about **0.3%**, no stationary render frames during steady movement, and no correction at the 95th percentile. The 30, 90, 144 and 240 FPS scenarios also remain continuous, with under 0.5% 95th-percentile speed error in that fixture.

These are frame-pacing and networking consistency measurements, not a claim that the game achieves those frame rates on a particular GPU. The **307-test suite** also covers the original latency, collision, ball-response, controller, all-mode Node/Cloudflare, lobby, matchmaking and reconnect behavior. New regressions cover held controls, late frames, delayed jump edges, independently timed rendering and preservation of a partially interpolated pose during correction.

Developer prediction diagnostics now also report `serverInputTick` and `serverHeldSteps` through `window.boostCircuit.getPerformance().prediction`. Connection Details continues to distinguish game ping from the server input buffer. Real network ping and genuine connection warnings are unchanged.

## Try it on two PCs

1. Hard refresh the [live game](https://flyingcarsforfun.connstors.workers.dev) on both PCs. The matching client/server build is **boost-circuit-1.17.1**.
2. Join the same dedicated match. Drive a steady circle away from the ball, then test throttle release, reversing, steering changes, jumping and directional flips.
3. Take turns challenging the ball and each other. Server corrections after disputed contacts can still occur; steady driving should no longer repeatedly replay held-input time.
4. Compare Options → Network and the performance display. If the whole scene has low FPS, try Auto or Low graphics separately from checking game ping. Test on separate home networks as well as the same Wi-Fi.

The free server remains on the same Cloudflare deployment. No paid service, installation on the player's PC or router change is added. The cloud tests do not establish Australian home-network latency or GPU performance; reducing the physical 180–220 ms route still depends on hosting location and network routing.
