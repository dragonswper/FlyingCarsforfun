# User-supplied model replacements

## Fennec

**Fennec - Rocket League Car**, by [Jako](https://sketchfab.com/fairlight51). [Original model](https://sketchfab.com/3d-models/fennec-rocket-league-car-5b43b50b6eeb4a12a29671df3418f57a). Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as identified by the public Sketchfab model metadata. User supplied fennec-rocket-league-car.zip. The artwork is not covered by the game's MIT license.

Changes: FBX converted to GLB; transforms baked; geometry oriented +Z forward/+Y up; model normalized to 1.8 metres long and aligned to the current vehicle contact height; textures relinked, reduced to at most 1024 px and embedded; material/geometry instances separated appropriately; wheel rolling and front-steering pivots added; runtime speed-dependent wheel rotation, steering and chassis suspension added. The source had no animation clips or bones. Its wheel meshes were separate and retained.

The converted GLB is self-contained and does not reference the source artist's local image paths. The signed source-download URLs supplied in chat are temporary credentials and are not stored in the project or repository. The model manifest records a permanent source page and SHA-256 of the converted file.

## Champions Field

Requested source: **Champions Field - Rocket League Stadium**, by [Prabhu Ram / virtualmakes](https://sketchfab.com/virtualmakes). [Model page](https://sketchfab.com/3d-models/champions-field-rocket-league-stadium-6ea5ee0502ae432fbac3a4f8aaab61a5). Public metadata identifies [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The artist describes this as a cinematic recreation, with imperfect correspondence to the official map and imperfect material naming.

The user supplied a compressed GLB archive on 12 November 2026. It was extracted successfully in the cloud; no Higgsfield transfer or expired signed URL is needed. The source GLB is 38,689,632 bytes. The adapted runtime GLB is 21,002,128 bytes (20.0 MiB), with 773,516 triangles and 105 spatial/material batches. Eight embedded banner images are retained. There are no runtime decoder or external texture requests.

Changes: source transforms baked; axes rotated to +Y up/+Z field length; architecture scaled to the calibrated game pitch; placeholder colors reassigned to steel, concrete, gold and blue/orange materials; coincident duplicate parts and stray underground meshes removed; geometry batched and quantized with glTF's KHR_mesh_quantization extension. The supplied model is a cinematic recreation with a differently proportioned, rounded inner playing cage. Its eleven inner pitch/outer-shell meshes are replaced with the existing calibrated turf, ramps, walls, goal frames/nets and 34 interactive boost pads. The artist's surrounding architecture, seats, trophies, signs and banner images remain. These changes preserve the game's existing analytic collision dimensions and do not claim exact official Champions Field geometry.

Low graphics hides the imported seat batches and reduces the existing renderer's resolution/shadows. Stadium architecture does not cast realtime shadows; cars still cast shadows on the pitch. High graphics downloads about 26.4 MiB of vehicle/stadium GLBs, plus the rest of the application. Actual device performance remains unverified.

The deterministic preparation script is `scripts/import-champions.mjs`. To reproduce the runtime asset, extract the supplied GLB and run `node scripts/import-champions.mjs /path/to/champions_field_-_rocket_league_stadium.glb`. The source artwork is not bundled again in its unoptimized form. The import report records the source and output hashes, batch counts and calibration landmarks. Both the interface credits and model manifest credit the artist and link the source and CC BY 4.0 license. This artwork is separate from the game's MIT license.

### Browser-detail stadium

Auto first load includes about 18.2 MiB of vehicle/stadium GLBs, plus the rest of the application. The default Auto/Balanced/Low modes now use `champions-field-performance.glb`, an additional simplified derivative of the same CC BY 4.0 model. It contains 268,278 triangles in 105 batches and is 12,473,572 bytes. Eight banner images, material groups, scene bounds and calibration landmarks are retained. Seat geometry is reduced more aggressively than the architecture; banner surfaces are retained. The original detailed GLB is preserved and loaded by High graphics. Both variants keep the calibrated game pitch.

Reproduction requires Blender in a development environment: `blender -b -P scripts/optimize-stadium.py -- /path/to/champions-field.glb /path/to/champions-field-performance.glb`. The game itself requires no Blender or other native software on a player's computer. Preparation was performed only in the isolated cloud workspace. The additional model manifest entry and import report record its modifications, size and SHA-256.
