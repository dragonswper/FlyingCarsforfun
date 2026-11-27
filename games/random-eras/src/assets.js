import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export async function loadModel(name, revision) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const url = `${import.meta.env.BASE_URL}${name}.glb?art=${revision}`;
  try {
    return await loader.loadAsync(url);
  } catch {
    return loader.loadAsync(url + '&retry=1');
  }
}
