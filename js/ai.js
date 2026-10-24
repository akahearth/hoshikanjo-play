(function (root) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const { BY_ID } = commonJS ? require('./cards.js') : root.SeikanCards;
  const { legalActions, applyAction, other, RULES } = commonJS ? require('./engine.js') : root.SeikanEngine;
  const { hasKeyword } = commonJS ? require('./effects.js') : root.SeikanEffects;
  const { cardValue } = commonJS ? require('./strategy.js') : root.SeikanStrategy;
  const DIFFICULTIES = Object.freeze({
    easy: Object.freeze({ name: '入門', description: '今の一手を中心に判断する、練習向けの相手。', depth: 1, width: 1, ownNodes: 128, replies: 0, replyDepth: 0, replyNodes: 0 }),
    normal: Object.freeze({ name: '標準', description: 'マナの使い方とカードの組み合わせ、直後の反撃を考えます。', depth: 4, width: 6, ownNodes: 320, replies: 6, replyDepth: 3, replyNodes: 65 }),
    hard: Object.freeze({ name: '上級', description: '連続した行動と次の反撃を読み、勝ち筋と生存を探ります。', depth: 8, width: 10, ownNodes: 1600, replies: 10, replyDepth: 6, replyNodes: 180 }),
    expert: Object.freeze({name:'達人',description:'より広い手順と武器の反撃を読み、限られた情報から勝ち筋を探します。',depth:10,width:14,ownNodes:4000,replies:12,replyDepth:8,replyNodes:300})
  });
  const STYLES = Object.freeze({
    balanced: Object.freeze({ name: '均衡', description: '盤面・攻撃・回復の釣り合いを重視。', attack: 1.35, health: .8, shield: 2.6, taunt: .9, ownHp: .8, enemyHp: .9, danger: .9, enemyBoard: 1 }),
    aggressive: Object.freeze({ name: '攻勢', description: '相手ヒーローへの圧力を重視。', attack: 1.55, health: .65, shield: 2.3, taunt: .6, ownHp: .55, enemyHp: 1.35, danger: .5, enemyBoard: .9 }),
    defensive: Object.freeze({ name: '守勢', description: '味方の生存と危険な敵の除去を重視。', attack: 1.15, health: 1, shield: 3, taunt: 1.8, ownHp: 1.1, enemyHp: .65, danger: 1.2, enemyBoard: 1.15 })
  });
  function normalizeOptions(options = {}) {
    options = options || {};
    return { difficulty: Object.hasOwn(DIFFICULTIES, options.difficulty) ? options.difficulty : 'normal',
      style: Object.hasOwn(STYLES, options.style) ? options.style : 'balanced' };
  }
  function unitValue(unit, style = STYLES.balanced) {
    return unit.attack * style.attack + unit.hp * style.health + (unit.shield ? style.shield : 0)
      + (hasKeyword(unit, 'poison') ? 1.8 : 0) + (hasKeyword(unit, 'taunt') ? style.taunt : 0);
  }
  function summonValue(card) {
    return unitValue({ attack: card.attack, hp: card.health, shield: card.keywords.includes('aegis'), keywords: card.keywords }) + 1;
  }
  // 互換API。手札10枚以内のユニットのマナ配分を求める。
  function bestSummons(state, side) {
    const owner = state[side]; const slots = 5 - owner.board.length;
    const hand = owner.hand.filter(item => BY_ID[item.cardId].type === 'unit');
    let best = { score: 0, cards: [] };
    function visit(index, mana, cards, score) {
      if (score > best.score) best = { score, cards: [...cards] };
      if (index >= hand.length || cards.length >= slots) return;
      for (let i = index; i < hand.length; i++) {
        const item = hand[i]; const card = BY_ID[item.cardId];
        if (card.cost <= mana) { cards.push(item.uid); visit(i + 1, mana - card.cost, cards, score + summonValue(card)); cards.pop(); }
      }
    }
    visit(0, owner.mana, [], 0); return best.cards;
  }
  // 未公開のカードは「枚数だけ」の仮札にする。実物の中身をコピー・走査しない。
  // 仮札をプレイする探索は禁止。ドロー後の枚数・手札上限・疲労だけを正しく再現する。
  function observe(state, side) {
    const view = { version: state.version, first:state.first, mode:state.mode, status: state.status, winner: state.winner, active: state.active, turn: state.turn, nextId: state.nextId, entropy:1, simulation:true, uncertain:false, log: [] };
    if(state.choice?.side===side)view.choice=JSON.parse(JSON.stringify(state.choice));
    for (const actor of ['player', 'cpu']) {
      const owner = state[actor];
      view[actor] = {
        hp: owner.hp, maxHp: owner.maxHp, mana: owner.mana, maxMana: owner.maxMana, temporaryMana:owner.temporaryMana || 0, turns: owner.turns, fatigue: owner.fatigue,
        heroPower: owner.heroPower, powerUsed: owner.powerUsed, heroAttacked:!!owner.heroAttacked, weapon:owner.weapon?{...owner.weapon}:null, planningValue:0, deckName: '',
        deck: Array(owner.deck.length).fill('moss-spirit'),
        hand: actor === side ? owner.hand.map(card => ({ uid: card.uid, cardId: card.cardId }))
          : Array.from({ length: owner.hand.length }, (_, index) => ({ uid: 'fog-' + actor + '-' + index, cardId: 'moss-spirit' })),
        board: owner.board.map(unit => ({
          uid: unit.uid, cardId: unit.cardId, attack: unit.attack, hp: unit.hp, maxHp: unit.maxHp, ready: unit.ready,
          keywords: [...(unit.keywords || [])], shield: Boolean(unit.shield), shieldBroken: Boolean(unit.shieldBroken),silenced:!!unit.silenced
        }))
      };
    }
    return view;
  }
  function evaluate(state, side, style) {
    if (state.status === 'finished') return state.winner === side ? (state.uncertain?500:100000) : state.winner === 'draw' ? 0 : -100000;
    const owner = state[side]; const enemy = state[other(side)];
    const boardScore = player => player.board.reduce((sum, unit) => {
      const death = !unit.silenced && BY_ID[unit.cardId].effects.some(effect => effect.trigger === 'death') ? .6 : 0;
      return sum + unitValue(unit, style) + death;
    }, 0);
    const base=boardScore(owner) - boardScore(enemy) * style.enemyBoard
      + owner.hp * style.ownHp - Math.max(0, 10 - owner.hp) * style.danger
      - enemy.hp * style.enemyHp + Math.max(0, 8 - enemy.hp) * .3
      // 終了済みターンの余りマナは持ち越せない。使い残しを有利と数えない。
      + owner.hand.length * 1.5 - enemy.hand.length * 1.1 + (state.active===side?owner.mana*.03:0)
      + (owner.weapon?owner.weapon.attack*Math.min(3,owner.weapon.durability)*.6:0) - (enemy.weapon?enemy.weapon.attack*Math.min(3,enemy.weapon.durability)*.6:0) + (owner.planningValue||0)-(enemy.planningValue||0);
    if(!style.advanced)return base;
    const guards=owner.board.filter(u=>hasKeyword(u,'taunt'));
    const guardHp=guards.reduce((sum,u)=>sum+u.hp+(u.shield?3:0),0);
    const incoming=enemy.board.reduce((sum,u)=>sum+u.attack,0)+(enemy.weapon?.attack||0)+(enemy.heroPower==='ember-call'?1:0);
    const danger=Math.max(0,incoming-guardHp);
    const lethalRisk=danger>=owner.hp?65:Math.max(0,danger-owner.hp+5)*1.7;
    const handQuality=owner.hand.reduce((sum,c)=>sum+(c.discovered?.8:c.uid.startsWith('fog-')?0:Math.min(.3,cardValue(BY_ID[c.cardId])*.02)),0);
    const shieldQuality=owner.board.reduce((sum,u)=>sum+(u.shield?Math.min(1,u.attack*.1):0),0)-enemy.board.reduce((sum,u)=>sum+(u.shield?Math.min(1,u.attack*.1):0),0);
    return base-lethalRisk+handQuality+shieldQuality+(owner.board.length-enemy.board.length)*.5+Math.max(0,10-enemy.hp)*.2;
  }
  function positionKey(state) {
    return JSON.stringify([state.active, state.status, state.winner, ...['player', 'cpu'].map(side => {
      const p = state[side];
      return [p.hp, p.mana, p.maxMana, p.weapon, p.heroAttacked, p.planningValue, state.uncertain, p.temporaryMana, p.fatigue, p.powerUsed, p.deck.length, p.hand.map(c => [c.uid, c.cardId]),
        p.board.map(u => [u.uid, u.cardId, u.attack, u.hp, u.maxHp, u.ready, u.shield, u.shieldBroken, u.keywords, u.silenced])];
    })]);
  }
  function compare(a, b) { return b.score - a.score || a.depth - b.depth || b.quality - a.quality; }
  function uniqueBest(nodes, limit) {
    const positions = new Map();
    for (const node of nodes.sort(compare)) { const key = positionKey(node.state); if (!positions.has(key)) positions.set(key, node); }
    return [...positions.values()].slice(0, limit);
  }
  function step(state, action, budget, stats) {
    if (budget.remaining <= 0) return null;
    budget.remaining--; stats.nodes++;
    const result = applyAction(state, action);
    if(result.ok&&action.type==='play'){
      const card=BY_ID[state[action.actor].hand.find(c=>c.uid===action.card).cardId];
      if(card.effects.some(e=>['missiles','transformRandom'].includes(e.type)||(e.type==='summon'&&!e.into)||e.target==='strongest-enemy'))result.state.uncertain=true;
      // 山札の実物を参照せず、残り枚数だけから変異の将来価値を控えめに見積もる。
      for(const e of card.effects.filter(e=>e.type==='mutate'))result.state[action.actor].planningValue=(result.state[action.actor].planningValue||0)+Math.min(4,state[action.actor].deck.length*.3)*(e.delta===0?.65:e.from==='unit'?.5:1);
    }
    // まだ起きていない発見の候補は未知。平均的な手札1枚として評価し、
    // 実際に発見した後の次の思考でだけ、公開された3候補を比較する。
    if(result.ok&&result.state.choice&&!state.choice){
      const side=result.state.choice.side;
      if(result.state[side].hand.length<10)result.state[side].hand.push({uid:`fog-discovery-${result.state.nextId++}`,cardId:'moss-spirit',discovered:true});
      result.state.choice=null;result.state.effectQueue=[];
    }
    return result.ok ? result.state : null;
  }
  function* forecast(initial, side, style, config, stats) {
    if (initial.status === 'finished') return evaluate(initial, side, style);
    const enemy = other(side); const budget = { remaining: config.replyNodes };
    let worst = evaluate(initial, side, style);
    // 挑発がなければ、全体の顔面打点も実際の合法手で確認する。
    // 小さな攻撃の合計による次ターンの敗北を、探索の枝刈りで見落とさない。
    if (!initial[side].board.some(unit => hasKeyword(unit, 'taunt'))) {
      let face = initial;
      for (let i = 0; i < 7 && face.status === 'playing'; i++) {
        const action = legalActions(face, enemy).find(a => ['attack','weaponAttack'].includes(a.type) && a.target === 'hero')
          || legalActions(face, enemy).find(a => a.type === 'power' && a.target === side + '-hero');
        if (!action) break;
        face = step(face, action, budget, stats);
        if (!face) break;
        if (stats.nodes % 32 === 0) yield stats;
        if (face.winner === enemy) return -100000;
        worst = Math.min(worst, evaluate(face, side, style));
      }
    }
    let frontier = [{ state: initial }];
    for (let depth = 0; depth < config.replyDepth && frontier.length && budget.remaining > 0; depth++) {
      const next = [];
      for (const node of frontier) {
        // 相手の手札は公開されていない。盤面の攻撃と既知のパワーだけを読む。
        for (const action of legalActions(node.state, enemy).filter(a => a.type !== 'play')) {
          const state = step(node.state, action, budget, stats);
          if (!state) break;
          if (stats.nodes % 32 === 0) yield stats;
          const score = evaluate(state, side, style);
          if (state.winner === enemy) return -100000;
          worst = Math.min(worst, score);
          if (action.type !== 'end' && state.status === 'playing') next.push({ state, score, depth: 0, quality: 0 });
        }
      }
      // 反撃する側にとって有利な少数の局面を残す。
      frontier = uniqueBest(next.map(n => ({ ...n, score: -n.score })), config.ownNodes>=4000?3:2);
    }
    return worst;
  }
  function informationFirst(state,side,stats){
    const chosen=stats.action,owner=state[side];
    const reserved=chosen?.type==='play'?BY_ID[owner.hand.find(c=>c.uid===chosen.card)?.cardId]:null;
    if(reserved?.type!=='unit')return stats;
    // 未来の札は見ず、予定の召喚のマナと場枠を残せる情報源だけ先行する。
    const candidates=[];
    for(const action of legalActions(state,side)){
      if(action.type!=='play'||action.card===chosen.card)continue;
      const card=BY_ID[owner.hand.find(c=>c.uid===action.card).cardId],effects=card.effects.filter(e=>e.trigger==='play');
      const draws=effects.filter(e=>e.type==='draw').reduce((n,e)=>n+e.amount,0),discovers=effects.filter(e=>e.type==='discover').length;
      const slots=(card.type==='unit'?1:0)+effects.filter(e=>e.type==='summon').reduce((n,e)=>n+e.amount,0);
      if(draws+discovers>0&&owner.deck.length>=draws&&owner.hand.length-1+draws+discovers<=RULES.handLimit
        &&card.cost+reserved.cost<=owner.mana&&owner.board.length+slots<RULES.boardLimit)candidates.push({action,draws,discovers,cost:card.cost});
    }
    candidates.sort((a,b)=>(b.draws+b.discovers)-(a.draws+a.discovers)||a.cost-b.cost);
    if(!candidates.length)return stats;
    // 時間上限で返す一手にも適用するが、既知の即時勝利を置き換えない。
    const outcome=applyAction(state,chosen);
    if(outcome.ok&&outcome.state.winner===side)return stats;
    const first=candidates[0];stats.action=first.action;
    if(stats.trace)stats.trace.ordering={reserved:{...chosen},reservedCost:reserved.cost,sourceCost:first.cost,
      ...(first.draws?{drawCost:first.cost}:{}),draws:first.draws,discovers:first.discovers};
    return stats;
  }
  function* search(input, side, options) {
    const settings = normalizeOptions(options); const config = DIFFICULTIES[settings.difficulty]; const style = {...STYLES[settings.style],advanced:settings.difficulty!=='easy'};
    const stats = { ...settings, nodes: 0, action: null };
    // 判断に用いた数値だけを任意で記録する。再探索や秘密情報の参照はしない。
    if(options?.trace)stats.trace={method:'reply',baseline:null,candidates:[]};
    const record=(action,score,extra={})=>{if(stats.trace)stats.trace.candidates.push({action:{...action},score,...extra});};
    if (!['player', 'cpu'].includes(side) || input.status !== 'playing' || input.active !== side) return stats;
    if(input.choice){
      if(stats.trace)stats.trace.method='discover';
      const view=observe(input,side);let best=-Infinity;
      for(const action of legalActions(view,side)){
        const candidate=view.choice.options.find(c=>c.uid===action.choice),card=BY_ID[candidate.cardId];
        let value=cardValue(card)+(card.cost<=view[side].mana?1.5:0);
        const enemy=view[other(side)];
        if(card.effects.some(e=>e.type==='transform'&&e.into==='cotton-sprout'))value+=Math.max(0,...enemy.board.map(u=>unitValue(u)))*.3;
        if(card.target==='enemy-character'&&card.effects.some(e=>e.type==='damage'&&e.amount>=enemy.hp)&&card.cost<=view[side].mana)value+=1000;
        record(action,value);stats.nodes++;if(value>best){best=value;stats.action=action;}
      }
      return stats;
    }
    const state = observe(input, side); const known = new Set(state[side].hand.map(card => card.uid));
    const actionsFor = s => {
      const actions=legalActions(s,side).filter(a=>a.type!=='play'||known.has(a.card));
      if(settings.difficulty==='easy')return actions;
      function priority(a){
        if(a.type==='end')return -1000;
        if(a.type==='weaponAttack')return s[side].weapon.attack>=s[other(side)].hp?10000:5;
        if(a.type==='attack'){
          const unit=s[side].board.find(u=>u.uid===a.attacker);
          if(a.target==='hero')return unit.attack>=s[other(side)].hp?10000:unit.attack*.5;
          const enemy=s[other(side)].board.find(u=>u.uid===a.target);
          return (enemy.shield?unit.attack<=2?5:0:enemy.hp<=unit.attack||hasKeyword(unit,'poison')?unitValue(enemy):0)+(hasKeyword(enemy,'taunt')?2:0);
        }
        if(a.type==='play'){const card=BY_ID[s[side].hand.find(c=>c.uid===a.card).cardId];return cardValue(card)+(card.effects.some(e=>e.type==='mana')?6:0);}
        return 1;
      }
      return actions.sort((a,b)=>priority(b)-priority(a));
    };
    const budget = { remaining: config.ownNodes }; const baseline = evaluate(state, side, style);
    if(stats.trace)stats.trace.baseline=baseline;
    const end = { type: 'end', actor: side };
    stats.action=end;
    if (settings.difficulty === 'easy') {
      if(stats.trace)stats.trace.method='immediate';
      let score = baseline; stats.action = end;
      for (const action of actionsFor(state)) {
        const next = step(state, action, budget, stats); if (!next) break;
        if (stats.nodes % 32 === 0) yield stats;
        if (next.winner === side && !next.uncertain) { record(action,100000,{winning:true});stats.action = action; return stats; }
        let value = evaluate(next, side, style);
        // 入門も一時マナを「直後の1手」とセットで判断する。通常の探索上限内で行う。
        if (action.type === 'play' && BY_ID[state[side].hand.find(card=>card.uid===action.card).cardId].effects.some(effect=>effect.type==='mana')) {
          for (const follow of actionsFor(next).filter(item=>item.type!=='end')) {
            const future=step(next,follow,budget,stats);if(!future)break;
            if(stats.nodes%32===0)yield stats;
            if(future.winner===side&&!future.uncertain){record(action,100000,{winning:true});stats.action=action;return stats;}
            value=Math.max(value,evaluate(future,side,style));
          }
        }
        record(action,value);
        if (action.type !== 'end' && value > score + .00001) {
          stats.action = action; score = value;
        }
      }
      return informationFirst(state,side,stats);
    }
    let frontier = [{ state, first: null, score: baseline, quality: 0, depth: 0 }];
    let partialScore=baseline;
    const endings = [];
    for (let depth = 0; depth < config.depth && frontier.length; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const action of actionsFor(node.state)) {
          // 最後に候補をターン終了まで進める分を確保する。
          if (budget.remaining <= config.width) break;
          const child = step(node.state, action, budget, stats); if (!child) break;
          const score = evaluate(child, side, style);
          // 時間切れでも、実際に評価済みの合法な一手を返せるよう保持する。
          if(depth===0&&score>partialScore){partialScore=score;stats.action=action;}
          if (stats.nodes % 32 === 0) yield stats;
          const entry = { state: child, first: node.first || action, score, depth: node.depth + 1, quality: node.quality + score - baseline };
          if (child.winner === side && !child.uncertain) { if(stats.trace)stats.trace.method='lethal';record(entry.first,100000,{winning:true,depth:entry.depth});stats.action = entry.first; return stats; }
          if (action.type === 'end' || child.status === 'finished') endings.push(entry); else next.push(entry);
        }
      }
      frontier = uniqueBest(next, config.width);
      if (budget.remaining <= config.width) break;
    }
    for (const node of frontier) {
      const child = step(node.state, end, budget, stats); if (!child) break;
      if (stats.nodes % 32 === 0) yield stats;
      endings.push({ ...node, state: child, first: node.first || end, score: evaluate(child, side, style) });
    }
    const candidates = uniqueBest(endings, config.replies);
    const baselineEnd = endings.find(node => node.first.type === 'end');
    if (baselineEnd && !candidates.some(node => positionKey(node.state) === positionKey(baselineEnd.state))) {
      candidates.splice(config.replies - 1, 1, baselineEnd);
    }
    let best = null;
    for (const candidate of candidates) {
      const score = yield* forecast(candidate.state, side, style, config, stats);
      const ranked = { ...candidate, positionScore: candidate.score, score };
      record(candidate.first,score,{positionScore:candidate.score,depth:candidate.depth});
      if (!best || ranked.score > best.score || (ranked.score === best.score && (ranked.positionScore > best.positionScore || (ranked.positionScore === best.positionScore && compare(ranked, best) < 0)))) {best = ranked;stats.action=best.first;}
    }
    stats.action = best?.first || end; return informationFirst(state,side,stats);
  }
  function analyze(state, side = 'cpu', options = {}) {
    const iterator = search(state, side, options); let next;
    do { next = iterator.next(); } while (!next.done);
    return next.value;
  }
  function chooseAction(state, side = 'cpu', options = {}) { return analyze(state, side, options).action; }
  async function chooseActionAsync(state, side = 'cpu', options = {}) {
    const cancelled = options.isCancelled || (() => false);
    const pause = options.yieldControl || (() => new Promise(resolve => setTimeout(() => resolve(true), 0)));
    if (cancelled() || await pause() === false || cancelled()) return null;
    const iterator = search(state, side, options);
    const now=options.now||(()=>Date.now());
    const maxTime=Number.isFinite(options.maxThinkMs)?Math.max(0,options.maxThinkMs):Infinity;
    let elapsed=0;
    while (!cancelled()) {
      const started=now(),next = iterator.next();elapsed+=Math.max(0,now()-started);
      if(cancelled())return null;
      if (next.done) { options.onAnalysis?.(next.value);return next.value.action; }
      if(elapsed>=maxTime&&next.value?.action){
        const stats=next.value;stats.timeLimited=true;
        // 未完了の反撃探索を完了済みとして扱わない。
        if(stats.trace)stats.trace={method:'bounded',baseline:stats.trace.baseline,candidates:[]};
        informationFirst(observe(state,side),side,stats);
        iterator.return();options.onAnalysis?.(stats);return stats.action;
      }
      if (await pause() === false) return null;
    }
    return null;
  }
  const api = { DIFFICULTIES, STYLES, normalizeOptions, chooseAction, chooseActionAsync, analyze, bestSummons };
  if (commonJS) module.exports = api; else root.SeikanAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
