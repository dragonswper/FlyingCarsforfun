// Keep provider credentials in memory. Diagnostics never expose addresses or ICE credentials.
const urls=server=>(Array.isArray(server?.urls)?server.urls:[server?.urls]).filter(value=>typeof value==='string');
export const hasRelay=servers=>(servers||[]).some(server=>urls(server).some(url=>/^turns?:/i.test(url)));
export function directServers(servers=[]){return servers.flatMap(server=>{const filtered=urls(server).filter(url=>/^stuns?:/i.test(url));return filtered.length?[{...server,urls:Array.isArray(server.urls)?filtered:filtered[0]}]:[];});}
export function readConnectionInfo(report){
 const unknown={route:'unknown',protocol:null,networkPing:null};if(!report?.values)return unknown;
 const entries=[...report.values()],byId=new Map(entries.map(entry=>[entry.id,entry]));
 const selected=entries.find(entry=>entry.type==='transport'&&entry.selectedCandidatePairId),pairs=entries.filter(entry=>entry.type==='candidate-pair'&&entry.state==='succeeded');
 let pair=selected?byId.get(selected.selectedCandidatePairId):pairs.find(entry=>entry.selected===true);
 if(!pair){const nominated=pairs.filter(entry=>entry.nominated===true);if(nominated.length===1)pair=nominated[0];}
 if(!pair||pair.type!=='candidate-pair'||pair.state!=='succeeded')return unknown;
 const local=byId.get(pair.localCandidateId),remote=byId.get(pair.remoteCandidateId),types=[local?.candidateType,remote?.candidateType],relay=types.includes('relay'),known=types.every(type=>['host','srflx','prflx'].includes(type));
 const protocol=relay&&local?.candidateType==='relay'&&['udp','tcp','tls'].includes(local.relayProtocol)?local.relayProtocol:['udp','tcp'].includes(local?.protocol)?local.protocol:null;
 const networkPing=Number.isFinite(pair.currentRoundTripTime)&&pair.currentRoundTripTime>=0&&pair.currentRoundTripTime<=60?Math.round(pair.currentRoundTripTime*1000):null;
 return {route:relay?'relay':known?'direct':'unknown',protocol,networkPing};
}
export function routeLabel(info){return (info?.route==='server'?'DEDICATED SERVER':info?.route==='direct'?'DIRECT':info?.route==='relay'?'RELAYED':'ROUTE UNKNOWN')+(info?.protocol?' '+info.protocol.toUpperCase():'');}
