(function(root){
 'use strict';
 const R=typeof module==='object'&&module.exports?require('./review.js'):root.SeikanReview;
 const KEY='hoshikanjo-match-history-v1',LIMIT=10;
 // LZWの16bit辞書を64Kでリセット。保存時だけ圧縮し、書き出しは通常のJSONに戻す。
 function compress(text){
  const bytes=unescape(encodeURIComponent(text));if(!bytes)return '';
  let dictionary=new Map(),next=257;const reset=()=>{dictionary=new Map();for(let i=0;i<256;i++)dictionary.set(String.fromCharCode(i),i);next=257;};reset();
  let phrase=bytes[0];const codes=[];
  for(let i=1;i<bytes.length;i++){const c=bytes[i],both=phrase+c;if(dictionary.has(both))phrase=both;else{codes.push(dictionary.get(phrase));if(next<65536)dictionary.set(both,next++);else{codes.push(256);reset();}phrase=c;}}codes.push(dictionary.get(phrase));
  let binary='';for(const c of codes)binary+=String.fromCharCode(c>>>8,c&255);return btoa(binary);
 }
 function decompress(encoded){
  if(typeof encoded!=='string'||encoded.length>2000000)throw Error('保存サイズが不正です');
  const binary=atob(encoded);if(binary.length%2)throw Error('保存形式が不正です');
  let dictionary=[],next=257,word='',result=[],size=0;const reset=()=>{dictionary=Array.from({length:256},(_,i)=>String.fromCharCode(i));next=257;word='';};reset();
  for(let i=0;i<binary.length;i+=2){const code=binary.charCodeAt(i)*256+binary.charCodeAt(i+1);if(code===256){reset();continue;}const entry=dictionary[code]||(code===next&&word?word+word[0]:null);if(entry===null||entry===undefined)throw Error('保存データを展開できません');size+=entry.length;if(size>12000000)throw Error('対戦記録が大きすぎます');result.push(entry);if(word&&next<65536)dictionary[next++]=word+entry[0];word=entry;}
  return decodeURIComponent(escape(result.join('')));
 }
 function createHistory(storage){
  let items=[],warning='',blocked=false;
  try{const raw=storage?.getItem(KEY);if(raw){const data=JSON.parse(raw);if(data.schemaVersion!==1||!Array.isArray(data.matches)||data.matches.length>10||data.matches.some(x=>typeof x.id!=='string'||typeof x.body!=='string'||!x.summary))throw Error('保存形式');items=data.matches;}}catch{warning='端末の対戦履歴を読み込めません。既存の保存データは変更せず、このページ内で保持します。閉じる前にJSONを書き出してください。';blocked=true;}
  const unpack=item=>{const data=JSON.parse(decompress(item.body));return R.restoreRecording(data);};
  return {
   save(recording){
    if(!recording?.finished)return false;
    try{
     const data=recording.exportData(),meta=data.metadata||{},last=data.entries.at(-1).state,id=meta.matchId||`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
     const summary={savedAt:new Date().toISOString(),startedAt:meta.startedAt||null,gameVersion:meta.gameVersion||'unknown',mode:last.mode||'constructed',spectator:!!meta.spectator,winner:last.winner,turns:last.turn,actions:data.entries.length-1,playerName:last.player.deckName,cpuName:last.cpu.deckName};
     const item={id,summary,body:compress(JSON.stringify(data))};items=[item,...items.filter(x=>x.id!==id)].slice(0,LIMIT);
     if(!blocked){try{if(!storage)throw Error('保存不可');storage.setItem(KEY,JSON.stringify({schemaVersion:1,matches:items}));warning='';}catch{warning='端末に保存できませんでした。このページを閉じる前にJSONを書き出してください。';}}
     return true;
    }catch{warning='対戦記録を保存できませんでした。直前の対戦からJSONを書き出してください。';return false;}
   },
   list:()=>items.map(({id,summary})=>({id,summary:JSON.parse(JSON.stringify(summary))})),
   get(id){const item=items.find(x=>x.id===id);if(!item)return null;try{return unpack(item);}catch{warning='この対戦記録を読み込めません。他の記録は保持しています。';return null;}},
   export(id){const recording=this.get(id);if(!recording)throw Error('対戦記録を読み込めません');return JSON.stringify(recording.exportData(),null,2);},
   warning:()=>warning
  };
 }
 const api={KEY,LIMIT,compress,decompress,createHistory};if(typeof module==='object'&&module.exports)module.exports=api;else root.SeikanMatchHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this);
