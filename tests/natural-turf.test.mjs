import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {ShortGrass} from '../dist/grass.js';
import {configureTurfSurface,disposeTurfDetail} from '../dist/turf-texture.js';
import {graphicsProfile} from '../dist/performance.js';
import {resolveRendering} from '../dist/render-settings.js';

test('natural turf has tapered multi-section leaves and bounded height, wind uniforms and graphics budgets',()=>{
 const grass=new ShortGrass(new T.Scene()),field={material:{map:new T.Texture()}};
 assert.equal(grass.geometry.index.count/3,5);assert.equal(grass.geometry.attributes.position.count,7);
 grass.configure(12000,field);const values=grass.geometry.getAttribute('grassVariation').array;
 for(let i=0;i<values.length;i+=3)assert.ok(values[i]>=.045-1e-8&&values[i]<=.075+1e-8);
 assert.ok([...grass.geometry.attributes.normal.array].every(Number.isFinite));
 grass.update(new T.Vector3(10,2,-4),7);assert.equal(grass.time.value,7);
 assert.equal(resolveRendering(graphicsProfile('balanced'),{}).grassCount,8000);
 assert.equal(resolveRendering(graphicsProfile('mobile'),{}).grassCount,0);
 assert.equal(resolveRendering(graphicsProfile('high'),{grass:'off'}).grassCount,0);
 assert.equal(resolveRendering(graphicsProfile('low'),{grass:'high'}).grassCount,48000);
 grass.dispose();field.material.map.dispose();
});

test('ground detail is lazy, shared across grassy fields and removable on lower quality',()=>{
 let canvases=0;const context=new Proxy({},{get:()=>()=>{}}),old=globalThis.document;
 globalThis.document={createElement:()=>{canvases++;return {width:0,height:0,getContext:()=>context};}};
 try{
  const a={material:new T.MeshStandardMaterial()},b={material:new T.MeshStandardMaterial()};
  configureTurfSurface(a,false);assert.equal(canvases,0);
  configureTurfSurface(a,true);configureTurfSurface(b,true);assert.equal(canvases,1);assert.equal(a.material.bumpMap,b.material.bumpMap);
  assert.equal(a.material.bumpMap.wrapS,T.RepeatWrapping);assert.ok(a.material.bumpScale>0&&a.material.bumpScale<.02);
  configureTurfSurface(a,false);assert.equal(a.material.bumpMap,null);assert.ok(b.material.bumpMap);
  a.material.dispose();b.material.dispose();
 }finally{disposeTurfDetail();if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
