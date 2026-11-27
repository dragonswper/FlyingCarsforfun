import { createWorld, hydrateWorld } from './world.js';

export async function prepareWorld(seed, mode, settings) {
  if (typeof Worker === 'undefined') return createWorld(seed, mode, settings);
  let worker;
  try {
    worker = new Worker(new URL('./world-worker.js', import.meta.url), { type: 'module' });
    const data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The terrain worker timed out.')), 12000);
      worker.onmessage = ({ data }) => {
        clearTimeout(timeout);
        if (data.world) resolve(data.world);
        else reject(new Error(data.error));
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('The terrain worker could not start.'));
      };
      worker.postMessage({ seed, mode, settings });
    });
    return hydrateWorld(data);
  } catch {
    return createWorld(seed, mode, settings);
  } finally {
    worker?.terminate();
  }
}
