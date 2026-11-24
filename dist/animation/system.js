import {animateVehicle} from './vehicle.js';
import {animateNoveltyAModel} from './novelty.js';
import {animateBoost} from './boost.js';
import {bindEnvironmentMotion} from './environment.js';

// One presentation clock. No listeners/timers per car and no simulation writes.
export class AnimationSystem {
  constructor({
    media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'),
  } = {}) {
    this.media = media;
    this.preference = 'system';
    this.time = 0;
    this.ambientTime = 0;
    this.dt = 0;
    this.environments = new Map();
    this.state = {};
  }
  configure(preference = 'system') {
    this.preference = ['system', 'full', 'reduced'].includes(preference)
      ? preference
      : 'system';
  }
  get reduced() {
    return (
      this.preference === 'reduced' ||
      (this.preference === 'system' && !!this.media?.matches)
    );
  }
  begin(dt) {
    this.dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    this.time += this.dt;
    if (!this.reduced) this.ambientTime += this.dt;
  }
  environment(environment) {
    if (!environment) return;
    let binding = this.environments.get(environment);
    if (!binding) {
      binding = bindEnvironmentMotion(environment.root);
      this.environments.set(environment, binding);
    }
    binding.update(this.ambientTime, this.reduced);
    environment.update(this.ambientTime);
  }
  vehicle(model, input, boosting) {
    Object.assign(this.state, input, {dt: this.dt, reduced: this.reduced});
    if (!animateNoveltyAModel(model, this.state))
      animateVehicle(model, this.state);
    animateBoost(model, boosting, this.dt, this.time, this.reduced);
  }
  dispose() {
    for (const binding of this.environments.values()) binding.dispose();
    this.environments.clear();
  }
  diagnostics() {
    return {
      time: this.time,
      ambientTime: this.ambientTime,
      reduced: this.reduced,
      environmentBindings: this.environments.size,
    };
  }
}
