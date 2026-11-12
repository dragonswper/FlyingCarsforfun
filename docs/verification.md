# Verification

The release was developed and tested in an isolated Linux cloud workspace. No applications were installed or settings changed on the user's computer.

## Automated checks

**86 automated tests pass.**

`npm run check` parses every authored runtime module and JavaScript preparation script. `npm test` exercises the original simulation, Three.js scene geometry, input handlers, asset references and static HTTP server without installing packages.

Coverage includes arena/pad dimensions, acceleration/reverse/braking, speed caps, fuel consumption, variable-height jumping, double jump/dodge, aerial pitch, floor/wall/corner/ceiling bounces, real oriented car-ball contact, boost refill/recharge, full-ball goal crossing, wide/high misses, kickoff clock, zero-time live ball, overtime/results, training progression, bounded replays, finite long-running bot matches, wall driving, demolition/respawn, own-goal routing regression, practice reset restrictions, both vehicle geometries, original ball and calibrated pitch geometry, local asset resolution, keyboard/mouse clearing and standard gamepad button mappings.

Three.js math/geometry can run without a GPU; these tests do not render WebGL pixels. The input test uses synthetic events and a simulated standard gamepad, not a physical controller.

## Browser test limit

The Sites managed-preview skill requires the supplied `cua_repl.js` browser tool. It was not present in the available tools, and `open_in_codex` was also unavailable. In accordance with that workflow, no alternative browser controller was installed or substituted and no preview server was started. The game remains unverified for interactive browser play, actual GPU performance, CSS layouts, fullscreen, audio output and real controllers.

The managed environment reports a running runtime with remote_desktop enabled but state unknown. Environment: `ccarenv_b64_Y2NhcmVudl84NmY1OTI5ZWEyZjg4MTkxYmM5M2JmYTlhMWZjNDNmNQ`.

## Publishing

A successful Sites deployment verifies that the exact committed source/build was published at the reported URL; it does not verify gameplay. The standalone game source, optimized models, tests and research are saved in [dragonswper/FlyingCarsforfun](https://github.com/dragonswper/FlyingCarsforfun). The earlier copy remains in dragonswper/fortnite_broswer.

## Fennec checks — 12 November 2026

Five additional checks import the actual converted GLB using Three.js GLTFLoader. Texture loading is replaced by empty Texture objects in the Node test harness, so the tests verify geometry/material binding/rig structure rather than browser image decoding. They cover self-contained assets and rig nodes, floor/axis/scale alignment, forward/reverse rolling and wheel radii, front Ackermann steering, pause behavior, independent paint materials, safe shared-geometry reuse, chassis motion and replay animation fields. An offline Blender render of the converted model was inspected for orientation and appearance; it does not verify the browser scene.

## Champions Field checks — 12 November 2026

Four stadium tests use the actual Three.js GLTFLoader with the same headless texture stub. They verify the embedded banner assets and file size, source/output hash, retained architecture, batch budget, quantized positions/normals and index ranges, absence of architecture vertices inside the playable volume, goal/field calibration, actual rendered turf dimensions, 34 pads, and low/high seat visibility. All existing Fennec and simulation tests still pass. Source and adapted models were inspected through offline Blender renders. The original cinematic shell obstructed the pitch in the first offline render; it was removed before final checks.

No browser rendering or GPU frame-rate verification was possible. The stadium is approximately 20 MiB and retains about 774,000 triangles, so loading time and performance depend on the player's device and connection.

## Smoothness update — 12 November 2026

Nine additional performance tests cover render interpolation at 72 Hz and 144 Hz over the unchanged 120 Hz simulation, quaternion blending, pose-buffer reuse, teleport/reset snapping, replay interpolation without modifying recorded frames, adaptive graphics hysteresis, fixed manual graphics levels, instanced pad pickup/respawn behavior, bounded particle reuse and the pitch draw budget. A tenth test imports the actual simplified stadium and checks its bounds, calibration, banner embedding, hash, seat visibility and clear playing volume.

Measured structural changes, using the same Node/Three.js scene construction before and after:

| Work | Before | After |
| --- | ---: | ---: |
| Pitch draw submissions, before frustum culling | 238 | 35 |
| Pitch shadow-casting submissions | 135 | 0 |
| Boost pad submissions | 102 | 3 |
| Stadium triangles in Auto/Balanced/Low | 773,516 | 268,278 |
| Particle meshes for a 70-particle goal burst | 70 | 1 shared mesh |
| Maximum default device pixel ratio | 1.7 | 1.0, adapting down to 0.6 |

These are geometry/submission counts, not GPU timing or FPS measurements. Stadium simplification was inspected in an offline Blender render. Browser tools (`cua_repl.js` and `open_in_codex`) remain absent from the managed workspace, so no alternative browser controller or preview server was started. Actual frame rate, first-use shader behavior and interactive controls must still be checked on a player's browser.

Auto starts with the simplified stadium, no multisample antialiasing, no realtime shadows and full CSS-size resolution. It steps resolution/detail down after sustained overload and recovers slowly; hidden-tab gaps are ignored. Balanced fixes that starting profile. Low fixes a 0.75 pixel ratio and hides seats. High loads the original detailed stadium, caps pixel ratio at 1.5 and uses a 1024-pixel realtime shadow map. Car/ball contact shadows remain available in the lower modes. The game exposes read-only `boostCircuit.getPerformance()` diagnostics for mode, render calls, triangles, pixel ratio and approximate FPS.

## Core mechanics and settings checks — 12 November 2026

Twenty-two new checks independently exercise source unit conversions, exact boost timing, jump hold/second-jump deadlines, Octane offsets, mesh-derived corner boundaries, live/predicted trajectory agreement, rolling/spin behavior, pickup cylinder heights, goal/assist scoring, supersonic hysteresis, four bot profiles, defensive priority, teammate rotations, cached predictions, finite matches, FOV across aspect ratios, preference bounds, keyboard/mouse rebinding, controller sensitivity/deadzones and settings accessibility links. Existing tests were updated where they asserted old rounded constants or throttle-based dodging.

All 65 tests pass. With the more accurate outline and spherical pickups, the pitch now uses 15 pre-cull draw submissions (including all 34 pickups), with zero pitch shadow casters. An imported corner profile replaces a guessed boundary; both stadium variants were recalibrated to the selected 20.48 m ceiling. Native source notices and the numeric/source audit are included. The automated checks remain headless; browser interaction, controller hardware, audio, GPU rendering and FPS have not been measured.

## Menu and HUD checks — 12 November 2026

Five additional behavior tests exercise separate Exhibition/Training selections, back navigation and restored mode choices, Escape handling with open dialogs or a hidden lobby, keyboard focus/help navigation, render-pose nameplates and visibility culling, pooled label reuse, and saved interface preference bounds. The original 65 simulation, asset, geometry and input tests still pass. Static checks verify HTML nesting, unique IDs, local fonts/assets and runtime imports. The font subsets retain their source license and contain valid WOFF tables; they total 56,800 bytes instead of 1,158,616 bytes for the three downloaded TTF files.

The reviewed screenshots and actual recreated components are listed in [UI reference notes](ui-references.md). The requested Game UI Database page returned HTTP 403 and the web tool reported a robots exclusion, so those specific tabs were not inspected. Eight accessible public Rocket League screenshots from Interface In Game were downloaded to scratch and visually inspected; none are included as runtime screenshots/backgrounds.

The managed `cua_repl.js`/browser-control tool is still absent. No substitute controller, browser installation or preview server was used. Interactive CSS layout, visual equivalence, real WebGL frame rate and hardware behavior remain **unverified**. Three.js projection calculations were checked at 1920×1080, 1280×720 and 390×844 to keep the showroom car in view; these calculations are not rendered UI screenshots.

## Multiplayer checks — 12 November 2026

Sixteen additional tests cover code generation/normalization, input validation, duplicate/stale input handling, queue bounds, room readiness, explicit host authority, human-slot ownership in all three room modes, game-build rejection, guest driving, corrupt/stale snapshots, prediction/reconciliation, remote-pose interpolation, kickoff teleports, scores/results, pause/resume, rematches, disconnect cleanup and guest-specific HUD data. A deterministic ten-second test adds one-way delay, jitter, datagram loss and reordered snapshots and checks finite output, bounded queues and prediction error. Transport tests cover early ICE candidates, channel delivery rules, malformed/oversized packets, backpressure and resource release.

The optional [live network check](../scripts/check-live-multiplayer.mjs) uses `werift 0.27.0`, `ws 8.22.2` and `https-proxy-agent 7.0.6` installed only under a scratch directory in the cloud workspace. No browser or system package was installed. It connects two actual WebRTC peers through the public NetplayJS signaling service, using same-container host ICE candidates for the data route. It checks room-code matching, the version handshake, readiness, host starts, guest input ownership, synchronized state, prediction, host pause/resume, final scores, rematches and disconnect cleanup. The test dependencies are optional and are not shipped with the game or required by `npm test`.

One repeated live run exposed the reliable control channel delivering a hello before the realtime channel finished opening. The transport now queues early packets until both channels are open and its own hello has been sent; a regression test covers the ordering. Subsequent real-peer checks are recorded in the multiplayer release notes. This is a tested WebRTC data connection, not a browser-rendering test or a test between independent home networks. Real browser input, GPU rendering, NAT/firewall behavior and the external relay service remain outside the verified coverage.

The hosted page returned HTTP 200 under the owner's existing access token, with no Content-Security-Policy or Permissions-Policy header observed. At that verification, Site access was owner-private: a multiplayer room code does not grant website access to a friend. Sharing changes require the owner's choice. All 86 automated checks pass with no production dependency installation.

Three live checks after the startup fix passed. The last two completed 715 and 717 simulation ticks, acknowledged 712 and 714 guest input frames before rematch, and exchanged 464 and 462 realtime packets respectively. These are packet/behavior checks, not GPU FPS measurements.
