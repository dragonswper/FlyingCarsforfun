import {Vector3} from './vendor/three.module.js';
import {C} from './constants.js';
export const HOOPS = Object.freeze({
  z: 40,
  height: 5.8,
  radius: 4.6,
  tube: 0.16,
  boardZ: 46,
  boardWidth: 7,
  boardBottom: 6,
  boardTop: 13,
});
const delta = new Vector3(),
  normal = new Vector3(),
  nearest = new Vector3();
function respond(body, n, depth, restitution) {
  body.p.addScaledVector(n, depth + 0.00001);
  const velocity = body.v.dot(n);
  if (velocity < 0) body.v.addScaledVector(n, -velocity * (1 + restitution));
}
export function hoopsBallContacts(ball) {
  const r = ball.radius ?? C.ballRadius;
  let impact = 0;
  for (const sign of [-1, 1]) {
    const dx = ball.p.x,
      dz = ball.p.z - sign * HOOPS.z,
      radial = Math.hypot(dx, dz);
    nearest.set(
      radial > 1e-7 ? (dx / radial) * HOOPS.radius : HOOPS.radius,
      HOOPS.height,
      sign * HOOPS.z + (radial > 1e-7 ? (dz / radial) * HOOPS.radius : 0),
    );
    delta.copy(ball.p).sub(nearest);
    const distance = delta.length(),
      penetration = r + HOOPS.tube - distance;
    if (penetration > 0) {
      normal.copy(delta).normalize();
      if (distance < 1e-7) normal.set(0, 1, 0);
      impact = Math.max(impact, -ball.v.dot(normal));
      respond(ball, normal, penetration, ball.restitution ?? C.ballRestitution);
    }
    const board = ball.p.z - sign * HOOPS.boardZ;
    if (
      Math.abs(board) < r &&
      Math.abs(ball.p.x) < HOOPS.boardWidth + r &&
      ball.p.y > HOOPS.boardBottom - r &&
      ball.p.y < HOOPS.boardTop + r
    ) {
      normal.set(0, 0, Math.sign(board) || -sign);
      impact = Math.max(impact, -ball.v.dot(normal));
      respond(
        ball,
        normal,
        r - Math.abs(board),
        ball.restitution ?? C.ballRestitution,
      );
    }
  }
  return impact;
}
export function hoopsGoal(previous, ball) {
  if (ball.v.y >= 0 || previous.y <= HOOPS.height || ball.p.y > HOOPS.height)
    return null;
  const t = (previous.y - HOOPS.height) / (previous.y - ball.p.y),
    x = previous.x + (ball.p.x - previous.x) * t,
    z = previous.z + (ball.p.z - previous.z) * t;
  for (const sign of [-1, 1])
    if (
      Math.hypot(x, z - sign * HOOPS.z) <
      HOOPS.radius - (ball.radius ?? C.ballRadius) - HOOPS.tube
    )
      return sign > 0 ? 0 : 1;
  return null;
}
export function hoopsCarContacts(car, support) {
  if (car.demoTime > 0) return;
  for (const sign of [-1, 1]) {
    // The rim uses the same support extent as arena contacts, so rotated
    // cars cannot pass through it while the ball collides with it.
    const radial = Math.hypot(car.p.x, car.p.z - sign * HOOPS.z);
    nearest.set(
      radial > 1e-7 ? (car.p.x / radial) * HOOPS.radius : HOOPS.radius,
      HOOPS.height,
      sign * HOOPS.z +
        (radial > 1e-7
          ? ((car.p.z - sign * HOOPS.z) / radial) * HOOPS.radius
          : 0),
    );
    delta.copy(car.p).sub(nearest);
    const distance = delta.length();
    if (distance < 2.5) {
      normal.copy(delta).normalize();
      if (distance < 1e-7) normal.set(0, 1, 0);
      const extent = support(car, normal) + HOOPS.tube;
      if (distance < extent) respond(car, normal, extent - distance, 0);
    }
    const board = car.p.z - sign * HOOPS.boardZ;
    if (
      Math.abs(board) < 2.5 &&
      Math.abs(car.p.x) < HOOPS.boardWidth + 2.5 &&
      car.p.y > HOOPS.boardBottom - 2.5 &&
      car.p.y < HOOPS.boardTop + 2.5
    ) {
      normal.set(0, 0, Math.sign(board) || -sign);
      const extent = support(car, normal);
      if (Math.abs(board) < extent)
        respond(car, normal, extent - Math.abs(board), 0);
    }
  }
}
