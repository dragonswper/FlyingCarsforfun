export const CHAT_LIMIT=5,CHAT_CLEAR_MS=5*60*1000;
export const playerName=value=>[...String(value||'').replace(/[\u0000-\u001f\u007f-\u009f<>]/g,'').replace(/\s+/g,' ').trim()].slice(0,20).join('')||'Driver';
export const chatText=value=>[...String(value||'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim()].slice(0,140).join('');
export function cleanChatState(value){if(!value||!Array.isArray(value.messages)||value.messages.length>CHAT_LIMIT||!Number.isFinite(value.expiresIn)||value.expiresIn<0||value.expiresIn>CHAT_CLEAR_MS)return null;const messages=[];for(const entry of value.messages){if(!entry||typeof entry.name!=='string'||typeof entry.text!=='string'||typeof entry.id!=='string'||!entry.id||entry.id.length>40||!chatText(entry.text)||messages.some(old=>old.id===entry.id))return null;messages.push({id:entry.id,name:playerName(entry.name),text:chatText(entry.text)});}return {messages:value.expiresIn>0?messages:[],expiresIn:messages.length?value.expiresIn:0};}

// The first message opens one five-minute display cycle. Further messages keep
// its deadline and retain only the newest five. No history is written to disk.
export class ChatHistory{
 constructor({clock=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onChange=()=>{}}={}){Object.assign(this,{clock,setTimer,clearTimer,onChange});this.messages=[];this.expiresAt=0;this.counter=0;this.closed=false;}
 peek(){return {messages:this.messages.map(entry=>({...entry})),expiresIn:this.messages.length?Math.max(0,Math.min(CHAT_CLEAR_MS,this.expiresAt-this.clock())):0};}
 emit(){this.onChange(this.peek());}
 expire(){if(this.messages.length&&this.clock()>=this.expiresAt)this.clear();}
 state(){this.expire();return this.peek();}
 schedule(){this.clearTimer(this.timer);this.timer=null;if(!this.messages.length||this.closed)return;this.timer=this.setTimer(()=>{this.timer=null;this.expire();if(this.messages.length)this.schedule();},Math.max(1,this.expiresAt-this.clock()));this.timer?.unref?.();}
 add(message){if(this.closed||!chatText(message?.text))return false;this.expire();const id=typeof message.id==='string'&&message.id.length>0&&message.id.length<=40?message.id:'local-'+(++this.counter);if(this.messages.some(entry=>entry.id===id))return false;if(!this.messages.length)this.expiresAt=this.clock()+CHAT_CLEAR_MS;this.messages.push({id,name:playerName(message.name),text:chatText(message.text)});if(this.messages.length>CHAT_LIMIT)this.messages.splice(0,this.messages.length-CHAT_LIMIT);this.schedule();this.emit();return true;}
 replace(value){if(this.closed)return false;const state=cleanChatState(value);if(!state)return false;this.messages=state.messages;this.expiresAt=this.clock()+state.expiresIn;this.schedule();this.emit();return true;}
 clear(){if(this.closed)return;this.clearTimer(this.timer);this.timer=null;this.messages=[];this.expiresAt=0;this.emit();}
 dispose(){this.closed=true;this.clearTimer(this.timer);this.timer=null;this.messages=[];this.expiresAt=0;}
}
