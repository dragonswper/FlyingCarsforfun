const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function graphicsProfile(mode='auto',scale=1){
 if(mode==='high')return {tier:'high',scale:1.5,shadows:true,seats:true};
 if(mode==='low')return {tier:'low',scale:.75,shadows:false,seats:false};
 if(mode==='balanced')return {tier:'balanced',scale:1,shadows:false,seats:true};
 return {tier:scale<.9?'low':'balanced',scale,shadows:false,seats:scale>=.9};
}
export class AdaptiveGraphics{
 constructor(mode='auto'){this.setMode(mode);}
 setMode(mode){this.mode=mode;this.scale=1;this.resetTiming();return this.profile;}
 resetTiming(){this.samples=0;this.elapsed=0;this.slow=0;this.fast=0;this.warmup=1;}
 get profile(){return graphicsProfile(this.mode,this.scale);}
 observe(dt){
  if(this.mode!=='auto'||!Number.isFinite(dt)||dt<=0||dt>.5)return false;
  if(this.warmup>0){this.warmup-=dt;return false;}
  this.elapsed+=dt;this.samples++;if(this.elapsed<1)return false;
  const frame=this.elapsed/this.samples;this.elapsed=0;this.samples=0;
  if(frame>1/52){this.slow++;this.fast=0;}else if(frame<1/58){this.fast++;this.slow=0;}else{this.fast=0;this.slow=0;}
  let next=this.scale;if(this.slow>=2){next=clamp(this.scale-.15,.6,1);this.slow=0;}else if(this.fast>=8){next=clamp(this.scale+.1,.6,1);this.fast=0;}
  if(Math.abs(next-this.scale)<.001)return false;this.scale=Math.round(next*100)/100;return true;
 }
}
