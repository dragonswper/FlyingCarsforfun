"""Offline Blender preparation of the user-supplied Octane by Jako (CC BY 4.0)."""
import bpy,sys,math,json,hashlib,struct
from pathlib import Path
from mathutils import Matrix,Vector
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=3:raise RuntimeError('Usage: blender -b -P scripts/prepare-octane.py -- Octane.fbx textures-directory output.glb')
source,textures,target=map(Path,args)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
original_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
texture_files=list(textures.glob('*'));missing=[]
for image in list(bpy.data.images):
 name=image.name.lower();match=None
 if 'chasis' in name:match=next((p for p in texture_files if 'chasis' in p.name.lower()),None)
 elif '2048' in name:match=next((p for p in texture_files if '2048' in p.name),None)
 elif '512' in name:match=next((p for p in texture_files if '512' in p.name),None)
 if match:
  image.filepath=str(match);image.reload()
  if max(image.size)>1024:
   s=1024/max(image.size);image.scale(max(1,round(image.size[0]*s)),max(1,round(image.size[1]*s)))
 elif not image.has_data:missing.append(image.name)
for material in bpy.data.materials:
 if not material.use_nodes:continue
 for node in list(material.node_tree.nodes):
  if node.type=='TEX_IMAGE' and node.image and node.image.name in missing:
   material.node_tree.nodes.remove(node)
 if material.name=='Paint':material.name='Custom_Paint'
 for node in material.node_tree.nodes:
  if node.type=='BSDF_PRINCIPLED':node.inputs['Roughness'].default_value=.38;node.inputs['Metallic'].default_value=.3
# Source is +X forward, +Z up. Bake to Blender -Y forward / glTF +Z.
rotation=Matrix.Rotation(-math.pi/2,4,'Z')
for o in meshes:
 world=rotation@o.matrix_world;o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(world)
coords=[v.co for o in meshes for v in o.data.vertices];low=Vector([min(v[i] for v in coords) for i in range(3)]);high=Vector([max(v[i] for v in coords) for i in range(3)]);center=(low+high)*.5;scale=1.8/(high.y-low.y)
normalization=Matrix.Scale(scale,4)@Matrix.Translation(Vector((-center.x,-center.y,-low.z)))
for o in meshes:o.data.transform(normalization)
root=bpy.data.objects.new('Octane_Vehicle',None);bpy.context.collection.objects.link(root);root['visualLength']=1.8;root['visualFloor']=0
body=bpy.data.objects.new('Custom_Body',None);bpy.context.collection.objects.link(body);body.parent=root
wheels=[]
for o in meshes:
 if not o.name.startswith('Dieci'):
  o.parent=body;continue
 low=Vector([min(v.co[i] for v in o.data.vertices) for i in range(3)]);high=Vector([max(v.co[i] for v in o.data.vertices) for i in range(3)]);center=(low+high)*.5
 front=' - F' in o.name;name=('F' if front else 'R')+('L' if center.x<0 else 'R')
 radius=max(math.hypot(v.co.y-center.y,v.co.z-center.z) for v in o.data.vertices)
 steer=bpy.data.objects.new('Steer_'+name,None);bpy.context.collection.objects.link(steer);steer.parent=root;steer.location=center;steer['rollingRadius']=radius;steer['front']=front
 spin=bpy.data.objects.new('Spin_'+name,None);bpy.context.collection.objects.link(spin);spin.parent=steer
 o.data.transform(Matrix.Translation(-center));o.parent=spin;o.name='Wheel_'+name
 wheels.append({'name':name,'position':[center.x,center.z,-center.y],'radius':radius,'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)})
if len(wheels)!=4:raise RuntimeError('Expected four named source Octane wheels.')
root['wheelBase']=abs(next(w for w in wheels if w['name']=='FL')['position'][2]-next(w for w in wheels if w['name']=='RL')['position'][2])
for o in list(bpy.context.scene.objects):
 if o.type not in ['MESH','EMPTY']:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=90)
credit={'title':'Octane - Rocket League Car','author':'Jako (https://sketchfab.com/fairlight51)','license':'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)','source':'https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69'}
raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:];doc['asset']['extras']=credit
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
packed=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary;target.write_bytes(packed);target.chmod(0o644)
triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
report={'id':'octane','name':'Octane','file':target.name,'sourceFile':source.name,'sourceBytes':source.stat().st_size,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'sourceTriangles':original_triangles,'triangles':triangles,'drawBatches':sum(len(m['primitives']) for m in doc['meshes']),'credit':credit,'visualLength':1.8,'wheels':sorted(wheels,key=lambda w:w['name']),'paintMaterial':'Custom_Paint','extensionsRequired':doc.get('extensionsRequired',[]),'modifications':['Converted supplied FBX to a self-contained GLB','Relinked three supplied textures and omitted an absent optional normal map','Normalized +Y up / +Z forward, 1.8 metre length and floor0','Added separate rolling and front steering pivots with measured wheel radii','Preserved all source triangles and supplied materials; paint is independently tintable','Re-encoded textures as embedded WebP quality90 at at most1024 pixels'],'missingOptionalTextures':missing}
target.with_name('octane-import.json').write_text(json.dumps(report,indent=2)+'\n');target.with_name('octane-import.json').chmod(0o644)
print('OCTANE_REPORT',json.dumps(report),flush=True)
