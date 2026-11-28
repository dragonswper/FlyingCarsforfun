# Arena connections

The Pit uses direct WebRTC data channels. Practice across two tabs uses BroadcastChannel in the same browser profile. No account, relay, or lobby server is involved.

```text
Host                             Guest
Create offer and gather ICE
Copy RE5 offer ----------------> Paste offer
                                 Gather ICE and create response
Paste response <---------------- Copy RE5 response
Data channel opens <-----------> Both see Connected
Send Ready <-------------------> Send Ready
Send Start --------------------> Both count down
Run 60 Hz combat <-------------- Guest inputs at up to 30 Hz
Send snapshots and impact IDs -> Guest renders the authoritative result
```

Direct descriptions use gzip when it reduces the code. The receiver checks the protocol marker and limits encoded and decoded sizes before opening a peer connection. A build mismatch tells both players to refresh before making a new invite. The short two-tab code identifies a local channel. A short cross-machine code would need a rendezvous service.

The host keeps the only authoritative health, guard, hit-stop and match state. Guest movement is eased over a few simulation ticks and fades if packets stop. Combat, facing and guard inputs are applied immediately. Matching swing IDs allow a late combo during recovery. The guest renderer eases positions toward the latest snapshot and deduplicates impact feedback by event number.

A temporary ICE interruption can recover on the same channel. If the channel closes, return to Arena and exchange a fresh invite. There is no saved match to resume after a browser reload. Two networks that cannot connect directly need a relay, which this build does not provide.

Focus and hit-combo state are included in authoritative actor snapshots. Guests send only an activation request; the host checks earned charge and controls the four-second duration and per-fighter time scale. Both fighters can counter with Focus. RE5 invites separate these rules from older builds.

## Co-op Frontier

Co-op uses the same transports in a star: one host plus up to three guest channels. Codes begin `EXP1.RE5.` and cannot be used as Pit invites. Each guest gets a fixed `ally-1`, `ally-2` or `ally-3` seat. A profile acknowledgement is required before Start enables. The host distributes the world seed, size, appearance roster and shared start; guests send input for their own seat only. Nicknames are rendered as text, not HTML.

The host simulates at 60 Hz, receives input at up to 30 Hz, and broadcasts snapshots every 80 ms. Inputs have monotonically increasing sequence numbers. Movement is finite and clamped; action requests are queued once per simulation tick. Controls expire after 500 ms without input. The host validates gear, relic offers, Focus, stamina and hit timing. Guests validate snapshot IDs, combat state, health, positions and campaign bounds before replacing their view. The renderer eases poses between updates. Guests do not locally simulate authoritative damage, and direct online play still has network latency.

WebRTC data channels encrypt traffic with DTLS; this release adds no plaintext game socket or external matchmaking service. Local two-tab practice stays within BroadcastChannel in the same origin/browser profile. There is no TURN relay, account service, host migration, reconnect checkpoint or guaranteed NAT traversal. If a player disconnects their fighter becomes inactive; if the host disconnects, guests get a clear return-to-menu prompt. Start a fresh run to reconnect.

A solo campaign uses three captains at 280 health each. Co-op scales captain health by 45% per additional player and grants each human their own relic choice. Classic Frontier, offline bots and Arena stay separate from this campaign protocol.
