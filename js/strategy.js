(function(root){
  'use strict';
  const {BY_ID}=typeof module==='object'&&module.exports?require('./cards.js'):root.SeikanCards;
  // 未知の手札・山札を参照しない、ドラフトと発見に共通のカード評価。
  function cardValue(card){
    let value=card.type==='unit'?card.attack*1.3+card.health*.8:card.type==='weapon'?card.attack*Math.min(3,card.durability)*1.45:0;
    if(card.keywords.includes('aegis'))value+=2.6;
    if(card.keywords.includes('taunt'))value+=1.2;
    if(card.keywords.includes('poison'))value+=3.3;
    if(card.keywords.includes('swift'))value+=card.attack*.65+(card.keywords.includes('poison')?3:0);
    for(const e of card.effects){
      const factor=e.trigger==='death' ? .65:1;
      // 小さなトークンも大型守護樹も、一律に大型としてピックしない。
      const summoned=e.type==='summon'&&e.into?BY_ID[e.into]:null;
      const summonValue=summoned?Math.min(9,summoned.attack*1.3+summoned.health*.8+(summoned.keywords.includes('taunt')?1.2:0)):5;
      const buffTargets=e.target==='enemy-units'&&(e.attack||0)<0?2.6:e.target?.includes('units')?1.7:1;
      value+=factor*(e.type==='draw'?e.amount*3.2:e.type==='discover'?4.8:e.type==='transform'?(e.into==='cotton-sprout'?9:6):e.type==='setStats'?(e.target==='all-units'?9:e.health===undefined?6:7):e.type==='swapStats'?6:e.type==='damage'?e.amount*(e.target==='enemy-units'?3.1:e.target==='all-units'?2.1:1.6):e.type==='heal'?e.amount*(e.target==='friendly-units' ? .65:.5):e.type==='buff'?(Math.abs(e.attack||0)*1.1+Math.abs(e.health||0)*1.2)*buffTargets:e.type==='destroy'? (e.target==='large-enemies'?13:11):e.type==='bounce'?6:e.type==='silence'?4:e.type==='shatter'?3:e.type==='missiles'?e.amount*e.count*1.5:e.type==='summon'?e.amount*summonValue:e.type==='mutate'? (e.delta===0?3:e.from==='unit'?2.5:5):e.type==='transformRandom'?(e.maxCost===3?8.5:6):e.type==='shield'?(e.target==='friendly-units'?5:3):e.type==='mana'?2:0);
    }
    return value/(card.cost+1)*3+value*.12;
  }
  function draftScore(card,cards){
    const owned=cards.map(id=>BY_ID[id]),size=owned.length,low=owned.filter(c=>c.type==='unit'&&c.cost<=3).length,heavy=owned.filter(c=>c.cost>=6).length,spells=owned.filter(c=>c.type==='spell').length,weapons=owned.filter(c=>c.type==='weapon').length;
    return cardValue(card)-(card.type==='weapon'?Math.max(0,weapons-size*.12)*2:0)-owned.filter(c=>c.cost===card.cost).length*.18-owned.filter(c=>c.id===card.id).length*.45
      +(card.type==='unit'&&card.cost<=3?Math.max(0,size*.35-low)*1.1:0)
      -(card.cost>=6?Math.max(0,heavy-size*.18)*1.8:0)
      -(card.type==='spell'?Math.max(0,spells-size*.3)*1.4:0);
  }
  function chooseMulligan(state,side){
    const hand=state[side].hand;
    const early=hand.filter(c=>BY_ID[c.cardId].type==='unit'&&BY_ID[c.cardId].cost<=2);
    const ordered=[...hand].sort((a,b)=>BY_ID[a.cardId].cost-BY_ID[b.cardId].cost||cardValue(BY_ID[b.cardId])-cardValue(BY_ID[a.cardId]));
    const keep=new Set();let removal=false;
    for(const item of ordered){
      const card=BY_ID[item.cardId];
      const isRemoval=card.effects.some(e=>['damage','buff','destroy','bounce','silence','setStats','swapStats'].includes(e.type))&&(card.target?.startsWith('enemy')||card.target==='any-unit');
      const keepUnit=card.type==='unit'&&card.cost<=3;
      const keepSpell=card.type==='spell'&&card.cost<=3&&((isRemoval&&!removal)||(card.effects.some(e=>e.type==='draw')&&early.length>=2)||(card.target==='friendly-unit'&&card.effects.some(e=>e.type==='buff')&&early.length>0)||(card.effects.some(e=>e.type==='discover')&&early.length>0));
      if(keepUnit||keepSpell||(card.type==='weapon'&&card.cost<=3&&!ordered.some(c=>keep.has(c.uid)&&BY_ID[c.cardId].type==='weapon'))){keep.add(item.uid);if(keepSpell&&isRemoval)removal=true;}
    }
    return hand.filter(c=>!keep.has(c.uid)).map(c=>c.uid);
  }
  const api={cardValue,draftScore,chooseMulligan};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.SeikanStrategy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
