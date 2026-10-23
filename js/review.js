(function(root){
  'use strict';
  const commonJS=typeof module==='object'&&module.exports;
  const {BY_ID}=commonJS?require('./cards.js'):root.SeikanCards;
  const {BY_POWER}=commonJS?require('./heroes.js'):root.SeikanHeroes;
  const {DIFFICULTIES,STYLES}=commonJS?require('./ai.js'):root.SeikanAI;
  const {createPlayback,PACES}=commonJS?require('./playback.js'):root.SeikanPlayback;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function snapshot(state){
    const result={status:state.status,winner:state.winner,active:state.active,turn:state.turn,first:state.first,mode:state.mode,choice:state.choice?copy(state.choice):null};
    for(const side of ['player','cpu']){
      const p=state[side];result[side]={hp:p.hp,maxHp:p.maxHp,mana:p.mana,maxMana:p.maxMana,temporaryMana:p.temporaryMana,heroPower:p.heroPower,powerUsed:p.powerUsed,fatigue:p.fatigue,deckName:p.deckName,deckCount:p.deck.length,hand:copy(p.hand),board:copy(p.board),weapon:p.weapon?copy(p.weapon):null,heroAttacked:!!p.heroAttacked};
    }
    return result;
  }
  function actionName(state,action){
    if(!action)return '記録なし';
    const p=state[action.actor];
    const entity=id=>id==='hero'?'相手ヒーロー':id==='player-hero'?'下側ヒーロー':id==='cpu-hero'?'上側ヒーロー':BY_ID[[...state.player.board,...state.cpu.board].find(u=>u.uid===id)?.cardId]?.name||'対象なし';
    if(action.type==='mulligan')return `初手交換：${action.cards.length}枚`;
    if(action.type==='end')return 'ターン終了';
    if(action.type==='choose')return `発見：${BY_ID[state.choice?.options.find(c=>c.uid===action.choice)?.cardId]?.name||'候補'}`;
    if(action.type==='weaponAttack')return `武器「${BY_ID[p.weapon?.cardId]?.name}」 → ${entity(action.target)}へ攻撃`;
    if(action.type==='attack')return `${entity(action.attacker)} → ${entity(action.target)}へ攻撃`;
    if(action.type==='power')return `${BY_POWER[p.heroPower].name} → ${entity(action.target)}`;
    const card=BY_ID[p.hand.find(c=>c.uid===action.card)?.cardId];
    return `${card?.name||'カード'}${action.target?' → '+entity(action.target):''}`;
  }
  function createRecording(initial,metadata={}){
    const entries=[{state:snapshot(initial),action:null,title:'記録開始時の盤面・初手',analysis:null,changes:[]}];
    const meta=copy(metadata);
    return {
      append(before,action,result,analysis=null,description=null){
        if(!result.ok)return false;
        const changes=description?copy(description.changes):action.type==='mulligan'?['交換：'+(before[action.actor].hand.filter(c=>action.cards.includes(c.uid)).map(c=>BY_ID[c.cardId].name).join(' / ')||'なし'),'キープ：'+(before[action.actor].hand.filter(c=>!action.cards.includes(c.uid)).map(c=>BY_ID[c.cardId].name).join(' / ')||'なし')]:[];
        entries.push({state:snapshot(result.state),before:snapshot(before),action:copy(action),title:actionName(before,action),analysis:analysis?copy(analysis):null,changes});return true;
      },
      get:index=>entries[index]?copy(entries[index]):null,
      get length(){return entries.length;},
      get finished(){return entries.at(-1).state.status==='finished';},
      get metadata(){return copy(meta);}
    };
  }
  function thought(state,analysis){
    if(!analysis?.trace)return {headline:'CPUの評価記録はありません',details:'人の操作、初手交換、または行動上限によるターン終了です。',rows:[]};
    const t=analysis.trace,method=t.method;
    const headline=t.ordering?'予定ユニットのマナを残して、先にドローします':method==='lethal'||t.candidates.some(c=>c.winning)?'探索した手順に確定勝利が見つかりました':method==='discover'?'発見の候補を比較しました':method==='immediate'?'現在の一手の結果を比較しました':'連続する行動と、公開盤面からの反撃を比較しました';
    const rows=t.candidates.slice().sort((a,b)=>b.score-a.score).map(c=>({label:actionName(state,c.action),score:c.score,positionScore:c.positionScore,depth:c.depth||1,chosen:JSON.stringify(c.action)===JSON.stringify(analysis.action),winning:!!c.winning}));
    if(t.ordering&&!rows.some(r=>r.chosen))rows.unshift({label:actionName(state,analysis.action),score:null,chosen:true,depth:1});
    const visible=rows.slice(0,12),chosen=rows.find(r=>r.chosen);if(chosen&&!visible.some(r=>r.chosen))visible.splice(11,1,chosen);
    return {headline,details:`${DIFFICULTIES[analysis.difficulty].name}・${STYLES[analysis.style].name} / 探索 ${analysis.nodes}局面${Number.isFinite(t.baseline)?' / 行動前の評価 '+t.baseline.toFixed(2):''}。評価は選ぶ側から見て大きいほど有利。勝率ではありません。`,rows:visible};
  }
  function renderThought(document,container,state,analysis){
    const info=thought(state,analysis);container.replaceChildren();
    const title=document.createElement('strong');title.textContent=info.headline;container.append(title);
    const detail=document.createElement('p');detail.textContent=info.details;container.append(detail);
    if(analysis?.trace?.ordering){const o=analysis.trace.ordering,note=document.createElement('p');note.textContent=`先に${actionName(state,analysis.action)}。予定：${actionName(state,o.reserved)}（${o.reservedCost}マナ）。ドローに${o.drawCost}マナ使っても召喚分を残せるため、引いた後に選び直します。これは点数とは別の順序方針です。`;container.append(note);}
    if(analysis?.trace){const basis=document.createElement('p');basis.textContent=analysis.trace.method==='discover'?'発見はカードの能力・コスト、今使えるマナ、公開された敵の盤面を基準に採点します。':'盤面の攻撃力・HP・特性・死亡時能力、双方の体力、手札枚数と残りマナを採点します。標準・上級は公開打点による敗北の危険も減点します。';container.append(basis);}
    const list=document.createElement('ol');
    for(const row of info.rows){const item=document.createElement('li');item.textContent=`${row.chosen?'✓ 選択：':''}${row.label} / ${row.score===null?'ドロー順序を優先（未採点）':`${Number.isFinite(row.positionScore)?'手順後 '+row.positionScore.toFixed(2)+' → 反撃込み ': '評価 '}${row.score.toFixed(2)}`}${row.winning?'（確定勝利）':''}${analysis.trace.method==='reply'?` / 手順深さ ${row.depth}`:''}`;if(row.chosen)item.className='thought-chosen';list.append(item);}container.append(list);
    const note=document.createElement('small');note.textContent='相手の非公開手札・山札順・未来の発見候補は参照しません。候補は探索できた一部です。反撃比較の行は、手順を終えた後の評価で、同じ最初の行動が複数並ぶ場合があります。';container.append(note);
  }
  function createViewer({document,cardMarkup,illustration}){
    const $=id=>document.getElementById(id),clock=createPlayback();let recording=null,index=0,epoch=0,auto=false,phase='after';
    const names=()=>recording.metadata.spectator?{player:'CPU A（下）',cpu:'CPU B（上）'}:{player:'あなた（下）',cpu:'CPU（上）'};
    function stop(){auto=false;epoch++;clock.cancel();$('review-auto').textContent='自動再生 ▶';}
    function draw(){
      if(!recording)return;const entry=recording.get(index),state=phase==='before'&&entry.before?entry.before:entry.state,labels=names();
      $('review-position').textContent=`${index} / ${recording.length-1}手 · ${entry.title}`;
      $('review-slider').max=String(recording.length-1);$('review-slider').value=String(index);
      $('review-prev').disabled=index===0;$('review-next').disabled=index===recording.length-1;
      $('review-turn').textContent=`第${state.turn}ターン / ${labels[state.active]} / ${phase==='before'?'行動前':'行動後'}`;
      $('review-board').replaceChildren();
      for(const side of ['cpu','player']){
        const owner=state[side],section=document.createElement('section'),title=document.createElement('h3');title.textContent=`${labels[side]} · HP ${Math.max(0,owner.hp)} / マナ ${owner.mana}/${owner.maxMana}${owner.temporaryMana?'（一時'+owner.temporaryMana+'）':''} / 山札 ${owner.deckCount}枚`;section.append(title);
        const power=document.createElement('p');power.textContent=`${owner.deckName} / ${BY_POWER[owner.heroPower].name}：${owner.powerUsed?'使用済み':'未使用'} / 疲労 ${owner.fatigue||0}`;section.append(power);
        if(owner.weapon){const w=document.createElement('p');w.textContent=`武器：${BY_ID[owner.weapon.cardId].name} / 攻撃${owner.weapon.attack} / 耐久${owner.weapon.durability} / ${owner.heroAttacked?'攻撃済み':'攻撃権あり'}`;section.append(w);}
        if(state.choice?.side===side){const choice=document.createElement('p');choice.textContent='発見候補：'+state.choice.options.map(c=>BY_ID[c.cardId].name).join(' / ');section.append(choice);}
        const field=document.createElement('div');field.className='review-field';
        for(const unit of owner.board){const box=document.createElement('div');box.className='review-unit';box.innerHTML=illustration(BY_ID[unit.cardId],`review-${side}-${unit.uid}`);const text=document.createElement('span');text.textContent=`${BY_ID[unit.cardId].name} ${unit.attack}/${unit.hp}（最大${unit.maxHp}） ${unit.shield?'◎星護あり ':unit.shieldBroken?'星護消失 ':''}${(unit.keywords||[]).filter(k=>k!=='aegis').map(k=>({taunt:'挑発',swift:'速攻',poison:'毒'})[k]).join('・')} ${unit.ready?'攻撃権あり':'攻撃済み／召喚酔い'}`;box.append(text);const ability=document.createElement('small');ability.textContent=unit.silenced?'沈黙：元の能力は発動しません':BY_ID[unit.cardId].description;box.append(ability);field.append(box);}
        if(!owner.board.length)field.textContent='ユニットなし';section.append(field);
        const hand=document.createElement('div');hand.className='review-hand';hand.innerHTML=owner.hand.map(c=>cardMarkup(BY_ID[c.cardId],`review-${c.uid}`,'review')).join('');section.append(hand);$('review-board').append(section);
      }
      $('review-changes').replaceChildren();for(const change of entry.changes){const item=document.createElement('li');item.textContent=change;$('review-changes').append(item);}
      renderThought(document,$('review-thought'),entry.before||entry.state,entry.analysis);
      $('review-actor').textContent=entry.action?`${labels[entry.action.actor]}の行動`:'初期状態';
    }
    async function play(){if(auto){stop();return;}if(index>=recording.length-1)index=0;auto=true;const token=++epoch;$('review-auto').textContent='自動再生を停止 Ⅱ';draw();while(auto&&token===epoch){const pace=PACES[$('review-speed').value]||PACES.slow;if(!await clock.wait(pace.result+pace.preview)||token!==epoch)return;if(index>=recording.length-1){stop();return;}index++;draw();if(index===recording.length-1){stop();return;}}}
    $('review-prev').addEventListener('click',()=>{stop();index=Math.max(0,index-1);draw();});$('review-next').addEventListener('click',()=>{stop();index=Math.min(recording.length-1,index+1);draw();});
    $('review-slider').addEventListener('input',()=>{stop();index=Math.max(0,Math.min(recording.length-1,Number($('review-slider').value)||0));draw();});
    $('review-phase').addEventListener('change',()=>{phase=$('review-phase').value==='before'?'before':'after';draw();});
    $('review-auto').addEventListener('click',()=>{if(recording)void play();});$('review-dialog').addEventListener('close',stop);
    return {open(value){if(!value?.finished)return false;stop();recording=value;index=0;phase='after';$('review-phase').value=phase;draw();$('review-dialog').showModal();return true;},close(){stop();if($('review-dialog').open)$('review-dialog').close();}};
  }
  const api={snapshot,actionName,createRecording,thought,renderThought,createViewer};if(commonJS)module.exports=api;else root.SeikanReview=api;
})(typeof globalThis!=='undefined'?globalThis:this);
