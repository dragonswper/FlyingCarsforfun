const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const HUD_WIDGETS=Object.freeze([
 {id:'score',label:'Score & clock',selector:'.scoreboard',x:50,y:7,w:225,h:55},
 {id:'boost',label:'Boost meter',selector:'.boost-hud',x:91,y:78,w:100,h:100,hide:true},
 {id:'network',label:'Connection status',selector:'.network-hud',x:18,y:15,w:230,h:24,hide:true},
 {id:'chat',label:'Chat button',selector:'.hud-chat',x:87,y:7,w:58,h:44},
 {id:'pause',label:'Pause button',selector:'.hud-pause',x:96,y:7,w:44,h:44},
 {id:'stick',label:'Touch joystick',selector:'#touch-joystick',x:12,y:78,w:128,h:128,touch:true},
 {id:'buttons',label:'Jump / boost / brake',selector:'.touch-buttons',x:83,y:75,w:250,h:180,touch:true},
 {id:'roll',label:'Air roll buttons',selector:'.touch-roll',x:11,y:49,w:125,h:48,touch:true},
 {id:'camera',label:'Touch camera / reset',selector:'.touch-shortcuts',x:15,y:25,w:180,h:44,touch:true}
]);
const number=(v,f,min,max)=>Number.isFinite(Number(v))?clamp(Number(v),min,max):f;
export function normalizeHudItem(value={},fallback={x:50,y:50}) {
 return {x:number(value?.x,fallback.x,3,97),y:number(value?.y,fallback.y,3,97),scale:number(value?.scale,1,.6,1.4),opacity:number(value?.opacity,1,.35,1),hidden:value?.hidden===true};
}
export function hudPreferences(value={}) {
 const result={};for(const profile of ['desktop','landscape','portrait']){result[profile]={};for(const widget of HUD_WIDGETS)if(value?.[profile]?.[widget.id]&&typeof value[profile][widget.id]==='object'){const item=normalizeHudItem(value[profile][widget.id],widget);item.hidden=!!widget.hide&&item.hidden;result[profile][widget.id]=item;}}return result;
}
export function hudProfile(mobile,width,height){return !mobile?'desktop':width>=height?'landscape':'portrait';}
export function fitHudScale(width,height,viewWidth,viewHeight,requested){return Math.max(.01,Math.min(requested,(viewWidth-12)/Math.max(1,width),(viewHeight-12)/Math.max(1,height)));}
export function containCenter(x,y,width,height,viewWidth,viewHeight){return {x:clamp(x,width/2+6,Math.max(width/2+6,viewWidth-width/2-6)),y:clamp(y,height/2+6,Math.max(height/2+6,viewHeight-height/2-6))};}
export class HudLayout {
 constructor({root=document,scope=window,settings,save=()=>{},mobile=false}) {
  Object.assign(this,{root,scope,settings,save,mobile});this.listeners=[];this.applied=new Set();this.ghosts=new Map();this.dialog=root.getElementById('hud-editor');this.stage=root.getElementById('hud-stage');this.select=root.getElementById('hud-widget');
  const listen=(el,event,fn)=>{el.addEventListener(event,fn);this.listeners.push([el,event,fn]);};
  for(const widget of this.widgets()){const option=root.createElement('option');option.value=widget.id;option.textContent=widget.label;this.select.append(option);}
  listen(root.getElementById('edit-hud'),'click',()=>this.open());
  listen(this.select,'change',()=>this.choose(this.select.value));
  for(const field of ['x','y','scale','opacity'])listen(root.getElementById('hud-item-'+field),'input',()=>{const item=this.item();item[field]=Number(root.getElementById('hud-item-'+field).value)/(field==='scale'||field==='opacity'?100:1);this.paint();this.controls();});
  listen(root.getElementById('hud-item-hidden'),'change',()=>{this.item().hidden=root.getElementById('hud-item-hidden').checked;this.paint();});
  listen(root.getElementById('hud-layout-save'),'click',()=>{this.settings.hudLayouts=this.draft;const persisted=save()!==false;this.dialog.close();this.apply();root.getElementById('settings-status').textContent=persisted?'HUD layout saved for '+this.profile+'.':'HUD layout applied for this session. Browser storage is unavailable.';});
  listen(root.getElementById('hud-layout-cancel'),'click',()=>this.dialog.close());
  listen(root.getElementById('hud-layout-reset'),'click',()=>{this.draft[this.profile]={};this.paint();this.controls();this.status('Default layout restored in this preview. Save to keep it.');});
  listen(root.getElementById('hud-layout-mirror'),'click',()=>{for(const widget of this.widgets().filter(w=>w.touch)){const item=this.item(widget.id);item.x=100-item.x;}this.paint();this.controls();this.status('Touch groups mirrored. Save to keep this layout.');});
  listen(this.dialog,'close',()=>{this.drag=null;this.draft=null;});
  listen(this.stage,'pointermove',event=>this.move(event));
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(this.stage,type,()=>{this.drag=null;});
  listen(scope,'resize',()=>{this.apply();if(this.dialog.open){this.drag=null;this.profile=this.currentProfile();this.paint();this.controls();}});
 }
 widgets(){return HUD_WIDGETS.filter(widget=>this.mobile||this.settings.touch?.mode==='on'||!widget.touch);}
 currentProfile(){return hudProfile(this.mobile,this.scope.innerWidth,this.scope.innerHeight);}
 defaults(widget){if(this.currentProfile()==='portrait'){if(widget.id==='stick')return {...widget,x:22,y:65};if(widget.id==='buttons')return {...widget,x:63,y:85};if(widget.id==='roll')return {...widget,x:22,y:48};if(widget.id==='boost')return {...widget,x:88,y:65};if(widget.id==='chat')return {...widget,x:75,y:5};if(widget.id==='pause')return {...widget,x:94,y:5};if(widget.id==='camera')return {...widget,x:29,y:14};}return widget;}
 item(id=this.selected,create=true){const widget=this.defaults(HUD_WIDGETS.find(w=>w.id===id));const stored=this.draft[this.profile][id];if(stored)return stored;const fallback=normalizeHudItem({},widget);if(create)this.draft[this.profile][id]=fallback;return fallback;}
 open(){this.select.replaceChildren();for(const widget of this.widgets()){const option=this.root.createElement('option');option.value=widget.id;option.textContent=widget.label;this.select.append(option);}this.profile=this.currentProfile();this.draft=hudPreferences(this.settings.hudLayouts);this.selected=this.widgets()[0].id;this.select.value=this.selected;this.ghosts.clear();this.stage.replaceChildren();for(const widget of this.widgets()){const el=this.root.createElement('button');el.type='button';el.dataset.hudGhost=widget.id;el.className='hud-ghost';el.textContent=widget.label;el.setAttribute('aria-label','Move '+widget.label);el.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();this.choose(widget.id);const item=this.item(),box=this.stage.getBoundingClientRect();this.drag={id:event.pointerId,key:widget.id,startX:event.clientX,startY:event.clientY,x:item.x,y:item.y,box};el.setPointerCapture?.(event.pointerId);});el.addEventListener('keydown',event=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();this.choose(widget.id);const item=this.item();item.x=clamp(item.x+delta[0],3,97);item.y=clamp(item.y+delta[1],3,97);this.paint();this.controls();});this.ghosts.set(widget.id,el);this.stage.append(el);}this.dialog.showModal();this.choose(this.selected);this.status('Drag a widget, use its arrow keys, or adjust the controls.');}
 choose(id){this.selected=id;this.select.value=id;this.controls();this.paint();}
 controls(){const item=this.item(this.selected,false),widget=HUD_WIDGETS.find(w=>w.id===this.selected);for(const key of ['x','y','scale','opacity']){const value=Math.round(item[key]*(key==='scale'||key==='opacity'?100:1));this.root.getElementById('hud-item-'+key).value=value;this.root.getElementById('hud-editor-'+key+'-value').value=value+'%';}this.root.getElementById('hud-item-hidden').disabled=!widget.hide;this.root.getElementById('hud-item-hidden').checked=item.hidden;this.root.getElementById('hud-layout-profile').textContent=this.profile.toUpperCase()+' LAYOUT';}
 paint(){if(!this.draft)return;const box=this.stage.getBoundingClientRect();for(const widget of this.widgets()){const item=this.draft[this.profile][widget.id]||normalizeHudItem({},this.defaults(widget)),el=this.ghosts.get(widget.id),factor=Math.min(1,box.width/844),w=widget.w*factor*item.scale,h=widget.h*factor*item.scale,p=containCenter(item.x/100*box.width,item.y/100*box.height,w,h,box.width,box.height);Object.assign(el.style,{left:p.x+'px',top:p.y+'px',width:widget.w*factor+'px',height:widget.h*factor+'px',transform:`translate(-50%,-50%) scale(${item.scale})`,opacity:item.hidden?.35:item.opacity});el.classList.toggle('selected',widget.id===this.selected);el.setAttribute('aria-pressed',String(widget.id===this.selected));el.dataset.hidden=String(item.hidden);}}
 move(event){const drag=this.drag;if(!drag||drag.id!==event.pointerId)return;event.preventDefault();const item=this.item(drag.key);item.x=clamp(drag.x+(event.clientX-drag.startX)/drag.box.width*100,3,97);item.y=clamp(drag.y+(event.clientY-drag.startY)/drag.box.height*100,3,97);this.paint();this.controls();}
 status(text){this.root.getElementById('hud-editor-status').textContent=text;}
 apply(){
  for(const element of this.applied){for(const property of ['position','left','top','right','bottom','transform','transform-origin','opacity','visibility'])element.style.removeProperty(property);}this.applied.clear();
  const profile=this.currentProfile(),items=this.settings.hudLayouts[profile];
  for(const widget of this.widgets()){const item=items?.[widget.id],element=this.root.querySelector(widget.selector);if(!item||!element||!element.getClientRects().length)continue;
   const box=element.getBoundingClientRect(),style=this.scope.getComputedStyle(element),match=style.transform.match(/^matrix\(([^)]+)\)/),baseScale=match?Math.hypot(...match[1].split(',').slice(0,2).map(Number)):1;
   const fitted=fitHudScale(box.width,box.height,this.scope.innerWidth,this.scope.innerHeight,item.scale),center=containCenter(item.x/100*this.scope.innerWidth,item.y/100*this.scope.innerHeight,box.width*fitted,box.height*fitted,this.scope.innerWidth,this.scope.innerHeight);
   Object.assign(element.style,{position:'fixed',left:center.x+'px',top:center.y+'px',right:'auto',bottom:'auto',transform:`translate(-50%,-50%) scale(${baseScale*fitted})`,transformOrigin:'center',opacity:String(item.opacity),visibility:widget.hide&&item.hidden?'hidden':'visible'});this.applied.add(element);
  }
 }
 dispose(){for(const [el,type,fn]of this.listeners)el.removeEventListener(type,fn);}
}
