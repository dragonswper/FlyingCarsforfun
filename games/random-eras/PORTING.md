# Porting Random Eras

The default world uses broken ridgelines, tree silhouettes, warm haze and stone forts in subdued earth colors. River banks and ironwood groves stay legible at ground level. Each era supplies a separate material palette and structure kit. The menu references show terrain in silhouette, so the rivers, traversable slopes and building interiors use gameplay scale.

## Modules

| Browser source | Responsibility | Unreal equivalent | Unity equivalent |
| --- | --- | --- | --- |
| `src/landscape.js` | Seeded domain-warped fBm, ridges, billows, terracing, erosion, drainage, river, biome weights, roads and pads | C++ generator plus Landscape height layers | Burst jobs plus TerrainData heights and alphamaps |
| `src/world.js` | Configurable sizes and eras, spawns, core pads, rules-based structure placements, collision and arena symmetry | PCG graph driven by serialized points | Burst placement jobs and prefab catalog |
| `src/world-worker.js` | Background generation and transferable height/flow buffers | Task Graph jobs | Jobs and NativeArray |
| `src/terrain-view.js` | Streamed near tiles, distance tiers and seam skirts | Landscape component LOD | Terrain tiles and LOD Group |
| `src/render.js` | Instancing, distant tree cards, structure kits, lighting and 3D actors | ISM/HISM components and material instances | GPU instancing and LOD Groups |
| `public/map-kit.glb`, `public/era-props.glb` | Named foliage, rock and castle meshes in unit bounds with their bases at ground level | Static meshes and instanced materials | Prefabs and instanced materials |
| `src/combat.js` | Swipe vectors, combat phases, buffer and cooldown | Enhanced Input and deterministic gameplay component | Input System and C# state machine |
| `src/simulation.js` | Fixed-step movement, collision, weapons, training AI and objectives | C++ world subsystem | C# fixed-step simulation |

`WorldTuning` and `REGIONS` in `src/world.js` are the terrain defaults. A configuration consists of a shareable seed string, a `preset` of `small`, `medium` or `large`, and an `era` region ID or `random`. The arena size is fixed for competitive symmetry. The seven era IDs are `flintwake`, `sunscar`, `ironwood`, `redcanopy`, `frostfall`, `ashline` and `glassreach`.

## World export schema

Choose **Settings → Gameplay → Export current terrain** in a session. The result is versioned JSON with one unit per meter and Y up.

- `grid.width`, `grid.step`, `grid.origin` describe a square array. Elevations and biome-weight vectors are in row-major order with increasing X inside each increasing Z row.
- `regions` contains the palettes in biome-weight order. Weight vectors are normalized before export rounding.
- `placements` carries stable IDs, type, X/Y/Z, uniform scale, Y-axis rotation in radians, era, variant, and collision shape. Building shells reference the wall and door dimensions in `WorldTuning`. Item placement includes the item kind and rarity where assigned.
- `spawns` and `cores` include positions, era and ownership. Core Y is level across all four fort pads in a Frontier map.
- `river` stores the seeded channel descriptor used by `riverProfile`. `paths` stores road line segments.

Unreal importers can transpose axes to Z up and scale positions from meters to centimeters. Unity can map the grid directly to X/Z, resampling the data to the nearest supported TerrainData resolution. Build mesh or NavMesh walkability from the exported collision shapes and sampled slopes. The browser currently uses point/shape collision checks for its pathfinding.

## Native combat direction

`public/knight.glb` opens as an assembled knight with named shoulder, elbow, wrist, and grip nodes. Both views use the same fixed-length arm chains. The renderer solves the elbow position for each hand target and reads the held weapon’s trail endpoint from its Blender-authored tip. An active-ragdoll port can feed the swipe vectors into hand IK, weapon inertia and body balance, then add grip and thrust states with physics contact events. The physics brief is the target for that phase. Guard rise time, stamina drain, stagger and hit-stop are fixed-step simulation rules. Environmental dressing uses a separate seed stream and leaves the exported gameplay terrain intact.
