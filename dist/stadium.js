/* Adapted user-supplied Champions Field architecture, paired with the calibrated pitch. */
import * as T from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { C } from './physics.js';
export function validateStadium(root){
 if(!root.getObjectByName('Champions_Field'))throw new Error('Champions Field architecture is missing.');
 const expected={Pitch_Center:[0,0,0],Pitch_Side_Left:[-C.halfWidth,0,0],Pitch_Side_Right:[C.halfWidth,0,0],Pitch_Ceiling:[0,C.height,0]};
 for(const [team,sign]of [['Blue',-1],['Orange',1]])for(const [side,x]of [['Left',-C.goalWidth],['Right',C.goalWidth]]){
  expected['Goal_'+team+'_'+side]=[x,0,sign*C.halfLength];expected['Goal_'+team+'_'+side+'_Top']=[x,C.goalHeight,sign*C.halfLength];
 }
 root.updateMatrixWorld(true);const position=new T.Vector3();
 for(const [name,point]of Object.entries(expected)){const node=root.getObjectByName(name);if(!node||node.getWorldPosition(position).distanceTo(new T.Vector3(...point))>.005)throw new Error('Stadium calibration is invalid: '+name);}
 let parts=0;root.traverse(o=>{if(o.isMesh)parts++;});if(parts<10)throw new Error('Stadium geometry is incomplete.');return true;
}
export async function loadChampionsField(onProgress){
 const gltf=await new GLTFLoader().loadAsync('./assets/models/champions-field.glb',onProgress),root=gltf.scene;validateStadium(root);
 root.traverse(o=>{if(!o.isMesh)return;o.castShadow=false;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats)if(m.map)m.map.anisotropy=4;});
 return root;
}
export function setStadiumQuality(root,level){root?.traverse(o=>{if(o.userData.detail==='seats')o.visible=level!=='low';});}
