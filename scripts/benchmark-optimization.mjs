// Dependency-free CPU/allocation benchmark. Run with --expose-gc; optionally
// pass another checkout's dist directory to compare releases on the same host.
// Wall-clock timings vary; trace hashes verify the same recorded simulation.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const source=process.argv[2]?pathToFileURL(resolve(process.argv[2])+'/'):new URL('../dist/',import.meta.url);
const {Simulation,C}=await import(new URL('physics.js',source));
const {carSupport}=await import(new URL('arena.js',source));
const {ShortGrass}=await import(new URL('grass.js',source));
const T=await import(new URL('vendor/three.module.js',source));
const results=[];
function scenario(mode,seconds){const sim=new Simulation(mode==='bots'?{mode:'doubles',difficulty:'expert'}:{mode:'custom',players:Array.from({length:8},(_,id)=>({id,team:id%2,bot:false})),humanIds:[0,1,2,3,4,5,6,7]});const hash=createHash('sha256'),inputs=new Map();for(let tick=0;tick<seconds*120;tick++){
 for(const car of sim.cars)inputs.set(car.id,{throttle:1,steer:Math.sin(tick/170+car.id)*.7,boost:tick%480<130,jump:tick%240===80||tick%240===110,pitch:tick%240>100?.7:0,roll:tick%330>280?.3:0});
 sim.step(inputs.get(0),C.step,mode==='bots'?null:inputs);
 if(tick%30===0)hash.update(JSON.stringify(sim.snapshot()));if(sim.events.length){hash.update(JSON.stringify(sim.events));sim.events.length=0;}
 if(sim.phase==='ended')sim.phase='playing';
 }return hash.digest('hex');}
for(const mode of ['bots','eight']){scenario(mode,5);const samples=[],hashes=[];for(let i=0;i<5;i++){globalThis.gc?.();const start=performance.now();hashes.push(scenario(mode,40));samples.push(performance.now()-start);}results.push({mode,simulatedSeconds:40,medianMs:samples.toSorted((a,b)=>a-b)[2],samples,hash:hashes[0],deterministic:new Set(hashes).size===1});}
const car={q:new T.Quaternion().setFromEuler(new T.Euler(.7,.4,-.9))},normal=new T.Vector3(.2,.9,.3).normalize(),clone=T.Vector3.prototype.clone;let clones=0;T.Vector3.prototype.clone=function(){clones++;return clone.call(this);};let sum=0;const supportStart=performance.now();for(let i=0;i<500000;i++)sum+=carSupport(car,normal);const supportMs=performance.now()-supportStart;T.Vector3.prototype.clone=clone;
const grass=new ShortGrass(new T.Scene());const grassBytes=Object.values(grass.geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0);grass.dispose();
const data={source,results,support:{calls:500000,clones,ms:supportMs,sum},initialGrassAttributeBytes:grassBytes};console.log(JSON.stringify(data,null,2));
