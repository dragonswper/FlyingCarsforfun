import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V,Quaternion as Q} from '../dist/vendor/three.module.js';
import {makeCar,stepCar,C} from '../dist/physics.js';
import {carSupport} from '../dist/arena.js';

test('a stationary car on its roof rests without self-righting jumps or repeated landing transitions',()=>{
 const car=makeCar(0,0);car.q.setFromAxisAngle(new V(0,0,1),Math.PI);car.p.y=.5;car.grounded=false;const initial=car.q.clone();let height=0;
 for(let i=0;i<1200;i++){stepCar(car,{},C.step);height=Math.max(height,car.p.y);assert.equal(car.grounded,false);assert.ok(car.q.angleTo(initial)<1e-6);}
 assert.ok(height<=.5);assert.ok(Math.abs(car.p.y-carSupport(car,new V(0,1,0)))<1e-7);assert.ok(car.v.length()<1e-6);
});

test('boosted floor-to-wall driving maintains wheel contact and bounds surface alignment rotation',()=>{
 const car=makeCar(0,0);car.p.set(33,C.carHeight,0);car.q.setFromAxisAngle(new V(0,1,0),Math.PI/2);car.v.set(15,0,0);let peak=0,transitions=0;
 for(let i=0;i<155;i++){const ground=car.grounded,q=car.q.clone();stepCar(car,{throttle:1,boost:true},C.step,true);transitions+=ground!==car.grounded;peak=Math.max(peak,car.p.y);assert.ok(q.angleTo(car.q)<=C.maxAngularSpeed*C.step+1e-6);assert.ok(car.p.x<=C.halfWidth+1e-6);}
 assert.ok(peak>15);assert.equal(transitions,0);assert.ok(car.normal.x<-.99);
});

test('nose and side scrapes damp a flip and settle on the surface without sudden rotation',()=>{
 for(const [axis,angle,speed]of [[new V(1,0,0),1.25,5],[new V(0,0,1),1.6,5.5]]){
  const car=makeCar(0,0);car.p.set(0,.7,0);car.q.setFromAxisAngle(axis,angle);car.omega.copy(axis).multiplyScalar(speed);car.grounded=false;car.flipTime=.3;car.flipAxis.copy(axis);car.v.set(0,-2,5);let transitions=0;
  for(let i=0;i<900;i++){const q=car.q.clone(),ground=car.grounded;stepCar(car,{},C.step);transitions+=ground!==car.grounded;assert.ok(q.angleTo(car.q)<=C.maxAngularSpeed*C.step+1e-6);assert.ok(car.omega.length()<=C.maxAngularSpeed+1e-6);assert.ok(Number.isFinite(car.p.lengthSq()));assert.ok(car.p.y>=carSupport(car,new V(0,1,0))-1e-6);}
  assert.ok(transitions<=2);assert.ok(car.v.length()<.01);assert.ok(car.omega.length()<.01);assert.ok(Math.abs(car.p.y-carSupport(car,new V(0,1,0)))<1e-5);
 }
});

test('resting wheel contacts do not toggle and a real jump releases the persistent contact',()=>{
 const car=makeCar(0,0);for(let i=0;i<600;i++){stepCar(car,{},C.step);assert.equal(car.grounded,true);assert.equal(car.v.y,0);}
 stepCar(car,{jump:true},C.step);assert.equal(car.grounded,false);assert.ok(car.noContact>0);assert.ok(car.v.y>2.8);const y=car.p.y;stepCar(car,{jump:true},C.step);assert.ok(car.p.y>y);
 const wall=makeCar(0,0);wall.q.setFromUnitVectors(new V(0,1,0),new V(-1,0,0));wall.normal.set(-1,0,0);wall.p.set(C.halfWidth-carSupport(wall,wall.normal),5,0);stepCar(wall,{jump:true},C.step);assert.equal(wall.grounded,false);assert.ok(wall.v.x<-2.8);assert.ok(wall.p.x<C.halfWidth-.18);
});

test('an upside-down car can still recover with the player air-roll control',()=>{
 const car=makeCar(0,0);car.q.setFromAxisAngle(new V(0,0,1),Math.PI);car.p.y=.5;car.grounded=false;let recovered=false;
 for(let i=0;i<600;i++){stepCar(car,{roll:1},C.step);if(car.grounded){recovered=true;break;}}
 assert.equal(recovered,true);assert.ok(new V(0,1,0).applyQuaternion(car.q).y>.55);
});
