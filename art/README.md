# Original Blender arenas

The five 1.24 venues are original Boost Circuit artwork, modeled, exported and rendered using Blender 4.3.2. Sources and original geometry use the repository's MIT license. No downloaded art or textures are used in these five venues.

| Editable source | Theme | Blender render |
| --- | --- | --- |
| [yuletide.blend](yuletide.blend) | Yuletide Market — Christmas market, clocktower, snow and lanterns | [Preview](../dist/assets/maps/yuletide-cover.webp) |
| [halloween.blend](halloween.blend) | Halloween Hollow — Pumpkin harvest, gothic manor and moonlit bare trees | [Preview](../dist/assets/maps/halloween-cover.webp) |
| [coast.blend](coast.blend) | Sunset Coast — Seaside promenade, lighthouse, palms and sailboats | [Preview](../dist/assets/maps/coast-cover.webp) |
| [canyon.blend](canyon.blend) | Red Rock Canyon — Layered sandstone, natural arch and desert rail bridge | [Preview](../dist/assets/maps/canyon-cover.webp) |
| [orbital.blend](orbital.blend) | Orbital Station — Observation ring, solar arrays and an Earthrise | [Preview](../dist/assets/maps/orbital-cover.webp) |

Each source file retains individual named meshes in Architecture, Landscape and Venue props collections, calibration empties, preview pitch geometry, an overview camera and lighting. The compressed files open normally in Blender. Geometry is in metres with Z up; the GLB exporter maps to the game's Y-up coordinates.

From the repository root, with Blender 4.3+ and FFmpeg installed:

```sh
blender -b -t 2 --python-exit-code 1 -P scripts/create-arena-pack.py -- all
```

Replace `all` with one or more of `yuletide halloween coast canyon orbital` to rebuild individual scenes. This replaces those generated source, GLB, report and cover files. The seeded script is the reproducible source of the geometry; edits made by hand in a `.blend` should be saved separately before rerunning it.

GLBs, JSON reports and WebP covers are written to `dist/assets/maps/`. Only selected material-batched scene copies and calibration markers enter the GLBs. Neither Blender's preview field nor camera/light objects are exported. The browser adds its shared playable field, rounded enclosure, goals and boost pads. Keep decorative geometry outside that cage and the full goal rooms when editing; `npm test` verifies the exported clearances and budgets.

The older [harbourworks.blend](harbourworks.blend) venue and reference van source also remain in this folder.

## Original sky domes

[sky-domes.blend](sky-domes.blend) contains the shared unit-sphere mesh, eleven packed panoramic paintings, eleven emission materials and an inside-dome preview camera. Assign a `Sky_…` material to the sphere to preview or edit that arena. The sphere and sky paintings are original MIT-licensed Boost Circuit artwork; no downloaded sky photographs or textures are used.

Rebuild with Blender 4.3+ and a `python3`/`python` installation that already has Pillow:

```sh
blender -b -t 2 --python-exit-code 1 -P scripts/create-sky-domes.py
```

This replaces the generated `.blend`, `dist/assets/skies/sky-dome.glb`, eleven WebP images and the hash/size report. Save hand edits separately before rebuilding. The browser uses the actual Blender mesh, with an inward-facing unlit material; its centre follows the camera. The dome is background artwork and has no collision shape. Only the chosen sky downloads with its map, and one shared mesh renders all eleven styles. Source PNGs are packed into the `.blend`; intermediate files use a temporary directory.
