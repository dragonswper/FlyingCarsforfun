import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V,Quaternion as Q} from '../dist/vendor/three.module.js';
import {ChaseCamera} from '../dist/camera.js';
import {CAMERA_DEFAULTS} from '../dist/preferences.js';

test('ball camera tracks the exact ball position independently of car flips, wall orientation and orbit input',()=>{
 const camera=new ChaseCamera(),p=new V(0,5,0),ball=new V(3,8,12),q=new Q();camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60);const desired=camera.desired.clone();
 for(let i=0;i<100;i++){q.setFromAxisAngle(new V(1,1,1).normalize(),i*.15);assert.equal(camera.orbit(.8,.2,true),false);camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60);assert.ok(camera.desired.distanceTo(desired)<1e-9);assert.ok(camera.target.distanceTo(ball)<1e-9);}
 camera.orbit(1,.4,false);camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60);assert.ok(camera.desired.distanceTo(desired)<1e-9);
});

test('a ball passing overhead retains a stable heading and passing behind has a bounded turn rate',()=>{
 const camera=new ChaseCamera(),p=new V(),q=new Q(),ball=new V(0,1,5);camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60);const yaw=camera.ballYaw;
 for(const point of [new V(.1,4,.1),new V(-.1,4,-.1),new V(0,8,0)]){camera.sample(p,new Q().setFromAxisAngle(new V(0,1,0),Math.PI),point,CAMERA_DEFAULTS,true,1/60);assert.equal(camera.ballYaw,yaw);assert.ok(camera.target.equals(point));}
 camera.sample(p,q,new V(0,2,-8),CAMERA_DEFAULTS,true,1/60);assert.ok(Math.abs(camera.ballYaw-yaw)<=4/60+1e-9);
});

test('free camera accepts orbit, clamps vertical look and returns to unchanged ball tracking',()=>{
 const camera=new ChaseCamera(),p=new V(),q=new Q(),ball=new V(0,1,10);camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/60);const original=camera.desired.clone();
 assert.equal(camera.orbit(Math.PI/2,20,false),true);camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/60);assert.ok(camera.desired.distanceTo(original)>2);assert.equal(camera.orbitPitch,.9);assert.equal(camera.orbit(NaN,0,false),false);
 camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60);assert.ok(Math.abs(camera.desired.x)<1e-9);assert.ok(camera.target.equals(ball));
});

test('camera remains finite around walls, corners and nearly vertical car orientations',()=>{
 const camera=new ChaseCamera(),q=new Q().setFromAxisAngle(new V(1,0,0),Math.PI/2);
 for(const p of [new V(40.7,19,48),new V(-40.7,.17,-48),new V(0,20,0)])for(const ballCam of [true,false]){camera.sample(p,q,p.clone(),CAMERA_DEFAULTS,ballCam,1/60);assert.ok(Number.isFinite(camera.desired.lengthSq()));assert.ok(Number.isFinite(camera.target.lengthSq()));assert.ok(camera.desired.y>=.4&&camera.desired.y<=20.0800001);}
});
