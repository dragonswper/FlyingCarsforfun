"""Original Harbourworks stadium. Blender 4+: blender -b -t 2 -P this-file.
No downloaded art or external textures; source mesh and preview are reproducible.
"""
import bpy, math, random, json, hashlib, subprocess
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(2319)
materials={}
def mat(name,color,metal=0,rough=.65,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 materials[name]=m;return m
steel=mat('Painted midnight steel',(.055,.09,.12),.65,.4);rail=mat('Brushed aluminium',(.32,.4,.43),.8,.32);brick=mat('Harbour red brick',(.34,.145,.09));concrete=mat('Warm concrete',(.36,.35,.29));wood=mat('Timber slats',(.26,.17,.095));blue=mat('Home ocean blue',(.045,.29,.48),.2);orange=mat('Away amber',(.9,.31,.055),.15);seat=mat('Slate seating',(.10,.19,.23));light=mat('Warm floodlight',(.98,.85,.57),.1,.4,3);glass=mat('Warehouse glass',(.13,.27,.31),.5,.22);ink=mat('Ivory signage',(.91,.91,.79));water=mat('Harbour water',(.06,.20,.25),.35,.25);rust=mat('Crane safety yellow',(.74,.41,.08),.45,.5)
parts=[]
# Direct mesh creation avoids thousands of context/dependency-graph operations.
cube_vertices=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
cube_faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def make_mesh(name,vertices,faces,m,pos,scale,rotation=None):
 data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.materials.append(m);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos;o.scale=scale
 if rotation:o.rotation_euler=rotation
 parts.append(o);return o
def box(name,pos,size,m,bevel=0):
 return make_mesh(name,cube_vertices,cube_faces,m,pos,size)
def beam(name,a,b,r,m):
 delta=Vector(b)-Vector(a);vertices=[(math.cos(i*math.pi/3),math.sin(i*math.pi/3),z) for z in [-.5,.5] for i in range(6)];faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]+[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]
 return make_mesh(name,vertices,faces,m,(Vector(a)+Vector(b))*.5,(r,r,delta.length),delta.to_track_quat('Z','Y').to_euler())
def text(label,pos,size,m,rot=(math.pi/2,0,0)):
 bpy.ops.object.text_add(location=pos,rotation=rot);o=bpy.context.object;o.name='Sign '+label;o.data.body=label;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=.012;o.data.materials.append(m);bpy.ops.object.convert(target='MESH');parts.append(bpy.context.object)
# Blender uses Z up; export maps this into the game's Y-up coordinates.
box('Quayside', (0,0,-1.1),(182,200,1.8),concrete)
box('Harbour basin',(0,178,-1.1),(350,160,.1),water)
box('Harbour water', (0,156,-1.8),(400,100,.5),water)
# Four grandstands: visible stepped foundations, seating, aisles and rails.
for axis,side,length in [('x',-1,103),('x',1,103),('y',-1,82),('y',1,82)]:
 boundary=40.96 if axis=='x' else 51.2
 def point(out,along,height):return (side*out,along,height) if axis=='x' else (along,side*out,height)
 for tier in range(7):
  out=boundary+3+tier*1.65;h=1.3+tier*.8;dims=(1.72,length,h) if axis=='x' else (length,1.72,h)
  box('Terrace concrete',point(out,0,h/2),dims,concrete)
  for col in range(int(length/1.4)):
   along=(col-(int(length/1.4)-1)/2)*1.4
   if abs(along%14)<2:continue
   dims=(1.05,.85,.2) if axis=='x' else (.85,1.05,.2)
   box('Seat cushion',point(out,along,h+.22),dims,blue if side<0 and tier%3==0 else orange if side>0 and tier%3==0 else seat)
   dims=(.15,.86,.65) if axis=='x' else (.86,.15,.65)
   box('Seat back',point(out+side*0+ .42,along,h+.58),dims,seat)
  beam('Terrace handrail',point(out+.75,-length/2,h+1.1),point(out+.75,length/2,h+1.1),.055,rail)
 for along in range(-int(length/2)+3,int(length/2),13):
  beam('Canopy column',point(boundary+14,along,0),point(boundary+14,along,21),.24,steel)
  beam('Canopy cantilever',point(boundary+14,along,20),point(boundary+1.5,along,23.5),.19,steel)
  beam('Canopy brace',point(boundary+14,along,16),point(boundary+5,along,22.5),.12,rail)
  # Triangulated truss rhythm rather than a solid roof over the field.
  for j in range(4):
   beam('Canopy web',point(boundary+2+j*3,along,23-j*.8),point(boundary+5+j*3,along,21.3-j*.8),.065,rail)
  box('Floodlight housing',point(boundary+2,along,23.4),(1.2,2.3,.4) if axis=='x' else (2.3,1.2,.4),steel,.07)
  box('Floodlight lens',point(boundary+2,along,23.15),(1,2,.06) if axis=='x' else (2,1,.06),light)
 dims=(15,length+2,.2) if axis=='x' else (length+2,15,.2)
 roof=box('Standing seam canopy',point(boundary+9,0,23),dims,steel)
 for along in range(-int(length/2),int(length/2),3):
  beam('Canopy seam',point(boundary+2,along,23.16),point(boundary+16,along,23.16),.045,rail)
 # Dark perimeter sponsor fascia, team strips and end boards stay outside play.
 dims=(.3,length,1.8) if axis=='x' else (length,.3,1.8)
 box('Perimeter fascia',point(boundary+1.8,0,2.0),dims,steel)
 dims=(.35,length,.12) if axis=='x' else (length,.35,.12)
 box('Team fascia ribbon',point(boundary+1.6,0,2.8),dims,blue if side<0 else orange)
# Original venue lettering facing the pitch at both ends.
for sign in [-1,1]:
 box('Scoreboard surround',(0,sign*57,15),(26,.6,6),steel,.15)
 text('HARBOURWORKS',(0,sign*56.6,15.5),1.55,ink,(math.pi/2,0,0 if sign>0 else math.pi))
 text('EST. 2026  /  BOOST CIRCUIT',(0,sign*56.5,13.6),.58,ink,(math.pi/2,0,0 if sign>0 else math.pi))
# Warehouses: pitched roofs, loading doors, window mullions and brick courses.
for x,y,w,d,h in [(-81,-36,19,42,15),(81,32,20,48,17),(-65,90,36,20,13),(60,92,31,24,14)]:
 box('Brick warehouse',(x,y,h/2),(w,d,h),brick,.12)
 for side in [-1,1]:
  roof=box('Pitched warehouse roof',(x+side*w*.25,y,h+1),(w*.55,d+1,.35),steel);roof.rotation_euler.y=side*.23
 for row in range(2):
  for k in range(8):
   xx=x-w*.43+k*w*.12;zz=7+row*3.2
   box('Warehouse window',(xx,y-d/2-.06,zz),(w*.075,.08,1.7),glass)
   beam('Window centre bar',(xx,y-d/2-.13,zz-.9),(xx,y-d/2-.13,zz+.9),.035,rail)
 for zz in [2,5,8,11]:box('Brick course',(x,y-d/2-.07,zz),(w,.06,.05),wood)
 box('Loading door',(x,y-d/2-.08,2.7),(4,.13,5.4),steel)
# Harbour gantry cranes behind the far stands, all out of bounds.
for x in [-47,30]:
 y=112
 for xx in [x-6,x+6]:
  beam('Crane tower',(xx,y,0),(xx,y,43),.35,rust)
  for z in range(0,40,5):
   beam('Crane tower lattice',(x-6,y,z),(x+6,y,z+5),.11,steel)
 beam('Crane jib',(x-18,y,43),(x+32,y,43),.55,rust)
 beam('Jib crown',(x-18,y,44),(x,y,50),.16,steel);beam('Jib cable',(x,y,50),(x+32,y,43),.12,steel)
 beam('Crane hoist',(x+21,y,43),(x+21,y,8),.07,steel)
 box('Crane operator cab',(x+3,y,40),(4,3,3),glass,.1)
for i in range(17):
 x=-87+i*10;y=128+random.choice([0,8]);m=blue if i%3 else rust
 box('Shipping container',(x,y,2),(8,5,4),m,.1)
 for j in range(7):box('Container ribs',(x-3.5+j,y-2.54,2),(.08,.07,3.7),steel)
# Merge static geometry by material; fewer than 20 material draws on phones.
for o in parts:o.select_set(False)
for m in materials.values():
 batch=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==m]
 if not batch:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in batch:o.select_set(True)
 bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join();o=bpy.context.object;o.name='Harbourworks_'+m.name.replace(' ','_');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o['originalArtwork']=True
# Calibration empties are exported for regression tests.
for name,pos in [('Pitch_Center',(0,0,0)),('Pitch_Side_Left',(-40.96,0,0)),('Pitch_Side_Right',(40.96,0,0)),('Goal_Blue',(0,51.2,0)),('Goal_Orange',(0,-51.2,0))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos
bpy.context.scene['artwork']='Original Boost Circuit geometry; generated in Blender from scripts/create-harbourworks.py'
asset_objects=list(bpy.context.scene.objects)
for o in asset_objects:o.select_set(True)
target=ROOT/'dist/assets/maps/harbourworks.glb';target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
raw=target.read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
report={'name':'Harbourworks','author':'Boost Circuit project','license':'MIT','source':'scripts/create-harbourworks.py','sourceBlend':'art/harbourworks.blend','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':triangles,'materialBatches':len(doc['materials']),'textures':0,'collision':'Standard shared regulation field; scenery is decorative and outside play'}
target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
# Preview-only pitch and lines, not part of the exported decorative asset.
fieldmat=mat('Preview turf',(.075,.22,.16));box('Preview pitch',(0,0,-.05),(81.92,102.4,.08),fieldmat)
stripe=mat('Preview mown stripes',(.09,.255,.185))
for i in range(10):
 if i%2==0:box('Preview mowing stripe',(0,-46.08+i*10.24,0),(81.92,10.24,.008),stripe)
for i in range(64):
 a=i*math.tau/64;b=(i+1)*math.tau/64;beam('Preview centre circle',(9.15*math.cos(a),9.15*math.sin(a),.025),(9.15*math.cos(b),9.15*math.sin(b),.025),.055,ink)
for x in [-40.2,40.2]:box('Preview touchline',(x,0,.01),(.12,100,.02),ink)
for y in [-50.5,50.5,0]:box('Preview goal line',(0,y,.01),(80,.12,.02),ink)
for y in [-51.2,51.2]:
 for x in [-8.93,8.93]:beam('Preview goal upright',(x,y,0),(x,y,6.42),.12,ink)
 beam('Preview goal bar',(-8.93,y,6.42),(8.93,y,6.42),.12,ink)
bpy.ops.object.camera_add(location=(79,-94,51));camera=bpy.context.object;camera.rotation_euler=(Vector((0,12,8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=30;bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='SUN',location=(0,0,80));sun=bpy.context.object;sun.rotation_euler=(.5,-.5,-.8);sun.data.energy=3;sun.data.angle=.2
world=bpy.data.worlds.new('Harbour dusk');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.32,.39,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;bpy.context.scene.world=world
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False;scene.render.resolution_x=1000;scene.render.resolution_y=560;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'dist/assets/maps/harbourworks-cover.png')
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/harbourworks.blend'));bpy.ops.render.render(write_still=True)
# Encode the rendered preview for small mobile downloads, then remove the intermediate.
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',scene.render.filepath,'-c:v','libwebp','-quality','86','-frames:v','1',str(target.parent/'harbourworks-cover.webp')],check=True)
Path(scene.render.filepath).unlink();print(json.dumps(report),flush=True)
