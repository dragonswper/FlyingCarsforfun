/* Offline import of the user-supplied CC BY 4.0 stadium. No runtime decoders. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from '../dist/vendor/BufferGeometryUtils.js';
import { C } from '../dist/physics.js';
const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/import-champions.mjs /path/to/user-supplied.glb');
const output=new URL('../dist/assets/models/',import.meta.url),raw=fs.readFileSync(input),source=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12))),binStart=28+raw.readUInt32LE(12),sourceBin=raw.subarray(binStart);
const loader=new GLTFLoader();loader.register(()=>({name:'HEADLESS_TEXTURES',loadTexture(){return Promise.resolve(new T.Texture());}}));
const gltf=await new Promise((r,j)=>loader.parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'',r,j));gltf.scene.updateMatrixWorld(true);
const floor=.03372559324,sx=C.halfWidth/1.83756,sz=C.halfLength/2.776712,sy=C.height/(1.013404-floor);
const transform=new T.Matrix4().set(0,0,-sx,-.00025275*sx,0,sy,0,-floor*sy,sz,0,0,.002365*sz,0,0,0,1);
const mats=[],matMap=new Map(),batches=new Map(),groups=[],seen=new Set(),stats={sourceMeshes:0,sourceTriangles:0,removedPitchMeshes:0,removedDuplicates:0,removedStrays:0,retainedSourceMeshes:0};
const linear=hex=>new T.Color(hex).toArray();
function material(key,color,roughness=.65,metalness=.2,emissive){
 if(matMap.has(key))return matMap.get(key);const m={name:key,pbrMetallicRoughness:{baseColorFactor:[...linear(color),1],metallicFactor:metalness,roughnessFactor:roughness}};
 if(emissive)m.emissiveFactor=linear(emissive);matMap.set(key,mats.length);mats.push(m);return mats.length-1;
}
function choose(o,b){
 const n=o.name.toLowerCase(),original=Array.isArray(o.material)?o.material[0]:o.material;
 const sourceMat=source.materials.find(m=>m.name===original.name);
 if(sourceMat?.pbrMetallicRoughness?.baseColorTexture){
  const key='Champions_Banner_'+original.name;if(matMap.has(key))return matMap.get(key);const copy=structuredClone(sourceMat);copy.name=key;copy.doubleSided=true;copy.pbrMetallicRoughness.metallicFactor=0;copy.pbrMetallicRoughness.roughnessFactor=.8;copy.pbrMetallicRoughness.baseColorFactor=[1,1,1,1];matMap.set(key,mats.length);mats.push(copy);return mats.length-1;
 }
 const orange=b.getCenter(new T.Vector3()).x>0,team=orange?'#d78538':'#2979b6',glow=orange?'#eeb267':'#58c9f0';
 if(/lightemissive|lightRank0[1-4]/i.test(o.name))return material('Champions_Floodlight','#d9edff',.3,.1,'#a4c9ed');
 if(/glow|screen/.test(n))return material('Champions_'+(orange?'Orange':'Blue')+'_Lighting',glow,.32,.4,glow);
 if(/trophy/.test(n))return material(/frame/.test(n)?'Champions_Trophy_Frame':'Champions_Trophy_Gold',/frame/.test(n)?'#8499a7':'#e6ba64',.28,.85);
 if(/octanewheels|nuke_bottomframe|shield_main|backside|entry_hood|gut_main|base/.test(n)&&!/seatbase/.test(n))return material('Champions_Structure','#202f40',.7,.35);
 if(/seatbase/.test(n))return material('Champions_'+(orange?'Orange':'Blue')+'_Seats',team,.75,.05);
 if(/glass|playouter/.test(n))return material('Champions_Dark_Glass','#304c68',.22,.7);
 if(/stripe|ring|curve2|curve1|beam|pipes|splits|frame/.test(n))return material('Champions_'+(orange?'Orange':'Blue')+'_Trim',team,.4,.65);
 if(/stairs|boundary|ground|lambert/.test(n))return material('Champions_Concrete','#495963',.92,.05);
 if(/ball|rank|shield/.test(n))return material('Champions_Silver','#b1bdc7',.38,.75);
 return material('Champions_Cladding','#485c73',.62,.35);
}
const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
for(const o of meshes){
 stats.sourceMeshes++;stats.sourceTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
 // The cinematic inner pitch has different proportions and curved collision surfaces.
 // Replace it with solver-aligned turf, ramps, walls and nets in scene.js.
 if(o.name.startsWith('polySurface3408_')||o.name.startsWith('polySurface3346_play')){stats.removedPitchMeshes++;continue;}
 const box=new T.Box3().setFromObject(o);
 if(box.max.y<-.5||o.name==='Ground_blinn4_0'){stats.removedStrays++;continue;}
 let g=o.geometry.clone().applyMatrix4(o.matrixWorld);const p=g.attributes.position;
 // Remove coincident copies even if the source assigns different normals/UVs to them.
 const signature=crypto.createHash('sha256').update(Buffer.from(p.array.buffer,p.array.byteOffset,p.array.byteLength)).update(o.material.name).digest('hex');
 if(seen.has(signature)){stats.removedDuplicates++;g.dispose();continue;}seen.add(signature);
 if(o.matrixWorld.determinant()<0){if(g.index){for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i);g.index.setX(i,g.index.getX(i+2));g.index.setX(i+2,a);}}else{g=g.toNonIndexed();for(const attr of Object.values(g.attributes))for(let i=0;i<attr.count;i+=3)for(let a=0;a<attr.itemSize;a++){const v=attr.array[i*attr.itemSize+a];attr.array[i*attr.itemSize+a]=attr.array[(i+2)*attr.itemSize+a];attr.array[(i+2)*attr.itemSize+a]=v;}}}
 g.applyMatrix4(transform);for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
 if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(p.count*2),2));if(!g.attributes.normal)g.computeVertexNormals();if(!g.index)g.setIndex(Array.from({length:p.count},(_,i)=>i));
 const m=choose(o,box),center=box.getCenter(new T.Vector3()),cell=Math.floor(center.x/4)+','+Math.floor(center.z/4),key=m+':'+cell;
 let group=batches.get(key);if(!group||group.vertices+p.count>60000){group={m,geometries:[],vertices:0,sources:[],cell};batches.set(key,group);groups.push(group);}
 group.geometries.push(g);group.vertices+=p.count;group.sources.push(o.name);stats.retainedSourceMeshes++;
}
const doc={asset:{version:'2.0',generator:'Boost Circuit stadium importer',copyright:'Champions Field by Prabhu Ram / virtualmakes, CC BY 4.0; adapted for Boost Circuit'},extensionsUsed:['KHR_mesh_quantization'],extensionsRequired:['KHR_mesh_quantization'],scene:0,scenes:[{name:'Champions Field',nodes:[0]}],nodes:[{name:'Champions_Field',children:[],extras:{sourceModel:'6ea5ee0502ae432fbac3a4f8aaab61a5',playingSurface:'Collision-aligned replacement in scene.js',detail:'stadium'}}],meshes:[],materials:mats,accessors:[],bufferViews:[],buffers:[],images:[],textures:source.textures,samplers:source.samplers};
const chunks=[];let offset=0;
function view(bytes,target){const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})});chunks.push(buffer);offset+=buffer.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}return index;}
function accessor(array,type,componentType,normalized=false,min,max){
 const count=array.length/({SCALAR:1,VEC2:2,VEC3:3}[type]);let bytes=array,stride;
 if(type==='VEC3'&&componentType!==5126){bytes=new array.constructor(count*4);for(let i=0;i<count;i++)bytes.set(array.subarray(i*3,i*3+3),i*4);stride=8;}
 const bufferView=view(bytes,type==='SCALAR'?34963:34962);if(stride)doc.bufferViews[bufferView].byteStride=stride;
 const index=doc.accessors.length;doc.accessors.push({bufferView,componentType,count,type,...(normalized?{normalized:true}:{}),...(min?{min,max}:{})});return index;
}
let triangles=0,vertices=0;
for(const group of groups){
 if(!group.geometries.length)continue;const merged=mergeGeometries(group.geometries,false),g=mergeVertices(merged,1e-5);g.computeBoundingBox();const {min,max}=g.boundingBox,size=max.clone().sub(min);for(const k of ['x','y','z'])size[k]=Math.max(size[k],.001);
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,q=new Uint16Array(p.count*3),norm=new Int16Array(p.count*3),normal=new T.Vector3();
 for(let i=0;i<p.count;i++){for(let a=0;a<3;a++){const k=['x','y','z'][a];q[i*3+a]=Math.round(T.MathUtils.clamp((p.array[i*3+a]-min[k])/size[k],0,1)*65535);}normal.fromBufferAttribute(n,i).multiply(size).normalize();norm.set(normal.toArray().map(v=>Math.round(v*32767)),i*3);}
 const positions=accessor(q,'VEC3',5123,true,[0,0,0],[65535,65535,65535]),normals=accessor(norm,'VEC3',5122,true),uvs=accessor(new Float32Array(uv.array),'VEC2',5126),indices=accessor(new Uint16Array(g.index.array),'SCALAR',5123);
 const index=doc.meshes.length,name='Champions_'+index+'_'+mats[group.m].name.replace('Champions_','');doc.meshes.push({name,primitives:[{attributes:{POSITION:positions,NORMAL:normals,TEXCOORD_0:uvs},indices,material:group.m}]});doc.nodes[0].children.push(doc.nodes.length);doc.nodes.push({name,mesh:index,translation:min.toArray(),scale:size.toArray(),extras:{sourceParts:group.sources.length,detail:mats[group.m].name.includes('Seats')?'seats':'architecture'}});triangles+=g.index.count/3;vertices+=p.count;
}
for(const image of source.images){const bv=source.bufferViews[image.bufferView];doc.images.push({mimeType:image.mimeType,bufferView:view(sourceBin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength))});}
const landmarks={Pitch_Center:[0,0,0],Pitch_Side_Left:[-C.halfWidth,0,0],Pitch_Side_Right:[C.halfWidth,0,0],Pitch_Ceiling:[0,C.height,0]};for(const [team,sign]of [['Blue',-1],['Orange',1]])for(const [side,x]of [['Left',-C.goalWidth],['Right',C.goalWidth]]){landmarks['Goal_'+team+'_'+side]=[x,0,sign*C.halfLength];landmarks['Goal_'+team+'_'+side+'_Top']=[x,C.goalHeight,sign*C.halfLength];}for(const [name,position]of Object.entries(landmarks)){doc.nodes[0].children.push(doc.nodes.length);doc.nodes.push({name,translation:position});}
doc.buffers=[{byteLength:offset}];const json=Buffer.from(JSON.stringify(doc)),jsonLength=Math.ceil(json.length/4)*4,head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+jsonLength+offset,8);head.writeUInt32LE(jsonLength,12);head.writeUInt32LE(0x4e4f534a,16);const binHead=Buffer.alloc(8);binHead.writeUInt32LE(offset);binHead.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([head,json,Buffer.alloc(jsonLength-json.length,32),binHead,...chunks]);fs.writeFileSync(new URL('champions-field.glb',output),result);
const report={...stats,drawBatches:doc.meshes.length,triangles,vertices,bytes:result.length,sourceBytes:raw.length,sha256:crypto.createHash('sha256').update(result).digest('hex'),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),scale:[sx,sy,sz],sourceFloor:floor,landmarks};fs.writeFileSync(new URL('champions-field-import.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
