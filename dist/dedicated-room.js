import {PartyRoom,partyOptions} from './party-room.js';
import {ServerLink,serverEndpoint} from './server-link.js';
import {NET_BUILD,appearance} from './network-protocol.js';
export const serverCode=value=>{const code=String(value||'').trim();if(!/^BCS-[A-Za-z0-9_-]{22}$/.test(code))throw Error('Enter the complete BCS dedicated-server invite. Both players must use the same server URL.');return code;};
export function parseServerInvite(value){const raw=String(value||'').trim(),split=raw.indexOf('@');let address='';try{if(split>=0)address=decodeURIComponent(raw.slice(split+1));}catch{throw Error('The server address in this invite is invalid.');}if(address.length>500)throw Error('The server address is too long.');return {code:serverCode(split<0?raw:raw.slice(0,split)),address};}
export class DedicatedRoom extends PartyRoom{
 constructor({address,Link=ServerLink,...options}={}){super(options);this.address=serverEndpoint(address);this.Link=Link;this.dedicated=true;this.role='guest';this.ownerId=null;}
 get invite(){return this.code?this.code+'@'+encodeURIComponent(this.address):'';}
 get canManage(){return this.id!==undefined&&this.id===this.ownerId;}
 get connectionInfo(){return this.link?.connectionInfo;}
 create(options,look){this.options=partyOptions(options);this.look=appearance(look);this.startConnection({t:'server-create',options:this.options});}
 join(code,look){this.code=parseServerInvite(code).code;this.look=appearance(look);this.startConnection({t:'server-join',code:this.code});}
 startConnection(request){this.change('connecting');this.dial(request);this.beat();this.later(()=>{if(!this.admitted)this.fail('The dedicated server did not admit this connection. Check its URL and invite.');},25000);}
 dial(request){if(this.closed)return;let link;const current=()=>!this.closed&&this.link===link;try{link=new this.Link(this.address,{onOpen:()=>{if(current())link.send({...request,build:NET_BUILD,token:this.token,look:this.look,matchId:this.matchId||null});},onPacket:packet=>{if(current())this.serverPacket(packet);},onClose:()=>{if(current())this.lostHost();}});this.link=link;}catch(error){if(this.recovering)this.recoverLink();else this.fail(error.message||'The server URL could not be opened.');}}
 serverPacket(packet){
  if(packet.t==='server-error'){this.fail(packet.message||'The dedicated server could not admit this connection.');return;}
  if(packet.t==='server-welcome'){
   if(packet.build!==NET_BUILD||typeof packet.key!=='string'||!/^[a-f0-9]{32}$/.test(packet.key)||!Number.isInteger(packet.selfId)||packet.selfId<0||packet.selfId>7){this.fail('The dedicated server response could not be verified.');return;}
   try{this.code=serverCode(packet.code);}catch{this.fail('The dedicated server returned an invalid invite.');return;}this.id=packet.selfId;this.key=packet.key;this.ownerId=packet.ownerId;
   if(this.recovering&&(!this.matchId||packet.matchId!==this.matchId)){this.recovering=false;this.matchId=null;this.presentedMatch=null;this.sim=null;this.admitted=false;}
   this.change();return;
  }
  if(packet.t==='server-owner'){this.ownerId=packet.ownerId;this.change();return;}
  this.receiveGuest(packet);
 }
 configure(options){return this.canManage&&this.connected?this.link.send({t:'server-configure',options:partyOptions(options)}):false;}
 startMatch(){return this.canManage&&this.connected?this.link.send({t:'server-start'}):false;}
 lostHost(){if(this.closed)return;const old=this.link;this.link=null;old?.close();if(!this.recovering){this.recovering=true;this.recoveryDeadline=this.clock()+20000;if(this.replica){this.replica.pending.length=0;this.replica.paused=true;}}this.change('reconnecting');this.recoverLink();}
 recoverLink(){if(this.closed||!this.recovering||this.retryScheduled)return;if(this.clock()>=this.recoveryDeadline){this.fail('The dedicated server could not reconnect within 20 seconds.');return;}this.retryScheduled=true;this.later(()=>{this.retryScheduled=false;if(!this.closed&&this.recovering)this.dial({t:'server-resume',code:this.code});},500);}
 retryRecovery(){const old=this.link;this.link=null;old?.close();this.resumeReady=false;this.recoverLink();}
}
