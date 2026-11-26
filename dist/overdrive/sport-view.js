import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {C} from '../constants.js';
import {HOOPS} from '../hoops-physics.js';
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
    this.floorMaps = new Map();
  }
  async prepare(mode) {
    if (mode === 'hoops' && !this.hoops.length) {
      if (!this.hoopsPromise)
        this.hoopsPromise = new GLTFLoader()
          .loadAsync('./assets/overdrive/hoops-basket.glb')
          .then(({scene}) => {
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
    if (arena.field) {
      if (!this.floorMaps.has(arena))
        this.floorMaps.set(arena, arena.field.material.map);
      if (mode === 'hoops') {
        if (!this.court) this.court = this.courtTexture();
        arena.field.material.map = this.court;
      } else arena.field.material.map = this.floorMaps.get(arena);
      arena.field.material.needsUpdate = true;
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
  courtTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1280;
    const c = canvas.getContext('2d');
    c.fillStyle = '#3e6679';
    c.fillRect(0, 0, 1024, 1280);
    const x = (v) => ((v + C.halfWidth) / (C.halfWidth * 2)) * 1024,
      z = (v) => ((C.halfLength - v) / (C.halfLength * 2)) * 1280;
    c.strokeStyle = '#cce4ed';
    c.lineWidth = 4;
    c.strokeRect(x(-37), z(47), x(37) - x(-37), z(-47) - z(47));
    c.beginPath();
    c.moveTo(x(-37), z(0));
    c.lineTo(x(37), z(0));
    c.stroke();
    for (const sign of [-1, 1]) {
      c.beginPath();
      c.ellipse(
        x(0),
        z(sign * HOOPS.z),
        (HOOPS.radius * 1024) / (C.halfWidth * 2),
        (HOOPS.radius * 1280) / (C.halfLength * 2),
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      c.beginPath();
      c.ellipse(
        x(0),
        z(sign * 31),
        (10 * 1024) / (C.halfWidth * 2),
        (10 * 1280) / (C.halfLength * 2),
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  dispose() {
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
