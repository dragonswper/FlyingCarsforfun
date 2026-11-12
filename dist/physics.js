/* Browser-native car soccer. Verified values are separate from analytic contact approximations. */
import {Vector3 as V,Quaternion as Q} from './vendor/three.module.js';
import {C,clamp,curve,THROTTLE_CURVE,CURVATURE_CURVE,BALL_HIT_CURVE} from './constants.js';
import {arenaPlanes,collideArena,carSupport} from './arena.js';
import {stepBall,BallPrediction} from './ball.js';import {botInput} from './bots.js';
export {C,clamp,arenaPlanes,collideArena,botInput};
const UP=new V(0,1,0),FWD=new V(0,0,1),RIGHT=new V(1,0,0);
const lengthClamp=(v,max)=>{const length=v.length();if(length>max)v.multiplyScalar(max/length);return v;};
const basis=c=>({f:FWD.clone().applyQuaternion(c.q),u:UP.clone().applyQuaternion(c.q),r:RIGHT.clone().applyQuaternion(c.q)});
const big=new Set([3,4,15,18,29,30]);
const padLocations=[[0,-4240],[-1792,-4184],[1792,-4184],[-3072,-4096],[3072,-4096],[-940,-3308],[940,-3308],[0,-2816],[-3584,-2484],[3584,-2484],[-1788,-2300],[1788,-2300],[-2048,-1036],[0,-1024],[2048,-1036],[-3584,0],[-1024,0],[1024,0],[3584,0],[-2048,1036],[0,1024],[2048,1036],[-1788,2300],[1788,2300],[-3584,2484],[3584,2484],[0,2816],[-940,3308],[940,3308],[-3072,4096],[3072,4096],[-1792,4184],[1792,4184],[0,4240]];
export function createPads(){return padLocations.map(([x,z],id)=>({id,p:new V(x/100,big.has(id)?.73:.70,z/100),big:big.has(id),timer:0}));}

export function makeCar(id,team,bot=false){
 return {id,team,bot,p:new V(0,C.carHeight,0),v:new V(),q:new Q(),omega:new V(),normal:UP.clone(),grounded:true,boost:C.boostSpawn,boosting:false,boostTime:0,drifting:false,handbrake:0,jumpHeld:false,jumpActive:false,hasJumped:false,jumpTime:0,jumpEndTime:0,airTime:0,canDouble:false,noContact:0,flipTime:0,flipAxis:new V(),selfRightTime:0,selfRightTarget:new Q(),demoTime:0,supersonic:false,supersonicTime:0,touches:0,goals:0,assists:0,saves:0,demos:0,score:0,hitCooldown:0,extraHitCooldown:0,recoverTime:0};
}
function spawnCar(c,x,z,yaw){
 c.p.set(x,C.carHeight,z);c.v.set(0,0,0);c.q.setFromAxisAngle(UP,yaw);c.omega.set(0,0,0);c.normal.copy(UP);c.selfRightTarget.identity();
 Object.assign(c,{grounded:true,boost:C.boostSpawn,boosting:false,boostTime:0,handbrake:0,jumpHeld:false,jumpActive:false,hasJumped:false,jumpTime:0,jumpEndTime:0,airTime:0,canDouble:false,noContact:0,flipTime:0,selfRightTime:0,demoTime:0,supersonic:false,supersonicTime:0,recoverTime:0,botState:undefined});
}
function controls(i={}){return {throttle:clamp(Number(i.throttle)||0,-1,1),steer:clamp(Number(i.steer)||0,-1,1),pitch:clamp(Number(i.pitch)||0,-1,1),roll:clamp(Number(i.roll)||0,-1,1),jump:!!i.jump,boost:!!i.boost,drift:!!i.drift,dodgeThreshold:clamp(Number(i.dodgeDeadzone)||C.dodgeThreshold,.1,1)};}
function startSelfRight(c){
 if(c.noContact>0)return false;const up=UP.clone().applyQuaternion(c.q);if(up.y>=-.35)return false;
 // Probe without changing the live pose: an inverted airborne jump must keep
 // its usual behavior. Recovery requires the roof to touch a supporting surface.
 const probe={...c,p:c.p.clone(),v:c.v.clone()},roof=collideArena(probe,C.carHeight,0,true).contacts.find(({normal})=>normal.y>.5&&up.dot(normal)<-.6);
 if(!roof)return false;const normal=roof.normal,axis=up.clone().cross(normal);if(axis.lengthSq()<1e-8)axis.copy(FWD).applyQuaternion(c.q);
 const correction=new Q().setFromAxisAngle(axis.normalize(),Math.acos(clamp(up.dot(normal),-1,1)));c.selfRightTarget.multiplyQuaternions(correction,c.q).normalize();c.selfRightTime=.75;
 c.v.addScaledVector(normal,Math.max(0,2-c.v.dot(normal)));c.omega.set(0,0,0);c.flipTime=0;c.jumpActive=false;c.canDouble=false;c.hasJumped=true;c.jumpEndTime=0;c.noContact=.075;c.normal.copy(UP);return true;
}
export function stepCar(c,input,dt,unlimited=false){
 if(c.demoTime>0){c.demoTime=Math.max(0,c.demoTime-dt);if(c.demoTime===0)spawnCar(c,c.id%2?23.04:-26.88,c.team?46.08:-46.08,c.team?Math.PI:0);return;}
 const i=controls(input),{f,u,r}=basis(c),wasGrounded=c.grounded,jumpPressed=i.jump&&!c.jumpHeld;
 c.hitCooldown=Math.max(0,c.hitCooldown-dt);c.extraHitCooldown=Math.max(0,c.extraHitCooldown-dt);c.noContact=Math.max(0,c.noContact-dt);
 c.boosting=(unlimited||c.boost>0)&&(i.boost||(c.boosting&&c.boostTime<C.boostMinTime-1e-9));c.boostTime=c.boosting?c.boostTime+dt:0;
 c.handbrake=clamp(c.handbrake+(i.drift?5:-2)*dt,0,1);c.drifting=c.handbrake>0&&c.grounded;c.renderSteer=i.steer;c.renderThrottle=i.throttle;
 if(c.grounded){
  const forward=f.clone().addScaledVector(c.normal,-f.dot(c.normal)).normalize(),right=new V().crossVectors(c.normal,forward).normalize(),speed=c.v.dot(forward),lateral=c.v.dot(right),throttle=c.boosting?1:i.throttle;let acceleration=0;
  if(Math.abs(throttle)<.001)acceleration=-Math.sign(speed)*Math.min(Math.abs(speed)/dt,C.coastAccel);
  else if(speed*throttle<-.25&&!i.drift)acceleration=-Math.sign(speed)*C.brakeAccel;
  else acceleration=throttle*curve(THROTTLE_CURVE,Math.abs(speed));
  c.v.addScaledVector(forward,acceleration*dt);c.v.addScaledVector(right,-lateral*(1-Math.exp(-(18-16*c.handbrake)*dt)));
  const yaw=i.steer*speed*curve(CURVATURE_CURVE,Math.abs(speed))*(1+c.handbrake*.55);c.q.premultiply(new Q().setFromAxisAngle(c.normal,yaw*dt));const correction=new Q().setFromUnitVectors(UP.clone().applyQuaternion(c.q),c.normal).multiply(c.q),angle=c.q.angleTo(correction);c.q.rotateTowards(correction,Math.min(angle*(1-Math.exp(-18*dt)),C.maxAngularSpeed*dt));c.omega.multiplyScalar(.1);
  if(c.normal.y<.99&&c.normal.y>=0)c.v.addScaledVector(c.normal,-3*dt);
 }else{
  c.airTime+=dt;
  if(c.selfRightTime>0){c.selfRightTime=Math.max(0,c.selfRightTime-dt);c.q.rotateTowards(c.selfRightTarget,C.maxAngularSpeed*dt);c.omega.set(0,0,0);if(c.q.angleTo(c.selfRightTarget)<1e-6)c.selfRightTime=0;}
  else{
   if(c.flipTime>0){c.flipTime=Math.max(0,c.flipTime-dt);if(c.flipAxis.x*i.pitch<-.25)c.flipAxis.x=0;if(c.flipAxis.x===0)c.omega.x*=Math.exp(-60*dt);else c.omega.x+=c.flipAxis.x*224*dt;c.omega.z+=c.flipAxis.z*260*dt;const elapsed=C.flipDuration-c.flipTime;if(elapsed>=.15&&(c.v.y<0||elapsed<.21))c.v.y*=Math.pow(.65,dt/C.step);}
   else{const k=C.airTorqueScale;c.omega.x+=(i.pitch*130-c.omega.x*30*(1-Math.abs(i.pitch)))*k*dt;c.omega.y+=(i.steer*95-c.omega.y*20*(1-Math.abs(i.steer)))*k*dt;c.omega.z+=(-i.roll*400-c.omega.z*50)*k*dt;}
   lengthClamp(c.omega,C.maxAngularSpeed);const spin=c.omega.length();if(spin>.001)c.q.multiply(new Q().setFromAxisAngle(c.omega.clone().divideScalar(spin),spin*dt)).normalize();
  }c.v.addScaledVector(f,i.throttle*C.airThrottleAccel*dt);
 }
 if(jumpPressed){
  if(c.grounded){c.v.addScaledVector(c.normal,C.jump);c.grounded=false;c.noContact=.075;c.jumpTime=0;c.jumpEndTime=0;c.airTime=0;c.canDouble=true;c.jumpActive=true;c.hasJumped=true;c.normal.copy(UP);}
  else if(!c.selfRightTime&&!startSelfRight(c)&&c.canDouble&&(!c.hasJumped||c.jumpEndTime<C.doubleJumpWindow)){
   c.canDouble=false;c.jumpActive=false;
   if(Math.abs(i.pitch)+Math.abs(i.steer)+Math.abs(i.roll)>=i.dodgeThreshold){
    const side=i.steer+i.roll,magnitude=Math.hypot(i.pitch,side)||1,along=i.pitch/magnitude,across=side/magnitude,flatForward=f.clone().setY(0).normalize(),flatRight=new V(flatForward.z,0,-flatForward.x),speed=c.v.dot(flatForward),ratio=Math.abs(speed)/C.maxSpeed,backward=Math.abs(speed)<1?along<0:along*speed<0;
    c.v.addScaledVector(flatForward,along*C.flipImpulse*(backward?(16/15)*(1+1.5*ratio):1)).addScaledVector(flatRight,across*C.flipImpulse*(1+.9*ratio));c.flipAxis.set(along,0,-across);c.flipTime=C.flipDuration;
   }else c.v.addScaledVector(u,C.jump);
  }
 }
 if(c.jumpActive){if(c.jumpTime>=C.jumpMaxTime-1e-9||(!i.jump&&c.jumpTime>=C.jumpMinTime-1e-9)){c.jumpActive=false;c.jumpEndTime=0;}else{c.v.addScaledVector(u,C.holdAccel*(c.jumpTime<C.jumpMinTime-1e-9?C.jumpMinAccelScale:1)*dt);c.jumpTime+=dt;}}
 if(c.hasJumped&&!c.jumpActive){c.jumpEndTime+=dt;if(c.jumpEndTime>=C.doubleJumpWindow)c.canDouble=false;}
 if(c.boosting){c.v.addScaledVector(f,(c.grounded?C.boostAccel:C.boostAirAccel)*dt);if(!unlimited){c.boost=Math.max(0,c.boost-C.boostBurn*dt);if(c.boost<1e-9)c.boost=0;}}
 c.jumpHeld=i.jump;c.v.y-=C.gravity*dt;lengthClamp(c.v,C.maxSpeed);c.p.addScaledVector(c.v,dt);
 const {contact,contacts}=collideArena(c,C.carHeight,0,true);
 if(contact&&c.noContact===0){const aligned=UP.clone().applyQuaternion(c.q).dot(contact);if(aligned>.55){c.grounded=true;c.normal.copy(contact);c.canDouble=false;c.hasJumped=false;c.jumpActive=false;c.airTime=0;c.recoverTime=0;c.flipTime=0;c.selfRightTime=0;}else{
  c.grounded=false;c.recoverTime+=dt;c.flipTime=0;c.omega.multiplyScalar(Math.exp(-18*dt));
  // A roof/bumper scrape absorbs spin; it does not turn into a wheel landing or
  // forcibly rotate the chassis upright and inject a new positional impulse.
  const inverse=c.q.clone().invert(),inertia=new V(3/(C.hitboxHalfHeight**2+C.hitboxHalfLength**2),3/(C.hitboxHalfWidth**2+C.hitboxHalfLength**2),3/(C.hitboxHalfWidth**2+C.hitboxHalfHeight**2));
  for(const {normal}of contacts){const normalSpeed=c.v.dot(normal),tangent=c.v.clone().addScaledVector(normal,-normalSpeed);c.v.addScaledVector(tangent,-(1-Math.exp(-3*dt)));
   const local=normal.clone().applyQuaternion(inverse),point=new V(Math.abs(local.x)>1e-4?-Math.sign(local.x)*C.hitboxHalfWidth:0,Math.abs(local.y)>1e-4?C.hitboxOffsetUp-Math.sign(local.y)*C.hitboxHalfHeight:0,Math.abs(local.z)>1e-4?C.hitboxOffsetForward-Math.sign(local.z)*C.hitboxHalfLength:0);
   c.omega.addScaledVector(point.cross(local).multiply(inertia),C.gravity*Math.max(0,normal.y)*dt/contacts.length);
  }
  if(aligned<-.9998&&!i.pitch&&!i.roll&&!i.steer&&c.v.lengthSq()<.04&&c.omega.lengthSq()<.16){const support=carSupport(c,contact),correction=new Q().setFromUnitVectors(UP.clone().applyQuaternion(c.q),contact.clone().negate()).multiply(c.q);c.q.rotateTowards(correction,C.maxAngularSpeed*dt);c.p.addScaledVector(contact,carSupport(c,contact)-support);c.omega.set(0,0,0);}
 }}else{c.grounded=false;c.recoverTime=0;}
 if(wasGrounded&&!c.grounded&&!c.hasJumped)c.canDouble=true;
 lengthClamp(c.omega,C.maxAngularSpeed);
 const speed=c.v.length();if(speed>=C.supersonicStart){c.supersonic=true;c.supersonicTime=0;}else if(c.supersonic){c.supersonicTime+=dt;if(speed<C.supersonicMaintain||c.supersonicTime>=C.supersonicGrace)c.supersonic=false;}
 if(!Number.isFinite(c.p.lengthSq()))spawnCar(c,0,c.team?46.08:-46.08,c.team?Math.PI:0);
}
export function collideCarBall(c,b){
 if(c.demoTime>0)return false;const inverse=c.q.clone().invert(),offset=new V(0,C.hitboxOffsetUp,C.hitboxOffsetForward),local=b.p.clone().sub(c.p).applyQuaternion(inverse).sub(offset),half=new V(C.hitboxHalfWidth,C.hitboxHalfHeight,C.hitboxHalfLength),closest=new V(clamp(local.x,-half.x,half.x),clamp(local.y,-half.y,half.y),clamp(local.z,-half.z,half.z)),delta=local.clone().sub(closest),length=delta.length();if(length>=C.ballRadius)return false;
 const n=(length>1e-7?delta.divideScalar(length):UP.clone()).applyQuaternion(c.q),lever=closest.clone().add(offset),worldLever=lever.clone().applyQuaternion(c.q),carVelocity=c.omega.clone().applyQuaternion(c.q).cross(worldLever).add(c.v),relative=b.spin.clone().cross(n.clone().multiplyScalar(-C.ballRadius)).add(b.v).sub(carVelocity),closing=relative.dot(n),relativeSpeed=Math.min(b.v.clone().sub(c.v).length(),46);
 const penetration=C.ballRadius-length;b.p.addScaledVector(n,penetration*C.carMass/(C.carMass+C.ballMass)+.001);c.p.addScaledVector(n,-penetration*C.ballMass/(C.carMass+C.ballMass));if(c.grounded&&c.normal.y>.9)c.p.y=Math.max(c.p.y,carSupport(c,UP));
 if(closing>=0)return false;
 const normalLocal=n.clone().applyQuaternion(inverse),cross=lever.clone().cross(normalLocal),invInertia=new V(12/(C.carMass*((2*half.y)**2+(2*half.z)**2)),12/(C.carMass*((2*half.x)**2+(2*half.z)**2)),12/(C.carMass*((2*half.x)**2+(2*half.y)**2))),angular=cross.clone().multiply(invInertia),impulse=-closing/(1/C.ballMass+1/C.carMass+cross.dot(angular));b.v.addScaledVector(n,impulse/C.ballMass);c.v.addScaledVector(n,-impulse/C.carMass);c.omega.addScaledVector(angular,-impulse);
 const tangent=relative.addScaledVector(n,-closing),tangentSpeed=tangent.length();if(tangentSpeed>1e-6){const deltaV=tangent.multiplyScalar(-Math.min(tangentSpeed/3.5,2*impulse/C.ballMass)/tangentSpeed);b.v.add(deltaV);b.spin.add(n.clone().multiplyScalar(-C.ballRadius).cross(deltaV).multiplyScalar(2.5/C.ballRadius**2));}
 if(c.extraHitCooldown<=1e-9){const forward=FWD.clone().applyQuaternion(c.q),direction=b.p.clone().sub(c.p);direction.y*=.35;direction.normalize().addScaledVector(forward,-direction.dot(forward)*.35).normalize();b.v.addScaledVector(direction,relativeSpeed*curve(BALL_HIT_CURVE,relativeSpeed));c.extraHitCooldown=2*C.step;}
 lengthClamp(b.v,C.ballMaxSpeed);lengthClamp(b.spin,C.ballMaxSpin);lengthClamp(c.omega,C.maxAngularSpeed);return true;
}
export function collideCars(a,b,emit=()=>{}){
 if(a.demoTime>0||b.demoTime>0||a.p.distanceToSquared(b.p)>9)return;const A=basis(a),B=basis(b),center=c=>c.p.clone().addScaledVector(UP.clone().applyQuaternion(c.q),C.hitboxOffsetUp).addScaledVector(FWD.clone().applyQuaternion(c.q),C.hitboxOffsetForward),delta=center(b).sub(center(a)),aa=[A.r,A.u,A.f],bb=[B.r,B.u,B.f],half=[C.hitboxHalfWidth,C.hitboxHalfHeight,C.hitboxHalfLength],project=(axes,n)=>axes.reduce((r,axis,i)=>r+Math.abs(axis.dot(n))*half[i],0),ground=a.grounded&&b.grounded&&a.normal.y>.8&&b.normal.y>.8;
 if(ground&&Math.abs(delta.y)>project(aa,UP)+project(bb,UP))return;const axes=ground?[A.r.clone().setY(0).normalize(),A.f.clone().setY(0).normalize(),B.r.clone().setY(0).normalize(),B.f.clone().setY(0).normalize()]:[...aa,...bb,...aa.flatMap(x=>bb.map(y=>x.clone().cross(y)))];let overlap=Infinity,normal;
 for(const axis of axes){if(axis.lengthSq()<1e-8)continue;axis.normalize();const depth=project(aa,axis)+project(bb,axis)-Math.abs(delta.dot(axis));if(depth<=0)return;if(depth<overlap){overlap=depth;normal=axis.clone().multiplyScalar(delta.dot(axis)<0?-1:1);}}
 if(!normal)return;const closing=a.v.clone().sub(b.v).dot(normal);if(a.team!==b.team&&a.v.clone().sub(b.v).dot(delta)>0){const impact=delta.clone().normalize(),demoA=a.supersonic&&A.f.dot(impact)>.707,demoB=b.supersonic&&B.f.dot(impact)<-.707;if(demoA||demoB){for(const [attacker,victim,hit]of [[a,b,demoA],[b,a,demoB]])if(hit){victim.demoTime=C.demoRespawn;victim.v.set(0,0,0);attacker.demos++;emit('demo',{id:victim.id,by:attacker.id,p:victim.p.toArray()});}return;}}
 a.p.addScaledVector(normal,-overlap/2);b.p.addScaledVector(normal,overlap/2);if(closing>0){const impulse=closing*(1+C.carRestitution)/2;a.v.addScaledVector(normal,-impulse);b.v.addScaledVector(normal,impulse);}
}
const drills=[{name:'Straight shot',car:[0,-32],ball:[0,.913,-20],v:[0,0,0]},{name:'Left angle',car:[-18,-30],ball:[-10,.913,-12],v:[0,0,0]},{name:'Right angle',car:[18,-30],ball:[10,.913,-12],v:[0,0,0]},{name:'First aerial',car:[0,-18],ball:[0,3.8,-7],v:[0,0,1.5]},{name:'Make the save',car:[0,-40],ball:[2,2,-8],v:[-1.2,1,-15]}];
export class Simulation{
 constructor(options={}){
  this.options={mode:'duel',duration:300,difficulty:'pro',unlimited:false,...options};this.prediction=new BallPrediction();this.botRoles=[null,null];this.touchHistory=[];this.events=[];this.cars=[makeCar(0,0)];
  if(this.options.mode==='duel')this.cars.push(makeCar(1,1,true));
  if(this.options.mode==='doubles')this.cars.push(makeCar(1,0,true),makeCar(2,1,true),makeCar(3,1,true));
  if(this.options.mode==='custom'&&Array.isArray(this.options.players)&&this.options.players.length)this.cars=this.options.players.slice(0,8).map(player=>makeCar(player.id,player.team));
  if(Array.isArray(this.options.humanIds))for(const car of this.cars)if(this.options.humanIds.includes(car.id))car.bot=false;
  this.ball={p:new V(0,C.ballRestHeight,0),v:new V(),spin:new V(),q:new Q()};this.pads=createPads();this.score=[0,0];this.remaining=this.options.duration;this.overtime=false;this.elapsed=0;this.phase='kickoff';this.phaseTime=3;this.clockStarted=false;this.lastTouch=-1;this.lastTouchTime=-99;this.replay=[];this.recordTime=0;this.trainingIndex=0;this.trainingHits=0;this.shotTime=15;
  if(this.options.mode==='training')this.loadDrill();else this.kickoff();
  if(this.options.mode==='free'){this.phase='playing';this.cars[0].boost=100;}
 }
 emit(type,detail={}){this.events.push({type,...detail});if(this.events.length>100)this.events.shift();}
 kickoff(){
  this.kickoffs=(this.kickoffs||0)+1;
  const spawns=[[0,-46.08,0],[-2.56,-38.4,0],[2.56,-38.4,0],[-20.48,-25.6,Math.PI/4],[20.48,-25.6,-Math.PI/4]],count=[0,0];for(const c of this.cars){const [x,z,yaw]=spawns[((this.kickoffs-1)+count[c.team]++)%spawns.length],sign=c.team?-1:1;spawnCar(c,x*sign,z*sign,yaw+(c.team?Math.PI:0));}
  this.botRoles=[null,null];this.touchHistory=[];this.goAt=undefined;this.prediction.invalidate();
  this.ball.p.set(0,C.ballRestHeight,0);this.ball.v.set(0,0,0);this.ball.spin.set(0,0,0);this.ball.q.identity();this.pads.forEach(p=>p.timer=0);this.phase='kickoff';this.phaseTime=3;this.clockStarted=false;this.lastTouch=-1;this.replay=[];
 }
 loadDrill(){
  const d=drills[this.trainingIndex%drills.length],c=this.cars[0];const yaw=Math.atan2(d.ball[0]-d.car[0],d.ball[2]-d.car[1]);spawnCar(c,...d.car,yaw);c.boost=100;this.ball.p.fromArray(d.ball);this.ball.p.y=Math.max(this.ball.p.y,C.ballRestHeight);this.prediction.invalidate();this.ball.v.fromArray(d.v);this.ball.spin.set(0,0,0);this.ball.q.identity();this.phase='playing';this.shotTime=15;this.drillName=d.name;this.lastTouch=-1;
 }
 resetPractice(){this.prediction.invalidate();if(!['free','training'].includes(this.options.mode)||this.phase!=='playing')return false;if(this.options.mode==='training')this.loadDrill();else{const c=this.cars[0];spawnCar(c,0,-25,0);c.boost=100;this.ball.p.set(0,C.ballRestHeight,-12);this.ball.v.set(0,0,0);this.ball.spin.set(0,0,0);}return true;}
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
  this.score[team]++;const scorer=this.cars.find(c=>c.id===this.lastTouch);if(scorer&&scorer.team===team){scorer.goals++;scorer.score+=C.goalPoints;const assist=[...this.touchHistory].reverse().find(t=>t.team===team&&t.id!==scorer.id&&this.elapsed-t.time<=C.assistWindow);if(assist){const teammate=this.cars.find(c=>c.id===assist.id);teammate.assists++;teammate.score+=C.assistPoints;}}
  if(this.options.mode==='training'&&team===0)this.trainingHits++;
  this.phase='goal';this.phaseTime=4;this.emit('goal',{team,scorer:scorer?.team===team?scorer.id:null,speed:this.ball.v.length()*3.6});
 }
 step(input={},dt=C.step,playerInputs=null){
  if(this.phase==='ended')return;this.elapsed+=dt;
  if(this.phase==='kickoff'){this.phaseTime-=dt;if(this.phaseTime<=0){this.phase='playing';this.goAt=this.elapsed;this.emit('go');}return;}
  if(this.phase==='goal'){this.phaseTime-=dt;if(this.phaseTime<=0)this.afterGoal();return;}
  for(const p of this.pads)p.timer=Math.max(0,p.timer-dt);
  for(const car of this.cars){const external=playerInputs?.get(car.id);stepCar(car,external??(car.bot?botInput(car,this):car.id===0?input:{}),dt,this.options.mode==='free'||this.options.mode==='training'||this.options.unlimited);
   if(car.demoTime===0)for(const pad of this.pads)if(pad.timer===0&&car.boost<99.95&&Math.abs(car.p.y-pad.p.y)<C.padHalfHeight&&Math.hypot(car.p.x-pad.p.x,car.p.z-pad.p.z)<(pad.big?C.bigPadRadius:C.smallPadRadius)){car.boost=pad.big?100:Math.min(100,car.boost+C.smallPadAmount);pad.timer=pad.big?C.bigPadCooldown:C.smallPadCooldown;this.emit('pad',{id:pad.id,car:car.id,big:pad.big});}
  }
  const hit=stepBall(this.ball,dt);if(hit.impact>3)this.emit('bounce',{speed:hit.impact,p:this.ball.p.toArray()});
  this.tick=(this.tick||0)+1;
  for(const car of (this.tick%2?this.cars:this.cars.slice().reverse())){if(collideCarBall(car,this.ball)){
   this.clockStarted=true;this.lastTouch=car.id;this.lastTouchTime=this.elapsed;this.prediction.invalidate();if(this.touchHistory.at(-1)?.id!==car.id)this.touchHistory.push({id:car.id,team:car.team,time:this.elapsed});else this.touchHistory.at(-1).time=this.elapsed;this.touchHistory=this.touchHistory.filter(t=>this.elapsed-t.time<=C.assistWindow);
   if(car.hitCooldown===0){car.touches++;car.hitCooldown=.15;this.emit('hit',{car:car.id,speed:this.ball.v.length(),p:this.ball.p.toArray()});}
  }}
  for(let a=0;a<this.cars.length;a++)for(let b=a+1;b<this.cars.length;b++)collideCars(this.cars[a],this.cars[b],(t,d)=>this.emit(t,d));
  for(const car of this.cars){lengthClamp(car.v,C.maxSpeed);lengthClamp(car.omega,C.maxAngularSpeed);}
  lengthClamp(this.ball.v,C.ballMaxSpeed);lengthClamp(this.ball.spin,C.ballMaxSpin);
  if(Math.abs(this.ball.p.z)>C.goalScorePlane+C.ballRadius&&Math.abs(this.ball.p.x)<C.goalWidth-C.ballRadius&&this.ball.p.y<C.goalHeight-C.ballRadius){this.goal(this.ball.p.z>0?0:1);return;}
  if(this.options.mode==='training'){
   this.shotTime-=dt;
   if(this.trainingIndex===4&&this.lastTouch===0&&this.ball.v.z>3){this.trainingHits++;this.cars[0].saves++;this.cars[0].score+=C.savePoints;this.emit('save');this.phase='goal';this.phaseTime=2;}
   else if(this.shotTime<=0){this.emit('miss');this.phase='goal';this.phaseTime=1.4;}
  }else if(this.options.mode!=='free'&&this.clockStarted){
   if(this.overtime)this.remaining+=dt;else this.remaining=Math.max(0,this.remaining-dt);
   if(!this.overtime&&this.remaining<=0&&this.ball.p.y<=C.ballRestHeight+.025){if(this.score[0]===this.score[1]){this.overtime=true;this.remaining=0;this.kickoff();this.emit('overtime');}else this.end();}
  }
  this.recordTime+=dt;if(this.recordTime>=.05){this.recordTime=0;this.replay.push(this.snapshot());if(this.replay.length>100)this.replay.shift();}
 }
 snapshot(){return {ball:{p:this.ball.p.toArray(),q:this.ball.q.toArray()},cars:this.cars.map(c=>({id:c.id,team:c.team,p:c.p.toArray(),q:c.q.toArray(),demo:c.demoTime>0,boosting:c.boosting,speed:c.v.dot(FWD.clone().applyQuaternion(c.q)),steer:c.renderSteer||0,grounded:c.grounded})),time:this.elapsed};}
 state(localId=0){const player=this.cars.find(car=>car.id===localId)||this.cars[0];return {phase:this.phase,mode:this.options.mode,score:[...this.score],remaining:this.remaining,overtime:this.overtime,phaseTime:this.phaseTime,elapsed:this.elapsed,boost:player.boost,speed:player.v.length()*3.6,grounded:player.grounded,supersonic:player.supersonic,trainingIndex:this.trainingIndex,trainingHits:this.trainingHits,drillName:this.drillName,shotTime:this.shotTime,players:this.cars.map(c=>({id:c.id,team:c.team,goals:c.goals,assists:c.assists,touches:c.touches,demos:c.demos,score:c.score}))};}
}
