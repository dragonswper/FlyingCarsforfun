import * as T from '../vendor/three.module.js';

export class BoostPadView {
  constructor(parent, pads) {
    this.pads = pads;
    this.matrix = new T.Matrix4();
    this.position = new T.Vector3();
    this.scale = new T.Vector3();
    this.rotation = new T.Quaternion();
    this.color = new T.Color();
    this.active = new Uint8Array(pads.length);
    this.active.fill(2);
    this.appearance = new Float32Array(pads.length);
    this.appearance.fill(1);
    const baseMat = new T.MeshStandardMaterial({
      color: '#101d2c',
      roughness: 0.7,
      metalness: 0.18,
    });
    this.bases = new T.InstancedMesh(
      new T.CylinderGeometry(1.25, 1.3, 0.08, 12),
      baseMat,
      pads.length,
    );
    this.rings = new T.InstancedMesh(
      new T.TorusGeometry(1, 0.09, 5, 24),
      new T.MeshBasicMaterial({color: '#ffd17a', toneMapped: false}),
      pads.length,
    );
    this.orbs = new T.InstancedMesh(
      new T.SphereGeometry(1, 12, 8),
      new T.MeshStandardMaterial({
        color: '#ffd17a',
        emissive: '#ffb13f',
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.2,
      }),
      pads.length,
    );
    for (const [name, mesh] of [
      ['Bases', this.bases],
      ['Rings', this.rings],
      ['Orbs', this.orbs],
    ]) {
      mesh.name = 'Boost_Pad_' + name;
      mesh.frustumCulled = false;
      parent.add(mesh);
    }
    this.orbs.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.rings.instanceMatrix.setUsage(T.StaticDrawUsage);
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i],
        r = p.big ? 0.78 : 0.36;
      this.position.set(p.p.x, 0.05, p.p.z);
      this.scale.set(r, 1, r);
      this.rotation.identity();
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.bases.setMatrixAt(i, this.matrix);
      this.position.set(p.p.x, 0.13, p.p.z);
      this.rotation.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
      this.scale.setScalar(r);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.rings.setMatrixAt(i, this.matrix);
    }
    this.bases.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.update(pads, 0);
  }
  update(pads, time, dt = 1 / 60, reduced = false) {
    let colorsChanged = false;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i],
        active = p.timer <= 0 ? 1 : 0;
      if (this.active[i] !== active) {
        if (this.active[i] === 0 && active) this.appearance[i] = 0.01;
        this.active[i] = active;
        this.color.setScalar(active ? 1 : 0.12);
        this.rings.setColorAt(i, this.color);
        colorsChanged = true;
      }
      this.appearance[i] = reduced
        ? 1
        : Math.min(1, this.appearance[i] + Math.max(0, Math.min(0.1, dt)) * 7);
      const ease = 1 - Math.pow(1 - this.appearance[i], 3);
      this.position.set(p.p.x, 0.07, p.p.z);
      this.position.y +=
        (p.big ? 0.55 : 0.22) + (reduced ? 0 : Math.sin(time * 2 + i) * 0.045);
      this.rotation.setFromAxisAngle(
        T.Object3D.DEFAULT_UP,
        reduced ? 0 : time * 1.6,
      );
      this.scale.setScalar(active ? (p.big ? 0.35 : 0.14) * ease : 0);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.orbs.setMatrixAt(i, this.matrix);
    }
    this.orbs.instanceMatrix.needsUpdate = true;
    if (colorsChanged) this.rings.instanceColor.needsUpdate = true;
  }
}
