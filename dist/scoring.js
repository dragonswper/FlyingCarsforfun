import {C} from './constants.js';

export const MATCH_POINTS=Object.freeze({goal:C.goalPoints,assist:C.assistPoints,save:C.savePoints,shot:10});
export const competitiveMode=mode=>['duel','doubles','custom'].includes(mode);

// A short, goal-mouth trajectory estimate. The regulation floor prevents a
// rolling ball from being projected below the pitch; airborne balls use gravity.
// This is an on-target attempt detector, not a promise the shot will score.
export function goalThreat(ball,defendingTeam,horizon=2.5){
 const sign=defendingTeam===0?-1:1,vz=ball.v.z*sign;
 if(vz<2)return null;
 const time=(C.goalScorePlane+C.ballRadius-ball.p.z*sign)/vz;
 if(time<=0||time>horizon)return null;
 const x=ball.p.x+ball.v.x*time,
  y=Math.max(C.ballRestHeight,ball.p.y+ball.v.y*time-.5*C.gravity*time*time);
 if(Math.abs(x)>=C.goalWidth-C.ballRadius||y>=C.goalHeight-C.ballRadius)return null;
 return {time,x,y};
}

export class MatchScoring{
 constructor(){this.before={p:{x:0,y:0,z:0},v:{x:0,y:0,z:0}};this.reset();}
 reset(){this.attempt=null;this.lastShotAt=[-Infinity,-Infinity];this.lastSaveAt=new Map();}
 capture(sim){
  Object.assign(this.before.p,sim.ball.p);Object.assign(this.before.v,sim.ball.v);
  this.previousTeam=sim.cars.find(car=>car.id===sim.lastTouch)?.team;
 }
 notify(sim,car,kind){if(competitiveMode(sim.options.mode))sim.emit('score',{car:car.id,kind,points:MATCH_POINTS[kind]});}
 award(sim,car,kind){car.score+=MATCH_POINTS[kind];this.notify(sim,car,kind);}
 touch(sim,car){
  if(!competitiveMode(sim.options.mode))return;
  const incoming=goalThreat(this.before,car.team,1.8),outgoing=goalThreat(sim.ball,car.team,1.8),now=sim.elapsed;
  // Opponent-originating danger, close enough to defend, must actually be
  // redirected away or delayed. Backpasses and repeated contact do not farm saves.
  if(this.previousTeam===1-car.team&&incoming&&
   this.before.p.z*(car.team===0?-1:1)>C.halfLength-25&&
   (!outgoing||outgoing.time>incoming.time+.35)&&now-(this.lastSaveAt.get(car.id)??-Infinity)>1.5){
   car.saves++;this.award(sim,car,'save');this.lastSaveAt.set(car.id,now);this.attempt=null;
  }
  if(this.attempt&&(this.attempt.team!==car.team||now>this.attempt.expires))this.attempt=null;
  const shot=goalThreat(sim.ball,1-car.team);
  if(!shot){if(this.attempt?.team===car.team)this.attempt=null;return;}
  // One shot per uninterrupted attempt, including jittery sustained contacts.
  if(!this.attempt&&now-this.lastShotAt[car.team]>1.2){
   car.shots++;this.award(sim,car,'shot');this.lastShotAt[car.team]=now;
   this.attempt={team:car.team,shooter:car.id,expires:now+3.5};
  }
 }
}

export function matchMVP(sim){
 if(!competitiveMode(sim.options.mode)||sim.phase!=='ended'||sim.score[0]===sim.score[1])return null;
 const winningTeam=sim.score[0]>sim.score[1]?0:1;
 return sim.cars.filter(car=>car.team===winningTeam&&car.score>0).sort((a,b)=>
  b.score-a.score||b.goals-a.goals||b.saves-a.saves||a.id-b.id)[0]||null;
}
