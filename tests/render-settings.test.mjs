import test from 'node:test';import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {renderingPreferences,resolveRendering} from '../dist/render-settings.js';
import {graphicsProfile} from '../dist/performance.js';import {ShortGrass} from '../dist/grass.js';
test('natural turf scales with graphics presets while low and mobile keep grass disabled by default',()=>{
 for(const quality of ['low','balanced','high']){const value=resolveRendering(graphicsProfile(quality),{});assert.equal(value.enhanced,false);assert.equal(value.grassCount,{low:0,balanced:8000,high:18000}[quality]);}
 const value=resolveRendering(graphicsProfile('ultra'),{});assert.equal(value.enhanced,true);assert.equal(value.shadowSize,4096);assert.equal(resolveRendering(graphicsProfile('mobile'),{}).grassCount,0);assert.equal(value.grassCount,48000);
});
test('advanced graphics settings clamp stored numbers and allow low-cost overrides of Cinematic',()=>{
 const preferences=renderingPreferences({resolutionScale:900,exposure:-4,shadows:'off',grass:'off',lighting:'basic'});
 assert.equal(preferences.resolutionScale,150);assert.equal(preferences.exposure,.7);const value=resolveRendering(graphicsProfile('ultra'),preferences);
 assert.equal(value.shadowSize,0);assert.equal(value.grassCount,0);assert.equal(value.enhanced,false);
 const invalid=renderingPreferences({resolutionScale:'bad',exposure:Infinity,shadows:'typo',grass:'typo'});assert.deepEqual(invalid,renderingPreferences());
});
test('short grass uses a bounded instanced draw and the pitch texture without changing physics',()=>{
 const scene=new T.Scene(),grass=new ShortGrass(scene),map=new T.Texture(),field=new T.Mesh(undefined,new T.MeshStandardMaterial({map}));
 grass.configure(24000,field);assert.equal(grass.geometry.instanceCount,24000);assert.equal(grass.mesh.visible,true);assert.equal(grass.material.map,map);assert.equal(grass.mesh.castShadow,false);
 grass.update(new T.Vector3(4,20,-3));assert.deepEqual(grass.center.toArray(),[4,-3]);
 grass.configure(100000,field);assert.equal(grass.geometry.instanceCount,90000);grass.configure(0,field);assert.equal(grass.mesh.visible,false);
 grass.configure(24000,null);assert.equal(grass.mesh.visible,false);grass.dispose();field.geometry.dispose();field.material.dispose();map.dispose();
});
