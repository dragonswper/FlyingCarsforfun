# User-supplied model replacements

## Bottled Car — 1.7

**Bottled car**, by [Urizel](https://sketchfab.com/urizel). [Original model](https://sketchfab.com/3d-models/bottled-car-cd38a415db8a4607ab9dd3cc67d27462). The supplied GLB embeds the artist's attribution and [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) license. The adapted model and its rendered garage thumbnail retain that noncommercial license, separate from the game's MIT code license.

The user's `bottled_car.glb` downloaded successfully at 14,883,648 bytes. The optimized self-contained runtime model is 3,130,000 bytes, with all 29,482 source triangles retained in 13 material/mesh batches. The glass bottle, cork, tag, car and wooden display supports are preserved. The full assembly is centered on the car axis, normalized to two metres long and aligned to the existing visual floor. This is a decorative novelty body with the same Octane/Fennec physics hitbox and driving behavior as the other garage choices; the enclosing bottle does not change collision dimensions.

Four tire/hub islands were separated using shared-position topology while preserving UV and normal seams. Independent steering and rolling pivots use their measured radii (about 0.0934 m) and the actual 0.7421 m visual wheelbase. Front wheels steer, rear wheels remain straight, signed speed controls rolling, and the body has procedural suspension. The source included no animation clips. The car's paint material supports the existing four finishes without recoloring the glass, cork, tag or wooden supports.

The source's full-scene glass transmission was replaced with inexpensive single-sided alpha blending to avoid a second render of the stadium. Embedded images are WebP quality 90 at their original 1024-pixel dimensions; unused transmission imagery is omitted. The model needs native browser WebP decoding, supported by current desktop browsers, and no external decoder/CDN. It is fetched and warmed only when selected, restored from a saved choice, or needed for a private opponent. Private-match Ready/Start waits for both appearances; failures show an explicit retry. Geometry/textures are shared between cars while paint materials and animation pivots remain independent.

Reproduction in a development environment:

```sh
node scripts/import-bottled.mjs /path/to/bottled_car.glb /tmp/bottled-rigged.glb
blender -b -P scripts/optimize-bottled.py -- /tmp/bottled-rigged.glb dist/assets/models/bottled.glb
```

`bottled-import.json` records the original/output SHA-256, source credit, normalization, wheel measurements and modifications. Only the optimized derivative is committed. Preparation and offline rendering ran in the isolated cloud workspace; players need no Blender or native installation. Offline previews were inspected, but browser image decoding and WebGL output remain unverified here.

## Fennec

**Fennec - Rocket League Car**, by [Jako](https://sketchfab.com/fairlight51). [Original model](https://sketchfab.com/3d-models/fennec-rocket-league-car-5b43b50b6eeb4a12a29671df3418f57a). Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as identified by the public Sketchfab model metadata. User supplied fennec-rocket-league-car.zip. The artwork is not covered by the game's MIT license.

Changes: FBX converted to GLB; transforms baked; geometry oriented +Z forward/+Y up; model normalized to 1.8 metres long and aligned to the current vehicle contact height; textures relinked, reduced to at most 1024 px and embedded; material/geometry instances separated appropriately; wheel rolling and front-steering pivots added; runtime speed-dependent wheel rotation, steering and chassis suspension added. The source had no animation clips or bones. Its wheel meshes were separate and retained.

The converted GLB is self-contained and does not reference the source artist's local image paths. The signed source-download URLs supplied in chat are temporary credentials and are not stored in the project or repository. The model manifest records a permanent source page and SHA-256 of the converted file.

## Champions Field

Requested source: **Champions Field - Rocket League Stadium**, by [Prabhu Ram / virtualmakes](https://sketchfab.com/virtualmakes). [Model page](https://sketchfab.com/3d-models/champions-field-rocket-league-stadium-6ea5ee0502ae432fbac3a4f8aaab61a5). Public metadata identifies [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The artist describes this as a cinematic recreation, with imperfect correspondence to the official map and imperfect material naming.

The user supplied a compressed GLB archive on 12 November 2026. It was extracted successfully in the cloud; no Higgsfield transfer or expired signed URL is needed. The source GLB is 38,689,632 bytes. The adapted runtime GLB is 21,003,868 bytes (20.0 MiB), with 773,516 triangles and 105 spatial/material batches. Eight embedded banner images are retained. There are no runtime decoder or external texture requests.

Changes: source transforms baked; axes rotated to +Y up/+Z field length; architecture scaled to the calibrated game pitch; placeholder colors reassigned to steel, concrete, gold and blue/orange materials; coincident duplicate parts and stray underground meshes removed; geometry batched and quantized with glTF's KHR_mesh_quantization extension. The supplied model is a cinematic recreation with a differently proportioned, rounded inner playing cage. Its eleven inner pitch/outer-shell meshes are replaced with the existing calibrated turf, ramps, walls, goal frames/nets and 34 interactive boost pads. The artist's surrounding architecture, seats, trophies, signs and banner images remain. These changes preserve the game's existing analytic collision dimensions and do not claim exact official Champions Field geometry.

Low graphics hides the imported seat batches and reduces the existing renderer's resolution/shadows. Stadium architecture does not cast realtime shadows; cars still cast shadows on the pitch. High graphics downloads about 26.4 MiB of vehicle/stadium GLBs, plus the rest of the application. Actual device performance remains unverified.

The deterministic preparation script is `scripts/import-champions.mjs`. To reproduce the runtime asset, extract the supplied GLB and run `node scripts/import-champions.mjs /path/to/champions_field_-_rocket_league_stadium.glb`. The source artwork is not bundled again in its unoptimized form. The import report records the source and output hashes, batch counts and calibration landmarks. Both the interface credits and model manifest credit the artist and link the source and CC BY 4.0 license. This artwork is separate from the game's MIT license.

### Browser-detail stadium

Auto first load includes about 18.2 MiB of vehicle/stadium GLBs, plus the rest of the application. The default Auto/Balanced/Low modes now use `champions-field-performance.glb`, an additional simplified derivative of the same CC BY 4.0 model. It contains 268,285 triangles in 105 batches and is 12,472,508 bytes. Eight banner images, material groups, scene bounds and calibration landmarks are retained. Seat geometry is reduced more aggressively than the architecture; banner surfaces are retained. The original detailed GLB is preserved and loaded by High graphics. Both variants keep the calibrated game pitch.

Reproduction requires Blender in a development environment: `blender -b -P scripts/optimize-stadium.py -- /path/to/champions-field.glb /path/to/champions-field-performance.glb`. The game itself requires no Blender or other native software on a player's computer. Preparation was performed only in the isolated cloud workspace. The additional model manifest entry and import report record its modifications, size and SHA-256.

### Core-update alignment

Both stadium variants have been regenerated with the selected native-simulator ceiling value of 20.48 m. The game-generated pitch now uses a wall outline derived from rl_ball_sym's standard corner mesh. The Fennec GLB remains unchanged; the runtime adapter offsets its visuals for the 0.17 m physics origin while retaining its authored wheel rolling radii and contact with the floor. Hitbox dimensions/offsets are separate from decorative model geometry. See [the core reference audit](core-research.md).
