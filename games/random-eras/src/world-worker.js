import { createWorld, worldData } from './world.js';

self.addEventListener('message', ({ data }) => {
  try {
    const world = worldData(createWorld(data.seed, data.mode, data.settings));
    const buffers = world.terrain ? [world.terrain.heights.buffer, world.terrain.flow.buffer] : [];
    self.postMessage({ world }, buffers);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
});
