import {createHash,randomBytes} from 'node:crypto';
import {playerName} from '../dist/chat-history.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const ID=/^BC-[A-F0-9]{12}$/;
// Persistent profiles contain credential hashes, names and mutual relationships.
// Presence, room capabilities and short-lived invitations are never persisted.
export class SocialService{
 constructor({store=null,room=()=>null,clock=()=>Date.now(),maxProfiles=4096}={}){Object.assign(this,{store,room,clock,maxProfiles});this.profiles=new Map();this.saved=new Map();this.presence=new Map();this.lobbies=new Map();this.invites=new Map();this.rates=new Map();this.chain=Promise.resolve();}
 async load() {
  if(!this.loaded)this.loaded=(async()=>{
   if(!this.store)return;
   let startAfter;
   while(true){
    const rows=await this.store.list({prefix:'profile:',limit:1000,...(startAfter?{startAfter}:{})});
    for(const [key,p]of rows)if(key.startsWith('profile:')&&ID.test(p?.id)&&typeof p.hash==='string'){
     this.profiles.set(p.id,p);this.saved.set(p.id,structuredClone(p));
    }
    if(rows.size<1000)break;
    startAfter=[...rows.keys()].at(-1);
   }
  })().catch(error=>{
   // Retry a temporary storage outage; never keep a rejected startup promise
   // or a partially loaded player directory for the object's whole lifetime.
   this.loaded=null;this.profiles.clear();this.saved.clear();throw error;
  });
  return this.loaded;
 }
 async save(...profiles){if(!this.store)return;const unique=[...new Set(profiles)],write=async store=>{for(const p of unique)await store.put('profile:'+p.id,p);};try{if(this.store.transaction)await this.store.transaction(write);else await write(this.store);for(const p of unique)this.saved.set(p.id,structuredClone(p));}catch(error){for(const p of unique){const old=this.saved.get(p.id);if(old)this.profiles.set(p.id,structuredClone(old));else this.profiles.delete(p.id);}throw error;}}
 handle(body,secret,address='unknown'){const task=this.chain.then(()=>this.execute(body,secret,address));this.chain=task.catch(()=>{});return task.catch(error=>({status:error.status||503,data:{error:error.status?error.message:'Friends are temporarily unavailable. Try again.'}}));}
 prune(){const now=this.clock();for(const [id,tabs]of this.presence){for(const [tab,p]of tabs)if(p.at<now-60000)tabs.delete(tab);if(!tabs.size)this.presence.delete(id);}for(const [id,record]of this.lobbies)if(!this.retainedLobby(record))this.lobbies.delete(id);for(const [id,list]of this.invites){const valid=list.filter(i=>i.expires>now&&this.lobbies.has(i.owner));if(valid.length)this.invites.set(id,valid);else this.invites.delete(id);}for(const [id,r]of this.rates)if(r.until<=now)this.rates.delete(id);}
 retainedLobby(record){const room=this.room(record.code),member=room?.entries.get(record.memberId)?.member;return room&&!room.closed&&!room.matchmade&&room.ownerId===record.memberId&&member?.authId===record.authId?room:null;}
 validLobby(record){const room=this.retainedLobby(record);return room?.entries.get(record.memberId)?.member.connected?room:null;}
 summary(id){const p=this.profiles.get(id),tabs=this.presence.get(id),last=tabs?[...tabs.values()].sort((a,b)=>b.at-a.at)[0]:null,shared=this.lobbies.get(id),room=shared&&this.validLobby(shared);return p?{id:p.id,name:p.name,online:!!last||!!room,status:last?.status||(room?(room.matchId?'playing':'lobby'):'offline')}:null;}
 lobby(record){if(!record)return null;const room=this.validLobby(record);return room?{id:record.owner,name:this.profiles.get(record.owner)?.name||'Driver',visibility:record.visibility,people:room.members.length,maxPeople:room.options.maxPeople,arena:room.options.arena,...(room.options.randomArena?{randomArena:true}:{}),mode:room.options.mode,playing:!!room.matchId&&room.sim?.phase!=='ended'}:null;}
 snapshot(p){const own=this.lobbies.get(p.id);return {self:{id:p.id,name:p.name},online:new Set([...this.presence.keys(),...[...this.lobbies.values()].filter(r=>this.validLobby(r)).map(r=>r.owner)]).size,friends:p.friends.map(id=>this.summary(id)).filter(Boolean),incoming:p.incoming.map(id=>this.summary(id)).filter(Boolean),outgoing:p.outgoing.map(id=>this.summary(id)).filter(Boolean),blocked:p.blocked.map(id=>this.summary(id)).filter(Boolean),invites:(this.invites.get(p.id)||[]).filter(i=>p.friends.includes(i.owner)).map(i=>({id:i.id,from:this.summary(i.owner),lobby:this.lobby(this.lobbies.get(i.owner)),expires:i.expires})).filter(i=>i.lobby),lobbies:[...this.lobbies.values()].filter(r=>r.owner===p.id||r.visibility==='public'||r.visibility==='friends'&&p.friends.includes(r.owner)).filter(r=>!p.blocked.includes(r.owner)&&!this.profiles.get(r.owner)?.blocked.includes(p.id)).map(r=>this.lobby(r)).filter(Boolean),ownLobby:own?this.lobby(own):null};}
 publish(p,body){const room=this.room(String(body.code||'')),owner=room?.entries.get(room.ownerId)?.member;if(!room||room.closed||room.matchmade||!owner?.connected||typeof body.proof!=='string'||owner.token!==body.proof)fail('Only the connected lobby host can share this lobby.',403);if(!['public','friends','private'].includes(body.visibility))fail('Choose a lobby visibility.');this.lobbies.set(p.id,{owner:p.id,code:room.code,memberId:room.ownerId,authId:owner.authId,visibility:body.visibility});}
 async execute(body,secret,address){
  await this.load();if(!body||typeof body!=='object'||Array.isArray(body)||typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))fail('A valid device identity is required.',401);
  this.prune();const hash=digest(secret),id='BC-'+hash.slice(0,12).toUpperCase(),now=this.clock();let p=this.profiles.get(id);
  if(p&&p.hash!==hash)fail('This device identity could not be verified.',401);
  if(body.op==='sync'&&!/^[a-f0-9-]{16,64}$/.test(String(body.tab||'')))fail('A valid tab ID is required.');
  if(!p){if(body.op!=='sync')fail('Open the game to create your player ID first.',401);if(this.profiles.size>=this.maxProfiles)fail('The player directory is full. Try again later.',503);const key='new:'+address,bucket=this.rates.get(key)||{count:0,until:now+3600000};if(++bucket.count>32||!this.rates.has(key)&&this.rates.size>=this.maxProfiles+2048)fail('Too many new device IDs. Try again later.',429);this.rates.set(key,bucket);p={id,hash,name:playerName(body.name),friends:[],incoming:[],outgoing:[],blocked:[]};this.profiles.set(id,p);await this.save(p);}
  // Only authenticated, stored identities receive a per-device rate bucket.
  const rate=this.rates.get(id)||{count:0,until:now+60000};if(++rate.count>90)fail('Please wait before trying again.',429);this.rates.set(id,rate);
  const peer=this.profiles.get(body.peer),unlink=(a,b)=>{for(const key of ['friends','incoming','outgoing'])a[key]=a[key].filter(id=>id!==b.id);};
  switch(body.op){
   case 'sync':{
    const name=playerName(body.name);if(p.name!==name){p.name=name;await this.save(p);}const tab=String(body.tab||'');if(!/^[a-f0-9-]{16,64}$/.test(tab))fail('A valid tab ID is required.');let tabs=this.presence.get(id);if(!tabs)this.presence.set(id,tabs=new Map());if(tabs.size>=8&&!tabs.has(tab))fail('Too many open game tabs.',429);tabs.set(tab,{at:now,status:['menu','lobby','playing','away'].includes(body.status)?body.status:'menu'});break;
   }
   case 'leave':this.presence.get(id)?.delete(body.tab);if(!this.presence.get(id)?.size)this.presence.delete(id);this.prune();break;
   case 'search':{const term=String(body.query||'').trim().toLocaleLowerCase().slice(0,40);if(term.length<3)fail('Enter at least three characters or a complete player ID.');return {status:200,data:{results:[...this.profiles.values()].filter(q=>q.id!==id&&!p.blocked.includes(q.id)&&!q.blocked.includes(id)&&(q.id.toLowerCase()===term||q.name.toLocaleLowerCase().includes(term))).slice(0,20).map(q=>this.summary(q.id))}};}
   case 'request':
    if(!peer||peer.id===id||p.blocked.includes(peer.id)||peer.blocked.includes(id))fail('This player is unavailable.');if(p.friends.includes(peer.id)||p.outgoing.includes(peer.id))break;if(p.outgoing.length>=32||peer.incoming.length>=32)fail('There are too many pending requests.');p.outgoing.push(peer.id);peer.incoming.push(id);await this.save(p,peer);break;
   case 'accept':
    if(!peer||!p.incoming.includes(peer.id)||!peer.outgoing.includes(id)||p.blocked.includes(peer.id)||peer.blocked.includes(id))fail('This friend request is no longer available.');if(p.friends.length>=64||peer.friends.length>=64)fail('The friend list is full.');unlink(p,peer);unlink(peer,p);p.friends.push(peer.id);peer.friends.push(id);await this.save(p,peer);break;
   case 'decline':case 'remove':case 'block':case 'unblock':
    if(!peer||peer.id===id)fail('Choose another player.');if(body.op==='unblock')p.blocked=p.blocked.filter(value=>value!==peer.id);else if(body.op==='decline'){for(const value of [p,peer])for(const key of ['incoming','outgoing'])value[key]=value[key].filter(other=>other!==(value===p?peer.id:id));}else{if(body.op==='block'&&!p.blocked.includes(peer.id)){if(p.blocked.length>=64)fail('The blocked list is full.');p.blocked.push(peer.id);}unlink(p,peer);unlink(peer,p);}
    this.invites.set(id,(this.invites.get(id)||[]).filter(i=>i.owner!==peer.id));this.invites.set(peer.id,(this.invites.get(peer.id)||[]).filter(i=>i.owner!==id));await this.save(p,peer);break;
   case 'publish':this.publish(p,body);break;
   case 'unpublish':this.lobbies.delete(id);break;
   case 'invite':{
    if(!peer||!p.friends.includes(peer.id))fail('Add this player as a friend first.');const record=this.lobbies.get(id);if(!record||!this.validLobby(record))fail('Create and share a dedicated lobby first.');const list=(this.invites.get(peer.id)||[]).filter(i=>i.owner!==id);if(list.length>=16)fail('This player has too many lobby invites.');list.push({id:randomBytes(12).toString('hex'),owner:id,expires:now+120000});this.invites.set(peer.id,list);break;
   }
   case 'dismiss':this.invites.set(id,(this.invites.get(id)||[]).filter(i=>i.id!==body.invite));break;
   case 'join':{
    const record=this.lobbies.get(String(body.lobby||'')),room=record&&this.validLobby(record),invited=(this.invites.get(id)||[]).some(i=>i.owner===record?.owner&&i.expires>now);
    if(!record||!room||p.blocked.includes(record.owner)||this.profiles.get(record.owner)?.blocked.includes(id)||!(record.owner===id||record.visibility==='public'||record.visibility==='friends'&&p.friends.includes(record.owner)||invited&&p.friends.includes(record.owner)))fail('This lobby is no longer available.',403);if(room.members.length>=room.options.maxPeople)fail('This lobby is full.');return {status:200,data:{code:record.code}};
   }
   default:fail('Unknown friends action.');
  }
  return {status:200,data:this.snapshot(p)};
 }
}
