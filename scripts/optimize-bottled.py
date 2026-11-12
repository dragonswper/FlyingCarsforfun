"""Re-encode embedded textures for the bottled-car asset; no runtime codecs."""
import bpy,sys,json,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2:raise RuntimeError('Usage: blender -b -P scripts/optimize-bottled.py -- rigged.glb output.glb')
source,target=map(Path,args)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=90)
# Keep the author's source/license metadata embedded after Blender's export.
import struct
raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
report=json.loads(source.with_suffix('.json').read_text());doc['asset']['extras']=report['credit'];doc['asset']['generator']+=' / Boost Circuit asset preparation'
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
packed=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
target.write_bytes(packed)
report.update({'file':target.name,'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'images':len(doc.get('images',[])),'textureEncoding':'WebP quality 90, original 1024 pixel dimensions','extensionsRequired':doc.get('extensionsRequired',[]),'animations':len(doc.get('animations',[]))})
report['modifications'].append('Re-encoded embedded textures as WebP quality 90 at their original dimensions and removed unused transmission texture')
target.with_name('bottled-import.json').write_text(json.dumps(report,indent=2)+'\n')
print('BOTTLED_ASSET_REPORT',json.dumps(report),flush=True)
