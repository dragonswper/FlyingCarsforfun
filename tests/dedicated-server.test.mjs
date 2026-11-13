import test from 'node:test';
import assert from 'node:assert/strict';
import {TrustedSocket as WebSocket,TrustedLink as Link,tls,secureFetch,credentials} from './helpers/secure-server.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {createGameServer} from '../server/index.mjs';
import {DedicatedRoom,parseServerInvite} from '../dist/dedicated-room.js';
import {ServerLink,serverEndpoint} from '../dist/server-link.js';
import {NET_BUILD} from '../dist/network-protocol.js';
import {C} from '../dist/physics.js';

async function until(check,label,timeout=5000){const started=performance.now();while(!check()){if(performance.now()-started>timeout)throw Error('Timed out: '+label);await delay(10);}}
async function lobby(t,{people=2,maxPeople=4}={}){
 const app=createGameServer({tls}),address=await app.listen(0),base='https://127.0.0.1:'+address.port,url=base.replace('https:','wss:')+'/multiplayer',clients=[],chat=[],errors=[];
 function make(name){const room=new DedicatedRoom({address:url,Link,credentials:credentials(url),onChat:message=>chat.push({recipient:name,...message}),onDisconnect:message=>errors.push({name,message})});clients.push(room);return room;}
 t.after(async()=>{for(const room of clients)room.close();await app.close();});const owner=make('Owner');owner.create({maxPeople,duration:120},{name:'Owner'});await until(()=>owner.admitted,'owner admission');for(let n=1;n<people;n++){const guest=make('Player '+n);guest.join(owner.invite,{name:'Player '+n});await until(()=>guest.admitted,'guest admission');}await until(()=>owner.members.length===people,'roster');return {app,base,url,clients,owner,make,chat,errors};
}
async function start(h){for(let n=0;n<h.clients.length;n++){h.clients[n].chooseTeam(n%2);h.clients[n].setReady(true);}await until(()=>h.owner.members.every(member=>member.team!==null&&member.ready),'ready');assert.equal(h.owner.startMatch(),true);await until(()=>h.clients.every(room=>room.active),'match');return h.app.rooms.get(h.owner.code);}

test('dedicated invitations include the endpoint and all participants use client-owned cars',async t=>{
 const h=await lobby(t),session=await start(h);assert.equal(h.owner.canManage,true);assert.equal(h.clients[1].canManage,false);assert.equal(session.sim.localPlayerId,null);assert.deepEqual(h.clients.map(room=>room.sim.localPlayerId),[0,1]);assert.ok(h.clients.every(room=>room.role==='guest'));assert.equal(h.clients[0].matchId,h.clients[1].matchId);assert.deepEqual(parseServerInvite(h.owner.invite),{code:h.owner.code,address:h.url});assert.equal(h.errors.length,0);
});
test('a dedicated server admits eight people without reserving a player slot for itself',async t=>{
 const h=await lobby(t,{people:8,maxPeople:8});assert.equal(h.owner.members.length,8);assert.deepEqual(h.clients.map(room=>room.id),[0,1,2,3,4,5,6,7]);for(const room of h.clients)assert.equal(room.self.team,null);const extra=h.make('Extra');extra.join(h.owner.invite,{name:'Extra'});await until(()=>extra.closed,'capacity rejection');assert.match(extra.error,/full/);
});
test('the lobby owner can spectate, while unauthorized start/configuration commands are rejected',async t=>{
 const h=await lobby(t),guest=h.clients[1];guest.link.send({t:'server-configure',options:{duration:999,maxPeople:8}});guest.link.send({t:'server-start'});await delay(30);assert.equal(h.app.rooms.get(h.owner.code).options.duration,120);assert.equal(h.app.rooms.get(h.owner.code).sim,undefined);assert.match(guest.notice,/Only the lobby owner/);guest.chooseTeam(1);guest.setReady(true);await until(()=>h.owner.members[1].ready&&h.owner.members[1].team===1,'guest ready');h.owner.startMatch();await until(()=>h.owner.active&&guest.active,'spectating owner match');assert.equal(h.owner.sim.localPlayerId,null);assert.equal(guest.sim.localPlayerId,guest.id);
});
test('the headless simulation acknowledges both clients and runs while their menus have no driving input',async t=>{
 const h=await lobby(t),session=await start(h);session.sim.phase='playing';session.publish(true);await until(()=>h.clients.every(room=>room.sim.phase==='playing'),'playing');for(let n=0;n<100;n++){h.clients[0].guestStep({throttle:1});h.clients[1].guestStep({throttle:-1});for(const room of h.clients)room.sendInputs(true);await delay(1000/120);}await until(()=>[...session.entries.values()].every(entry=>entry.remote.ack>90),'both acknowledgements');const elapsed=session.sim.elapsed;await delay(80);assert.ok(session.sim.elapsed>elapsed+.04);assert.ok(h.clients.every(room=>room.replica.lastSequence>10));
});
test('one socket reconnects to the same car and match while the other client keeps playing',async t=>{
 const h=await lobby(t),session=await start(h),guest=h.clients[1],match=guest.matchId,sim=guest.sim;session.sim.phase='playing';session.publish(true);await until(()=>guest.sim.phase==='playing','playing');const before=session.sim.elapsed;guest.link.socket.terminate();await until(()=>guest.recovering,'recovery begins');await until(()=>!guest.recovering&&guest.active,'recovery ends');assert.equal(guest.matchId,match);assert.equal(guest.sim,sim);assert.ok(session.sim.elapsed>before+.3);assert.equal(session.entries.get(guest.id).member.connected,true);guest.guestStep({throttle:1});guest.sendInputs(true);await until(()=>session.entries.get(guest.id).remote.ack>=1,'post-recovery input');assert.equal(h.errors.length,0);
});
test('shared chat reaches everyone and a late spectator receives the current feed and running match',async t=>{
 const h=await lobby(t),session=await start(h);assert.equal(h.clients[1].sendChat('Hello from the server'),true);await until(()=>h.chat.length===2,'chat');const watcher=h.make('Watcher');watcher.join(h.owner.invite,{name:'Watcher'});await until(()=>watcher.active,'late spectator');assert.equal(watcher.sim.localPlayerId,null);assert.equal(watcher.chat.state().messages.at(-1).text,'Hello from the server');assert.equal(watcher.matchId,session.matchId);
});
test('a departing owner passes management to a remaining player and the server releases empty rooms',async t=>{
 const h=await lobby(t),guest=h.clients[1];h.owner.close();await until(()=>guest.canManage&&guest.members.length===1,'owner transfer');assert.equal(guest.ownerId,guest.id);guest.close();await until(()=>h.app.rooms.size===0,'empty room release');
});
test('HTTPS serves the game and health without exposing files outside the public directory',async t=>{
 const h=await lobby(t,{people:1});const health=await secureFetch(h.base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).build,NET_BUILD);const index=await secureFetch(h.base+'/');assert.equal(index.status,200);assert.match(await index.text(),/CUSTOM PRIVATE LOBBY/);const traversal=await secureFetch(h.base+'/..%2fpackage.json');assert.equal(traversal.status,403);const method=await secureFetch(h.base+'/',{method:'POST'});assert.equal(method.status,405);
});
test('invalid versions, unknown invites and cross-origin upgrades are rejected',async t=>{
 const h=await lobby(t,{people:1}),bad=h.make('Bad');bad.join('BCS-AAAAAAAAAAAAAAAAAAAAAA',{name:'Bad'});await until(()=>bad.closed,'missing invite');assert.match(bad.error,/does not exist/);const ws=new WebSocket(h.url);t.after(()=>ws.terminate());await new Promise(resolve=>ws.once('open',resolve));const reply=new Promise(resolve=>ws.once('message',data=>resolve(JSON.parse(String(data)))));ws.send(JSON.stringify({t:'server-create',build:'old',token:'a'.repeat(32)}));assert.match((await reply).message,/versions differ/);
 const forbidden=new WebSocket(h.url,{origin:'https://unrelated.invalid'});t.after(()=>forbidden.terminate());const failed=new Promise(resolve=>forbidden.on('unexpected-response',(request,response)=>{response.resume();resolve(response.statusCode);}));forbidden.on('error',()=>{});assert.equal(await failed,403);
});
test('server endpoint validation permits HTTPS convenience URLs and rejects plaintext hosting',()=>{
 assert.throws(()=>serverEndpoint('http://localhost:8787',{protocol:'http:'}),/secure wss/);assert.equal(serverEndpoint('https://arena.example',{protocol:'https:'}),'wss://arena.example/multiplayer');assert.throws(()=>serverEndpoint('ws://localhost:8787',{protocol:'https:'}),/needs a secure/);assert.throws(()=>serverEndpoint('javascript:alert(1)'),/Use a wss/);assert.throws(()=>serverEndpoint('wss://name:password@arena.example'),/without a password/);assert.throws(()=>parseServerInvite('BCS-bad'),/complete BCS/);
});

test('both players must consent before the dedicated server starts a fresh rematch',async t=>{
 const h=await lobby(t),session=await start(h),old=session.matchId;session.sim.phase='ended';session.events([{type:'end'}]);await until(()=>h.clients.every(room=>room.sim.phase==='ended'),'results');assert.equal(h.owner.requestRematch(),true);await delay(30);assert.equal(session.matchId,old);assert.equal(h.clients[1].requestRematch(),true);await until(()=>h.clients.every(room=>room.active&&room.matchId!==old),'rematch');assert.equal(session.sim.localPlayerId,null);assert.deepEqual(session.sim.score,[0,0]);
});
