import {Vector3} from './vendor/three.module.js';

export const driverName=(car,localId=0)=>car?.id===localId?'YOU':car?.matchmade?'OPPONENT':car?.networkRole==='host'?'HOST':car?.networkRole==='guest'?'GUEST':car?.team?([1,2].includes(car.id)?'ACE':'FLUX'):'NOVA';

// Keep the two local mode families separate while retaining the last selection.
export function setupLobby(settings,{save,sync},root=document){
 const node=id=>root.getElementById(id),lobby=node('lobby');
 let lastMatch=['duel','doubles'].includes(settings.mode)?settings.mode:'duel';
 let lastPractice=['free','training'].includes(settings.mode)?settings.mode:'free';
 const rows=[...root.querySelectorAll('.main-menu .menu-row')];
 const help={
  'open-online':'Find a real opponent. After 60 seconds without a connection, play against a bot.',
  'open-play':'Play an exhibition match against bots.',
  'open-multiplayer':'Host a private match or join a friend with a room code.',
  'open-training':'Practice freely or work on shooting, aerials and saves.',
  'garage-button':'Customize your vehicle.',
  'career-button':'View your local stats and recent matches.',
  'settings-button':'Adjust camera, controls, interface, video and audio.',
  'controls-button':'Learn the controls for driving, jumping and flying.'
 };
 function home(focus=false){
  if(['duel','doubles'].includes(settings.mode))lastMatch=settings.mode;else lastPractice=settings.mode;
  lobby.dataset.screen='home';node('home-screen').hidden=false;node('play-screen').hidden=true;
  if(focus)node('open-play').focus();
 }
 function open(practice){
  settings.mode=practice?lastPractice:lastMatch;save();sync();
  lobby.dataset.screen='play';node('home-screen').hidden=true;node('play-screen').hidden=false;
  root.querySelector(`[data-mode="${settings.mode}"]`)?.focus();
 }
 node('open-play').addEventListener('click',()=>open(false));node('open-training').addEventListener('click',()=>open(true));node('play-back').addEventListener('click',()=>home(true));
 for(const row of rows){
  const select=()=>{for(const other of rows)other.classList.toggle('menu-selected',other===row);node('menu-help').textContent=help[row.id];};
  row.addEventListener('pointerenter',select);row.addEventListener('focus',select);
  row.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.code))return;e.preventDefault();const index=rows.indexOf(row),next=e.code==='Home'?0:e.code==='End'?rows.length-1:(index+(e.code==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[next].focus();});
 }
 root.addEventListener('keydown',e=>{if(e.code==='Escape'&&!lobby.hidden&&lobby.dataset.screen==='play'&&!root.querySelector('dialog[open]')){e.preventDefault();home(true);}});
 home();return {home};
}

// Four pooled labels follow the interpolated render poses, not 120 Hz physics steps.
// Reuse the same elements and vector; no raycasts, textures or WebGL draw calls.
export class NameplateLayer{
 constructor(container){this.container=container;this.point=new Vector3();this.labels=[];for(let i=0;i<4;i++){const label=container.ownerDocument.createElement('div');label.className='nameplate';label.hidden=true;container.append(label);this.labels.push(label);}}
 update(view,sim,replay=false,enabled=true){
  const {width,height}=view.viewport;
  for(let i=0;i<this.labels.length;i++){
   const label=this.labels[i],car=sim.cars[i],model=car&&view.cars.get(car.id);
   if(!enabled||!model?.root.visible||(!replay&&car.id===(view.localPlayerId||0))){if(!label.hidden)label.hidden=true;continue;}
   this.point.copy(model.root.position);this.point.y+=.95;this.point.project(view.camera);
   if(this.point.z< -1||this.point.z>1||Math.abs(this.point.x)>1||Math.abs(this.point.y)>1){if(!label.hidden)label.hidden=true;continue;}
   const name=driverName(car,view.localPlayerId||0);if(label.textContent!==name)label.textContent=name;
   label.classList.toggle('orange-name',car.team===1);if(label.hidden)label.hidden=false;
   label.style.transform=`translate3d(${(this.point.x*.5+.5)*width}px,${(-this.point.y*.5+.5)*height}px,0) translate(-50%,-100%)`;
  }
 }
 hide(){for(const label of this.labels)label.hidden=true;}
}
