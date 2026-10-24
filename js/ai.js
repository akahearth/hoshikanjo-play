(function (root) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const { BY_ID } = commonJS ? require('./cards.js') : root.SeikanCards;
  const { legalActions, applyAction, other, RULES } = commonJS ? require('./engine.js') : root.SeikanEngine;
  const { hasKeyword } = commonJS ? require('./effects.js') : root.SeikanEffects;
  const { cardValue } = commonJS ? require('./strategy.js') : root.SeikanStrategy;
  const intrinsicValues=new Map();
  const intrinsic=card=>{if(!intrinsicValues.has(card.id))intrinsicValues.set(card.id,cardValue(card));return intrinsicValues.get(card.id);};
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
    if(state.choice?.side===side){view.choice=JSON.parse(JSON.stringify(state.choice));view.effectQueue=JSON.parse(JSON.stringify(state.effectQueue||[]));}
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
  // 公開盤面だけで、挑発・星護・毒を使った突破後の打点を概算する。
  function publicDamage(attacker,defender,active){
    const attacks=attacker.board.filter(u=>u.attack>0&&(!active||u.ready)).map(u=>({attack:u.attack,poison:hasKeyword(u,'poison')}));
    if(attacker.weapon&&(!active||!attacker.heroAttacked))attacks.push({attack:attacker.weapon.attack,poison:false});
    const power=attacker.heroPower==='ember-call'&&(!active||!attacker.powerUsed)&&Math.min(10,attacker.maxMana+(active?0:1))>=2?1:0;
    function damage(order){
      const guards=defender.board.filter(u=>hasKeyword(u,'taunt')).map(u=>({hp:u.hp,shield:u.shield}));let total=power;
      for(const hit of order){
        const living=guards.filter(u=>u.hp>0);
        if(!living.length){total+=hit.attack;continue;}
        living.sort((a,b)=>(a.shield?1:hit.poison?0:Math.max(0,a.hp-hit.attack))-(b.shield?1:hit.poison?0:Math.max(0,b.hp-hit.attack))||a.hp-b.hp);
        const target=living[0];if(target.shield)target.shield=false;else target.hp=hit.poison?0:target.hp-hit.attack;
      }
      return total;
    }
    return Math.max(damage([...attacks].sort((a,b)=>a.attack-b.attack)),damage([...attacks].sort((a,b)=>b.attack-a.attack)));
  }
  function scoringFor(side,style,stats,enabled,reuse){
    // 探索状態は生成後に変更しない。同じオブジェクトの再評価・再展開を軽い参照キーで省く。
    // 全局面を文字列化して採点キャッシュを引くと、採点そのものより高くつくため避ける。
    const keys=new WeakMap(),direct=new WeakMap(),transitions=new WeakMap();let transitionCount=0;
    stats.cache={requests:0,computations:0,hits:0,keyBuilds:0,transitionHits:0};
    function keyFor(s){if(enabled&&keys.has(s))return keys.get(s);const key=positionKey(s);stats.cache.keyBuilds++;if(enabled)keys.set(s,key);return key;}
    function value(s){
      stats.cache.requests++;
      if(enabled&&direct.has(s)){stats.cache.hits++;return direct.get(s);}
      const v=evaluate(s,side,style);stats.cache.computations++;
      if(enabled)direct.set(s,v);return v;
    }
    const transitionKey=a=>JSON.stringify([a.type,a.actor,a.card,a.attacker,a.target,a.choice]);
    return {value,keyFor,best:(nodes,limit)=>uniqueBest(nodes,limit,keyFor),
      transition(s,a){if(!reuse)return undefined;const items=transitions.get(s);if(!items)return undefined;const key=transitionKey(a);if(items.has(key)){stats.cache.transitionHits++;return items.get(key);}},
      remember(s,a,next){if(reuse&&transitionCount<1024){let items=transitions.get(s);if(!items){items=new Map();transitions.set(s,items);}items.set(transitionKey(a),next);transitionCount++;}}
    };
  }
  function evaluate(state, side, style) {
    if (state.status === 'finished') return state.winner === side ? (state.uncertain?500:100000) : state.winner === 'draw' ? 0 : -100000;
    const owner = state[side]; const enemy = state[other(side)];
    const boardScore = player => player.board.reduce((sum, unit) => {
      const opponent=player===owner?enemy:owner;
      const death = !unit.silenced ? BY_ID[unit.cardId].effects.filter(e=>e.trigger==='death').reduce((v,e)=>v+(e.type==='draw'?Math.min(e.amount,player.deck.length,10-player.hand.length)*.6:e.type==='heal'?Math.min(e.amount,Math.max(1,player.maxHp-player.hp))*.25:.4),0) : 0;
      const shield=style.advanced&&unit.shield&&opponent.board.some(u=>u.attack>0)?Math.min(1.6,unit.attack*.18):0;
      const poison=style.advanced&&unit.attack>0&&hasKeyword(unit,'poison')?Math.min(2,Math.max(0,...opponent.board.map(u=>u.hp-unit.attack))*.18):0;
      const passive=style.advanced&&unit.attack===0?unit.hp*style.health*(hasKeyword(unit,'taunt') ? .15 : .4):0;
      return sum + unitValue(unit, style) + death+shield+poison-passive;
    }, 0);
    const base=boardScore(owner) - boardScore(enemy) * style.enemyBoard
      + owner.hp * style.ownHp - Math.max(0, 10 - owner.hp) * style.danger
      - enemy.hp * style.enemyHp + Math.max(0, 8 - enemy.hp) * .3
      // 終了済みターンの余りマナは持ち越せない。使い残しを有利と数えない。
      + owner.hand.length * 1.5 - enemy.hand.length * 1.1 + (state.active===side?owner.mana*.03:0)
      + (owner.weapon?owner.weapon.attack*Math.min(3,owner.weapon.durability)*.6:0) - (enemy.weapon?enemy.weapon.attack*Math.min(3,enemy.weapon.durability)*.6:0) + (owner.planningValue||0)-(enemy.planningValue||0);
    if(!style.advanced)return base;
    const danger=publicDamage(enemy,owner,state.active===other(side));
    const lethalRisk=danger>=owner.hp?65:Math.max(0,danger-owner.hp+5)*1.7;
    const handQuality=owner.hand.reduce((sum,c)=>{
      if(c.unknown||c.uid.startsWith('fog-'))return sum+(c.discovered ? .45 : 0);
      const card=BY_ID[c.cardId],nextMana=Math.min(10,owner.maxMana+1);
      let value=Math.min(1.4,intrinsic(card)*.06)-Math.max(0,card.cost-nextMana)*.15;
      if(card.target==='friendly-unit'&&!owner.board.length)value-=.25;
      if(card.target==='enemy-unit'&&!enemy.board.length)value-=.3;
      if(card.type==='weapon'&&owner.weapon?.durability>=2&&owner.weapon.attack>=card.attack)value-=.45;
      if(card.effects.some(e=>e.trigger==='play'&&e.type==='draw')&&!owner.deck.length)value-=1;
      return sum+value;
    },0);
    const shieldQuality=owner.board.reduce((sum,u)=>sum+(u.shield&&enemy.board.length?Math.min(1,u.attack*.1):0),0)-enemy.board.reduce((sum,u)=>sum+(u.shield&&owner.board.length?Math.min(1,u.attack*.1):0),0);
    return base-lethalRisk+handQuality+shieldQuality+(owner.board.length-enemy.board.length)*.5+Math.max(0,10-enemy.hp)*.2;
  }
  function positionKey(state) {
    return JSON.stringify([state.active,state.first,state.turn,state.nextId,state.entropy,state.status, state.winner,state.choice,state.effectQueue, ...['player', 'cpu'].map(side => {
      const p = state[side];
      return [p.hp,p.maxHp,p.turns, p.mana, p.maxMana,p.heroPower, p.weapon, p.heroAttacked, p.planningValue, state.uncertain, p.temporaryMana, p.fatigue, p.powerUsed, p.deck.length, p.hand.map(c => [c.uid, c.cardId,c.unknown,c.discovered]),
        p.board.map(u => [u.uid, u.cardId, u.attack, u.hp, u.maxHp, u.ready, u.shield, u.shieldBroken, u.keywords, u.silenced])];
    })]);
  }
  function compare(a, b) { return b.score - a.score || a.depth - b.depth || b.quality - a.quality; }
  function uniqueBest(nodes, limit, keyFor=positionKey) {
    const positions = new Map();
    for (const node of nodes.sort(compare)) { const key = keyFor(node.state); if (!positions.has(key)) positions.set(key, node); }
    return [...positions.values()].slice(0, limit);
  }
  function step(state, action, budget, stats,scoring) {
    if(stats.visits>=stats.visitLimit)return null;
    stats.visits++;
    const cached=scoring?.transition(state,action);if(cached!==undefined)return cached;
    if (budget.remaining <= 0) return null;
    budget.remaining--; stats.nodes++;
    const result = applyAction(state, action);
    if(result.ok){
      // 仮のドローを実物として使わない。今選んだ発見札だけは内容が既知。
      const selected=action.type==='choose'&&!result.event.burned?`card-${state.nextId}`:null;
      for(const side of ['player','cpu']){
        const old=new Set(state[side].hand.map(c=>c.uid));
        for(const card of result.state[side].hand)if(!old.has(card.uid)&&card.uid!==selected)card.unknown=true;
      }
      result.state.log=[];
      if(action.type==='choose'&&(state.effectQueue||[]).some(task=>['missiles','transformRandom'].includes(task.effect.type)||(task.effect.type==='summon'&&!task.effect.into)||task.effect.target==='strongest-enemy'))result.state.uncertain=true;
    }
    if(result.ok&&action.type==='play'){
      const card=BY_ID[state[action.actor].hand.find(c=>c.uid===action.card).cardId];
      if(card.effects.some(e=>['missiles','transformRandom'].includes(e.type)||(e.type==='summon'&&!e.into)||e.target==='strongest-enemy'))result.state.uncertain=true;
      // 山札の実物を参照せず、残り枚数だけから変異の将来価値を控えめに見積もる。
      for(const e of card.effects.filter(e=>e.type==='mutate'))result.state[action.actor].planningValue=(result.state[action.actor].planningValue||0)+Math.min(4,state[action.actor].deck.length*.3)*(e.delta===0?.65:e.from==='unit'?.5:1);
    }
    // まだ起きていない発見の候補は未知。平均的な手札1枚として評価し、
    // 実際に発見した後の次の思考でだけ、公開された3候補を比較する。
    if(result.ok&&result.state.choice&&(!state.choice||action.type==='choose')){
      const side=result.state.choice.side;
      if(result.state[side].hand.length<10)result.state[side].hand.push({uid:`fog-discovery-${result.state.nextId++}`,cardId:'moss-spirit',discovered:true});
      result.state.choice=null;result.state.effectQueue=[];
    }
    if(result.ok)scoring?.remember(state,action,result.state);
    return result.ok ? result.state : null;
  }
  function* forecast(initial, side, style, config, stats,scoring) {
    if (initial.status === 'finished') return scoring.value(initial);
    const enemy = other(side); const budget = { remaining: config.replyNodes };
    let worst = scoring.value(initial);
    // 挑発がなければ、全体の顔面打点も実際の合法手で確認する。
    // 小さな攻撃の合計による次ターンの敗北を、探索の枝刈りで見落とさない。
    if (!initial[side].board.some(unit => hasKeyword(unit, 'taunt'))) {
      let face = initial;
      for (let i = 0; i < 7 && face.status === 'playing'; i++) {
        const action = legalActions(face, enemy).find(a => ['attack','weaponAttack'].includes(a.type) && a.target === 'hero')
          || legalActions(face, enemy).find(a => a.type === 'power' && a.target === side + '-hero');
        if (!action) break;
        face = step(face, action, budget, stats,scoring);
        if (!face) break;
        if (stats.visits % 32 === 0) yield stats;
        if (face.winner === enemy) return -100000;
        worst = Math.min(worst, scoring.value(face));
      }
    }
    let frontier = [{ state: initial }];
    for (let depth = 0; depth < config.replyDepth && frontier.length && budget.remaining > 0; depth++) {
      const next = [];
      for (const node of frontier) {
        // 相手の手札は公開されていない。盤面の攻撃と既知のパワーだけを読む。
        for (const action of legalActions(node.state, enemy).filter(a => a.type !== 'play')) {
          const state = step(node.state, action, budget, stats,scoring);
          if (!state) break;
          if (stats.visits % 32 === 0) yield stats;
          const score = scoring.value(state);
          if (state.winner === enemy) return -100000;
          worst = Math.min(worst, score);
          if (action.type !== 'end' && state.status === 'playing') next.push({ state, score, depth: 0, quality: 0 });
        }
      }
      // 反撃する側にとって有利な少数の局面を残す。
      frontier = scoring.best(next.map(n => ({ ...n, score: -n.score })), config.ownNodes>=4000?3:2);
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
  function orderedActions(s,side,settings,known){
    const equivalent=new Set();
    const actions=legalActions(s,side).filter(a=>{
      if(a.type!=='play')return true;if(!known.has(a.card))return false;
      const key=s[side].hand.find(c=>c.uid===a.card).cardId+'|'+(a.target||'');
      if(equivalent.has(key))return false;equivalent.add(key);return true;
    });
    if(settings.difficulty==='easy')return actions;
    const owner=s[side],enemy=s[other(side)],urgent=publicDamage(enemy,owner,false)>=owner.hp;
    function priority(a){
      if(a.type==='end')return -1000;
      if(a.type==='weaponAttack')return owner.weapon.attack>=enemy.hp?10000:5;
      if(a.type==='attack'){
        const unit=owner.board.find(u=>u.uid===a.attacker);
        if(a.target==='hero')return unit.attack>=enemy.hp?10000:unit.attack*.5;
        const target=enemy.board.find(u=>u.uid===a.target);
        return (target.shield?unit.attack<=2?5:0:target.hp<=unit.attack||hasKeyword(unit,'poison')?unitValue(target):0)+(hasKeyword(target,'taunt')?2:0);
      }
      if(a.type==='play'){
        const card=BY_ID[owner.hand.find(c=>c.uid===a.card).cardId];
        if(a.target===other(side)+'-hero'&&card.effects.filter(e=>e.type==='damage').reduce((v,e)=>v+e.amount,0)>=enemy.hp)return 10000;
        const rescue=urgent&&(card.keywords.includes('taunt')||card.effects.some(e=>['heal','damage','destroy','transform'].includes(e.type)))?3:0;
        return intrinsic(card)+(card.effects.some(e=>e.type==='mana')?6:0)+rescue;
      }
      return urgent?4:1;
    }
    return actions.sort((a,b)=>priority(b)-priority(a));
  }
  function planLabel(s,a,side){
    if(a.type==='play')return `「${BY_ID[s[side].hand.find(c=>c.uid===a.card).cardId].name}」を使用`;
    if(a.type==='attack')return `「${BY_ID[s[side].board.find(u=>u.uid===a.attacker).cardId].name}」で攻撃`;
    return a.type==='power'?'ヒーローパワー':a.type==='weaponAttack'?'武器で攻撃':'ターン終了';
  }
  function* discoverSearch(view,side,settings,style,config,stats,scoring,record){
    const choices=legalActions(view,side);if(!choices.length)return stats;
    const branches=[],quota=Math.floor(config.ownNodes/choices.length);
    const finish=()=>{
      for(const b of branches)record(b.action,b.score,{positionScore:b.positionScore,depth:b.plan.length+1,followUp:b.plan,lookahead:true,winning:Boolean(b.winning)});
      stats.discoveryNodes=stats.nodes;return stats;
    };
    function update(){const best=[...branches].sort((a,b)=>b.score-a.score)[0];if(best)stats.action=best.action;}
    if(stats.trace)stats.trace.baseline=scoring.value(view);
    // 3候補を先に取得しておき、時間切れでも候補を飛ばさず比較する。
    for(const action of choices){
      const budget={remaining:quota},s=step(view,action,budget,stats,scoring);if(!s)continue;
      const card=BY_ID[view.choice.options.find(c=>c.uid===action.choice).cardId],prior=view[side].hand.length<10?intrinsic(card)*.6:0;
      const winning=s.winner===side&&!s.uncertain,score=winning?100000:scoring.value(s)+prior,known=new Set(s[side].hand.filter(c=>!c.unknown&&!c.uid.startsWith('fog-')).map(c=>c.uid));
      branches.push({action,budget,prior,known,score,positionScore:score,winning,plan:[],frontier:[{state:s,plan:[],depth:0,score,quality:0}],endings:[]});
    }
    update();
    if(branches.some(b=>b.winning))return finish();
    const depthLimit=Math.min(settings.difficulty==='easy'?1:4,config.depth),width=Math.min(6,config.width+2);
    for(let depth=0;depth<depthLimit;depth++)for(const b of branches){
      const next=[];
      for(const node of b.frontier){
        if(node.state.status==='finished'){b.endings.push(node);continue;}
        for(const action of orderedActions(node.state,side,settings,b.known)){
          if(b.budget.remaining<=0)break;
          if(b.budget.remaining===1&&action.type!=='end')continue;
          const child=step(node.state,action,b.budget,stats,scoring);if(!child)break;
          const score=scoring.value(child)+b.prior,plan=action.type==='end'?node.plan:[...node.plan,planLabel(node.state,action,side)];
          const entry={state:child,plan,depth:node.depth+1,score,quality:score};
          if(child.winner===side&&!child.uncertain){b.score=100000;b.positionScore=100000;b.plan=plan;b.winning=true;stats.action=b.action;return finish();}
          if(score>b.score){b.score=score;b.positionScore=score;b.plan=plan;update();}
          if(action.type==='end'||child.status==='finished')b.endings.push(entry);else next.push(entry);
          if(stats.visits%32===0)yield stats;
        }
      }
      b.frontier=scoring.best(next,width);
    }
    for(const b of branches){
      for(const node of b.frontier){
        const s=step(node.state,{type:'end',actor:side},b.budget,stats,scoring);if(!s)break;
        b.endings.push({...node,state:s,score:scoring.value(s)+b.prior});if(stats.visits%32===0)yield stats;
      }
      const ends=scoring.best(b.endings,Math.max(1,Math.min(2,Math.floor(config.replies/choices.length))));let best=null;
      for(const end of ends){
        const score=(config.replies?yield* forecast(end.state,side,style,config,stats,scoring):scoring.value(end.state))+b.prior;
        if(!best||score>best.score)best={score,positionScore:scoring.value(end.state)+b.prior,plan:end.plan};
      }
      if(best)Object.assign(b,best);update();
    }
    return finish();
  }
  function* tacticalSearch(state,side,settings,config,budget,stats,scoring,known){
    const enemy=other(side),owner=state[side];
    const ready=owner.board.filter(u=>u.ready&&u.attack>0),weapon=owner.weapon&&!owner.heroAttacked?owner.weapon.attack:0;
    let potential=ready.reduce((n,u)=>n+u.attack,0)+weapon+(owner.heroPower==='ember-call'&&!owner.powerUsed?1:0);
    for(const item of owner.hand){const c=BY_ID[item.cardId];if(c.keywords.includes('swift'))potential+=c.attack;
      for(const e of c.effects.filter(e=>e.trigger==='play')){
        if(e.type==='damage'&&(e.target==='enemy-hero'||c.target==='enemy-character'))potential+=e.amount;
        if(e.type==='buff'&&e.attack>0)potential+=e.attack*(e.target?.includes('units')?Math.max(1,ready.length):1);
      }
    }
    const fatigueThreat=!state[enemy].deck.length&&state[enemy].board.some(u=>!u.silenced&&BY_ID[u.cardId].effects.some(e=>e.trigger==='death'&&e.type==='draw'));
    if(potential<state[enemy].hp&&!fatigueThreat)return null;
    const local={remaining:Math.min(512,Math.floor(config.ownNodes*.2))},seen=new Map();let fallback=-Infinity;
    function focus(s,a){
      if(a.type==='end')return false;
      if(a.type!=='play')return true;
      const c=BY_ID[s[side].hand.find(c=>c.uid===a.card).cardId];
      return c.keywords.includes('swift')||c.effects.some(e=>e.trigger==='play'&&['damage','buff','destroy','transform','transformRandom','bounce','silence','mana','summon','missiles'].includes(e.type));
    }
    function rank(s,a){
      if(['attack','weaponAttack'].includes(a.type)&&a.target==='hero')return 50;
      if(a.type==='power'&&a.target===enemy+'-hero')return 45;
      if(a.type==='play'){
        const c=BY_ID[s[side].hand.find(c=>c.uid===a.card).cardId];
        if(a.target===enemy+'-hero')return 48;
        if(c.keywords.includes('swift'))return 20+c.attack;
        const target=s[enemy].board.find(u=>u.uid===a.target);if(target&&hasKeyword(target,'taunt'))return 40;
        return c.effects.some(e=>e.type==='mana')?25:10;
      }
      return 20;
    }
    function* visit(s,first,depth){
      if(depth>=Math.min(8,config.depth+2)||local.remaining<=0)return null;
      const key=scoring.keyFor(s);if(seen.has(key)&&seen.get(key)<=depth)return null;seen.set(key,depth);
      const children=[],actions=orderedActions(s,side,settings,known).filter(a=>focus(s,a)).sort((a,b)=>rank(s,b)-rank(s,a)).slice(0,12);
      for(const a of actions){
        const before=local.remaining,child=step(s,a,local,stats,scoring);budget.remaining-=before-local.remaining;if(!child)break;
        stats.tacticalNodes=(stats.tacticalNodes||0)+1;const action=first||a;
        if(child.winner===side&&!child.uncertain)return {action,depth:depth+1};
        const value=scoring.value(child);if(value>fallback){fallback=value;stats.action=action;}
        if(child.status==='playing'){
          const guards=child[enemy].board.filter(u=>hasKeyword(u,'taunt')).reduce((n,u)=>n+u.hp+(u.shield?3:0),0);
          children.push({state:child,first:action,score:-child[enemy].hp*4-guards*.8+value*.1,depth:depth+1,quality:0});
        }
        if(stats.visits%32===0)yield stats;
      }
      for(const node of scoring.best(children,6)){const win=yield* visit(node.state,node.first,depth+1);if(win)return win;}
      return null;
    }
    return yield* visit(state,null,0);
  }
  function* search(input, side, options) {
    const settings = normalizeOptions(options); const config = DIFFICULTIES[settings.difficulty]; const style = {...STYLES[settings.style],advanced:settings.difficulty!=='easy'};
    const stats = { ...settings, nodes: 0, visits:0, visitLimit:(config.ownNodes+config.replies*config.replyNodes)*4, action: null };
    // 判断に用いた数値だけを任意で記録する。再探索や秘密情報の参照はしない。
    if(options?.trace)stats.trace={method:'reply',baseline:null,candidates:[]};
    const record=(action,score,extra={})=>{if(stats.trace)stats.trace.candidates.push({action:{...action},score,...extra});};
    if (!['player', 'cpu'].includes(side) || input.status !== 'playing' || input.active !== side) return stats;
    const scoring=scoringFor(side,style,stats,options?.cache!==false,options?.transitionCache!==false);
    if(input.choice){
      if(stats.trace)stats.trace.method='discover';
      return yield* discoverSearch(observe(input,side),side,settings,style,config,stats,scoring,record);
    }
    const state = observe(input, side); const known = new Set(state[side].hand.map(card => card.uid));
    const actionsFor = s => orderedActions(s,side,settings,known);
    const budget = { remaining: config.ownNodes }; const baseline = scoring.value(state);
    if(stats.trace)stats.trace.baseline=baseline;
    const end = { type: 'end', actor: side };
    stats.action=end;
    if (settings.difficulty === 'easy') {
      if(stats.trace)stats.trace.method='immediate';
      let score = baseline; stats.action = end;
      for (const action of actionsFor(state)) {
        const next = step(state, action, budget, stats,scoring); if (!next) break;
        if (stats.visits % 32 === 0) yield stats;
        if (next.winner === side && !next.uncertain) { record(action,100000,{winning:true});stats.action = action; return stats; }
        let value = scoring.value(next);
        // 入門も一時マナを「直後の1手」とセットで判断する。通常の探索上限内で行う。
        if (action.type === 'play' && BY_ID[state[side].hand.find(card=>card.uid===action.card).cardId].effects.some(effect=>effect.type==='mana')) {
          for (const follow of actionsFor(next).filter(item=>item.type!=='end')) {
            const future=step(next,follow,budget,stats,scoring);if(!future)break;
            if(stats.visits%32===0)yield stats;
            if(future.winner===side&&!future.uncertain){record(action,100000,{winning:true});stats.action=action;return stats;}
            value=Math.max(value,scoring.value(future));
          }
        }
        record(action,value);
        if (action.type !== 'end' && value > score + .00001) {
          stats.action = action; score = value;
        }
      }
      return informationFirst(state,side,stats);
    }
    const forced=yield* tacticalSearch(state,side,settings,config,budget,stats,scoring,known);
    if(forced){if(stats.trace)stats.trace.method='lethal';record(forced.action,100000,{winning:true,depth:forced.depth,tactical:true});stats.action=forced.action;return stats;}
    let frontier = [{ state, first: null, score: baseline, quality: 0, depth: 0 }];
    let partialScore=baseline;
    const endings = [];
    for (let depth = 0; depth < config.depth && frontier.length; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const action of actionsFor(node.state)) {
          // 最後に候補をターン終了まで進める分を確保する。
          if (budget.remaining <= config.width) break;
          const child = step(node.state, action, budget, stats,scoring); if (!child) break;
          const score = scoring.value(child);
          // 時間切れでも、実際に評価済みの合法な一手を返せるよう保持する。
          if(depth===0&&score>partialScore){partialScore=score;stats.action=action;}
          if (stats.visits % 32 === 0) yield stats;
          const entry = { state: child, first: node.first || action, score, depth: node.depth + 1, quality: node.quality + score - baseline };
          if (child.winner === side && !child.uncertain) { if(stats.trace)stats.trace.method='lethal';record(entry.first,100000,{winning:true,depth:entry.depth});stats.action = entry.first; return stats; }
          if (action.type === 'end' || child.status === 'finished') endings.push(entry); else next.push(entry);
        }
      }
      frontier = scoring.best(next, config.width);
      if (budget.remaining <= config.width) break;
    }
    for (const node of frontier) {
      const child = step(node.state, end, budget, stats,scoring); if (!child) break;
      if (stats.visits % 32 === 0) yield stats;
      endings.push({ ...node, state: child, first: node.first || end, score: scoring.value(child) });
    }
    const candidates = scoring.best(endings, config.replies);
    const baselineEnd = endings.find(node => node.first.type === 'end');
    if (baselineEnd && !candidates.some(node => scoring.keyFor(node.state) === scoring.keyFor(baselineEnd.state))) {
      candidates.splice(config.replies - 1, 1, baselineEnd);
    }
    let best = null;
    for (const candidate of candidates) {
      const score = yield* forecast(candidate.state, side, style, config, stats,scoring);
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
