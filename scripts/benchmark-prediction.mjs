// Deterministic CPU/allocation check. The optional module URL allows comparison
// with a saved prior revision; it does not alter game or server configuration.
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {Simulation,C} from '../dist/physics.js';
const {GuestReplica,makeState}=await import(process.argv[3]||'../dist/network-state.js');
const runs=[],allocations=[];
for(let run=0;run<3;run++){
  const host=new Simulation({mode:'free'}),guest=new Simulation({mode:'free'});
  host.phase=guest.phase='playing';host.ball.p.set(-25,12,-25);guest.ball.p.copy(host.ball.p);
  const replica=new GuestReplica(guest,0);replica.receive(makeState(host,0,0,'benchmark'),0);replica.setLatency(200);
  const original=replica.predicted.q.toArray,arrays=new Set();
  replica.predicted.q.toArray=function(...args){const result=original.apply(this,args);arrays.add(result);return result;};
  const packets=[],controls={throttle:.6,steer:.1};let sequence=0;
  const start=performance.now();
  for(let tick=1;tick<=5000;tick++){
    const now=tick*C.step*1000;replica.step(controls);host.step(controls,C.step);
    if(tick%4===0){const state=makeState(host,++sequence,tick,'benchmark');state.net={inputTick:tick};packets.push({at:tick+12,state});}
    while(packets[0]?.at<=tick)replica.receive(packets.shift().state,now);
    replica.sample(now,C.step,1);
  }
  runs.push(performance.now()-start);allocations.push(arrays.size);
}
const result={stepsPerRun:5000,runsMs:runs,medianMs:[...runs].sort((a,b)=>a-b)[1],predictionQuaternionArrays:allocations};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result));
