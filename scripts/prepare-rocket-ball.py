"""Convert the supplied FBX ball to a self-contained, unit-radius GLB.

Usage: blender -b -P scripts/prepare-rocket-ball.py -- "source/rocket ball.fbx" output.glb [preview.png]
Run only in a development environment. The browser game needs no Blender.
"""
import bpy
import hashlib
import json
import struct
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
if len(args) not in (2, 3):
    raise RuntimeError('Expected source FBX, output GLB and optional preview PNG')
source, target = map(Path, args[:2])
preview = Path(args[2]) if len(args) == 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise RuntimeError('The supplied ball has no mesh')
if len(meshes) != 1:
    raise RuntimeError('Unexpected source structure; inspect before adapting')
obj = meshes[0]
source_animation_count = len(bpy.data.actions)
points = np.array([tuple(obj.matrix_world @ v.co) for v in obj.data.vertices])
source_min, source_max = points.min(axis=0), points.max(axis=0)
# Fit the center of the sphere rather than centering its asymmetric panel AABB.
# Grooves remain recessed; the outermost source vertex matches the collision radius.
center = np.linalg.lstsq(np.column_stack([2 * points, np.ones(len(points))]), (points * points).sum(axis=1), rcond=None)[0][:3]
radii = np.linalg.norm(points - center, axis=1)
outer_radius = float(radii.max())
if outer_radius <= 0:
    raise RuntimeError('Degenerate ball bounds')
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for vertex in obj.data.vertices:
    vertex.co = (vertex.co - Vector(center)) / outer_radius
obj.matrix_world.identity()
obj.name = 'Rocket_Ball'
obj.data.name = 'Rocket_Ball_Geometry'
obj.data.calc_loop_triangles()
triangles = len(obj.data.loop_triangles)

atlas_path = source.parent.parent / 'textures' / 'Tex_0117_3.png'
atlas = bpy.data.images.load(str(atlas_path), check_existing=False)
if max(atlas.size) > 1024:
    scale = 1024 / max(atlas.size)
    atlas.scale(round(atlas.size[0] * scale), round(atlas.size[1] * scale))
atlas.colorspace_settings.name = 'sRGB'
atlas.pack()
for index, material in enumerate(obj.data.materials):
    # The FBX had an unconnected normal node and a packed diffuse atlas. Relink
    # the supplied atlas to the panel material instead of retaining missing paths.
    source_color = tuple(material.diffuse_color)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
    shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Metallic'].default_value = .18
    shader.inputs['Roughness'].default_value = .58
    if index == 0:
        material.name = 'Rocket_Ball_Panels'
        tex = material.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = atlas
        material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    else:
        material.name = 'Rocket_Ball_Lights'
        shader.inputs['Base Color'].default_value = source_color
        shader.inputs['Emission Color'].default_value = source_color
        shader.inputs['Emission Strength'].default_value = .3
for other in list(bpy.context.scene.objects):
    if other != obj:
        bpy.data.objects.remove(other, do_unlink=True)
target.parent.mkdir(parents=True, exist_ok=True)
credit = {
    'title': 'Ball - Rocket League',
    'author': 'Unspecified in supplied archive',
    'license': 'Unspecified in supplied archive',
    'source': 'User supplied ball-rocket-league.zip',
}
obj['assetId'] = 'rocket-ball'
obj['collisionRadius'] = 1.0
bpy.ops.export_scene.gltf(
    filepath=str(target), export_format='GLB', export_yup=True,
    export_extras=True, export_cameras=False, export_lights=False,
    export_animations=False, export_image_format='WEBP', export_image_quality=90,
)
# Keep honest source provenance in the GLB as well as the import report.
raw = target.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_length])
binary = raw[28 + json_length:]
doc['asset']['extras'] = credit
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
packed = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(binary), 0x004e4942) + binary
target.write_bytes(packed)
report = {
    'file': target.name, 'sourceFile': source.name,
    'sourceBytes': source.stat().st_size,
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest(),
    'credit': credit, 'sourceBoundsBlender': {'min': source_min.tolist(), 'max': source_max.tolist()},
    'sphereFitCenterBlender': center.tolist(), 'sourceOuterRadius': outer_radius,
    'radius': 1.0, 'radialRange': [float(radii.min() / outer_radius), 1.0],
    'radialMedian': float(np.median(radii) / outer_radius),
    'triangles': triangles, 'drawBatches': len(doc.get('materials', [])),
    'images': len(doc.get('images', [])), 'textureEncoding': 'WebP quality 90 at 1024 pixels',
    'extensionsRequired': doc.get('extensionsRequired', []),
    'sourceAnimations': source_animation_count, 'animations': 0,
    'modifications': [
        'Baked source orientation and centered on fitted sphere center',
        'Normalized the outermost vertex to unit collision radius; retained panel grooves',
        'Relinked the supplied diffuse atlas and removed disconnected normal nodes and missing local image paths',
        'Retained both panel and green light material groups; added subtle light emission',
        'Reduced diffuse atlas to 1024 pixels and embedded as WebP quality 90',
    ],
}
target.with_name('rocket-ball-import.json').write_text(json.dumps(report, indent=2) + '\n')
target.chmod(0o644)
target.with_name('rocket-ball-import.json').chmod(0o644)
print('ROCKET_BALL_REPORT', json.dumps(report), flush=True)

if preview:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('Preview World')
    scene.world.color = (.22, .22, .22)
    for loc, energy, size in [((2, -3, 4), 550, 4), ((-3, 1, 1), 280, 3), ((1, 3, 3), 400, 3)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(2.6, -3.4, 2.3))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.55
    scene.camera = camera
    preview.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
