import {Vector3} from '../vendor/three.module.js';
import {carSupport} from '../arena.js';
const normal = new Vector3(),
  up = new Vector3(0, 1, 0);
// Axis-aligned hurdles use the actual car support extent, rather than the
// decorative vehicle mesh. Grounded boxes never eject a car through the floor.
export function collideCourseBox(car, box) {
  const d = [car.p.x - box.x, car.p.y - box.y, car.p.z - box.z],
    half = [box.w / 2, box.h / 2, box.d / 2],
    overlap = [];
  for (let axis = 0; axis < 3; axis++) {
    normal.set(0, 0, 0).setComponent(axis, Math.sign(d[axis]) || 1);
    const depth = half[axis] + carSupport(car, normal) - Math.abs(d[axis]);
    if (depth <= 0) return false;
    overlap.push(depth);
  }
  let axis = 0;
  for (let i = 1; i < 3; i++)
    if (!(i === 1 && d[1] < 0) && overlap[i] < overlap[axis]) axis = i;
  normal.set(0, 0, 0).setComponent(axis, Math.sign(d[axis]) || 1);
  car.p.addScaledVector(normal, overlap[axis] + 0.00001);
  const speed = car.v.dot(normal);
  if (speed < 0) car.v.addScaledVector(normal, -speed);
  if (normal.y > 0.5 && up.clone().applyQuaternion(car.q).dot(normal) > 0.55) {
    car.grounded = true;
    car.normal.copy(normal);
    car.hasJumped = car.jumpActive = car.canDouble = false;
    car.airTime = car.recoverTime = 0;
  }
  return true;
}
