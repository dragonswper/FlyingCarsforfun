import {Simulation,C,clamp} from './physics.js';
import {GameView} from './scene.js';
import {MotionBuffer} from './motion.js';
import {Input} from './input.js';
import {BOT_LEVELS} from './bots.js';
import {normalizeCamera,normalizeControls,normalizeBindings,normalizeInterface,bindingName} from './preferences.js';
import {setupSettings} from './settings-ui.js';
import {setupLobby,NameplateLayer,driverName} from './interface.js';
import {NetworkRoom} from './network-room.js';
import {normalizeCode} from './network-protocol.js';
import {setupRoomUI} from './room-ui.js';
const $=id=>document.getElementById(id),show=(id,on)=>{$(id).hidden=!on;},text=(id,value)=>{const node=$(id),next=String(value);if(node.textContent!==next)node.textContent=next;};
const paints={blue:{hex:'#299bff',name:'ELECTRIC BLUE'},ivory:{hex:'#e8efec',name:'ARCTIC WHITE'},violet:{hex:'#a985fc',name:'ULTRAVIOLET'},mint:{hex:'#53dbbd',name:'MINT VELOCITY'}};
const names={duel:'DUEL · 1v1',doubles:'DOUBLES · 2v2',free:'FREE PLAY',training:'TRAINING'};
const key='boost-circuit.v1';
const defaults={mode:'duel',duration:300,difficulty:'pro',quality:'auto',sound:true,ballcam:true,fps:false,paint:'blue',body:'fennec',xp:0,matches:0,wins:0,goals:0,touches:0,history:[]};
let settings={...defaults};try{const data=JSON.parse(localStorage.getItem(key)||'{}');if(data&&typeof data==='object')settings={...settings,...data};}catch{}
for(const [name,valid]of Object.entries({mode:['duel','doubles','free','training'],duration:[120,300],difficulty:Object.keys(BOT_LEVELS),quality:['auto','low','balanced','high'],paint:Object.keys(paints),body:['fennec','striker','rally']}))if(!valid.includes(settings[name]))settings[name]=defaults[name];
for(const field of ['xp','matches','wins','goals','touches'])settings[field]=clamp(Number(settings[field])||0,0,1e9);
if(settings.vehicleRevision!==2){settings.body='fennec';settings.vehicleRevision=2;}
if(settings.performanceRevision!==1){if(settings.quality==='high')settings.quality='auto';settings.performanceRevision=1;}
settings.camera=normalizeCamera(settings.camera);settings.controls=normalizeControls(settings.controls);settings.bindings=normalizeBindings(settings.bindings);settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,100):80;
settings.interface=normalizeInterface(settings.interface);
settings.history=Array.isArray(settings.history)?settings.history.filter(x=>x&&typeof x==='object').slice(0,8):[];
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch{}};
let view,sim,input,motion,settingsUI,room=null,started=false,paused=false,resultSaved=false,accumulator=0,last=performance.now(),lastUI=0,frames=0,fpsTime=0,renderFPS=60,replayFrames=[],lastCount='',feedTimer,scoreSignature='',announcement=null;
const localId=()=>sim?.localPlayerId||0,online=()=>!!(room?.connected&&room.matchId),localCar=()=>sim?.cars.find(car=>car.id===localId());
const nameplates=new NameplateLayer($('nameplates'));
const dialog=id=>{if(id==='garage-dialog')document.body.classList.add('garage-open');if(!$(id).open)$(id).showModal();},close=id=>{if($(id).open)$(id).close();},closeAll=()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close());
function applyInterface(){$('hud').style.setProperty('--hud-scale',settings.interface.scale/100);document.querySelector('.speed').hidden=!settings.interface.speed;}
function syncSettings(){
 document.querySelectorAll('[data-mode]').forEach(b=>{const selected=b.dataset.mode===settings.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-paint]').forEach(b=>{const selected=b.dataset.paint===settings.paint;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-body]').forEach(b=>{const selected=b.dataset.body===settings.body;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 for(const id of ['duration','difficulty','quality'])$(id).value=settings[id];for(const [id,field]of [['sound','sound'],['ballcam','ballcam'],['fps-toggle','fps']])$(id).checked=!!settings[field];
 const practice=['free','training'].includes(settings.mode);$('duration').disabled=practice;$('difficulty').disabled=practice;
 $('play-screen').dataset.category=practice?'practice':'match';text('play-heading',practice?'TRAINING':'EXHIBITION MATCH');text('play-button',settings.mode==='free'?'START FREE PLAY':settings.mode==='training'?'START TRAINING':'CREATE MATCH');
 text('mode-description',practice?(settings.mode==='free'?'Explore the field. Boost is unlimited.':'Five drills. Fifteen seconds per shot.'):(BOT_LEVELS[settings.difficulty]?.description||'Ready when you are.'));
 text('showroom-car',settings.body==='fennec'?'FENNEC':settings.body==='striker'?'STRIKER GT':'RALLY RS');text('showroom-paint',paints[settings.paint].name);text('paint-name',paints[settings.paint].name);$('paint-dot').style.background=paints[settings.paint].hex;
 text('profile-level',String(1+Math.floor(settings.xp/1000)).padStart(2,'0'));text('profile-xp',`${settings.xp.toLocaleString()} XP · ${settings.wins} VICTORIES`);text('profile-name',settings.xp>=5000?'CIRCUIT REGULAR':settings.xp>=1000?'RISING DRIVER':'ROOKIE DRIVER');$('profile-progress').style.width=(settings.xp%1000)/10+'%';settingsUI?.sync();applyInterface();
}
const lobbyUI=setupLobby(settings,{save,sync:syncSettings});
const roomUI=setupRoomUI({host:options=>openRoom('host',options),join:code=>openRoom('guest',code),ready:value=>room?.setReady(value),start:()=>{sound.start();room?.startMatch();},leave:()=>{if(started)menu();else{room?.close();room=null;roomUI.render(null);close('multiplayer-dialog');}}});
function openRoom(role,value){
 if(role==='guest')try{value=normalizeCode(value);}catch(error){roomUI.render(null,error.message);return;}
 room?.close();let session;session=new NetworkRoom({onChange:state=>{if(room===state)roomUI.render(state);},onMatch:newSim=>{if(room===session)presentMatch(newSim);},onEvents:events=>{if(room===session&&sim===session.sim){sim.events.push(...events);if(sim.events.length>100)sim.events.splice(0,sim.events.length-100);}},onDisconnect:reason=>{if(room!==session)return;if(started)menu(false);roomUI.render(session,reason);dialog('multiplayer-dialog');}});room=session;
 sound.start();if(role==='host')session.create(value,{body:settings.body,paint:settings.paint});else session.join(value,{body:settings.body,paint:settings.paint});
}
class Sound{
 start(){if(!settings.sound)return;try{this.ctx||=new(window.AudioContext||window.webkitAudioContext)();this.ctx.resume().catch(()=>{});if(this.motor)return;
  const ctx=this.ctx;this.masterGain=ctx.createGain();this.masterGain.gain.value=settings.volume/100;this.masterGain.connect(ctx.destination);this.motor=ctx.createOscillator();this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=400;this.motorGain=ctx.createGain();this.motorGain.gain.value=0;this.motor.type='sawtooth';this.motor.connect(this.filter);this.filter.connect(this.motorGain);this.motorGain.connect(this.masterGain);this.motor.start();
  const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;this.noiseGain=ctx.createGain();this.noiseGain.gain.value=0;this.noise.connect(this.noiseGain);this.noiseGain.connect(this.masterGain);this.noise.start();
 }catch{}}
 effect(kind){if(!settings.sound||!this.ctx||this.ctx.state!=='running')return;const values={hit:[140,65,.09,.055],bounce:[95,55,.06,.025],goal:[440,880,.6,.055],pad:[620,1000,.13,.025],go:[660,990,.24,.04],count:[360,360,.1,.025],demo:[70,30,.3,.07],save:[500,800,.3,.04]};const [from,to,duration,volume]=values[kind]||values.hit;try{const o=this.ctx.createOscillator(),g=this.ctx.createGain(),time=this.ctx.currentTime;o.type=kind==='demo'?'sawtooth':'sine';o.frequency.setValueAtTime(from,time);o.frequency.exponentialRampToValueAtTime(to,time+duration);g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(this.masterGain);o.start(time);o.stop(time+duration);}catch{}}
 update(){if(!this.motor)return;const on=started&&!paused&&!room?.hostPaused&&sim.phase==='playing'&&settings.sound,car=online()&&room.role==='guest'?room.replica.predicted:localCar();const t=this.ctx.currentTime;this.masterGain.gain.setTargetAtTime(settings.volume/100,t,.04);this.motor.frequency.setTargetAtTime(32+(car?.v.length()||0)*4.5,t,.1);this.motorGain.gain.setTargetAtTime(on?.018:0,t,.1);this.noiseGain.gain.setTargetAtTime(on&&car?.boosting?.05:0,t,.1);}
 dispose(){this.ctx?.close().catch(()=>{});}
}
const sound=new Sound();
function feed(message){text('event-feed',message);show('event-feed',true);clearTimeout(feedTimer);feedTimer=setTimeout(()=>show('event-feed',false),2200);}
function renderScore(){
 const signature=sim.cars.map(c=>[c.id,c.team,c.score,c.goals,c.assists,c.saves].join(':')).join('|');if(signature===scoreSignature)return;scoreSignature=signature;
 const rows=$('score-rows');rows.replaceChildren();for(const team of [0,1]){
  const cars=sim.cars.filter(c=>c.team===team);if(!cars.length)continue;const heading=document.createElement('h3');heading.className='score-team-label'+(team?' orange-label':'');heading.textContent=team?'ORANGE':'BLUE';rows.append(heading);
  for(const c of cars){const row=document.createElement('div');row.className='score-row '+(team?'orange-row':'blue-row');for(const value of [driverName(c,localId()),c.score,c.goals,c.assists,c.saves]){const span=document.createElement('span');span.textContent=String(value);row.append(span);}rows.append(row);}
 }
}
function announce(message,duration=1.3,kind=''){announcement={message,until:sim.elapsed+duration,kind};}
function toggleCamera(){view.cameraMode=!view.cameraMode;feed(view.cameraMode?'BALL CAM ON':'CAR CAM ON');}
function action(name){
 if(name==='pause'){if(paused)resume();else pause();return;}
 if(!started||paused)return;
 if(name==='camera')toggleCamera();
 if(name==='reset'&&sim.resetPractice()){motion.reset(sim);feed('BALL RESET');input.clear();}
 if(name==='next'&&sim.options.mode==='training'){sim.nextDrill();motion.reset(sim);input.clear();}
 if(name==='scoreboard'){renderScore();show('score-panel',$('score-panel').hidden);}
 if(name==='hide-scoreboard')show('score-panel',false);
}
function start(){
 if(online()){if(room.role==='host')room.startMatch();return;}
 sound.start();closeAll();settings.duration=Number($('duration').value);settings.difficulty=$('difficulty').value;save();
 presentMatch(new Simulation({mode:settings.mode,duration:settings.duration,difficulty:settings.difficulty}));
}
function presentMatch(newSim){
 sim=newSim;closeAll();motion=new MotionBuffer(sim);view.graphics.resetTiming();started=true;paused=false;resultSaved=false;accumulator=0;lastCount='';scoreSignature='';announcement=null;replayFrames=[];input.clear();view.sync(sim,paints[settings.paint].hex,settings.body);view.cameraMode=!!settings.ballcam;$('hud').dataset.mode=sim.options.mode;$('hud').dataset.replay='false';nameplates.hide();
 const net=online(),guest=net&&room.role==='guest';$('restart-button').disabled=guest;$('rematch-button').disabled=guest;text('rematch-button',guest?'WAITING FOR HOST':'PLAY AGAIN');text('leave-button',net?'LEAVE ROOM':'EXIT TO MAIN MENU');text('menu-button',net?'LEAVE ROOM':'EXIT TO MAIN MENU');show('pause-note',net);text('pause-note',guest?'The match continues while your menu is open.':'You control the match. Pausing also pauses it for your guest.');
 show('lobby',false);show('hud',true);show('network-hud',net);show('replay',false);show('score-panel',false);show('event-feed',false);show('practice-tools',['free','training'].includes(sim.options.mode));show('next-shot-button',sim.options.mode==='training');show('training-progress',sim.options.mode==='training');document.activeElement?.blur();$('arena').focus();updateHUD();
}
function pause(){if(!started||paused||sim.phase==='ended')return;paused=true;input.clear();if(online()){if(room.role==='host')room.setPaused(true);else{room.guestStep({});room.sendInputs(true);}}show('score-panel',false);dialog('pause-dialog');sound.update();}
function resume(){if(!started)return;closeAll();paused=false;accumulator=0;motion.reset(sim);input.clear();if(online()&&room.role==='host')room.setPaused(false);$('arena').focus();}
function menu(leaveNetwork=true){if(leaveNetwork){room?.close();room=null;roomUI.render(null);}started=false;paused=false;resultSaved=false;input.clear();closeAll();nameplates.hide();lobbyUI.home();show('hud',false);show('replay',false);show('score-panel',false);show('lobby',true);sim=new Simulation({mode:'free'});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);syncSettings();sound.update();}
function result(){if(resultSaved)return;resultSaved=true;paused=false;input.clear();close('pause-dialog');close('settings-dialog');show('replay',false);show('score-panel',false);const p=localCar(),mode=sim.options.mode,practice=['free','training'].includes(mode),winningTeam=sim.score[0]>sim.score[1]?0:1,won=winningTeam===p.team;const xp=Math.round(p.score+(practice?50:won?250:75)+(mode==='training'?sim.trainingHits*75:0));
 settings.xp+=xp;settings.touches+=p.touches;if(!practice){settings.matches++;if(won)settings.wins++;settings.goals+=p.goals;settings.history.unshift({mode,blue:sim.score[0],orange:sim.score[1],won});settings.history=settings.history.slice(0,8);}save();
 text('result-eyebrow',practice?'SESSION COMPLETE':'WINNER');text('result-title',mode==='training'?'TRAINING':mode==='free'?'FREE PLAY':winningTeam?'ORANGE':'BLUE');$('result-dialog').classList.toggle('orange-result',!practice&&winningTeam===1);text('result-description',mode==='training'?`${sim.trainingHits} / 5 drills completed successfully.`:mode==='free'?'Practice session complete.':names[mode]+' · CHAMPIONS FIELD'+(online()?' · PRIVATE MATCH':''));
 text('result-blue',sim.score[0]);text('result-orange',sim.score[1]);text('result-goals',p.goals);text('result-touches',p.touches);text('result-xp',xp);dialog('result-dialog');syncSettings();sound.update();
}
function updateHUD(){const s=sim.state(localId());text('blue-score',s.score[0]);text('orange-score',s.score[1]);text('match-label',names[s.mode]);let seconds=Math.ceil(s.remaining);if(s.mode==='free')text('clock','∞');else if(s.mode==='training')text('clock',`${Math.max(0,Math.ceil(s.shotTime))}s`);else text('clock',`${s.overtime?'+':''}${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);show('overtime',s.overtime);
 if(online())text('network-hud',`PRIVATE MATCH · ${room.role.toUpperCase()} · ${room.rtt} ms`);
 text('boost-value',Math.round(s.boost));$('boost-arc').style.strokeDashoffset=String(100-clamp(s.boost,0,100));document.querySelector('.boost-hud').classList.toggle('low',s.boost<15);text('speed-value',Math.round(s.speed));show('supersonic',s.supersonic);text('camera-status',view.cameraMode?'ON':'OFF');$('camera-button').setAttribute('aria-pressed',String(view.cameraMode));text('camera-mode','BALL CAM');text('camera-toggle-key',input.controller?'Y':bindingName(settings.bindings.camera));text('input-device',input.controller?'STANDARD GAMEPAD':'KEYBOARD + MOUSE');
 show('performance',!!settings.fps);if(settings.fps)text('performance',`${renderFPS} FPS · 120 Hz PHYSICS`);
 if(s.mode==='training')text('training-progress',`SHOT ${Math.min(5,s.trainingIndex+1)} / 5  ·  ${s.drillName}  ·  ${s.trainingHits} COMPLETE`);
 if(online()&&room.role==='guest'&&room.hostPaused){text('match-message','HOST PAUSED');$('match-message').className='match-message';}
 else if(s.phase==='kickoff'){const n=Math.max(1,Math.ceil(s.phaseTime));text('match-message',n);$('match-message').className='match-message countdown';if(String(n)!==lastCount){lastCount=String(n);sound.effect('count');}}
 else{const active=announcement&&s.elapsed<announcement.until;text('match-message',active?announcement.message:'');$('match-message').className='match-message'+(active&&announcement.kind?' '+announcement.kind:'');}
 if(!$('score-panel').hidden)renderScore();
}
function handleEvents(){const events=sim.events.splice(0);if(online()&&room.role==='host')room.events(events);for(const e of events){
 if(e.type==='goal'){
  sound.effect('goal');view.burst(sim.ball.p.toArray(),e.team?'#ff9944':'#65bbff',70);const scorer=e.scorer===null?(e.team?'ORANGE':'BLUE'):driverName(sim.cars.find(c=>c.id===e.scorer),localId());announce(scorer+' SCORED!',1.5,'goal');text('replay-scorer',e.scorer===null?'OWN GOAL':scorer);text('replay-speed',Math.round(e.speed)+' KM/H');document.querySelector('.replay-scorer').classList.toggle('orange-replay',e.team===1);replayFrames=[...sim.replay,sim.snapshot()];show('replay',replayFrames.length>4);
 }else if(e.type==='hit'){sound.effect('hit');view.burst(e.p,'#c5eaff',5);}
 else if(e.type==='bounce'&&e.speed>5)sound.effect('bounce');
 else if(e.type==='pad'&&e.car===localId())sound.effect('pad');
 else if(e.type==='demo'){sound.effect('demo');view.burst(e.p,'#ffb66b',35);feed('DEMOLITION');}
 else if(e.type==='go'){sound.effect('go');announce('GO!',1);}
 else if(e.type==='overtime'){sound.effect('goal');feed('OVERTIME · NEXT GOAL WINS');}
 else if(e.type==='save'){sound.effect('save');announce('WHAT A SAVE!',1.6);feed('SAVE! · DRILL COMPLETE');show('replay',false);}
 else if(e.type==='miss'){feed('NEXT SHOT · KEEP AT IT');show('replay',false);}
 else if(e.type==='end')result();
 }if(sim.phase!=='goal')show('replay',false);}
function frame(now){
 requestAnimationFrame(frame);if(document.hidden){last=now;accumulator=0;return;}
 const rawDt=(now-last)/1000,dt=Math.min(.1,Math.max(0,rawDt));last=now;frames++;fpsTime+=dt;if(fpsTime>=.5){renderFPS=Math.round(frames/fpsTime);frames=0;fpsTime=0;}
 if(started){const controls=input.read(),net=online(),guest=net&&room.role==='guest';localCar().renderSteer=controls.steer;
  if(guest){
   if(!room.hostPaused&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){room.guestStep(paused?{}:controls);accumulator-=C.step;}room.sendInputs();}else accumulator=0;
  }else if(!paused&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){sim.step(controls,C.step,net?room.inputs():null);motion.capture(sim);accumulator-=C.step;}}
  handleEvents();if(sim.phase==='ended'&&!resultSaved)result();if(net&&!guest)room.publish();if(!paused&&sim.phase!=='ended')view.monitorFrame(rawDt);
  const replay=sim.phase==='goal'&&!$('replay').hidden&&replayFrames.length>0;
  const state=replay?motion.sampleReplay(replayFrames,clamp((4-sim.phaseTime)/4,0,1)):guest?(room.replica.sample(now,dt)||motion.sample(1)):motion.sample(paused||sim.phase==='ended'?1:accumulator/C.step);
  view.update(sim,paused&&!guest?0:dt,false,state,replay);nameplates.update(view,sim,replay,settings.interface.nameplates&&!paused&&sim.phase!=='ended');if($('hud').dataset.replay!==String(replay))$('hud').dataset.replay=String(replay);if(now-lastUI>70){updateHUD();lastUI=now;}
 }else view.update(sim,dt,true);
 sound.update();
}
function fail(error){console.error(error);show('loading',false);show('lobby',false);show('hud',false);show('error',true);text('error-detail','The 3D renderer needs WebGL and browser graphics acceleration. '+(error?.message||''));}
$('play-button').addEventListener('click',start);$('rematch-button').addEventListener('click',start);$('restart-button').addEventListener('click',start);$('resume-button').addEventListener('click',resume);$('leave-button').addEventListener('click',()=>menu());$('menu-button').addEventListener('click',()=>menu());$('pause-button').addEventListener('click',pause);$('camera-button').addEventListener('click',toggleCamera);$('reset-button').addEventListener('click',()=>action('reset'));$('next-shot-button').addEventListener('click',()=>action('next'));$('end-practice-button').addEventListener('click',()=>{sim.end();handleEvents();});function skipReplay(){if(online())room.skipReplay();else sim.skipReplay();motion.reset(sim);handleEvents();}$('skip-replay').addEventListener('click',skipReplay);
$('open-multiplayer').addEventListener('click',()=>{roomUI.render(room);roomUI.open();});
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;view?.graphics.resetTiming();if(document.hidden)pause();else motion?.reset(sim);});
window.addEventListener('keydown',e=>{if(e.code==='Enter'&&started&&!paused&&sim.phase==='goal')skipReplay();});
for(const [button,id]of [['garage-button','garage-dialog'],['customize-button','garage-dialog'],['controls-button','controls-dialog'],['settings-button','settings-dialog'],['about-button','about-dialog']])$(button).addEventListener('click',()=>dialog(id));
$('pause-settings-button').addEventListener('click',()=>{close('pause-dialog');dialog('settings-dialog');});$('settings-dialog').addEventListener('close',()=>{if(started&&paused)dialog('pause-dialog');});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resume();});$('result-dialog').addEventListener('cancel',e=>{e.preventDefault();menu();});
$('garage-dialog').addEventListener('close',()=>document.body.classList.remove('garage-open'));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>close(b.dataset.close)));document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d||['pause-dialog','result-dialog','multiplayer-dialog'].includes(d.id))return;const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;save();syncSettings();}));
for(const id of ['duration','difficulty'])$(id).addEventListener('change',()=>{settings[id]=id==='duration'?Number($(id).value):$(id).value;save();syncSettings();});
for(const [data,field]of [['paint','paint'],['body','body']])document.querySelectorAll(`[data-${data}]`).forEach(b=>b.addEventListener('click',()=>{settings[field]=b.dataset[data];save();syncSettings();if(!started)view.sync(sim,paints[settings.paint].hex,settings.body);}));
for(const id of ['quality','sound','ballcam','fps-toggle'])$(id).addEventListener('change',()=>{settings.quality=$('quality').value;settings.sound=$('sound').checked;settings.ballcam=$('ballcam').checked;settings.fps=$('fps-toggle').checked;save();if(id==='quality')view.quality(settings.quality);view.cameraMode=settings.ballcam;if(settings.sound)sound.start();});
$('career-button').addEventListener('click',()=>{text('career-matches',settings.matches);text('career-wins',settings.wins);text('career-goals',settings.goals);text('career-touches',settings.touches);const list=$('history');list.replaceChildren();if(!settings.history.length)list.textContent='Your first match is the start of your story.';for(const h of settings.history){const row=document.createElement('div');row.className='history-row';const label=document.createElement('strong'),score=document.createElement('span');label.textContent=(names[h.mode]||'MATCH')+(h.won?' · WIN':' · LOSS');score.textContent=`${Math.max(0,Number(h.blue)||0)} — ${Math.max(0,Number(h.orange)||0)}`;row.append(label,score);list.append(row);}dialog('career-dialog');});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{feed('FULLSCREEN UNAVAILABLE IN THIS VIEW');}});$('retry-button').addEventListener('click',()=>location.reload());window.addEventListener('resize',()=>view?.resize());window.addEventListener('pagehide',event=>{room?.close();if(event.persisted){pause();return;}input?.dispose();view?.dispose();sound.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&room?.closed){menu();roomUI.render(null,'The room closed when you left this page. Create or join a new room.');dialog('multiplayer-dialog');}});
try{view=new GameView($('arena'));view.setCamera(settings.camera);view.quality(settings.quality);text('loading-label','OPENING CHAMPIONS FIELD');await view.loadAssets(event=>{const asset=event.asset==='stadium'?'Champions Field':'Fennec';text('loading-progress',event.total?`${asset} · ${Math.round(event.loaded/event.total*100)}%`:`Loading ${asset}…`);});sim=new Simulation({mode:'free'});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);input=new Input($('arena'),{bindings:settings.bindings,controls:settings.controls,active:()=>started&&!paused&&sim.phase!=='ended',action});settingsUI=setupSettings(settings,{save,apply:kind=>{if(kind==='camera')view.setCamera(settings.camera);if(kind==='controls')input.setPreferences({bindings:settings.bindings,controls:settings.controls});if(kind==='audio')sound.update();if(kind==='interface')applyInterface();}});syncSettings();save();text('loading-label','WARMING UP THE ARENA');await view.prepare();last=performance.now();show('loading',false);show('lobby',true);Object.defineProperty(window,'boostCircuit',{value:Object.freeze({version:'1.6.0',getPerformance:()=>({...view.diagnostics(),fps:renderFPS}),getState:()=>structuredClone({...sim.state(localId()),active:started,paused,localPlayerId:localId(),network:online()?{role:room.role,hostPaused:room.hostPaused,rtt:room.rtt}:null})})});requestAnimationFrame(frame);}catch(error){fail(error);}
