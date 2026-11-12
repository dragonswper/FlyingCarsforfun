export function setupMatchmakingUI({search=()=>{},cancel=()=>{}},root=document){
 const node=id=>root.getElementById(id),dialog=node('matchmaking-dialog');
 node('matchmaking-search').addEventListener('click',search);node('matchmaking-cancel').addEventListener('click',cancel);
 dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
 function render(state={phase:'idle'}){
  const active=['searching','connecting','checking','preparing','starting'].includes(state.phase),finding=['searching','connecting'].includes(state.phase),remaining=state.remaining??60;
  node('matchmaking-search').hidden=active;node('matchmaking-cancel').textContent=active?'CANCEL SEARCH':'BACK';node('matchmaking-clock').hidden=!finding;node('matchmaking-progress').hidden=!finding;node('matchmaking-remaining').textContent=String(remaining);node('matchmaking-progress').value=state.elapsed||0;
  const title={idle:'FIND A MATCH',searching:'SEARCHING FOR A PLAYER',connecting:'CONNECTING TO A PLAYER',checking:'CHECKING CONNECTION',preparing:'OPPONENT FOUND',starting:'STARTING MATCH',matched:'MATCH READY',bots:'STARTING A BOT MATCH',cancelled:'SEARCH STOPPED'};
  node('matchmaking-status').textContent=title[state.phase]||'FIND A MATCH';
  node('matchmaking-detail').textContent=state.reason||(state.phase==='checking'?'Measuring ping against both players’ preferences…':state.phase==='preparing'?(state.prepared?'Waiting for your opponent to finish loading…':'Preparing both vehicles…'):state.phase==='starting'?'Your match will begin shortly.':active?'Searching for up to 60 seconds. Keep this tab visible.':'Search for a real opponent. If nobody connects in 60 seconds, you will play against a bot.');
  root.getElementById('matchmaking-preferences')?.querySelectorAll('select').forEach(select=>{select.disabled=active;});
  dialog.dataset.phase=state.phase;
 }
 render();return {render,open(){if(!dialog.open)dialog.showModal();}};
}
