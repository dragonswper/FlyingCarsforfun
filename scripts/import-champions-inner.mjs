/* Offline adaptation of the supplied CC BY 4.0 Champions Field inner arena.
   No replacement field/goal primitives, remote textures, or runtime decoders. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { mergeVertices } from '../dist/vendor/BufferGeometryUtils.js';
import { C, arenaOutline } from '../dist/constants.js';
import { arenaPlanes } from '../dist/arena.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/import-champions-inner.mjs SOURCE.glb [--source-colors]');
const sourceColors = process.argv.includes('--source-colors');
const output = new URL('../dist/assets/models/', import.meta.url);
const raw = fs.readFileSync(input);
const source = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
const loader = new GLTFLoader();
loader.register(() => ({ name: 'HEADLESS_TEXTURES', loadTexture() { return Promise.resolve(new T.Texture()); } }));
const gltf = await new Promise((resolve, reject) => loader.parse(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '', resolve, reject));
gltf.scene.updateMatrixWorld(true);

const roles = {
  polySurface3408_play_lambert1_0: 'turf',
  polySurface3408_play_rampTop1_0: 'ramp-trim',
  polySurface3408_play_ring02_0: 'perimeter-trim',
  polySurface3408_goalRing1_0: 'goal-frame',
  polySurface3408_goal_inside1_0: 'goal-interior',
  polySurface3408_goal_Ground1_0: 'goal-floor',
  polySurface3408_goal_inner1_0: 'goal-back-insert',
  polySurface3408_goal_innerDown1_0: 'goal-back-structure',
};
const meshes = Object.entries(roles).map(([name, role]) => {
  const object = gltf.scene.getObjectByName(name);
  if (!object?.isMesh) throw new Error('Supplied model is missing ' + name);
  const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
  geometry.computeBoundingBox();
  return { name, role, object, geometry, bounds: geometry.boundingBox.clone() };
});
const turf = meshes.find(m => m.role === 'turf');
const inside = meshes.find(m => m.role === 'goal-interior');
const back = meshes.find(m => m.role === 'goal-back-structure');
const domeObject = gltf.scene.getObjectByName('polySurface3408_play_Glassdome1_0');
const domeBounds = new T.Box3().setFromObject(domeObject);
const sourceFloor = turf.bounds.min.y;
const longCenter = (turf.bounds.min.x + turf.bounds.max.x) / 2;
const crossCenter = (inside.bounds.min.z + inside.bounds.max.z) / 2;
const flatPoints = [];
for (let i = 0; i < turf.geometry.attributes.position.count; i++) {
  const p = turf.geometry.attributes.position;
  if (p.getY(i) <= sourceFloor + .00015) flatPoints.push([p.getZ(i) - crossCenter, p.getX(i) - longCenter]);
}
const flatLong = Math.max(...flatPoints.map(p => Math.abs(p[1])));
const flatCross = Math.max(...flatPoints.map(p => Math.abs(p[0])));
const wallLong = (turf.bounds.max.x - turf.bounds.min.x) / 2;
const wallCross = Math.max(Math.abs(turf.bounds.min.z - crossCenter), Math.abs(turf.bounds.max.z - crossCenter));
const goalHalfWidth = (inside.bounds.max.z - inside.bounds.min.z) / 2;
const goalTop = inside.bounds.max.y;
const goalBack = Math.max(Math.abs(back.bounds.min.x - longCenter), Math.abs(back.bounds.max.x - longCenter));
const rampCrest = turf.bounds.max.y;
const longMap = [[0, 0], [flatLong, C.halfLength - C.ramp], [wallLong, C.halfLength], [goalBack, C.halfLength + C.goalDepth]];
const crossMap = [[0, 0], [goalHalfWidth, C.goalWidth], [flatCross, C.halfWidth - C.ramp], [wallCross, C.halfWidth]];
const heightMap = [[sourceFloor, 0], [rampCrest, C.ramp], [goalTop, C.goalHeight], [domeBounds.max.y, C.height]];
function interpolate(knots, value) {
  let i = 1;
  while (i < knots.length - 1 && value > knots[i][0]) i++;
  const [a, b] = knots[i - 1], [c, d] = knots[i];
  return b + (value - a) * (d - b) / (c - a);
}
function axisPoint(nativeCross, nativeLong) {
  return [-Math.sign(nativeCross) * interpolate(crossMap, Math.abs(nativeCross)), Math.sign(nativeLong) * interpolate(longMap, Math.abs(nativeLong))];
}
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [p.map(v => v.toFixed(7)).join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [], upper = [];
  for (const p of sorted) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 1e-10) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 1e-10) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function planes(points) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
    if (nx * a[0] + nz * a[1] > 0) { nx *= -1; nz *= -1; }
    return { nx, nz, b: nx * a[0] + nz * a[1] };
  });
}
const allTurfPoints = [];
for (let i = 0; i < turf.geometry.attributes.position.count; i++) {
  const p = turf.geometry.attributes.position;
  allTurfPoints.push(axisPoint(p.getZ(i) - crossCenter, p.getX(i) - longCenter));
}
const sourceFlatHull = convexHull(flatPoints.map(p => axisPoint(...p)));
const sourceOuterHull = convexHull(allTurfPoints);
const sourceFlatPlanes = planes(sourceFlatHull), sourceOuterPlanes = planes(sourceOuterHull);
const targetOuterPlanes = planes(arenaOutline()), targetFlatPlanes = targetOuterPlanes.map(p => ({ ...p, b: p.b + C.ramp }));
function radiusAt(boundaries, dx, dz) {
  let radius = Infinity;
  for (const p of boundaries) { const denominator = p.nx * dx + p.nz * dz; if (denominator < -1e-12) radius = Math.min(radius, p.b / denominator); }
  return radius;
}
function cornerMap(x, z) {
  const r = Math.hypot(x, z);
  if (r < 1e-8) return [x, z];
  const dx = x / r, dz = z / r;
  const sf = radiusAt(sourceFlatPlanes, dx, dz), so = radiusAt(sourceOuterPlanes, dx, dz);
  const tf = radiusAt(targetFlatPlanes, dx, dz), to = radiusAt(targetOuterPlanes, dx, dz);
  const mapped = r <= sf ? r * tf / sf : r <= so ? tf + (r - sf) * (to - tf) / Math.max(1e-8, so - sf) : r + to - so;
  return [dx * mapped, dz * mapped];
}
function collisionFloor(x, z) {
  const distance = Math.min(...arenaPlanes(new T.Vector3(x, 0, z)).map(p => p.d));
  if (distance >= C.ramp) return 0;
  const horizontal = C.ramp - Math.max(0, distance);
  return C.ramp - Math.sqrt(Math.max(0, C.ramp * C.ramp - horizontal * horizontal));
}
function mapPoint(x, y, z, role) {
  const horizontal = cornerMap(...axisPoint(z - crossCenter, x - longCenter));
  // Several separately modeled source rim strips end on almost coincident
  // contours. Meet the same collision boundary instead of leaving tiny scallops.
  if (['turf', 'ramp-trim', 'perimeter-trim'].includes(role) && y >= rampCrest - .0015) {
    const length = Math.hypot(...horizontal), dx = horizontal[0] / length, dz = horizontal[1] / length;
    const radius = radiusAt(targetOuterPlanes, dx, dz);
    horizontal[0] = dx * radius; horizontal[1] = dz * radius;
  }
  let height = y <= sourceFloor + .0002 ? 0 : interpolate(heightMap, y);
  // The same native turf vertices/topology now lie on the solver's actual floor/ramp.
  // Goal floor's tiny native rear curl is flattened to the solver's net floor.
  if (role === 'turf') height = collisionFloor(...horizontal);
  if (role === 'goal-floor') height = 0;
  if (role === 'ramp-trim' || role === 'perimeter-trim') height = collisionFloor(...horizontal) + .012;
  return [horizontal[0], height, horizontal[1]];
}

// Conforming subdivision preserves source triangles while adding enough samples
// for the existing circular collision ramps. Every split edge is shared by both
// neighboring triangles, so projection does not open cracks between triangles.
function refineSurface(inputGeometry, offsetY) {
  let geometry = inputGeometry;
  for (let pass = 0; pass < 6; pass++) {
    const p = geometry.attributes.position, positions = Array.from(p.array), index = geometry.index.array, cuts = new Map(), uses = new Map();
    const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
    for (let i = 0; i < index.length; i += 3) for (const [a, b] of [[index[i], index[i + 1]], [index[i + 1], index[i + 2]], [index[i + 2], index[i]]]) {
      const key = edgeKey(a, b); uses.set(key, (uses.get(key) || 0) + 1);
    }
    const rim = a => Math.abs(positions[a * 3 + 1] - C.ramp - offsetY) < .003 && Math.min(...targetOuterPlanes.map(plane => plane.nx * positions[a * 3] + plane.nz * positions[a * 3 + 2] - plane.b)) < .003;
    const check = (a, b) => {
      const key = edgeKey(a, b); if (cuts.has(key)) return;
      const x = (positions[a * 3] + positions[b * 3]) / 2, z = (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2;
      const interpolated = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
      let exactX = x, exactZ = z, exactY = collisionFloor(x, z) + offsetY;
      if (uses.get(key) === 1 && rim(a) && rim(b)) {
        const length = Math.hypot(x, z), dx = x / length, dz = z / length, radius = radiusAt(targetOuterPlanes, dx, dz);
        exactX = dx * radius; exactZ = dz * radius; exactY = C.ramp + offsetY;
      }
      if (Math.hypot(exactX - x, exactY - interpolated, exactZ - z) > .02) { cuts.set(key, positions.length / 3); positions.push(exactX, exactY, exactZ); }
    };
    for (let i = 0; i < index.length; i += 3) { check(index[i], index[i + 1]); check(index[i + 1], index[i + 2]); check(index[i + 2], index[i]); }
    if (!cuts.size) break;
    const next = [];
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [index[i], index[i + 1], index[i + 2]], ab = cuts.get(edgeKey(a, b)), bc = cuts.get(edgeKey(b, c)), ca = cuts.get(edgeKey(c, a));
      const hasAB = ab !== undefined, hasBC = bc !== undefined, hasCA = ca !== undefined;
      if (hasAB && hasBC && hasCA) next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (hasAB && hasBC) next.push(b, bc, ab, a, ab, c, ab, bc, c);
      else if (hasBC && hasCA) next.push(c, ca, bc, ca, a, b, ca, b, bc);
      else if (hasCA && hasAB) next.push(a, ab, ca, ab, b, c, ab, c, ca);
      else if (hasAB) next.push(a, ab, c, ab, b, c);
      else if (hasBC) next.push(b, bc, a, bc, c, a);
      else if (hasCA) next.push(c, ca, b, ca, a, b);
      else next.push(a, b, c);
    }
    geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(next);
  }
  return geometry;
}

const frameDeformations = [];
function fitFrameAtMouth(inputGeometry, team) {
  const mouthZ = (team === 'Blue' ? -1 : 1) * C.halfLength, falloffDistance = .95, positions = [], p = inputGeometry.attributes.position, index = inputGeometry.index;
  function clip(polygon, sign, plane) {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = (a[2] - plane) * sign, db = (b[2] - plane) * sign;
      if (da >= -1e-7) result.push(a);
      if ((da > 1e-7 && db < -1e-7) || (da < -1e-7 && db > 1e-7)) {
        const t = da / (da - db); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, plane]);
      }
    }
    return result;
  }
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [0, 1, 2].map(a => new T.Vector3().fromBufferAttribute(p, index.getX(i + a)).toArray());
    let polygons = [triangle];
    // Cutting the fade boundaries as well as the mouth keeps every triangle
    // outside the band exactly on its original source surface.
    for (const plane of [mouthZ - falloffDistance, mouthZ, mouthZ + falloffDistance]) polygons = polygons.flatMap(polygon => polygon.every(v => Math.abs(v[2] - plane) < 1e-7) ? [polygon] : [clip(polygon, 1, plane), clip(polygon, -1, plane)].filter(p => p.length >= 3));
    for (const polygon of polygons) for (let a = 1; a + 1 < polygon.length; a++) positions.push(...polygon[0], ...polygon[a], ...polygon[a + 1]);
  }
  let geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry = mergeVertices(geometry, 1e-5);
  const checkMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide });
  function measure(probeY = C.goalHeight / 2) {
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, checkMaterial), ray = new T.Raycaster(); mesh.updateMatrixWorld(true);
    const sample = (origin, direction) => {
      ray.set(new T.Vector3(...origin), new T.Vector3(...direction));
      const hit = ray.intersectObject(mesh, false)[0]; return hit?.point;
    };
    const left = sample([0, probeY, mouthZ], [-1, 0, 0]), right = sample([0, probeY, mouthZ], [1, 0, 0]), roof = sample([0, .1, mouthZ], [0, 1, 0]);
    if (!roof) throw new Error('Native frame crossbar could not be measured.');
    // The original interior side panel fills a few sections where the separate
    // frame has no face. That interior is already fitted to C.goalWidth.
    return { left: left?.x ?? -C.goalWidth, right: right?.x ?? C.goalWidth, roof: roof.y, leftFrameHit: Boolean(left), rightFrameHit: Boolean(right) };
  }
  const before = measure(), weight = z => {
    const t = Math.abs(z - mouthZ) / falloffDistance; return t >= 1 ? 0 : (1 + Math.cos(Math.PI * t)) / 2;
  };
  const position = geometry.attributes.position, heightScale = C.goalHeight / before.roof;
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) * (1 + (heightScale - 1) * weight(position.getZ(i))));
  // The supplied frame's side profile changes with height. Fit the entire post
  // section, rather than applying one width scale that would narrow its base.
  const postMinY = .1, postMaxY = C.goalHeight - .12, heights = [postMinY, postMaxY];
  for (let i = 0; i < position.count; i++) if (Math.abs(position.getZ(i) - mouthZ) < .0001 && position.getY(i) > postMinY && position.getY(i) < postMaxY) heights.push(position.getY(i));
  const postProfile = [...new Set(heights.map(y => Math.round(y * 1e6) / 1e6))].sort((a, b) => a - b).map(y => { const section = measure(y); return { y, left: section.left, right: section.right, leftScale: C.goalWidth / Math.abs(section.left), rightScale: C.goalWidth / section.right }; });
  function scaleAtHeight(y, side) {
    const clampedY = T.MathUtils.clamp(y, postProfile[0].y, postProfile.at(-1).y);
    let i = 1; while (i < postProfile.length - 1 && clampedY > postProfile[i].y) i++;
    const a = postProfile[i - 1], b = postProfile[i], t = (clampedY - a.y) / (b.y - a.y);
    const originalInner = a[side] + (b[side] - a[side]) * t;
    return C.goalWidth / Math.abs(originalInner);
  }
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), scale = scaleAtHeight(position.getY(i), x < 0 ? 'left' : 'right');
    position.setX(i, x * (1 + (scale - 1) * weight(position.getZ(i))));
  }
  const after = measure(); checkMaterial.dispose();
  frameDeformations.push({ team, mouthPlane: mouthZ, before, after, heightScale, postFittingRange: [postMinY, postMaxY], postProfile, falloffDistance, weight: '(1 + cos(pi * abs(z-mouthPlane)/0.95))/2 inside the 0.95 m band, 0 beyond it', addedTriangles: geometry.index.count / 3 - inputGeometry.index.count / 3, method: 'Split native frame triangles at the mouth and both fade-boundary planes, scale Y about the original floor, then fit the measured left/right aperture profile at every native cross-section height. Bottom 0.1 m and top 0.12 m retain rounded corners. Cosine weights at vertices leave every original frame triangle outside the 0.95 m band unchanged.' });
  return geometry;
}

const doc = {
  asset: { version: '2.0', generator: 'Boost Circuit source-geometry inner-arena importer', copyright: 'Champions Field by Prabhu Ram / virtualmakes, CC BY 4.0; adapted for Boost Circuit', extras: source.asset.extras },
  extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
  scene: 0, scenes: [{ name: 'Champions Inner Field', nodes: [0] }],
  nodes: [{ name: 'Champions_Inner', children: [], extras: { sourceModel: '6ea5ee0502ae432fbac3a4f8aaab61a5', playingSurface: 'Supplied source geometry, calibrated to existing constants', includesBoostPads: false, includesDome: false } }],
  meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [],
};
const materials = new Map();
const linear = hex => new T.Color(hex).toArray();
function materialFor(part, team) {
  const name = 'Champions_Inner_' + part.role.replaceAll('-', '_') + (team ? '_' + team : '');
  if (materials.has(name)) return materials.get(name);
  const blue = team === 'Blue';
  const colors = { turf: '#367044', 'ramp-trim': '#263c4b', 'perimeter-trim': blue ? '#3e9deb' : '#e59b4d', 'goal-frame': blue ? '#398fe1' : '#ec9a49', 'goal-interior': blue ? '#245584' : '#8e5834', 'goal-floor': blue ? '#1e4a6b' : '#785036', 'goal-back-insert': blue ? '#65badc' : '#dfb16c', 'goal-back-structure': '#243a47' };
  const original = source.materials.find(m => m.name === part.object.material.name);
  const mat = sourceColors ? structuredClone(original) : { doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...linear(colors[part.role]), 1], metallicFactor: ['goal-frame', 'goal-back-insert'].includes(part.role) ? .28 : 0, roughnessFactor: part.role === 'turf' ? .98 : .67 } };
  mat.name = name;
  mat.extras = { sourceMaterial: part.object.material.name, sourceBaseColor: original.pbrMetallicRoughness.baseColorFactor };
  if (!sourceColors && ['goal-frame', 'perimeter-trim'].includes(part.role)) mat.emissiveFactor = linear(colors[part.role]).map(v => v * .18);
  materials.set(name, doc.materials.length); doc.materials.push(mat);
  return doc.materials.length - 1;
}
const chunks = []; let offset = 0;
function view(array, target, stride) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength), index = doc.bufferViews.length;
  doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target, ...(stride ? { byteStride: stride } : {}) });
  chunks.push(bytes); offset += bytes.length;
  const pad = (4 - offset % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  return index;
}
function accessor(array, type, componentType, normalized = false, min, max) {
  const itemSize = type === 'SCALAR' ? 1 : 3, count = array.length / itemSize;
  let bytes = array;
  if (itemSize === 3) { bytes = new array.constructor(count * 4); for (let i = 0; i < count; i++) bytes.set(array.subarray(i * 3, i * 3 + 3), i * 4); }
  const index = doc.accessors.length;
  doc.accessors.push({ bufferView: view(bytes, type === 'SCALAR' ? 34963 : 34962, itemSize === 3 ? 8 : undefined), componentType, count, type, ...(normalized ? { normalized: true } : {}), ...(min ? { min, max } : {}) });
  return index;
}
let triangles = 0, vertices = 0, removedOverheadTriangles = 0, addedSurfaceTriangles = 0;
const meshReport = [];
for (const part of meshes) {
  const originalPositions = part.geometry.attributes.position, originalIndex = part.geometry.index;
  const batches = new Map();
  for (let i = 0; i < originalIndex.count; i += 3) {
    const ids = [originalIndex.getX(i), originalIndex.getX(i + 1), originalIndex.getX(i + 2)];
    const averageY = ids.reduce((sum, id) => sum + originalPositions.getY(id), 0) / 3;
    if (part.role === 'perimeter-trim' && averageY > .9) { removedOverheadTriangles++; continue; }
    const center = ids.reduce((sum, id) => sum + originalPositions.getX(id) - longCenter, 0) / 3;
    const team = part.role === 'turf' ? '' : center < 0 ? 'Blue' : 'Orange';
    if (!batches.has(team)) batches.set(team, { positions: [], sourceIndices: [] });
    const batch = batches.get(team);
    for (const id of ids) { batch.positions.push(...mapPoint(originalPositions.getX(id), originalPositions.getY(id), originalPositions.getZ(id), part.role)); batch.sourceIndices.push(id); }
  }
  for (const [team, batch] of batches) {
    let geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(batch.positions, 3));
    // Weld before normals so smooth source ramp/goal profiles remain smooth.
    geometry = mergeVertices(geometry, 1e-5);
    if (part.role === 'goal-frame') geometry = fitFrameAtMouth(geometry, team);
    if (['turf', 'ramp-trim', 'perimeter-trim'].includes(part.role)) {
      const count = geometry.index.count / 3;
      geometry = refineSurface(geometry, part.role === 'turf' ? 0 : .012);
      addedSurfaceTriangles += geometry.index.count / 3 - count;
    }
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox, size = max.clone().sub(min);
    for (const axis of ['x', 'y', 'z']) size[axis] = Math.max(size[axis], .001);
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    if (p.count > 65535) throw new Error('Unexpectedly large inner-arena batch.');
    const quantized = new Uint16Array(p.count * 3), normals = new Int16Array(p.count * 3), normal = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      for (let a = 0; a < 3; a++) { const axis = ['x', 'y', 'z'][a]; quantized[i * 3 + a] = Math.round(T.MathUtils.clamp((p.array[i * 3 + a] - min[axis]) / size[axis], 0, 1) * 65535); }
      // Preserve which side of the solver's goal-shoulder branch a vertex lies
      // on. Nearest rounding alone can move it across that discontinuity.
      if (['turf', 'ramp-trim', 'perimeter-trim'].includes(part.role) && Math.abs(p.getZ(i)) > C.halfLength - C.ramp) {
        const threshold = C.goalWidth + .2, x = p.getX(i), decodedX = min.x + quantized[i * 3] / 65535 * size.x;
        if ((Math.abs(x) < threshold) !== (Math.abs(decodedX) < threshold)) quantized[i * 3] += Math.abs(x) < threshold ? -Math.sign(x) : Math.sign(x);
      }
      normal.fromBufferAttribute(n, i).multiply(size).normalize(); normals.set(normal.toArray().map(v => Math.round(v * 32767)), i * 3);
    }
    const index = doc.meshes.length, name = 'Champions_Inner_' + part.role.replaceAll('-', '_') + (team ? '_' + team : '');
    doc.meshes.push({ name, primitives: [{ attributes: { POSITION: accessor(quantized, 'VEC3', 5123, true, [0, 0, 0], [65535, 65535, 65535]), NORMAL: accessor(normals, 'VEC3', 5122, true) }, indices: accessor(new Uint16Array(geometry.index.array), 'SCALAR', 5123), material: materialFor(part, team) }] });
    doc.nodes[0].children.push(doc.nodes.length);
    doc.nodes.push({ name, mesh: index, translation: min.toArray(), scale: size.toArray(), extras: { role: part.role, team, sourceMesh: part.name, sourceGeometry: true, detail: 'inner-field' } });
    triangles += geometry.index.count / 3; vertices += p.count;
    meshReport.push({ name, sourceMesh: part.name, role: part.role, team, triangles: geometry.index.count / 3, vertices: p.count, sourceBounds: { min: part.bounds.min.toArray(), max: part.bounds.max.toArray() }, bounds: { min: min.toArray(), max: max.toArray() } });
  }
}
const landmarks = { Inner_Pitch_Center: [0, 0, 0], Inner_Side_Left: [-C.halfWidth, C.ramp, 0], Inner_Side_Right: [C.halfWidth, C.ramp, 0] };
for (const [team, sign] of [['Blue', -1], ['Orange', 1]]) {
  landmarks['Inner_Goal_' + team + '_Mouth'] = [0, 0, sign * C.halfLength];
  landmarks['Inner_Goal_' + team + '_Top'] = [0, C.goalHeight, sign * C.halfLength];
  landmarks['Inner_Goal_' + team + '_Back'] = [0, 0, sign * (C.halfLength + C.goalDepth)];
}
for (const [name, position] of Object.entries(landmarks)) { doc.nodes[0].children.push(doc.nodes.length); doc.nodes.push({ name, translation: position, extras: { calibrationReference: true } }); }
doc.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(doc)), jsonLength = Math.ceil(json.length / 4) * 4, head = Buffer.alloc(20);
head.write('glTF'); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + jsonLength + offset, 8); head.writeUInt32LE(jsonLength, 12); head.writeUInt32LE(0x4e4f534a, 16);
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(offset); binHead.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([head, json, Buffer.alloc(jsonLength - json.length, 32), binHead, ...chunks]);
fs.writeFileSync(new URL('champions-inner.glb', output), result);

// Reload through the actual runtime GLTFLoader: the following measurements are
// from decoded mesh geometry, not the named calibration-reference nodes.
const loaded = await new Promise((resolve, reject) => new GLTFLoader().parse(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength), '', resolve, reject));
loaded.scene.updateMatrixWorld(true);
const bounds = new T.Box3().setFromObject(loaded.scene.getObjectByName('Champions_Inner_turf'));
let floorMaxError = 0, floorSamples = 0;
const loadedTurf = loaded.scene.getObjectByName('Champions_Inner_turf');
const loadedSurfaces = [], goalObjects = [], goalGeometry = [];
loaded.scene.traverse(object => {
  if (object.isMesh && ['turf', 'ramp-trim', 'perimeter-trim'].includes(object.userData.role)) loadedSurfaces.push(object);
  if (object.isMesh && object.userData.role.startsWith('goal-')) goalObjects.push(object);
  if (object.isMesh && object.userData.role === 'goal-interior') {
    const box = new T.Box3().setFromObject(object);
    goalGeometry.push({ name: object.name, actualBounds: { min: box.min.toArray(), max: box.max.toArray() }, actualHalfWidth: Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), expectedHalfWidth: C.goalWidth, actualRoofHeight: box.max.y, expectedRoofHeight: C.goalHeight });
  }
});
const decoded = loadedTurf.geometry.attributes.position, world = new T.Vector3();
for (let i = 0; i < decoded.count; i++) {
  world.fromBufferAttribute(decoded, i).applyMatrix4(loadedTurf.matrixWorld);
  // Mesh vertices outside the playable outline are limited to quantization error.
  if (Math.min(...arenaPlanes(new T.Vector3(world.x, 0, world.z)).map(p => p.d)) < .003) continue;
  floorMaxError = Math.max(floorMaxError, Math.abs(world.y - collisionFloor(world.x, world.z))); floorSamples++;
}
const raycaster = new T.Raycaster();
const mouthAperture = [];
for (const [team, sign] of [['Blue', -1], ['Orange', 1]]) {
  const z = sign * C.halfLength, directions = [];
  for (const y of [.25, .5, 1, 2, 3, C.goalHeight / 2, 4, 5, 6]) {
    directions.push({ role: 'left-post', origin: [0, y, z], direction: [-1, 0, 0], expected: -C.goalWidth, axis: 'x' }, { role: 'right-post', origin: [0, y, z], direction: [1, 0, 0], expected: C.goalWidth, axis: 'x' });
  }
  for (const x of [-8, -4, 0, 4, 8]) directions.push({ role: 'crossbar', origin: [x, .1, z], direction: [0, 1, 0], expected: C.goalHeight, axis: 'y' });
  for (const probe of directions) {
    raycaster.set(new T.Vector3(...probe.origin), new T.Vector3(...probe.direction));
    const hit = raycaster.intersectObjects(goalObjects, false)[0];
    if (!hit) throw new Error('Missing native goal frame at scoring-mouth cross-section.');
    mouthAperture.push({ team, role: probe.role, origin: probe.origin, actualPoint: hit.point.toArray(), expectedCoordinate: probe.expected, axis: probe.axis, absoluteDifference: Math.abs(hit.point[probe.axis] - probe.expected), mesh: hit.object.name });
  }
}
const probes = [];
for (const point of [[0, 0], [0, 45], [0, -45], [35, 0], [-35, 0], [39, 0], [-39, 0], [39.5, 0], [40, 0], [40.5, 0], [40.85, 0], [30, 45], [-30, -45], [33, 47], [37, 42]]) {
  raycaster.set(new T.Vector3(point[0], 30, point[1]), new T.Vector3(0, -1, 0));
  const hit = raycaster.intersectObjects(loadedSurfaces, false)[0];
  if (!hit) throw new Error('Decoded source field surface is missing at ' + point.join(','));
  const trimOffset = hit.object.userData.role === 'turf' ? 0 : .012;
  probes.push({ x: point[0], z: point[1], mesh: hit.object.name, actualHeight: hit.point.y, solverHeight: collisionFloor(...point), intentionalTrimOffset: trimOffset, error: Math.abs(hit.point.y - trimOffset - collisionFloor(...point)) });
}
const boundaryCheck = { hitSamples: 0, missingSamples: [], maxHeightError: 0, worstSample: null, distancesFromWall: [.05, .1, .25, .5, 1, 1.5, 2, 2.5, 3] };
const outline = arenaOutline();
for (let i = 0; i < outline.length; i++) {
  const a = new T.Vector2(...outline[i]), b = new T.Vector2(...outline[(i + 1) % outline.length]), midpoint = a.clone().add(b).multiplyScalar(.5), edge = b.clone().sub(a);
  if (edge.length() < 1e-6) continue;
  const normal = new T.Vector2(-edge.y, edge.x).normalize(); if (normal.dot(midpoint) > 0) normal.negate();
  for (const distance of boundaryCheck.distancesFromWall) {
    const point = midpoint.clone().addScaledVector(normal, distance);
    if (Math.abs(point.y) > C.halfLength - C.ramp && Math.abs(point.x) < C.goalWidth + 1) continue;
    raycaster.set(new T.Vector3(point.x, 30, point.y), new T.Vector3(0, -1, 0));
    const hit = raycaster.intersectObjects(loadedSurfaces, false)[0];
    if (!hit) { boundaryCheck.missingSamples.push({ x: point.x, z: point.y, distanceFromWall: distance }); continue; }
    boundaryCheck.hitSamples++;
    const trimOffset = hit.object.userData.role === 'turf' ? 0 : .012, error = Math.abs(hit.point.y - trimOffset - collisionFloor(point.x, point.y));
    if (error > boundaryCheck.maxHeightError) { boundaryCheck.maxHeightError = error; boundaryCheck.worstSample = { x: point.x, z: point.y, actualHeight: hit.point.y, solverHeight: collisionFloor(point.x, point.y), trimOffset, mesh: hit.object.name }; }
  }
}
if (boundaryCheck.missingSamples.length) throw new Error('Native source field has gaps at calibrated boundary probes.');
if (boundaryCheck.maxHeightError > .035 || floorMaxError > .025) throw new Error('Decoded field surface exceeds calibration tolerance.');
if (goalGeometry.some(g => Math.abs(g.actualHalfWidth - g.expectedHalfWidth) > .005 || Math.abs(g.actualRoofHeight - g.expectedRoofHeight) > .001)) throw new Error('Decoded native goal dimensions exceed calibration tolerance.');
if (mouthAperture.some(p => p.absoluteDifference > .005)) throw new Error('Decoded visual goal aperture exceeds calibration tolerance.');
const report = {
  source: { model: source.asset.extras, sha256: crypto.createHash('sha256').update(raw).digest('hex'), bytes: raw.length },
  attribution: 'Champions Field by Prabhu Ram / virtualmakes, CC BY 4.0; adapted geometry calibration, materials, cage/roof removal, compression.',
  output: { file: 'champions-inner.glb', bytes: result.length, sha256: crypto.createHash('sha256').update(result).digest('hex'), meshes: doc.meshes.length, triangles, vertices, addedSurfaceTriangles, addedMouthPlaneTriangles: frameDeformations.reduce((sum, f) => sum + f.addedTriangles, 0), materialMode: sourceColors ? 'literal source colors' : 'game turf and team colors', decoder: 'none; standard GLTFLoader plus KHR_mesh_quantization' },
  retainedSourceMeshes: Object.keys(roles),
  removed: { sourceCageMeshes: ['polySurface3346_playOuter1_0', 'polySurface3346_playouter_glow1_0'], dome: 'polySurface3408_play_Glassdome1_0', overheadPerimeterTrimTriangles: removedOverheadTriangles, sourceBoostPads: 0 },
  nativeCoordinates: { longAxis: 'source +X -> game +Z (orange)', crossAxis: 'source +Z -> game -X', longCenter, crossCenter, floor: sourceFloor, flatLong, flatCross, wallLong, wallCross, goalHalfWidth, goalTop, goalBack, rampCrest, ceiling: domeBounds.max.y },
  calibration: { longMap, crossMap, heightMap, nativeFlatHullAfterAxisMap: sourceFlatHull, nativeOuterHullAfterAxisMap: sourceOuterHull, cornerWarp: 'Monotonic radial mapping between native floor/rim convex hulls and existing arenaOutline / 2.56 m inward offset; source mesh retained.', turfHeight: 'Native turf vertices projected to existing floor / quarter-circle ramp surface; conforming source-triangle subdivisions added when edge interpolation error exceeds 0.02 m (up to six passes).', goalFloor: 'Original goal-floor triangles flattened to solver y=0.', trimHeight: 'Native floor/ramp trim vertices projected to solver surface plus 0.012 m.', goalFrameMouth: frameDeformations },
  decodedGeometryChecks: { turfBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, turfVertexSamples: floorSamples, maxTurfVertexHeightError: floorMaxError, surfaceRayProbes: probes, boundaryRayCheck: boundaryCheck, goalInteriorGeometry: goalGeometry, mouthPlaneAperture: mouthAperture },
  landmarks, meshes: meshReport,
  limitations: [
    'The supplied model has no center circle, halfway line, penalty-box texture, nets, or boost-pad meshes. Native blue perimeter/ramp trim is preserved and team-colored; no extra pads or replacement goal primitives are included.',
    'The native frame is fitted at the actual scoring-mouth plane to C.goalWidth/C.goalHeight using native triangle splits and a small deformation within 0.95 m of the mouth. Its flare farther behind, rounded corner silhouette and curved rear insert are retained. It is visual geometry, not an additional collider.',
    'The back-plane anchor maps the farthest native goal-back vertex to existing goal depth, but the curved interior may lie in front of that rectangular solver plane.',
    'No dome, exterior cage, or upper perimeter beam is included. Existing transparent wall/ceiling rendering can be retained independently if desired.',
    'Floor calibration is exact at decoded vertices within quantization tolerance. Native triangles approximate curved collision surfaces between vertices; ray-probe errors report that interpolation gap.',
  ],
};
fs.writeFileSync(new URL('champions-inner-import.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report.output, checks: { boundarySamples: boundaryCheck.hitSamples, missingBoundarySamples: boundaryCheck.missingSamples.length, maxBoundaryHeightError: boundaryCheck.maxHeightError, maxTurfVertexHeightError: floorMaxError, mouthApertureSamples: mouthAperture.length, maxMouthApertureError: Math.max(...mouthAperture.map(p => p.absoluteDifference)) } }, null, 2));
