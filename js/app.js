(function () {
  'use strict';
  const { CARDS, BY_ID, KEYWORDS } = SeikanCards;
  const { BY_POWER, BY_HERO } = SeikanHeroes;
  const { unitTraits } = SeikanTraits;
  const { createGame, applyAction, legalActions, canPlayCard, cardTargets, attackTargets, canUsePower, powerTargets, mulliganCards, canWeaponAttack } = SeikanEngine;
  const { chooseActionAsync, DIFFICULTIES, STYLES, normalizeOptions } = SeikanAI;
  const { illustration, portrait } = SeikanArt;
  const { PACES, DEFAULT_PACE, resultDuration, createPlayback, describeAction } = SeikanPlayback;
  const { createRecording, renderThought, createViewer } = SeikanReview;
  const $ = id => document.getElementById(id);
  const sound = SeikanAudio.createAudio({window,onChange:renderAudioSettings});
  let audioPausedCpu=false;
  function renderAudioSettings(){
    const s=sound.status();
    for(const key of ['master','effects','music']){$('audio-'+key).value=String(s[key]);$('audio-'+key+'-value').textContent=s[key]+'%';}
    $('audio-mute').setAttribute('aria-pressed',String(s.muted));$('audio-mute').textContent=s.muted?'消音を解除':'すべて消音';
    $('audio-enable').hidden=!s.available||s.running;
    $('audio-test').disabled=!s.available||s.muted||s.master===0||s.effects===0;
    $('audio-status').textContent=!s.available?'このブラウザでは音声を再生できません。音なしでプレイできます。':s.muted?'すべて消音中です。':s.master===0?'全体音量が0%です。':!s.running?'「音を有効にする」または画面操作で再生できます。':s.music===0?'BGMの音量は0%です。':`BGM：${s.track} · 再生中`;
  }
  let state;
  let atStart=true,menuWasPaused=false;
  let recording=null;
  let spectator=false;
  let watchPausedCpu=false;
  let watchOpening=false;
  let watchConfig=null;
  let selected = null;
  let inspecting = false;
  let pendingCard = null;
  let pendingPower = false;
  let currentDeck;
  let editorPausedCpu = false;
  let settingsPausedCpu = false;
  let arenaPausedCpu = false;
  let arenaMatch = null;
  let resettingMatch = false;
  const openingSelection = new Set();
  const playback = createPlayback();
  let busy = false;
  let activeActor = null;
  let currentDescription = null;
  let cpuRunning = false;
  let cpuThinking = false;
  let matchCpu = { difficulty: 'normal', style: 'balanced' };
  let cpuPreference = { difficulty: 'normal', style: 'balanced' };
  try {
    const saved = JSON.parse(localStorage.getItem('seikan-cpu-settings-v1'));
    const safe = normalizeOptions(saved);
    cpuPreference = { ...safe, style: saved?.style === 'auto' ? 'auto' : safe.style };
  } catch { /* 保存不可でも初期設定で対戦できる。 */ }
  let paceKey = DEFAULT_PACE;
  try { const saved = localStorage.getItem('seikan-playback-speed'); if (PACES[saved]) paceKey = saved; } catch { /* 保存不可でもプレイ可能。 */ }
  let gameEpoch = 0;
  let cpuSteps = 0;
  let resultShown = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const powerEffects = SeikanPowerEffects.createPowerEffects({ document, window, resolveElement:entityElement, reducedMotion });
  const automated = () => !atStart&&(spectator || state?.active==='cpu');
  const displayText = text => spectator ? text.replaceAll('あなた','CPU A').replaceAll('星よみ経理','CPU B') : text;
  const playerTurn = () => !atStart && !spectator && state?.active === 'player' && state.status === 'playing' && !state.choice && !busy;
  const pace = () => PACES[paceKey];
  function isTarget(id) {
    if (!playerTurn()) return false;
    if (pendingPower) return powerTargets(state, 'player').includes(id);
    if (pendingCard) {
      const card = state.player.hand.find(item => item.uid === pendingCard);
      return Boolean(card && cardTargets(state, 'player', card.cardId).includes(id));
    }
    return Boolean(selected && attackTargets(state, 'player').includes(id === 'cpu-hero' ? 'hero' : id));
  }
  function badges(unit) {
    const traits = unitTraits(unit);
    return traits.active.filter(key => key !== 'aegis').map(key =>
      `<span class="ability-badge ability-${key}" title="${KEYWORDS[key].name}：${KEYWORDS[key].description}">${KEYWORDS[key].name}</span>`).join('') + (traits.classes.includes('trait-death') ? '<span class="ability-badge ability-death">死亡時</span>' : '')+(unit.silenced?'<span class="ability-badge ability-silence">沈黙</span>':'');
  }
  function cardMarkup(card, uid, mode = 'hand') {
    const reason = mode === 'hand' ? (inspecting ? null : spectator ? 'CPUが操作しています。' : busy ? '行動の表示が終わるまでお待ちください。' : canPlayCard(state, 'player', uid)) : null;
    const classes = mode === 'hand' ? (inspecting ? 'inspectable' : reason ? 'unavailable' : 'playable') : '';
    const spell = card.type === 'spell', weapon=card.type==='weapon', unique=card.rarity==='unique';
    const stats = weapon ? `<span class="stat attack-stat">${card.attack}</span><span class="stat health-stat durability-stat">${card.durability}</span><span class="weapon-seal">⚒ 武器</span>` : spell ? '<span class="spell-seal">✧ 呪文</span>' : `<span class="stat attack-stat">${card.attack}</span><span class="stat health-stat">${card.health}</span>`;
    const hint = mode==='hand'&&inspecting ? 'クリックで詳細（カードは使いません）' : weapon ? 'クリックで装備' : spell ? (card.target ? 'クリックで対象を選択' : 'クリックで使用') : 'クリックで召喚';
    const description = `${card.name}、${card.cost}マナ、${weapon ? `武器、攻撃力${card.attack}、耐久${card.durability}` : spell ? '呪文' : `攻撃力${card.attack}、HP${card.health}`}${unique?'、逸品・構築は同名1枚':''}。${card.description}`;
    return `<button class="card ${card.expansion?'expansion-card':''} ${classes} ${spell ? 'spell-card' : ''} ${weapon?'weapon-card':''} ${unique?'unique-card':''} skin-${card.tribe==='火の車団'?'ember':card.tribe==='月払い組'?'moon':card.tribe==='芽でたい森'?'grove':'star'} ${pendingCard === uid ? 'chosen-card' : ''}" data-card="${uid}" data-card-id="${card.id}" data-card-type="${card.type}" aria-label="${description}${reason ? reason : ''}" ${mode === 'hand' ? `aria-disabled="${Boolean(reason)}" aria-pressed="${pendingCard === uid}"` : ''} title="${mode === 'hand' ? (reason || hint + '。右クリックで詳細') : mode === 'opening' ? 'クリックで交換を選択・解除' : mode === 'draft' ? 'クリックでこのカードを獲得' : 'クリックで詳細'}"><span class="mana-cost">${card.cost}</span><span class="card-tribe">${spell ? '呪文 · ' : ''}${card.tribe}</span>${illustration(card, uid)}${unique?'<span class="rarity-label">✦ 逸品 · 構築1枚</span>':''}<span class="card-name">${card.name}</span><span class="card-description">${card.description}</span>${stats}</button>`;
  }
  function unitMarkup(unit, side) {
    const card = BY_ID[unit.cardId];
    const ready = side === 'player' && playerTurn() && unit.ready && unit.attack > 0;
    const traits = unitTraits(unit); const keywords = traits.labels.join('・');
    const shield = traits.shieldState === 'none' ? '' : `<span class="shield-label ${unit.shield ? 'ability-aegis' : ''}">${unit.shield ? '◎ 星護あり' : '星護消失'}</span>`;
    return `<button class="unit ${traits.classes.join(' ')} ${ready ? 'ready' : ''} ${selected === unit.uid ? 'selected' : ''} ${isTarget(unit.uid) ? 'targetable' : ''} ${unit.shield ? 'shielded' : ''}" data-unit="${unit.uid}" data-side="${side}" data-card-id="${card.id}" data-shield="${traits.shieldState}" aria-label="${card.name}、攻撃力${unit.attack}、HP${unit.hp}。${keywords ? keywords + '。' : ''}${ready ? '攻撃可能' : side === 'player' ? 'このターンは攻撃できません' : '敵ユニット'}" ${side === 'player' ? `aria-pressed="${selected === unit.uid}"` : ''} title="${card.name}：現在 ${keywords || '能力なし'}。${unit.silenced?'沈黙中：元の能力は発動しません。':card.description}"><span class="trait-frame" aria-hidden="true"></span>${shield}${illustration(card, `board-${unit.uid}`)}<span class="unit-name">${card.name}</span><span class="unit-abilities">${badges(unit)}</span><span class="stat attack-stat">${unit.attack}</span><span class="stat health-stat ${unit.hp < unit.maxHp ? 'damaged' : ''}">${unit.hp}</span></button>`;
  }
  function message(text, isError = false) { $('action-message').textContent = text; $('action-message').classList.toggle('error', isError); }
  function render() {
    if(!state)return;
    document.body.classList.toggle('spectating',spectator);
    $('watch-exit').hidden=!spectator;
    $('duel-mode').textContent=spectator?`◉ CPU vs CPU · ${state.mode==='arena'?'アリーナ観戦':'観戦'}`:'◉ CPU DUEL';
    $('opponent-name').textContent=spectator?'CPU B':'星よみ経理';
    $('hand-owner').textContent=spectator?'CPU A · HAND':'YOUR HAND';
    $('hand').setAttribute('aria-label',spectator?'CPU Aの手札':'あなたの手札');
    $('player-field').setAttribute('aria-label',spectator?'CPU Aのユニット':'あなたのユニット');
    $('enemy-field').setAttribute('aria-label',spectator?'CPU Bのユニット':'CPUのユニット');
    if(spectator)$('watch-match-info').textContent=['player','cpu'].map(side=>`${side==='player'?'CPU A':'CPU B'}：${DIFFICULTIES[watchConfig[side].settings.difficulty].name}・${STYLES[watchConfig[side].settings.style].name}`).join(' / ');
    $('live-thought-panel').hidden=!spectator;
    $('watch-hands-panel').hidden=!spectator;
    $('watch-cpu-hand').innerHTML=spectator?state.cpu.hand.map(c=>{const card=BY_ID[c.cardId];return `<li><strong>${card.cost}マナ · ${card.name}</strong><p>${card.description}</p></li>`;}).join(''):'';
    $('review-button').disabled=state.status!=='finished'||busy||!recording?.finished;
    for(const id of ['arena-button','deck-button','cpu-settings-button'])$(id).disabled=spectator;
    const handScroll = $('hand').scrollLeft;
    const topHandScroll=$('watch-top-hand').scrollLeft,enemyHandScroll=$('enemy-hand').scrollLeft;
    $('player-order').textContent = `${spectator?'CPU A':'YOU'} · ${state.first === 'player' ? '先攻' : '後攻'} · ${state.mode === 'arena' ? 'ARENA' : '構築戦'}`;
    $('player-hero-name').textContent = BY_HERO[state.player.heroId]?.name || '森あげ役の旅人';
    $('cpu-hero-name').textContent = BY_HERO[state.cpu.heroId]?.name || '星よみ経理';
    $('cpu-opponent-label').textContent = DIFFICULTIES[matchCpu.difficulty].name + ' · ' + STYLES[matchCpu.style].name;
    $('cpu-order').textContent = `${spectator?'CPU B':'OPPONENT'} · ${state.first === 'cpu' ? '先攻' : '後攻'}`;
    $('cpu-match-status').textContent = '対戦中：' + DIFFICULTIES[matchCpu.difficulty].name + ' / ' + STYLES[matchCpu.style].name + (cpuThinking ? ' · 思考中' : '');
    $('round-label').textContent = `ROUND ${String(Math.ceil(state.turn / 2)).padStart(2, '0')}`;
    $('enemy-hand').innerHTML = spectator?state.cpu.hand.map(c=>cardMarkup(BY_ID[c.cardId],`watch-${c.uid}`,'watch')).join(''):Array.from({ length: state.cpu.hand.length }, () => '<span class="card-back" aria-hidden="true">✧</span>').join('');
    $('enemy-hand').scrollLeft=enemyHandScroll;
    $('watch-top-hand-zone').hidden=!spectator;
    $('watch-top-hand-count').textContent=spectator?`${state.cpu.hand.length} / 10`:'';
    $('watch-top-hand').innerHTML=spectator?(state.cpu.hand.length?state.cpu.hand.map(c=>cardMarkup(BY_ID[c.cardId],`top-watch-${c.uid}`,'watch')).join(''):'<p class="hand-empty">手札はありません。</p>'):'';
    $('watch-top-hand').scrollLeft=topHandScroll;
    $('enemy-hand').setAttribute('aria-label', `CPUの手札${state.cpu.hand.length}枚`);
    $('cpu-resources').innerHTML = `<span class="resource-gem">◇</span> <strong>${state.cpu.mana} / ${state.cpu.maxMana}</strong><br>手札 <strong>${state.cpu.hand.length}</strong>　山札 <strong>${state.cpu.deck.length}</strong>`;
    const cpuPower = document.createElement('small'); cpuPower.className = 'cpu-power';
    cpuPower.textContent = `${BY_POWER[state.cpu.heroPower].name} · ${state.cpu.powerUsed ? '使用済み' : '2マナ / 1回'}`;
    cpuPower.title = `${state.cpu.deckName}：${BY_POWER[state.cpu.heroPower].description}`; $('cpu-resources').append(cpuPower);
    $('match-deck-name').textContent = state.player.deckName;
    const power = BY_POWER[state.player.heroPower]; const powerReason = canUsePower(state, 'player');
    $('power-name').textContent = power.name;
    $('power-description').textContent = power.description;
    $('power-status').textContent = pendingPower ? '光る対象を選択 · もう一度押すと解除' : state.player.powerUsed ? 'このターンは使用済み' : busy ? '行動の確認中' : powerReason || '毎ターン1回 · クリックで対象選択';
    $('hero-power').disabled = !playerTurn() || Boolean(powerReason);
    $('hero-power').classList.toggle('power-ready', playerTurn() && !powerReason);
    $('hero-power').classList.toggle('power-selected', pendingPower);
    $('hero-power').setAttribute('aria-pressed', String(pendingPower));
    for(const side of ['player','cpu']){
      const w=state[side].weapon,button=$(side==='player'?'weapon-attack':'cpu-weapon');
      button.textContent=w?`${side==='player'?'武器で攻撃':'武器'}：${BY_ID[w.cardId].name} ⚔${w.attack} / 耐久${w.durability} · ${state[side].heroAttacked?'攻撃済み':'攻撃権あり'}`:'武器なし';
      button.hidden=!w;button.dataset.cardId=w?.cardId||'';
      if(side==='player'){button.disabled=!playerTurn()||!!canWeaponAttack(state,side);button.classList.toggle('weapon-selected',selected==='player-hero');button.setAttribute('aria-pressed',String(selected==='player-hero'));}
    }
    $('cpu-hp').textContent = Math.max(0, state.cpu.hp);
    $('player-hp').textContent = Math.max(0, state.player.hp);
    $('enemy-hero').classList.toggle('targetable', isTarget('cpu-hero'));
    $('player-hero').classList.toggle('targetable', isTarget('player-hero'));
    $('enemy-hero').setAttribute('aria-label', `${$('cpu-hero-name').textContent}、HP${Math.max(0, state.cpu.hp)}。${isTarget('cpu-hero') ? '対象に選択可能' : '敵ヒーロー'}`);
    $('player-hero').setAttribute('aria-label', `${$('player-hero-name').textContent}、HP${Math.max(0, state.player.hp)}。${isTarget('player-hero') ? '回復の対象に選択可能' : '自分のヒーロー'}`);
    for (const side of ['cpu', 'player']) {
      const container = $(side === 'cpu' ? 'enemy-field' : 'player-field');
      container.innerHTML = state[side].board.map(unit => unitMarkup(unit, side)).join('') + Array.from({ length: 5 - state[side].board.length }, () => '<div class="empty-slot" aria-hidden="true">✧</div>').join('');
      if (!state[side].board.length) container.insertAdjacentHTML('beforeend', `<span class="field-empty-hint">${side === 'cpu' ? '相手の精霊が現れる場所' : '手札のカードをクリックして召喚'}</span>`);
    }
    $('mana-text').innerHTML = `${state.player.mana} <small>/ ${state.player.maxMana}${state.player.temporaryMana ? ` ＋一時${state.player.temporaryMana}` : ''}</small>`;
    $('mana-crystals').innerHTML = Array.from({ length: 10 }, (_, index) => `<i class="gem ${index < state.player.mana ? 'filled' : index < state.player.maxMana ? 'spent' : ''}" aria-hidden="true"></i>`).join('');
    $('mana-crystals').setAttribute('aria-label', `マナ${state.player.mana}、上限${state.player.maxMana}`);
    $('player-deck').innerHTML = `山札<br><strong>${state.player.deck.length}</strong> / ${SeikanDecks.DECK_SIZE}`;
    $('hand-count').textContent = `${state.player.hand.length} / 10`;
    $('hand').innerHTML = state.player.hand.length ? state.player.hand.map(item => cardMarkup(BY_ID[item.cardId], item.uid,spectator?'watch':'hand')).join('') : '<p class="hand-empty">手札がありません。次の星の巡りを待とう。</p>';
    $('hand').scrollLeft = handScroll;
    $('turn-banner').textContent = displayText(state.status === 'mulligan' ? '初手の交換を選択中' : state.status === 'finished' ? '対戦終了' : playback.isPaused()?`${spectator?(state.active==='player'?'CPU A':'CPU B'):'CPU'} · 一時停止中`:cpuThinking?'CPUが思考中':busy ? (currentDescription?.kind === 'turn' ? currentDescription.title : '行動の効果を確認中') : spectator?`${state.active==='player'?'CPU A':'CPU B'}のターン`:pendingPower ? 'パワーの対象を選択' : pendingCard ? '呪文の対象を選択' : selected ? '攻撃する相手を選択' : playerTurn() ? 'あなたのターン' : '星よみ経理のターン');
    $('turn-banner').classList.toggle('cpu-turn', state.active === 'cpu');
    document.querySelector('.arena').dataset.busy = String(busy);
    $('cancel-selection').hidden = !selected && !pendingCard && !pendingPower;
    $('end-turn').disabled = !playerTurn();
    $('touch-end-turn').disabled=!playerTurn();
    $('touch-end-turn').textContent=spectator?'観戦中':busy?'行動を確認中':playerTurn()?'ターン終了 →':'CPUのターン';
    $('inspect-toggle').setAttribute('aria-pressed',String(inspecting));
    $('inspect-toggle').textContent=inspecting?'詳細モードを終了':'詳細を見る';
    $('end-turn').innerHTML = state.status === 'finished' ? '対戦終了 <span>✧</span>' : busy ? '行動を確認中 <span>···</span>' : playerTurn() ? 'ターン終了 <span>→</span>' : '星よみ経理が思考中 <span>···</span>';
    if(spectator)$('end-turn').textContent=state.status==='finished'?'観戦終了':'CPU同士を観戦中';
    $('battle-log').innerHTML = [...state.log].reverse().slice(0, 25).map(entry => `<li><time>${String(Math.ceil(entry.turn / 2)).padStart(2, '0')}</time><span>${displayText(entry.message)}</span></li>`).join('');
    updatePlaybackControls();
    const choosing=!atStart&&!spectator&&state.choice?.side==='player'&&!busy&&state.status==='playing';
    if(choosing){
      $('discover-offers').innerHTML=state.choice.options.map(item=>cardMarkup(BY_ID[item.cardId],item.uid,'discover').replace('<button ',`<button data-discover="${item.uid}" `)).join('');
      if(!$('discover-dialog').open)$('discover-dialog').showModal();
    } else if($('discover-dialog').open)$('discover-dialog').close();
  }
  function showResult() {
    if (!atStart && state.status === 'finished' && !resultShown) {
      resultShown = true;
      const won = state.winner === 'player'; const draw = state.winner === 'draw';
      sound.reset('menu');sound.play(draw?'drawGame':won||spectator?'victory':'defeat');
      $('result-english').textContent = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
      $('result-title').textContent = draw ? '星の数だけ、おあいこ。' : won ? '勝ち星、いただきました。' : '星勘定、仕切り直し。';
      $('result-description').textContent = draw ? '星は分け合い、勝負は引き分け。次の一手は、また新しい盤面で。' : won ? '勝ち星ひとつ、お持ち帰り。精霊たちにも、いい顔ができそうです。' : '今回は星よみ経理が一枚上手。次は、手札でお返しを。';
      $('result-stat').textContent = `${Math.ceil(state.turn / 2)}ラウンド / あなたのHP ${Math.max(0, state.player.hp)} / 星よみ経理のHP ${Math.max(0, state.cpu.hp)}`;
      if(spectator){$('result-english').textContent='SPECTATED DUEL';$('result-title').textContent=draw?'引き分け':`${won?'CPU A':'CPU B'}の勝利`;$('result-description').textContent='双方の判断と盤面を、振り返りで確認できます。';$('result-stat').textContent=displayText($('result-stat').textContent);}
      message(spectator?'観戦終了。双方の判断を振り返りで確認できます。':draw ? '引き分け。もう一度、星の巡りへ。' : won ? '勝利！もう一度、星の巡りに挑めます。' : '対戦終了。再戦で新しいデッキ順に挑めます。');
      $('result-dialog').showModal();
    }
  }
  function findUnit(uid) { return document.querySelector(`[data-unit="${uid}"]`); }
  function entityElement(id) { return id === 'cpu-hero' ? $('enemy-hero') : id === 'player-hero' ? $('player-hero') : findUnit(id); }
  function pop(element, text, heal = false) {
    if (!element || reducedMotion) return;
    const label = document.createElement('span'); label.className = `damage-pop ${heal ? 'heal-pop' : ''}`; label.textContent = text; element.append(label);
    label.addEventListener('animationend', () => label.remove(), { once: true });
  }
  function animate(event, sourceRect, effects) {
    if (!event || reducedMotion) return;
    if (event.type === 'play') findUnit(event.unit)?.classList.add('summoned');
    if (event.type === 'turn') $('turn-banner').classList.add('turn-pulse');
    for (const effect of effects) {
      const element = entityElement(effect.target);
      element?.classList.add('effect-flash');
      if (effect.type === 'heal' && effect.amount) pop(element, `+${effect.amount}`, true);
      if (effect.type === 'damage') pop(element, effect.blocked ? '星護' : `−${effect.amount}`);
      if (effect.type === 'buff') pop(element, '変化', true);
      if (effect.type === 'shield') pop(element, effect.granted ? '星護＋' : '星護あり', true);
      if (effect.type === 'transform') {element?.classList.add('transformed');pop(element,'変身',true);}
    }
    if (event.type === 'attack') {
      const targetElement = entityElement(event.target === 'hero' ? `${event.side === 'player' ? 'cpu' : 'player'}-hero` : event.target);
      if (targetElement) {
        targetElement.classList.remove('hit'); void targetElement.offsetWidth; targetElement.classList.add('hit');
        pop(targetElement, event.damage ? `−${event.damage}` : '星護');
      }
      const targetRect = targetElement?.getBoundingClientRect();
      if (sourceRect && targetRect) {
        const x1 = sourceRect.x + sourceRect.width / 2; const y1 = sourceRect.y + sourceRect.height / 2;
        const x2 = targetRect.x + targetRect.width / 2; const y2 = targetRect.y + targetRect.height / 2;
        const trace = document.createElement('div'); trace.className = 'battle-trace';
        trace.style.cssText = `left:${x1}px;top:${y1}px;width:${Math.hypot(x2 - x1, y2 - y1)}px;transform:rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`;
        document.body.append(trace); trace.addEventListener('animationend', () => trace.remove(), { once: true });
      }
    }
  }
  function updatePlaybackControls() {
    $('pause-cpu').disabled = !((state.status === 'playing' && automated()) || (busy && (spectator||activeActor === 'cpu')));
    $('pause-cpu').textContent = playback.isPaused() ? 'CPUを再開 ▶' : 'CPUを一時停止 Ⅱ';
    document.body.classList.toggle('playback-paused', playback.isPaused());
  }
  function present(description, phase) {
    if(spectator)description={...description,title:displayText(description.title),description:displayText(description.description),target:displayText(description.target),changes:description.changes.map(displayText)};
    const label = description.kind === 'turn' ? 'ターン交代' : phase === 'preview' ? 'これから使う行動' : '結果を確認';
    $('event-panel').dataset.phase = phase;
    $('event-phase').textContent = label;
    $('event-title').textContent = description.title;
    $('event-description').textContent = description.description;
    $('event-target').textContent = description.target ? `対象：${description.target}` : '';
    $('event-target').hidden = !description.target;
    $('event-results').replaceChildren();
    if (phase !== 'preview') for (const change of description.changes) {
      const item = document.createElement('li'); item.textContent = change; $('event-results').append(item);
    }
    const art = description.cardId ? illustration(BY_ID[description.cardId], 'cue-art') : description.powerId ? illustration(BY_POWER[description.powerId], 'cue-power') : '<span class="cue-star">✧</span>';
    $('action-cue').innerHTML = `<div class="cue-image">${art}</div><div class="cue-copy"><span class="eyebrow">${label}</span><strong>${description.title}</strong><p>${phase === 'preview' ? description.description : description.changes.slice(0, 2).join(' ／ ') || description.description}</p>${description.target ? `<small>対象：${description.target}</small>` : ''}${phase === 'result' && description.changes.length > 2 ? `<small class="cue-more">ほか${description.changes.length - 2}件の変化を「いまの行動」に表示</small>` : ''}</div>`;
    $('action-cue').hidden = false;
    $('action-cue').dataset.kind = description.kind;
    $('action-cue').dataset.phase = phase;
    for (const id of description.highlights) entityElement(id)?.classList.add('action-highlight');
    if (description.powerEffect) powerEffects.show(description.powerEffect,phase);
    message(phase === 'preview' ? description.title : description.changes[0] || description.description);
  }
  function clearCue() {
    powerEffects.clear();
    $('action-cue').hidden = true;
    document.querySelectorAll('.action-highlight').forEach(element => element.classList.remove('action-highlight'));
  }
  async function dispatch(action,analysis=null) {
    if (busy) { message('いまの行動の表示が終わるまでお待ちください。', true); return false; }
    const result = applyAction(state, action);
    if (!result.ok) { message(result.message, true); return false; }
    const epoch = gameEpoch;
    const description = describeAction(state, action, result);
    const before=state;
    busy = true; activeActor = action.actor; currentDescription = description;
    selected = null; pendingCard = null; pendingPower = false;
    try {
      if (action.type !== 'end') {
        render(); present(description, 'preview');
        if (!await playback.wait(description.kind === 'attack' ? pace().attack : pace().preview) || epoch !== gameEpoch) return false;
      }
      const sourceRect = action.type==='weaponAttack'?entityElement(`${action.actor}-hero`)?.getBoundingClientRect():action.type === 'attack' ? findUnit(action.attacker)?.getBoundingClientRect() : null;
      if (description.powerEffect) powerEffects.capture();
      state = result.state;
      if(!atStart)sound.playAction(description,result.effects);
      recording.append(before,action,result,analysis,description);
      const handScroll = $('hand').scrollLeft; render(); $('hand').scrollLeft = handScroll;
      present(description, 'result'); animate(result.event, sourceRect, result.effects);
      if (!await playback.wait(resultDuration(paceKey, description)) || epoch !== gameEpoch) return false;
    } finally {
      if (epoch === gameEpoch) {
        busy = false; activeActor = null; currentDescription = null;
        clearCue(); render(); $('event-panel').dataset.phase = 'idle'; $('event-phase').textContent = '直前の結果';
      }
    }
    showResult();
    return true;
  }
  async function scheduleCpu(epoch = gameEpoch) {
    if (cpuRunning || state.status !== 'playing' || !automated()) return;
    cpuRunning = true;
    try {
      while (epoch === gameEpoch && state.status === 'playing' && automated()) {
        if (!await playback.wait(pace().gap) || epoch !== gameEpoch) return;
        let action,analysis=null;const actor=state.active;
        if (cpuSteps++ < 40 || state.choice) {
          cpuThinking = true; render();
          let settled=false;
          const fallback=()=>{
            const actions=legalActions(state,actor);
            return actions.find(a=>a.type==='choose')||actions.find(a=>a.type==='play')||actions.find(a=>a.type==='attack'||a.type==='weaponAttack')||actions.find(a=>a.type==='end');
          };
          try {
            action = await Promise.race([
              chooseActionAsync(state, actor, { ...(spectator?watchConfig[actor].settings:matchCpu),maxThinkMs:1200,trace:true,onAnalysis:value=>{if(!settled)analysis=value;}, yieldControl: () => playback.wait(0), isCancelled: () => settled||epoch !== gameEpoch }),
              // 非同期の待機そのものが滞った場合も復帰する。一時停止中はこの時計も止まる。
              playback.wait(4000).then(ok=>{
                if(!ok||settled||epoch!==gameEpoch)return null;
                analysis={...(spectator?watchConfig[actor].settings:matchCpu),nodes:0,timeLimited:true,trace:{method:'bounded',baseline:null,candidates:[]}};
                return fallback();
              })
            ]);
          } catch(error) {
            if(epoch!==gameEpoch)return;
            // 一部端末で探索に失敗しても、対戦全体を思考中のまま止めない。
            action=fallback();
            analysis=null;
            message('CPUの思考を再調整し、合法な行動で続行します。');
          } finally { settled=true;if (epoch === gameEpoch) { cpuThinking = false; render(); } }
        } else action = { type: 'end', actor };
        if (epoch !== gameEpoch || !await playback.wait(0) || epoch !== gameEpoch) return;
        if(spectator){$('live-thought-title').textContent=`${actor==='player'?'CPU A':'CPU B'}の判断`;renderThought(document,$('live-thought'),state,analysis);}
        if (!action || !await dispatch(action,analysis)) {
          if (epoch !== gameEpoch) return;
          if (!await dispatch({ type: 'end', actor })) return;
        }
        if(state.active!==actor)cpuSteps=0;
      }
    } finally { if (epoch === gameEpoch) { cpuRunning = false; updatePlaybackControls(); } }
  }
  function newGame() {
    sound.reset('battle');audioPausedCpu=false;
    atStart=false;menuWasPaused=false;
    $('start-screen').hidden=true;$('game-shell').hidden=false;$('touch-toolbar').hidden=false;document.body.classList.remove('at-start');
    document.body.classList.remove('menu-open','info-open');
    $('mobile-menu').setAttribute('aria-expanded','false');$('mobile-info').setAttribute('aria-expanded','false');
    resettingMatch = true;
    editorPausedCpu = false; settingsPausedCpu = false; arenaPausedCpu = false; watchPausedCpu=false; cpuThinking = false;
    viewer.close();
    matchCpu = { difficulty: cpuPreference.difficulty, style: cpuPreference.style === 'auto' ? Object.keys(STYLES)[Math.floor(Math.random() * 3)] : cpuPreference.style };
    playback.cancel(); gameEpoch++; cpuSteps = 0; selected = null; inspecting=false; pendingCard = null; pendingPower = false; resultShown = false; cpuRunning = false;
    powerEffects.clear();
    document.querySelectorAll('.battle-trace').forEach(element => element.remove());
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    if(spectator&&watchConfig.mode==='arena')draftWatchDecks();
    currentDeck = spectator?watchConfig.player.deck:arenaMatch ? arenaMatch.player : editor.activeDeck();
    const cpuDeck = spectator?watchConfig.cpu.deck:arenaMatch ? arenaMatch.cpu : SeikanDecks.PRESETS[Math.floor(Math.random() * SeikanDecks.PRESETS.length)];
    if(spectator)matchCpu={...watchConfig.cpu.settings};
    state = createGame(Math.random, { mode: spectator?watchConfig.mode:arenaMatch ? 'arena' : 'constructed', mulligan: true, playerDeck: currentDeck.cards, playerPower: currentDeck.heroPower, playerName: currentDeck.name, cpuDeck: cpuDeck.cards, cpuPower: cpuDeck.heroPower, cpuName: cpuDeck.name });
    recording=createRecording(state,{spectator});$('live-thought').replaceChildren();
    if(spectator&&state.status==='mulligan')for(const side of ['cpu','player']){const action={type:'mulligan',actor:side,cards:mulliganCards(state,side)},result=applyAction(state,action);if(!result.ok)throw Error(result.message);recording.append(state,action,result);state=result.state;}
    resettingMatch = false; openingSelection.clear(); busy = false; activeActor = null; currentDescription = null;
    render();
    if (state.status === 'mulligan') { openMulligan(); return; }
    startIntro();
  }
  function newConstructedGame() { spectator=false;arenaMatch = null; newGame(); }
  function startIntro() {
    busy = true; activeActor = state.active;
    currentDescription = { kind: 'turn', actor: state.active, title: `${state.active === 'player' ? 'あなた' : '星よみ経理'}のターン`, description: `抽選で${state.first === 'player' ? 'あなた' : 'CPU'}が先攻。マナ ${state[state.active].mana} / ${state[state.active].maxMana}。先攻の初回はドローなし。`, cardId: null, target: '', highlights: [], changes: [`あなたのHP ${state.player.hp} / 星よみ経理のHP ${state.cpu.hp}`, `手札 ${state[state.active].hand.length}枚`] };
    render(); present(currentDescription, 'result');
    void finishIntro(gameEpoch);
  }
  function renderMulligan() {
    $('mulligan-difficulty').value=matchCpu.difficulty;
    const first = state.first === 'player';
    $('mulligan-order').textContent = `${state.mode==='arena'?'アリーナ：':''}あなたは${first ? '先攻' : '後攻'} · 初手${state.player.hand.length}枚。HP25で開始します。${first ? 'CPUが後攻支援を得ます。' : '初手確定後に「後攻の先借り」を1枚獲得します。'}`;
    $('mulligan-cards').innerHTML = state.player.hand.map(item => cardMarkup(BY_ID[item.cardId],item.uid,'opening').replace('<button ',`<button data-mulligan="${item.uid}" aria-pressed="${openingSelection.has(item.uid)}" `).replace('class="card ',`class="card ${openingSelection.has(item.uid)?'exchange-card ':''}`)).join('');
    $('mulligan-count').textContent = openingSelection.size ? `${openingSelection.size}枚を交換 · 選択中のカードに「交換」と表示` : 'すべてキープ · 交換したいカードは選択してください';
    $('mulligan-confirm').textContent = openingSelection.size ? `${openingSelection.size}枚を交換して対戦開始 →` : 'すべてキープして対戦開始 →';
  }
  function openMulligan() { renderMulligan(); if (!$('mulligan-dialog').open) $('mulligan-dialog').showModal(); }
  $('mulligan-cards').addEventListener('click', event => {
    const item = event.target.closest('[data-mulligan]');
    if (!item || state.status !== 'mulligan') return;
    const uid = item.dataset.mulligan;
    if (!state.player.hand.some(card=>card.uid===uid)) return;
    if (openingSelection.has(uid)) openingSelection.delete(uid); else openingSelection.add(uid);
    renderMulligan();
    document.querySelector(`[data-mulligan="${uid}"]`)?.focus({preventScroll:true});
  });
  $('mulligan-confirm').addEventListener('click', () => {
    if (state.status !== 'mulligan') return;
    const cpu = applyAction(state,{type:'mulligan',actor:'cpu',cards:mulliganCards(state,'cpu')});
    if (!cpu.ok) { message(cpu.message,true); return; }
    const player = applyAction(cpu.state,{type:'mulligan',actor:'player',cards:[...openingSelection]});
    if (!player.ok) { message(player.message,true); return; }
    recording.append(state,{type:'mulligan',actor:'cpu',cards:mulliganCards(state,'cpu')},cpu);
    recording.append(cpu.state,{type:'mulligan',actor:'player',cards:[...openingSelection]},player);
    state = player.state; $('mulligan-dialog').close(); startIntro();
  });
  $('mulligan-dialog').addEventListener('cancel', event => event.preventDefault());
  $('discover-dialog').addEventListener('cancel',event=>event.preventDefault());
  $('discover-restart').addEventListener('click',newGame);
  $('discover-offers').addEventListener('click',event=>{
    const item=event.target.closest('[data-discover]');
    if(item&&state.choice?.side==='player'&&!busy)void dispatch({type:'choose',actor:'player',choice:item.dataset.discover});
  });
  $('mulligan-restart').addEventListener('click', newGame);
  async function finishIntro(epoch) {
    if (!await playback.wait(pace().turn) || epoch !== gameEpoch) return;
    busy = false; activeActor = null; currentDescription = null; clearCue(); render();
    $('event-panel').dataset.phase = 'idle'; $('event-phase').textContent = 'ターン開始';
    if (automated()) { void scheduleCpu(epoch); }
    else message(editor.storageWarning() || '光る手札が出番待ち。手は抜かず、カードを出そう。結果は「いまの行動」で確認できます。', Boolean(editor.storageWarning()));
  }
  function cancelSelection() {
    selected = null; pendingCard = null; pendingPower = false; render(); message('選択を解除しました。カードとマナは消費されません。');
  }
  function chooseTarget(id) {
    if (busy) { message('行動の演出が終わってから対象を選んでください。', true); return; }
    if (pendingPower) dispatch({ type: 'power', actor: 'player', target: id });
    else if (pendingCard) dispatch({ type: 'play', actor: 'player', card: pendingCard, target: id });
    else if (selected) {
      if (id === 'player-hero') message('攻撃対象は敵のユニットか敵ヒーローです。', true);
      else dispatch(selected==='player-hero'?{type:'weaponAttack',actor:'player',target:id==='cpu-hero'?'hero':id}:{ type: 'attack', actor: 'player', attacker: selected, target: id === 'cpu-hero' ? 'hero' : id });
    } else message('まず、手札の呪文か攻撃可能な自分のユニットを選んでください。', true);
  }
  function showDetail(id,side='player') {
    const card = BY_ID[id];
    const deck=spectator&&side==='cpu'?watchConfig.cpu.deck:currentDeck;
    const keywordHelp = card.keywords.map(key => `<p><strong>${KEYWORDS[key].name}</strong>：${KEYWORDS[key].description}</p>`).join('');
    $('card-detail').innerHTML = `${cardMarkup(card, 'detail', 'detail')}<div class="detail-abilities"><p>${card.description}</p>${keywordHelp}</div><p class="detail-flavor">「${card.flavor}」</p><p class="detail-id">${card.id} · ${spectator?side==='cpu'?'CPU Bの':'CPU Aの':'対戦中の'}デッキ内 ${deck.cards.filter(item => item === id).length}枚 · ${card.type==='weapon'?'武器':card.type === 'spell' ? '呪文' : 'ユニット'}</p>`;
    $('detail-dialog').showModal();
  }
  $('enemy-portrait').innerHTML = portrait(true); $('player-portrait').innerHTML = portrait(false);
  $('collection-grid').innerHTML = CARDS.map(card => cardMarkup(card, `collection-${card.id}`, 'collection')).join('');
  $('collection-count').textContent = `THE COLLECTION · ${CARDS.length} CARDS`;
  $('hand').addEventListener('click', event => {
    const element = event.target.closest('[data-card]'); if (!element) return;
    if(inspecting||spectator){showDetail(element.dataset.cardId);return;}
    if (busy) { message('行動の演出が終わるまでお待ちください。', true); return; }
    const uid = element.dataset.card;
    if (pendingCard === uid) { cancelSelection(); return; }
    const reason = canPlayCard(state, 'player', uid);
    if (reason) { message(reason, true); return; }
    const card = BY_ID[element.dataset.cardId];
    if (card.target) {
      selected = null; pendingPower = false; pendingCard = uid;
      const scroll = $('hand').scrollLeft; render(); $('hand').scrollLeft = scroll;
      message(`「${card.name}」：光る対象をクリック。選択解除ボタンかEscでキャンセル。`);
    } else dispatch({ type: 'play', actor: 'player', card: uid });
  });
  for (const id of ['player-field', 'enemy-field']) $(id).addEventListener('click', event => {
    const element = event.target.closest('[data-unit]'); if (!element) return;
    if(inspecting){const u=state[element.dataset.side].board.find(u=>u.uid===element.dataset.unit);if(u)showDetail(u.cardId);return;}
    if (!playerTurn()) { message(busy ? 'いまの行動の表示が終わるまでお待ちください。' : state.status === 'playing' ? '星よみ経理のターンです。少しお待ちください。' : '対戦は終了しています。新しい対戦を始められます。', true); return; }
    if (pendingPower || pendingCard || element.dataset.side === 'cpu') { chooseTarget(element.dataset.unit); return; }
    const unit = state.player.board.find(item => item.uid === element.dataset.unit);
    if (!unit.ready || unit.attack <= 0) { message(unit.attack <= 0 ? '攻撃力が0のユニットは攻撃できません。' : '召喚したターン・攻撃後は行動できません。速攻なら召喚直後に攻撃できます。', true); return; }
    selected = selected === unit.uid ? null : unit.uid; render();
    message(selected ? '光る敵をクリックして攻撃。挑発がいると先に倒す必要があります。' : '攻撃の選択を解除しました。');
    if (selected) findUnit(selected)?.focus({ preventScroll: true });
  });
  $('inspect-toggle').addEventListener('click',()=>{inspecting=!inspecting;selected=null;pendingCard=null;pendingPower=false;render();message(inspecting?'詳細モード：カードやユニットをタップ。対戦操作へ戻るには下のボタンを押してください。':'対戦操作へ戻りました。');});
  for(const id of ['enemy-hand','watch-top-hand'])$(id).addEventListener('click',event=>{const c=event.target.closest('[data-card-id]');if(spectator&&c)showDetail(c.dataset.cardId,'cpu');});
  $('weapon-attack').addEventListener('click',()=>{if(!playerTurn()||canWeaponAttack(state,'player'))return;pendingCard=null;pendingPower=false;selected=selected==='player-hero'?null:'player-hero';render();message(selected?'武器で攻撃：光る敵を選んでください。ユニットからは反撃を受けます。':'武器の選択を解除しました。');});
  $('enemy-hero').addEventListener('click', () => chooseTarget('cpu-hero'));
  $('player-hero').addEventListener('click', () => chooseTarget('player-hero'));
  $('cancel-selection').addEventListener('click', cancelSelection);
  $('hero-power').addEventListener('click', () => {
    if (pendingPower) { cancelSelection(); return; }
    const reason = canUsePower(state, 'player'); if (!playerTurn() || reason) return;
    selected = null; pendingCard = null; pendingPower = true; render();
    message(`「${BY_POWER[state.player.heroPower].name}」：光る対象を選んでください。選ぶまでマナは消費されません。`);
  });
  async function endPlayerTurn() {
    if(!playerTurn())return;
    const epoch = gameEpoch;
    if (await dispatch({ type: 'end', actor: 'player' }) && epoch === gameEpoch) { cpuSteps = 0; void scheduleCpu(epoch); }
  }
  for(const id of ['end-turn','touch-end-turn'])$(id).addEventListener('click',endPlayerTurn);
  $('playback-speed').value = paceKey;
  $('playback-speed').addEventListener('change', event => {
    if (!PACES[event.target.value]) return;
    paceKey = event.target.value;
    try { localStorage.setItem('seikan-playback-speed', paceKey); } catch { /* 保存不可でも設定は有効。 */ }
    message(`進行速度を「${pace().name}」にしました。次の表示から反映します。`);
  });
  $('pause-cpu').addEventListener('click', () => {
    if (playback.isPaused()) { playback.resume(); message('CPUの進行を再開します。'); }
    else { playback.pause(); message('CPUを一時停止中です。「いまの行動」や履歴をゆっくり確認できます。'); }
    render();
  });
  function describeCpuSettings() {
    $('cpu-setting-description').textContent = DIFFICULTIES[cpuPreference.difficulty].description + ' ' + (cpuPreference.style === 'auto' ? '戦術は対戦ごとに選びます。' : STYLES[cpuPreference.style].description);
  }
  $('cpu-difficulty').value = cpuPreference.difficulty; $('cpu-style').value = cpuPreference.style;
  for(const id of ['start-difficulty','mulligan-difficulty','draft-difficulty']){
    $(id).value=cpuPreference.difficulty;
    $(id).addEventListener('change',()=>{
      cpuPreference={...cpuPreference,difficulty:normalizeOptions({difficulty:$(id).value}).difficulty};
      for(const key of ['cpu-difficulty','start-difficulty','mulligan-difficulty','draft-difficulty'])$(key).value=cpuPreference.difficulty;
      if(!atStart&&state?.status==='mulligan')matchCpu={...matchCpu,difficulty:cpuPreference.difficulty};
      try{localStorage.setItem('seikan-cpu-settings-v1',JSON.stringify(cpuPreference));}catch{}
      describeCpuSettings();render();
    });
  }
  for (const id of ['cpu-difficulty', 'cpu-style']) $(id).addEventListener('change', () => {
    cpuPreference = { difficulty: $('cpu-difficulty').value, style: $('cpu-style').value };
    for(const id of ['start-difficulty','mulligan-difficulty','draft-difficulty'])$(id).value=cpuPreference.difficulty;
    try { localStorage.setItem('seikan-cpu-settings-v1', JSON.stringify(cpuPreference)); } catch { /* このページでは選択を維持する。 */ }
    describeCpuSettings();
  });
  describeCpuSettings();
  function openCpuSettings() {
    settingsPausedCpu = !atStart&&state?.active === 'cpu' && state.status === 'playing' && !playback.isPaused();
    if (settingsPausedCpu) { playback.pause(); updatePlaybackControls(); }
    $('cpu-settings-back').textContent=atStart?'スタートメニューへ':'対戦に戻る';
    $('cpu-new-game').textContent=atStart?'この設定で通常対戦を開始 →':'この設定で新しい対戦 ↻';
    if(!state)$('cpu-match-status').textContent='まだ対戦は始まっていません。';
    $('cpu-dialog').showModal();
  }
  $('cpu-settings-button').addEventListener('click',openCpuSettings);
  function openAudioSettings(){
    audioPausedCpu=!atStart&&state?.status==='playing'&&!playback.isPaused();
    if(audioPausedCpu){playback.pause();updatePlaybackControls();}
    renderAudioSettings();$('audio-dialog').showModal();
  }
  for(const id of ['start-audio','audio-button'])$(id).addEventListener('click',openAudioSettings);
  for(const key of ['master','effects','music'])$('audio-'+key).addEventListener('input',()=>sound.setSettings({[key]:Number($('audio-'+key).value)}));
  $('audio-enable').addEventListener('click',()=>void sound.unlock());
  $('audio-test').addEventListener('click',async()=>{if(await sound.unlock())sound.play('discover');});
  $('audio-mute').addEventListener('click',()=>sound.setSettings({muted:!sound.getSettings().muted}));
  $('audio-dialog').addEventListener('close',()=>{const resume=audioPausedCpu;audioPausedCpu=false;if(resume&&!atStart&&!resettingMatch){playback.resume();updatePlaybackControls();if(!busy&&automated()&&!cpuRunning)void scheduleCpu();}});
  document.addEventListener('pointerdown',()=>void sound.unlock(),{capture:true});
  document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')void sound.unlock();},{capture:true});
  document.addEventListener('visibilitychange',()=>sound.setHidden(Boolean(document.hidden)));
  window.addEventListener('pagehide',()=>sound.setHidden(true));
  window.addEventListener('pageshow',()=>sound.setHidden(Boolean(document.hidden)));
  sound.setHidden(Boolean(document.hidden));
  $('cpu-dialog').addEventListener('close', () => {
    if (settingsPausedCpu) { settingsPausedCpu = false; if(!atStart)playback.resume(); updatePlaybackControls(); }
  });
  $('cpu-new-game').addEventListener('click',()=>atStart?newConstructedGame():newGame());
  $('restart-button').addEventListener('click', newGame); $('mobile-restart').addEventListener('click',newGame); $('rematch-button').addEventListener('click', newGame);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  function closeMobilePanels(){document.body.classList.remove('menu-open','info-open');$('mobile-menu').setAttribute('aria-expanded','false');$('mobile-info').setAttribute('aria-expanded','false');}
  $('mobile-menu').addEventListener('click',()=>{const open=!document.body.classList.contains('menu-open');closeMobilePanels();document.body.classList.toggle('menu-open',open);$('mobile-menu').setAttribute('aria-expanded',String(open));});
  $('mobile-info').addEventListener('click',()=>{const open=!document.body.classList.contains('info-open');closeMobilePanels();document.body.classList.toggle('info-open',open);$('mobile-info').setAttribute('aria-expanded',String(open));});
  $('mobile-info-close').addEventListener('click',closeMobilePanels);
  $('game-menu').addEventListener('click',closeMobilePanels);
  $('collection-button').addEventListener('click', () => $('collection-dialog').showModal());
  $('collection-grid').addEventListener('click', event => { const card = event.target.closest('[data-card-id]'); if (card) showDetail(card.dataset.cardId); });
  document.querySelectorAll('.close-modal').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && (selected || pendingCard || pendingPower)) cancelSelection(); });
  document.querySelector('.arena').addEventListener('contextmenu', event => {
    const card = event.target.closest('[data-card-id]'); if (!card) return;
    event.preventDefault(); showDetail(card.dataset.cardId);
  });
  const editor = SeikanDeckEditor.createEditor({ cardMarkup, onStart: newConstructedGame, onDetail: showDetail,
    onOpen() { editorPausedCpu = !atStart&&state?.active === 'cpu' && state.status === 'playing' && !playback.isPaused(); if (editorPausedCpu) { playback.pause(); updatePlaybackControls(); } },
    onClose() { if (editorPausedCpu) { editorPausedCpu = false; if(!atStart)playback.resume(); updatePlaybackControls(); }if(atStart)updateStartMenu(); }
  });
  const arena = SeikanArenaEditor.createEditor({ cardMarkup, style:()=>cpuPreference.style,
    onStart(draft) {
      spectator=false;
      arenaMatch = Object.fromEntries(['player','cpu'].map(side=>[side,{cards:[...draft[side].cards],heroPower:BY_HERO[draft[side].hero].power,name:`アリーナ · ${BY_HERO[draft[side].hero].name}`} ]));
      newGame();
    },
    onConstructed:newConstructedGame,
    onOpen() { $('draft-difficulty').value=cpuPreference.difficulty;arenaPausedCpu=!atStart&&state?.active==='cpu'&&state.status==='playing'&&!playback.isPaused();if(arenaPausedCpu){playback.pause();updatePlaybackControls();} },
    onClose() { if(arenaPausedCpu){arenaPausedCpu=false;if(!atStart)playback.resume();updatePlaybackControls();}if(!atStart&&!resettingMatch&&state?.status==='mulligan')openMulligan(); }
  });
  $('arena-button').addEventListener('click',()=>arena.open());
  $('mulligan-arena').addEventListener('click',()=>{$('mulligan-dialog').close();arena.open();});
  $('deck-button').addEventListener('click', () => editor.open());
  const viewer=createViewer({document,cardMarkup,illustration});
  function openReview(){if(state.status!=='finished'||busy)return;if($('result-dialog').open)$('result-dialog').close();viewer.open(recording);}
  $('review-button').addEventListener('click',openReview);$('result-review').addEventListener('click',openReview);
  for(const side of ['player','cpu']){
    $('watch-'+side+'-deck').innerHTML=SeikanDecks.PRESETS.map(deck=>`<option value="${deck.id}">${deck.name}</option>`).join('');
    $('watch-'+side+'-deck').value=SeikanDecks.PRESETS[side==='player'?0:1].id;
  }
  function openWatch(){
    watchOpening=!atStart&&state?.status==='mulligan';if($('mulligan-dialog').open)$('mulligan-dialog').close();
    watchPausedCpu=state?.status==='playing'&&automated()&&!playback.isPaused();if(watchPausedCpu){playback.pause();updatePlaybackControls();}
    $('watch-dialog').showModal();
  }
  $('watch-button').addEventListener('click',openWatch);$('mulligan-watch').addEventListener('click',openWatch);
  $('watch-dialog').addEventListener('close',()=>{
    if(watchPausedCpu){watchPausedCpu=false;if(!atStart)playback.resume();updatePlaybackControls();}
    if(watchOpening&&!atStart&&!resettingMatch&&state?.status==='mulligan')openMulligan();watchOpening=false;
  });
  $('watch-mode').value='constructed';
  $('watch-mode').addEventListener('change',()=>{
    const arenaMode=$('watch-mode').value==='arena';$('watch-arena-note').hidden=!arenaMode;
    for(const side of ['player','cpu'])$('watch-'+side+'-deck').disabled=arenaMode;
  });
  function draftWatchDecks(){
    const A=SeikanArena;let draft=A.createDraft();
    while(draft.phase!=='complete'){
      const side=draft.active,options=A.choicesFor(draft,side);
      const uid=A.chooseCpu({...draft,active:'cpu',cpu:draft[side],offers:options},watchConfig[side].settings.style);
      const result=A.pick(draft,side,uid);if(!result.ok)throw Error(result.message);draft=result.state;
    }
    for(const side of ['player','cpu'])watchConfig[side].deck={cards:[...draft[side].cards],heroPower:BY_HERO[draft[side].hero].power,name:`観戦アリーナ · ${BY_HERO[draft[side].hero].name}`};
  }
  $('watch-start').addEventListener('click',()=>{
    watchConfig=Object.fromEntries(['player','cpu'].map(side=>[side,{deck:SeikanDecks.PRESETS.find(d=>d.id===$('watch-'+side+'-deck').value)||SeikanDecks.PRESETS[0],settings:normalizeOptions({difficulty:$('watch-'+side+'-difficulty').value,style:$('watch-'+side+'-style').value})}]));
    watchConfig.mode=$('watch-mode').value==='arena'?'arena':'constructed';
    spectator=true;arenaMatch=null;newGame();
  });
  $('watch-exit').addEventListener('click',newConstructedGame);
  function updateStartMenu(){
    const deck=editor.activeDeck();if(!state)currentDeck=deck;
    $('start-deck-name').textContent=deck.name;
    $('start-difficulty').value=cpuPreference.difficulty;
    $('start-resume-row').hidden=!state;
    $('start-resume').textContent=state?.status==='mulligan'?'初手交換に戻る →':state?.status==='finished'?'直前の対戦に戻る →':'対戦を続ける →';
    $('start-resume-note').textContent=state?`${spectator?'CPU同士の観戦':state.mode==='arena'?'アリーナ':'通常対戦'} · ${state.status==='mulligan'?'初手交換中':`ラウンド ${Math.ceil(state.turn/2)}`}`:'';
  }
  function openStartMenu(){
    sound.reset('menu');
    if(!atStart){menuWasPaused=playback.isPaused();playback.pause();}
    atStart=true;closeMobilePanels();viewer.close();
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    $('game-shell').hidden=true;$('touch-toolbar').hidden=true;$('start-screen').hidden=false;document.body.classList.add('at-start');
    $('start-screen').scrollTop=0;
    updateStartMenu();if(state)updatePlaybackControls();
    $('start-title').focus({preventScroll:true});
  }
  function resumeFromStart(){
    if(!state)return;
    sound.reset(state.status==='finished'?'menu':'battle');
    atStart=false;$('start-screen').hidden=true;$('game-shell').hidden=false;$('touch-toolbar').hidden=false;document.body.classList.remove('at-start');
    if(!menuWasPaused)playback.resume();render();
    if(state.status==='mulligan')openMulligan();
    else if(!busy&&automated()&&!cpuRunning)void scheduleCpu();
  }
  $('start-constructed').addEventListener('click',newConstructedGame);
  $('start-arena').addEventListener('click',()=>arena.open());
  $('start-watch').addEventListener('click',openWatch);
  $('start-deck').addEventListener('click',()=>editor.open());
  $('start-collection').addEventListener('click',()=>$('collection-dialog').showModal());
  $('start-help').addEventListener('click',()=>$('help-dialog').showModal());
  $('start-settings').addEventListener('click',openCpuSettings);
  $('start-resume').addEventListener('click',resumeFromStart);
  for(const id of ['home-button','mulligan-home'])$(id).addEventListener('click',openStartMenu);
  $('home-logo').addEventListener('click',event=>{event.preventDefault();openStartMenu();});
  openStartMenu();
})();
