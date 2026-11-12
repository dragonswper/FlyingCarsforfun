/* Metres, seconds, native mass ratio; +Y up and +Z toward the orange goal.
   Source values and engine-margin differences: docs/core-research.md. */
import {CORNER_PROFILE} from './field-profile.js';
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function curve(points,x){for(let i=1;i<points.length;i++)if(x<=points[i][0]){const [a,b]=points[i-1],[c,d]=points[i];return b+(d-b)*clamp((x-a)/(c-a),0,1);}return points.at(-1)[1];}
export const C=Object.freeze({
 halfWidth:40.96,halfLength:51.2,height:20.48,cornerX:25.6,cornerZ:35.84,ramp:2.56,
 goalWidth:8.92755,goalHeight:6.42775,goalDepth:8.8,goalScorePlane:51.2425,
 ballRadius:.9125,ballVisualRadius:.95,ballRestHeight:.9315,ballMargin:.019,ballMass:30,ballMaxSpeed:60,ballMaxSpin:6,ballDrag:.03,ballFriction:.35,ballRestitution:.6,
 carMass:180,carHeight:.17,maxSpeed:23,maxAngularSpeed:5.5,carRestitution:.1,
 hitboxHalfWidth:.421,hitboxHalfHeight:.1808,hitboxHalfLength:.59005,hitboxOffsetUp:.2075,hitboxOffsetForward:.1388,
 gravity:6.5,boostAccel:2975/300,boostAirAccel:3175/300,boostBurn:100/3,boostSpawn:100/3,boostMinTime:.1,
 jump:875/300,holdAccel:4375/300,jumpMinTime:.025,jumpMaxTime:.2,jumpMinAccelScale:.62,doubleJumpWindow:1.25,
 airThrottleAccel:2/3,airTorqueScale:2*Math.PI/65536*1000,dodgeThreshold:.5,flipDuration:.65,flipImpulse:5,
 brakeAccel:35,coastAccel:5.25,supersonicStart:22,supersonicMaintain:21,supersonicGrace:1,demoRespawn:3,
 smallPadRadius:1.44,bigPadRadius:2.08,padHalfHeight:.95,smallPadAmount:12,bigPadAmount:100,smallPadCooldown:4,bigPadCooldown:10,
 goalPoints:100,assistPoints:50,savePoints:50,assistWindow:5,step:1/120
});
export const THROTTLE_CURVE=Object.freeze([[0,16],[14,1.6],[14.1,0]]);
export const CURVATURE_CURVE=Object.freeze([[0,.69],[5,.398],[10,.235],[15,.1375],[17.5,.11],[23,.088]]);
export const STEERING_CURVE=Object.freeze([[0,35],[5,20],[10,11],[15,6.25],[17.5,5],[30,2]]);
export const BALL_HIT_CURVE=Object.freeze([[0,.65],[5,.65],[14,.6],[23,.55],[46,.3]]);
export const CORNER_PLANES=Object.freeze(CORNER_PROFILE.slice(1).map(([x,z],i)=>{const [ax,az]=CORNER_PROFILE[i],dx=x-ax,dz=z-az,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;return {nx,nz,boundary:nx*ax+nz*az};}).filter((p,i,a)=>!i||Math.abs(p.nx-a[i-1].nx)>1e-5||Math.abs(p.nz-a[i-1].nz)>1e-5));
export function arenaOutline(){const reverse=[...CORNER_PROFILE].reverse();return [...reverse.map(([x,z])=>[-x,-z]),...CORNER_PROFILE.map(([x,z])=>[x,-z]),...reverse.map(([x,z])=>[x,z]),...CORNER_PROFILE.map(([x,z])=>[-x,z])];}
export function clampToPitch(point,margin=0){
 point.x=clamp(point.x,-C.halfWidth+margin,C.halfWidth-margin);point.z=clamp(point.z,-C.halfLength+margin,C.halfLength-margin);
 for(let iteration=0;iteration<2;iteration++)for(const p of CORNER_PLANES){const distance=p.nx*Math.abs(point.x)+p.nz*Math.abs(point.z)-p.boundary;if(distance<margin){point.x+=p.nx*Math.sign(point.x||1)*(margin-distance);point.z+=p.nz*Math.sign(point.z||1)*(margin-distance);}}return point;
}
