import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3 as V,Quaternion as Q} from '../dist/vendor/three.module.js';
import {ChaseCamera,cameraInsideArena} from '../dist/camera.js';
import {CAMERA_DEFAULTS} from '../dist/preferences.js';
import {makeCar,stepCar,C} from '../dist/physics.js';
import {Matrix4} from '../dist/vendor/three.module.js';

const p=new V(0,5,0),ball=new V(0,2,20),q=new Q(),direction=c=>c.look.clone().sub(c.position).normalize();
test('persistent free look keeps its chosen direction through rising, falling and aerial flips',()=>{
 const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,lookStyle:'free'};
 camera.sample(p,q,ball,settings,false,1/120,{grounded:false,velocity:new V(0,0,10)});
 for(let i=0;i<120;i++)camera.sample(p,q,ball,settings,false,1/120,{grounded:false,velocity:new V(0,0,10)});
 const chosen=direction(camera);
 for(let i=0;i<240;i++){
  camera.sample(p,new Q().setFromAxisAngle(new V(1,0,0),i*.08),ball,settings,false,1/120,{grounded:false,velocity:new V(0,Math.sin(i*.03)*20,10)});
  assert.ok(direction(camera).distanceTo(chosen)<1e-6,'Aerial motion overrode the chosen free-look direction');
 }
});
test('classic car cam does not perform a half-turn during a forward aerial pitch flip',()=>{
 const camera=new ChaseCamera();camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/120,{grounded:true,speed:12});
 for(let i=0;i<200;i++){
  camera.sample(p,new Q().setFromAxisAngle(new V(1,0,0),i*Math.PI*2/199),ball,CAMERA_DEFAULTS,false,1/120,{grounded:false,speed:12,velocity:new V(0,0,12)});
  assert.ok(Math.abs(camera.carYaw)<.1,'Pitching the chassis spun the follow camera');
 }
});
test('small reverse-speed corrections do not alternate the camera between forward and backward',()=>{
 const camera=new ChaseCamera();camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/120,{speed:-3});
 for(let i=0;i<240;i++)camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/120,{speed:-3});
 const before=camera.carYaw;
 for(let i=0;i<240;i++)camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/120,{speed:-1+Math.sin(i)*.2});
 assert.ok(Math.abs(Math.atan2(Math.sin(camera.carYaw-before),Math.cos(camera.carYaw-before)))<.1);
});
test('wall obstruction changes do not teleport the free camera around the vehicle',()=>{
 const camera=new ChaseCamera(),position=new V(40.4,5,0),settings={...CAMERA_DEFAULTS,lookStyle:'free',distance:100,height:40};
 camera.sample(position,q,ball,settings,false,1/120,{cameraRadius:1.46});let previous=camera.position.clone();
 for(let i=0;i<900;i++){
  camera.stick(.5,Math.sin(i*.02)*.4,false);
  camera.sample(position,q,ball,settings,false,1/120,{cameraRadius:1.46});
  assert.ok(camera.position.distanceTo(previous)<.18,'The wall solver jumped to another side of the car');
  assert.equal(cameraInsideArena(camera.position),true);previous.copy(camera.position);
 }
});
test('free camera stays in the goal and remains continuous while driving onto its roof',()=>{
 for(const sign of [-1,1]){
  const car=makeCar(0,0),normal=new V(0,0,-sign),forward=new V(0,1,0),right=new V().crossVectors(normal,forward);
  car.p.set(0,2,sign*(C.halfLength+C.goalDepth-C.carHeight));car.normal.copy(normal);car.q.setFromRotationMatrix(new Matrix4().makeBasis(right,normal,forward));car.v.copy(forward).multiplyScalar(9);car.grounded=true;
  const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,lookStyle:'free'};let previous=null,roofFrames=0;
  for(let i=0;i<135;i++){
   stepCar(car,{throttle:1},C.step,true);camera.sample(car.p,car.q,ball,settings,false,C.step,{grounded:car.grounded,velocity:car.v,cameraRadius:1.46});
   assert.equal(cameraInsideArena(camera.position),true);
   if(previous)assert.ok(previous.distanceTo(camera.position)<.4,'Goal camera jumped at a curved surface');previous=camera.position.clone();
   if(car.grounded&&car.normal.y<-.7)roofFrames++;
  }
  assert.ok(roofFrames>12);
 }
});
