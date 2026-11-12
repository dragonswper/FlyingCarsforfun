import {NetworkRoom} from './network-room.js';
import {MATCH_QUEUE,appearance,roomOptions} from './network-protocol.js';

export const SEARCH_MS=60_000,SETUP_MS=20_000;
// One absolute search deadline survives every connection retry. A verified peer
// replaces searching with a bounded setup phase; failed setup uses the original
// remaining search time. Only one terminal result can own the game afterwards.
export class Matchmaker{
 constructor({Room=NetworkRoom,clock=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),prepare=async()=>{},queue=MATCH_QUEUE,onChange=()=>{},onMatch=()=>{},onBots=()=>{},onDisconnect=()=>{},onEvents=()=>{}}={}){
  Object.assign(this,{Room,clock,setTimer,clearTimer,prepare,queue,onChange,onMatch,onBots,onDisconnect,onEvents});this.phase='idle';this.finished=false;this.started=false;this.attempt=null;this.attempts=0;this.timers=new Set();this.reason='';this.matchedRoom=null;
 }
 state(){return {phase:this.phase,remaining:this.started?Math.max(0,Math.ceil((this.deadline-this.clock())/1000)):60,elapsed:this.started?Math.min(60,Math.max(0,(this.clock()-this.startedAt)/1000)):0,prepared:!!this.attempt?.prepared,reason:this.reason,attempts:this.attempts};}
 emit(){this.onChange(this.state());}
 later(fn,ms){let id;id=this.setTimer(()=>{this.timers.delete(id);if(!this.finished)fn();},ms);this.timers.add(id);return id;}
 clearTimers(){for(const id of this.timers)this.clearTimer(id);this.timers.clear();}
 owns(attempt){return !this.finished&&this.attempt===attempt;}
 start(look,options={}){
  if(this.started)return false;this.started=true;this.look=appearance(look);this.options={...roomOptions(options),mode:'duel',coop:false,duration:300};this.startedAt=this.clock();this.deadline=this.startedAt+SEARCH_MS;this.phase='searching';this.tick();if(!this.finished)this.connect();return true;
 }
 tick(){
  if(this.finished)return;
  if(this.attempt?.found){if(this.clock()>=this.attempt.setupDeadline){this.retry(this.attempt,'Match setup took too long. Searching again…');if(this.finished)return;}}
  else if(this.clock()>=this.deadline){this.bots('No opponent connected in 60 seconds.');return;}
  this.emit();if(!this.finished){const until=this.attempt?.found?this.attempt.setupDeadline:this.deadline;this.later(()=>this.tick(),Math.max(1,Math.min(250,until-this.clock())));}
 }
 connect(){
  if(this.finished)return;if(this.clock()>=this.deadline){this.bots('No opponent connected in 60 seconds.');return;}
  const attempt={id:++this.attempts,found:false,preparing:false,prepared:false,startRequested:false,room:null};this.attempt=attempt;this.phase='searching';
  attempt.room=new this.Room({clock:this.clock,onChange:()=>this.changed(attempt),onMatch:sim=>this.won(attempt,sim),onEvents:events=>{if(this.matchedRoom===attempt.room)this.onEvents(events,attempt.room);},onDisconnect:reason=>{if(this.matchedRoom===attempt.room)this.onDisconnect(reason,attempt.room);else this.retry(attempt,'The connection was interrupted. Still searching…');}});
  this.emit();if(!this.owns(attempt))return;
  try{attempt.room.matchmake(this.look,this.options,this.queue);}catch{this.retry(attempt,'The match service is unavailable. Still searching…');}
 }
 changed(attempt){
  if(!this.owns(attempt)||attempt.room.closed)return;const room=attempt.room;
  if(attempt.found&&this.clock()>=attempt.setupDeadline){this.retry(attempt,'Match setup took too long. Searching again…');return;}
  if(!attempt.found&&this.clock()>=this.deadline){this.bots('No opponent connected in 60 seconds.');return;}
  if(room.connected&&room.options){
   if(!attempt.found){attempt.found=true;attempt.setupDeadline=this.clock()+SETUP_MS;this.phase='preparing';this.reason='';}
   if(!attempt.preparing){
    attempt.preparing=true;this.emit();if(!this.owns(attempt))return;
    Promise.resolve().then(()=>{if(this.owns(attempt))return this.prepare(room);}).then(()=>{
     if(!this.owns(attempt)||room.closed)return;if(this.clock()>=attempt.setupDeadline){this.retry(attempt,'Match setup took too long. Searching again…');return;}attempt.prepared=true;this.emit();if(!this.owns(attempt))return;if(room.role==='guest')room.setReady(true);this.maybeStart(attempt);
    }).catch(()=>this.retry(attempt,'A vehicle could not load. Still searching…'));
   }
   this.maybeStart(attempt);
  }else this.phase=room.role!=='auto'&&room.role?'connecting':'searching';
  if(this.owns(attempt))this.emit();
 }
 maybeStart(attempt){
  if(!this.owns(attempt)||!attempt.prepared||attempt.startRequested)return;const room=attempt.room;
  if(room.role==='host'&&room.remoteReady){attempt.startRequested=true;this.phase='starting';this.emit();if(this.owns(attempt)&&!room.startMatch())this.retry(attempt,'The match could not start. Still searching…');}
 }
 retire(){const attempt=this.attempt;this.attempt=null;attempt?.room.close();}
 retry(attempt,reason){
  if(!this.owns(attempt))return;this.retire();this.reason=reason;if(this.clock()>=this.deadline){this.bots('The opponent could not finish connecting. Starting a bot match.');return;}
  this.phase='searching';this.emit();this.later(()=>this.connect(),Math.min(2000,this.deadline-this.clock()));
 }
 won(attempt,sim){
  if(this.matchedRoom===attempt.room){if(!attempt.room.closed)this.onMatch(sim,attempt.room);return;}
  if(!this.owns(attempt)||attempt.room.closed){attempt.room.close();return;}
  if(!attempt.found||this.clock()>=attempt.setupDeadline){this.retry(attempt,'Match setup took too long. Searching again…');return;}
  this.finished=true;this.phase='matched';this.matchedRoom=attempt.room;this.clearTimers();this.emit();this.onMatch(sim,attempt.room);
 }
 bots(reason){if(this.finished)return;this.finished=true;this.phase='bots';this.reason=reason;this.clearTimers();this.retire();this.emit();this.onBots({...this.options,quickplayBots:true},reason);}
 cancel(reason='Search cancelled.'){
  if(!this.started||this.finished)return false;this.finished=true;this.phase='cancelled';this.reason=reason;this.clearTimers();this.retire();this.emit();return true;
 }
}
