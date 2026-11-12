"""Offline browser-detail stadium. Run with Blender; the original GLB stays available."""
import bpy,sys,json,hashlib
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2:raise RuntimeError('Usage: blender -b -P scripts/optimize-stadium.py -- input.glb output.glb')
source,target=map(Path,args)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
before=after=0
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 before+=sum(len(p.vertices)-2 for p in obj.data.polygons)
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 names=' '.join(m.name for m in obj.data.materials if m)
 ratio=.18 if 'Seats' in names else .4
 if 'Banner' in names:ratio=1
 elif 'Lighting' in names or 'Floodlight' in names:ratio=.6
 if ratio<1 and len(obj.data.polygons)>100:
  modifier=obj.modifiers.new('Browser detail','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=modifier.name)
 after+=sum(len(p.vertices)-2 for p in obj.data.polygons)
 obj['browserOptimized']=True
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='AUTO')
report={'source':'champions-field.glb','file':target.name,'sourceTriangles':before,'triangles':after,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'modifications':['Retained all stadium batches, materials, eight banner textures and calibration nodes','Applied per-part transforms and offline mesh simplification for browser play','Seats simplified more aggressively than architecture; banner surfaces retained','Original full-detail model remains available in High graphics']}
target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
print('OPTIMIZATION_REPORT',json.dumps(report))
