"""Offline mobile LODs; run only in the development workspace with Blender.
blender -b --factory-startup --disable-autoexec -P scripts/prepare-mobile-models.py -- stadium|fennec source.glb target.glb
Retains source rigs, materials, UVs, calibration markers and attribution.
"""
import bpy,sys,json,hashlib,struct
from pathlib import Path
kind,source_arg,target_arg=sys.argv[sys.argv.index('--')+1:]
source,target=Path(source_arg),Path(target_arg)
original=source.read_bytes();metadata=json.loads(original[20:20+struct.unpack_from('<I',original,12)[0]]).get('asset',{})
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
before=after=removed=0
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 obj.data.calc_loop_triangles();before+=len(obj.data.loop_triangles)
 if kind=='stadium' and (obj.get('detail')=='seats' or 'Seats' in ' '.join(m.name for m in obj.data.materials if m)):
  removed+=1;bpy.data.objects.remove(obj,do_unlink=True);continue
 # Keep small trim, rig pivots and sign geometry intact. Only reduce the
 # large source meshes; the original full/detail files remain available.
 ratio=.18 if kind=='stadium' else .45
 if kind=='stadium' and 'Banner' in ' '.join(m.name for m in obj.data.materials if m):ratio=1
 if len(obj.data.polygons)>300 and ratio<1:
  bpy.context.view_layer.objects.active=obj;modifier=obj.modifiers.new('Mobile mesh detail','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=modifier.name)
 obj.data.calc_loop_triangles();after+=len(obj.data.loop_triangles)
for image in bpy.data.images:
 if image.type!='IMAGE' or not image.has_data:continue
 limit=384
 if max(image.size)>limit:
  ratio=limit/max(image.size);image.scale(max(1,round(image.size[0]*ratio)),max(1,round(image.size[1]*ratio)))
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=87)
raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+length])
for key in ['extras','copyright']:
 if key in metadata:document['asset'][key]=metadata[key]
encoded=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4);tail=raw[20+length:];raw=struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail;target.write_bytes(raw)
# The exporter removes degenerate triangles; report the exported primitives.
after=sum(document['accessors'][p['indices']]['count']//3 for mesh in document['meshes'] for p in mesh['primitives'] if p.get('mode',4)==4)
manifest=json.loads((source.parent/'manifest.json').read_text());credit=next((asset for asset in manifest['assets'] if asset['id']==('fennec' if kind=='fennec' else 'champions-field')),None)
report={'file':target.name,'source':source.name,'source_sha256':hashlib.sha256(original).hexdigest(),'sha256':hashlib.sha256(raw).hexdigest(),'source_bytes':len(original),'bytes':len(raw),'source_triangles':before,'triangles':after,'removed_seat_batches':removed,'credit':credit,'modifications':['Reduced large geometry and removed distant seat meshes for mobile','Embedded WebP textures up to 384 pixels','Preserved source names, UVs, materials, rig metadata and calibration markers; no animations or embedded scripts executed']}
target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
