# Edit and export

Open any scene in `src/` in Blender 4.3 or later. The five files are the editable source. Keep the names of rig nodes, weapon tips and named kit roots when replacing geometry. Kit roots are in unit bounds, with the floor at Z = 0 in Blender and Y = 0 in glTF. The `*_collider` guides are selectable in Blender and export as dimensions alongside the era kit.

Install Blender and ImageMagick with the `magick` executable on your path. From the repo root run `npm ci`, `npm run assets`, then `npm test`. The build-only gltfpack package applies Meshopt compression after Blender exports each mesh. Set the `BLENDER` environment variable to use a particular Blender executable.

To export a single group, run `blender --background blender/src/knight.blend --python blender/scripts/export.py`. The UI scene exports WebP renders. The source-authoring script `scripts/create.py` recreates the original scenes and overwrites those source files, so use the export script when preserving hand edits.
