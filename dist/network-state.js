import {Vector3,Quaternion} from './vendor/three.module.js';
import {C,makeCar,stepCar} from './physics.js';
import {cleanInput,validCounter} from './network-protocol.js';

const NUMBERS=['boost','boostTime','handbrake','jumpTime','jumpEndTime','airTime','noContact','flipTime','demoTime','supersonicTime','hitCooldown','extraHitCooldown','recoverTime','score','goals','assists','saves','touches','demos','renderSteer','renderThrottle'];
const FLAGS=['grounded','boosting','drifting','jumpHeld','jumpActive','hasJumped','canDouble','supersonic'];
const VECTORS=['p','v','omega','normal','flipAxis'];
const finite=(n,max=1e6)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=max;
const array=(v,length,max=1000)=>Array.isArray(v)&&v.length===length&&v.every(n=>finite(n,max));
const rotation=q=>array(q,4,1.01)&&q.reduce((sum,n)=>sum+n*n,0)>.5;
export function encodeCar(car){const value={id:car.id,team:car.team,q:car.q.toArray()};for(const key of VECTORS)value[key]=car[key].toArray();for(const key of NUMBERS)value[key]=Number(car[key])||0;for(const key of FLAGS)value[key]=!!car[key];return value;}
export function applyCar(car,value){car.q.fromArray(value.q).normalize();for(const key of VECTORS)car[key].fromArray(value[key]);for(const key of NUMBERS)car[key]=value[key];for(const key of FLAGS)car[key]=value[key];}
export function makeState(sim,n,ack,matchId){return {t:'state',matchId,n,ack,phase:sim.phase,phaseTime:sim.phaseTime,elapsed:sim.elapsed,remaining:sim.remaining,overtime:sim.overtime,score:[...sim.score],ball:{p:sim.ball.p.toArray(),q:sim.ball.q.toArray(),v:sim.ball.v.toArray(),spin:sim.ball.spin.toArray()},cars:sim.cars.map(encodeCar),pads:sim.pads.map(p=>p.timer)};}
export function validState(value,sim){
 if(!value||!validCounter(value.n)||!validCounter(value.ack)||!['kickoff','playing','goal','ended'].includes(value.phase)||!finite(value.elapsed,86400)||value.elapsed<0||!finite(value.remaining,86400)||value.remaining<0||!finite(value.phaseTime,10)||typeof value.overtime!=='boolean'||!array(value.score,2,1e6)||value.score.some(n=>n<0||!Number.isInteger(n)))return false;
 if(!value.ball||!array(value.ball.p,3)||!rotation(value.ball.q)||!array(value.ball.v,3)||!array(value.ball.spin,3)||!array(value.pads,34,11)||value.pads.some(n=>n<0))return false;
 if(!Array.isArray(value.cars)||value.cars.length!==sim.cars.length)return false;
 return value.cars.every((car,index)=>car&&car.id===sim.cars[index].id&&car.team===sim.cars[index].team&&rotation(car.q)&&VECTORS.every(key=>array(car[key],3))&&NUMBERS.every(key=>finite(car[key]))&&FLAGS.every(key=>typeof car[key]==='boolean')&&car.boost>=0&&car.boost<=100.001);
}
export function applyState(sim,value){
 sim.phase=value.phase;sim.phaseTime=value.phaseTime;sim.elapsed=value.elapsed;sim.remaining=value.remaining;sim.overtime=value.overtime;sim.score[0]=value.score[0];sim.score[1]=value.score[1];
 sim.ball.p.fromArray(value.ball.p);sim.ball.q.fromArray(value.ball.q).normalize();sim.ball.v.fromArray(value.ball.v);sim.ball.spin.fromArray(value.ball.spin);
 for(let i=0;i<sim.cars.length;i++)applyCar(sim.cars[i],value.cars[i]);for(let i=0;i<sim.pads.length;i++)sim.pads[i].timer=value.pads[i];
}

// The guest predicts its own car, then replays only unacknowledged inputs after
// an authoritative update. Ball/car contacts and all scoring remain host-owned.
export class GuestReplica{
 constructor(sim,localId){
  this.sim=sim;this.localId=localId;const car=sim.cars.find(c=>c.id===localId);this.predicted=makeCar(car.id,car.team);applyCar(this.predicted,encodeCar(car));this.pending=[];this.inputSequence=0;this.frames=[];this.lastSequence=-1;this.offset=null;this.lastPhase=sim.phase;this.replayAt=-1;
  this.visualP=car.p.clone();this.visualQ=car.q.clone();this.qA=new Quaternion();this.qB=new Quaternion();this.forward=new Vector3();
  const pose=()=>({p:[0,0,0],q:[0,0,0,1]});this.output={ball:pose(),cars:sim.cars.map(car=>({...pose(),id:car.id,team:car.team}))};
 }
 step(input){
  const frame={n:++this.inputSequence,i:cleanInput(input)};this.pending.push(frame);if(this.pending.length>120)this.pending.shift();if(this.sim.phase==='playing')stepCar(this.predicted,frame.i,C.step);return frame;
 }
 inputFrames(){return this.pending.slice(-16);}
 receive(value,now){
  if(value.n<=this.lastSequence||!validState(value,this.sim))return false;
  const changed=this.lastPhase!==value.phase;this.lastSequence=value.n;this.lastPhase=value.phase;
  applyState(this.sim,value);const local=value.cars.find(car=>car.id===this.localId);applyCar(this.predicted,local);this.pending=this.pending.filter(frame=>frame.n>value.ack);
  if(changed)this.pending.length=0;else if(value.phase==='playing')for(const frame of this.pending)stepCar(this.predicted,frame.i,C.step);
  if(changed||this.visualP.distanceToSquared(this.predicted.p)>16){this.visualP.copy(this.predicted.p);this.visualQ.copy(this.predicted.q);}
  const offset=value.elapsed-now/1000;if(this.offset===null||changed)this.offset=offset;else this.offset+=(offset-this.offset)*.03;
  this.frames.push(value);if(this.frames.length>12)this.frames.shift();
  if(changed&&value.phase==='kickoff')this.sim.replay.length=0;
  if(value.phase==='playing'&&value.elapsed-this.replayAt>=.045){this.sim.replay.push(this.sim.snapshot());this.replayAt=value.elapsed;if(this.sim.replay.length>100)this.sim.replay.shift();}
  return true;
 }
 sample(now,dt){
  if(!this.frames.length)return null;const time=now/1000+this.offset-.085;let a=this.frames[0],b=a;
  for(let i=1;i<this.frames.length;i++){b=this.frames[i];if(b.elapsed>=time)break;a=b;}
  let alpha=b.elapsed>a.elapsed?Math.max(0,Math.min(1,(time-a.elapsed)/(b.elapsed-a.elapsed))):1;if(a.phase!==b.phase)alpha=1;
  const blend=(out,from,to)=>{let snap=false;for(let i=0;i<3;i++)if(Math.abs(from.p[i]-to.p[i])>8)snap=true;const mix=snap?1:alpha;for(let i=0;i<3;i++)out.p[i]=from.p[i]+(to.p[i]-from.p[i])*mix;this.qA.fromArray(from.q);this.qB.fromArray(to.q);this.qA.slerp(this.qB,mix).toArray(out.q);};
  blend(this.output.ball,a.ball,b.ball);
  for(let i=0;i<this.output.cars.length;i++){
   const from=a.cars[i],to=b.cars[i],out=this.output.cars[i];blend(out,from,to);this.qA.fromArray(to.q);this.forward.set(0,0,1).applyQuaternion(this.qA);
   out.speed=to.v[0]*this.forward.x+to.v[1]*this.forward.y+to.v[2]*this.forward.z;out.steer=to.renderSteer;out.throttle=to.renderThrottle;out.grounded=to.grounded;out.boosting=to.boosting;out.demo=to.demoTime>0;
   if(out.id===this.localId&&!this.paused){const smooth=1-Math.exp(-30*Math.max(0,dt));this.visualP.lerp(this.predicted.p,smooth);this.visualQ.slerp(this.predicted.q,smooth);this.visualP.toArray(out.p);this.visualQ.toArray(out.q);out.speed=this.predicted.v.dot(this.forward.set(0,0,1).applyQuaternion(this.predicted.q));out.steer=this.predicted.renderSteer;out.boosting=this.predicted.boosting;out.grounded=this.predicted.grounded;out.demo=this.predicted.demoTime>0;}
  }
  return this.output;
 }
}
export function cleanEvents(events){
 if(!Array.isArray(events)||events.length>24)return [];
 const types=['goal','hit','bounce','pad','demo','go','overtime','end'];return events.filter(e=>e&&types.includes(e.type)&&(!e.p||array(e.p,3))&&(!('speed'in e)||finite(e.speed,1000))&&(!('team'in e)||e.team===0||e.team===1)&&(!('scorer'in e)||e.scorer===null||Number.isInteger(e.scorer)&&e.scorer>=0&&e.scorer<4)&&(!('car'in e)||Number.isInteger(e.car)&&e.car>=0&&e.car<4)).map(e=>{const result={type:e.type};for(const key of ['team','scorer','speed','p','car','id','big','by','won'])if(key in e)result[key]=e[key];return result;});
}
