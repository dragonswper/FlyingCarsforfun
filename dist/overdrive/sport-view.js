import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {C} from '../constants.js';
import {HOOPS} from '../hoops-physics.js';
import {createCourtTexture} from './court-texture.js';
import {COURSE, TARGETS} from './arcade.js';
const COURSE_POINTS = COURSE.map((g) => g.p);
export class SportView {
  constructor(scene) {
    this.root = new T.Group();
    scene.add(this.root);
    this.root.visible = false;
    this.sources = [];
    this.mode = null;
    this.hoops = [];
    this.seals = [];
    this.guides = [];
    this.hurdles = [];
    this.floorMaterials = new Map();
    this.teamMaterials = [];
    this.enclosure = null;
  }
  async prepare(mode) {
    if (mode === 'hoops') {
      if (!this.hoopsPromise)
        this.hoopsPromise = Promise.all([
          new GLTFLoader().loadAsync('./assets/overdrive/hoops-basket-v2.glb'),
          new GLTFLoader().loadAsync('./assets/overdrive/hoops-arena.glb'),
        ])
          .then(([basket, venue]) => {
            const scene = basket.scene;
            this.enclosure = venue.scene;
            this.enclosure.name = 'Skyline_Hoops_Bowl';
            this.sources.push(this.enclosure);
            this.enclosure.traverse((o) => {
              if (o.isMesh) {
                o.castShadow = false;
                o.receiveShadow = true;
              }
            });
            this.root.add(this.enclosure);
            this.sources.push(scene);
            const geometry = scene.getObjectByName('Hoops_Backboard').geometry;
            this.sealMaterial = new T.MeshBasicMaterial({
              color: '#9ac5d7',
              transparent: true,
              opacity: 0.1,
              side: T.DoubleSide,
              depthWrite: false,
            });
            for (const sign of [-1, 1]) {
              const seal = new T.Mesh(geometry, this.sealMaterial);
              seal.position.set(0, C.goalHeight / 2, sign * C.halfLength);
              seal.scale.set((C.goalWidth * 2) / 14, C.goalHeight / 7, 0.5);
              this.root.add(seal);
              this.seals.push(seal);
            }
            for (const sign of [-1, 1]) {
              const copy = scene.clone(true);
              copy.position.z = sign * HOOPS.z;
              if (sign < 0) copy.rotation.y = Math.PI;
              copy.traverse((o) => {
                if (o.isMesh) {
                  if (
                    o.userData.teamAccent ||
                    o.material.name === 'Hoops_Team_Accent'
                  ) {
                    o.material = new T.MeshBasicMaterial({
                      color: sign < 0 ? '#278dff' : '#ff8d2c',
                      toneMapped: false,
                    });
                    this.teamMaterials.push(o.material);
                  }
                  if (o.name === 'Hoops_Net') o.material.side = T.DoubleSide;
                  if (o.name === 'Hoops_Backboard') {
                    o.material = o.material.clone();
                    o.material.transparent = true;
                    o.material.opacity = 0.16;
                    o.material.depthWrite = false;
                    this.teamMaterials.push(o.material);
                  }
                  o.castShadow = false;
                  o.receiveShadow = true;
                }
              });
              this.root.add(copy);
              this.hoops.push(copy);
            }
          })
          .catch((e) => {
            this.hoopsPromise = null;
            throw e;
          });
      await this.hoopsPromise;
    }
    if (['targets', 'course'].includes(mode) && !this.guides.length) {
      if (!this.guidesPromise)
        this.guidesPromise = new GLTFLoader()
          .loadAsync('./assets/academy/guides.glb')
          .then(({scene}) => {
            this.sources.push(scene);
            const original = scene.getObjectByName('Academy_Hoop');
            this.guideMaterial = new T.MeshStandardMaterial({
              color: '#ffd78a',
              emissive: '#b97b26',
              emissiveIntensity: 0.3,
              roughness: 0.55,
            });
            for (let i = 0; i < 8; i++) {
              const ring = new T.Mesh(original.geometry, this.guideMaterial);
              ring.visible = false;
              this.root.add(ring);
              this.guides.push(ring);
            }
            this.hurdleGeometry =
              scene.getObjectByName('Academy_Hurdle').geometry;
            this.hurdleMaterial = new T.MeshStandardMaterial({
              color: '#db9d49',
              roughness: 0.7,
            });
            for (const gate of COURSE.filter((g) => g.hurdle)) {
              const mesh = new T.Mesh(this.hurdleGeometry, this.hurdleMaterial);
              mesh.position.set(gate.p[0], 0, gate.p[2]);
              this.root.add(mesh);
              this.hurdles.push(mesh);
            }
          })
          .catch((e) => {
            this.guidesPromise = null;
            throw e;
          });
      await this.guidesPromise;
    }
  }
  setMode(mode, arena) {
    this.mode = mode;
    this.root.visible = ['hoops', 'course', 'targets'].includes(mode);
    for (const h of [...this.hoops, ...this.seals])
      h.visible = mode === 'hoops';
    for (const g of this.guides) g.visible = false;
    for (const h of this.hurdles) h.visible = mode === 'course';
    const football = arena.root.getObjectByName('Regulation_Football_Goals');
    if (football) football.visible = mode !== 'hoops';
    if (this.enclosure) this.enclosure.visible = mode === 'hoops';
    const roof = arena.root.getObjectByName('Visible_Ceiling_And_Goal_Ramps');
    if (roof) roof.material.opacity = mode === 'hoops' ? 0.025 : 0.045;
    if (arena.field) {
      if (!this.floorMaterials.has(arena))
        this.floorMaterials.set(arena, arena.field.material);
      if (mode === 'hoops') {
        if (!this.court) this.court = createCourtTexture();
        if (!this.woodMaterial)
          this.woodMaterial = new T.MeshStandardMaterial({
            color: '#ffffff',
            map: this.court,
            roughness: 0.44,
            metalness: 0.03,
            envMapIntensity: 0.35,
          });
        arena.field.material = this.woodMaterial;
      } else arena.field.material = this.floorMaterials.get(arena);
    }
  }

  update(director) {
    if (!director || !['targets', 'course'].includes(this.mode)) return;
    const list = this.mode === 'course' ? COURSE_POINTS : TARGETS;
    for (let i = 0; i < this.guides.length; i++) {
      const ring = this.guides[i],
        target = list[i];
      ring.visible = !!target && i === director.index;
      if (target)
        ring.position.set(
          target[0],
          this.mode === 'course' ? target[1] + 1 : target[1],
          target[2],
        );
      ring.scale.setScalar(this.mode === 'targets' ? 0.82 : 1);
    }
  }
  dispose() {
    for (const [arena, material] of this.floorMaterials)
      if (arena.field) arena.field.material = material;
    for (const material of this.teamMaterials) material.dispose();
    this.woodMaterial?.dispose();
    this.root.removeFromParent();
    for (const source of this.sources)
      source.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    this.sealMaterial?.dispose();
    this.guideMaterial?.dispose();
    this.hurdleMaterial?.dispose();
    this.court?.dispose();
  }
}
