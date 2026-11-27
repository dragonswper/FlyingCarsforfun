# Arena connections

The Pit uses direct WebRTC data channels. Practice across two tabs uses BroadcastChannel in the same browser profile. No account, relay, or lobby server is involved.

```text
Host                             Guest
Create offer and gather ICE
Copy RE3 offer ----------------> Paste offer
                                 Gather ICE and create response
Paste response <---------------- Copy RE3 response
Data channel opens <-----------> Both see Connected
Send Ready <-------------------> Send Ready
Send Start --------------------> Both count down
Run 60 Hz combat <-------------- Guest inputs at up to 30 Hz
Send snapshots and impact IDs -> Guest renders the authoritative result
```

Direct descriptions use gzip when it reduces the code. The receiver checks the protocol marker and limits encoded and decoded sizes before opening a peer connection. A build mismatch tells both players to refresh before making a new invite. The short two-tab code identifies a local channel. A short cross-machine code would need a rendezvous service.

The host keeps the only authoritative health, guard, hit-stop and match state. Guest movement is eased over a few simulation ticks and fades if packets stop. Combat, facing and guard inputs are applied immediately. Matching swing IDs allow a late combo during recovery. The guest renderer eases positions toward the latest snapshot and deduplicates impact feedback by event number.

A temporary ICE interruption can recover on the same channel. If the channel closes, return to Arena and exchange a fresh invite. There is no saved match to resume after a browser reload. Two networks that cannot connect directly need a relay, which this build does not provide.
