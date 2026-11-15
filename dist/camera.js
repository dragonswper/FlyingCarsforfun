import {Vector3} from './vendor/three.module.js';
import {C, clamp, CORNER_PLANES, clampToPitch} from './constants.js';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const turn = (from, to, limit) => from + clamp(wrap(to - from), -limit, limit);
const blend = (rate, dt) => 1 - Math.exp(-rate * dt);
const smoothstep = t => t * t * (3 - 2 * t);
const skin = 0.22;
const sweepPoint = new Vector3(), safeAnchor = new Vector3();
const requestedArm = new Vector3(), clearanceArm = new Vector3(), candidateArm = new Vector3(),
  candidate = new Vector3(), candidateOut = new Vector3(), bestArm = new Vector3();

// Interpolate the orbit, not a chord through the car. Opposite camera modes
// must keep their distance even halfway through a transition.
function orbitArm(from, to, t, out) {
  const a = from.length(), b = to.length(), radius = a + (b - a) * t,
    yaw = Math.atan2(from.x, from.z), endYaw = Math.atan2(to.x, to.z),
    bearing = yaw + wrap(endYaw - yaw) * t,
    elevation = Math.atan2(from.y, Math.hypot(from.x, from.z)) * (1 - t) +
      Math.atan2(to.y, Math.hypot(to.x, to.z)) * t;
  return out.set(Math.sin(bearing) * Math.cos(elevation), Math.sin(elevation),
    Math.cos(bearing) * Math.cos(elevation)).multiplyScalar(radius);
}

// A small analytic camera volume, independent of the stadium's render meshes.
// This includes the pitch ramps/corners, the goal portal, net roof and posts.
export function cameraInsideArena(p, radius = skin) {
  const x = Math.abs(p.x), z = Math.abs(p.z), y = p.y;
  const opening = x < C.goalWidth - radius && y < C.goalHeight - radius;
  if (x > C.halfWidth - radius || y < radius || y > C.height - radius) return false;
  if (z > C.halfLength - radius && !opening) return false;
  if (z > C.halfLength && (z > C.halfLength + C.goalDepth - radius ||
      x > C.goalWidth - radius || y > C.goalHeight - radius)) return false;
  let gap = C.halfWidth - x;
  if (!opening) gap = Math.min(gap, C.halfLength - z);
  if (x > C.cornerX && z > C.cornerZ && z <= C.halfLength) {
    for (const plane of CORNER_PLANES) {
      const d = plane.nx * x + plane.nz * z - plane.boundary;
      if (d < radius) return false;
      gap = Math.min(gap, d);
    }
  }
  if (z < C.halfLength && gap < C.ramp && y < C.ramp &&
      Math.hypot(C.ramp - gap, C.ramp - y) > C.ramp - radius) return false;
  if (Math.abs(z - C.halfLength) < radius + 0.12) {
    const r2 = (radius + 0.12) ** 2, dz = z - C.halfLength;
    if ((x - C.goalWidth) ** 2 + dz * dz +
        (y - clamp(y, 0, C.goalHeight)) ** 2 < r2) return false;
    if ((y - C.goalHeight) ** 2 + dz * dz +
        (x - clamp(x, 0, C.goalWidth)) ** 2 < r2) return false;
  }
  return true;
}

export function constrainCamera(anchor, desired, out) {
  safeAnchor.copy(anchor);
  safeAnchor.y = clamp(safeAnchor.y + 0.35, skin, C.height - skin);
  if (!cameraInsideArena(safeAnchor)) {
    // A car's origin can rest lower than a camera sphere on a ramp/roof.
    // Use a safe nearby pivot without changing the car or its collision state.
    // Include the post/crossbar radius as well as the camera sphere.
    clampToPitch(safeAnchor, skin + 0.15);
    safeAnchor.y = clamp(Math.max(safeAnchor.y, C.ramp + skin), skin, C.height - skin);
  }
  let free = 0;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    sweepPoint.lerpVectors(safeAnchor, desired, t);
    if (cameraInsideArena(sweepPoint)) { free = t; continue; }
    let blocked = t;
    for (let n = 0; n < 10; n++) {
      const mid = (free + blocked) / 2;
      sweepPoint.lerpVectors(safeAnchor, desired, mid);
      if (cameraInsideArena(sweepPoint)) free = mid; else blocked = mid;
    }
    return out.lerpVectors(safeAnchor, desired, free);
  }
  return out.copy(desired);
}

// Arena retraction can otherwise push the eye back inside the player's mesh.
// When an arm is blocked, slide around the vehicle's clearance sphere to a
// nearby available view. The arena remains the final constraint if a vehicle
// is in an impossible pose; the rendering guard then hides obstructing parts.
function constrainVehicleCamera(anchor, desired, out, radius) {
  requestedArm.copy(desired).sub(anchor);
  if (requestedArm.length() < radius) {
    if (requestedArm.lengthSq() < 1e-8) requestedArm.set(0, 1, -1);
    requestedArm.setLength(radius);
    desired.copy(anchor).add(requestedArm);
  }
  constrainCamera(anchor, desired, out);
  if (radius <= 0 || out.distanceToSquared(anchor) >= radius * radius - 1e-8) return out;
  requestedArm.setLength(radius);
  let score = Infinity;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    candidateArm.set(x, y, z).setLength(radius);
    candidate.copy(anchor).add(candidateArm);
    if (!cameraInsideArena(candidate)) continue;
    constrainCamera(anchor, candidate, candidateOut);
    if (candidateOut.distanceToSquared(anchor) < radius * radius - 1e-8) continue;
    const cost = candidateArm.distanceToSquared(requestedArm);
    if (cost < score) { score = cost; bestArm.copy(candidateArm); }
  }
  if (!Number.isFinite(score)) return out;
  // Refine the selected direction to the obstruction boundary, avoiding the
  // visible angular steps of a discrete set of fallback views.
  let blocked = 0, free = 1;
  clearanceArm.copy(bestArm);
  for (let i = 0; i < 12; i++) {
    const mid = (blocked + free) / 2;
    orbitArm(requestedArm, bestArm, mid, candidateArm);
    candidate.copy(anchor).add(candidateArm);
    constrainCamera(anchor, candidate, candidateOut);
    if (cameraInsideArena(candidate) && candidateOut.distanceToSquared(anchor) >= radius * radius - 1e-8) {
      free = mid; clearanceArm.copy(candidateArm);
    } else blocked = mid;
  }
  return out.copy(anchor).add(clearanceArm);
}

// The logical targets (desired/target) are separate from the displayed rig
// (position/look). Input return, following and mode transitions have independent
// controls. All driving poses supplied here are already render-interpolated.
export class ChaseCamera {
  constructor() {
    this.desired = new Vector3(); this.target = new Vector3();
    this.position = new Vector3(); this.look = new Vector3();
    this.forward = new Vector3(); this.arm = new Vector3();
    this.goalArm = new Vector3(); this.fromArm = new Vector3();
    this.direction = new Vector3();
    this.reset();
  }
  reset() {
    this.ballYaw = 0; this.carYaw = 0; this.orbitYaw = 0; this.orbitPitch = 0;
    this.stickYaw = 0; this.stickPitch = 0; this.stickTargetYaw = 0; this.stickTargetPitch = 0;
    this.lookX = 0; this.lookY = 0; this.mouseHeld = false;
    this.freeYaw = 0; this.freePitch = 0; this.mode = null;
    this.initialized = false; this.transition = null; this.recenterRequested = false;
    this.speedBlend = 0; this.superBlend = 0; this.flightPitch = 0;
    this.fov = 110; this.distance = 2.7; this.aimYaw = 0; this.aimPitch = 0;
  }
  stick(x, y, ballCam) {
    this.lookX = ballCam ? 0 : clamp(Number(x) || 0, -1, 1);
    this.lookY = ballCam ? 0 : clamp(Number(y) || 0, -1, 1);
    this.stickTargetYaw = -this.lookX * Math.PI * 0.75;
    this.stickTargetPitch = this.lookY * 0.6;
  }
  drag(active, ballCam = false) { this.mouseHeld = !ballCam && active === true; }
  orbit(yaw, pitch, ballCam) {
    if (ballCam || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return false;
    if (this.mode === 'free') {
      this.freeYaw = wrap(this.freeYaw + yaw);
      this.freePitch = clamp(this.freePitch + pitch, -0.35, 0.9);
    } else {
      this.orbitYaw = wrap(this.orbitYaw + yaw);
      this.orbitPitch = clamp(this.orbitPitch + pitch, -0.35, 0.9);
    }
    return true;
  }
  recenter(ballCam = false) {
    if (ballCam) return false;
    this.recenterRequested = true;
    return true;
  }
  diagnostics() {
    return {mode: this.mode, horizontalFov: this.fov, distanceMetres: this.distance,
      transitioning: !!this.transition, position: this.position.toArray(),
      aim: [this.aimYaw, this.aimPitch], freeDirection: [this.freeYaw, this.freePitch],
      lookOffset: [this.orbitYaw + this.stickYaw, this.orbitPitch + this.stickPitch]};
  }
  sample(p, rotation, ball, settings, ballCam, dt, motion = {}) {
    const seconds = clamp(Number(dt) || 0, 0, 0.1),
      swivel = settings.swivelSpeed ?? 5, transitionSpeed = settings.transitionSpeed ?? 1.2,
      returnRate = 3.2 * (settings.returnSpeed ?? 5), effect = settings.speedEffect ?? 1,
      mode = ballCam ? 'ball' : settings.lookStyle === 'free' ? 'free' : 'car',
      speed = Number.isFinite(motion.speed) ? clamp(motion.speed, -C.maxSpeed, C.maxSpeed) : 0;
    const dx = ball.x - p.x, dz = ball.z - p.z;
    const ballHeading = Math.hypot(dx, dz) > 0.85 ? Math.atan2(dx, dz) : this.ballYaw;
    this.forward.set(0, 0, 1).applyQuaternion(rotation);
    const heading = Math.hypot(this.forward.x, this.forward.z) > 0.35 ?
      Math.atan2(this.forward.x, this.forward.z) : this.carYaw;
    if (!this.initialized) {
      this.ballYaw = ballHeading; this.carYaw = heading; this.freeYaw = heading;
    }
    this.ballYaw = turn(this.ballYaw, ballHeading, 4 * seconds);
    this.carYaw = turn(this.carYaw, heading + (speed < -1 ? Math.PI : 0),
      (2 + 6 * settings.stiffness) * seconds);
    if (!ballCam && settings.stiffness >= 1) this.carYaw = wrap(heading + (speed < -1 ? Math.PI : 0));
    const changed = this.mode !== null && this.mode !== mode;
    if (changed || this.recenterRequested) {
      this.transition = {elapsed: 0, duration: 0.32 / transitionSpeed,
        yaw: this.aimYaw, pitch: this.aimPitch};
      this.fromArm.copy(this.arm);
      this.orbitYaw = this.orbitPitch = this.stickYaw = this.stickPitch = 0;
      this.freeYaw = wrap(heading + (speed < -1 ? Math.PI : 0)); this.freePitch = 0;
      this.recenterRequested = false;
    } else if (this.transition) this.transition.elapsed += seconds;
    this.mode = mode;
    if (ballCam) {
      this.lookX = this.lookY = 0; this.mouseHeld = false;
      this.stickYaw = this.stickPitch = this.orbitYaw = this.orbitPitch = 0;
    } else if (mode === 'free') {
      this.freeYaw = wrap(this.freeYaw - this.lookX * swivel * 1.5 * seconds);
      this.freePitch = clamp(this.freePitch + this.lookY * swivel * 0.45 * seconds, -0.35, 0.9);
    } else {
      this.stickYaw = this.lookX ? turn(this.stickYaw, this.stickTargetYaw, swivel * 1.5 * seconds) :
        this.stickYaw * Math.exp(-returnRate * seconds);
      this.stickPitch = this.lookY ? this.stickPitch + clamp(this.stickTargetPitch - this.stickPitch,
        -swivel * 0.45 * seconds, swivel * 0.45 * seconds) :
        this.stickPitch * Math.exp(-returnRate * seconds);
      if (!this.mouseHeld) {
        this.orbitYaw *= Math.exp(-returnRate * seconds);
        this.orbitPitch *= Math.exp(-returnRate * seconds);
      }
    }
    this.speedBlend += (Math.abs(speed) / C.maxSpeed - this.speedBlend) * blend(5, seconds);
    this.superBlend += ((Math.abs(speed) >= C.supersonicStart ? 1 : 0) - this.superBlend) * blend(6, seconds);
    const velocity = motion.velocity, vertical = Number.isFinite(velocity?.y) ? velocity.y : 0,
      horizontal = Math.hypot(Number(velocity?.x) || 0, Number(velocity?.z) || 0),
      flight = motion.grounded === false ? clamp(Math.atan2(vertical, horizontal), -0.45, 0.45) * 0.35 : 0;
    this.flightPitch += (flight - this.flightPitch) * blend(5, seconds);
    // Conservative browser tuning informed by the reference behaviour. These
    // amplitudes are adjustable, not asserted native/proprietary constants.
    const intensity = effect * this.speedBlend ** 2, pullback = 0.9 * (1 - settings.stiffness) * intensity,
      angle = (settings.angle + 2 * (1 - settings.stiffness) * intensity) * Math.PI / 180,
      yaw = ballCam ? this.ballYaw : mode === 'free' ? this.freeYaw : this.carYaw + this.orbitYaw + this.stickYaw,
      pitch = ballCam ? 0 : mode === 'free' ? this.freePitch : clamp(this.orbitPitch + this.stickPitch, -0.35, 0.9),
      distance = settings.distance / 100 + pullback, height = settings.height / 100;
    this.distance = distance;
    this.fov = settings.fov + effect * (5 * this.speedBlend ** 2 + 2 * this.superBlend);
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.desired.copy(p).addScaledVector(this.forward, -distance * Math.cos(pitch));
    this.desired.y += height + distance * (ballCam ? -Math.tan(angle) : Math.sin(pitch));
    if (ballCam) this.target.copy(ball);
    else {
      this.target.copy(p).addScaledVector(this.forward, 3);
      this.target.y += height + Math.tan(angle + this.flightPitch) * (distance + 3);
    }
    this.goalArm.copy(this.desired).sub(p);
    if (!this.initialized) this.arm.copy(this.goalArm);
    else if (this.transition) orbitArm(this.fromArm, this.goalArm,
      smoothstep(clamp(this.transition.elapsed / this.transition.duration, 0, 1)), this.arm);
    else if (settings.stiffness >= 1) this.arm.copy(this.goalArm);
    else orbitArm(this.arm, this.goalArm, blend(3 + 14 * settings.stiffness, seconds), this.arm);
    this.position.copy(p).add(this.arm);
    constrainVehicleCamera(p, this.position, this.position,
      Number.isFinite(motion.cameraRadius) ? Math.max(0, motion.cameraRadius) : 0);
    this.arm.copy(this.position).sub(p);
    this.direction.copy(this.target).sub(this.position);
    const flat = Math.hypot(this.direction.x, this.direction.z),
      aimYaw = flat > 1e-6 ? Math.atan2(this.direction.x, this.direction.z) : this.aimYaw,
      aimPitch = clamp(Math.atan2(this.direction.y, flat), -1.45, 1.45);
    if (this.transition) {
      const t = smoothstep(clamp(this.transition.elapsed / this.transition.duration, 0, 1));
      this.aimYaw = this.transition.yaw + wrap(aimYaw - this.transition.yaw) * t;
      this.aimPitch = this.transition.pitch + (aimPitch - this.transition.pitch) * t;
      if (t === 1) this.transition = null;
    } else if (!this.initialized) { this.aimYaw = aimYaw; this.aimPitch = aimPitch; }
    else {
      // A ball crossing the camera or passing vertically through its bearing
      // must not produce an instantaneous half-turn or pitch singularity.
      this.aimYaw = turn(this.aimYaw, aimYaw, Math.max(12, swivel * 1.5) * seconds);
      this.aimPitch += clamp(aimPitch - this.aimPitch, -8 * seconds, 8 * seconds);
    }
    this.direction.set(Math.sin(this.aimYaw) * Math.cos(this.aimPitch), Math.sin(this.aimPitch),
      Math.cos(this.aimYaw) * Math.cos(this.aimPitch));
    this.look.copy(this.position).addScaledVector(this.direction, Math.max(1, this.target.distanceTo(this.position)));
    this.initialized = true;
    return this;
  }
}
