import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {normalizeArena} from './arenas.js';

// Original Blender artwork. One shared mesh and only the selected sky are
// fetched at startup; changing maps reuses the mesh and already-loaded textures.
export const SKY_STYLES=Object.freeze({
  champions:'Stadium dusk',snow:'Clear winter daylight',city:'Moonlit city',
  woods:'Golden woodland afternoon',harbour:'Coastal cloud banks',
  festival:'Winter aurora',yuletide:'Rose winter twilight',
  halloween:'Harvest moon',coast:'Apricot sunset',
  canyon:'High desert daylight',orbital:'Deep-space starfield'
});
export const SKY_RADIUS=300;
const assets=new Map(),pending=new Map();
let geometry,geometryPromise;
export function validateSkyGeometry(value){
  const p=value?.attributes.position,uv=value?.attributes.uv;
  if(!p||!uv||p.count!==uv.count||p.count<100||p.count>3000)throw Error('The sky dome geometry is invalid.');
  for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+uv.getX(i)+uv.getY(i))||Math.abs(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))-1)>.001)throw Error('The sky dome must be a unit sphere with finite UVs.');
  return true;
}
async function loadGeometry(onProgress){
  if(!geometryPromise)geometryPromise=new GLTFLoader().loadAsync('./assets/skies/sky-dome.glb',onProgress).then(gltf=>{
    const mesh=gltf.scene.getObjectByName('Original_Sky_Dome');validateSkyGeometry(mesh?.geometry);
    geometry=mesh.geometry;gltf.scene.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});return geometry;
  }).catch(error=>{geometryPromise=null;throw error;});
  return geometryPromise;
}
export function loadArenaSky(value,onProgress){
  const id=normalizeArena(value);
  if(!pending.has(id))pending.set(id,(async()=>{
    const textureRequest=new T.TextureLoader().loadAsync('./assets/skies/'+id+'.webp',onProgress);
    let mesh,texture;
    try{[mesh,texture]=await Promise.all([loadGeometry(onProgress),textureRequest]);}
    catch(error){textureRequest.then(value=>value.dispose(),()=>{});throw error;}
    texture.name='Original_Sky_'+id;texture.colorSpace=T.SRGBColorSpace;
    // Blender's exported glTF UVs already use the image's top-left convention.
    texture.flipY=false;texture.wrapS=T.RepeatWrapping;texture.wrapT=T.ClampToEdgeWrapping;
    texture.anisotropy=1;
    const source={geometry:mesh,texture};assets.set(id,source);return source;
  })().catch(error=>{pending.delete(id);throw error;}));
  return pending.get(id);
}
export class ArenaSkyDome{
  constructor(scene){
    this.root=new T.Group();this.root.name='Arena_Sky_Dome';this.root.userData.originalArtwork=true;
    this.scene=scene;scene.add(this.root);this.id=null;
  }
  select(value,source=assets.get(normalizeArena(value))){
    const id=normalizeArena(value);if(!source){this.root.visible=false;return false;}
    if(!this.mesh){
      this.material=new T.MeshBasicMaterial({map:source.texture,side:T.BackSide,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
      this.mesh=new T.Mesh(source.geometry,this.material);this.mesh.name='Blender_Sky_Dome';this.mesh.scale.setScalar(SKY_RADIUS);
      this.mesh.renderOrder=-1000;this.mesh.frustumCulled=false;this.mesh.castShadow=this.mesh.receiveShadow=false;this.root.add(this.mesh);
    }else this.material.map=source.texture;
    this.id=id;this.root.userData.arena=id;this.root.visible=true;return true;
  }
  update(camera){this.root.position.copy(camera.position);}
  diagnostics(){return {arena:this.id,style:SKY_STYLES[this.id],drawCalls:this.mesh&&this.root.visible?1:0,textureSize:1024};}
  dispose(){this.scene.remove(this.root);this.material?.dispose();}
}
export function disposeSkyAssets(){
  for(const source of assets.values())source.texture.dispose();assets.clear();pending.clear();
  geometry?.dispose();geometry=null;geometryPromise=null;
}
