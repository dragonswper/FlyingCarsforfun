import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3 as V, Quaternion as Q, PerspectiveCamera} from '../dist/vendor/three.module.js';
import {ChaseCamera, cameraInsideArena, constrainCamera} from '../dist/camera.js';
import {CAMERA_DEFAULTS, DEFAULT_BINDINGS, normalizeCamera, normalizeBindings} from '../dist/preferences.js';
import {gamepadPreferences, PAD_DEFAULTS} from '../dist/gamepad-preferences.js';
import {Input} from '../dist/input.js';
import {C} from '../dist/constants.js';

const p = new V(0, 1, 0), q = new Q(), ball = new V(12, 4, 10);
const near = (a,b,e=1e-6) => assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const direction = camera => camera.look.clone().sub(camera.position).normalize();
function advance(camera, seconds=1, {settings=CAMERA_DEFAULTS, ballCam=false, motion={}, hz=120, position=p, rotation=q, target=ball}={}) {
 for(let i=0;i<Math.round(seconds*hz);i++)camera.sample(position,rotation,target,settings,ballCam,1/hz,motion);
 return camera;
}

test('speed effects add smooth pullback/FOV, respect stiffness and can be disabled',()=>{
 const loose=new ChaseCamera(),stiff=new ChaseCamera(),off=new ChaseCamera();
 advance(loose,3,{settings:{...CAMERA_DEFAULTS,stiffness:0},motion:{speed:C.maxSpeed}});
 advance(stiff,3,{settings:{...CAMERA_DEFAULTS,stiffness:1},motion:{speed:C.maxSpeed}});
 advance(off,3,{settings:{...CAMERA_DEFAULTS,speedEffect:0},motion:{speed:C.maxSpeed}});
 assert.ok(loose.distance>3.59&&loose.distance<3.61);
 near(stiff.distance,2.7);near(off.distance,2.7);near(off.fov,110);
 assert.ok(loose.fov>116.99&&loose.fov<=117);
 const before=loose.fov;advance(loose,.1,{motion:{speed:0}});assert.ok(loose.fov<before&&loose.fov>110);
});

test('speed response and controller Free Look are independent of display refresh rate',()=>{
 const results=[];
 for(const hz of [30,60,144,240]){
  const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,lookStyle:'free'};
  camera.stick(.4,.1,false);advance(camera,1,{settings,hz,motion:{speed:20}});
  camera.stick(0,0,false);advance(camera,1,{settings,hz,motion:{speed:20}});
  results.push({fov:camera.fov,yaw:camera.freeYaw,pitch:camera.freePitch});
 }
 for(const value of results){near(value.fov,results[0].fov);near(value.yaw,results[0].yaw);near(value.pitch,results[0].pitch);}
});

test('maximum stiffness anchors car cam without retaining a follow offset',()=>{
 const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,stiffness:1};advance(camera,1,{settings});
 const rotation=new Q().setFromAxisAngle(new V(0,1,0),.7);
 camera.sample(p,rotation,ball,settings,false,1/120,{speed:15});
 near(camera.carYaw,.7);assert.ok(camera.position.distanceTo(camera.desired)<1e-8);
});

test('camera switches and rapid toggles start from the displayed pose and aim',()=>{
 const camera=advance(new ChaseCamera()),before=camera.position.clone(),aim=direction(camera);
 camera.sample(p,q,ball,CAMERA_DEFAULTS,true,0);
 assert.ok(camera.position.distanceTo(before)<1e-8);assert.ok(direction(camera).distanceTo(aim)<1e-8);
 advance(camera,.1,{ballCam:true});const midway=camera.position.clone(),midAim=direction(camera);
 camera.sample(p,q,ball,CAMERA_DEFAULTS,false,0);
 assert.ok(camera.position.distanceTo(midway)<1e-8);assert.ok(direction(camera).distanceTo(midAim)<1e-8);
 advance(camera,1);assert.equal(camera.transition,null);
});

test('mode transition speed and manual swivel speed are independent controls',()=>{
 const slow=advance(new ChaseCamera()),fast=advance(new ChaseCamera());
 const initial=slow.position.clone();
 slow.sample(p,q,ball,{...CAMERA_DEFAULTS,transitionSpeed:.5},true,0);
 fast.sample(p,q,ball,{...CAMERA_DEFAULTS,transitionSpeed:2},true,0);
 advance(slow,.2,{settings:{...CAMERA_DEFAULTS,transitionSpeed:.5},ballCam:true});
 advance(fast,.2,{settings:{...CAMERA_DEFAULTS,transitionSpeed:2},ballCam:true});
 assert.ok(fast.position.distanceTo(initial)>slow.position.distanceTo(initial)*1.5);
 const a=new ChaseCamera(),b=new ChaseCamera();a.stick(1,0,false);b.stick(1,0,false);
 advance(a,.2,{settings:{...CAMERA_DEFAULTS,swivelSpeed:1}});advance(b,.2,{settings:{...CAMERA_DEFAULTS,swivelSpeed:10}});
 assert.ok(Math.abs(b.stickYaw)>Math.abs(a.stickYaw)*3);
});

test('classic controller/mouse look returns on release but persistent Free Look keeps its direction',()=>{
 const classic=new ChaseCamera();advance(classic);classic.drag(true);classic.orbit(1,.4,false);classic.stick(1,.2,false);advance(classic,1);
 assert.ok(classic.orbitYaw>.99);classic.drag(false);classic.stick(0,0,false);advance(classic,1);
 assert.ok(Math.abs(classic.orbitYaw)+Math.abs(classic.stickYaw)+Math.abs(classic.stickPitch)<1e-5);
 const free=new ChaseCamera(),settings={...CAMERA_DEFAULTS,lookStyle:'free'};
 advance(free,1,{settings});free.orbit(1,.4,false);advance(free,1,{settings});
 const yaw=free.freeYaw;advance(free,1,{settings,rotation:new Q().setFromAxisAngle(new V(0,1,0),1)});
 near(free.freeYaw,yaw);near(free.freePitch,.4);
 assert.equal(free.recenter(),true);advance(free,1,{settings});near(free.freeYaw,free.carYaw);near(free.freePitch,0);
});

test('ball cam discards manual offsets and keeps a level horizon through chassis rolls',()=>{
 const camera=new ChaseCamera(),render=new PerspectiveCamera();advance(camera,1,{ballCam:true});
 const previous=camera.position.clone();
 for(let i=0;i<80;i++){
  camera.stick(1,1,true);camera.drag(true,true);assert.equal(camera.orbit(1,.5,true),false);assert.equal(camera.recenter(true),false);
  camera.sample(p,new Q().setFromAxisAngle(new V(1,1,0).normalize(),i*.2),ball,CAMERA_DEFAULTS,true,1/120);
  assert.ok(camera.position.distanceTo(previous)<1e-8);assert.ok(camera.target.equals(ball));
  render.position.copy(camera.position);render.up.set(0,1,0);render.lookAt(camera.look);
  near(new V(1,0,0).applyQuaternion(render.quaternion).y,0);
 }
});

test('camera yaw takes the short path across the angle wrap boundary',()=>{
 const camera=new ChaseCamera(),rotation=new Q().setFromAxisAngle(new V(0,1,0),179*Math.PI/180),target=new V(-.17,1,-10);
 advance(camera,1,{rotation});const before=direction(camera);
 camera.sample(p,rotation,target,CAMERA_DEFAULTS,true,0);advance(camera,.1,{rotation,ballCam:true,target});
 assert.ok(direction(camera).dot(before)>.95,'The mode switch spun the long way around');
});

test('close and overhead ball crossings never cause a one-frame camera half-turn',()=>{
 const camera=advance(new ChaseCamera(),1,{ballCam:true});let previous=direction(camera);
 for(const target of [new V(0,2,-2),new V(0,15,0),new V(0,1,-8),new V(0,1,8)]){
  for(let frame=0;frame<8;frame++){
   camera.sample(p,q,target,CAMERA_DEFAULTS,true,1/120);
   const current=direction(camera),angle=Math.acos(Math.max(-1,Math.min(1,current.dot(previous))));
   assert.ok(angle<.15,'Camera view jumped at a close ball crossing: '+angle);previous=current;
  }
 }
});

test('camera obstruction sweep stops at a wall even if the destination is inside the goal',()=>{
 const anchor=new V(14,1,49),desired=new V(6,1,57),out=new V();
 assert.equal(cameraInsideArena(desired),true);constrainCamera(anchor,desired,out);
 assert.equal(cameraInsideArena(out),true);assert.ok(out.z<C.halfLength);assert.ok(out.distanceTo(desired)>1);
 const mouth=new V(0,1,55);constrainCamera(new V(0,1,49),mouth,out);assert.ok(out.distanceTo(mouth)<1e-8);
});

test('goal roofs, posts, corner ramps and the ceiling keep the displayed camera inside',()=>{
 for(const position of [new V(40.5,5,45),new V(0,5,57),new V(0,20,0),new V(8.7,2,51),new V(-37,2,-43)]){
  for(const ballCam of [true,false]){
   const camera=new ChaseCamera();
   for(let tick=0;tick<80;tick++){
    camera.sample(position,new Q().setFromAxisAngle(new V(1,1,1).normalize(),tick*.05),new V(0,19,0),CAMERA_DEFAULTS,ballCam,1/60);
    assert.equal(cameraInsideArena(camera.position),true,JSON.stringify(camera.position));
    assert.ok(Number.isFinite(camera.look.lengthSq()));
   }
  }
 }
});

test('reset clears Free Look, transition and speed state for a new phase or respawn',()=>{
 const camera=new ChaseCamera(),settings={...CAMERA_DEFAULTS,lookStyle:'free'};
 advance(camera,1,{settings,motion:{speed:23}});camera.orbit(2,.5,false);camera.reset();
 camera.sample(p,q,ball,settings,false,0);
 near(camera.freeYaw,0);near(camera.freePitch,0);near(camera.fov,110);assert.equal(camera.transition,null);
});

test('saved preferences and occupied V/R3 bindings migrate without replacing existing custom controls',()=>{
 const camera=normalizeCamera({fov:103,stiffness:.7,lookStyle:'unknown',transitionSpeed:99,returnSpeed:-1});
 assert.equal(camera.fov,103);assert.equal(camera.stiffness,.7);assert.equal(camera.lookStyle,'classic');assert.equal(camera.transitionSpeed,2);assert.equal(camera.returnSpeed,1);
 const keys=normalizeBindings({...DEFAULT_BINDINGS,camera:'KeyV',forward:'KeyI'});
 assert.equal(keys.camera,'KeyV');assert.equal(keys.forward,'KeyI');assert.notEqual(keys.recenter,'KeyV');
 const pad=gamepadPreferences({buttons:{...PAD_DEFAULTS,boost:11}});
 assert.equal(pad.buttons.boost,11);assert.equal(pad.buttons.recenter,-1);assert.equal(pad.buttons.jump,0);
});

test('real input edges report mouse release and controller/keyboard recenter without affecting throttle',t=>{
 const old={window:globalThis.window,document:globalThis.document,pads:navigator.getGamepads};
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 const canvas=new EventTarget(),drag=[],actions=[],buttons=Array.from({length:16},()=>({value:0}));
 const input=new Input(canvas,{active:()=>true,freeCamera:()=>true,lookDrag:value=>drag.push(value),action:value=>actions.push(value)});
 t.after(()=>{input.dispose();globalThis.window=old.window;globalThis.document=old.document;if(old.pads)navigator.getGamepads=old.pads;else delete navigator.getGamepads;});
 const mouse=new Event('pointerdown',{cancelable:true});Object.assign(mouse,{button:1,clientX:1,clientY:1});canvas.dispatchEvent(mouse);
 const release=new Event('pointerup');Object.assign(release,{button:1,buttons:0});window.dispatchEvent(release);assert.deepEqual(drag.slice(-2),[true,false]);
 const key=new Event('keydown');Object.assign(key,{code:'KeyV'});window.dispatchEvent(key);
 navigator.getGamepads=()=>[{connected:true,axes:[0,0,0,0],buttons}];buttons[7].value=1;buttons[11].value=1;
 assert.equal(input.read().throttle,1);input.read();assert.equal(actions.filter(value=>value==='recenter').length,2);
});
