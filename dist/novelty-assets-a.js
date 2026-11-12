/* Visual adapters for the three supplied novelty models. Physics stay shared. */
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {C} from './constants.js';
import {animateVehicle,disposeVehicle} from './vehicles.js';

export const NOVELTY_A_NAMES=Object.freeze({randy:'RANDY MARSH',ridiculous:'RIDICULOUS VEHICLE',viking:'VIKING BATTLE VEHICLE'});
export const NOVELTY_A_FILES=Object.freeze({randy:'randy.glb',ridiculous:'ridiculous.glb',viking:'viking.glb'});
const templates=new Map(),promises=new Map();
export const isNoveltyABody=id=>Object.hasOwn(NOVELTY_A_FILES,id);

function validate(id,scene,animations){
 if(!scene.getObjectByName('Custom_Body'))throw new Error('The novelty model body is missing.');
 if(id==='viking'){
  for(const name of ['FL','FR','RL','RR']){
   const pivot=scene.getObjectByName('Steer_'+name),spin=scene.getObjectByName('Spin_'+name);
   if(!pivot||!spin||spin.parent!==pivot||!(pivot.userData.rollingRadius>0))throw new Error('The Viking wheel rig is invalid.');
  }
 }else{
  let skinned=false;scene.traverse(node=>{if(node.isSkinnedMesh)skinned=true;});
  if(!skinned||!animations.length)throw new Error('The novelty animation rig is missing.');
 }
}

export function loadNoveltyABody(id,onProgress){
 if(!isNoveltyABody(id))return Promise.reject(new Error('Unknown novelty vehicle.'));
 if(!promises.has(id))promises.set(id,new GLTFLoader().loadAsync('./assets/'+NOVELTY_A_FILES[id],onProgress).then(gltf=>{
  validate(id,gltf.scene,gltf.animations);gltf.scene.animations=gltf.animations;
  templates.set(id,{scene:gltf.scene,animations:gltf.animations});return gltf.scene;
 }).catch(error=>{promises.delete(id);throw error;}));
 return promises.get(id);
}

// Object3D.clone alone keeps a SkinnedMesh bound to the original bones. Pair
// the two trees, then rebind every cloned skeleton to its own cloned bones.
function cloneRig(source){
 const copy=source.clone(true),nodes=new Map(),skeletons=new Map();
 function pair(a,b){nodes.set(a,b);a.children.forEach((child,i)=>pair(child,b.children[i]));}
 pair(source,copy);
 source.traverse(node=>{
  if(!node.isSkinnedMesh)return;
  const mesh=nodes.get(node);
  if(!skeletons.has(node.skeleton)){
   const skeleton=node.skeleton.clone();skeleton.bones=node.skeleton.bones.map(bone=>nodes.get(bone));
   if(skeleton.bones.some(bone=>!bone))throw new Error('The novelty skeleton has an external bone.');
   skeletons.set(node.skeleton,skeleton);
  }
  const skeleton=skeletons.get(node.skeleton);
  mesh.bind(skeleton,node.bindMatrix.clone());
 });
 return copy;
}

function boostFlame(root){
 const flame=new T.Group();flame.name='Novelty_Boost';root.add(flame);
 for(const x of [-.23,.23]){
  const outer=new T.Mesh(new T.ConeGeometry(.105,1,8),new T.MeshBasicMaterial({color:'#4cc7ff',transparent:true,opacity:.75}));
  outer.position.set(x,-.04,-1.36);outer.rotation.x=-Math.PI/2;flame.add(outer);
  const inner=new T.Mesh(new T.ConeGeometry(.06,.65,8),new T.MeshBasicMaterial({color:'#e5faff'}));
  inner.position.set(x,-.04,-1.2);inner.rotation.x=-Math.PI/2;flame.add(inner);
 }
 flame.visible=false;return flame;
}

export function makeNoveltyAModel(id,color='#299bff',template=templates.get(id)){
 if(!isNoveltyABody(id)||!template)throw new Error('The novelty vehicle has not loaded.');
 const scene=template.isObject3D?template:template.scene,clips=template.animations||scene.animations||[];
 validate(id,scene,clips);
 const root=new T.Group();root.name=id+'_Vehicle';
 const visual=cloneRig(scene),materials=new Map();visual.position.y=-C.carHeight;root.add(visual);
 visual.traverse(mesh=>{
  if(!mesh.isMesh)return;mesh.userData.sharedGeometry=true;mesh.castShadow=true;mesh.receiveShadow=true;
  const clone=material=>{
   if(!materials.has(material)){
    const copy=material.clone();for(const texture of Object.values(copy))if(texture?.isTexture)texture.anisotropy=4;
    if(copy.transparent){copy.forceSinglePass=true;copy.depthWrite=false;}materials.set(material,copy);
   }
   return materials.get(material);
  };
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
  if((Array.isArray(mesh.material)?mesh.material:[mesh.material]).every(material=>material.transparent))mesh.castShadow=false;
 });
 const body=visual.getObjectByName('Custom_Body'),chassis=new T.Group();chassis.name='Novelty_Suspension';body.parent.add(chassis);chassis.add(body);
 const wheels=[];
 visual.traverse(node=>{if(node.name.startsWith('Steer_')){const name=node.name.slice(6);wheels.push({name,pivot:node,rolling:visual.getObjectByName('Spin_'+name),radius:node.userData.rollingRadius,front:node.userData.front===true,restY:node.position.y});}});
 const front=wheels.filter(w=>w.front),rear=wheels.filter(w=>!w.front),mean=list=>list.reduce((sum,w)=>sum+w.pivot.position.z,0)/list.length;
 const wheelBase=front.length&&rear.length?Math.abs(mean(front)-mean(rear)):1;
 const mixer=clips.length?new T.AnimationMixer(visual):null,action=mixer?mixer.clipAction(clips[0]):null;
 if(action){action.play();mixer.update(0);}
 return {kind:id,root,visual,paint:null,chassis,wheels,wheelBase,flame:boostFlame(root),travel:0,lastSpeed:0,
  noveltyA:true,mixer,action,animationRate:0,setColor(){}};
}

export function animateNoveltyAModel(model,state={}){
 if(!model?.noveltyA)return false;
 animateVehicle(model,state);
 if(model.mixer){
  const dt=Math.min(.1,Math.max(0,Number.isFinite(state.dt)?state.dt:0));
  const speed=Number.isFinite(state.speed)?Math.abs(state.speed):0;
  const running=state.grounded!==false?Math.min(2.6,speed/2.8):0;
  model.animationRate+=(running-model.animationRate)*(1-Math.exp(-10*dt));
  if(speed<.05&&model.animationRate<.015){model.animationRate=0;model.action.time=0;}
  model.action.timeScale=model.animationRate;model.mixer.update(dt);
 }
 return true;
}

export function disposeNoveltyAModel(model){
 if(!model?.noveltyA)return false;
 if(model.mixer){model.mixer.stopAllAction();model.mixer.uncacheRoot(model.visual);}
 const skeletons=new Set();model.root.traverse(node=>{if(node.isSkinnedMesh)skeletons.add(node.skeleton);});
 skeletons.forEach(skeleton=>skeleton.dispose());disposeVehicle(model);return true;
}

export function disposeNoveltyATemplates(){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 for(const {scene} of templates.values())scene.traverse(node=>{
  if(node.geometry)geometries.add(node.geometry);if(node.isSkinnedMesh)skeletons.add(node.skeleton);
  for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
 });
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());templates.clear();promises.clear();
}
