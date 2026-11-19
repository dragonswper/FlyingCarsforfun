import {C} from './physics.js';
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {freezeStaticTransforms} from './rendering.js';
let template, pending;
export function validateHarbour(root) {
 const expected={Pitch_Center:[0,0,0],Pitch_Side_Left:[-C.halfWidth,0,0],Pitch_Side_Right:[C.halfWidth,0,0],Goal_Blue:[0,0,-C.halfLength],Goal_Orange:[0,0,C.halfLength]};
 root.updateMatrixWorld(true);
 for(const [name,p] of Object.entries(expected)) {
  const marker=root.getObjectByName(name);
  if(!marker||marker.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(...p))>.005)throw Error('Harbourworks calibration is invalid: '+name);
 }
 let count=0;root.traverse(n=>{if(n.isMesh)count++;});
 if(count<8||count>20)throw Error('Harbourworks geometry is incomplete.');
 return true;
}
export function loadHarbour(onProgress) {
 if(!pending)pending=new GLTFLoader().loadAsync('./assets/maps/harbourworks.glb',onProgress).then(gltf=>{
  validateHarbour(gltf.scene);template=gltf.scene;return template;
 }).catch(error=>{pending=null;throw error;});
 return pending;
}
export function makeHarbourEnvironment(source=template) {
 if(!source)throw Error('Prepare Harbourworks before opening its field.');
 const root=source.clone(true);root.name='Harbourworks';
 const ground=new T.Mesh(new T.BoxGeometry(450,1,410),new T.MeshStandardMaterial({color:'#3a4544',roughness:.95}));
 ground.position.y=-2.5;ground.name='Scenery_Ground';root.add(ground);
 freezeStaticTransforms(root);
 return {id:'harbour',root,setQuality(){},update(){}};
}
