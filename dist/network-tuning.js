// Snapshot arrival timing, not claimed client/server ping, controls the visual
// buffer. It grows quickly on jitter and shrinks slowly after recovery.
export class SnapshotTiming {
  constructor() {
    this.period = 1 / 30;
    this.jitter = 0;
    this.delay = 0.05;
    this.sequence = -1;
    this.arrival = null;
    this.elapsed = null;
    this.gaps = 0;
    this.received = 0;
  }
  receive(sequence, elapsed, now, reset = false) {
    if (
      sequence <= this.sequence ||
      !Number.isFinite(now) ||
      !Number.isFinite(elapsed)
    )
      return false;
    if (reset || this.arrival === null) {
      this.period = 1 / 30;
      this.jitter = 0;
      this.delay = 0.05;
    } else {
      const steps = Math.max(1, sequence - this.sequence),
        remote = (elapsed - this.elapsed) / steps,
        interval = (now - this.arrival) / 1000;
      if (remote > 0 && remote < 0.2)
        this.period += (remote - this.period) * 0.08;
      const deviation = Math.min(
        0.25,
        Math.abs(interval - (elapsed - this.elapsed)),
      );
      this.jitter += (deviation - this.jitter) * 0.15;
      this.gaps += Math.max(0, steps - 1);
      const target = Math.max(
        0.045,
        Math.min(0.16, 1.5 * this.period + 2.5 * this.jitter),
      );
      this.delay += (target - this.delay) * (target > this.delay ? 0.55 : 0.04);
    }
    this.received++;
    this.sequence = sequence;
    this.arrival = now;
    this.elapsed = elapsed;
    return true;
  }
  get redundancy() {
    return Math.min(12, Math.max(4, 4 + Math.ceil(this.jitter * 120)));
  }
  diagnostics() {
    return {
      bufferMs: Math.round(this.delay * 1000),
      arrivalJitterMs: Math.round(this.jitter * 1000),
      snapshotGaps: this.gaps,
      snapshots: this.received,
      inputRedundancy: this.redundancy,
    };
  }
}
