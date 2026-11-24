// Anonymous counters: no names, addresses, credentials or room identifiers.
export class RuntimeMetrics {
  constructor() {
    this.callbacks = 0;
    this.steps = 0;
    this.maxSteps = 0;
    this.discardedMs = 0;
    this.debtMs = 0;
    this.costs = new Float32Array(120);
    this.count = 0;
    this.cursor = 0;
  }
  record({steps, discarded, debt}, cost) {
    this.callbacks++;
    this.steps += steps;
    this.maxSteps = Math.max(this.maxSteps, steps);
    this.discardedMs += discarded * 1000;
    this.debtMs = debt * 1000;
    this.costs[this.cursor++ % this.costs.length] = Math.max(0, cost);
    this.count = Math.min(this.count + 1, this.costs.length);
  }
  snapshot() {
    const costs = Array.from(this.costs.subarray(0, this.count)).sort(
        (a, b) => a - b,
      ),
      round = (x) => Math.round(x * 100) / 100;
    return {
      callbacks: this.callbacks,
      physicsSteps: this.steps,
      maxCatchUpSteps: this.maxSteps,
      discardedMs: round(this.discardedMs),
      debtMs: round(this.debtMs),
      callbackP95Ms: round(
        costs[Math.max(0, Math.ceil(costs.length * 0.95) - 1)] || 0,
      ),
    };
  }
}
