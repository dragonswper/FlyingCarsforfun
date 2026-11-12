// Optional actual WebRTC/network lifecycle check, without a browser or renderer.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Matchmaker} from '../dist/matchmaking.js';
import {NetworkRoom} from '../dist/network-room.js';
import {RoomTransport} from '../dist/network-transport.js';
import {MATCH_QUEUE} from '../dist/network-protocol.js';
import {C} from '../dist/physics.js';
const directory=process.env.BOOST_CIRCUIT_RTC_TEST_DEPS,trace=(...args)=>{if(process.env.BOOST_CIRCUIT_TRACE)console.log(Math.round(performance.now()),...args);};let transportCount=0;
if(!directory)throw Error('Set BOOST_CIRCUIT_RTC_TEST_DEPS to the optional test-only WebRTC dependency directory.');
const require=createRequire(pathToFileURL(resolve(directory,'package.json'))),{RTCPeerConnection}=require('werift'),WebSocket=require('ws'),{HttpsProxyAgent}=require('https-proxy-agent'),peers=[],controllers=[],failures=[],queue=MATCH_QUEUE+'-recovery-'+crypto.randomUUID();
class Socket extends WebSocket{constructor(url){const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;super(url,proxy?{agent:new HttpsProxyAgent(proxy)}:{});}}
class RTC extends RTCPeerConnection{constructor(config){super({...config,iceServers:[],iceAdditionalHostAddresses:['127.0.0.1']});peers.push(this);}}
class Transport extends RoomTransport{constructor(options){super({...options,WebSocketClass:Socket,RTCClass:RTC});this.number=++transportCount;}begin(queue,role){trace(this.number,'begin',role,queue.includes('-resume-')?'recovery':'search');super.begin(queue,role);}async signal(raw){const message=JSON.parse(raw);trace(this.number,'signal',message.kind,message.type||'');await super.signal(raw);}fail(reason){trace(this.number,'fail',reason);super.fail(reason);}attachChannel(channel){super.attachChannel(channel);const opened=channel.onopen;channel.onopen=()=>{trace(this.number,'channel open',channel.label);opened?.();};}}
class Room extends NetworkRoom{constructor(options){super({...options,Transport});}receive(packet){if(packet.t.startsWith('resume'))trace('room',this.role,packet.t);super.receive(packet);}}
const found=[];let expectedClose=false;
function player(){const matches=[],controller=new Matchmaker({Room,queue,onMatch:(sim,room)=>{matches.push({sim,room});found.push({sim,room});},onBots:()=>failures.push('Unexpected bot fallback'),onDisconnect:reason=>{if(!expectedClose)failures.push(reason);}});controllers.push(controller);return {controller,matches};}
async function until(check,label,timeout=25000){const start=performance.now();while(!check()){if(failures.length)throw Error(failures.join('; '));if(performance.now()-start>timeout)throw Error('Timed out: '+label);await delay(25);}}
async function drive(host,guest){for(let tick=0;tick<160;tick++){guest.guestStep({throttle:1,boost:tick<30});guest.sendInputs();host.hostStep({},C.step);host.publish();await delay(1000/120);}assert.ok(host.remote.ack>80);return host.remote.ack;}
try{
 const a=player(),b=player();for(const p of [a,b])p.controller.start({body:'fennec',paint:'blue'},{network:{region:'oceania',maxPing:300}});
 await until(()=>found.length===2,'automatic match and measured ping checks');const host=found.find(match=>match.room.role==='host').room,guest=found.find(match=>match.room.role==='guest').room,hostSim=host.sim,guestSim=guest.sim,id=host.matchId;
 host.sim.phase='playing';host.publish(true);await until(()=>guest.sim.phase==='playing','initial state');const before=await drive(host,guest);host.sim.score=[2,1];host.sim.remaining=121;host.publish(true);await until(()=>guest.sim.score[0]===2,'score synchronization');
 const began=performance.now();host.transport.fail('Injected transport drop for live recovery verification');assert.equal(host.recovering,true);assert.equal(host.hostStep({boost:true},C.step),false);await until(()=>host.active&&guest.active&&!host.recovering&&!guest.recovering,'same-match recovery',21000);const recoveryMs=Math.round(performance.now()-began);assert.equal(host.sim,hostSim);assert.equal(guest.sim,guestSim);assert.equal(host.matchId,id);assert.equal(guest.matchId,id);assert.deepEqual(guest.sim.score,[2,1]);assert.equal(guest.sim.remaining,121);assert.equal(guest.replica.inputSequence,0);const after=await drive(host,guest);
 host.setPaused(true);await until(()=>guest.hostPaused,'host pause');host.transport.fail('Injected paused reconnect verification');await until(()=>host.active&&guest.active&&!host.recovering&&!guest.recovering,'paused recovery',21000);assert.equal(host.hostPaused,true);assert.equal(guest.hostPaused,true);host.setPaused(false);await until(()=>!guest.hostPaused,'resumed pause state');
 host.sim.phase='ended';host.events([{type:'end'}]);await until(()=>guest.sim.phase==='ended','results');assert.equal(host.startMatch(),false);guest.requestRematch();await until(()=>host.remoteRematch,'guest rematch request');assert.equal(host.matchId,id);host.requestRematch();await until(()=>host.matchId!==id&&guest.matchId===host.matchId,'mutual rematch');assert.equal(found.length,4);assert.deepEqual(guest.sim.score,[0,0]);
 expectedClose=true;guest.close(true,'next');await until(()=>host.closed,'Find Next departure');assert.match(host.error,/next match/);
 console.log(JSON.stringify({result:'LIVE RECOVERY PASS',realSignaling:true,realWebRTC:true,recoveryMs,ackBefore:before,ackAfter:after,checks:['region handshake','measured ping admission','same simulation/score/clock','input counters reset','guest driving after recovery','paused recovery','guest rematch request','mutual rematch','Find Next departure'],route:'same-container host ICE; public signaling through inherited proxy'}));
}catch(error){console.error('LIVE RECOVERY CHECK FAILED:',error.message);process.exitCode=1;}finally{expectedClose=true;for(const controller of controllers){controller.cancel();controller.matchedRoom?.close();}for(const peer of peers)await peer.close();}
