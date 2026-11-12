/* Runtime adapters for the supplied vehicles. Wheel motion is procedural. */
import * as T from './vendor/three.module.js';
import {C,curve,STEERING_CURVE} from './constants.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import {CUSTOM_BODY_FILES} from './bodies.js';
let fennecTemplate=null,fennecPromise;
let bottledTemplate=null,bottledPromise;
const customTemplates=new Map(),customPromises=new Map();
export function validateCustomRig(root){
 if(!root.getObjectByName('Custom_Body'))throw new Error('The custom vehicle body is missing.');
 let wheels=0;root.traverse(node=>{if(!node.name.startsWith('Steer_'))return;const spin=root.getObjectByName('Spin_'+node.name.slice(6));if(!spin||spin.parent!==node||!Number.isFinite(node.userData.rollingRadius)||node.userData.rollingRadius<=0)throw new Error('The custom vehicle wheel rig is invalid.');wheels++;});
 if(wheels<2)throw new Error('The custom vehicle wheels are missing.');return true;
}
export function loadCustomBody(id,onProgress){
 if(!Object.hasOwn(CUSTOM_BODY_FILES,id))return Promise.reject(new Error('Unknown vehicle.'));
 if(!customPromises.has(id))customPromises.set(id,new GLTFLoader().loadAsync('./assets/models/'+CUSTOM_BODY_FILES[id],onProgress).then(gltf=>{validateCustomRig(gltf.scene);customTemplates.set(id,gltf.scene);return gltf.scene;}).catch(error=>{customPromises.delete(id);throw error;}));return customPromises.get(id);
}
export async function loadFennec(onProgress){
 if(!fennecPromise)fennecPromise=new GLTFLoader().loadAsync('./assets/models/fennec.glb',onProgress).then(gltf=>{validateFennecRig(gltf.scene);fennecTemplate=gltf.scene;return gltf.scene;});
 return fennecPromise;
}
export function loadBottled(onProgress){
 if(!bottledPromise)bottledPromise=new GLTFLoader().loadAsync('./assets/models/bottled.glb',onProgress).then(gltf=>{validateBottledRig(gltf.scene);bottledTemplate=gltf.scene;return gltf.scene;}).catch(error=>{bottledPromise=null;throw error;});
 return bottledPromise;
}
export function validateBottledRig(root){
 if(!root.getObjectByName('Bottled_Body'))throw new Error('The bottled-car body is missing.');
 for(const name of ['FL','FR','RL','RR'])for(const prefix of ['Steer_','Spin_'])if(!root.getObjectByName(prefix+name))throw new Error(`Bottled-car wheel rig is missing ${prefix+name}.`);
 return true;
}
export function validateFennecRig(root){
 if(!root.getObjectByName('Fennec_Body'))throw new Error('Fennec body is missing.');
 for(const name of ['FL','FR','RL','RR'])for(const prefix of ['Steer_','Spin_','Wheel_'])if(!root.getObjectByName(prefix+name))throw new Error(`Fennec wheel rig is missing ${prefix+name}.`);
 return true;
}
function boostFlame(root){
 const flame=new T.Group();flame.name='Fennec_Boost';root.add(flame);
 for(const x of [-.23,.23]){
  const outer=new T.Mesh(new T.ConeGeometry(.105,1,8),new T.MeshBasicMaterial({color:'#4cc7ff',transparent:true,opacity:.75}));outer.position.set(x,-.04,-1.36);outer.rotation.x=-Math.PI/2;flame.add(outer);
  const inner=new T.Mesh(new T.ConeGeometry(.06,.65,8),new T.MeshBasicMaterial({color:'#e5faff'}));inner.position.set(x,-.04,-1.2);inner.rotation.x=-Math.PI/2;flame.add(inner);
 }flame.visible=false;return flame;
}
export function makeFennecModel(color='#299bff',template=fennecTemplate){
 if(!template)throw new Error('The Fennec model has not loaded.');validateFennecRig(template);
 const root=new T.Group();root.name='Fennec_Vehicle';const visual=template.clone(true),materials=new Map();root.add(visual);visual.position.y=.24-C.carHeight;
 visual.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.userData.sharedGeometry=true;mesh.castShadow=true;mesh.receiveShadow=true;
  const clone=m=>{if(!materials.has(m)){const copy=m.clone();materials.set(m,copy);for(const value of Object.values(copy))if(value?.isTexture){value.anisotropy=4;}}return materials.get(m);};
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
 });
 const paint=[...materials.values()].find(m=>m.name==='Fennec_Paint');if(!paint)throw new Error('Fennec paint material is missing.');paint.color.set(color);
 const chassis=new T.Group();chassis.name='Fennec_Suspension';const body=visual.getObjectByName('Fennec_Body');body.parent.add(chassis);chassis.add(body);
 const wheels=['FL','FR','RL','RR'].map(name=>{const pivot=visual.getObjectByName('Steer_'+name),rolling=visual.getObjectByName('Spin_'+name);return {name,pivot,rolling,front:name[0]==='F',radius:pivot.userData.rollingRadius||(name[0]==='F'?.15980912:.1722),restY:pivot.position.y};});
 return {kind:'fennec',root,visual,paint,chassis,wheels,flame:boostFlame(root),travel:0,lastSpeed:0,setColor(value){paint.color.set(value);}};
}
export function makeBottledModel(color='#299bff',template=bottledTemplate){
 if(!template)throw new Error('The bottled-car model has not loaded.');validateBottledRig(template);
 const root=new T.Group();root.name='Bottled_Vehicle';const visual=template.clone(true),materials=new Map();visual.position.y=-C.carHeight;root.add(visual);
 visual.traverse(mesh=>{
  if(!mesh.isMesh)return;mesh.userData.sharedGeometry=true;mesh.castShadow=true;mesh.receiveShadow=true;
  const clone=material=>{if(!materials.has(material)){const copy=material.clone();for(const value of Object.values(copy))if(value?.isTexture)value.anisotropy=4;if(copy.transparent)copy.forceSinglePass=true;
   if(['BOTTLE_INSIDE','BOTTLE_OUTSIDE'].includes(copy.name)){copy.depthWrite=false;copy.side=T.FrontSide;if('transmission'in copy)copy.transmission=0;mesh.castShadow=false;}
   materials.set(material,copy);}return materials.get(material);};mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
 });
 const paint=[...materials.values()].find(material=>material.name==='Bottled_Paint');if(!paint)throw new Error('The bottled-car paint material is missing.');paint.color.set(color);
 const chassis=new T.Group();chassis.name='Bottled_Suspension';const body=visual.getObjectByName('Bottled_Body');body.parent.add(chassis);chassis.add(body);
 const wheels=['FL','FR','RL','RR'].map(name=>{const pivot=visual.getObjectByName('Steer_'+name);return {name,pivot,rolling:visual.getObjectByName('Spin_'+name),front:name[0]==='F',radius:pivot.userData.rollingRadius,restY:pivot.position.y};});
 const flame=boostFlame(root);flame.name='Bottled_Boost';flame.position.set(0,.25,.18);
 const wheelBase=wheels[0].pivot.position.z-wheels[2].pivot.position.z;
 return {kind:'bottled',root,visual,paint,chassis,wheels,wheelBase,flame,travel:0,lastSpeed:0,setColor(value){paint.color.set(value);}};
}
export function makeCustomModel(id,color='#299bff',template=customTemplates.get(id)){
 if(!template)throw new Error('The selected vehicle has not loaded.');validateCustomRig(template);
 const root=new T.Group();root.name=id+'_Vehicle';const visual=template.clone(true),materials=new Map();root.add(visual);visual.position.y=-C.carHeight;
 visual.traverse(mesh=>{if(!mesh.isMesh)return;mesh.userData.sharedGeometry=true;mesh.castShadow=true;mesh.receiveShadow=true;
  const copy=material=>{if(!materials.has(material)){const value=material.clone();for(const texture of Object.values(value))if(texture?.isTexture)texture.anisotropy=4;if(value.transparent){value.forceSinglePass=true;value.depthWrite=false;}materials.set(material,value);}return materials.get(material);};mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);if((Array.isArray(mesh.material)?mesh.material:[mesh.material]).every(material=>material.transparent))mesh.castShadow=false;
 });
 const paint=[...materials.values()].find(material=>material.name==='Custom_Paint')||null;if(paint)paint.color.set(color);
 const chassis=new T.Group();chassis.name='Custom_Suspension';const body=visual.getObjectByName('Custom_Body');body.parent.add(chassis);chassis.add(body);
 const wheels=[];visual.traverse(node=>{if(node.name.startsWith('Steer_')){const name=node.name.slice(6);wheels.push({name,pivot:node,rolling:visual.getObjectByName('Spin_'+name),radius:node.userData.rollingRadius,front:node.userData.front===true||name[0]==='F',restY:node.position.y});}});
 const front=wheels.filter(w=>w.front),rear=wheels.filter(w=>!w.front),mean=list=>list.reduce((sum,w)=>sum+w.pivot.position.z,0)/list.length,wheelBase=front.length&&rear.length?Math.abs(mean(front)-mean(rear)):1;
 const flame=boostFlame(root);flame.name=id+'_Boost';if(id==='c17')flame.position.y=.15;
 return {kind:id,root,visual,paint,chassis,wheels,wheelBase,flame,travel:0,lastSpeed:0,setColor(value){paint?.color.set(value);}};
}
export function animateVehicle(model,{speed=0,steer=0,dt=0,grounded=true,throttle=0}={}){
 if(dt<=0)return;dt=Math.min(dt,.1);speed=Number.isFinite(speed)?speed:0;steer=T.MathUtils.clamp(steer,-1,1);
 const response=1-Math.exp(-12*dt),baseAngle=steer*curve(STEERING_CURVE,Math.abs(speed))*Math.PI/180,wheelBase=model.wheelBase||1.095;
 for(const wheel of model.wheels){
  const spinSpeed=grounded?speed:Math.abs(throttle)>.05?throttle*Math.max(6,Math.abs(speed)):speed;
  wheel.rolling.rotation.x=(wheel.rolling.rotation.x+spinSpeed*dt/(wheel.radius||.235))%(Math.PI*2);
  let angle=0;
  if(wheel.front&&Math.abs(baseAngle)>.001){const radius=wheelBase/Math.tan(Math.abs(baseAngle)),inner=radius-Math.sign(baseAngle)*wheel.pivot.position.x;angle=Math.sign(baseAngle)*Math.atan(wheelBase/Math.max(.5,inner));}
  wheel.pivot.rotation.y+=(angle-wheel.pivot.rotation.y)*response;
 }
 if(model.chassis){
  const acceleration=(speed-(model.lastSpeed||0))/dt;model.travel=(model.travel||0)+speed*dt;
  const pitch=grounded?T.MathUtils.clamp(-acceleration*.0018,-.045,.045):0,roll=grounded?T.MathUtils.clamp(steer*Math.abs(speed)*.0025,-.05,.05):0;
  model.chassis.rotation.x+=(pitch-model.chassis.rotation.x)*response;model.chassis.rotation.z+=(roll-model.chassis.rotation.z)*response;
  model.chassis.position.y=grounded?Math.sin(model.travel*7)*.003*Math.min(1,Math.abs(speed)/5):0;
 }
 model.lastSpeed=speed;
}
export function disposeVehicle(model){
 const geometries=new Set(),materials=new Set();model.root.traverse(o=>{if(o.geometry&&!o.userData.sharedGeometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
export function disposeFennecTemplate(){
 if(!fennecTemplate)return;const geometries=new Set(),materials=new Set(),textures=new Set();fennecTemplate.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());fennecTemplate=null;fennecPromise=null;
}
export function disposeBottledTemplate(){
 if(!bottledTemplate)return;const geometries=new Set(),materials=new Set(),textures=new Set();bottledTemplate.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());bottledTemplate=null;bottledPromise=null;
}
export function disposeCustomTemplates(){
 const geometries=new Set(),materials=new Set(),textures=new Set();for(const root of customTemplates.values())root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());customTemplates.clear();customPromises.clear();
}
