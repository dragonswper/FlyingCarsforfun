# Supplied novelty vehicle assets: Randy, Ridiculous Vehicle, Viking

Prepared visual assets and a runtime adapter are ready for integration. This task
does not change body selectors, scene factories, networking, physics, or the car
collision shape. All three should use the existing shared car physics/hitbox.

## Files and dimensions

All paths below are relative to `dist/assets/`. Dimensions are metres in glTF
coordinates: width X, height Y, length Z. Models face +Z and have a floor-zero
visual root; the runtime adapter positions `visual.y = -C.carHeight`, matching
the existing supplied vehicles. Randy's reimported rest floor differs by about
3.7 mm because of skin/mesh conversion. Gaits and steering change visible bounds.

| ID | GLB | Bytes | Triangles | Material draws | Rest width × height × length |
| --- | --- | ---: | ---: | ---: | --- |
| `randy` | `randy.glb` | 2,432,612 | 42,376 | 5 | 1.0252 × 1.9000 × 0.6631 |
| `ridiculous` | `ridiculous.glb` | 360,156 | 4,756 | 2 | 1.4133 × 0.6829 × 2.0000 |
| `viking` | `viking.glb` | 2,721,076 | 63,290 | 5 | 1.2018 × 1.4255 × 2.0000 |

Each model has a matching `{id}-preview.png` (640 × 640 transparent offline
render) and `{id}-import.json` (hashes, source bounds, nodes, changes, rig and
credit metadata). The GLBs embed WebP textures at at most 1024 pixels and require
`EXT_texture_webp`, already supported by the project's GLTFLoader. They require
no Draco, Meshopt, KTX2, or external texture downloads.

## Runtime integration

`dist/novelty-assets-a.js` exports:

- `NOVELTY_A_NAMES`: the three UI labels, keyed by ID.
- `NOVELTY_A_FILES`: the flat filenames above.
- `isNoveltyABody(id)`.
- `loadNoveltyABody(id, onProgress)`: lazy, cached load; resolves the template
  scene and stores its animation clips on `scene.animations`. Failed loads can
  retry. URLs are `./assets/{id}.glb`, rather than `./assets/models/`.
- `makeNoveltyAModel(id, color, template?)`: returns the usual
  `kind/root/visual/paint/chassis/wheels/wheelBase/flame/setColor` model shape.
  `paint` is null and `setColor` is a no-op because source artwork is fixed.
- `animateNoveltyAModel(model, state)`: returns true for these models, calls
  existing `animateVehicle` once, and advances any gait. Integration can use
  `if (!animateNoveltyAModel(model, state)) animateVehicle(model, state)`.
- `disposeNoveltyAModel(model)`: returns true for these models, stops mixers,
  frees per-instance skeleton textures, and invokes normal vehicle disposal.
  Use this instead of also calling `disposeVehicle` on the same instance.
- `disposeNoveltyATemplates()`: frees the three cached source assets.

Add the three IDs to body name/type validation and fixed-finish selection. Route
their load, warmup factory, match factory, animation, and disposal through this
adapter, including room asset readiness. The adapter itself imports
`animateVehicle`/`disposeVehicle` from `vehicles.js`; scene-level routing avoids
needing to change that existing module. Body IDs remain ordinary appearance
strings and need no distinct network physics state.

The two walking models intentionally have no artificial wheel nodes. Do not
pass them through `validateCustomRig` or `makeCustomModel`, which require wheels.
Every instance gets its own skeletons and cloned materials while geometries and
texture artwork remain shared. The adapter reuses one cloned skeleton across
the material primitives that shared one source skeleton. No new vendor library
is needed.

## Rigs and source adaptations

Randy has `Randy_Vehicle > Custom_Body > Randy_Rig`, 107 source joints, and
five material primitives under the original mesh node `Randy_Rig.001`. The
source contained no animation. The preparation script reduces its 84,755 source
triangles to 42,376, lowers the T-pose arms, and authors `Randy_Run` (about
1.367 seconds). Hip/knee/arm motion and vertical floor compensation are in the
clip. Runtime playback follows speed and stops at rest; airborne legs stop
cycling. Important bone names remain
`Randy_{LT|RT}_Arm_ShoulderSHJnt`, `Randy_{LT|RT}_Leg_HipSHJnt`, and
`Randy_{LT|RT}_Leg_KneeSHJnt`.

All five loose Randy texture PNGs in the supplied archive are vertically flipped
relative to its embedded GLB textures. Conversion deliberately preserves the
embedded atlases. Replacing them with the loose copies changes skin, hair, shirt,
eye, and mouth mapping. Face alpha, vertex colors, and source materials remain.

Ridiculous Vehicle is the supplied four-legged snake machine. It has
`Ridiculous_Vehicle > Custom_Body > Armature`, the `Circle` mesh, 47 exported
joints, and its original `Armature|SnakeWalk` clip (about 1.708 seconds).
All source triangles and animation are preserved. Both source materials use the
supplied `3DecemberPalette.png`; source FBX paths were broken.

Viking has `Viking_Vehicle`, `Custom_Body > Viking_Fixed_Body`, and four wheel
chains `Steer_{FL|FR|RL|RR} > Spin_{same} > Wheel_{same}`. Rolling is local X;
front steering is Y in the exported glTF. Each steering pivot carries
`rollingRadius` and `front` extras. The source OBJ's MTL was absent. The supplied
diffuse and normal atlases reconstruct its single material; the empty black
emission atlas and reflection map with unknown original shader mapping are
omitted. Alpha uses MASK to retain cutouts without sorted transparency. Dense
rope and catapult-spike meshes were simplified to 65%; fixed parts are batched.

| Pivot | Position X, Y, Z | Rolling radius | Steers |
| --- | --- | ---: | --- |
| `Steer_FL` | -0.447153, 0.192389, 0.307746 | 0.192389 | yes |
| `Steer_FR` | 0.447153, 0.192389, 0.307746 | 0.192389 | yes |
| `Steer_RL` | -0.403657, 0.150740, -0.330186 | 0.150040 | no |
| `Steer_RR` | 0.407803, 0.150740, -0.330186 | 0.150040 | no |

Viking's visual wheelbase is approximately 0.637932 m. It is cosmetic and does
not alter the physics wheelbase or collision box.

## Provenance and license limits

All three files were supplied by the user. None of their top-level archives
contains a license, attribution, author, source URL, or README. The Viking ZIP
contains another ZIP, which contains only `vwhixcl.obj`; its declared
`vwhixcl.mtl` is missing. Randy's GLB metadata identifies the Blender exporter
but supplies no author, copyright, or license. No usable attribution or license
notice was found in the remaining source metadata. Consequently each import
report and GLB records author/source as null and license as
`Not supplied; undetermined`. This does not establish public-domain status or
permission to redistribute; no external license or author has been invented.

Original archive SHA-256:

- `randy-marsh-south-park-snow-day.zip` (4,287,631 bytes):
  `12c3ad24f49eef71499a5166161e7e239336f5ba25018be1c09234da36bfc7fd`
- `3december-2023-ridiculous-vehicle.zip` (462,604 bytes):
  `629e14318e201f9d9518b6fee72e58d53b581292bf707cb768334424137090b0`
- `viking-battle-vehicle.zip` (29,678,757 bytes):
  `146d95d23c0fda4f8bd6d442f34d20f100f866c333ee5c26d1ec1db7be434244`

## Reproduction and verification

Blender 4.3.2 is already installed at `/usr/bin/blender`. No dependencies or
browser packages were installed for conversion. Extract the supplied files,
including `vwhixcl.obj` from Viking's nested ZIP, and run:

```sh
blender -b -P scripts/prepare-novelty-assets-a.py -- randy /path/Randy1.glb /path/textures dist/assets/randy.glb
blender -b -P scripts/prepare-novelty-assets-a.py -- ridiculous /path/Day1.fbx /path/textures dist/assets/ridiculous.glb
blender -b -P scripts/prepare-novelty-assets-a.py -- viking /path/vwhixcl.obj /path/textures dist/assets/viking.glb
blender -b -P scripts/render-novelty-assets-a.py -- dist/assets/randy.glb dist/assets/randy-preview.png
```

Verification used the actual project Three.js GLTFLoader under Node, decoding
all eight embedded WebP images with Pillow for the ImageBitmap stand-in. It
checked successful parses, finite animated bounds, independent skeletons and
bones between two instances, the second instance remaining unchanged when the
first animates, gait playback, all four Viking rolling pivots, front steering,
and model disposal. The Node rig check does not exercise a browser GPU renderer.
All three final GLBs were also reimported and rendered offline in Blender, and
their previews were inspected visually. JS syntax and Python compilation checks
passed. Working verification artifacts are in
`/workspace/work/novelty-assets-a/loader-result.json` and the adjacent logs.

Selector, room readiness, and full in-game integration remain the root task's
responsibility; no integration result is claimed by this asset handoff.
