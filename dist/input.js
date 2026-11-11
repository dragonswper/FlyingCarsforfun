/* Keyboard, mouse and standard-gamepad input; no pointer lock or native software. */
export class Input{
 constructor(canvas,{active=()=>false,action=()=>{}}={}){
  this.canvas=canvas;this.active=active;this.action=action;this.keys=new Set();this.mouse={boost:false,jump:false};this.listeners=[];this.padButtons=[];this.controller=false;
  const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);this.listeners.push([el,type,fn,options]);};
  const used=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','KeyQ','KeyE','Tab']);
  listen(window,'keydown',e=>{
   if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName))return;
   if(e.code==='Escape'){if(this.active())this.action('pause');return;}
   if(!this.active())return;
   if(used.has(e.code))e.preventDefault();this.keys.add(e.code);
   if(!e.repeat){const actions={KeyC:'camera',KeyR:'reset',KeyT:'next',Tab:'scoreboard'};if(actions[e.code])this.action(actions[e.code]);}
  });
  listen(window,'keyup',e=>{this.keys.delete(e.code);if(e.code==='Tab')this.action('hide-scoreboard');});
  listen(canvas,'pointerdown',e=>{if(!this.active())return;if(e.button===0)this.mouse.boost=true;if(e.button===2)this.mouse.jump=true;});
  listen(window,'pointerup',e=>{if(e.button===0)this.mouse.boost=false;if(e.button===2)this.mouse.jump=false;});
  listen(canvas,'contextmenu',e=>e.preventDefault());listen(window,'blur',()=>{this.clear();if(this.active())this.action('pause');});
  listen(document,'visibilitychange',()=>{if(document.hidden){this.clear();if(this.active())this.action('pause');}});
 }
 clear(){this.keys.clear();this.mouse.boost=false;this.mouse.jump=false;}
 read(){
  const k=this.keys,pressed=(...keys)=>keys.some(key=>k.has(key));
  let result={throttle:+pressed('KeyW','ArrowUp')-+pressed('KeyS','ArrowDown'),steer:+pressed('KeyD','ArrowRight')-+pressed('KeyA','ArrowLeft'),pitch:+pressed('KeyW','ArrowUp')-+pressed('KeyS','ArrowDown'),roll:+pressed('KeyE')-+pressed('KeyQ'),jump:pressed('Space')||this.mouse.jump,boost:pressed('ShiftLeft','ShiftRight')||this.mouse.boost,drift:pressed('ControlLeft','ControlRight')};
  try{
   const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);this.controller=!!pad;
   if(pad){const axis=n=>Math.abs(pad.axes[n]||0)>.12?pad.axes[n]:0,button=n=>pad.buttons[n]?.value||0;
    const drive=button(7)-button(6),steer=axis(0);if(Math.abs(drive)>.05)result.throttle=drive;if(steer)result.steer=steer;
    if(axis(1))result.pitch=-axis(1);result.roll+=(button(5)>0?1:0)-(button(4)>0?1:0);result.jump||=button(0)>.5;result.boost||=button(1)>.5;result.drift||=button(2)>.5;
    for(const [id,name] of [[3,'camera'],[9,'pause'],[8,'scoreboard'],[12,'reset'],[13,'next']]){const down=button(id)>.5;if(down&&!this.padButtons[id])this.action(name);this.padButtons[id]=down;}
   }
  }catch{this.controller=false;}
  return result;
 }
 dispose(){this.listeners.forEach(([el,type,fn,options])=>el.removeEventListener(type,fn,options));this.clear();}
}
