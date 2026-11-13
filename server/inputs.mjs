import {RemoteInputs, cleanInput, validCounter, INPUT_TIMEOUT} from '../dist/network-protocol.js';
export const MAX_INPUT_BUFFER = 4, RECENT_INPUT_BUFFER = 2, MAX_INPUT_CLOCK_SKEW = 8;

// Physics advances once per fixed 120 Hz tick. ACKs describe the latest control
// actually consumed, rather than the most recently received packet.
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
        this.inputTick = null;
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
    // The browser bounds physics catch-up after a long render hitch. Fresh
    // packets can then carry a slower input clock even though the connection
    // never timed out. Rebase to that clock instead of remaining permanently
    // ahead of all the client's prediction history. This changes sequence
    // alignment only; it does not rewind or fast-forward server physics.
    if (accepted && this.inputTick != null &&
      this.inputTick - this.received > MAX_INPUT_CLOCK_SKEW) this.inputTick = null;
    return accepted;
  }
  next(now) {
    // Authority also advances while controls are held between packets. Keep
    // that timeline separate from ACK (which only names a consumed input).
    // Late frames replace held controls; they must not simulate old time twice.
    let tick = this.inputTick == null ? this.queue[0]?.n ?? this.ack : this.inputTick + 1;
    if (this.queue.length) tick = Math.max(tick, this.queue[0].n);
    this.inputTick = tick;
    if (now - this.lastAt > INPUT_TIMEOUT) {
      this.queue.length = 0;
      this.current = cleanInput();
      this.heldInput = this.current;
      this.carriedJumps = 0;
      this.receivedJump = false;
      return this.current;
    }
    const previousJump = this.current.jump;
    while (this.queue.length && this.queue[0].n <= tick) {
      const frame = this.queue.shift();
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
