"""Offline adaptation of user-supplied holiday scenery; no player installation.
blender -b --factory-startup --disable-autoexec -P scripts/prepare-festival-assets.py -- kind source target
Kinds: lights, village, tree, mountains. Keeps scenery materials and UVs.
"""
import bpy,sys,json,hashlib,math,struct
from pathlib import Path
from mathutils import Matrix,Vector

kind,source_arg,target_arg=sys.argv[sys.argv.index('--')+1:]
source,target=Path(source_arg),Path(target_arg)
source_metadata={}
if source.suffix.lower()=='.glb':
 raw=source.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
 source_metadata=json.loads(raw[20:20+length]).get('asset',{})
bpy.ops.wm.read_factory_settings(use_empty=True)
if source.suffix.lower()=='.fbx':bpy.ops.import_scene.fbx(filepath=str(source),use_anim=False)
else:bpy.ops.import_scene.gltf(filepath=str(source))
bpy.context.scene.frame_set(1)
# Resolve texture basenames against the upload's supplied texture directory.
texture_root=source.parent.parent/'textures'
limit=768 if kind in ['tree','lights'] else 512
for image in bpy.data.images:
 if image.type!='IMAGE':continue
 if not image.has_data and texture_root.is_dir():
  name=Path(image.filepath.replace('\\','/')).name
  candidates=[p for p in texture_root.iterdir() if p.name.lower()==name.lower()]
  if candidates:image.filepath=str(candidates[0]);image.reload()
 if max(image.size)>limit:
  ratio=limit/max(image.size);image.scale(max(1,round(image.size[0]*ratio)),max(1,round(image.size[1]*ratio)))
depsgraph=bpy.context.evaluated_depsgraph_get();baked=[];before=0
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 evaluated=obj.evaluated_get(depsgraph)
 data=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
 data.transform(evaluated.matrix_world);data.calc_loop_triangles();before+=len(data.loop_triangles)
 if data.vertices:baked.append((obj.name,data))
for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
objects=[]
for name,data in baked:
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);objects.append(obj)
if not objects:raise RuntimeError('No scenery mesh in supplied asset')
points=[v.co for obj in objects for v in obj.data.vertices]
low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
center=(low+high)/2;size=high-low
scale=(18/max(size.z,.001) if kind=='tree' else {'lights':18,'village':44,'mountains':150}[kind]/max(size.x,size.y,.001))
normalise=Matrix.Scale(scale,4)@Matrix.Translation(Vector((-center.x,-center.y,-low.z)))
budget={'lights':18000,'village':42000,'tree':32000,'mountains':35000}[kind]
for obj in objects:
 obj.data.transform(normalise)
 if before>budget and len(obj.data.polygons)>80:
  bpy.context.view_layer.objects.active=obj
  modifier=obj.modifiers.new('Browser scenery detail','DECIMATE');modifier.ratio=max(.08,budget/before)
  bpy.ops.object.modifier_apply(modifier=modifier.name)
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
 bpy.context.view_layer.objects.active=obj
# One object, split by its preserved source materials by the glTF exporter.
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
root=bpy.context.view_layer.objects.active;root.name='Festival_'+kind;root.data.calc_loop_triangles()
triangles=len(root.data.loop_triangles)
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,
 export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=87)
# Preserve embedded author/license notices lost during the Blender round trip.
if source_metadata:
 raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
 for key in ['extras','copyright']:
  if key in source_metadata:document['asset'][key]=source_metadata[key]
 encoded=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4)
 tail=raw[20+length:];target.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail)
points=[v.co for v in root.data.vertices]
low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
report={'kind':kind,'source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
 'source_triangles':before,'triangles':triangles,'bounds_blender_z_up':[low,high],
 'materials':[m.name for m in root.data.materials if m],
 'source_metadata':source_metadata,
 'credit':source_metadata.get('extras',{}) or 'User-supplied artwork. No creator/license notice was included in the archive; source artwork remains separate from the original game code.',
 'modifications':['Baked supplied transforms at the initial pose; no archive scripts executed','Normalized metres, ground at zero, glTF Y-up','Joined static scenery; retained source materials and UVs',f'Bounded large geometry and embedded WebP textures up to {limit} pixels']}
target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
print('FESTIVAL_ASSET',json.dumps(report),flush=True)
