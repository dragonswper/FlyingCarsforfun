import {Vector3 as V} from './vendor/three.module.js';
import {C,clamp,CORNER_PLANES} from './constants.js';
const UP=new V(0,1,0),FWD=new V(0,0,1),RIGHT=new V(1,0,0);
export function arenaPlanes(p){
 const planes=[{n:new V(-Math.sign(p.x||1),0,0),d:C.halfWidth-Math.abs(p.x)}],opening=Math.abs(p.x)<C.goalWidth+.2&&p.y<C.goalHeight+.2;
 if(!opening)planes.push({n:new V(0,0,-Math.sign(p.z||1)),d:C.halfLength-Math.abs(p.z)});
 else if(Math.abs(p.z)>C.halfLength){planes.push({n:new V(-Math.sign(p.x||1),0,0),d:C.goalWidth-Math.abs(p.x)},{n:new V(0,0,-Math.sign(p.z)),d:C.halfLength+C.goalDepth-Math.abs(p.z)});}
 if(Math.abs(p.x)>C.cornerX&&Math.abs(p.z)>C.cornerZ)for(const plane of CORNER_PLANES){const d=plane.nx*Math.abs(p.x)+plane.nz*Math.abs(p.z)-plane.boundary;if(d<C.ramp+2)planes.push({n:new V(plane.nx*Math.sign(p.x),0,plane.nz*Math.sign(p.z)),d});}return planes;
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
 const constrain=(normal,gap)=>{const retained=body.grounded&&body.noContact===0&&up.dot(normal)>.55&&body.v.dot(normal)<.1,skin=retained?.06:CAR_CONTACT_SKIN;if(gap>skin)return;if(gap<0||retained){body.p.addScaledVector(normal,-gap);impact=Math.max(impact,bounce(body,normal,0));}contacts.push({normal,gap});};
 for(let iteration=0;iteration<3;iteration++){
  contacts=[];const origin=body.p.clone();
  for(const {n,d:initialDistance}of arenaPlanes(body.p).sort((a,b)=>a.d-b.d)){
   const d=initialDistance+n.x*(body.p.x-origin.x)+n.z*(body.p.z-origin.z);
   if(d<C.ramp&&body.p.y<C.ramp&&Math.abs(body.p.z)<C.halfLength+.1){
    const horizontal=C.ramp-d,vertical=C.ramp-body.p.y,length=Math.hypot(horizontal,vertical);
    if(length>1e-8){const normal=n.clone().multiplyScalar(horizontal/length).addScaledVector(UP,vertical/length);constrain(normal,C.ramp-length-carSupport(body,normal));}
   }else constrain(n,d-carSupport(body,n));
  }
  constrain(UP.clone(),body.p.y-carSupport(body,UP));
  const inNet=Math.abs(body.p.z)>C.halfLength+.15&&Math.abs(body.p.x)<C.goalWidth+C.carHeight,ceiling=inNet?C.goalHeight:C.height,down=new V(0,-1,0);
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
 let contact=null,impact=0;const origin=body.p.clone();for(const {n,d:initialDistance}of arenaPlanes(body.p).sort((a,b)=>a.d-b.d)){const d=initialDistance+n.x*(body.p.x-origin.x)+n.z*(body.p.z-origin.z);
  if(d<C.ramp&&body.p.y<C.ramp&&Math.abs(body.p.z)<C.halfLength+.1){const horizontal=C.ramp-d,vertical=C.ramp-body.p.y,length=Math.hypot(horizontal,vertical),normal=n.clone().multiplyScalar(horizontal/length).addScaledVector(UP,vertical/length),support=car?carSupport(body,normal):radius;if(length>C.ramp-support){body.p.addScaledVector(normal,length-(C.ramp-support));impact=Math.max(impact,bounce(body,normal,restitution));contact=normal;}}
  else{const support=car?carSupport(body,n):radius;if(d<support){body.p.addScaledVector(n,support-d);impact=Math.max(impact,bounce(body,n,restitution));contact=n;}}
 }
 const floor=car?carSupport(body,UP):radius;if(body.p.y<floor){body.p.y=floor;impact=Math.max(impact,bounce(body,UP,restitution));contact=UP.clone();if(!car&&Math.abs(body.v.y)<.38)body.v.y=0;}
 const inNet=Math.abs(body.p.z)>C.halfLength+.15&&Math.abs(body.p.x)<C.goalWidth+radius,ceiling=inNet?C.goalHeight:C.height,down=new V(0,-1,0),top=car?carSupport(body,down):radius;
 if(body.p.y>ceiling-top){body.p.y=ceiling-top;impact=Math.max(impact,bounce(body,down,restitution));contact=down;}
 for(const sign of [-1,1])if(Math.abs(body.p.z-sign*C.halfLength)<(car?1.2:radius+.45)){for(const x of [-C.goalWidth,C.goalWidth])capsule(body,new V(x,0,sign*C.halfLength),new V(x,C.goalHeight,sign*C.halfLength),radius+.12,restitution,car);capsule(body,new V(-C.goalWidth,C.goalHeight,sign*C.halfLength),new V(C.goalWidth,C.goalHeight,sign*C.halfLength),radius+.12,restitution,car);}
 return {contact,impact};
}
