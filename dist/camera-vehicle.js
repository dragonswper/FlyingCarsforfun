import {Box3, Matrix4, Quaternion, Ray, Vector3} from './vendor/three.module.js';
import {C, clamp} from './constants.js';

// Measured once from the chosen visual model, rather than the much smaller
// shared physics hitbox. No triangle raycasts or scene traversals per frame.
export class VehicleCameraGuard {
  constructor(model, decoration = null) {
    this.bounds = new Box3(); this.materials = [];
    this.eye = new Vector3(); this.target = new Vector3(); this.hit = new Vector3();
    this.inverseRotation = new Quaternion(); this.ray = new Ray(); this.opacity = 1;
    const box = new Box3(), transform = new Matrix4(), inverse = new Matrix4(), seen = new Set();
    model.root.updateMatrixWorld(true); inverse.copy(model.root.matrixWorld).invert();
    const visit = (node, measure = true) => {
      measure = measure && node !== model.flame && node !== decoration;
      if (node.isMesh) {
        if (measure) {
          // SkinnedMesh bounds include the initial animated pose.
          if (node.isSkinnedMesh) { node.computeBoundingBox(); box.copy(node.boundingBox); }
          else { if (!node.geometry.boundingBox) node.geometry.computeBoundingBox(); box.copy(node.geometry.boundingBox); }
          transform.multiplyMatrices(inverse, node.matrixWorld);
          this.bounds.union(box.applyMatrix4(transform));
        }
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (!material || seen.has(material)) continue;
          seen.add(material); this.materials.push({material, opacity:material.opacity,
            transparent:material.transparent, depthWrite:material.depthWrite});
        }
      }
      // Effects still fade with the car, but cannot enlarge its clearance.
      for (const child of node.children) visit(child, measure);
    };
    visit(model.root);
    if (this.bounds.isEmpty()) this.bounds.set(new Vector3(-.6,-.2,-1),new Vector3(.6,.7,1));
    // Account for suspension movement and a .22 m camera/near-plane sphere.
    this.bounds.expandByScalar(.06);
    this.radius = Math.hypot(Math.max(Math.abs(this.bounds.min.x),Math.abs(this.bounds.max.x)),
      Math.max(Math.abs(this.bounds.min.y),Math.abs(this.bounds.max.y)),
      Math.max(Math.abs(this.bounds.min.z),Math.abs(this.bounds.max.z))) + .22;
    this.nearBounds = this.bounds.clone().expandByScalar(.18);
  }
  setOpacity(value) {
    if (Math.abs(value - this.opacity) < 1e-6) return;
    this.opacity = value;
    const faded = value < .999;
    for (const entry of this.materials) {
      const material = entry.material, transparent = entry.transparent || faded;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = entry.opacity * value;
      material.depthWrite = entry.depthWrite && !faded;
    }
  }
  restore() { this.setOpacity(1); }
  update(eye, ball, position, rotation, ballCam, dt) {
    this.inverseRotation.copy(rotation).invert();
    this.eye.copy(eye).sub(position).applyQuaternion(this.inverseRotation);
    this.target.copy(ball).sub(position).applyQuaternion(this.inverseRotation);
    let goal = 1;
    if (this.nearBounds.containsPoint(this.eye)) goal = 0;
    else if (ballCam && this.target.length() < this.radius + C.ballRadius + 1) {
      this.ray.origin.copy(this.eye); this.ray.direction.copy(this.target).sub(this.eye).normalize();
      const hit = this.ray.intersectBox(this.bounds, this.hit);
      if (hit && this.eye.distanceToSquared(hit) < this.eye.distanceToSquared(this.target)) goal = .18;
    }
    // Hide immediately if the eye is trapped inside; otherwise ease the local
    // visual out/in. Physical collisions and other players' cars are untouched.
    let opacity = goal === 0 || dt <= 0 ? goal : this.opacity +
      (goal - this.opacity) * (1 - Math.exp(-(goal < this.opacity ? 35 : 12) * clamp(dt,0,.1)));
    if (Math.abs(opacity - goal) < .001) opacity = goal;
    this.setOpacity(opacity);
    return this.opacity;
  }
}
