"""Three original, calibrated Blender venues and regulation-sized Hoops props.
blender --background --python scripts/create-overdrive-venues.py
All geometry is constructed here; no downloaded assets or texture dependencies.
"""
import bpy,math,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'dist/assets/maps';ART=ROOT/'art';OUT.mkdir(parents=True,exist_ok=True)
PALETTES={'skyline':[(.035,.07,.13),(.06,.16,.23),(.10,.26,.36),(.8,.32,.07),(.08,.55,.72),(.62,.72,.8),(.13,.18,.25),(.55,.7,.85)],'range':[(.10,.15,.16),(.18,.25,.24),(.20,.42,.35),(.83,.46,.1),(.17,.62,.51),(.62,.74,.67),(.23,.29,.25),(.80,.86,.68)],'velocity':[(.08,.08,.16),(.16,.15,.28),(.29,.24,.43),(.87,.25,.17),(.18,.55,.8),(.68,.67,.78),(.21,.19,.30),(.83,.68,.48)]}
for venue,colors in PALETTES.items():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 mats=[];verts=[[] for _ in colors];faces=[[] for _ in colors];parts=0
 for i,color in enumerate(colors):
  m=bpy.data.materials.new(venue+'_material_'+str(i));m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.68;p.inputs['Metallic'].default_value=.15 if i<6 else .05;mats.append(m)
 def box(x,y,z,w,d,h,mat):
  global parts
  parts+=1;v=verts[mat];f=faces[mat];base=len(v)
  for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:v.append((x+a*w/2,-(z+b*d/2),y+c*h/2))
  for quad in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:f.append(tuple(base+i for i in quad))
 # Seating remains outside the physical enclosure. 972 individually editable
 # seat elements are exported in eight material batches, not 972 draw calls.
 for sign in [-1,1]:
  for row in range(9):
   box(sign*(49+row*1.8),row*.85,0,1.9,111,.4,6)
   for col in range(30):box(sign*(49+row*1.8),row*.85+.48,(col-14.5)*3.4,.9,1.2,.65,2 if (col+row)%3 else 4)
  for row in range(6):
   box(0,row*.9,sign*(64+row*2),93,2,.4,6)
   for col in range(36):box((col-17.5)*2.5,row*.9+.48,sign*(64+row*2),1.1,.9,.6,3 if (col+row)%3 else 5)
  for col in range(9):
   z=(col-4)*14;box(sign*62,14,z,.65,.65,28,1);box(sign*62,26,z,31,2,.9,0);box(sign*50,23,z,.3,8,.3,7)
  box(0,19,sign*67,28,1,7,0);box(0,19,sign*66.3,25,.2,4.8,4)
 if venue=='skyline':
  for i in range(48):
   angle=i*math.tau/48;r=104+(i%3)*8;h=15+(i*17%43);box(math.cos(angle)*r,h/2,math.sin(angle)*r,8+(i%4)*2,8,h,1 if i%2 else 6)
   for floor in range(3,int(h),5):box(math.cos(angle)*r,floor,math.sin(angle)*r-4.1,5,.12,.5,7)
 elif venue=='range':
  for sign in [-1,1]:
   for i in range(9):box(sign*82,8,(i-4)*18,3,12,16,2);box(sign*82,17,(i-4)*18,9,16,3,5)
  for i in range(12):box((i-5.5)*12,12,90,6,5,24,1)
 else:
  for i in range(24):
   angle=i*math.tau/24;box(math.cos(angle)*96,5+(i%4)*3,math.sin(angle)*96,5,5,10+(i%4)*6,2);box(math.cos(angle)*96,12+(i%4)*3,math.sin(angle)*96,5.5,5.5,.7,3)
 for i in range(8):
  m=bpy.data.meshes.new(venue+'_batch_'+str(i));m.from_pydata(verts[i],[],faces[i]);m.update();o=bpy.data.objects.new(venue+'_original_'+str(i),m);bpy.context.collection.objects.link(o);o.data.materials.append(mats[i]);o['originalArtwork']=True;o['venue']=venue
 for name,p in {'Pitch_Center':(0,0,0),'Pitch_Side_Left':(-40.96,0,0),'Pitch_Side_Right':(40.96,0,0),'Goal_Blue':(0,0,-51.2),'Goal_Orange':(0,0,51.2)}.items():
  o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(p[0],-p[2],p[1])
 bpy.context.scene['description']='Original '+venue+' venue, regulation pitch supplied by runtime.'
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ART/(venue+'.blend')),compress=True)
 target=OUT/(venue+'.glb');bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=False,export_extras=True,export_yup=True)
 raw=target.read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
 (OUT/(venue+'.json')).write_text(json.dumps({'id':venue,'originalArtwork':True,'license':'MIT','blenderVersion':bpy.app.version_string,'sourceBlend':'art/'+venue+'.blend','generator':'scripts/create-overdrive-venues.py','sourceProps':parts,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':triangles,'materialBatches':8,'textures':0},indent=2)+'\n')
 print('Exported',venue,parts,'source elements',triangles,'triangles',flush=True)
# A single reusable basket: centre on the rim, board six metres behind it.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
rim=material('Original_Orange_Rim',(.92,.31,.06));board=material('Original_Frosted_Backboard',(.6,.73,.8));net=material('Original_Nylon_Net',(.7,.84,.89))
bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=6,major_radius=4.6,minor_radius=.16,location=(0,0,5.8));o=bpy.context.object;o.name='Hoops_Rim';o.data.materials.append(rim)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-6,9.5));o=bpy.context.object;o.name='Hoops_Backboard';o.dimensions=(14,.12,7);o.data.materials.append(board);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
# Net strings are small cylinders, joined into a single material draw.
strings=[]
for i in range(24):
 a=i*math.tau/24;bpy.ops.mesh.primitive_cylinder_add(vertices=4,radius=.026,depth=1.7,location=(math.cos(a)*4.4,math.sin(a)*4.4,4.95));o=bpy.context.object;o.data.materials.append(net);strings.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in strings:o.select_set(True)
bpy.context.view_layer.objects.active=strings[0];bpy.ops.object.join();strings[0].name='Hoops_Net'
for o in bpy.context.scene.objects:
 if o.type=='MESH':o['originalArtwork']=True;o['purpose']='Original regulation-sized Hoops basket'
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'hoops-basket.blend'),compress=True)
props=ROOT/'dist/assets/overdrive';props.mkdir(exist_ok=True);bpy.ops.export_scene.gltf(filepath=str(props/'hoops-basket.glb'),export_format='GLB',export_animations=False,export_extras=True,export_yup=True)
