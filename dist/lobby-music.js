export const LOBBY_TRACKS=Object.freeze([
 Object.freeze({id:'snitch',title:'Rapp Snitch Knishes (feat. Mr. Fantastik)',file:'./assets/music/rapp-snitch-knishes.mp3'}),
 Object.freeze({id:'palm',title:'Palm Street',file:'./assets/music/palm-street.mp3'})
]);
export function musicPreferences(value={}){
 value||={};return {lobbyTrack:LOBBY_TRACKS.some(t=>t.id===value.lobbyTrack)?value.lobbyTrack:'snitch',musicVolume:Number.isFinite(Number(value.musicVolume))?Math.max(0,Math.min(100,Number(value.musicVolume))):25};
}
// One streaming element shared by the showroom and private waiting rooms.
// Full songs are never decoded into large Web Audio buffers or played together.
export class LobbyMusic {
 constructor(settings,{allowed=()=>true,save=()=>{},AudioClass=globalThis.Audio,onChange=()=>{}}={}){
  Object.assign(this,{settings,allowed,save,AudioClass,onChange});this.wanted=false;this.permitted=false;this.generation=0;this.volume=0;this.status='Choose a track and press Play.';
 }
 get track(){return LOBBY_TRACKS.find(t=>t.id===this.settings.lobbyTrack)||LOBBY_TRACKS[0];}
 ensure(){
  if(this.audio||!this.AudioClass)return this.audio;
  const audio=this.audio=new this.AudioClass();audio.preload='none';audio.volume=this.volume;audio.src=this.track.file;
  audio.addEventListener('ended',()=>this.select(LOBBY_TRACKS[(LOBBY_TRACKS.findIndex(t=>t.id===this.track.id)+1)%LOBBY_TRACKS.length].id));
  audio.addEventListener('error',()=>{this.wanted=false;this.status='This track could not load. Try Play again.';this.onChange();});
  return audio;
 }
 async resume(){
  const audio=this.ensure();if(!audio)return;
  const generation=++this.generation;
  if(!this.wanted||!this.permitted)return;
  try{await audio.play();if(generation!==this.generation)return;this.waitingForGesture=false;this.automatic=false;this.status='Playing · '+this.track.title;}
  catch(error){if(generation!==this.generation)return;this.waitingForGesture=!!this.automatic&&(error?.name==='NotAllowedError'||/NotAllowedError|user.*interact|user.*gesture/i.test(error?.message||''));if(this.waitingForGesture)this.status='Click or press a key to enable lobby music.';else{this.wanted=false;this.status='Press Play to start music in this browser.';}}
  this.onChange();
 }
 play({automatic=false}={}){this.automatic=automatic;this.waitingForGesture=false;this.wanted=true;this.permitted=this.allowed();if(this.permitted)this.resume();else this.status='Music pauses during gameplay.';this.onChange();}
 autoStart(){this.volume=this.settings.sound===false?0:Math.max(0,Math.min(1,(this.settings.volume??80)/100*(this.settings.musicVolume??25)/100));this.play({automatic:true});}
 unlock(){if(this.waitingForGesture&&this.wanted&&this.allowed()){this.waitingForGesture=false;this.permitted=true;this.resume();}}
 pause(){this.wanted=false;this.waitingForGesture=false;this.automatic=false;this.generation++;this.audio?.pause();this.status='Music paused.';this.onChange();}
 toggle(){this.wanted&&!this.waitingForGesture?this.pause():this.play();}
 select(id){
  const next=LOBBY_TRACKS.find(t=>t.id===id);if(!next)return;
  this.settings.lobbyTrack=id;this.save();this.generation++;
  if(this.audio){this.audio.pause();this.audio.src=next.file;this.audio.load();if(this.wanted&&this.permitted)this.resume();}
  this.status=this.wanted?(this.permitted?'Loading · '+next.title:'Queued · '+next.title):'Selected · '+next.title;this.onChange();
 }
 next(delta=1){const index=LOBBY_TRACKS.findIndex(t=>t.id===this.track.id);this.select(LOBBY_TRACKS[(index+delta+LOBBY_TRACKS.length)%LOBBY_TRACKS.length].id);}
 update(dt=1/60){
  const permitted=this.allowed();
  if(permitted!==this.permitted){this.permitted=permitted;if(!permitted){this.generation++;this.audio?.pause();if(this.wanted)this.status='Music pauses during gameplay.';this.onChange();}else if(this.wanted)this.resume();}
  const target=this.settings.sound===false?0:Math.max(0,Math.min(1,(this.settings.volume??80)/100*(this.settings.musicVolume??25)/100));
  this.volume+=(target-this.volume)*(1-Math.exp(-12*Math.max(0,Math.min(.1,dt))));if(this.audio)this.audio.volume=Math.max(0,Math.min(1,this.volume));
 }
 diagnostics(){return {track:this.track.id,wanted:this.wanted,playing:!!this.audio&&!this.audio.paused,allowed:this.permitted,volume:this.audio?.volume||0};}
 dispose(){this.pause();if(this.audio){this.audio.removeAttribute('src');this.audio.load();}}
}
export function setupLobbyMusic(settings,{allowed,save},root=document){
 const sections=[...root.querySelectorAll('[data-lobby-music]')];
 const render=()=>{for(const section of sections){section.querySelector('[data-lobby-track]').value=player.track.id;section.querySelector('[data-music-play]').textContent=player.wanted&&!player.waitingForGesture?'PAUSE':'PLAY';section.querySelector('[data-music-play]').setAttribute('aria-pressed',String(player.wanted&&!player.waitingForGesture));section.querySelector('[data-music-status]').textContent=player.status;section.querySelector('[data-music-volume]').value=settings.musicVolume;}};
 const player=new LobbyMusic(settings,{allowed,save,onChange:render});
 for(const section of sections){
  const select=section.querySelector('[data-lobby-track]');for(const track of LOBBY_TRACKS){const option=root.createElement('option');option.value=track.id;option.textContent=track.title;select.append(option);}
  select.addEventListener('change',()=>player.select(select.value));section.querySelector('[data-music-play]').addEventListener('click',()=>player.toggle());section.querySelector('[data-music-prev]').addEventListener('click',()=>player.next(-1));section.querySelector('[data-music-next]').addEventListener('click',()=>player.next());
  const volume=section.querySelector('[data-music-volume]');volume.addEventListener('input',()=>{settings.musicVolume=Number(volume.value);player.update();render();});volume.addEventListener('change',save);
 }const unlock=event=>{if(!event.target?.closest?.('[data-music-play]'))player.unlock();};root.addEventListener('pointerdown',unlock);root.addEventListener('keydown',unlock);const dispose=player.dispose.bind(player);player.dispose=()=>{root.removeEventListener('pointerdown',unlock);root.removeEventListener('keydown',unlock);dispose();};render();player.autoStart();return player;
}
