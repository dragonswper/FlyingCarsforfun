import * as T from './vendor/three.module.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function renderingPreferences(value={}){
 value||={};const number=(key,fallback,min,max)=>Number.isFinite(Number(value[key]))?clamp(Number(value[key]),min,max):fallback;
 return {resolutionScale:number('resolutionScale',100,50,150),exposure:number('exposure',1.18,.7,1.6),
  shadows:['preset','off','soft','ultra'].includes(value.shadows)?value.shadows:'preset',
  lighting:['preset','basic','enhanced'].includes(value.lighting)?value.lighting:'preset',
  grass:['preset','off','low','high'].includes(value.grass)?value.grass:'preset'};
}
export const RENDER_FIELDS=Object.freeze([
 {key:'resolutionScale',label:'Render Scale',min:50,max:150,step:5,unit:'%'},
 {key:'exposure',label:'Exposure',min:.7,max:1.6,step:.01,unit:''}
]);
export function resolveRendering(profile,preferences){
 const prefs=renderingPreferences(preferences),cinematic=profile.tier==='ultra';
 return {shadowSize:prefs.shadows==='off'?0:prefs.shadows==='ultra'?4096:prefs.shadows==='soft'?2048:cinematic?4096:profile.shadows?1024:0,
  enhanced:prefs.lighting==='enhanced'||prefs.lighting==='preset'&&cinematic,
  grassCount:prefs.grass==='high'?90000:prefs.grass==='low'?24000:prefs.grass==='off'?0:cinematic?60000:0,
  scale:profile.scale*prefs.resolutionScale/100,exposure:prefs.exposure};
}
// A small generated HDR lighting environment gives painted metal, windows,
// ornaments and other PBR surfaces real reflections without an external HDRI.
export class EnvironmentLighting{
 constructor(renderer){this.renderer=renderer;this.cache=new Map();}
 get(id,theme){
  if(this.cache.has(id))return this.cache.get(id).texture;
  const scene=new T.Scene(),geometry=new T.SphereGeometry(80,24,12),positions=geometry.attributes.position,colors=new Float32Array(positions.count*3),sky=new T.Color(theme.ambient),ground=new T.Color(theme.ground),color=new T.Color();
  for(let i=0;i<positions.count;i++){const t=clamp((positions.getY(i)/80+.35)/1.35,0,1);color.copy(ground).lerp(sky,t).multiplyScalar(1.2);color.toArray(colors,i*3);}
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));
  const material=new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide}),sphere=new T.Mesh(geometry,material);scene.add(sphere);
  const panel=new T.Mesh(new T.PlaneGeometry(16,24),new T.MeshBasicMaterial({color:new T.Color(theme.sun).multiplyScalar(4),side:T.DoubleSide}));panel.position.set(-25,38,-18);panel.lookAt(0,0,0);scene.add(panel);
  this.generator||=new T.PMREMGenerator(this.renderer);const target=this.generator.fromScene(scene,.04,.1,200);this.cache.set(id,target);
  geometry.dispose();material.dispose();panel.geometry.dispose();panel.material.dispose();return target.texture;
 }
 dispose(){for(const target of this.cache.values())target.dispose();this.cache.clear();this.generator?.dispose();}
}
