/* Offline asset checks using the game's actual Three.js loader and adapter.
   Embedded image decoding is stubbed; inspect the Blender previews separately. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {makeCustomModel, validateCustomRig, animateVehicle, disposeVehicle} from '../dist/vehicles.js';
import {C} from '../dist/constants.js';

const near = (a,b,tolerance=1e-6) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
const results=[];
for(const [id,wheelCount] of [['scifi',3],['golfcart',4],['rickshaw',3],['ifv',30]]){
  const bytes=fs.readFileSync(new URL(`../dist/assets/models/${id}.glb`,import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const report=JSON.parse(fs.readFileSync(new URL(`../dist/assets/models/${id}-import.json`,import.meta.url)));
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.length,report.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);
  assert.deepEqual(doc.asset.extras,report.credit);
  assert.ok(report.credit.author&&report.credit.source&&report.credit.license);
  assert.equal(doc.animations?.length||0,0);
  assert.equal(doc.skins?.length||0,0);
  for(const image of doc.images||[])assert.ok(image.bufferView!==undefined&&!image.uri);
  for(const buffer of doc.buffers)assert.ok(!buffer.uri);
  for(const required of doc.extensionsRequired||[])assert.equal(required,'EXT_texture_webp');
  const loader=new GLTFLoader();
  for(const name of ['HEADLESS_TEXTURES','EXT_texture_webp'])loader.register(()=>({name,loadTexture(){return Promise.resolve(new T.Texture());}}));
  const gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
  assert.equal(validateCustomRig(gltf.scene),true);
  const a=makeCustomModel(id,'#299bff',gltf.scene),b=makeCustomModel(id,'#ff9345',gltf.scene);
  a.root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(a.visual),size=box.getSize(new T.Vector3());
  near(size.z,2,.006);near(box.min.y,-C.carHeight,.006);
  assert.equal(a.wheels.length,wheelCount);
  assert.equal(a.paint,null);
  assert.equal(a.wheels.some(w=>w.front),id!=='ifv');
  let triangles=0,batches=0;
  a.visual.traverse(mesh=>{
    if(!mesh.isMesh)return;
    batches++;
    triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
    for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
    const other=b.visual.getObjectByName(mesh.name);
    assert.equal(other.geometry,mesh.geometry);
    if(!Array.isArray(mesh.material))assert.notEqual(mesh.material,other.material);
  });
  assert.equal(triangles,report.triangles);assert.equal(batches,report.drawBatches);
  assert.ok(triangles<120000);assert.ok(batches<40);
  for(const wheel of a.wheels){
    assert.equal(wheel.rolling.parent,wheel.pivot);
    assert.ok(wheel.radius>.02&&wheel.radius<.5);
    assert.ok(!a.chassis.getObjectByName(wheel.pivot.name));
  }
  animateVehicle(a,{speed:4,steer:1,dt:1/60,grounded:true});
  for(const wheel of a.wheels){
    near(wheel.rolling.rotation.x,4/60/wheel.radius);
    assert.equal(wheel.pivot.rotation.y>0,wheel.front);
  }
  const phase=a.wheels[0].rolling.rotation.x;
  animateVehicle(a,{speed:-4,steer:-1,dt:1/60,grounded:true});
  assert.ok(a.wheels[0].rolling.rotation.x<phase);
  disposeVehicle(a);disposeVehicle(b);
  results.push({id,bytes:bytes.length,triangles,batches,wheels:wheelCount,bounds:[box.min.toArray(),box.max.toArray()]});
}
console.log(JSON.stringify({passed:true,texturePixels:'Headless image decoding stub; actual offline Blender previews inspected separately',assets:results},null,2));
