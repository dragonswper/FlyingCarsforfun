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

export class BoostPadView{
 constructor(parent,pads){
  this.pads=pads;this.matrix=new T.Matrix4();this.position=new T.Vector3();this.scale=new T.Vector3();this.rotation=new T.Quaternion();this.color=new T.Color();this.active=new Uint8Array(pads.length);this.active.fill(2);
  const baseMat=new T.MeshStandardMaterial({color:'#101d2c',roughness:.7,metalness:.18});
  this.bases=new T.InstancedMesh(new T.CylinderGeometry(1.25,1.3,.08,12),baseMat,pads.length);
  this.rings=new T.InstancedMesh(new T.TorusGeometry(1,.09,5,24),new T.MeshBasicMaterial({color:'#ffd17a',toneMapped:false}),pads.length);
  this.orbs=new T.InstancedMesh(new T.SphereGeometry(1,12,8),new T.MeshStandardMaterial({color:'#ffd17a',emissive:'#ffb13f',emissiveIntensity:1.2,roughness:.3,metalness:.2}),pads.length);
  for(const [name,mesh]of [['Bases',this.bases],['Rings',this.rings],['Orbs',this.orbs]]){mesh.name='Boost_Pad_'+name;mesh.frustumCulled=false;parent.add(mesh);}
  this.orbs.instanceMatrix.setUsage(T.DynamicDrawUsage);this.rings.instanceMatrix.setUsage(T.StaticDrawUsage);
  for(let i=0;i<pads.length;i++){
   const p=pads[i],r=p.big?.78:.36;this.position.set(p.p.x,.05,p.p.z);this.scale.set(r,1,r);this.rotation.identity();this.matrix.compose(this.position,this.rotation,this.scale);this.bases.setMatrixAt(i,this.matrix);
   this.position.set(p.p.x,.13,p.p.z);this.rotation.setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);this.scale.setScalar(r);this.matrix.compose(this.position,this.rotation,this.scale);this.rings.setMatrixAt(i,this.matrix);
  }
  this.bases.instanceMatrix.needsUpdate=true;this.rings.instanceMatrix.needsUpdate=true;this.update(pads,0);
 }
 update(pads,time){
  let colorsChanged=false;for(let i=0;i<pads.length;i++){
   const p=pads[i],active=p.timer<=0?1:0;if(this.active[i]!==active){this.active[i]=active;this.color.setScalar(active?1:.12);this.rings.setColorAt(i,this.color);colorsChanged=true;}
   this.position.set(p.p.x,.07,p.p.z);this.position.y+=(p.big?.55:.22)+Math.sin(time*2+i)*.045;this.rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP,time*1.6);this.scale.setScalar(active?(p.big?.35:.14):0);this.matrix.compose(this.position,this.rotation,this.scale);this.orbs.setMatrixAt(i,this.matrix);
  }
  this.orbs.instanceMatrix.needsUpdate=true;if(colorsChanged)this.rings.instanceColor.needsUpdate=true;
 }
}

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
