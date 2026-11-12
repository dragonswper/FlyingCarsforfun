"""Prepare four user-supplied novelty GLBs in an offline Blender workspace.

blender -b -t 3 -P scripts/prepare-novelty-assets-b.py -- kind source.glb output.glb
Kinds: scifi, golfcart, rickshaw, ifv. No native tools are required by players.
"""
import bpy, bmesh, hashlib, json, math, re, struct, sys
from pathlib import Path
from mathutils import Matrix, Vector

kind, source_arg, target_arg = sys.argv[sys.argv.index('--') + 1:]
if kind not in ['scifi', 'golfcart', 'rickshaw', 'ifv']:
    raise RuntimeError('Expected scifi, golfcart, rickshaw or ifv')
source, target = Path(source_arg), Path(target_arg)
source_raw = source.read_bytes()
source_json_length = struct.unpack_from('<I', source_raw, 12)[0]
source_doc = json.loads(source_raw[20:20 + source_json_length])
credit = source_doc.get('asset', {}).get('extras', {})
source_triangles = sum(source_doc['accessors'][p['indices']]['count'] // 3
                       for mesh in source_doc['meshes'] for p in mesh['primitives'])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
bpy.context.scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
rotation = Matrix.Rotation(math.pi / 2, 4, 'Z') if kind == 'scifi' else Matrix.Identity(4)
baked, excluded = [], []
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    # The glTF importer creates hidden icosphere bone shapes for this armature.
    # They are editor helpers, not meshes present in the supplied GLB.
    if kind == 'scifi' and ((not obj.data.materials and obj.name.startswith('Icosphere'))
                             or any(m and m.name == 'ground' for m in obj.data.materials)):
        excluded.append(obj.name)
        continue
    evaluated = obj.evaluated_get(depsgraph)
    data = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    data.transform(rotation @ evaluated.matrix_world)
    baked.append((obj.name, data))
for obj in list(bpy.context.scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
objects = []
for name, data in baked:
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    objects.append(obj)


def bounds(parts):
    coords = [v.co for obj in parts for v in obj.data.vertices]
    return (Vector([min(v[i] for v in coords) for i in range(3)]),
            Vector([max(v[i] for v in coords) for i in range(3)]))


def split_faces(obj, labels):
    """Retain corner UVs and source materials while separating face groups."""
    result = {}
    for label in sorted(set(labels.values())):
        data = obj.data.copy()
        bm = bmesh.new()
        bm.from_mesh(data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if labels[f.index] != label], context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(data)
        bm.free()
        part = bpy.data.objects.new(kind + '_' + label, data)
        bpy.context.collection.objects.link(part)
        result[label] = part
    bpy.data.objects.remove(obj, do_unlink=True)
    return result


wheel_parts, wheel_centers, wheel_front, body_parts = {}, {}, {}, []
if kind == 'scifi':
    # This upload is one assembled three-wheeler. Each wheel has separate
    # tire, rim and hub primitives, with fixed suspension in other objects.
    wheel_prefixes = {'Plane.002_': 'F', 'Plane.006_': 'RR', 'Plane.007_': 'RL'}
    for obj in objects:
        label = next((label for prefix, label in wheel_prefixes.items() if obj.name.startswith(prefix)), None)
        if label:
            wheel_parts.setdefault(label, []).append(obj)
        else:
            body_parts.append(obj)
    for label, parts in wheel_parts.items():
        rubber = [obj for obj in parts if any(m and m.name == 'Wheel_Rubber' for m in obj.data.materials)]
        low, high = bounds(rubber)
        wheel_centers[label] = (low + high) / 2
        wheel_front[label] = label == 'F'
elif kind == 'golfcart':
    # This scan is one connected surface, including the axle connections.
    # Separate only the outer wooden wheel regions around measured axles.
    # Their original scanned UV artwork remains on the extracted faces.
    scan = next(obj for obj in objects if obj.name == 'Object_6')
    measured = {
        'FL': Vector((-.0615, -.1090, .0265)),
        'FR': Vector(( .0660, -.1065, .0281)),
        'RL': Vector((-.0645,  .0750, .0289)),
        'RR': Vector(( .0620,  .0758, .0295)),
    }
    labels = {}
    for face in scan.data.polygons:
        p = face.center
        label = 'body'
        for candidate, center in measured.items():
            side = -1 if candidate.endswith('L') else 1
            if p.x * side > .0505 and p.z < .0570 and math.hypot(p.y - center.y, p.z - center.z) < .0306:
                label = candidate
                break
        labels[face.index] = label
    separated = split_faces(scan, labels)
    for label, center in measured.items():
        if label not in separated or len(separated[label].data.polygons) < 400:
            raise RuntimeError('The scanned golf-cart wheel region was not found: ' + label)
        wheel_parts[label] = [separated[label]]
        wheel_centers[label] = center
        wheel_front[label] = label.startswith('F')
    body_parts = [obj for obj in objects if obj is not scan] + [separated['body']]
elif kind == 'rickshaw':
    for obj in objects:
        if obj.name.startswith('Front_Wheel'):
            label = 'F'
        elif obj.name.startswith('Rear_Wheel') and not obj.name.startswith('Rear_Wheel14_'):
            low, high = bounds([obj])
            label = 'RL' if (low.x + high.x) < 0 else 'RR'
        else:
            body_parts.append(obj)
            continue
        wheel_parts.setdefault(label, []).append(obj)
    for label, parts in wheel_parts.items():
        # Use each tire's symmetric extents, avoiding axle end-cap offsets.
        tire = next(obj for obj in parts if obj.name.startswith({'F': 'Front_Wheel3_', 'RL': 'Rear_Wheel15_', 'RR': 'Rear_Wheel7_'}[label]))
        low, high = bounds([tire])
        wheel_centers[label] = (low + high) / 2
        wheel_front[label] = label == 'F'
else:
    # Source meshes 127..142 and 286..301 are the cylindrical running gear.
    # Group concentric source parts; spare wheels and track links stay fixed.
    raw_groups = {}
    for obj in objects:
        match = re.match(r'Mesh(\d+)_', obj.name)
        number = int(match.group(1)) if match else -1
        if 127 <= number <= 142 or 286 <= number <= 301:
            low, high = bounds([obj])
            center = (low + high) / 2
            side = 'L' if center.x < 16 else 'R'
            key = (side, round(center.y, 2), round(center.z, 2))
            raw_groups.setdefault(key, []).append(obj)
        else:
            body_parts.append(obj)
    for side in ['L', 'R']:
        keys = sorted((key for key in raw_groups if key[0] == side), key=lambda key: (key[1], key[2]))
        for index, key in enumerate(keys, 1):
            label = side + str(index)
            parts = raw_groups[key]
            low, high = bounds(parts)
            wheel_parts[label] = parts
            wheel_centers[label] = (low + high) / 2
            wheel_front[label] = False

if len(wheel_parts) < 2:
    raise RuntimeError('Expected at least two independently rolling wheel groups')
all_parts = body_parts + [obj for parts in wheel_parts.values() for obj in parts]
low, high = bounds(all_parts)
center = (low + high) / 2
scale = 2 / (high.y - low.y)
normalize = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-center.x, -center.y, -low.z)))
for obj in all_parts:
    obj.data.transform(normalize)
    if kind in ['scifi', 'ifv']:
        # These materials have no images. The IFV contains eight unused UV
        # channels; exporting them would add about 13 MB without visible data.
        while obj.data.uv_layers:
            obj.data.uv_layers.remove(obj.data.uv_layers[-1])
    elif kind == 'golfcart':
        # Every supplied texture binds TEXCOORD_0. Three extra source UV
        # channels are unused and can be omitted without remapping artwork.
        while len(obj.data.uv_layers) > 1:
            obj.data.uv_layers.remove(obj.data.uv_layers[-1])
for label in wheel_centers:
    wheel_centers[label] = normalize @ wheel_centers[label]

root = bpy.data.objects.new(kind.title() + '_Vehicle', None)
bpy.context.collection.objects.link(root)
root['visualLength'], root['visualFloor'] = 2., 0.
root['noveltyBody'], root['tracked'] = True, kind == 'ifv'
body = bpy.data.objects.new('Custom_Body', None)
bpy.context.collection.objects.link(body)
body.parent = root


def batch(parts, name, budget):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    # Weld only coincident positions. Per-loop UV seams remain independent.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    if triangles > budget:
        modifier = obj.modifiers.new('Browser detail', 'DECIMATE')
        modifier.ratio = budget / triangles
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


budgets = {'scifi': (65000, 2200), 'golfcart': (65000, 800), 'rickshaw': (65000, 1600), 'ifv': (80000, 800)}
body_mesh = batch(body_parts, kind.title() + '_Geometry', budgets[kind][0])
body_mesh.parent = body
wheels = []
for label, parts in sorted(wheel_parts.items()):
    position = wheel_centers[label]
    radius = max(math.hypot(v.co.y - position.y, v.co.z - position.z) for obj in parts for v in obj.data.vertices)
    obj = batch(parts, 'Wheel_' + label, budgets[kind][1])
    obj.data.transform(Matrix.Translation(-position))
    steer = bpy.data.objects.new('Steer_' + label, None)
    spin = bpy.data.objects.new('Spin_' + label, None)
    bpy.context.collection.objects.link(steer)
    bpy.context.collection.objects.link(spin)
    steer.parent, spin.parent, obj.parent = root, steer, spin
    steer.location = position
    steer['rollingRadius'], steer['front'] = radius, wheel_front[label]
    wheels.append({'name': label, 'position': [position.x, position.z, -position.y],
                   'radius': radius, 'front': wheel_front[label]})
front = [w['position'][2] for w in wheels if w['front']]
rear = [w['position'][2] for w in wheels if not w['front']]
wheelbase = abs(sum(front) / len(front) - sum(rear) / len(rear)) if front and rear else 0.
root['wheelBase'] = wheelbase
for image in bpy.data.images:
    if image.type == 'IMAGE' and max(image.size) > 1024:
        ratio = 1024 / max(image.size)
        image.scale(max(1, round(image.size[0] * ratio)), max(1, round(image.size[1] * ratio)))

bpy.context.view_layer.update()
target.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_extras=True,
                          export_yup=True, export_cameras=False, export_lights=False,
                          export_animations=False, export_image_format='WEBP', export_image_quality=90)
# Preserve the exact attribution supplied in the GLB rather than assigning the
# game's code license to this third-party artwork.
raw = target.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc, binary = json.loads(raw[20:20 + length]), raw[28 + length:]
doc['asset']['extras'] = credit
doc['asset']['generator'] += ' / Boost Circuit novelty preparation'
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
packed = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
          + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
          + struct.pack('<II', len(binary), 0x004e4942) + binary)
target.write_bytes(packed)
target.chmod(0o644)

points = [obj.matrix_world @ v.co for obj in bpy.context.scene.objects if obj.type == 'MESH' for v in obj.data.vertices]
gltf_points = [Vector((p.x, p.z, -p.y)) for p in points]
gltf_bounds = [[min(p[i] for p in gltf_points) for i in range(3)],
               [max(p[i] for p in gltf_points) for i in range(3)]]
modifications = ['Baked source transforms and normalized to +Y up / +Z forward, 2 metre length and floor zero',
                 'Batched fixed body by source material, welded coincident positions while retaining corner UVs, and simplified dense surfaces',
                 'Added measured independent wheel rolling pivots and front steering where appropriate',
                 'Preserved supplied material colors and finishes; no Custom_Paint material is assigned',
                 'Embedded WebP quality 90 textures at at most 1024 pixels; no external geometry decoder']
if kind == 'scifi':
    modifications += ['Selected the one coherent assembled three-wheeler already present in the supplied set',
                      'Baked the first imported animation pose; removed the display floor and importer-created hidden bone-shape helpers',
                      'Replaced source armatures and demonstration clip with procedural tire rolling/front steering; fixed leg geometry is retained']
elif kind == 'golfcart':
    modifications += ['Separated approximate outer wooden tire/hub regions from the single connected scanned cart using measured cylindrical regions; retained their UV artwork',
                      'Removed three unused source UV channels; every source image uses the retained TEXCOORD_0']
elif kind == 'rickshaw':
    modifications += ['Kept the rear axle fixed; grouped the source named wheel parts into one front and two rear rolling assemblies']
else:
    modifications += ['Kept track belts, track links, spare wheels, hull and turret fixed; grouped the actual running gear into 30 non-steering rolling pivots',
                      'Removed all unused source UV channels from the untextured material-only model']
report = {'id': kind, 'file': target.name, 'sourceFile': source.name,
          'sourceBytes': len(source_raw), 'sourceSha256': hashlib.sha256(source_raw).hexdigest(),
          'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest(),
          'sourceTriangles': source_triangles,
          'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc['meshes'] for p in m['primitives']),
          'drawBatches': sum(len(m['primitives']) for m in doc['meshes']),
          'credit': credit, 'licenseVerification': 'Exact attribution embedded in the user-supplied GLB; no separate purchase or license document was supplied',
          'visualLength': 2, 'visualFloor': 0, 'bounds': gltf_bounds, 'wheels': wheels,
          'wheelBase': wheelbase, 'paintMaterial': None, 'tracked': kind == 'ifv',
          'sourceAnimations': [a.get('name', '') for a in source_doc.get('animations', [])],
          'animations': len(doc.get('animations', [])), 'skins': len(doc.get('skins', [])),
          'images': len(doc.get('images', [])), 'extensionsUsed': doc.get('extensionsUsed', []),
          'extensionsRequired': doc.get('extensionsRequired', []),
          'excludedObjects': excluded, 'modifications': modifications}
if kind == 'rickshaw':
    report['licenseReference'] = {
        'source': 'https://sketchfab.com/licenses',
        'verified': '2026-11-12',
        'section': 'FAQ What is forbidden; License Agreement 2.2(h)',
        'limit': 'The Standard license prohibits making the asset available for download, extraction, redistribution or access as a stand-alone file; no separate permission document was supplied.'
    }
target.with_name(kind + '-import.json').write_text(json.dumps(report, indent=2) + '\n')
target.with_name(kind + '-import.json').chmod(0o644)
print('NOVELTY_ASSET_REPORT', json.dumps(report), flush=True)
