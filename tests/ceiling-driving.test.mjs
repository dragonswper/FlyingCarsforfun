import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3 as V,Quaternion as Q,Matrix4} from '../dist/vendor/three.module.js';
import {makeCar,stepCar,C} from '../dist/physics.js';

function surfaceCar(position,normal,forward,speed=14){
 const car=makeCar(0,0),right=new V().crossVectors(normal,forward).normalize();
 car.p.copy(position);car.normal.copy(normal);car.q.setFromRotationMatrix(new Matrix4().makeBasis(right,normal,forward));car.v.copy(forward).multiplyScalar(speed);car.grounded=true;return car;
}
test('a car can continue from the side wall onto the field ceiling with wheel contact',()=>{
 const car=surfaceCar(new V(C.halfWidth-C.carHeight,C.height-6,0),new V(-1,0,0),new V(0,1,0));
 let ceilingTicks=0;
 for(let i=0;i<360;i++){
  stepCar(car,{throttle:1},C.step,true);
  if(car.grounded&&car.normal.y<-.8)ceilingTicks++;
  assert.ok(car.p.y<C.height+.001);assert.ok(Number.isFinite(car.p.lengthSq()));
 }
 assert.ok(ceilingTicks>60,'The car could not round the top edge and drive upside down: '+ceilingTicks);
 assert.ok(car.p.x<C.halfWidth-5);
});
test('ceiling traction supports driving and jump deliberately releases the wheels',()=>{
 const car=surfaceCar(new V(0,C.height-C.carHeight,0),new V(0,-1,0),new V(0,0,1));
 for(let i=0;i<120;i++)stepCar(car,{throttle:1},C.step,true);
 assert.equal(car.grounded,true);assert.ok(car.normal.y<-.99);
 assert.ok(Math.abs(car.p.y-(C.height-C.carHeight))<.03);
 stepCar(car,{throttle:1,jump:true},C.step,true);
 for(let i=0;i<8;i++)stepCar(car,{jump:true},C.step,true);
 assert.equal(car.grounded,false);assert.ok(car.v.y< -2);assert.ok(car.p.y<C.height-.3);
});
for(const sign of [-1,1])test('a car rounds the back of goal '+sign+' onto its interior roof',()=>{
 const normal=new V(0,0,-sign),forward=new V(0,1,0),car=surfaceCar(new V(0,2,sign*(C.halfLength+C.goalDepth-C.carHeight)),normal,forward,9);
 let roofTicks=0;
 for(let i=0;i<135;i++){
  stepCar(car,{throttle:1},C.step,true);
  if(car.grounded&&car.normal.y<-.7)roofTicks++;
  assert.ok(car.p.y<C.goalHeight+.02);assert.ok(Math.abs(car.p.z)<C.halfLength+C.goalDepth+.02);
 }
 assert.ok(roofTicks>12,'No upside-down wheel contact inside the goal');
});
