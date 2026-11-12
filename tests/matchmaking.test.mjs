import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {Matchmaker,SEARCH_MS,SETUP_MS} from '../dist/matchmaking.js';
import {NetworkRoom} from '../dist/network-room.js';
import {MATCH_QUEUE,NET_BUILD,CODE_ALPHABET} from '../dist/network-protocol.js';
import {Simulation} from '../dist/physics.js';
import {RoomTransport} from '../dist/network-transport.js';

class Clock{
 now=0;id=0;jobs=new Map();
 set=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{at:this.now+ms,fn});return id;};
 clear=id=>this.jobs.delete(id);
 advance(ms){const end=this.now+ms;for(;;){const due=[...this.jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;this.jobs.delete(due[0]);this.now=due[1].at;due[1].fn();}this.now=end;}
}
function broker(){
 const queues=new Map(),transports=[];
 class Transport{
  constructor(callbacks){Object.assign(this,callbacks);this.open=false;this.closed=false;transports.push(this);}
  connectQueue(queue){this.queue=queue;this.onWaiting();const first=queues.get(queue);if(!first){queues.set(queue,this);return;}queues.delete(queue);this.peer=first;first.peer=this;queueMicrotask(()=>{if(first.closed||this.closed)return;first.open=this.open=true;first.onRole('guest');this.onRole('host');if(!first.closed)first.onOpen();if(!this.closed)this.onOpen();});}
  send(packet){if(this.closed||!this.open)return false;const copy=structuredClone(packet);queueMicrotask(()=>{if(!this.peer.closed)this.peer.onPacket(copy);});return true;}
  close(){if(this.closed)return;this.closed=true;this.open=false;if(queues.get(this.queue)===this)queues.delete(this.queue);if(this.peer&&!this.peer.closed)queueMicrotask(()=>{if(!this.peer.closed)this.peer.onClose('Opponent disconnected.');});}
 }
 class Room extends NetworkRoom{constructor(options){super({...options,Transport});}}
 return {Room,queues,transports};
}
function harness(t,{prepare=async()=>{}}={}){
 const clock=new Clock(),hub=broker(),controllers=[],matches=[],bots=[];
 const create=(extra={})=>{const found=[],fallback=[];const controller=new Matchmaker({Room:hub.Room,clock:()=>clock.now,setTimer:clock.set,clearTimer:clock.clear,prepare,...extra,onMatch:(sim,room)=>{found.push({sim,room});matches.push({sim,room});extra.onMatch?.(sim,room);},onBots:(options,reason)=>{fallback.push({options,reason,at:clock.now});bots.push({options,reason,at:clock.now});extra.onBots?.(options,reason);}});controllers.push(controller);return {controller,found,fallback};};
 t.after(()=>{for(const controller of controllers){controller.cancel();controller.matchedRoom?.close();}});
 return {clock,hub,create,matches,bots};
}

test('one absolute 60-second deadline starts exactly one bot lobby and removes the queued player',t=>{
 const h=harness(t),a=h.create();a.controller.start({body:'octane',paint:'mint'},{difficulty:'expert'});h.clock.advance(SEARCH_MS-1);assert.equal(a.fallback.length,0);assert.equal(a.controller.state().remaining,1);h.clock.advance(1);
 assert.equal(a.fallback.length,1);assert.equal(a.fallback[0].at,60000);assert.equal(a.fallback[0].options.mode,'duel');assert.equal(a.fallback[0].options.duration,300);assert.equal(a.fallback[0].options.difficulty,'expert');assert.equal(a.fallback[0].options.quickplayBots,true);assert.equal(h.hub.queues.size,0);assert.equal(h.clock.jobs.size,0);h.clock.advance(120000);assert.equal(a.fallback.length,1);
 const sim=new Simulation(a.fallback[0].options);assert.equal(sim.cars.length,2);assert.equal(sim.cars.filter(car=>car.bot).length,1);
});
test('cancelling removes a pending player and suppresses late match, timeout and preparation callbacks',async t=>{
 const h=harness(t),a=h.create();a.controller.start({});const old=a.controller.attempt;h.clock.advance(3000);assert.equal(a.controller.cancel(),true);assert.equal(a.controller.cancel(),false);old.room.onMatch(new Simulation());old.room.onChange(old.room);h.clock.advance(90000);await settle();assert.equal(a.found.length,0);assert.equal(a.fallback.length,0);assert.equal(h.hub.queues.size,0);assert.equal(h.clock.jobs.size,0);
});
test('connection retries keep the original search deadline instead of restarting the minute',async t=>{
 const h=harness(t),a=h.create();a.controller.start({});h.clock.advance(17000);const first=a.controller.attempt.room;first.fail('Network lost');assert.equal(first.closed,true);h.clock.advance(2000);assert.equal(a.controller.attempts,2);assert.equal(a.controller.deadline,60000);h.clock.advance(40000);a.controller.attempt.room.fail('Network lost again');h.clock.advance(1000);await settle();assert.equal(a.fallback.length,1);assert.equal(a.fallback[0].at,60000);assert.equal(h.clock.jobs.size,0);
});
test('two queued players automatically receive server-selected roles, await both vehicles and start a human 1v1',async t=>{
 const pending=[];const h=harness(t,{prepare:room=>new Promise(resolve=>pending.push({room,resolve}))}),a=h.create(),b=h.create();a.controller.start({body:'bike',paint:'mint'});b.controller.start({body:'c17',paint:'violet'});await settle();assert.equal(pending.length,2);assert.equal(a.controller.attempt.room.role,'guest');assert.equal(b.controller.attempt.room.role,'host');assert.equal(h.matches.length,0);
 pending[0].resolve();await settle();assert.equal(h.matches.length,0);pending[1].resolve();await settle();assert.equal(h.matches.length,2);const first=a.found[0],second=b.found[0];assert.equal(first.room.matchId,second.room.matchId);assert.equal(first.sim.localPlayerId,1);assert.equal(second.sim.localPlayerId,0);assert.ok(first.sim.cars.every(car=>!car.bot));assert.equal(first.sim.cars[1].appearance.body,'bike');assert.equal(first.sim.cars[0].appearance.body,'c17');assert.ok(first.sim.cars.every(car=>car.matchmade));assert.equal(h.clock.jobs.size,0);h.clock.advance(120000);assert.equal(h.bots.length,0);
});
test('a verified peer found before 60 seconds may finish loading with its separate bounded setup timer',async t=>{
 const pending=[],h=harness(t,{prepare:()=>new Promise(resolve=>pending.push(resolve))}),a=h.create(),b=h.create();a.controller.start({});h.clock.advance(59500);b.controller.start({});await settle();assert.equal(a.controller.phase,'preparing');h.clock.advance(2000);assert.equal(a.fallback.length,0);assert.equal(a.controller.phase,'preparing');for(const resolve of pending)resolve();await settle();assert.equal(h.matches.length,2);assert.equal(h.bots.length,0);
});
test('an opponent arriving after the search deadline cannot replace the bot outcome',async t=>{
 const h=harness(t),a=h.create(),b=h.create();a.controller.start({});h.clock.now=60001;b.controller.start({});await settle();assert.equal(a.fallback.length,1);assert.equal(a.found.length,0);assert.equal(a.controller.phase,'bots');assert.equal(b.found.length,0);
});
test('stalled setup falls back once when the original search minute is already over',async t=>{
 const pending=[],h=harness(t,{prepare:()=>new Promise(resolve=>pending.push(resolve))}),a=h.create(),b=h.create();a.controller.start({});h.clock.advance(59000);b.controller.start({});await settle();h.clock.advance(SETUP_MS-1);assert.equal(a.fallback.length,0);h.clock.advance(1);await settle();assert.equal(a.fallback.length,1);assert.equal(a.controller.phase,'bots');for(const resolve of pending)resolve();await settle();assert.equal(a.found.length,0);assert.equal(a.fallback.length,1);
});
test('a failed vehicle download retries with fresh rooms and can still produce a real match',async t=>{
 let fail=true;const h=harness(t,{prepare:async()=>{if(fail){fail=false;throw Error('Asset unavailable');}}}),a=h.create(),b=h.create();a.controller.start({});b.controller.start({});await settle();assert.equal(h.matches.length,0);h.clock.advance(2000);await settle();assert.equal(h.matches.length,2);assert.ok(a.controller.attempts>=2);assert.ok(b.controller.attempts>=2);assert.equal(h.bots.length,0);
});
test('cancelling after a peer is found prevents pending model loads from sending ready or starting',async t=>{
 const pending=[],h=harness(t,{prepare:()=>new Promise(resolve=>pending.push(resolve))}),a=h.create(),b=h.create();a.controller.start({});b.controller.start({});await settle();const old=a.controller.attempt.room;a.controller.cancel();for(const resolve of pending)resolve();await settle();assert.equal(old.closed,true);assert.equal(old.ready,false);assert.equal(a.found.length,0);assert.equal(b.found.length,0);h.clock.advance(60000);await settle();assert.equal(a.fallback.length,0);assert.equal(b.fallback.length,1);
});
test('successful matches retain normal rematches and forward post-start disconnects to the game',async t=>{
 const disconnected=[],h=harness(t),a=h.create({onDisconnect:reason=>disconnected.push(reason)}),b=h.create({onDisconnect:reason=>disconnected.push(reason)});a.controller.start({});b.controller.start({});await settle();const host=h.matches.find(x=>x.room.role==='host').room;assert.equal(host.startMatch(),true);await settle();assert.equal(a.found.length,2);assert.equal(b.found.length,2);host.close();await settle();assert.equal(disconnected.length,1);assert.equal(h.bots.length,0);
});
test('shared queue identifiers include the game build and malformed queue names are rejected',()=>{
 assert.ok(MATCH_QUEUE.includes(NET_BUILD));assert.match(MATCH_QUEUE,/casual-duel-300/);assert.ok(![...MATCH_QUEUE].every(c=>CODE_ALPHABET.includes(c)));assert.throws(()=>new RoomTransport().connectQueue('bad queue / url'));
});
test('different queue builds remain isolated while matching players in the same build',async t=>{
 const h=harness(t),old=h.create({queue:MATCH_QUEUE+'-old'}),a=h.create(),b=h.create();old.controller.start({});a.controller.start({});await settle();assert.equal(h.matches.length,0);b.controller.start({});await settle();assert.equal(h.matches.length,2);assert.equal(old.controller.phase,'searching');assert.equal(old.found.length,0);
});
test('a peer cannot start a public match before the guest has prepared its vehicles',async t=>{
 const h=harness(t,{prepare:()=>new Promise(()=>{})}),a=h.create(),b=h.create();a.controller.start({});b.controller.start({});await settle();const guest=a.controller.attempt.room,host=b.controller.attempt.room;host.transport.send({t:'start',matchId:crypto.randomUUID()});await settle();assert.equal(guest.closed,true);assert.equal(h.matches.length,0);
});
test('the real transport requests a shared queue and assigns the server-selected role before opening channels',async t=>{
 class Socket{constructor(){this.readyState=1;this.sent=[];}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;}}
 class RTC{constructor(){this.connectionState='new';}createDataChannel(label){return {label,readyState:'connecting',close(){this.readyState='closed';}};}async createOffer(){return {type:'offer',sdp:'test'};}async setLocalDescription(value){this.localDescription=value;}close(){this.connectionState='closed';}}
 const calls=[],transport=new RoomTransport({WebSocketClass:Socket,RTCClass:RTC,onRole:role=>calls.push(role),onOpen:()=>calls.push('open')});t.after(()=>transport.close());transport.connectQueue(MATCH_QUEUE);await transport.signal(JSON.stringify({kind:'registration-success',clientID:'a',iceServers:[]}));assert.deepEqual(transport.ws.sent[0],{kind:'match-request',gameID:MATCH_QUEUE,minPlayers:2,maxPlayers:2});await transport.signal(JSON.stringify({kind:'host-match',clientIDs:['b']}));assert.deepEqual(calls,['host']);for(const channel of Object.values(transport.channels))channel.readyState='open';transport.channels.control.onopen();assert.deepEqual(calls,['host','open']);
});
test('cancelled transports cannot be reopened by late data-channel events',()=>{
 let opened=0;const transport=new RoomTransport({onOpen:()=>opened++}),channel=name=>({label:name,readyState:'open',close(){this.closed=true;}}),a=channel('control'),b=channel('realtime');transport.attachChannel(a);transport.attachChannel(b);const late=a.onopen;transport.close();late();assert.equal(opened,0);assert.equal(transport.open,false);const extra=channel('control');transport.attachChannel(extra);assert.equal(extra.closed,true);
});


test('automatic matches forward shared chat state only from the winning room',async t=>{
 const h=harness(t),aStates=[],bStates=[],a=h.create({onChatState:state=>aStates.push(state)}),b=h.create({onChatState:state=>bStates.push(state)});a.controller.start({name:'Alpha'});b.controller.start({name:'Beta'});await settle();await settle();assert.equal(h.matches.length,2);
 const room=a.controller.matchedRoom;assert.equal(room.sendChat('Hello opponent'),true);await settle();assert.equal(aStates.at(-1).messages[0].text,'Hello opponent');assert.deepEqual(aStates.at(-1).messages,bStates.at(-1).messages);
 room.role==='host'?room.chat.clear():b.controller.matchedRoom.chat.clear();await settle();assert.deepEqual(aStates.at(-1).messages,[]);assert.deepEqual(bStates.at(-1).messages,[]);
});
