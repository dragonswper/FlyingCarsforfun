// Actual public signaling + WebRTC. Data stays on same-container ICE candidates.
// The fallback scenario tests renegotiation, not an overseas/public TURN data route.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {RoomTransport} from '../dist/network-transport.js';
import {NetworkRoom} from '../dist/network-room.js';
import {Matchmaker} from '../dist/matchmaking.js';
import {MATCH_QUEUE} from '../dist/network-protocol.js';
import {C} from '../dist/physics.js';
const directory=process.env.BOOST_CIRCUIT_RTC_TEST_DEPS;if(!directory)throw Error('Set BOOST_CIRCUIT_RTC_TEST_DEPS to the optional dependency directory.');
const require=createRequire(pathToFileURL(resolve(directory,'package.json'))),{RTCPeerConnection}=require('werift'),WebSocket=require('ws'),{HttpsProxyAgent}=require('https-proxy-agent');
class Socket extends WebSocket{constructor(url){const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;super(url,proxy?{agent:new HttpsProxyAgent(proxy)}:{});}}
async function scenario(forceRestart){
 const peers=[],links=[],controllers=[],matches=[],errors=[],queue=MATCH_QUEUE+'-connection-check-'+crypto.randomUUID();let closing=false;
 class RTC extends RTCPeerConnection{
  constructor(config){super({...config,iceServers:[],iceAdditionalHostAddresses:['127.0.0.1']});this.restartOffers=0;this.reconfigurations=0;peers.push(this);}
  setConfiguration(config){this.reconfigurations++;super.setConfiguration({...config,iceServers:[]});}
  async createOffer(options){if(options?.iceRestart)this.restartOffers++;return super.createOffer(options);}
 }
 class Transport extends RoomTransport{
  constructor(options){super({...options,WebSocketClass:Socket,RTCClass:RTC});this.held=[];links.push(this);}
  attachChannel(channel){super.attachChannel(channel);if(forceRestart&&channel.onopen){const original=channel.onopen;channel.onopen=()=>{if(this.relayFallback)original();else this.held.push(original);};}}
  async signal(raw){try{await super.signal(raw);}catch(error){console.log('signal error',error.name,(error.stack||'').split('\n').filter(line=>line.includes('node_modules/werift/')||line.includes('/dist/network-transport.js')).slice(0,3).join(' | '));throw error;}if(forceRestart&&this.relayFallback&&this.pc?.connectionState==='connected')this.releaseChannels();}
  releaseChannels(){for(const original of this.held.splice(0))original();}
 }
 class Room extends NetworkRoom{constructor(options){super({...options,Transport});}}
 async function until(check,label,timeout=35000){const start=performance.now();while(!check()){if(errors.length)throw Error(errors.join('; '));if(performance.now()-start>timeout)throw Error('Timed out: '+label+' '+JSON.stringify(links.map(link=>({closed:link.closed,open:link.open,relay:link.relayFallback,signaling:link.pc?.signalingState,ice:link.pc?.iceConnectionState,connection:link.pc?.connectionState,channels:Object.values(link.channels).map(channel=>channel.readyState)}))));await delay(25);}}
 try{
  for(let n=0;n<2;n++){let previous='';const controller=new Matchmaker({Room,queue,onChange:state=>{if(state.phase!==previous){previous=state.phase;console.log(forceRestart?'restart':'direct',n,state.phase,state.reason||'');}},onMatch:(sim,room)=>matches.push({sim,room}),onDisconnect:reason=>{if(!closing)errors.push(reason);}});controllers.push(controller);controller.start({name:'Connection Test '+n},{network:{region:'oceania',maxPing:100}});}
  await until(()=>matches.length===2,'automatic connection');const host=matches.find(entry=>entry.room.role==='host').room,guest=matches.find(entry=>entry.room.role==='guest').room;assert.equal(host.matchId,guest.matchId);assert.ok(matches.every(entry=>entry.room.connectionReport.samples>=3));assert.ok(matches.every(entry=>entry.room.connectionReport.accepted));
  if(forceRestart){assert.ok(links.every(link=>link.relayFallback));assert.ok(peers.some(peer=>peer.restartOffers>0));assert.ok(peers.every(peer=>peer.reconfigurations>0));}else assert.ok(links.every(link=>!link.relayFallback));
  host.sim.phase='playing';host.publish(true);await until(()=>guest.sim.phase==='playing','playing state');for(let tick=0;tick<100;tick++){guest.guestStep({throttle:1});guest.sendInputs();host.hostStep({},C.step);host.publish();await delay(1000/120);}await until(()=>host.remote.ack>70,'guest input acknowledgements');
  console.log(JSON.stringify({result:'LIVE CONNECTION PASS',scenario:forceRestart?'forced fallback ICE restart':'direct first',realSignaling:true,realWebRTC:true,gamePing:matches.map(entry=>entry.room.connectionReport.ping),samples:matches.map(entry=>entry.room.connectionReport.samples),restartOffers:peers.reduce((sum,peer)=>sum+peer.restartOffers,0),ack:host.remote.ack,route:'same-container host ICE; public signaling through inherited proxy; no public TURN data test'}));
 }finally{closing=true;for(const controller of controllers){controller.cancel();controller.matchedRoom?.close();}for(const peer of peers)await peer.close();}
}
try{await scenario(false);await scenario(true);}catch(error){console.error('LIVE CONNECTION CHECK FAILED:',error.message);process.exitCode=1;}
