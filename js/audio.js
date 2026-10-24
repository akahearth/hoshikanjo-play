(function(root){
  'use strict';
  const STORAGE_KEY='seikan-audio-v1';
  const DEFAULTS=Object.freeze({master:70,effects:65,music:25,muted:false});
  const TRACKS=Object.freeze({menu:'星待ちの小節',battle:'手合わせの拍子'});
  function normalize(value){
    const next={...DEFAULTS};
    for(const key of ['master','effects','music'])if(typeof value?.[key]==='number'&&Number.isFinite(value[key]))next[key]=Math.round(Math.max(0,Math.min(100,value[key])));
    if(typeof value?.muted==='boolean')next.muted=value.muted;
    return next;
  }
  // このゲーム専用の16小節。音源ファイル・外部サービスを使わず合成する。
  const CHORDS=[[50,53,57],[46,50,53],[53,57,60],[48,52,55],[50,53,57],[43,46,50],[46,50,53],[45,49,52],[50,53,57],[53,57,60],[46,50,53],[48,52,55],[43,46,50],[46,50,53],[45,49,52],[50,53,57]];
  const MELODY={
    menu:[[74,null,77,81,79,null,77,72],[70,null,74,77,null,74,72,null],[77,81,null,84,81,79,null,77],[76,null,79,72,74,null,76,null],[77,74,null,69,72,null,74,77],[70,null,74,79,77,74,null,70],[74,77,null,70,72,null,74,null],[73,null,76,69,73,76,null,81]],
    battle:[[74,77,null,81,86,null,81,77],[77,null,74,70,74,77,null,81],[81,84,81,null,77,79,81,null],[79,null,76,72,76,null,79,84],[86,81,77,null,74,77,81,null],[79,74,null,70,74,77,null,79],[82,null,77,74,77,null,70,74],[81,76,null,73,69,73,76,null]]
  };
  const CUES=Object.freeze({
    summon:[57,64,69],spell:[81,74,86],attack:[48,40,33],equip:[62,69,74],turn:[69,76],discover:[74,81,86,89],
    heal:[65,69,74],shield:[86,93],power:[57,69,76,81],transform:[81,78,86,74],draw:[79,86],pick:[72,79],
    victory:[62,66,69,74,81],defeat:[62,58,53,50],drawGame:[62,67,69,62]
  });
  function cuesFor(description,effects=[]){
    let cue=description.kind;
    if(cue==='power')cue=description.powerEffect?.kind==='heal'?'heal':description.powerEffect?.kind==='shield'?'shield':'power';
    if(effects.some(e=>['transform','mutate'].includes(e.type)))cue='transform';
    const cues=CUES[cue]?[cue]:[];
    if(effects.some(e=>e.type==='damage'&&e.blocked)&&cue!=='shield')cues.push('shield');
    return cues;
  }
  function createAudio(options={}){
    const win=options.window||root,AudioCtor=win.AudioContext||win.webkitAudioContext;
    let storage=options.storage;
    if(storage===undefined)try{storage=win.localStorage;}catch{/* 保存不可でも音を使える。 */}
    let settings={...DEFAULTS};try{settings=normalize(JSON.parse(storage?.getItem(STORAGE_KEY)));}catch{/* 不正な保存値は初期値。 */}
    let context=null,master=null,effectsBus=null,musicBus=null,scene='menu',hidden=false,consented=false,failed=false,initialized=false,disposed=false;
    let musicTimer=null,step=0,nextTime=0,resuming=null;
    const voices=new Set(),schedule=options.setInterval||win.setInterval?.bind(win),unschedule=options.clearInterval||win.clearInterval?.bind(win);
    const status=()=>({available:Boolean(AudioCtor)&&!failed&&!disposed,running:context?.state==='running'&&!hidden&&!failed&&!disposed,hidden,scene,track:TRACKS[scene],...settings});
    const notify=()=>options.onChange?.(status());
    function stopVoices(channel){
      for(const voice of [...voices])if(!channel||voice.channel===channel){try{voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}catch{/* 終了済みの音は無視。 */}voices.delete(voice);}
    }
    function stopMusic(){if(musicTimer!==null){unschedule?.(musicTimer);musicTimer=null;}stopVoices('music');}
    const audible=channel=>context?.state==='running'&&!hidden&&!failed&&!disposed&&!settings.muted&&settings.master>0&&settings[channel]>0;
    function applyVolumes(){
      if(!context||!master||!effectsBus||!musicBus)return;
      for(const [node,value]of [[master,settings.muted||hidden?0:settings.master/100],[effectsBus,settings.effects/100],[musicBus,settings.music/100]]){
        node.gain.cancelScheduledValues(context.currentTime);node.gain.setTargetAtTime(value,context.currentTime,.015);
      }
    }
    function tone(midi,when,duration,volume,channel,type='sine'){
      if(!audible(channel)||voices.size>=32)return;
      try{
      const osc=context.createOscillator(),gain=context.createGain(),start=Math.max(context.currentTime,when);
      osc.type=type;osc.frequency.setValueAtTime(440*2**((midi-69)/12),start);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(gain);gain.connect(channel==='music'?musicBus:effectsBus);
      const voice={osc,gain,channel};voices.add(voice);osc.onended=()=>{osc.disconnect();gain.disconnect();voices.delete(voice);};osc.start(start);osc.stop(start+duration+.01);
      }catch{failed=true;stopMusic();stopVoices();notify();}
    }
    function tick(){
      if(!audible('music')){stopMusic();return;}
      const beat=60/(scene==='battle'?96:76)/2,now=context.currentTime;
      // タブ停止などで時計が飛んでも、過去の音をまとめて鳴らさない。
      if(nextTime<now-.1){step+=Math.floor((now-nextTime)/beat);nextTime=now+.04;}
      for(let guard=0;nextTime<now+.18&&guard<8;guard++,step++,nextTime+=beat){
        const bar=Math.floor(step/8)%16,index=step%8,chord=CHORDS[bar],melody=MELODY[scene][bar%8][index];
        if(index===0){tone(chord[0]-12,nextTime,beat*6,.09,'music','triangle');for(const note of chord)tone(note,nextTime,beat*6.5,.035,'music');}
        if(index%2===0)tone(chord[(index/2+bar)%3]+12,nextTime,beat*1.7,.065,'music');
        if(melody!==null)tone(melody+(bar>=8&&index===7?12:0),nextTime,beat*1.7,.095,'music');
      }
    }
    function startMusic(){if(musicTimer!==null||!audible('music')||!schedule)return;nextTime=context.currentTime+.04;step=0;tick();if(audible('music'))musicTimer=schedule(tick,100);}
    async function unlock(){
      consented=true;if(!AudioCtor||failed||hidden||disposed)return false;
      try{
        if(!context){
          context=new AudioCtor();master=context.createGain();effectsBus=context.createGain();musicBus=context.createGain();effectsBus.connect(master);musicBus.connect(master);
          if(context.createDynamicsCompressor){const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=12;master.connect(limiter);limiter.connect(context.destination);}else master.connect(context.destination);
          context.onstatechange=()=>{if(context.state==='running'&&!hidden)startMusic();else{stopMusic();stopVoices();}notify();};
          applyVolumes();
          initialized=true;
        }
        if(context.state!=='running'){
          if(!resuming)resuming=Promise.resolve(context.resume()).finally(()=>{resuming=null;});
          await resuming;
        }
        if(context.state==='running'&&!hidden)startMusic();notify();return status().running;
      }catch{if(!initialized)failed=true;notify();return false;}
    }
    function setSettings(patch){settings=normalize({...settings,...patch});try{storage?.setItem(STORAGE_KEY,JSON.stringify(settings));}catch{/* 今回の操作には反映する。 */}
      applyVolumes();if(!audible('effects'))stopVoices('effects');if(audible('music'))startMusic();else stopMusic();notify();return {...settings};}
    function reset(nextScene='menu'){scene=Object.hasOwn(TRACKS,nextScene)?nextScene:'menu';stopMusic();stopVoices();startMusic();notify();}
    function play(cue,delay=0){
      if(!CUES[cue]||!audible('effects'))return false;
      const notes=CUES[cue],spacing=['victory','defeat','drawGame'].includes(cue) ? .14 : cue==='attack' ? .035 : .065;
      notes.forEach((note,i)=>tone(note,context.currentTime+Math.max(0,delay)+i*spacing,cue==='attack'?.12:.3,cue==='attack'?.15:.105,'effects',['attack','equip','summon'].includes(cue)?'triangle':'sine'));
      return true;
    }
    function setHidden(value){hidden=Boolean(value);applyVolumes();if(hidden){stopMusic();stopVoices();try{Promise.resolve(context?.suspend()).catch(()=>{});}catch{/* 音声APIの失敗で対戦を止めない。 */}}else if(consented)void unlock();notify();}
    return {getSettings:()=>({...settings}),status,unlock,setSettings,reset,setHidden,play,
      playAction(description,effects){cuesFor(description,effects).forEach((cue,i)=>play(cue,i*.09));},
      dispose(){disposed=true;stopMusic();stopVoices();try{Promise.resolve(context?.close()).catch(()=>{});}catch{}context=null;}
    };
  }
  const api={STORAGE_KEY,DEFAULTS,TRACKS,normalize,cuesFor,createAudio};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SeikanAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);
