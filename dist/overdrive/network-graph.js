export class NetworkGraph {
  constructor({root = document, enabled = () => false} = {}) {
    this.enabled = enabled;
    this.last = 0;
    this.samples = new Float32Array(80 * 3);
    this.index = 0;
    this.count = 0;
    this.element = root.createElement('section');
    this.element.className = 'network-graph';
    this.element.id = 'network-graph';
    this.element.hidden = true;
    this.element.innerHTML =
      '<strong>CONNECTION</strong><canvas width="240" height="64" aria-label="Recent round-trip time and arrival jitter"></canvas><small></small>';
    root.getElementById('hud').append(this.element);
    this.ctx = this.element.querySelector('canvas').getContext('2d');
  }
  update(room, now) {
    this.element.hidden = !this.enabled() || !room?.matchId || room.closed;
    if (this.element.hidden || now - this.last < 250) return;
    this.last = now;
    const q = room.quality.summary(
        now,
        room.lastRealtimeAt ?? room.lastReceive,
        room.recovering,
      ),
      d = room.replica?.diagnostics() || {},
      ping = q.ping ?? 0,
      jitter = d.arrivalJitterMs ?? q.jitter ?? 0,
      buffer = d.interpolationMs || 0;
    this.samples[this.index * 3] = ping;
    this.samples[this.index * 3 + 1] = jitter;
    this.samples[this.index * 3 + 2] = buffer;
    this.index = (this.index + 1) % 80;
    this.count = Math.min(80, this.count + 1);
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, 240, 64);
    ctx.strokeStyle = '#456077';
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(240, 48);
    ctx.stroke();
    const max = Math.max(100, ping * 1.3);
    for (let line = 0; line < 3; line++) {
      ctx.strokeStyle = ['#8ed5f5', '#ffcb82', '#8fe0bc'][line];
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) {
        const sample = (this.index - this.count + i + 80) % 80,
          x = (i / 79) * 240,
          y = 62 - Math.min(1, this.samples[sample * 3 + line] / max) * 58;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.element.querySelector('small').textContent =
      `RTT ${Math.round(ping)}ms · JITTER ${Math.round(jitter)}ms · BUFFER ${buffer}ms · GAPS ${d.snapshotGaps || 0}`;
  }
  dispose() {
    this.element.remove();
  }
}
