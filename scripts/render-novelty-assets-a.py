"""Render a transparent garage preview from a prepared novelty GLB in Blender."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
source,target=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();points=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or not obj.data.materials:continue
    current=obj.evaluated_get(deps);mesh=current.to_mesh()
    points += [current.matrix_world@v.co for v in mesh.vertices]
    current.to_mesh_clear()
low=Vector([min(p[i] for p in points) for i in range(3)])
high=Vector([max(p[i] for p in points) for i in range(3)])
center=(low+high)/2;dimension=max(high-low)
world=bpy.data.worlds.new('Preview World');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.67,.82,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45;bpy.context.scene.world=world
for pos,energy,size in [((3,-4,6),700,4),((-4,-1,3),450,3),((1,4,5),900,3)]:
    data=bpy.data.lights.new('Preview light','AREA');data.energy=energy;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new('Preview light',data);bpy.context.collection.objects.link(obj)
    obj.location=center+Vector(pos);obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('Preview camera');obj=bpy.data.objects.new('Preview camera',camera)
bpy.context.collection.objects.link(obj);bpy.context.scene.camera=obj
obj.location=center+Vector((3,-5,2.5));obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
camera.type='ORTHO';camera.ortho_scale=dimension*1.28
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='AgX';scene.render.filepath=target
Path(target).parent.mkdir(parents=True,exist_ok=True);bpy.ops.render.render(write_still=True)
print('PREVIEW_BOUNDS',list(low),list(high),flush=True)
