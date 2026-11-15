import {Vector3 as V,Quaternion as Q} from './vendor/three.module.js';
import {C,clamp,CORNER_PLANES} from './constants.js';
const UP=new V(0,1,0),FWD=new V(0,0,1),RIGHT=new V(1,0,0);
export function arenaPlanes(p){
 const planes=[{n:new V(-Math.sign(p.x||1),0,0),d:C.halfWidth-Math.abs(p.x)}],opening=Math.abs(p.x)<C.goalWidth+.2&&p.y<C.goalHeight+.2;
 if(!opening)planes.push({n:new V(0,0,-Math.sign(p.z||1)),d:C.halfLength-Math.abs(p.z)});
 else if(Math.abs(p.z)>C.halfLength){planes.push({n:new V(-Math.sign(p.x||1),0,0),d:C.goalWidth-Math.abs(p.x),goal:true},{n:new V(0,0,-Math.sign(p.z)),d:C.halfLength+C.goalDepth-Math.abs(p.z),goal:true});}
 if(Math.abs(p.x)>C.cornerX&&Math.abs(p.z)>C.cornerZ)for(const plane of CORNER_PLANES){const d=plane.nx*Math.abs(p.x)+plane.nz*Math.abs(p.z)-plane.boundary;if(d<C.ramp+2)planes.push({n:new V(plane.nx*Math.sign(p.x),0,plane.nz*Math.sign(p.z)),d});}return planes;
}
export function arenaCeiling(p){return Math.abs(p.z)>C.halfLength+.15&&Math.abs(p.x)<C.goalWidth+.2?C.goalHeight:C.height;}
// Signed curved contact for lower and upper quarter-pipes. Goal interiors use
// a smaller radius; the authoritative simulation and camera share this shape.
export function roundedSurface(p,n,d,goal=false){
 const lower=goal?C.goalRamp:C.ramp,upper=goal?C.goalRamp:C.ceilingRamp,ceiling=arenaCeiling(p);
 let horizontal,vertical,sign,radius;
 if(d<lower&&p.y<lower&&(goal||Math.abs(p.z)<C.halfLength+.1)){radius=lower;horizontal=radius-d;vertical=radius-p.y;sign=1;}
 else if(d<upper&&p.y>ceiling-upper){radius=upper;horizontal=radius-d;vertical=p.y-(ceiling-radius);sign=-1;}
 else return null;
 const length=Math.hypot(horizontal,vertical);if(length<1e-8)return null;
 return {normal:n.clone().multiplyScalar(horizontal/length).addScaledVector(UP,sign*vertical/length),gap:radius-length,upper:sign<0};
}
export function carSupport(car,normal){
 const right=RIGHT.clone().applyQuaternion(car.q),up=UP.clone().applyQuaternion(car.q),forward=FWD.clone().applyQuaternion(car.q);
 return Math.max(C.carHeight,Math.abs(normal.dot(right))*C.hitboxHalfWidth+Math.abs(normal.dot(up))*C.hitboxHalfHeight+Math.abs(normal.dot(forward))*C.hitboxHalfLength-normal.dot(up)*C.hitboxOffsetUp-normal.dot(forward)*C.hitboxOffsetForward);
}
function bounce(body,n,restitution){const vn=body.v.dot(n);if(vn<0)body.v.addScaledVector(n,-(1+restitution)*vn);return Math.max(0,-vn);}
function capsule(body,a,b,radius,restitution,car){const segment=b.clone().sub(a),t=clamp(body.p.clone().sub(a).dot(segment)/segment.lengthSq(),0,1),near=a.clone().addScaledVector(segment,t),delta=body.p.clone().sub(near),length=delta.length();if(length<1e-7)return;delta.divideScalar(length);const support=car?carSupport(body,delta)+.12:radius;if(length<support){body.p.addScaledVector(delta,support-length+.001);bounce(body,delta,restitution);}}
// Cars need persistent, orientation-aware contacts. A tiny separation after a
// solve must not alternate between driving and aerial controls on every tick.
const CAR_CONTACT_SKIN=.015;
function collideCarArena(body){
 let contacts=[],impact=0;const up=UP.clone().applyQuaternion(body.q);
 const constrain=(normal,gap)=>{const retained=body.grounded&&body.noContact===0&&up.dot(normal)>.55,skin=retained?.06:CAR_CONTACT_SKIN;if(gap>skin)return;if(gap<0||retained){body.p.addScaledVector(normal,-gap);impact=Math.max(impact,bounce(body,normal,0));}contacts.push({normal,gap});};
 for(let iteration=0;iteration<3;iteration++){
  contacts=[];const origin=body.p.clone();
  for(const {n,d:initialDistance,goal}of arenaPlanes(body.p).sort((a,b)=>a.d-b.d)){
   const d=initialDistance+n.x*(body.p.x-origin.x)+n.z*(body.p.z-origin.z);
   const rounded=roundedSurface(body.p,n,d,goal);
   if(rounded){
    if(rounded.upper&&body.grounded&&body.noContact===0&&!body.flipActive&&up.dot(rounded.normal)>.55&&Math.abs(rounded.gap-carSupport(body,rounded.normal))<.25){
     // Parallel-transport rolling wheels around a concave transition. Merely
     // clipping the bumper against the flat roof killed upward speed before
     // the chassis could complete the wall-to-roof turn.
     const turn=new Q().setFromUnitVectors(up,rounded.normal);
     body.q.premultiply(turn).normalize();body.v.applyQuaternion(turn);up.copy(rounded.normal);
    }
    constrain(rounded.normal,rounded.gap-carSupport(body,rounded.normal));
   }
   else constrain(n,d-carSupport(body,n));
  }
  constrain(UP.clone(),body.p.y-carSupport(body,UP));
  const ceiling=arenaCeiling(body.p),down=new V(0,-1,0);
  constrain(down,ceiling-body.p.y-carSupport(body,down));
  const post=(a,b)=>{const segment=b.clone().sub(a),t=clamp(body.p.clone().sub(a).dot(segment)/segment.lengthSq(),0,1),delta=body.p.clone().sub(a.addScaledVector(segment,t)),length=delta.length();if(length>1e-7){delta.divideScalar(length);constrain(delta,length-carSupport(body,delta)-.12);}};
  for(const sign of [-1,1])if(Math.abs(body.p.z-sign*C.halfLength)<1.2){for(const x of [-C.goalWidth,C.goalWidth])post(new V(x,0,sign*C.halfLength),new V(x,C.goalHeight,sign*C.halfLength));post(new V(-C.goalWidth,C.goalHeight,sign*C.halfLength),new V(C.goalWidth,C.goalHeight,sign*C.halfLength));}
 }
 const score=normal=>up.dot(normal)+(body.grounded?.08*body.normal.dot(normal):0);
 let contact=null,best=-Infinity;for(const {normal}of contacts){const value=score(normal);if(value>best){best=value;contact=normal;}}
 return {contact,contacts,impact};
}
export function collideArena(body,radius,restitution=C.ballRestitution,car=false){
 if(car)return collideCarArena(body);
 let contact=null,impact=0;const origin=body.p.clone();for(const {n,d:initialDistance,goal}of arenaPlanes(body.p).sort((a,b)=>a.d-b.d)){const d=initialDistance+n.x*(body.p.x-origin.x)+n.z*(body.p.z-origin.z),rounded=roundedSurface(body.p,n,d,goal);
  if(rounded){if(rounded.gap<radius){body.p.addScaledVector(rounded.normal,radius-rounded.gap);impact=Math.max(impact,bounce(body,rounded.normal,restitution));contact=rounded.normal;}}
  else{const support=car?carSupport(body,n):radius;if(d<support){body.p.addScaledVector(n,support-d);impact=Math.max(impact,bounce(body,n,restitution));contact=n;}}
 }
 const floor=car?carSupport(body,UP):radius;if(body.p.y<floor){body.p.y=floor;impact=Math.max(impact,bounce(body,UP,restitution));contact=UP.clone();if(!car&&Math.abs(body.v.y)<.38)body.v.y=0;}
 const ceiling=arenaCeiling(body.p),down=new V(0,-1,0),top=car?carSupport(body,down):radius;
 if(body.p.y>ceiling-top){body.p.y=ceiling-top;impact=Math.max(impact,bounce(body,down,restitution));contact=down;}
 for(const sign of [-1,1])if(Math.abs(body.p.z-sign*C.halfLength)<(car?1.2:radius+.45)){for(const x of [-C.goalWidth,C.goalWidth])capsule(body,new V(x,0,sign*C.halfLength),new V(x,C.goalHeight,sign*C.halfLength),radius+.12,restitution,car);capsule(body,new V(-C.goalWidth,C.goalHeight,sign*C.halfLength),new V(C.goalWidth,C.goalHeight,sign*C.halfLength),radius+.12,restitution,car);}
 return {contact,impact};
}
