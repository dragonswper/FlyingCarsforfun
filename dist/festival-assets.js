import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {freezeStaticTransforms} from './rendering.js';
let templates=null,pending;
export function loadFestivalAssets(onProgress){
 if(!pending){
  const loader=new GLTFLoader();
  pending=Promise.all([
   ...['village','tree','lights','mountains'].map(id=>loader.loadAsync('./assets/arenas/festival/festival-'+id+'.glb',event=>onProgress?.({asset:'festival-'+id,loaded:event.loaded,total:event.total}))),
   new T.TextureLoader().loadAsync('./assets/arenas/festival/snowflake.webp')
  ]).then(([village,tree,lights,mountains,snow])=>{templates={village:village.scene,tree:tree.scene,lights:lights.scene,mountains:mountains.scene,snow};return templates;}).catch(error=>{pending=null;throw error;});
 }return pending;
}
export function makeFestivalEnvironment(source=templates){
 if(!source)throw new Error('Prepare Frostvale Festival assets before opening the field.');
 const root=new T.Group();root.name='Frostvale_Festival';
 const ground=new T.Mesh(new T.BoxGeometry(460,1,430),new T.MeshStandardMaterial({color:'#cbddea',roughness:.95}));ground.position.y=-.68;ground.receiveShadow=true;root.add(ground);
 function place(kind,name,x,z,yaw=0,scale=1){
  const scene=source[kind].clone(true);scene.name=name;scene.position.set(x,-.14,z);scene.rotation.y=yaw;scene.scale.setScalar(scale);
  scene.traverse(node=>{if(!node.isMesh)return;node.receiveShadow=true;node.userData.festivalAsset=kind;for(const material of Array.isArray(node.material)?node.material:[node.material]){for(const value of Object.values(material))if(value?.isTexture)value.anisotropy=4;}});
  root.add(scene);return scene;
 }
 // The village is a display diorama: bury its ten-metre rock plinth so the
 // snowy streets meet the surrounding snow instead of hovering over the goal.
 place('village','Supplied_Christmas_Village',0,88,Math.PI).position.y=-9.9;
 place('mountains','Supplied_Snowy_Mountain_Road',0,-151,0);
 place('mountains','Supplied_Snowy_Mountain_Road_West',-133,0,Math.PI/2);
 place('tree','Supplied_Festival_Tree_Blue',-29,-78,Math.PI*.2);
 place('tree','Supplied_Festival_Tree_Orange',31,78,-Math.PI*.2,.85);
 for(const x of [-53,53])for(const z of [-29,29])place('lights','Supplied_Christmas_Lights_'+x+'_'+z,x,z,x>0?Math.PI:0);
 const positions=new Float32Array(640*3);let seed=202612;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<640;i++)positions.set([(random()-.5)*108,1+random()*28,(random()-.5)*130],i*3);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 const material=new T.PointsMaterial({map:source.snow,color:'#e9f5ff',size:.14,transparent:true,alphaTest:.1,opacity:.8,depthWrite:false}),time={value:0};
 material.onBeforeCompile=shader=>{shader.uniforms.festivalTime=time;shader.vertexShader='uniform float festivalTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y=1.0+mod(position.y-festivalTime*0.75,28.0);\ntransformed.x+=sin(festivalTime*0.3+position.z)*0.6;');};
 material.customProgramCacheKey=()=> 'festival-supplied-snow-v1';
 const snow=new T.Points(geometry,material);snow.name='Supplied_Falling_Snow';snow.frustumCulled=false;root.add(snow);
 freezeStaticTransforms(root);
 return {id:'festival',root,setQuality(tier){geometry.setDrawRange(0,tier==='low'?128:tier==='high'||tier==='ultra'?640:320);},update(value){time.value=value;}};
}
