import {Vector3 as V,Quaternion as Q} from './vendor/three.module.js';
import {C,clamp} from './constants.js';import {collideArena} from './arena.js';
const limit=(v,max)=>{const length=v.length();if(length>max)v.multiplyScalar(max/length);};
export function stepBall(ball,dt=C.step,rotate=true){
 ball.v.multiplyScalar(Math.pow(1-C.ballDrag,dt));ball.v.y-=C.gravity*dt;ball.p.addScaledVector(ball.v,dt);const hit=collideArena(ball,C.ballRestHeight,C.ballRestitution);
 if(hit.contact){const n=hit.contact,r=n.clone().multiplyScalar(-C.ballRadius),contactVelocity=ball.v.clone().add(ball.spin.clone().cross(r)),tangent=contactVelocity.addScaledVector(n,-contactVelocity.dot(n)),speed=tangent.length();
  if(speed>1e-7){const change=Math.min(speed/3.5,C.ballFriction*Math.max((1+C.ballRestitution)*hit.impact,C.gravity*dt*Math.max(n.y,0))),delta=tangent.multiplyScalar(-change/speed);ball.v.add(delta);ball.spin.add(r.cross(delta).multiplyScalar(2.5/(C.ballRadius*C.ballRadius)));}
 }
 limit(ball.v,C.ballMaxSpeed);limit(ball.spin,C.ballMaxSpin);const spin=ball.spin.length();if(rotate&&spin>.001)ball.q.premultiply(new Q().setFromAxisAngle(ball.spin.clone().divideScalar(spin),spin*dt)).normalize();return hit;
}
export class BallPrediction{
 constructor(){this.interval=.125;this.horizon=3;this.sampleStep=1/30;this.samples=Array.from({length:91},(_,i)=>({t:i/30,p:new V(),v:new V()}));this.body={p:new V(),v:new V(),spin:new V(),q:new Q()};this.generatedAt=-Infinity;this.generation=0;this.dirty=true;}
 invalidate(){this.dirty=true;}
 update(ball,time){
  if(time-this.generatedAt<(this.dirty?1/30:this.interval))return this;this.generatedAt=time;this.dirty=false;this.generation++;this.body.p.copy(ball.p);this.body.v.copy(ball.v);this.body.spin.copy(ball.spin);const stationary=ball.v.lengthSq()<.0001&&ball.p.y<=C.ballRestHeight+.001;
  for(let i=0;i<this.samples.length;i++){if(i&&!stationary)for(let tick=0;tick<4;tick++)stepBall(this.body,C.step,false);this.samples[i].p.copy(this.body.p);this.samples[i].v.copy(this.body.v);}return this;
 }
 at(seconds,now=this.generatedAt){return this.samples[Math.min(this.samples.length-1,Math.max(0,Math.round((seconds+now-this.generatedAt)*30)))];}
 goalThreat(team,now=this.generatedAt){const sign=team===0?-1:1,age=Math.max(0,now-this.generatedAt);for(const sample of this.samples)if(sample.t>=age&&sample.p.z*sign>C.goalScorePlane+C.ballRadius&&Math.abs(sample.p.x)<C.goalWidth-C.ballRadius&&sample.p.y<C.goalHeight-C.ballRadius)return {time:sample.t-age,p:sample.p};return null;}
}
