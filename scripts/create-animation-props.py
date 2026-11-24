"""Original subdivided stadium pennants, editable in Blender and used in game.
Run: blender --background --python scripts/create-animation-props.py
Blender preview shape keys demonstrate the same anchored cloth movement used
by the browser's vertex shader; no per-frame mesh uploads or physics are needed.
"""
import bpy, math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
vertices=[];faces=[];columns=16;rows=6
for y in range(rows+1):
    for x in range(columns+1):
        u=x/columns;v=y/rows
        vertices.append((u*3.4,0,10+v*1.7))
for y in range(rows):
    for x in range(columns):
        a=y*(columns+1)+x;faces.append((a,a+1,a+columns+2,a+columns+1))
mesh=bpy.data.meshes.new('Pennant_grid');mesh.from_pydata(vertices,[],faces);mesh.update()
uv=mesh.uv_layers.new(name='UVMap')
for poly in mesh.polygons:
    for loop in poly.loop_indices:
        point=mesh.vertices[mesh.loops[loop].vertex_index].co
        uv.data[loop].uv=(point.x/3.4,(point.z-10)/1.7)
flag=bpy.data.objects.new('Original_Cloth_Pennant',mesh);bpy.context.collection.objects.link(flag)
flag['originalArtwork']=True;flag['author']='Boost Circuit original Blender artwork'
material=bpy.data.materials.new('Pennant_team_fabric');material.diffuse_color=(.06,.32,.65,1);material.use_nodes=True
material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
flag.data.materials.append(material)
flag.shape_key_add(name='Basis')
for name,phase in [('Wind_A',0),('Wind_B',math.pi)]:
    key=flag.shape_key_add(name=name)
    for vertex in key.data:
        u=vertex.co.x/3.4;vertex.co.y=-math.sin(u*7+phase)*u*.24
    for frame,value in [(1,0),(31,1),(61,0),(91,1),(121,0)]:
        key.value=value if name=='Wind_A' else 1-value;key.keyframe_insert(data_path='value',frame=frame)
bpy.context.scene.frame_end=120;bpy.context.scene.frame_set(1)
flag.data.shape_keys.key_blocks['Wind_A'].value=0;flag.data.shape_keys.key_blocks['Wind_B'].value=0
# Export only the rest mesh. The runtime shader supplies continuous wind.
bpy.ops.object.select_all(action='DESELECT');flag.select_set(True);bpy.context.view_layer.objects.active=flag
out=ROOT/'dist/assets/animation';out.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out/'stadium-pennant.glb'),export_format='GLB',use_selection=True,export_animations=False,export_morph=False,export_yup=True,export_extras=True)
# Artist preview: pole, ground and neutral area light are kept only in the blend.
bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.055,depth=12,location=(0,0,6))
pole=bpy.context.object;pole.name='Preview_Pole';pole.rotation_euler=(0,0,0)
bpy.context.scene.world.color=(.15,.18,.23)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/stadium-pennant.blend'),compress=True)
print('Original stadium pennant: 192 triangles, 1 shared mesh, no textures.')
