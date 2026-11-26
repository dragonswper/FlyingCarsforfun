import {GLTFLoader} from '../vendor/GLTFLoader.js';
export class ClubTrophy {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.pending = null;
    this.disposed = false;
    this.active = false;
  }
  async prepare() {
    if (this.root) return;
    if (this.pending) return this.pending;
    this.pending = new GLTFLoader()
      .loadAsync('./assets/club/circuit-cup.glb')
      .then(({scene}) => {
        if (this.disposed) {
          scene.traverse((o) => {
            o.geometry?.dispose();
            o.material?.dispose();
          });
          return;
        }
        this.root = scene;
        scene.name = 'Original_Circuit_Cup_Trophy';
        scene.position.set(.5, 0, -3.2);
        scene.scale.setScalar(.4);
        scene.visible = this.active;
        scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(scene);
      })
      .catch((e) => {
        this.pending = null;
        throw e;
      });
    return this.pending;
  }
  update(visible) {
    this.active = visible;
    if (this.root) this.root.visible = visible;
  }
  dispose() {
    this.disposed = true;
    this.root?.removeFromParent();
    this.root?.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}
