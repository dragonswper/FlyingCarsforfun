import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {AnimationSystem} from '../dist/animation/system.js';
import {animateVehicle} from '../dist/animation/vehicle.js';
import {animateBoost} from '../dist/animation/boost.js';
import {ArenaFlags} from '../dist/animation/flags.js';
import {bindEnvironmentMotion} from '../dist/animation/environment.js';
import {BoostPadView} from '../dist/animation/field.js';
import {createPads} from '../dist/physics.js';
const rig = () => ({
  root: new T.Group(),
  chassis: new T.Group(),
  flame: new T.Group(),
  wheels: [
    {pivot: new T.Group(), rolling: new T.Group(), front: true, radius: 0.2},
  ],
  lastSpeed: 0,
});
test('wheel travel is frame-rate independent; landing compresses only the chassis and settles', () => {
  const a = rig(),
    b = rig();
  a.root.position.set(2, 5, 4);
  const root = a.root.position.clone();
  for (let i = 0; i < 60; i++) animateVehicle(a, {speed: 2, dt: 1 / 60});
  for (let i = 0; i < 144; i++) animateVehicle(b, {speed: 2, dt: 1 / 144});
  assert.ok(
    Math.abs(a.wheels[0].rolling.rotation.x - b.wheels[0].rolling.rotation.x) <
      1e-10,
  );
  for (let i = 0; i < 60; i++)
    animateVehicle(a, {speed: 2, dt: 1 / 60, grounded: false});
  animateVehicle(a, {speed: 2, dt: 1 / 60, grounded: true});
  assert.ok(a.chassis.position.y < -0.01);
  assert.deepEqual(a.root.position, root);
  assert.equal(a.wheels[0].pivot.position.y, 0);
  for (let i = 0; i < 180; i++) animateVehicle(a, {dt: 1 / 60});
  assert.ok(Math.abs(a.chassis.position.y) < 1e-5);
  const pose = a.chassis.position.clone();
  animateVehicle(a, {dt: NaN, speed: Infinity});
  assert.deepEqual(a.chassis.position, pose);
  assert.equal(b.chassis.position.y === a.chassis.position.y, false);
});
test('boost ignition and release are bounded and stop without leaving a visible flame', () => {
  const model = rig();
  animateBoost(model, true, 1 / 60, 0);
  assert.ok(model.flame.scale.z > 0 && model.flame.scale.z < 1);
  for (let i = 0; i < 120; i++) animateBoost(model, false, 1 / 60, i / 60);
  assert.equal(model.flame.visible, false);
  assert.equal(model.flame.scale.z, 0);
});
test('reduced motion stops ambient animation but keeps mechanical input responsive', () => {
  const media = {matches: false},
    system = new AnimationSystem({media}),
    model = rig();
  system.begin(0.02);
  const ambient = system.ambientTime;
  media.matches = true;
  system.begin(0.02);
  assert.equal(system.ambientTime, ambient);
  system.vehicle(model, {speed: 6, steer: 1, grounded: true}, true);
  assert.ok(model.wheels[0].rolling.rotation.x > 0);
  assert.ok(model.wheels[0].pivot.rotation.y > 0);
  assert.equal(model.chassis.rotation.z, 0);
  assert.equal(model.chassis.position.y, 0);
  system.configure('full');
  system.begin(500);
  assert.ok(Math.abs(system.ambientTime - ambient - 0.1) < 1e-9);
  system.begin(NaN);
  assert.ok(Number.isFinite(system.time));
  system.dispose();
});
test('wind binds once, preserves frozen instance matrices and leaves solid scenery untouched', () => {
  const root = new T.Group(),
    leaves = new T.InstancedMesh(
      new T.ConeGeometry(),
      new T.MeshStandardMaterial(),
      3,
    ),
    wall = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial());
  leaves.name = 'Pine_Foliage';
  root.add(leaves, wall);
  const original = leaves.material,
    wallMaterial = wall.material,
    matrix = leaves.instanceMatrix.array.slice();
  const binding = bindEnvironmentMotion(root);
  assert.equal(binding.count, 1);
  assert.notEqual(leaves.material, original);
  assert.equal(wall.material, wallMaterial);
  const shader = {uniforms: {}, vertexShader: '#include <begin_vertex>'};
  leaves.material.onBeforeCompile(shader);
  binding.update(3);
  assert.equal(shader.uniforms.arenaWindTime.value, 3);
  binding.update(4, true);
  assert.equal(shader.uniforms.arenaWindStrength.value, 0);
  assert.deepEqual(leaves.instanceMatrix.array, matrix);
  binding.dispose();
});
test('actual Blender pennant loads in Y-up metres and all fields share two instanced draws', async () => {
  const bytes = readFileSync(
    new URL('../dist/assets/animation/stadium-pennant.glb', import.meta.url),
  );
  assert.ok(bytes.length < 20000);
  const gltf = await new Promise((resolve, reject) =>
    new GLTFLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
      resolve,
      reject,
    ),
  );
  const mesh = gltf.scene.getObjectByName('Original_Cloth_Pennant');
  mesh.geometry.computeBoundingBox();
  assert.ok(mesh.geometry.boundingBox.min.y >= 9.99);
  assert.ok(mesh.geometry.boundingBox.max.y <= 11.71);
  assert.equal(mesh.geometry.index.count / 3, 192);
  const parent = new T.Scene(),
    flags = new ArenaFlags(parent);
  flags.prepare(mesh.geometry);
  flags.prepare(mesh.geometry);
  assert.equal(flags.root.children.length, 2);
  assert.equal(flags.cloth.count, 4);
  assert.equal(flags.poles.count, 4);
  flags.goal();
  flags.update(2, 0.1, false);
  assert.ok(flags.pulse.value > 0);
  flags.update(3, 0.1, true);
  assert.equal(flags.pulse.value, 0);
  assert.equal(flags.motion.value, 0);
  let disposed = false;
  mesh.geometry.addEventListener('dispose', () => (disposed = true));
  flags.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(disposed, false);
  mesh.geometry.dispose();
});
test('pickup animation remains bounded through repeated respawns and adds no draw calls', () => {
  const scene = new T.Scene(),
    pads = createPads(),
    view = new BoostPadView(scene, pads),
    matrix = new T.Matrix4();
  for (let i = 0; i < 100; i++) {
    pads[0].timer = 2;
    view.update(pads, i);
    view.orbs.getMatrixAt(0, matrix);
    assert.equal(matrix.determinant(), 0);
    pads[0].timer = 0;
    view.update(pads, i + 0.01, 0.01);
    view.orbs.getMatrixAt(0, matrix);
    assert.ok(matrix.determinant() > 0);
  }
  assert.equal(scene.children.length, 3);
  assert.equal(view.appearance.length, 34);
  view.update(pads, 2, 1 / 60, true);
  assert.equal(view.appearance[0], 1);
  scene.traverse((node) => {
    node.geometry?.dispose();
    node.material?.dispose();
  });
});
