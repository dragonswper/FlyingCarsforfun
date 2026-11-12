/* Original browser bot controller, informed by Beast's utility/aim-cone approach.
   Every level sends ordinary controls through the same vehicle physics. */
import {Vector3 as V} from './vendor/three.module.js';import {C,clamp,clampToPitch} from './constants.js';
export const BOT_LEVELS=Object.freeze({
 rookie:{name:'Rookie',reaction:.28,think:.20,horizon:1.2,error:.8,maxHeight:2.1,steer:2.1,boost:45,dodge:false,description:'Slower reactions and simple ground shots.'},
 pro:{name:'Pro',reaction:.14,think:.10,horizon:2,error:.25,maxHeight:3,steer:2.8,boost:25,dodge:false,description:'Predicts ground shots, saves and collects boost.'},
 allstar:{name:'All-Star',reaction:.08,think:1/15,horizon:2.6,error:.08,maxHeight:4,steer:3.3,boost:18,dodge:true,description:'Reads bounces, rotates with teammates and uses dodges.'},
 expert:{name:'Expert',reaction:.04,think:.05,horizon:3,error:.02,maxHeight:5,steer:3.7,boost:12,dodge:true,description:'Faster interception, tighter aiming and aerial attempts.'}
});
const up=new V(0,1,0),fwd=new V(0,0,1),right=new V(1,0,0);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function arrivalTime(car,target){
 const delta=new V(target.x-car.p.x,0,target.z-car.p.z),dist=delta.length(),forward=fwd.clone().applyQuaternion(car.q).setY(0).normalize(),angle=dist>0?Math.acos(clamp(forward.dot(delta)/dist,-1,1)):0,speed=Math.max(0,car.v.dot(forward)),accel=car.boost>10?21:14;
 const cruise=Math.max(0,(dist-(C.maxSpeed*C.maxSpeed-speed*speed)/(2*accel))/C.maxSpeed),accelerate=(Math.sqrt(speed*speed+2*accel*Math.min(dist,Math.max(0,(C.maxSpeed*C.maxSpeed-speed*speed)/(2*accel))))-speed)/accel;return Math.max(0,accelerate+cruise)+angle*.24;
}
function roleFor(car,sim,ball){
 sim.botRoles??=[null,null];let role=sim.botRoles[car.team];if(!role||sim.elapsed>=role.until||!sim.cars.some(c=>c.id===role.striker&&c.demoTime===0)){
  const team=sim.cars.filter(c=>c.team===car.team&&c.demoTime===0);let best=null,eta=Infinity;for(const c of team){const time=arrivalTime(c,ball);if(time<eta){eta=time;best=c;}}
  role=sim.botRoles[car.team]={striker:best?.id,until:sim.elapsed+.2};
 }return role.striker===car.id?'attack':'support';
}
function intercept(car,sim,profile){
 const prediction=sim.prediction;for(const point of prediction.samples){const time=point.t-(sim.elapsed-prediction.generatedAt);if(time<.08||time>profile.horizon||point.p.y>profile.maxHeight)continue;if(arrivalTime(car,point.p)<=time+.12)return point.p;}
 return prediction.at(clamp(distance(car.p,sim.ball.p)/18,.12,profile.horizon),sim.elapsed).p;
}
function plan(car,sim,profile,state){
 const now=sim.elapsed,ball=sim.ball,dir=car.team?-1:1,role=roleFor(car,sim,ball.p),threat=sim.prediction.goalThreat(car.team,now),hit=intercept(car,sim,profile),target=state.target,forward=fwd.clone().applyQuaternion(car.q),r=right.clone().applyQuaternion(car.q);
 state.intent=role==='attack'?'shoot':'rotate';state.targetHeight=hit.y;const ownGoal=-dir*C.halfLength;
 if(role==='support'){
  target.set(clamp(ball.p.x*.45,-20,20),0,clamp(ball.p.z*.45-dir*17,-C.halfLength+3,C.halfLength-3));if(threat){state.intent='cover';target.set(clamp(threat.p.x,-C.goalWidth+1,C.goalWidth-1),0,ownGoal+dir*2);}
 }else{
  if(threat)state.intent='save';else if(ball.p.z*dir<-20)state.intent='clear';
  const defender=sim.cars.find(c=>c.team!==car.team&&c.demoTime===0&&Math.abs(c.p.z-dir*C.halfLength)<10),goal=new V(defender?-Math.sign(defender.p.x||1)*(C.goalWidth-2.5):0,0,dir*C.halfLength),shot=goal.sub(hit).setY(0).normalize(),wrongSide=car.p.clone().sub(ball.p).dot(shot)>-.5;
  target.copy(hit).addScaledVector(shot,distance(car.p,hit)>4?-2.4:.25);target.y=0;
  if(wrongSide){state.intent='position';target.copy(ball.p).addScaledVector(shot,-3.5);if(Math.abs(car.p.x-ball.p.x)<5.5)target.x+=(car.id%2?1:-1)*5.5;}
 }
 if(!threat&&car.boost<profile.boost&&distance(car.p,ball.p)>12){let best=null,bestCost=Infinity;for(const pad of sim.pads){if(pad.timer>0)continue;const cost=distance(car.p,pad.p)+.45*distance(pad.p,target)-(pad.big?2:0);if(cost<bestCost){bestCost=cost;best=pad;}}if(best&&distance(car.p,best.p)<18){target.copy(best.p);target.y=0;state.intent='boost';}}
 target.x=clamp(target.x+Math.sin(now*.8+car.id*4.3)*profile.error,-C.halfWidth+3,C.halfWidth-3);target.z=clamp(target.z,-C.halfLength+1,C.halfLength-1);
 clampToPitch(target,1.2);
 const delta=target.clone().sub(car.p).setY(0),angle=Math.atan2(delta.dot(r),delta.dot(forward)),dist=delta.length(),speed=car.v.dot(forward),cornerSpeed=clamp(18/(1+Math.abs(angle)*2),4,C.maxSpeed);let throttle=speed>cornerSpeed+1?-1:1,steer=clamp(angle*profile.steer,-1,1);
 if(Math.abs(angle)>2.3&&dist<6){throttle=-.8;steer=-steer;}
 const command=state.drive;Object.assign(command,{throttle,steer,pitch:0,roll:0,boost:Math.abs(angle)<.23&&dist>7&&car.boost>profile.boost&&speed<22.8&&(profile!==BOT_LEVELS.rookie||dist>22),drift:profile.dodge&&Math.abs(angle)>1.1&&Math.abs(speed)>9,jump:false});
 const nearBall=distance(car.p,ball.p);if(car.grounded&&now>=state.nextJump&&Math.abs(angle)<.5&&state.intent!=='position'&&state.intent!=='boost'){
  const aerial=role==='attack'&&ball.p.y>1.4&&ball.p.y<profile.maxHeight&&nearBall<4.5,dodge=profile.dodge&&role==='attack'&&ball.p.y<1.4&&nearBall>5&&nearBall<9&&speed>10&&Math.abs(angle)<.13;
  if(aerial||dodge){state.jumpUntil=now+(aerial?.18:.075);state.secondAt=profile.dodge?now+(aerial?.25:.16):Infinity;state.secondKind=dodge?'dodge':'double';state.nextJump=now+1.4;}
 }
 state.nextThink=now+profile.think;
}
export function botInput(car,sim){
 const profile=BOT_LEVELS[car.botDifficulty||sim.options.difficulty]||BOT_LEVELS.pro,now=sim.elapsed;car.botState??={nextThink:-Infinity,nextJump:0,jumpUntil:0,secondAt:Infinity,secondKind:'double',target:new V(),drive:{},output:{},stuck:0};const state=car.botState;
 if(sim.goAt!==undefined&&!sim.clockStarted&&now<sim.goAt+profile.reaction)return {};
 sim.prediction.update(sim.ball,now);if(now>=state.nextThink)plan(car,sim,profile,state);const out=Object.assign(state.output,state.drive);out.jump=now<state.jumpUntil||(now>=state.secondAt&&now<state.secondAt+.075);
 if(!car.grounded){const forward=fwd.clone().applyQuaternion(car.q),r=right.clone().applyQuaternion(car.q);out.pitch=clamp(forward.y*4-(profile.dodge?Math.max(0,state.targetHeight-car.p.y)*.18:0),-1,1);out.roll=clamp(r.y*4,-1,1);if(profile!==BOT_LEVELS.expert)out.boost=false;if(now>=state.secondAt&&now<state.secondAt+.075){if(state.secondKind==='double'){out.throttle=0;out.steer=0;out.pitch=0;out.roll=0;}else{out.pitch=1;out.steer=0;out.roll=0;}}}
 if(car.v.length()<.5&&distance(car.p,state.target)>4)state.stuck+=C.step;else state.stuck=0;if(state.stuck>1.6){out.throttle=-1;out.steer=car.id%2?1:-1;out.boost=false;if(state.stuck>2.4)state.stuck=0;}return out;
}
