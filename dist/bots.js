/* Original browser bot controller, informed by Beast's utility/aim-cone approach.
   Every level sends ordinary controls through the same vehicle physics. */
import {Vector3 as V} from './vendor/three.module.js';import {C,clamp,clampToPitch} from './constants.js';
export const BOT_LEVELS=Object.freeze({
 rookie:{name:'Rookie',reaction:.28,think:.20,horizon:1.2,error:.8,maxHeight:2.1,steer:2.1,boost:45,dodge:false,description:'Slower reactions and simple ground shots.'},
 pro:{name:'Pro',reaction:.14,think:.10,horizon:2,error:.25,maxHeight:3,steer:2.8,boost:25,dodge:false,description:'Predicts ground shots, covers the back post and manages boost.'},
 allstar:{name:'All-Star',reaction:.08,think:1/15,horizon:2.6,error:.08,maxHeight:4,steer:3.3,boost:18,dodge:true,description:'Coordinates kickoffs, rotates with teammates and places shots.'},
 expert:{name:'Expert',reaction:.04,think:.05,horizon:3,error:.02,maxHeight:5,steer:3.7,boost:12,dodge:true,description:'Fast interception, open-goal aiming, controlled aerials and recovery.'}
});
const up=new V(0,1,0),fwd=new V(0,0,1),right=new V(1,0,0);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function arrivalTime(car,target){
 const delta=new V(target.x-car.p.x,0,target.z-car.p.z),dist=delta.length(),forward=fwd.clone().applyQuaternion(car.q).setY(0).normalize(),angle=dist>0?Math.acos(clamp(forward.dot(delta)/dist,-1,1)):0,speed=Math.max(0,car.v.dot(forward)),accel=car.boost>10?21:14;
 const cruise=Math.max(0,(dist-(C.maxSpeed*C.maxSpeed-speed*speed)/(2*accel))/C.maxSpeed),accelerate=(Math.sqrt(speed*speed+2*accel*Math.min(dist,Math.max(0,(C.maxSpeed*C.maxSpeed-speed*speed)/(2*accel))))-speed)/accel;return Math.max(0,accelerate+cruise)+angle*.24;
}
// Kickoff assignments include human teammates: the closest car goes, with
// left-goes as the deterministic tie breaker in the team's driving direction.
export function kickoffTaker(sim,team){
 const dir=team?-1:1;let best=null,eta=Infinity;
 for(const car of sim.cars){if(car.team!==team||car.demoTime>0)continue;
  const time=arrivalTime(car,sim.ball.p);
  if(time<eta-.10||Math.abs(time-eta)<=.10&&(!best||car.p.x*dir<best.p.x*dir)){best=car;eta=time;}
 }
 return best?.id;
}
function kickoffActive(sim){return sim.goAt!==undefined&&!sim.clockStarted&&sim.elapsed-sim.goAt<5&&sim.ball.p.lengthSq()<4&&sim.ball.v.lengthSq()<4;}
function roleFor(car,sim){
 if(kickoffActive(sim))return kickoffTaker(sim,car.team)===car.id?'attack':'support';
 sim.botRoles??=[null,null];let role=sim.botRoles[car.team];
 if(!role||sim.elapsed>=role.until||!sim.cars.some(c=>c.id===role.striker&&c.demoTime===0)){
  let best=null,eta=Infinity,currentETA=Infinity;
  for(const teammate of sim.cars){if(teammate.team!==car.team||teammate.demoTime>0)continue;
   const time=arrivalTime(teammate,sim.ball.p);if(teammate.id===role?.striker)currentETA=time;
   if(time<eta){eta=time;best=teammate;}
  }
  // A small hysteresis margin prevents teammates repeatedly swapping jobs.
  const striker=role&&Number.isFinite(currentETA)&&currentETA<=eta+.18?role.striker:best?.id;
  role=sim.botRoles[car.team]={striker,until:sim.elapsed+.2};
 }
 return role.striker===car.id?'attack':'support';
}
function intercept(car,sim,profile){
 const prediction=sim.prediction;
 for(const point of prediction.samples){const time=point.t-(sim.elapsed-prediction.generatedAt);
  if(time<.08||time>profile.horizon||point.p.y>profile.maxHeight)continue;
  if(arrivalTime(car,point.p)<=time+.12)return point.p;
 }
 return prediction.at(clamp(distance(car.p,sim.ball.p)/18,.12,profile.horizon),sim.elapsed).p;
}
export function chooseShotTarget(car,sim,hit,out=new V()){
 const dir=car.team?-1:1,goalZ=dir*C.halfLength;let best=-Infinity,bestX=0;
 for(const x of [-C.goalWidth+2,0,C.goalWidth-2]){
  let margin=12;
  for(const defender of sim.cars){if(defender.team===car.team||defender.demoTime>0||Math.abs(defender.p.z-goalZ)>22)continue;
   margin=Math.min(margin,Math.abs(x-defender.p.x)-.35*Math.max(0,8-Math.abs(defender.p.z-goalZ)));
  }
  const value=margin-Math.abs(x-hit.x)*.055;
  if(value>best){best=value;bestX=x;}
 }
 return out.set(bestX,0,goalZ);
}
function plan(car,sim,profile,state){
 const now=sim.elapsed,ball=sim.ball,dir=car.team?-1:1,role=roleFor(car,sim),
  threat=sim.prediction.goalThreat(car.team,now),hit=intercept(car,sim,profile),target=state.target,
  forward=fwd.clone().applyQuaternion(car.q),r=right.clone().applyQuaternion(car.q),ownGoal=-dir*C.halfLength;
 state.role=role;state.intent=role==='attack'?'shoot':'rotate';state.targetHeight=hit.y;
 if(kickoffActive(sim)){
  state.intent=role==='attack'?'kickoff':'kickoff-cover';
  if(role==='attack')target.copy(ball.p);else target.set(car.p.x*.25,0,ownGoal+dir*13);
 }else if(role==='support'){
  const teammates=sim.cars.filter(c=>c.team===car.team&&c.id!==sim.botRoles[car.team]?.striker&&c.demoTime===0).sort((a,b)=>a.id-b.id),index=Math.max(0,teammates.findIndex(c=>c.id===car.id));
  if(threat||ball.p.z*dir<-12){
   state.intent='cover';
   target.set((ball.p.x>=0?-1:1)*(C.goalWidth-2-index*.7),0,ownGoal+dir*(4.5+index*4));
  }else{
   const lane=(index%2?1:-1)*7;
   target.set(clamp(ball.p.x*.4+lane,-24,24),0,clamp(ball.p.z-dir*(15+index*6),-C.halfLength+5,C.halfLength-5));
  }
 }else{
  const goal=chooseShotTarget(car,sim,hit,state.aim);
  if(ball.p.z*dir<-20){state.intent='clear';goal.set((ball.p.x>=0?1:-1)*25,0,dir*12);}
  const shot=state.shot.copy(goal).sub(hit).setY(0).normalize(),wrongSide=state.delta.copy(car.p).sub(ball.p).dot(shot)>-.5;
  target.copy(hit).addScaledVector(shot,distance(car.p,hit)>4?-2.1:.3);target.y=0;
  if(threat){state.intent='save';target.copy(hit).setY(0);}
  else if(wrongSide){
   state.intent='position';target.copy(ball.p).addScaledVector(shot,-3.5);
   if(Math.abs(car.p.x-ball.p.x)<5.5)target.x+=(car.id%2?1:-1)*5.5;
  }
 }
 if(!threat&&!kickoffActive(sim)&&car.boost<profile.boost&&distance(car.p,ball.p)>12){
  let best=null,bestCost=Infinity;
  for(const pad of sim.pads){if(pad.timer>0)continue;
   if(state.intent==='cover'&&Math.abs(pad.p.z-ownGoal)>22)continue;
   const cost=distance(car.p,pad.p)+.65*distance(pad.p,target)-(pad.big?2:0);
   if(cost<bestCost){bestCost=cost;best=pad;}
  }
  if(best&&distance(car.p,best.p)<16){target.copy(best.p);target.y=0;state.intent='boost';}
 }
 target.x=clamp(target.x+Math.sin(now*.8+car.id*4.3)*profile.error,-C.halfWidth+3,C.halfWidth-3);
 target.z=clamp(target.z,-C.halfLength+1,C.halfLength-1);clampToPitch(target,1.2);
 const delta=state.delta.copy(target).sub(car.p).setY(0),angle=Math.atan2(delta.dot(r),delta.dot(forward)),
  dist=delta.length(),speed=car.v.dot(forward),cornerSpeed=clamp(18/(1+Math.abs(angle)*2),4,C.maxSpeed);
 let throttle=speed>cornerSpeed+1?-1:1,steer=clamp(angle*profile.steer,-1,1);
 if(Math.abs(angle)>2.3&&dist<6){throttle=-.8;steer=-steer;}
 const command=state.drive;
 Object.assign(command,{throttle,steer,pitch:0,roll:0,boost:Math.abs(angle)<.22&&dist>7&&car.boost>profile.boost&&speed<22.8&&(profile!==BOT_LEVELS.rookie||dist>22),drift:profile.dodge&&Math.abs(angle)>1.1&&Math.abs(speed)>9,jump:false});
 const nearBall=distance(car.p,ball.p);
 if(car.grounded&&now>=state.nextJump&&Math.abs(angle)<.5&&!['position','boost','rotate','cover','kickoff-cover'].includes(state.intent)){
  const aerial=role==='attack'&&ball.p.y>1.4&&ball.p.y<profile.maxHeight&&nearBall<4.5,
   dodge=profile.dodge&&role==='attack'&&ball.p.y<1.4&&nearBall>5&&nearBall<9&&speed>10&&Math.abs(angle)<.13;
  if(aerial||dodge){state.jumpUntil=now+(aerial?.18:.075);state.secondAt=profile.dodge?now+(aerial?.25:.16):Infinity;state.secondKind=dodge?'dodge':'double';state.nextJump=now+1.4;}
 }
 state.nextThink=now+profile.think;
}
export function botInput(car,sim){
 const profile=BOT_LEVELS[car.botDifficulty||sim.options.difficulty]||BOT_LEVELS.pro,now=sim.elapsed;
 car.botState??={nextThink:-Infinity,nextJump:0,jumpUntil:0,secondAt:Infinity,secondKind:'double',target:new V(),aim:new V(),shot:new V(),delta:new V(),drive:{},output:{},stuck:0,recoverAt:0};
 const state=car.botState;
 if(sim.goAt!==undefined&&!sim.clockStarted&&now<sim.goAt+profile.reaction)return {};
 sim.prediction.update(sim.ball,now);if(now>=state.nextThink)plan(car,sim,profile,state);
 const out=Object.assign(state.output,state.drive);out.jump=now<state.jumpUntil||(now>=state.secondAt&&now<state.secondAt+.075);
 const forward=fwd.clone().applyQuaternion(car.q),r=right.clone().applyQuaternion(car.q);
 if(car.grounded&&car.normal.y<.6&&car.p.y>2){
  // Take the driveable wall back to the pitch instead of boosting indefinitely.
  out.boost=false;out.drift=false;
  if(forward.y>.35){out.throttle=-1;out.steer=0;}
  else{out.throttle=1;out.steer=clamp(Math.atan2(-r.y,-forward.y)*2,-1,1);}
 }else if(!car.grounded){
  const upY=up.clone().applyQuaternion(car.q).y;
  if(upY<-.65&&car.p.y<1.2&&Math.abs(car.v.y)<.6&&now>=state.recoverAt){
   state.jumpUntil=now+.07;state.recoverAt=now+1;out.jump=true;out.pitch=out.roll=0;out.boost=false;
  }else{
   const chasing=profile===BOT_LEVELS.expert&&state.role==='attack'&&state.targetHeight>1.4&&distance(car.p,sim.ball.p)<12&&car.airTime<1.8,
    desired=chasing?Math.atan2(state.targetHeight-car.p.y+.2,Math.max(2,distance(car.p,sim.ball.p))):0;
   out.pitch=clamp((Math.asin(clamp(forward.y,-1,1))-desired)*3-car.omega.x*.12,-1,1);out.roll=clamp(r.y*4+car.omega.z*.1,-1,1);
   const aim=state.delta.copy(sim.ball.p).sub(car.p).normalize();
   out.boost=chasing&&forward.dot(aim)>.88&&car.boost>6&&car.p.y<profile.maxHeight+1;
   if(now>=state.secondAt&&now<state.secondAt+.075){
    if(state.secondKind==='double'){out.throttle=out.steer=out.pitch=out.roll=0;}
    else{out.pitch=1;out.steer=out.roll=0;}
   }
  }
 }
 if(car.v.length()<.5&&distance(car.p,state.target)>4)state.stuck+=C.step;else state.stuck=0;
 if(state.stuck>1.6){out.throttle=-1;out.steer=car.id%2?1:-1;out.boost=false;if(state.stuck>2.4)state.stuck=0;}
 return out;
}
