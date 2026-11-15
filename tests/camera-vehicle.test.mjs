import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {makeFennecModel, makeBottledModel, makeCustomModel} from '../dist/vehicles.js';
import {CUSTOM_BODY_FILES} from '../dist/bodies.js';
import {NOVELTY_A_FILES, makeNoveltyAModel} from '../dist/novelty-assets-a.js';
import {makeCarModel} from '../dist/scene.js';
import {VehicleCameraGuard} from '../dist/camera-vehicle.js';
import {ChaseCamera} from '../dist/camera.js';
import {CAMERA_DEFAULTS,verticalFov} from '../dist/preferences.js';

const loader=new GLTFLoader();
for(const name of ['HEADLESS_TEXTURES','EXT_texture_webp'])loader.register(()=>({name,loadTexture(){return Promise.resolve(new T.Texture());}}));
async function load(name,path='models/'){
 const bytes=fs.readFileSync(new URL('../dist/assets/'+path+name+'.glb',import.meta.url));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.animations=gltf.animations;return gltf.scene;
}
const [fennec,bottled]=await Promise.all([load('fennec'),load('bottled')]);
const p=new T.Vector3(0,2.02,0),q=new T.Quaternion(),ball=new T.Vector3(0,.9315,1);
const values=model=>{
 const materials=new Set();model.root.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);});
 return [...materials].map(material=>({opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite}));
};

test('clearance uses the actual Fennec body and wheels without including the exhaust effect',()=>{
 const model=makeFennecModel('#299bff',fennec),guard=new VehicleCameraGuard(model);
 const actual=new T.Box3().setFromObject(model.visual);
 assert.ok(guard.bounds.containsBox(actual));assert.ok(guard.bounds.min.z>-.95);
 assert.ok(guard.radius>1.4&&guard.radius<1.6);
 model.flame.scale.setScalar(10);model.root.updateMatrixWorld(true);
 const withLargeExhaust=new VehicleCameraGuard(model);
 assert.equal(withLargeExhaust.radius,guard.radius);
});

test('every imported and procedural vehicle supplies usable camera clearance without changing its material finish',async()=>{
 const models=[makeCarModel('#299bff','striker'),makeCarModel('#299bff','rally')];
 for(const [id,file]of Object.entries(CUSTOM_BODY_FILES))models.push(makeCustomModel(id,'#299bff',await load(file.slice(0,-4))));
 for(const [id,file]of Object.entries(NOVELTY_A_FILES))models.push(makeNoveltyAModel(id,'#299bff',await load(file.slice(0,-4),'')));
 for(const model of models){
  const before=values(model),guard=new VehicleCameraGuard(model);
  assert.ok(Number.isFinite(guard.radius)&&guard.radius>.5&&guard.radius<6,model.kind+' has invalid clearance '+guard.radius);
  assert.deepEqual(values(model),before);
 }
});

test('the real Fennec on a close ball obstructs its sightline and fades locally while the opponent stays opaque',()=>{
 const own=makeFennecModel('#299bff',fennec),opponent=makeFennecModel('#ff9345',fennec);
 const guard=new VehicleCameraGuard(own),other=values(opponent),original=values(own),camera=new ChaseCamera();
 camera.sample(p,q,ball,CAMERA_DEFAULTS,true,1/60,{cameraRadius:guard.radius});
 own.root.position.copy(p);own.root.updateMatrixWorld(true);
 const ray=new T.Raycaster(camera.position,ball.clone().sub(camera.position).normalize(),0,camera.position.distanceTo(ball));
 assert.ok(ray.intersectObject(own.visual,true).length>0,'The regression must exercise a real blocked sightline');
 for(let frame=0;frame<60;frame++)guard.update(camera.position,ball,p,q,true,1/120);
 assert.equal(guard.opacity,.18);assert.ok(own.paint.transparent);assert.equal(own.paint.depthWrite,false);
 assert.deepEqual(values(opponent),other);
 for(let frame=0;frame<120;frame++)guard.update(camera.position,new T.Vector3(0,.9315,10),p,q,true,1/120);
 assert.equal(guard.opacity,1);assert.deepEqual(values(own),original);
});

test('short-distance ball cam and opposite-mode transitions keep the eye and near-plane corners outside a flipping model',()=>{
 const guard=new VehicleCameraGuard(makeFennecModel('#299bff',fennec)),camera=new ChaseCamera(),render=new T.PerspectiveCamera();
 const settings={...CAMERA_DEFAULTS,distance:100,height:40},inverse=new T.Quaternion(),point=new T.Vector3();
 render.aspect=16/9;render.near=.08;render.fov=verticalFov(110,render.aspect);render.updateProjectionMatrix();
 for(let frame=0;frame<240;frame++){
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(frame*.07,frame*.03,frame*.04));
  camera.sample(p,rotation,ball,settings,frame%50<25,1/120,{cameraRadius:guard.radius});
  assert.ok(camera.position.distanceTo(p)>=guard.radius-1e-6);
  render.position.copy(camera.position);render.lookAt(camera.look);render.updateMatrixWorld(true);inverse.copy(rotation).invert();
  for(const x of [-1,1])for(const y of [-1,1]){
   point.set(x,y,-1).unproject(render).sub(p).applyQuaternion(inverse);
   assert.equal(guard.bounds.containsPoint(point),false,'The near plane cuts through the visual model');
  }
 }
});

test('obstruction checks use the rendered vehicle orientation and fading is independent of display rate',()=>{
 const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,1,1).normalize(),1.3),results=[];
 for(const hz of [30,60,144,240]){
  const guard=new VehicleCameraGuard(makeFennecModel('#299bff',fennec));
  const eye=new T.Vector3(0,1.14,-2.7).applyQuaternion(rotation).add(p),target=new T.Vector3(0,-1.09,1).applyQuaternion(rotation).add(p);
  for(let frame=0;frame<hz/2;frame++)guard.update(eye,target,p,rotation,true,1/hz);
  results.push(guard.opacity);
 }
 for(const opacity of results)assert.equal(opacity,.18);
});

test('trapped-camera protection and menu/spectator restoration preserve a transparent vehicle material',()=>{
 const model=makeBottledModel('#299bff',bottled),guard=new VehicleCameraGuard(model),original=values(model);
 assert.ok(original.some(material=>material.transparent&&!material.depthWrite));
 guard.update(p,ball,p,q,true,1/60);assert.equal(guard.opacity,0);
 assert.ok(values(model).every(material=>material.opacity===0));
 guard.restore();assert.equal(guard.opacity,1);assert.deepEqual(values(model),original);
 guard.update(new T.Vector3(0,3,-2.7),new T.Vector3(0,1,10),p,q,false,1/60);
 assert.equal(guard.opacity,1);assert.deepEqual(values(model),original);
});

test('a continuous camera near walls and roofs hides the local body whenever its near plane cannot clear it',()=>{
 const guard=new VehicleCameraGuard(makeFennecModel('#299bff',fennec)),camera=new ChaseCamera();
 for(const position of [new T.Vector3(40.4,5,0),new T.Vector3(0,20.1,0),new T.Vector3(0,6.1,56)]){
  camera.reset();
  for(let frame=0;frame<260;frame++){
   camera.stick(.5,Math.sin(frame*.03)*.3,false);
   camera.sample(position,q,ball,{...CAMERA_DEFAULTS,lookStyle:'free',distance:100,height:40},false,1/120,{cameraRadius:guard.radius});
   const opacity=guard.update(camera.position,ball,position,q,false,1/120),eye=camera.position.clone().sub(position);
   if(guard.nearBounds.containsPoint(eye))assert.equal(opacity,0,'The local body covers a trapped camera');
  }
 }
});
