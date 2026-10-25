(function (root) {
  'use strict';
  const { CARDS, BY_ID, KEYWORDS, copyLimit } = SeikanCards;
  const { POWERS, BY_POWER } = SeikanHeroes;
  const D = SeikanDecks;
  function createEditor({ cardMarkup, onStart, onOpen, onClose, onDetail }) {
    const $ = id => document.getElementById(id);
    let storage;
    try { storage = window.localStorage; } catch { /* メモリ内で編集・対戦を続けられる。 */ }
    const loaded = D.loadLibrary(storage);
    let library = loaded.library;
    let selectedId = library.activeId;
    const drafts = new Map();
    const unsaved = new Set();
    let notice = loaded.warning || `全${CARDS.length}種類から選べます。通常は同名2枚、逸品は同名1枚まで。保存済みデッキはブラウザに残ります。`;
    let error = Boolean(loaded.warning) && !loaded.migrated;
    let storageWarning = loaded.migrated ? '' : loaded.warning || '';
    const current = () => drafts.get(selectedId) || library.decks.find(deck => deck.id === selectedId);
    function draft() {
      if (!drafts.has(selectedId)) drafts.set(selectedId, D.clone(current()));
      return drafts.get(selectedId);
    }
    function tell(text, bad = false) { notice = text; error = bad; $('deck-notice').textContent = text; $('deck-notice').classList.toggle('error', bad); }
    const counts = deck => deck.cards.reduce((map, id) => (map[id] = (map[id] || 0) + 1, map), {});
    function persist() {
      const stored = { ...library, decks: library.decks.filter(deck => !unsaved.has(deck.id)) };
      const result = D.saveLibrary(storage, stored);
      storageWarning = result.ok ? '' : `${result.message} デッキはこのページ内だけで使用中です。デッキ編集の「ファイル書出」で控えを残せます。`;
      tell(result.ok ? 'ブラウザに保存しました。ファイルにも書き出せます。' : `${result.message} このページでは使えます。ファイル書き出しで控えを残してください。`, !result.ok);
      return result.ok;
    }
    function syncFields() {
      $('deck-select').replaceChildren();
      for (const deck of library.decks) {
        const option = document.createElement('option'); option.value = deck.id;
        option.textContent = `${drafts.get(deck.id)?.name || deck.name}${deck.id === library.activeId ? ' · 使用中' : ''}${drafts.has(deck.id) ? ' *' : ''}`;
        $('deck-select').append(option);
      }
      $('deck-select').value = selectedId;
      $('deck-name').value = current().name;
      $('deck-power').value = current().heroPower;
    }
    function renderCards() {
      const deck = current(); const count = counts(deck);
      const query = $('deck-search').value.trim().toLocaleLowerCase();
      const cost = $('deck-cost').value; const type = $('deck-type').value; const trait = $('deck-trait').value;
      const visible = CARDS.filter(card => {
        if(trait==='new'&&card.edition!=='2.9.0')return false;
        const text = `${card.name} ${card.description} ${card.tribe} ${card.keywords.map(key => KEYWORDS[key].name).join(' ')}`.toLocaleLowerCase();
        if(trait==='stats'&&!card.effects.some(e=>['buff','setStats','swapStats'].includes(e.type)))return false;
        if(trait==='aoe'&&!card.effects.some(e=>['enemy-units','friendly-units','other-friendly-units','all-units','large-enemies'].includes(e.target)))return false;
        return (!query || text.includes(query)) && (!type || card.type === type) && (!cost || (cost === '7+' ? card.cost >= 7 : card.cost === Number(cost))) && (!trait || ['stats','aoe','new'].includes(trait) || (trait==='unique'?card.rarity==='unique':trait === 'death' ? card.effects.some(effect => effect.trigger === 'death') : ['discover','transform','mutate'].includes(trait)?card.effects.some(effect=>effect.type===trait||(trait==='transform'&&effect.type==='transformRandom')):card.keywords.includes(trait)));
      }).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
      $('deck-filter-count').textContent = `${visible.length} / ${CARDS.length} 種類`;
      $('deck-cards').innerHTML = visible.map(card => `<div class="editor-card">${cardMarkup(card, `editor-${card.id}`, 'collection')}<div class="card-quantity"><span>採用 ${count[card.id] || 0} / ${copyLimit(card)}</span><button data-add="${card.id}" aria-label="${card.name}を1枚追加" ${(count[card.id] || 0) >= copyLimit(card) || deck.cards.length >= D.DECK_SIZE ? 'disabled' : ''}>＋ 追加</button></div></div>`).join('');
      if (!visible.length) $('deck-cards').textContent = '条件に合うカードがありません。検索条件を変えてください。';
    }
    function renderDeck() {
      const deck = current(); const count = counts(deck); const errors = D.deckErrors(deck);
      $('deck-size').textContent = `${deck.cards.length} / ${D.DECK_SIZE}`;
      $('deck-size').classList.toggle('complete', !errors.length);
      const units = deck.cards.filter(id => BY_ID[id].type === 'unit').length;
      const average = deck.cards.length ? (deck.cards.reduce((n, id) => n + BY_ID[id].cost, 0) / deck.cards.length).toFixed(1) : '—';
      $('deck-stats').textContent = `ユニット ${units} · 呪文 ${deck.cards.filter(id=>BY_ID[id].type==='spell').length} · 武器 ${deck.cards.filter(id=>BY_ID[id].type==='weapon').length} · 平均マナ ${average}`;
      $('deck-power-description').textContent = `2マナ / 毎ターン1回：${BY_POWER[deck.heroPower].description}`;
      $('deck-validation').textContent = errors[0] || '22枚のデッキが完成しました。';
      $('deck-save').disabled = $('deck-start').disabled = $('deck-export').disabled = Boolean(errors.length);
      $('deck-new').disabled = $('deck-duplicate').disabled = library.decks.length >= D.MAX_DECKS;
      $('deck-delete').disabled = !unsaved.has(selectedId) && library.decks.filter(item => !unsaved.has(item.id)).length <= 1;
      $('deck-rows').innerHTML = Object.keys(count).sort((a, b) => BY_ID[a].cost - BY_ID[b].cost || a.localeCompare(b)).map(id => {
        const card = BY_ID[id];
        return `<div class="deck-row"><span class="row-cost">${card.cost}</span><button class="row-name" data-detail="${id}" title="詳細を表示">${card.name}<small>${card.type === 'spell' ? '呪文' : card.keywords.map(key => KEYWORDS[key].name).join(' · ') || 'ユニット'}</small></button><button data-remove="${id}" aria-label="${card.name}を1枚外す">−</button><b>${count[id]}</b><button data-add="${id}" aria-label="${card.name}を1枚追加" ${count[id] >= copyLimit(card) || deck.cards.length >= D.DECK_SIZE ? 'disabled' : ''}>＋</button></div>`;
      }).join('');
      if (!deck.cards.length) $('deck-rows').textContent = '左のカードから22枚選びましょう。';
      $('deck-curve').innerHTML = Array.from({ length: 9 }, (_, index) => {
        const cost=index+1, amount = deck.cards.filter(id => BY_ID[id].cost === cost).length;
        return `<div title="${cost}マナ：${amount}枚"><span>${amount || ''}</span><i style="height:${Math.max(2, amount * 7)}px"></i><small>${cost}</small></div>`;
      }).join('');
      tell(notice, error);
    }
    function render() { syncFields(); renderCards(); renderDeck(); }
    function changeCount(id, delta) {
      const deck = draft(); const count = counts(deck)[id] || 0;
      if (!Object.hasOwn(BY_ID, id) || (delta > 0 && (count >= copyLimit(BY_ID[id]) || deck.cards.length >= D.DECK_SIZE)) || (delta < 0 && !count)) return;
      if (delta > 0) deck.cards.push(id); else deck.cards.splice(deck.cards.indexOf(id), 1);
      tell('編集中です。保存するまで、保存済みの内容は変わりません。'); render();
    }
    function save(active) {
      const deck = D.clone(current()); deck.name = deck.name.trim();
      const errors = D.deckErrors(deck); if (errors.length) { tell(errors[0], true); return false; }
      library.decks[library.decks.findIndex(item => item.id === selectedId)] = deck;
      if (active) library.activeId = selectedId;
      drafts.delete(selectedId); unsaved.delete(selectedId); persist(); render(); return true;
    }
    function addDeck(deck) {
      if (library.decks.length >= D.MAX_DECKS) { tell('デッキは12個までです。不要なデッキを削除してください。', true); return; }
      // 不完全な新規デッキもページ内には保持するが、保存ライブラリには完成品だけを置く。
      library.decks.push(D.clone(deck)); selectedId = deck.id; drafts.set(deck.id, deck); unsaved.add(deck.id);
      tell('新しいデッキを編集中です。22枚にして保存してください。'); render();
    }
    $('deck-select').addEventListener('change', event => { selectedId = event.target.value; render(); });
    $('deck-name').addEventListener('input', event => { draft().name = event.target.value; renderDeck(); });
    for (const power of POWERS) { const option = document.createElement('option'); option.value = power.id; option.textContent = power.name; $('deck-power').append(option); }
    $('deck-power').addEventListener('change', event => { draft().heroPower = event.target.value; renderDeck(); });
    for (const id of ['deck-search', 'deck-cost', 'deck-type', 'deck-trait']) $(id).addEventListener(id === 'deck-search' ? 'input' : 'change', () => { renderCards(); $('deck-cards').scrollTop = 0; });
    $('deck-dialog').addEventListener('click', event => {
      const add = event.target.closest('[data-add]'); const remove = event.target.closest('[data-remove]');
      const detail = event.target.closest('[data-detail], [data-card-id]');
      if (add) changeCount(add.dataset.add, 1); else if (remove) changeCount(remove.dataset.remove, -1);
      else if (detail) onDetail(detail.dataset.detail || detail.dataset.cardId);
    });
    $('deck-new').addEventListener('click', () => addDeck({ id: D.newDeckId(), name: '星勘定の仕込み帳', heroPower: 'green-rest', cards: [] }));
    $('deck-duplicate').addEventListener('click', () => addDeck({ ...D.clone(current()), id: D.newDeckId(), name: `${current().name.slice(0, 36)}の写し` }));
    $('deck-delete').addEventListener('click', () => {
      if ($('deck-delete').disabled) return;
      library.decks = library.decks.filter(deck => deck.id !== selectedId); drafts.delete(selectedId); unsaved.delete(selectedId);
      if (library.activeId === selectedId) library.activeId = library.decks.find(item => !unsaved.has(item.id)).id;
      selectedId = library.activeId; persist(); render();
    });
    $('deck-save').addEventListener('click', () => save(false));
    $('deck-start').addEventListener('click', () => { if (save(true)) { $('deck-dialog').close(); onStart(); } });
    $('deck-export').addEventListener('click', () => {
      try {
        const url = URL.createObjectURL(new Blob([D.encodeDeck(current())], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'hoshikanjo-deck.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); tell('デッキファイルを書き出しました。ブラウザのダウンロード先をご確認ください。');
      } catch (failure) { tell(failure.message, true); }
    });
    $('deck-import').addEventListener('click', () => $('deck-file').click());
    $('deck-file').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 100000) throw new Error('ファイルが大きすぎます。');
        const deck = D.decodeDeck(await file.text());
        if (library.decks.length >= D.MAX_DECKS) throw new Error('デッキは12個までです。');
        library.decks.push(deck); selectedId = deck.id; persist(); render();
      } catch (failure) { tell(failure.message, true); }
      event.target.value = '';
    });
    $('deck-dialog').addEventListener('close', onClose);
    return {
      open() { render(); onOpen(); $('deck-dialog').showModal(); },
      activeDeck() { return D.clone(library.decks.find(deck => deck.id === library.activeId)); },
      storageWarning() { return storageWarning; }
    };
  }
  root.SeikanDeckEditor = { createEditor };
})(globalThis);
