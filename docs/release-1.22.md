# 1.22 — Performance and mobile browser preview

Play at https://flyingcarsforfun.connstors.workers.dev. Reload every participant's tab for **boost-circuit-1.22.0**. This uses the existing free Cloudflare deployment and one-room limit. No software installation or changes to a player's PC are required.

## Server and rendering

The old broadcast loop rebuilt, rounded, serialized and reparsed the same world separately for every connected player. The new loop builds and rounds detached world data once per broadcast, reuses it for all peers, and retains each player's own sequence number, input acknowledgement and server input timing. Snapshot data never rounds or mutates the authoritative simulation. Event broadcasts use the same approach.

A controlled Node benchmark of 3,000 broadcasts to eight clients reduced world snapshot builds from **24,000 to 3,000** and median runtime from **873.5 ms to 243.5 ms** (about **72% less CPU** for that workload). Serialized payload size was identical. These are isolated broadcast measurements, not player FPS or internet latency claims. Reproduce with `node scripts/benchmark-snapshots.mjs`.

The service wakes at **10 Hz** while waiting in lobbies/queues, paused, ended or with everyone reconnecting; active games retain their **120 Hz** physics. Starting/resuming resets waiting-time accumulation, and the existing 18-step catch-up limit remains. Authentication pruning runs once per second. Failed profile-directory loads can retry, and unauthenticated actions no longer allocate per-player rate buckets. Existing authentication, TLS/WSS, matchmaking, reconnects and persistent friends remain in place.

Starting a city, woods, snow or festival field now skips the Champions Field stadium and pitch downloads until Champions is needed. Repeated simultaneous detail requests share one load; superseded results are disposed. The showroom/menus draw at up to 30 Hz; active desktop drawing follows the display. Input and networking still run every animation frame, independently of draw pacing.

## Mobile preview

Open the same game link on a phone. Landscape is recommended. New touch devices default to lightweight Auto graphics: no realtime shadows or seats, adaptive resolution between 50–85% of CSS viewport size and up to 60 draws per second. **Options → Video → Mobile Performance** is also available. Full lightweight vehicle selection takes effect on reload after changing quality; custom vehicles still use their existing models.

The Fennec is **2.12 MB / 38,166 triangles**, and the stadium architecture is **2.75 MB / 42,084 triangles**, versus 6.63 MB / 84,823 and 12.47 MB / 268,285 respectively. Combined download size drops about 75%; calibrated inner pitch, ball, wheel animation and gameplay hitboxes remain the same. Embedded textures are WebP at up to 384 px. Credit/license records are in the adjacent `*-mobile.json` files. Regenerate with `scripts/prepare-mobile-models.py` and Blender as described in that file.

- Left joystick: throttle/reverse and steering; forward/back pitch during aerials.
- Right buttons: Boost, Jump/double jump, Brake/reverse and Slide.
- Air L / Air R: roll during aerials.
- Ball Cam: switch camera mode. Drag open playfield space to look around in free camera.
- Reset Ball is available in practice. Pause and Chat remain at the upper right.
- **Options → Controls → Touch Controls / Touch Button Size** selects Auto/On/Off and 80–130% button sizes, saved locally.

Each finger owns its control independently. Releasing boost does not release the joystick or jump. Capture loss, interruption, pause, hiding the tab and leaving a match release held controls. Keyboard and controller controls remain available. The responsive menus cover portrait and landscape, scrolling options, friends and vehicle selection. A home-screen manifest provides a standalone landscape launch where the browser supports it; this preview needs internet and is not an App Store/native release.

## Validation and player testing

Run `npm run check`, `npm test`, and `npm run cloudflare:check`. **390 tests pass**, including model calibration/rig/credits/size checks, real HTTPS/WSS multiplayer/recovery, physics and contact regressions, per-client snapshot acknowledgements, idle/active server cadence, profile retry/rate bounds, touch cancellation and 60 Hz pacing on 90/144 Hz displays.

Browser release checks use Chromium with software rendering and touch emulation: simultaneous steering/boost/jump, independent releases, pause, saved touch settings, portrait/landscape menus, lazy field downloads and two-player dedicated play. Physical iPhone/Safari, Android hardware thermals, physical gamepad input and independent Australian network paths need player testing; the preview does not promise a fixed hardware FPS or lower physical network ping.

On two devices, reload both, use the same Dedicated Server address/mode/region, and create/join a private lobby or search together. Choose opposing teams, ready/start, drive/boost/jump and touch the ball. Test pausing/reconnecting one player while the other keeps driving. On a phone, hold the joystick plus Boost and Jump; release one finger at a time, rotate the device, open Chat, pause/resume and briefly background the browser. Confirm that no control remains held. Compare Auto/Mobile Performance against heavier graphics with the FPS display enabled.
