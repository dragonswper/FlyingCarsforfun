import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
let asset, pending;
export function loadAnimationProps() {
  if (!pending)
    pending = new GLTFLoader()
      .loadAsync('./assets/animation/stadium-pennant.glb')
      .then((gltf) => {
        const mesh = gltf.scene.getObjectByName('Original_Cloth_Pennant');
        if (!mesh?.geometry?.attributes.uv)
          throw Error('The original pennant mesh is missing.');
        asset = mesh.geometry;
        gltf.scene.traverse((node) => node.material?.dispose());
        return asset;
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
  return pending;
}
// Four team pennants outside the collision enclosure, two instanced draws on
// every field. Cloth deforms in local space; poles remain completely static.
export class ArenaFlags {
  constructor(parent) {
    this.root = new T.Group();
    this.root.name = 'Original_Animated_Stadium_Flags';
    parent.add(this.root);
    this.time = {value: 0};
    this.motion = {value: 1};
    this.pulse = {value: 0};
    this.remaining = 0;
  }
  prepare(geometry = asset) {
    if (this.cloth || !geometry) return;
    const material = new T.MeshStandardMaterial({
      color: '#ffffff',
      side: T.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        pennantTime: this.time,
        pennantMotion: this.motion,
        pennantPulse: this.pulse,
      });
      shader.vertexShader =
        'uniform float pennantTime;\nuniform float pennantMotion;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
    float phase=0.;
    #ifdef USE_INSTANCING
     phase=instanceMatrix[3].x*.19+instanceMatrix[3].z*.11;
    #endif
    transformed.z+=(sin(uv.x*7.-pennantTime*2.8+phase)*.24+sin(uv.x*13.+pennantTime*1.7+phase)*.07)*uv.x*pennantMotion;`,
      );
      shader.fragmentShader =
        'uniform float pennantPulse;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*pennantPulse*.35;',
      );
    };
    material.customProgramCacheKey = () => 'original-stadium-pennant-v1';
    this.cloth = new T.InstancedMesh(geometry, material, 4);
    this.cloth.frustumCulled = false;
    this.cloth.userData.sharedGeometry = true;
    this.poles = new T.InstancedMesh(
      new T.CylinderGeometry(0.06, 0.09, 12, 8),
      new T.MeshStandardMaterial({
        color: '#7c8e98',
        metalness: 0.6,
        roughness: 0.45,
      }),
      4,
    );
    const transform = new T.Object3D(),
      color = new T.Color();
    let i = 0;
    for (const x of [-52, 52])
      for (const z of [-62, 62]) {
        transform.position.set(x, 0, z);
        transform.rotation.set(0, x > 0 ? Math.PI : 0, 0);
        transform.updateMatrix();
        this.cloth.setMatrixAt(i, transform.matrix);
        this.cloth.setColorAt(i, color.set(z < 0 ? '#2888d8' : '#ed8137'));
        transform.position.y = 6;
        transform.updateMatrix();
        this.poles.setMatrixAt(i++, transform.matrix);
      }
    this.root.add(this.cloth, this.poles);
    this.cloth.instanceMatrix.needsUpdate = true;
    this.cloth.instanceColor.needsUpdate = true;
    this.poles.instanceMatrix.needsUpdate = true;
  }
  goal() {
    this.remaining = 1.2;
  }
  update(time, dt, reduced) {
    this.time.value = time;
    this.motion.value = reduced ? 0 : 1;
    this.remaining = Math.max(0, this.remaining - dt);
    this.pulse.value = reduced ? 0 : this.remaining / 1.2;
  }
  dispose() {
    this.root.parent?.remove(this.root);
    this.cloth?.material.dispose();
    this.poles?.geometry.dispose();
    this.poles?.material.dispose();
  }
}
export function disposeAnimationProps() {
  asset?.dispose();
  asset = null;
  pending = null;
}
