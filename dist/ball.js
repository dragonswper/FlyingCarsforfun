import {HOOPS,hoopsBallContacts} from './hoops-physics.js';
import {Vector3 as V, Quaternion as Q} from './vendor/three.module.js';
import {C, clamp} from './constants.js';
import {collideArena} from './arena.js';
const limit = (v, max) => {
  const length = v.length();
  if (length > max) v.multiplyScalar(max / length);
};
export function stepBall(ball, dt = C.step, rotate = true) {
  ball.v.multiplyScalar(Math.pow(1 - C.ballDrag, dt));
  ball.v.y -= (ball.gravity ?? C.gravity) * dt;
  ball.p.addScaledVector(ball.v, dt);
  const radius = ball.radius ?? C.ballRadius;
  const hit = collideArena(
    ball,
    radius + C.ballMargin,
    ball.restitution ?? C.ballRestitution,
  );
  if (ball.hoops) hit.impact = Math.max(hit.impact, hoopsBallContacts(ball));
  if (hit.contact) {
    const n = hit.contact,
      r = n.clone().multiplyScalar(-radius),
      contactVelocity = ball.v.clone().add(ball.spin.clone().cross(r)),
      tangent = contactVelocity.addScaledVector(n, -contactVelocity.dot(n)),
      speed = tangent.length();
    if (speed > 1e-7) {
      const change = Math.min(
          speed / 3.5,
          C.ballFriction *
            Math.max(
              (1 + (ball.restitution ?? C.ballRestitution)) * hit.impact,
              (ball.gravity ?? C.gravity) * dt * Math.max(n.y, 0),
            ),
        ),
        delta = tangent.multiplyScalar(-change / speed);
      ball.v.add(delta);
      ball.spin.add(r.cross(delta).multiplyScalar(2.5 / (radius * radius)));
    }
  }
  limit(ball.v, C.ballMaxSpeed);
  limit(ball.spin, C.ballMaxSpin);
  const spin = ball.spin.length();
  if (rotate && spin > 0.001)
    ball.q
      .premultiply(
        new Q().setFromAxisAngle(
          ball.spin.clone().divideScalar(spin),
          spin * dt,
        ),
      )
      .normalize();
  return hit;
}
export class BallPrediction {
  constructor() {
    this.interval = 0.125;
    this.horizon = 3;
    this.sampleStep = 1 / 30;
    this.samples = Array.from({length: 91}, (_, i) => ({
      t: i / 30,
      p: new V(),
      v: new V(),
    }));
    this.body = {p: new V(), v: new V(), spin: new V(), q: new Q()};
    this.generatedAt = -Infinity;
    this.generation = 0;
    this.dirty = true;
  }
  invalidate() {
    this.dirty = true;
  }
  update(ball, time) {
    if (time - this.generatedAt < (this.dirty ? 1 / 30 : this.interval))
      return this;
    this.generatedAt = time;
    this.dirty = false;
    this.generation++;
    Object.assign(this.body, {
      radius: ball.radius,
      gravity: ball.gravity,
      restitution: ball.restitution,
      hoops: ball.hoops,
    });
    this.body.p.copy(ball.p);
    this.body.v.copy(ball.v);
    this.body.spin.copy(ball.spin);
    const stationary =
      ball.v.lengthSq() < 0.0001 && ball.p.y <= (ball.radius??C.ballRadius) + C.ballMargin + 0.001;
    for (let i = 0; i < this.samples.length; i++) {
      if (i && !stationary)
        for (let tick = 0; tick < 4; tick++) stepBall(this.body, C.step, false);
      this.samples[i].p.copy(this.body.p);
      this.samples[i].v.copy(this.body.v);
    }
    return this;
  }
  at(seconds, now = this.generatedAt) {
    return this.samples[
      Math.min(
        this.samples.length - 1,
        Math.max(0, Math.round((seconds + now - this.generatedAt) * 30)),
      )
    ];
  }
  goalThreat(team, now=this.generatedAt) {
    const sign=team===0?-1:1,age=Math.max(0,now-this.generatedAt),r=this.body.radius??C.ballRadius;
    if(this.body.hoops){for(let i=1;i<this.samples.length;i++){const a=this.samples[i-1],b=this.samples[i];if(b.t<age||a.p.y<=HOOPS.height||b.p.y>HOOPS.height||b.v.y>=0)continue;const f=(a.p.y-HOOPS.height)/(a.p.y-b.p.y),x=a.p.x+(b.p.x-a.p.x)*f,z=a.p.z+(b.p.z-a.p.z)*f;if(Math.hypot(x,z-sign*HOOPS.z)<HOOPS.radius-r-HOOPS.tube)return {time:b.t-age,p:b.p};}return null;}
    for(const sample of this.samples)if(sample.t>=age&&sample.p.z*sign>C.goalScorePlane+r&&Math.abs(sample.p.x)<C.goalWidth-r&&sample.p.y<C.goalHeight-r)return {time:sample.t-age,p:sample.p};return null;
  }
}
