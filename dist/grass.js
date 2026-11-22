import * as T from './vendor/three.module.js';
import {C,CORNER_PLANES} from './constants.js';

// One bounded GPU draw around the player. Blades stay 4.5–7.5 cm high and wrap only
// beyond the faded edge of the patch; they do not move the ball or car contacts.
export class ShortGrass{
 constructor(scene,capacity=90000){
  this.capacity=Math.max(0,Math.min(90000,Math.floor(Number(capacity)||0)));
  const geometry=this.geometry=new T.InstancedBufferGeometry();
  // Three tapered sections form a curved leaf instead of crossed flat spikes.
  geometry.setAttribute('position',new T.Float32BufferAttribute([-1,0,0,1,0,0,-.7,.4,0,.7,.4,0,-.3,.78,0,.3,.78,0,0,1,0],3));
  geometry.setIndex([0,1,2,1,3,2,2,3,4,3,5,4,4,5,6]);
  geometry.computeVertexNormals();
  geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,.15,.4,.85,.4,.35,.78,.65,.78,.5,1],2));
  geometry.instanceCount=0;
  const center=this.center=new T.Vector2(),material=this.material=new T.MeshStandardMaterial({color:'#ffffff',roughness:.95,metalness:0,side:T.DoubleSide});
  const time=this.time={value:0};
  this.bufferCapacity=0;
  const cornerMask=CORNER_PLANES.map(p=>`if(abs(bladeWorld.x)>${C.cornerX.toFixed(3)}&&abs(bladeWorld.y)>${C.cornerZ.toFixed(3)})inside=min(inside,(${p.nx.toFixed(7)})*abs(bladeWorld.x)+(${p.nz.toFixed(7)})*abs(bladeWorld.y)-(${p.boundary.toFixed(7)})-${(C.ramp+.15).toFixed(3)});`).join('\n');
  material.onBeforeCompile=shader=>{
   shader.uniforms.grassCenter={value:center};shader.uniforms.grassTime=time;
   shader.vertexShader='attribute vec2 grassOffset;\nattribute vec3 grassVariation;\nuniform vec2 grassCenter;\nuniform float grassTime;\nvarying vec3 vGrassData;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nfloat normalAngle=grassVariation.z;\nobjectNormal=normalize(vec3(-sin(normalAngle)*.35,.94,cos(normalAngle)*.35));');
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vec2 bladeWorld=mod(grassOffset-grassCenter+12.0,24.0)-12.0+grassCenter;
    float t=position.y;
    float mown=mod(floor((bladeWorld.y+${C.halfLength.toFixed(3)})/5.12),2.0)*3.14159265;
    float angle=mown+grassVariation.z*.18,c=cos(angle),s=sin(angle);
    float wind=sin(grassTime*1.3+bladeWorld.x*.23+bladeWorld.y*.18+grassVariation.z)*.004;
    vec2 leaf=vec2(position.x*(.0035+.003*grassVariation.y),(.009+wind)*t*t);
    transformed.xz=mat2(c,-s,s,c)*leaf+bladeWorld;
    transformed.y=.008+position.y*grassVariation.x;
    float inside=min(${(C.halfWidth-C.ramp-.15).toFixed(3)}-abs(bladeWorld.x),${(C.halfLength-C.ramp-.15).toFixed(3)}-abs(bladeWorld.y));
    ${cornerMask}
    if(inside<0.0)transformed.y=-.2;
    #ifdef USE_MAP
      vMapUv=vec2((bladeWorld.x+${C.halfWidth.toFixed(3)})/${(2*C.halfWidth).toFixed(3)},(${C.halfLength.toFixed(3)}-bladeWorld.y)/${(2*C.halfLength).toFixed(3)});
    #endif
    vGrassData=vec3(1.0-smoothstep(8.5,11.5,distance(bladeWorld,grassCenter)),grassVariation.y,t);`);
   shader.fragmentShader='varying vec3 vGrassData;\n'+shader.fragmentShader;
   // Blades approximate a soft turf canopy. Keep upward lighting on both
   // faces; flipping the back-face normals made half the blades black.
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(vGrassData.y>vGrassData.x)discard;\ndiffuseColor.rgb*=mix(.72,1.10,vGrassData.z)*mix(.94,1.08,vGrassData.y);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vGrassData.z*.025;');
  };
  material.customProgramCacheKey=()=> 'mown-turf-blades-v2';
  this.mesh=new T.Mesh(geometry,material);this.mesh.name='Short_Field_Grass';this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;this.mesh.visible=false;scene.add(this.mesh);
 }
 ensureBuffers(count){
  if(count<=this.bufferCapacity)return;
  // Release old GPU bindings before growing attributes. The deterministic
  // prefix stays identical, so changing quality never scatters the turf.
  if(this.bufferCapacity)this.geometry.dispose();
  const offsets=new Float32Array(count*2),variation=new Float32Array(count*3);let seed=1202026;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){offsets.set([(random()-.5)*24,(random()-.5)*24],i*2);variation.set([.045+random()*.03,random(),random()*Math.PI*2],i*3);}
  this.geometry.setAttribute('grassOffset',new T.InstancedBufferAttribute(offsets,2));this.geometry.setAttribute('grassVariation',new T.InstancedBufferAttribute(variation,3));this.bufferCapacity=count;
 }
 configure(count,field){
  const map=field?.material?.map||null;if(this.material.map!==map){this.material.map=map;this.material.needsUpdate=true;}
  const next=Math.max(0,Math.min(this.capacity,Math.floor(Number(count)||0)));
  this.mesh.visible=next>0&&!!map;if(this.mesh.visible)this.ensureBuffers(next);
  this.geometry.instanceCount=this.mesh.visible?next:0;
 }
 update(position,time=0){this.center.set(position.x,position.z);this.time.value=time;}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
