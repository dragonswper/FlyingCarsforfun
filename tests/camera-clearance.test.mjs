import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V, Quaternion as Q} from '../dist/vendor/three.module.js';
import {ChaseCamera, cameraInsideArena} from '../dist/camera.js';
import {CAMERA_DEFAULTS} from '../dist/preferences.js';

const rotation=new Q(), p=new V(0,2.02,0), ball=new V(0,.9315,-5);
const clearance=1.4, motion={cameraRadius:clearance};

test('opposite ball/car camera transitions orbit around the vehicle rather than crossing it',()=>{
 for(const hz of [30,60,144,240]){
  const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,height:40};
  camera.sample(p,rotation,ball,settings,false,0,motion);
  for(let frame=0;frame<hz;frame++){
   camera.sample(p,rotation,ball,settings,true,1/hz,motion);
   assert.ok(camera.position.distanceTo(p)>=clearance-1e-6,'The transition cut through the car at '+hz+' Hz');
   assert.equal(cameraInsideArena(camera.position),true);
  }
  assert.ok(camera.position.distanceTo(camera.desired)<1e-6);
 }
});

test('short camera settings still clear the vehicle and near plane during close ball contact',()=>{
 const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,distance:100,height:40};
 for(let frame=0;frame<120;frame++){
  const q=new Q().setFromAxisAngle(new V(1,0,0),frame*.05);
  camera.sample(p,q,new V(0,.9315,Math.sin(frame*.05)),settings,true,1/120,motion);
  assert.ok(camera.position.distanceTo(p)>=clearance-1e-6,'The eye/near plane entered the car');
  assert.equal(cameraInsideArena(camera.position),true);
  assert.ok(camera.target.equals(new V(0,.9315,Math.sin(frame*.05))));
 }
});

test('wall and ceiling retraction keeps the camera inside the arena and outside the vehicle',()=>{
 const settings={...CAMERA_DEFAULTS,distance:100,height:40};
 for(const position of [new V(40.5,5,0),new V(0,20,0),new V(0,6,56),new V(8.7,4,51)]){
  const camera=new ChaseCamera();
  for(let frame=0;frame<90;frame++){
   const target=position.clone().add(new V(Math.sin(frame*.1)*3,-1,Math.cos(frame*.1)*3));
   camera.sample(position,rotation,target,settings,true,1/60,motion);
   assert.equal(cameraInsideArena(camera.position),true);
   assert.ok(camera.position.distanceTo(position)>=clearance-1e-6,'Arena retraction entered the vehicle at '+position.toArray());
  }
 }
});

test('the ordinary unobstructed camera keeps the selected distance and displayed pose at a mode switch',()=>{
 const camera=new ChaseCamera();camera.sample(p,rotation,ball,CAMERA_DEFAULTS,false,1/60,motion);
 assert.ok(camera.position.distanceTo(camera.desired)<1e-8);
 const previous=camera.position.clone(),aim=camera.look.clone().sub(camera.position).normalize();
 camera.sample(p,rotation,ball,CAMERA_DEFAULTS,true,0,motion);
 assert.ok(camera.position.distanceTo(previous)<1e-8);
 assert.ok(camera.look.clone().sub(camera.position).normalize().distanceTo(aim)<1e-8);
});
