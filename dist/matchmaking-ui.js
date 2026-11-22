export function setupMatchmakingUI({search=()=>{},cancel=()=>{},preferences={},save=()=>{}},root=document){
 const node=id=>root.getElementById(id),dialog=node('matchmaking-dialog');let currentState={phase:'idle'};
 node('matchmaking-search').addEventListener('click',search);node('matchmaking-cancel').addEventListener('click',cancel);
 dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
 const connection=node('search-connection'),address=node('search-server-url'),mode=node('search-mode');
 const arena=node('search-arena');if(arena){arena.value='random';arena.disabled=true;}
 if(connection){connection.value=preferences.onlineConnection==='server'?'server':'peer';address.value=preferences.serverURL||'';mode.value=preferences.onlineMode||'duel';const changed=()=>{preferences.onlineConnection=connection.value;preferences.onlineMode=mode.value;preferences.serverURL=address.value.trim().slice(0,500);node('search-server-field').hidden=connection.value!=='server';mode.disabled=connection.value!=='server';save();render(currentState);};for(const field of [connection,address,mode])field.addEventListener('change',changed);node('search-server-field').hidden=connection.value!=='server';mode.disabled=connection.value!=='server';}
 function render(state={phase:'idle'}){
  currentState=state;
  const active=['searching','connecting','checking','preparing','starting'].includes(state.phase),finding=['searching','connecting'].includes(state.phase),remaining=state.remaining??60;
  node('matchmaking-search').hidden=active;node('matchmaking-cancel').textContent=active?'CANCEL SEARCH':'BACK';node('matchmaking-clock').hidden=!finding;node('matchmaking-progress').hidden=!finding;node('matchmaking-remaining').textContent=String(remaining);node('matchmaking-progress').value=state.elapsed||0;
  const title={idle:'FIND A MATCH',searching:'SEARCHING FOR A PLAYER',connecting:'CONNECTING TO A PLAYER',checking:'CHECKING CONNECTION',preparing:'OPPONENT FOUND',starting:'STARTING MATCH',matched:'MATCH READY',bots:'STARTING A BOT MATCH',cancelled:'SEARCH STOPPED'};
  node('matchmaking-status').textContent=title[state.phase]||'FIND A MATCH';
  const slow=state.connection?.warning?state.connection.ping+' ms game ping · above your preference. Connecting with a warning. ':'';
  const solo=connection?.value==='server'&&['free','training','custom'].includes(mode?.value),idleText=solo?(mode.value==='custom'?'Create a private lobby. Choose teams, match length and who plays.':'Create a solo online session. Friends can join as spectators.'):'Search for a real opponent. If nobody connects in 60 seconds, you will play against a bot.';
  if(!active)node('matchmaking-search').textContent=solo?({free:'OPEN FREE PLAY',training:'START TRAINING',custom:'CREATE LOBBY'}[mode.value]):'FIND MATCH';
  node('matchmaking-detail').textContent=state.reason||(state.phase==='checking'?'Checking connection stability…':state.phase==='preparing'?slow+(state.prepared?'Waiting for your opponent to finish loading…':'Preparing both vehicles…'):state.phase==='starting'?'Your match will begin shortly.':active?'Searching for up to 60 seconds. Keep this tab visible.':idleText);
  root.getElementById('matchmaking-preferences')?.querySelectorAll('select,input').forEach(select=>{select.disabled=active||select===arena||select===mode&&connection?.value!=='server';});
  dialog.dataset.phase=state.phase;
 }
 render();return {render,selection(){return {kind:connection?.value||'peer',address:address?.value.trim()||'',mode:mode?.value||'duel',arena:'random'};},open(){if(address&&preferences.serverURL)address.value=preferences.serverURL;if(connection?.value==='server'&&!address?.value&&node('matchmaking-advanced'))node('matchmaking-advanced').open=true;if(!dialog.open)dialog.showModal();}};
}
