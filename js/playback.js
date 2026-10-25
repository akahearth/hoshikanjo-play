(function (root) {
  'use strict';
  const { BY_ID } = typeof module === 'object' && module.exports ? require('./cards.js') : root.SeikanCards;
  const { BY_POWER } = typeof module === 'object' && module.exports ? require('./heroes.js') : root.SeikanHeroes;
  const PACES = Object.freeze({
    study: Object.freeze({ name: 'じっくり', preview: 2600, attack: 1800, result: 3500, turn: 2600, gap: 1000, extra: 800, maxRead: 10000 }),
    slow: Object.freeze({ name: 'ゆっくり', preview: 1500, attack: 1000, result: 2100, turn: 1800, gap: 650, extra: 650, maxRead: 7500 }),
    normal: Object.freeze({ name: '標準', preview: 1000, attack: 700, result: 1500, turn: 1400, gap: 450, extra: 450, maxRead: 6000 }),
    fast: Object.freeze({ name: '速め', preview: 650, attack: 450, result: 1100, turn: 1000, gap: 300, extra: 300, maxRead: 4500 })
  });
  const DEFAULT_PACE = 'slow';
  const sideName = side => side === 'player' ? 'あなた' : '星よみ経理';
  function resultDuration(paceKey, description) {
    const pace = PACES[paceKey] || PACES[DEFAULT_PACE];
    if (description.kind === 'turn') return pace.turn;
    return Math.min(pace.maxRead, pace.result + Math.max(0, description.changes.length - 2) * pace.extra);
  }
  function entityName(state, id) {
    if (id === 'player-hero') return 'あなたのヒーロー';
    if (id === 'cpu-hero') return '星よみ経理のヒーロー';
    for (const side of ['player', 'cpu']) {
      const unit = state[side].board.find(item => item.uid === id);
      if (unit) return `${side === 'player' ? '味方' : '敵'}の${BY_ID[unit.cardId].name}`;
    }
    return '';
  }
  function changesBetween(before, after) {
    const changes = [];
    for (const side of ['player', 'cpu']) {
      const owner = sideName(side);
      const old = before[side]; const next = after[side];
      if(JSON.stringify(old.weapon)!==JSON.stringify(next.weapon))changes.push(`${owner}の武器：${old.weapon?BY_ID[old.weapon.cardId].name+' 耐久'+old.weapon.durability:'なし'} → ${next.weapon?BY_ID[next.weapon.cardId].name+' 耐久'+next.weapon.durability:'なし'}`);
      if (old.mana !== next.mana) changes.push(`${owner}のマナ：${old.mana} → ${next.mana}${next.temporaryMana ? `（一時マナ${next.temporaryMana}を含む）` : ''}`);
      if (old.hp !== next.hp) changes.push(`${owner}のHP：${Math.max(0, old.hp)} → ${Math.max(0, next.hp)}`);
      for (const unit of old.board) {
        const current = next.board.find(item => item.uid === unit.uid);
        const name = `${owner}の${BY_ID[unit.cardId].name}`;
        if (!current) { const returned=next.hand.some(c=>!old.hand.some(o=>o.uid===c.uid)&&c.cardId===unit.cardId);changes.push(`${name}：${returned?'手札へ戻る':'退場'}（場から離れた）`); continue; }
        if(unit.cardId!==current.cardId){changes.push(`${name} → ${BY_ID[current.cardId].name}へ変身（攻撃力${current.attack} / HP${current.hp}）。元の能力・強化は消滅`);continue;}
        const details = [];
        if(!unit.silenced&&current.silenced)details.push('沈黙：能力・星護・強化を除去');
        if (unit.attack !== current.attack) details.push(`攻撃力 ${unit.attack} → ${current.attack}`);
        if (unit.hp !== current.hp) details.push(`HP ${unit.hp} → ${current.hp}`);
        if (unit.maxHp !== current.maxHp) details.push(`最大HP ${unit.maxHp} → ${current.maxHp}`);
        if (unit.shield && !current.shield) details.push('星護が砕けた');
        if (!unit.shield && current.shield) details.push('星護を獲得');
        if (details.length) changes.push(`${name}：${details.join(' / ')}`);
      }
      for (const unit of next.board.filter(item => !old.board.some(previous => previous.uid === item.uid))) {
        changes.push(`${owner}が${BY_ID[unit.cardId].name}を召喚（攻撃力${unit.attack} / HP${unit.hp}）`);
      }
      if (old.hand.length !== next.hand.length) changes.push(`${owner}の手札：${old.hand.length} → ${next.hand.length}枚`);
      if (old.fatigue !== next.fatigue) changes.push(`${owner}に山札切れダメージ ${next.fatigue}`);
      if (!old.powerUsed && next.powerUsed) changes.push(`${owner}のヒーローパワー：使用済み`);
    }
    return changes;
  }
  function describeAction(before, action, result) {
    const owner = before[action.actor];
    const changes = changesBetween(before, result.state);
    if(result.effects?.some(e=>e.type==='mutate'))changes.push('残り山札が変異（枚数を保ち、中身は非公開）');
    if(result.state.choice)changes.push(`${sideName(result.state.choice.side)}が発見の3候補から選択します`);
    if(action.type==='choose'){
      const selected=before.choice.options.find(c=>c.uid===action.choice),card=BY_ID[selected.cardId];
      changes.unshift(result.event.burned?`手札上限のため「${card.name}」を失った`:`「${card.name}」を手札に加えた`);
      return {kind:'discover',actor:action.actor,title:`${sideName(action.actor)}が「${card.name}」を発見`,description:card.description,target:'',cardId:card.id,highlights:[],changes};
    }
    if (action.type === 'end') {
      const side = result.state.active;
      const current = result.state[side];
      return { kind: 'turn', actor: side, title: `${sideName(side)}のターン`, description: `マナ ${current.mana} / ${current.maxMana}。ターン開始のドローと攻撃権を更新。`, target: '', cardId: null, highlights: [], changes };
    }
    if (action.type === 'power') {
      const power = BY_POWER[owner.heroPower];
      const effect = result.effects.find(item=>item.target===action.target);
      const kind = effect?.type || power.effects[0].type;
      const outcome = kind === 'heal' ? (effect?.amount ? `HP +${effect.amount}` : '回復なし（HP上限）')
        : kind === 'damage' ? (effect?.blocked ? '星護が防御' : `−${effect?.amount || 0} ダメージ`)
        : effect?.granted ? '星護を付与' : '星護あり';
      const powerEffect = { kind, source:`${action.actor}-hero`, sourceName:sideName(action.actor), target:action.target, targetName:entityName(before,action.target), outcome };
      changes.unshift(`${powerEffect.targetName}：${outcome}`);
      return { kind: 'power', actor: action.actor, title: `${sideName(action.actor)}が「${power.name}」を使用`, description: power.description, target: entityName(before, action.target), cardId: null, powerId: power.id, highlights: [`${action.actor}-hero`, action.target], powerEffect, changes };
    }
    if (action.type === 'play') {
      const card = BY_ID[owner.hand.find(item => item.uid === action.card).cardId];
      const highlights = new Set(action.target ? [action.target] : []);
      for (const effect of card.effects.filter(item => item.trigger === 'play')) {
        if (effect.target === 'friendly-hero') highlights.add(`${action.actor}-hero`);
        if (effect.target === 'enemy-units') before[action.actor === 'player' ? 'cpu' : 'player'].board.forEach(unit => highlights.add(unit.uid));
        if (effect.target === 'all-units') for(const side of ['player','cpu'])before[side].board.forEach(unit=>highlights.add(unit.uid));
        if (['friendly-units', 'other-friendly-units'].includes(effect.target)) owner.board.forEach(unit => highlights.add(unit.uid));
      }
      return { kind: card.type === 'weapon' ? 'equip' : card.type === 'spell' ? 'spell' : 'summon', actor: action.actor, title: `${sideName(action.actor)}が「${card.name}」を${card.type === 'weapon' ? '装備' : card.type === 'spell' ? '使用' : '召喚'}`, description: card.description, target: entityName(before, action.target), cardId: card.id, highlights: [...highlights], changes };
    }
    if(action.type==='weaponAttack'){const w=owner.weapon,card=BY_ID[w.cardId],targetId=action.target==='hero'?`${action.actor==='player'?'cpu':'player'}-hero`:action.target;return {kind:'attack',actor:action.actor,title:`${sideName(action.actor)}が武器「${card.name}」で攻撃`,description:`攻撃力${w.attack}、耐久${w.durability}。ユニットからの反撃はヒーローが同時に受けます。`,target:entityName(before,targetId),cardId:card.id,highlights:[`${action.actor}-hero`,targetId],changes};}
    const unit = owner.board.find(item => item.uid === action.attacker);
    const targetId = action.target === 'hero' ? `${action.actor === 'player' ? 'cpu' : 'player'}-hero` : action.target;
    const card = BY_ID[unit.cardId];
    return { kind: 'attack', actor: action.actor, title: `${sideName(action.actor)}の「${card.name}」が攻撃`, description: `攻撃力 ${unit.attack}。${action.target === 'hero' ? 'ヒーローからの反撃はありません。' : unit.keywords?.includes('poison') ? '毒を持つユニットの攻撃。反撃も同時に受けます。' : 'ユニット同士は同時にダメージを与え合う。'}`, target: entityName(before, targetId), cardId: card.id, highlights: [unit.uid, targetId], changes };
  }
  // 待ち時間を一時停止・再開でき、再戦時は古い待機をfalseで全解除する。
  function createPlayback(clock = {}) {
    const schedule = clock.setTimeout || setTimeout;
    const unschedule = clock.clearTimeout || clearTimeout;
    const now = clock.now || (() => Date.now());
    const pending = new Set();
    let paused = false;
    function start(item) {
      item.started = now();
      item.timer = schedule(() => { pending.delete(item); item.resolve(true); }, item.remaining);
    }
    return {
      wait(ms) {
        return new Promise(resolve => {
          const item = { remaining: Math.max(0, ms), started: 0, timer: null, resolve };
          pending.add(item);
          if (!paused) start(item);
        });
      },
      pause() {
        if (paused) return;
        paused = true;
        for (const item of pending) {
          unschedule(item.timer);
          item.remaining = Math.max(0, item.remaining - (now() - item.started));
          item.timer = null;
        }
      },
      resume() {
        if (!paused) return;
        paused = false;
        for (const item of pending) start(item);
      },
      cancel() {
        for (const item of pending) { unschedule(item.timer); item.resolve(false); }
        pending.clear(); paused = false;
      },
      isPaused: () => paused
    };
  }
  const api = { PACES, DEFAULT_PACE, resultDuration, describeAction, changesBetween, createPlayback };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeikanPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
