(function (root) {
  'use strict';
  const { BY_ID, CARDS } = typeof module === 'object' && module.exports ? require('./cards.js') : root.SeikanCards;
  // 実際の乱数列はルール状態だけが保持。CPUの観測入力には渡さない。
  function roll(state) { state.entropy=(Math.imul(state.entropy??1,1664525)+1013904223)>>>0;return state.entropy/4294967296; }
  const randomOne=(state,items)=>items.length?items[Math.floor(roll(state)*items.length)]:null;
  function cardPool(effect) { return CARDS.filter(c=>(!effect.pool||effect.pool==='any'||c.type===effect.pool)
    &&(effect.minCost===undefined||c.cost>=effect.minCost)&&(effect.maxCost===undefined||c.cost<=effect.maxCost)&&(!effect.rarity||c.rarity===effect.rarity)); }
  const other = side => side === 'player' ? 'cpu' : 'player';
  const hasKeyword = (unit, keyword) => (unit.keywords || []).includes(keyword);
  function findEntity(state, id) {
    for (const side of ['player', 'cpu']) {
      if (id === `${side}-hero`) return { side, model: state[side], hero: true, id };
      const model = state[side].board.find(unit => unit.uid === id);
      if (model) return { side, model, hero: false, id };
    }
    return null;
  }
  function damage(state, id, amount, poison = false) {
    const target = findEntity(state, id);
    if (!target || amount <= 0 || target.model.hp <= 0) return { amount: 0, blocked: false };
    if (!target.hero && target.model.shield) {
      target.model.shield = false;
      target.model.shieldBroken = true;
      return { amount: 0, blocked: true };
    }
    target.model.hp -= amount;
    if (poison && !target.hero) target.model.hp = Math.min(0, target.model.hp);
    return { amount, blocked: false, poisoned: poison && !target.hero };
  }
  function effectTargets(state, source, effect, chosen) {
    switch (effect.target) {
      case 'chosen': return [chosen];
      case 'friendly-hero': return [`${source.side}-hero`];
      case 'enemy-hero': return [`${other(source.side)}-hero`];
      case 'large-enemies': return state[other(source.side)].board.filter(u=>u.attack>=5).map(u=>u.uid);
      case 'strongest-enemy': { const units=state[other(source.side)].board.filter(u=>u.hp>0),top=Math.max(0,...units.map(u=>u.attack));const unit=randomOne(state,units.filter(u=>u.attack===top));return unit?[unit.uid]:[]; }
      case 'enemy-units': return state[other(source.side)].board.map(unit => unit.uid);
      case 'all-units': return [...state[source.side].board,...state[other(source.side)].board].map(unit=>unit.uid);
      case 'friendly-units': return state[source.side].board.map(unit => unit.uid);
      case 'other-friendly-units': return state[source.side].board.filter(unit => unit.uid !== source.uid).map(unit => unit.uid);
      default: return [];
    }
  }
  const handlers = {
    setStats(state,target,effect,context){
      if(target.hero||target.model.hp<=0)return;const unit=target.model;
      if(Number.isFinite(effect.attack))unit.attack=Math.max(0,effect.attack);
      if(Number.isFinite(effect.health))unit.hp=unit.maxHp=Math.max(0,effect.health);
      context.events.push({type:'setStats',target:target.id});context.log(`「${BY_ID[unit.cardId].name}」の数値を変更（攻撃力${unit.attack} / HP${unit.hp}、最大${unit.maxHp}）。能力と攻撃権は保持。`);
    },
    swapStats(state,target,effect,context){
      if(target.hero||target.model.hp<=0)return;const unit=target.model,attack=unit.attack;
      unit.attack=unit.hp;unit.hp=unit.maxHp=attack;
      context.events.push({type:'swapStats',target:target.id});context.log(`「${BY_ID[unit.cardId].name}」の攻撃力と現在HPを交換（${unit.attack} / ${unit.hp}）。能力と攻撃権は保持。`);
    },
    destroy(state,target,effect,context) {
      if(target.hero||target.model.hp<=0)return;target.model.hp=0;
      context.events.push({type:'destroy',target:target.id});context.log(`「${BY_ID[target.model.cardId].name}」を破壊。`);
    },
    silence(state,target,effect,context) {
      if(target.hero||target.model.hp<=0)return;
      const unit=target.model,card=BY_ID[unit.cardId],wounds=Math.max(0,unit.maxHp-unit.hp);
      Object.assign(unit,{attack:card.attack,maxHp:card.health,hp:card.health-wounds,keywords:[],shield:false,shieldBroken:false,silenced:true});
      context.events.push({type:'silence',target:target.id});context.log(`「${card.name}」を沈黙。能力・星護・強化を除去。`);
    },
    bounce(state,target,effect,context) {
      if(target.hero||target.model.hp<=0)return;
      state[target.side].board=state[target.side].board.filter(u=>u.uid!==target.id);
      const burned=state[target.side].hand.length>=10;
      if(!burned)state[target.side].hand.push({uid:`card-${state.nextId++}`,cardId:target.model.cardId});
      context.events.push({type:'bounce',target:target.id,burned});context.log(`「${BY_ID[target.model.cardId].name}」を${burned?'手札上限のため消滅':'手札へ戻した'}。`);
    },
    transformRandom(state,target,effect,context) {
      if(target.hero||target.model.hp<=0)return;
      const cost=Math.min(9,BY_ID[target.model.cardId].cost+(effect.delta||0));
      const pool=cardPool({pool:'unit',...(effect.maxCost!==undefined?{maxCost:effect.maxCost}:{minCost:cost,maxCost:cost})});
      const into=randomOne(state,pool);if(into)handlers.transform(state,target,{into:into.id},context);
    },
    transform(state, target, effect, context) {
      if(target.hero||target.model.hp<=0||BY_ID[effect.into]?.type!=='unit')return;
      const replacement=context.makeUnit({uid:target.id,cardId:effect.into});
      replacement.ready=target.model.ready;
      state[target.side].board[state[target.side].board.findIndex(u=>u.uid===target.id)]=replacement;
      context.events.push({type:'transform',target:target.id,from:target.model.cardId,into:effect.into});
      context.log(`「${BY_ID[target.model.cardId].name}」が「${BY_ID[effect.into].name}」に変身。元の能力・強化は消滅。`);
    },
    shield(state, target, effect, context) {
      if (target.hero || target.model.hp <= 0) return;
      const granted = !target.model.shield;
      target.model.shield = true; target.model.shieldBroken = false;
      context.events.push({ type: 'shield', target: target.id, granted });
      context.log(`「${BY_ID[target.model.cardId].name}」${granted ? 'に星護を付与。' : 'はすでに星護で守られている。'}`);
    },
    damage(state, target, effect, context) {
      const hpBefore=target.model.hp;
      const hit = damage(state, target.id, effect.amount);
      context.events.push({ type: 'damage', target: target.id, ...hit, effectiveDamage:Math.max(0,Math.min(hpBefore,hit.amount)) });
      context.log(hit.blocked ? '星護がダメージを防ぎ、砕けた。' : `${target.hero ? 'ヒーロー' : BY_ID[target.model.cardId].name}に${hit.amount}ダメージ。`);
    },
    heal(state, target, effect, context) {
      if (target.model.hp <= 0) return;
      const cap = target.hero ? (target.model.maxHp || 30) : target.model.maxHp;
      const amount = Math.max(0, Math.min(effect.amount, cap - target.model.hp));
      target.model.hp += amount;
      context.events.push({ type: 'heal', target: target.id, amount });
      context.log(`${target.hero ? 'ヒーロー' : BY_ID[target.model.cardId].name}を${amount}回復。`);
    },
    buff(state, target, effect, context) {
      if (target.hero || target.model.hp <= 0) return;
      target.model.attack = Math.max(0, target.model.attack + (effect.attack || 0));
      target.model.maxHp += effect.health || 0;
      target.model.hp += effect.health || 0;
      context.events.push({ type: 'buff', target: target.id });
      context.log(`「${BY_ID[target.model.cardId].name}」に攻撃力${effect.attack >= 0 ? '+' : ''}${effect.attack || 0} / HP${effect.health >= 0 ? '+' : ''}${effect.health || 0}。`);
    }
  };
  // 全体効果は同時処理し、死亡を同時除去。死亡時効果はFIFOに予約する。
  function resolveEffects(state, effects, source, chosen, hooks, continuation=[]) {
    const events = [];
    const context = { ...hooks, events };
    const queue = [...continuation,...effects.map(effect => ({ effect, source, chosen }))];
    function collectDeaths() {
      const dead = [];
      for (const side of ['player', 'cpu']) {
        for (const unit of state[side].board) if (unit.hp <= 0) dead.push({ side, unit });
        state[side].board = state[side].board.filter(unit => unit.hp > 0);
      }
      for (const { side, unit } of dead) {
        context.log(`「${BY_ID[unit.cardId].name}」が退場。`);
        if (state.status === 'playing' && !unit.silenced) for (const effect of BY_ID[unit.cardId].effects.filter(item => item.trigger === 'death')) {
          queue.push({ effect, source: { side, uid: unit.uid, cardId: unit.cardId }, chosen: null });
        }
      }
    }
    collectDeaths();
    let count = 0;
    while (queue.length && state.status === 'playing') {
      if (++count > 200) throw new Error('効果の連鎖が安全上限を超えました。');
      const task = queue.shift();
      const effect = task.effect;
      const eventStart=events.length;
      if(effect.trigger==='death')events.push({type:'deathEffect',source:{...task.source},trigger:'death'});
      const definition = BY_ID[task.source.cardId] || task.source;
      const trigger = effect.trigger === 'death' ? '死亡時' : definition.type === 'unit' ? '召喚時' : definition.type === 'power' ? 'ヒーローパワー' : '呪文';
      context.log(`「${definition.name}」の${trigger}効果。`);
      if (effect.type === 'discover') {
        if(state.simulation){const p=state[task.source.side];if(p.hand.length<10)p.hand.push({uid:`fog-discovery-${state.nextId++}`,cardId:'moss-spirit',discovered:true});continue;}
        const pool=cardPool(effect);
        // 乱数の状態もルール側で保持する。探索側には実際の未来の乱数を渡さない。
        for(let i=pool.length-1;i>0;i--){const j=Math.floor(roll(state)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
        if(!pool.length)continue;
        state.choice={side:task.source.side,source:task.source,options:pool.slice(0,3).map(card=>({uid:`choice-${state.nextId++}`,cardId:card.id}))};
        state.effectQueue=queue;
        events.push({type:'discover',side:task.source.side});
        context.log(`${task.source.side==='player'?'あなた':'星よみ経理'}が発見の3候補から選択。`);
        break;
      } else if(effect.type==='missiles') {
        for(let i=0;i<effect.count&&state.status==='playing';i++){
          const unit=randomOne(state,state[other(task.source.side)].board.filter(u=>u.hp>0));if(!unit)break;
          handlers.damage(state,{id:unit.uid,model:unit,side:other(task.source.side),hero:false},effect,context);
          collectDeaths();
        }
      } else if(effect.type==='summon') {
        for(let i=0;i<effect.amount&&state[task.source.side].board.length<5;i++){
          const card=effect.into?BY_ID[effect.into]:randomOne(state,cardPool(effect));if(!card)break;
          const unit=context.makeUnit({uid:`unit-${state.nextId++}`,cardId:card.id});state[task.source.side].board.push(unit);
          events.push({type:'summon',target:unit.uid,cardId:card.id});context.log(`「${card.name}」を効果で召喚（召喚時効果なし）。`);
        }
      } else if(effect.type==='mutate') {
        state[task.source.side].deck=state[task.source.side].deck.map(id=>{
          const old=BY_ID[id];if(effect.from&&old.type!==effect.from)return id;
          const cost=Math.min(9,old.cost+(effect.delta||0));
          const pool=cardPool({pool:'unit',...(effect.minCost!==undefined?{minCost:effect.minCost,maxCost:effect.maxCost}:{minCost:cost,maxCost:cost})});
          return randomOne(state,pool)?.id||id;
        });
        events.push({type:'mutate',side:task.source.side});context.log('残り山札を変異。枚数と並び順は保ち、変化した中身は非公開。');
      } else if(effect.type==='shatter') {
        const enemy=state[other(task.source.side)];if(enemy.weapon){enemy.weapon=null;events.push({type:'shatter',side:other(task.source.side)});context.log('相手の武器を破壊。');}
      } else if (effect.type === 'draw') {
        for (let i = 0; i < effect.amount && state.status === 'playing'; i++) context.draw(task.source.side);
      } else if (effect.type === 'mana') {
        events.push({ type:'mana', target:`${task.source.side}-hero`, amount:context.gainMana(task.source.side,effect.amount) });
      } else {
        const handler = handlers[effect.type];
        if (!handler) throw new Error(`未対応の効果: ${effect.type}`);
        for (const id of effectTargets(state, task.source, effect, task.chosen)) {
          const entity = findEntity(state, id);
          if (entity) handler(state, entity, effect, context);
        }
      }
      for(let i=eventStart;i<events.length;i++){events[i].source={...task.source};events[i].trigger=effect.trigger;}
      hooks.checkWinner();
      collectDeaths();
    }
    return events;
  }
  const api = { cardPool, roll, hasKeyword, findEntity, damage, resolveEffects };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeikanEffects = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
