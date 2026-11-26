import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
// One pooled path, four pooled gates and four pooled cones. No guide colliders,
// post-processing, render targets or per-frame geometry allocations.
export class AcademyGuides {
  constructor(scene) {
    this.root = new T.Group();
    this.root.name = 'Solo_Academy_Guides';
    this.root.visible = false;
    scene.add(this.root);
    this.positions = new Float32Array(91 * 3);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3));
    this.line = new T.Line(
      geometry,
      new T.LineBasicMaterial({
        color: '#6ce4fa',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    this.line.frustumCulled = false;
    this.root.add(this.line);
    this.gates = [];
    this.cones = [];
    this.stamp = -1;
    this.assets = null;
    this.disposed = false;
    this.marker = new T.Object3D();
  }
  async prepare() {
    if (this.assets) return;
    if (this.pending) return this.pending;
    this.pending = new GLTFLoader()
      .loadAsync('./assets/academy/guides.glb')
      .then(({scene}) => {
        if (this.disposed) {
          scene.traverse((o) => {
            o.geometry?.dispose();
            o.material?.dispose();
          });
          return;
        }
        this.assets = scene;
        const hoop = scene.getObjectByName('Academy_Hoop'),
          cone = scene.getObjectByName('Academy_Cone');
        if (!hoop || !cone) throw Error('Academy props are missing.');
        this.gateMaterial = new T.MeshStandardMaterial({
          color: '#59daef',
          emissive: '#087b9f',
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.8,
          roughness: 0.4,
          depthWrite: false,
        });
        for (let i = 0; i < 4; i++) {
          const g = new T.Mesh(hoop.geometry, this.gateMaterial),
            c = new T.Mesh(cone.geometry, cone.material);
          g.visible = c.visible = false;
          this.root.add(g, c);
          this.gates.push(g);
          this.cones.push(c);
        }
      })
      .catch((error) => {
        this.pending = null;
        throw error;
      });
    return this.pending;
  }
  update(sim, director, path = true) {
    this.root.visible = !!(director || path);
    if (!this.root.visible) return;
    this.line.visible = path;
    if (path) {
      const prediction = sim.prediction.update(sim.ball, sim.elapsed);
      if (this.stamp !== prediction.generation || this.source !== sim) {
        this.stamp = prediction.generation;
        this.source = sim;
        for (let i = 0; i < 91; i++)
          prediction.samples[i].p.toArray(this.positions, i * 3);
        this.line.geometry.attributes.position.needsUpdate = true;
      }
    }
    const d = director?.drill,
      targets = d?.checkpoints;
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i],
        cone = this.cones[i],
        target = targets?.[i],
        active = director?.status === 'running' && i === director.checkpoint;
      gate.visible = !!target && active;
      cone.visible = !!target && i >= director.checkpoint;
      if (target) {
        gate.position.set(target[0], 3.4, target[2]);
        cone.position.set(target[0] - 4, 0, target[2]);
        const from = i ? targets[i - 1] : [d.car[0], 0, d.car[1]];
        gate.rotation.y = Math.atan2(target[0] - from[0], target[2] - from[2]);
      }
    }
  }
  hide() {
    this.root.visible = false;
  }
  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.gateMaterial?.dispose();
    this.assets?.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}
