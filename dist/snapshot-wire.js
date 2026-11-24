import {CAR_NUMBERS, CAR_FLAGS, CAR_VECTORS} from './state-schema.js';

// Only high-rate dedicated world states use this bounded binary schema.
// Authentication, lobby management, chat and reliable events remain JSON/TLS.
const MAGIC = 0x31534342, VERSION = 1, HEADER = 28, MAX_BYTES = 32768;
const phases = ['kickoff', 'playing', 'goal', 'ended'];
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
const counter = n => Number.isInteger(n) && n >= 0 && n <= 0x7fffffff;
class Writer {
  constructor() { this.bytes=new Uint8Array(4096);this.view=new DataView(this.bytes.buffer);this.at=HEADER; }
  u8(n) { this.view.setUint8(this.at,n);this.at++; }
  u16(n) { this.view.setUint16(this.at,n,true);this.at+=2; }
  u32(n) { this.view.setUint32(this.at,n,true);this.at+=4; }
  f32(n) { this.view.setFloat32(this.at,n,true);this.at+=4; }
  f64(n) { this.view.setFloat64(this.at,n,true);this.at+=8; }
  text(s) { const bytes=encoder.encode(s);if(typeof s!=='string'||s.length>80||bytes.length>320)throw Error('Invalid snapshot text');this.u16(bytes.length);this.bytes.set(bytes,this.at);this.at+=bytes.length; }
  vector(v) { for(const n of v)this.f32(n); }
}
class Reader {
  constructor(bytes) { this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.at=HEADER; }
  u8() { return this.view.getUint8(this.at++); }
  u16() { const n=this.view.getUint16(this.at,true);this.at+=2;return n; }
  u32() { const n=this.view.getUint32(this.at,true);this.at+=4;return n; }
  number(size) { const n=size===4?this.view.getFloat32(this.at,true):this.view.getFloat64(this.at,true);this.at+=size;if(!Number.isFinite(n))throw Error('Invalid snapshot number');return n; }
  text() { const size=this.u16();if(size>320||this.at+size>this.bytes.length)throw Error('Invalid snapshot text');const text=decoder.decode(this.bytes.subarray(this.at,this.at+size));this.at+=size;if(text.length>80)throw Error('Invalid snapshot text');return text; }
  vector(size) { const v=[];for(let i=0;i<size;i++)v.push(this.number(4));return v; }
}
export function encodeSnapshotWorld(state) {
  if(!state.cars.length||state.cars.length>8||state.pads.length!==34||!phases.includes(state.phase))throw Error('Invalid snapshot world');
  const w=new Writer();w.text(state.matchId);w.u8(phases.indexOf(state.phase));
  w.u8((state.overtime?1:0)|(state.practice?2:0));w.u8(state.cars.length);
  for(const key of ['phaseTime','elapsed','remaining'])w.f64(state[key]);
  for(const n of state.score)w.u32(n);
  for(const key of ['p','q','v','spin'])w.vector(state.ball[key]);
  w.u8((state.ball.lastTouch??-1)+1);w.f64(state.ball.lastTouchTime??-1000);
  for(const n of state.pads)w.f32(n);
  for(const car of state.cars) {
    w.u8(car.id);w.u8(car.team);w.u16(CAR_FLAGS.reduce((bits,key,i)=>bits|(car[key]?1<<i:0),0));
    w.vector(car.q);w.vector(car.selfRightTarget);
    for(const key of CAR_VECTORS)w.vector(car[key]);
    for(const key of CAR_NUMBERS)w.f32(car[key]);
  }
  if(state.practice){w.u8(state.practice.index);w.u16(state.practice.hits);w.f64(state.practice.shotTime);w.text(state.practice.name);}
  w.view.setUint32(0,MAGIC,true);w.view.setUint8(4,VERSION);w.view.setUint8(5,0);w.view.setUint16(6,w.at,true);
  return w.bytes.slice(0,w.at);
}
// A new recipient envelope owns its bytes; patching ACKs can never modify an
// already sent packet, the cached world, or another player's input timeline.
export function snapshotForPeer(world,{n,ack,w,net={}}) {
  const bytes=world.slice(),view=new DataView(bytes.buffer);
  view.setUint32(8,n,true);view.setUint32(12,ack,true);view.setUint32(16,w,true);
  view.setUint32(20,net.inputTick??ack,true);view.setFloat32(24,net.inputQueueMs??0,true);
  return bytes;
}
export function decodeSnapshot(raw) {
  try {
    const bytes=raw instanceof ArrayBuffer?new Uint8Array(raw):ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):null;
    if(!bytes||bytes.length<HEADER||bytes.length>MAX_BYTES)return null;
    const r=new Reader(bytes),v=r.view;
    if(v.getUint32(0,true)!==MAGIC||v.getUint8(4)!==VERSION||v.getUint8(5)!==0||v.getUint16(6,true)!==bytes.length)return null;
    const n=v.getUint32(8,true),ack=v.getUint32(12,true),w=v.getUint32(16,true),inputTick=v.getUint32(20,true),inputQueueMs=v.getFloat32(24,true);
    if(![n,ack,w,inputTick].every(counter)||inputTick<ack||!Number.isFinite(inputQueueMs)||inputQueueMs<0||inputQueueMs>1000)return null;
    const matchId=r.text(),phase=phases[r.u8()],flags=r.u8(),count=r.u8();
    if(!matchId||!phase||flags>3||count<1||count>8)return null;
    const state={t:'state',matchId,n,ack,w,net:{inputTick,inputQueueMs},phase,overtime:!!(flags&1),phaseTime:r.number(8),elapsed:r.number(8),remaining:r.number(8),score:[r.u32(),r.u32()]};
    state.ball={p:r.vector(3),q:r.vector(4),v:r.vector(3),spin:r.vector(3),lastTouch:r.u8()-1,lastTouchTime:r.number(8)};
    state.pads=r.vector(34);state.cars=[];
    for(let i=0;i<count;i++){
      const car={id:r.u8(),team:r.u8()},bits=r.u16();if(bits>=(1<<CAR_FLAGS.length))return null;
      car.q=r.vector(4);car.selfRightTarget=r.vector(4);
      for(const key of CAR_VECTORS)car[key]=r.vector(3);
      for(const key of CAR_NUMBERS)car[key]=r.number(4);
      for(let j=0;j<CAR_FLAGS.length;j++)car[CAR_FLAGS[j]]=!!(bits&(1<<j));
      state.cars.push(car);
    }
    if(flags&2)state.practice={index:r.u8(),hits:r.u16(),shotTime:r.number(8),name:r.text()};
    return r.at===bytes.length?state:null;
  }catch{return null;}
}
