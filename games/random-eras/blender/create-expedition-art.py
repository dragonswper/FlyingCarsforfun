"""Original, low-poly Expedition props. Run with Blender --background --python."""
import bpy, math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'public'/'assets';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.65
 return m
wood=material('Expedition ash wood',(.29,.13,.06));iron=material('Expedition iron',(.12,.16,.19),.6);gold=material('Sunstone brass',(.72,.42,.1),.55);teal=material('Rift crystal',(.17,.72,.64),.3);stone=material('Ward stone',(.38,.37,.42));cloth=material('Caravan canvas',(.65,.48,.25))
def group(name,index):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location.x=index*5;return o
def cube(name,parent,at,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=parent;o.location=at;o.scale=scale;o.data.materials.append(mat);return o
def cyl(name,parent,at,radius,depth,mat,rotation=(0,0,0)):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth);o=bpy.context.object;o.name=name;o.parent=parent;o.location=at;o.rotation_euler=rotation;o.data.materials.append(mat);return o
p=group('wagon',0);cube('caravan bed',p,(0,0,.65),(1.35,2,.22),wood)
for x in [-.65,.65]:
 cube('side rail',p,(x,0,1.05),(.12,2,.65),wood)
 for y in [-.65,.65]:cyl('wheel',p,(x*1.2,y,.42),.42,.18,iron,(0,math.pi/2,0))
for y in [-.6,.6]:cube('cargo crate',p,(0,y,1.05),(.9,.7,.6),cloth)
cube('tow pole',p,(0,1.65,.65),(.13,1.5,.13),wood)
p=group('seal',1);cyl('ward footing',p,(0,0,.12),.65,.24,stone);cube('runestone',p,(0,0,1),(.65,.4,1.6),stone);o=cube('ward brass diamond',p,(0,-.23,1.15),(.4,.1,.4),gold);o.rotation_euler.y=math.pi/4
p=group('beacon',2);cyl('relay footing',p,(0,0,.12),.65,.24,iron);cyl('relay mast',p,(0,0,1),.16,1.8,iron)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.5);o=bpy.context.object;o.name='relay crystal';o.parent=p;o.location=(0,0,2);o.data.materials.append(teal)
for angle in range(0,360,90):
 a=math.radians(angle);cube('relay fin',p,(math.sin(a)*.35,math.cos(a)*.35,1.5),(.12,.12,.8),gold)
p=group('portal',3);cyl('rift plinth',p,(0,0,.12),1.1,.24,stone)
bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=(0,0,0),major_radius=1,minor_radius=.12);o=bpy.context.object;o.name='rift arch';o.parent=p;o.location=(0,0,1.35);o.rotation_euler.x=math.pi/2;o.data.materials.append(teal)
for x in [-.8,.8]:cube('rift stone post',p,(x,0,.8),(.25,.4,1.5),stone)
p=group('crown',4);cyl('captain crown band',p,(0,0,0),.3,.12,gold)
for n in range(6):
 a=n*math.tau/6;cube('crown point',p,(math.sin(a)*.27,math.cos(a)*.27,.12),(.09,.09,.3),gold)
p=group('relic',5);cube('reliquary base',p,(0,0,.22),(.85,.65,.44),wood);cube('reliquary lid',p,(0,0,.5),(.92,.7,.15),gold)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.3);o=bpy.context.object;o.name='relic gemstone';o.parent=p;o.location=(0,0,.82);o.data.materials.append(teal)
p=group('standard',6);cyl('banner mast',p,(0,0,1.5),.07,3,wood);cube('banner rail',p,(.5,0,2.7),(1.3,.1,.1),wood);cube('faction pennant',p,(.55,0,2.08),(1.05,.06,1.1),cloth)
p=group('totem',7);cyl('totem plinth',p,(0,0,.12),.6,.24,stone)
for z in [.65,1.35]:
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.48);o=bpy.context.object;o.name='carved totem';o.parent=p;o.location=(0,0,z);o.data.materials.append(wood)
for x in [-.18,.18]:cube('totem eye',p,(x,-.38,1.45),(.12,.08,.1),teal)
p=group('obelisk',8);cube('obelisk foot',p,(0,0,.15),(.9,.9,.3),stone);cube('obelisk shaft',p,(0,0,1.2),(.58,.58,1.9),stone)
bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.42,radius2=0,depth=.55);o=bpy.context.object;o.name='sunstone cap';o.parent=p;o.location=(0,0,2.4);o.data.materials.append(gold)
for z in [.8,1.2,1.6]:cube('obelisk glyph',p,(0,-.3,z),(.16,.04,.22),gold)

# Convert Blender's Z-up artwork to glTF Y-up on export.
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender'/'expedition-props.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'expedition-props.glb'),export_format='GLB',export_animations=False,export_yup=True)
