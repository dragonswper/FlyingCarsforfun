import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {C, makeCar, stepCar} from '../dist/physics.js';
import {arenaPlanes, arenaCeiling, roundedSurface} from '../dist/arena.js';
import {makeCustomModel, animateVehicle} from '../dist/vehicles.js';
import {ArenaPointClearance, VehicleSurfaceGuard} from '../dist/vehicle-surfaces.js';
import {VehicleCameraGuard} from '../dist/camera-vehicle.js';

const loader = new GLTFLoader();
for (const name of ['HEADLESS_TEXTURES', 'EXT_texture_webp'])
  loader.register(() => ({name, loadTexture:() => Promise.resolve(new T.Texture())}));
const bytes = fs.readFileSync(new URL('../dist/assets/models/c17.glb', import.meta.url));
const template = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
const model = () => makeCustomModel('c17', '#299bff', template);

function overlap(model) {
  const point = new T.Vector3(), query = new ArenaPointClearance(); let worst = 0;
  model.root.updateMatrixWorld(true);
  model.visual.traverse(node => {
    if (!node.isMesh) return;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      worst = Math.max(worst, -query.sample(point));
    }
  });
  return worst;
}

test('render clearance matches authoritative floor, roof, wall, corner and goal equations', () => {
  const query = new ArenaPointClearance();
  for (const x of [-41,-39,-33,-26,-9,-8,0,8,9,26,33,39,41])
    for (const z of [-61,-59,-52,-50,-47,-41,-36,0,36,41,47,50,52,59,61])
      for (const y of [-.1,.05,.3,1,2.4,5.2,6.3,7,18.2,20,20.6]) {
        const p = new T.Vector3(x,y,z);
        let gap = Math.min(y, arenaCeiling(p)-y);
        for (const {n,d,goal} of arenaPlanes(p)) gap = Math.min(gap, roundedSurface(p,n,d,goal)?.gap ?? d);
        assert.ok(Math.abs(query.sample(p)-gap)<1e-9, `surface differs at ${p.toArray()}`);
      }
});

test('the actual aircraft clears the ramp in all four corners without changing its physics pose', () => {
  const plane = model(), guard = new VehicleSurfaceGuard(plane);
  assert.ok(guard.hull.length <= 98);
  let originalOverlap = 0, correctedOverlap = 0;
  for (const sx of [-1,1]) for (const sz of [-1,1]) {
    const car = makeCar(0,0);
    car.p.set(sx*30,C.carHeight,sz*38);
    car.q.setFromAxisAngle(new T.Vector3(0,1,0),Math.atan2(sx,sz));
    car.v.set(sx*12,0,sz*12); guard.update(0,false);
    for (let tick=0;tick<100;tick++) {
      stepCar(car,{throttle:1,boost:true},C.step,true);
      if (tick%10) continue;
      plane.root.position.copy(car.p); plane.root.quaternion.copy(car.q);
      animateVehicle(plane,{speed:car.v.length(),steer:.1,dt:1/60,grounded:car.grounded});
      plane.visualOffset.set(0,0,0); originalOverlap=Math.max(originalOverlap,overlap(plane));
      const beforeP=plane.root.position.clone(), beforeQ=plane.root.quaternion.clone();
      guard.update(1/60);
      correctedOverlap=Math.max(correctedOverlap,overlap(plane));
      assert.deepEqual(plane.root.position,beforeP);assert.deepEqual(plane.root.quaternion.toArray(),beforeQ.toArray());
      assert.ok(guard.offset.length()<.8,'unreasonable visual displacement');
    }
  }
  assert.ok(originalOverlap>.3,'test must reproduce the reported clipping');
  assert.ok(correctedOverlap<.025,`actual model penetrates by ${correctedOverlap} m`);
});

test('clearance handles wall/roof/goal poses and settles without flat-ground hovering', () => {
  const plane=model(),guard=new VehicleSurfaceGuard(plane);
  for (const [p,q] of [
    [[39.9,1.3,0],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),1.1)],
    [[39.6,19.2,0],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),2.4)],
    [[0,20.2,0],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)],
    [[7.9,1.2,56],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.9)],
    [[0,6.15,56],new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)],
  ]) {
    plane.root.position.fromArray(p);plane.root.quaternion.copy(q);guard.update(0,false);guard.update(1/60);
    assert.ok(overlap(plane)<.025,`overlap at ${p}: ${overlap(plane)}`);
  }
  plane.root.position.set(0,C.carHeight,0);plane.root.quaternion.identity();
  for(let i=0;i<90;i++)guard.update(1/60);
  assert.ok(guard.offset.length()<1e-6);assert.ok(overlap(plane)<1e-6);
  guard.update(0,false);assert.equal(plane.visualOffset.length(),0);
});

test('camera clearance follows the shifted artwork and clones keep independent offsets', () => {
  const plane=model(),other=model(),guard=new VehicleSurfaceGuard(plane),otherGuard=new VehicleSurfaceGuard(other);
  assert.equal(guard.hull,otherGuard.hull,'reuse measured geometry');
  const camera=new VehicleCameraGuard(plane),radius=camera.radius;
  plane.root.position.set(35.54,.84,43.54);plane.root.quaternion.set(-.10563,.38017,.04375,.91782).normalize();guard.update(1/60);
  assert.ok(plane.visualOffset.length()>.1);assert.equal(other.visualOffset.length(),0);
  assert.ok(camera.radius>radius);
  const center=camera.bounds.getCenter(new T.Vector3()).add(plane.visualOffset).applyQuaternion(plane.root.quaternion).add(plane.root.position);
  assert.equal(camera.update(center,new T.Vector3(),plane.root.position,plane.root.quaternion,false,1/60),0);
});
