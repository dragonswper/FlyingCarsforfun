import {Simulation,C,clamp} from './physics.js';
import {GameView} from './scene.js';
import {MotionBuffer} from './motion.js';
import {prepareMatchView} from './match-assets.js';
import {matchMVP,MATCH_POINTS} from './scoring.js';
import {Input} from './input.js';
import {randomArena} from './arenas.js';
import {CompactUI} from './compact-ui.js';
import {RenderPacer} from './performance.js';
import {HudLayout,hudPreferences} from './hud-layout.js';
import {ScreenMode,screenPreferences} from './screen-mode.js';
import {TouchControls,mobileDevice,touchPreferences} from './touch-controls.js';
import {GameSound} from './audio.js';
import {musicPreferences,setupLobbyMusic} from './lobby-music.js';
import {FriendsClient} from './friends-client.js';
import {setupFriendsUI} from './friends-ui.js';
import {renderingPreferences} from './render-settings.js';
import {audioPreferences} from './engine-model.js';
import {ARENAS,normalizeArena,arenaName} from './arenas.js';
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
for(const [name,valid]of Object.entries({mode:['duel','doubles','free','training'],duration:[120,300],difficulty:Object.keys(BOT_LEVELS),quality:['auto','low','balanced','high','ultra','mobile'],paint:Object.keys(paints),body:BODY_TYPES}))if(!valid.includes(settings[name]))settings[name]=defaults[name];
for(const field of ['xp','matches','wins','goals','touches'])settings[field]=clamp(Number(settings[field])||0,0,1e9);
if(settings.vehicleRevision!==2){settings.body='fennec';settings.vehicleRevision=2;}
if(settings.performanceRevision!==1){if(settings.quality==='high')settings.quality='auto';settings.performanceRevision=1;}
const compactUI=new CompactUI();
const mobileClient=mobileDevice();document.body.classList.toggle('mobile-device',mobileClient);settings.touch=touchPreferences(settings.touch);settings.hudLayouts=hudPreferences(settings.hudLayouts);settings.screen=screenPreferences(settings.screen);const renderPacer=new RenderPacer({mobile:mobileClient||settings.quality==='mobile'});
settings.arena=normalizeArena(settings.arena);Object.assign(settings,audioPreferences(settings),musicPreferences(settings));settings.rendering=renderingPreferences(settings.rendering);
settings.camera=normalizeCamera(settings.camera);settings.controls=normalizeControls(settings.controls);settings.bindings=normalizeBindings(settings.bindings);settings.volume=Number.isFinite(Number(settings.volume))?clamp(Number(settings.volume),0,100):80;
settings.interface=normalizeInterface(settings.interface);settings.network=networkPreferences(settings.network);settings.gamepad=gamepadPreferences(settings.gamepad);
// A game served by the Node service can use that same secure origin without
// asking players to copy its address. Static deployments simply return 404.
let communityServer=null;
try{const response=await fetch('/server-config.json',{cache:'no-store',signal:AbortSignal.timeout(1500)});if(response.ok){const config=await response.json();if(config.build===NET_BUILD){settings.serverURL||=location.origin;settings.onlineConnection||='server';settings.customConnection||='server';if(config.social)communityServer=config.server||location.origin;}}}catch{}
settings.history=Array.isArray(settings.history)?settings.history.filter(x=>x&&typeof x==='object').slice(0,8):[];
const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));return true;}catch{return false;}};
let friends=null,friendsUI=null,musicPadHeld=false;
let hudLayout,screenUI,lastTouchLayout=false;
let view,sim,input,touch,motion,settingsUI,gamepadUI,controllerUI,room=null,bodySelection=0,arenaSelection=0,vehicleWarning='',started=false,paused=false,resultSaved=false,accumulator=0,last=performance.now(),lastUI=0,frames=0,fpsTime=0,renderFPS=60,replayFrames=[],lastCount='',feedTimer,scoreToastTimer,scoreSignature='',announcement=null,replayJumpHeld=false,audioControls={};
const localId=()=>sim?.localPlayerId===null?null:sim?.localPlayerId??0,online=()=>!!(room&&!room.closed&&room.matchId),localCar=()=>sim?.cars.find(car=>car.id===localId());
const nameplates=new NameplateLayer($('nameplates'));
const dialog=id=>{if(id==='garage-dialog')document.body.classList.add('garage-open');if(!$(id).open)$(id).showModal();},close=id=>{if($(id).open)$(id).close();},closeAll=()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close());
function applyInterface(){$('hud').style.setProperty('--hud-scale',settings.interface.scale/100);document.querySelector('.speed').hidden=!settings.interface.speed;hudLayout?.apply();}
function syncSettings(){
 document.querySelectorAll('[data-mode]').forEach(b=>{const selected=b.dataset.mode===settings.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-paint]').forEach(b=>{const selected=b.dataset.paint===settings.paint;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-body]').forEach(b=>{const selected=b.dataset.body===settings.body;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 for(const id of ['duration','difficulty','quality','arena-select'])$(id).value=settings[id==='arena-select'?'arena':id];for(const [id,field]of [['sound','sound'],['ballcam','ballcam'],['fps-toggle','fps']])$(id).checked=!!settings[field];
 const theme=ARENAS[settings.arena],cover=theme.cover||(settings.arena==='harbour'?'harbourworks-cover.webp':null),preview=$('harbour-preview');
 show('harbour-preview',!!cover);if(cover){const img=preview.querySelector('img'),src='assets/maps/'+cover;if(img.getAttribute('src')!==src)img.src=src;img.alt=theme.name+' original Blender arena preview';preview.querySelector('small').textContent=theme.model?'NEW ORIGINAL FIELD':'FIELD PREVIEW';preview.querySelector('strong').textContent=theme.name;preview.querySelector('span').textContent=theme.subtitle;}
 const practice=['free','training'].includes(settings.mode);$('duration').disabled=practice;$('difficulty').disabled=practice;
 $('play-screen').dataset.category=practice?'practice':'match';text('play-heading',practice?'TRAINING':'EXHIBITION MATCH');text('play-button',settings.mode==='free'?'START FREE PLAY':settings.mode==='training'?'START TRAINING':'CREATE MATCH');
 text('mode-description',practice?(settings.mode==='free'?'Explore the field. Boost is unlimited.':'Five drills. Fifteen seconds per shot.'):(BOT_LEVELS[settings.difficulty]?.description||'Ready when you are.'));
 const fixed=FIXED_FINISH_BODIES.includes(settings.body);text('showroom-car',BODY_NAMES[settings.body]);text('showroom-paint',fixed?'ORIGINAL ARTIST FINISH':paints[settings.paint].name);text('paint-name',fixed?'ORIGINAL ARTIST FINISH':paints[settings.paint].name);document.querySelectorAll('[data-paint]').forEach(button=>{button.disabled=fixed;});$('paint-dot').style.background=paints[settings.paint].hex;
 text('profile-level',String(1+Math.floor(settings.xp/1000)).padStart(2,'0'));text('profile-xp',`${settings.xp.toLocaleString()} XP · ${settings.wins} VICTORIES`);text('profile-name',playerName(settings.username));$('profile-progress').style.width=(settings.xp%1000)/10+'%';settingsUI?.sync();gamepadUI?.sync();applyInterface();text('arena-name',arenaName(settings.arena));
}
const lobbyUI=setupLobby(settings,{save,sync:syncSettings});
const lobbyMusic=setupLobbyMusic(settings,{save,allowed:()=>!document.hidden&&(!started||sim?.phase==='ended')});
const friendContext=()=>({room,status:document.hidden?'away':started?'playing':room?.connected?'lobby':'menu'});
friendsUI=setupFriendsUI({getClient:()=>friends,context:friendContext,create:existing=>{if(existing&&room?.party){close('friends-dialog');partyUI.render(room);partyUI.open();return;}if(started){feed('Leave the current match to create a lobby.');return;}close('friends-dialog');partyUI.useConnection('server',new URL(friends?.url||settings.serverURL||location.origin).origin);partyUI.render(null);partyUI.open();},join:(code,address)=>{if(started){feed('Leave the current match to join another lobby.');return;}partyUI.useConnection('server',new URL(address).origin);openParty('guest',code);}});
$('online-presence').addEventListener('click',()=>friendsUI.open());
try{const address=communityServer||settings.serverURL||(location.protocol==='https:'?location.origin:null);if(address){friends=new FriendsClient({address,settings,context:friendContext,onChange:()=>friendsUI.render()});friends.sync();}}catch{}
const roomUI=setupRoomUI({host:options=>openRoom('host',options),join:code=>openRoom('guest',code),ready:async value=>{const session=room;if(!session)return;try{if(value)await prepareRoomBodies(session,true);if(room===session&&!session.closed)session.setReady(value);}catch{}},start:()=>startRoom(),leave:()=>{if(started)menu();else{room?.close();room=null;roomUI.render(null);close('multiplayer-dialog');}}});
const partyUI=setupPartyUI({preferences:settings,save,create:options=>openParty('host',options),join:code=>openParty('guest',code),team:team=>room?.party&&room.chooseTeam(team),ready:ready=>room?.party&&room.setReady(ready),start:()=>room?.party&&room.startMatch(),configure:options=>room?.party&&room.configure(options),leave:()=>{if(started)close('party-dialog');else{room?.close();room=null;partyUI.render(null);close('party-dialog');}}});
let matchmaking=null;
const matchUI=setupMatchmakingUI({search:beginMatchmaking,cancel:stopMatchmaking,preferences:settings,save});
const networkUI=setupNetworkUI({preferences:settings.network,save,rematch:()=>room?.party&&room.self?.team===null?(partyUI.render(room),partyUI.open()):online()?room.requestRematch(!room.rematchWanted):start(),next:findNextMatch,leave:()=>menu()}),recoveryStates=new WeakMap();
function roomChanged(session){if(room!==session)return;const recovering=!!session.recovering,previous=recoveryStates.get(session);recoveryStates.set(session,recovering);if(previous!==undefined&&previous!==recovering||recovering&&previous!==true){accumulator=0;input?.clear();if(sim)motion?.reset(sim);view?.resetCamera();}networkUI.render(session,sim);}
function findNextMatch(){if(sim?.phase!=='ended')return;room?.close(true,'next');menu();beginMatchmaking();}
const socialUI=setupSocialUI(settings,{save,send:value=>{if(room?.connected)return room.sendChat(value);socialUI.receive({name:settings.username,text:value});return true;},profile:name=>{text('profile-name',name);friends?.sync();room?.updateProfile(name);const car=localCar();if(car&&!car.networkRole)car.playerName=name;},opened:()=>input?.clear()});
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
 current=new Queue({address:route.address,prepareBodies:(bodies,options)=>prepareMatchView(view,options,()=>Promise.all([...new Set(bodies)].map(body=>view.ensureBody(body))),()=>!current.session?.closed&&(matchmaking===current||room===current.session)),prepare:session=>prepareMatchView(view,session.options,()=>prepareRoomVehicles(session,body=>view.ensureBody(body)),()=>!session.closed&&(matchmaking===current||room===session)),onChange:state=>{if(matchmaking===current)matchUI.render(state);},onRoomChange:state=>{if(state.party)partyUI.render(state);roomChanged(state);},onLobby:session=>{room=session;matchmaking=null;close('matchmaking-dialog');partyUI.render(session);partyUI.open();},onChat:message=>socialUI.receive(message),onChatState:state=>socialUI.setHistory(state),onMatch:(newSim,session)=>{if(matchmaking!==current&&room!==session){session.close();return;}room=session;matchmaking=null;presentMatch(newSim);if(document.hidden)pause();},onBots:async(options,reason)=>{if(matchmaking!==current)return;try{await prepareMatchView(view,options,undefined,()=>matchmaking===current);if(matchmaking!==current)return;matchmaking=null;room=null;presentMatch(new Simulation(options));feed(reason+' Playing against a bot.');if(document.hidden)pause();}catch{if(matchmaking!==current)return;matchmaking=null;matchUI.render({phase:'cancelled',reason:'The random field could not load. Try finding a match again.'});}},onEvents:(events,session)=>appendRoomEvents(session,events),onDisconnect:(reason,session)=>roomDisconnected(session,reason)});
 matchmaking=current;dialog('matchmaking-dialog');current.start({body:settings.body,paint:settings.paint,name:settings.username},{mode:route.mode,arena:route.arena,difficulty:settings.difficulty,network:settings.network});
}
function stopMatchmaking(){const current=matchmaking;matchmaking=null;current?.cancel();close('matchmaking-dialog');$('open-online').focus();}
function openMatchmaking(){if(started)return;matchUI.render({phase:'idle'});matchUI.open();}
function prepareRoomBodies(session,retry=false){
 return prepareMatchView(view,session.options,()=>prepareRoomVehicles(session,body=>view.ensureBody(body),()=>{if(room===session)roomUI.render(session);},retry),()=>room===session&&!session.closed);
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
  const callbacks={prepare:(bodies,options)=>prepareMatchView(view,options||session?.options,()=>Promise.all([...new Set(bodies)].map(body=>view.ensureBody(body))),()=>room===session&&!session.closed),onChange:state=>{if(room===state){partyUI.render(state);roomChanged(state);}},onMatch:newSim=>{if(room===session){presentMatch(newSim);if(document.hidden)pause();}},onEvents:events=>appendRoomEvents(session,events),onChat:message=>socialUI.receive(message),onChatState:state=>socialUI.setHistory(state),onDisconnect:reason=>roomDisconnected(session,reason)};
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
const sound=new GameSound(()=>settings,()=>{
 const car=online()&&room.role==='guest'?room.replica?.predicted:localCar();
 return {active:started&&!paused&&!room?.hostPaused&&!room?.recovering&&sim.phase==='playing'&&localId()!==null,
  speed:car?.v.length()||0,throttle:audioControls.throttle||0,boosting:!!car?.boosting,grounded:car?.grounded!==false,drift:!!audioControls.drift};
});
function feed(message){text('event-feed',message);show('event-feed',true);clearTimeout(feedTimer);feedTimer=setTimeout(()=>show('event-feed',false),2200);}
function setScoreboard(visible){document.body.classList.toggle('scoreboard-open',visible);show('score-panel',visible);$('scoreboard-toggle').setAttribute('aria-expanded',String(visible));}
function renderScore(){
 text('score-context',online()?(room.dedicated?'ONLINE MATCH':'PRIVATE MATCH'):'LOCAL MATCH');
 text('score-rules',`GOAL +${MATCH_POINTS.goal} · ASSIST +${MATCH_POINTS.assist} · SAVE +${MATCH_POINTS.save} · SHOT +${MATCH_POINTS.shot}`);
 const signature=sim.cars.map(c=>[c.id,c.team,c.playerName,c.score,c.goals,c.assists,c.saves,c.shots].join(':')).join('|');if(signature===scoreSignature)return;scoreSignature=signature;
 const rows=$('score-rows');rows.replaceChildren();for(const team of [0,1]){
  const cars=sim.cars.filter(c=>c.team===team);if(!cars.length)continue;const heading=document.createElement('h3');heading.className='score-team-label'+(team?' orange-label':'');heading.textContent=team?'ORANGE':'BLUE';rows.append(heading);
  for(const c of cars){const row=document.createElement('div');row.className='score-row '+(team?'orange-row':'blue-row');for(const value of [driverName(c,localId()),c.score,c.goals,c.assists,c.saves,c.shots]){const span=document.createElement('span');span.textContent=String(value);row.append(span);}rows.append(row);}
 }
}
function announce(message,duration=1.3,kind=''){announcement={message,until:sim.elapsed+duration,kind};}
function toggleCamera(){view.cameraMode=!view.cameraMode;feed(view.cameraMode?'BALL CAM ON':settings.camera.lookStyle==='free'?'FREE LOOK · '+bindingName(settings.bindings.recenter)+' / R3 RECENTERS':'CAR CAM · MIDDLE-MOUSE DRAG / RIGHT STICK TO LOOK');}
function action(name){
 if(name==='pause'&&!$('score-panel').hidden){setScoreboard(false);return;}
 if(['chat','quickchat'].includes(name)){socialUI.open(name==='quickchat',!!room?.connected);return;}
 if(name==='pause'){if(paused)resume();else pause();return;}
 if(!started||paused)return;
 if(name==='camera')toggleCamera();
 if(name==='recenter'&&view.recenterCamera())feed('CAMERA RECENTERED');
 if(room?.dedicated&&['reset','next'].includes(name)){room.practice(name);view.resetCamera();input.clear();return;}
 if(name==='reset'&&sim.resetPractice()){motion.reset(sim);view.resetCamera();feed('BALL RESET');input.clear();}
 if(name==='next'&&sim.options.mode==='training'){sim.nextDrill();motion.reset(sim);view.resetCamera();input.clear();}
 if(name==='scoreboard'){renderScore();setScoreboard($('score-panel').hidden);}
 if(name==='hide-scoreboard')setScoreboard(false);
}
let botRematchLoading=false;
async function startBotRematch(){
 if(botRematchLoading)return;botRematchLoading=true;const previous=sim,options={...sim.options,arena:randomArena(sim.options.arena)};
 sound.start();$('rematch-button').disabled=$('restart-button').disabled=true;text('rematch-button','LOADING FIELD…');
 try{await prepareMatchView(view,options,undefined,()=>started&&sim===previous&&!online());if(started&&sim===previous&&!online())presentMatch(new Simulation(options));}
 catch{if(sim===previous)text('rematch-button','RETRY FIELD');}
 finally{botRematchLoading=false;if(sim===previous){$('rematch-button').disabled=$('restart-button').disabled=false;}}
}
function start(){
 if(online()){if(sim.phase==='ended')room.requestRematch(!room.rematchWanted);else if(room.role==='host')startRoom();return;}
 if(started&&sim.options.quickplayBots){startBotRematch();return;}
 sound.start();closeAll();settings.duration=Number($('duration').value);settings.difficulty=$('difficulty').value;save();
 presentMatch(new Simulation({mode:settings.mode,duration:settings.duration,difficulty:settings.difficulty,arena:settings.arena}));
}
function clearScoreToast(){clearTimeout(scoreToastTimer);show('score-toast',false);}
function presentMatch(newSim){
 clearScoreToast();
 renderPacer.reset();sim=newSim;if(!online())sim.cars[0].playerName=settings.username;closeAll();motion=new MotionBuffer(sim);view.graphics.resetTiming();started=true;paused=false;resultSaved=false;accumulator=0;lastCount='';scoreSignature='';announcement=null;replayFrames=[];input.clear();view.sync(sim,paints[settings.paint].hex,settings.body);view.cameraMode=!!settings.ballcam;$('hud').dataset.mode=sim.options.mode;$('hud').dataset.replay='false';nameplates.hide();
 const net=online(),guest=net&&room.role==='guest';$('restart-button').disabled=guest;$('rematch-button').disabled=false;text('rematch-button','PLAY AGAIN');text('leave-button',net?(room.matchmade?'LEAVE MATCH':'LEAVE ROOM'):'EXIT TO MAIN MENU');text('menu-button',net?(room.matchmade?'LEAVE MATCH':'LEAVE ROOM'):'EXIT TO MAIN MENU');show('party-manage',!!room?.party);show('pause-note',net);text('pause-note',guest?'The match continues while your menu is open.':'You control the match. Pausing also pauses it for your guest.');
 show('lobby',false);show('hud',true);show('network-hud',net||!!sim.options.quickplayBots);if(sim.options.quickplayBots)text('network-hud','BOT MATCH · CASUAL 1v1');show('replay',false);setScoreboard(false);show('event-feed',false);show('practice-tools',['free','training'].includes(sim.options.mode));show('next-shot-button',sim.options.mode==='training');show('training-progress',sim.options.mode==='training');document.activeElement?.blur();$('arena').focus();updateHUD();hudLayout?.apply();
}
function pause(){if(!started||paused||sim.phase==='ended')return;paused=true;input.clear();if(online()){if(room.role==='host')room.setPaused(true);else{room.guestStep({});room.sendInputs(true);}}setScoreboard(false);dialog('pause-dialog');sound.update();}
function resume(){if(!started)return;closeAll();paused=false;accumulator=0;motion.reset(sim);input.clear();if(online()&&room.role==='host')room.setPaused(false);$('arena').focus();}
function menu(leaveNetwork=true){clearScoreToast();matchmaking?.cancel();matchmaking=null;socialUI.reset();if(leaveNetwork){room?.close();room=null;roomUI.render(null);}started=false;paused=false;resultSaved=false;input.clear();closeAll();networkUI.render(null,null);nameplates.hide();lobbyUI.home();show('hud',false);show('replay',false);setScoreboard(false);show('lobby',true);sim=new Simulation({mode:'free',arena:settings.arena});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);syncSettings();sound.update();}
function result(){if(resultSaved)return;resultSaved=true;paused=false;input.clear();close('pause-dialog');close('settings-dialog');close('chat-dialog');close('profile-dialog');show('replay',false);setScoreboard(false);const spectator=localId()===null,p=localCar()||{team:-1,score:0,touches:0,goals:0},mode=sim.options.mode,practice=['free','training'].includes(mode),winningTeam=sim.score[0]>sim.score[1]?0:1,won=winningTeam===p.team;const xp=Math.round(p.score+(practice?50:won?250:75)+(mode==='training'?sim.trainingHits*75:0));
 if(!spectator){settings.xp+=xp;settings.touches+=p.touches;}if(!practice&&!spectator){settings.matches++;if(won)settings.wins++;settings.goals+=p.goals;settings.history.unshift({mode,blue:sim.score[0],orange:sim.score[1],won});settings.history=settings.history.slice(0,8);}save();
 text('result-eyebrow',practice?'SESSION COMPLETE':'WINNER');text('result-title',mode==='training'?'TRAINING':mode==='free'?'FREE PLAY':winningTeam?'ORANGE':'BLUE');$('result-dialog').classList.toggle('orange-result',!practice&&winningTeam===1);text('result-description',mode==='training'?`${sim.trainingHits} / 5 drills completed successfully.`:mode==='free'?'Practice session complete.':names[mode]+' · '+arenaName(sim.options.arena)+(online()?(room.matchmade?' · ONLINE MATCH':' · PRIVATE MATCH'):sim.options.quickplayBots?' · BOT MATCH':''));
 text('result-blue',sim.score[0]);text('result-orange',sim.score[1]);text('result-goals',p.goals);text('result-touches',p.touches);text('result-points',p.score||0);const mvp=matchMVP(sim);show('result-mvp',!!mvp);text('result-mvp',mvp?'MVP · '+driverName(mvp,localId())+' · '+mvp.score+' POINTS':'');text('result-xp',spectator?0:xp);dialog('result-dialog');networkUI.render(room,sim);syncSettings();sound.update();
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
 if(e.type==='score'){
  if(e.car===localId()){const label={shot:'SHOT ON GOAL',save:'SAVE',assist:'ASSIST',goal:'GOAL'}[e.kind];if(label){clearTimeout(scoreToastTimer);text('score-toast',label+' +'+e.points);show('score-toast',true);scoreToastTimer=setTimeout(()=>show('score-toast',false),2200);}}
 }else if(e.type==='goal'){
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
 controllerUI?.update(now);const musicPadDown=Array.from(navigator.getGamepads?.()||[]).some(pad=>pad?.buttons.some(button=>button.pressed));if(musicPadDown&&!musicPadHeld)lobbyMusic.unlock();musicPadHeld=musicPadDown;
 touch?.update();if(touch&&lastTouchLayout!==touch.ui.enabled){lastTouchLayout=touch.ui.enabled;hudLayout?.apply();}const rawDt=(now-last)/1000,dt=Math.min(.1,Math.max(0,rawDt));last=now;fpsTime+=Math.max(0,rawDt);renderPacer.mobile=mobileClient||settings.quality==='mobile';renderPacer.limit=settings.rendering.frameLimit;const draw=renderPacer.draw(now,!started||paused||!!document.querySelector('dialog[open]'));if(draw)frames++;if(fpsTime>=.5){renderFPS=Math.round(frames/fpsTime);frames=0;fpsTime=0;}
 if(started){const controls=input.read(dt),net=online(),guest=net&&room.role==='guest';audioControls=paused?{}:controls;if(input.controller&&controls.jump&&!replayJumpHeld&&sim.phase==='goal')skipReplay();replayJumpHeld=controls.jump;const driven=localCar();if(driven)driven.renderSteer=controls.steer;
  if(guest){
   if(!room.hostPaused&&!room.recovering&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){room.guestStep(paused?{}:controls);accumulator-=C.step;}room.sendInputs();}else accumulator=0;
  }else if(!paused&&!room?.recovering&&sim.phase!=='ended'){accumulator+=dt;let iterations=0;while(accumulator>=C.step&&iterations++<12){if(net)room.hostStep(controls,C.step);else sim.step(controls,C.step);motion.capture(sim);accumulator-=C.step;}}
  handleEvents();if(sim.phase==='ended'&&!resultSaved)result();if(net&&!guest)room.publish();if(draw&&!paused&&sim.phase!=='ended')view.monitorFrame(renderPacer.dt,renderPacer.limit?Math.min(renderPacer.limit,renderPacer.mobile?60:144):60);
  const replay=sim.phase==='goal'&&!$('replay').hidden&&replayFrames.length>0;
  if(draw){const state=replay?motion.sampleReplay(replayFrames,clamp((4-sim.phaseTime)/4,0,1)):guest?(room.replica.sample(now,renderPacer.dt,room.hostPaused||room.recovering||sim.phase==='ended'?1:accumulator/C.step)||motion.sample(1)):motion.sample(paused||room?.recovering||sim.phase==='ended'?1:accumulator/C.step);
  view.update(sim,room?.recovering||paused&&!guest?0:renderPacer.dt,false,state,replay);nameplates.update(view,sim,replay,settings.interface.nameplates&&!paused&&sim.phase!=='ended');}if($('hud').dataset.replay!==String(replay))$('hud').dataset.replay=String(replay);if(now-lastUI>70){updateHUD();lastUI=now;}
 }else if(!matchmaking&&draw)view.update(sim,renderPacer.dt,true); // Leave the showroom still while finding/preparing a peer.

 sound.update(dt);lobbyMusic.update(dt);
}
function fail(error){console.error(error);show('loading',false);show('lobby',false);show('hud',false);show('error',true);text('error-detail','The 3D renderer needs WebGL and browser graphics acceleration. '+(error?.message||''));}
$('open-online').addEventListener('click',openMatchmaking);$('matchmaking-dialog').addEventListener('close',()=>{if($('matchmaking-dialog').open)return;const current=matchmaking;matchmaking=null;current?.cancel();});
$('explore-harbour').addEventListener('click',()=>{$('open-training').click();settings.mode='free';syncSettings();$('arena-select').value='yuletide';$('arena-select').dispatchEvent(new Event('change'));});
$('scoreboard-toggle').addEventListener('click',()=>{if(started&&sim.phase!=='ended')action('scoreboard');});$('score-close').addEventListener('click',()=>{setScoreboard(false);$('arena').focus();});
$('play-button').addEventListener('click',start);$('restart-button').addEventListener('click',start);$('resume-button').addEventListener('click',resume);$('leave-button').addEventListener('click',()=>menu());$('menu-button').addEventListener('click',()=>menu());$('pause-button').addEventListener('click',pause);$('camera-button').addEventListener('click',toggleCamera);$('reset-button').addEventListener('click',()=>action('reset'));$('next-shot-button').addEventListener('click',()=>action('next'));$('end-practice-button').addEventListener('click',()=>{sim.end();handleEvents();});function skipReplay(){if(online())room.skipReplay();else sim.skipReplay();motion.reset(sim);view.resetCamera();handleEvents();}$('skip-replay').addEventListener('click',skipReplay);
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
$('arena-select').addEventListener('change',async()=>{
 if(started)return;const request=++arenaSelection,previous=settings.arena,next=$('arena-select').value;let failure='';
 $('play-button').disabled=true;$('play-screen').setAttribute('aria-busy','true');text('mode-description','Preparing '+arenaName(next)+'…');
 try{
  await view.ensureArena(next);if(request!==arenaSelection)return;
  settings.arena=normalizeArena(next);sim.options.arena=settings.arena;view.setArena(settings.arena);save();syncSettings();await view.prepare();
 }catch{if(request!==arenaSelection)return;settings.arena=previous;sim.options.arena=previous;view.setArena(previous);save();failure='This field could not load. Select it again to retry.';}
 finally{if(request===arenaSelection){$('play-button').disabled=false;$('play-screen').setAttribute('aria-busy','false');syncSettings();if(failure)text('mode-description',failure);}}
});

for(const id of ['quality','sound','ballcam','fps-toggle'])$(id).addEventListener('change',()=>{settings.quality=$('quality').value;settings.sound=$('sound').checked;settings.ballcam=$('ballcam').checked;settings.fps=$('fps-toggle').checked;save();if(id==='quality')view.quality(settings.quality);view.cameraMode=settings.ballcam;if(settings.sound)sound.start();});
$('career-button').addEventListener('click',()=>{text('career-matches',settings.matches);text('career-wins',settings.wins);text('career-goals',settings.goals);text('career-touches',settings.touches);const list=$('history');list.replaceChildren();if(!settings.history.length)list.textContent='Your first match is the start of your story.';for(const h of settings.history){const row=document.createElement('div');row.className='history-row';const label=document.createElement('strong'),score=document.createElement('span');label.textContent=(names[h.mode]||'MATCH')+(h.won?' · WIN':' · LOSS');score.textContent=`${Math.max(0,Number(h.blue)||0)} — ${Math.max(0,Number(h.orange)||0)}`;row.append(label,score);list.append(row);}dialog('career-dialog');});
$('retry-button').addEventListener('click',()=>location.reload());window.addEventListener('resize',()=>view?.resize());document.addEventListener('visibilitychange',()=>{if(document.hidden)sound.silence();else if(settings.sound&&sound.ctx)sound.start();lobbyMusic.update(0);if(!document.hidden)friends?.sync();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&matchmaking){const current=matchmaking;matchmaking=null;current.cancel();matchUI.render({phase:'cancelled',reason:'Search stopped while the game was hidden. Search again when you are ready.'});}});window.addEventListener('pagehide',event=>{matchmaking?.cancel();matchmaking=null;room?.close();socialUI.reset();friends?.leave();if(event.persisted){pause();return;}socialAccess.dispose();socialUI.dispose();compactUI.dispose();hudLayout?.dispose();screenUI?.dispose();input?.dispose();view?.dispose();sound.dispose();lobbyMusic.dispose();friends?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&room?.closed){const matched=room.matchmade;menu();if(matched){matchUI.render({phase:'idle',reason:'The match closed when you left this page. Search for a new opponent.'});dialog('matchmaking-dialog');}else{roomUI.render(null,'The room closed when you left this page. Create or join a new room.');dialog('multiplayer-dialog');}}});
try{view=new GameView($('arena'),{mobile:mobileClient});view.setCamera(settings.camera);view.setRendering(settings.rendering);view.quality(settings.quality);text('loading-label','OPENING '+arenaName(settings.arena));await view.loadAssets(event=>{const asset=ARENAS[event.asset]?.model?ARENAS[event.asset].name:event.asset==='harbour'?'Harbourworks stadium':event.asset==='stadium'?'Champions Field':event.asset==='ball'?'Rocket League ball':event.asset==='inner'?'Champions Field pitch':'Fennec';text('loading-progress',event.total?`${asset} · ${Math.round(event.loaded/event.total*100)}%`:`Loading ${asset}…`);},settings.arena);await view.ensureArena(settings.arena,event=>text('loading-progress',arenaName(settings.arena)+' · '+Math.round(event.total?event.loaded/event.total*100:0)+'%'));await prepareSavedBody();sim=new Simulation({mode:'free',arena:settings.arena});motion=new MotionBuffer(sim);view.sync(sim,paints[settings.paint].hex,settings.body);input=new Input($('arena'),{bindings:settings.bindings,controls:settings.controls,gamepad:settings.gamepad,active:()=>started&&!paused&&sim.phase!=='ended'&&!document.querySelector('dialog[open]'),action,freeCamera:()=>!view.cameraMode,look:(yaw,pitch)=>view.orbitCamera(yaw,pitch),lookStick:(x,y)=>view.stickCamera(x,y),lookDrag:active=>view.dragCamera(active)});touch=new TouchControls({canvas:$('arena'),preferences:settings.touch,mobile:mobileClient,active:()=>input.active()&&$('score-panel').hidden,action,freeCamera:()=>!view.cameraMode,look:(yaw,pitch)=>view.orbitCamera(yaw,pitch),lookDrag:active=>view.dragCamera(active),practice:()=>['free','training'].includes(sim.options.mode)});input.touch=touch;hudLayout=new HudLayout({settings,save,mobile:mobileClient});screenUI=new ScreenMode({settings,save,resize:()=>{view.resize();hudLayout.apply();}});
for(const id of ['touch-mode','touch-scale'])$(id).addEventListener('change',()=>{settings.touch=touchPreferences({mode:$('touch-mode').value,scale:$('touch-scale').value});touch.setPreferences(settings.touch);hudLayout.apply();save();});$('touch-mode').value=settings.touch.mode;$('touch-scale').value=settings.touch.scale;$('touch-scale-value').value=settings.touch.scale+'%';$('touch-scale').addEventListener('input',()=>{$('touch-scale-value').value=$('touch-scale').value+'%';});
settingsUI=setupSettings(settings,{save,apply:kind=>{if(kind==='camera')view.setCamera(settings.camera);if(kind==='controls')input.setPreferences({bindings:settings.bindings,controls:settings.controls,gamepad:settings.gamepad});if(kind==='audio')sound.update();if(kind==='audio-preview')sound.preview();if(kind==='rendering')view.setRendering(settings.rendering);if(kind==='interface')applyInterface();}});gamepadUI=setupGamepadBindings(settings,{save,apply:()=>input.setPreferences({gamepad:settings.gamepad})});controllerUI=new ControllerUI({consume:ids=>input.consumeButtons(ids),playing:()=>started&&!paused&&sim.phase!=='ended',back:()=>{if(started)pause();else lobbyUI.home();}});syncSettings();save();text('loading-label','WARMING UP THE ARENA');await view.prepare();last=performance.now();show('loading',false);show('lobby',true);if(vehicleWarning)text('menu-help',vehicleWarning);Object.defineProperty(window,'boostCircuit',{value:Object.freeze({version:'1.27.0',getFriends:()=>structuredClone({self:friends?.state?.self||null,online:friends?.state?.online??null}),getPerformance:()=>({...view.diagnostics(),touch:touch?.diagnostics(),hudLayout:hudLayout?.currentProfile(),mobilePreview:mobileClient,audio:sound.diagnostics(),lobbyMusic:lobbyMusic.diagnostics(),fps:renderFPS,prediction:room?.replica?.diagnostics()||null}),getState:()=>structuredClone({...sim.state(localId()),active:started,paused,localPlayerId:localId(),network:online()?{role:room.role,hostPaused:room.hostPaused,rtt:room.rtt}:null})})});requestAnimationFrame(frame);}catch(error){fail(error);}
