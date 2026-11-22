import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {C,Simulation} from '../dist/physics.js';
import {carSupport} from '../dist/arena.js';
import {ShortGrass} from '../dist/grass.js';
import {ServerSession} from '../server/session.mjs';
import {prepareMatchView} from '../dist/match-assets.js';

test('cached chassis support matches the actual eight box corners across interleaved orientations',()=>{
 let seed=241;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const cars=[{q:new T.Quaternion()},{q:new T.Quaternion()}],point=new T.Vector3();
 for(let i=0;i<1000;i++){
  const car=cars[i%2];if(i%3)car.q.setFromEuler(new T.Euler(random()*6,random()*6,random()*6));
  const normal=new T.Vector3(random()-.5,random()-.5,random()-.5).normalize();let expected=C.carHeight;
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
   point.set(x*C.hitboxHalfWidth,y*C.hitboxHalfHeight+C.hitboxOffsetUp,z*C.hitboxHalfLength+C.hitboxOffsetForward).applyQuaternion(car.q);
   expected=Math.max(expected,-normal.dot(point));
  }
  assert.ok(Math.abs(carSupport(car,normal)-expected)<1e-12);
 }
});

test('support checks do not allocate temporary cloned vectors',()=>{
 const old=T.Vector3.prototype.clone,car={q:new T.Quaternion()},normal=new T.Vector3(0,1,0);let clones=0;
 T.Vector3.prototype.clone=function(){clones++;return old.call(this);};
 try{for(let i=0;i<1000;i++)carSupport(car,normal);}finally{T.Vector3.prototype.clone=old;}
 assert.equal(clones,0);
});

test('grass allocates only when visible, grows to the requested budget and preserves the existing layout',()=>{
 const grass=new ShortGrass(new T.Scene()),map=new T.Texture(),field={material:{map}};
 assert.equal(grass.geometry.getAttribute('grassOffset'),undefined);
 grass.configure(0,field);grass.configure(24000,null);assert.equal(grass.bufferCapacity,0);
 grass.configure(24000,field);assert.equal(grass.bufferCapacity,24000);
 const offsets=grass.geometry.getAttribute('grassOffset'),variation=grass.geometry.getAttribute('grassVariation');
 assert.equal(offsets.array.byteLength+variation.array.byteLength,480000);
 grass.configure(24000,field);assert.equal(grass.geometry.getAttribute('grassOffset'),offsets);
 grass.configure(90000,field);assert.equal(grass.bufferCapacity,90000);
 assert.deepEqual(grass.geometry.getAttribute('grassOffset').array.subarray(0,offsets.array.length),offsets.array);
 assert.deepEqual(grass.geometry.getAttribute('grassVariation').array.subarray(0,variation.array.length),variation.array);
 grass.configure(24000,field);assert.equal(grass.bufferCapacity,90000);assert.equal(grass.geometry.instanceCount,24000);
 grass.dispose();map.dispose();
 const small=new ShortGrass(new T.Scene(),100);small.configure(24000,field);assert.equal(small.geometry.instanceCount,100);small.dispose();
});

test('headless authority skips unused replay copies while clients retain replay recording',t=>{
 const room=new ServerSession({code:'replay-check',setTimer:()=>({unref(){}}),clearTimer(){}});t.after(()=>room.close(false));
 room.makeSimulation('match',[{id:0,team:0,look:{name:'Driver',body:'fennec'}}]);
 const client=new Simulation(room.sim.options);assert.equal(room.sim.recordReplay,false);assert.equal(client.recordReplay,true);
 room.sim.phase=client.phase='playing';
 for(let i=0;i<240;i++){room.sim.step({},C.step);client.step({},C.step);}
 assert.equal(room.sim.replay.length,0);assert.ok(client.replay.length>20);assert.deepEqual(room.sim.snapshot(),client.snapshot());
});

test('match loading prepares models, arena, field texture and shaders before reporting ready',async()=>{
 const order=[],fieldMap={},view={arena:{field:{material:{map:fieldMap}}},ensureArena:async()=>order.push('download'),setArena:()=>order.push('select'),renderer:{initTexture:map=>{assert.equal(map,fieldMap);order.push('texture');}},prepare:async()=>order.push('shaders')};
 assert.equal(await prepareMatchView(view,{arena:'coast'},async()=>order.push('models')),true);
 assert.deepEqual(order,['download','models','select','texture','shaders']);
 let current=true,release;order.length=0;view.ensureArena=()=>new Promise(resolve=>release=resolve);
 const pending=prepareMatchView(view,{arena:'orbital'},undefined,()=>current);current=false;release();assert.equal(await pending,false);assert.deepEqual(order,[]);
 view.ensureArena=async()=>{};view.prepare=async()=>{current=false;};current=true;
 assert.equal(await prepareMatchView(view,{arena:'orbital'},undefined,()=>current),false);
});
