(function (root) {
  'use strict';
  const definitions = [
    { id: 'green-rest', name: '回福の深呼吸', cost: 2, target: 'friendly-character', art: 'heal', color: '#a9d5b9', description: '味方ユニットか自分のヒーローを2回復。ひと息ついて、回福へ。', effects: [{ trigger: 'play', type: 'heal', target: 'chosen', amount: 2 }] },
    { id: 'ember-call', name: '火と押し', cost: 2, target: 'enemy-character', art: 'bolt', color: '#eead66', description: '敵ユニットか敵ヒーローに1ダメージ。あと一押しに、火と押し。', effects: [{ trigger: 'play', type: 'damage', target: 'chosen', amount: 1 }] },
    { id: 'astral-ward', name: '一撃保険', cost: 2, target: 'friendly-unit', art: 'ward', color: '#b0dbf1', description: '味方ユニット1体に星護を付与。重複しない。備えあれば、一撃なし。', effects: [{ trigger: 'play', type: 'shield', target: 'chosen' }] }
  ];
  definitions.push(
    {id:'ledger-tap',name:'手札の前借り',cost:2,art:'tome',color:'#bdaddb',description:'自分のヒーローに2ダメージ。その後カードを1枚引く。手札の仕入れは、身を切る勘定。',effects:[{trigger:'play',type:'damage',target:'friendly-hero',amount:2},{trigger:'play',type:'draw',amount:1}]},
    {id:'sprout-call',name:'芽先の一手',cost:2,art:'seed',color:'#b4d49a',description:'1/1の「わたわたの芽」を1体召喚。場が5体なら使えない。小さな一手で、芽先を変える。',effects:[{trigger:'play',type:'summon',into:'cotton-sprout',amount:1}]},
    {id:'verdant-cheer',name:'ひと盛り上手',cost:2,target:'friendly-unit',art:'blessing',color:'#d6cc8e',description:'味方ユニット1体を+1/+1。攻撃権は変えない。ちょい足し一杯、ひと盛り上手。',effects:[{trigger:'play',type:'buff',target:'chosen',attack:1,health:1}]}
  );
  const POWERS = Object.freeze(definitions.map(power => Object.freeze({ ...power, effects: Object.freeze(power.effects.map(Object.freeze)) })));
  const BY_POWER = Object.freeze(Object.fromEntries(POWERS.map(power => [power.id, power])));
  const HEROES = Object.freeze([
    Object.freeze({id:'ledger-reader',name:'手札の仕入れ係',power:'ledger-tap',description:'HPを2払い、1枚引く。仕入れの前に、命の残高を確認。'}),
    Object.freeze({id:'sprout-tender',name:'芽配りの庭師',power:'sprout-call',description:'1/1を1体召喚。芽配り上手で、場の気配り。'}),
    Object.freeze({id:'rally-chef',name:'盛り役の料理人',power:'verdant-cheer',description:'味方1体を+1/+1。仲間の調子も、ひと盛り。'}),
    Object.freeze({ id: 'forest-wanderer', name: '森あげ役の旅人', power: 'green-rest', description: '味方を2回復する、森の世話焼き。場も体力も、森あげます。' }),
    Object.freeze({ id: 'ember-guide', name: '火と押しの導手', power: 'ember-call', description: '敵に1ダメージ。あと一押しが欲しいとき、火と押しします。' }),
    Object.freeze({ id: 'astral-keeper', name: '星のほけん係', power: 'astral-ward', description: '味方ユニットに星護を付与。ご相談は二マナ、補償は一撃ぶん。' })
  ]);
  const BY_HERO = Object.freeze(Object.fromEntries(HEROES.map(hero => [hero.id, hero])));
  const HERO_FOR_POWER = Object.freeze(Object.fromEntries(HEROES.map(hero => [hero.power, hero])));
  const api = { POWERS, BY_POWER, HEROES, BY_HERO, HERO_FOR_POWER, DEFAULT_POWER: 'green-rest' };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeikanHeroes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
