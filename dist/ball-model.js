import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {C} from './constants.js';
let template,pending;
export function loadRocketBall(onProgress){
 if(!pending)pending=new GLTFLoader().loadAsync('./assets/models/rocket-ball.glb',onProgress).then(gltf=>{template=gltf.scene;let meshes=0;template.traverse(mesh=>{if(mesh.isMesh)meshes++;});if(!meshes)throw new Error('The supplied ball has no geometry.');return template;}).catch(error=>{pending=null;throw error;});return pending;
}
export function makeRocketBall(source=template){
 if(!source)throw new Error('The supplied ball has not loaded.');const root=source.clone(true);root.name='Rocket_League_Ball';root.scale.setScalar(C.ballVisualRadius);
 root.traverse(mesh=>{if(!mesh.isMesh)return;mesh.castShadow=true;mesh.receiveShadow=true;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])for(const value of Object.values(material))if(value?.isTexture)value.anisotropy=4;});return root;
}
