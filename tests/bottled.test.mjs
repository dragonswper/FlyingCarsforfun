import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {setImmediate as settle} from 'node:timers/promises';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {makeBottledModel,validateBottledRig,animateVehicle,disposeVehicle} from '../dist/vehicles.js';
import {prepareRoomVehicles} from '../dist/bodies.js';
import {C} from '../dist/constants.js';

const bytes=fs.readFileSync(new URL('../dist/assets/models/bottled.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const report=JSON.parse(fs.readFileSync(new URL('../dist/assets/models/bottled-import.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/models/manifest.json',import.meta.url))).assets.find(a=>a.id==='bottled');
// Node has no browser image decoder. Exercise the real GLTF geometry/material
// importer while replacing both ordinary and EXT_texture_webp image loading.
const loader=new GLTFLoader();
for(const name of ['HEADLESS_TEXTURES','EXT_texture_webp'])loader.register(()=>({name,loadTexture(){return Promise.resolve(new T.Texture());}}));
const gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('Bottled Car ships a small self-contained asset with original credit, NC license and verified hashes',()=>{
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);assert.ok(bytes.length<4_000_000);
 assert.equal(report.bytes,bytes.length);assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);assert.equal(manifest.sha256,report.sha256);assert.equal(manifest.license,'CC-BY-NC-4.0');
 assert.match(json.asset.extras.author,/Urizel/);assert.match(json.asset.extras.license,/CC-BY-NC-4.0/);assert.equal(json.asset.extras.source,manifest.sourceUrl);
 assert.equal(json.images.length,16);for(const image of json.images){assert.equal(image.mimeType,'image/webp');assert.ok(image.bufferView!==undefined&&!image.uri);}
 assert.deepEqual(json.extensionsRequired,['EXT_texture_webp']);assert.equal(json.animations?.length||0,0);assert.equal(validateBottledRig(gltf.scene),true);
});

test('actual Bottled Car geometry preserves the complete assembly and gives all four wheels separate pivots',()=>{
 const model=makeBottledModel('#299bff',gltf.scene);model.root.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(model.visual),size=bounds.getSize(new T.Vector3());near(size.z,2);near(bounds.min.y,-C.carHeight);assert.ok(size.y>.75&&size.y<.8);
 let triangles=0,meshes=0;const materialNames=new Set();model.visual.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;materialNames.add(o.material.name);}});
 assert.equal(triangles,29482);assert.equal(triangles,report.sourceTriangles);assert.equal(meshes,13);
 for(const name of ['BOTTLE_OUTSIDE','BOTTLE_INSIDE','BOTTLE_WOOD','BOTTOM','NAMEPLATE','GLASS_N_CHROME'])assert.ok(materialNames.has(name),`retained ${name}`);
 near(model.wheelBase,.7420603930950165);for(const wheel of model.wheels){assert.equal(wheel.pivot.position.z>0,wheel.front);assert.equal(wheel.pivot.position.x<0,wheel.name[1]==='L');assert.ok(wheel.radius>.09&&wheel.radius<.10);assert.equal(wheel.rolling.parent,wheel.pivot);assert.ok(!model.chassis.getObjectByName(wheel.pivot.name));}
 disposeVehicle(model);
});

test('Bottled Car wheels roll by their own radii in both directions and steer without moving the rear pivots',()=>{
 const model=makeBottledModel('#299bff',gltf.scene);
 animateVehicle(model,{speed:5,steer:1,dt:1/60,grounded:true});for(const wheel of model.wheels)near(wheel.rolling.rotation.x,5/60/wheel.radius);
 const front=model.wheels.filter(w=>w.front);assert.ok(front.every(w=>w.pivot.rotation.y>0));assert.ok(front[1].pivot.rotation.y>front[0].pivot.rotation.y);assert.ok(model.wheels.filter(w=>!w.front).every(w=>w.pivot.rotation.y===0));
 const angle=model.wheels[0].rolling.rotation.x;animateVehicle(model,{speed:-5,dt:1/60,grounded:true});assert.ok(model.wheels[0].rolling.rotation.x<angle);
 const paused=model.wheels[0].rolling.rotation.x;animateVehicle(model,{speed:23,dt:0});assert.equal(model.wheels[0].rolling.rotation.x,paused);
 animateVehicle(model,{speed:0,throttle:1,dt:1/60,grounded:false});assert.ok(model.wheels[0].rolling.rotation.x>paused);assert.ok(model.wheels.every(w=>Number.isFinite(w.rolling.rotation.x)&&w.pivot.position.y===w.restY));disposeVehicle(model);
});

test('bottle glass avoids the transmission pass and clone paint/disposal keeps shared model resources intact',()=>{
 const a=makeBottledModel('#299bff',gltf.scene),b=makeBottledModel('#ff9345',gltf.scene);assert.notEqual(a.paint,b.paint);assert.equal(a.paint.map,b.paint.map);a.setColor('#53dbbd');assert.equal(b.paint.color.getHexString(),'ff9345');
 const glass=[];a.visual.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('BOTTLE_')&&o.material.name!=='BOTTLE_WOOD')glass.push(o);});assert.equal(glass.length,2);
 for(const mesh of glass){const m=mesh.material;assert.equal(m.transparent,true);assert.equal(m.depthWrite,false);assert.equal(m.forceSinglePass,true);assert.equal(m.side,T.FrontSide);assert.equal(m.transmission||0,0);assert.equal(mesh.castShadow,false);}
 const part=a.visual.getObjectByProperty('isMesh',true),other=b.visual.getObjectByName(part.name);assert.equal(part.geometry,other.geometry);let disposed=0;part.geometry.addEventListener('dispose',()=>disposed++);disposeVehicle(a);assert.equal(disposed,0);assert.equal(b.paint.color.getHexString(),'ff9345');disposeVehicle(b);
});

test('room vehicle preparation is single-flight and deduplicates matching bodies before permitting readiness',async()=>{
 const room={look:{body:'bottled'},remoteLook:{body:'bottled'}},calls=[];let release;const deferred=new Promise(resolve=>{release=resolve;});
 const load=body=>{calls.push(body);return deferred;};const first=prepareRoomVehicles(room,load);assert.equal(room.loadingAssets,true);assert.equal(prepareRoomVehicles(room,load),first);await settle();assert.deepEqual(calls,['bottled']);assert.notEqual(room.assetsReady,true);
 release();await first;assert.equal(room.assetsReady,true);assert.equal(room.loadingAssets,false);assert.equal(room.assetsPromise,null);await prepareRoomVehicles(room,load);assert.deepEqual(calls,['bottled']);
});

test('room vehicle preparation waits for both different bodies and exposes an explicit retry after download failure',async()=>{
 const room={look:{body:'fennec'},remoteLook:{body:'bottled'}};let attempts=0,fail=true;
 const load=async body=>{if(body==='bottled'){attempts++;if(fail)throw new Error('temporary download failure');}};
 await assert.rejects(prepareRoomVehicles(room,load),/temporary/);assert.equal(room.loadingAssets,false);assert.notEqual(room.assetsReady,true);assert.match(room.assetsError,/retry/);
 await assert.rejects(prepareRoomVehicles(room,load),/retry/);assert.equal(attempts,1);
 fail=false;await prepareRoomVehicles(room,load,()=>{},true);assert.equal(attempts,2);assert.equal(room.assetsReady,true);assert.equal(room.assetsError,'');
});
