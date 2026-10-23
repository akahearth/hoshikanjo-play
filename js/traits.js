(function (root) {
  'use strict';
  const { BY_ID, KEYWORDS } = typeof module === 'object' && module.exports ? require('./cards.js') : root.SeikanCards;
  function unitTraits(unit) {
    const active = (unit.keywords || []).filter(key => key !== 'aegis');
    if (unit.shield) active.unshift('aegis');
    const death = !unit.silenced && BY_ID[unit.cardId].effects.some(effect => effect.trigger === 'death');
    const shieldState = unit.shield ? 'active' : unit.shieldBroken || (unit.keywords || []).includes('aegis') ? 'spent' : 'none';
    const labels = active.map(key => key === 'aegis' ? '星護あり' : KEYWORDS[key].name);
    if (shieldState === 'spent') labels.push('星護消失');
    if (death) labels.push('死亡時');
    if(unit.silenced)labels.push('沈黙');
    return { active, shieldState, labels, classes: [...active.map(key => `trait-${key}`), ...(death ? ['trait-death'] : []), ...(shieldState === 'spent' ? ['shield-spent'] : [])] };
  }
  const api = { unitTraits };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeikanTraits = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
