import { CombatTuning, makeFlick } from './combat.js';

const REARM_TIME = 0.05;
const STALE_FRAME_TIME = 0.75;
const MIN_STRAIGHTNESS = 0.88;
const NO_MOTION = Object.freeze({ dx: 0, dy: 0, velocity: 0, gesture: null });
const { MinFlickVelocity, MinFlickDistance, FlickWindow } = CombatTuning;

export function createMouseSwing() {
  const stroke = [];
  let dx = 0;
  let dy = 0;
  let time = 0;
  let quiet = 0;
  let spent = false;

  function addDelta(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    dx += x;
    // Browser deltas point down on Y. Combat angles use positive Y for up.
    dy -= y;
  }

  function reset() {
    dx = dy = time = quiet = 0;
    spent = false;
    stroke.length = 0;
  }

  function readStroke(dt, travel, minDistance, minVelocity) {
    const cutoff = time - FlickWindow;
    stroke.push({ x: dx, y: dy, travel, start: time - dt, end: time });
    while (stroke[0].end <= cutoff) stroke.shift();

    let x = 0;
    let y = 0;
    let path = 0;
    // Start at the newest motion so a clear swipe can follow a turn in another direction.
    for (let index = stroke.length - 1; index >= 0; index--) {
      const part = stroke[index];
      const start = Math.max(cutoff, part.start);
      const weight = (part.end - start) / (part.end - part.start);
      x += part.x * weight;
      y += part.y * weight;
      path += part.travel * weight;
      const distance = Math.hypot(x, y);
      const velocity = distance / (time - start);
      // A long back-and-forth motion has plenty of travel and very little net distance.
      if (distance >= minDistance && distance >= path * MIN_STRAIGHTNESS && velocity >= minVelocity) {
        return makeFlick(x, y, Math.max(MinFlickVelocity, velocity));
      }
    }
    return null;
  }

  function sample(dt, canFlick, distanceMultiplier = 1, speedMultiplier = 1) {
    if (!Number.isFinite(dt) || dt <= 0) return NO_MOTION;
    // Don't replay motion accumulated while the browser was stalled or inactive.
    if (dt > STALE_FRAME_TIME) {
      reset();
      return NO_MOTION;
    }

    const minVelocity = MinFlickVelocity * speedMultiplier;
    time += dt;
    const travel = Math.hypot(dx, dy);
    const velocity = travel / dt;
    let gesture = null;
    if (velocity >= minVelocity) {
      quiet = 0;
      // Motion that starts during guard or recovery cannot carry into a new swing.
      if (!canFlick) spent = true;
      if (!spent) gesture = readStroke(dt, travel, MinFlickDistance * distanceMultiplier, minVelocity);
      if (gesture || spent) {
        spent = true;
        stroke.length = 0;
      }
    } else {
      quiet += dt;
      if (quiet >= REARM_TIME) {
        spent = false;
        stroke.length = 0;
      }
    }

    const motion = { dx, dy, velocity, gesture };
    dx = dy = 0;
    return motion;
  }

  return { addDelta, sample, reset };
}

export function createRelativeMouse(canvas) {
  const motion = createMouseSwing();
  const isCaptured = () => document.pointerLockElement === canvas;
  document.addEventListener('mousemove', (event) => {
    if (isCaptured()) motion.addDelta(event.movementX, event.movementY);
  }, { passive: true });

  async function capture() {
    if (isCaptured() || !canvas.requestPointerLock) return;
    try {
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch (error) {
      // Some browsers provide relative movement without access to raw device input.
      if (error?.name !== 'NotSupportedError' && !(error instanceof TypeError)) throw error;
      await canvas.requestPointerLock();
    }
  }

  return { isCaptured, capture, sample: motion.sample, reset: motion.reset, addDelta: motion.addDelta };
}
