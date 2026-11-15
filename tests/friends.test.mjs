import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';
import {SocialService} from '../server/social-service.mjs';import {deviceSecret,FriendsClient} from '../dist/friends-client.js';
function harness(){let now=1000000;const rows=new Map(),rooms=new Map(),store={async list(){return new Map(structuredClone([...rows]));},async put(key,p){rows.set(key,structuredClone(p));}},service=new SocialService({store,room:code=>rooms.get(code),clock:()=>now});
 const client=name=>{const secret=randomBytes(32).toString('hex'),tab=randomUUID();return {secret,tab,name,call:(op,body={})=>service.handle({op,name,tab,...body},secret)};};
 return {service,store,rows,rooms,client,time:ms=>now+=ms};}
async function two(h){const a=h.client('Same Name'),b=h.client('Same Name');a.id=(await a.call('sync')).data.self.id;b.id=(await b.call('sync')).data.self.id;return {a,b};}
async function befriend(a,b){assert.equal((await a.call('request',{peer:b.id})).status,200);assert.equal((await b.call('accept',{peer:a.id})).status,200);}
test('a storage outage cannot leave an apparently saved one-sided friendship request in memory',async()=>{
 const h=harness(),{a,b}=await two(h);let fail=true;h.store.transaction=async callback=>{if(fail)throw Error('storage unavailable');return callback(h.store);};
 assert.equal((await a.call('request',{peer:b.id})).status,503);fail=false;assert.equal((await a.call('sync')).data.outgoing.length,0);assert.equal((await b.call('sync')).data.incoming.length,0);assert.equal((await a.call('request',{peer:b.id})).status,200);
});
test('IDs are permanent across server reloads, independent from duplicate/changeable names, and secrets stay private',async()=>{
 const h=harness(),{a,b}=await two(h);assert.notEqual(a.id,b.id);assert.match(a.id,/^BC-[A-F0-9]{12}$/);const search=await a.call('search',{query:'Same'});assert.equal(search.data.results[0].id,b.id);
 await befriend(a,b);await a.call('sync',{name:'Changed Name'});const restart=new SocialService({store:h.store});const reply=await restart.handle({op:'sync',name:'Changed Name',tab:a.tab},a.secret);assert.equal(reply.data.self.id,a.id);assert.equal(reply.data.friends[0].id,b.id);assert.equal(reply.data.friends[0].online,false);
 const payload=JSON.stringify(reply.data);assert.ok(!payload.includes(a.secret));assert.ok(!payload.includes('hash'));assert.ok(!JSON.stringify([...h.rows]).includes(a.secret));
});
test('player count deduplicates tabs and drops closed/stale clients without counting bots or stored friends',async()=>{
 const h=harness(),{a,b}=await two(h);const second=randomUUID();assert.equal((await a.call('sync',{tab:second})).data.online,2);await a.call('leave');assert.equal((await b.call('sync')).data.online,2);
 await a.call('leave',{tab:second});assert.equal((await b.call('sync')).data.online,1);h.time(60001);assert.equal((await a.call('sync')).data.online,1);
});
test('requests require recipient acceptance and removal/blocking revoke both sides and pending invites',async()=>{
 const h=harness(),{a,b}=await two(h);assert.equal((await a.call('accept',{peer:b.id})).status,400);await a.call('request',{peer:b.id});let state=(await b.call('sync')).data;assert.equal(state.incoming[0].id,a.id);assert.equal(state.friends.length,0);
 await b.call('accept',{peer:a.id});assert.equal((await a.call('sync')).data.friends[0].id,b.id);await b.call('decline',{peer:a.id});assert.equal((await b.call('sync')).data.friends.length,1,'stale Decline removed an accepted friend');
 await b.call('block',{peer:a.id});assert.equal((await a.call('sync')).data.friends.length,0);assert.equal((await a.call('request',{peer:b.id})).status,400);assert.equal((await a.call('search',{query:b.id})).data.results.length,0);await b.call('unblock',{peer:a.id});assert.equal((await a.call('request',{peer:b.id})).status,200);
});
test('lobby listings verify the host and keep private room capabilities out of lists',async()=>{
 const h=harness(),{a,b}=await two(h),c=h.client('Outsider');c.id=(await c.call('sync')).data.self.id;await befriend(a,b);
 const code='BCS-'+randomBytes(16).toString('base64url'),proof=randomBytes(16).toString('hex'),room={code,ownerId:0,entries:new Map([[0,{member:{authId:randomUUID(),token:proof,connected:true}}]]),members:[{}],options:{maxPeople:4,mode:'custom',arena:'festival'},sim:null};h.rooms.set(code,room);
 assert.equal((await a.call('publish',{code,proof:'bad',visibility:'public'})).status,403);await a.call('publish',{code,proof,visibility:'friends'});
 const listing=(await b.call('sync')).data;assert.equal(listing.lobbies.length,1);assert.ok(!JSON.stringify(listing).includes(code));assert.ok(!JSON.stringify(listing).includes(proof));assert.equal((await c.call('sync')).data.lobbies.length,0);assert.equal((await c.call('join',{lobby:a.id})).status,403);assert.equal((await b.call('join',{lobby:a.id})).data.code,code);
 h.time(60001);assert.equal((await b.call('sync')).data.lobbies.length,1,'A live host lost sharing when a background-tab heartbeat was throttled');
 room.entries.get(0).member.connected=false;assert.equal((await b.call('sync')).data.lobbies.length,0);room.entries.get(0).member.connected=true;assert.equal((await b.call('sync')).data.lobbies.length,1,'A brief host reconnect lost its visibility setting');
 await a.call('publish',{code,proof,visibility:'private'});assert.equal((await b.call('sync')).data.lobbies.length,0);assert.equal((await b.call('join',{lobby:a.id})).status,403);await a.call('invite',{peer:b.id});assert.equal((await b.call('sync')).data.invites.length,1);assert.equal((await b.call('join',{lobby:a.id})).data.code,code);
 await a.call('publish',{code,proof,visibility:'public'});assert.equal((await c.call('sync')).data.lobbies.length,1);room.members=Array(4).fill({});assert.equal((await c.call('join',{lobby:a.id})).status,400);room.members=[{}];room.ownerId=1;assert.equal((await b.call('sync')).data.lobbies.length,0);assert.equal((await b.call('sync')).data.invites.length,0);
});
test('unsharing, friendship removal and invite expiry revoke private admission',async()=>{
 const h=harness(),{a,b}=await two(h);await befriend(a,b);const code='BCS-test',proof='test',room={code,ownerId:0,entries:new Map([[0,{member:{authId:'id',token:proof,connected:true}}]]),members:[{}],options:{maxPeople:4,mode:'custom',arena:'champions'}};h.rooms.set(code,room);
 await a.call('publish',{code,proof,visibility:'private'});await a.call('invite',{peer:b.id});h.time(120001);await a.call('sync');await b.call('sync');assert.equal((await b.call('join',{lobby:a.id})).status,403);
 await a.call('publish',{code,proof,visibility:'private'});await a.call('invite',{peer:b.id});await b.call('remove',{peer:a.id});assert.equal((await b.call('join',{lobby:a.id})).status,403);await a.call('unpublish');assert.equal((await a.call('sync')).data.ownLobby,null);
});
test('invalid identities, invalid registration and action floods are bounded',async()=>{
 const h=harness();assert.equal((await h.service.handle({op:'sync'},'guess')).status,401);const bad=h.client('bad');assert.equal((await bad.call('sync',{tab:'x'})).status,400);assert.equal(h.rows.size,0);const a=h.client('One');await a.call('sync');let result;for(let i=0;i<100;i++)result=await a.call('sync');assert.equal(result.status,429);
});
test('device credential persists locally, client uses HTTPS headers, and exposes only public profile state',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},secret=deviceSecret(storage);assert.equal(deviceSecret(storage),secret);assert.match(secret,/^[a-f0-9]{64}$/);
 assert.notEqual(deviceSecret(storage,undefined,'https://one.example'),deviceSecret(storage,undefined,'https://two.example'),'Different server operators received the same private device credential');
 const calls=[],client=new FriendsClient({address:'https://example.test',settings:{username:'Test'},secret,fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({self:{id:'BC-123456789ABC',name:'Test'},online:1})};}});await client.sync();client.dispose();assert.equal(calls[0].options.headers.Authorization,'Bearer '+secret);assert.ok(!calls[0].url.includes(secret));assert.ok(!calls[0].options.body.includes(secret));assert.equal(client.state.online,1);assert.throws(()=>new FriendsClient({address:'http://example.test',settings:{},secret}),/secure/);
});
