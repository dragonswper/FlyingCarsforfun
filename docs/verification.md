# Verification

The release was developed and tested in an isolated Linux cloud workspace. No applications were installed or settings changed on the user's computer.

## Automated checks

**33 automated tests pass.**

`npm run check` parses the six authored runtime modules and the stadium import script. `npm test` exercises the original simulation, Three.js scene geometry, input handlers, asset references and static HTTP server without installing packages.

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
