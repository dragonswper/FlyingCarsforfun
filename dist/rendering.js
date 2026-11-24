import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Fixed pitch objects share a few materials instead of submitting every post separately.
export function batchStaticPitch(root,field){
 const groups=new Map(),oldMaterials=new Set();
 for(const object of [...root.children]){
  if((!object.isMesh&&!object.isLineSegments)||object.isInstancedMesh||object===field||Array.isArray(object.material))continue;
  if(object.material.transparent&&(!object.material.isMeshBasicMaterial&&!object.material.isLineBasicMaterial||object.material.map))continue;
  const m=object.material,key=JSON.stringify([m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.side,m.transparent,m.opacity,m.depthWrite,m.forceSinglePass]);
  if(!groups.has(key))groups.set(key,{material:m,objects:[]});groups.get(key).objects.push(object);
 }
 for(const {material,objects} of groups.values()){
  const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));return g;});
  const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)throw new Error('Pitch geometry could not be batched.');
  const mesh=material.isLineBasicMaterial?new T.LineSegments(geometry,material):new T.Mesh(geometry,material);mesh.name='Pitch_Batch_'+material.color.getHexString();mesh.receiveShadow=true;root.add(mesh);
  for(const object of objects){root.remove(object);object.geometry.dispose();oldMaterials.add(object.material);}
 }
 const active=new Set();root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)active.add(m);});for(const m of oldMaterials)if(!active.has(m))m.dispose();
}

export function freezeStaticTransforms(root){
 root.updateMatrixWorld(true);root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});
}

export {BoostPadView} from './animation/field.js';

// One bounded, reusable particle buffer avoids allocating meshes during a hit or goal.
export class ParticlePool{
 constructor(parent,capacity=128){
  this.capacity=capacity;this.count=0;this.life=new Float32Array(capacity);this.maxLife=new Float32Array(capacity);this.positions=new Float32Array(capacity*3);this.velocities=new Float32Array(capacity*3);this.colors=new Float32Array(capacity*3);
  this.matrix=new T.Matrix4();this.position=new T.Vector3();this.scale=new T.Vector3();this.rotation=new T.Quaternion();this.color=new T.Color();
  this.mesh=new T.InstancedMesh(new T.SphereGeometry(.07,4,3),new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),capacity);this.mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3);this.mesh.instanceColor.setUsage(T.DynamicDrawUsage);this.mesh.name='Pooled_Impact_Particles';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);parent.add(this.mesh);
 }
 spawn(position,color,count){
  this.color.set(color);for(let i=0;i<count&&this.count<this.capacity;i++){
   const n=this.count++,j=n*3;this.positions.set(position,j);this.velocities.set([Math.sin(i*2.4)*(2+i%5),1+i%6,Math.cos(i*2.4)*(2+i%5)],j);this.colors.set(this.color.toArray(),j);this.life[n]=this.maxLife[n]=.7+i%5*.1;
  }
 }
 update(dt){
  let i=0;while(i<this.count){this.life[i]-=dt;if(this.life[i]<=0){const last=--this.count;if(i!==last){this.life[i]=this.life[last];this.maxLife[i]=this.maxLife[last];for(const buffer of [this.positions,this.velocities,this.colors])buffer.copyWithin(i*3,last*3,last*3+3);}continue;}
   const j=i*3;for(let a=0;a<3;a++)this.positions[j+a]+=this.velocities[j+a]*dt;this.velocities[j+1]-=5*dt;this.position.fromArray(this.positions,j);this.scale.setScalar(Math.min(1,this.life[i]/.2));this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(i,this.matrix);this.color.fromArray(this.colors,j);this.mesh.setColorAt(i,this.color);i++;
  }
  this.mesh.count=this.count;if(this.count){this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor.needsUpdate=true;}
 }
}
