import test from 'node:test';import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {C,Simulation,createPads} from '../dist/physics.js';
import {MotionBuffer} from '../dist/motion.js';
import {AdaptiveGraphics,graphicsProfile} from '../dist/performance.js';
import {BoostPadView,ParticlePool} from '../dist/rendering.js';
import {buildArena} from '../dist/scene.js';
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('render interpolation blends positions and shortest-path rotation without changing physics',()=>{
 const sim=new Simulation({mode:'free'});sim.cars[0].p.set(0,1,0);const motion=new MotionBuffer(sim);sim.cars[0].p.z=.2;sim.cars[0].q.setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);sim.cars[0].v.z=10;motion.capture();const state=motion.sample(.5),position=state.cars[0].p;near(position[2],.1);near(sim.cars[0].p.z,.2);const forward=new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion().fromArray(state.cars[0].q));near(forward.x,Math.SQRT1_2);assert.equal(motion.sample(.75),state);assert.equal(motion.sample(1).cars[0].p,position);near(position[2],.2);
});
test('rendering stays evenly spaced on 72 Hz and 144 Hz displays with 120 Hz physics',()=>{
 for(const hz of [72,144]){const sim=new Simulation({mode:'free'});sim.cars[0].p.set(0,1,0);const motion=new MotionBuffer(sim);let accumulator=0,last;for(let frame=0;frame<100;frame++){accumulator+=1/hz;while(accumulator>=C.step){sim.cars[0].p.z+=10*C.step;motion.capture();accumulator-=C.step;}const z=motion.sample(accumulator/C.step).cars[0].p[2];if(frame>3)near(z-last,10/hz);last=z;}}
});
test('practice resets, respawns and phase transitions snap instead of sweeping through the arena',()=>{
 const sim=new Simulation({mode:'free'}),motion=new MotionBuffer(sim);sim.cars[0].p.x+=20;motion.capture();near(motion.sample(.1).cars[0].p[0],sim.cars[0].p.x);sim.phase='kickoff';sim.cars[0].p.x+=1;motion.capture();near(motion.sample(.1).cars[0].p[0],sim.cars[0].p.x);motion.reset(sim);near(motion.sample(0).cars[0].p[0],sim.cars[0].p.x);
});
test('20 Hz replays interpolate smoothly and never mutate the recorded frames',()=>{
 const sim=new Simulation({mode:'free'}),motion=new MotionBuffer(sim),a=sim.snapshot();sim.cars[0].p.x+=2;sim.ball.p.z+=4;const b=sim.snapshot(),original=JSON.stringify([a,b]),state=motion.sampleReplay([a,b],.25);near(state.cars[0].p[0],a.cars[0].p[0]+.5);near(state.ball.p[2],a.ball.p[2]+1);assert.notEqual(state.cars[0].p,a.cars[0].p);motion.sampleReplay([a,b],.8);assert.equal(JSON.stringify([a,b]),original);motion.capture(sim);near(motion.sample(1).cars[0].p[0],sim.cars[0].p.x);
});
test('Auto reduces sustained overload, recovers slowly and ignores hidden-tab gaps',()=>{
 const graphics=new AdaptiveGraphics();for(let i=0;i<240;i++)graphics.observe(1/30);assert.ok(graphics.scale<.9&&graphics.scale>=.6);assert.equal(graphics.profile.shadows,false);assert.equal(graphics.profile.seats,false);const low=graphics.scale;for(let i=0;i<120;i++)graphics.observe(1/60);assert.equal(graphics.scale,low);for(let i=0;i<1000;i++)graphics.observe(1/60);assert.ok(graphics.scale>low&&graphics.scale<=1);graphics.setMode('auto');for(let i=0;i<20;i++)graphics.observe(10);assert.equal(graphics.scale,1);const overloaded=new AdaptiveGraphics();for(let i=0;i<40;i++)overloaded.observe(.2);assert.ok(overloaded.scale<1,'Very slow visible frames must also trigger adaptation');
});
test('manual graphics levels stay fixed and only High enables realtime shadows',()=>{
 for(const mode of ['low','balanced','high']){const graphics=new AdaptiveGraphics(mode),before=graphics.profile;for(let i=0;i<1000;i++)graphics.observe(1/20);assert.deepEqual(graphics.profile,before);}assert.equal(graphicsProfile('balanced').scale,1);assert.equal(graphicsProfile('high').shadows,true);assert.equal(graphicsProfile('low').seats,false);
});
test('34 boost pads use three instanced draws and still show pickups and respawns',()=>{
 const scene=new T.Scene(),pads=createPads(),view=new BoostPadView(scene,pads);assert.equal(scene.children.length,3);assert.ok(scene.children.every(o=>o.isInstancedMesh&&o.count===34));const matrix=new T.Matrix4(),position=new T.Vector3();view.bases.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);near(position.x,pads[0].p.x,1e-5);near(position.z,pads[0].p.z,1e-5);pads[0].timer=4;view.update(pads,1);view.orbs.getMatrixAt(0,matrix);near(matrix.determinant(),0);pads[0].timer=0;view.update(pads,2);view.orbs.getMatrixAt(0,matrix);assert.ok(matrix.determinant()>0);const color=new T.Color();view.rings.getColorAt(0,color);near(color.r,1);
});
test('impact effects reuse one bounded mesh through repeated goals and collisions',()=>{
 const scene=new T.Scene(),pool=new ParticlePool(scene,128),geometry=pool.mesh.geometry,material=pool.mesh.material;pool.spawn([0,1,0],'#ffbb44',500);assert.equal(pool.count,128);pool.update(1/60);assert.equal(pool.mesh.count,128);assert.ok([...pool.mesh.instanceMatrix.array].every(Number.isFinite));pool.update(5);assert.equal(pool.count,0);for(let i=0;i<10;i++){pool.spawn([1,1,1],'#55aaff',70);pool.update(2);}assert.equal(scene.children.length,1);assert.equal(pool.mesh.geometry,geometry);assert.equal(pool.mesh.material,material);
});
test('batched pitch retains its geometry with fewer than forty draws and no shadow casters',()=>{
 const context=new Proxy({},{get:()=>()=>{}});globalThis.document={createElement:()=>({getContext:()=>context})};try{const scene=new T.Scene();buildArena(scene);let calls=0,triangles=0,casters=0;scene.traverse(o=>{if(o.isMesh||o.isLine){calls+=Array.isArray(o.material)?o.geometry.groups.length:1;if(o.castShadow)casters++;if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});assert.ok(calls<=40,`${calls} calls`);assert.equal(casters,0);assert.ok(triangles>13000);}finally{delete globalThis.document;}
});
