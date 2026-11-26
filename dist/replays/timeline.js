import {Quaternion} from '../vendor/three.module.js';
export class ReplayTimeline {
  constructor(clip) {
    this.clip = clip;
    this.start = clip.frames[0].time;
    this.end = clip.frames.at(-1).time;
    this.duration = this.end - this.start;
    this.a = new Quaternion();
    this.b = new Quaternion();
    this.output = {
      ball: {p: [0, 0, 0], q: [0, 0, 0, 1]},
      cars: clip.roster.map((c) => ({
        id: c.id,
        team: c.team,
        p: [0, 0, 0],
        q: [0, 0, 0, 1],
      })),
    };
  }
  sample(seconds) {
    const t = this.start + Math.max(0, Math.min(this.duration, seconds)),
      frames = this.clip.frames;
    let lo = 0,
      hi = frames.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (frames[mid].time <= t) lo = mid;
      else hi = mid - 1;
    }
    const a = frames[lo],
      b = frames[Math.min(lo + 1, frames.length - 1)],
      alpha = b.time > a.time ? (t - a.time) / (b.time - a.time) : 0;
    const mix = (out, from, to) => {
      const teleport=Math.hypot(...from.p.map((n,i)=>n-to.p[i]))>15,blend=teleport?(alpha>=1?1:0):alpha;
      for (let i = 0; i < 3; i++)
        out.p[i] = from.p[i] + (to.p[i] - from.p[i]) * blend;
      this.a.fromArray(from.q);
      this.b.fromArray(to.q);
      this.a.slerp(this.b, blend).normalize().toArray(out.q);
    };
    mix(this.output.ball, a.ball, b.ball);
    for (let i = 0; i < this.output.cars.length; i++) {
      const out = this.output.cars[i];
      mix(out, a.cars[i], b.cars[i]);
      Object.assign(out, {
        speed: a.cars[i].speed + (b.cars[i].speed - a.cars[i].speed) * alpha,
        steer: a.cars[i].steer + (b.cars[i].steer - a.cars[i].steer) * alpha,
        boosting: a.cars[i].boosting,
        demo: a.cars[i].demo,
        grounded: a.cars[i].grounded,
      });
    }
    return this.output;
  }
}
