# Dedicated server route check — v1.31

Open [Connection Check](https://flyingcarsforfun.connstors.workers.dev/connection-test)
or **Options → Network → Run Connection Test**. The tool separately measures the
stateless Cloudflare entry point and the authoritative service's HTTPS endpoint.
It discards connection warm-up, takes five samples per route and reports medians.
It does not replace or subtract anything from the in-game WebSocket Game ping.

An entry-point label such as `SIN` means Singapore; it does **not** reveal where
the Durable Object game authority is running. `loc=AU` on Cloudflare's trace page
identifies the visitor's country, not the server's. Do not share the full trace
page because it includes an IP address. The new tool returns no IP, profile,
authentication or precise-location data. Copy Results includes only route samples
and entry-point labels. Requests omit credentials and cannot create game rooms.

A 25–50 ms goal requires nearby hosting and a short route. A distant entry point
can already exceed that goal; extra time between the entry point and the game
service points to further routing/placement delay. HTTPS samples and live
WebSocket RTT are different measurements and may differ due to scheduling,
protocol handling and congestion. They do not prove the authority's exact city.

Cloudflare's [location policy](https://developers.cloudflare.com/durable-objects/reference/data-location/)
says placement hints are best effort, only the first lookup honors a hint, and
existing objects do not automatically relocate. This deployment requests `oc`,
uses one persistent shared object and cannot promise Australian placement.
Changing a matchmaking region filters opponents; it does not migrate that object.
Do not rename it as a latency shortcut: it also owns the existing social data.

**Solo practice:** Training → Free Play runs on the player's own device. Using
Dedicated Server → Free Play still connects to the remote authority, even with
one player. Local practice avoids server round trips but does not improve online
ping. For multiplayer, compare the route samples before choosing Australian
hosting or a direct peer route. No paid service, PC installation or router change
is introduced by this diagnostic patch. It leaves v1.31 physics and wire rules
unchanged.

The current server's timing counters can identify simulation backlog, but a
healthy counter does not establish a low-latency Internet route. Do not lower
warning thresholds, relabel edge ping as game ping or promise a global latency.

---

# Ping admission and connection routing — 1.13

The reported failure was Australian/Oceania players seeing 300–600 ms and repeatedly being refused an online match. That reading can include both network travel and the time the browser/game takes to process messages. This release improves the connection attempt and measurement, and makes casual admission warning-based. It does not promise 100 ms for every internet connection or disguise high latency as a lower number.

## Player settings

In **Online Match** or **Options → Network**, choose **Oceania** on both Australian clients to search the same regional queue. Regions filter opponents; they are not dedicated server locations. Worldwide remains a separate queue.

**Warn and connect** is the default. The saved ping number becomes a preferred range: a connected opponent above it can still join, and real high ping remains visible. **Enforce Ping Limit** treats the number as a hard maximum. Either player's strict limit is respected; warning-only preferences do not reject the other player. **Any Ping** removes that player's maximum. These choices save locally and apply to the next search. Existing saved region/ping numbers are retained, with warning mode as the default until strict mode is explicitly selected.

## Connection attempt

The service currently supplies STUN and a shared TURN relay address with UDP/TCP options. Signaling introduces browsers; it does not carry gameplay packets. The initial attempt gathers direct candidates without the relay. After the initial SDP offer/answer exchange finishes, it gets a **4.5-second direct connection window**. If that path cannot open, the existing provider's TURN configuration is enabled through ICE restart, with a bounded fallback deadline. No new relay account or paid service was created.

The direct window starts after negotiation instead of expiring while the initial exchange is unfinished. Fallback waits for stable signaling, and its offer tells the answering peer to enable relay gathering before answering. Candidates that arrive ahead of a new SDP are buffered by generation/mid; stale or rejected candidates do not tear down an otherwise viable connection. Cancellation and successful startup release timers and candidates.

A regional TURN service may still be needed when restrictive networks require a relay and the existing relay route is slow. Its availability, geography and the players' real route must be measured before claiming a regional latency improvement. This change does not replace the provider's relay or guarantee a specific path.

## Ping and diagnostics

The previous check fired three reliable probes together as the connection opened, then rejected the opponent using the largest response time. The new check warms up the channel and sends **seven probes 180 ms apart**, starting after 300 ms. It measures the realtime gameplay channel, avoiding reliable-channel retransmission delay. The median determines admission, so a single startup outlier does not veto a steady connection. At least three responses are required within five seconds; warning mode does not admit a connection with no functioning gameplay replies. Unsolicited IDs and mismatched timestamps are ignored. Realtime heartbeat replies and packet counters also continue during play.

The showroom stops drawing while matchmaking/preparation is active, leaving the displayed frame behind the search dialog. This reduces background rendering work during the connection test; it is not a measured FPS claim.

**Connection Details** and the match HUD distinguish:

- **Game:** measured application round-trip response, including browser/game scheduling and channel delay.
- **Network:** the active ICE candidate pair's native round-trip measurement, when the browser exposes it.
- **Direct / Relayed, UDP / TCP / TLS:** the selected route and available transport metadata, without displaying addresses or credentials.

Unavailable measurements remain unavailable. A low native network measurement with a much higher game response suggests delay beyond the network measurement; the menu suggests Low graphics and keeping tabs visible. A relayed path is identified so further routing work can be based on evidence. Native network RTT uses STUN checks and can update at a different cadence from gameplay probes; these are separate measurements.

References: [MDN native round-trip measurement](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats/currentRoundTripTime), [MDN WebRTC statistics](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats), and the existing NetplayJS signaling/provider protocol. Original implementation and reference notices remain in this repository.

## Verification

**224 automated tests pass**, together with JavaScript syntax and static HTML/module checks. New behavioral tests cover genuine 300/600 ms links, an isolated 600 ms startup outlier, packet loss, absent replies, cancellation, both players' strict preferences, automatic OCE matches, timer cleanup, route selection and unit conversion, unsupported statistics, explicit saved controls, slow initial signaling, relay restarts and future/stale candidates.

Actual public-signaling/WebRTC checks passed the direct-first and forced fallback-renegotiation paths, with seven accepted samples per player and 99 acknowledged guest inputs in each. Their measured game RTT was 0–1 ms on the same-container data route; that is not an Australian WAN measurement. The forced fallback test enables the application relay phase but deliberately keeps native ICE candidates on the local test route. It verifies SDP/ICE renegotiation rather than public TURN traversal.

A separate four-client actual WebRTC session passed two players, two spectators (including the host), guest input ownership, independent reconnect, shared bounded chat, mutual rematch and cleanup. Recovery took 11.263 seconds, with 118 controls acknowledged before the drop and 99 after counter reset.

The managed browser-control tool remains unavailable. No alternate browser, preview server or browser installation was used. Browser rendering, physical controller behavior, independent-home-network NAT/TURN traversal and the two players' actual Australian latency remain unverified. All work was in the cloud workspace; no software or settings were changed on the user's PC. Public website access is preserved.
