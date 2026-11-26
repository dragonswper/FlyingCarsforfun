import {Vector3} from '../vendor/three.module.js';
import {C} from '../constants.js';
import {collideCourseBox} from './course-physics.js';
export const COURSE = Object.freeze([
  {p: [0, 1, -25]},
  {p: [-12, 1, -10]},
  {p: [10, 2.6, 4], hurdle: true},
  {p: [-10, 1, 16]},
  {p: [10, 2.6, 28], hurdle: true},
  {p: [-8, 1, 36]},
  {p: [0, 3.2, 43], hurdle: true},
  {p: [0, 1, 30]},
]);
export const TARGETS = Object.freeze([
  [0, 2.5, 30],
  [-12, 3, 30],
  [12, 3, 30],
  [0, 6, 30],
  [-15, 5, 30],
  [15, 5, 30],
  [0, 8, 30],
  [0, 3, 30],
]);
export class ArcadeDirector {
  constructor(sim, mode = 'targets') {
    if (
      sim.options.mode !== 'free' ||
      sim.options.dedicated ||
      sim.cars.length !== 1
    )
      throw Error('Arcade challenges require a solo offline world.');
    if (!['targets', 'course'].includes(mode))
      throw Error('Unknown Arcade mode.');
    this.sim = sim;
    this.mode = mode;
    this.previous = new Vector3();
    this.point = new Vector3();
    this.obstacles = COURSE.filter((g) => g.hurdle).map((g) => ({
      x: g.p[0],
      y: 0.7,
      z: g.p[2],
      w: 6,
      h: 1.4,
      d: 0.7,
    }));
    this.restart();
  }
  restart() {
    this.sim.phase = 'playing';
    this.sim.resetPractice();
    this.sim.recordReplay = false;
    this.sim.events.length = 0;
    this.sim.score = [0, 0];
    this.time = 0;
    this.penalty = 0;
    this.penaltyUntil = 0;
    this.index = 0;
    this.points = 0;
    this.status = 'running';
    this.sim.cars[0].p.set(0, C.carHeight, -39);
    this.sim.cars[0].q.identity();
    this.resetBall();
  }
  resetBall() {
    const b = this.sim.ball;
    b.p.set(
      this.mode === 'course' ? 32 : 0,
      C.ballRestHeight,
      this.mode === 'course' ? -30 : -22,
    );
    b.v.set(0, 0, 0);
    b.spin.set(0, 0, 0);
    b.q.identity();
    this.previous.copy(b.p);
    this.sim.phase = 'playing';
    this.sim.prediction.invalidate();
  }
  step(dt) {
    if (this.status !== 'running') return;
    this.time += dt;
    const car = this.sim.cars[0],
      ball = this.sim.ball;
    if (this.mode === 'course') {
      for (const obstacle of this.obstacles)
        if (collideCourseBox(car, obstacle) && this.time > this.penaltyUntil) {
          this.penalty += 2;
          this.penaltyUntil = this.time + 1;
        }
      const goal = COURSE[this.index];
      if (
        goal &&
        car.p.distanceTo(this.point.fromArray(goal.p)) < 2.7 &&
        (!goal.hurdle || car.p.y > 1.8)
      ) {
        this.index++;
        this.points += 100;
      }
    } else {
      const target = TARGETS[this.index],
        z = target?.[2];
      if (target && this.previous.z < z && ball.p.z >= z && ball.v.z > 0) {
        const t = (z - this.previous.z) / (ball.p.z - this.previous.z),
          x = this.previous.x + (ball.p.x - this.previous.x) * t,
          y = this.previous.y + (ball.p.y - this.previous.y) * t;
        if (
          Math.hypot(x - target[0], y - target[1]) <
          2.7 - (ball.radius ?? C.ballRadius)
        ) {
          this.points += 100;
          this.index++;
          car.v.set(0, 0, 0);
          car.p.set(0, C.carHeight, -39);
          car.q.identity();
          this.resetBall();
        }
      }
      this.previous.copy(ball.p);
      if (this.sim.phase === 'goal') this.resetBall();
    }
    const limit = this.mode === 'course' ? 120 : 90,
      total = this.mode === 'course' ? COURSE.length : TARGETS.length;
    if (this.index >= total || this.time + this.penalty >= limit) {
      this.status = 'result';
      this.completed = this.index >= total;
      this.points += this.completed
        ? Math.max(0, Math.round((limit - this.time - this.penalty) * 10))
        : 0;
    }
  }
  state() {
    return {
      mode: this.mode,
      index: this.index,
      total: this.mode === 'course' ? COURSE.length : TARGETS.length,
      time: this.time,
      penalty: this.penalty,
      points: this.points,
      status: this.status,
      completed: !!this.completed,
      remaining: Math.max(
        0,
        (this.mode === 'course' ? 120 : 90) - this.time - this.penalty,
      ),
    };
  }
}
