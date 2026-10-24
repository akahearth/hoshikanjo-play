(function (root) {
  'use strict';
  const cjs = typeof module === 'object' && module.exports;
  const { CARDS, BY_ID } = cjs ? require('./cards.js') : root.SeikanCards;
  const { HEROES, BY_HERO } = cjs ? require('./heroes.js') : root.SeikanHeroes;
  const { draftScore } = cjs ? require('./strategy.js') : root.SeikanStrategy;
  // ヒーローだけ共有。カードは各自の非公開3候補から22回選ぶ。
  const DECK_SIZE = 22;
  const MANA_COSTS = Object.freeze([...new Set(CARDS.map(card=>card.cost))].sort((a,b)=>a-b));
  const other = side => side === 'player' ? 'cpu' : 'player';
  const copy = state => JSON.parse(JSON.stringify(state));
  function shuffle(items, random) {
    const result = [...items];
    for (let i=result.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
    return result;
  }
  function offer(state, random) {
    const heroes = state.phase === 'heroes';
    const choices=pool=>shuffle(pool,random).slice(0,3).map(item=>({uid:`pick-${state.nextId++}`,id:item.id}));
    state.offers = heroes?choices(HEROES):[];
    // カードはプレイヤーが22枚、その後CPUが22枚。待機側の候補はまだ作らない。
    state.priority = heroes?(random() < .5 ? 'player' : 'cpu'):state.player.cards.length<DECK_SIZE?'player':'cpu';
    for(const side of ['player','cpu'])state[side].offers=!heroes&&side===state.priority?choices(CARDS):[];
    state.round = heroes?0:state[state.priority].cards.length;
    state.active = state.priority; state.picks = 0;
  }
  function createDraft(random = Math.random) {
    const state = { version:4, phase:'heroes', round:0, nextId:1, active:null, priority:null, picks:0, offers:[], player:{hero:null,cards:[],offers:[]}, cpu:{hero:null,cards:[],offers:[]}, history:[] };
    offer(state, random); return state;
  }
  const choicesFor=(state,actor)=>state.phase==='heroes'?state.offers:state[actor].offers;
  // 画面には本人のカードだけを渡す。相手の候補・履歴・曲線を公開しない。
  function viewDraft(state,viewer='player'){
    if(!['player','cpu'].includes(viewer))throw Error('閲覧する側が不正です。');
    const enemy=other(viewer),own=state[viewer],opponent=state[enemy];
    return {phase:state.phase,round:state.round,active:state.active,priority:state.priority,picks:state.picks,offers:copy(choicesFor(state,viewer)),
      [viewer]:{hero:own.hero,cards:[...own.cards],count:own.cards.length},[enemy]:{hero:opponent.hero,count:opponent.cards.length},
      history:copy(state.history.filter(item=>item.phase==='heroes'||item.actor===viewer))};
  }
  function pick(state, actor, uid, random = Math.random) {
    if (!['player','cpu'].includes(actor) || state.phase === 'complete' || state.active !== actor) return {ok:false,state,message:'今はあなたの選択順ではありません。'};
    const choice = choicesFor(state,actor).find(item => item.uid === uid);
    if (!choice) return {ok:false,state,message:'そのカードはすでに選ばれたか、候補にありません。'};
    const next = copy(state);
    if(next.phase==='heroes')next.offers = next.offers.filter(item => item.uid !== uid);
    else next[actor].offers=[];
    if (next.phase === 'heroes') next[actor].hero = choice.id;
    else next[actor].cards.push(choice.id);
    next.history.push({ actor, phase:next.phase, round:next.round, id:choice.id, priority:next.priority });
    next.picks++;
    if (next.phase === 'heroes' && next.picks === 1) next.active = other(actor);
    else if(next.phase === 'cards' && next.cpu.cards.length === DECK_SIZE) {
      next.phase='complete'; next.round=DECK_SIZE; next.active=null; next.offers=[];next.player.offers=[];next.cpu.offers=[];
    } else {
      next.phase = 'cards';
      offer(next, random);
    }
    return {ok:true,state:next,choice};
  }
  function deckErrors(cards) {
    if (!Array.isArray(cards) || cards.length !== DECK_SIZE) return [`アリーナデッキは${DECK_SIZE}枚必要です。`];
    return cards.some(id=>typeof id!=='string'||!Object.hasOwn(BY_ID,id)||BY_ID[id].collectible===false) ? ['アリーナに採用できないカードが含まれています。'] : [];
  }
  function manaCurve(cards) { return MANA_COSTS.map(cost=>({cost,count:cards.filter(id=>BY_ID[id]?.cost===cost).length})); }
  // 本人の候補と獲得カードだけを使う。相手のピック・将来の候補・山札は参照しない。
  function chooseCpu(state, style = 'balanced') {
    if (state.active !== 'cpu' || state.phase === 'complete') return null;
    const heroOrder = style === 'aggressive' ? ['ember-call','green-rest','astral-ward'] : style === 'defensive' ? ['astral-ward','green-rest','ember-call'] : ['green-rest','ember-call','astral-ward'];
    function score(choice) {
      if (state.phase === 'heroes') return 3-heroOrder.indexOf(BY_HERO[choice.id].power);
      const card=BY_ID[choice.id];
      const styleBonus=style==='aggressive'&&card.keywords.includes('swift')?1:style==='defensive'&&card.keywords.includes('taunt')?1:0;
      return draftScore(card,state.cpu.cards)+styleBonus;
    }
    return [...choicesFor(state,'cpu')].sort((a,b)=>score(b)-score(a))[0]?.uid || null;
  }
  const api = { DECK_SIZE, MANA_COSTS, manaCurve, createDraft, pick, deckErrors, chooseCpu, choicesFor, viewDraft };
  if (cjs) module.exports=api; else root.SeikanArena=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
