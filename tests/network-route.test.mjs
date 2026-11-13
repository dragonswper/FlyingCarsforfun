import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {RoomTransport,DIRECT_CONNECT_MS} from '../dist/network-transport.js';
import {directServers,hasRelay,readConnectionInfo,routeLabel} from '../dist/network-route.js';
import {connectionDetails,setupNetworkUI} from '../dist/network-ui.js';
import {networkPreferences} from '../dist/network-quality.js';

class Clock{now=0;id=0;jobs=new Map();set=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{at:this.now+ms,fn});return id;};clear=id=>this.jobs.delete(id);step(ms){const end=this.now+ms;for(;;){const next=[...this.jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.jobs.delete(next[0]);this.now=next[1].at;next[1].fn();}this.now=end;}}
class RTC{
 constructor(config){this.config=config;this.configurations=[];this.offers=[];this.connectionState='new';}
 createDataChannel(label){return {label,readyState:'connecting',bufferedAmount:0,close(){this.readyState='closed';}};}
 setConfiguration(config){this.config=config;this.configurations.push(config);}
 async createOffer(options){this.offers.push(options);return {type:'offer',sdp:options?.iceRestart?'restarted':'initial'};}
 async createAnswer(){this.answerConfiguration=this.config;return {type:'answer',sdp:'answer'};}
 async setLocalDescription(value){this.localDescription=value;}
 async setRemoteDescription(value){this.remoteDescription=value;}
 async addIceCandidate(){}async getStats(){return this.stats||new Map();}close(){this.connectionState='closed';}
}
const servers=[{urls:['stun:local.example:3478','turn:relay.example:3478?transport=udp'],username:'test-user',credential:'test-only'},{urls:'turns:relay.example:443?transport=tcp'}];
function transport(t,initiator=true){const clock=new Clock(),sent=[],closed=[],link=new RoomTransport({RTCClass:RTC,setTimer:clock.set,clearTimer:clock.clear,onClose:reason=>closed.push(reason)});link.ws={readyState:1,send:raw=>sent.push(JSON.parse(raw)),close(){}};link.role=initiator?'host':'guest';link.iceServers=structuredClone(servers);link.makePeer('peer',initiator);link.pc.localDescription={type:'offer',sdp:'initial'};link.pc.remoteDescription={type:'answer',sdp:'initial'};link.negotiated();t.after(()=>link.close());return {link,clock,sent,closed};}
function stats({relay=false,rtt=.085,selected=true}={}){const values=[{id:'local',type:'local-candidate',candidateType:relay?'relay':'srflx',protocol:'udp',relayProtocol:relay?'tcp':undefined,address:'192.0.2.5',port:1234},{id:'remote',type:'remote-candidate',candidateType:'host',protocol:'udp',address:'198.51.100.10'},{id:'pair',type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'local',remoteCandidateId:'remote',currentRoundTripTime:rtt}];if(selected)values.push({id:'transport',type:'transport',selectedCandidatePairId:'pair'});return new Map(values.map(value=>[value.id,value]));}

test('direct-first ICE strips relay URLs without changing provider configuration or credentials',()=>{
 const input=structuredClone(servers),direct=directServers(input);assert.equal(hasRelay(input),true);assert.deepEqual(direct.map(server=>server.urls),[['stun:local.example:3478']]);assert.deepEqual(input,servers);assert.equal(hasRelay(direct),false);assert.equal(hasRelay(undefined),false);assert.deepEqual(directServers([{urls:'stun:one'},null,{urls:7}]),[{urls:'stun:one'}]);
});
test('a successful direct connection never enables the shared relay or restarts ICE',async t=>{
 const h=transport(t);assert.equal(hasRelay(h.link.pc.config.iceServers),false);await h.link.offer();for(const channel of Object.values(h.link.channels)){channel.readyState='open';channel.onopen();}assert.equal(h.link.open,true);h.clock.step(60000);assert.equal(h.link.relayFallback,false);assert.equal(h.link.pc.configurations.length,0);assert.equal(h.link.pc.offers.length,1);assert.equal(h.clock.jobs.size,0);
});
test('a blocked direct path enables supplied TURN servers once and negotiates an explicit ICE restart',async t=>{
 const h=transport(t);await h.link.offer();h.clock.step(DIRECT_CONNECT_MS);await settle();assert.equal(h.link.relayFallback,true);assert.deepEqual(h.link.pc.config.iceServers,servers);assert.deepEqual(h.link.pc.offers,[undefined,{iceRestart:true}]);assert.equal(h.sent.at(-1).payload.boostRelay,true);h.link.enableRelay();assert.equal(h.link.pc.configurations.length,1);h.link.close();h.clock.step(60000);assert.equal(h.closed.length,0);assert.equal(h.clock.jobs.size,0);
});
test('the answerer enables relay gathering before answering a fallback offer, even before its own timer',async t=>{
 const h=transport(t,false);await h.link.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'offer',payload:{type:'offer',sdp:'restart',boostRelay:true}}));assert.equal(h.link.relayFallback,true);assert.deepEqual(h.link.pc.answerConfiguration.iceServers,servers);assert.equal(h.link.pc.offers.length,0);assert.equal(h.sent.at(-1).type,'answer');
});
test('early direct failure attempts the relay while a genuinely unsupported fallback exits cleanly',async t=>{
 const h=transport(t);h.link.pc.connectionState='failed';h.link.pc.onconnectionstatechange();await settle();assert.equal(h.link.closed,false);assert.equal(h.link.relayFallback,true);const broken=transport(t);broken.link.pc.setConfiguration=()=>{throw Error('unsupported');};broken.link.enableRelay();assert.equal(broken.link.closed,true);assert.match(broken.closed[0],/relay fallback/);assert.equal(broken.clock.jobs.size,0);
});
test('route statistics select the active pair, convert seconds to milliseconds and exclude private endpoints',()=>{
 const data=stats(),other={id:'unused',type:'candidate-pair',state:'succeeded',selected:true,currentRoundTripTime:.8};data.set('unused',other);const info=readConnectionInfo(data);assert.deepEqual(info,{route:'direct',protocol:'udp',networkPing:85});assert.equal(routeLabel(info),'DIRECT UDP');assert.ok(!JSON.stringify(info).includes('192.0.2'));assert.deepEqual(readConnectionInfo(stats({relay:true,rtt:.45})),{route:'relay',protocol:'tcp',networkPing:450});assert.equal(readConnectionInfo(stats({selected:false})).networkPing,85);
 const ambiguous=stats({selected:false});ambiguous.set('second',{...ambiguous.get('pair'),id:'second'});assert.equal(readConnectionInfo(ambiguous).route,'unknown');assert.equal(readConnectionInfo(stats({rtt:NaN})).networkPing,null);assert.equal(readConnectionInfo(new Map()).networkPing,null);
});
test('native stats reads do not overlap, fail softly and ignore completion after departure',async t=>{
 const h=transport(t);h.link.open=true;let release,calls=0;h.link.pc.getStats=()=>{calls++;return new Promise(resolve=>release=resolve);};const first=h.link.refreshStats();await h.link.refreshStats();assert.equal(calls,1);h.link.close();release(stats());await first;assert.equal(h.link.connectionInfo.route,'unknown');const other=transport(t);other.link.open=true;other.link.pc.getStats=async()=>{throw Error('not supported');};await other.link.refreshStats();assert.equal(other.link.closed,false);assert.equal(other.link.connectionInfo.networkPing,null);
});
test('connection details preserve real high game latency while distinguishing native network delay and relay routing',()=>{
 assert.match(connectionDetails(null,null),/No peer/);const room={connectionInfo:{route:'direct',protocol:'udp',networkPing:55}};const detail=connectionDetails(room,{ping:450});assert.match(detail,/Network 55 ms.*Game 450 ms/);assert.match(detail,/Low graphics/);assert.match(detail,/beyond the network/);room.connectionInfo={route:'relay',protocol:'tcp',networkPing:350};assert.match(connectionDetails(room,{ping:400}),/RELAYED TCP.*location/);
});
test('warning/strict preferences sync between both menus and remain explicit after save',()=>{
 const ids=['search-region','search-ping','search-policy','search-ping-label','settings-region','settings-ping','settings-policy','settings-ping-label','connection-details','rematch-button','next-match-button','reconnect-leave'],nodes=Object.fromEntries(ids.map(id=>[id,Object.assign(new EventTarget(),{value:'',textContent:''})])),preferences=networkPreferences({region:'oceania',maxPing:100});let saves=0;
 setupNetworkUI({preferences,save:()=>saves++},{getElementById:id=>nodes[id]});assert.equal(nodes['search-policy'].value,'warn');assert.equal(nodes['search-ping-label'].textContent,'PREFERRED PING');nodes['settings-policy'].value='strict';nodes['settings-policy'].dispatchEvent(new Event('change'));assert.equal(preferences.strictPing,true);assert.equal(nodes['search-policy'].value,'strict');assert.equal(nodes['search-ping-label'].textContent,'MAXIMUM PING');assert.equal(saves,1);
});

test('relay fallback waits for initial SDP negotiation and is cancelled if a direct path opens meanwhile',async t=>{
 const h=transport(t);h.link.pc.signalingState='have-local-offer';h.clock.step(DIRECT_CONNECT_MS);assert.equal(h.link.relayFallback,false);assert.equal(h.link.pc.configurations.length,0);h.link.pc.signalingState='stable';h.link.pc.localDescription={type:'offer',sdp:'initial'};h.link.pc.remoteDescription={type:'answer',sdp:'answer'};for(const channel of Object.values(h.link.channels)){channel.readyState='open';channel.onopen();}h.clock.step(1000);assert.equal(h.link.pc.configurations.length,0);assert.equal(h.clock.jobs.size,0);
 const next=transport(t);next.link.pc.signalingState='have-local-offer';next.clock.step(DIRECT_CONNECT_MS);next.link.pc.signalingState='stable';next.link.pc.localDescription={type:'offer',sdp:'initial'};next.link.pc.remoteDescription={type:'answer',sdp:'answer'};next.clock.step(250);await settle();assert.equal(next.link.relayFallback,true);assert.equal(next.link.pc.offers[0].iceRestart,true);
});
test('future ICE candidates wait for their SDP and stale candidates cannot kill a restarted connection',async t=>{
 const h=transport(t,false);h.link.pc.remoteDescription={type:'offer',sdp:'a=mid:0\r\na=ice-ufrag:old\r\n'};const added=[];h.link.pc.addIceCandidate=async candidate=>added.push(candidate);const candidate={candidate:'candidate future',sdpMid:'0',usernameFragment:'fresh'};
 await h.link.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'candidate',payload:candidate}));assert.equal(added.length,0);assert.equal(h.link.candidates.length,1);await h.link.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'offer',payload:{type:'offer',sdp:'a=mid:0\r\na=ice-ufrag:fresh\r\n',boostRelay:true}}));assert.deepEqual(added,[candidate]);
 h.link.pc.addIceCandidate=async()=>{throw Error('Old ICE generation');};await h.link.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'candidate',payload:candidate}));assert.equal(h.link.closed,false);assert.equal(h.link.rejectedCandidates,1);assert.equal(h.link.candidateMatches({candidate:7,usernameFragment:8}),true);assert.equal(h.link.candidateMatches(null),false);
});

test('a slow initial signaling exchange still gets a full direct-connection window before relay fallback',async t=>{
 const clock=new Clock(),link=new RoomTransport({RTCClass:RTC,setTimer:clock.set,clearTimer:clock.clear});link.role='guest';link.iceServers=servers;link.ws={readyState:1,send(){},close(){}};link.makePeer('peer',false);t.after(()=>link.close());clock.step(8000);assert.equal(link.relayFallback,false);assert.equal(link.directTimer,undefined);
 await link.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'offer',payload:{type:'offer',sdp:'initial'}}));clock.step(DIRECT_CONNECT_MS-1);assert.equal(link.relayFallback,false);clock.step(1);assert.equal(link.relayFallback,true);assert.equal(link.closed,false);clock.step(13499);assert.equal(link.closed,false);clock.step(1);assert.equal(link.closed,true);
});
