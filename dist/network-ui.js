import {REGIONS,networkPreferences} from './network-quality.js';
import {routeLabel} from './network-route.js';
export function connectionDetails(room,quality){
 if(!room||room.closed)return 'No peer connected. During a match, compare network ping with game response here.';
 const info=room.connectionInfo,parts=[routeLabel(info),info?.networkPing==null?'Network ping unavailable':'Network '+info.networkPing+' ms',quality?.ping==null?'Measuring game response':'Game '+quality.ping+' ms'];
 const buffer=room.replica?.diagnostics().serverInputQueueMs;
 if(room.dedicated&&Number.isFinite(buffer))parts.push('Server input buffer '+buffer+' ms');
 let hint='';if(info?.networkPing!=null&&quality?.ping>info.networkPing+100)hint=' Game response adds delay beyond the network measurement. Try Low graphics and keep both game tabs visible.';else if(info?.route==='relay')hint=' This connection is using a relay. Its location and network routing can increase ping.';else if(room.dedicated&&quality?.ping>180)hint=' Your driving and ball touches respond locally. Confirmed results and other players still depend on this ping; server distance and network routing can increase it.';else if(quality?.ping>180)hint=' Try Ethernet or a stronger Wi-Fi signal, and check whether a VPN is routing the connection farther away.';
 return parts.join(' · ')+'.'+hint;
}
export function postMatchState(room,sim){
 const ended=sim?.phase==='ended',networked=sim?.cars.some(car=>car.networkRole),next=!!(ended&&(networked||sim.options.quickplayBots));
 if(!ended||!networked)return {next,disabled:false,label:'PLAY AGAIN',message:''};
 if(!room||room.closed)return {next,disabled:true,label:'OPPONENT LEFT',message:room?.error||'The opponent left. Find your next match when ready.'};
 if(room.party&&room.self?.team===null)return {next,disabled:room.recovering,label:'OPEN LOBBY',message:'You are spectating. Open the lobby to choose a team for the next match.'};
 if(room.recovering)return {next,disabled:true,label:'RECONNECTING…',message:'Reconnecting to your opponent. You can also find a new match.'};
 if(room.pendingMatch)return {next,disabled:true,label:'STARTING REMATCH…',message:'Both players agreed. Starting the rematch…'};
 return {next,disabled:false,label:room.rematchWanted?'CANCEL REMATCH REQUEST':'REQUEST REMATCH',message:room.rematchWanted?'Rematch requested. Waiting for your opponent…':room.remoteRematch?'Your opponent requested a rematch. Accept to play again.':'Both players must agree to a rematch.'};
}
export function setupNetworkUI({preferences,save=()=>{},rematch=()=>{},next=()=>{},leave=()=>{}},root=document){
 const node=id=>root.getElementById(id),put=(id,value)=>{if(node(id).textContent!==value)node(id).textContent=value;};
 function sync(){for(const prefix of ['search','settings']){node(prefix+'-region').value=preferences.region;node(prefix+'-ping').value=String(preferences.maxPing);node(prefix+'-policy').value=preferences.strictPing?'strict':'warn';node(prefix+'-ping-label').textContent=preferences.strictPing?'MAXIMUM PING':'PREFERRED PING';}}
 for(const prefix of ['search','settings'])for(const field of ['region','ping','policy'])node(prefix+'-'+field).addEventListener('change',()=>{Object.assign(preferences,networkPreferences({region:node(prefix+'-region').value,maxPing:Number(node(prefix+'-ping').value),strictPing:node(prefix+'-policy').value==='strict'}));sync();save();});
 node('rematch-button').addEventListener('click',rematch);node('next-match-button').addEventListener('click',next);node('reconnect-leave').addEventListener('click',leave);sync();
 function render(room,sim,now=performance.now()){
  const active=!!room&&!room.closed,quality=active?room.quality.summary(now,room.lastRealtimeAt??room.lastReceive,room.recovering):null,recovering=active&&room.recovering;
  node('reconnect-overlay').hidden=!recovering;if(recovering)put('reconnect-seconds',String(Math.max(0,Math.ceil((room.recoveryDeadline-now)/1000))));
  put('connection-details',connectionDetails(room,quality));
  const warnings={stalled:'CONNECTION INTERRUPTED',loss:'PACKET LOSS',latency:'HIGH PING',unstable:'UNSTABLE CONNECTION',reconnecting:'RECONNECTING'};
  node('network-notice').hidden=!active||!warnings[quality?.status];if(active){node('network-notice').dataset.quality=quality.status;put('network-notice',warnings[quality.status]||'');const info=room.connectionInfo,detail=[quality.ping===null?'MEASURING PING':'Game '+quality.ping+' ms'];if(info?.networkPing!=null)detail.push('Network '+info.networkPing+' ms');if(info?.route&&info.route!=='unknown')detail.push(routeLabel(info));if(quality.status==='stalled')detail.push('UPDATES STALLED');else if(quality.loss!==null)detail.push(quality.loss+'% UPDATE LOSS');put('network-hud',(room.dedicated?'DEDICATED MATCH':room.matchmade?'ONLINE 1v1':room.party?'CUSTOM LOBBY':'PRIVATE MATCH')+' · '+detail.join(' · '));}
  if(sim?.phase==='ended'){const result=postMatchState(room,sim);node('next-match-button').hidden=!result.next;node('rematch-button').disabled=result.disabled;put('rematch-button',result.label);put('rematch-status',result.message);}
 }
 return {render,sync,regionName:()=>REGIONS[preferences.region]};
}
