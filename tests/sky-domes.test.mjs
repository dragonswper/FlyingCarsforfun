import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import * as T from '../dist/vendor/three.module.js';import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {ARENA_IDS} from '../dist/arenas.js';
import {SKY_STYLES,SKY_RADIUS,ArenaSkyDome,loadArenaSky,disposeSkyAssets,validateSkyGeometry} from '../dist/sky-dome.js';
const base=new URL('../dist/assets/skies/',import.meta.url),report=JSON.parse(fs.readFileSync(new URL('sky-domes.json',base))),bytes=fs.readFileSync(new URL('sky-dome.glb',base));
const template=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
const geometry=template.getObjectByName('Original_Sky_Dome').geometry;

test('all fourteen arenas have distinct original Blender skies with complete source and bounded downloads',()=>{
 assert.deepEqual(Object.keys(SKY_STYLES),ARENA_IDS);assert.deepEqual(report.arenas,ARENA_IDS);assert.equal(report.license,'MIT');assert.equal(report.originalArtwork,true);
 assert.ok(fs.statSync(new URL('../art/sky-domes.blend',import.meta.url)).size>100000);assert.match(fs.readFileSync(new URL('../scripts/create-sky-domes.py',import.meta.url),'utf8'),/bpy\.ops\.export_scene\.gltf/);
 assert.equal(report.files.length,ARENA_IDS.length+1);const hashes=new Set();let total=0;
 for(const entry of report.files){const file=fs.readFileSync(new URL(entry.file,base));assert.equal(file.length,entry.bytes);assert.equal(createHash('sha256').update(file).digest('hex'),entry.sha256);hashes.add(entry.sha256);total+=file.length;
  if(entry.file.endsWith('.webp')){assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WEBP');assert.equal(file.toString('ascii',12,16),'VP8 ');assert.equal(file.readUInt16LE(26)&0x3fff,1024);assert.equal(file.readUInt16LE(28)&0x3fff,512);}
 }
 assert.equal(hashes.size,ARENA_IDS.length+1);assert.ok(total<200000);for(const id of ARENA_IDS)assert.ok(report.files.some(row=>row.file===id+'.webp'));
});
test('the actual Blender dome is a seamless UV sphere with a 960-triangle draw budget',()=>{
 assert.equal(validateSkyGeometry(geometry),true);assert.equal(geometry.index.count/3,960);assert.ok(SKY_RADIUS<360);
 const p=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<p.count;i++)if(p.getY(i)>.99)assert.equal(uv.getY(i),0,'north must sample the top of the painting');
 assert.throws(()=>validateSkyGeometry(new T.BoxGeometry()),/invalid/);assert.throws(()=>validateSkyGeometry(new T.SphereGeometry(2,16,16)),/unit sphere/);assert.throws(()=>validateSkyGeometry(null),/invalid/);
});
test('switching maps reuses one unlit background mesh and follows aerial cameras without parallax or collisions',()=>{
 const scene=new T.Scene(),sky=new ArenaSkyDome(scene),camera=new T.PerspectiveCamera(75,1,.08,360),texture=new T.Texture();
 let mesh;for(const id of ARENA_IDS){assert.equal(sky.select(id,{geometry,texture}),true);mesh??=sky.mesh;assert.equal(sky.mesh,mesh);assert.equal(sky.root.children.length,1);assert.equal(sky.root.userData.arena,id);assert.equal(sky.diagnostics().style,SKY_STYLES[id]);}
 for(const pos of [[0,2,0],[34,18,42],[-70,7,-93],[0,20,0]]){camera.position.fromArray(pos);sky.update(camera);assert.deepEqual(sky.root.position,camera.position);}
 assert.equal(sky.material.side,T.BackSide);assert.equal(sky.material.fog,false);assert.equal(sky.material.toneMapped,false);assert.equal(sky.material.depthWrite,false);assert.equal(sky.material.depthTest,false);assert.equal(sky.mesh.castShadow,false);assert.ok(sky.mesh.renderOrder<0);assert.equal(sky.mesh.frustumCulled,false);
 let disposed=0;sky.material.addEventListener('dispose',()=>disposed++);sky.dispose();assert.equal(disposed,1);assert.equal(scene.children.length,0);
});
test('sky preparation downloads the selected artwork lazily, shares requests, retries and disposes cached resources',async()=>{
 const originalGLTF=GLTFLoader.prototype.loadAsync,originalTexture=T.TextureLoader.prototype.loadAsync,requests=[],textures=[];let fail=true;
 GLTFLoader.prototype.loadAsync=async function(path){requests.push(path);return {scene:template};};
 T.TextureLoader.prototype.loadAsync=async function(path){requests.push(path);if(path.endsWith('city.webp')&&fail){fail=false;throw Error('temporary sky transfer');}const t=new T.Texture();textures.push(t);return t;};
 try{
  const [a,b,c]=await Promise.all([loadArenaSky('snow'),loadArenaSky('snow'),loadArenaSky('coast')]);assert.equal(a,b);assert.equal(a.geometry,c.geometry);assert.equal(requests.length,3);assert.ok(!requests.some(p=>p.includes('orbital')));
  assert.equal(a.texture.flipY,false);assert.equal(a.texture.colorSpace,T.SRGBColorSpace);assert.equal(a.texture.wrapS,T.RepeatWrapping);
  await assert.rejects(loadArenaSky('city'),/temporary/);assert.ok((await loadArenaSky('city')).texture);
  let disposed=0;for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);disposeSkyAssets();assert.equal(disposed,textures.length);
 }finally{GLTFLoader.prototype.loadAsync=originalGLTF;T.TextureLoader.prototype.loadAsync=originalTexture;disposeSkyAssets();}
});
