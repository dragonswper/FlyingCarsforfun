import {createServer as createHTTPServer} from 'node:http';
import {createServer as createHTTPSServer} from 'node:https';
import {readFileSync,createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {PartyRoom,partyOptions} from '../dist/party-room.js';
import {partySecret} from '../dist/party-transport.js';
import {RemoteInputs,NET_BUILD,appearance,decodePacket,MAX_PACKET} from '../dist/network-protocol.js';
import {ConnectionQuality} from '../dist/network-quality.js';
import {C} from '../dist/physics.js';
const ROOT=fileURLToPath(new URL('../dist/',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const tokenOK=token=>typeof token==='string'&&/^[a-f0-9]{32}$/.test(token);
const sameToken=(a,b)=>tokenOK(a)&&tokenOK(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
class SocketLink{
 constructor(socket){this.socket=socket;this.open=true;this.closed=false;this.wire=0;}
 send(packet,realtime=false){if(this.closed||!this.open||this.socket.readyState!==1||this.socket.bufferedAmount>(realtime?8192:65536))return false;const sequence=this.wire+1,data=JSON.stringify(realtime?{...packet,w:sequence}:packet);if(data.length>MAX_PACKET)return false;try{this.socket.send(data);if(realtime)this.wire=sequence;return true;}catch{return false;}}
 close(){if(this.closed)return;this.closed=true;this.open=false;this.socket.close();}
}
export class ServerSession extends PartyRoom{
 constructor({code,options,onEmpty=()=>{},...callbacks}={}){
  super(callbacks);this.role='host';this.id=-1;this.key=partySecret();this.code=code;this.options=partyOptions(options);this.look=appearance({name:'Dedicated Server'});this.signaler={id:'dedicated',close(){}};this.status='lobby';this.ownerId=null;this.onEmpty=onEmpty;this.beat();
 }
 attach(socket,packet){
  let entry=[...this.entries.values()].find(item=>sameToken(item.member.token,packet.token));
  if(packet.t==='server-resume'&&!entry)throw Error('This player’s recovery slot has expired. Join again with the invite.');
  if(entry?.link?.open&&!entry.link.closed)throw Error('That player is already connected.');
  if(!entry){if(this.members.length>=this.options.maxPeople)throw Error('This lobby is full.');const used=new Set(this.members.map(member=>member.id)),id=Array.from({length:8},(_,n)=>n).find(n=>!used.has(n)),member={id,token:packet.token,look:appearance(packet.look),team:null,ready:true,connected:true};entry={id,member,remote:new RemoteInputs(),quality:new ConnectionQuality(),lastReceive:this.clock(),lastRealtimeAt:this.clock(),pings:new Map(),chatAt:-Infinity};this.members.push(member);this.entries.set(id,entry);if(this.ownerId===null)this.ownerId=id;}
  const resuming=!!entry.recovering&&!!this.matchId&&packet.matchId===this.matchId,link=new SocketLink(socket);entry.link=link;entry.lastReceive=entry.lastRealtimeAt=this.clock();entry.remote=new RemoteInputs();entry.member.connected=!resuming;entry.recovering=resuming;entry.resumeSent=resuming;
  link.send({t:'server-welcome',build:NET_BUILD,key:this.key,code:this.code,selfId:entry.id,ownerId:this.ownerId,matchId:this.matchId||null});
  if(resuming)link.send({...this.config(entry,true),t:'party-resume-state',key:this.key,token:entry.member.token});else{entry.member.connected=true;entry.recovering=false;this.sendLobby();if(this.matchId)this.sendConfig(entry,true);}
  this.recovering=!!this.matchId&&[...this.entries.values()].every(item=>item.recovering);return {entry,link};
 }
 receiveClient(entry,packet){
  if(packet.t==='server-configure'||packet.t==='server-start'){
   if(entry.id!==this.ownerId){entry.link?.send({t:'party-notice',message:'Only the lobby owner can change settings or start.'});return;}
   if(packet.t==='server-configure')this.configure(packet.options);else this.startMatch();return;
  }
  this.receiveHost(entry,packet);
 }
 lostPeer(entry){if(this.closed||this.entries.get(entry.id)!==entry||entry.recovering)return;entry.recovering=true;entry.resumeSent=false;entry.deadline=this.clock()+20000;entry.member.connected=false;entry.remote=new RemoteInputs();const old=entry.link;entry.link=null;old?.close();this.recovering=!!this.matchId&&[...this.entries.values()].every(item=>item.recovering);if(this.recovering)this.recoveryDeadline=entry.deadline;this.sendLobby();}
 recoverLink(){} // Browsers reconnect to the server URL; no peer-signaling queues.
 retryRecovery(entry){const old=entry.link;entry.link=null;entry.resumeSent=false;old?.close();}
 remove(id,reason){if(!this.entries.has(id))return;super.remove(id,reason);if(this.ownerId===id){this.ownerId=this.members.find(member=>member.connected)?.id??this.members[0]?.id??null;this.broadcast({t:'server-owner',ownerId:this.ownerId});}if(!this.entries.size)this.onEmpty(this);}
 pump(dt){if(!this.matchId||this.pendingMatch||this.recovering||this.closed)return;this.hostStep({},dt);const events=this.sim.events.splice(0);if(events.length)this.events(events);this.publish();}
}
export function createGameServer({root=ROOT,maxRooms=8,allowedOrigins=['https://boost-circuit-arena.bobistheman2049.chatgpt.site'],tls=null,tick=true}={}){
 const rooms=new Map(),bindings=new Map(),sockets=new Set();let closed=false,last=performance.now(),accumulator=0;
 const httpHandler=async(request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  let url;try{url=new URL(request.url,'http://localhost');}catch{response.writeHead(400);response.end();return;}if(url.pathname==='/health'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({ok:true,build:NET_BUILD,rooms:rooms.size}));return;}
  let path;try{path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));}catch{response.writeHead(400);response.end();return;}
  if(!path.startsWith(resolve(root)+sep)){response.writeHead(403);response.end();return;}
  try{const info=await stat(path);if(!info.isFile())throw Error();response.writeHead(200,{'Content-Type':MIME[extname(path)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});if(request.method==='HEAD')response.end();else createReadStream(path).on('error',()=>response.destroy()).pipe(response);}catch{response.writeHead(404);response.end('Not found');}
 };
 const server=tls?createHTTPSServer(tls,httpHandler):createHTTPServer(httpHandler),wss=new WebSocketServer({noServer:true,maxPayload:MAX_PACKET,perMessageDeflate:false});
 server.on('upgrade',(request,socket,head)=>{const origin=request.headers.origin,ownOrigin=(tls?'https://':'http://')+request.headers.host;let path;try{path=new URL(request.url,'http://localhost').pathname;}catch{socket.destroy();return;}if(path!=='/multiplayer'||origin&&origin!==ownOrigin&&!allowedOrigins.includes(origin)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}if(sockets.size>=128){socket.destroy();return;}wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));});
 const reject=(socket,message)=>{if(socket.readyState===1)socket.send(JSON.stringify({t:'server-error',message}));socket.close(1008);};
 wss.on('connection',socket=>{
  sockets.add(socket);let messages=0,bucket=performance.now(),handshake=setTimeout(()=>reject(socket,'Send a room request within ten seconds.'),10000);handshake.unref?.();
  socket.on('message',(raw,binary)=>{
   if(binary){reject(socket,'Use JSON text packets.');return;}const packet=decodePacket(String(raw));if(!packet){reject(socket,'Invalid game packet.');return;}const now=performance.now();if(now-bucket>1000){bucket=now;messages=0;}if(++messages>240){reject(socket,'Too many game packets.');return;}
   const current=bindings.get(socket);if(current){try{current.room.receiveClient(current.entry,packet);}catch{reject(socket,'The game packet could not be applied.');}return;}
   if(!['server-create','server-join','server-resume'].includes(packet.t)||packet.build!==NET_BUILD||!tokenOK(packet.token)){reject(socket,'Game versions differ or the room request is invalid. Reload all clients.');return;}
   try{
    let room;if(packet.t==='server-create'){if(rooms.size>=maxRooms)throw Error('This server has no free rooms.');const code='BCS-'+randomBytes(16).toString('base64url');room=new ServerSession({code,options:packet.options,onEmpty:session=>{rooms.delete(session.code);session.close(false);}});rooms.set(code,room);}else room=rooms.get(packet.code);
    if(!room)throw Error('That lobby does not exist on this server. Check the URL and BCS invite.');const attached=room.attach(socket,packet);bindings.set(socket,{room,...attached});clearTimeout(handshake);handshake=null;
   }catch(error){reject(socket,error.message||'The room could not be joined.');}
  });
  socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);clearTimeout(handshake);const current=bindings.get(socket);bindings.delete(socket);if(current&&current.entry.link===current.link)current.room.lostPeer(current.entry);});
 });
 const pump=()=>{const now=performance.now();accumulator=Math.min(.15,accumulator+Math.max(0,(now-last)/1000));last=now;let steps=0;while(accumulator>=C.step&&steps++<18){for(const room of rooms.values())room.pump(C.step);accumulator-=C.step;}};
 const timer=tick?setInterval(pump,1000/120):null;timer?.unref?.();
 return {server,rooms,bindings,pump,async listen(port=8787,host='127.0.0.1'){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});return server.address();},async close(){if(closed)return;closed=true;clearInterval(timer);for(const room of rooms.values())room.close(false);rooms.clear();for(const socket of sockets)socket.terminate();await new Promise(resolve=>wss.close(resolve));if(server.listening)await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const tls=process.env.TLS_CERT_FILE&&process.env.TLS_KEY_FILE?{cert:readFileSync(process.env.TLS_CERT_FILE),key:readFileSync(process.env.TLS_KEY_FILE)}:null;
 const app=createGameServer({tls,maxRooms:Math.max(1,Math.min(64,Number(process.env.MAX_ROOMS)||8)),allowedOrigins:(process.env.ALLOWED_ORIGINS||'https://boost-circuit-arena.bobistheman2049.chatgpt.site').split(',').map(value=>value.trim())});
 try{const host=process.env.BIND_ADDRESS||'127.0.0.1',address=await app.listen(Number(process.env.PORT)||8787,host);console.log(`Boost Circuit dedicated server: ${tls?'https':'http'}://${host}:${address.port}`);console.log('Default binding is local only. See docs/dedicated-server.md before sharing it.');}catch(error){console.error(error.message);process.exitCode=1;await app.close();}
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit()));
}
