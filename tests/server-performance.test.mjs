import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {GameService} from '../server/game-service.mjs';import {ServerSession} from '../server/session.mjs';import {SocialService} from '../server/social-service.mjs';import {compactSnapshot} from '../dist/snapshot.js';import {C} from '../dist/physics.js';
test('compaction preserves the rounded wire format and only mutates detached snapshot data',()=>{
 const value={x:1.234567,negative:-4.44555,list:[Infinity,NaN,{x:.12345}],absent:undefined},old=JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1000)/1000:v));
 assert.equal(compactSnapshot(value),value);assert.deepEqual(JSON.parse(JSON.stringify(value)),old);
});
test('eight clients share one snapshot build with individual acknowledgements and immutable earlier packets',t=>{
 let now=0;const packets=Array.from({length:8},()=>[]),room=new ServerSession({code:'test',options:{mode:'custom',maxPeople:8},clock:()=>now,setTimer:()=>({unref(){}}),clearTimer(){}});t.after(()=>room.close(false));
 for(let i=0;i<8;i++){const socket={readyState:1,bufferedAmount:0,send:raw=>packets[i].push(JSON.parse(raw)),close(){}};const {entry}=room.attach(socket,{look:{name:'Test'}},{id:'test-'+i});entry.member.team=i%2;entry.member.ready=true;entry.remote.ack=i*7;entry.remote.inputTick=i*9;}
 room.makeSimulation('test',room.players());room.status='playing';room.sim.phase='playing';for(const [i,entry]of room.entries){entry.remote.ack=i*7;entry.remote.inputTick=i*9;}let builds=0;const q=room.sim.cars[0].q,original=q.toArray;q.toArray=function(...args){builds++;return original.apply(this,args);};
 const exact=room.sim.cars[0].p.x;now=40;room.publish(true);assert.equal(builds,1);const states=packets.map(rows=>rows.at(-1));assert.equal(new Set(states.map(s=>s.n)).size,8);for(let i=0;i<8;i++){assert.equal(states[i].ack,i*7);assert.equal(states[i].net.inputTick,i*9);assert.deepEqual(states[i].cars,states[0].cars);}assert.equal(room.sim.cars[0].p.x,exact);
 const saved=JSON.stringify(states);room.sim.cars[0].p.x+=.123456;now+=40;room.publish(true);assert.equal(builds,2);assert.equal(JSON.stringify(states),saved);assert.equal(room.sim.cars[0].p.x,exact+.123456);
 room.events([{type:'hit',p:[0,0,0]}]);assert.equal(builds,3);assert.ok(packets.every(rows=>rows.at(-1).t==='events'));
});
test('idle servers use 10 Hz and active matches retain 120 Hz without simulating lobby waiting time',()=>{
 let now=0,prunes=0,steps=0;const scheduled=[],cleared=[],service=new GameService({clock:()=>now,setIntervalFn:(fn,ms)=>{const timer={fn,ms,unref(){}};scheduled.push(timer);return timer;},clearIntervalFn:timer=>{if(timer)cleared.push(timer);}});
 service.auth.prune=()=>prunes++;service.sockets.add({});service.start();assert.equal(service.tickInterval,100);service.pump();now=100;service.pump();assert.equal(prunes,1);
 const room={active:false,sim:{phase:'playing'},pump:dt=>{assert.equal(dt,C.step);steps++;},close(){}};service.rooms.set('x',room);now=100000;room.active=true;service.updateCadence();assert.equal(service.tickInterval,1000/120);service.pump();assert.equal(steps,0);now+=100;service.pump();assert.ok(steps>=11&&steps<=12);
 room.hostPaused=true;service.updateCadence();assert.equal(service.tickInterval,100);now+=500;service.pump();const paused=steps;room.hostPaused=false;service.updateCadence();service.pump();assert.equal(steps,paused);
 room.recovering=true;service.updateCadence();assert.equal(service.tickInterval,100);room.recovering=false;service.updateCadence();assert.equal(service.tickInterval,1000/120);room.sim.phase='ended';service.pump();assert.equal(service.tickInterval,100);service.rooms.clear();service.sockets.clear();service.stopIfIdle();assert.equal(service.timer,null);assert.ok(cleared.length>=4);service.close();
});
test('a transient profile startup failure retries cleanly and unknown identities do not allocate rate entries',async()=>{
 const secret=randomBytes(32).toString('hex'),hash=createHash('sha256').update(secret).digest('hex'),id='BC-'+hash.slice(0,12).toUpperCase(),p={id,hash,name:'Saved Driver',friends:[],incoming:[],outgoing:[],blocked:[]};let calls=0;
 const service=new SocialService({store:{async list(){if(++calls===1)throw Error('temporary');return new Map([['profile:'+id,p]]);},async put(){}}});const body={op:'sync',name:'Saved Driver',tab:randomUUID()};assert.equal((await service.handle(body,secret)).status,503);assert.equal(service.loaded,null);assert.equal((await service.handle(body,secret)).status,200);assert.equal(service.profiles.size,1);
 const before=service.rates.size;for(let i=0;i<100;i++)assert.equal((await service.handle({op:'search',query:'Test'},randomBytes(32).toString('hex'))).status,401);assert.equal(service.rates.size,before);
});
