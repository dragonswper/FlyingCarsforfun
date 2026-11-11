import test from 'node:test';import assert from 'node:assert/strict';import {Input} from '../dist/input.js';
function event(type,props={}){const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(props))Object.defineProperty(e,k,{value:v});return e;}
test('keyboard/mouse input, camera edge, blur clearing, and standard gamepad mappings',t=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 const canvas=new EventTarget(),actions=[];let active=true;const input=new Input(canvas,{active:()=>active,action:name=>actions.push(name)});const oldPads=navigator.getGamepads;
 t.after(()=>{input.dispose();globalThis.window=oldWindow;globalThis.document=oldDocument;if(oldPads)navigator.getGamepads=oldPads;else delete navigator.getGamepads;});
 window.dispatchEvent(event('keydown',{code:'KeyW'}));window.dispatchEvent(event('keydown',{code:'ShiftLeft'}));assert.equal(input.read().throttle,1);assert.equal(input.read().boost,true);
 window.dispatchEvent(event('keydown',{code:'KeyC'}));window.dispatchEvent(event('keydown',{code:'KeyC',repeat:true}));assert.equal(actions.filter(a=>a==='camera').length,1);
 canvas.dispatchEvent(event('pointerdown',{button:2}));assert.equal(input.read().jump,true);window.dispatchEvent(event('pointerup',{button:2}));assert.equal(input.read().jump,false);
 window.dispatchEvent(event('blur'));assert.equal(input.read().throttle,0);assert.ok(actions.includes('pause'));
 active=false;window.dispatchEvent(event('keydown',{code:'KeyW'}));assert.equal(input.read().throttle,0);
 const buttons=Array.from({length:16},()=>({value:0}));buttons[7].value=1;buttons[0].value=1;buttons[1].value=1;buttons[3].value=1;navigator.getGamepads=()=>[{connected:true,axes:[.5,-.6],buttons}];
 const before=actions.filter(a=>a==='camera').length;const pad=input.read();assert.equal(pad.throttle,1);assert.equal(pad.steer,.5);assert.equal(pad.pitch,.6);assert.equal(pad.jump,true);assert.equal(pad.boost,true);input.read();assert.equal(actions.filter(a=>a==='camera').length,before+1);
});
