/* Offline adapter for cHe by luyssport, CC BY-NC-SA 4.0. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {mergeGeometries} from '../dist/vendor/BufferGeometryUtils.js';
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Usage: node scripts/prepare-che.mjs source.glb rigged.glb');
const bytes=fs.readFileSync(input),source=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),binary=bytes.subarray(28+bytes.readUInt32LE(12));
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture(){return Promise.resolve(new T.Texture());}}));
const gltf=await new Promise((r,j)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',r,j));gltf.scene.updateMatrixWorld(true);
const excluded=new Set(['shadow','clouds']),bounds=new T.Box3(),point=new T.Vector3();let totalSourceTriangles=0,sourceTriangles=0;
gltf.scene.traverse(o=>{if(!o.isMesh)return;totalSourceTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;if(excluded.has(o.material.name))return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)bounds.expandByPoint(point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));});
const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=2/size.x;
const normalize=new T.Matrix4().makeScale(scale,scale,scale).multiply(new T.Matrix4().makeRotationY(-Math.PI/2)).multiply(new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
// Measured tire centers from the four largest welded-position source islands.
const wheels=[['FL',1.6759101256821158,-.02146402764015337,1.5812879446785426],['FR',1.6591617524045863,-.2731074620924844,-2.3504400283393228],['RL',-2.5210994476920754,.09862309363301536,1.9745427627048073],['RR',-2.5245370242317247,-.23283835719493529,-2.781084358342098]].map(([name,x,y,z])=>({name,source:new T.Vector3(x,y,z),position:new T.Vector3(x,y,z).applyMatrix4(normalize),radius:0,triangles:0}));
const batches=new Map();
gltf.scene.traverse(object=>{
 if(!object.isMesh||excluded.has(object.material.name))return;
 const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld),p=geometry.attributes.position,index=geometry.index,material=source.materials.findIndex(m=>m.name===object.material.name),groups=new Map();sourceTriangles+=(index?.count||p.count)/3;
 for(let i=0;i<(index?.count||p.count);i+=3){
  const indices=[0,1,2].map(j=>index?index.getX(i+j):i+j);let wheel=null;
  if(object.material.name==='ruedas'){const centroid=new T.Vector3();for(const n of indices)centroid.add(point.fromBufferAttribute(p,n));centroid.multiplyScalar(1/3);wheel=wheels.find(w=>w.name===(centroid.x>-.4?'F':'R')+(centroid.z>-.4?'L':'R'));}
  const key=(wheel?wheel.name:'body')+':'+material;if(!groups.has(key))groups.set(key,{wheel,indices:[]});groups.get(key).indices.push(...indices);
 }
 for(const [key,group]of groups){
  const {wheel}=group;if(!batches.has(key))batches.set(key,{wheel,material,chunks:[]});const unique=[...new Set(group.indices)],mapping=new Map(unique.map((n,i)=>[n,i])),chunk=new T.BufferGeometry();
  for(const [name,attribute]of Object.entries(geometry.attributes)){
   if(!['position','normal','uv','uv1','tangent','color'].includes(name))continue;const values=[];for(const n of unique)for(let k=0;k<attribute.itemSize;k++)values.push(attribute.array[n*attribute.itemSize+k]);chunk.setAttribute(name,new T.Float32BufferAttribute(values,attribute.itemSize));
  }
  chunk.setIndex(group.indices.map(n=>mapping.get(n)));chunk.applyMatrix4(normalize);
  if(wheel){chunk.translate(-wheel.position.x,-wheel.position.y,-wheel.position.z);const wp=chunk.attributes.position;for(let i=0;i<wp.count;i++)wheel.radius=Math.max(wheel.radius,Math.hypot(wp.getY(i),wp.getZ(i)));wheel.triangles+=group.indices.length/3;}
  batches.get(key).chunks.push(chunk);
 }
 geometry.dispose();
});
if(wheels.some(w=>w.triangles<8000||w.radius<.15||w.radius>.4))throw new Error('Wheel partition did not match this source model: '+JSON.stringify(wheels));
const materials=structuredClone(source.materials);
const parts=[],views=[],accessors=[],meshes=[],nodes=[{name:'Che_Vehicle',children:[1],extras:{wheelBase:wheels[0].position.z-wheels[2].position.z,visualLength:2,visualFloor:0}},{name:'Custom_Body',children:[]}];let offset=0;
function addView(data,target){const padding=(4-offset%4)%4;if(padding){parts.push(Buffer.alloc(padding));offset+=padding;}const buffer=Buffer.from(data.buffer,data.byteOffset,data.byteLength),id=views.length;views.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})});parts.push(buffer);offset+=buffer.length;return id;}
function accessor(attribute,target,componentType=5126){const view=addView(attribute.array,target),itemSize=attribute.itemSize,types={1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'},value={bufferView:view,componentType,count:attribute.count,type:types[itemSize]};if(target===34962&&itemSize===3){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<attribute.count;i++)for(let j=0;j<3;j++){const n=attribute.array[i*3+j];min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n);}value.min=min;value.max=max;}accessors.push(value);return accessors.length-1;}
const images=source.images.map(image=>{const view=source.bufferViews[image.bufferView],start=view.byteOffset||0;return {...image,bufferView:addView(binary.subarray(start,start+view.byteLength))};});
const spinNodes=new Map();for(const wheel of wheels){const steer=nodes.length,spin=steer+1;nodes[0].children.push(steer);nodes.push({name:'Steer_'+wheel.name,translation:wheel.position.toArray(),children:[spin],extras:{rollingRadius:wheel.radius,front:wheel.name[0]==='F'}},{name:'Spin_'+wheel.name,children:[]});spinNodes.set(wheel.name,spin);}
for(const batch of batches.values()){
 const geometry=mergeGeometries(batch.chunks),attributes={};for(const [name,attribute]of Object.entries(geometry.attributes)){const semantic={position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0',uv1:'TEXCOORD_1',tangent:'TANGENT',color:'COLOR_0'}[name];attributes[semantic]=accessor(attribute,34962);}
 const index=geometry.index;const indexType=index.array instanceof Uint32Array?5125:5123;const meshId=meshes.length;meshes.push({name:(batch.wheel?'Wheel_'+batch.wheel.name:'Che')+'_'+materials[batch.material].name,primitives:[{attributes,indices:accessor(index,34963,indexType),material:batch.material}]});const node=nodes.length;nodes.push({name:meshes[meshId].name,mesh:meshId});nodes[batch.wheel?spinNodes.get(batch.wheel.name):1].children.push(node);batch.chunks.forEach(g=>g.dispose());geometry.dispose();
}
const doc={asset:{version:'2.0',generator:'Boost Circuit cHe adapter',extras:source.asset.extras},extensionsUsed:source.extensionsUsed,scene:0,scenes:[{nodes:[0]}],nodes,meshes,materials,textures:source.textures,samplers:source.samplers,images,accessors,bufferViews:views,buffers:[{byteLength:offset}]};
const json=Buffer.from(JSON.stringify(doc)),jsonPad=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]),bin=Buffer.concat(parts),binPad=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]),header=Buffer.alloc(12),jHeader=Buffer.alloc(8),bHeader=Buffer.alloc(8);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPad.length+binPad.length,8);jHeader.writeUInt32LE(jsonPad.length);jHeader.writeUInt32LE(0x4e4f534a,4);bHeader.writeUInt32LE(binPad.length);bHeader.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jHeader,jsonPad,bHeader,binPad]));
const report={id:'che',name:'cHe',sourceFile:path.basename(input),sourceBytes:bytes.length,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceTriangles:totalSourceTriangles,vehicleSourceTriangles:sourceTriangles,triangles:sourceTriangles,drawBatches:meshes.length,visualLength:2,sourceBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},normalization:{scale,centerX:center.x,centerZ:center.z,floor:bounds.min.y},wheels:wheels.map(w=>({name:w.name,position:w.position.toArray(),radius:w.radius,triangles:w.triangles})),credit:source.asset.extras,paintMaterial:null,modifications:['Removed only static presentation clouds and drop-shadow planes','Preserved supplied hand-painted vehicle artwork and unlit material style','Normalized to +Y up / +Z forward, 2 metre length and floor0','Split the joined wheel mesh into four spatial tire groups, preserving UV and normal seams','Added independent front-steering and rolling pivots with measured radii']};fs.writeFileSync(output.replace(/\.glb$/i,'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,triangles:sourceTriangles,drawBatches:meshes.length,wheels:report.wheels}));
