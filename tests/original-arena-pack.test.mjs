import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {ARENAS,ARENA_IDS,randomArena} from '../dist/arenas.js';
import {BLENDER_ARENA_IDS,validateOriginalArena,makeOriginalArenaEnvironment} from '../dist/original-arena-assets.js';
import {C} from '../dist/constants.js';

const root=new URL('../',import.meta.url),loader=new GLTFLoader();
const expected=['yuletide','halloween','coast','canyon','orbital'];
test('five Blender venues include two holiday themes and appear in every arena picker and online rotation',()=>{
 assert.deepEqual(BLENDER_ARENA_IDS,expected);
 assert.equal(ARENAS.yuletide.holiday,'Christmas');assert.equal(ARENAS.halloween.holiday,'Halloween');
 const html=fs.readFileSync(new URL('dist/index.html',root),'utf8');
 for(const picker of ['arena-select','room-arena','party-arena','party-live-arena']){
  const section=html.match(new RegExp('<select id="'+picker+'"[^>]*>(.*?)</select>','s'))?.[1];
  assert.ok(section,picker);
  for(const id of ARENA_IDS)assert.equal((section.match(new RegExp('value="'+id+'"','g'))||[]).length,1,picker+' omits or duplicates '+id);
 }
 const seen=new Set(ARENA_IDS.map((_,i)=>randomArena(null,()=> (i+.5)/ARENA_IDS.length)));
 for(const id of expected)assert.ok(seen.has(id));
});

for(const id of expected){
 const bytes=fs.readFileSync(new URL('dist/assets/maps/'+id+'.glb',root));
 const report=JSON.parse(fs.readFileSync(new URL('dist/assets/maps/'+id+'.json',root)));
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 const gltf=await new Promise((resolve,reject)=>loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
 test(id+' is a complete, self-contained Blender asset with editable source and a bounded phone rendering cost',()=>{
  assert.equal(validateOriginalArena(gltf.scene,id),true);
  assert.equal(report.id,id);assert.equal(report.license,'MIT');assert.equal(report.originalArtwork,true);
  assert.match(report.blenderVersion,/^\d+\.\d+\.\d+/);assert.ok(report.sourceProps>800);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);assert.equal(bytes.length,report.bytes);
  assert.ok(bytes.length<4_000_000);assert.equal(doc.images?.length||0,0);
  assert.ok(doc.buffers.every(buffer=>!buffer.uri));assert.ok(doc.materials.length<=18);
  assert.ok(fs.statSync(new URL(report.sourceBlend,root)).size>50_000);
  const cover=fs.readFileSync(new URL('dist/assets/maps/'+ARENAS[id].cover,root));
  assert.equal(cover.subarray(8,12).toString(),'WEBP');assert.ok(cover.length<180_000);
  const calibration=gltf.scene.getObjectByName('Pitch_Center');calibration.position.x=1;
  assert.throws(()=>validateOriginalArena(gltf.scene,id),/calibration/);calibration.position.x=0;
  const a=makeOriginalArenaEnvironment(id,gltf.scene),b=makeOriginalArenaEnvironment(id,gltf.scene);
  assert.notEqual(a.root,b.root);assert.equal(a.id,id);a.setQuality('low');a.update(10);
 });
 test(id+' scenery leaves the complete pitch, ceiling and both goal rooms clear and has finite mesh data',()=>{
  let triangles=0,meshes=0;const point=new T.Vector3();gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(node=>{
   if(!node.isMesh)return;meshes++;
   const geometry=node.geometry,position=geometry.attributes.position;
   triangles+=(geometry.index?.count||position.count)/3;
   assert.equal(node.userData.venue,id);assert.equal(node.userData.originalArtwork,true);
   for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld);
    assert.ok(point.toArray().every(Number.isFinite));
    const aboveFloor=point.y>.05,
     inPitch=aboveFloor&&point.y<C.height+.5&&Math.abs(point.x)<C.halfWidth&&Math.abs(point.z)<C.halfLength,
     inGoal=aboveFloor&&point.y<C.goalHeight+.3&&Math.abs(point.x)<C.goalWidth+.3&&Math.abs(point.z)>=C.halfLength&&Math.abs(point.z)<C.halfLength+C.goalDepth+.3;
    assert.ok(!inPitch&&!inGoal,id+' decoration obstructs the driving enclosure: '+point.toArray());
   }
   assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  });
  assert.ok(meshes<=18);assert.equal(triangles,report.triangles);assert.ok(triangles<75_000);
  assert.ok(!doc.nodes.some(node=>node.name?.startsWith('Preview')),'Preview pitch was exported into the game');
 });
}
