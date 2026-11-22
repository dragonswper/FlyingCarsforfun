# 1.24.0 — Five original Blender arenas

Play: https://flyingcarsforfun.connstors.workers.dev — reload all players for **boost-circuit-1.24.0**.

The arena catalog now contains eleven fields. The five new venues are modeled from scratch in Blender, with Christmas and Halloween as the two holiday themes. All five work in exhibition, free play, training, private rooms and dedicated online modes. Online Match chooses from all eleven; rematches avoid the preceding field and everyone receives the authority's same map choice.

| Arena | Modeled setting | GLB download | Triangles | Material batches |
| --- | --- | ---: | ---: | ---: |
| Yuletide Market | Christmas market, clocktower, snow and lanterns | 2.88 MB | 51,914 | 12 |
| Halloween Hollow | Pumpkin harvest, gothic manor and moonlit bare trees | 1.99 MB | 37,184 | 13 |
| Sunset Coast | Seaside promenade, lighthouse, palms and sailboats | 1.68 MB | 31,366 | 13 |
| Red Rock Canyon | Layered sandstone, natural arch and desert rail bridge | 2.00 MB | 38,192 | 12 |
| Orbital Station | Observation ring, solar arrays and an Earthrise | 2.14 MB | 39,404 | 13 |

Choose a field under **Training/Exhibition → Arena**, or in a private lobby's Arena setting. The home-screen **5 New Fields** shortcut opens Yuletide Market. Selecting a new venue shows its Blender-rendered preview. The holiday and other fields use the shared regulation cage, curved driving surfaces, goal rooms and 34 boost pads, so arena selection does not change physics or handling.

## Original artwork and source

Each venue includes over 2,000 individually editable source props in a compressed `.blend` file. The web export merges those props by material. Architecture uses stepped terraces, team seating, floodlights, canopies and venue lettering; the surrounding scenery supplies the distinct theme. Blender preview pitch geometry, cameras and lights are excluded from the web asset. The game's existing renderer supplies the actual playable pitch and lighting.

- [Editable Blender files and rebuild instructions](../art/README.md).
- [Original Blender modeling/export/render script](../scripts/create-arena-pack.py).
- `dist/assets/maps/{yuletide,halloween,coast,canyon,orbital}.glb`, matching `.json` provenance/budget reports and `-cover.webp` renders.

These five venues contain no downloaded models or external textures. The original geometry and source are licensed under the project's MIT license. Existing supplied art keeps its existing credits.

## Loading and validation

All **427 automated tests** passed, as did the JavaScript syntax checks and Cloudflare deployment dry run. All five saved `.blend` files were reopened in Blender and verified to retain their individually editable props and overview cameras.

The client loads only the selected new arena, caches its template for reuse and retries failed downloads. The five new GLBs are each under 3 MB and use 12–13 material batches; the compressed Blender sources together are about 3.2 MB. This is an asset budget, not a guaranteed device frame rate.

Checks cover calibration markers, finite vertex/normal data, file hashes, self-contained buffers/materials, original-art metadata, preview exclusion, phone-oriented geometry/draw budgets and clearance around the full pitch, ceiling and both goal interiors. The existing deterministic-physics test runs all eleven arenas with the same input sequence. Every selector includes all eleven IDs, and random selection reaches each field while excluding the previous arena on rematch.

Chromium with software rendering loaded and drove all five new maps using the mobile graphics preset, with no JavaScript errors or failed asset requests. The same check verified that startup downloaded only the selected venue and that each of the other four downloaded once when selected. Dedicated-server tests verify shared map selection for two drivers, a late spectator and the next configured rematch on each new field. These checks do not claim physical-phone frame rates or independent Australian network latency.
