import {Vector3,Quaternion} from './vendor/three.module.js';
import {clamp} from './physics.js';
const body=()=>({p:new Vector3(),q:new Quaternion(),speed:0,steer:0});
const pose=()=>({previous:body(),current:body(),output:{p:[0,0,0],q:[0,0,0,1]}});
const copy=(to,from)=>{to.p.copy(from.p);to.q.copy(from.q);to.speed=from.speed;to.steer=from.steer;};

// Keep the last two fixed physics states. Render at the display's timing without
// changing physics or allocating a fresh snapshot on every animation frame.
export class MotionBuffer{
 constructor(sim){this.position=new Vector3();this.rotation=new Quaternion();this.otherRotation=new Quaternion();this.forward=new Vector3();this.reset(sim);}
 reset(sim){
  this.sim=sim;this.phase=sim.phase;this.ball=pose();this.cars=sim.cars.map(c=>Object.assign(pose(),{id:c.id}));this.output={ball:this.ball.output,cars:this.cars.map(c=>c.output)};this.capture(sim,true);return this;
 }
 capture(sim=this.sim,snap=false){
  if(sim!==this.sim||sim.cars.length!==this.cars.length)return this.reset(sim);
  snap=snap||this.phase!==sim.phase;this.phase=sim.phase;
  const capture=(item,state)=>{copy(item.previous,item.current);item.current.p.copy(state.p);item.current.q.copy(state.q);if(snap||item.previous.p.distanceToSquared(item.current.p)>64)copy(item.previous,item.current);};
  capture(this.ball,sim.ball);
  for(let i=0;i<this.cars.length;i++){
   const item=this.cars[i],car=sim.cars[i],wasDemo=item.output.demo;capture(item,car);item.current.speed=car.v.dot(this.forward.set(0,0,1).applyQuaternion(car.q));item.current.steer=car.renderSteer||0;
   Object.assign(item.output,{id:car.id,team:car.team,demo:car.demoTime>0,boosting:car.boosting,grounded:car.grounded,throttle:car.renderThrottle||0});if(snap||wasDemo!==item.output.demo)copy(item.previous,item.current);
  }
 }
 sample(alpha=1){
  alpha=clamp(alpha,0,1);const sample=item=>{this.position.lerpVectors(item.previous.p,item.current.p,alpha).toArray(item.output.p);this.rotation.slerpQuaternions(item.previous.q,item.current.q,alpha).toArray(item.output.q);item.output.speed=item.previous.speed+(item.current.speed-item.previous.speed)*alpha;item.output.steer=item.previous.steer+(item.current.steer-item.previous.steer)*alpha;};sample(this.ball);for(const item of this.cars)sample(item);return this.output;
 }
 sampleReplay(frames,time){
  if(!frames.length)return this.sample(1);const index=clamp(time,0,1)*(frames.length-1),a=frames[Math.floor(index)],b=frames[Math.min(frames.length-1,Math.floor(index)+1)],alpha=index-Math.floor(index);
  const blend=(out,from,to)=>{for(let i=0;i<3;i++)out.p[i]=from.p[i]+(to.p[i]-from.p[i])*alpha;this.rotation.fromArray(from.q);this.otherRotation.fromArray(to.q);this.rotation.slerp(this.otherRotation,alpha).toArray(out.q);};blend(this.output.ball,a.ball,b.ball);
  for(let i=0;i<this.output.cars.length;i++){const from=a.cars[i],to=b.cars[i]||from,out=this.output.cars[i];if(!from)continue;Object.assign(out,from,{p:out.p,q:out.q});blend(out,from,to);out.speed=(from.speed||0)+((to.speed||0)-(from.speed||0))*alpha;out.steer=(from.steer||0)+((to.steer||0)-(from.steer||0))*alpha;}
  return this.output;
 }
}
