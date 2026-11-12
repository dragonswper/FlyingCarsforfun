import {displayCode} from './network-protocol.js';
export function setupRoomUI({host,join,ready,start,leave},root=document){
 const node=id=>root.getElementById(id);let current=null;
 const show=(id,on)=>{node(id).hidden=!on;};
 const botOptions=()=>{node('room-difficulty').disabled=node('room-mode').value==='duel';};node('room-mode').addEventListener('change',botOptions);botOptions();
 node('room-host').addEventListener('click',()=>{const mode=node('room-mode').value;host({mode:mode==='duel'?'duel':'doubles',coop:mode==='coop',duration:Number(node('room-duration').value),difficulty:node('room-difficulty').value});});
 node('room-join-form').addEventListener('submit',event=>{event.preventDefault();join(node('room-join-code').value);});
 node('room-ready').addEventListener('click',()=>ready(!current?.ready));node('room-start').addEventListener('click',start);node('room-leave').addEventListener('click',leave);
 node('multiplayer-dialog').addEventListener('cancel',event=>{event.preventDefault();leave();});
 node('room-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(displayCode(current.code));node('room-status').textContent='Code copied. Send it to your friend.';}catch{node('room-status').textContent='Select the displayed room code and copy it.';const selection=globalThis.getSelection?.();if(selection){const range=root.createRange();range.selectNodeContents(node('room-code'));selection.removeAllRanges();selection.addRange(range);}}});
 function render(room,error=''){
  current=room;const active=room&&!room.closed,host=room?.role==='host',connected=!!room?.connected,lobby=active&&!!room.code;show('room-setup',!lobby);show('room-lobby',lobby);node('room-status').classList.toggle('room-error',!!error||!!room?.error||!!room?.assetsError);
  if(lobby){
   node('room-code').textContent=displayCode(room.code);node('room-copy').disabled=room.status==='connecting';node('room-role').textContent=host?'YOUR ROOM CODE':'JOINED ROOM';
   const options=room.options;node('room-details').textContent=options?`${options.mode==='duel'?'1v1 · HEAD TO HEAD':options.coop?'2v2 · TEAMMATES VS BOTS':'2v2 · OPPOSING TEAMS + BOTS'}  ·  ${options.duration/60} MINUTES${options.mode==='doubles'?'  ·  '+options.difficulty.toUpperCase()+' BOTS':''}`:'CONNECTING TO HOST…';
   node('room-host-label').textContent=host?'HOST · YOU':'HOST';node('room-guest-label').textContent=connected?(host?'GUEST':'GUEST · YOU'):'WAITING FOR PLAYER';const isReady=host?room.remoteReady:room.ready;node('room-guest-state').textContent=connected?(isReady?'READY':'NOT READY'):'—';node('room-guest-dot').classList.toggle('waiting-dot',!connected);
   show('room-ready',!host&&connected);node('room-ready').disabled=!options||!!room.loadingAssets;node('room-ready').textContent=room.ready?'READY ✓ · CLICK TO UNREADY':'READY';node('room-ready').setAttribute('aria-pressed',String(!!room.ready));
   show('room-start',host);node('room-start').disabled=!connected||!room.remoteReady||room.status==='starting'||!!room.loadingAssets;node('room-start').textContent=room.status==='starting'?'STARTING…':'START MATCH';
  }
  node('room-status').textContent=error||room?.error||room?.assetsError||(room?.loadingAssets?'Preparing vehicles…':room?.status==='connecting'?'Connecting to the room service…':room?.status==='waiting'?(host?'Room created. Share the code with your friend.':'Finding the host and opening a connection…'):room?.status==='starting'?'Waiting for the guest to load the match…':connected?(host?'Your friend is connected. Start when they are ready.':'Connected. Select Ready to let the host start.'):'Host a room or enter your friend’s code.');
  node('room-leave').innerHTML='<kbd>ESC</kbd> '+(active?'LEAVE ROOM':'BACK');
 }
 return {render,open(){render(current);if(!node('multiplayer-dialog').open)node('multiplayer-dialog').showModal();}};
}
