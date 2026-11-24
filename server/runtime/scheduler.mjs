// Bound work per callback so a delayed room cannot monopolise all sockets.
// Keep a short debt, and publish only the freshest state after physics catch-up.
export class FixedStepScheduler {
  constructor({step = 1 / 120, maxSteps = 12, maxDebt = 0.15} = {}) {
    Object.assign(this, {step, maxSteps, maxDebt});
    this.reset();
  }
  reset(now = null) {
    this.last = now;
    this.debt = 0;
  }
  advance(now, active, simulate, publish) {
    const elapsed =
      this.last === null ? 0 : Math.max(0, (now - this.last) / 1000);
    this.last = now;
    if (!active) {
      this.debt = 0;
      return {steps: 0, discarded: 0, debt: 0};
    }
    const total = this.debt + elapsed,
      discarded = Math.max(0, total - this.maxDebt);
    this.debt = Math.min(this.maxDebt, total);
    let steps = 0;
    while (this.debt + 1e-10 >= this.step && steps < this.maxSteps) {
      simulate(this.step);
      this.debt = Math.max(0, this.debt - this.step);
      steps++;
    }
    if (steps) publish();
    return {steps, discarded, debt: this.debt};
  }
}
