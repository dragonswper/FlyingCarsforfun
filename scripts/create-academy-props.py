"""Original Academy hoop, training cone and direction marker. No external art.
Rebuild: blender --background --python scripts/create-academy-props.py
The GLB contains reusable low-poly meshes; the editable scene is in art/.
"""
import bpy, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.38
    return m
blue=mat('Academy_cyan',(.05,.65,.9),.35);orange=mat('Safety_orange',(.95,.3,.04));white=mat('Reflective_white',(.85,.94,1))
bpy.ops.mesh.primitive_torus_add(major_radius=3.3,minor_radius=.10,major_segments=32,minor_segments=6,rotation=(math.pi/2,0,0))
gate=bpy.context.object;gate.name='Academy_Hoop';gate.data.materials.append(blue)
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.38,radius2=.06,depth=.95,location=(0,0,.475))
cone=bpy.context.object;cone.name='Academy_Cone';cone.data.materials.append(orange)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# An original floor chevron with a raised, bevelled edge.
verts=[(-.7,-.8,.03),(0,-.3,.03),(.7,-.8,.03),(.7,-.3,.03),(0,.3,.03),(-.7,-.3,.03)]
mesh=bpy.data.meshes.new('Direction_chevron_mesh');mesh.from_pydata(verts,[],[(0,1,2,3,4,5)]);mesh.update()
arrow=bpy.data.objects.new('Academy_Chevron',mesh);bpy.context.collection.objects.link(arrow);arrow.data.materials.append(white)
for o in [gate,cone,arrow]:o['originalArtwork']=True;o['purpose']='Non-colliding solo training guide'
scene=bpy.context.scene;scene.world.color=(.1,.13,.18)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/academy-guides.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'dist/assets/academy/guides.glb'),export_format='GLB',export_animations=False,export_yup=True,export_extras=True)
print('Original Academy props exported.')
