# Contact, camera and supplied-model update — 1.8

The wall/landing issue was reproduced before editing. A six-second boosted wall run changed grounded state 27 times. A stationary inverted car rose from its 0.50 m starting height to 0.826 m during forced recovery. The updated reproduction has no grounded transitions in that wall run and no unpowered rise from the inverted rest.

## Contact changes

Cars now keep a small contact manifold instead of using whichever surface was processed last. Three projection passes resolve simultaneous ramp, wall, floor and goal-frame constraints. A 0.015 m contact skin recognizes fresh contact; existing wheel-aligned contacts can retain a gap up to 0.06 m as the chassis aligns. Jumping disables this retention. Wall adhesion is a small original 3 m/s² inward acceleration. Wheel alignment requires an upward-axis dot product over 0.55 and its rotation is bounded by the existing 5.5 rad/s angular limit.

Car/surface contacts absorb normal speed instead of repeatedly bouncing at rest. Roof and bumper scrapes damp spin and cancel the active flip torque; contact moments let a tilted chassis settle. A nearly flat, slowly moving roof contact settles without ongoing numerical rocking. A perfectly inverted car rests on its roof; the player can still air-roll to recover. The previous forced upright quaternion rotation was removed. These are original analytic solver choices, not claimed native Rocket League contact constants. Published arena, mass, boost, jump, hitbox and ball constants are unchanged.

## Camera changes

Ball cam aims directly at the ball with world-up as the horizon. Its heading does not use the chassis's pitch/roll. Near an overhead ball it retains its last heading; larger turns are bounded rather than falling back to the car's forward vector. Manual orbit is rejected while ball cam is enabled. With ball cam off, middle-mouse drag or the controller right stick orbits the chase camera. A middle button rebound to a driving action retains that action. Right-stick motion uses frame duration. FOV, distance, height, angle and stiffness remain configurable.

## Supplied assets

| Asset | Runtime size | Triangles | Mesh/material batches | Artwork license |
| --- | ---: | ---: | ---: | --- |
| Octane | 1,999,336 bytes | 43,646 | 12 | CC BY 4.0 |
| cHe | 3,199,540 bytes | 89,509 | 8 | CC BY-NC-SA 4.0 |
| Cyberpunk Bike | about 2.17 MB | 31,512 | 3 | CC BY-NC 4.0 |
| C-17 Globemaster | 6,745,628 bytes | 76,570 | 38 | CC BY 4.0 |
| Rocket League ball | 403,716 bytes | 4,416 | 2 | Unspecified in supplied archive |

The model manifest and each `*-import.json` contain exact hashes, sizes, source credits and modifications. Each GLB is self-contained with embedded images. The local Three.js loader supports their WebP textures and unlit materials without an external geometry decoder.

Octane retains all source triangles and has independent rolling/front-steering pivots and paint. Its archive omitted an optional normal map; no missing texture path is shipped. cHe's static presentation clouds and drop shadows were removed, its four wheels separated and its large surfaces simplified. Its painted look is retained. The bike's duplicate expanded outline shell was covering the supplied painted surface; that duplicate hull is removed and its painted atlas retained as an unlit material. It has two independent wheel pivots. The C-17 has five rolling axle groups, with tire/hub geometry separated from the fixed upper gear struts. Large surfaces were simplified and the body batched by material. Its OBJ lacked an MTL, so material/texture links are a best-effort reconstruction using the supplied named images.

Vehicle visuals use +Y up, +Z forward and a normalized floor at zero; the runtime offsets them for the existing 0.17 m physics reference. The bike and plane remain novelty bodies with the existing car collider and handling. cHe, bike and plane keep their original finishes; garage paint controls communicate that. The new vehicles load only on selection, saved-choice restoration or private-opponent preparation. Per-room preparation is single-flight and readiness waits for both appearances; failed optional loads can be retried. Geometry/textures are shared and per-vehicle materials/animation pivots remain independent.

The supplied ball replaces the procedural runtime model. It is centered on a fitted sphere and normalized to unit outer radius, then rendered at the existing **0.95 m visual radius**. The **0.9125 m physics radius** and **0.9315 m rest height** remain unchanged. Ball position and rotation still follow the same simulation and replays. The upload's creator/license metadata is unspecified; no MIT license is assigned to its artwork.

## Model credits and reproduction

- Octane: [Jako](https://sketchfab.com/fairlight51), [original](https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- cHe: [luyssport](https://sketchfab.com/luyssport), [original](https://sketchfab.com/3d-models/che-1e529f4b8efc4f20925957a9a4208dcd), [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The adapted GLB and its garage thumbnail retain that license.
- Cyberpunk bike: [daCruz](https://sketchfab.com/daCruz), [original](https://sketchfab.com/3d-models/cyberpunk-bike-efcf679a115c487face1adc2ce7e8b8c), based on [Fernando Correa's concept](https://www.artstation.com/artwork/8lWYdE), [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- Boeing C-17B Globemaster III: [Muhamad Mirza Arrafi](https://sketchfab.com/MirzaArrafiERV_45), [original](https://sketchfab.com/3d-models/boeing-c-17b-globemaster-iii-2f58a20aa82f404889ff8870f14ddd67), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Ball: user supplied `ball-rocket-league.zip`; no creator/license identified in that archive.

Preparation scripts accept the extracted user files; run these only in a development environment with Blender available:

```sh
blender -b -P scripts/prepare-octane.py -- Octane.fbx textures dist/assets/models/octane.glb
node scripts/prepare-che.mjs che.glb /tmp/che-rigged.glb
blender -b -P scripts/optimize-custom-vehicle.py -- /tmp/che-rigged.glb dist/assets/models/che.glb
blender -b -P scripts/prepare-obj-vehicles.py -- bike "neo tokyo.obj" textures dist/assets/models/bike.glb
blender -b -P scripts/prepare-obj-vehicles.py -- c17 "Boeing C-17B Globemaster III.obj" textures dist/assets/models/c17.glb
blender -b -P scripts/prepare-rocket-ball.py -- "source/rocket ball.fbx" dist/assets/models/rocket-ball.glb
blender -b -P scripts/render-vehicle-preview.py -- dist/assets/models/octane.glb dist/assets/octane-preview.png
```

The player needs no Blender or native installation. All preparation ran in the cloud workspace. Unoptimized originals and temporary downloads are not duplicated in the repository.

## Validation and limits

All **114 automated tests** pass. New checks cover stable contacts, jump detachment and manual recovery; camera math and synthetic mouse/controller gating; the actual five GLBs, hashes, source attribution, geometry budgets, scales, axle radii, signed rolling, steering, material independence and shared-resource lifetime; all eight garage entries; and new appearances exchanged through real NetworkRoom handshakes over the deterministic transport harness. The existing simulation, bot, prediction, packet-loss/jitter, match results and compatibility tests also pass. The multiplayer build is 1.8.0 so both players must reload.

Offline Blender previews of all five runtime models were inspected. Node tests replace image decoding with empty Texture objects, including the WebP extension. The managed Sites workflow's required `cua_repl.js` tool is unavailable. No substitute browser controller, browser installation or preview server was used. Actual browser image decoding, WebGL pixels, interactive play, physical input devices, GPU FPS and separate-home-network behavior remain unverified. The game's owner-private access is preserved.
