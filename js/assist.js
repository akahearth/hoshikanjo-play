(function(root){
 'use strict';
 const commonJS=typeof module==='object'&&module.exports;
 const AI=commonJS?require('./ai.js'):root.SeikanAI;
 const E=commonJS?require('./engine.js'):root.SeikanEngine;
 const {BY_ID}=commonJS?require('./cards.js'):root.SeikanCards;
 const {BY_POWER}=commonJS?require('./heroes.js'):root.SeikanHeroes;
 const available=s=>!!s&&s.status==='playing'&&s.active==='player'&&(!s.choice||s.choice.side==='player');
 function describe(s,action,analysis){
  if(!available(s)||!action||action.actor!=='player'||E.validate(s,action)!==null)return null;
  const markers=[],add=(kind,id,role,label)=>markers.push({kind,id,role,label});
  const entity=id=>id==='hero'||id==='cpu-hero'?'相手ヒーロー':id==='player-hero'?'自分のヒーロー':BY_ID[[...s.player.board,...s.cpu.board].find(u=>u.uid===id)?.cardId]?.name||'対象';
  let title,instruction;
  if(action.type==='choose'){
   const card=BY_ID[s.choice.options.find(c=>c.uid===action.choice).cardId];title=`「${card.name}」を発見`;instruction='①金枠の候補を選ぶ';add('choice',action.choice,'source','① 選ぶ');
  }else if(action.type==='play'){
   const card=BY_ID[s.player.hand.find(c=>c.uid===action.card).cardId];title=`「${card.name}」を${card.type==='unit'?'召喚':card.type==='weapon'?'装備':'使用'}`;instruction='①金枠の手札を選ぶ';add('card',action.card,'source','① 使う');
  }else if(action.type==='attack'){
   title=`「${entity(action.attacker)}」で攻撃`;instruction='①金枠のユニットを選ぶ';add('unit',action.attacker,'source','① 攻撃');
  }else if(action.type==='weaponAttack'){
   title=`「${BY_ID[s.player.weapon.cardId].name}」で攻撃`;instruction='①金枠の「武器で攻撃」を押す';add('control','weapon-attack','source','① 攻撃');
  }else if(action.type==='power'){
   title=`「${BY_POWER[s.player.heroPower].name}」を使用`;instruction='①金枠のヒーローパワーを押す';add('control','hero-power','source','① 使う');
  }else if(action.type==='end'){
   title='ターンを終了';instruction='金枠の「ターン終了」を押す';for(const id of ['end-turn','touch-end-turn'])add('control',id,'source','推奨');
  }else return null;
  if(action.target){const id=action.target==='hero'?'cpu-hero':action.target;title+=` → ${entity(action.target)}`;instruction+=' → ②青枠の対象を選ぶ';add(id.endsWith('-hero')?'control':'unit',id==='cpu-hero'?'enemy-hero':id,'target','② 対象');}
  const winning=!!analysis?.trace?.candidates?.some(c=>c.winning&&JSON.stringify(c.action)===JSON.stringify(action));
  return {action:{...action},title,instruction,markers,winning,timeLimited:!!analysis?.timeLimited};
 }
 function createAssist({chooseAction=AI.chooseActionAsync,onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let epoch=0,timer=null,result={status:'idle'};
  const notify=()=>onChange();
  function cancel(){epoch++;if(timer!==null)clearTimer(timer);timer=null;result={status:'idle'};notify();}
  async function request(input,{isCurrent=()=>true,yieldControl}={}){
   if(!available(input))return null;
   epoch++;if(timer!==null)clearTimer(timer);const token=epoch;let analysis,requestTimer=null;
   result={status:'thinking'};notify();
   const cancelled=()=>token!==epoch||!isCurrent();
   try{
    const timeout=new Promise(resolve=>{requestTimer=setTimer(()=>resolve('timeout'),4000);timer=requestTimer;});
    const action=await Promise.race([chooseAction(input,'player',{difficulty:'expert',style:'balanced',maxThinkMs:1200,trace:true,isCancelled:cancelled,...(yieldControl?{yieldControl}:{}),onAnalysis:value=>{if(!cancelled())analysis=value;}}),timeout]);
    if(cancelled()){if(token===epoch){result={status:'idle'};notify();}return null;}
    if(action==='timeout'){epoch++;result={status:'error',message:'時間内に一手を選べませんでした。もう一度アシストを押してください。'};notify();return null;}
    const proposal=describe(input,action,analysis);
    result=proposal?{status:'ready',proposal}:{status:'idle'};notify();return proposal;
   }catch{
    if(!cancelled()){result={status:'error',message:'一手を選べませんでした。もう一度アシストを押してください。'};notify();}return null;
   }finally{if(requestTimer!==null)clearTimer(requestTimer);if(timer===requestTimer)timer=null;}
  }
  return {request,cancel,get:()=>JSON.parse(JSON.stringify(result))};
 }
 const api={available,describe,createAssist};if(commonJS)module.exports=api;else root.SeikanAssist=api;
})(typeof globalThis!=='undefined'?globalThis:this);
