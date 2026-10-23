(function (root) {
  'use strict';
  const definitions = [
    { id: 'green-rest', name: '回福の深呼吸', cost: 2, target: 'friendly-character', art: 'heal', color: '#a9d5b9', description: '味方ユニットか自分のヒーローを2回復。ひと息ついて、回福へ。', effects: [{ trigger: 'play', type: 'heal', target: 'chosen', amount: 2 }] },
    { id: 'ember-call', name: '火と押し', cost: 2, target: 'enemy-character', art: 'bolt', color: '#eead66', description: '敵ユニットか敵ヒーローに1ダメージ。あと一押しに、火と押し。', effects: [{ trigger: 'play', type: 'damage', target: 'chosen', amount: 1 }] },
    { id: 'astral-ward', name: '一撃保険', cost: 2, target: 'friendly-unit', art: 'ward', color: '#b0dbf1', description: '味方ユニット1体に星護を付与。重複しない。備えあれば、一撃なし。', effects: [{ trigger: 'play', type: 'shield', target: 'chosen' }] }
  ];
  const POWERS = Object.freeze(definitions.map(power => Object.freeze({ ...power, effects: Object.freeze(power.effects.map(Object.freeze)) })));
  const BY_POWER = Object.freeze(Object.fromEntries(POWERS.map(power => [power.id, power])));
  const HEROES = Object.freeze([
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
