import test from 'node:test';
import assert from 'node:assert/strict';
import {setupMatchmakingUI} from '../dist/matchmaking-ui.js';
import {driverName} from '../dist/interface.js';

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
