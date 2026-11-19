export function screenPreferences(value={}) {
 return {autoFullscreen:value?.autoFullscreen===true};
}
export function standalone(scope=globalThis) {
 return !!(scope.navigator?.standalone||scope.matchMedia?.('(display-mode: standalone)').matches);
}
// Fullscreen requires a real gesture; no timer retries and no browser permission
// prompts. Safari home-screen launches use their own supported standalone mode.
export class ScreenMode {
 constructor({root=document,scope=window,settings,save=()=>{},resize=()=>{}}) {
  Object.assign(this,{root,scope,settings,save,resize});this.busy=false;this.listeners=[];
  const listen=(target,name,fn)=>{target.addEventListener(name,fn);this.listeners.push([target,name,fn]);};
  for(const button of root.querySelectorAll('[data-screen-toggle]'))listen(button,'click',()=>this.toggle());
  const option=root.getElementById('auto-fullscreen');option.checked=settings.screen.autoFullscreen;
  listen(option,'change',()=>{settings.screen=screenPreferences({autoFullscreen:option.checked});save();});
  for(const name of ['fullscreenchange','webkitfullscreenchange'])listen(root,name,()=>{this.sync();resize();});
  listen(scope,'resize',()=>this.sync());
  // Capture on the original user action, before asynchronous lobby/model work.
  listen(root,'click',event=>{if(settings.screen.autoFullscreen&&event.target.closest?.('#play-button,#match-find,#party-create,#party-start,#room-host'))this.enter(false);});
  this.sync();
 }
 element(){return this.root.fullscreenElement||this.root.webkitFullscreenElement;}
 supported(){return !!(this.root.documentElement.requestFullscreen||this.root.documentElement.webkitRequestFullscreen);}
 sync(){
  const home=standalone(this.scope),full=!!this.element()||home;
  for(const button of this.root.querySelectorAll('[data-screen-toggle]')){button.setAttribute('aria-pressed',String(full));button.setAttribute('aria-label',home?'Home-screen display help':full?'Exit fullscreen':'Fullscreen or home-screen help');const label=button.querySelector('[data-screen-label]');if(label)label.textContent=home?'HOME SCREEN':full?'EXIT FULLSCREEN':'FULLSCREEN';}
  this.root.getElementById('screen-mode-status').textContent=standalone(this.scope)?'Running from your home screen.':full?'Fullscreen is on.':this.supported()?'Fullscreen opens from a tap. Your browser may allow landscape lock.':'On iPhone, use Safari → Share → Add to Home Screen, then open the game icon.';
 }
 async enter(showHelp=true) {
  if(this.busy||this.element()||standalone(this.scope))return;
  const element=this.root.documentElement,request=element.requestFullscreen||element.webkitRequestFullscreen;
  if(!request){if(showHelp)this.help();return;}
  this.busy=true;
  try {await request.call(element);try{await this.scope.screen?.orientation?.lock?.('landscape');}catch{}this.resize();}
  catch {if(showHelp)this.help();}
  finally {this.busy=false;this.sync();}
 }
 help(){const dialog=this.root.getElementById('screen-help-dialog');if(!dialog.open)dialog.showModal();}
 async toggle(){
  if(this.element()){try{const exit=this.root.exitFullscreen||this.root.webkitExitFullscreen;await exit.call(this.root);}catch{this.help();}this.sync();}
  else if(standalone(this.scope))this.help();else await this.enter();
 }
 dispose(){for(const [target,type,fn]of this.listeners)target.removeEventListener(type,fn);}
}
