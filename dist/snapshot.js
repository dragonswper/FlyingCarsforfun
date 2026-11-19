// Snapshots own their arrays/objects. Round that detached data in place rather
// than serializing and parsing a complete extra JSON document for every peer.
export function compactSnapshot(value) {
 if (Array.isArray(value)) {
  for (let i=0;i<value.length;i++) value[i]=round(value[i]);
 } else if (value && typeof value==='object') {
  for (const key of Object.keys(value)) {
   if(value[key]===undefined)delete value[key];
   else value[key]=round(value[key]);
  }
 }
 return value;
}
function round(value) {
 if(typeof value==='number')return Number.isFinite(value)?Math.round(value*1000)/1000:null;
 return compactSnapshot(value);
}
