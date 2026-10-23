(function (root) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const { BY_ID, FIXED_DECK, CARDS, copyLimit } = commonJS ? require('./cards.js') : root.SeikanCards;
  const { BY_POWER, DEFAULT_POWER } = commonJS ? require('./heroes.js') : root.SeikanHeroes;
  const DECK_SIZE = 22; const MAX_COPIES = 2; const MAX_DECKS = 12;
  const STORAGE_KEY = 'seikan-decks-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const expand = entries => entries.flatMap(([id, count]) => Array(count).fill(id));
  const PRESETS = Object.freeze([
    { id: 'journey', name: '星勘定はじめました', heroPower: DEFAULT_POWER, cards: [...FIXED_DECK] },
    { id: 'grove', name: '守りは木から', heroPower: 'astral-ward', cards: expand([['moss-spirit', 2], ['reed-guard', 2], ['stone-tortoise', 2], ['brook-heron', 2], ['jade-protector', 2], ['tool-inspector', 1], ['crystal-deer', 2], ['rune-artisan', 1], ['root-archon', 1], ['dawn-chorus', 2], ['warding-rune', 1], ['quiet-clause', 1], ['verdant-vow', 1], ['night-study', 1], ['spring-song', 1]]) },
    { id: 'cinders', name: '火と押し、もうひと押し', heroPower: 'ember-call', cards: expand([['spark-fox', 2], ['ember-wolf', 2], ['zephyr-hare', 2], ['cinder-hawk', 2], ['thorn-viper', 2], ['mist-stalker', 2], ['moon-owl', 1], ['forge-finder', 1], ['star-bolt', 2], ['ember-lance', 2], ['moon-staff', 1], ['cinder-bloom', 1], ['night-study', 1], ['giant-eviction', 1]]) }
  ].map(deck => Object.freeze({ ...deck, cards: Object.freeze(deck.cards) })));
  function validateCards(cards, complete, size) {
    if (!Array.isArray(cards)) return ['デッキのカード一覧が不正です。'];
    const errors = [];
    if (complete && cards.length !== size) errors.push(`デッキは${size}枚必要です（現在${cards.length}枚）。`);
    else if (!complete && cards.length > size) errors.push(`デッキは${size}枚までです。`);
    const counts = new Map();
    for (const id of cards) {
      if (typeof id !== 'string' || !Object.hasOwn(BY_ID, id) || BY_ID[id].collectible === false) { errors.push('存在しない、またはデッキに採用できないカードが含まれています。'); continue; }
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const [id, count] of counts) if (count > copyLimit(BY_ID[id])) errors.push(`「${BY_ID[id].name}」は${copyLimit(BY_ID[id])}枚までです。`);
    return [...new Set(errors)];
  }
  function cardListErrors(cards,complete=true){return validateCards(cards,complete,DECK_SIZE);}
  function validateDeck(deck, complete, size) {
    if (!deck || typeof deck !== 'object') return ['デッキが不正です。'];
    const errors = validateCards(deck.cards, complete, size);
    if (typeof deck.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(deck.id)) errors.push('デッキIDが不正です。');
    if (typeof deck.name !== 'string' || !deck.name.trim() || deck.name.trim().length > 40 || /[\x00-\x1f]/.test(deck.name)) errors.push('デッキ名は1〜40文字で入力してください。');
    if (typeof deck.heroPower !== 'string' || !Object.hasOwn(BY_POWER, deck.heroPower)) errors.push('ヒーローパワーを選んでください。');
    return errors;
  }
  function deckErrors(deck,complete=true){return validateDeck(deck,complete,DECK_SIZE);}
  function defaultLibrary() { return { version: 2, activeId: 'journey', decks: clone(PRESETS) }; }
  function validateLibrary(library, version, size) {
    if (!library || library.version !== version || !Array.isArray(library.decks)) return ['保存データの形式が不正です。'];
    if (!library.decks.length || library.decks.length > MAX_DECKS) return ['保存できるデッキは1〜12個です。'];
    const errors = library.decks.flatMap(deck => validateDeck(deck,true,size));
    const ids = library.decks.map(deck => deck?.id);
    if (new Set(ids).size !== ids.length) errors.push('デッキIDが重複しています。');
    if (!ids.includes(library.activeId)) errors.push('使用するデッキが見つかりません。');
    return errors;
  }
  function libraryErrors(library){return validateLibrary(library,2,DECK_SIZE);}
  function normalize(library) {
    return { version: 2, activeId: library.activeId, decks: library.decks.map(deck => ({ id: deck.id, name: deck.name.trim(), heroPower: deck.heroPower, cards: [...deck.cards] })) };
  }
  function extendLegacy(deck){
    const cards=[...deck.cards],candidates=['reed-guard','moon-owl','rune-artisan','crystal-deer',...CARDS.filter(c=>c.type==='unit'&&c.cost>=2&&c.cost<=4).map(c=>c.id)];
    for(const id of candidates){if(cards.length===DECK_SIZE)break;if(cards.filter(c=>c===id).length<MAX_COPIES)cards.push(id);}
    if(cards.length!==DECK_SIZE)throw Error('旧デッキを補完できませんでした。');
    return {...deck,cards};
  }
  function backupLegacy(storage,raw){
    const prefix=`${STORAGE_KEY}-v1-backup`;let key=prefix;
    for(let i=1;i<=100;i++){const existing=storage.getItem(key);if(existing===raw)return;if(existing===null){storage.setItem(key,raw);return;}key=`${prefix}-${i}`;}
    throw Error('元のデッキを退避できませんでした。');
  }
  function loadLibrary(storage) {
    try {
      if (!storage) throw new Error('storage unavailable');
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return { library: defaultLibrary(), warning: '' };
      if (raw.length > 100000) throw new Error('too large');
      const parsed = JSON.parse(raw);
      if(parsed?.version===1){
        if(validateLibrary(parsed,1,20).length)throw Error('invalid legacy data');
        return {library:normalize({...parsed,decks:parsed.decks.map(extendLegacy)}),migrated:true,warning:'旧20枚デッキを、低コストのユニット2枚を補って22枚にしました。編集で入れ替えできます。元データは次回保存時に退避します。'};
      }
      if (libraryErrors(parsed).length) throw new Error('invalid data');
      return { library: normalize(parsed), warning: '' };
    } catch {
      return { library: defaultLibrary(), warning: '保存データを読み込めないため初期デッキを表示しています。ブラウザ保存が使えない場合はファイルに書き出してください。' };
    }
  }
  function saveLibrary(storage, library) {
    const errors = libraryErrors(library);
    if (errors.length) return { ok: false, message: errors[0] };
    try {
      const old = storage.getItem(STORAGE_KEY);
      if (old !== null) {
        let invalid = false,legacy=false;
        try {const parsed=JSON.parse(old);legacy=old.length<=100000&&parsed?.version===1&&!validateLibrary(parsed,1,20).length;invalid=old.length>100000||(!legacy&&libraryErrors(parsed).length>0);} catch { invalid = true; }
        if (invalid) storage.setItem(`${STORAGE_KEY}-backup`, old);
        if(legacy)backupLegacy(storage,old);
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(normalize(library)));
      return { ok: true, message: 'ブラウザに保存しました。' };
    } catch { return { ok: false, message: 'ブラウザ保存が使えません。この画面内で使えます。ファイルに書き出すと残せます。' }; }
  }
  function newDeckId() { return `deck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  function encodeDeck(deck) {
    const errors = deckErrors(deck); if (errors.length) throw new Error(errors[0]);
    return JSON.stringify({ format: 'seikan-deck', version: 2, deck: { name: deck.name.trim(), heroPower: deck.heroPower, cards: [...deck.cards] } }, null, 2);
  }
  function decodeDeck(text) {
    if (typeof text !== 'string' || text.length > 100000) throw new Error('ファイルが大きすぎます。');
    let data; try { data = JSON.parse(text); } catch { throw new Error('JSON形式のデッキファイルを選んでください。'); }
    if (data?.format !== 'seikan-deck' || ![1,2].includes(data.version) || !data.deck) throw new Error('対応するデッキファイルではありません。');
    let deck = { id: newDeckId(), name: data.deck.name, heroPower: data.deck.heroPower, cards: data.deck.cards };
    const errors = validateDeck(deck,true,data.version===1?20:DECK_SIZE); if (errors.length) throw new Error(errors[0]);
    if(data.version===1)deck=extendLegacy(deck);
    return { ...deck, name: deck.name.trim(), cards: [...deck.cards] };
  }
  const api = { DECK_SIZE, MAX_COPIES, MAX_DECKS, STORAGE_KEY, PRESETS, clone, cardListErrors, deckErrors, libraryErrors, defaultLibrary, loadLibrary, saveLibrary, newDeckId, encodeDeck, decodeDeck };
  if (commonJS) module.exports = api;
  else root.SeikanDecks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
