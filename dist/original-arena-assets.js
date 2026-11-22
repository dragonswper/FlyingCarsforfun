import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {ARENAS,ARENA_IDS,normalizeArena} from './arenas.js';
import {C} from './constants.js';
import {freezeStaticTransforms} from './rendering.js';

// Local, original Blender exports. Download only the venue selected for this
// match; importing the arena catalog never preloads all five binary models.
export const BLENDER_ARENA_IDS=Object.freeze(ARENA_IDS.filter(id=>ARENAS[id].model));
const templates=new Map(),pending=new Map();
export function validateOriginalArena(root,id){
 if(!BLENDER_ARENA_IDS.includes(id))throw Error('Unknown original arena.');
 const expected={Pitch_Center:[0,0,0],Pitch_Side_Left:[-C.halfWidth,0,0],Pitch_Side_Right:[C.halfWidth,0,0],Goal_Blue:[0,0,-C.halfLength],Goal_Orange:[0,0,C.halfLength]};
 root.updateMatrixWorld(true);
 for(const [name,position]of Object.entries(expected)){
  const marker=root.getObjectByName(name);
  if(!marker||marker.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(...position))>.005)throw Error('Original arena calibration is invalid: '+name);
 }
 let count=0;
 root.traverse(node=>{if(!node.isMesh)return;count++;if(node.userData.originalArtwork!==true||node.userData.venue!==id)throw Error('Original arena metadata is invalid.');});
 if(count<8||count>20)throw Error('Original arena geometry is incomplete.');
 return true;
}
export function loadOriginalArena(value,onProgress){
 const id=normalizeArena(value);
 if(!BLENDER_ARENA_IDS.includes(id))return Promise.reject(Error('Unknown original arena.'));
 if(!pending.has(id))pending.set(id,new GLTFLoader().loadAsync('./assets/maps/'+ARENAS[id].model,onProgress).then(gltf=>{
  validateOriginalArena(gltf.scene,id);templates.set(id,gltf.scene);return gltf.scene;
 }).catch(error=>{pending.delete(id);throw error;}));
 return pending.get(id);
}
export function makeOriginalArenaEnvironment(id,source=templates.get(id)){
 if(!source)throw Error('Prepare '+ARENAS[id]?.name+' before opening its field.');
 const root=source.clone(true);root.name='Original_Blender_'+id;root.userData.arena=id;
 freezeStaticTransforms(root);
 return {id,root,setQuality(){},update(){}};
}
