// Optional integration: public signaling + actual Node WebRTC, without WebGL.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Matchmaker} from '../dist/matchmaking.js';
import {NetworkRoom} from '../dist/network-room.js';
import {RoomTransport} from '../dist/network-transport.js';
import {MATCH_QUEUE} from '../dist/network-protocol.js';
import {C,Simulation} from '../dist/physics.js';

const dependencies=process.env.BOOST_CIRCUIT_RTC_TEST_DEPS;
if(!dependencies)throw Error('Set BOOST_CIRCUIT_RTC_TEST_DEPS to the optional network-test dependency directory.');
const require=createRequire(pathToFileURL(resolve(dependencies,'package.json'))),{RTCPeerConnection}=require('werift'),WebSocket=require('ws'),{HttpsProxyAgent}=require('https-proxy-agent');
const peers=[],controllers=[],packets={control:0,realtime:0},queue=MATCH_QUEUE+'-verify-'+crypto.randomUUID();
class Socket extends WebSocket{constructor(url){const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;super(url,proxy?{agent:new HttpsProxyAgent(proxy)}:{});}}
class RTC extends RTCPeerConnection{constructor(config){super({...config,iceServers:[],iceAdditionalHostAddresses:['127.0.0.1']});peers.push(this);}}
class Transport extends RoomTransport{constructor(callbacks){super({...callbacks,WebSocketClass:Socket,RTCClass:RTC});}send(packet,realtime=false){const sent=super.send(packet,realtime);if(sent)packets[realtime?'realtime':'control']++;return sent;}}
class Room extends NetworkRoom{constructor(options){super({...options,Transport});}}
function make(label,extra={}){let previous='';const result={matches:[],bots:[]};result.controller=new Matchmaker({Room,queue,...extra,onChange:state=>{if(state.phase!==previous){previous=state.phase;console.log(label,state.phase,state.remaining);}},onMatch:(sim,room)=>result.matches.push({sim,room}),onBots:(options,reason)=>result.bots.push({options,reason,at:performance.now()})});controllers.push(result.controller);return result;}
async function until(check,label,timeout=25000){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error('Timed out: '+label);await delay(25);}}
try{
 const a=make('player-a'),b=make('player-b');a.controller.start({body:'octane',paint:'mint'});b.controller.start({body:'bike',paint:'violet'});
 await until(()=>a.matches.length===1&&b.matches.length===1,'automatic shared-queue match');assert.equal(a.bots.length+b.bots.length,0);
 const rooms=[a.matches[0].room,b.matches[0].room],host=rooms.find(r=>r.role==='host'),guest=rooms.find(r=>r.role==='guest');assert.ok(host&&guest);assert.equal(host.matchId,guest.matchId);assert.equal(host.sim.options.duration,300);assert.ok(host.sim.cars.every(c=>!c.bot));assert.equal(guest.sim.localPlayerId,1);assert.ok(host.sim.cars.every(c=>c.matchmade));
 host.sim.phase='playing';host.publish(true);await until(()=>guest.sim.phase==='playing','initial authoritative state');const origin=host.sim.cars[1].p.clone();
 for(let tick=0;tick<200;tick++){guest.guestStep({throttle:1,boost:tick<60});guest.sendInputs();host.sim.step({},C.step,host.inputs());host.publish();guest.replica.sample(performance.now(),C.step);await delay(1000/120);}
 assert.ok(host.remote.ack>80);assert.ok(host.sim.cars[1].p.distanceTo(origin)>2);assert.ok(guest.replica.lastSequence>20);const acknowledged=host.remote.ack;host.close();await until(()=>guest.closed,'peer cleanup');
 console.log(JSON.stringify({result:'REAL MATCH PASS',realSignaling:true,realWebRTC:true,automaticRoles:true,automaticReadyStart:true,inputsAcknowledged:acknowledged,packets,route:'same-container host ICE; public signaling through inherited proxy'}));
 const single=make('empty-queue',{queue:queue+'-empty'}),began=performance.now();single.controller.start({body:'fennec',paint:'blue'},{difficulty:'allstar'});
 await until(()=>single.bots.length===1,'real 60-second fallback',63000);const elapsed=single.bots[0].at-began;assert.ok(elapsed>=60000&&elapsed<62000);assert.equal(single.matches.length,0);assert.equal(single.controller.timers.size,0);const sim=new Simulation(single.bots[0].options);assert.equal(sim.cars.filter(c=>c.bot).length,1);assert.equal(sim.options.difficulty,'allstar');
 console.log(JSON.stringify({result:'BOT FALLBACK PASS',elapsedMs:Math.round(elapsed),botCount:sim.cars.filter(c=>c.bot).length,searchDeadlineSeconds:60,queueSocketClosed:single.controller.attempt===null}));
}catch(error){console.error('LIVE MATCHMAKING CHECK FAILED:',error.message);process.exitCode=1;}finally{for(const controller of controllers){controller.cancel();controller.matchedRoom?.close();}for(const peer of peers)await peer.close();}
