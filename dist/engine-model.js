import {C,clamp} from './constants.js';
export const ENGINE_STYLES=Object.freeze(['sport','muscle','electric']);
export const normalizeEngineStyle=value=>ENGINE_STYLES.includes(value)?value:'sport';
export function audioPreferences(value={}){
  const volume=(key,fallback)=>Number.isFinite(Number(value[key]))?clamp(Number(value[key]),0,100):fallback;
  return {engineStyle:normalizeEngineStyle(value.engineStyle),engineVolume:volume('engineVolume',85),effectsVolume:volume('effectsVolume',80)};
}
// An audio-only transmission: it never changes acceleration or game physics.
export class EngineModel {
  constructor(){this.gear=0;this.rpm=900;this.load=0;this.shift=0;}
  update({speed=0,throttle=0,boosting=false,grounded=true}={},dt=1/60){
    dt=clamp(Number(dt)||0,0,.1);speed=clamp(Math.abs(Number(speed)||0),0,C.maxSpeed);
    const demand=clamp(Math.abs(Number(throttle)||0)+(boosting?.25:0),0,1),edges=[4.5,9,13.5,18.5];
    this.shift=Math.max(0,this.shift-dt);
    if(grounded){
      if(this.gear<4&&speed>edges[this.gear]&&this.shift===0){this.gear++;this.shift=.12;}
      else if(this.gear>0&&speed<edges[this.gear-1]-1.8&&this.shift===0){this.gear--;this.shift=.1;}
    }
    const bottom=this.gear?edges[this.gear-1]-1.8:0,top=edges[this.gear]??C.maxSpeed+1,
      road=clamp((speed-bottom)/(top-bottom),0,1),target=grounded?1000+road*4700+demand*450:1100+demand*4900,
      shifted=this.shift>0?target*.78:target;
    this.rpm+=(clamp(shifted,800,6500)-this.rpm)*(1-Math.exp(-(target>this.rpm?10:6)*dt));
    this.load+=(demand-this.load)*(1-Math.exp(-14*dt));
    return this;
  }
}
