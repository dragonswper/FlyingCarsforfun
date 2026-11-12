import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {makeCustomModel,validateCustomRig,animateVehicle,disposeVehicle} from '../dist/vehicles.js';
import {makeRocketBall} from '../dist/ball-model.js';
import {BODY_TYPES,CUSTOM_BODY_FILES} from '../dist/bodies.js';
import {C} from '../dist/constants.js';

const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/models/manifest.json',import.meta.url))).assets;
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const assets=new Map();
for(const id of ['octane','che','bike','c17','rocket-ball']){
 const bytes=fs.readFileSync(new URL('../dist/assets/models/'+id+'.glb',import.meta.url)),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),report=JSON.parse(fs.readFileSync(new URL('../dist/assets/models/'+id+'-import.json',import.meta.url)));
 const loader=new GLTFLoader();for(const name of ['HEADLESS_TEXTURES','EXT_texture_webp'])loader.register(()=>({name,loadTexture(){return Promise.resolve(new T.Texture());}}));
 const gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));assets.set(id,{bytes,json,report,template:gltf.scene});
}

for(const [id,count,length]of [['octane',4,1.8],['che',4,2],['bike',2,2],['c17',5,2]]){
 test(id+' has a valid self-contained model, preserved source credit, correct scale and complete wheel rig',()=>{
  const {bytes,json,report,template}=assets.get(id),entry=manifest.find(a=>a.id===id);assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(bytes.length,report.bytes);assert.ok(bytes.length<(id==='c17'?8_000_000:4_000_000));assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);assert.equal(entry.sha256,report.sha256);
  assert.equal(json.asset.extras.source,report.credit.source);assert.match(json.asset.extras.license,/CC-BY/);assert.equal(CUSTOM_BODY_FILES[id],id+'.glb');assert.ok(BODY_TYPES.includes(id));for(const image of json.images)assert.ok(image.bufferView!==undefined&&!image.uri);assert.ok(!json.extensionsUsed?.includes('KHR_materials_transmission'));assert.equal(json.animations?.length||0,0);
  assert.equal(validateCustomRig(template),true);const model=makeCustomModel(id,'#299bff',template);assert.equal(model.wheels.length,count);model.root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model.visual);near(bounds.getSize(new T.Vector3()).z,length,.006);near(bounds.min.y,-C.carHeight,.006);
  let triangles=0,batches=0;model.visual.traverse(mesh=>{if(!mesh.isMesh)return;batches++;triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));});assert.equal(triangles,report.triangles);assert.ok(batches<=(id==='c17'?40:16));assert.ok(model.wheelBase>.5);
  for(const wheel of model.wheels){assert.equal(wheel.rolling.parent,wheel.pivot);assert.ok(wheel.radius>.02&&wheel.radius<.4);assert.ok(!model.chassis.getObjectByName(wheel.pivot.name));}assert.ok(model.wheels.some(w=>w.front));assert.ok(model.wheels.some(w=>!w.front));
  if(id==='bike'){assert.equal(json.materials.some(m=>m.name==='initialShadingGroup'),false);assert.ok(json.materials.find(m=>m.name==='lambert3SG').extensions.KHR_materials_unlit);assert.equal(triangles,report.sourceTriangles/2);}
  if(id==='che')assert.match(entry.license,/NC-SA/);disposeVehicle(model);
 });
 test(id+' animates signed rolling and front steering with separate materials and reusable shared geometry',()=>{
  const {template}=assets.get(id),a=makeCustomModel(id,'#299bff',template),b=makeCustomModel(id,'#ff9345',template),part=a.visual.getObjectByProperty('isMesh',true),other=b.visual.getObjectByName(part.name);assert.equal(part.geometry,other.geometry);assert.notEqual(part.material,other.material);
  const original=b.paint?.color.getHexString();a.setColor('#53dbbd');assert.equal(b.paint?.color.getHexString(),original);assert.equal(!!a.paint,id==='octane');
  animateVehicle(a,{speed:4,steer:1,dt:1/60,grounded:true});for(const wheel of a.wheels){near(wheel.rolling.rotation.x,4/60/wheel.radius);assert.equal(wheel.pivot.rotation.y>0,wheel.front);near(wheel.pivot.position.y,wheel.restY);}
  const angle=a.wheels[0].rolling.rotation.x;animateVehicle(a,{speed:-4,steer:-1,dt:1/60,grounded:true});assert.ok(a.wheels[0].rolling.rotation.x<angle);const paused=a.wheels[0].rolling.rotation.x;animateVehicle(a,{speed:23,dt:0});assert.equal(a.wheels[0].rolling.rotation.x,paused);
  let disposed=0;part.geometry.addEventListener('dispose',()=>disposed++);disposeVehicle(a);assert.equal(disposed,0);disposeVehicle(b);
 });
}

test('the replacement ball retains the supplied panel artwork, source record and a bounded unit sphere',()=>{
 const {bytes,json,report,template}=assets.get('rocket-ball'),entry=manifest.find(a=>a.id==='rocket-ball');assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);assert.equal(entry.sha256,report.sha256);assert.ok(bytes.length<600_000);assert.equal(json.images.length,1);assert.equal(json.images[0].mimeType,'image/webp');assert.equal(json.animations?.length||0,0);assert.equal(json.asset.extras.license,report.credit.license);
 const ball=makeRocketBall(template);ball.updateMatrixWorld(true);let radius=0,triangles=0;const point=new T.Vector3();ball.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.attributes.position;triangles+=(mesh.geometry.index?.count||p.count)/3;for(let i=0;i<p.count;i++)radius=Math.max(radius,point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).length());});near(radius,C.ballVisualRadius,1e-5);assert.equal(triangles,4416);assert.equal(ball.name,'Rocket_League_Ball');
});

test('all eight garage bodies resolve through the same catalog used by network appearances',()=>{
 const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),cards=[...html.matchAll(/data-body="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual([...cards].sort(),[...BODY_TYPES].sort());for(const id of Object.keys(CUSTOM_BODY_FILES))assert.ok(fs.existsSync(new URL('../dist/assets/'+id+'-preview.png',import.meta.url)));
});
