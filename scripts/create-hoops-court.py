"""Original Blender Hoops bowl and basket artwork. No downloaded models/textures.
blender --background --python scripts/create-hoops-court.py
Coordinates in builders are game metres (+Y up, +Z orange); export uses glTF Y up.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'dist/assets/overdrive';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'art'
bpy.context.preferences.filepaths.save_version=0

def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,emission=0,metallic=0,roughness=.7):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
class Batch:
 def __init__(self,name,material):self.name=name;self.material=material;self.v=[];self.f=[];self.parts=0
 def face(self,points):
  start=len(self.v);self.v.extend((x,-z,y) for x,y,z in points);self.f.append(tuple(range(start,start+len(points))));self.parts+=1
 def box(self,x,y,z,w,h,d):
  p=[(x+a*w/2,y+b*h/2,z+c*d/2)for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:self.face([p[i]for i in f])
 def line(self,a,b,width):
  a,b=Vector(a),Vector(b);mid=(a+b)/2;radial=Vector((mid.x,0,mid.z));direction=(b-a).normalized();side=direction.cross(radial)
  if side.length<.001:side=direction.cross(Vector((1,0,0)))
  side.normalize();side*=width/2;self.face([a-side,b-side,b+side,a+side])
 def object(self,**extras):
  mesh=bpy.data.meshes.new(self.name);mesh.from_pydata(self.v,[],self.f);mesh.update();obj=bpy.data.objects.new(self.name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(self.material);obj['originalArtwork']=True
  for k,v in extras.items():obj[k]=v
  return obj

def export(name,blend,report):
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/blend),compress=True)
 target=OUT/name;bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=False,export_extras=True,export_yup=True)
 raw=target.read_bytes();doc=json.loads(raw[20:20+int.from_bytes(raw[12:16],'little')]);report.update({'originalArtwork':True,'license':'MIT','generator':'scripts/create-hoops-court.py','sourceBlend':'art/'+blend,'blenderVersion':bpy.app.version_string,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes']for p in m['primitives']),'meshBatches':len(doc['meshes']),'textures':0})
 target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print('EXPORTED',name,report['bytes'],report['triangles'],flush=True)

reset()
colors=[('Structural_Navy',(.026,.06,.11),0),('Concourse',(.08,.13,.21),0),('Blue_Seats',(.035,.28,.8),0),('Orange_Seats',(.96,.24,.045),0),('Teal_Seats',(.04,.5,.62),0),('Cream_Seats',(.7,.81,.84),0),('Blue_Light',(.035,.45,1),2),('Orange_Light',(1,.24,.035),2),('Warm_Light',(1,.81,.42),1.2)]
b=[Batch('Hoops_Bowl_'+name,mat(name,color,glow))for name,color,glow in colors]
# Four surrounding stands; every seat is source geometry merged by material.
for sign in [-1,1]:
 for row in range(11):
  x=sign*(45.1+row*1.45);y=1.5+row*.95;b[1].box(x,y,0,1.6,.45,119)
  for col in range(44):b[[2,4,5,3][(col//5+row//3)%4]].box(x,y+.55,(col-21.5)*2.58,.85,.65,1.25)
 for row in range(8):
  z=sign*(56.2+row*1.6);y=1.5+row*.95;b[1].box(0,y,z,92,.45,1.8)
  for col in range(36):b[2 if sign<0 else 3].box((col-17.5)*2.5,y+.55,z,1.3,.65,.85)
 # Upper decks are outside the wall and above the regulation playing ceiling.
 b[0].box(sign*64,16,0,5,.8,139);b[0].box(0,16,sign*73,133,.8,4)
 b[6 if sign<0 else 7].box(0,16.6,sign*70,117,.13,.22)
 b[6 if sign<0 else 7].box(sign*60,16.6,0,.22,.13,139)
 for i in range(12):
  z=(i-5.5)*12;b[0].box(sign*68,15,z,.55,30,.65);b[0].box(sign*52,29,z,33,.6,.7)
  b[8].box(sign*49,27.8,z,.4,.12,5)
 # Backboard-aligned advertising architecture, not solid geometry on the pitch.
 b[0].box(0,23,sign*68,25,7,1);b[0].box(0,23,sign*67.3,22,4.5,.12)
 b[0].box(0,25,sign*83,143,12,1)
# Perimeter apron, outside the sealed playing boundary. No interior obstacles.
for sign in [-1,1]:
 b[0].box(sign*44,-.45,0,6,.7,112);b[0].box(0,-.45,sign*55,88,.7,7)
 # A city-facing clerestory admits the evening sky above the seating.
 for i in range(10):b[8].box(sign*62,20,(i-4.5)*13,.15,.3,8)
# Back walls and a compact skyline close the horizon without entering play.
for sign in [-1,1]:
 b[0].box(sign*71,13,0,1,26,154);b[0].box(0,13,sign*77,143,26,1)
 b[0].box(sign*58,30.2,0,31,.45,145)
 for x in [-11.15,11.15]:b[6 if sign<0 else 7].box(x,23,sign*67.12,.14,4.8,.12)
 for y in [20.6,25.4]:b[6 if sign<0 else 7].box(0,y,sign*67.12,22.4,.14,.12)
for i in range(28):
 a=i*math.tau/28;r=109+(i%3)*6;h=22+(i*13%37);x=math.cos(a)*r;z=math.sin(a)*r
 b[1].box(x,h/2,z,9+(i%3)*2,h,10)
 for y in range(5,int(h),7):b[8].box(x,y,z-5.08,5.8,.32,.1)
# Original arena signage is Blender geometry, folded into the light batch.
for sign in [-1,1]:
 bpy.ops.object.text_add(location=(0,-sign*67.15,23),rotation=(math.pi/2,0,math.pi if sign>0 else 0))
 text=bpy.context.object;text.data.body='SKYLINE'+chr(10)+'HOOPS';text.data.align_x='CENTER';text.data.align_y='CENTER';text.data.size=2.05;text.data.space_line=.8
 bpy.ops.object.convert(target='MESH');bpy.context.view_layer.update()
 for face in text.data.polygons:
  points=[text.matrix_world@text.data.vertices[i].co for i in face.vertices];b[8].face([(p.x,p.z,-p.y)for p in points])
 bpy.data.objects.remove(text,do_unlink=True)
for index,batch in enumerate(b):batch.object(venue='skyline-hoops',materialBatch=index)
for name,p in {'Pitch_Center':(0,0,0),'Pitch_Side_Left':(-40.96,0,0),'Pitch_Side_Right':(40.96,0,0),'Goal_Blue':(0,0,-51.2),'Goal_Orange':(0,0,51.2)}.items():
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=(p[0],-p[2],p[1])
bpy.context.scene['description']='Original enclosed Skyline Hoops arena: two decks, city-facing clerestory, warm light rails.'
export('hoops-arena.glb','skyline-hoops.blend',{'id':'skyline-hoops','playingBounds':[40.96,51.2,20.48],'batches':9})

reset()
accent=mat('Hoops_Team_Accent',(.035,.38,1),1.3,roughness=.35);glass=mat('Hoops_Backboard_Glass',(.18,.35,.5),roughness=.25);nylon=mat('Hoops_Nylon',(.83,.93,1),.2);white=mat('Hoops_Target_White',(.86,.96,1),.6);dark=mat('Hoops_Support_Navy',(.035,.09,.15))
bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=8,major_radius=4.6,minor_radius=.16,location=(0,0,5.8));rim=bpy.context.object;rim.name='Hoops_Rim';rim.data.materials.append(accent);rim['originalArtwork']=True;rim['teamAccent']=True
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-6,9.5));board=bpy.context.object;board.name='Hoops_Backboard';board.dimensions=(14,.12,7);board.data.materials.append(glass);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);board['originalArtwork']=True
frame=Batch('Hoops_Backboard_Frame',accent)
for x in [-7,7]:frame.box(x,9.5,5.9,.18,7.2,.18)
for y in [6,13]:frame.box(0,y,5.9,14.2,.18,.18)
frame.object(teamAccent=True)
target=Batch('Hoops_Shooting_Square',white)
for x in [-2.3,2.3]:target.box(x,7.9,5.78,.13,3.0,.1)
for y in [6.4,9.4]:target.box(0,y,5.78,4.7,.13,.1)
target.object()
net=Batch('Hoops_Net',nylon);n=32;rows=8
for row in range(rows):
 y=5.65-row*(5.3/(rows-1));r=4.43-row*(1.1/(rows-1));offset=.5*(row%2)
 for i in range(n):
  a=(i+offset)*math.tau/n
  if row in [0,rows-1]:
   a2=(i+1+offset)*math.tau/n;net.line((math.cos(a)*r,y,math.sin(a)*r),(math.cos(a2)*r,y,math.sin(a2)*r),.038)
  if row<rows-1:
   ny=5.65-(row+1)*(5.3/(rows-1));nr=4.43-(row+1)*(1.1/(rows-1));next_offset=.5*((row+1)%2)
   for j in [i,i+(1 if row%2 else -1)]:
    b1=(j+next_offset)*math.tau/n;net.line((math.cos(a)*r,y,math.sin(a)*r),(math.cos(b1)*nr,ny,math.sin(b1)*nr),.038)
net.object(visualOnly=True)
support=Batch('Hoops_Backboard_Bracket',dark);support.box(0,7.2,6.2,.5,3.2,.45);support.object()
bpy.context.scene['description']='Original lit Hoops rim, framed glass backboard, aiming square and full-height net. Collision calibration unchanged.'
export('hoops-basket-v2.glb','hoops-basket-v2.blend',{'id':'hoops-basket-v2','rim':{'radius':4.6,'height':5.8,'tube':.16},'backboard':{'z':6,'width':14,'bottom':6,'top':13},'netBottom':.35})
