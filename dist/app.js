import {Simulation,C,clamp} from './physics.js';
import {GameView} from './scene.js';
import {MotionBuffer} from './motion.js';
import {Input} from './input.js';
import {BOT_LEVELS} from './bots.js';
import {normalizeCamera,normalizeControls,normalizeBindings,normalizeInterface,bindingName} from './preferences.js';
import {setupSettings} from './settings-ui.js';
import {setupLobby,NameplateLayer,driverName} from './interface.js';
import {NetworkRoom} from './network-room.js';
import {normalizeCode,NET_BUILD} from './network-protocol.js';
import {setupRoomUI} from './room-ui.js';
import {Matchmaker} from './matchmaking.js';
import {setupMatchmakingUI} from './matchmaking-ui.js';
import {networkPreferences} from './network-quality.js';
import {setupNetworkUI} from './network-ui.js';
import {gamepadPreferences,PAD_BUTTONS} from './gamepad-preferences.js';
import {setupGamepadBindings,ControllerUI} from './gamepad-ui.js';
import {setupSocialUI,setupSocialAccess,playerName} from './social.js';
import {PartyRoom} from './party-room.js';
import {DedicatedRoom,parseServerInvite} from './dedicated-room.js';
import {DedicatedMatchmaker} from './server-matchmaking.js';
import {setupPartyUI} from './party-ui.js';
import {BODY_TYPES,BODY_NAMES,FIXED_FINISH_BODIES,prepareRoomVehicles} from './bodies.js';
const $=id=>document.getElementById(id),show=(id,on)=>{$(id).hidden=!on;},text=(id,value)=>{const node=$(id),next=String(value);if(node.textContent!==next)node.textContent=next;};
const paints={blue:{hex:'#299bff',name:'ELECTRIC BLUE'},ivory:{hex:'#e8efec',name:'ARCTIC WHITE'},violet:{hex:'#a985fc',name:'ULTRAVIOLET'},mint:{hex:'#53dbbd',name:'MINT VELOCITY'}};
const names={custom:'CUSTOM PRIVATE',duel:'DUEL · 1v1',doubles:'DOUBLES · 2v2',free:'FREE PLAY',training:'TRAINING'};
const key='boost-circuit.v1';
const defaults={mode:'duel',duration:300,difficulty:'pro',quality:'auto',sound:true,ballcam:true,fps:false,paint:'blue',body:'fennec',xp:0,matches:0,wins:0,goals:0,touches:0,history:[]};
let settings={...defaults};try{const data=JSON.parse(localStorage.getItem(key)||'{}');if(data&&typeof data==='object')settings={...settings,...data};}catch{}
for(const [name,valid]of Object.entries({mode:['duel','doubles','free','training'],duration:[120,300],difficulty:Object.keys(BOT_LEVELS),quality:['auto','low','balanced','high'],paint:Object.keys(paints),body:BODY_TYPES}))if(!valid.includes(settings[name]))settings[name]=defaults[name];
for(const field of ['xp','matches','wins','goals','touches'])settings[field]=clamp(Number(settings[field])||0,0,1e9);
if(settings.vehicleRevision!==2){settings.body='fennec';settings.vehicleRevision=2;}
if(settings.performanceRevision!==1){if(settings.quality==='high')settings.quality='auto';settings.performanceRevision=1;}
settings.camera=normalizeCamera(settings.camera);settings.controls=normalizeControls(settings.controls);settings.bindings=normalizeBindings(settings.bindings);settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,100):80;
settings.interface=normalizeInterface(settings.interface);settings.network=networkPreferences(settings.network);settings.gamepad=gamepadPreferences(settings.gamepad);
// A game served by the Node service can use that same secure origin without
// asking players to copy its address. Static deployments simply return 404.
try{const response=await fetch('/server-config.json',{cache:'no-store',signal:AbortSignal.timeout(1500)});if(response.ok&&(await response.json()).build===NET_BUILD){settings.serverURL||=location.origin;settings.onlineConnection||='server';settings.customConnection||='server';}}catch{}
settings.history=Array.isArray(settings.history)?settings.history.filter(x=>x&&typeof x==='object').slice(0,8):[];
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));return true;}catch{return false;}};
let view,sim,input,motion,settingsUI,gamepadUI,controllerUI,room=null,bodySelection=0,vehicleWarning='',started=false,paused=false,resultSaved=false,accumulator=0,last=performance.now(),lastUI=0,frames=0,fpsTime=0,renderFPS=60,replayFrames=[],lastCount='',feedTimer,scoreSignature='',announcement=null,replayJumpHeld=false;
const localId=()=>sim?.localPlayerId===null?null:sim?.localPlayerId??0,online=()=>!!(room&&!room.closed&&room.matchId),localCar=()=>sim?.cars.find(car=>car.id===localId());
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
 const fixed=FIXED_FINISH_BODIES.includes(settings.body);text('showroom-car',BODY_NAMES[settings.body]);text('showroom-paint',fixed?'ORIGINAL ARTIST FINISH':paints[settings.paint].name);text('paint-name',fixed?'ORIGINAL ARTIST FINISH':paints[settings.paint].name);document.querySelectorAll('[data-paint]').forEach(button=>{button.disabled=fixed;});$('paint-dot').style.background=paints[settings.paint].hex;
 text('profile-level',String(1+Math.floor(settings.xp/1000)).padStart(2,'0'));text('profile-xp',`${settings.xp.toLocaleString()} XP · ${settings.wins} VICTORIES`);text('profile-name',playerName(settings.username));$('profile-progress').style.width=(settings.xp%1000)/10+'%';settingsUI?.sync();gamepadUI?.sync();applyInterface();
}
const lobbyUI=setupLobby(settings,{save,sync:syncSettings});
const roomUI=setupRoomUI({host:options=>openRoom('host',options),join:code=>openRoom('guest',code),ready:async value=>{const session=room;if(!session)return;try{if(value)await prepareRoomBodies(session,true);if(room===session&&!session.closed)session.setReady(value);}catch{}},start:()=>startRoom(),leave:()=>{if(started)menu();else{room?.close();room=null;roomUI.render(null);close('multiplayer-dialog');}}});
const partyUI=setupPartyUI({preferences:settings,save,create:options=>openParty('host',options),join:code=>openParty('guest',code),team:team=>room?.party&&room.chooseTeam(team),ready:ready=>room?.party&&room.setReady(ready),start:()=>room?.party&&room.startMatch(),configure:options=>room?.party&&room.configure(options),leave:()=>{if(started)close('party-dialog');else{room?.close();room=null;partyUI.render(null);close('party-dialog');}}});
let matchmaking=null;
const matchUI=setupMatchmakingUI({search:beginMatchmaking,cancel:stopMatchmaking,preferences:settings,save});
const networkUI=setupNetworkUI({preferences:settings.network,save,rematch:()=>room?.party&&room.self?.team===null?(partyUI.render(room),partyUI.open()):online()?room.requestRematch(!room.rematchWanted):start(),next:findNextMatch,leave:()=>menu()}),recoveryStates=new WeakMap();
function roomChanged(session){if(room!==session)return;const recovering=!!session.recovering,previous=recoveryStates.get(session);recoveryStates.set(session,recovering);if(previous!==undefined&&previous!==recovering||recovering&&previous!==true){accumulator=0;input?.clear();if(sim)motion?.reset(sim);}networkUI.render(session,sim);}
function findNextMatch(){if(sim?.phase!=='ended')return;room?.close(true,'next');menu();beginMatchmaking();}
const socialUI=setupSocialUI(settings,{save,send:value=>{if(room?.connected)return room.sendChat(value);socialUI.receive({name:settings.username,text:value});return true;},profile:name=>{text('profile-name',name);room?.updateProfile(name);const car=localCar();if(car&&!car.networkRole)car.playerName=name;},opened:()=>input?.clear()});
const socialAccess=setupSocialAccess({ui:socialUI,started:()=>started,paused:()=>paused,phase:()=>sim?.phase,online:()=>!!room?.connected,closePause:()=>close('pause-dialog'),returnToPause:()=>dialog('pause-dialog'),focusGame:()=>$('arena').focus(),skipReplay});
function appendRoomEvents(session,events){if(room===session&&sim===session.sim){sim.events.push(...events);if(sim.events.length>100)sim.events.splice(0,sim.events.length-100);}}
function roomDisconnected(session,reason){
 if(room!==session)return;if(started&&sim.phase==='ended'){networkUI.render(session,sim);room=null;return;}if(started)menu(false);
 if(session.party&&!session.matchmade){room=null;partyUI.render(session,reason);partyUI.open();}
 else if(session.matchmade){room=null;matchUI.render({phase:'idle',reason});dialog('matchmaking-dialog');}
 else{roomUI.render(session,reason);dialog('multiplayer-dialog');}
}
function beginMatchmaking(){
 if(started)return;matchmaking?.cancel();room?.close();socialUI.reset();room=null;roomUI.render(null);close('multiplayer-dialog');sound.start();let current;
 const route=matchUI.selection(),Queue=route.kind==='server'?DedicatedMatchmaker:Matchmaker;
 current=new Queue({address:route.address,prepareBodies:bodies=>Promise.all([...new Set(bodies)].map(body=>view.ensureBody(body))),prepare:session=>prepareRoomVehicles(session,body=>view.ensureBody(body)),onChange:state=>{if(matchmaking===current)matchUI.render(state);},onRoomChange:state=>{if(state.party)partyUI.render(state);roomChanged(state);},onLobby:session=>{room=session;matchmaking=null;close('matchmaking-dialog');partyUI.render(session);partyUI.open();},onChat:message=>socialUI.receive(message),onChatState:state=>socialUI.setHistory(state),onMatch:(newSim,session)=>{if(matchmaking!==current&&room!==session){session.close();return;}room=session;matchmaking=null;presentMatch(newSim);if(document.hidden)pause();},onBots:(options,reason)=>{if(matchmaking!==current)return;matchmaking=null;room=null;presentMatch(new Simulation(options));feed(reason+' Playing against a bot.');if(document.hidden)pause();},onEvents:(events,session)=>appendRoomEvents(session,events),onDisconnect:(reason,session)=>roomDisconnected(session,reason)});
 matchmaking=current;dialog('matchmaking-dialog');current.start({body:settings.body,paint:settings.paint,name:settings.username},{mode:route.mode,difficulty:settings.difficulty,network:settings.network});
}
function stopMatchmaking(){const current=matchmaking;matchmaking=null;current?.cancel();close('matchmaking-dialog');$('open-online').focus();}
function openMatchmaking(){if(started)return;matchUI.render({phase:'idle'});matchUI.open();}
function prepareRoomBodies(session,retry=false){
 return prepareRoomVehicles(session,body=>view.ensureBody(body),()=>{if(room===session)roomUI.render(session);},retry);
}
async function prepareSavedBody(){try{await view.ensureBody(settings.body,event=>text('loading-progress',event.total?BODY_NAMES[settings.body]+' · '+Math.round(event.loaded/event.total*100)+'%':'Loading '+BODY_NAMES[settings.body]+'…'));}catch{settings.body='fennec';vehicleWarning='Your saved vehicle could not load. Fennec is ready; retry the other body in Garage.';save();}}
async function startRoom(){const session=room;if(!session||!session.canManage&&session.role!=='host')return;sound.start();if(session.party){await session.startMatch();return;}try{await prepareRoomBodies(session,true);if(room===session&&!session.closed)session.startMatch();}catch{}}
async function chooseBody(body){
 const request=++bodySelection;$('garage-dialog').setAttribute('aria-busy','true');text('garage-status','Preparing '+BODY_NAMES[body]+'…');
 try{await view.ensureBody(body,event=>{if(request===bodySelection&&event.total)text('garage-status','Loading '+BODY_NAMES[body]+' · '+Math.round(event.loaded/event.total*100)+'%');});if(request!==bodySelection||started)return;settings.body=body;save();syncSettings();view.sync(sim,paints[settings.paint].hex,body);await view.prepare();if(request===bodySelection)text('garage-status',BODY_NAMES[body]+' READY');}
 catch{if(request===bodySelection)text('garage-status','The vehicle could not load. Select it again to retry.');}
 finally{if(request===bodySelection)$('garage-dialog').removeAttribute('aria-busy');}
}
function openParty(role,value){
 if(started)return;matchmaking?.cancel();matchmaking=null;room?.close();room=null;socialUI.reset();let session;closeAll();partyUI.open();
 try{
  const route=partyUI.connection(),invite=role==='guest'?String(value).trim():'',dedicated=role==='host'?route.kind==='server':invite.startsWith('BCS-');let address=route.address;
  if(dedicated&&role==='guest'){const parsed=parseServerInvite(invite);address=parsed.address||address;}
  const callbacks={prepare:bodies=>Promise.all([...new Set(bodies)].map(body=>view.ensureBody(body))),onChange:state=>{if(room===state){partyUI.render(state);roomChanged(state);}},onMatch:newSim=>{if(room===session){presentMatch(newSim);if(document.hidden)pause();}},onEvents:events=>appendRoomEvents(session,events),onChat:message=>socialUI.receive(message),onChatState:state=>socialUI.setHistory(state),onDisconnect:reason=>roomDisconnected(session,reason)};
  session=dedicated?new DedicatedRoom({...callbacks,address}):new PartyRoom(callbacks);room=session;if(dedicated)partyUI.useConnection('server',session.address);
  if(role==='host')session.create(value,{body:settings.body,paint:settings.paint,name:settings.username});else session.join(value,{body:settings.body,paint:settings.paint,name:settings.username});
 }catch(error){session?.close();room=null;partyUI.render(null,error.message);}
}

function openRoom(role,value){
 if(role==='guest'&&/^BC[2S]-/.test(String(value).trim())){openParty(role,value);return;}
 if(role==='guest')try{value=normalizeCode(value);}catch(error){roomUI.render(null,error.message);return;}
 room?.close();socialUI.reset();let session;session=new NetworkRoom({onChange:state=>{if(room===state){roomUI.render(state);roomChanged(state);if(state.connected&&!state.assetsReady&&!state.assetsPromise&&!state.assetsError)prepareRoomBodies(state).catch(()=>{});}},onMatch:newSim=>{if(room===session)presentMatch(newSim);},onEvents:events=>appendRoomEvents(session,events),onDisconnect:reason=>roomDisconnected(session,reason),onChat:message=>socialUI.receive(message),onChatState:state=>socialUI.setHistory(state)});room=session;
 sound.start();if(role==='host')session.create(value,{body:settings.body,paint:settings.paint,name:settings.username});else session.join(value,{body:settings.body,paint:settings.paint,name:settings.username});
}
class Sound{
 start(){if(!settings.sound)return;try{this.ctx||=new(window.AudioContext||window.webkitAudioContext)();this.ctx.resume().catch(()=>{});if(this.motor)return;
  const ctx=this.ctx;this.masterGain=ctx.createGain();this.masterGain.gain.value=settings.volume/100;this.masterGain.connect(ctx.destination);this.motor=ctx.createOscillator();this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=400;this.motorGain=ctx.createGain();this.motorGain.gain.value=0;this.motor.type='sawtooth';this.motor.connect(this.filter);this.filter.connect(this.motorGain);this.motorGain.connect(this.masterGain);this.motor.start();
  const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;this.noiseGain=ctx.createGain();this.noiseGain.gain.value=0;this.noise.connect(this.noiseGain);this.noiseGain.connect(this.masterGain);this.noise.start();
 }catch{}}
 effect(kind){if(!settings.sound||!this.ctx||this.ctx.state!=='running')return;const values={hit:[140,65,.09,.055],bounce:[95,55,.06,.025],goal:[440,880,.6,.055],pad:[620,1000,.13,.025],go:[660,990,.24,.04],count:[360,360,.1,.025],demo:[70,30,.3,.07],save:[500,800,.3,.04]};const [from,to,duration,volume]=values[kind]||values.hit;try{const o=this.ctx.createOscillator(),g=this.ctx.createGain(),time=this.ctx.currentTime;o.type=kind==='demo'?'sawtooth':'sine';o.frequency.setValueAtTime(from,time);o.frequency.exponentialRampToValueAtTime(to,time+duration);g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(this.masterGain);o.start(time);o.stop(time+duration);}catch{}}
 update(){if(!this.motor)return;const on=started&&!paused&&!room?.hostPaused&&!room?.recovering&&sim.phase==='playing'&&localId()!==null&&settings.sound,car=online()&&room.role==='guest'?room.replica.predicted:localCar();const t=this.ctx.currentTime;this.masterGain.gain.setTargetAtTime(settings.volume/100,t,.04);this.motor.frequency.setTargetAtTime(32+(car?.v.length()||0)*4.5,t,.1);this.motorGain.gain.setTargetAtTime(on?.018:0,t,.1);this.noiseGain.gain.setTargetAtTime(on&&car?.boosting?.05:0,t,.1);}
 dispose(){this.ctx?.close().catch(()=>{});}
}
const sound=new Sound();
function feed(message){text('event-feed',message);show('event-feed',true);clearTimeout(feedTimer);feedTimer=setTimeout(()=>show('event-feed',false),2200);}
function renderScore(){
 const signature=sim.cars.map(c=>[c.id,c.team,c.playerName,c.score,c.goals,c.assists,c.saves].join(':')).join('|');if(signature===scoreSignature)return;scoreSignature=signature;
 const rows=$('score-rows');rows.replaceChildren();for(const team of [0,1]){
  const cars=sim.cars.filter(c=>c.team===team);if(!cars.length)continue;const heading=document.createElement('h3');heading.className='score-team-label'+(team?' orange-label':'');heading.textContent=team?'ORANGE':'BLUE';rows.append(heading);
  for(const c of cars){const row=document.createElement('div');row.className='score-row '+(team?'orange-row':'blue-row');for(const value of [driverName(c,localId()),c.score,c.goals,c.assists,c.saves]){const span=document.createElement('span');span.textContent=String(value);row.append(span);}rows.append(row);}
 }
}
function announce(message,duration=1.3,kind=''){announcement={message,until:sim.elapsed+duration,kind};}
function toggleCamera(){view.cameraMode=!view.cameraMode;feed(view.cameraMode?'BALL CAM ON':'FREE CAM · MIDDLE-MOUSE DRAG / RIGHT STICK TO LOOK');}
function action(name){
 if(['chat','quickchat'].includes(name)){socialUI.open(name==='quickchat',!!room?.connected);return;}
 if(name==='pause'){if(paused)resume();else pause();return;}
 if(!started||paused)return;
 if(name==='camera')toggleCamera();
 if(room?.dedicated&&['reset','next'].includes(name)){room.practice(name);input.clear();return;}
 if(name==='reset'&&sim.resetPractice()){motion.reset(sim);feed('BALL RESET');input.clear();}
 if(name==='next'&&sim.options.mode==='training'){sim.nextDrill();motion.reset(sim);input.clear();}
 if(name==='scoreboard'){renderScore();show('score-panel',$('score-panel').hidden);}
 if(name==='hide-scoreboard')show('score-panel',false);
}
function start(){
 if(online()){if(sim.phase==='ended')room.requestRematch(!room.rematchWanted);else if(room.role==='host')startRoom();return;}
 if(started&&sim.options.quickplayBots){sound.start();presentMatch(new Simulation({...sim.options}));return;}
 sound.start();closeAll();settings.duration=Number($('duration').value);settings.difficulty=$('difficulty').value;save();
 presentMatch(new Simulation({mode:settings.mode,duration:settings.duration,difficulty:settings.difficulty}));
}
function presentMatch(newSim){
 sim=newSim;if(!online())sim.cars[0].playerName=settings.username;closeAll();motion=new MotionBuffer(sim);view.graphics.resetTiming();started=true;paused=false;resultSaved=false;accumulator=0;lastCount='';scoreSignature='';announcement=null;replayFrames=[];input.clear();view.sync(sim,paints[settings.paint].hex,settings.body);view.cameraMode=!!settings.ballcam;$('hud').dataset.mode=sim.options.mode;$('hud').dataset.replay='false';nameplates.hide();
 const net=online(),guest=net&&room.role==='guest';$('restart-button').disabled=guest;$('rematch-button').disabled=false;text('rematch-button','PLAY AGAIN');text('leave-button',net?(room.matchmade?'LEAVE MATCH':'LEAVE ROOM'):'EXIT TO MAIN MENU');text('menu-button',net?(room.matchmade?'LEAVE MATCH':'LEAVE ROOM'):'EXIT TO MAIN MENU');show('party-manage',!!room?.party);show('pause-note',net);text('pause-note',guest?'The match continues while your menu is open.':'You control the match. Pausing also pauses it for your guest.');
 show('lobby',false);show('hud',true);show('network-hud',net||!!sim.options.quickplayBots);if(sim.options.quickplayBots)text('network-hud','BOT MATCH · CASUAL 1v1');show('replay',false);show('score-panel',false);show('event-feed',false);show('practice-tools',['free','training'].includes(sim.options.mode));show('next-shot-button',sim.options.mode==='training');show('training-progress',sim.options.mode==='training');document.activeElement?.blur();$('arena').focus();updateHUD();
}
function pause(){if(!started||paused||sim.phase==='ended')return;paused=true;input.clear();if(online()){if(room.role==='host')room.setPaused(true);else{room.guestStep({});room.sendInputs(true);}}show('score-panel',false);dialog('pause-dialog');sound.update();}
function resume(){if(!started)return;closeAll();paused=false;accumulator=0;motion.reset(sim);input.clear();if(online()&&room.role==='host')room.setPaused(false);$('arena').focus();}
function menu(leaveNetwork=true){matchmaking?.cancel();matchmaking=null;socialUI.reset();if(leaveNetwork){room?.close();room=null;roomUI.render(null);}started=false;paused=false;resultSaved=false;input.clear();closeAll();networkUI.render(null,null);nameplates.hide();lobbyUI.home();show('hud',false);show('replay',false);show('score-panel',false);show('lobby',true);sim=new Simulation({mode:'free'});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);syncSettings();sound.update();}
function result(){if(resultSaved)return;resultSaved=true;paused=false;input.clear();close('pause-dialog');close('settings-dialog');close('chat-dialog');close('profile-dialog');show('replay',false);show('score-panel',false);const spectator=localId()===null,p=localCar()||{team:-1,score:0,touches:0,goals:0},mode=sim.options.mode,practice=['free','training'].includes(mode),winningTeam=sim.score[0]>sim.score[1]?0:1,won=winningTeam===p.team;const xp=Math.round(p.score+(practice?50:won?250:75)+(mode==='training'?sim.trainingHits*75:0));
 if(!spectator){settings.xp+=xp;settings.touches+=p.touches;}if(!practice&&!spectator){settings.matches++;if(won)settings.wins++;settings.goals+=p.goals;settings.history.unshift({mode,blue:sim.score[0],orange:sim.score[1],won});settings.history=settings.history.slice(0,8);}save();
 text('result-eyebrow',practice?'SESSION COMPLETE':'WINNER');text('result-title',mode==='training'?'TRAINING':mode==='free'?'FREE PLAY':winningTeam?'ORANGE':'BLUE');$('result-dialog').classList.toggle('orange-result',!practice&&winningTeam===1);text('result-description',mode==='training'?`${sim.trainingHits} / 5 drills completed successfully.`:mode==='free'?'Practice session complete.':names[mode]+' · CHAMPIONS FIELD'+(online()?(room.matchmade?' · ONLINE MATCH':' · PRIVATE MATCH'):sim.options.quickplayBots?' · BOT MATCH':''));
 text('result-blue',sim.score[0]);text('result-orange',sim.score[1]);text('result-goals',p.goals);text('result-touches',p.touches);text('result-xp',spectator?0:xp);dialog('result-dialog');networkUI.render(room,sim);syncSettings();sound.update();
}
function updateHUD(){const s=sim.state(localId());text('blue-score',s.score[0]);text('orange-score',s.score[1]);text('match-label',names[s.mode]);let seconds=Math.ceil(s.remaining);if(s.mode==='free')text('clock','∞');else if(s.mode==='training')text('clock',`${Math.max(0,Math.ceil(s.shotTime))}s`);else text('clock',`${s.overtime?'+':''}${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);show('overtime',s.overtime);
 networkUI.render(room,sim);document.querySelector('.boost-hud').hidden=localId()===null;
 text('boost-value',Math.round(s.boost));$('boost-arc').style.strokeDashoffset=String(100-clamp(s.boost,0,100));document.querySelector('.boost-hud').classList.toggle('low',s.boost<15);text('speed-value',Math.round(s.speed));show('supersonic',s.supersonic);text('camera-status',view.cameraMode?'ON':'OFF');$('camera-button').setAttribute('aria-pressed',String(view.cameraMode));text('camera-mode','BALL CAM');text('camera-toggle-key',input.controller?(PAD_BUTTONS[settings.gamepad.buttons.camera]?.split(' / ')[controllerUI?.family==='PLAYSTATION'?1:0]||'—'):bindingName(settings.bindings.camera));text('chat-toggle-key',input.controller?(PAD_BUTTONS[settings.gamepad.buttons.chat]?.split(' / ')[controllerUI?.family==='PLAYSTATION'?1:0]||'—'):'ENTER / '+bindingName(settings.bindings.chat));text('input-device',input.controller?(controllerUI?.family||'STANDARD GAMEPAD'):'KEYBOARD + MOUSE');if(input.controller){const label=action=>(PAD_BUTTONS[settings.gamepad.buttons[action]]||'UNBOUND').split(' / ')[controllerUI?.family==='PLAYSTATION'?1:0];document.querySelector('.controls-hint').textContent=label('jump')+' JUMP · '+label('boost')+' BOOST · '+label('drift')+' SLIDE';}
 show('performance',!!settings.fps);if(settings.fps)text('performance',`${renderFPS} FPS · 120 Hz PHYSICS`);
 if(s.mode==='training')text('training-progress',`SHOT ${Math.min(5,s.trainingIndex+1)} / 5  ·  ${s.drillName}  ·  ${s.trainingHits} COMPLETE`);
 if(online()&&room.recovering){text('match-message','RECONNECTING');$('match-message').className='match-message';}
 else if(online()&&room.role==='guest'&&room.hostPaused){text('match-message','HOST PAUSED');$('match-message').className='match-message';}
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
 controllerUI?.update(now);
 const rawDt=(now-last)/1000,dt=Math.min(.1,Math.max(0,rawDt));last=now;frames++;fpsTime+=dt;if(fpsTime>=.5){renderFPS=Math.round(frames/fpsTime);frames=0;fpsTime=0;}
 if(started){const controls=input.read(dt),net=online(),guest=net&&room.role==='guest';if(input.controller&&controls.jump&&!replayJumpHeld&&sim.phase==='goal')skipReplay();replayJumpHeld=controls.jump;const driven=localCar();if(driven)driven.renderSteer=controls.steer;
  if(guest){
   if(!room.hostPaused&&!room.recovering&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){room.guestStep(paused?{}:controls);accumulator-=C.step;}room.sendInputs();}else accumulator=0;
  }else if(!paused&&!room?.recovering&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){if(net)room.hostStep(controls,C.step);else sim.step(controls,C.step);motion.capture(sim);accumulator-=C.step;}}
  handleEvents();if(sim.phase==='ended'&&!resultSaved)result();if(net&&!guest)room.publish();if(!paused&&sim.phase!=='ended')view.monitorFrame(rawDt);
  const replay=sim.phase==='goal'&&!$('replay').hidden&&replayFrames.length>0;
  const state=replay?motion.sampleReplay(replayFrames,clamp((4-sim.phaseTime)/4,0,1)):guest?(room.replica.sample(now,dt)||motion.sample(1)):motion.sample(paused||room?.recovering||sim.phase==='ended'?1:accumulator/C.step);
  view.update(sim,room?.recovering||paused&&!guest?0:dt,false,state,replay);nameplates.update(view,sim,replay,settings.interface.nameplates&&!paused&&sim.phase!=='ended');if($('hud').dataset.replay!==String(replay))$('hud').dataset.replay=String(replay);if(now-lastUI>70){updateHUD();lastUI=now;}
 }else if(!matchmaking)view.update(sim,dt,true); // Leave the showroom still while finding/preparing a peer.

 sound.update();
}
function fail(error){console.error(error);show('loading',false);show('lobby',false);show('hud',false);show('error',true);text('error-detail','The 3D renderer needs WebGL and browser graphics acceleration. '+(error?.message||''));}
$('open-online').addEventListener('click',openMatchmaking);$('matchmaking-dialog').addEventListener('close',()=>{if($('matchmaking-dialog').open)return;const current=matchmaking;matchmaking=null;current?.cancel();});
$('play-button').addEventListener('click',start);$('restart-button').addEventListener('click',start);$('resume-button').addEventListener('click',resume);$('leave-button').addEventListener('click',()=>menu());$('menu-button').addEventListener('click',()=>menu());$('pause-button').addEventListener('click',pause);$('camera-button').addEventListener('click',toggleCamera);$('reset-button').addEventListener('click',()=>action('reset'));$('next-shot-button').addEventListener('click',()=>action('next'));$('end-practice-button').addEventListener('click',()=>{sim.end();handleEvents();});function skipReplay(){if(online())room.skipReplay();else sim.skipReplay();motion.reset(sim);handleEvents();}$('skip-replay').addEventListener('click',skipReplay);
$('open-multiplayer').addEventListener('click',()=>{if(room?.party){partyUI.render(room);partyUI.open();}else{roomUI.render(room);roomUI.open();}});$('open-custom-lobby').addEventListener('click',()=>{close('multiplayer-dialog');partyUI.render(room?.party?room:null);partyUI.open();});$('party-manage').addEventListener('click',()=>{if(room?.party){partyUI.render(room);partyUI.open();}});
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;view?.graphics.resetTiming();if(document.hidden)pause();else motion?.reset(sim);});
for(const [button,id]of [['garage-button','garage-dialog'],['customize-button','garage-dialog'],['controls-button','controls-dialog'],['settings-button','settings-dialog'],['about-button','about-dialog']])$(button).addEventListener('click',()=>dialog(id));
$('pause-settings-button').addEventListener('click',()=>{close('pause-dialog');dialog('settings-dialog');});$('settings-dialog').addEventListener('close',()=>{if(started&&paused)dialog('pause-dialog');});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resume();});$('result-dialog').addEventListener('cancel',e=>{e.preventDefault();menu();});
$('garage-dialog').addEventListener('close',()=>{document.body.classList.remove('garage-open');bodySelection++;$('garage-dialog').removeAttribute('aria-busy');text('garage-status','');});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>close(b.dataset.close)));document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d||['pause-dialog','result-dialog','multiplayer-dialog','matchmaking-dialog','party-dialog'].includes(d.id))return;const rect=d.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)d.close();}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{settings.mode=b.dataset.mode;save();syncSettings();}));
for(const id of ['duration','difficulty'])$(id).addEventListener('change',()=>{settings[id]=id==='duration'?Number($(id).value):$(id).value;save();syncSettings();});
document.querySelectorAll('[data-body]').forEach(button=>button.addEventListener('click',()=>chooseBody(button.dataset.body)));
document.querySelectorAll('[data-paint]').forEach(button=>button.addEventListener('click',()=>{settings.paint=button.dataset.paint;save();syncSettings();if(!started)view.sync(sim,paints[settings.paint].hex,settings.body);}));
for(const id of ['quality','sound','ballcam','fps-toggle'])$(id).addEventListener('change',()=>{settings.quality=$('quality').value;settings.sound=$('sound').checked;settings.ballcam=$('ballcam').checked;settings.fps=$('fps-toggle').checked;save();if(id==='quality')view.quality(settings.quality);view.cameraMode=settings.ballcam;if(settings.sound)sound.start();});
$('career-button').addEventListener('click',()=>{text('career-matches',settings.matches);text('career-wins',settings.wins);text('career-goals',settings.goals);text('career-touches',settings.touches);const list=$('history');list.replaceChildren();if(!settings.history.length)list.textContent='Your first match is the start of your story.';for(const h of settings.history){const row=document.createElement('div');row.className='history-row';const label=document.createElement('strong'),score=document.createElement('span');label.textContent=(names[h.mode]||'MATCH')+(h.won?' · WIN':' · LOSS');score.textContent=`${Math.max(0,Number(h.blue)||0)} — ${Math.max(0,Number(h.orange)||0)}`;row.append(label,score);list.append(row);}dialog('career-dialog');});
$('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{feed('FULLSCREEN UNAVAILABLE IN THIS VIEW');}});$('retry-button').addEventListener('click',()=>location.reload());window.addEventListener('resize',()=>view?.resize());document.addEventListener('visibilitychange',()=>{if(document.hidden&&matchmaking){const current=matchmaking;matchmaking=null;current.cancel();matchUI.render({phase:'cancelled',reason:'Search stopped while the game was hidden. Search again when you are ready.'});}});window.addEventListener('pagehide',event=>{matchmaking?.cancel();matchmaking=null;room?.close();socialUI.reset();if(event.persisted){pause();return;}socialAccess.dispose();socialUI.dispose();input?.dispose();view?.dispose();sound.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&room?.closed){const matched=room.matchmade;menu();if(matched){matchUI.render({phase:'idle',reason:'The match closed when you left this page. Search for a new opponent.'});dialog('matchmaking-dialog');}else{roomUI.render(null,'The room closed when you left this page. Create or join a new room.');dialog('multiplayer-dialog');}}});
try{view=new GameView($('arena'));view.setCamera(settings.camera);view.quality(settings.quality);text('loading-label','OPENING CHAMPIONS FIELD');await view.loadAssets(event=>{const asset=event.asset==='stadium'?'Champions Field':event.asset==='ball'?'Rocket League ball':event.asset==='inner'?'Champions Field pitch':'Fennec';text('loading-progress',event.total?`${asset} · ${Math.round(event.loaded/event.total*100)}%`:`Loading ${asset}…`);});await prepareSavedBody();sim=new Simulation({mode:'free'});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);input=new Input($('arena'),{bindings:settings.bindings,controls:settings.controls,gamepad:settings.gamepad,active:()=>started&&!paused&&sim.phase!=='ended'&&!$('chat-dialog').open&&!$('profile-dialog').open&&!$('controller-keyboard').open,action,freeCamera:()=>!view.cameraMode,look:(yaw,pitch)=>view.orbitCamera(yaw,pitch),lookStick:(x,y)=>view.stickCamera(x,y)});settingsUI=setupSettings(settings,{save,apply:kind=>{if(kind==='camera')view.setCamera(settings.camera);if(kind==='controls')input.setPreferences({bindings:settings.bindings,controls:settings.controls,gamepad:settings.gamepad});if(kind==='audio')sound.update();if(kind==='interface')applyInterface();}});gamepadUI=setupGamepadBindings(settings,{save,apply:()=>input.setPreferences({gamepad:settings.gamepad})});controllerUI=new ControllerUI({consume:ids=>input.consumeButtons(ids),playing:()=>started&&!paused&&sim.phase!=='ended',back:()=>{if(started)pause();else lobbyUI.home();}});syncSettings();save();text('loading-label','WARMING UP THE ARENA');await view.prepare();last=performance.now();show('loading',false);show('lobby',true);if(vehicleWarning)text('menu-help',vehicleWarning);Object.defineProperty(window,'boostCircuit',{value:Object.freeze({version:'1.16.0',getPerformance:()=>({...view.diagnostics(),fps:renderFPS,prediction:room?.replica?.diagnostics()||null}),getState:()=>structuredClone({...sim.state(localId()),active:started,paused,localPlayerId:localId(),network:online()?{role:room.role,hostPaused:room.hostPaused,rtt:room.rtt}:null})})});requestAnimationFrame(frame);}catch(error){fail(error);}
