"""Re-encode a normalized custom vehicle with embedded WebP textures; no runtime codecs."""
import bpy,sys,json,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2:raise RuntimeError('Usage: blender -b -P scripts/optimize-custom-vehicle.py -- rigged.glb output.glb')
source,target=map(Path,args)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
for image in bpy.data.images:
 if image.type=='IMAGE' and max(image.size)>1024:
  ratio=1024/max(image.size);image.scale(round(image.size[0]*ratio),round(image.size[1]*ratio))
for obj in bpy.context.scene.objects:
 if obj.type=='MESH' and len(obj.data.polygons)>1000:
  modifier=obj.modifiers.new('Browser geometry detail','DECIMATE');modifier.ratio=.65
  bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)

bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=90)
# Keep the author's source/license metadata embedded after Blender's export.
import struct
raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
report=json.loads(source.with_suffix('.json').read_text());doc['asset']['extras']=report['credit'];doc['asset']['generator']+=' / Boost Circuit asset preparation'
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
packed=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
target.write_bytes(packed)
report.update({'file':target.name,'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'images':len(doc.get('images',[])),'textureEncoding':'WebP quality 90, at most 1024 pixels','extensionsRequired':doc.get('extensionsRequired',[]),'animations':len(doc.get('animations',[]))})
for obj in bpy.context.scene.objects:
 if obj.type=='MESH':obj.data.calc_loop_triangles()
report['triangles']=sum(len(o.data.loop_triangles) for o in bpy.context.scene.objects if o.type=='MESH')
report['modifications'].append('Re-encoded embedded textures as WebP quality 90 at at most 1024 pixels; simplified large surface meshes with Blender Decimate at ratio 0.65')
target.with_name(target.stem+'-import.json').write_text(json.dumps(report,indent=2)+'\n')
print('CUSTOM_ASSET_REPORT',json.dumps(report),flush=True)
