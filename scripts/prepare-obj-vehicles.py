"""Prepare the supplied OBJ Bike or C-17, preserving source UV artwork.

blender -b -P scripts/prepare-obj-vehicles.py -- bike|c17 source.obj textures output.glb
Run in a development workspace; no native dependency is needed by players.
"""
import bpy,bmesh,hashlib,json,math,struct,sys
from pathlib import Path
from mathutils import Matrix,Vector

kind,source,textures,target=sys.argv[sys.argv.index('--')+1:]
if kind not in ['bike','c17']:raise RuntimeError('Expected bike or c17')
source,textures,target=map(Path,[source,textures,target])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=str(source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
source_triangles=0
for obj in objects:
 obj.data.calc_loop_triangles();source_triangles+=len(obj.data.loop_triangles)
 transform=obj.matrix_world
 if kind=='bike':transform=Matrix.Rotation(-math.pi/2,4,'X')@transform
 obj.data.transform(transform);obj.matrix_world.identity()
 # Delete only empty/zero-area OBJ placeholders, not visible source parts.
 if not obj.data.polygons or max(obj.dimensions)<1e-5:
  bpy.data.objects.remove(obj,do_unlink=True)
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
if kind=='bike':
 for obj in objects:
  outline={i for i,m in enumerate(obj.data.materials) if m.name=='initialShadingGroup'};bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in outline],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(obj.data);bm.free()
points=[v.co.copy() for o in objects for v in o.data.vertices]
low=Vector([min(v[i] for v in points) for i in range(3)]);high=Vector([max(v[i] for v in points) for i in range(3)])
center=(low+high)/2;scale=2/(high.y-low.y)
normalize=Matrix.Diagonal((scale,scale,scale,1))@Matrix.Rotation(math.pi,4,'Z')@Matrix.Translation(Vector((-center.x,-center.y,-low.z)))

image_cache={}
def image(name):
 if name not in image_cache:
  obj=bpy.data.images.load(str(textures/name),check_existing=True)
  if max(obj.size)>1024:
   ratio=1024/max(obj.size);obj.scale(round(obj.size[0]*ratio),round(obj.size[1]*ratio))
  obj.pack();image_cache[name]=obj
 return image_cache[name]

plane_links={'body.0':'Rwng.png','body.1':'C17-1.png','body.2':'C17-3.png','body.3':'C17-2.png','body.4':'C17-4.png','body.5':'C17-5.png','body.6':'Tl.png','body.7':'Lwng.png','body.8':'Eng.png','body.9':'C17-7.png','body.10':'C17-6.png','polygon.0':'Gear.png','parts.5':'Gear.png','int.1':'C17-8.png','int2.0':'C17-9.png','int2.1':'backr.png','cockpit.0':'cab1.png','screen1.0':'1.png','screen2.0':'2.png','moving_prop.0':'C17-4.png','guns.0':'C17-4.png'}
for i,name in enumerate(['Cab2.png','cab1.png','Rseat.png','anapanel.png','panel1.png','panel2.png','panel3.png','panel4.png','panel5.png','panel6.png','panel7.png','panelorta.png','HUD.png']):plane_links['cock.'+str(i)]=name
for material in list(bpy.data.materials):
 material.use_nodes=True;material.node_tree.nodes.clear();output=material.node_tree.nodes.new('ShaderNodeOutputMaterial');shader=material.node_tree.nodes.new('ShaderNodeBsdfPrincipled');material.node_tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
 shader.inputs['Metallic'].default_value=.15;shader.inputs['Roughness'].default_value=.62
 if kind=='bike':
  # The source includes an inverted hull for its drawn outline. Rendering that
  # hull from both sides covers the colored bike with its flat outline swatch.
  material.use_backface_culling=material.name=='initialShadingGroup';shader.inputs['Metallic'].default_value=.05;shader.inputs['Roughness'].default_value=.8
  texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image('neo_NeoTokyoBike_color.png');material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
  emission=material.node_tree.nodes.new('ShaderNodeTexImage');emission.image=image('emissive.png');material.node_tree.links.new(emission.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.65
  if material.name=='lambert3SG':
   painted=material.node_tree.nodes.new('ShaderNodeEmission');painted.inputs['Strength'].default_value=1;material.node_tree.links.new(texture.outputs['Color'],painted.inputs['Color']);material.node_tree.links.new(painted.outputs[0],output.inputs['Surface'])
 elif material.name.startswith('glass'):
  shader.inputs['Base Color'].default_value=(.04,.12,.17,1);shader.inputs['Roughness'].default_value=.23;shader.inputs['Alpha'].default_value=.45;material.surface_render_method='DITHERED';material.use_transparency_overlap=False
 else:
  name=plane_links.get(material.name)
  if name:
   texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image(name);material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
  else:shader.inputs['Base Color'].default_value=(.22,.25,.26,1)

root=bpy.data.objects.new(kind.title()+'_Vehicle',None);bpy.context.collection.objects.link(root)
body=bpy.data.objects.new('Custom_Body',None);bpy.context.collection.objects.link(body);body.parent=root
wheel_objects=[]
if kind=='bike':
 obj=objects[0];mesh=obj.data;parents=list(range(len(mesh.vertices)))
 def find(i):
  while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
  return i
 def union(a,b):parents[find(a)]=find(b)
 welded={}
 for vertex in mesh.vertices:
  key=tuple(round(v,3) for v in vertex.co)
  if key in welded:union(vertex.index,welded[key])
  else:welded[key]=vertex.index
 for face in mesh.polygons:
  for i in face.vertices[1:]:union(face.vertices[0],i)
 components={}
 for v in mesh.vertices:components.setdefault(find(v.index),[]).append(v.index)
 measured={'F':Vector((307.04147,76.60903,33.06469)),'R':Vector((307.68808,-88.74502,33.06470))}
 labels={}
 for component,indices in components.items():
  pts=[mesh.vertices[i].co for i in indices]
  for name,position in measured.items():
   if all(abs(p.x-position.x)<16 and abs(p.y-position.y)<38 and abs(p.z-position.z)<38 for p in pts):labels[component]=name
 face_labels={f.index:labels.get(find(f.vertices[0]),'body') for f in mesh.polygons}
 for label in ['body','F','R']:
  data=mesh.copy();bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if face_labels[f.index]!=label],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
  if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
  bm.to_mesh(data);bm.free();part=bpy.data.objects.new('Bike_'+label,data);bpy.context.collection.objects.link(part)
  if label=='body':part.parent=body
  else:wheel_objects.append((label,part,measured[label],label=='F'))
 bpy.data.objects.remove(obj,do_unlink=True)
else:
 for obj in objects:
  if obj.name in ['polygon','polygon_2','polygon_3','polygon_4','polygon_5']:
   bounds=[v.co.copy() for v in obj.data.vertices];position=Vector([(min(v[i] for v in bounds)+max(v[i] for v in bounds))/2 for i in range(3)]);radius=(max(v.y for v in bounds)-min(v.y for v in bounds))/2;position.z=min(v.z for v in bounds)+radius
   name={'polygon':'F','polygon_2':'R1','polygon_3':'L1','polygon_4':'R2','polygon_5':'L2'}[obj.name]
   # The source axle groups also contain the vertical gear struts. Keep those
   # fixed to the aircraft and roll only the tire/hub region about its real axle.
   mesh=obj.data;rolling_faces={face.index for face in mesh.polygons if all(math.hypot(mesh.vertices[i].co.y-position.y,mesh.vertices[i].co.z-position.z)<radius*1.06 for i in face.vertices)}
   for rolling in [True,False]:
    data=mesh.copy();bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[face for face in bm.faces if (face.index in rolling_faces)!=rolling],context='FACES');loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(data);bm.free();part=bpy.data.objects.new(('C17_Tires_' if rolling else 'C17_Strut_')+name,data);bpy.context.collection.objects.link(part)
    if rolling:wheel_objects.append((name,part,position,name=='F'))
    else:part.parent=body
   bpy.data.objects.remove(obj,do_unlink=True)
  else:obj.parent=body

wheels=[]
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH':obj.data.transform(normalize)
for name,obj,source_position,front in wheel_objects:
 position=normalize@source_position;radius=max(math.hypot(v.co.y-position.y,v.co.z-position.z) for v in obj.data.vertices)
 obj.data.transform(Matrix.Translation(-position))
 steer=bpy.data.objects.new('Steer_'+name,None);spin=bpy.data.objects.new('Spin_'+name,None)
 bpy.context.collection.objects.link(steer);bpy.context.collection.objects.link(spin);steer.parent=root;steer.location=position;spin.parent=steer;obj.parent=spin;steer['rollingRadius']=radius;steer['front']=front
 wheels.append({'name':name,'position':[position.x,position.z,-position.y],'radius':radius,'front':front})
if not wheels:raise RuntimeError('Source wheel groups were not found')
front_z=max(w['position'][2] for w in wheels if w['front']);rear_z=sum(w['position'][2] for w in wheels if not w['front'])/sum(not w['front'] for w in wheels)
root['wheelBase']=front_z-rear_z;root['visualLength']=2.;root['visualFloor']=0.
# Merge body parts by source material through the GLB exporter, and reduce only
# the densest meshes. Thin wings and small trim retain their source geometry.
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 if kind=='c17' and len(obj.data.polygons)>5000:
  modifier=obj.modifiers.new('Browser detail','DECIMATE');modifier.ratio=.65;bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
 obj.data.calc_loop_triangles()
if kind=='c17':
 # The OBJ repeats vertices and separates each airframe panel. Weld positions
 # while retaining per-loop UVs, then export one body with material batches.
 body_parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==body]
 bpy.ops.object.select_all(action='DESELECT')
 for o in body_parts:o.select_set(True)
 bpy.context.view_layer.objects.active=body_parts[0];bpy.ops.object.join()
 for obj in [bpy.context.view_layer.objects.active]+[w[1] for w in wheel_objects]:
  bpy.context.view_layer.objects.active=obj
  if obj.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(obj.data);bm.free()
  for face in obj.data.polygons:face.use_smooth=True
  obj.data.set_sharp_from_angle(angle=math.radians(45));obj.data.calc_loop_triangles()
credit=({'title':'Cyberpunk bike','author':'daCruz (https://sketchfab.com/daCruz)','license':'CC-BY-NC-4.0 (https://creativecommons.org/licenses/by-nc/4.0/)','source':'https://sketchfab.com/3d-models/cyberpunk-bike-efcf679a115c487face1adc2ce7e8b8c','concept':'Fernando Correa (https://www.artstation.com/artwork/8lWYdE)'} if kind=='bike' else {'title':'Boeing C-17B Globemaster III','author':'Muhamad Mirza Arrafi (https://sketchfab.com/MirzaArrafiERV_45)','license':'CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/)','source':'https://sketchfab.com/3d-models/boeing-c-17b-globemaster-iii-2f58a20aa82f404889ff8870f14ddd67'})
target.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False,export_image_format='WEBP',export_image_quality=90)
raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:];doc['asset']['extras']=credit
if kind=='bike':
 for material in doc['materials']:
  atlas=material.pop('emissiveTexture');material.pop('emissiveFactor',None);material['pbrMetallicRoughness']={'baseColorTexture':atlas,'metallicFactor':0,'roughnessFactor':1};material.setdefault('extensions',{})['KHR_materials_unlit']={}
 if 'KHR_materials_unlit' not in doc.setdefault('extensionsUsed',[]):doc['extensionsUsed'].append('KHR_materials_unlit')
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
packed=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary;target.write_bytes(packed)
modifications=['Normalized +Y up / +Z forward, two metre length and floor0', 'Retained the supplied vehicle design and named texture artwork', 'Reconstructed missing OBJ material links from supplied texture filenames; material mapping is a best-effort adaptation', 'Added separate rolling axles and independent front steering', 'Embedded WebP textures at at most1024 pixels; no runtime geometry decoder']
modifications+=['Removed the duplicated flat-color outline shell that occluded the painted model', 'Retained the hand-painted atlas as an unlit material, including its colored lights'] if kind=='bike' else ['Simplified only meshes over5000 source faces at ratio0.65; removed empty OBJ placeholders', 'Batched body by material and welded repeated positions while retaining per-loop UVs; rebuilt smooth hull normals with45 degree sharp edges', 'Separated the rolling tire/hub regions from the fixed upper gear struts and measured actual axle radii']
report={'id':kind,'file':target.name,'sourceFile':source.name,'sourceBytes':source.stat().st_size,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':len(packed),'sha256':hashlib.sha256(packed).hexdigest(),'sourceTriangles':source_triangles,'triangles':sum(len(o.data.loop_triangles) for o in bpy.context.scene.objects if o.type=='MESH'),'drawBatches':sum(len(m['primitives']) for m in doc['meshes']),'credit':credit,'visualLength':2,'wheels':wheels,'paintMaterial':None,'extensionsRequired':doc.get('extensionsRequired',[]),'modifications':modifications}
target.with_name(kind+'-import.json').write_text(json.dumps(report,indent=2)+'\n');print('VEHICLE_RESULT',json.dumps(report),flush=True)
