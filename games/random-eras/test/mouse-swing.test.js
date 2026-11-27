import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatTuning, makeFlick } from '../src/combat.js';
import { createMouseSwing, createRelativeMouse } from '../src/mouse-swing.js';

const { MinFlickDistance, MinFlickVelocity } = CombatTuning;

test('fast short corrections and steady turns keep their full look deltas', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(0, 30);
  assert.deepEqual(mouse.sample(1 / 120, true), { dx: 0, dy: -30, velocity: 3600, gesture: null });
  mouse.reset();
  for (let frame = 0; frame < 60; frame++) {
    mouse.addDelta(17, 0);
    const motion = mouse.sample(1 / 60, true);
    assert.equal(motion.dx, 17);
    assert.equal(motion.gesture, null);
  }
});

test('a long coherent flick works at several frame rates', () => {
  for (const fps of [30, 60, 120, 240]) {
    const mouse = createMouseSwing();
    const velocity = MinFlickDistance / 0.075;
    const frameCount = Math.ceil(0.1 * fps);
    const gestures = [];
    for (let frame = 0; frame < frameCount; frame++) {
      mouse.addDelta(0, velocity / fps);
      const { gesture } = mouse.sample(1 / fps, true);
      if (gesture) gestures.push(gesture);
    }
    assert.equal(gestures.length, 1, `${fps} FPS`);
    assert.equal(gestures[0].direction, 'DOWN');
    assert.ok(Math.abs(gestures[0].velocity - velocity) < 1e-6);
  }
});

test('jitter and a raised distance setting require a fresh, larger swipe', () => {
  const mouse = createMouseSwing();
  for (let frame = 0; frame < 30; frame++) {
    mouse.addDelta(frame % 2 ? 62 : -62, 0);
    assert.equal(mouse.sample(1 / 60, true).gesture, null);
  }
  mouse.reset();
  mouse.addDelta(MinFlickDistance * 1.35, 0);
  assert.equal(mouse.sample(1 / 60, true, 1.5).gesture, null);
  mouse.sample(0.06, true, 1.5);
  mouse.addDelta(MinFlickDistance * 1.6, 0);
  assert.equal(mouse.sample(1 / 60, true, 1.5).gesture.direction, 'RIGHT');
});

test('a slow frame contributes only the motion inside the swipe window', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(MinFlickDistance * 1.1, 0);
  const frame = mouse.sample(0.2, true);
  assert.ok(frame.velocity > MinFlickVelocity);
  assert.equal(frame.gesture, null);
  mouse.addDelta(MinFlickDistance, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture.direction, 'RIGHT');
});

test('angles select four sectors while retaining the swipe vector for rendering', () => {
  const directions = [[2, 1, 'RIGHT'], [1, 2, 'UP'], [-2, -1, 'LEFT'], [1, -2, 'DOWN']];
  for (const [x, y, category] of directions) {
    const flick = makeFlick(x, y, MinFlickVelocity);
    assert.equal(flick.direction, category);
    assert.ok(Math.abs(Math.hypot(flick.x, flick.y) - 1) < 1e-9);
    assert.equal(flick.angle, Math.atan2(y, x) * 180 / Math.PI);
  }
  assert.equal(makeFlick(1, 1, MinFlickVelocity).direction, 'UP');
  assert.equal(makeFlick(-1, 1, MinFlickVelocity).direction, 'LEFT');
  assert.equal(makeFlick(1, -1, MinFlickVelocity).direction, 'RIGHT');
  assert.equal(makeFlick(-1, -1, MinFlickVelocity).direction, 'DOWN');
});

test('a continuous swipe cannot retrigger when a locked phase opens', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(MinFlickDistance, 0);
  assert.equal(mouse.sample(1 / 60, false).gesture, null);
  mouse.addDelta(MinFlickDistance, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
  mouse.sample(0.05, true);
  mouse.addDelta(-MinFlickDistance, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture.direction, 'LEFT');
  mouse.addDelta(-MinFlickDistance, 0);
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
});

test('movement collected during a long stall is cleared', () => {
  const mouse = createMouseSwing();
  mouse.addDelta(500, 500);
  assert.equal(mouse.sample(1.2, true).gesture, null);
  assert.equal(mouse.sample(1 / 60, true).velocity, 0);
});

test('the browser listener captures only locked movement and falls back to relative mode', async (t) => {
  const previousDocument = globalThis.document;
  const mockDocument = new EventTarget();
  globalThis.document = mockDocument;
  t.after(() => { globalThis.document = previousDocument; });
  const requests = [];
  const canvas = {
    async requestPointerLock(options) {
      requests.push(options);
      if (options?.unadjustedMovement) throw new DOMException('Raw input unavailable', 'NotSupportedError');
      mockDocument.pointerLockElement = canvas;
    },
  };
  const mouse = createRelativeMouse(canvas);
  const move = () => mockDocument.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 0, movementY: -MinFlickDistance }));
  move();
  assert.equal(mouse.sample(1 / 60, true).gesture, null);
  await mouse.capture();
  assert.equal(mouse.isCaptured(), true);
  assert.deepEqual(requests, [{ unadjustedMovement: true }, undefined]);
  move();
  assert.equal(mouse.sample(1 / 60, true).gesture.direction, 'UP');
});
