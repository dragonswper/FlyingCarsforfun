import {Group, Matrix4, Quaternion, Vector3} from './vendor/three.module.js';
import {C, CORNER_PLANES, clamp} from './constants.js';

// Novelty aircraft keep the common, networked car hitbox. Their much wider
// artwork needs separate clearance so wings do not disappear into the pitch.
// Sample the real geometry once; a box would invent low corners under the wings.
const hullCache = new WeakMap();
function sampleHull(model) {
  const key = model.visual.getObjectByProperty('isMesh', true).geometry;
  if (hullCache.has(key)) return hullCache.get(key);
  const vertices = [], point = new Vector3(), matrix = new Matrix4();
  model.root.updateMatrixWorld(true);
  const inverse = model.root.matrixWorld.clone().invert();
  model.visual.traverse(node => {
    if (!node.isMesh) return;
    let chassis = false;
    for (let parent = node; parent; parent = parent.parent) if (parent === model.chassis) chassis = true;
    matrix.multiplyMatrices(inverse, node.matrixWorld);
    const attribute = node.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
      point.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
      vertices.push({x:point.x, y:point.y, z:point.z, chassis});
    }
  });
  const selected = new Map();
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== 2) continue;
    let best = -Infinity, vertex;
    for (const p of vertices) {
      const score = p.x*x + p.y*y + p.z*z;
      if (score > best) { best = score; vertex = p; }
    }
    selected.set(`${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`, vertex);
  }
  const hull = [...selected.values()];
  hullCache.set(key, hull);
  return hull;
}

// Allocation-free point query using the same dimensions, corner planes and
// quarter-pipe equations as arena.js, including goal interiors and roof ramps.
export class ArenaPointClearance {
  constructor() { this.normal = new Vector3(); this.gap = Infinity; }
  plane(p, nx, nz, d, goal, ceiling) {
    const lower = goal ? C.goalRamp : C.ramp, upper = goal ? C.goalRamp : C.ceilingRamp;
    let gap = d, ny = 0;
    if (d < lower && p.y < lower && (goal || Math.abs(p.z) < C.halfLength + .1)) {
      const horizontal = lower - d, vertical = lower - p.y, length = Math.hypot(horizontal, vertical);
      gap = lower - length; nx *= horizontal / length; nz *= horizontal / length; ny = vertical / length;
    } else if (d < upper && p.y > ceiling - upper) {
      const horizontal = upper - d, vertical = p.y - (ceiling - upper), length = Math.hypot(horizontal, vertical);
      gap = upper - length; nx *= horizontal / length; nz *= horizontal / length; ny = -vertical / length;
    }
    if (gap < this.gap) { this.gap = gap; this.normal.set(nx, ny, nz); }
  }
  sample(p) {
    const x = Math.abs(p.x), z = Math.abs(p.z), sx = Math.sign(p.x || 1), sz = Math.sign(p.z || 1);
    const ceiling = z > C.halfLength + .15 && x < C.goalWidth + .2 ? C.goalHeight : C.height;
    this.gap = p.y; this.normal.set(0, 1, 0);
    if (ceiling - p.y < this.gap) { this.gap = ceiling - p.y; this.normal.set(0, -1, 0); }
    this.plane(p, -sx, 0, C.halfWidth - x, false, ceiling);
    const opening = x < C.goalWidth + .2 && p.y < C.goalHeight + .2;
    if (!opening) this.plane(p, 0, -sz, C.halfLength - z, false, ceiling);
    else if (z > C.halfLength) {
      this.plane(p, -sx, 0, C.goalWidth - x, true, ceiling);
      this.plane(p, 0, -sz, C.halfLength + C.goalDepth - z, true, ceiling);
    }
    if (x > C.cornerX && z > C.cornerZ) for (const plane of CORNER_PLANES) {
      const d = plane.nx*x + plane.nz*z - plane.boundary;
      if (d < C.ramp + 2) this.plane(p, plane.nx*sx, plane.nz*sz, d, false, ceiling);
    }
    return this.gap;
  }
}

export class VehicleSurfaceGuard {
  constructor(model) {
    this.model = model; this.hull = sampleHull(model);
    this.appearance = new Group(); this.appearance.name = 'Aircraft_Surface_Clearance';
    this.appearance.add(model.visual, model.flame); model.root.add(this.appearance);
    model.visualOffset = this.appearance.position;
    this.offset = new Vector3(); this.point = new Vector3(); this.deepest = new Vector3();
    this.inverse = new Quaternion(); this.surface = new ArenaPointClearance();
  }
  update(dt, enabled = true) {
    const {model, offset, point, surface} = this;
    if (!enabled) { offset.set(0, 0, 0); this.appearance.position.set(0, 0, 0); return; }
    // Retain clearance briefly on leaving a ramp, then ease back to the car.
    // Penetration corrections themselves are immediate, even on a replay seek.
    offset.multiplyScalar(Math.exp(-12 * clamp(dt, 0, .1)));
    for (let iteration = 0; iteration < 8; iteration++) {
      let gap = -.012; // Ignore tiny mesh/suspension tolerances on a flat floor.
      for (const p of this.hull) {
        point.set(p.x, p.y, p.z);
        if (p.chassis && model.chassis) {
          point.y += C.carHeight;
          point.applyQuaternion(model.chassis.quaternion).add(model.chassis.position);
          point.y -= C.carHeight;
        }
        point.applyQuaternion(model.root.quaternion).add(model.root.position).add(offset);
        if (surface.sample(point) < gap) { gap = surface.gap; this.deepest.copy(surface.normal); }
      }
      if (gap >= -.012) break;
      offset.addScaledVector(this.deepest, -gap + .018);
    }
    // Only the artwork moves. Never mutate simulation poses or snapshots.
    offset.clampLength(0, 1.25);
    this.inverse.copy(model.root.quaternion).invert();
    this.appearance.position.copy(offset).applyQuaternion(this.inverse);
  }
}
