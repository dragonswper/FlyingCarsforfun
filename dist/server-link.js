import {decodePacket,MAX_PACKET} from './network-protocol.js';
export function serverEndpoint(value,location=globalThis.location){
 let url;try{url=new URL(String(value||'').trim());}catch{throw Error('Enter the dedicated server URL, for example wss://your-server.example/multiplayer.');}
 if(url.protocol==='https:')url.protocol='wss:';else if(url.protocol==='http:')url.protocol='ws:';
 if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.hash||url.href.length>500)throw Error('Use a ws:// or wss:// server URL without a password or fragment.');
 if(location?.protocol==='https:'&&url.protocol==='ws:')throw Error('This HTTPS game needs a secure wss:// server. For a local test, open the game from the server’s own HTTP address.');
 if(url.pathname==='/')url.pathname='/multiplayer';return url.href;
}
export class ServerLink{
 constructor(url,{WebSocketClass=globalThis.WebSocket,onOpen=()=>{},onPacket=()=>{},onClose=()=>{}}={}){
  Object.assign(this,{url,onOpen,onPacket,onClose});this.closed=false;this.open=false;this.wire=0;this.connectionInfo={route:'server',protocol:url.startsWith('wss:')?'wss':'ws',networkPing:null};
  this.socket=new WebSocketClass(url);this.socket.onopen=()=>{if(!this.closed){this.open=true;onOpen();}};this.socket.onmessage=event=>{if(!this.closed){const packet=decodePacket(event.data);if(packet)onPacket(packet);}};this.socket.onerror=()=>{};this.socket.onclose=()=>{this.open=false;if(!this.closed)onClose('The dedicated server connection closed.');};
 }
 send(packet,realtime=false){if(this.closed||!this.open||this.socket.readyState!==1||this.socket.bufferedAmount>(realtime?8192:65536))return false;const wire=realtime?this.wire+1:null,data=JSON.stringify(realtime?{...packet,w:wire}:packet);if(data.length>MAX_PACKET)return false;try{this.socket.send(data);if(realtime)this.wire=wire;return true;}catch{return false;}}
 close(){if(this.closed)return;this.closed=true;this.open=false;this.socket.onclose=null;this.socket.close();}
}
