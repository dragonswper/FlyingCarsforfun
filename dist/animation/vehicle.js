import * as T from '../vendor/three.module.js';
import {curve, STEERING_CURVE} from '../constants.js';

// Only presentation nodes move. Never animate the root, hitbox or wheel radius.
// State lives outside asset templates, so garage instances cannot share motion.
const motion = new WeakMap();
export function animateVehicle(
  model,
  {
    speed = 0,
    steer = 0,
    dt = 0,
    grounded = true,
    throttle = 0,
    reduced = false,
  } = {},
) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.1);
  speed = Number.isFinite(speed) ? speed : 0;
  steer = Number.isFinite(steer) ? T.MathUtils.clamp(steer, -1, 1) : 0;
  let state = motion.get(model);
  if (!state) {
    state = {grounded, airtime: 0, compression: 0};
    motion.set(model, state);
  }
  if (!grounded) state.airtime += dt;
  if (grounded && !state.grounded) {
    state.compression = -Math.min(0.025, state.airtime * 0.018);
    state.airtime = 0;
  }
  state.grounded = grounded;
  state.compression *= Math.exp(-14 * dt);
  const response = 1 - Math.exp(-12 * dt),
    baseAngle =
      (steer * curve(STEERING_CURVE, Math.abs(speed)) * Math.PI) / 180,
    wheelBase = model.wheelBase || 1.095;
  for (const wheel of model.wheels) {
    const spinSpeed = grounded
      ? speed
      : Math.abs(throttle) > 0.05
        ? throttle * Math.max(6, Math.abs(speed))
        : speed;
    wheel.rolling.rotation.x =
      (wheel.rolling.rotation.x + (spinSpeed * dt) / (wheel.radius || 0.235)) %
      (Math.PI * 2);
    let angle = 0;
    if (wheel.front && Math.abs(baseAngle) > 0.001) {
      const radius = wheelBase / Math.tan(Math.abs(baseAngle)),
        inner = radius - Math.sign(baseAngle) * wheel.pivot.position.x;
      angle =
        Math.sign(baseAngle) * Math.atan(wheelBase / Math.max(0.5, inner));
    }
    wheel.pivot.rotation.y += (angle - wheel.pivot.rotation.y) * response;
  }
  if (model.chassis) {
    const acceleration = (speed - (model.lastSpeed || 0)) / dt;
    model.travel = (model.travel || 0) + speed * dt;
    const pitch =
        grounded && !reduced
          ? T.MathUtils.clamp(-acceleration * 0.0018, -0.045, 0.045)
          : 0,
      roll =
        grounded && !reduced
          ? T.MathUtils.clamp(steer * Math.abs(speed) * 0.0025, -0.05, 0.05)
          : 0;
    model.chassis.rotation.x += (pitch - model.chassis.rotation.x) * response;
    model.chassis.rotation.z += (roll - model.chassis.rotation.z) * response;
    model.chassis.position.y =
      grounded && !reduced
        ? state.compression +
          Math.sin(model.travel * 7) * 0.003 * Math.min(1, Math.abs(speed) / 5)
        : 0;
  }
  model.lastSpeed = speed;
}
