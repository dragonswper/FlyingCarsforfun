"""Build a browser vehicle from the supplied side-view reference and wrap art.
blender -b --factory-startup --disable-autoexec -P scripts/create-reference-van.py -- wrap.png output.glb
The hidden faces are inferred; this is not a dimensionally exact source model.
"""
import bpy,sys,math,json,hashlib
from pathlib import Path
from mathutils import Vector
image_arg,target_arg=sys.argv[sys.argv.index('--')+1:];image_path,target=Path(image_arg),Path(target_arg)
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
cyan=mat('Van_Turquoise',(.025,.56,.68),.25,.34);rubber=mat('Van_Tyres',(.018,.017,.014),0,.95);black=mat('Van_Black_Trim',(.014,.02,.021),.1,.55);steel=mat('Van_Steel_Wheels',(.37,.35,.29),.7,.4);glass=mat('Van_Tinted_Glass',(.14,.20,.19),.36,.16);red=mat('Van_Tail_Lights',(.6,.008,.006),.15,.24);lamp=mat('Van_Headlights',(.65,.73,.68),.35,.2)
wrap=mat('Van_Reference_Wrap',(1,1,1),.12,.42);image=bpy.data.images.load(str(image_path));image.pack();tex=wrap.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='EXTEND';coordinates=wrap.node_tree.nodes.new('ShaderNodeUVMap');coordinates.uv_map='Van_Wrap_UV';wrap.node_tree.links.new(coordinates.outputs['UV'],tex.inputs['Vector']);wrap.node_tree.links.new(tex.outputs['Color'],wrap.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
body=bpy.data.objects.new('Custom_Body',None);bpy.context.collection.objects.link(body)
def mesh(name,verts,faces,material,parent=body):
 g=bpy.data.meshes.new(name);g.from_pydata(verts,[],faces);g.update();o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.data.materials.append(material);o.parent=parent;return o
def box(name,loc,scale,material,bevel=.02,parent=body):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;o.data.materials.append(material)
 if bevel:
  m=o.modifiers.new('Soft metal edges','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
 return o
def cylinder(name,loc,radius,depth,material,parent=body,vertices=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=(0,math.pi/2,0));o=bpy.context.object;o.name=name;o.parent=parent;o.data.materials.append(material);m=o.modifiers.new('Rounded wheel edges','BEVEL');m.width=.012;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 for p in o.data.polygons:p.use_smooth=True
 return o
def wire(name,points,material=black,radius=.004):
 g=bpy.data.curves.new(name,'CURVE');g.dimensions='3D';g.bevel_depth=radius;g.bevel_resolution=1;s=g.splines.new('POLY');s.points.add(len(points)-1)
 for p,v in zip(s.points,points):p.co=(*v,1)
 o=bpy.data.objects.new(name,g);bpy.context.collection.objects.link(o);o.parent=body;g.materials.append(material);return o
# Blender Z is up; negative Y exports as the game's positive-Z front.
profile=[(-1.38,.40),(-1.36,.86),(-.58,1.37),(.98,1.43),(1.31,1.39),(1.38,1.23),(1.38,.40)]
verts=[(side*.54,y,z) for side in [-1,1] for y,z in profile];n=len(profile);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
shell=mesh('Van_Rounded_Steel_Body',verts,faces,cyan);bpy.context.view_layer.objects.active=shell;shell.select_set(True);m=shell.modifiers.new('Pressed metal curves','BEVEL');m.width=.045;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
for y in [-.89,.91]:
 cut=cylinder('Temporary_Wheel_Arch',(0,y,.29),.31,1.6,black,parent=None,vertices=40);bpy.context.view_layer.objects.active=shell;m=shell.modifiers.new('Real wheel arch','BOOLEAN');m.operation='DIFFERENCE';m.solver='EXACT';m.object=cut;bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(cut,do_unlink=True)
shell.data.materials.append(wrap)
# Boolean wheel cutters carry a cylinder UV map; replace it rather than leaving
# that empty map as the glTF exporter's first texture coordinate set.
while shell.data.uv_layers:shell.data.uv_layers.remove(shell.data.uv_layers[0])
uv=shell.data.uv_layers.new(name='Van_Wrap_UV')
for face in shell.data.polygons:
 if abs(face.normal.x)>.8:face.material_index=1
 for index in face.loop_indices:
  v=shell.data.vertices[shell.data.loops[index].vertex_index].co;side=(v.y+1.38)/2.76
  # Put the lettering behind the cab window, as in the supplied side view.
  # The opposite side is inferred, with readable lettering on its rear panel.
  u=(side-.20)/.80 if face.normal.x>=0 else .30+(1-side)/.58*.70
  uv.data[index].uv=(u,(v.z-.40)/1.03)
box('Black_Underbody',(0,0,.34),(1.01,2.73,.19),black,.04)
for side in [-1,1]:
 x=side*.551
 mesh('Cab_Side_Window_'+str(side),[(x,-1.12,.87),(x,-.59,1.31),(x,-.20,1.31),(x,-.20,.87)],[(0,1,2,3)],glass)
 wire('Cab_Door_Seam_'+str(side),[(x,-.16,.44),(x,-.16,1.34),(x,-.59,1.35)],black,.003)
 wire('Sliding_Door_Seam_'+str(side),[(x,.10,.43),(x,.10,1.40)],black,.003)
 wire('Side_Sill_'+str(side),[(x,-.55,.43),(x,.56,.43)],black,.007)
 box('Door_Handle_'+str(side),(x*1.01,-.29,.80),(.028,.15,.025),black,.01)
 box('Sliding_Door_Handle_'+str(side),(x*1.01,.82,.83),(.03,.12,.025),black,.01)
 box('Mirror_Arm_'+str(side),(side*.59,-1.02,.88),(.16,.04,.035),black,.012)
 box('Side_Mirror_'+str(side),(side*.66,-1.04,.96),(.09,.14,.16),black,.025)
 box('Rear_Tail_Lamp_'+str(side),(side*.494,1.385,.91),(.085,.035,.33),red,.018)
 box('Front_Headlamp_'+str(side),(side*.393,-1.375,.78),(.24,.04,.135),lamp,.026)
mesh('Sloping_Windscreen',[(-.48,-1.26,.935),(.48,-1.26,.935),(.46,-.61,1.36),(-.46,-.61,1.36)],[(0,1,2,3)],glass)
box('Front_Bumper',(0,-1.40,.45),(1.11,.13,.29),black,.045);box('Rear_Bumper',(0,1.41,.40),(1.12,.16,.15),black,.035)
for z in [.47,.53,.59]:box('Front_Grille',(0,-1.474,z),(.70,.014,.025),black,.005)
for x in [-.32,-.16,0,.16,.32]:wire('Roof_Pressed_Rib',[(x,-.50,1.42),(x,.96,1.46)],cyan,.006)
wire('Rear_Door_Seam',[(0,1.386,.48),(0,1.386,1.37)],black,.003)
for side in [-1,1]:
 for front,y in [(True,-.89),(False,.91)]:
  name=('F' if front else 'R')+('L' if side>0 else 'R');pivot=bpy.data.objects.new('Steer_'+name,None);bpy.context.collection.objects.link(pivot);pivot.location=(side*.53,y,.255);pivot['rollingRadius']=.245;pivot['front']=front
  spin=bpy.data.objects.new('Spin_'+name,None);bpy.context.collection.objects.link(spin);spin.parent=pivot
  cylinder('Wheel_Tyre_'+name,(0,0,0),.245,.15,rubber,spin)
  cylinder('Wheel_Rim_'+name,(side*.081,0,0),.170,.018,steel,spin)
  cylinder('Wheel_Hub_'+name,(side*.095,0,0),.080,.022,black,spin)
  for i in range(12):
   angle=i*math.tau/12;cylinder('Rim_Vent_'+name,(side*.093,math.sin(angle)*.137,math.cos(angle)*.137),.014,.006,black,spin,12)
  for i in range(5):
   angle=i*math.tau/5;cylinder('Wheel_Bolt_'+name,(side*.110,math.sin(angle)*.049,math.cos(angle)*.049),.009,.009,steel,spin,10)
# Batch static detail inside the body and each independently animated wheel.
# A rim's many vent/bolt meshes must not each require a browser draw call.
for obj in list(bpy.context.scene.objects):
 if obj.type=='CURVE':
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
for parent in [body]+[o for o in bpy.context.scene.objects if o.name.startswith('Spin_')]:
 parts=[o for o in parent.children if o.type=='MESH']
 if len(parts)<2:continue
 for obj in parts:
  if not obj.data.uv_layers:obj.data.uv_layers.new(name='Van_Wrap_UV')
  else:obj.data.uv_layers[0].name='Van_Wrap_UV'
 bpy.ops.object.select_all(action='DESELECT')
 for obj in parts:obj.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name='Van_Rounded_Steel_Body' if parent==body else 'Wheel_Assembly_'+parent.name[5:]
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=90)
raw=target.read_bytes();document=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);batches=sum(len(mesh['primitives']) for mesh in document['meshes'])
report={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(raw).hexdigest(),'material_batches':batches,'reference':'User-provided left-side turquoise van image','wrap':'AI-assisted wrap adaptation of the supplied reference; decorative QR-style mark has no supplied destination','modifications':['Original modeled shell, wheel arches, glass, bumpers, grille, mirrors, door seams, lamps, steel wheels and procedural wheel/steering rig','Same shared gameplay hitbox; visual dimensions adapted for the game','Front, rear and hidden side inferred from one image; not a certified 1:1 scan','Batched static details within the body and each animated wheel; preserved the named wrap UV map'],'credit':'Reference branding/artwork remains separate from the original MIT game code.'}
target.with_name('reference-van-import.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
