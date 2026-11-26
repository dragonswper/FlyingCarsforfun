"""Original Circuit Cup trophy: machined cup, hexagonal base and three victory fins.
Rebuild: blender --background --python scripts/create-club-trophy.py
"""
import bpy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.25;return m
gold=material('Brushed_champagne',(.8,.48,.12),.75);dark=material('Hexagonal_slate',(.025,.06,.10),.45);silver=material('Machined_silver',(.65,.78,.85),.8);cyan=material('Enamel_cyan',(.04,.55,.8),.35)
def cylinder(name,r,depth,z,mat,vertices=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(0,0,z));o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
cylinder('Hexagonal_Plinth',.9,.25,.125,dark,6);cylinder('Engraved_Base_Ring',.72,.07,.285,gold);cylinder('Victory_Stem',.16,1,.8,silver)
# Lathed hollow cup, modelled as one continuous surface with a thick lip.
profile=[(.14,1.1),(.26,1.2),(.6,1.6),(.78,2.05),(.82,2.28),(.76,2.28),(.71,2.06),(.53,1.63),(.23,1.28)]
verts=[];faces=[];segments=32
for radius,z in profile:
 for i in range(segments):a=2*math.pi*i/segments;verts.append((radius*math.cos(a),radius*math.sin(a),z))
for row in range(len(profile)-1):
 for i in range(segments):a=row*segments+i;b=row*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
m=bpy.data.meshes.new('Lathed_hollow_cup');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('Circuit_Cup',m);bpy.context.collection.objects.link(o);o.data.materials.append(gold)
for i in range(3):
 a=i*2*math.pi/3;bpy.ops.mesh.primitive_cube_add(size=1,location=(.5*math.cos(a),.5*math.sin(a),.9));o=bpy.context.object;o.name='Victory_Fin_'+str(i+1);o.scale=(.12,.5,.7);o.rotation_euler=(.18,.1,a);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(cyan)
# Join by material: four reusable draws and no external textures.
for mat in [gold,dark,silver,cyan]:
 bpy.ops.object.select_all(action='DESELECT');objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.active_material==mat]
 for o in objects:o.select_set(True)
 if objects:bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='Original_Trophy_'+mat.name;bpy.context.object['originalArtwork']=True
out=ROOT/'dist/assets/club';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/circuit-cup.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(out/'circuit-cup.glb'),export_format='GLB',export_animations=False,export_extras=True,export_yup=True)
print('Original trophy exported, four materials and no image textures.')
