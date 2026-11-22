import test from 'node:test';import assert from 'node:assert/strict';import {CompactUI,COMPACT_QUERY} from '../dist/compact-ui.js';
function harness(compact=true){
 const media=Object.assign(new EventTarget(),{matches:compact}),classes=new Set(),radio={nextSibling:null},sibling={};
 function parent(){return {children:[],append(child){if(child.parentElement){const old=child.parentElement.children;old.splice(old.indexOf(child),1);}this.children.push(child);child.parentElement=this;},insertBefore(child,next){this.append(child);if(next){this.children.pop();this.children.splice(this.children.indexOf(next),0,child);}}};}
 const original=parent(),slot=parent();original.append(radio);original.children.push(sibling);radio.nextSibling=sibling;
 const button=new EventTarget(),music={open:false,showModal(){this.open=true;},close(){this.open=false;}},advanced={open:false},root={body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},querySelector:()=>radio,getElementById:id=>({'mobile-music-slot':slot,'music-dialog':music,'mobile-music-button':button,'matchmaking-advanced':advanced}[id])};
 const scope={matchMedia(query){assert.equal(query,COMPACT_QUERY);return media;}},ui=new CompactUI({root,scope});return {ui,media,classes,radio,original,slot,sibling,button,music,advanced};
}
test('compact UI moves the existing radio once, leaving one audio control panel and preserving manual detail expansion',()=>{
 const h=harness();assert.ok(h.classes.has('compact-ui'));assert.deepEqual(h.slot.children,[h.radio]);assert.equal(h.advanced.open,false);h.advanced.open=true;h.ui.update();assert.equal(h.advanced.open,true);assert.equal(h.slot.children.length,1);h.button.dispatchEvent(new Event('click'));assert.equal(h.music.open,true);h.ui.dispose();
});
test('resizing to desktop restores the panel in its original order and closes a mobile music modal',()=>{
 const h=harness();h.button.dispatchEvent(new Event('click'));h.media.matches=false;h.media.dispatchEvent(new Event('change'));assert.equal(h.classes.has('compact-ui'),false);assert.equal(h.music.open,false);assert.deepEqual(h.original.children,[h.radio,h.sibling]);assert.equal(h.slot.children.length,0);assert.equal(h.advanced.open,true);h.ui.dispose();h.media.matches=true;h.media.dispatchEvent(new Event('change'));assert.equal(h.radio.parentElement,h.original);
});
