// Optional live network check. Uses Node WebRTC peers, not a browser or renderer.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {NetworkRoom} from '../dist/network-room.js';
import {RoomTransport} from '../dist/network-transport.js';
import {C} from '../dist/physics.js';
const dependencies=process.env.BOOST_CIRCUIT_RTC_TEST_DEPS;
if(!dependencies)throw new Error('Set BOOST_CIRCUIT_RTC_TEST_DEPS to an optional test-only dependency directory. See docs/multiplayer.md.');
const require=createRequire(pathToFileURL(resolve(dependencies,'package.json')));
const {RTCPeerConnection}=require('werift'),WebSocket=require('ws'),{HttpsProxyAgent}=require('https-proxy-agent');
const peers=[],counts={control:0,realtime:0};
class ProxiedSocket extends WebSocket{constructor(url){const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;super(url,proxy?{agent:new HttpsProxyAgent(proxy)}:{});}}
class LoopbackRTC extends RTCPeerConnection{constructor(config){super({...config,iceServers:[],iceAdditionalHostAddresses:['127.0.0.1']});peers.push(this);}}
class Transport extends RoomTransport{constructor(callbacks){super({...callbacks,WebSocketClass:ProxiedSocket,RTCClass:LoopbackRTC});}send(packet,realtime=false){const sent=super.send(packet,realtime);if(sent)counts[realtime?'realtime':'control']++;return sent;}}
let expectedClose=false;const unexpected=[],statuses={};const options=role=>({Transport,onChange:room=>{if(statuses[role]!==room.status){statuses[role]=room.status;console.log(role,room.status);}},onDisconnect:message=>{if(!expectedClose)unexpected.push(role+': '+message);}});
const host=new NetworkRoom(options('host')),guest=new NetworkRoom(options('guest'));
async function until(check,label,timeout=25000){const start=performance.now();while(!check()){if(unexpected.length)throw new Error(unexpected.join('; '));if(performance.now()-start>timeout)throw new Error('Timed out: '+label);await delay(25);}}
try{
 host.create({mode:'duel',duration:120},{body:'fennec',paint:'blue'});await until(()=>host.status==='waiting','host registration');guest.join(host.code,{body:'fennec',paint:'blue'});
 await until(()=>host.connected&&guest.connected&&guest.options,'WebRTC handshake');guest.setReady(true);await until(()=>host.remoteReady,'readiness');assert.equal(host.startMatch(),true);await until(()=>host.active&&guest.active,'match start');
 const startGuest=host.sim.cars[1].p.clone(),startHost=host.sim.cars[0].p.clone();const start=performance.now();let ticks=0;
 while(performance.now()-start<6000){
  guest.guestStep({throttle:1,boost:ticks<400,steer:0});guest.sendInputs();host.sim.step({},C.step,host.inputs());const events=host.sim.events.splice(0);host.events(events);host.publish();guest.replica.sample(performance.now(),C.step);ticks++;await delay(1000/120);
 }
 assert.ok(host.remote.ack>100);assert.ok(host.sim.cars[1].p.distanceTo(startGuest)>2);assert.ok(host.sim.cars[0].p.distanceTo(startHost)<.2);assert.ok(guest.replica.lastSequence>30);assert.ok(guest.replica.output.cars.every(c=>c.p.every(Number.isFinite)));
 host.setPaused(true);await until(()=>guest.hostPaused,'host pause',4000);host.setPaused(false);await until(()=>!guest.hostPaused,'host resume',4000);
 host.sim.score=[0,2];host.sim.cars[1].goals=2;host.sim.cars[1].score=200;host.sim.phase='ended';host.events([{type:'end',won:false}]);await until(()=>guest.sim.phase==='ended','final state',4000);assert.deepEqual(guest.sim.score,[0,2]);assert.equal(guest.sim.cars[1].score,200);
 const acknowledged=host.remote.ack,previous=host.matchId;host.startMatch();await until(()=>host.matchId!==previous&&guest.matchId===host.matchId,'rematch',4000);assert.deepEqual(guest.sim.score,[0,0]);
 console.log(JSON.stringify({result:'PASS',realSignaling:true,realWebRTC:true,hostTransportInitiator:host.transport.initiator,rtcImplementation:'werift 0.27.0',route:'same-container host ICE; public signaling via inherited proxy',ticks,remoteInputsAcknowledged:acknowledged,packets:counts,checks:['room code','readiness','host starts','guest controls','state sync','prediction','pause/resume','final score','rematch']}));
 expectedClose=true;host.close();await until(()=>guest.closed,'disconnect',4000);console.log('Disconnect cleanup PASS');
}catch(error){console.error('LIVE RTC CHECK FAILED:',error.message);process.exitCode=1;}finally{expectedClose=true;host.close();guest.close();for(const pc of peers)await pc.close();}
