# Local ball response — 1.16

The reported match ping was 180–220 ms for two Australian players. Their own ball touches appeared late despite immediate driving input. Equal ping does not remove the round trip needed for server confirmation.

## Root cause and changes

The client already predicted car/ball contact, but every incoming snapshot replaced the predicted ball. A snapshot from before the touch could therefore undo the local impulse. When the local car's acknowledged pose was close enough to skip replay, the ball was advanced without replaying that contact. A public-server probe reproduced **three erased local impulses before confirmation arrived 233 ms after the first predicted touch**. The same probe found the server clock running approximately in real time; this was not a slow simulation clock.

The client now holds its speculative ball impulse through snapshots that have not acknowledged that contact input. It ends protection at acknowledgement, a new authoritative opponent touch, a phase change or a bounded timeout. Rejected hits still return to authority. Scores, goals, touches and match outcomes remain server-owned; clients send controls, never an accepted ball position or goal.

Impact sound/particles are emitted during the local contact step, with the corresponding authoritative echo suppressed once. Reconciliation does not replay those effects. After confirmation, a recently self-hit ball includes the local car's input-prediction lead as well as the snapshot's one-way age. That extra lead fades gradually into the shared timeline, avoiding a brief backwards pull after the shot. Opponent contacts retain one-way extrapolation. The prediction horizon also changes gradually when a ping sample spikes; the actual measured ping in the HUD is unchanged.

The server had another source of delay: it consumed a FIFO of inputs at the same 120 Hz that clients produced them. A delayed burst could remain queued indefinitely. The small buffer is now bounded to four frames (about 33 ms); a larger burst drops stale movement and retains the newest two frames. Up to two real jump press edges survive that discard, including their release. The server still advances physics once per tick, never fast-forwards from client timestamps, and only acknowledges consumed controls. Controls still neutralize after the existing 300 ms timeout.

**Options → Network → Connection Details** now reports the current server input buffer separately from game ping. Developer diagnostics also expose pending local ball contact and the count of snapshots that preserved it through `window.boostCircuit.getPerformance().prediction`.

## Verification

The automated suite contains **294 passing tests**. The added cases cover 180, 200 and 220 ms round trips with delayed, lost and reordered snapshots; continuous rendered ball motion through confirmation and the later handoff; bounded rejection/timeout/opponent/goal corrections; immediate feedback through both room adapters; server-only scores; validated contact ownership; stale input bursts; two jump presses and release; and real HTTPS/WSS Node and Cloudflare input-buffer diagnostics. Existing movement, controller, lobby, reconnect, matchmaking and all-mode checks remain in the suite.

These tests run in the cloud workspace. They do not establish Australian WAN latency, physical controller behavior or rendered GPU frame rate.

## Two-PC check

1. Hard refresh the [live game](https://flyingcarsforfun.connstors.workers.dev) on both PCs so both use **boost-circuit-1.16.0**. Use the same server, mode and Oceania preference.
2. In a private dedicated match, take turns driving into a stationary ball. Each driver's own ball motion and impact feedback should start on contact rather than waiting for the server round trip. Repeat with jumping/flipping touches and a moving ball.
3. Try an opponent challenge and a goal. Disputed local predictions must settle to the server's result; scores must agree. Confirm that shots keep travelling forward through ordinary updates.
4. Compare **Options → Network → Connection Details** on both computers. Record game ping and server input buffer separately. A short network hiccup must not leave fresh controls behind a long queue; after recovery, check throttle release, reverse, jump and second jump.

A real 180–220 ms route can still show **High Ping**, and unstable delivery can still show a connection warning. These warnings have not been hidden or relabeled as low latency. Server location and network routing still govern confirmation and opponent response. The free Cloudflare deployment requests Oceania placement but cannot guarantee a particular Australian data centre or 100 ms. No paid service, PC installation or router change is required by this update.
