import test from 'node:test';import assert from 'node:assert/strict';
import {LobbyMusic,musicPreferences,LOBBY_TRACKS} from '../dist/lobby-music.js';
class FakeAudio extends EventTarget{
 static created=0;constructor(){super();FakeAudio.created++;this.paused=true;this.volume=0;this.loads=0;this.currentTime=0;}
 async play(){this.paused=false;}pause(){this.paused=true;}load(){this.loads++;this.currentTime=0;}removeAttribute(key){delete this[key];}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('load-time autoplay waits for a browser gesture when blocked and explicit Pause cancels that intent',async()=>{
 class GestureAudio extends FakeAudio{async play(){if(!this.allowed)throw Object.assign(new Error('gesture required'),{name:'NotAllowedError'});this.paused=false;}}
 const player=new LobbyMusic({...musicPreferences(),volume:80},{AudioClass:GestureAudio});player.autoStart();await flush();assert.equal(player.wanted,true);assert.equal(player.waitingForGesture,true);assert.equal(player.audio.paused,true);assert.ok(player.audio.volume>0);
 player.audio.allowed=true;player.unlock();await flush();assert.equal(player.audio.paused,false);assert.equal(player.waitingForGesture,false);player.pause();player.unlock();await flush();assert.equal(player.audio.paused,true);player.dispose();
});
test('music preferences migrate locally saved settings and reject unknown tracks',()=>{
 assert.deepEqual(musicPreferences(),{lobbyTrack:'snitch',musicVolume:25});
 assert.deepEqual(musicPreferences({lobbyTrack:'palm',musicVolume:900}),{lobbyTrack:'palm',musicVolume:100});
 assert.deepEqual(musicPreferences({lobbyTrack:'../other.mp3',musicVolume:-2}),{lobbyTrack:'snitch',musicVolume:0});
});
test('music waits for Play, streams both songs through one element, and saves selection',async()=>{
 let saved=0;const before=FakeAudio.created,settings={...musicPreferences(),volume:80},player=new LobbyMusic(settings,{AudioClass:FakeAudio,save:()=>saved++});
 player.update();assert.equal(FakeAudio.created,before);player.play();await flush();
 assert.equal(FakeAudio.created,before+1);assert.equal(player.audio.preload,'none');assert.match(player.audio.src,/rapp-snitch/);assert.equal(player.diagnostics().playing,true);
 player.audio.currentTime=40;player.next();await flush();assert.equal(settings.lobbyTrack,'palm');assert.match(player.audio.src,/palm-street/);assert.equal(player.audio.currentTime,0);assert.equal(saved,1);
 player.next(-1);await flush();assert.equal(settings.lobbyTrack,'snitch');assert.equal(FakeAudio.created,before+1);player.dispose();
});
test('gameplay and hidden tabs pause music without losing the requested lobby track',async()=>{
 let lobby=true;const player=new LobbyMusic({...musicPreferences(),volume:50},{AudioClass:FakeAudio,allowed:()=>lobby});
 player.play();await flush();assert.equal(player.audio.paused,false);lobby=false;player.update();assert.equal(player.audio.paused,true);assert.equal(player.wanted,true);
 player.select('palm');await flush();assert.equal(player.audio.paused,true);lobby=true;player.update();await flush();assert.equal(player.audio.paused,false);assert.equal(player.track.id,'palm');
 player.pause();lobby=false;player.update();lobby=true;player.update();await flush();assert.equal(player.audio.paused,true);player.dispose();
});
test('music volume combines master and music settings, honors sound mute and stays bounded',async()=>{
 const settings={...musicPreferences({musicVolume:40}),volume:50,sound:true},player=new LobbyMusic(settings,{AudioClass:FakeAudio});player.play();await flush();
 for(let i=0;i<120;i++)player.update(1/60);assert.ok(Math.abs(player.audio.volume-.2)<.001);
 settings.sound=false;for(let i=0;i<120;i++)player.update(1/60);assert.ok(player.audio.volume<.0001);
 settings.sound=true;settings.volume=1000;settings.musicVolume=1000;for(let i=0;i<120;i++)player.update(1/60);assert.ok(player.audio.volume<=1);player.dispose();
});
test('track endings advance the playlist and load errors leave a retryable player',async()=>{
 const player=new LobbyMusic(musicPreferences(),{AudioClass:FakeAudio});player.play();await flush();
 player.audio.dispatchEvent(new Event('ended'));await flush();assert.equal(player.track.id,LOBBY_TRACKS[1].id);assert.equal(player.audio.paused,false);
 player.audio.pause();player.audio.dispatchEvent(new Event('error'));assert.equal(player.wanted,false);assert.match(player.status,/could not load/);
 player.play();await flush();assert.equal(player.audio.paused,false);player.dispose();
});
test('autoplay rejection and unavailable audio do not prevent the game from loading',async()=>{
 class BlockedAudio extends FakeAudio{async play(){throw Error('NotAllowedError');}}
 const blocked=new LobbyMusic(musicPreferences(),{AudioClass:BlockedAudio});blocked.play();await flush();assert.equal(blocked.wanted,false);assert.match(blocked.status,/Press Play/);blocked.dispose();
 const absent=new LobbyMusic(musicPreferences(),{AudioClass:null});assert.doesNotThrow(()=>{absent.play();absent.update();absent.dispose();});
});
