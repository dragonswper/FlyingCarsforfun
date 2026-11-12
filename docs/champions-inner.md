# Champions Field inner arena

`dist/assets/models/champions-inner.glb` contains the supplied model's actual turf, perimeter/ramp trim and both complete goals. It is not a newly generated field or a replacement goal primitive. Original source triangles are transformed, and extra samples are added to the original surface triangles where the existing collision ramps need more curvature detail.

Source: [Champions Field – Rocket League Stadium](https://sketchfab.com/3d-models/champions-field-rocket-league-stadium-6ea5ee0502ae432fbac3a4f8aaab61a5), by [Prabhu Ram / virtualmakes](https://sketchfab.com/virtualmakes), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The GLB preserves this attribution in `asset.copyright` and the original Sketchfab metadata in `asset.extras`. Changes: calibration, a local goal-mouth fit, material colors, removal of obstructing cage/roof parts, surface subdivision and quantization.

## Files and reproduction

```sh
node scripts/import-champions-inner.mjs /path/to/champions-original.glb
```

The script writes only `champions-inner.glb` and `champions-inner-import.json`. Optional `--source-colors` uses the literal source colors instead of the game's turf/team palette. The supplied model's source SHA-256 is `67f26342f465170743cbb0e091cc289d8fda112ccb66d2c26455f2e38a8f04d4`.

Default output: 995,600 bytes, 15 draw meshes, 68,036 triangles, 35,404 vertices. Positions and normals use `KHR_mesh_quantization`; the existing Three.js `GLTFLoader` loads it directly without a decoder or textures. Of those triangles, 17,764 come from retained source parts, 49,160 are conforming subdivisions of those surface triangles, and 1,112 come from cutting native frame triangles at the mouth and fade-boundary planes.

## Integration

```js
const gltf = await new GLTFLoader().loadAsync('./assets/models/champions-inner.glb');
const inner = gltf.scene; // identity transform; already in the game's world units
scene.add(inner);
const field = inner.getObjectByName('Champions_Inner_turf');
```

The asset's named group is `Champions_Inner`. Every mesh supplies `userData.role`, `team` (`Blue`, `Orange`, or empty for turf), `sourceMesh`, `sourceGeometry: true`, and `detail: 'inner-field'`. Mesh names use `Champions_Inner_` plus the role with underscores and optional team suffix.

Keep the existing `createPads()` / `BoostPadView` objects and their physics state. This asset has no pads. Replace the generated visible turf, ramps and goal primitives with this asset to avoid overlapping fields/goals. Transparent wall/ceiling visuals, the stadium architecture, and the dark platform can remain independently. `Champions_Inner_turf` is only the grass portion: the native perimeter and ramp trim also form parts of the visible ramp surface, so retain all three field roles.

| Role | Native mesh suffix | Count |
| --- | --- | --- |
| `turf` | `play_lambert1_0` | 1 |
| `ramp-trim` | `play_rampTop1_0` | 2, split by team |
| `perimeter-trim` | `play_ring02_0` | 2, split by team |
| `goal-frame` | `goalRing1_0` | 2 |
| `goal-interior` | `goal_inside1_0` | 2 |
| `goal-floor` | `goal_Ground1_0` | 2 |
| `goal-back-insert` | `goal_inner1_0` | 2 |
| `goal-back-structure` | `goal_innerDown1_0` | 2 |

All suffixes above belong to original `polySurface3408_` meshes. Removed: `polySurface3346_playOuter1_0`, `polySurface3346_playouter_glow1_0`, `polySurface3408_play_Glassdome1_0`, and the disconnected 256-triangle overhead component of `play_ring02_0`. These opaque/translucent cage surfaces and the beam could obstruct the chase camera. Native low perimeter trim is retained.

## Calibration and checks

The JSON report records measured original world-space mesh bounds, all mapping knots, retained mesh roles, actual decoded geometry checks and caveats. Source +X becomes game +Z toward orange; source +Z becomes game -X. No extra rotation/scale/translation should be applied at runtime.

| Measured source landmark | Source coordinate/distance | Game target |
| --- | --- | --- |
| Long center | -0.0023651123 | 0 |
| Cross center | -0.0002550781 | 0 |
| Turf floor | Y 0.0337255932 | Y 0 |
| Nearly flat turf extent, long | ±2.6805887222 from center | ±48.64 |
| Nearly flat turf extent, cross | ±1.4853547513 from center | ±38.40 |
| Turf outer extent, long | ±2.7763888836 from center | ±51.20 |
| Turf outer extent, cross | ±1.8355191648 from center | ±40.96 |
| Goal interior half-width | 0.5253978074 | 8.92755 |
| Goal interior roof | Y 0.4160776138 | Y 6.42775 |
| Farthest goal back | ±3.2494521141 from center | ±60.00 |

The axis maps are monotonic and piecewise linear. A radial mapping between the source floor/rim contours and `arenaOutline()` aligns the different corner shapes. Native turf vertices are projected onto the existing solver's floor/quarter-circle ramp surface; native trim lies 0.012 m above it. Native goal-floor triangles are flattened to Y=0. Rim subdivisions follow the existing outline continuously. Quantization preserves the side of the goal-shoulder branch that each vertex occupies.

The original flared frame was about 0.137 m wider per side and 0.107 m taller at the actual |Z| 51.2 mouth than the existing collider. Native frame triangles are cut at that plane and at both 0.95 m fade boundaries. Frame Y is scaled by approximately 0.98356 about the floor; a measured width profile at every native mouth-section vertex height then fits both sides to ±8.92755, avoiding a single scale that would narrow the lower posts. The bottom 0.1 m and top 0.12 m retain rounded corner transitions. Each vertex displacement uses `w=(1+cos(pi*abs(z-mouthZ)/0.95))/2` within 0.95 m of the plane and zero beyond it. Cutting the band boundaries ensures triangles outside the band remain on the original source surface. The original flare, roof joining and rear geometry farther behind remain intact. `calibration.goalFrameMouth` records the exact before/after dimensions, scale, width profiles and falloff.

Reloaded through the actual runtime `GLTFLoader`, the grass bounds are X ±40.9599991, Y 0–2.55999994, Z ±51.2000008. Goal interior half-width is 8.9285145 (0.965 mm from `C.goalWidth`); the roof is 6.42775011 (0.00000011 m from `C.goalHeight`). Actual mouth-plane rays check both posts at nine heights and the crossbar at five X positions for each team; all 46 fit the existing aperture within 1 mm. The largest measured decoded turf-vertex height difference is 0.01483 m near a steep ramp. Fifteen central/side/corner ray probes have at most 0.00772 m height error after accounting for trim offset. A further 740 boundary probes, at 0.05–3.0 m from every wall segment, all hit the original field/trim geometry; their maximum height error is 0.02038 m.

Offline Blender renders inspected the isolated field, close goal and a low camera view with the existing stadium architecture. No browser/server was started: the Sites-mandated managed browser tool was unavailable in this session. Rendering here does not establish runtime frame rate or prove every chase-camera position.

## Limits

- The original model supplies a plain floor and blue perimeter/ramp trim. It has no center circle, halfway line, penalty-box texture, goal nets or boost-pad meshes. The native trim is retained and team-colored. This asset does not add those absent details.
- The native front frames flare forward and have rounded corners. The measured aperture at |Z| 51.2 is fitted to the existing constants; the decorative front-frame depth spans about |Z| 48.637–52.358. The local correction preserves the flare farther behind and the small rounded corner transitions. This is visual geometry, not a new collider.
- The original goal rear is curved. Its farthest point reaches the existing back plane at |Z| 60, while some interior surfaces lie in front of that plane. Existing rectangular goal collisions remain an approximation of the supplied decorative rear geometry.
- Finite source triangles approximate circular ramps between projected vertices. Conforming subdivision keeps tested interpolation differences near two centimeters; the full JSON includes actual measured values.
- Removed cage/dome/overhead pieces are deliberately absent. Wall/ceiling collision behavior continues to come from the existing solver.
