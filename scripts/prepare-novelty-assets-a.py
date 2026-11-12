"""Prepare supplied Randy, Ridiculous Vehicle, or Viking assets in Blender 4.3.

blender -b -P scripts/prepare-novelty-assets-a.py -- KIND SOURCE TEXTURES OUT.glb
The source archives contain no license/author notice. This script records that
absence; it does not infer a redistribution license from possession of a file.
"""
import bpy, bmesh, hashlib, json, math, struct, sys, tempfile
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector

kind, source, texture_dir, target = sys.argv[sys.argv.index('--') + 1:]
if kind not in ('randy', 'ridiculous', 'viking'):
    raise RuntimeError('Expected randy, ridiculous, or viking')
source, texture_dir, target = map(Path, (source, texture_dir, target))
bpy.ops.wm.read_factory_settings(use_empty=True)
if kind == 'randy':
    bpy.ops.import_scene.gltf(filepath=str(source))
elif kind == 'ridiculous':
    bpy.ops.import_scene.fbx(filepath=str(source))
else:
    bpy.ops.wm.obj_import(filepath=str(source), use_split_groups=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if kind == 'randy':
    # The importer may link a low-poly custom bone display shape. It is not a
    # mesh in the uploaded GLB and must not become visible vehicle geometry.
    for obj in list(meshes):
        if not any(m.type == 'ARMATURE' for m in obj.modifiers):
            meshes.remove(obj); bpy.data.objects.remove(obj, do_unlink=True)
source_triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
changes = ['Converted the user-supplied source to a self-contained browser GLB',
           'Normalized +Y up / +Z forward and floor zero; physics are not encoded in this visual asset',
           'Embedded WebP textures at at most 1024 pixels; no external geometry decoder']

def image(path):
    obj = bpy.data.images.load(str(path), check_existing=True)
    if max(obj.size) > 1024:
        ratio = 1024 / max(obj.size)
        obj.scale(max(1, round(obj.size[0] * ratio)), max(1, round(obj.size[1] * ratio)))
    obj.pack()
    return obj

if kind == 'randy':
    # Give embedded images stable PNG paths. The external archive copies use a
    # different vertical orientation and cannot replace the embedded artwork.
    # Blender 4.3 cannot reliably duplicate filepath-less images for WebP export.
    texture_temp = tempfile.TemporaryDirectory(prefix='novelty-randy-textures-')
    original = source.read_bytes(); json_size = struct.unpack_from('<I', original, 12)[0]
    original_doc = json.loads(original[20:20 + json_size]); original_binary = original[28 + json_size:]
    links = {}
    for info in original_doc['images']:
        view = original_doc['bufferViews'][info['bufferView']]
        offset = view.get('byteOffset', 0)
        path = Path(texture_temp.name) / (info['name'] + '.png')
        path.write_bytes(original_binary[offset:offset + view['byteLength']]); links[info['name']] = path
    for material in bpy.data.materials:
        if not material.use_nodes: continue
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                node.image = image(links[node.image.name])
    for obj in meshes:
        modifier = obj.modifiers.new('Browser detail', 'DECIMATE')
        modifier.ratio = .5
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    armature.animation_data_clear()
    # Rotate in armature space despite the source bones' nonstandard local axes.
    def pose_delta(name, *rotations):
        bone = armature.pose.bones[name]
        basis = bone.bone.matrix_local.to_quaternion()
        delta = Quaternion()
        for axis, angle in rotations:
            delta = Quaternion(axis, angle) @ delta
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = basis.inverted() @ delta @ basis
        return bone
    for frame in range(1, 42):
        phase = (frame - 1) * math.tau / 40
        for side, sign in [('LT', 1), ('RT', -1)]:
            stride = math.sin(phase) * sign
            entries = [
                ('Randy_' + side + '_Arm_ShoulderSHJnt', ((0, 1, 0), sign * math.radians(65)), ((1, 0, 0), -stride * .13)),
                ('Randy_' + side + '_Leg_HipSHJnt', ((1, 0, 0), stride * .30)),
                ('Randy_' + side + '_Leg_KneeSHJnt', ((1, 0, 0), max(0, -stride) * .42)),
            ]
            for entry in entries:
                bone = pose_delta(entry[0], *entry[1:])
                bone.keyframe_insert('rotation_quaternion', frame=frame)
    armature.animation_data.action.name = 'Randy_Run'
    bpy.context.scene.render.fps = 30
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 41
    bpy.context.scene.frame_set(1)
    changes += ['Reduced the source mesh to 50% through Blender Decimate, retaining skin weights and UVs',
                'Preserved the five embedded GLB texture atlases, face alpha and vertex colors; differently oriented external texture copies were not substituted',
                'Lowered the source T-pose arms and authored a looping 1.37 second running gait; no source animation was present',
                'Preserved the source skeleton for independent per-instance animation']
elif kind == 'ridiculous':
    palette = image(texture_dir / '3DecemberPalette.png')
    for material in bpy.data.materials:
        material.use_nodes = True
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
        shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Roughness'].default_value = .72
        shader.inputs['Metallic'].default_value = 0
        tex = material.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = palette
        material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    bpy.context.scene.frame_set(1)
    changes += ['Relinked the supplied palette to both FBX materials',
                'Retained all source triangles, skin weights, and the source SnakeWalk animation']
else:
    material = next(iter(bpy.data.materials))
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
    shader = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = .72
    shader.inputs['Metallic'].default_value = .10
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image(texture_dir / 'vwhixcl_diffuse.tga.png')
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
    normal_texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    normal_texture.image = image(texture_dir / 'vwhixcl_normal_map.tga.png')
    normal_texture.image.colorspace_settings.name = 'Non-Color'
    normal = material.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .6
    material.node_tree.links.new(normal_texture.outputs['Color'], normal.inputs['Color'])
    material.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    material.use_backface_culling = False
    material.surface_render_method = 'DITHERED'
    changes += ['Reconstructed the missing OBJ MTL using supplied diffuse and normal atlases',
                'Omitted the all-black emission atlas and the reflection map whose original shader mapping is absent',
                'Separated four source wheel assemblies with real rolling axles and front steering',
                'Reduced dense rope and catapult spike meshes to 65%; batched fixed body parts into one material draw']

def bounds(objects, evaluated=False):
    deps = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        if evaluated:
            current = obj.evaluated_get(deps)
            mesh = current.to_mesh()
            points += [current.matrix_world @ v.co for v in mesh.vertices]
            current.to_mesh_clear()
        else:
            points += [obj.matrix_world @ v.co for v in obj.data.vertices]
    return (Vector([min(p[i] for p in points) for i in range(3)]),
            Vector([max(p[i] for p in points) for i in range(3)]))

if kind == 'randy':
    # Plant the lowest foot at the source floor instead of letting the simple
    # procedural knee/hip rotations extend a leg below the playing surface.
    bpy.context.scene.frame_set(1)
    rest_floor = bounds(meshes, evaluated=True)[0].z
    for frame in range(1, 42):
        bpy.context.scene.frame_set(frame)
        armature.location.z = 0
        bpy.context.view_layer.update()
        floor = bounds(meshes, evaluated=True)[0].z
        armature.location.z = rest_floor - floor
        armature.keyframe_insert('location', frame=frame)
    bpy.context.scene.frame_set(1)
    changes.append('Added vertical gait compensation to keep the lowest animated foot at the visual floor')

low, high = bounds(meshes, evaluated=kind != 'viking')
center = (low + high) / 2
scale = (1.9 / (high.z - low.z)) if kind == 'randy' else (2 / (high.y - low.y))
rotation = Matrix.Rotation(math.pi, 4, 'Z') if kind == 'viking' else Matrix.Identity(4)
normalize = Matrix.Scale(scale, 4) @ rotation @ Matrix.Translation(Vector((-center.x, -center.y, -low.z)))
root = bpy.data.objects.new(kind.title() + '_Vehicle', None)
bpy.context.collection.objects.link(root)
root['visualFloor'] = 0.
root['visualLength'] = (high.y - low.y) * scale
body = bpy.data.objects.new('Custom_Body', None)
bpy.context.collection.objects.link(body)
body.parent = root
wheels = []
if kind != 'viking':
    # Keeping normalization above the skeleton preserves the source inverse bind
    # matrices and allows safe skeleton clones without baking animation tracks.
    source_roots = [o for o in list(bpy.context.scene.objects) if o not in (root, body) and o.parent is None]
    body.matrix_local = normalize
    for obj in source_roots:
        obj.parent = body
else:
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world.identity()
        obj.data.transform(world)
    source_wheels = next(o for o in meshes if o.name == 'wheels')
    wheel_low, wheel_high = bounds([source_wheels])
    wheel_center = (wheel_low + wheel_high) / 2
    for source_front in (True, False):
        for source_left in (True, False):
            # Every source wheel part belongs wholly to one axle quadrant.
            def belongs(face):
                avg = sum((source_wheels.data.vertices[i].co for i in face.vertices), Vector()) / len(face.vertices)
                return (avg.y > wheel_center.y) == source_front and (avg.x < wheel_center.x) == source_left
            data = source_wheels.data.copy()
            keep = {f.index for f in source_wheels.data.polygons if belongs(f)}
            bm = bmesh.new(); bm.from_mesh(data); bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
            loose = [v for v in bm.verts if not v.link_faces]
            if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.to_mesh(data); bm.free()
            part = bpy.data.objects.new('Wheel', data); bpy.context.collection.objects.link(part)
            lo, hi = bounds([part]); source_position = (lo + hi) / 2
            position = normalize @ source_position
            label = ('F' if source_front else 'R') + ('L' if position.x < 0 else 'R')
            radius = max(math.hypot(v.co.y - source_position.y, v.co.z - source_position.z) for v in part.data.vertices) * scale
            part.data.transform(normalize)
            part.data.transform(Matrix.Translation(-position))
            part.name = 'Wheel_' + label
            pivot = bpy.data.objects.new('Steer_' + label, None)
            spin = bpy.data.objects.new('Spin_' + label, None)
            bpy.context.collection.objects.link(pivot); bpy.context.collection.objects.link(spin)
            pivot.parent = root; pivot.location = position
            pivot['front'] = source_front; pivot['rollingRadius'] = radius
            spin.parent = pivot; part.parent = spin
            wheels.append({'name':label, 'front':source_front, 'position':[position.x, position.z, -position.y], 'radius':radius})
    bpy.data.objects.remove(source_wheels, do_unlink=True)
    fixed = [o for o in meshes if o != source_wheels and o.name in bpy.data.objects]
    for obj in fixed:
        if obj.name in ('ropes', 'catapultspikes'):
            modifier = obj.modifiers.new('Browser detail', 'DECIMATE'); modifier.ratio = .65
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.transform(normalize)
        obj.parent = body
    bpy.ops.object.select_all(action='DESELECT')
    for obj in fixed: obj.select_set(True)
    bpy.context.view_layer.objects.active = fixed[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = 'Viking_Fixed_Body'
    root['wheelBase'] = abs(next(w for w in wheels if w['name'] == 'FL')['position'][2] - next(w for w in wheels if w['name'] == 'RL')['position'][2])

for obj in list(bpy.context.scene.objects):
    if obj.type not in ('MESH', 'ARMATURE', 'EMPTY'):
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.view_layer.update()
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_extras=True,
    export_yup=True, export_cameras=False, export_lights=False,
    export_animations=kind != 'viking', export_force_sampling=True,
    export_animation_mode='ACTIONS', export_image_format='WEBP', export_image_quality=88)

credit = {'title': {'randy':'Randy Marsh - South Park Snow Day',
                    'ridiculous':'3December 2023 - Ridiculous Vehicle',
                    'viking':'Viking Battle Vehicle'}[kind],
          'author':None, 'license':'Not supplied; undetermined', 'source':None,
          'provenance':'User-uploaded model archive; archive and embedded source contain no attribution or license notice'}
raw = target.read_bytes()
json_length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + json_length])
binary = raw[28 + json_length:]
doc['asset']['extras'] = {'credit':credit, 'modifications':changes}
if kind == 'viking':
    # Blender's dithered preview maps to BLEND. The source atlas has cutouts, so
    # a mask avoids sorted transparency costs while retaining those cutouts.
    for material in doc['materials']:
        material['alphaMode'] = 'MASK'; material['alphaCutoff'] = .5
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
packed = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) +
          struct.pack('<II', len(encoded), 0x4e4f534a) + encoded +
          struct.pack('<II', len(binary), 0x004e4942) + binary)
target.write_bytes(packed)
animations = []
for animation in doc.get('animations', []):
    seconds = max((doc['accessors'][s['input']].get('max', [0])[0] for s in animation['samplers']), default=0)
    animations.append({'name':animation.get('name'), 'seconds':seconds, 'channels':len(animation['channels'])})
report = {'id':kind, 'file':target.name, 'sourceFile':source.name,
          'sourceBytes':source.stat().st_size, 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'bytes':len(packed), 'sha256':hashlib.sha256(packed).hexdigest(),
          'sourceTriangles':source_triangles,
          'triangles':sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc['meshes'] for p in m['primitives']),
          'drawBatches':sum(len(m['primitives']) for m in doc['meshes']),
          'credit':credit, 'sourceBounds':{'min':list(low), 'max':list(high)},
          'normalizedRestDimensions':[(high.x-low.x)*scale, (high.z-low.z)*scale, (high.y-low.y)*scale],
          'visualFloor':0, 'wheels':wheels, 'paintMaterial':None,
          'skinJoints':[len(s['joints']) for s in doc.get('skins', [])],
          'animations':animations, 'nodeNames':[n.get('name') for n in doc.get('nodes', [])],
          'extensionsRequired':doc.get('extensionsRequired', []), 'modifications':changes}
target.with_name(kind + '-import.json').write_text(json.dumps(report, indent=2) + '\n')
print('NOVELTY_RESULT', json.dumps(report), flush=True)
