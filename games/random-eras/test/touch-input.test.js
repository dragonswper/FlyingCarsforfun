import test from "node:test";
import assert from "node:assert/strict";
import { createTouchState } from "../src/touch-state.js";
import { createSettingsStore } from "../src/settings.js";

test("touch movement points forward when pushed up, clamps diagonals and returns to rest", () => {
  const input = createTouchState();
  input.move(0, -1);
  assert.equal(input.forward, 1);
  assert.equal(input.sprint, true);
  input.move(1, 1);
  assert.ok(Math.hypot(input.x, input.forward) <= 1.00001);
  input.move(0.05, 0.05);
  assert.equal(input.x, 0);
  assert.equal(input.forward, 0);
  input.move(-0.8, 0);
  assert.ok(input.x < 0);
  input.reset();
  assert.equal(input.x, 0);
  assert.equal(input.forward, 0);
});
test("multi-finger guard releases correctly and a pause clears every held action", () => {
  const input = createTouchState();
  input.guardDown(1);
  input.guardDown(2);
  input.release(1);
  assert.equal(input.guard, true);
  input.release(2);
  assert.equal(input.guard, false);
  input.guardDown(3);
  input.move(0, -1);
  input.look(20, 30);
  input.reset();
  assert.equal(input.guard, false);
  assert.equal(input.sprint, false);
  assert.deepEqual(input.consumeLook(), { dx: 0, dy: 0 });
});
test("look motion is consumed once and cannot carry invalid or unbounded values into the camera", () => {
  const input = createTouchState();
  input.look(10, 20);
  input.look(3, -5);
  assert.deepEqual(input.consumeLook(), { dx: 13, dy: 15 });
  assert.deepEqual(input.consumeLook(), { dx: 0, dy: 0 });
  input.look(NaN, Infinity);
  assert.deepEqual(input.consumeLook(), { dx: 0, dy: 0 });
  input.look(10000, -10000);
  assert.deepEqual(input.consumeLook(), { dx: 600, dy: -600 });
});
test("touch graphics defaults remain light while saved player choices still win", () => {
  const memory = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  const fresh = createSettingsStore(memory, { touch: true });
  assert.equal(fresh.state.quality, "low");
  assert.equal(fresh.state.resolution, 0.75);
  assert.equal(fresh.state.fps, "30");
  const saved = createSettingsStore(
    {
      getItem(key) {
        return key.endsWith(".v2")
          ? JSON.stringify({ quality: "high", resolution: 1 })
          : null;
      },
      setItem() {},
    },
    { touch: true },
  );
  assert.equal(saved.state.quality, "high");
  assert.equal(saved.state.resolution, 1);
});
