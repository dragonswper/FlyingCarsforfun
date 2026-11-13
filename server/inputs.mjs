import {RemoteInputs, cleanInput, validCounter, INPUT_TIMEOUT} from '../dist/network-protocol.js';

// At most one queued input is simulated at the server's fixed 120 Hz. ACKs
// describe simulated inputs, rather than the most recently received packet.
// No client time delta or client position is ever used to advance the game.
export class ServerInputs extends RemoteInputs {
  receive(frames, now) {
    if (!Array.isArray(frames) || frames.length > 16) return false;
    let accepted = false;
    for (const frame of frames) {
      const n = Array.isArray(frame) ? frame[0] : frame?.n;
      if (!validCounter(n) || n <= this.received) continue;
      const parser = new RemoteInputs();
      if (!parser.receive([frame], now)) continue;
      // A suspended tab or long uplink stall may jump beyond the replay window.
      // Resync to fresh controls without advancing physics or permanently
      // rejecting every later sequence. ACK advances only when next() runs.
      if (n - this.ack > 120 || now - this.lastAt > INPUT_TIMEOUT) {
        this.queue.length = 0;
        this.received = n - 1;
      }
      // A missing frame can occur when a browser drops a congested send. Fill
      // short gaps with the last known held input, preserving a bounded timeline.
      for (let id = this.received + 1; id < n; id++)
        this.queue.push({n: id, input: cleanInput(this.latest)});
      this.queue.push({n, input: parser.latest});
      this.latest = parser.latest;
      this.received = n;
      this.lastAt = now;
      accepted = true;
    }
    if (this.queue.length > 120) this.queue.splice(0, this.queue.length - 120);
    return accepted;
  }
  next(now) {
    if (now - this.lastAt > INPUT_TIMEOUT) {
      this.queue.length = 0;
      this.current = cleanInput();
      return this.current;
    }
    const frame = this.queue.shift();
    if (frame) {
      this.ack = frame.n;
      this.current = frame.input;
    }
    return this.current;
  }
}
