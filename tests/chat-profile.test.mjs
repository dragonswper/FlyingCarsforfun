import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatHistory,CHAT_LIMIT,CHAT_CLEAR_MS,cleanChatState} from '../dist/chat-history.js';
import {setupSocialUI,setupSocialAccess} from '../dist/social.js';

class Clock {
 now=0;counter=0;jobs=new Map();
 set=(fn,ms)=>{const id=++this.counter;this.jobs.set(id,{at:this.now+ms,fn});return id;};
 clear=id=>this.jobs.delete(id);
 step(ms){const end=this.now+ms;for(;;){const due=[...this.jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;this.jobs.delete(due[0]);this.now=due[1].at;due[1].fn();}this.now=end;}
 options(){return {clock:()=>this.now,setTimer:this.set,clearTimer:this.clear};}
}
const message=n=>({id:'message-'+n,name:'Driver '+n,text:'Message '+n});

test('chat keeps exactly the newest five messages, ignores duplicate IDs and returns independent snapshots',()=>{
 const clock=new Clock(),history=new ChatHistory(clock.options());
 for(let n=1;n<=7;n++)assert.equal(history.add(message(n)),true);
 assert.equal(history.messages.length,CHAT_LIMIT);assert.deepEqual(history.state().messages.map(entry=>entry.text),[3,4,5,6,7].map(n=>'Message '+n));
 assert.equal(history.add(message(7)),false);assert.equal(history.add({text:'  '}),false);
 const copy=history.state();copy.messages[0].text='changed';assert.equal(history.state().messages[0].text,'Message 3');
 history.dispose();assert.equal(clock.jobs.size,0);
});

test('all chat clears at five minutes from the first message even when that message has been trimmed',()=>{
 const clock=new Clock(),changes=[],history=new ChatHistory({...clock.options(),onChange:state=>changes.push(state)});
 history.add(message(1));for(let n=2;n<=6;n++){clock.step(48000);history.add(message(n));}
 assert.equal(clock.now,240000);assert.equal(history.state().messages.length,5);assert.equal(history.state().expiresIn,60000);
 clock.step(59999);assert.equal(history.state().messages.length,5);clock.step(1);assert.deepEqual(changes.at(-1),{messages:[],expiresIn:0});assert.equal(clock.jobs.size,0);
 clock.step(7000);history.add(message(7));assert.equal(history.state().expiresIn,CHAT_CLEAR_MS);clock.step(CHAT_CLEAR_MS);assert.equal(history.state().messages.length,0);
 history.dispose();
});

test('late join snapshots preserve the remaining chat lifetime and reject malformed or unbounded history',()=>{
 const clock=new Clock(),host=new ChatHistory(clock.options()),guest=new ChatHistory(clock.options());host.add(message(1));clock.step(210000);assert.equal(guest.replace(host.state()),true);assert.equal(guest.state().expiresIn,90000);
 for(const bad of [null,{messages:Array(6).fill(message(1)),expiresIn:500},{messages:[message(1),message(1)],expiresIn:500},{messages:[{...message(1),id:''}],expiresIn:500},{messages:[message(1)],expiresIn:Infinity},{messages:[message(1)],expiresIn:300001}])assert.equal(guest.replace(bad),false);
 assert.equal(guest.state().messages.length,1);clock.step(90000);assert.equal(host.state().messages.length,0);assert.equal(guest.state().messages.length,0);
 assert.deepEqual(cleanChatState({messages:[message(1)],expiresIn:0}),{messages:[],expiresIn:0});host.dispose();guest.dispose();assert.equal(guest.add(message(2)),false);assert.equal(guest.replace({messages:[],expiresIn:0}),false);assert.equal(clock.jobs.size,0);
});

class Element extends EventTarget {
 constructor(tag,root,id=''){super();Object.assign(this,{tagName:tag.toUpperCase(),root,id,children:[],textContent:'',value:'',hidden:false,open:false});}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 querySelector(tag){return this.children.find(child=>child.tagName===tag.toUpperCase());}
 focus(){this.root.activeElement=this;}
 select(){this.selected=true;}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent(new Event('close'));}
 click(){this.dispatchEvent(new Event('click'));}
}
function dom(){
 const root={activeElement:null},nodes={};root.createElement=tag=>new Element(tag,root);root.getElementById=id=>nodes[id];root.querySelector=()=>Object.values(nodes).find(node=>node.tagName==='DIALOG'&&node.open)||null;
 for(const id of ['chat-feed','chat-log','quick-chat-buttons','custom-quick-chats','display-name','chat-text','username-input','profile-status','profile-feedback','chat-status','chat-title','chat-send','chat-back','profile-cancel','profile-edit','pause-profile-button','chat-button','hud-chat-button','pause-chat-button','room-chat-button','party-chat-button','result-chat-button','arena','chat-form','profile-form','chat-dialog','profile-dialog','pause-dialog','party-dialog','result-dialog','reset-quick-chats']){
  const tag=id.endsWith('dialog')?'dialog':id.endsWith('form')?'form':['username-input','display-name','chat-text'].includes(id)?'input':id.endsWith('button')||id.endsWith('cancel')||id.endsWith('edit')||id.endsWith('send')||id.endsWith('back')||id==='reset-quick-chats'?'button':'div';nodes[id]=new Element(tag,root,id);
 }
 return {root,nodes};
}
function uiHarness(storage=new Map(),extra={}){
 const {root,nodes}=dom(),clock=new Clock(),settings=JSON.parse(storage.get('boost-circuit.v1')||'{}'),profiles=[],sent=[];let clears=0;
 const ui=setupSocialUI(settings,{save:()=>{storage.set('boost-circuit.v1',JSON.stringify(settings));return true;},send:text=>{sent.push(text);return true;},profile:name=>profiles.push(name),opened:()=>clears++,historyOptions:clock.options(),...extra},root);
 return {ui,root,nodes,settings,storage,profiles,sent,clock,get clears(){return clears;}};
}
const submit=node=>node.dispatchEvent(new Event('submit',{cancelable:true}));

test('Edit Name saves per browser, survives reload and updates the existing settings field',()=>{
 const storage=new Map(),h=uiHarness(storage);h.ui.openProfile();assert.equal(h.nodes['profile-dialog'].open,true);assert.equal(h.nodes['username-input'].selected,true);h.nodes['username-input'].value='  Rocket <Friend>  ';submit(h.nodes['profile-form']);
 assert.equal(h.settings.username,'Rocket Friend');assert.equal(h.nodes['profile-dialog'].open,false);assert.equal(h.nodes['display-name'].value,'Rocket Friend');assert.equal(h.nodes['profile-feedback'].textContent,'SAVED LOCALLY');assert.deepEqual(h.profiles,['Rocket Friend']);
 const reload=uiHarness(storage),otherBrowser=uiHarness();assert.equal(reload.settings.username,'Rocket Friend');assert.equal(otherBrowser.settings.username,'Driver');
 reload.nodes['display-name'].value='New Name';reload.nodes['display-name'].dispatchEvent(new Event('change'));reload.ui.openProfile();assert.equal(reload.nodes['username-input'].value,'New Name');reload.nodes['username-input'].value='Unsaved';reload.nodes['profile-cancel'].click();assert.equal(reload.settings.username,'New Name');
 for(const item of [h,reload,otherBrowser])item.ui.dispose();
});

test('name editing reports blocked local storage and rejects empty input without claiming it saved',()=>{
 const h=uiHarness(new Map(),{save:()=>false});h.ui.openProfile();h.nodes['username-input'].value='  ';submit(h.nodes['profile-form']);assert.equal(h.settings.username,'Driver');assert.match(h.nodes['profile-status'].textContent,/Enter a username/);
 h.nodes['username-input'].value='Session Name';submit(h.nodes['profile-form']);assert.equal(h.settings.username,'Session Name');assert.equal(h.nodes['profile-dialog'].open,true);assert.equal(h.nodes['profile-feedback'].textContent,'SESSION ONLY');assert.match(h.nodes['profile-status'].textContent,/blocked local saving/);h.ui.dispose();
});

test('the in-game feed and open chat transcript show the same bounded plain text and expire together',()=>{
 const h=uiHarness();for(let n=1;n<=6;n++)h.ui.receive({...message(n),text:n===6?'<img src=x onerror=alert(1)>':'Message '+n});
 for(const id of ['chat-feed','chat-log']){assert.equal(h.nodes[id].children.length,5);assert.equal(h.nodes[id].children.at(-1).children[1].textContent,'<img src=x onerror=alert(1)>');}
 h.ui.open(false,true);assert.match(h.nodes['chat-status'].textContent,/ALL PLAYERS.*NEWEST 5/);assert.equal(h.clears,1);h.nodes['chat-text'].value='Hello everyone';submit(h.nodes['chat-form']);assert.deepEqual(h.sent,['Hello everyone']);assert.equal(h.nodes['chat-dialog'].open,false);
 h.clock.step(CHAT_CLEAR_MS);for(const id of ['chat-feed','chat-log']){assert.equal(h.nodes[id].children.length,0);assert.equal(h.nodes[id].hidden,true);}h.ui.receive(message(7));h.ui.reset();assert.equal(h.clock.jobs.size,0);h.ui.dispose();
});

test('visible chat/profile controls work in matches, pause, lobbies and results and restore the correct screen',()=>{
 const h=uiHarness(),keys=new EventTarget();let started=true,paused=false,phase='playing',focused=0,skips=0;
 const access=setupSocialAccess({ui:h.ui,started:()=>started,paused:()=>paused,phase:()=>phase,online:()=>true,closePause:()=>h.nodes['pause-dialog'].close(),returnToPause:()=>h.nodes['pause-dialog'].showModal(),focusGame:()=>focused++,skipReplay:()=>skips++},h.root,keys);
 h.nodes['hud-chat-button'].click();assert.equal(h.nodes['chat-dialog'].open,true);h.nodes['chat-back'].click();assert.equal(focused,1);
 paused=true;h.nodes['pause-dialog'].showModal();h.nodes['pause-profile-button'].click();assert.equal(h.nodes['pause-dialog'].open,false);assert.equal(h.nodes['profile-dialog'].open,true);h.nodes['profile-cancel'].click();assert.equal(h.nodes['pause-dialog'].open,true);
 h.nodes['pause-chat-button'].click();h.nodes['chat-back'].click();assert.equal(h.nodes['pause-dialog'].open,true);paused=false;h.nodes['pause-dialog'].close();
 for(const [screen,button]of [['party-dialog','party-chat-button'],['result-dialog','result-chat-button']]){h.nodes[screen].showModal();h.nodes[button].click();h.nodes['chat-back'].click();assert.equal(h.nodes[screen].open,true);h.nodes[screen].close();}
 function enter(target=h.nodes.arena,repeat=false){const event=new Event('keydown',{cancelable:true});Object.defineProperties(event,{code:{value:'Enter'},repeat:{value:repeat},target:{value:target}});keys.dispatchEvent(event);return event;}
 assert.equal(enter().defaultPrevented,true);assert.equal(h.nodes['chat-dialog'].open,true);h.nodes['chat-back'].click();assert.equal(enter(h.nodes['username-input']).defaultPrevented,false);assert.equal(enter(h.nodes['hud-chat-button']).defaultPrevented,false);assert.equal(enter(h.nodes.arena,true).defaultPrevented,false);
 phase='goal';enter();assert.equal(skips,1);assert.equal(h.nodes['chat-dialog'].open,false);phase='ended';enter();assert.equal(h.nodes['chat-dialog'].open,false);
 started=false;h.nodes['profile-edit'].click();h.nodes['profile-cancel'].click();assert.equal(h.root.activeElement,h.nodes['profile-edit']);access.dispose();h.nodes['hud-chat-button'].click();assert.equal(h.nodes['chat-dialog'].open,false);h.ui.dispose();
});
