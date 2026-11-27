import { MeshLambertMaterial } from 'three';
import { loadModel } from './assets.js';

let request;
export const foliageWind = { value: 0 };

function makeFinish(mesh, animated) {
  const material = new MeshLambertMaterial({
    map: mesh.material.map, side: mesh.material.side, vertexColors: mesh.geometry.hasAttribute('color'),
  });
  if (animated) material.onBeforeCompile = (program) => {
    program.uniforms.foliageWind = foliageWind;
    program.vertexShader = 'uniform float foliageWind;\n' + program.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.x += transformed.y * transformed.y * foliageWind;');
  };
  return material;
}


export function loadMapKit() {
  request ??= Promise.all(['map-kit', 'era-props'].map((name) => loadModel(name, 2)))
    .then((groups) => {
      const kit = new Map();
      const finishes = new Map();
      for (const variant of groups.flatMap(({ scene }) => scene.children)) {
        const parts = [];
        variant.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const source = mesh.material;
          const animated = variant.name === 'grass' || variant.name === 'bush';
          const finish = `${source.map?.uuid ?? 'plain'}/${source.side}/${mesh.geometry.hasAttribute('color')}/${animated}`;
          if (!finishes.has(finish)) finishes.set(finish, makeFinish(mesh, animated));
          const name = source.name.toLowerCase();
          const colorSlot = name.includes('bark') ? 'bark' : name.startsWith('grass') ? 'grass' : 'main';
          // Each mesh is packed in unit bounds with its bottom at Y = 0.
          parts.push({ id: `kit/${variant.name}/${parts.length}`, geometry: mesh.geometry, material: finishes.get(finish), colorSlot });
        });
        if (parts.length) kit.set(variant.name, parts);
      }
      return kit;
    }).catch((error) => {
      request = undefined;
      throw error;
    });
  return request;
}
