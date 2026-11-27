/* Bundled CC0 Kenney assets. Procedural fallbacks remain if loading fails. */
(() => {
  'use strict';
  const B = window.BABYLON;
  const caches = new WeakMap();
  const files = { pine: 'tree-pinetalla-detailed.glb', oak: 'tree-oak.glb', rock: 'rock-largea.glb', grass: 'grass-large.glb', logs: 'log-stack.glb', cloud: 'cloud.glb' };
  let failed = false;
  function container(scene, kind) {
    let cache = caches.get(scene);
    if (!cache) { cache = new Map(); caches.set(scene, cache); }
    if (!cache.has(kind)) cache.set(kind, B.SceneLoader.LoadAssetContainerAsync('./assets/models/', files[kind], scene));
    return cache.get(kind);
  }
  window.RiftAssets = Object.freeze({
    async place(scene, kind, x, z, height, shadows, fallback = [], y = 0) {
      try {
        const asset = await container(scene, kind);
        if (scene.isDisposed) return;
        const instance = asset.instantiateModelsToScene(n => `${kind}-${n}`, false, { doNotInstantiate: false });
        const root = new B.TransformNode(`kenney-${kind}`, scene);
        instance.rootNodes.forEach(n => { n.parent = root; });
        root.computeWorldMatrix(true);
        root.getChildMeshes().forEach(m => m.computeWorldMatrix(true));
        const bounds = root.getHierarchyBoundingVectors(true);
        const factor = height / Math.max(.01, bounds.max.y - bounds.min.y);
        root.scaling.setAll(factor);
        root.position.set(x - (bounds.min.x + bounds.max.x) * .5 * factor, y - bounds.min.y * factor, z - (bounds.min.z + bounds.max.z) * .5 * factor);
        root.getChildMeshes().forEach(mesh => {
          if (mesh.sourceMesh) mesh.sourceMesh.receiveShadows = true; else mesh.receiveShadows = true;
          mesh.isPickable = kind === 'pine' || kind === 'oak' || kind === 'rock';
          if (mesh.isPickable) mesh.metadata = { blocker: true };
          if (kind !== 'grass' && kind !== 'cloud') shadows?.addShadowCaster(mesh);
        });
        fallback.forEach(m => { if (!m.isDisposed()) m.dispose(); });
        return root;
      } catch (error) {
        if (!failed && !scene.isDisposed) { failed = true; console.warn('Optional 3D art unavailable; using built-in scenery.', error.message); }
      }
    }
  });
})();
