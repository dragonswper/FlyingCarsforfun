/* Champions Field architecture with a collision-aligned pitch and animated Fennec vehicles. */
import * as T from './vendor/three.module.js';
import { C, createPads, clamp } from './physics.js';
import { loadChampionsField, setStadiumQuality } from './stadium.js';
import { loadFennec, makeFennecModel, animateVehicle, disposeVehicle, disposeFennecTemplate } from './vehicles.js';
const v=(x,y,z)=>new T.Vector3(x,y,z);
const material=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.55,metalness:.18,...extra});
const teamColors=['#299bff','#ff9345'];
function mesh(scene,geometry,mat,pos=[0,0,0],rotation){const o=new T.Mesh(geometry,mat);o.position.set(...pos);if(rotation)o.rotation.set(...rotation);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;}
function box(scene,w,h,l,pos,mat){return mesh(scene,new T.BoxGeometry(w,h,l),mat,pos);}
function line(scene,points,color,opacity=1){const o=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));scene.add(o);return o;}
function tube(scene,a,b,r,mat,sides=8){const d=b.clone().sub(a),o=mesh(scene,new T.CylinderGeometry(r,r,d.length(),sides),mat,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(v(0,1,0),d.normalize());return o;}
function roundedShape(w,l,r){const s=new T.Shape(),x=-w/2,z=-l/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+l-r);s.quadraticCurveTo(x+w,z+l,x+w-r,z+l);s.lineTo(x+r,z+l);s.quadraticCurveTo(x,z+l,x,z+l-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;}
function bevelBox(root,w,h,l,pos,mat,r=.08){const g=new T.ExtrudeGeometry(roundedShape(w-.06,l-.06,r),{depth:Math.max(.01,h-.06),steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.03,bevelThickness:.03,curveSegments:3});g.rotateX(-Math.PI/2);return mesh(root,g,mat,[pos[0],pos[1]-h/2+.03,pos[2]]);}
export function makeCarModel(color='#299bff',body='striker'){
 const root=new T.Group(),paint=material(color,{metalness:.6,roughness:.28}),dark=material('#0d1726',{roughness:.45}),glass=material('#183345',{metalness:.65,roughness:.16}),chrome=material('#7b95a1',{metalness:.85,roughness:.2}),rubber=material('#121820',{roughness:.95}),stripe=material('#dbf0f2',{metalness:.35}),led=material('#97e6ff',{emissive:'#55beff',emissiveIntensity:1.8}),tail=material('#fc4e42',{emissive:'#ff281c',emissiveIntensity:1.5});
 const parts=[];box(root,.78,.14,1.65,[0,0,0],dark);
 parts.push(bevelBox(root,1.02,.28,body==='striker'?1.75:1.55,[0,.17,0],paint));
 const cabin=bevelBox(root,.75,body==='striker'?.29:.4,.72,[0,body==='striker'?.4:.44,-.12],glass,.09);
 cabin.rotation.x=body==='striker'?-.07:0;
 parts.push(bevelBox(root,.66,.045,.57,[0,body==='striker'?.55:.64,-.18],paint,.05));
 for(const x of [-.16,.16]){box(root,.09,.012,.56,[x,.315,.5],stripe);box(root,.09,.012,.5,[x,body==='striker'?.578:.67,-.18],stripe);}
 for(const x of [-.34,.34]){box(root,.24,.048,.028,[x,.22,.88],led);box(root,.24,.045,.03,[x,.22,-.88],tail);}
 box(root,.55,.11,.035,[0,.05,.9],dark);for(let i=0;i<5;i++)box(root,.025,.075,.04,[(i-2)*.1,.05,.922],chrome);
 for(const x of [-.35,.35]){box(root,.055,.22,.07,[x,.29,-.71],dark);}parts.push(bevelBox(root,1.08,.07,.23,[0,.43,-.73],paint,.03));
 const wheels=[];for(const x of [-.5,.5])for(const z of [-.54,.55]){
  const pivot=new T.Group();pivot.position.set(x,0,z);root.add(pivot);const rolling=new T.Group();pivot.add(rolling);
  const tyre=mesh(rolling,new T.CylinderGeometry(.235,.235,.17,20),rubber);tyre.rotation.z=Math.PI/2;
  const hub=mesh(rolling,new T.CylinderGeometry(.143,.143,.177,12),chrome);hub.rotation.z=Math.PI/2;
  const inner=mesh(rolling,new T.CylinderGeometry(.092,.092,.18,10),dark);inner.rotation.z=Math.PI/2;
  for(let i=0;i<5;i++){const spoke=box(rolling,.183,.032,.26,[0,0,0],stripe);spoke.rotation.x=i*Math.PI/5;}
  const fender=mesh(root,new T.TorusGeometry(.275,.037,5,18,Math.PI),paint,[x,.03,z]);fender.rotation.y=Math.PI/2;fender.rotation.z=0;
  wheels.push({pivot,rolling,front:z>0});
 }
 const flame=new T.Group();root.add(flame);for(const x of [-.24,.24]){
  const exhaust=mesh(root,new T.CylinderGeometry(.085,.095,.18,12),chrome,[x,.06,-.92]);exhaust.rotation.x=Math.PI/2;
  const f=mesh(flame,new T.ConeGeometry(.105,1,8),new T.MeshBasicMaterial({color:'#4cc7ff',transparent:true,opacity:.75}),[x,.06,-1.45]);f.rotation.x=-Math.PI/2;
  const core=mesh(flame,new T.ConeGeometry(.065,.65,8),new T.MeshBasicMaterial({color:'#e5faff'}),[x,.06,-1.26]);core.rotation.x=-Math.PI/2;
 }flame.visible=false;
 return {root,paint,wheels,flame,parts,setColor(color){paint.color.set(color);}};
}
export function makeBall(){
 const geometry=new T.IcosahedronGeometry(C.ballRadius,3),ico=new T.IcosahedronGeometry(1,0),dirs=[];for(const p of [ico.attributes.position])for(let i=0;i<p.count;i++){const point=v(p.getX(i),p.getY(i),p.getZ(i)).normalize();if(!dirs.some(d=>d.distanceTo(point)<.01))dirs.push(point);}
 const pos=geometry.attributes.position,colors=[];for(let i=0;i<pos.count;i+=3){const center=v();for(let j=0;j<3;j++)center.add(v(pos.getX(i+j),pos.getY(i+j),pos.getZ(i+j)));center.normalize();const dark=dirs.some(d=>d.dot(center)>.955);const c=new T.Color(dark?'#263546':'#d4e0df');for(let j=0;j<3;j++)colors.push(c.r,c.g,c.b);}
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));const root=new T.Group();root.add(new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.23})));
 for(let i=0;i<3;i++){const band=new T.Mesh(new T.TorusGeometry(C.ballRadius+.004,.008,4,64),material('#73dbf5',{emissive:'#2a7388',emissiveIntensity:.3}));if(i===1)band.rotation.x=Math.PI/2;if(i===2)band.rotation.y=Math.PI/2;root.add(band);}root.children.forEach(m=>m.castShadow=true);return root;
}
function fieldTexture(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 for(let i=0;i<20;i++){c.fillStyle=i%2?'#285b57':'#235450';c.fillRect(0,i*h/20,w,h/20+1);}
 // Subtle turf grain is deterministic and generated locally.
 let seed=41;for(let i=0;i<18000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%w;seed=(seed*1664525+1013904223)>>>0;const y=seed%h;c.fillStyle=i%2?'#ffffff07':'#00000009';c.fillRect(x,y,1,3);}
 const sx=w/(2*C.halfWidth),sz=h/(2*C.halfLength),x=n=>w/2+n*sx,z=n=>h/2+n*sz;
 c.lineWidth=4;c.strokeStyle='#cfe9d6a0';c.strokeRect(x(-39),z(-49),78*sx,98*sz);c.beginPath();c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.beginPath();c.ellipse(w/2,h/2,9.15*sx,9.15*sz,0,0,Math.PI*2);c.stroke();
 for(const sign of [-1,1]){c.fillStyle=sign<0?'#258aff15':'#ff9a3c15';c.fillRect(0,sign<0?0:h/2,w,h/2);c.strokeStyle=sign<0?'#47b4ffbb':'#ffad5fbb';const zz=sign<0?-C.halfLength:C.halfLength-14;c.strokeRect(x(-17),z(zz),34*sx,14*sz);const small=sign<0?-C.halfLength:C.halfLength-5;c.strokeRect(x(-C.goalWidth),z(small),C.goalWidth*2*sx,5*sz);}
 c.fillStyle='#e0f4e6';c.beginPath();c.arc(w/2,h/2,5,0,Math.PI*2);c.fill();
 c.save();c.translate(w/2,h/2+160);c.fillStyle='#daf7e414';c.textAlign='center';c.font='900 60px Arial';c.fillText('BOOST CIRCUIT',0,0);c.restore();
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;return texture;
}
const polygon=[[-40.96,-39.68],[-29.44,-51.2],[29.44,-51.2],[40.96,-39.68],[40.96,39.68],[29.44,51.2],[-29.44,51.2],[-40.96,39.68]];
function panel(scene,a,b,low,high,mat){const length=a.distanceTo(b),o=box(scene,length,high-low,.05,a.clone().add(b).multiplyScalar(.5).setY((low+high)/2).toArray(),mat);o.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);o.castShadow=false;return o;}
function roundedRamp(scene,a,b,mat){
 const tangent=b.clone().sub(a).normalize(),normal=v(-tangent.z,0,tangent.x);if(normal.dot(a.clone().negate())<0)normal.negate();const vertices=[],indices=[];
 for(let i=0;i<=12;i++){const t=i/12*Math.PI/2,d=C.ramp*(1-Math.sin(t)),height=C.ramp*(1-Math.cos(t));for(const p of [a,b])vertices.push(p.x+normal.x*d,height,p.z+normal.z*d);if(i<12){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const o=mesh(scene,g,mat);o.castShadow=false;return o;
}
export function buildArena(parent){
 const scene=new T.Group();scene.name='Calibrated_Pitch';parent.add(scene);
 const floorMat=material('#ffffff',{map:fieldTexture(),roughness:.95,metalness:0}),shape=new T.Shape();polygon.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const g=new T.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const pos=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+C.halfWidth)/(2*C.halfWidth),(C.halfLength-pos.getZ(i))/(2*C.halfLength));uv.needsUpdate=true;
 const floor=mesh(scene,g,floorMat);floor.castShadow=false;
 const dark=material('#101d2c',{roughness:.7}),glass=new T.MeshPhysicalMaterial({color:'#b5d9ee',transparent:true,opacity:.065,roughness:.12,metalness:.1,side:T.DoubleSide,depthWrite:false}),rampMat=material('#37585e',{roughness:.6,side:T.DoubleSide});
 box(scene,142,1,157,[0,-.65,0],dark);
 const wallSegments=[];
 for(let i=0;i<polygon.length;i++){
  let a=v(polygon[i][0],0,polygon[i][1]),b=v(polygon[(i+1)%polygon.length][0],0,polygon[(i+1)%polygon.length][1]);
  if(a.z===b.z&&Math.abs(a.z)===C.halfLength){const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);wallSegments.push([v(left,0,a.z),v(-C.goalWidth,0,a.z)],[v(C.goalWidth,0,a.z),v(right,0,a.z)]);panel(scene,v(-C.goalWidth,0,a.z),v(C.goalWidth,0,a.z),C.goalHeight,C.height,glass);}
  else wallSegments.push([a,b]);
 }
 for(const [a,b]of wallSegments){roundedRamp(scene,a,b,rampMat);panel(scene,a,b,C.ramp,C.height,glass);tube(scene,a.clone().setY(C.ramp),b.clone().setY(C.ramp),.035,material('#6cd4df',{emissive:'#438baf',emissiveIntensity:.5}));
  const steps=Math.ceil(a.distanceTo(b)/5);for(let i=0;i<=steps;i++){const p=a.clone().lerp(b,i/steps);tube(scene,p.clone().setY(C.ramp),p.clone().setY(C.height),.045,dark);}
  const wire=[];for(let y=3;y<=20;y+=1.3){wire.push(a.clone().setY(y),b.clone().setY(y));}
  const geom=new T.BufferGeometry().setFromPoints(wire);scene.add(new T.LineSegments(geom,new T.LineBasicMaterial({color:'#91c2ce',transparent:true,opacity:.12})));
 }
 for(const sign of [-1,1]){
  const color=sign<0?teamColors[0]:teamColors[1],emissive=material(color,{emissive:color,emissiveIntensity:1.35}),netMat=new T.LineBasicMaterial({color,transparent:true,opacity:.35}),z=sign*C.halfLength,back=sign*(C.halfLength+C.goalDepth);
  for(const x of [-C.goalWidth,C.goalWidth])tube(scene,v(x,0,z),v(x,C.goalHeight,z),.14,emissive,12);
  tube(scene,v(-C.goalWidth,C.goalHeight,z),v(C.goalWidth,C.goalHeight,z),.14,emissive,12);
  tube(scene,v(-C.goalWidth,.06,z),v(C.goalWidth,.06,z),.04,emissive);
  box(scene,C.goalWidth*2,.08,C.goalDepth,[0,-.03,(z+back)/2],material(sign<0?'#174a78':'#70442d',{roughness:.8}));
  const points=[];for(let x=-C.goalWidth;x<=C.goalWidth;x+=.6){points.push(v(x,0,back),v(x,C.goalHeight,back));points.push(v(x,C.goalHeight,z),v(x,C.goalHeight,back));}
  for(let y=0;y<=C.goalHeight;y+=.6){points.push(v(-C.goalWidth,y,back),v(C.goalWidth,y,back));for(const x of [-C.goalWidth,C.goalWidth])points.push(v(x,y,z),v(x,y,back));}
  for(let zz=Math.min(z,back);zz<=Math.max(z,back);zz+=.6){points.push(v(-C.goalWidth,C.goalHeight,zz),v(C.goalWidth,C.goalHeight,zz));for(const x of [-C.goalWidth,C.goalWidth])points.push(v(x,0,zz),v(x,C.goalHeight,zz));}
  scene.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points),netMat));
  box(scene,16,.14,.35,[0,C.goalHeight+.25,z],dark);
 }
 const pads=createPads().map(p=>{
  const root=new T.Group();root.position.copy(p.p);scene.add(root);const radius=p.big?.78:.36;
  const base=mesh(root,new T.CylinderGeometry(radius*1.25,radius*1.3,.08,12),dark,[0,-.02,0]);base.castShadow=false;
  const ring=mesh(root,new T.TorusGeometry(radius,.045,5,24),material('#ffd17a',{emissive:'#ffb444',emissiveIntensity:1.8}),[0,.06,0],[Math.PI/2,0,0]);
  const orb=mesh(root,new T.OctahedronGeometry(p.big?.35:.14),material('#ffe4a7',{emissive:'#ffbb4b',emissiveIntensity:2}),[0,p.big?.55:.22,0]);orb.castShadow=false;return{root,ring,orb};
 });
 return {pads,root:scene,field:floor};
}
export class GameView{
 constructor(canvas){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
  this.scene=new T.Scene();this.scene.background=new T.Color('#192e49');this.scene.fog=new T.Fog('#293e56',140,310);
  this.camera=new T.PerspectiveCamera(85,1,.08,360);this.camera.position.set(4,4,-12);this.scene.add(new T.HemisphereLight('#c2e9ff','#192c35',2.0));
  const sun=new T.DirectionalLight('#dcecff',2.1);sun.position.set(-35,65,-20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-64,right:64,top:70,bottom:-70,near:1,far:155});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;this.scene.add(sun);this.sun=sun;
  const warm=new T.DirectionalLight('#ffb778',.65);warm.position.set(30,18,65);this.scene.add(warm);
  this.arena=buildArena(this.scene);this.ball=makeBall();this.scene.add(this.ball);this.ballShadow=mesh(this.scene,new T.CircleGeometry(C.ballRadius,24),new T.MeshBasicMaterial({color:'#07131c',transparent:true,opacity:.35,depthWrite:false}),[0,.02,0],[-Math.PI/2,0,0]);this.ballShadow.castShadow=false;
  this.ballIndicator=mesh(this.scene,new T.RingGeometry(1.25,1.3,40),new T.MeshBasicMaterial({color:'#cceeff',transparent:true,opacity:.45,depthWrite:false}),[0,.028,0],[-Math.PI/2,0,0]);this.ballIndicator.castShadow=false;
  this.cars=new Map();this.particles=[];this.cameraMode=true;this.look=new T.Vector3();this.menuTime=0;this.spin=0;this.resize();
 }
 resize(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 quality(level){this.qualityLevel=level;setStadiumQuality(this.stadium,level);this.renderer.setPixelRatio(level==='low'?1:Math.min(window.devicePixelRatio||1,1.7));this.renderer.shadowMap.enabled=level!=='low';this.resize();}
 async loadAssets(onProgress){
  const progress=asset=>event=>onProgress?.({asset,loaded:event.loaded,total:event.total});
  const [,stadium]=await Promise.all([loadFennec(progress('vehicle')),loadChampionsField(progress('stadium'))]);this.stadium=stadium;this.scene.add(stadium);setStadiumQuality(stadium,this.qualityLevel||'high');
 }
 sync(sim,paint='#299bff',body='fennec'){
  for(const c of this.cars.values()){this.scene.remove(c.root);disposeVehicle(c);}this.cars.clear();
  for(const car of sim.cars){const chosen=car.id===0?body:'fennec',color=car.id===0?paint:teamColors[car.team];const model=chosen==='fennec'?makeFennecModel(color):makeCarModel(color,chosen);const glow=mesh(model.root,new T.TorusGeometry(.68,.022,5,32),new T.MeshBasicMaterial({color:teamColors[car.team]}),[0,-.19,0],[Math.PI/2,0,0]);glow.castShadow=false;
   this.cars.set(car.id,model);this.scene.add(model.root);}this.update(sim,0,true);
 }
 burst(position,color='#ffc478',count=25){
  for(let i=0;i<count;i++){const m=mesh(this.scene,new T.SphereGeometry(.07,4,3),new T.MeshBasicMaterial({color,transparent:true}),position);m.castShadow=false;this.particles.push({mesh:m,v:v(Math.sin(i*2.4)*(2+i%5),1+i%6,Math.cos(i*2.4)*(2+i%5)),life:.7+i%5*.1,max:1.2});}
 }
 update(sim,dt,menu=false,snapshot=null){
  this.menuTime+=dt;this.spin+=dt;
  const cars=snapshot?.cars||sim.cars.map(c=>({id:c.id,p:c.p.toArray(),q:c.q.toArray(),demo:c.demoTime>0,boosting:c.boosting}));
  for(const state of cars){
   const model=this.cars.get(state.id);if(!model)continue;
   model.root.position.fromArray(state.p);model.root.quaternion.fromArray(state.q);model.root.visible=!state.demo;
   model.flame.visible=!!state.boosting&&!menu;model.flame.scale.z=1+Math.sin(this.spin*80)*.15;
   const car=sim.cars.find(c=>c.id===state.id),speed=snapshot?(state.speed||0):(car?car.v.dot(new T.Vector3(0,0,1).applyQuaternion(car.q)):0);
   animateVehicle(model,{speed:menu?0:speed,steer:menu?0:snapshot?(state.steer||0):(car?.renderSteer||0),dt,grounded:snapshot?state.grounded!==false:car?.grounded!==false,throttle:menu?0:car?.renderThrottle||0});
  }
  this.ball.position.fromArray(snapshot?.ball.p||sim.ball.p.toArray());this.ball.quaternion.fromArray(snapshot?.ball.q||sim.ball.q.toArray());this.ballShadow.position.set(this.ball.position.x,.022,this.ball.position.z);this.ballIndicator.position.set(this.ball.position.x,.028,this.ball.position.z);this.ballIndicator.visible=!menu;const shadowScale=1+this.ball.position.y*.13;this.ballShadow.scale.setScalar(shadowScale);this.ballShadow.material.opacity=.35/(1+this.ball.position.y*.35);
  this.arena.pads.forEach((p,i)=>{const active=sim.pads[i].timer<=0;p.orb.visible=active;p.ring.material.emissiveIntensity=active?1.8:.1;p.orb.rotation.y=this.spin*1.6;p.orb.position.y=(sim.pads[i].big?.55:.22)+Math.sin(this.spin*2+i)*.045;});
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.v,dt);p.v.y-=5*dt;p.mesh.material.opacity=Math.max(0,p.life/p.max);if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);}}
  let desired,target;
  const player=this.cars.get(0),p=player.root.position,forward=v(0,0,1).applyQuaternion(player.root.quaternion);
  if(menu){const angle=this.menuTime*.07;desired=v(2.35+Math.sin(angle)*.25,1.3,-7.8);target=v(0,.48,-5);player.root.position.set(0,.24,-5);player.root.quaternion.setFromAxisAngle(v(0,1,0),Math.PI*.68);this.ball.position.set(3.8,C.ballRadius,-1.5);}
  else if(snapshot){desired=this.ball.position.clone().add(v(7,5,-10));target=this.ball.position.clone();}
  else{
   let behind=forward.clone().setY(0).normalize();
   if(this.cameraMode){const toward=this.ball.position.clone().sub(p).setY(0);if(toward.length()>2)behind=toward.normalize();}
   const speed=sim.cars[0].v.length();desired=p.clone().addScaledVector(behind,-(5.2+speed*.045)).add(v(0,2.65,0));target=p.clone().addScaledVector(behind,4).add(v(0,.8,0));
   if(this.cameraMode)target.lerp(this.ball.position,.55);
   desired.x=clamp(desired.x,-C.halfWidth+.9,C.halfWidth-.9);desired.z=clamp(desired.z,-C.halfLength-C.goalDepth+.8,C.halfLength+C.goalDepth-.8);desired.y=clamp(desired.y,1.1,C.height-.5);
  }
  const smooth=dt===0?1:1-Math.exp(-7*dt);this.camera.position.lerp(desired,smooth);this.look.lerp(target,smooth);this.camera.lookAt(this.look);this.camera.fov=T.MathUtils.lerp(this.camera.fov,menu?45:sim.cars[0].boosting?91:85,Math.min(1,dt*5));this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m?.map?.dispose();m?.dispose();});});disposeFennecTemplate();this.renderer.dispose();}
}
