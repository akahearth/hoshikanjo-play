(function (root) {
  'use strict';
  function createEditor({ cardMarkup, onStart, onConstructed, onOpen, onClose, style }) {
    const $=id=>document.getElementById(id);
    const { DECK_SIZE, manaCurve, createDraft, pick, chooseCpu, viewDraft, choicesFor }=root.SeikanArena;
    const { BY_ID }=root.SeikanCards;
    const { BY_HERO, BY_POWER }=root.SeikanHeroes;
    const playback=root.SeikanPlayback.createPlayback();
    let draft=null, busy=false, cpuChoosing=false, epoch=0, announcement='', previewOffers=null, pendingDraft=null;
    const who=side=>side==='player'?'あなた':'CPU';
    const name=(phase,id)=>phase==='heroes'?BY_HERO[id].name:BY_ID[id].name;
    function render() {
      const heroes=draft.phase==='heroes', complete=draft.phase==='complete', cpuBatch=!heroes&&!complete&&draft.active==='cpu';
      const visible=viewDraft(draft);
      $('draft-step').textContent=complete?`${DECK_SIZE} / ${DECK_SIZE} · 完成`:heroes?'HERO PICK':cpuBatch?'CPU · DECK PICK':`${draft.round+1} / ${DECK_SIZE} · RANDOM PICK`;
      $('draft-title').textContent=complete?'二十二枚、ひとつも手抜きなし。':heroes?'相棒のヒーロー、星いのは誰？':cpuBatch?'CPUも、二十二枚をひと勘定。':'自分だけの三択、手の内は内緒。';
      $('draft-priority').textContent=complete?'22枚完成。CPUの獲得カードは非公開。対戦の先攻・後攻は開始時に抽選します。':heroes?`この回は${who(draft.priority)}が先にヒーローを選択。いまは${who(draft.active)}の選択順です。`:cpuBatch?'CPUが非公開の候補から22枚をまとめて選んでいます。約2秒で完了します。':'あなたの非公開3候補から1枚ずつ、22枚続けて選んでください。';
      $('draft-status').textContent=announcement;
      $('draft-offers').innerHTML=(previewOffers || visible.offers).map(choice=>{
        const hero=BY_HERO[choice.id];
        const content=heroes?`<span class="hero-pick-art">${root.SeikanArt.illustration(BY_POWER[hero.power],choice.uid)}</span><strong>${hero.name}</strong><p>${hero.description}</p><small>HP30 · ${BY_POWER[hero.power].name} / 2マナ</small>`:cardMarkup(BY_ID[choice.id],choice.uid,'draft');
        // カードは既存のbuttonを使い、ヒーローだけ独自buttonにする（入れ子禁止）。
        return heroes?`<button class="hero-pick" data-draft-pick="${choice.uid}" ${busy||draft.active!=='player'?'disabled':''}>${content}</button>`:content.replace('<button ',`<button data-draft-pick="${choice.uid}" ${busy||draft.active!=='player'?'disabled':''} `);
      }).join('');
      $('draft-offers').hidden=complete||cpuBatch;
      $('draft-status').setAttribute('aria-busy',String(cpuChoosing));
      $('draft-start').hidden=!complete; $('draft-start').disabled=!complete||busy;
      const acquired=viewDraft(pendingDraft||draft);
      for (const side of ['player']) {
        const owner=acquired[side];
        $('draft-'+side+'-hero').textContent=owner.hero?`${BY_HERO[owner.hero].name} · ${BY_POWER[BY_HERO[owner.hero].power].name}`:'ヒーロー未選択';
        $('draft-'+side+'-count').textContent=`${owner.cards.length} / ${DECK_SIZE}`;
        const curve=manaCurve(owner.cards), max=Math.max(1,...curve.map(bin=>bin.count));
        const chart=$(side==='player'?'draft-curve':'draft-cpu-curve');
        chart.innerHTML=curve.map(({cost,count})=>`<span data-cost="${cost}" data-count="${count}" title="${cost}マナ：${count}枚"><b>${count}</b><i style="height:${count/max*48}px"></i><small>${cost}</small></span>`).join('');
        chart.setAttribute('aria-label',`${who(side)}の獲得マナカーブ。${curve.map(bin=>`${bin.cost}マナ${bin.count}枚`).join('、')}`);
        const units=owner.cards.filter(id=>BY_ID[id].type==='unit').length;
        $('draft-'+side+'-stats').textContent=`ユニット ${units} · 呪文 ${owner.cards.filter(id=>BY_ID[id].type==='spell').length} · 武器 ${owner.cards.filter(id=>BY_ID[id].type==='weapon').length} · 平均マナ ${owner.cards.length?(owner.cards.reduce((sum,id)=>sum+BY_ID[id].cost,0)/owner.cards.length).toFixed(1):'—'}`;
        const counts=new Map(); for(const id of owner.cards)counts.set(id,(counts.get(id)||0)+1);
        $('draft-'+side+'-cards').innerHTML=[...counts].sort((a,b)=>BY_ID[a[0]].cost-BY_ID[b[0]].cost).map(([id,count])=>`<li><span>${BY_ID[id].cost} · ${BY_ID[id].name}</span><strong>×${count}</strong></li>`).join('');
      }
      $('draft-cpu-count').textContent=`${acquired.cpu.count} / ${DECK_SIZE}`;
      $('draft-cpu-hero').textContent=acquired.cpu.hero?`${BY_HERO[acquired.cpu.hero].name} · ${BY_POWER[BY_HERO[acquired.cpu.hero].power].name}`:'ヒーロー未選択';
      for(const id of ['draft-cpu-curve','draft-cpu-stats','draft-cpu-cards']){$(id).replaceChildren();$(id).hidden=true;}
      $('draft-history').innerHTML=acquired.history.slice(-6).reverse().map(item=>`<li>${item.phase==='heroes'?'ヒーロー':`${item.round+1}回目`}：${who(item.actor)} → ${name(item.phase,item.id)}</li>`).join('');
    }
    async function take(actor,uid) {
      if(busy)return;
      const phase=draft.phase, round=draft.round;
      const result=pick(draft,actor,uid);
      if(!result.ok){announcement=result.message;render();return;}
      const token=epoch;
      announcement=`${who(actor)}が「${name(phase,result.choice.id)}」を獲得。${phase==='heroes'?'':`${round+1}回目のピック。`}`;
      if(phase==='cards') {
        // 次の三択へすぐ進める。CPUの待ち時間は22枚を選んだ後の1回だけ。
        draft=result.state;render();void runCpu(token);return;
      }
      busy=true;cpuChoosing=false;
      // 取得直後は元の候補を残し、結果を読んでから次の選択へ進める。
      pendingDraft=result.state;previewOffers=choicesFor(draft,'player').filter(item=>item.uid!==uid); render();
      if(!await playback.wait(1600)||token!==epoch)return;
      draft=result.state;pendingDraft=null;previewOffers=null;busy=false;render();void runCpu(token);
    }
    async function runCpu(token=epoch) {
      if(busy||draft.active!=='cpu'||draft.phase==='complete')return;
      busy=true;cpuChoosing=true;render();
      if(draft.phase==='cards') {
        announcement='あなたの22枚が完成。CPUがデッキを組んでいます（獲得カードは非公開）。';render();
        if(!await playback.wait(2000)||token!==epoch)return;
        while(draft.phase==='cards'&&draft.active==='cpu') {
          const result=pick(draft,'cpu',chooseCpu(draft,style()));
          if(!result.ok)throw Error(result.message);
          draft=result.state;
        }
        busy=false;cpuChoosing=false;announcement='双方の22枚が完成しました。CPUの獲得カードは非公開です。';render();return;
      }
      if(!await playback.wait(1300)||token!==epoch)return;
      const choice=chooseCpu(draft,style());busy=false;
      if(choice)void take('cpu',choice);
    }
    function restart() {
      playback.cancel();playback.resume();epoch++;busy=false;cpuChoosing=false;pendingDraft=null;previewOffers=null;draft=createDraft();announcement='ヒーローは共有候補から。あなたが22枚続けて選んだ後、CPUがまとめて選びます。時間制限はありません。';render();void runCpu();
    }
    $('draft-offers').addEventListener('click',event=>{
      const choice=event.target.closest('[data-draft-pick]');
      if(choice&&!busy&&draft.active==='player')void take('player',choice.dataset.draftPick);
    });
    $('draft-restart').addEventListener('click',restart);
    $('draft-start').addEventListener('click',()=>{if(draft?.phase==='complete'&&!busy)onStart(JSON.parse(JSON.stringify(draft)));});
    $('draft-constructed').addEventListener('click',onConstructed);
    $('arena-dialog').addEventListener('close',()=>{playback.pause();onClose();});
    return { open() { onOpen();$('arena-dialog').showModal();if(!draft)restart();else {playback.resume();render();} } };
  }
  root.SeikanArenaEditor={createEditor};
})(typeof globalThis!=='undefined'?globalThis:this);
