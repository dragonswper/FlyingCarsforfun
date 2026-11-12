# Supplied novelty vehicles: sci-fi, golf cart, rickshaw and IFV

All four supplied GLBs downloaded successfully through the uploaded-file tool in the cloud workspace. None exceeded its 32 MiB limit, and no transfer through an external service was needed. The runtime derivatives and thumbnails are separate third-party artwork, with the supplied licenses below; the game's MIT code license does not replace those licenses. Original downloads remain outside the repository.

| ID | Runtime GLB bytes | Triangles | Material batches | Rolling assemblies |
| --- | ---: | ---: | ---: | ---: |
| `scifi` | 1,790,012 | 71,600 | 21 | 3 |
| `golfcart` | 3,587,096 | 68,197 | 8 | 4 |
| `rickshaw` | 2,642,336 | 69,800 | 5 | 3 |
| `ifv` | 4,809,684 | 103,996 | 39 | 30 |

Each GLB is at `dist/assets/models/<id>.glb`, with exact source/output SHA-256, size, attribution, modifications, bounds and wheel measurements in `<id>-import.json`. Its transparent 480 × 320 PNG thumbnail is `dist/assets/<id>-preview.png`. Assets are embedded and self-contained. The textured golf cart and rickshaw require `EXT_texture_webp`, supported by the existing local Three.js loader. The sci-fi and IFV use material colors without images. No external geometry decoder, CDN, animation clips or skins are shipped.

## Credits and verified license limits

Attribution and license identifiers were verified from `asset.extras` in each supplied GLB and preserved verbatim in the derivatives. No separate purchase receipt or permission document was supplied.

- **Modular Sci-fi Vehicle Set 0.115 Test**, by [3DHaupt](https://sketchfab.com/dennish2010), [source](https://sketchfab.com/3d-models/modular-sci-fi-vehicle-set-0115-test-5b095f8940c840b389522609cebf46d4), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Wooden Golf Cart With Golf Club Bags**, by [bcwilcox](https://sketchfab.com/bcwilcox), [source](https://sketchfab.com/3d-models/wooden-golf-cart-with-golf-club-bags-7a2f3d7f7b014481a1e71bf5faf2af57), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Stylized Vehicle AutoRickshaw**, by [gourav.das3650](https://sketchfab.com/gourav.das3650), [source](https://sketchfab.com/3d-models/stylized-vehicle-autorickshaw-b40307aeeafb42be928b4181551dcb61), **[Sketchfab Standard](https://sketchfab.com/licenses)**.
- **Infantry fighting Vehicle concept**, by [adilwork23](https://sketchfab.com/adilwork23), [source](https://sketchfab.com/3d-models/infantry-fighting-vehicle-concept-49ff213ce1244856ba741373b6fcf1f0), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

CC BY derivatives require attribution, a license link and an indication of changes. Their import records and this document identify the adaptations.

The rickshaw has a different publication limit. The [Sketchfab license page](https://sketchfab.com/licenses), checked on 12 November 2026, says, “You may not use the 3D asset in a way that allows others to use or access the 3D asset as a stand-alone file.” Agreement §2.2(h) also restricts making the material available for standalone download, extraction, redistribution or access. Its loose GLB must retain this license limitation; preparation does not establish permission to redistribute it as a downloadable model. This task prepared local files and did not publish any of them.

## Runtime contract and geometry

These are visual novelty bodies for the existing car hitbox and handling. The assets contain no replacement collision geometry or physics constants. They use **+Y up, +Z forward**, a two metre visual length, an approximately zero visual floor and centered lateral/longitudinal bounds. The existing `makeCustomModel` applies the normal `-C.carHeight` visual offset.

| ID | GLB X bounds | GLB Y bounds | GLB Z bounds | Visual wheelbase |
| --- | --- | --- | --- | ---: |
| `scifi` | −0.491707 … 0.491714 | −0.000170 … 1.376026 | −0.999992 … 0.999957 | 1.664579 m |
| `golfcart` | −0.560672 … 0.560759 | 0.000030 … 1.479056 | −0.999905 … 0.999921 | 1.351800 m |
| `rickshaw` | −0.740678 … 0.740678 | 0.002069 … 2.138880 | −0.999981 … 1.000255 | 1.173550 m |
| `ifv` | −0.807215 … 0.807255 | 0 … 1.072526 | −1 … 0.999932 | Tracked; no steering axle |

All models contain `Custom_Body` and independent `Steer_<label>` → `Spin_<label>` → `Wheel_<label>` nodes. `Spin` is a direct child of its matching `Steer`. Each steering node has `rollingRadius` and `front` extras. The existing procedural adapter can instantiate and animate them without a new runtime module. Exact pivot positions in glTF coordinates are in the import records.

- `scifi`: labels `F`, `RL`, `RR`; only `F` steers; radii about 0.15169 m. The supplied “set” contains one coherent assembled articulated three-wheeler, rather than multiple disconnected complete vehicles. This derivative keeps that assembly, removes its display floor and importer-created hidden bone shapes, and bakes the first imported pose. Fixed legs and suspension remain; the source demonstration animation/armatures are replaced with procedural tire rolling and front steering.
- `golfcart`: labels `FL`, `FR`, `RL`, `RR`; both front wheels steer; measured radii about 0.23161–0.23634 m. The scanned cart was one connected surface. Approximate outer wheel/tire/hub regions were separated with measured cylindrical masks while retaining their supplied UV artwork. The bags and clubs remain fixed. This is a visual adaptation rather than a mechanical reconstruction of the scan; irregular, shadowed inboard wheel surfaces remain visible from some angles while rolling.
- `rickshaw`: labels `F`, `RL`, `RR`; only `F` steers; radii about 0.15643 m front and 0.18577 m rear. The source named wheel parts are grouped into three rolling assemblies; the cross-car rear axle stays fixed. All roof cargo and decorative artwork remain.
- `ifv`: labels `L1` … `L15` and `R1` … `R15`; every node has `front=false`, so the existing adapter applies no steering. Running-gear radii are about 0.04483, 0.07935 and 0.10371 m. Track belts/links, spare wheels, hull and turret remain fixed; the actual road wheels, return rollers and end wheels roll. The tracks do not scroll or deform. A low rear source fitting sets the visual floor slightly below the track belts.

No model defines `Custom_Paint`; keep the supplied finishes and disable or explain unavailable paint controls. Dense geometry is simplified and batched by material. The golf cart retains its used UV channel while dropping three unused channels. All unused IFV UV channels are removed; retaining them added large buffers with no visible contribution. Golf-cart images remain at their supplied 1024 pixels; rickshaw images are reduced from 4096 to 1024 pixels. Images use embedded WebP quality 90.

## Reproduction and validation

Use Blender only in a development workspace; players need no native installation. For each ID, run:

```sh
blender -b -t 2 --python-exit-code 1 -P scripts/prepare-novelty-assets-b.py -- scifi /path/to/modular_sci-fi_vehicle_set_0.115_test.glb dist/assets/models/scifi.glb
blender -b -t 2 --python-exit-code 1 -P scripts/prepare-novelty-assets-b.py -- golfcart /path/to/wooden_golf_cart_with_golf_club_bags.glb dist/assets/models/golfcart.glb
blender -b -t 2 --python-exit-code 1 -P scripts/prepare-novelty-assets-b.py -- rickshaw /path/to/stylized_vehicle_autorickshaw.glb dist/assets/models/rickshaw.glb
blender -b -t 2 --python-exit-code 1 -P scripts/prepare-novelty-assets-b.py -- ifv /path/to/infantry_fighting_vehicle_concept.glb dist/assets/models/ifv.glb
blender -b -t 2 --python-exit-code 1 -P scripts/render-novelty-assets-b.py -- dist/assets/models/scifi.glb dist/assets/scifi-preview.png
node scripts/check-novelty-assets-b.mjs
```

The check script passed for all four final files using the game's actual Three.js GLTFLoader, `validateCustomRig`, `makeCustomModel` and `animateVehicle`. It verifies file structure/hashes, embedded resources/credits, finite geometry, bounds/floor, triangle/material counts, all wheel pivots/radii, signed rolling, appropriate front steering, original finishes, independent cloned materials and shared geometry. Node image decoding is stubbed; this check does not establish browser WebP decoding or GPU output.

Offline Blender previews of all four actual runtime GLBs were inspected. A separate 90-degree wheel-phase preview checks the golf-cart wheel separation. This bounded task did not edit the shared catalog, game UI, scene, physics or networking and did not run or publish a Site. Live browser behavior, frame rate and final UI integration are the parent task's checks.
