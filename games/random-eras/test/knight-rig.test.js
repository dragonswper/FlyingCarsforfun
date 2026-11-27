import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Group, Quaternion, Vector3 } from 'three';
import { bindKnightArm, limitKnightGrip, poseKnightGrip } from '../src/knight.js';

function knightSkeleton() {
  const buffer = readFileSync(new URL('../public/knight.glb', import.meta.url));
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)));
  const nodes = gltf.nodes.map(({ name, translation, rotation }) => {
    const node = new Group();
    node.name = name;
    if (translation) node.position.fromArray(translation);
    if (rotation) node.quaternion.fromArray(rotation);
    return node;
  });
  for (const [index, { children = [] }] of gltf.nodes.entries()) {
    for (const child of children) nodes[index].add(nodes[child]);
  }
  return new Group().add(...gltf.scenes[gltf.scene].nodes.map((index) => nodes[index]));
}

test('the knight glTF opens with equipped gear and complete arm chains', () => {
  const model = knightSkeleton();
  const right = bindKnightArm(model, 'negative');
  const left = bindKnightArm(model, 'positive');
  assert.equal(model.getObjectByName('sword').parent, right.grip);
  assert.equal(model.getObjectByName('shield').parent, left.grip);
  assert.equal(model.getObjectByName('dagger').parent.name, 'sheath');
  assert.equal(right.upper.getWorldPosition(new Vector3()).y, left.upper.getWorldPosition(new Vector3()).y);
});

test('knight armor keeps its bone lengths and grip placement across extreme poses', () => {
  const model = knightSkeleton();
  const poses = [[0.7, 1.05, 0.1], [0.24, 1.5, 0.55], [-0.6, 1.9, 0.75], [0.4, 1.64, 3.0]];
  for (const side of ['negative', 'positive']) {
    const arm = bindKnightArm(model, side);
    const upper = arm.upper.getWorldPosition(new Vector3());
    for (const [index, pose] of poses.entries()) {
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), index * 0.87);
      const target = new Vector3(...pose);
      const grip = limitKnightGrip(arm, target.clone(), rotation);
      poseKnightGrip(arm, target, rotation);
      model.updateMatrixWorld(true);
      const elbow = arm.forearm.getWorldPosition(new Vector3());
      const wrist = arm.hand.getWorldPosition(new Vector3());
      assert.ok(Math.abs(upper.distanceTo(elbow) - arm.upperLength) < 1e-7);
      assert.ok(Math.abs(elbow.distanceTo(wrist) - arm.lowerLength) < 1e-7);
      assert.ok(grip.distanceTo(arm.grip.getWorldPosition(new Vector3())) < 1e-7);
      const actualRotation = arm.grip.getWorldQuaternion(new Quaternion());
      assert.ok(1 - Math.abs(rotation.dot(actualRotation)) < 1e-7);
    }
  }
});
