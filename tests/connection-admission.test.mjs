import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {NetworkRoom} from '../dist/network-room.js';
import {Matchmaker} from '../dist/matchmaking.js';
import {networkPreferences,assessConnection} from '../dist/network-quality.js';

class Clock{
 now=0;id=0;jobs=new Map();set=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{at:this.now+ms,fn});return id;};clear=id=>this.jobs.delete(id);
 step(ms){const end=this.now+ms;for(;;){const next=[...this.jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.jobs.delete(next[0]);this.now=next[1].at;next[1].fn();}this.now=end;}
 async advance(ms){for(let left=ms;left>0;){const n=Math.min(left,25);this.step(n);left-=n;await settle();}}
}
function probe(t,{delays=[30,80,82,88,75,85,90,600],local={},remote={}}={}){
 const clock=new Clock(),sent=[],wireJobs=[],room=new NetworkRoom({clock:()=>clock.now,setTimer:clock.set,clearTimer:clock.clear});room.role='host';room.peerHello=true;room.preferences=networkPreferences(local);room.remotePreferences=networkPreferences(remote);let ping=0;
 room.transport={open:true,send(packet,realtime){sent.push({at:clock.now,packet,realtime});if(packet.t==='ping'){const delay=delays[ping++];if(delay!=null)wireJobs.push(clock.set(()=>room.receive({t:'pong',id:packet.id,at:packet.at}),delay));}return true;},close(){this.open=false;for(const id of wireJobs)clock.clear(id);}};
 t.after(()=>room.close(false));return {room,clock,sent};
}
test('a single 600ms startup outlier does not reject a steady sub-100ms connection',async t=>{
 const h=probe(t,{local:{maxPing:100,strictPing:true},remote:{maxPing:150,strictPing:true}}),pending=h.room.checkConnection();h.clock.step(2500);const report=await pending;
 assert.equal(report.accepted,true);assert.equal(report.ping,85);assert.equal(report.maximum,600);assert.equal(report.samples,7);assert.equal(report.limit,100);assert.equal(h.sent.filter(entry=>entry.packet.t==='ping').length,8);assert.ok(h.sent.every(entry=>entry.realtime));assert.deepEqual(h.sent.filter(entry=>entry.packet.t==='ping').map(entry=>entry.at),[0,300,480,660,840,1020,1200,1380]);assert.equal(h.clock.jobs.size,0);assert.equal(h.room.pings.size,0);
});
test('genuine 600ms ping remains visible and can connect in warning mode',async t=>{
 const h=probe(t,{delays:Array(8).fill(600),local:{maxPing:100},remote:{maxPing:200}}),pending=h.room.checkConnection();h.clock.step(2500);const report=await pending;assert.equal(report.ping,600);assert.equal(report.warning,true);assert.equal(report.accepted,true);assert.equal(report.limit,null);assert.equal(h.room.rtt,600);assert.equal(h.room.quality.summary(h.clock.now,h.clock.now).ping,600);
});
test('either player can enforce their strict limit even when the other permits high ping',async t=>{
 for(const [local,remote]of [[{maxPing:100,strictPing:true},{maxPing:300}],[{maxPing:300},{maxPing:100,strictPing:true}]]){
  const h=probe(t,{delays:Array(8).fill(300),local,remote}),rejected=assert.rejects(h.room.checkConnection(),/300 ms \(strict limit 100 ms\)/);h.clock.step(2500);await rejected;assert.equal(h.room.connectionReport.accepted,false);assert.equal(h.clock.jobs.size,0);h.room.close(false);
 }
});
test('a few lost probes still allow a measured decision, but absent gameplay replies cannot pass',async t=>{
 const h=probe(t,{delays:[20,null,80,90,null,85,70,75]}),pending=h.room.checkConnection();h.clock.step(4999);assert.ok(h.room.preflight);h.clock.step(1);assert.equal((await pending).samples,5);assert.equal(h.clock.jobs.size,0);
 const missing=probe(t,{delays:Array(8).fill(null),local:{maxPing:0}}),rejected=assert.rejects(missing.room.checkConnection(),/Too few gameplay packets/);missing.clock.step(5000);await rejected;assert.equal(missing.clock.jobs.size,0);
});
test('concurrent checks share their probe run and leaving cancels every scheduled probe',async t=>{
 const h=probe(t,{delays:Array(8).fill(null)}),pending=h.room.checkConnection();assert.equal(h.room.checkConnection(),pending);const rejected=assert.rejects(pending,/disconnected/);h.clock.step(500);const count=h.sent.length;h.room.close(false);h.clock.step(10000);await rejected;assert.equal(h.sent.length,count);assert.equal(h.clock.jobs.size,0);assert.equal(h.room.pings.size,0);
});
test('spoofed ping IDs or timestamps are ignored and replies use the realtime gameplay channel',async t=>{
 const h=probe(t,{delays:Array(8).fill(null)}),rejected=assert.rejects(h.room.checkConnection(),/Too few gameplay packets/);const first=h.sent[0].packet;h.room.receive({t:'pong',id:first.id,at:999});h.room.receive({t:'pong',id:999,at:first.at});assert.equal(h.room.quality.samples.length,0);h.room.receive({t:'ping',id:44,at:42});assert.equal(h.sent.at(-1).packet.t,'pong');assert.equal(h.sent.at(-1).realtime,true);h.clock.step(5000);await rejected;
});
test('assessment bounds invalid samples, preserves Any Ping and uses the median for even sample counts',()=>{
 assert.equal(assessConnection([NaN,-1,Infinity,20],{},{}),null);assert.deepEqual(assessConnection([100,120,140,160],{maxPing:0,strictPing:true},{maxPing:0,strictPing:true}),{ping:130,samples:4,minimum:100,maximum:160,preferred:null,limit:null,warning:false,accepted:true});
});

async function pairedMatch(t,{oneWay=300,strict=false}={}){
 const clock=new Clock(),waiting=new Map(),controllers=[],matches=[],reasons=[];class Transport{
  constructor(callbacks){Object.assign(this,callbacks);this.open=false;this.jobs=new Set();}
  connectQueue(key){this.key=key;const other=waiting.get(key);if(!other){waiting.set(key,this);this.onWaiting();return;}waiting.delete(key);this.peer=other;other.peer=this;queueMicrotask(()=>{if(this.closed||other.closed)return;this.open=other.open=true;this.onRole('host');other.onRole('guest');this.onOpen();other.onOpen();});}
  send(packet,realtime){if(!this.open||this.closed)return false;const target=this.peer,copy=structuredClone(realtime?{...packet,w:(this.sequence=(this.sequence||0)+1)}:packet);const job=clock.set(()=>{this.jobs.delete(job);if(!target.closed)target.onPacket(copy);},oneWay);this.jobs.add(job);return true;}
  close(){if(this.closed)return;this.closed=true;this.open=false;for(const id of this.jobs)clock.clear(id);this.jobs.clear();if(waiting.get(this.key)===this)waiting.delete(this.key);if(this.peer&&!this.peer.closed)queueMicrotask(()=>{if(!this.peer.closed)this.peer.onClose('The peer left.');});}
 }
 class Room extends NetworkRoom{constructor(options){super({...options,Transport,setTimer:clock.set,clearTimer:clock.clear});}}
 for(let n=0;n<2;n++){const controller=new Matchmaker({Room,clock:()=>clock.now,setTimer:clock.set,clearTimer:clock.clear,onChange:state=>{if(state.reason)reasons.push(state.reason);},onMatch:(sim,room)=>matches.push({sim,room})});controllers.push(controller);controller.start({name:'Player '+n},{network:{region:'oceania',maxPing:100,strictPing:strict&&n===0}});}
 t.after(()=>{for(const controller of controllers){controller.cancel();controller.matchedRoom?.close(false);}});await settle();return {clock,controllers,matches,reasons};
}
test('two OCE players with 600ms actual RTT start a human match in warning mode without falsifying ping',async t=>{
 const h=await pairedMatch(t);await h.clock.advance(6500);assert.equal(h.matches.length,2);assert.equal(h.matches[0].room.matchId,h.matches[1].room.matchId);for(const {room,sim}of h.matches){assert.equal(room.connectionReport.ping,600);assert.equal(room.connectionReport.warning,true);assert.equal(sim.cars.filter(car=>car.bot).length,0);}assert.ok(h.controllers.every(controller=>controller.phase==='matched'));
});
test('an OCE player strict 100ms preference rejects real 300ms RTT and keeps the original search deadline',async t=>{
 const h=await pairedMatch(t,{oneWay:150,strict:true});await h.clock.advance(4000);assert.equal(h.matches.length,0);assert.ok(h.reasons.some(reason=>/strict limit 100 ms/.test(reason)));assert.ok(h.controllers.every(controller=>controller.deadline===60000));
});
