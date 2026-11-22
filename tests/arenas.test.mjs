import test from 'node:test';import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {ARENA_IDS,normalizeArena} from '../dist/arenas.js';
import {createArenaEnvironment} from '../dist/arena-environments.js';
import {serverOptions,SERVER_MODES} from '../dist/server-options.js';
import {partyOptions} from '../dist/party-room.js';
import {roomOptions} from '../dist/network-protocol.js';
import {Simulation,C} from '../dist/physics.js';
import {ServerMatchQueue} from '../server/matchmaking.mjs';

test('all match contracts preserve valid arenas and safely migrate old/invalid values',()=>{
 for(const id of ARENA_IDS){
  assert.equal(roomOptions({arena:id}).arena,id);assert.equal(partyOptions({arena:id}).arena,id);
  for(const mode of SERVER_MODES)assert.equal(serverOptions({mode,arena:id}).arena,id);
 }
 for(const value of [undefined,null,{},'__proto__','constructor','../../secrets'])assert.equal(normalizeArena(value),'champions');
 assert.equal(roomOptions(null).arena,'champions');assert.equal(serverOptions().arena,'champions');
});

test('snow, city and woods use the same deterministic driving, ball and boost-pad physics',()=>{
 const simulations=ARENA_IDS.map(arena=>new Simulation({mode:'free',arena}));
 for(const sim of simulations)for(let i=0;i<700;i++)sim.step({throttle:1,steer:i<300?.3:-.2,boost:i<150,jump:i===100});
 const baseline=simulations[0].snapshot();
 for(const sim of simulations){assert.deepEqual(sim.snapshot(),baseline);assert.equal(sim.pads.length,34);}
});

for(const id of ['snow','city','woods'])test(id+' scenery uses bounded instancing and keeps decorative solids out of the playable field',()=>{
 const scene=createArenaEnvironment(id),point=new T.Vector3(),matrix=new T.Matrix4();let meshes=0,instances=0;
 scene.root.traverse(node=>{
  if(!node.isMesh)return;meshes++;if(!node.isInstancedMesh)return;instances+=node.count;
  node.geometry.computeBoundingBox();const bounds=node.geometry.boundingBox;
  for(let i=0;i<node.count;i++){
   node.getMatrixAt(i,matrix);
   for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    point.set(x,y,z).applyMatrix4(matrix);assert.ok(point.toArray().every(Number.isFinite));
    assert.ok(point.y<=0||Math.abs(point.x)>C.halfWidth||Math.abs(point.z)>C.halfLength,node.name+' intrudes into play');
   }
  }
 });
 assert.ok(meshes<20,'Scenery submits too many separate objects');assert.ok(instances>150);
 scene.setQuality('low');scene.update(10);const snow=scene.root.getObjectByName('Soft_Snowfall');
 if(snow){assert.equal(snow.geometry.drawRange.count,96);scene.setQuality('high');assert.equal(snow.geometry.drawRange.count,384);assert.equal(snow.userData.time.value,10);}
});

test('saved arena preferences do not split the online queue and each match uses the random policy',()=>{
 const matches=[],queue=new ServerMatchQueue({onMatch:(players,options)=>matches.push({players,options})});
 const socket=()=>({readyState:1,send(){},close(){}}),a=socket(),b=socket();
 queue.add(a,{id:'one'},{options:{mode:'duel',arena:'snow'},network:{region:'oceania'}});
 queue.add(b,{id:'two'},{options:{mode:'duel',arena:'city'},network:{region:'oceania'}});
 assert.equal(matches.length,1);assert.equal(matches[0].options.randomArena,true);assert.equal(matches[0].players.length,2);assert.equal(queue.waiting.size,0);
});
