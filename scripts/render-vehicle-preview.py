"""Offline thumbnail render from the actual runtime GLB.
blender -b -t 3 -P scripts/render-vehicle-preview.py -- vehicle.glb preview.png
"""
import bpy,sys
from pathlib import Path
from mathutils import Vector
source,target=map(Path,sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
# Cycles renders both sides even when the glTF material uses front-face culling.
# Emulate the browser's culling in this offline preview, including ink hulls.
for material in bpy.data.materials:
 if not material.use_nodes or not material.use_backface_culling:continue
 nodes=material.node_tree.nodes;links=material.node_tree.links;output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL'),None)
 if not output or not output.inputs['Surface'].links:continue
 original=output.inputs['Surface'].links[0].from_socket;geometry=nodes.new('ShaderNodeNewGeometry');transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');links.new(geometry.outputs['Backfacing'],mix.inputs[0]);links.new(original,mix.inputs[1]);links.new(transparent.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
low=Vector([min(v[i] for v in points) for i in range(3)]);high=Vector([max(v[i] for v in points) for i in range(3)]);center=(low+high)/2;size=high-low
world=bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.32,.4,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
for name,offset,power,lamp_size,color in [('Key',(2,-2,4),650,3,(.8,.9,1)),('Fill',(-3,-1,2),450,3,(.7,.85,1)),('Rim',(0,3,3),750,2,(1,.85,.65))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=lamp_size;data.color=color;obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=center+Vector(offset);obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',data);bpy.context.collection.objects.link(cam);cam.location=center+Vector((2.4,-3,1.6));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=max(2.6,size.x*1.4,size.y*1.3,size.z*2.4);bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=80;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.render.resolution_x=480;scene.render.resolution_y=320;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(target);bpy.ops.render.render(write_still=True)
