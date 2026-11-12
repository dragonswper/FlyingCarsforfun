"""Render actual normalized novelty GLBs, optionally with a wheel phase.
blender -b -t 2 -P scripts/render-novelty-assets-b.py -- vehicle.glb preview.png [phase]
"""
import bpy, math, sys
from pathlib import Path
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
source, target = map(Path, args[:2])
phase = float(args[2]) if len(args) > 2 else 0.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
for obj in bpy.context.scene.objects:
    if obj.name.startswith('Spin_'):
        obj.rotation_mode = 'XYZ'
        obj.rotation_euler.x = phase
for material in bpy.data.materials:
    if not material.use_nodes or not material.use_backface_culling:
        continue
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not output or not output.inputs['Surface'].links:
        continue
    original = output.inputs['Surface'].links[0].from_socket
    geometry, transparent, mix = nodes.new('ShaderNodeNewGeometry'), nodes.new('ShaderNodeBsdfTransparent'), nodes.new('ShaderNodeMixShader')
    links.new(geometry.outputs['Backfacing'], mix.inputs[0])
    links.new(original, mix.inputs[1])
    links.new(transparent.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])
bpy.context.view_layer.update()
points = [obj.matrix_world @ Vector(c) for obj in bpy.context.scene.objects if obj.type == 'MESH' for c in obj.bound_box]
low = Vector([min(p[i] for p in points) for i in range(3)])
high = Vector([max(p[i] for p in points) for i in range(3)])
center = (low + high) / 2
world = bpy.data.worlds.new('Studio')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.24, .32, .4, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .6
for name, offset, power, lamp_size, color in [('Key', (2, -2, 4), 650, 3, (.8, .9, 1)), ('Fill', (-3, -1, 2), 450, 3, (.7, .85, 1)), ('Rim', (0, 3, 3), 750, 2, (1, .85, .65))]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.size, data.color = power, lamp_size, color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = center + Vector(offset)
    obj.rotation_euler = (center - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', data)
bpy.context.collection.objects.link(camera)
camera.location = center + Vector((2.4, -3, 1.6))
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
data.type = 'ORTHO'
orientation = camera.rotation_euler.to_quaternion().inverted()
projected = [orientation @ (p - center) for p in points]
horizontal = max(p.x for p in projected) - min(p.x for p in projected)
vertical = max(p.y for p in projected) - min(p.y for p in projected)
data.ortho_scale = max(horizontal, vertical * 1.5) * 1.12
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 480, 320
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format, scene.render.image_settings.color_mode = 'PNG', 'RGBA'
scene.render.filepath = str(target)
bpy.ops.render.render(write_still=True)
