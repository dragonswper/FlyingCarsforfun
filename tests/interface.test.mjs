import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from '../dist/vendor/three.module.js';
import {setupLobby,NameplateLayer} from '../dist/interface.js';
import {normalizeInterface} from '../dist/preferences.js';

class Element extends EventTarget{
 constructor(id='',ownerDocument){super();this.id=id;this.ownerDocument=ownerDocument;this.dataset={};this.style={};this.hidden=false;this.textContent='';this.children=[];const classes=new Set();this.classList={toggle:(name,on)=>{if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)};}
 append(child){this.children.push(child);}
 focus(){this.ownerDocument.activeElement=this;this.dispatchEvent(new Event('focus'));}
 click(){this.dispatchEvent(new Event('click'));}
}
function key(target,code){const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'code',{value:code});target.dispatchEvent(event);return event;}
function lobbyHarness(mode='duel'){
 const root=new EventTarget(),ids=['lobby','home-screen','play-screen','play-back','menu-help','open-play','open-training','garage-button','career-button','settings-button','controls-button'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id,root)])),rows=ids.slice(5).map(id=>nodes[id]),modes=Object.fromEntries(['duel','doubles','free','training'].map(mode=>[mode,new Element(mode,root)]));
 root.activeElement=null;root.modal=null;root.getElementById=id=>nodes[id];root.querySelectorAll=()=>rows;root.querySelector=selector=>selector==='dialog[open]'?root.modal:modes[selector.match(/data-mode="([^"]+)"/)?.[1]];
 const settings={mode};let saves=0,syncs=0;const ui=setupLobby(settings,{save:()=>saves++,sync:()=>syncs++},root);
 return {root,nodes,rows,modes,settings,ui,counts:()=>({saves,syncs})};
}

test('Play and Training retain separate mode selections across back navigation',()=>{
 const h=lobbyHarness('doubles');h.nodes['open-play'].click();assert.equal(h.settings.mode,'doubles');assert.equal(h.nodes['home-screen'].hidden,true);assert.equal(h.root.activeElement,h.modes.doubles);
 h.nodes['play-back'].click();h.nodes['open-training'].click();assert.equal(h.settings.mode,'free');h.settings.mode='training';h.nodes['play-back'].click();
 h.nodes['open-play'].click();assert.equal(h.settings.mode,'doubles');h.nodes['play-back'].click();h.nodes['open-training'].click();assert.equal(h.settings.mode,'training');assert.deepEqual(h.counts(),{saves:4,syncs:4});
});
test('Escape returns from mode selection but does not interfere with an open dialog or a running match',()=>{
 const h=lobbyHarness();h.nodes['open-play'].click();h.root.modal={open:true};assert.equal(key(h.root,'Escape').defaultPrevented,false);assert.equal(h.nodes.lobby.dataset.screen,'play');
 h.root.modal=null;assert.equal(key(h.root,'Escape').defaultPrevented,true);assert.equal(h.nodes.lobby.dataset.screen,'home');assert.equal(h.root.activeElement,h.nodes['open-play']);
 h.nodes['open-play'].click();h.nodes.lobby.hidden=true;assert.equal(key(h.root,'Escape').defaultPrevented,false);assert.equal(h.nodes.lobby.dataset.screen,'play');
});
test('main menu arrow navigation wraps, updates selection and exposes the correct help text',()=>{
 const h=lobbyHarness();key(h.rows[0],'ArrowUp');assert.equal(h.root.activeElement,h.nodes['controls-button']);assert.match(h.nodes['menu-help'].textContent,/driving/);
 key(h.rows.at(-1),'ArrowDown');assert.equal(h.root.activeElement,h.rows[0]);key(h.rows[0],'End');assert.equal(h.root.activeElement,h.rows.at(-1));key(h.rows.at(-1),'Home');assert.equal(h.root.activeElement,h.rows[0]);assert.equal(h.rows[0].classList.contains('menu-selected'),true);
});
test('nameplates follow render poses, hide the local player and cull offscreen, hidden and rearward cars',()=>{
 const doc={createElement:()=>new Element('',doc)},container=new Element('',doc),layer=new NameplateLayer(container),camera=new PerspectiveCamera(60,16/9,.1,200);
 camera.position.set(0,2,0);camera.lookAt(0,2,-10);camera.updateMatrixWorld();const cars=[{id:0,team:0},{id:1,team:1},{id:2,team:0},{id:3,team:1}],models=new Map(cars.map((car,i)=>[car.id,{root:{visible:true,position:new Vector3(i-1.5,1,-12)}}]));
 const view={camera,cars:models,viewport:{width:1920,height:1080}},sim={cars};layer.update(view,sim);assert.equal(layer.labels[0].hidden,true);assert.equal(layer.labels[1].textContent,'ACE');assert.equal(layer.labels[2].textContent,'NOVA');assert.equal(layer.labels[1].classList.contains('orange-name'),true);
 const first=layer.labels[1].style.transform;models.get(1).root.position.x+=1;layer.update(view,sim);assert.notEqual(layer.labels[1].style.transform,first);
 models.get(1).root.visible=false;models.get(2).root.position.z=12;models.get(3).root.position.x=300;layer.update(view,sim);assert.ok(layer.labels.every(label=>label.hidden));
 models.get(0).root.position.set(0,1,-12);layer.update(view,sim,true);assert.equal(layer.labels[0].hidden,false);assert.equal(layer.labels[0].textContent,'YOU');layer.hide();assert.ok(layer.labels.every(label=>label.hidden));assert.equal(container.children.length,4);
});
test('interface settings migrate safely and reject out-of-range saved display scale',()=>{
 assert.deepEqual(normalizeInterface(),{scale:100,nameplates:true,speed:false});assert.deepEqual(normalizeInterface({scale:900,nameplates:false,speed:true}),{scale:120,nameplates:false,speed:true});assert.equal(normalizeInterface({scale:-4}).scale,70);assert.equal(normalizeInterface({scale:'broken'}).scale,100);
});
