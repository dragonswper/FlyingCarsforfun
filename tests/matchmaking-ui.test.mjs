import test from 'node:test';
import assert from 'node:assert/strict';
import {setupMatchmakingUI} from '../dist/matchmaking-ui.js';
import {driverName} from '../dist/interface.js';

test('an incompatible endpoint offers Reload, reveals connection settings, and permits choosing another server',()=>{
 const names=['matchmaking-dialog','matchmaking-search','matchmaking-reload','matchmaking-cancel','matchmaking-clock','matchmaking-progress','matchmaking-remaining','matchmaking-status','matchmaking-detail','search-connection','search-server-url','search-mode','search-server-field','matchmaking-advanced'];
 const nodes=Object.fromEntries(names.map(id=>[id,Object.assign(new EventTarget(),{dataset:{},value:'',hidden:false,textContent:'',open:false})]));let reloads=0,cancels=0,saves=0;
 const ui=setupMatchmakingUI({preferences:{onlineConnection:'server',serverURL:'https://old.test'},reload:()=>reloads++,cancel:()=>cancels++,save:()=>saves++},{getElementById:id=>nodes[id]});
 ui.render({phase:'update',reason:'The selected server needs a different version.'});assert.equal(nodes['matchmaking-search'].hidden,true);assert.equal(nodes['matchmaking-reload'].hidden,false);assert.equal(nodes['matchmaking-advanced'].open,true);assert.equal(nodes['matchmaking-status'].textContent,'UPDATE NEEDED');
 nodes['matchmaking-reload'].dispatchEvent(new Event('click'));assert.equal(reloads,1);assert.equal(cancels,1);assert.equal(saves,1);
 nodes['search-server-url'].value='https://new.test';nodes['search-server-url'].dispatchEvent(new Event('change'));assert.equal(nodes['matchmaking-search'].hidden,false);assert.equal(nodes['matchmaking-reload'].hidden,true);
});

test('queue UI shows countdown, preparation and retry states with working Search, Cancel and Escape',()=>{
 const names=['matchmaking-dialog','matchmaking-search','matchmaking-cancel','matchmaking-clock','matchmaking-progress','matchmaking-remaining','matchmaking-status','matchmaking-detail'];
 const nodes=Object.fromEntries(names.map(name=>[name,Object.assign(new EventTarget(),{dataset:{},hidden:false,textContent:'',open:false,showModal(){this.open=true;}})]));let searches=0,cancels=0;const ui=setupMatchmakingUI({search:()=>searches++,cancel:()=>cancels++},{getElementById:id=>nodes[id]});
 assert.equal(nodes['matchmaking-search'].hidden,false);ui.open();assert.equal(nodes['matchmaking-dialog'].open,true);nodes['matchmaking-search'].dispatchEvent(new Event('click'));assert.equal(searches,1);
 ui.render({phase:'searching',remaining:41,elapsed:19});assert.equal(nodes['matchmaking-remaining'].textContent,'41');assert.equal(nodes['matchmaking-progress'].value,19);assert.equal(nodes['matchmaking-search'].hidden,true);assert.equal(nodes['matchmaking-clock'].hidden,false);assert.match(nodes['matchmaking-cancel'].textContent,/CANCEL/);
 ui.render({phase:'preparing',prepared:true});assert.equal(nodes['matchmaking-clock'].hidden,true);assert.match(nodes['matchmaking-status'].textContent,/FOUND/);assert.match(nodes['matchmaking-detail'].textContent,/opponent/);
 nodes['matchmaking-cancel'].dispatchEvent(new Event('click'));const escape=new Event('cancel',{cancelable:true});nodes['matchmaking-dialog'].dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(cancels,2);
 ui.render({phase:'cancelled',reason:'Search stopped while hidden.'});assert.equal(nodes['matchmaking-search'].hidden,false);assert.match(nodes['matchmaking-detail'].textContent,/hidden/);
});
test('matchmade peers are named as opponents and bot fallback keeps bot names',()=>{
 assert.equal(driverName({id:1,team:1,networkRole:'guest',matchmade:true},0),'OPPONENT');assert.equal(driverName({id:1,team:1,networkRole:'guest',matchmade:true},1),'YOU');assert.equal(driverName({id:1,team:1,bot:true},0),'ACE');assert.equal(driverName({id:1,team:1,networkRole:'guest'},0),'GUEST');
});
test('dedicated practice and lobby choices explain their actual action and missing server configuration is discoverable',()=>{
 const names=['matchmaking-dialog','matchmaking-search','matchmaking-cancel','matchmaking-clock','matchmaking-progress','matchmaking-remaining','matchmaking-status','matchmaking-detail','search-connection','search-server-url','search-mode','search-server-field','matchmaking-advanced'];
 const nodes=Object.fromEntries(names.map(id=>[id,Object.assign(new EventTarget(),{dataset:{},value:'',hidden:false,textContent:'',open:false,showModal(){this.open=true;}})])),preferences={onlineConnection:'server',onlineMode:'free'};
 const ui=setupMatchmakingUI({preferences},{getElementById:id=>nodes[id]});assert.equal(nodes['matchmaking-search'].textContent,'OPEN FREE PLAY');assert.match(nodes['matchmaking-detail'].textContent,/spectators/);ui.open();assert.equal(nodes['matchmaking-advanced'].open,true);
 nodes['search-mode'].value='custom';nodes['search-mode'].dispatchEvent(new Event('change'));assert.equal(nodes['matchmaking-search'].textContent,'CREATE LOBBY');assert.match(nodes['matchmaking-detail'].textContent,/teams/);nodes['search-mode'].value='duel';nodes['search-mode'].dispatchEvent(new Event('change'));assert.equal(nodes['matchmaking-search'].textContent,'FIND MATCH');assert.match(nodes['matchmaking-detail'].textContent,/60 seconds/);
 ui.render({phase:'searching',remaining:30});nodes['search-mode'].value='training';nodes['search-mode'].dispatchEvent(new Event('change'));assert.equal(nodes['matchmaking-search'].hidden,true);assert.equal(nodes['matchmaking-remaining'].textContent,'30');
});
test('online arena selection stays on Random every game and ignores a previously saved fixed preference',()=>{
 const names=['matchmaking-dialog','matchmaking-search','matchmaking-cancel','matchmaking-clock','matchmaking-progress','matchmaking-remaining','matchmaking-status','matchmaking-detail','search-arena','matchmaking-preferences'];const nodes=Object.fromEntries(names.map(id=>[id,Object.assign(new EventTarget(),{dataset:{},value:'festival',hidden:false,textContent:'',open:false,showModal(){this.open=true;}})]));nodes['matchmaking-preferences'].querySelectorAll=()=>[nodes['search-arena']];
 const ui=setupMatchmakingUI({preferences:{onlineArena:'snow'}},{getElementById:id=>nodes[id]});assert.equal(nodes['search-arena'].value,'random');assert.equal(nodes['search-arena'].disabled,true);ui.render({phase:'cancelled'});assert.equal(nodes['search-arena'].disabled,true);assert.equal(ui.selection().arena,'random');
});
