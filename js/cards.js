(function (root) {
  'use strict';
  const KEYWORDS = Object.freeze({
    swift: { name: '速攻', short: '速', description: '召喚したターンから攻撃できる。' },
    taunt: { name: '挑発', short: '挑', description: '敵の通常攻撃は、挑発を持つユニットを先に狙う。呪文には影響しない。' },
    aegis: { name: '星護', short: '護', description: '最初に受ける正のダメージを1回だけ無効化する。毒も防ぐ。' },
    poison: { name: '毒', short: '毒', description: '戦闘でユニットに1以上のダメージを与えると、そのユニットを倒す。ヒーローには無効。' }
  });
  // 効果はトリガーと処理内容を宣言する。数値・対象・順序はここで調整する。
  const definitions = [
    { id: 'spark-fox', name: 'コン速の仔狐', cost: 1, attack: 1, health: 1, tribe: '火の車団', art: 'fox', color: '#eead66', flavor: "コンなに早いとは、聞いてない。", description: '速攻。召喚したターンから攻撃可能。', keywords: ['swift'] },
    { id: 'moss-spirit', name: 'お苔づかいの精霊', cost: 1, attack: 1, health: 2, tribe: '芽でたい森', art: 'spirit', color: '#a2cbb2', flavor: "最後まで、お苔づかいを忘れない。小さな森の世話焼きさん。", description: '死亡時：自分のヒーローを2回復。', effects: [{ trigger: 'death', type: 'heal', target: 'friendly-hero', amount: 2 }] },
    { id: 'moon-owl', name: '月並みじゃない梟', cost: 2, attack: 2, health: 1, tribe: '月払い組', art: 'owl', color: '#c0b4dc', flavor: "知恵はある。月並みな答えはない。次の一枚なら、ある。", description: '召喚時：カードを1枚引く。', effects: [{ trigger: 'play', type: 'draw', amount: 1 }] },
    { id: 'reed-guard', name: '葦止めの衛士', cost: 2, attack: 2, health: 3, tribe: '芽でたい森', art: 'guard', color: '#82bcb3', flavor: "お急ぎですか。ここで、ひと葦。", description: '挑発。敵の通常攻撃を引き受ける。', keywords: ['taunt'] },
    { id: 'ember-wolf', name: '火急のオオカミ', cost: 3, attack: 3, health: 2, tribe: '火の車団', art: 'wolf', color: '#e19b7c', flavor: "火の用心より、火の用事。呼ばれたその場で、走り出す。", description: '速攻。召喚したターンから攻撃可能。', keywords: ['swift'] },
    { id: 'crystal-deer', name: '治すシカない', cost: 3, attack: 3, health: 4, tribe: '月払い組', art: 'deer', color: '#a3cde0', flavor: "「この傷、治すシカないですね」。角は立派で、物腰はやわらかい。", description: '召喚時：自分のヒーローを3回復。', effects: [{ trigger: 'play', type: 'heal', target: 'friendly-hero', amount: 3 }] },
    { id: 'dusk-knight', name: '傷ナイト', cost: 4, attack: 4, health: 3, tribe: '月払い組', art: 'knight', color: '#cbbba1', flavor: "無傷の夜にも、明けは来る。二撃目も来る。", description: '星護。最初のダメージを無効化。', keywords: ['aegis'] },
    { id: 'grove-golem', name: '大樹晩成の巨兵', cost: 4, attack: 3, health: 6, tribe: '芽でたい森', art: 'golem', color: '#a5bd83', flavor: "立派になるまで、少々お待ちを。通行も、少々お待ちを。", description: '挑発。敵の通常攻撃を引き受ける。', keywords: ['taunt'] },
    { id: 'sun-lion', name: '獅気高揚の獅子', cost: 5, attack: 4, health: 5, tribe: '火の車団', art: 'lion', color: '#e7c27b', flavor: "声は大きい。仲間の攻撃力も、ひと声ぶん大きい。", description: '召喚時：他の味方全体の攻撃力+1。', effects: [{ trigger: 'play', type: 'buff', target: 'other-friendly-units', attack: 1, health: 0 }] },
    { id: 'astral-dragon', name: '竜星の配達人', cost: 7, attack: 6, health: 6, tribe: '星勘定組', art: 'dragon', color: '#b1bfdb', flavor: "星屑のお届けです。受取印は、全員ぶん。", description: '召喚時：敵ユニット全体に2ダメージ。', effects: [{ trigger: 'play', type: 'damage', target: 'enemy-units', amount: 2 }] },
    { id: 'thorn-viper', name: '蛇足を許さぬ蛇', cost: 2, attack: 1, health: 2, tribe: '芽でたい森', art: 'viper', color: '#b3bd8b', flavor: "長話は苦手。話も勝負も、一口で。", description: '毒。戦闘で傷つけた敵ユニットを倒す。', keywords: ['poison'] },
    { id: 'star-bolt', type: 'spell', name: '一矢報いる星', cost: 2, tribe: '星勘定組', art: 'bolt', color: '#ddcba4', flavor: "お返しは三倍。送料は二マナ。", description: '敵ユニットか敵ヒーローに3ダメージ。', target: 'enemy-character', effects: [{ trigger: 'play', type: 'damage', target: 'chosen', amount: 3 }] },
    { id: 'spring-song', type: 'spell', name: '泉門の手当て', cost: 2, tribe: '芽でたい森', art: 'heal', color: '#a9d5b9', flavor: "回復のことなら、泉門家へ。紹介状は一枚です。", description: '味方ユニットか自分のヒーローを4回復。1枚引く。', target: 'friendly-character', effects: [{ trigger: 'play', type: 'heal', target: 'chosen', amount: 4 }, { trigger: 'play', type: 'draw', amount: 1 }] },
    { id: 'night-study', type: 'spell', name: '夜みふける手記', cost: 2, tribe: '月払い組', art: 'tome', color: '#bcb6db', flavor: "もう一ページ。気づけば二枚、手が止まらない。", description: 'カードを2枚引く。', effects: [{ trigger: 'play', type: 'draw', amount: 2 }] },
    { id: 'starfall', type: 'spell', name: '流星大放出', cost: 5, tribe: '星勘定組', art: 'storm', color: '#a6c5dd', flavor: "在庫一掃。敵の盤面も、なるべく一掃。", description: '敵ユニット全体に3ダメージ。', effects: [{ trigger: 'play', type: 'damage', target: 'enemy-units', amount: 3 }] },
    { id: 'verdant-vow', type: 'spell', name: '芽でたい誓い', cost: 2, tribe: '芽でたい森', art: 'blessing', color: '#c3d39f', flavor: "お芽でとうございます。攻撃もHPも、ふたつ景気よく。", description: '味方ユニット1体を+2 / +2。', target: 'friendly-unit', effects: [{ trigger: 'play', type: 'buff', target: 'chosen', attack: 2, health: 2 }] },
    { id: 'wither-touch', type: 'spell', name: 'しおしお対応', cost: 2, tribe: '月払い組', art: 'wither', color: '#bfa4c1', flavor: "おもてなしは控えめに。攻撃力も、HPも控えめに。", description: '敵ユニット1体を−2 / −2。', target: 'enemy-unit', effects: [{ trigger: 'play', type: 'buff', target: 'chosen', attack: -2, health: -2 }] }
  ];
  definitions.push(
    { id: 'zephyr-hare', name: 'うさ晴らしの兎', cost: 2, attack: 2, health: 2, tribe: '火の車団', art: 'hare', color: '#dfc595', flavor: "もやもやしたら、ひと跳び。相手は少し、もやっとする。", description: '速攻。召喚したターンから攻撃可能。', keywords: ['swift'] },
    { id: 'stone-tortoise', name: '石の意志の亀', cost: 2, attack: 1, health: 5, tribe: '芽でたい森', art: 'tortoise', color: '#a6baa2', flavor: "その意志、石より固い。甲羅もだいたい同じです。", description: '挑発。厚い甲羅で攻撃を引き受ける。', keywords: ['taunt'] },
    { id: 'cinder-hawk', name: 'タカ飛車の先陣', cost: 3, attack: 2, health: 2, tribe: '火の車団', art: 'hawk', color: '#efb289', flavor: "上から失礼。最初の一撃も、失礼します。", description: '速攻、星護。すぐに攻撃できる。', keywords: ['swift', 'aegis'] },
    { id: 'brook-heron', name: 'サギじゃない癒やし', cost: 2, attack: 2, health: 3, tribe: '芽でたい森', art: 'heron', color: '#b9d9d2', flavor: "「全員まとめて回復」。うまい話ですが、本当です。", description: '召喚時：味方ユニット全体を2回復。', effects: [{ trigger: 'play', type: 'heal', target: 'friendly-units', amount: 2 }] },
    { id: 'jade-protector', name: '盾まえの守人', cost: 5, attack: 3, health: 5, tribe: '芽でたい森', art: 'sentinel', color: '#9dd9c4', flavor: "「盾になります」は建前ではありません。", description: '挑発、星護。味方を守る二重の防壁。', keywords: ['taunt', 'aegis'] },
    { id: 'mist-stalker', name: '霧込みの狩人', cost: 4, attack: 2, health: 2, tribe: '月払い組', art: 'stalker', color: '#b2b79e', flavor: "霧込み隊長。深追いより、一刺しを大切に。", description: '速攻、毒。戦闘で傷つけたユニットを倒す。', keywords: ['swift', 'poison'] },
    { id: 'rune-artisan', name: '紋句なしの工匠', cost: 3, attack: 2, health: 3, tribe: '月払い組', art: 'mage', color: '#cebfa2', flavor: "仕上がりは紋句なし。おまけの一枚にも、紋句なし。", description: '召喚時：カードを1枚引く。', effects: [{ trigger: 'play', type: 'draw', amount: 1 }] },
    { id: 'briar-bear', name: 'クマなく手当て', cost: 4, attack: 4, health: 5, tribe: '芽でたい森', art: 'bear', color: '#bead91', flavor: "引き際まで、クマなくお世話します。", description: '死亡時：自分のヒーローを3回復。', effects: [{ trigger: 'death', type: 'heal', target: 'friendly-hero', amount: 3 }] },
    { id: 'glass-moth', name: '蛾ードの達人', cost: 3, attack: 2, health: 2, tribe: '月払い組', art: 'moth', color: '#c5bbdf', flavor: "触ると毒。触られると蛾ード。なかなかの難物です。", description: '星護、毒。小さく危険な守り手。', keywords: ['aegis', 'poison'] },
    { id: 'ash-oracle', name: '引きぎわの託宣者', cost: 4, attack: 3, health: 4, tribe: '月払い組', art: 'raven', color: '#bdb6ce', flavor: "去り際に二枚。引き継ぎ資料は、ちゃんと残す。", description: '死亡時：カードを2枚引く。', effects: [{ trigger: 'death', type: 'draw', amount: 2 }] },
    { id: 'star-sentinel', name: '天職の盾役', cost: 6, attack: 5, health: 6, tribe: '星勘定組', art: 'sentinel', color: '#afcde6', flavor: "星の下でも、職場でも。まずは前に出ます。", description: '挑発、星護。星空の下に立つ大盾。', keywords: ['taunt', 'aegis'] },
    { id: 'root-archon', name: '根気の長老', cost: 7, attack: 4, health: 8, tribe: '芽でたい森', art: 'elder', color: '#bbcc8c', flavor: "みんなを根っこから底上げ。年の功は、地に足がついている。", description: '挑発。召喚時：味方ユニット全体を+1 / +1（自身も含む）。', keywords: ['taunt'], effects: [{ trigger: 'play', type: 'buff', target: 'friendly-units', attack: 1, health: 1 }] },
    { id: 'eclipse-serpent', name: '月もツキも呑む蛇', cost: 8, attack: 7, health: 7, tribe: '星勘定組', art: 'serpent', color: '#b5a6d5', flavor: "今日はツキがない？ たぶん、あの大蛇が食べました。", description: '毒。召喚時：敵ユニット全体に1ダメージ。', keywords: ['poison'], effects: [{ trigger: 'play', type: 'damage', target: 'enemy-units', amount: 1 }] },
    { id: 'warding-rune', type: 'spell', name: '星付きの保険', cost: 2, tribe: '星勘定組', art: 'ward', color: '#b0dbf1', flavor: "補償は一回。免責は、二回目から。", description: '味方ユニット1体に星護を付与。', target: 'friendly-unit', effects: [{ trigger: 'play', type: 'shield', target: 'chosen' }] },
    { id: 'dawn-chorus', type: 'spell', name: '朝から回福', cost: 3, tribe: '芽でたい森', art: 'chorus', color: '#d2e4b3', flavor: "声をそろえて、朝から回福。ついでに一枚、福のおすそ分け。", description: '味方全体と自分のヒーローを3回復。1枚引く。', effects: [{ trigger: 'play', type: 'heal', target: 'friendly-units', amount: 3 }, { trigger: 'play', type: 'heal', target: 'friendly-hero', amount: 3 }, { trigger: 'play', type: 'draw', amount: 1 }] },
    { id: 'ember-lance', type: 'spell', name: 'お槍直し', cost: 4, tribe: '火の車団', art: 'lance', color: '#e8b194', flavor: "さっきの一投は忘れてください。こちらが本気の五点です。", description: '敵ユニットか敵ヒーローに5ダメージ。', target: 'enemy-character', effects: [{ trigger: 'play', type: 'damage', target: 'chosen', amount: 5 }] },
    { id: 'mist-veil', type: 'spell', name: '霧のいいところで', cost: 3, tribe: '月払い組', art: 'veil', color: '#b5c6dd', flavor: "「そのへんで」と霧が言う。攻撃力は、四つほどお静かに。", description: '敵ユニット1体の攻撃力−4。', target: 'enemy-unit', effects: [{ trigger: 'play', type: 'buff', target: 'chosen', attack: -4, health: 0 }] },
    { id: 'storm-pulse', type: 'spell', name: 'お星分けの余波', cost: 4, tribe: '星勘定組', art: 'orbit', color: '#b7cbe2', flavor: "星嵐が余ったので、一点ずつどうぞ。お礼は一枚で。", description: '敵ユニット全体に1ダメージ。1枚引く。', effects: [{ trigger: 'play', type: 'damage', target: 'enemy-units', amount: 1 }, { trigger: 'play', type: 'draw', amount: 1 }] },
    { id: 'cinder-bloom', type: 'spell', name: '花を持たせる焔', cost: 3, tribe: '火の車団', art: 'bloom', color: '#e9b591', flavor: "主役はみんな。花も打点も、仲間に持たせる。", description: '味方ユニット全体の攻撃力+2。', effects: [{ trigger: 'play', type: 'buff', target: 'friendly-units', attack: 2, health: 0 }] }
  );
  definitions.push(
    { id:'ember-runner', name:'火っ走る遊撃獣', cost:5, attack:5, health:4, tribe: '火の車団', art:'firebeast', color:'#efac77', flavor: "助走は不要。火のついた予定は、前倒しで。", description:'速攻。召喚したターンから攻撃可能。', keywords:['swift'] },
    { id:'spring-warden', name:'泉念する祈り手', cost:5, attack: 4, health:6, tribe: '芽でたい森', art:'mage', color:'#9cd7c0', flavor: "傷の手当てに泉念します。雑念は、水に流して。", description:'召喚時：自分のヒーローを4回復。', effects:[{trigger:'play',type:'heal',target:'friendly-hero',amount:4}] },
    { id:'frost-gatekeeper', name:'霜った、通行止め', cost:6, attack:4, health:8, tribe: '月払い組', art:'icegate', color:'#b1d9e5', flavor: "門前払いも、冷静に。冷静すぎて、少し凍ります。", description:'挑発。高いHPで味方を守る。', keywords:['taunt'] },
    { id:'verdant-tempest', type:'spell', name:'福は内、傷は外', cost: 5, tribe: '芽でたい森', art:'chorus', color:'#a0d1b5', flavor: "回福祈願。手札の福も、二枚ほどお招きします。", description:'味方全体と自分のヒーローを4回復。2枚引く。', effects:[{trigger:'play',type:'heal',target:'friendly-units',amount:4},{trigger:'play',type:'heal',target:'friendly-hero',amount:4},{trigger:'play',type:'draw',amount:2}] },
    { id:'dusk-behemoth', name:'かすみません守護獣', cost:7, attack:5, health:7, tribe: '月払い組', art:'behemoth', color:'#c2afdb', flavor: "前、失礼します。かすみませんが、攻撃はこちらへ。", description:'挑発、星護。死亡時：カードを1枚引く。', keywords:['taunt','aegis'], effects:[{trigger:'death',type:'draw',amount:1}] },
    { id:'lunar-verdict', type:'spell', name:'月払いの宣告', cost:7, tribe: '月払い組', art:'moonfall', color:'#bbaada', flavor: "お支払いは一、九の二回。月末まで、待ちません。", description:'敵ユニット1体に1ダメージ、その後同じ対象に9ダメージ。1枚引く。', target:'enemy-unit', effects:[{trigger:'play',type:'damage',target:'chosen',amount:1},{trigger:'play',type:'damage',target:'chosen',amount:9},{trigger:'play',type:'draw',amount:1}] },
    { id:'dawn-colossus', name:'朝飯前の巨獣', cost:8, attack:7, health:9, tribe: '芽でたい森', art:'colossus', color:'#cfcd91', flavor: "来ては手当て、帰っても手当て。これぐらい、朝飯前です。", description:'挑発。召喚時と死亡時：自分のヒーローを4回復。', keywords:['taunt'], effects:[{trigger:'play',type:'heal',target:'friendly-hero',amount:4},{trigger:'death',type:'heal',target:'friendly-hero',amount:4}] },
    { id:'halo-griffin', name:'ワシが先の大鷲', cost:8, attack:6, health:6, tribe: '星勘定組', art:'griffin', color:'#e8d497', flavor: "「ワシが先じゃ」。年功序列ではなく、速攻です。", description:'速攻、星護。すぐに攻撃できる。', keywords:['swift','aegis'] },
    { id:'astral-tide', type:'spell', name:'潮時の大そうじ', cost:8, tribe: '星勘定組', art:'tide', color:'#a2cbe5', flavor: "そろそろ潮時。盤面を流して、次の二枚を迎えます。", description:'敵ユニット全体に5ダメージ。2枚引く。', effects:[{trigger:'play',type:'damage',target:'enemy-units',amount:5},{trigger:'play',type:'draw',amount:2}] },
    { id:'worldroot-ancestor', name:'ご先祖の木づかい', cost:9, attack:6, health:10, tribe: '芽でたい森', art:'worldtree', color:'#b4d69f', flavor: "根回しは万全。ご先祖の木づかいは、大きい。", description:'挑発、星護。召喚時：自分のヒーローを5回復。', keywords:['taunt','aegis'], effects:[{trigger:'play',type:'heal',target:'friendly-hero',amount:5}] },
    { id:'skyfire-wyrm', name:'天下の天火竜', cost:9, attack:8, health:8, tribe: '火の車団', art:'dragon', color:'#edab91', flavor: "天下を取る前に、盤面へ天火を三点ずつ。", description:'召喚時：敵ユニット全体に3ダメージ。', effects:[{trigger:'play',type:'damage',target:'enemy-units',amount:3}] },
    { id:'final-radiance', type:'spell', name:'十点満点の終章', cost:9, tribe: '星勘定組', art:'moonfall', color:'#e3cb9b', flavor: "出来は満点。相手の体力からは、十点いただきます。", description:'敵ユニットか敵ヒーローに10ダメージ。1枚引く。', target:'enemy-character', effects:[{trigger:'play',type:'damage',target:'chosen',amount:10},{trigger:'play',type:'draw',amount:1}] }
  );
  definitions.push(
    {id:'star-survey',type:'spell',name:'星いもの探し',cost:1,tribe: '星勘定組',art:'tome',color:'#b9d4eb',flavor: "星いものは、探して選ぶ。三つとも欲しいのは、ぐっと我慢。",description:'呪文を発見。ランダムな3候補から1枚を手札に加える。',effects:[{trigger:'play',type:'discover',pool:'spell'}]},
    {id:'orbit-cartographer',name:'地図に乗る測量士',cost:3,attack:2,health:3,tribe: '月払い組',art:'mage',color:'#c6c0e2',flavor: "地図には載るし、調子にも乗る。でも選ぶのは、一枚です。",description:'召喚時：ユニットを発見。3候補から1枚を手札に加える。',effects:[{trigger:'play',type:'discover',pool:'unit'}]},
    {id:'cotton-cocoon',type:'spell',name:'綿しに任せて',cost:4,tribe: '月払い組',art:'moth',color:'#dfd8e9',flavor: "どんな大物も、綿しの手にかかれば一粒です。",description:'敵ユニット1体を能力のない1/1の「わたわたの芽」に変身。星護を無視し、死亡時効果は発動しない。',target:'enemy-unit',effects:[{trigger:'play',type:'transform',target:'chosen',into:'cotton-sprout'}]},
    {id:'crystal-renewal',type:'spell',name:'樹分一新の再生',cost:3,tribe: '芽でたい森',art:'worldtree',color:'#b4d9ba',flavor: "気分も、枝ぶりも一新。昔のことは、根に持ちません。",description:'味方ユニット1体を挑発を持つ4/6の「気になる守樹」に変身。攻撃権は引き継ぐ。',target:'friendly-unit',effects:[{trigger:'play',type:'transform',target:'chosen',into:'crystal-treant'}]}
  );
  // v2.0：武器・逸品・山札変異と、選ぶ／賭ける効果。
  definitions.push(
    {id:'first-blade',type:'weapon',name:'刃じめの一本',cost:1,attack:1,durability:3,art:'sword',description:'武器1/3。ヒーローが毎ターン1回攻撃できる。'},
    {id:'moon-staff',type:'weapon',name:'月とスッポン杖',cost:2,attack:2,durability:2,art:'staff',description:'武器2/2。ユニットを攻撃すると反撃を受ける。'},
    {id:'wish-axe',type:'weapon',name:'お斧ぞみ通り',cost:3,attack:3,durability:2,art:'axe',description:'武器3/2。装備したターンから攻撃できる。'},
    {id:'reaping-scythe',type:'weapon',name:'星払いの大鎌',cost:4,attack:4,durability:2,art:'scythe',description:'武器4/2。攻撃後：自分のヒーローを2回復。',effects:[{trigger:'attack',type:'heal',target:'friendly-hero',amount:2}]},
    {id:'singular-saber',type:'weapon',rarity:'unique',name:'一刀星断',cost:6,attack:5,durability:3,art:'sword',description:'逸品（構築は同名1枚）。武器5/3。'},
    {id:'forge-finder',name:'掘り出し鍛冶',cost:2,attack:2,health:1,art:'forge',description:'召喚時：武器を発見。3候補から1枚選ぶ。',effects:[{trigger:'play',type:'discover',pool:'weapon'}]},
    {id:'early-market',type:'spell',name:'先の見本市',cost:1,art:'scales',description:'3マナ以下のカードを発見。3候補から1枚選ぶ。',effects:[{trigger:'play',type:'discover',pool:'any',maxCost:3}]},
    {id:'giant-appraiser',name:'大物色の目利き',cost:4,attack:3,health:4,art:'scales',description:'召喚時：7マナ以上のユニットを発見。',effects:[{trigger:'play',type:'discover',pool:'unit',minCost:7}]},
    {id:'rare-fair',type:'spell',name:'一点もの探し',cost:2,art:'tome',description:'逸品カードを発見。その後カードを1枚引く。',effects:[{trigger:'play',type:'discover',pool:'any',rarity:'unique'},{trigger:'play',type:'draw',amount:1}]},
    {id:'growth-lottery',type:'spell',name:'伸るか、芽るか',cost:2,art:'dice',description:'味方1体を、元のカードより1マナ高いランダムなユニットに変身（最大9）。',target:'friendly-unit',effects:[{trigger:'play',type:'transformRandom',target:'chosen',delta:1}]},
    {id:'small-print',type:'spell',name:'小さな約款',cost:3,art:'mask',description:'敵1体を3マナ以下のランダムなユニットに変身。死亡時効果は発動しない。',target:'enemy-unit',effects:[{trigger:'play',type:'transformRandom',target:'chosen',maxCost:3}]},
    {id:'cotton-arbiter',name:'綿密な調停者',cost:6,attack:4,health:5,art:'mask',description:'召喚時：敵1体を能力なしの1/1「わたわたの芽」に変身。',target:'enemy-unit',effects:[{trigger:'play',type:'transform',target:'chosen',into:'cotton-sprout'}]},
    {id:'dice-shower',type:'spell',name:'当たり星ずれ',cost:2,art:'dice',description:'ランダムな敵ユニットに1ダメージを4回。各回で生存中の対象を選び直す。',effects:[{trigger:'play',type:'missiles',amount:1,count:4}]},
    {id:'tool-inspector',name:'持ち物検査官',cost:3,attack:3,health:3,art:'forge',description:'召喚時：相手の武器を破壊。',effects:[{trigger:'play',type:'shatter'}]},
    {id:'surprise-guests',type:'spell',name:'飛び入りの芽客',cost:4,art:'seed',description:'2〜3マナのランダムなユニットを2体召喚。召喚時効果は発動しない。',effects:[{trigger:'play',type:'summon',pool:'unit',minCost:2,maxCost:3,amount:2}]},
    {id:'deck-grafting',type:'spell',name:'山札の植え替え',cost:2,art:'seed',description:'残り山札のユニットを、それぞれ1マナ高いランダムなユニットに変える（最大9）。1枚引く。',effects:[{trigger:'play',type:'mutate',from:'unit',delta:1},{trigger:'play',type:'draw',amount:1}]},
    {id:'paper-alchemist',name:'紙頼みの錬金術師',cost:5,attack:4,health:5,art:'mask',description:'召喚時：残り山札の呪文を、同じマナのランダムなユニットに変える。',effects:[{trigger:'play',type:'mutate',from:'spell',delta:0}]},
    {id:'ancestral-editor',name:'大改定の樹長',rarity:'unique',cost:8,attack:7,health:9,keywords:['taunt'],art:'elder',description:'逸品。挑発。召喚時：残り山札すべてを6〜9マナのランダムなユニットに変える。自分のヒーローを4回復。',effects:[{trigger:'play',type:'mutate',minCost:6,maxCost:9},{trigger:'play',type:'heal',target:'friendly-hero',amount:4}]},
    {id:'giant-eviction',type:'spell',name:'大物おこと割り',cost:4,art:'scales',description:'攻撃力5以上の敵ユニット1体を破壊。星護を無視する。',target:'enemy-large',effects:[{trigger:'play',type:'destroy',target:'chosen'}]},
    {id:'return-receipt',type:'spell',name:'お帰りの伝票',cost:2,art:'tome',description:'敵ユニット1体を持ち主の手札へ戻す。手札が10枚なら消滅。死亡時効果は発動しない。',target:'enemy-unit',effects:[{trigger:'play',type:'bounce',target:'chosen'}]},
    {id:'quiet-clause',type:'spell',name:'沈目のお願い',cost:2,art:'mask',description:'敵1体を沈黙させ、カードを1枚引く。沈黙は能力・星護・強化を除去し、受けたダメージは残す。',target:'enemy-unit',effects:[{trigger:'play',type:'silence',target:'chosen'},{trigger:'play',type:'draw',amount:1}]},
    {id:'ledger-titan',name:'星取りの大帳老',rarity:'unique',cost:9,attack:5,health:8,art:'scales',description:'逸品。召喚時：挑発を持つ4/6の「気になる守樹」を2体召喚。',effects:[{trigger:'play',type:'summon',into:'crystal-treant',amount:2}]},
    {id:'gravity-accountant',name:'万有引力の勘定士',rarity:'unique',cost:7,attack:4,health:7,art:'orbit',description:'逸品。召喚時：攻撃力が最も高い敵1体を破壊。同率ならランダム。',effects:[{trigger:'play',type:'destroy',target:'strongest-enemy'}]},
    {id:'final-audit',type:'spell',name:'大物だけの決算',rarity:'unique',cost:6,art:'scales',description:'逸品。攻撃力5以上の敵ユニットをすべて破壊。カードを1枚引く。',effects:[{trigger:'play',type:'destroy',target:'large-enemies'},{trigger:'play',type:'draw',amount:1}]}
  );
  definitions.push(
    {id:'quote-master',name:'見積もりの名匠',rarity:'unique',cost:2,attack:2,health:2,art:'mage',flavor:'お見積もりは三案。採用は、一案です。',description:'逸品。召喚時：呪文を発見。3候補から1枚を手札に加える。',effects:[{trigger:'play',type:'discover',pool:'spell'}]},
    {id:'insured-scribe',name:'筆頭の保険係',rarity:'unique',cost:3,attack:3,health:3,keywords:['aegis'],art:'knight',flavor:'一筆添えて、一撃備えて。退職時には引き継ぎ一枚。',description:'逸品。星護。死亡時：カードを1枚引く。',effects:[{trigger:'death',type:'draw',amount:1}]},
    {id:'cotton-contingency',type:'spell',name:'綿全の一策',rarity:'unique',cost:4,art:'moth',flavor:'大物への備えは綿全。次の一手も、抜かりなく。',description:'逸品。敵ユニット1体を能力のない1/1の「わたわたの芽」に変身。カードを1枚引く。',target:'enemy-unit',effects:[{trigger:'play',type:'transform',target:'chosen',into:'cotton-sprout'},{trigger:'play',type:'draw',amount:1}]},
    {id:'sprout-president',name:'二芽目の社長',rarity:'unique',cost:5,attack:4,health:5,keywords:['taunt'],art:'elder',flavor:'芽が出た会社は、社長も前に出る。新芽を二名、採用です。',description:'逸品。挑発。召喚時：1/1の「わたわたの芽」を2体召喚。',effects:[{trigger:'play',type:'summon',into:'cotton-sprout',amount:2}]}
  );
  const CARDS = Object.freeze(definitions.map((card,index) => Object.freeze({
    type: 'unit', tribe:'星勘定組', color:({sword:'#e3c28e',staff:'#afd8e0',axe:'#d7b190',scythe:'#a2cec6',forge:'#deb487',scales:'#d9cc96',dice:'#bbb2df',mask:'#b7bfdf',seed:'#b1d09d'})[card.art]||'#b5cde0', flavor:({ 'first-blade':'初めてでも、刃じめまして。','moon-staff':'差がつくのは、月に一度とは限らない。','wish-axe':'ご注文は、お斧ぞみの切れ味で。','reaping-scythe':'星払い。お支払いは、相手の体力から。','singular-saber':'一度きりの逸品も、三度までは斬れます。','forge-finder':'鍛えているのは、目利きの腕です。','early-market':'先を見越して、見本を一枚。','giant-appraiser':'小物には、目もくれません。','rare-fair':'一点ものなので、一点だけ。','growth-lottery':'伸びしろはあります。行き先は未定です。','small-print':'大事なことほど、小さく書いてある。','cotton-arbiter':'綿密な話し合いで、みんな小さくまとまった。','dice-shower':'当たりも星ずれも、一点は一点。','tool-inspector':'お持ちの武器、持ち帰れません。','surprise-guests':'二名さま、飛び入りで芽席いたします。','deck-grafting':'山札も、そろそろ鉢が手狭です。','paper-alchemist':'紙さまお願い、次はユニットで。','ancestral-editor':'小さな改定では、気が済まない。','giant-eviction':'大きなお願いほど、おこと割り。','return-receipt':'お帰りはこちら。再入場は通常料金です。','quiet-clause':'その説明、沈目にお願いします。','ledger-titan':'大きな帳簿には、二人の補佐がつきます。','gravity-accountant':'大きな勘定ほど、引き受けます。','final-audit':'小口のお客さまは、そのままで。' })[card.id]||'星の数ほど、手があります。', rarity:'standard', expansion:index>=52, ...card,
    keywords: Object.freeze([...(card.keywords || [])]),
    effects: Object.freeze((card.effects || []).map(effect => Object.freeze(effect)))
  })));
  const SUPPORT_CARD = Object.freeze({ id: 'orbit-shard', type: 'spell', collectible: false, name: '後攻の先借り', cost: 0, tribe: '後攻支援', art: 'orbit', color: '#dfc88d', keywords: Object.freeze([]), flavor: "後から来ても、先の一手。今だけ一マナ、前倒しでどうぞ。", description: 'このターンのみ使用可能なマナを1得る（最大10）。通常のマナ上限は増えない。', effects: Object.freeze([Object.freeze({ trigger: 'play', type: 'mana', amount: 1 })]) });
  const TOKEN_CARDS = Object.freeze([
    {id:'cotton-sprout',name:'わたわたの芽',cost:1,attack:1,health:1,art:'spirit',color:'#e3dce6',description:'能力なし。変身でのみ登場。',flavor: "大物だった気がする。いまは、わたわたしている。",tribe: '月払い組',keywords:[]},
    {id:'crystal-treant',name:'気になる守樹',cost:5,attack:4,health:6,art:'worldtree',color:'#b4d9ba',description:'挑発。変身でのみ登場。',flavor: "放っておけない木になる存在。とりあえず、前に立ちます。",tribe: '芽でたい森',keywords:['taunt']}
  ].map(card=>Object.freeze({type:'unit',collectible:false,...card,keywords:Object.freeze(card.keywords),effects:Object.freeze([])})));
  const BY_ID = Object.freeze(Object.fromEntries([...CARDS, SUPPORT_CARD,...TOKEN_CARDS].map(card => [card.id, card])));
  const FIXED_DECK = Object.freeze([...definitions.slice(0, 17).map(card => card.id), 'spark-fox', 'reed-guard', 'moon-owl', 'crystal-deer', 'thorn-viper']);
  const copyLimit = card => card.rarity === 'unique' ? 1 : 2;
  const api = { copyLimit, CARDS, BY_ID, FIXED_DECK, KEYWORDS, SUPPORT_CARD, TOKEN_CARDS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeikanCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
