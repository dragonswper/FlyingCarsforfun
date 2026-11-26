# Version 1.31 — Overdrive

Overdrive adds party matchmaking, adaptive network smoothing, new bot tactics,
Replay Studio, private mutators, garage loadouts, mobile tuning and three new
modes with original Blender venues. Refresh **every player's tab** after this
release. Its shared rules require a matching v1.31 client and server; older
builds receive the existing update prompt instead of joining incompatible games.

## Play together

In a dedicated private lobby, choose teams and ready up. The party leader can
search for **1v1, 2v2 or Hoops** from the lobby. A pair stays on the same team;
1v1 is for solo searches. Public matchmaking accepts up to two driving friends
per party. Larger groups can still play private matches with up to eight people,
including spectators. Joining, changing a role or losing a connection cancels
the party's search so nobody silently gets left behind.

The search waits 60 seconds for real opponents and then fills missing positions
with bots when the arena is available. A busy server retains the queue instead
of dropping it. After the match, the leader can choose **Find Next Match** or
**Back to Party**. Both move the group together; the latter restores the shared
lobby and its car preview. Find Next retains the party's region preference.

Authenticated socket transfers reuse the existing connection. Player identifiers
stay on the server. An interrupted arena load returns groups home, invalidates
stale loaders and frees the arena. Loading gets a separate 60-second grace
period; active games retain the short connection watchdog and reconnect window.

The $0 Cloudflare deployment still runs at most **one active/preparing match**.
It now admits up to eight ordinary lightweight lobbies with bounded reserved
space for returning groups. This is a small shared test server, not unlimited
simultaneous matchmaking. It creates no paid infrastructure and changes no
player's PC, firewall or router.

## Responsive networking

The authority remains at 120 Hz, snapshots at 30 Hz and client inputs at 60 Hz.
Local prediction responds immediately. Regular reconciliation preserves the
rendered pose and decays corrections; remote cars use buffered interpolation
and bounded extrapolation.

The remote buffer now starts around 50 ms on steady delivery and adapts up to
160 ms when arrival jitter increases. Recent-input redundancy also adapts, within
a bounded 4–12 frame window. Snapshot sequence gaps, arrival jitter and buffer
length appear in the optional **Options → Interface → Network Graph**.

These changes reduce avoidable buffering and visible correction. They do not
remove round-trip time, guarantee a particular ping or make delayed information
instant. An OCE two-PC play session remains the practical check for the players'
actual connections.

## Bots and match rules

All-Star and Expert bots anticipate higher balls and use earlier aerial
approaches. Balanced, Attacker and Keeper personalities change tactical targets,
challenge distance and boost reserve, while retaining the same physical limits.
Keeper holds deeper; Attacker commits earlier. Existing rotation and kickoff
roles remain.

**Custom Exhibition Rules & Bot Style** appears in local exhibitions. Dedicated
private Custom and Hoops games offer the same bounded presets: low/standard/
heavy gravity, small/standard/oversized ball, unlimited boost, soft/standard/
lively bounce, and time limit or first to 1/3/5/7. The authority validates all
choices. Public matchmaking keeps standard physics. Free Play and Academy
training keep regulation physics so their drills and medals remain comparable.

Car prediction, ball contact, ground resting height, shot prediction and rendering
use each match's rules. Global regulation constants are unchanged.

## Replay Studio

Open **Exhibition → Replay Studio**. Recording is local and can be disabled.
Completed recordings retain up to 15 minutes at 10 samples/second; the browser
library keeps up to five recordings within 40 MB. Playback interpolates these
visual samples rather than re-running an authoritative match.

Pause, seek, change speed, jump to goal bookmarks, follow a car/ball, choose a wide
view or move the free camera with WASD/Q/E or controller sticks. Export/import replay JSON to keep or share a clip;
imports are bounded and validated. Replay files contain visual game states and
names, not chat, audio, credentials or reconnect secrets. Browser storage can be
cleared or unavailable, so export recordings you want to keep.

## Garage and mobile

**Garage → Finish & Saved Loadouts** offers five named local slots with body,
paint, wheel finish, body pattern and Clubhouse colours. Silver, gold, black,
cyan and rose finishes reuse existing materials. Racing, chevron and checkered
patterns stay attached to paintable bodies; fixed artist finishes retain their
original artwork. Styles are included in shared lobbies and matches. No meshes,
physics advantages or paid inventory are added.

**Options → Controls → Mobile Performance & Thumb Controls** adds steering
sensitivity, deadzone, a movable thumb origin within the steering pad, Xbox/
PlayStation/automatic prompts and Battery Saver/Balanced/Sharp presets. Existing
HUD layout editing, touch bindings and fullscreen support remain available.
Battery Saver targets 30 FPS; Balanced and Sharp target 60 FPS. These are settings,
not a promise that every phone sustains that rate. Dialog content scrolls while
important actions stay reachable in portrait and landscape.

## Three modes and original Blender art

Open **Exhibition → Change the Game**:

- **Hoops**: 2v2 aerial basketball, including dedicated online/private play.
  Only downward crossings inside the rim score. Physical rims/backboards and
  closed rounded end walls replace football goal tunnels. It uses Skyline Court.
- **Target Shooting**: a 90-second solo challenge at The Foundry. Strike the ball
  through eight ordered targets; points reward hits and remaining time.
- **Obstacle Course**: a 120-second solo run at Velocity Park. Follow eight
  gates, jump the three physical hurdles, and avoid time penalties. These two
  challenges save local best scores rather than awarding competitive XP.

Skyline Court, The Foundry and Velocity Park are original Blender venues. They
also appear in the ordinary arena selection, with individual sky domes. Each
venue combines over 1,000 source elements into eight material batches, stays
under 25,000 triangles and embeds no image textures. Original basket/net and
course hurdle geometry are also Blender exports.

Editable source: `art/skyline.blend`, `art/range.blend`, `art/velocity.blend`,
`art/hoops-basket.blend`, `art/academy-guides.blend`, `art/sky-domes.blend`.
Reproducible generators: `scripts/create-overdrive-venues.py`,
`scripts/create-academy-props.py`, `scripts/create-sky-domes.py`. Runtime GLBs,
calibration anchors, hashes and size reports are in `dist/assets/`. These new
original assets follow this repository's licence; previous supplied assets keep
their existing attribution and licences.

## Validation and two-PC checks

**550 automated tests pass.** Coverage includes both Node HTTPS/WSS and Cloudflare workerd adapters,
party packing, leader permissions, 60-second fallback, busy capacity, reconnects,
interrupted loading, rule isolation, Hoops scoring/contact, course clearance,
replay validation, original asset calibration and network timing bounds.

A four-browser UI session verifies two duos matching on one field, preserved
teams, leader controls, return to two-car lobbies and another match together.
The feature test exercises loadouts, mobile settings, all three new modes and a
real recorded goal through replay save/playback/seek/export/import. Responsive
acceptance covers desktop, small landscape and portrait widths down to 320 px.

The deterministic network trial exercises 50/100/150/220/350 ms RTT with 3% packet
loss and changing controls. Reconciliation introduces no instantaneous render
pose jump in that fixture. This is simulated latency testing, not a physical
phone frame-rate measurement or a replacement for real cross-network play.

To test on two PCs, open the canonical game link, refresh both tabs and invite
a friend into a private lobby. Ready up and have the leader search 2v2 or Hoops.
Enable Network Graph, drive and challenge the ball, briefly disconnect one tab,
then reconnect and confirm the same car/team. Finish the match, choose Back to
Party, and search again. Repeat on separate Wi-Fi networks using the same HTTPS
server URL and region; TLS/WSS requires no inbound port forwarding on either PC.

Public smoke checks (use an empty server and matching source):

```sh
node scripts/check-live-dedicated.mjs https://flyingcarsforfun.connstors.workers.dev
node scripts/check-live-overdrive.mjs https://flyingcarsforfun.connstors.workers.dev
```

Both checks create only their own synthetic sessions and stop when the server is
already occupied. The Overdrive check covers private physics/style propagation
and two real two-person parties matched into authoritative four-player Hoops.
