/* Runtime adapters for the supplied Fennec. Wheel motion is procedural, not an authored clip. */
import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
let fennecTemplate=null,fennecPromise;
export async function loadFennec(onProgress){
 if(!fennecPromise)fennecPromise=new GLTFLoader().loadAsync('./assets/models/fennec.glb',onProgress).then(gltf=>{validateFennecRig(gltf.scene);fennecTemplate=gltf.scene;return gltf.scene;});
 return fennecPromise;
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
 const root=new T.Group();root.name='Fennec_Vehicle';const visual=template.clone(true),materials=new Map();root.add(visual);
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
export function animateVehicle(model,{speed=0,steer=0,dt=0,grounded=true,throttle=0}={}){
 if(dt<=0)return;dt=Math.min(dt,.1);speed=Number.isFinite(speed)?speed:0;steer=T.MathUtils.clamp(steer,-1,1);
 const response=1-Math.exp(-12*dt),baseAngle=steer*.43/(1+Math.abs(speed)*.025),wheelBase=1.095;
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
