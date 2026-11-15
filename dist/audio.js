import {EngineModel,normalizeEngineStyle} from './engine-model.js';
import {clamp} from './constants.js';

export class GameSound {
  constructor(preferences,state,{Context=globalThis.AudioContext||globalThis.webkitAudioContext,fetcher=globalThis.fetch?.bind(globalThis)}={}){
    this.preferences=preferences;this.state=state;this.Context=Context;this.fetcher=fetcher;this.model=new EngineModel();this.disposed=false;this.sampleState='idle';
  }
  start(){
    if(this.disposed||!this.preferences().sound||!this.Context)return;
    try{
      if(this.ctx){this.ctx.resume().catch(()=>{});return;}
      const ctx=this.ctx=new this.Context();ctx.resume().catch(()=>{});
      this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      // A soft limiter keeps layered boost/engine/impact sounds from clipping.
      this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=15;this.limiter.ratio.value=6;this.limiter.attack.value=.004;this.limiter.release.value=.16;this.limiter.connect(this.master);
      this.engineBus=ctx.createGain();this.effectsBus=ctx.createGain();this.engineBus.connect(this.limiter);this.effectsBus.connect(this.limiter);
      this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1100;
      this.sampleGain=ctx.createGain();this.sampleGain.gain.value=0;this.filter.connect(this.sampleGain);this.sampleGain.connect(this.engineBus);
      this.bass=ctx.createOscillator();this.bass.type='sine';this.bassGain=ctx.createGain();this.bassGain.gain.value=0;this.bass.connect(this.bassGain);this.bassGain.connect(this.engineBus);this.bass.start();
      this.whine=ctx.createOscillator();this.whine.type='triangle';this.whineGain=ctx.createGain();this.whineGain.gain.value=0;this.whine.connect(this.whineGain);this.whineGain.connect(this.engineBus);this.whine.start();
      const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);let seed=190;
      for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*.45;}
      this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
      this.boostFilter=ctx.createBiquadFilter();this.boostFilter.type='bandpass';this.boostFilter.frequency.value=900;this.boostFilter.Q.value=.45;
      this.boostGain=ctx.createGain();this.boostGain.gain.value=0;this.noise.connect(this.boostFilter);this.boostFilter.connect(this.boostGain);this.boostGain.connect(this.engineBus);
      this.tyreFilter=ctx.createBiquadFilter();this.tyreFilter.type='bandpass';this.tyreFilter.frequency.value=1600;this.tyreFilter.Q.value=1.6;
      this.tyreGain=ctx.createGain();this.tyreGain.gain.value=0;this.noise.connect(this.tyreFilter);this.tyreFilter.connect(this.tyreGain);this.tyreGain.connect(this.effectsBus);this.noise.start();
      this.ready=this.loadLoop();this.update();
    }catch{this.sampleState='unavailable';this.silence();}
  }
  async loadLoop(){
    this.sampleState='loading';
    try{
      const response=await this.fetcher('./assets/audio/engine-loop.wav',{cache:'force-cache'});if(!response.ok)throw Error('Engine audio unavailable');
      const data=await this.ctx.decodeAudioData(await response.arrayBuffer());if(this.disposed)return;
      const source=this.sample=this.ctx.createBufferSource();source.buffer=data;source.loop=true;source.connect(this.filter);source.start();this.sampleState='recorded';
    }catch{if(!this.disposed)this.sampleState='fallback';}
  }
  update(dt=1/60){
    const ctx=this.ctx;if(!ctx||this.disposed)return;
    const settings=this.preferences(),current=this.state(),t=ctx.currentTime,
      preview=!current.active&&t<(this.previewUntil||0),
      state=preview?{active:true,speed:Math.max(0,2.5-(this.previewUntil-t))*7,throttle:.8,grounded:true}:current,
      active=settings.sound&&state.active===true&&ctx.state==='running',
      model=this.model.update(state,dt),style=normalizeEngineStyle(settings.engineStyle),electric=style==='electric',muscle=style==='muscle',
      rpm=model.rpm/6500,load=model.load,gain=active?1:0;
    const target=(param,value,time=.045)=>param.setTargetAtTime(value,t,time);
    target(this.master.gain,settings.sound?clamp(Number(settings.volume)||0,0,100)/100:0);
    target(this.engineBus.gain,(settings.engineVolume??85)/100);target(this.effectsBus.gain,(settings.effectsVolume??80)/100);
    if(this.sample)target(this.sample.playbackRate,(muscle?.54:.72)+rpm*(muscle?1.05:1.45),.05);
    target(this.sampleGain.gain,gain*(electric?0:(.07+load*.26+rpm*.09)));
    target(this.filter.frequency,(muscle?650:1050)+rpm*1800+load*2300,.065);
    target(this.bass.frequency,(muscle?25:34)+model.rpm/(muscle?105:90));
    target(this.bassGain.gain,gain*(electric?.018:muscle?.055:.028)*(1+load*.55));
    target(this.whine.frequency,electric?180+rpm*720:90+rpm*250);
    target(this.whineGain.gain,gain*(electric?.045+load*.025:this.sampleState==='fallback'?.025:.004));
    target(this.boostGain.gain,gain*(state.boosting?.2:.006*Math.min(1,Math.abs(state.speed||0)/23)));
    target(this.boostFilter.frequency,state.boosting?1500:650);
    target(this.tyreGain.gain,gain*(state.drift&&state.grounded!==false&&Math.abs(state.speed)>5?.045:0));
  }
  preview(){this.start();if(this.ctx)this.previewUntil=this.ctx.currentTime+2.5;}
  silence(){this.previewUntil=0;if(!this.ctx)return;this.master?.gain.setTargetAtTime(0,this.ctx.currentTime,.015);}
  effect(kind){
    if(!this.preferences().sound||!this.ctx||this.ctx.state!=='running'||this.disposed)return;
    const values={hit:[140,65,.09,.055],bounce:[95,55,.06,.025],goal:[440,880,.6,.055],pad:[620,1000,.13,.025],go:[660,990,.24,.04],count:[360,360,.1,.025],demo:[70,30,.3,.07],save:[500,800,.3,.04]};
    const [from,to,duration,volume]=values[kind]||values.hit;
    try{const ctx=this.ctx,o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;o.type=kind==='demo'?'sawtooth':'sine';o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.effectsBus);o.start(t);o.stop(t+duration);o.onended=()=>{o.disconnect();g.disconnect();};}catch{}
  }
  diagnostics(){return {sample:this.sampleState,style:normalizeEngineStyle(this.preferences().engineStyle),gear:this.model.gear+1,rpm:Math.round(this.model.rpm),context:this.ctx?.state||'idle'};}
  dispose(){this.disposed=true;this.silence();for(const source of [this.sample,this.bass,this.whine,this.noise])try{source?.stop();source?.disconnect();}catch{}this.ctx?.close().catch(()=>{});}
}
