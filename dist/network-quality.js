export const REGIONS=Object.freeze({worldwide:'Worldwide',americas:'Americas',europe:'Europe',asia:'Asia',oceania:'Oceania',meaf:'Middle East / Africa'});
export function networkPreferences(value={}){return {region:Object.hasOwn(REGIONS,value?.region)?value.region:'worldwide',maxPing:[0,100,150,200,300].includes(value?.maxPing)?value.maxPing:200};}
export const regionQueue=(queue,region)=>region==='worldwide'?queue:queue+'-'+region;

// A bounded sequence window allows eight packets of reordering before estimating
// missing realtime datagrams. It does not infer loss from render FPS or input IDs.
export class DeliveryWindow{
 constructor(){this.first=null;this.high=0;this.seen=new Set();}
 receive(n){if(!Number.isSafeInteger(n)||n<1||n>0x7fffffff)return;if(this.first===null)this.first=n;if(n>this.high+10000&&this.high)return;this.high=Math.max(this.high,n);const low=Math.max(this.first,this.high-255);if(n>=low)this.seen.add(n);for(const old of this.seen)if(old<low)this.seen.delete(old);}
 loss(){if(this.first===null)return null;const start=Math.max(this.first,this.high-255),end=this.high-8,total=end-start+1;if(total<20)return null;let received=0;for(const n of this.seen)if(n>=start&&n<=end)received++;return (total-received)/total;}
}
export class ConnectionQuality{
 constructor(){this.delivery=new DeliveryWindow();this.samples=[];this.remoteLoss=null;}
 rtt(ms){if(!Number.isFinite(ms)||ms<0||ms>10000)return;this.samples.push(ms);if(this.samples.length>8)this.samples.shift();}
 report(loss){if(loss===null||Number.isFinite(loss)&&loss>=0&&loss<=1)this.remoteLoss=loss;}
 summary(now,lastReceive,recovering=false){const ping=this.samples.length?Math.round(this.samples.reduce((a,b)=>a+b,0)/this.samples.length):null,jitter=this.samples.length>1?Math.round(this.samples.slice(1).reduce((sum,n,i)=>sum+Math.abs(n-this.samples[i]),0)/(this.samples.length-1)):0,local=this.delivery.loss(),loss=local===null?this.remoteLoss:Math.max(local,this.remoteLoss||0);let status='good';if(recovering)status='reconnecting';else if(now-lastReceive>1800)status='stalled';else if(loss!==null&&loss>=.05)status='loss';else if(ping!==null&&ping>180)status='latency';else if(jitter>35)status='unstable';else if(ping===null)status='measuring';return {status,ping,jitter,loss:loss===null?null:Math.round(loss*100)};}
}
