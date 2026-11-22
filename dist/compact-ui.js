// Layout follows available space, independently of mouse/touch detection. This
// also covers iPhone desktop-site mode and compact desktop browser windows.
export const COMPACT_QUERY='(max-width: 1024px), (max-height: 560px) and (max-width: 1366px), (pointer: coarse) and (max-width: 1366px)';
export class CompactUI {
 constructor({root=document,scope=window}={}) {
  Object.assign(this,{root,scope});
  this.media=scope.matchMedia(COMPACT_QUERY);
  this.radio=root.querySelector('.showroom-radio .lobby-music');
  this.radioParent=this.radio.parentElement;
  this.radioNext=this.radio.nextSibling;
  this.music=root.getElementById('music-dialog');
  this.onChange=()=>this.update();
  this.openMusic=()=>{if(!this.music.open)this.music.showModal();};
  this.button=root.getElementById('mobile-music-button');
  this.button.addEventListener('click',this.openMusic);
  this.media.addEventListener('change',this.onChange);
  this.update();
 }
 update() {
  const compact=this.media.matches;
  this.root.body.classList.toggle('compact-ui',compact);
  if(compact)this.root.getElementById('mobile-music-slot').append(this.radio);
  else {
   if(this.music.open)this.music.close();
   this.radioParent.insertBefore(this.radio,this.radioNext);
  }
  const advanced=this.root.getElementById('matchmaking-advanced');
  if(this.compact!==compact)advanced.open=!compact;
  this.compact=compact;
 }
 dispose(){this.media.removeEventListener('change',this.onChange);this.button.removeEventListener('click',this.openMusic);}
}
