/* Original game protocol, using NetplayJS's documented signaling wire format. */
import {BODY_TYPES} from './bodies.js';
export const NET_PROTOCOL=1,NET_BUILD='boost-circuit-1.8.0',SIGNAL_URL='wss://netplayjs.varunramesh.net/';
export const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PACKET=32768,INPUT_TIMEOUT=300,STATE_INTERVAL=1000/30;
export function roomCode(random=crypto){const bytes=new Uint8Array(8);random.getRandomValues(bytes);return Array.from(bytes,n=>CODE_ALPHABET[n&31]).join('');}
export function normalizeCode(value){const code=String(value||'').toUpperCase().replace(/[\s-]/g,'');if(code.length!==8||[...code].some(c=>!CODE_ALPHABET.includes(c)))throw new Error('Enter the eight-character room code, for example ABCD-2345.');return code;}
export const displayCode=code=>code.slice(0,4)+'-'+code.slice(4);
export const queueID=code=>'flyingcarsforfun-private-v1-'+normalizeCode(code);
export const guestId=options=>options.mode==='duel'?1:options.coop?1:2;
export function roomOptions(value={}){value||={};return {mode:value.mode==='doubles'?'doubles':'duel',coop:value.mode==='doubles'&&value.coop===true,duration:value.duration===120?120:300,difficulty:['rookie','pro','allstar','expert'].includes(value.difficulty)?value.difficulty:'pro'};}
export function appearance(value={}){value||={};return {body:BODY_TYPES.includes(value.body)?value.body:'fennec',paint:['blue','ivory','violet','mint'].includes(value.paint)?value.paint:'blue'};}
const unit=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
export function cleanInput(value={}){value||={};return {throttle:unit(value.throttle),steer:unit(value.steer),pitch:unit(value.pitch),roll:unit(value.roll),jump:value.jump===true,boost:value.boost===true,drift:value.drift===true,dodgeDeadzone:Number.isFinite(value.dodgeDeadzone)?Math.max(.1,Math.min(1,value.dodgeDeadzone)):.5};}
export const neutralInput=()=>cleanInput();
export function decodePacket(raw){if(typeof raw!=='string'||raw.length>MAX_PACKET)return null;try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.t==='string'?value:null;}catch{return null;}}
export function validCounter(value){return Number.isSafeInteger(value)&&value>=0&&value<=0x7fffffff;}
export class RemoteInputs{
 constructor(){this.queue=[];this.received=0;this.ack=0;this.lastAt=-Infinity;this.current=neutralInput();}
 receive(frames,now){if(!Array.isArray(frames)||frames.length>16)return false;let accepted=false;for(const frame of frames){if(!frame||!validCounter(frame.n)||frame.n<=this.received||frame.n>this.received+240)continue;this.received=frame.n;this.queue.push({n:frame.n,input:cleanInput(frame.i)});accepted=true;}if(accepted){this.lastAt=now;if(this.queue.length>24)this.queue.splice(0,this.queue.length-24);}return accepted;}
 next(now){if(now-this.lastAt>INPUT_TIMEOUT){this.queue.length=0;this.current=neutralInput();return this.current;}if(this.queue.length){const frame=this.queue.shift();this.current=frame.input;this.ack=frame.n;}return this.current;}
}
