import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';
import {cloudflareServer,until} from './helpers/cloudflare-server.mjs';
test('Cloudflare friend invites reuse the same lobby, support a member inviting a third player, and broadcast garage choices',async t=>{
 const h=await cloudflareServer(t),profiles=[];
 for(const name of ['Party Host','Party Guest','Party Friend']){const secret=randomBytes(32).toString('hex'),tab=randomUUID(),call=async(op,body={})=>{const response=await h.request('/api/social',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify({op,name,tab,...body})});return {status:response.status,data:await response.json()};};profiles.push({call,id:(await call('sync')).data.self.id});}
 const [a,b,c]=profiles;for(const [one,two]of [[a,b],[b,c]]){await one.call('request',{peer:two.id});await two.call('accept',{peer:one.id});}
 const host=h.client('Host');host.create({mode:'custom',maxPeople:8},host.testLook);await until(()=>host.admitted,'host');
 assert.equal((await a.call('publish',{code:host.code,proof:host.token,visibility:'private'})).status,200);await a.call('invite',{peer:b.id});const accepted=await b.call('join',{lobby:a.id});assert.equal(accepted.data.code,host.code);
 const guest=h.client('Guest');guest.join(accepted.data.code,guest.testLook);await until(()=>guest.admitted,'guest');
 assert.equal((await b.call('invite',{peer:c.id,code:host.code,proof:'guessed'})).status,403);
 assert.equal((await b.call('invite',{peer:c.id,code:host.code,proof:guest.token})).status,200);const invited=(await c.call('sync')).data.invites;assert.equal(invited[0].from.id,b.id);
 const joined=await c.call('join',{lobby:a.id});assert.equal(joined.data.code,host.code);const third=h.client('Third');third.join(joined.data.code,third.testLook);await until(()=>host.members.length===3&&third.admitted,'three-member lobby');
 host.updateAppearance({body:'rally',paint:'mint',name:'Updated Host'});await until(()=>[guest,third].every(room=>room.members.find(member=>member.id===host.id)?.look.body==='rally'),'shared appearance');assert.equal(third.members.find(member=>member.id===host.id).look.paint,'mint');assert.deepEqual(h.errors,[]);
});
