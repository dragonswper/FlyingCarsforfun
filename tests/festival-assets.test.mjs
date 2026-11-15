import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {makeFestivalEnvironment} from '../dist/festival-assets.js';import {C} from '../dist/constants.js';
const root=new URL('../dist/assets/arenas/festival/',import.meta.url);
const scenes={};
for(const kind of ['lights','village','tree','mountains'])test('supplied festival '+kind+' is self-contained, bounded and retains source records',async()=>{
 const bytes=fs.readFileSync(new URL('festival-'+kind+'.glb',root)),report=JSON.parse(fs.readFileSync(new URL('festival-'+kind+'.json',root)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);assert.equal(bytes.length,report.bytes);assert.ok(bytes.length<4_000_000);assert.ok(report.source_sha256);assert.ok(report.credit);
 const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok((document.images||[]).every(image=>image.bufferView!==undefined&&!image.uri));assert.ok(document.buffers.every(buffer=>!buffer.uri));
 if(kind==='mountains'){assert.match(document.asset.extras.author,/99.Miles/);assert.match(document.asset.extras.license,/CC-BY-4.0/);assert.deepEqual(report.source_metadata.extras,document.asset.extras);}
 const loader=new GLTFLoader();for(const name of ['HEADLESS_TEXTURES','EXT_texture_webp'])loader.register(()=>({name,loadTexture:()=>Promise.resolve(new T.Texture())}));
 const loaded=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));scenes[kind]=loaded.scene;
 const bounds=new T.Box3().setFromObject(loaded.scene),size=bounds.getSize(new T.Vector3());assert.ok(bounds.min.y>-.01);assert.ok(size.toArray().every(n=>Number.isFinite(n)&&n>0));if(kind==='tree')assert.ok(Math.abs(size.y-18)<.02);
});
test('all supplied holiday decorations stay outside the playing enclosure and snow has a fixed budget',()=>{
 const env=makeFestivalEnvironment({...scenes,snow:new T.Texture()});env.root.updateMatrixWorld(true);
 for(const child of env.root.children){if(!child.name.startsWith('Supplied_')||child.isPoints)continue;
  const box=new T.Box3().setFromObject(child);assert.ok(box.max.x<-C.halfWidth||box.min.x>C.halfWidth||box.max.z<-C.halfLength-C.goalDepth||box.min.z>C.halfLength+C.goalDepth,child.name+' overlaps the field');
 }
 const snow=env.root.getObjectByName('Supplied_Falling_Snow');env.setQuality('low');assert.equal(snow.geometry.drawRange.count,128);env.setQuality('ultra');assert.equal(snow.geometry.drawRange.count,640);assert.doesNotThrow(()=>env.update(120));
});
