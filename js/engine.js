(function (root) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const { BY_ID, FIXED_DECK, SUPPORT_CARD } = commonJS ? require('./cards.js') : root.SeikanCards;
  const { BY_POWER, DEFAULT_POWER, HERO_FOR_POWER } = commonJS ? require('./heroes.js') : root.SeikanHeroes;
  const { deckErrors: arenaDeckErrors } = commonJS ? require('./arena.js') : root.SeikanArena;
  const { cardListErrors } = commonJS ? require('./decks.js') : root.SeikanDecks;
  const { hasKeyword, damage, resolveEffects } = commonJS ? require('./effects.js') : root.SeikanEffects;
  const { chooseMulligan } = commonJS ? require('./strategy.js') : root.SeikanStrategy;
  const RULES = Object.freeze({ heroHealth: 25, boardLimit: 5, handLimit: 10, manaLimit: 10, initialHand: 3, arenaInitialHand: 3 });
  const other = side => side === 'player' ? 'cpu' : 'player';
  const label = side => side === 'player' ? 'あなた' : '星よみ経理';
  const clone = state => JSON.parse(JSON.stringify(state));
  function shuffle(deck, random) {
    const result = [...deck];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function log(state, message) {
    state.log.push({ turn: state.turn, side: state.active, message });
    if (state.log.length > 80) state.log.shift();
  }
  function checkWinner(state) {
    if (state.status !== 'playing') return;
    if (state.player.hp <= 0 || state.cpu.hp <= 0) {
      state.status = 'finished';
      state.winner = state.player.hp <= 0 && state.cpu.hp <= 0 ? 'draw' : state.player.hp <= 0 ? 'cpu' : 'player';
      log(state, state.winner === 'draw' ? '引き分け。星勘定の決闘が幕を閉じた。' : `${label(state.winner)}の勝利。星勘定の決闘が幕を閉じた。`);
    }
  }
  function draw(state, side) {
    if (!['playing', 'mulligan'].includes(state.status)) return;
    const owner = state[side];
    if (!owner.deck.length) {
      owner.fatigue++;
      owner.hp -= owner.fatigue;
      log(state, `${label(side)}：山札切れで${owner.fatigue}ダメージ。`);
      checkWinner(state);
      return;
    }
    const cardId = owner.deck.shift();
    if (owner.hand.length >= RULES.handLimit) {
      log(state, `${label(side)}：手札が10枚のため「${BY_ID[cardId].name}」を失った。`);
      return;
    }
    owner.hand.push({ uid: `card-${state.nextId++}`, cardId });
    if (state.turn > 0) log(state, `${label(side)}がカードを1枚引いた。`);
  }
  function startTurn(state, side) {
    state.active = side;
    state.turn++;
    const owner = state[side];
    owner.turns++;
    owner.maxMana = Math.min(RULES.manaLimit, owner.maxMana + 1);
    owner.mana = owner.maxMana;
    owner.temporaryMana = 0;
    owner.powerUsed = false;
    owner.heroAttacked = false;
    owner.board.forEach(unit => { unit.ready = true; });
    log(state, `${label(side)}のターン。マナ ${owner.mana} / ${owner.maxMana}`);
    if(owner.turns>1||side!==state.first)draw(state, side);
    else log(state, '先攻の初回ターンはドローなし。');
  }
  function createGame(random = Math.random, options = {}) {
    if (options.mode !== undefined && !['constructed','arena'].includes(options.mode)) throw new Error('対戦形式が不正です。');
    const first = options.first === undefined ? (random() < .5 ? 'player' : 'cpu') : options.first;
    if (!['player','cpu'].includes(first)) throw new Error('先攻の指定が不正です。');
    const owner = side => {
      const deck = options[`${side}Deck`] || FIXED_DECK;
      const heroPower = options[`${side}Power`] || DEFAULT_POWER;
      const errors = options.mode === 'arena' ? arenaDeckErrors(deck) : cardListErrors(deck);
      if (errors.length) throw new Error(errors[0]);
      if (!Object.hasOwn(BY_POWER, heroPower)) throw new Error('ヒーローパワーが不正です。');
      return { hp: RULES.heroHealth, maxHp: RULES.heroHealth, mana: 0, maxMana: 0, temporaryMana: 0, turns: 0, fatigue: 0, deck: shuffle(deck, random), hand: [], board: [], weapon:null, heroAttacked:false, heroPower, heroId: HERO_FOR_POWER[heroPower].id, powerUsed: false, deckName: options[`${side}Name`] || '星勘定はじめました' };
    };
    const state = { version: 6, mode: options.mode || 'constructed', first, mulligan: { player:false, cpu:false }, status: 'mulligan', winner: null, active: first, turn: 0, nextId: 1, player: owner('player'), cpu: owner('cpu'), log: [] };
    const initialHand=state.mode==='arena'?RULES.arenaInitialHand:RULES.initialHand;
    for (let i = 0; i < initialHand; i++) { draw(state, 'player'); draw(state, 'cpu'); }
    state.entropy=Math.floor(random()*4294967296)>>>0;
    if (!options.mulligan) { state.mulligan={player:true,cpu:true}; finishOpening(state); }
    return state;
  }
  function finishOpening(state) {
    const second = other(state.first);
    state[second].hand.push({ uid: `card-${state.nextId++}`, cardId: SUPPORT_CARD.id });
    state.status = 'playing';
    log(state, `${label(state.first)}が先攻。双方の初手は3枚。後攻の${label(second)}に「後攻の先借り」を追加。先攻の初回ドローはありません。`);
    startTurn(state, state.first);
  }
  function mulliganCards(state, side) {
    return chooseMulligan(state,side);
  }
  function spendMana(owner, cost) {
    owner.mana -= cost; owner.temporaryMana = Math.max(0, (owner.temporaryMana || 0) - cost);
  }
  function targetsFor(state, actor, target) {
    const friendly = state[actor].board.map(unit => unit.uid);
    const enemy = state[other(actor)].board.map(unit => unit.uid);
    switch (target) {
      case 'friendly-character': return [`${actor}-hero`, ...friendly];
      case 'enemy-large': return state[other(actor)].board.filter(u=>u.attack>=5).map(u=>u.uid);
      case 'enemy-character': return [`${other(actor)}-hero`, ...enemy];
      case 'friendly-unit': return friendly;
      case 'enemy-unit': return enemy;
      case 'any-unit': return [...friendly,...enemy];
      default: return [];
    }
  }
  function cardTargets(state, actor, cardId) { return targetsFor(state, actor, BY_ID[cardId]?.target); }
  function powerTargets(state, actor) { return targetsFor(state, actor, BY_POWER[state[actor].heroPower]?.target); }
  function canUsePower(state, actor) {
    if (!['player', 'cpu'].includes(actor)) return '操作するプレイヤーが不正です。';
    if (state.status !== 'playing') return '対戦は終了しています。';
    if (state.choice) return '発見するカードを先に選んでください。';
    if (state.active !== actor) return '相手のターンです。';
    const owner = state[actor]; const power = BY_POWER[owner.heroPower];
    if (!power) return 'ヒーローパワーが不正です。';
    if (owner.powerUsed) return 'このターンのヒーローパワーは使用済みです。';
    if (owner.mana < power.cost) return `ヒーローパワーには${power.cost}マナ必要です。`;
    if (!powerTargets(state, actor).length) return 'ヒーローパワーの対象になるユニットがいません。';
    return null;
  }
  function attackTargets(state, actor) {
    const enemy = state[other(actor)].board;
    const guards = enemy.filter(unit => hasKeyword(unit, 'taunt'));
    return guards.length ? guards.map(unit => unit.uid) : ['hero', ...enemy.map(unit => unit.uid)];
  }
  function canWeaponAttack(state,actor) {
    if(!['player','cpu'].includes(actor))return '操作するプレイヤーが不正です。';
    if(state.status!=='playing'||state.active!==actor||state.choice)return '今は武器で攻撃できません。';
    if(!state[actor].weapon)return '武器を装備していません。';
    if(state[actor].heroAttacked)return 'このターンはヒーローの攻撃済みです。';
    return null;
  }
  function canPlayCard(state, actor, uid) {
    if (!['player', 'cpu'].includes(actor)) return '操作するプレイヤーが不正です。';
    if (state.status !== 'playing') return '対戦は終了しています。再戦できます。';
    if (state.choice) return '発見するカードを先に選んでください。';
    if (state.active !== actor) return '相手のターンです。少しお待ちください。';
    const owner = state[actor];
    const instance = owner.hand.find(card => card.uid === uid);
    if (!instance) return 'そのカードは手札にありません。';
    const card = BY_ID[instance.cardId];
    if (card.effects.some(effect => effect.type === 'mana') && owner.mana >= RULES.manaLimit) return '使用可能なマナは最大10です。';
    if (owner.mana < card.cost) return `マナが足りません。あと${card.cost - owner.mana}マナ必要です。`;
    if (card.type === 'unit' && owner.board.length >= RULES.boardLimit) return '場は5体までです。空きを作ってから召喚してください。';
    if (card.target && !cardTargets(state, actor, card.id).length) return 'この呪文の対象になるユニットがいません。';
    return null;
  }
  function validate(state, action) {
    if (!action || !['player', 'cpu'].includes(action.actor)) return '操作するプレイヤーが不正です。';
    if (state.status === 'mulligan') {
      if (action.type !== 'mulligan') return 'まず初手の交換を確定してください。';
      if (state.mulligan[action.actor]) return '初手の交換は1回だけです。';
      if (!Array.isArray(action.cards) || new Set(action.cards).size !== action.cards.length || action.cards.some(uid=>!state[action.actor].hand.some(card=>card.uid===uid))) return '交換する初手のカードを正しく指定してください。';
      return null;
    }
    if (state.status !== 'playing') return '対戦は終了しています。再戦できます。';
    if (action.actor !== state.active) return '相手のターンです。少しお待ちください。';
    if(state.choice){
      if(action.type!=='choose'||state.choice.side!==action.actor||!state.choice.options.some(c=>c.uid===action.choice))return '発見の候補から1枚を選んでください。';
      return null;
    }
    const owner = state[action.actor];
    if (action.type === 'end') return null;
    if (action.type === 'power') {
      const reason = canUsePower(state, action.actor);
      if (reason) return reason;
      if (!powerTargets(state, action.actor).includes(action.target)) return 'ヒーローパワーの有効な対象を選んでください。';
      return null;
    }
    if (action.type === 'play') {
      const reason = canPlayCard(state, action.actor, action.card);
      if (reason) return reason;
      const card = BY_ID[owner.hand.find(item => item.uid === action.card).cardId];
      if (card.target && !cardTargets(state, action.actor, card.id).includes(action.target)) return '呪文の有効な対象を選んでください。';
      if (!card.target && action.target !== undefined) return 'このカードには対象の指定は不要です。';
      return null;
    }
    if(action.type==='weaponAttack'){
      const reason=canWeaponAttack(state,action.actor);if(reason)return reason;
      return attackTargets(state,action.actor).includes(action.target)?null:'挑発を持つ敵ユニットか有効な対象を選んでください。';
    }
    if (action.type === 'attack') {
      const attacker = owner.board.find(unit => unit.uid === action.attacker);
      if (!attacker) return '攻撃するユニットが見つかりません。';
      if (!attacker.ready) return 'このユニットは召喚したターンか、すでに攻撃済みです。';
      if (attacker.attack <= 0) return '攻撃力が0のユニットは攻撃できません。';
      if (action.target !== 'hero' && !state[other(action.actor)].board.some(unit => unit.uid === action.target)) return '敵のユニットか敵ヒーローを選んでください。';
      if (!attackTargets(state, action.actor).includes(action.target)) return '挑発を持つ敵ユニットを先に攻撃してください。';
      return null;
    }
    return '未対応の操作です。';
  }
  function makeUnit(instance) {
    const card = BY_ID[instance.cardId];
    return { uid: instance.uid, cardId: card.id, attack: card.attack, hp: card.health, maxHp: card.health, ready: card.keywords.includes('swift'), keywords: [...card.keywords], shield: card.keywords.includes('aegis'), shieldBroken: false, silenced:false };
  }
  function applyAction(state, action, random = Math.random) {
    const error = validate(state, action);
    if (error) return { ok: false, state, message: error, event: null, effects: [] };
    const next = clone(state);
    const owner = next[action.actor];
    if (action.type === 'mulligan') {
      const returned=owner.hand.filter(card=>action.cards.includes(card.uid));
      owner.hand=owner.hand.filter(card=>!action.cards.includes(card.uid));
      for (let i=0;i<returned.length;i++) draw(next,action.actor);
      owner.deck=shuffle([...owner.deck,...returned.map(card=>card.cardId)],random);
      next.mulligan[action.actor]=true;
      log(next,`${label(action.actor)}が初手${returned.length}枚を交換。`);
      if (next.mulligan.player && next.mulligan.cpu) finishOpening(next);
      return {ok:true,state:next,message:next.log.at(-1).message,event:{type:'mulligan',side:action.actor},effects:[]};
    }
    const hooks = { makeUnit, log: message => log(next, message), draw: side => draw(next, side), checkWinner: () => checkWinner(next), gainMana(side,amount) {
      const recipient=next[side]; const gain=Math.max(0,Math.min(amount,RULES.manaLimit-recipient.mana));
      recipient.mana+=gain; recipient.temporaryMana=(recipient.temporaryMana||0)+gain;
      log(next,`${label(side)}の一時マナ+${gain}。このターン終了時に消滅。`);
      return gain;
    } };
    let event;
    let effects = [];
    if (action.type === 'choose') {
      const choice=next.choice,selected=choice.options.find(c=>c.uid===action.choice),queue=next.effectQueue||[];
      next.choice=null;next.effectQueue=[];
      const burned=owner.hand.length>=RULES.handLimit;
      if(!burned)owner.hand.push({uid:`card-${next.nextId++}`,cardId:selected.cardId});
      log(next,`${label(action.actor)}が「${BY_ID[selected.cardId].name}」を発見${burned?'したが、手札が10枚のため失った。':'して手札に加えた。'}`);
      effects=resolveEffects(next,[],choice.source,null,hooks,queue);
      event={type:'discover',side:action.actor,cardId:selected.cardId,burned};
    } else if (action.type === 'power') {
      const power = BY_POWER[owner.heroPower];
      spendMana(owner, power.cost); owner.powerUsed = true;
      log(next, `${label(action.actor)}がヒーローパワー「${power.name}」を使用。`);
      effects = resolveEffects(next, power.effects, { side: action.actor, uid: `${action.actor}-hero`, name: power.name, type: 'power' }, action.target, hooks);
      event = { type: 'power', side: action.actor, powerId: power.id, target: action.target };
    } else if (action.type === 'play') {
      const index = owner.hand.findIndex(card => card.uid === action.card);
      const instance = owner.hand.splice(index, 1)[0];
      const card = BY_ID[instance.cardId];
      spendMana(owner, card.cost);
      if (card.type === 'unit') owner.board.push(makeUnit(instance));
      if (card.type === 'weapon') owner.weapon={uid:instance.uid,cardId:card.id,attack:card.attack,durability:card.durability};
      log(next, `${label(action.actor)}が「${card.name}」を${card.type === 'weapon' ? '装備' : card.type === 'spell' ? '使用' : '召喚'}。`);
      effects = resolveEffects(next, card.effects.filter(effect => effect.trigger === 'play'), { side: action.actor, uid: instance.uid, cardId: card.id }, action.target, hooks);
      event = { type: card.type === 'weapon' ? 'equip' : card.type === 'spell' ? 'spell' : 'play', side: action.actor, unit: instance.uid, target: action.target };
    } else if(action.type==='weaponAttack') {
      const weapon=owner.weapon,card=BY_ID[weapon.cardId];owner.heroAttacked=true;
      const target=action.target==='hero'?null:next[other(action.actor)].board.find(u=>u.uid===action.target);
      const hit=damage(next,target?target.uid:`${other(action.actor)}-hero`,weapon.attack);
      if(target)damage(next,`${action.actor}-hero`,target.attack); // 毒はヒーローには効かない。
      weapon.durability--;if(weapon.durability<=0)owner.weapon=null;
      log(next,`${label(action.actor)}が武器「${card.name}」で攻撃。残り耐久${Math.max(0,weapon.durability)}。`);
      event={type:'attack',side:action.actor,attacker:`${action.actor}-hero`,target:action.target,damage:hit.amount};
      checkWinner(next);
      effects=resolveEffects(next,card.effects.filter(e=>e.trigger==='attack'),{side:action.actor,uid:weapon.uid,cardId:card.id},null,hooks);
    } else if (action.type === 'attack') {
      const attacker = owner.board.find(unit => unit.uid === action.attacker);
      attacker.ready = false;
      let hit;
      if (action.target === 'hero') {
        hit = damage(next, `${other(action.actor)}-hero`, attacker.attack);
        log(next, `「${BY_ID[attacker.cardId].name}」が${label(other(action.actor))}に${hit.amount}ダメージ。`);
      } else {
        const target = next[other(action.actor)].board.find(unit => unit.uid === action.target);
        const counterAttack = target.attack;
        const counterPoison = hasKeyword(target, 'poison');
        hit = damage(next, target.uid, attacker.attack, hasKeyword(attacker, 'poison'));
        const counterHit = damage(next, attacker.uid, counterAttack, counterPoison);
        log(next, `「${BY_ID[attacker.cardId].name}」と「${BY_ID[target.cardId].name}」が交戦。`);
        if (hit.blocked || counterHit.blocked) log(next, '星護がダメージを防ぎ、砕けた。');
        if (hit.poisoned || counterHit.poisoned) log(next, '毒で傷ついたユニットが倒れた。');
      }
      event = { type: 'attack', side: action.actor, attacker: action.attacker, target: action.target, damage: hit.amount };
      checkWinner(next);
      effects = resolveEffects(next, [], { side: action.actor, uid: attacker.uid, cardId: attacker.cardId }, null, hooks);
    } else {
      owner.mana -= owner.temporaryMana || 0; owner.temporaryMana = 0;
      startTurn(next, other(action.actor));
      event = { type: 'turn', side: next.active };
    }
    checkWinner(next);
    return { ok: true, state: next, message: next.log.at(-1).message, event, effects };
  }
  function legalActions(state, actor = state.active) {
    if (state.status !== 'playing' || actor !== state.active) return [];
    if(state.choice)return state.choice.side===actor?state.choice.options.map(c=>({type:'choose',actor,choice:c.uid})):[];
    const actions = [{ type: 'end', actor }];
    if (!canUsePower(state, actor)) for (const target of powerTargets(state, actor)) actions.push({ type: 'power', actor, target });
    for (const instance of state[actor].hand) {
      if (canPlayCard(state, actor, instance.uid)) continue;
      const card = BY_ID[instance.cardId];
      if (card.target) for (const target of cardTargets(state, actor, card.id)) actions.push({ type: 'play', actor, card: instance.uid, target });
      else actions.push({ type: 'play', actor, card: instance.uid });
    }
    if(!canWeaponAttack(state,actor))for(const target of attackTargets(state,actor))actions.push({type:'weaponAttack',actor,target});
    for (const unit of state[actor].board.filter(unit => unit.ready && unit.attack > 0)) {
      for (const target of attackTargets(state, actor)) actions.push({ type: 'attack', actor, attacker: unit.uid, target });
    }
    return actions;
  }
  const api = { RULES, createGame, validate, applyAction, legalActions, other, cardTargets, attackTargets, canPlayCard, makeUnit, canUsePower, powerTargets, mulliganCards, canWeaponAttack };
  if (commonJS) module.exports = api;
  else root.SeikanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
