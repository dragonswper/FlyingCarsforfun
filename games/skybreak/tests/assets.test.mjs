import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),at=p=>new URL(p,root),read=p=>readFileSync(at(p),'utf8');
const m={exports:{}};
const globals={console,setTimeout,clearTimeout,setInterval,clearInterval,performance,TextDecoder,TextEncoder,URL,ArrayBuffer,Uint8Array,Blob};
vm.runInNewContext(read('dist/vendor/babylon.js'),{...globals,module:m,exports:m.exports});const B=m.exports;
const lm={exports:{}};
vm.runInNewContext(read('dist/vendor/babylonjs.loaders.min.js'),{...globals,module:lm,exports:lm.exports,require:name=>{assert.equal(name,'babylonjs');return B;}});

test('all six licensed models have verified hashes and no external dependencies',()=>{
 const manifest=JSON.parse(read('dist/assets/models/manifest.json'));assert.equal(manifest.length,6);
 for(const item of manifest){
  const bytes=readFileSync(at('dist/assets/models/'+item.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  assert.equal(item.license,'CC0-1.0');assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  for(const buffer of json.buffers||[])assert.ok(!buffer.uri||buffer.uri.startsWith('data:'));
  for(const image of json.images||[])assert.ok(!image.uri||image.uri.startsWith('data:'));
 }
});

test('real glTF loader imports every model and asset placement replaces fallback geometry',async()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine);
 const original=B.SceneLoader.LoadAssetContainerAsync;
 try{
  B.SceneLoader.LoadAssetContainerAsync=async(root,file,s)=>original.call(B.SceneLoader,'',new Uint8Array(readFileSync(at('dist/assets/models/'+file))),s,null,'.glb');
  const window={BABYLON:B};vm.runInNewContext(read('dist/assets.js'),{window,console,Map,WeakMap,Math});
  for(const [kind,file] of Object.entries({pine:'tree-pinetalla-detailed.glb',oak:'tree-oak.glb',rock:'rock-largea.glb',grass:'grass-large.glb',logs:'log-stack.glb',cloud:'cloud.glb'})){
   const fallback=B.MeshBuilder.CreateBox('fallback',{},scene);
   const placed=await window.RiftAssets.place(scene,kind,10,-15,5,null,[fallback],2);
   assert.ok(placed,`failed ${file}`);assert.ok(fallback.isDisposed());assert.ok(placed.getChildMeshes().length>0);
   placed.computeWorldMatrix(true);placed.getChildMeshes().forEach(x=>x.computeWorldMatrix(true));
   const bounds=placed.getHierarchyBoundingVectors(true);assert.ok(Math.abs(bounds.max.y-bounds.min.y-5)<.001,kind);assert.ok(Math.abs(bounds.min.y-2)<.001,kind);
  }
 }finally{B.SceneLoader.LoadAssetContainerAsync=original;scene.dispose();engine.dispose();}
});

test('page and UI references resolve; runtime assets are bundled locally',()=>{
 const html=read('dist/index.html'),app=read('dist/app.js'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 for(const [,id]of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`missing ${id}`);
 for(const [,path]of html.matchAll(/(?:src|href)="([^"]+)"/g))if(!/^(http|data:|#)/.test(path))assert.ok(existsSync(at('dist/'+path)),path);
 for(const file of ['styles.css','skybreak.css'])for(const [,path]of read('dist/'+file).matchAll(/url\(['"]?([^)'"\s]+)/g))assert.ok(existsSync(at('dist/'+path)),path);
 assert.ok(!/<script[^>]+src="https?:/.test(html));assert.ok(!/@import\b/.test(read('dist/skybreak.css')));
 assert.ok(existsSync(at('dist/vendor/BABYLON-LICENSE.txt')));assert.ok(existsSync(at('dist/assets/fonts/OFL.txt')));
});
