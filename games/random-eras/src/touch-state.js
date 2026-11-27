const clamp = (value) =>
  Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));

// The DOM adapter owns pointer IDs; the simulation receives bounded, consumable
// state. Clearing it on cancel/blur/menu changes prevents held movement or guard.
export function createTouchState() {
  let x = 0,
    y = 0,
    dx = 0,
    dy = 0;
  const guardPointers = new Set();
  return {
    get x() {
      return x;
    },
    get forward() {
      return y === 0 ? 0 : -y;
    },
    get sprint() {
      return Math.hypot(x, y) > 0.9;
    },
    get guard() {
      return guardPointers.size > 0;
    },
    move(nextX, nextY) {
      x = clamp(nextX);
      y = clamp(nextY);
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      if (length < 0.14) x = y = 0;
    },
    look(nextX, nextY) {
      if (Number.isFinite(nextX))
        dx = Math.max(-600, Math.min(600, dx + nextX));
      if (Number.isFinite(nextY))
        dy = Math.max(-600, Math.min(600, dy + nextY));
    },
    consumeLook() {
      const value = { dx, dy };
      dx = dy = 0;
      return value;
    },
    guardDown(id) {
      guardPointers.add(id);
    },
    release(id) {
      guardPointers.delete(id);
    },
    reset() {
      x = y = dx = dy = 0;
      guardPointers.clear();
    },
  };
}
