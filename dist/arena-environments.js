import * as T from './vendor/three.module.js';
import {ARENAS,normalizeArena} from './arenas.js';
import {freezeStaticTransforms} from './rendering.js';
import {makeFestivalEnvironment} from './festival-assets.js';

// Small, deterministic original scenes. Repeated scenery uses GPU instancing;
// decorative solids stay outside the playing enclosure and never affect physics.
export function createArenaEnvironment(value) {
  if(value==='festival'){
    const forest=createArenaEnvironment('snow'),festival=makeFestivalEnvironment();
    // Keep the instanced forest and light strings around the supplied scenery;
    // the festival's own snow shader and imported village replace these pieces.
    for(const child of [...forest.root.children])if(['Soft_Snowfall','Village_Cabins','Cabin_Snow_Roofs','Warm_Cabin_Windows','Tree_Stars','Tree_Lights','Christmas_Presents'].includes(child.name)){
      forest.root.remove(child);child.geometry?.dispose();child.material?.dispose();
    }
    forest.root.name='Festival_Instanced_Forest';festival.root.add(forest.root);return festival;
  }
  const id=normalizeArena(value),theme=ARENAS[id],root=new T.Group();
  root.name='Environment_'+id;root.userData.arena=id;
  let seed={snow:1901,city:1902,woods:1903}[id]||1900;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const between=(a,b)=>a+random()*(b-a),groups=new Map(),matrix=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),s=new T.Vector3();
  const matte=color=>new T.MeshStandardMaterial({color,roughness:.9,metalness:0});
  const glow=color=>new T.MeshBasicMaterial({color,toneMapped:false});
  function batch(name,geometry,material){groups.set(name,{name,geometry,material,items:[]});return name;}
  function put(name,x,y,z,sx=1,sy=sx,sz=sx,yaw=0,color=null){groups.get(name).items.push({x,y,z,sx,sy,sz,yaw,color});}
  const ground=matte(id==='snow'?'#cbdde8':id==='city'?'#152638':'#3e5638');
  const plane=new T.Mesh(new T.BoxGeometry(430,1,390),ground);plane.position.y=-1.3;plane.name='Scenery_Ground';root.add(plane);
  const trunk=batch('Tree_Trunks',new T.CylinderGeometry(.45,.65,1,6),matte('#54412f')),
    pine=batch('Pine_Foliage',new T.ConeGeometry(1,1,7),matte(id==='snow'?'#305d55':'#234e3b')),
    snowCap=id==='snow'?batch('Snow_Caps',new T.ConeGeometry(1,1,7),matte('#e3f1f6')):null;
  function tree(x,z,height=between(8,17),festive=false){
    put(trunk,x,height*.2-.6,z,.65,height*.45,.65);
    for(let layer=0;layer<3;layer++){
      const y=height*(.3+layer*.22),radius=height*(.24-layer*.045),h=height*.45;
      put(pine,x,y,z,radius,h,radius);
      if(snowCap)put(snowCap,x,y+h*.1,z,radius*.83,h*.8,radius*.83);
    }
    if(festive){
      for(let j=0;j<34;j++){const t=j/34,angle=j*2.4,r=height*.23*(1-t);put('Tree_Lights',x+Math.cos(angle)*r,height*(.2+t*.65),z+Math.sin(angle)*r,.18,.18,.18,0,j%2?'#ffd994':'#ff635a');}
      put('Tree_Stars',x,height*1.04,z,.8,1.15,.8);
    }
  }
  function ringPoint(index,count,spread=0){
    const angle=index/count*Math.PI*2,r=between(0,spread);
    return [Math.sin(angle)*(69+r),Math.cos(angle)*(80+r)];
  }
  const rock=batch('Landscape_Rocks',new T.IcosahedronGeometry(1,0),matte(id==='snow'?'#adbfcc':'#737b69'));
  for(let n=0;n<32;n++){const [x,z]=ringPoint(n,32,52);put(rock,x,between(-1,1),z,between(2,6),between(2,5),between(2,6),between(0,6));}
  let particles=null;
  if(id==='snow'){
    batch('Tree_Lights',new T.SphereGeometry(1,6,4),glow('#ffffff'));
    batch('Tree_Stars',new T.OctahedronGeometry(1),glow('#ffdd91'));
    for(let n=0;n<105;n++){const [x,z]=ringPoint(n,105,58);tree(x,z);}
    tree(-27,83,19,true);tree(29,-84,18,true);
    const mountain=batch('Snowy_Mountains',new T.ConeGeometry(1,1,5),matte('#a0b7cc')),
      peaks=batch('Mountain_Snow',new T.ConeGeometry(1,1,5),matte('#e1edf4'));
    for(let n=0;n<23;n++){const a=n/23*Math.PI*2,x=Math.sin(a)*177,z=Math.cos(a)*171,h=between(38,72),r=between(22,40);put(mountain,x,h/2-1,z,r,h,r);put(peaks,x,h*.79-1,z,r*.43,h*.43,r*.43);}
    const cabin=batch('Village_Cabins',new T.BoxGeometry(1,1,1),matte('#86644f')),
      roof=batch('Cabin_Snow_Roofs',new T.ConeGeometry(1,1,4),matte('#e7f0f5')),
      windows=batch('Warm_Cabin_Windows',new T.BoxGeometry(1,1,.05),glow('#ffce85'));
    for(let n=0;n<12;n++){const [x,z]=ringPoint(n,12,27),yaw=Math.atan2(-x,-z);put(cabin,x,2.1,z,7,5,6,yaw);put(roof,x,5.4,z,6.1,3,5.4,yaw+Math.PI/4);put(windows,x+Math.sin(yaw)*3.04,2.5,z+Math.cos(yaw)*3.04,2,1.5,1,yaw);}
    const presents=batch('Christmas_Presents',new T.BoxGeometry(1,1,1),matte('#ffffff'));
    for(let n=0;n<22;n++){const sign=n%2?1:-1,x=sign*28+between(-5,5),z=-sign*83+between(-4,4);put(presents,x,.4,z,between(.7,1.6),between(.8,1.6),between(.7,1.6),between(0,6),['#c64c57','#e8c379','#386c64'][n%3]);}
    const bulbs=batch('Festive_String_Lights',new T.SphereGeometry(1,6,4),glow('#ffffff')),
      posts=batch('Light_String_Posts',new T.CylinderGeometry(.1,.14,1,5),matte('#75634f'));
    const wirePoints=[];
    for(let edge=0;edge<4;edge++){
      const corners=[[-53,-65],[53,-65],[53,65],[-53,65]],a=corners[edge],b=corners[(edge+1)%4];
      put(posts,a[0],3,a[1],1,6,1);
      for(let j=0;j<=36;j++){const t=j/36,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,y=6-Math.sin(t*Math.PI)*1.4;wirePoints.push(new T.Vector3(x,y,z));put(bulbs,x,y,z,.16,.16,.16,0,['#ffdb94','#fa7565','#85d6c4'][j%3]);}
    }
    root.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(wirePoints),new T.LineBasicMaterial({color:'#5d6c76'})));
    const points=new Float32Array(384*3);for(let n=0;n<384;n++)points.set([between(-53,53),between(1,29),between(-64,64)],n*3);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(points,3));
    const time={value:0},mat=new T.PointsMaterial({color:'#edf9ff',size:.085,transparent:true,opacity:.72,depthWrite:false});
    mat.onBeforeCompile=shader=>{shader.uniforms.snowTime=time;shader.vertexShader='uniform float snowTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y = 1.0 + mod(position.y - snowTime * 0.8, 28.0);\ntransformed.x += sin(snowTime * 0.22 + position.z) * 0.5;');};
    mat.customProgramCacheKey=()=> 'winterlight-snow-v1';particles=new T.Points(geometry,mat);particles.name='Soft_Snowfall';particles.frustumCulled=false;particles.userData.time=time;root.add(particles);
  }else if(id==='city'){
    const towers=batch('City_Towers',new T.BoxGeometry(1,1,1),matte('#ffffff')),
      windows=batch('City_Window_Lights',new T.BoxGeometry(1,1,.08),glow('#ffffff')),
      trim=batch('City_Neon_Trim',new T.BoxGeometry(1,1,1),glow('#ffffff'));
    for(let n=0;n<76;n++){
      const [x,z]=ringPoint(n,76,n<40?22:83),yaw=Math.atan2(-x,-z),w=between(7,13),d=between(7,13),h=between(12,48);
      put(towers,x,h/2-.6,z,w,h,d,yaw,['#1b2e45','#21394c','#283148','#172c40'][n%4]);
      const rows=Math.floor(h/2.2),cols=Math.floor(w/1.7);
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        if(random()<.3)continue;const lx=(col-(cols-1)/2)*1.7,lz=d/2+.06;
        put(windows,x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,1+row*2.2,z-Math.sin(yaw)*lx+Math.cos(yaw)*lz,.75,.85,1,yaw,n%3?'#80b6ce':'#e7b984');
      }
      put(trim,x,h-.55,z,w+.2,.16,d+.2,yaw,n%2?'#3fd1e0':'#e168c6');
    }
    const roads=batch('City_Avenues',new T.BoxGeometry(1,.03,1),matte('#0c1d2c')),
      strips=batch('Avenue_Lights',new T.BoxGeometry(1,.03,1),glow('#4098bb')),
      lamps=batch('Street_Lamp_Posts',new T.CylinderGeometry(.08,.12,1,5),matte('#364957')),
      heads=batch('Street_Lamp_Lights',new T.BoxGeometry(.7,.14,.7),glow('#f4d2a0'));
    for(const side of [-1,1]){
      put(roads,side*58,-.75,0,10,1,140);put(strips,side*54,-.7,0,.12,1,140);
      put(roads,0,-.75,side*71,126,1,10);put(strips,0,-.7,side*67,126,1,.12);
      for(let n=0;n<9;n++){const z=(n-4)*15;put(lamps,side*61,3,z,1,7,1);put(heads,side*61,6.5,z);}
    }
  }else if(id==='woods'){
    for(let n=0;n<180;n++){const [x,z]=ringPoint(n,180,74);tree(x,z,between(10,22));}
    const trunks=batch('Broadleaf_Trunks',new T.CylinderGeometry(.5,.9,1,6),matte('#5e4a36')),
      canopy=batch('Broadleaf_Canopies',new T.DodecahedronGeometry(1,0),matte('#ffffff'));
    for(let n=0;n<40;n++){const [x,z]=ringPoint(n,40,48),h=between(10,18);put(trunks,x,h*.3,z,1,h*.65,1);put(canopy,x,h*.77,z,5.5,h*.38,4.5,random()*6,['#4c7446','#6a854d','#395c43'][n%3]);}
    const rails=batch('Woodland_Fence',new T.BoxGeometry(1,1,1),matte('#9b855e'));
    for(const side of [-1,1])for(let n=0;n<23;n++){
      const z=(n-11)*5.5;put(rails,side*51,1,z,.35,2.5,.35);if(n<22){put(rails,side*51,1.7,z+2.75,.2,.18,5.5);put(rails,side*51,.8,z+2.75,.2,.18,5.5);}
    }
    const hills=batch('Woodland_Hills',new T.IcosahedronGeometry(1,1),matte('#486044'));
    for(let n=0;n<20;n++){const [x,z]=ringPoint(n,20,104);put(hills,x,-5,z,between(15,31),between(12,28),between(15,31));}
  }
  for(const group of groups.values()){
    if(!group.items.length){group.geometry.dispose();group.material.dispose();continue;}
    const mesh=new T.InstancedMesh(group.geometry,group.material,group.items.length);mesh.name=group.name;mesh.receiveShadow=true;
    group.items.forEach((item,i)=>{p.set(item.x,item.y,item.z);s.set(item.sx,item.sy,item.sz);q.setFromAxisAngle(T.Object3D.DEFAULT_UP,item.yaw);matrix.compose(p,q,s);mesh.setMatrixAt(i,matrix);if(item.color)mesh.setColorAt(i,new T.Color(item.color));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
  }
  freezeStaticTransforms(root);
  return {id,root,theme,setQuality(tier){if(particles)particles.geometry.setDrawRange(0,tier==='low'?96:tier==='high'?384:224);},update(time){if(particles)particles.userData.time.value=time;}};
}
