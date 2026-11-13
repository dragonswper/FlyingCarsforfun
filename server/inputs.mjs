import {RemoteInputs, cleanInput, validCounter, INPUT_TIMEOUT} from '../dist/network-protocol.js';
export const MAX_INPUT_BUFFER = 4, RECENT_INPUT_BUFFER = 2;

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
        this.carriedJumps = 0;
        if (now - this.lastAt > INPUT_TIMEOUT) this.receivedJump = false;
      }
      // A missing frame can occur when a browser drops a congested send. Fill
      // short gaps with the last known held input, preserving a bounded timeline.
      for (let id = this.received + 1; id < n; id++)
        this.queue.push({n: id, input: cleanInput(this.latest)});
      const press = parser.latest.jump && !this.receivedJump;
      this.receivedJump = parser.latest.jump;
      this.queue.push({n, input: parser.latest, press});
      this.latest = parser.latest;
      this.received = n;
      this.lastAt = now;
      accepted = true;
    }
    // A jitter burst must not add a permanent FIFO delay: the client and the
    // server both run at 120 Hz, so a long queue cannot catch up by itself.
    if (this.queue.length > MAX_INPUT_BUFFER) {
      const dropped = this.queue.splice(0, this.queue.length - RECENT_INPUT_BUFFER);
      this.carriedJumps = Math.min(
        2,
        (this.carriedJumps || 0) + dropped.filter(frame => frame.press).length
      );
    }
    return accepted;
  }
  next(now) {
    if (now - this.lastAt > INPUT_TIMEOUT) {
      this.queue.length = 0;
      this.current = cleanInput();
      this.heldInput = this.current;
      this.carriedJumps = 0;
      this.receivedJump = false;
      return this.current;
    }
    const previousJump = this.current.jump, frame = this.queue.shift();
    if (frame) {
      this.ack = frame.n;
      this.heldInput = frame.input;
      if (frame.press) this.carriedJumps = Math.min(2, (this.carriedJumps || 0) + 1);
    }
    this.current = {...(this.heldInput || this.current)};
    // Preserve up to two genuine press edges from discarded frames. Throttle
    // and steering use recent input; old packets never fast-forward physics.
    if (this.carriedJumps) {
      this.current = {...this.current, jump: !previousJump};
      if (this.current.jump) this.carriedJumps--;
    }
    return this.current;
  }
}
