const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function graphicsProfile(mode='auto',scale=1,mobile=false){
 if(mode==='mobile')return {tier:'low',scale:.7,shadows:false,seats:false,mobile:true};
 if(mode==='ultra')return {tier:'ultra',scale:1.5,shadows:true,seats:true};
 if(mode==='high')return {tier:'high',scale:1.5,shadows:true,seats:true};
 if(mode==='low')return {tier:'low',scale:.75,shadows:false,seats:false};
 if(mode==='balanced')return {tier:'balanced',scale:1,shadows:false,seats:true};
 return {tier:mobile||scale<.9?'low':'balanced',scale,shadows:false,seats:!mobile&&scale>=.9,...(mobile?{mobile:true}:{})};
}
export class AdaptiveGraphics{
 constructor(mode='auto',{mobile=false}={}){this.mobile=mobile;this.setMode(mode);}
 setMode(mode){this.mode=mode;this.scale=this.mobile?.75:1;this.resetTiming();return this.profile;}
 resetTiming(){this.samples=0;this.elapsed=0;this.slow=0;this.fast=0;this.warmup=1;}
 get profile(){return graphicsProfile(this.mode,this.scale,this.mobile);}
 observe(dt,targetFPS=60){
  if(this.mode!=='auto'||!Number.isFinite(dt)||dt<=0||dt>.5)return false;
  if(this.warmup>0){this.warmup-=dt;return false;}
  this.elapsed+=dt;this.samples++;if(this.elapsed<1)return false;
  const frame=this.elapsed/this.samples;this.elapsed=0;this.samples=0;
  const target=Number.isFinite(targetFPS)&&targetFPS>0?targetFPS:60;
  if(frame>1/(target*52/60)){this.slow++;this.fast=0;}else if(frame<1/(target*58/60)){this.fast++;this.slow=0;}else{this.fast=0;this.slow=0;}
  const minimum=this.mobile?.5:.6,maximum=this.mobile?.85:1;
  let next=this.scale;if(this.slow>=2){next=clamp(this.scale-.15,minimum,maximum);this.slow=0;}else if(this.fast>=8){next=clamp(this.scale+.1,minimum,maximum);this.fast=0;}
  if(Math.abs(next-this.scale)<.001)return false;this.scale=Math.round(next*100)/100;return true;
 }
}
// Physics/input still run on every animation frame. Only the expensive scene
// draw is paced: 30 Hz behind menus, up to 60 Hz for the mobile preview.
export class RenderPacer{
 constructor({mobile=false,limit=0}={}){this.mobile=mobile;this.limit=limit;this.reset();}
 reset(){this.last=null;this.next=null;this.interval=null;this.dt=1/60;}
 draw(now,idle=false){
  const target=this.mobile?Math.min(this.limit||60,60):this.limit;
  const interval=idle?1000/30:target>0?1000/target:0;
  if(interval!==this.interval){this.interval=interval;this.next=now;}
  if(interval&&this.next!==null&&now<this.next-.5)return false;
  this.dt=this.last===null?1/60:Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=now;
  // Carry the deadline forward so 90/144 Hz screens do not fall to 45/48 fps.
  this.next=interval?(now-this.next<interval?this.next+interval:now+interval):now;
  return true;
 }
}
