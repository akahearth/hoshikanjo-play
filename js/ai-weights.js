(function(root){
 'use strict';
 const BASE=Object.freeze({attack:1,health:1,shield:1,ownHp:1,enemyHp:1,hand:1,danger:1,healing:1});
 // 対戦データで選んだ係数を固定する。プレイ中の学習や外部通信は行わない。
 const EXPERT=Object.freeze({attack:1.052,health:1.229,shield:.939,ownHp:1.134,enemyHp:1.104,hand:1.183,danger:1.205,healing:.955});
 function normalize(values,defaults=BASE){const result={...defaults};for(const key of Object.keys(BASE))if(Number.isFinite(values?.[key])&&values[key]>=.25&&values[key]<=3)result[key]=values[key];return result;}
 const forSettings=(difficulty,style)=>difficulty==='expert'&&style==='balanced'?EXPERT:BASE;
 const api={BASE,EXPERT,normalize,forSettings};if(typeof module==='object'&&module.exports)module.exports=api;else root.SeikanAIWeights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
