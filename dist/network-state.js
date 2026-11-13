import {Vector3,Quaternion} from './vendor/three.module.js';
import {C,makeCar,stepCar,collideCarBall,collideCars} from './physics.js';
import {stepBall} from './ball.js';
import {carSupport,collideArena} from './arena.js';
import {cleanInput,validCounter} from './network-protocol.js';

const NUMBERS=['boost','boostTime','handbrake','jumpTime','jumpEndTime','airTime','noContact','flipTime','flipRotation','selfRightTime','demoTime','supersonicTime','hitCooldown','extraHitCooldown','recoverTime','score','goals','assists','saves','touches','demos','renderSteer','renderThrottle'];
const FLAGS=['grounded','boosting','drifting','jumpHeld','jumpActive','hasJumped','canDouble','supersonic','flipActive'];
const VECTORS=['p','v','omega','normal','flipAxis'];
const finite=(n,max=1e6)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=max;
const array=(v,length,max=1000)=>Array.isArray(v)&&v.length===length&&v.every(n=>finite(n,max));
const rotation=q=>array(q,4,1.01)&&q.reduce((sum,n)=>sum+n*n,0)>.5;
export function encodeCar(car){const value={id:car.id,team:car.team,q:car.q.toArray(),selfRightTarget:car.selfRightTarget.toArray()};for(const key of VECTORS)value[key]=car[key].toArray();for(const key of NUMBERS)value[key]=Number(car[key])||0;for(const key of FLAGS)value[key]=!!car[key];return value;}
export function applyCar(car,value){car.q.fromArray(value.q).normalize();car.selfRightTarget.fromArray(value.selfRightTarget).normalize();for(const key of VECTORS)car[key].fromArray(value[key]);for(const key of NUMBERS)car[key]=value[key];for(const key of FLAGS)car[key]=value[key];}
export function makeState(sim,n,ack,matchId){return {t:'state',matchId,n,ack,phase:sim.phase,phaseTime:sim.phaseTime,elapsed:sim.elapsed,remaining:sim.remaining,overtime:sim.overtime,score:[...sim.score],ball:{p:sim.ball.p.toArray(),q:sim.ball.q.toArray(),v:sim.ball.v.toArray(),spin:sim.ball.spin.toArray()},cars:sim.cars.map(encodeCar),pads:sim.pads.map(p=>p.timer)};}
export function validState(value,sim){
 if(!value||!validCounter(value.n)||!validCounter(value.ack)||!['kickoff','playing','goal','ended'].includes(value.phase)||!finite(value.elapsed,86400)||value.elapsed<0||!finite(value.remaining,86400)||value.remaining<0||!finite(value.phaseTime,10)||typeof value.overtime!=='boolean'||!array(value.score,2,1e6)||value.score.some(n=>n<0||!Number.isInteger(n)))return false;
 if(!value.ball||!array(value.ball.p,3)||!rotation(value.ball.q)||!array(value.ball.v,3)||!array(value.ball.spin,3)||!array(value.pads,34,11)||value.pads.some(n=>n<0))return false;
 if(!Array.isArray(value.cars)||value.cars.length!==sim.cars.length)return false;
 return value.cars.every((car,index)=>car&&car.id===sim.cars[index].id&&car.team===sim.cars[index].team&&rotation(car.q)&&rotation(car.selfRightTarget)&&VECTORS.every(key=>array(car[key],3))&&NUMBERS.every(key=>finite(car[key]))&&FLAGS.every(key=>typeof car[key]==='boolean')&&car.boost>=0&&car.boost<=100.001&&car.selfRightTime>=0&&car.selfRightTime<=.750001);
}
export function applyState(sim,value){
 sim.phase=value.phase;sim.phaseTime=value.phaseTime;sim.elapsed=value.elapsed;sim.remaining=value.remaining;sim.overtime=value.overtime;sim.score[0]=value.score[0];sim.score[1]=value.score[1];
 sim.ball.p.fromArray(value.ball.p);sim.ball.q.fromArray(value.ball.q).normalize();sim.ball.v.fromArray(value.ball.v);sim.ball.spin.fromArray(value.ball.spin);
 for(let i=0;i<sim.cars.length;i++)applyCar(sim.cars[i],value.cars[i]);for(let i=0;i<sim.pads.length;i++)sim.pads[i].timer=value.pads[i];
}

// Input replay covers the complete bounded one-second acknowledgement window.
// Visual correction is an error offset: ordinary input motion is never eased or
// teleported by a stale snapshot. Remote presentation has a small jitter buffer.
export const PREDICTION_WINDOW=120;
export class GuestReplica{
 constructor(sim,localId){
  this.sim=sim;this.localId=localId;this.spectator=localId===null;const car=sim.cars.find(c=>c.id===localId)||sim.cars[0];this.predicted=makeCar(car.id,car.team);applyCar(this.predicted,encodeCar(car));this.pending=[];this.inputSequence=0;this.frames=[];this.lastSequence=-1;this.offset=null;this.lastPhase=sim.phase;this.replayAt=-1;this.latency=null;this.jitter=0;this.timeline=null;
  this.visualP=car.p.clone();this.visualQ=car.q.clone();this.positionError=new Vector3();this.rotationError=new Quaternion();this.ballError=new Vector3();this.ballRotationError=new Quaternion();this.qA=new Quaternion();this.qB=new Quaternion();this.forward=new Vector3();this.up=new Vector3(0,1,0);this.identity=new Quaternion();
  this.predictedBall={p:sim.ball.p.clone(),q:sim.ball.q.clone(),v:sim.ball.v.clone(),spin:sim.ball.spin.clone()};this.visualBall=sim.ball.p.clone();this.visualBallQ=sim.ball.q.clone();this.otherCars=sim.cars.filter(c=>c.id!==localId).map(car=>{const other=makeCar(car.id,car.team);applyCar(other,encodeCar(car));return other;});
  const pose=()=>({p:[0,0,0],q:[0,0,0,1]});this.output={ball:pose(),cars:sim.cars.map(car=>({...pose(),id:car.id,team:car.team}))};
 }
 diagnostics(){return {pendingInputs:this.pending.length,replayedInputs:this.lastReplay||0,correctionMetres:Math.round((this.lastCorrection||0)*1000)/1000,interpolationMs:Math.round(Math.min(.22,.085+2*this.jitter)*1000)};}
 setLatency(ms){if(Number.isFinite(ms)&&ms>=0&&ms<=5000)this.latency=ms/2000;}
 step(input){if(this.spectator)return null;const frame={n:++this.inputSequence,i:cleanInput(input)};this.pending.push(frame);if(this.pending.length>PREDICTION_WINDOW)this.pending.shift();if(this.sim.phase==='playing')this.predict(frame.i);return frame;}
 predict(input,worldDt=C.step){stepCar(this.predicted,input,C.step);if(worldDt>0)stepBall(this.predictedBall,worldDt);collideCarBall(this.predicted,this.predictedBall);for(const other of this.otherCars){other.p.addScaledVector(other.v,worldDt);collideCars(this.predicted,other);}collideArena(this.predicted,C.carHeight,0,true);}
 inputFrames(){return this.pending.slice(-4);}
 receive(value,now){
  if(value.n<=this.lastSequence||!validState(value,this.sim))return false;
  const first=this.lastSequence<0,changed=this.lastPhase!==value.phase,oldP=this.predicted.p.clone(),oldQ=this.predicted.q.clone(),oldBall=this.predictedBall.p.clone(),oldBallQ=this.predictedBall.q.clone(),wasDemo=this.predicted.demoTime>0;
  if(this.lastArrival!==undefined&&!changed){const arrival=(now-this.lastArrival)/1000,interval=value.elapsed-this.lastElapsed;this.jitter+=(Math.abs(arrival-interval)-this.jitter)*.12;}
  this.lastArrival=now;this.lastElapsed=value.elapsed;this.lastSequence=value.n;this.lastPhase=value.phase;
  applyState(this.sim,value);const local=value.cars.find(car=>car.id===this.localId)||value.cars[0];applyCar(this.predicted,local);this.pending=this.pending.filter(frame=>frame.n>value.ack);
  this.predictedBall.p.fromArray(value.ball.p);this.predictedBall.q.fromArray(value.ball.q);this.predictedBall.v.fromArray(value.ball.v);this.predictedBall.spin.fromArray(value.ball.spin);for(const other of this.otherCars)applyCar(other,value.cars.find(car=>car.id===other.id));
  if(changed){this.pending.length=0;this.frames.length=0;this.timeline=null;}else if(value.phase==='playing'){
   // Input ACK age includes both directions. The remote world is only one-way
   // old; replaying it for the full input window used to double its motion.
   const age=Math.min(.5,this.latency??this.pending.length*C.step/2),worldDt=this.pending.length?Math.min(C.step,age/this.pending.length):0;
   for(const frame of this.pending)this.predict(frame.i,worldDt);
  }
  this.lastCorrection=oldP.distanceTo(this.predicted.p);this.lastReplay=this.pending.length;
  const teleport=first||changed||wasDemo&&local.demoTime===0||oldP.distanceToSquared(this.predicted.p)>900;
  if(teleport){this.positionError.set(0,0,0);this.rotationError.identity();this.visualP.copy(this.predicted.p);this.visualQ.copy(this.predicted.q);}else{this.positionError.add(oldP).sub(this.predicted.p);this.rotationError.multiply(oldQ).multiply(this.predicted.q.clone().invert()).normalize();}
  if(first||changed||oldBall.distanceToSquared(this.predictedBall.p)>900){this.ballError.set(0,0,0);this.ballRotationError.identity();this.visualBall.copy(this.predictedBall.p);this.visualBallQ.copy(this.predictedBall.q);}else{this.ballError.add(oldBall).sub(this.predictedBall.p);this.ballRotationError.multiply(oldBallQ).multiply(this.predictedBall.q.clone().invert()).normalize();}
  const offset=value.elapsed-now/1000;if(this.offset===null||changed)this.offset=offset;else this.offset+=(offset-this.offset)*.03;
  this.frames.push(value);if(this.frames.length>12)this.frames.shift();
  if(changed&&value.phase==='kickoff')this.sim.replay.length=0;
  if(value.phase==='playing'&&value.elapsed-this.replayAt>=.045){this.sim.replay.push(this.sim.snapshot());this.replayAt=value.elapsed;if(this.sim.replay.length>100)this.sim.replay.shift();}return true;
 }
 sample(now,dt){
  if(!this.frames.length)return null;const delay=Math.min(.22,.085+2*this.jitter),desired=now/1000+this.offset-delay;
  if(this.timeline===null||this.paused||Math.abs(desired-this.timeline)>.5)this.timeline=desired;else this.timeline+=Math.max(0,Math.min(Math.max(0,dt)*1.2,desired-this.timeline));
  const time=this.timeline;let a=this.frames[0],b=a;for(let i=1;i<this.frames.length;i++){b=this.frames[i];if(b.elapsed>=time)break;a=b;}
  let alpha=b.elapsed>a.elapsed?Math.max(0,Math.min(1,(time-a.elapsed)/(b.elapsed-a.elapsed))):1;if(a.phase!==b.phase)alpha=1;
  const extrapolate=!this.paused&&b.phase==='playing'?Math.max(0,Math.min(.12,time-b.elapsed)):0;
  const blend=(out,from,to)=>{let snap=false;for(let i=0;i<3;i++)if(Math.abs(from.p[i]-to.p[i])>20)snap=true;const mix=snap?1:alpha;for(let i=0;i<3;i++)out.p[i]=from.p[i]+(to.p[i]-from.p[i])*mix+(to.v?.[i]||0)*extrapolate;this.qA.fromArray(from.q);this.qB.fromArray(to.q);this.qA.slerp(this.qB,mix).toArray(out.q);};
  blend(this.output.ball,a.ball,b.ball);const decay=Math.exp(-18*Math.max(0,dt));
  if(!this.paused&&!this.spectator){this.ballError.multiplyScalar(decay);this.ballRotationError.slerp(this.identity,1-decay);this.visualBall.copy(this.predictedBall.p).add(this.ballError);this.visualBall.y=Math.max(C.ballRestHeight,this.visualBall.y);this.visualBallQ.copy(this.ballRotationError).multiply(this.predictedBall.q);this.visualBall.toArray(this.output.ball.p);this.visualBallQ.toArray(this.output.ball.q);}
  for(let i=0;i<this.output.cars.length;i++){
   const from=a.cars[i],to=b.cars[i],out=this.output.cars[i];blend(out,from,to);this.qA.fromArray(to.q);this.forward.set(0,0,1).applyQuaternion(this.qA);out.speed=to.v[0]*this.forward.x+to.v[1]*this.forward.y+to.v[2]*this.forward.z;out.steer=to.renderSteer;out.throttle=to.renderThrottle;out.grounded=to.grounded;out.boosting=to.boosting;out.demo=to.demoTime>0;
   if(out.id===this.localId&&!this.paused){this.positionError.multiplyScalar(decay);this.rotationError.slerp(this.identity,1-decay);this.visualP.copy(this.predicted.p).add(this.positionError);this.visualQ.copy(this.rotationError).multiply(this.predicted.q);this.visualP.y=Math.max(this.visualP.y,carSupport({q:this.visualQ},this.up));this.visualP.toArray(out.p);this.visualQ.toArray(out.q);out.speed=this.predicted.v.dot(this.forward.set(0,0,1).applyQuaternion(this.predicted.q));out.steer=this.predicted.renderSteer;out.throttle=this.predicted.renderThrottle;out.boosting=this.predicted.boosting;out.grounded=this.predicted.grounded;out.demo=this.predicted.demoTime>0;
   }else out.p[1]=Math.max(out.p[1],carSupport({q:this.qA.fromArray(out.q)},this.up));
  }return this.output;
 }
}

export function cleanEvents(events){
 if(!Array.isArray(events)||events.length>24)return [];
 const types=['goal','hit','bounce','pad','demo','go','overtime','end'];return events.filter(e=>e&&types.includes(e.type)&&(!e.p||array(e.p,3))&&(!('speed'in e)||finite(e.speed,1000))&&(!('team'in e)||e.team===0||e.team===1)&&(!('scorer'in e)||e.scorer===null||Number.isInteger(e.scorer)&&e.scorer>=0&&e.scorer<8)&&(!('car'in e)||Number.isInteger(e.car)&&e.car>=0&&e.car<8)).map(e=>{const result={type:e.type};for(const key of ['team','scorer','speed','p','car','id','big','by','won'])if(key in e)result[key]=e[key];return result;});
}
