"""Export the open asset scene. Pass the destination folder after --."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import bpy

source = Path(bpy.data.filepath)
destination = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else source.parents[2] / 'public'
destination.mkdir(parents=True, exist_ok=True)

if source.stem == 'ui-art':
    with tempfile.TemporaryDirectory() as scratch:
        for key in ('dusk', 'cover', 'knight-portrait', 'parchment', 'seal-icons'):
            scene = bpy.data.scenes[key]
            path = Path(scratch) / (key + '.png')
            scene.cycles.use_denoising = False
            scene.render.filepath = str(path)
            scene.render.image_settings.file_format = 'PNG'
            scene.render.image_settings.color_mode = 'RGBA'
            bpy.ops.render.render(scene=key, write_still=True)
            subprocess.run(['magick', str(path), '-quality', '86', str(destination / (key + '.webp'))], check=True)
else:
    bpy.ops.object.select_all(action='SELECT')
    for obj in bpy.context.scene.objects:
        if obj.name.endswith('_collider'):
            obj.select_set(False)
    with tempfile.TemporaryDirectory() as scratch:
        raw = Path(scratch) / source.with_suffix('.glb').name
        bpy.ops.export_scene.gltf(filepath=str(raw), export_format='GLB',
                                 use_selection=True, export_yup=True, export_apply=True, export_extras=True,
                                 export_animations=False, export_materials='EXPORT')
        packer = source.parents[2] / 'node_modules' / 'gltfpack' / 'cli.js'
        subprocess.run(['node', str(packer), '-i', str(raw), '-o', str(destination / raw.name),
                        '-c', '-vpf', '-kn', '-km', '-ke'], check=True)
    if source.stem == 'era-props':
        colliders = {}
        for obj in bpy.context.scene.objects:
            if obj.name.endswith('_collider'):
                colliders[obj.name.removesuffix('_collider')] = {
                    'width': obj.dimensions.x, 'height': obj.dimensions.z, 'depth': obj.dimensions.y,
                }
        (destination / 'era-props-colliders.json').write_text(json.dumps(colliders, sort_keys=True, indent=2) + '\n')
