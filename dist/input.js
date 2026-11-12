/* Rebindable browser controls; Escape and Enter remain pause/replay shortcuts. */
import {normalizeBindings,normalizeControls,bindingCodes} from './preferences.js';
const clamp=n=>Math.max(-1,Math.min(1,n));
export class Input{
 constructor(canvas,{active=()=>false,action=()=>{},freeCamera=()=>false,look=()=>{},bindings,controls}={}){
  this.canvas=canvas;this.active=active;this.action=action;this.freeCamera=freeCamera;this.look=look;this.keys=new Set();this.listeners=[];this.padButtons=[];this.controller=false;this.setPreferences({bindings,controls});
  const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);this.listeners.push([el,type,fn,options]);};
  const edge=code=>{for(const [name,event]of [['camera','camera'],['reset','reset'],['next','next'],['scoreboard','scoreboard']])if(this.codes[name].includes(code))this.action(event);};
  listen(window,'keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName))return;if(e.code==='Escape'){if(this.active())this.action('pause');return;}if(!this.active())return;if(this.used.has(e.code))e.preventDefault();this.keys.add(e.code);if(!e.repeat)edge(e.code);});
  listen(window,'keyup',e=>{this.keys.delete(e.code);if(this.codes.scoreboard.includes(e.code))this.action('hide-scoreboard');});
  listen(canvas,'pointerdown',e=>{if(!this.active())return;const code='Mouse'+e.button;if(e.button===1&&!this.used.has(code)&&this.freeCamera()){e.preventDefault();this.dragging=true;this.lastPointer={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture?.(e.pointerId);}catch{}return;}if(this.used.has(code))e.preventDefault();const wasDown=this.keys.has(code);this.keys.add(code);if(!wasDown)edge(code);});
  listen(window,'pointermove',e=>{if(!this.dragging)return;if(!this.active()||!this.freeCamera()){this.dragging=false;return;}const dx=Number.isFinite(e.clientX)&&Number.isFinite(this.lastPointer.x)?e.clientX-this.lastPointer.x:e.movementX||0,dy=Number.isFinite(e.clientY)&&Number.isFinite(this.lastPointer.y)?e.clientY-this.lastPointer.y:e.movementY||0;this.lastPointer={x:e.clientX,y:e.clientY};this.look(-dx*.006,dy*.004);e.preventDefault();});
  listen(window,'pointerup',e=>{if(e.button===1)this.dragging=false;const code='Mouse'+e.button;this.keys.delete(code);if(this.codes.scoreboard.includes(code))this.action('hide-scoreboard');});
  listen(canvas,'contextmenu',e=>e.preventDefault());listen(window,'blur',()=>{this.clear();if(this.active())this.action('pause');});listen(document,'visibilitychange',()=>{if(document.hidden){this.clear();if(this.active())this.action('pause');}});
 }
 setPreferences({bindings=this.bindings,controls=this.controls}={}){this.bindings=normalizeBindings(bindings);this.controls=normalizeControls(controls);this.codes=Object.fromEntries(Object.keys(this.bindings).map(action=>[action,bindingCodes(this.bindings,action)]));this.used=new Set(Object.values(this.codes).flat());this.clear();}
 clear(){this.keys.clear();this.dragging=false;}
 read(dt=1/60){
  const pressed=action=>this.codes[action].some(code=>this.keys.has(code)),options=this.controls;
  const result={throttle:+pressed('forward')-+pressed('reverse'),steer:+pressed('right')-+pressed('left'),pitch:+pressed('forward')-+pressed('reverse'),roll:+pressed('rollRight')-+pressed('rollLeft'),jump:pressed('jump'),boost:pressed('boost'),drift:pressed('drift'),dodgeDeadzone:options.dodgeDeadzone};
  try{const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);this.controller=!!pad;if(pad){const axis=n=>Math.abs(pad.axes[n]||0)>options.deadzone?pad.axes[n]:0,button=n=>pad.buttons[n]?.value||0,drive=button(7)-button(6),steer=axis(0);if(Math.abs(drive)>.05)result.throttle=drive;if(steer)result.steer=steer;if(axis(1))result.pitch=-axis(1);if(this.active()&&this.freeCamera()&&(axis(2)||axis(3)))this.look(-axis(2)*2*Math.max(0,Math.min(.1,Number(dt)||0)),axis(3)*1.5*Math.max(0,Math.min(.1,Number(dt)||0)));result.roll+=(button(5)>0?1:0)-(button(4)>0?1:0);result.jump||=button(0)>.5;result.boost||=button(1)>.5;result.drift||=button(2)>.5;for(const [id,name]of [[3,'camera'],[9,'pause'],[8,'scoreboard'],[12,'reset'],[13,'next']]){const down=button(id)>.5;if(down&&!this.padButtons[id])this.action(name);this.padButtons[id]=down;}}else this.padButtons=[];}catch{this.controller=false;}
  result.steer=clamp(result.steer*options.steeringSensitivity);result.pitch=clamp(result.pitch*options.aerialSensitivity*(options.invertPitch?-1:1));result.roll=clamp(result.roll*options.aerialSensitivity);return result;
 }
 dispose(){this.listeners.forEach(([el,type,fn,options])=>el.removeEventListener(type,fn,options));this.clear();}
}
