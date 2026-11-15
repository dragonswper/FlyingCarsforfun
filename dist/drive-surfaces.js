import * as T from './vendor/three.module.js';
import {C,arenaOutline} from './constants.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {freezeStaticTransforms} from './rendering.js';

export function buildDriveSurfaces(parent){
 const root=new T.Group();root.name='Driveable_Roof_And_Goal_Transitions';parent.add(root);
 const pieces=[],points=[],outline=arenaOutline(),material=new T.MeshStandardMaterial({color:'#a1bfd0',roughness:.65,metalness:.12,transparent:true,opacity:.13,side:T.DoubleSide,depthWrite:false});
 function ramp(a,b,radius,ceiling,upper){
  const tangent=new T.Vector3(b[0]-a[0],0,b[1]-a[1]).normalize(),normal=new T.Vector3(-tangent.z,0,tangent.x);
  if(normal.dot(new T.Vector3(-a[0],0,-a[1]))<0)normal.negate();const vertices=[],indices=[];
  for(let i=0;i<=16;i++){
   const angle=i/16*Math.PI/2,distance=upper?radius*(1-Math.cos(angle)):radius*(1-Math.sin(angle)),height=upper?ceiling-radius+radius*Math.sin(angle):radius*(1-Math.cos(angle));
   for(const p of [a,b])vertices.push(p[0]+normal.x*distance,height,p[1]+normal.z*distance);
   if(i<16){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();pieces.push(g);
 }
 for(let i=0;i<outline.length;i++)ramp(outline[i],outline[(i+1)%outline.length],C.ceilingRamp,C.height,true);
 for(const sign of [-1,1]){
  const front=sign*C.halfLength,back=sign*(C.halfLength+C.goalDepth),segments=[[[ -C.goalWidth,front],[-C.goalWidth,back]],[[C.goalWidth,front],[C.goalWidth,back]],[[-C.goalWidth,back],[C.goalWidth,back]]];
  for(const [a,b]of segments){ramp(a,b,C.goalRamp,C.goalHeight,true);ramp(a,b,C.goalRamp,C.goalHeight,false);}
  const g=new T.PlaneGeometry(C.goalWidth*2,C.goalDepth);g.rotateX(Math.PI/2);g.translate(0,C.goalHeight,(front+back)/2);pieces.push(g);
  for(let x=-C.goalWidth;x<=C.goalWidth;x+=2)points.push(x,C.goalHeight,front,x,C.goalHeight,back);
 }
 const shape=new T.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const roof=new T.ShapeGeometry(shape);roof.rotateX(-Math.PI/2);roof.translate(0,C.height,0);pieces.push(roof);
 const geometry=mergeGeometries(pieces.map(g=>{if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));g.deleteAttribute('uv');return g;}),false);pieces.forEach(g=>g.dispose());
 const mesh=new T.Mesh(geometry,material);mesh.name='Visible_Ceiling_And_Goal_Ramps';mesh.receiveShadow=true;root.add(mesh);
 for(let x=-C.halfWidth+C.ceilingRamp;x<=C.halfWidth-C.ceilingRamp;x+=6)points.push(x,C.height,-C.cornerZ,x,C.height,C.cornerZ);
 for(let z=-C.halfLength+C.ceilingRamp;z<=C.halfLength-C.ceilingRamp;z+=6)points.push(-C.cornerX,C.height,z,C.cornerX,C.height,z);
 root.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3)),new T.LineBasicMaterial({color:'#b7d5e6',transparent:true,opacity:.16,depthWrite:false})));
 root.userData.dimensions={ceiling:C.height,ceilingRamp:C.ceilingRamp,goalCeiling:C.goalHeight,goalRamp:C.goalRamp};freezeStaticTransforms(root);return root;
}
