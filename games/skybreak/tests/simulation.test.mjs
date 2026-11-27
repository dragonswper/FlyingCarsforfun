/* Gameplay checks with real Babylon scene graphs/rays and NullEngine.
   This verifies simulation, not WebGL visuals, browser input, or GPU speed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const module = { exports: {} };
vm.runInNewContext(fs.readFileSync(new URL('dist/vendor/babylon.js', root), 'utf8'), { module, exports: module.exports, console, setTimeout, clearTimeout, setInterval, clearInterval, performance, TextDecoder, TextEncoder, URL }, { filename: 'babylon.js' });
const B = module.exports;
const window = { BABYLON: B, devicePixelRatio: 1 };
const document = { pointerLockElement: null };
vm.runInNewContext(fs.readFileSync(new URL('dist/world.js', root), 'utf8'), { window, document, console, Math, Set }, { filename: 'world.js' });
function world(t, mode = 'practice') {
  const w = Object.create(window.RiftWorld.prototype);
  Object.assign(w, { engine: new B.NullEngine({ renderWidth: 1024, renderHeight: 768 }), canvas: {}, settings: { mode, outfit: 'violet', quality: 'low' }, keys: new Set(), callbacks: {}, listeners: [], time: 0 });
  w.start({ mode });
  t.after(() => { w.scene?.dispose(); w.engine.dispose(); });
  return w;
}
function steps(w, count, dt = 1 / 60) { for (let i = 0; i < count && w.running; i++) w.update(dt); }

test('three distinct modes initialize and practice stays safe', t => {
  const w = world(t);
  assert.equal(w.bots.length, 7); assert.equal(w.targets.length, 0); assert.equal(w.wood, 300);
  w.callbacks.onState = state => { w.observed = state; };
  steps(w, 600);
  assert.equal(w.health, 100); assert.equal(w.shield, 50); assert.equal(w.storm.isVisible, false);
  w.start({ mode: 'skybreak' });
  assert.equal(w.bots.length, 0); assert.equal(w.targets.length, 8); assert.equal(w.storm.isVisible, false);
  let result; w.callbacks.onEnd = r => { result = r; }; w.elapsed = 179.99; w.update(.02);
  assert.equal(result.won, false); assert.equal(result.mode, 'skybreak');
  w.start({ mode: 'skirmish' }); assert.equal(w.storm.isVisible, true); assert.equal(w.bots.length, 7);
});

test('movement is normalized, bounds hold, jump returns to ground and pause is stable', t => {
  const w = world(t); w.obstacles = []; w.updateBots = () => {};
  w.hero.root.position.set(0, 0, -20); w.keys.add('KeyW'); steps(w,60);
  const straight = w.hero.root.position.z + 20;
  w.hero.root.position.set(0,0,-20); w.keys.add('KeyD'); steps(w,60);
  assert.ok(Math.abs(Math.hypot(w.hero.root.position.x,w.hero.root.position.z+20)-straight)<.001);
  w.keys.clear();w.keys.add('Space');steps(w,1);w.keys.clear();steps(w,10);
  assert.ok(w.hero.root.position.y>0.5);steps(w,90);assert.equal(w.hero.root.position.y,0);
  w.hero.root.position.set(70,0,0);w.keys.add('KeyD');steps(w,120);assert.ok(Math.hypot(w.hero.root.position.x,w.hero.root.position.z)<=71);
  w.pause();assert.equal(w.paused,true);assert.equal(w.keys.size,0);w.resume();assert.equal(w.paused,false);
});

test('weapons preserve separate magazines, reload spends reserve, harvesting supplies wood', t => {
  const w = world(t); w.obstacles=[];
  w.ammo=10;w.equip(2);assert.equal(w.weapon,'shotgun');assert.equal(w.ammo,6);
  w.ammo=2;w.reload();steps(w,115);assert.equal(w.ammo,6);assert.equal(w.reserve,26);
  w.equip(1);assert.equal(w.ammo,10);assert.equal(w.reserve,144);
  w.ammo=0;w.reload();steps(w,90);assert.equal(w.ammo,24);assert.equal(w.reserve,120);
  w.equip(3);w.harvestables=[{x:0,z:-18,r:1,remaining:100}];w.hero.root.position.set(0,0,-20);
  const wood=w.wood;w.harvest();assert.equal(w.wood,wood+20);assert.equal(w.ammo,0);
});

test('builds cost wood, duplicate placement is rejected, ramps and elevated floors support walking', t => {
  const w=world(t);w.obstacles=[];w.bots.forEach(b=>b.root.dispose());w.bots=[];
  w.hero.root.position.set(0,0,-5);w.yaw=0;w.buildType='ramp';w.building=true;w.placeBuild();
  assert.equal(w.builds.length,1);assert.equal(w.wood,280);
  w.buildCooldown=0;w.placeBuild();assert.equal(w.builds.length,1);assert.equal(w.wood,280);
  w.hero.root.position.set(0,0,-2);w.building=false;w.keys.add('KeyW');steps(w,20);w.keys.clear();
  assert.ok(w.hero.root.position.y>1);const height=w.hero.root.position.y;
  w.keys.add('Space');steps(w,1);w.keys.clear();steps(w,10);assert.ok(w.hero.root.position.y>height+.5);
  steps(w,80);assert.ok(Math.abs(w.hero.root.position.y-w.supportHeight(w.hero.root.position.x,w.hero.root.position.z))<.1);
  w.hero.root.position.set(0,3.8,0);w.buildType='floor';w.buildCooldown=0;w.placeBuild();
  const floor=w.builds.at(-1);assert.equal(floor.type,'floor');assert.equal(floor.base,3.8);
  assert.ok(w.supportHeight(floor.x,floor.z,5)>3.8);
});

test('thin wall collision respects rotation, footprint and elevation', t => {
  const w=world(t);w.obstacles=[{type:'wall',x:0,z:0,base:0,angle:0,r:2.5}];
  assert.equal(w.validPosition(0,0),false);assert.equal(w.validPosition(0,1.5),true);
  assert.equal(w.validPosition(3.5,0),true);assert.equal(w.validPosition(0,0,.65,null,4.2),true);
  w.obstacles[0].angle=Math.PI/2;assert.equal(w.validPosition(0,1.5),false);assert.equal(w.validPosition(1.5,0),true);
});

test('real ray picking damages target and cover stops shots', t => {
  const w=world(t,'skybreak'); const target=w.targets[0]; const p=target.root.position;
  w.hero.root.position.set(p.x,p.y-1.35,p.z-5);w.camera.position.set(p.x,p.y,p.z-7);w.camera.setTarget(p);w.yaw=0;
  w.scene.render();w.shoot();assert.equal(target.alive,false);assert.equal(w.targetsHit,1);assert.equal(w.ammo,23);
  const other=w.targets[1],q=other.root.position;
  w.hero.root.position.set(q.x,q.y-1.35,q.z-5);w.camera.position.set(q.x,q.y,q.z-7);w.camera.setTarget(q);w.shotCooldown=0;
  const wall=w.box('test cover',[4,4,.3],[q.x,2,q.z-3],w.mats.wood);wall.metadata={blocker:true};w.scene.render();w.shoot();
  assert.equal(other.alive,true);assert.equal(w.ammo,22);
});

test('eight real target hits finish the challenge and replay resets state', t => {
  const w=world(t,'skybreak');let result;w.callbacks.onEnd=r=>{result=r;};
  // Isolate target-only rays while retaining actual geometry and pickWithRay.
  for(const mesh of w.scene.meshes)if(mesh.metadata?.blocker)mesh.isPickable=false;
  for(const target of w.targets){const p=target.root.position;w.hero.root.position.set(p.x,p.y-1.35,p.z-5);w.camera.position.set(p.x,p.y,p.z-7);w.camera.setTarget(p);w.shotCooldown=0;w.scene.render();w.shoot();}
  assert.equal(w.targetsHit,8);assert.equal(w.running,false);assert.equal(result.won,true);assert.equal(result.targetsHit,8);
  w.start({mode:'skybreak'});assert.equal(w.targetsHit,0);assert.equal(w.ammo,24);assert.equal(w.builds.length,0);assert.equal(w.keys.size,0);
});

test('shield, storm health damage and bot victory have distinct outcomes', t => {
  const w=world(t,'skirmish');w.takeDamage(20);assert.equal(w.shield,30);assert.equal(w.health,100);
  w.takeDamage(7,true);assert.equal(w.health,93);assert.equal(w.shield,30);
  let result;w.callbacks.onEnd=r=>{result=r;};for(const b of w.bots)w.damageBot(b,1000,true);
  assert.equal(result.won,true);assert.equal(result.kills,7);assert.equal(w.running,false);
});

test('practice respawns replace disposed actors instead of growing the bot list',t=>{
  const w=world(t);w.updateBots=()=>{};
  for(let i=0;i<4;i++){const b=w.bots[0];w.damageBot(b,1000,true);steps(w,215);assert.equal(w.bots.length,7);assert.equal(w.bots.filter(b=>b.alive).length,7);}
});
