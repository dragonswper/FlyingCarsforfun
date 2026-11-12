/* Original fixed-step car-soccer simulation. Coordinate system: metres, +Y up, +Z orange goal.
   Reference measurements and deliberate approximations are documented in docs/research.md. */
import { Vector3 as V, Quaternion as Q } from './vendor/three.module.js';
export const C = Object.freeze({ halfWidth:40.96,halfLength:51.2,height:20.44,corner:80.64,ramp:2.56,goalWidth:8.92755,goalHeight:6.42775,goalDepth:8.8,ballRadius:.9125,carHeight:.24,gravity:6.5,maxSpeed:23,ballMaxSpeed:60,boostAccel:9.91666,boostBurn:33.3,jump:2.92,holdAccel:14.6,step:1/120 });
const UP=new V(0,1,0),FWD=new V(0,0,1),RIGHT=new V(1,0,0);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const lengthClamp=(v,max)=>{const l=v.length();if(l>max)v.multiplyScalar(max/l);return v;};
const basis=c=>({f:FWD.clone().applyQuaternion(c.q),u:UP.clone().applyQuaternion(c.q),r:RIGHT.clone().applyQuaternion(c.q)});
const big=new Set([3,4,15,18,29,30]);
const padLocations=[[0,-4240],[-1792,-4184],[1792,-4184],[-3072,-4096],[3072,-4096],[-940,-3308],[940,-3308],[0,-2816],[-3584,-2484],[3584,-2484],[-1788,-2300],[1788,-2300],[-2048,-1036],[0,-1024],[2048,-1036],[-3584,0],[-1024,0],[1024,0],[3584,0],[-2048,1036],[0,1024],[2048,1036],[-1788,2300],[1788,2300],[-3584,2484],[3584,2484],[0,2816],[-940,3308],[940,3308],[-3072,4096],[3072,4096],[-1792,4184],[1792,4184],[0,4240]];
export function createPads(){return padLocations.map(([x,z],id)=>({id,p:new V(x/100,.07,z/100),big:big.has(id),timer:0}));}
export function makeCar(id,team,bot=false){return {id,team,bot,p:new V(0,C.carHeight,0),v:new V(),q:new Q(),omega:new V(),normal:UP.clone(),grounded:true,boost:33,boosting:false,drifting:false,jumpHeld:false,jumpTime:0,airTime:0,canDouble:false,noContact:0,flipTime:0,flipAxis:new V(),demoTime:0,touches:0,goals:0,saves:0,demos:0,score:0,hitCooldown:0,stuckTime:0,botJump:false,recoverTime:0};}
function spawnCar(c,x,z,yaw){c.p.set(x,C.carHeight,z);c.v.set(0,0,0);c.q.setFromAxisAngle(UP,yaw);c.omega.set(0,0,0);c.normal.copy(UP);c.grounded=true;c.boost=33;c.jumpHeld=false;c.canDouble=false;c.noContact=0;c.flipTime=0;c.demoTime=0;c.boosting=false;c.recoverTime=0;}
function controls(i={}){return {throttle:clamp(Number(i.throttle)||0,-1,1),steer:clamp(Number(i.steer)||0,-1,1),pitch:clamp(Number(i.pitch)||0,-1,1),roll:clamp(Number(i.roll)||0,-1,1),jump:!!i.jump,boost:!!i.boost,drift:!!i.drift};}
export function arenaPlanes(p){
 const planes=[{n:new V(-Math.sign(p.x||1),0,0),d:C.halfWidth-Math.abs(p.x)}];
 const opening=Math.abs(p.x)<C.goalWidth+.2 && p.y<C.goalHeight+.2;
 if(!opening)planes.push({n:new V(0,0,-Math.sign(p.z||1)),d:C.halfLength-Math.abs(p.z)});
 else if(Math.abs(p.z)>C.halfLength){
  planes.push({n:new V(-Math.sign(p.x||1),0,0),d:C.goalWidth-Math.abs(p.x)});
  planes.push({n:new V(0,0,-Math.sign(p.z)),d:C.halfLength+C.goalDepth-Math.abs(p.z)});
 }
 planes.push({n:new V(-Math.sign(p.x||1)*Math.SQRT1_2,0,-Math.sign(p.z||1)*Math.SQRT1_2),d:(C.corner-Math.abs(p.x)-Math.abs(p.z))*Math.SQRT1_2});
 return planes;
}
function bounce(body,n,restitution){const vn=body.v.dot(n);if(vn<0)body.v.addScaledVector(n,-(1+restitution)*vn);return -vn;}
function capsule(body,a,b,radius,restitution){const segment=b.clone().sub(a),t=clamp(body.p.clone().sub(a).dot(segment)/segment.lengthSq(),0,1),near=a.clone().addScaledVector(segment,t),delta=body.p.clone().sub(near),len=delta.length();if(len<radius&&len>1e-7){delta.divideScalar(len);body.p.addScaledVector(delta,radius-len+.001);bounce(body,delta,restitution);}}
export function collideArena(body,radius,restitution=.6,car=false){
 let contact=null,impact=0;
 // A rounded floor-to-wall transition, using a 2.56 m quarter-cylinder.
 for(const plane of arenaPlanes(body.p)){
  const {n,d}=plane;
  if(d<C.ramp && body.p.y<C.ramp && Math.abs(body.p.z)<C.halfLength+.1){
   const horizontal=C.ramp-d,vertical=C.ramp-body.p.y,l=Math.hypot(horizontal,vertical);
   if(l>C.ramp-radius){const normal=n.clone().multiplyScalar(horizontal/l).addScaledVector(UP,vertical/l);body.p.addScaledVector(normal,l-(C.ramp-radius));impact=Math.max(impact,bounce(body,normal,restitution));contact=normal;}
  }else if(d<radius){body.p.addScaledVector(n,radius-d);impact=Math.max(impact,bounce(body,n,restitution));contact=n;}
 }
 if(body.p.y<radius){body.p.y=radius;impact=Math.max(impact,bounce(body,UP,restitution));contact=UP.clone();if(!car&&Math.abs(body.v.y)<.38)body.v.y=0;}
 const inNet=Math.abs(body.p.z)>C.halfLength+.15&&Math.abs(body.p.x)<C.goalWidth+radius;
 const ceiling=inNet?C.goalHeight:C.height;
 if(body.p.y>ceiling-radius){body.p.y=ceiling-radius;impact=Math.max(impact,bounce(body,new V(0,-1,0),restitution));if(car)contact=new V(0,-1,0);}
 // Round posts and crossbars, rather than treating the mouth as a flat wall.
 for(const sign of [-1,1])if(Math.abs(body.p.z-sign*C.halfLength)<radius+.45){
  for(const x of [-C.goalWidth,C.goalWidth])capsule(body,new V(x,0,sign*C.halfLength),new V(x,C.goalHeight,sign*C.halfLength),radius+.12,restitution);
  capsule(body,new V(-C.goalWidth,C.goalHeight,sign*C.halfLength),new V(C.goalWidth,C.goalHeight,sign*C.halfLength),radius+.12,restitution);
 }
 return {contact,impact};
}
function curvature(speed){const points=[[0,.69],[5,.398],[10,.235],[15,.1375],[17.5,.11],[23,.088]];for(let i=1;i<points.length;i++)if(speed<=points[i][0]){const [x,y]=points[i-1],[xx,yy]=points[i];return y+(yy-y)*(speed-x)/(xx-x);}return .088;}
export function stepCar(c,input,dt,unlimited=false){
 if(c.demoTime>0){c.demoTime=Math.max(0,c.demoTime-dt);if(c.demoTime===0)spawnCar(c,c.id%2?15:-15,c.team?42:-42,c.team?Math.PI:0);return;}
 const i=controls(input),{f,u,r}=basis(c),jumpPressed=i.jump&&!c.jumpHeld;c.hitCooldown=Math.max(0,c.hitCooldown-dt);c.noContact=Math.max(0,c.noContact-dt);
 c.renderSteer=i.steer;c.renderThrottle=i.throttle;c.boosting=i.boost&&(unlimited||c.boost>0);c.drifting=i.drift&&c.grounded;
 if(c.grounded){
  const forward=f.clone().addScaledVector(c.normal,-f.dot(c.normal)).normalize(),right=new V().crossVectors(c.normal,forward).normalize();
  const speed=c.v.dot(forward),lateral=c.v.dot(right);let acceleration=0;
  if(Math.abs(i.throttle)<.05)acceleration=-Math.sign(speed)*Math.min(Math.abs(speed)/dt,5.25);
  else if(speed*i.throttle<-.1)acceleration=i.throttle*35;
  else acceleration=i.throttle*Math.max(0,16*(1-Math.abs(speed)/(i.throttle<0?12:14.1)));
  c.v.addScaledVector(forward,acceleration*dt);c.v.addScaledVector(right,-lateral*(1-Math.exp(-(i.drift?2:18)*dt)));
  const yaw=i.steer*speed*curvature(Math.abs(speed))*(i.drift?1.55:1);
  c.q.premultiply(new Q().setFromAxisAngle(c.normal,yaw*dt));
  const correction=new Q().setFromUnitVectors(u,c.normal).multiply(c.q);c.q.slerp(correction,1-Math.exp(-18*dt));c.omega.multiplyScalar(.1);
 }else{
  c.airTime+=dt;
  if(c.flipTime>0){c.flipTime=Math.max(0,c.flipTime-dt);c.omega.copy(c.flipAxis).multiplyScalar(2*Math.PI/.65);if(c.flipTime===0)c.omega.multiplyScalar(.1);}
  else{c.omega.x+=(i.pitch*10-c.omega.x*3.4)*dt;c.omega.y+=(i.steer*8-c.omega.y*3)*dt;c.omega.z+=(-i.roll*12-c.omega.z*3)*dt;}
  lengthClamp(c.omega,9.7);const mag=c.omega.length();if(mag>.001)c.q.multiply(new Q().setFromAxisAngle(c.omega.clone().divideScalar(mag),mag*dt)).normalize();
  c.v.addScaledVector(f,i.throttle*(i.throttle<0?.33334:.66667)*dt);
 }
 if(jumpPressed){
  if(c.grounded){c.v.addScaledVector(c.normal,C.jump);c.grounded=false;c.noContact=.1;c.jumpTime=0;c.airTime=0;c.canDouble=true;c.normal.copy(UP);}
  else if(c.canDouble&&c.airTime<1.45){
   c.canDouble=false;
   if(Math.hypot(i.throttle,i.steer)>.25){const direction=f.clone().multiplyScalar(i.throttle).addScaledVector(r,i.steer).normalize();c.v.addScaledVector(direction,5);c.v.y+=.4;c.flipAxis.set(i.throttle,0,-i.steer).normalize();c.flipTime=.65;}
   else c.v.addScaledVector(u,C.jump);
  }
 }
 if(!c.grounded&&c.canDouble&&c.jumpTime<.2){if(i.jump||c.jumpTime<.025)c.v.addScaledVector(u,C.holdAccel*dt);if(c.jumpTime<.025)c.v.addScaledVector(u,-3.25*dt);c.jumpTime+=dt;}
 if(c.boosting){c.v.addScaledVector(f,C.boostAccel*dt);if(!unlimited)c.boost=Math.max(0,c.boost-C.boostBurn*dt);}
 c.jumpHeld=i.jump;c.v.y-=C.gravity*dt;lengthClamp(c.v,C.maxSpeed);c.p.addScaledVector(c.v,dt);
 const {contact}=collideArena(c,C.carHeight,.05,true);
 if(contact&&c.noContact===0){
  const aligned=UP.clone().applyQuaternion(c.q).dot(contact);
  if(aligned>.2){c.grounded=true;c.normal.copy(contact);c.canDouble=false;c.airTime=0;c.recoverTime=0;}
  else{c.grounded=false;c.recoverTime+=dt;if(c.recoverTime>.55){const correction=new Q().setFromUnitVectors(UP.clone().applyQuaternion(c.q),contact).multiply(c.q);c.q.slerp(correction,.08);}}
 }else c.grounded=false;
 if(!Number.isFinite(c.p.lengthSq()))spawnCar(c,0,c.team?30:-30,c.team?Math.PI:0);
}
export function collideCarBall(c,b){
 if(c.demoTime>0)return false;
 const inverse=c.q.clone().invert(),local=b.p.clone().sub(c.p).applyQuaternion(inverse),half=new V(.46,.29,.8),closest=new V(clamp(local.x,-half.x,half.x),clamp(local.y,-half.y,half.y),clamp(local.z,-half.z,half.z));
 const delta=local.clone().sub(closest),len=delta.length();if(len>=C.ballRadius)return false;
 const n=(len>.0001?delta.divideScalar(len):new V(0,1,0)).applyQuaternion(c.q);b.p.addScaledVector(n,(C.ballRadius-len)*.9+.001);c.p.addScaledVector(n,-(C.ballRadius-len)*.1);
 const hitNormal=n.clone();
 // Grounded bumper shots need an arcade impulse rather than a frictionless upward launch.
 // Jumping underneath the ball still produces full-height pop/aerial contacts.
 if(c.grounded&&b.p.y<1.3){hitNormal.y*=.35;hitNormal.normalize();}
 const closing=b.v.clone().sub(c.v).dot(hitNormal);
 if(closing<0){const impulse=-(1.65*closing)/(1/30+1/180);b.v.addScaledVector(hitNormal,impulse/30);c.v.addScaledVector(hitNormal,-impulse/180);const tangent=c.v.clone().addScaledVector(n,-c.v.dot(n));b.spin.add(new V().crossVectors(n,tangent).multiplyScalar(.12));lengthClamp(b.v,C.ballMaxSpeed);return true;}
 return false;
}
function collideCars(a,b,emit){
 if(a.demoTime>0||b.demoTime>0)return;const d=b.p.clone().sub(a.p),len=d.length(),min=1.18;if(len>=min||len<.001)return;d.divideScalar(len);
 const av=a.v.length(),bv=b.v.length(),closing=a.v.clone().sub(b.v).dot(d);
 if(a.team!==b.team&&closing>10&&(av>22||bv>22)){
  const attacker=av>=bv?a:b,victim=av>=bv?b:a;victim.demoTime=3;victim.v.set(0,0,0);attacker.demos++;attacker.score+=100;emit('demo',{id:victim.id,by:attacker.id,p:victim.p.toArray()});return;
 }
 a.p.addScaledVector(d,-(min-len)/2);b.p.addScaledVector(d,(min-len)/2);if(closing>0){a.v.addScaledVector(d,-closing*.65);b.v.addScaledVector(d,closing*.65);}
}
export function botInput(car,sim){
 const reaction=((car.id*7+(sim.kickoffs||1)*3)%5)*.04;
 if(!sim.clockStarted&&sim.elapsed-sim.goAt<reaction)return {};
 const b=sim.ball,dir=car.team?-1:1,players=sim.cars.filter(c=>c.team===car.team&&c.demoTime===0),rank=players.slice().sort((a,c)=>a.p.distanceToSquared(b.p)-c.p.distanceToSquared(b.p)).indexOf(car);
 const target=b.p.clone().addScaledVector(b.v,sim.options.difficulty==='rookie'?.12:.35);target.y=0;
 const goal=new V(0,0,dir*C.halfLength),shot=goal.clone().sub(target).normalize();
 if(rank>0&&Math.abs(b.p.z)<32){target.multiplyScalar(.28);target.z=-dir*35;}
 else if(car.p.clone().sub(b.p).dot(shot)>-1){
  target.addScaledVector(shot,-3.5);
  // Route around the ball to the shooting side; do not reverse through it into our own net.
  if(Math.abs(car.p.x-b.p.x)<5.5)target.x+=(car.team?-1:1)*(car.id%2?1:-1)*6;
 }else if(car.p.distanceTo(b.p)>12)target.addScaledVector(shot,-3.5);
 target.x=clamp(target.x,-37,37);target.z=clamp(target.z,-48,48);
 const delta=target.sub(car.p),{f,r}=basis(car),angle=Math.atan2(delta.dot(r),delta.dot(f)),dist=delta.length();let throttle=1,steer=clamp(angle*2,-1,1);
 if(Math.abs(angle)>2.2&&dist<7){throttle=-.8;steer=-steer;}
 if(car.v.length()<1&&dist>4)car.stuckTime+=C.step;else car.stuckTime=0;
 if(car.stuckTime>1.6){throttle=-1;steer=1;if(car.stuckTime>2.5)car.stuckTime=0;}
 const wantsJump=car.grounded&&b.p.y>1.5&&b.p.y<4&&car.p.distanceTo(b.p)<4;
 const jump=wantsJump&&!car.botJump;car.botJump=jump;
 return {throttle,steer,pitch:car.grounded?0:clamp((car.p.y-b.p.y)*.3,-1,1),jump,boost:sim.options.difficulty!=='rookie'&&Math.abs(angle)<.26&&dist>7&&car.boost>8,drift:Math.abs(angle)>1.1&&car.v.length()>7};
}
const drills=[{name:'Straight shot',car:[0,-32],ball:[0,.913,-20],v:[0,0,0]},{name:'Left angle',car:[-18,-30],ball:[-10,.913,-12],v:[0,0,0]},{name:'Right angle',car:[18,-30],ball:[10,.913,-12],v:[0,0,0]},{name:'First aerial',car:[0,-18],ball:[0,3.8,-7],v:[0,0,1.5]},{name:'Make the save',car:[0,-40],ball:[2,2,-8],v:[-1.2,1,-15]}];
export class Simulation{
 constructor(options={}){
  this.options={mode:'duel',duration:300,difficulty:'pro',unlimited:false,...options};this.events=[];this.cars=[makeCar(0,0)];
  if(this.options.mode==='duel')this.cars.push(makeCar(1,1,true));
  if(this.options.mode==='doubles')this.cars.push(makeCar(1,0,true),makeCar(2,1,true),makeCar(3,1,true));
  this.ball={p:new V(0,C.ballRadius,0),v:new V(),spin:new V(),q:new Q()};this.pads=createPads();this.score=[0,0];this.remaining=this.options.duration;this.overtime=false;this.elapsed=0;this.phase='kickoff';this.phaseTime=3;this.clockStarted=false;this.lastTouch=-1;this.lastTouchTime=-99;this.replay=[];this.recordTime=0;this.trainingIndex=0;this.trainingHits=0;this.shotTime=15;
  if(this.options.mode==='training')this.loadDrill();else this.kickoff();
  if(this.options.mode==='free'){this.phase='playing';this.cars[0].boost=100;}
 }
 emit(type,detail={}){this.events.push({type,...detail});if(this.events.length>100)this.events.shift();}
 kickoff(){
  this.kickoffs=(this.kickoffs||0)+1;
  const count=[0,0];for(const c of this.cars){const side=c.team?1:-1,index=count[c.team]++;spawnCar(c,index?(c.team?-12:12):0,side*(index?39:38),c.team?Math.PI:0);}
  this.ball.p.set(0,C.ballRadius,0);this.ball.v.set(0,0,0);this.ball.spin.set(0,0,0);this.pads.forEach(p=>p.timer=0);this.phase='kickoff';this.phaseTime=3;this.clockStarted=false;this.lastTouch=-1;this.replay=[];
 }
 loadDrill(){
  const d=drills[this.trainingIndex%drills.length],c=this.cars[0];const yaw=Math.atan2(d.ball[0]-d.car[0],d.ball[2]-d.car[1]);spawnCar(c,...d.car,yaw);c.boost=100;this.ball.p.fromArray(d.ball);this.ball.v.fromArray(d.v);this.ball.spin.set(0,0,0);this.ball.q.identity();this.phase='playing';this.shotTime=15;this.drillName=d.name;this.lastTouch=-1;
 }
 resetPractice(){if(!['free','training'].includes(this.options.mode)||this.phase!=='playing')return false;if(this.options.mode==='training')this.loadDrill();else{const c=this.cars[0];spawnCar(c,0,-25,0);c.boost=100;this.ball.p.set(0,C.ballRadius,-12);this.ball.v.set(0,0,0);this.ball.spin.set(0,0,0);}return true;}
 nextDrill(){if(this.options.mode!=='training')return;if(++this.trainingIndex>=drills.length){this.phase='ended';this.emit('end',{won:this.trainingHits>=3,training:true});}else this.loadDrill();}
 skipReplay(){if(this.phase==='goal')this.afterGoal();}
 afterGoal(){
  if(this.options.mode==='training'){this.nextDrill();return;}
  if(this.options.mode==='free'){this.kickoff();this.phase='playing';this.cars[0].boost=100;return;}
  if(this.overtime||(this.remaining<=0&&this.score[0]!==this.score[1])){this.end();return;}
  if(this.remaining<=0)this.overtime=true;this.kickoff();
 }
 end(){this.phase='ended';this.emit('end',{won:this.score[0]>this.score[1]});}
 goal(team){
  if(this.phase!=='playing')return;
  this.score[team]++;const scorer=this.cars.find(c=>c.id===this.lastTouch);if(scorer&&scorer.team===team){scorer.goals++;scorer.score+=100;}
  if(this.options.mode==='training'&&team===0)this.trainingHits++;
  this.phase='goal';this.phaseTime=4;this.emit('goal',{team,scorer:scorer?.team===team?scorer.id:null,speed:this.ball.v.length()*3.6});
 }
 step(input={},dt=C.step){
  if(this.phase==='ended')return;this.elapsed+=dt;
  if(this.phase==='kickoff'){this.phaseTime-=dt;if(this.phaseTime<=0){this.phase='playing';this.goAt=this.elapsed;this.emit('go');}return;}
  if(this.phase==='goal'){this.phaseTime-=dt;if(this.phaseTime<=0)this.afterGoal();return;}
  for(const p of this.pads)p.timer=Math.max(0,p.timer-dt);
  for(const car of this.cars){stepCar(car,car.bot?botInput(car,this):input,dt,this.options.mode==='free'||this.options.mode==='training'||this.options.unlimited);
   if(car.demoTime===0)for(const pad of this.pads)if(pad.timer===0&&car.boost<99.95&&Math.abs(car.p.y-pad.p.y)<1.65&&Math.hypot(car.p.x-pad.p.x,car.p.z-pad.p.z)<(pad.big?2.08:1.44)){car.boost=pad.big?100:Math.min(100,car.boost+12);pad.timer=pad.big?10:4;this.emit('pad',{id:pad.id,car:car.id,big:pad.big});}
  }
  this.ball.v.y-=C.gravity*dt;this.ball.v.multiplyScalar(Math.exp(-.0305*dt));this.ball.p.addScaledVector(this.ball.v,dt);const hit=collideArena(this.ball,C.ballRadius,.6);
  if(hit.impact>3)this.emit('bounce',{speed:hit.impact,p:this.ball.p.toArray()});
  if(this.ball.p.y<C.ballRadius+.02){const drag=Math.exp(-.28*dt);this.ball.v.x*=drag;this.ball.v.z*=drag;this.ball.spin.x=this.ball.v.z/C.ballRadius;this.ball.spin.z=-this.ball.v.x/C.ballRadius;}
  this.ball.spin.multiplyScalar(Math.exp(-.3*dt));lengthClamp(this.ball.spin,12);const spin=this.ball.spin.length();if(spin>.001)this.ball.q.premultiply(new Q().setFromAxisAngle(this.ball.spin.clone().divideScalar(spin),spin*dt)).normalize();
  this.tick=(this.tick||0)+1;
  for(const car of (this.tick%2?this.cars:this.cars.slice().reverse())){if(collideCarBall(car,this.ball)){
   this.clockStarted=true;this.lastTouch=car.id;this.lastTouchTime=this.elapsed;
   if(car.hitCooldown===0){car.touches++;car.score+=2;car.hitCooldown=.15;this.emit('hit',{car:car.id,speed:this.ball.v.length(),p:this.ball.p.toArray()});}
  }}
  for(let a=0;a<this.cars.length;a++)for(let b=a+1;b<this.cars.length;b++)collideCars(this.cars[a],this.cars[b],(t,d)=>this.emit(t,d));
  lengthClamp(this.ball.v,C.ballMaxSpeed);
  if(Math.abs(this.ball.p.z)>C.halfLength+C.ballRadius&&Math.abs(this.ball.p.x)<C.goalWidth-C.ballRadius&&this.ball.p.y<C.goalHeight-C.ballRadius){this.goal(this.ball.p.z>0?0:1);return;}
  if(this.options.mode==='training'){
   this.shotTime-=dt;
   if(this.trainingIndex===4&&this.lastTouch===0&&this.ball.v.z>3){this.trainingHits++;this.emit('save');this.phase='goal';this.phaseTime=2;}
   else if(this.shotTime<=0){this.emit('miss');this.phase='goal';this.phaseTime=1.4;}
  }else if(this.options.mode!=='free'&&this.clockStarted){
   if(this.overtime)this.remaining+=dt;else this.remaining=Math.max(0,this.remaining-dt);
   if(!this.overtime&&this.remaining<=0&&this.ball.p.y<=C.ballRadius+.025){if(this.score[0]===this.score[1]){this.overtime=true;this.remaining=0;this.kickoff();this.emit('overtime');}else this.end();}
  }
  this.recordTime+=dt;if(this.recordTime>=.05){this.recordTime=0;this.replay.push(this.snapshot());if(this.replay.length>100)this.replay.shift();}
 }
 snapshot(){return {ball:{p:this.ball.p.toArray(),q:this.ball.q.toArray()},cars:this.cars.map(c=>({id:c.id,team:c.team,p:c.p.toArray(),q:c.q.toArray(),demo:c.demoTime>0,boosting:c.boosting,speed:c.v.dot(FWD.clone().applyQuaternion(c.q)),steer:c.renderSteer||0,grounded:c.grounded})),time:this.elapsed};}
 state(){return {phase:this.phase,mode:this.options.mode,score:[...this.score],remaining:this.remaining,overtime:this.overtime,phaseTime:this.phaseTime,elapsed:this.elapsed,boost:this.cars[0].boost,speed:this.cars[0].v.length()*3.6,grounded:this.cars[0].grounded,trainingIndex:this.trainingIndex,trainingHits:this.trainingHits,drillName:this.drillName,shotTime:this.shotTime,players:this.cars.map(c=>({id:c.id,team:c.team,goals:c.goals,touches:c.touches,demos:c.demos,score:c.score}))};}
}
