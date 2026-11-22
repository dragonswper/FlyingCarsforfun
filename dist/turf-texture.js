import * as T from './vendor/three.module.js';

let detail;
function turfDetail(){
 if(detail)return detail;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const context=canvas.getContext('2d');context.fillStyle='#777777';context.fillRect(0,0,256,256);
 let seed=125;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<3200;i++){
  const x=random()*256,y=random()*256,length=2+random()*5;
  context.strokeStyle=i%3?'#969696':'#525252';context.lineWidth=.6+random()*.6;
  context.beginPath();context.moveTo(x,y);context.lineTo(x+.5,y-length);context.stroke();
 }
 detail=new T.CanvasTexture(canvas);detail.wrapS=detail.wrapT=T.RepeatWrapping;detail.repeat.set(100,125);detail.anisotropy=4;
 return detail;
}
export function configureTurfSurface(field,enabled){
 const material=field?.material;if(!material?.isMeshStandardMaterial)return;
 if(enabled&&!material.userData.naturalTurf){
  material.userData.naturalTurf=true;
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
   previous.call(this,shader,renderer);
   // The same fine turf grain shades the ground between the 3D leaves. A
   // tiled detail sample preserves the original field paint and mowing bands.
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_BUMPMAP\n diffuseColor.rgb*=mix(.74,1.19,texture2D(bumpMap,vBumpMapUv).r);\n#endif');
  };
  material.customProgramCacheKey=()=> 'natural-turf-ground-v1';
  material.needsUpdate=true;
 }
 const map=enabled?turfDetail():null;
 if(material.bumpMap!==map){material.bumpMap=map;material.bumpScale=.012;material.needsUpdate=true;}
}
export function disposeTurfDetail(){detail?.dispose();detail=null;}
