const clamp=value=>Math.max(-1,Math.min(1,value));
export function mobileDevice(scope=globalThis){return !!(scope.navigator?.maxTouchPoints>0&&scope.matchMedia?.('(pointer: coarse)').matches);}
export function touchPreferences(value={}){return {mode:['auto','on','off'].includes(value?.mode)?value.mode:'auto',scale:Number.isFinite(Number(value?.scale))?Math.max(80,Math.min(130,Number(value.scale))):100};}
// Each finger owns one control. Cancellation/capture loss releases that finger
// without releasing other fingers' jump, boost or steering.
export class TouchControls{
 constructor({root=document,canvas,active=()=>false,action=()=>{},freeCamera=()=>false,look=()=>{},lookDrag=()=>{},practice=()=>false,preferences={},mobile=mobileDevice()}={}){
  Object.assign(this,{root,canvas,active,action,freeCamera,look,lookDrag,practice,mobile});
  this.panel=root.getElementById('touch-controls');this.pad=root.getElementById('touch-joystick');this.knob=root.getElementById('touch-knob');this.pointers=new Map();this.listeners=[];this.x=this.y=0;this.stick=null;this.lookPointer=null;this.preferences=touchPreferences(preferences);
  const keys=root.defaultView||window;
  this.listen(this.pad,'pointerdown',event=>this.begin(event,'stick'));
  for(const button of this.panel.querySelectorAll('[data-touch-hold]'))this.listen(button,'pointerdown',event=>this.begin(event,button.dataset.touchHold));
  for(const button of this.panel.querySelectorAll('[data-touch-action]'))this.listen(button,'pointerdown',event=>{if(event.pointerType!=='touch'||!this.active())return;event.preventDefault();this.action(button.dataset.touchAction);});
  this.listen(canvas,'pointerdown',event=>{if(event.pointerType==='touch'&&this.requested()&&this.active()){event.preventDefault();if(this.freeCamera())this.begin(event,'look');}});
  this.listen(keys,'pointermove',event=>this.move(event),{passive:false});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])this.listen(keys,name,event=>this.release(event.pointerId));
  this.listen(keys,'blur',()=>this.clear());this.listen(root,'visibilitychange',()=>{if(root.hidden)this.clear();});this.update();
 }
 listen(target,type,callback,options){target.addEventListener(type,callback,options);this.listeners.push([target,type,callback,options]);}
 requested(){return this.preferences.mode==='on'||this.preferences.mode==='auto'&&this.mobile;}
 setPreferences(value){this.preferences=touchPreferences(value);this.update();}
 update(){
  const enabled=this.requested()&&this.active();if(!enabled&&this.pointers.size)this.clear();
  const next={enabled,scale:this.preferences.scale,practice:this.practice(),ballcam:!this.freeCamera()},old=this.ui||{};
  if(next.enabled!==old.enabled){this.panel.hidden=!enabled;this.root.body.classList.toggle('touch-play',enabled);}
  if(next.scale!==old.scale)this.panel.style.setProperty('--touch-scale',next.scale/100);
  if(next.practice!==old.practice)this.root.getElementById('touch-reset').hidden=!next.practice;
  if(next.ballcam!==old.ballcam)this.root.getElementById('touch-camera').setAttribute('aria-pressed',String(next.ballcam));
  this.ui=next;
 }
 begin(event,role){
  if(event.pointerType!=='touch'||!this.requested()||!this.active())return;
  if(role==='stick'&&this.stick!==null||role==='look'&&this.lookPointer!==null)return;
  event.preventDefault();const element=event.currentTarget;this.pointers.set(event.pointerId,{role,element,x:event.clientX,y:event.clientY});try{element.setPointerCapture(event.pointerId);}catch{}
  if(role==='stick'){this.stick=event.pointerId;this.axis(event);}if(role==='look'){this.lookPointer=event.pointerId;this.lookDrag(true);}
 }
 axis(event){
  const box=this.pad.getBoundingClientRect(),radius=Math.max(1,box.width*.4);let x=(event.clientX-box.left-box.width/2)/radius,y=(event.clientY-box.top-box.height/2)/radius;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}this.x=Math.abs(x)<.08?0:clamp(x);this.y=Math.abs(y)<.08?0:clamp(y);this.knob.style.transform=`translate(${this.x*radius}px,${this.y*radius}px)`;
 }
 move(event){
  const pointer=this.pointers.get(event.pointerId);if(!pointer)return;if(!this.active()){this.clear();return;}
  if(pointer.role==='stick'){event.preventDefault();this.axis(event);}
  if(pointer.role==='look'){if(!this.freeCamera()){this.release(event.pointerId);return;}event.preventDefault();this.look(-(event.clientX-pointer.x)*.006,(event.clientY-pointer.y)*.004);pointer.x=event.clientX;pointer.y=event.clientY;}
 }
 release(id){
  const pointer=this.pointers.get(id);if(!pointer)return;this.pointers.delete(id);
  if(id===this.stick){this.stick=null;this.x=this.y=0;this.knob.style.transform='translate(0,0)';}if(id===this.lookPointer){this.lookPointer=null;this.lookDrag(false);}try{pointer.element.releasePointerCapture(id);}catch{}
 }
 clear(){for(const id of [...this.pointers.keys()])this.release(id);}
 read(){
  if(!this.active()||!this.requested())return null;const held=new Set([...this.pointers.values()].map(pointer=>pointer.role));
  return {stick:this.stick!==null,throttle:held.has('brake')?-1:-this.y,brake:held.has('brake'),steer:-this.x,pitch:-this.y,roll:Number(held.has('rollRight'))-Number(held.has('rollLeft')),jump:held.has('jump'),boost:held.has('boost'),drift:held.has('drift')};
 }
 diagnostics(){return {enabled:!this.panel.hidden,pointers:this.pointers.size,stick:this.stick!==null};}
 dispose(){this.clear();for(const [target,type,callback,options]of this.listeners)target.removeEventListener(type,callback,options);this.panel.hidden=true;this.root.body.classList.remove('touch-play');}
}
