import {Vector3} from './vendor/three.module.js';
import {C,clamp} from './constants.js';
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const turn=(from,to,limit)=>from+clamp(wrap(to-from),-limit,limit);

// Ball tracking never uses the car's roll/pitch or a manual orbit offset.
// Keep the last heading when the ball crosses directly overhead/under the car.
export class ChaseCamera{
 constructor(){this.desired=new Vector3();this.target=new Vector3();this.forward=new Vector3();this.reset();}
 reset(){this.ballYaw=0;this.carYaw=0;this.orbitYaw=0;this.orbitPitch=0;this.stickYaw=0;this.stickPitch=0;this.stickTargetYaw=0;this.stickTargetPitch=0;this.initialized=false;}
 stick(x,y,ballCam){this.stickTargetYaw=ballCam?0:-clamp(Number(x)||0,-1,1)*Math.PI*.75;this.stickTargetPitch=ballCam?0:clamp(Number(y)||0,-1,1)*.6;}
 orbit(yaw,pitch,ballCam){if(ballCam||!Number.isFinite(yaw)||!Number.isFinite(pitch))return false;this.orbitYaw=wrap(this.orbitYaw+yaw);this.orbitPitch=clamp(this.orbitPitch+pitch,-.35,.9);return true;}
 sample(position,rotation,ball,settings,ballCam,dt){
  const seconds=clamp(Number(dt)||0,0,.1),dx=ball.x-position.x,dz=ball.z-position.z,ballHeading=Math.hypot(dx,dz)>.85?Math.atan2(dx,dz):this.ballYaw;
  this.forward.set(0,0,1).applyQuaternion(rotation);const carHeading=Math.hypot(this.forward.x,this.forward.z)>.35?Math.atan2(this.forward.x,this.forward.z):this.carYaw;
  if(!this.initialized){this.ballYaw=ballHeading;this.carYaw=carHeading;this.initialized=true;}
  this.ballYaw=turn(this.ballYaw,ballHeading,4*seconds);this.carYaw=turn(this.carYaw,carHeading,4*seconds);
  const spring=1-Math.exp(-16*seconds);this.stickYaw+=(this.stickTargetYaw-this.stickYaw)*spring;this.stickPitch+=(this.stickTargetPitch-this.stickPitch)*spring;
  const yaw=ballCam?this.ballYaw:this.carYaw+this.orbitYaw+this.stickYaw,pitch=ballCam?0:clamp(this.orbitPitch+this.stickPitch,-.35,.9),distance=settings.distance/100,height=settings.height/100;
  this.forward.set(Math.sin(yaw),0,Math.cos(yaw));
  this.desired.copy(position).addScaledVector(this.forward,-distance*Math.cos(pitch));this.desired.y+=height+distance*(ballCam?-Math.tan(settings.angle*Math.PI/180):Math.sin(pitch));
  if(ballCam)this.target.copy(ball);
  else{this.target.copy(position).addScaledVector(this.forward,3);this.target.y+=height+Math.tan(settings.angle*Math.PI/180)*(distance+3);}
  this.desired.x=clamp(this.desired.x,-C.halfWidth+.4,C.halfWidth-.4);this.desired.z=clamp(this.desired.z,-C.halfLength-C.goalDepth+.4,C.halfLength+C.goalDepth-.4);this.desired.y=clamp(this.desired.y,.4,C.height-.4);
  return this;
 }
}
