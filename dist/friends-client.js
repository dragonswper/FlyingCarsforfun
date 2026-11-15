export const DEVICE_KEY='boost-circuit.device.v1';
export function deviceSecret(storage,random=globalThis.crypto,scope=''){
 const key=scope?DEVICE_KEY+':'+scope:DEVICE_KEY;
 if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
 let secret;try{secret=storage?.getItem(key);}catch{}
 if(!/^[a-f0-9]{64}$/.test(secret||'')){const bytes=random.getRandomValues(new Uint8Array(32));secret=Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');try{storage?.setItem(key,secret);}catch{}}
 return secret;
}
export class FriendsClient{
 constructor({address,settings,context=()=>({}),onChange=()=>{},fetcher=globalThis.fetch,secret,tab=globalThis.crypto.randomUUID()}={}){
  const url=new URL(address);if(url.protocol==='wss:')url.protocol='https:';if(url.protocol!=='https:'||url.username||url.password)throw Error('Friends require a secure HTTPS server.');
  secret||=deviceSecret(undefined,undefined,url.origin);url.pathname='/api/social';url.search='';url.hash='';Object.assign(this,{url:url.href,settings,context,onChange,secret,tab});this.fetcher=fetcher.bind(globalThis);this.state=null;this.error='';this.sequence=0;this.applied=0;this.delay=10000;this.closed=false;
  try{this.persistent=globalThis.localStorage?.getItem(DEVICE_KEY+':'+url.origin)===secret;}catch{this.persistent=false;}
 }
 async request(op,body={}){
  const sequence=++this.sequence,response=await this.fetcher(this.url,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.secret},body:JSON.stringify({op,...body}),signal:AbortSignal.timeout(15000)}),value=await response.json();
  if(!response.ok)throw Error(value.error||'Friends are temporarily unavailable.');if(value.self&&sequence>=this.applied){this.applied=sequence;this.state=value;this.error='';this.onChange(this);}return value;
 }
 async sync(){if(this.closed||this.syncing)return;this.syncing=true;try{await this.request('sync',{name:this.settings.username,tab:this.tab,status:this.context().status||'menu'});this.delay=10000;}catch(error){this.error=error.message;this.delay=Math.min(60000,this.delay*2);this.onChange(this);}finally{this.syncing=false;if(!this.closed){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),this.delay);this.timer.unref?.();}}}
 async action(op,body={}){try{const result=await this.request(op,body);this.error='';this.onChange(this);return result;}catch(error){this.error=error.message;this.onChange(this);return null;}}
 async share(visibility='friends'){
  const {room}=this.context();if(!room?.dedicated||!room.canManage||!room.connected)throw Error('Create a dedicated lobby first.');
  const origin=new URL(room.address);origin.protocol='https:';if(origin.origin!==new URL(this.url).origin)throw Error('Create the lobby on the same server as Friends.');
  const result=await this.action('publish',{code:room.code,proof:room.token,visibility});if(!result)throw Error(this.error);return result;
 }
 async invite(peer,visibility='friends'){try{await this.share(visibility);return this.action('invite',{peer});}catch(error){this.error=error.message;this.onChange(this);return null;}}
 async join(id){return this.action('join',{lobby:id});}
 dispose(){this.closed=true;clearTimeout(this.timer);}
 leave(){if(!this.state)return;this.fetcher(this.url,{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.secret},body:JSON.stringify({op:'leave',tab:this.tab})}).catch(()=>{});}
}
