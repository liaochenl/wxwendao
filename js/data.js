/* 《五行问道》静态数据。浏览器挂载 WX_DATA，Node 直接导出。 */
(function (root) {
  'use strict';

  const ELEMENTS = {
    wood:  { id: 'wood',  name: '木', glyph: '木', color: '#5aa86e', dark: '#20342a', generates: 'fire',  overcomes: 'earth', order: 0 },
    fire:  { id: 'fire',  name: '火', glyph: '火', color: '#d95b45', dark: '#3a201c', generates: 'earth', overcomes: 'metal', order: 1 },
    earth: { id: 'earth', name: '土', glyph: '土', color: '#c6a05a', dark: '#332a1c', generates: 'metal', overcomes: 'water', order: 2 },
    metal: { id: 'metal', name: '金', glyph: '金', color: '#AFC9D8', dark: '#243642', generates: 'water', overcomes: 'wood',  order: 3 },
    water: { id: 'water', name: '水', glyph: '水', color: '#5f95bd', dark: '#1d2c38', generates: 'wood',  overcomes: 'fire',  order: 4 },
    none:  { id: 'none',  name: '无', glyph: '无', color: '#9c978c', dark: '#2a2a28', generates: null,    overcomes: null,    order: 5 }
  };

  const ELEMENT_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];

  const STATUSES = {
    poison:     { id: 'poison',     name: '中毒', glyph: '毒', debuff: true,  decay: 'turnStart', desc: '回合开始时失去等同层数的生命，然后层数减 1。无视护甲。' },
    burn:       { id: 'burn',       name: '灼烧', glyph: '灼', debuff: true,  decay: 'turnEnd',   desc: '回合结束时失去等同层数的生命，然后层数减 1。' },
    weak:       { id: 'weak',       name: '虚弱', glyph: '弱', debuff: true,  decay: 'turnEnd',   desc: '造成的攻击伤害降低 25%。回合结束时减 1。' },
    vulnerable: { id: 'vulnerable', name: '易伤', glyph: '伤', debuff: true,  decay: 'turnEnd',   desc: '受到的攻击伤害提高 50%。回合结束时减 1。' },
    strength:   { id: 'strength',   name: '锐气', glyph: '锐', debuff: false, decay: 'none',      desc: '每次攻击伤害 +N。' },
    dexterity:  { id: 'dexterity',  name: '坚韧', glyph: '韧', debuff: false, decay: 'none',      desc: '每次获得护甲 +N。' },
    regen:      { id: 'regen',      name: '回春', glyph: '春', debuff: false, decay: 'turnEnd',   desc: '回合结束时回复 N 点生命，然后层数减 1。' },
    thorns:     { id: 'thorns',     name: '荆棘', glyph: '棘', debuff: false, decay: 'none',      desc: '被攻击时对攻击者造成 N 点伤害。' },
    ritual:     { id: 'ritual',     name: '蓄势', glyph: '蓄', debuff: false, decay: 'none',      desc: '回合开始时获得 N 点锐气。' },
    stun:       { id: 'stun',       name: '定身', glyph: '定', debuff: true,  decay: 'none',      desc: '跳过下一次行动。' }
  };

  const CHARACTERS = [
    {
      id: 'sword', name: '剑修·凌霄', title: '一剑破万法', maxHp: 72,
      elements: ['metal', 'water'], accent: '#d9c99a',
      resource: { id: 'swordIntent', name: '剑意', max: 10, gainPerCardMax: 3 },
      buildTags: ['sword_intent', 'sword_cycle', 'sword_chain'],
      passive: '剑心', passiveText: '每回合第一张攻击牌结算后，对其目标额外造成 4 点伤害。',
      flavor: '三尺青锋，问的是心中那口气。',
      relic: 'qing_feng',
      deck: [{ id: 'jin_ren', count: 5 }, { id: 'liu_yun', count: 4 }, { id: 'duan_yue', count: 1 }]
    },
    {
      id: 'alchemist', name: '丹修·青萝', title: '一炉春秋', maxHp: 66,
      elements: ['wood', 'fire'], accent: '#8ec08a',
      resource: { id: 'furnaceFire', name: '炉火', max: 8, gainPerCardMax: 2 },
      buildTags: ['poison', 'burn', 'regen'],
      passive: '药心', passiveText: '每次对敌人施加中毒时，额外施加 1 层。',
      flavor: '药能救人，也能杀人。',
      relic: 'yao_nang',
      deck: [{ id: 'chan_si', count: 5 }, { id: 'chi_yan', count: 4 }, { id: 'bai_cao', count: 1 }]
    },
    {
      id: 'monk', name: '体修·磐石', title: '一力降十会', maxHp: 84,
      elements: ['earth', 'metal'], accent: '#c9a56a',
      resource: { id: 'battleMomentum', name: '战势', max: 10, gainPerCardMax: 2 },
      buildTags: ['monk_block', 'monk_thorns', 'monk_ritual'],
      passive: '厚土', passiveText: '回合开始时，护甲最多保留 4 点。',
      flavor: '山不来就我，我便去就山。',
      relic: 'tie_jia',
      deck: [{ id: 'yan_quan', count: 5 }, { id: 'jin_zhong', count: 4 }, { id: 'shan_yue', count: 1 }]
    }
  ];

  /* ---------------- 卡牌 ----------------
     effects 支持 op:
     damage(value,hits,target:'enemy'|'all',pierce,perChain) block(value,perChain)
     draw energy heal status(status,value,target:'enemy'|'self'|'allEnemies')
     multiplyStatus cleanse addCard(cardId,count,pile) loseHp gainMaxHp
     upgradeHand discardRandom chain(value,trigger)
     cond 支持 {chainAtLeast:n} {chainBelow:n}
  */
  const CARDS = [
    /* ===== 初始牌 ===== */
    { id: 'jin_ren', name: '金刃斩', element: 'metal', cost: 1, type: 'attack', rarity: 'starter', text: '造成 6 点伤害。',
      effects: [{ op: 'damage', value: 6 }],
      up: { effects: [{ op: 'damage', value: 9 }], text: '造成 9 点伤害。' } },
    { id: 'liu_yun', name: '流云护', element: 'water', cost: 1, type: 'skill', rarity: 'starter', text: '获得 6 点护甲。',
      effects: [{ op: 'block', value: 6 }],
      up: { effects: [{ op: 'block', value: 9 }], text: '获得 9 点护甲。' } },
    { id: 'duan_yue', name: '断岳', element: 'metal', cost: 2, type: 'attack', rarity: 'starter', text: '造成 14 点伤害。',
      effects: [{ op: 'damage', value: 14 }],
      up: { effects: [{ op: 'damage', value: 19 }], text: '造成 19 点伤害。' } },
    { id: 'chan_si', name: '缠丝诀', element: 'wood', cost: 1, type: 'attack', rarity: 'starter', tags: ['poison'], text: '造成 4 点伤害，施加 2 层中毒。',
      effects: [{ op: 'damage', value: 4 }, { op: 'status', status: 'poison', value: 2, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 5 }, { op: 'status', status: 'poison', value: 3, target: 'enemy' }], text: '造成 5 点伤害，施加 3 层中毒。' } },
    { id: 'chi_yan', name: '赤炎符', element: 'fire', cost: 1, type: 'attack', rarity: 'starter', tags: ['burn'], text: '造成 5 点伤害，施加 2 层灼烧。',
      effects: [{ op: 'damage', value: 5 }, { op: 'status', status: 'burn', value: 2, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 7 }, { op: 'status', status: 'burn', value: 3, target: 'enemy' }], text: '造成 7 点伤害，施加 3 层灼烧。' } },
    { id: 'bai_cao', name: '百草回春', element: 'wood', cost: 2, type: 'skill', rarity: 'starter', text: '回复 8 点生命，获得 5 点护甲。',
      effects: [{ op: 'heal', value: 8 }, { op: 'block', value: 5 }],
      up: { effects: [{ op: 'heal', value: 11 }, { op: 'block', value: 7 }], text: '回复 11 点生命，获得 7 点护甲。' } },
    { id: 'yan_quan', name: '岩拳', element: 'earth', cost: 1, type: 'attack', rarity: 'starter', tags: ['monk_ritual'], text: '造成 7 点伤害。',
      effects: [{ op: 'damage', value: 7 }],
      up: { effects: [{ op: 'damage', value: 10 }], text: '造成 10 点伤害。' } },
    { id: 'jin_zhong', name: '金钟罩', element: 'earth', cost: 1, type: 'skill', rarity: 'starter', tags: ['monk_block'], text: '获得 6 点护甲。',
      effects: [{ op: 'block', value: 6 }],
      up: { effects: [{ op: 'block', value: 9 }], text: '获得 9 点护甲。' } },
    { id: 'shan_yue', name: '山岳崩', element: 'earth', cost: 2, type: 'attack', rarity: 'starter', tags: ['monk_block'], text: '造成 13 点伤害，获得 3 点护甲。',
      effects: [{ op: 'damage', value: 13 }, { op: 'block', value: 3 }],
      up: { effects: [{ op: 'damage', value: 17 }, { op: 'block', value: 5 }], text: '造成 17 点伤害，获得 5 点护甲。' } },

    /* ===== 剑修 ===== */
    { id: 'wan_jian', name: '万剑归宗', element: 'metal', cost: 2, type: 'attack', rarity: 'uncommon', character: 'sword', tags: ['sword_intent', 'sword_chain'], text: '造成 4 段 4 点伤害。剑意至少 5 时额外攻击 1 次。',
      effects: [{ op: 'damage', value: 4, hits: 4, extraHitsAtResource: 5, extraHits: 1 }],
      up: { effects: [{ op: 'damage', value: 5, hits: 4, extraHitsAtResource: 5, extraHits: 2 }], text: '造成 4 段 5 点伤害。剑意至少 5 时额外攻击 2 次。' } },
    { id: 'xin_jian', name: '心剑', element: 'water', cost: 1, type: 'attack', rarity: 'uncommon', character: 'sword', tags: ['sword_cycle', 'sword_chain'], text: '造成 7 点伤害，抽 1 张牌。每层连携使伤害 +1；本牌续链时额外获得 1 剑意。',
      effects: [{ op: 'damage', value: 7, perChain: 1 }, { op: 'draw', value: 1 }, { op: 'gainResource', value: 1, cond: { linked: true } }],
      up: { effects: [{ op: 'damage', value: 10, perChain: 1 }, { op: 'draw', value: 1 }, { op: 'gainResource', value: 1, cond: { linked: true } }], text: '造成 10 点伤害，抽 1 张牌。每层连携使伤害 +1；本牌续链时额外获得 1 剑意。' } },
    { id: 'po_jun', name: '破军', element: 'metal', cost: 2, type: 'attack', rarity: 'rare', character: 'sword', tags: ['sword_intent'], text: '造成 18 点伤害，贯穿护甲。剑意至少 6 时伤害 +10，不消耗剑意。',
      effects: [{ op: 'damage', value: 18, pierce: true, bonusAtResource: 6, bonusDamage: 10 }],
      up: { effects: [{ op: 'damage', value: 24, pierce: true, bonusAtResource: 6, bonusDamage: 12 }], text: '造成 24 点伤害，贯穿护甲。剑意至少 6 时伤害 +12，不消耗剑意。' } },
    { id: 'ning_feng', name: '凝锋诀', element: 'metal', cost: 1, type: 'skill', rarity: 'uncommon', character: 'sword', tags: ['sword_intent'], text: '获得 2 剑意和 5 点护甲。',
      effects: [{ op: 'gainResource', value: 2 }, { op: 'block', value: 5 }],
      up: { effects: [{ op: 'gainResource', value: 3 }, { op: 'block', value: 7 }], text: '获得 3 剑意和 7 点护甲。' } },
    { id: 'yi_jian_kai_tian', name: '一剑开天', element: 'metal', cost: 2, type: 'attack', rarity: 'rare', character: 'sword', tags: ['sword_intent'], finisher: true, text: '造成 12 点伤害。消耗全部剑意，每点额外造成 4 点伤害；剑意至少 8 时贯穿护甲。',
      effects: [{ op: 'damage', value: 12, perResource: 4, consumeResource: true, pierceAtResource: 8 }],
      up: { effects: [{ op: 'damage', value: 16, perResource: 5, consumeResource: true, pierceAtResource: 8 }], text: '造成 16 点伤害。消耗全部剑意，每点额外造成 5 点伤害；剑意至少 8 时贯穿护甲。' } },
    { id: 'xing_yun_jue', name: '行云诀', element: 'water', cost: 1, type: 'skill', rarity: 'uncommon', character: 'sword', tags: ['sword_cycle'], exhaust: true, text: '抽 2 张牌；若本牌续链，获得 1 点灵气。消耗。',
      effects: [{ op: 'draw', value: 2 }, { op: 'energy', value: 1, cond: { linked: true } }],
      up: { effects: [{ op: 'draw', value: 3 }, { op: 'energy', value: 1, cond: { linked: true } }], text: '抽 3 张牌；若本牌续链，获得 1 点灵气。消耗。' } },
    { id: 'cang_lang', name: '沧浪连斩', element: 'water', cost: 2, type: 'attack', rarity: 'rare', character: 'sword', tags: ['sword_cycle'], finisher: true, text: '造成 2 段 6 点伤害。本回合此前每打出 1 张牌，每段伤害 +2（最多计 4 张）。',
      effects: [{ op: 'damage', value: 6, hits: 2, perCardsPlayed: 2, maxCardsPlayedBonus: 4 }],
      up: { effects: [{ op: 'damage', value: 8, hits: 2, perCardsPlayed: 2, maxCardsPlayedBonus: 5 }], text: '造成 2 段 8 点伤害。本回合此前每打出 1 张牌，每段伤害 +2（最多计 5 张）。' } },
    { id: 'jin_shui_yin', name: '金水引', element: 'metal', cost: 1, type: 'skill', rarity: 'uncommon', character: 'sword', tags: ['sword_chain'], text: '获得 5 点护甲，抽 1 张牌，连携 +1。',
      effects: [{ op: 'block', value: 5 }, { op: 'draw', value: 1 }, { op: 'chain', value: 1 }],
      up: { effects: [{ op: 'block', value: 7 }, { op: 'draw', value: 1 }, { op: 'chain', value: 2 }], text: '获得 7 点护甲，抽 1 张牌，连携 +2。' } },
    { id: 'tian_he', name: '天河剑阵', element: 'water', cost: 2, type: 'attack', rarity: 'rare', character: 'sword', tags: ['sword_chain'], finisher: true, text: '造成 3 段 3 点伤害，每层连携使每段伤害 +2；本牌续链时额外攻击 1 次。',
      effects: [{ op: 'damage', value: 3, hits: 3, perChain: 2, extraHitsOnLink: 1 }],
      up: { effects: [{ op: 'damage', value: 4, hits: 3, perChain: 2, extraHitsOnLink: 2 }], text: '造成 3 段 4 点伤害，每层连携使每段伤害 +2；本牌续链时额外攻击 2 次。' } },

    /* ===== 丹修 ===== */
    { id: 'wan_du', name: '万毒噬心', element: 'wood', cost: 2, type: 'skill', rarity: 'uncommon', character: 'alchemist', tags: ['poison'], text: '施加 6 层中毒。',
      effects: [{ op: 'status', status: 'poison', value: 6, target: 'enemy' }],
      up: { effects: [{ op: 'status', status: 'poison', value: 9, target: 'enemy' }], text: '施加 9 层中毒。' } },
    { id: 'fen_tian', name: '焚天诀', element: 'fire', cost: 2, type: 'attack', rarity: 'rare', character: 'alchemist', tags: ['burn'], text: '造成 8 点伤害，施加 5 层灼烧。',
      effects: [{ op: 'damage', value: 8 }, { op: 'status', status: 'burn', value: 5, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 12 }, { op: 'status', status: 'burn', value: 7, target: 'enemy' }], text: '造成 12 点伤害，施加 7 层灼烧。' } },
    { id: 'sheng_sheng', name: '生生不息', element: 'wood', cost: 1, type: 'skill', rarity: 'uncommon', character: 'alchemist', tags: ['regen'], text: '回复 5 点生命，获得 3 层回春。',
      effects: [{ op: 'heal', value: 5 }, { op: 'status', status: 'regen', value: 3, target: 'self' }],
      up: { effects: [{ op: 'heal', value: 7 }, { op: 'status', status: 'regen', value: 4, target: 'self' }], text: '回复 7 点生命，获得 4 层回春。' } },
    { id: 'shi_gu_dan', name: '蚀骨丹', element: 'wood', cost: 1, type: 'skill', rarity: 'uncommon', character: 'alchemist', tags: ['poison'], text: '施加 4 层中毒。目标原有至少 8 层中毒时抽 1 张牌。',
      effects: [{ op: 'status', status: 'poison', value: 4, target: 'enemy' }, { op: 'draw', value: 1, cond: { targetStatusBefore: 'poison', targetStatusBeforeAtLeast: 8 } }],
      up: { effects: [{ op: 'status', status: 'poison', value: 5, target: 'enemy' }, { op: 'draw', value: 1, cond: { targetStatusBefore: 'poison', targetStatusBeforeAtLeast: 8 } }], text: '施加 5 层中毒。目标原有至少 8 层中毒时抽 1 张牌。' } },
    { id: 'bai_du_gui_yuan', name: '百毒归元', element: 'wood', cost: 1, type: 'skill', rarity: 'rare', character: 'alchemist', tags: ['poison'], finisher: true, exhaust: true, text: '立即造成等同目标中毒层数的状态伤害，移除一半中毒。炉火至少 4 时伤害 ×1.5，消耗 4 炉火。消耗。',
      effects: [{ op: 'detonateStatus', status: 'poison', target: 'enemy', damagePerStack: 1, hotDamagePerStack: 1.5, consumeFraction: .5, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }],
      up: { effects: [{ op: 'detonateStatus', status: 'poison', target: 'enemy', damagePerStack: 1.25, hotDamagePerStack: 1.75, consumeFraction: .5, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }], text: '立即引爆目标中毒：普通伤害 ×1.25，炉火至少 4 时 ×1.75 并消耗 4 炉火。移除一半中毒。消耗。' } },
    { id: 'cui_huo_jue', name: '催火诀', element: 'fire', cost: 1, type: 'skill', rarity: 'uncommon', character: 'alchemist', tags: ['burn'], text: '施加 3 层灼烧。目标原有灼烧时回复 1 点灵气。',
      effects: [{ op: 'status', status: 'burn', value: 3, target: 'enemy' }, { op: 'energy', value: 1, cond: { targetStatusBefore: 'burn', targetStatusBeforeAtLeast: 1 } }],
      up: { effects: [{ op: 'status', status: 'burn', value: 4, target: 'enemy' }, { op: 'energy', value: 1, cond: { targetStatusBefore: 'burn', targetStatusBeforeAtLeast: 1 } }], text: '施加 4 层灼烧。目标原有灼烧时回复 1 点灵气。' } },
    { id: 'chi_lu_fen_tian', name: '赤炉焚天', element: 'fire', cost: 2, type: 'attack', rarity: 'rare', character: 'alchemist', tags: ['burn'], finisher: true, text: '造成 10 点攻击伤害，再引爆目标全部灼烧。炉火至少 4 时爆发伤害 ×1.5，消耗 4 炉火。',
      effects: [{ op: 'damage', value: 10 }, { op: 'detonateStatus', status: 'burn', target: 'enemy', damagePerStack: 1, hotDamagePerStack: 1.5, consumeFraction: 1, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }],
      up: { effects: [{ op: 'damage', value: 14 }, { op: 'detonateStatus', status: 'burn', target: 'enemy', damagePerStack: 1.25, hotDamagePerStack: 1.75, consumeFraction: 1, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }], text: '造成 14 点攻击伤害，再引爆全部灼烧：普通 ×1.25，炉火至少 4 时 ×1.75 并消耗 4 炉火。' } },
    { id: 'yang_yuan_dan', name: '养元丹', element: 'wood', cost: 1, type: 'skill', rarity: 'uncommon', character: 'alchemist', tags: ['regen'], text: '获得 3 层回春和 4 点护甲，额外获得 1 炉火。',
      effects: [{ op: 'status', status: 'regen', value: 3, target: 'self' }, { op: 'block', value: 4 }, { op: 'gainResource', value: 1 }],
      up: { effects: [{ op: 'status', status: 'regen', value: 4, target: 'self' }, { op: 'block', value: 6 }, { op: 'gainResource', value: 1 }], text: '获得 4 层回春和 6 点护甲，额外获得 1 炉火。' } },
    { id: 'qing_di_hui_tian', name: '青帝回天', element: 'wood', cost: 2, type: 'skill', rarity: 'rare', character: 'alchemist', tags: ['regen'], finisher: true, text: '消耗全部回春。每层回复 2 点生命，并向随机敌人造成一次 2 点状态伤害。炉火至少 4 时每次伤害变为 3，消耗 4 炉火。',
      effects: [{ op: 'detonateStatus', status: 'regen', target: 'player', healPerStack: 2, randomDamagePerStack: 2, hotRandomDamagePerStack: 3, consumeFraction: 1, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }],
      up: { effects: [{ op: 'detonateStatus', status: 'regen', target: 'player', healPerStack: 3, randomDamagePerStack: 3, hotRandomDamagePerStack: 4, consumeFraction: 1, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }], text: '消耗全部回春。每层回复 3 点生命，随机造成一次 3 点状态伤害；炉火至少 4 时改为 4 点并消耗 4 炉火。' } },

    /* ===== 体修 ===== */
    { id: 'tai_shan', name: '泰山压顶', element: 'earth', cost: 2, type: 'attack', rarity: 'uncommon', character: 'monk', tags: ['monk_ritual'], text: '造成 10 点伤害，施加 2 层虚弱。',
      effects: [{ op: 'damage', value: 10 }, { op: 'status', status: 'weak', value: 2, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 14 }, { op: 'status', status: 'weak', value: 2, target: 'enemy' }], text: '造成 14 点伤害，施加 2 层虚弱。' } },
    { id: 'jing_gang', name: '金刚不坏', element: 'metal', cost: 2, type: 'skill', rarity: 'rare', character: 'monk', tags: ['monk_block', 'monk_thorns'], text: '获得 18 点护甲和 3 层荆棘。',
      effects: [{ op: 'block', value: 18 }, { op: 'status', status: 'thorns', value: 3, target: 'self' }],
      up: { effects: [{ op: 'block', value: 24 }, { op: 'status', status: 'thorns', value: 4, target: 'self' }], text: '获得 24 点护甲和 4 层荆棘。' } },
    { id: 'fan_zhen', name: '反震', element: 'earth', cost: 1, type: 'skill', rarity: 'uncommon', character: 'monk', tags: ['monk_thorns'], text: '获得 8 点护甲和 2 层荆棘。',
      effects: [{ op: 'block', value: 8 }, { op: 'status', status: 'thorns', value: 2, target: 'self' }],
      up: { effects: [{ op: 'block', value: 11 }, { op: 'status', status: 'thorns', value: 3, target: 'self' }], text: '获得 11 点护甲和 3 层荆棘。' } },
    { id: 'zhen_yue_zhuang', name: '镇岳桩', element: 'earth', cost: 1, type: 'skill', rarity: 'uncommon', character: 'monk', tags: ['monk_block'], text: '获得 10 点护甲。出牌前已有至少 10 点护甲时抽 1 张牌。',
      effects: [{ op: 'block', value: 10 }, { op: 'draw', value: 1, cond: { blockBeforeAtLeast: 10 } }],
      up: { effects: [{ op: 'block', value: 13 }, { op: 'draw', value: 1, cond: { blockBeforeAtLeast: 10 } }], text: '获得 13 点护甲。出牌前已有至少 10 点护甲时抽 1 张牌。' } },
    { id: 'han_shan_shi', name: '撼山式', element: 'earth', cost: 2, type: 'attack', rarity: 'rare', character: 'monk', tags: ['monk_block'], finisher: true, text: '造成 8 点伤害，额外获得当前护甲 50% 的伤害（最多 +25）。战势至少 4 时改为 70%（最多 +35），消耗 4 战势。结算后失去一半护甲。',
      effects: [{ op: 'damage', value: 8, perBlock: .5, maxBlockBonus: 25, hotPerBlock: .7, hotMaxBlockBonus: 35, resourceAtLeast: 4, consumeBlockFraction: .5 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4 } }],
      up: { effects: [{ op: 'damage', value: 11, perBlock: .5, maxBlockBonus: 25, hotPerBlock: .7, hotMaxBlockBonus: 35, resourceAtLeast: 4, consumeBlockFraction: .5 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4 } }], text: '造成 11 点伤害，额外获得当前护甲 50% 的伤害（最多 +25）。战势至少 4 时改为 70%（最多 +35），消耗 4 战势。结算后失去一半护甲。' } },
    { id: 'jie_li_fan_zhen', name: '借力反震', element: 'metal', cost: 1, type: 'skill', rarity: 'uncommon', character: 'monk', tags: ['monk_thorns'], text: '获得 6 点护甲和 2 层荆棘。战势至少 4 时额外获得 1 层荆棘，不消耗战势。',
      effects: [{ op: 'block', value: 6 }, { op: 'status', status: 'thorns', value: 2, target: 'self' }, { op: 'status', status: 'thorns', value: 1, target: 'self', cond: { resourceAtLeast: 4 } }],
      up: { effects: [{ op: 'block', value: 8 }, { op: 'status', status: 'thorns', value: 3, target: 'self' }, { op: 'status', status: 'thorns', value: 1, target: 'self', cond: { resourceAtLeast: 4 } }], text: '获得 8 点护甲和 3 层荆棘。战势至少 4 时额外获得 1 层荆棘，不消耗战势。' } },
    { id: 'jin_gang_zhen_nu', name: '金刚震怒', element: 'metal', cost: 2, type: 'skill', rarity: 'rare', character: 'monk', tags: ['monk_thorns'], finisher: true, text: '每层荆棘对所有敌人造成 3 点状态伤害，再失去一半荆棘。战势至少 4 时每层改为 4 点，并消耗 4 战势。',
      effects: [{ op: 'detonateStatus', status: 'thorns', target: 'player', damageAllPerStack: 3, hotDamageAllPerStack: 4, consumeFraction: .5, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }],
      up: { effects: [{ op: 'detonateStatus', status: 'thorns', target: 'player', damageAllPerStack: 4, hotDamageAllPerStack: 5, consumeFraction: .5, resourceAtLeast: 4 }, { op: 'consumeResource', value: 4, cond: { resourceAtLeast: 4, detonationOccurred: true } }], text: '每层荆棘对所有敌人造成 4 点状态伤害，再失去一半荆棘。战势至少 4 时每层改为 5 点，并消耗 4 战势。' } },
    { id: 'bao_yuan_shou_yi', name: '抱元守一', element: 'earth', cost: 1, type: 'skill', rarity: 'uncommon', character: 'monk', tags: ['monk_ritual'], exhaust: true, text: '获得 5 点护甲和 1 层蓄势。消耗。',
      effects: [{ op: 'block', value: 5 }, { op: 'status', status: 'ritual', value: 1, target: 'self' }],
      up: { effects: [{ op: 'block', value: 8 }, { op: 'status', status: 'ritual', value: 1, target: 'self' }, { op: 'draw', value: 1 }], text: '获得 8 点护甲和 1 层蓄势，抽 1 张牌。消耗。' } },
    { id: 'beng_tian_shi', name: '崩天式', element: 'earth', cost: 3, type: 'attack', rarity: 'rare', character: 'monk', tags: ['monk_ritual'], finisher: true, text: '造成 16 点伤害。每点战势额外 +4，每点当前锐气再额外 +1；消耗全部战势。',
      effects: [{ op: 'damage', value: 16, perResource: 4, perSelfStatus: { status: 'strength', value: 1 }, consumeResource: true }],
      up: { effects: [{ op: 'damage', value: 20, perResource: 4, perSelfStatus: { status: 'strength', value: 1 }, consumeResource: true }], text: '造成 20 点伤害。每点战势额外 +4，每点当前锐气再额外 +1；消耗全部战势。' } },

    /* ===== 木 ===== */
    { id: 'teng_bian', name: '藤鞭', element: 'wood', cost: 1, type: 'attack', rarity: 'common', text: '造成 6 点伤害，施加 1 层中毒。',
      effects: [{ op: 'damage', value: 6 }, { op: 'status', status: 'poison', value: 1, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 8 }, { op: 'status', status: 'poison', value: 2, target: 'enemy' }], text: '造成 8 点伤害，施加 2 层中毒。' } },
    { id: 'chun_feng', name: '春风化雨', element: 'wood', cost: 1, type: 'skill', rarity: 'common', text: '回复 6 点生命，抽 1 张牌。',
      effects: [{ op: 'heal', value: 6 }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'heal', value: 9 }, { op: 'draw', value: 1 }], text: '回复 9 点生命，抽 1 张牌。' } },
    { id: 'jing_ji', name: '荆棘术', element: 'wood', cost: 2, type: 'skill', rarity: 'uncommon', text: '获得 9 点护甲和 4 层荆棘。',
      effects: [{ op: 'block', value: 9 }, { op: 'status', status: 'thorns', value: 4, target: 'self' }],
      up: { effects: [{ op: 'block', value: 12 }, { op: 'status', status: 'thorns', value: 6, target: 'self' }], text: '获得 12 点护甲和 6 层荆棘。' } },
    { id: 'qing_mu', name: '青木长生', element: 'wood', cost: 2, type: 'skill', rarity: 'rare', text: '回复 10 点生命，获得 5 层回春。',
      effects: [{ op: 'heal', value: 10 }, { op: 'status', status: 'regen', value: 5, target: 'self' }],
      up: { effects: [{ op: 'heal', value: 14 }, { op: 'status', status: 'regen', value: 7, target: 'self' }], text: '回复 14 点生命，获得 7 层回春。' } },
    { id: 'wan_mu', name: '万木朝春', element: 'wood', cost: 2, type: 'skill', rarity: 'rare', text: '回复 12 点生命，抽 2 张牌，清除自身负面状态。',
      effects: [{ op: 'heal', value: 12 }, { op: 'draw', value: 2 }, { op: 'cleanse' }],
      up: { effects: [{ op: 'heal', value: 16 }, { op: 'draw', value: 3 }, { op: 'cleanse' }], text: '回复 16 点生命，抽 3 张牌，清除自身负面状态。' } },
    { id: 'du_zhang', name: '毒瘴', element: 'wood', cost: 2, type: 'skill', rarity: 'uncommon', text: '对所有敌人施加 4 层中毒。',
      effects: [{ op: 'status', status: 'poison', value: 4, target: 'allEnemies' }],
      up: { effects: [{ op: 'status', status: 'poison', value: 6, target: 'allEnemies' }], text: '对所有敌人施加 6 层中毒。' } },
    { id: 'teng_jia', name: '藤甲', element: 'wood', cost: 1, type: 'skill', rarity: 'common', tags: ['monk_thorns'], text: '获得 6 点护甲和 1 层荆棘。',
      effects: [{ op: 'block', value: 6 }, { op: 'status', status: 'thorns', value: 1, target: 'self' }],
      up: { effects: [{ op: 'block', value: 9 }, { op: 'status', status: 'thorns', value: 2, target: 'self' }], text: '获得 9 点护甲和 2 层荆棘。' } },
    { id: 'mu_ling', name: '木灵生长', element: 'wood', cost: 1, type: 'skill', rarity: 'uncommon', text: '获得 2 层回春，抽 1 张牌。',
      effects: [{ op: 'status', status: 'regen', value: 2, target: 'self' }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'status', status: 'regen', value: 3, target: 'self' }, { op: 'draw', value: 2 }], text: '获得 3 层回春，抽 2 张牌。' } },
    { id: 'yin_du', name: '引毒诀', element: 'wood', cost: 1, type: 'skill', rarity: 'rare', exhaust: true, tags: ['poison'], text: '使目标已有中毒层数翻倍。消耗。',
      effects: [{ op: 'multiplyStatus', status: 'poison', factor: 2, target: 'enemy' }],
      up: { effects: [{ op: 'multiplyStatus', status: 'poison', factor: 2, target: 'enemy' }, { op: 'draw', value: 1 }], text: '使目标已有中毒层数翻倍，抽 1 张牌。消耗。' } },

    /* ===== 火 ===== */
    { id: 'lie_yan', name: '烈焰掌', element: 'fire', cost: 1, type: 'attack', rarity: 'common', text: '造成 8 点伤害，失去 2 点生命。',
      effects: [{ op: 'damage', value: 8 }, { op: 'loseHp', value: 2 }],
      up: { effects: [{ op: 'damage', value: 11 }, { op: 'loseHp', value: 2 }], text: '造成 11 点伤害，失去 2 点生命。' } },
    { id: 'huo_qiang', name: '火墙', element: 'fire', cost: 2, type: 'skill', rarity: 'uncommon', tags: ['burn'], text: '对所有敌人施加 4 层灼烧，获得 7 点护甲。',
      effects: [{ op: 'status', status: 'burn', value: 4, target: 'allEnemies' }, { op: 'block', value: 7 }],
      up: { effects: [{ op: 'status', status: 'burn', value: 6, target: 'allEnemies' }, { op: 'block', value: 9 }], text: '对所有敌人施加 6 层灼烧，获得 9 点护甲。' } },
    { id: 'zi_fen', name: '焚身', element: 'fire', cost: 0, type: 'attack', rarity: 'uncommon', text: '造成 10 点伤害，失去 4 点生命。',
      effects: [{ op: 'damage', value: 10 }, { op: 'loseHp', value: 4 }],
      up: { effects: [{ op: 'damage', value: 14 }, { op: 'loseHp', value: 4 }], text: '造成 14 点伤害，失去 4 点生命。' } },
    { id: 'xing_huo', name: '星火燎原', element: 'fire', cost: 3, type: 'attack', rarity: 'rare', text: '对所有敌人造成 3 段 5 点伤害。',
      effects: [{ op: 'damage', value: 5, hits: 3, target: 'all' }],
      up: { effects: [{ op: 'damage', value: 6, hits: 3, target: 'all' }], text: '对所有敌人造成 3 段 6 点伤害。' } },
    { id: 'huo_ling', name: '火灵附体', element: 'fire', cost: 2, type: 'skill', rarity: 'uncommon', text: '获得 3 点锐气，失去 3 点生命。',
      effects: [{ op: 'status', status: 'strength', value: 3, target: 'self' }, { op: 'loseHp', value: 3 }],
      up: { effects: [{ op: 'status', status: 'strength', value: 4, target: 'self' }, { op: 'loseHp', value: 3 }], text: '获得 4 点锐气，失去 3 点生命。' } },
    { id: 'yan_bao', name: '炎爆', element: 'fire', cost: 2, type: 'attack', rarity: 'uncommon', text: '造成 14 点伤害，施加 2 层灼烧。',
      effects: [{ op: 'damage', value: 14 }, { op: 'status', status: 'burn', value: 2, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 18 }, { op: 'status', status: 'burn', value: 3, target: 'enemy' }], text: '造成 18 点伤害，施加 3 层灼烧。' } },
    { id: 'lie_huo', name: '烈火燎原', element: 'fire', cost: 2, type: 'attack', rarity: 'uncommon', text: '对所有敌人造成 7 点伤害并施加 2 层灼烧。',
      effects: [{ op: 'damage', value: 7, target: 'all' }, { op: 'status', status: 'burn', value: 2, target: 'allEnemies' }],
      up: { effects: [{ op: 'damage', value: 10, target: 'all' }, { op: 'status', status: 'burn', value: 3, target: 'allEnemies' }], text: '对所有敌人造成 10 点伤害并施加 3 层灼烧。' } },
    { id: 'huo_ji', name: '火祭', element: 'fire', cost: 0, type: 'skill', rarity: 'uncommon', exhaust: true, text: '失去 3 点生命，获得 1 点灵气。消耗。',
      effects: [{ op: 'loseHp', value: 3 }, { op: 'energy', value: 1 }],
      up: { effects: [{ op: 'loseHp', value: 2 }, { op: 'energy', value: 1 }], text: '失去 2 点生命，获得 1 点灵气。消耗。' } },

    /* ===== 土 ===== */
    { id: 'ni_zhuan', name: '泥沼', element: 'earth', cost: 1, type: 'skill', rarity: 'common', text: '施加 2 层虚弱，获得 4 点护甲。',
      effects: [{ op: 'status', status: 'weak', value: 2, target: 'enemy' }, { op: 'block', value: 4 }],
      up: { effects: [{ op: 'status', status: 'weak', value: 3, target: 'enemy' }, { op: 'block', value: 6 }], text: '施加 3 层虚弱，获得 6 点护甲。' } },
    { id: 'di_mai', name: '地脉', element: 'earth', cost: 2, type: 'skill', rarity: 'uncommon', tags: ['monk_block'], text: '获得 8 点护甲和 1 点坚韧。',
      effects: [{ op: 'block', value: 8 }, { op: 'status', status: 'dexterity', value: 1, target: 'self' }],
      up: { effects: [{ op: 'block', value: 10 }, { op: 'status', status: 'dexterity', value: 2, target: 'self' }], text: '获得 10 点护甲和 2 点坚韧。' } },
    { id: 'shi_fu', name: '石肤', element: 'earth', cost: 1, type: 'skill', rarity: 'common', text: '获得 7 点护甲。',
      effects: [{ op: 'block', value: 7 }],
      up: { effects: [{ op: 'block', value: 10 }], text: '获得 10 点护甲。' } },
    { id: 'qi_men', name: '奇门遁甲', element: 'earth', cost: 2, type: 'skill', rarity: 'rare', tags: ['monk_block'], text: '获得 15 点护甲，抽 2 张牌。',
      effects: [{ op: 'block', value: 15 }, { op: 'draw', value: 2 }],
      up: { effects: [{ op: 'block', value: 20 }, { op: 'draw', value: 2 }], text: '获得 20 点护甲，抽 2 张牌。' } },
    { id: 'da_di', name: '大地回春', element: 'earth', cost: 2, type: 'skill', rarity: 'rare', text: '回复 8 点生命，获得 12 点护甲。',
      effects: [{ op: 'heal', value: 8 }, { op: 'block', value: 12 }],
      up: { effects: [{ op: 'heal', value: 12 }, { op: 'block', value: 16 }], text: '回复 12 点生命，获得 16 点护甲。' } },
    { id: 'luo_shi', name: '落石', element: 'earth', cost: 2, type: 'attack', rarity: 'common', text: '造成 16 点伤害。',
      effects: [{ op: 'damage', value: 16 }],
      up: { effects: [{ op: 'damage', value: 21 }], text: '造成 21 点伤害。' } },
    { id: 'ci_shi', name: '磁石', element: 'earth', cost: 1, type: 'skill', rarity: 'common', text: '获得 6 点护甲，抽 1 张牌。',
      effects: [{ op: 'block', value: 6 }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'block', value: 9 }, { op: 'draw', value: 1 }], text: '获得 9 点护甲，抽 1 张牌。' } },
    { id: 'tu_dun', name: '土遁', element: 'earth', cost: 0, type: 'skill', rarity: 'uncommon', exhaust: true, text: '获得 5 点护甲。消耗。',
      effects: [{ op: 'block', value: 5 }],
      up: { effects: [{ op: 'block', value: 8 }], text: '获得 8 点护甲。消耗。' } },
    { id: 'shan_shou', name: '山河守', element: 'earth', cost: 1, type: 'skill', rarity: 'uncommon', retain: true, text: '获得 7 点护甲。保留。',
      effects: [{ op: 'block', value: 7 }],
      up: { effects: [{ op: 'block', value: 10 }], text: '获得 10 点护甲。保留。' } },

    /* ===== 金 ===== */
    { id: 'mai_chong', name: '脉冲剑', element: 'metal', cost: 0, type: 'attack', rarity: 'uncommon', exhaust: true, text: '造成 4 点伤害，抽 1 张牌。消耗。',
      effects: [{ op: 'damage', value: 4 }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'damage', value: 6 }, { op: 'draw', value: 1 }], text: '造成 6 点伤害，抽 1 张牌。消耗。' } },
    { id: 'jing_tie', name: '精铁诀', element: 'metal', cost: 1, type: 'skill', rarity: 'uncommon', exhaust: true, text: '获得 2 点锐气。消耗。',
      effects: [{ op: 'status', status: 'strength', value: 2, target: 'self' }],
      up: { effects: [{ op: 'status', status: 'strength', value: 3, target: 'self' }], text: '获得 3 点锐气。消耗。' } },
    { id: 'po_jia', name: '破甲击', element: 'metal', cost: 1, type: 'attack', rarity: 'common', text: '造成 6 点伤害。贯穿护甲。',
      effects: [{ op: 'damage', value: 6, pierce: true }],
      up: { effects: [{ op: 'damage', value: 9, pierce: true }], text: '造成 9 点伤害。贯穿护甲。' } },
    { id: 'lie_kong', name: '裂空', element: 'metal', cost: 2, type: 'attack', rarity: 'rare', text: '造成 2 段 10 点伤害。',
      effects: [{ op: 'damage', value: 10, hits: 2 }],
      up: { effects: [{ op: 'damage', value: 12, hits: 2 }], text: '造成 2 段 12 点伤害。' } },
    { id: 'wu_lei', name: '五雷正法', element: 'metal', cost: 3, type: 'attack', rarity: 'rare', text: '造成 30 点伤害。贯穿护甲。',
      effects: [{ op: 'damage', value: 30, pierce: true }],
      up: { effects: [{ op: 'damage', value: 38, pierce: true }], text: '造成 38 点伤害。贯穿护甲。' } },
    { id: 'jin_feng', name: '金锋', element: 'metal', cost: 1, type: 'attack', rarity: 'common', text: '造成 5 点伤害，获得 2 点护甲。',
      effects: [{ op: 'damage', value: 5 }, { op: 'block', value: 2 }],
      up: { effects: [{ op: 'damage', value: 8 }, { op: 'block', value: 3 }], text: '造成 8 点伤害，获得 3 点护甲。' } },
    { id: 'jin_guang', name: '金光咒', element: 'metal', cost: 1, type: 'skill', rarity: 'common', text: '获得 10 点护甲。消耗。',
      effects: [{ op: 'block', value: 10 }], exhaust: true,
      up: { effects: [{ op: 'block', value: 14 }], text: '获得 14 点护甲。消耗。' } },
    { id: 'she_ji', name: '射日', element: 'metal', cost: 2, type: 'attack', rarity: 'uncommon', text: '造成 11 点伤害。若连携达到 3，抽 2 张牌。',
      effects: [{ op: 'damage', value: 11 }, { op: 'draw', value: 2, cond: { chainAtLeast: 3 } }],
      up: { effects: [{ op: 'damage', value: 15 }, { op: 'draw', value: 2, cond: { chainAtLeast: 3 } }], text: '造成 15 点伤害。若连携达到 3，抽 2 张牌。' } },
    { id: 'lin_zhen', name: '临阵悟道', element: 'metal', cost: 1, type: 'skill', rarity: 'uncommon', exhaust: true, text: '随机参悟手中 1 张未悟卡牌，仅本场战斗有效。消耗。',
      effects: [{ op: 'upgradeHand', count: 1 }],
      up: { effects: [{ op: 'upgradeHand', count: 2 }], text: '随机参悟手中 2 张未悟卡牌，仅本场战斗有效。消耗。' } },

    /* ===== 水 ===== */
    { id: 'shui_dun', name: '水盾', element: 'water', cost: 1, type: 'skill', rarity: 'common', text: '获得 8 点护甲。',
      effects: [{ op: 'block', value: 8 }],
      up: { effects: [{ op: 'block', value: 11 }], text: '获得 11 点护甲。' } },
    { id: 'han_liu', name: '寒流', element: 'water', cost: 1, type: 'skill', rarity: 'common', text: '施加 2 层虚弱，抽 1 张牌。',
      effects: [{ op: 'status', status: 'weak', value: 2, target: 'enemy' }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'status', status: 'weak', value: 3, target: 'enemy' }, { op: 'draw', value: 1 }], text: '施加 3 层虚弱，抽 1 张牌。' } },
    { id: 'jing_xin', name: '静心诀', element: 'water', cost: 0, type: 'skill', rarity: 'uncommon', exhaust: true, text: '抽 2 张牌。消耗。',
      effects: [{ op: 'draw', value: 2 }],
      up: { effects: [{ op: 'draw', value: 3 }], text: '抽 3 张牌。消耗。' } },
    { id: 'shui_yue', name: '水月镜花', element: 'water', cost: 2, type: 'skill', rarity: 'rare', text: '获得 12 点护甲，对所有敌人施加 3 层虚弱，抽 1 张牌。',
      effects: [{ op: 'block', value: 12 }, { op: 'status', status: 'weak', value: 3, target: 'allEnemies' }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'block', value: 16 }, { op: 'status', status: 'weak', value: 3, target: 'allEnemies' }, { op: 'draw', value: 2 }], text: '获得 16 点护甲，对所有敌人施加 3 层虚弱，抽 2 张牌。' } },
    { id: 'hui_xiang', name: '回响', element: 'water', cost: 1, type: 'skill', rarity: 'uncommon', exhaust: true, text: '获得 1 点灵气，抽 1 张牌。消耗。',
      effects: [{ op: 'energy', value: 1 }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'energy', value: 2 }, { op: 'draw', value: 1 }], text: '获得 2 点灵气，抽 1 张牌。消耗。' } },
    { id: 'bing_po', name: '冰魄针', element: 'water', cost: 1, type: 'attack', rarity: 'common', text: '造成 6 点伤害，施加 1 层虚弱。',
      effects: [{ op: 'damage', value: 6 }, { op: 'status', status: 'weak', value: 1, target: 'enemy' }],
      up: { effects: [{ op: 'damage', value: 9 }, { op: 'status', status: 'weak', value: 2, target: 'enemy' }], text: '造成 9 点伤害，施加 2 层虚弱。' } },
    { id: 'chao_sheng', name: '潮生', element: 'water', cost: 2, type: 'skill', rarity: 'uncommon', text: '获得 10 点护甲，回复 5 点生命。',
      effects: [{ op: 'block', value: 10 }, { op: 'heal', value: 5 }],
      up: { effects: [{ op: 'block', value: 14 }, { op: 'heal', value: 7 }], text: '获得 14 点护甲，回复 7 点生命。' } },
    { id: 'xuan_wu', name: '玄武诀', element: 'water', cost: 2, type: 'skill', rarity: 'rare', text: '获得 20 点护甲和 2 层荆棘。',
      effects: [{ op: 'block', value: 20 }, { op: 'status', status: 'thorns', value: 2, target: 'self' }],
      up: { effects: [{ op: 'block', value: 26 }, { op: 'status', status: 'thorns', value: 3, target: 'self' }], text: '获得 26 点护甲和 3 层荆棘。' } },
    { id: 'shui_ling', name: '水灵', element: 'water', cost: 1, type: 'skill', rarity: 'uncommon', text: '回复 4 点生命，抽 1 张牌。',
      effects: [{ op: 'heal', value: 4 }, { op: 'draw', value: 1 }],
      up: { effects: [{ op: 'heal', value: 6 }, { op: 'draw', value: 1 }], text: '回复 6 点生命，抽 1 张牌。' } },

    /* ===== 无 ===== */
    { id: 'wu_xing', name: '五行轮转', element: 'none', cost: 1, type: 'skill', rarity: 'rare', text: '连携 +2。若因此达到 5，立即触发五行周天。',
      effects: [{ op: 'chain', value: 2, trigger: true }],
      up: { effects: [{ op: 'chain', value: 3, trigger: true }], text: '连携 +3。若因此达到 5，立即触发五行周天。' } },
    { id: 'tiao_xi', name: '调息', element: 'none', cost: 1, type: 'skill', rarity: 'common', exhaust: true, text: '获得 1 点灵气，抽 1 张牌。若连携达到 2，再获得 1 点灵气。消耗。',
      effects: [{ op: 'energy', value: 1 }, { op: 'draw', value: 1 }, { op: 'energy', value: 1, cond: { chainAtLeast: 2 } }],
      up: { exhaust: false, effects: [{ op: 'energy', value: 1 }, { op: 'draw', value: 2 }, { op: 'energy', value: 1, cond: { chainAtLeast: 2 } }], text: '获得 1 点灵气，抽 2 张牌。若连携达到 2，再获得 1 点灵气。不再消耗。' } },
    { id: 'wu_ji', name: '无极', element: 'none', cost: 1, type: 'skill', rarity: 'uncommon', exhaust: true, text: '抽 2 张牌。消耗。',
      effects: [{ op: 'draw', value: 2 }],
      up: { effects: [{ op: 'draw', value: 3 }], text: '抽 3 张牌。消耗。' } },
    { id: 'gui_yuan', name: '归元', element: 'none', cost: 2, type: 'skill', rarity: 'rare', exhaust: true, text: '获得 3 点灵气，抽 2 张牌。消耗。',
      effects: [{ op: 'energy', value: 3 }, { op: 'draw', value: 2 }],
      up: { effects: [{ op: 'energy', value: 3 }, { op: 'draw', value: 3 }], text: '获得 3 点灵气，抽 3 张牌。消耗。' } },
    { id: 'po_fu', name: '破釜沉舟', element: 'none', cost: 2, type: 'attack', rarity: 'rare', exhaust: true, text: '造成 26 点伤害。消耗。',
      effects: [{ op: 'damage', value: 26 }],
      up: { effects: [{ op: 'damage', value: 34 }], text: '造成 34 点伤害。消耗。' } },
    { id: 'xiu_xing', name: '修行', element: 'none', cost: 1, type: 'skill', rarity: 'uncommon', text: '回复 5 点生命，获得 1 点锐气。',
      effects: [{ op: 'heal', value: 5 }, { op: 'status', status: 'strength', value: 1, target: 'self' }],
      up: { effects: [{ op: 'heal', value: 8 }, { op: 'status', status: 'strength', value: 2, target: 'self' }], text: '回复 8 点生命，获得 2 点锐气。' } },
    { id: 'wu_wei', name: '无为', element: 'none', cost: 0, type: 'skill', rarity: 'uncommon', exhaust: true, text: '抽 1 张牌，获得 3 点护甲。消耗。',
      effects: [{ op: 'draw', value: 1 }, { op: 'block', value: 3 }],
      up: { effects: [{ op: 'draw', value: 2 }, { op: 'block', value: 4 }], text: '抽 2 张牌，获得 4 点护甲。消耗。' } },
    { id: 'tian_ji', name: '天机', element: 'none', cost: 2, type: 'skill', rarity: 'rare', exhaust: true, text: '抽 3 张牌，获得 1 点灵气。消耗。',
      effects: [{ op: 'draw', value: 3 }, { op: 'energy', value: 1 }],
      up: { effects: [{ op: 'draw', value: 4 }, { op: 'energy', value: 2 }], text: '抽 4 张牌，获得 2 点灵气。消耗。' } },
    { id: 'jian_yi', name: '剑意', element: 'metal', cost: 0, type: 'attack', rarity: 'special', exhaust: true, temp: true, text: '造成 8 点伤害。消耗。',
      effects: [{ op: 'damage', value: 8 }],
      up: { effects: [{ op: 'damage', value: 10 }], text: '造成 10 点伤害。消耗。' } },
    { id: 'huo_zhong', name: '火种', element: 'none', cost: 1, type: 'skill', rarity: 'special', temp: true, exhaust: true, text: '花费 1 灵气将其熄灭。若留在手牌直到回合结束，失去 2 点生命，并使赤魃获得 1 点焚势。',
      effects: [], up: null },
    { id: 'ji_sheng_teng_zhong', name: '寄生藤种', element: 'none', cost: 1, type: 'skill', rarity: 'special', temp: true, exhaust: true, text: '花费 1 灵气将其拔除。若留在手牌直到回合结束，失去 3 点生命，噬灵藤母回复 3 点生命。',
      effects: [], up: null },

    /* ===== 诅咒 ===== */
    { id: 'xin_mo', name: '心魔', element: 'none', cost: 0, type: 'curse', rarity: 'curse', unplayable: true, text: '无法打出。回合结束时失去 2 点生命。',
      curseEffect: 'endTurnDamage', curseValue: 2, effects: [], up: null },
    { id: 'za_nian', name: '杂念', element: 'none', cost: 0, type: 'curse', rarity: 'curse', unplayable: true, text: '无法打出。占手牌。',
      curseEffect: 'none', effects: [], up: null },
    { id: 'zou_huo', name: '走火入魔', element: 'none', cost: 0, type: 'curse', rarity: 'curse', unplayable: true, text: '无法打出。回合开始时失去 3 点生命。',
      curseEffect: 'turnStartDamage', curseValue: 3, effects: [], up: null }
  ];

  const CARD_MAP = {};
  CARDS.forEach(c => { CARD_MAP[c.id] = c; });

  /* ---------------- 遗物 ---------------- */
  const RELICS = [
    { id: 'qing_feng', name: '青锋剑穗', rarity: 'starter', desc: '攻击牌伤害 +1。', passive: { attackDamage: 1 } },
    { id: 'yao_nang', name: '药囊', rarity: 'starter', desc: '战斗开始时获得 1 层回春。',
      hooks: { combatStart(state, api) { api.status('player', 'regen', 1); } } },
    { id: 'tie_jia', name: '铁甲片', rarity: 'starter', desc: '战斗开始时获得 6 点护甲。',
      hooks: { combatStart(state, api) { api.block(6); } } },
    { id: 'qing_yu', name: '青玉葫芦', rarity: 'common', desc: '战斗结束后回复 6 点生命。',
      hooks: { combatEnd(state, api) { api.heal(6); } } },
    { id: 'wu_xing_huan', name: '五行环', rarity: 'rare', desc: '战斗开始时，随机获得一个当前五行并使连携为 2。',
      hooks: { combatStart(state, api) { api.setChain(2, api.randomElement()); } } },
    { id: 'huo_ling_zhu', name: '火灵珠', rarity: 'uncommon', desc: '火属性攻击伤害 +2。', passive: { fireAttackDamage: 2 } },
    { id: 'xuan_tie_jian', name: '玄铁剑', rarity: 'common', desc: '攻击牌伤害 +1。', passive: { attackDamage: 1 } },
    { id: 'gui_jia', name: '龟甲', rarity: 'common', desc: '战斗开始时获得 8 点护甲。',
      hooks: { combatStart(state, api) { api.block(8); } } },
    { id: 'ju_qi_lu', name: '聚气丹炉', rarity: 'uncommon', desc: '每场战斗的偶数回合开始时获得 1 点灵气。',
      hooks: { turnStart(state, api) { if (state.combat.turn % 2 === 0) { api.energy(1); api.log('聚气丹炉：灵气 +1'); } } } },
    { id: 'ling_hu_fu', name: '灵狐符', rarity: 'uncommon', desc: '每回合第一张牌的费用 -1（至少为 0）。', passive: { firstCardDiscount: 1 } },
    { id: 'hui_chun_zan', name: '回春簪', rarity: 'uncommon', desc: '战斗开始时获得 2 层回春。',
      hooks: { combatStart(state, api) { api.status('player', 'regen', 2); } } },
    { id: 'po_jun_ling', name: '破军令', rarity: 'uncommon', desc: '精英战斗结束后额外获得 30 金币。', passive: { eliteGold: 30 } },
    { id: 'shang_ren_mian', name: '商人面具', rarity: 'uncommon', desc: '商店价格降低 20%。', passive: { shopDiscount: 0.2 } },
    { id: 'shuang_yu_pei', name: '双鱼佩', rarity: 'rare', desc: '每回合多抽 1 张牌。', passive: { extraDraw: 1 } },
    { id: 'di_ling_zhu', name: '地灵珠', rarity: 'uncommon', desc: '战斗开始时获得 2 点坚韧。',
      hooks: { combatStart(state, api) { api.status('player', 'dexterity', 2); } } },
    { id: 'jin_ling_zhu', name: '金灵珠', rarity: 'rare', desc: '相克伤害额外提高 15%。', passive: { crossBonus: 0.15 } },
    { id: 'shui_ling_zhu', name: '水灵珠', rarity: 'uncommon', desc: '战斗开始时额外抽 1 张牌。',
      hooks: { combatStart(state, api) { api.draw(1); } } },
    { id: 'mu_ling_zhu', name: '木灵珠', rarity: 'uncommon', desc: '对敌人施加中毒时额外 +1 层。', passive: { poisonBonus: 1 } },
    { id: 'tu_ling_zhu', name: '土灵珠', rarity: 'common', desc: '每次获得护甲时 +1。', passive: { blockBonus: 1 } },
    { id: 'jiu_hua_lu', name: '九华露', rarity: 'rare', desc: '灵气上限 +1，但每回合少抽 1 张牌。', passive: { maxEnergy: 1, drawPenalty: 1 } },
    { id: 'cang_jian_xia', name: '藏剑匣', rarity: 'rare', desc: '战斗开始时，将一张「剑意」加入手牌。',
      hooks: { combatStart(state, api) { api.addCardToHand('jian_yi'); } } },
    { id: 'gu_deng', name: '古灯', rarity: 'uncommon', desc: '每场战斗第一次连携达到 3 时，抽 2 张牌。',
      hooks: { chainReached(state, api, chain) { if (chain >= 3 && api.first('gu_deng')) api.draw(2); } } },
    { id: 'xue_yu', name: '血玉', rarity: 'uncommon', desc: '拾取时生命上限 +10。',
      hooks: { pickup(state, api) { api.maxHp(10); } } },
    { id: 'yu_pei', name: '玉玦', rarity: 'common', desc: '战斗开始时获得 1 点锐气。',
      hooks: { combatStart(state, api) { api.status('player', 'strength', 1); } } },
    { id: 'fate_sword_box', name: '无名剑匣', rarity: 'fate', fateOnly: true, character: 'sword', desc: '每场战斗第一次打出终结牌后，获得 5 点剑意，并抽 1 张牌。' },
    { id: 'fate_alchemy_furnace', name: '九转丹炉', rarity: 'fate', fateOnly: true, character: 'alchemist', desc: '每场战斗第一次主动兑现中毒、灼烧或回春时，不消耗对应状态层数。' },
    { id: 'fate_monk_stele', name: '镇岳神碑', rarity: 'fate', fateOnly: true, character: 'monk', desc: '每场战斗第一次主动兑现护甲或荆棘时，不消耗对应资源。' },
    { id: 'fate_five_elements_book', name: '五行天书', rarity: 'fate', fateOnly: true, desc: '每场战斗第一次触发五行周天时，对所有敌人额外造成 8 点无视护甲伤害，并抽 1 张牌。' },
    { id: 'fate_hunyuan_pearl', name: '混元珠', rarity: 'fate', fateOnly: true, desc: '每场战斗第一次角色资源达到满值时，获得 1 点灵气并抽 1 张牌。' },
    { id: 'fate_creation_jade', name: '造化玉牒', rarity: 'fate', fateOnly: true, desc: '每场战斗第一次触发任意道印时，额外获得 1 点灵气并抽 1 张牌。' }
  ];
  const RELIC_MAP = {};
  RELICS.forEach(r => { RELIC_MAP[r.id] = r; });

  /* ---------------- 丹药 ---------------- */
  const POTIONS = [
    { id: 'heal', name: '回春丹', desc: '回复 15 点生命。', icon: '丹', target: 'none', effects: [{ op: 'heal', value: 15 }] },
    { id: 'fire', name: '烈焰丹', desc: '对目标造成 20 点伤害。', icon: '焰', target: 'enemy', effects: [{ op: 'damage', value: 20 }] },
    { id: 'block', name: '龟息丹', desc: '获得 15 点护甲。', icon: '甲', target: 'none', effects: [{ op: 'block', value: 15 }] },
    { id: 'energy', name: '聚气丹', desc: '获得 2 点灵气。', icon: '气', target: 'none', effects: [{ op: 'energy', value: 2 }] },
    { id: 'draw', name: '洗髓丹', desc: '抽 3 张牌。', icon: '髓', target: 'none', effects: [{ op: 'draw', value: 3 }] },
    { id: 'cleanse', name: '化毒丹', desc: '清除自身负面状态，回复 5 点生命。', icon: '净', target: 'none', effects: [{ op: 'cleanse' }, { op: 'heal', value: 5 }] },
    { id: 'strength', name: '破妄丹', desc: '获得 2 点锐气。', icon: '破', target: 'none', effects: [{ op: 'status', status: 'strength', value: 2, target: 'self' }] },
    { id: 'chain', name: '五行丹', desc: '当前连携 +2，若达到 5 立即触发周天。', icon: '行', target: 'none', effects: [{ op: 'chain', value: 2, trigger: true }] }
  ];
  const POTION_MAP = {};
  POTIONS.forEach(p => { POTION_MAP[p.id] = p; });

  /* ---------------- 敌人 ----------------
     每个敌人：moves 为招式字典，pattern 为循环顺序。
     debuffs 施加给玩家；buffs 施加给自己；addCards 塞入玩家弃牌堆。
  */
  const ENEMIES = {
    /* 第一幕 */
    shan_xiao: {
      id: 'shan_xiao', name: '山魈', element: 'earth', hp: [32, 38],
      moves: {
        claw: { name: '裂爪', damage: 7 },
        throw: { name: '投石', damage: 5, hits: 2 },
        harden: { name: '硬化', block: 6 }
      },
      pattern: ['claw', 'throw', 'harden']
    },
    qing_she: {
      id: 'qing_she', name: '青蛇妖', element: 'wood', hp: [27, 33],
      moves: {
        fang: { name: '毒牙', damage: 4, debuffs: [{ status: 'poison', value: 3 }] },
        coil: { name: '缠绕', damage: 6, debuffs: [{ status: 'weak', value: 1 }] },
        spit: { name: '吐信', damage: 3, debuffs: [{ status: 'poison', value: 2 }] }
      },
      pattern: ['fang', 'coil', 'spit']
    },
    huo_shu: {
      id: 'huo_shu', name: '火鼠', element: 'fire', hp: [25, 30],
      moves: {
        bite: { name: '啃咬', damage: 6 },
        flame: { name: '喷火', damage: 4, debuffs: [{ status: 'burn', value: 2 }] },
        scurry: { name: '窜逃', block: 4, buffs: [{ status: 'strength', value: 1 }] }
      },
      pattern: ['bite', 'flame', 'scurry']
    },
    tong_jia: {
      id: 'tong_jia', name: '铜甲尸', element: 'metal', hp: [38, 44],
      moves: {
        slash: { name: '锈刀', damage: 8 },
        ironwall: { name: '铁壁', block: 8, buffs: [{ status: 'strength', value: 1 }] },
        smash: { name: '重击', damage: 11 }
      },
      pattern: ['slash', 'ironwall', 'smash']
    },
    shui_gui: {
      id: 'shui_gui', name: '水鬼', element: 'water', hp: [30, 36],
      moves: {
        drag: { name: '拖拽', damage: 6, debuffs: [{ status: 'weak', value: 1 }] },
        whirl: { name: '漩涡', damage: 4, hits: 2 },
        drown: { name: '沉溺', damage: 9 }
      },
      pattern: ['drag', 'whirl', 'drown']
    },
    teng_yao: {
      id: 'teng_yao', name: '藤妖', element: 'wood', hp: [34, 40],
      moves: {
        lash: { name: '抽打', damage: 7 },
        seed: { name: '播毒', debuffs: [{ status: 'poison', value: 2 }], block: 4 },
        drain: { name: '汲取', damage: 5, heal: 4 }
      },
      pattern: ['lash', 'seed', 'drain']
    },
    luo_shi: {
      id: 'luo_shi', name: '落石精', element: 'earth', hp: [31, 37],
      moves: {
        roll: { name: '滚石', damage: 9 },
        crush: { name: '碾碎', damage: 5, buffs: [{ status: 'strength', value: 1 }] },
        wall: { name: '岩壁', block: 5 }
      },
      pattern: ['roll', 'crush', 'wall']
    },

    /* 第二幕 */
    xue_sha: {
      id: 'xue_sha', name: '血煞', element: 'fire', hp: [52, 60],
      moves: {
        bloodclaw: { name: '血爪', damage: 8, hits: 2 },
        mist: { name: '血雾', damage: 4, debuffs: [{ status: 'burn', value: 3 }, { status: 'weak', value: 1 }] },
        frenzy: { name: '狂血', buffs: [{ status: 'strength', value: 2 }], block: 4 }
      },
      pattern: ['bloodclaw', 'mist', 'frenzy']
    },
    bing_po: {
      id: 'bing_po', name: '冰魄', element: 'water', hp: [48, 56],
      moves: {
        ice: { name: '寒冰刺', damage: 11 },
        freeze: { name: '冰封', debuffs: [{ status: 'weak', value: 2 }], block: 6 },
        shatter: { name: '碎冰', damage: 6, hits: 2, debuffs: [{ status: 'vulnerable', value: 1 }] }
      },
      pattern: ['ice', 'freeze', 'shatter']
    },
    shi_kui: {
      id: 'shi_kui', name: '石傀', element: 'earth', hp: [66, 74],
      moves: {
        hammer: { name: '重锤', damage: 14 },
        wall: { name: '岩壁', block: 12 },
        slam: { name: '震地', damage: 9, debuffs: [{ status: 'vulnerable', value: 1 }] }
      },
      pattern: ['hammer', 'wall', 'slam']
    },
    jin_jia: {
      id: 'jin_jia', name: '金甲卫', element: 'metal', hp: [56, 64],
      moves: {
        spear: { name: '枪刺', damage: 12 },
        shield: { name: '盾击', damage: 8, block: 8 },
        thrust: { name: '突进', damage: 7, hits: 2 }
      },
      pattern: ['spear', 'shield', 'thrust']
    },
    shi_teng: {
      id: 'shi_teng', name: '尸藤', element: 'wood', hp: [50, 58],
      moves: {
        bind: { name: '缠绕', damage: 7, debuffs: [{ status: 'poison', value: 4 }] },
        drain: { name: '吸血', damage: 6, heal: 4 },
        spores: { name: '孢子', debuffs: [{ status: 'poison', value: 3 }, { status: 'weak', value: 1 }] }
      },
      pattern: ['bind', 'drain', 'spores']
    },
    you_huo: {
      id: 'you_huo', name: '幽火', element: 'fire', hp: [44, 50],
      moves: {
        ghostfire: { name: '鬼火', damage: 7, debuffs: [{ status: 'burn', value: 3 }] },
        burst: { name: '爆燃', damage: 14 },
        flicker: { name: '明灭', block: 6, buffs: [{ status: 'strength', value: 1 }] }
      },
      pattern: ['ghostfire', 'burst', 'flicker']
    },
    xuan_gui: {
      id: 'xuan_gui', name: '玄龟', element: 'water', hp: [62, 70],
      moves: {
        cannon: { name: '水炮', damage: 10 },
        shell: { name: '龟缩', block: 10, buffs: [{ status: 'thorns', value: 2 }] },
        tide: { name: '潮汐', damage: 6, hits: 2 }
      },
      pattern: ['cannon', 'shell', 'tide']
    },

    /* 第三幕 */
    tian_bing: {
      id: 'tian_bing', name: '天兵', element: 'metal', hp: [82, 92],
      moves: {
        slash: { name: '斩击', damage: 15 },
        golden: { name: '金身', block: 12, buffs: [{ status: 'strength', value: 2 }] },
        execute: { name: '天罚', damage: 20 }
      },
      pattern: ['slash', 'golden', 'execute']
    },
    lei_shou: {
      id: 'lei_shou', name: '雷兽', element: 'metal', hp: [76, 86],
      moves: {
        bolt: { name: '雷击', damage: 12, debuffs: [{ status: 'weak', value: 1 }] },
        chain: { name: '连雷', damage: 7, hits: 3 },
        charge: { name: '蓄雷', buffs: [{ status: 'strength', value: 2 }], block: 6 }
      },
      pattern: ['bolt', 'chain', 'charge']
    },
    xuan_bing: {
      id: 'xuan_bing', name: '玄冰蛟', element: 'water', hp: [88, 98],
      moves: {
        breath: { name: '冰息', damage: 14, debuffs: [{ status: 'weak', value: 1 }] },
        tail: { name: '尾扫', damage: 9, hits: 2 },
        freeze: { name: '封冻', damage: 6, debuffs: [{ status: 'vulnerable', value: 2 }] }
      },
      pattern: ['breath', 'tail', 'freeze']
    },
    gu_mu: {
      id: 'gu_mu', name: '古木魍', element: 'wood', hp: [90, 100],
      moves: {
        mist: { name: '毒雾', damage: 8, debuffs: [{ status: 'poison', value: 5 }] },
        drain: { name: '吸取', damage: 10, heal: 6 },
        roots: { name: '盘根', block: 10, debuffs: [{ status: 'weak', value: 2 }] }
      },
      pattern: ['mist', 'drain', 'roots']
    },
    huang_quan: {
      id: 'huang_quan', name: '黄泉土偶', element: 'earth', hp: [96, 108],
      moves: {
        crack: { name: '地裂', damage: 18 },
        petrify: { name: '石化', block: 15, buffs: [{ status: 'thorns', value: 3 }] },
        sink: { name: '陷落', damage: 10, debuffs: [{ status: 'vulnerable', value: 2 }] }
      },
      pattern: ['crack', 'petrify', 'sink']
    },
    xing_huo: {
      id: 'xing_huo', name: '星火灵', element: 'fire', hp: [72, 80],
      moves: {
        rain: { name: '火雨', damage: 6, hits: 3 },
        ignite: { name: '引燃', debuffs: [{ status: 'burn', value: 5 }] },
        flare: { name: '耀斑', damage: 16 }
      },
      pattern: ['rain', 'ignite', 'flare']
    },

    /* 精英 */
    jin_jia_shi_jiang: {
      id: 'jin_jia_shi_jiang', name: '金甲尸将', element: 'metal', hp: [80, 86], elite: true,
      mechanic: { id: 'corpseEnergy', name: '尸煞', max: 2, hint: '挡住攻击，阻止尸煞强化处决。', description: '每次攻击招式使你实际失去生命，尸煞增加 1，最多 2。尸煞满时，下一次处决伤害增加 6，随后清零。完全格挡可阻止尸煞增长。' },
      presentation: { title: '精英 · 金甲尸将', subtitle: '军令未绝，死亦守关', intro: '越此关者，斩。', defeat: '军令……终矣。', arena: 'corpse' },
      moves: {
        combo: { name: '连斩', damage: 7, hits: 2 },
        golden: { name: '金身', block: 12, buffs: [{ status: 'strength', value: 2 }] },
        execute: { name: '处决', damage: 14, debuffs: [{ status: 'vulnerable', value: 1 }] }
      },
      pattern: ['combo', 'golden', 'execute']
    },
    shi_ling_teng_mu: {
      id: 'shi_ling_teng_mu', name: '噬灵藤母', element: 'wood', hp: [108, 118], elite: true,
      mechanic: { id: 'parasite', name: '寄生', hint: '毒潮会播下藤种，花费灵气可拔除。', description: '毒潮会将 1 张寄生藤种放入弃牌堆。抽到后可花费 1 灵气拔除；若留到回合结束，你失去 3 点生命，藤母回复 3 点生命。' },
      presentation: { title: '精英 · 噬灵藤母', subtitle: '万藤同根，寄生为食', intro: '留下吧，成为我的养料。', defeat: '根……断了……', arena: 'vines' },
      moves: {
        poison: { name: '毒潮', damage: 8, debuffs: [{ status: 'poison', value: 4 }], addCards: [{ id: 'ji_sheng_teng_zhong', count: 1 }] },
        bind: { name: '缠绕', damage: 10, debuffs: [{ status: 'weak', value: 2 }] },
        drain: { name: '汲取', damage: 8, heal: 8 }
      },
      pattern: ['poison', 'bind', 'drain']
    },
    xuan_shui_jiao_wang: {
      id: 'xuan_shui_jiao_wang', name: '玄水蛟王', element: 'water', hp: [140, 152], elite: true,
      mechanic: { id: 'tide', name: '潮位', max: 3, hint: '潮位越高，深渊越危险；周天可镇潮。', description: '潮汐和冰封各使潮位增加 1，最多 3。深渊每层潮位额外造成 3 点伤害，释放后潮位清零。五行周天可令潮位减少 1。' },
      presentation: { title: '精英 · 玄水蛟王', subtitle: '深渊潮起，蛟吟水寒', intro: '听见深渊的潮声了吗？', defeat: '潮……终会退去……', arena: 'tide' },
      moves: {
        tide: { name: '潮汐', damage: 9, hits: 2 },
        freeze: { name: '冰封', damage: 12, debuffs: [{ status: 'weak', value: 2 }] },
        abyss: { name: '深渊', damage: 19 }
      },
      pattern: ['tide', 'freeze', 'abyss']
    },

    /* Boss */
    shan_gui: {
      id: 'shan_gui', name: '山鬼·魑', element: 'earth', hp: [104, 112], boss: true,
      mechanic: { id: 'mountainMight', name: '山势', max: 2, hint: '打碎地脉护甲，阻止山势积蓄。', description: '山鬼带着护甲进入自己的回合时，山势增加 1，最多 2。山势满时，下一次伤害招式每一击额外造成 4 点伤害，随后清零。打碎护甲即可阻止蓄势。' },
      presentation: { title: '第一幕之主', subtitle: '山川恶念', intro: '凡人，也敢踏我山骨？', phase2: '山河皆我骨血！', defeat: '山……也会倒么……', arena: 'mountain' },
      moves: {
        rockfall: { name: '岩崩', damage: 12 },
        vein: { name: '地脉', block: 10, buffs: [{ status: 'strength', value: 1 }] },
        collapse: { name: '山崩', damage: 7, hits: 2, debuffs: [{ status: 'vulnerable', value: 1 }] },
        quake: { name: '地动', damage: 14 }
      },
      pattern: ['rockfall', 'vein', 'collapse', 'rockfall'],
      phase2: { hpPct: 0.5, pattern: ['quake', 'collapse', 'rockfall'], strength: 2, log: '山鬼撕裂山体，狂怒而起！' }
    },
    chi_ba: {
      id: 'chi_ba', name: '赤魃·焚天', element: 'fire', hp: [162, 174], boss: true,
      mechanic: { id: 'firePressure', name: '焚势', max: 3, hint: '及时熄灭火种，阻止天火爆发。', description: '火种可花费 1 灵气熄灭。每张留到回合结束的火种使你失去 2 点生命，并让赤魃获得 1 点焚势。焚势满 3 时赤魃下一招强制变为天火，释放后清零。' },
      presentation: { title: '第二幕之主', subtitle: '焚天赤魃', intro: '既入此窟，便作薪柴。', phase2: '天光可焚，何况尔等！', defeat: '火……竟会熄灭……', arena: 'inferno' },
      moves: {
        fentian: { name: '焚天', damage: 11, debuffs: [{ status: 'burn', value: 3 }] },
        lieyan: { name: '烈焰', damage: 7, hits: 2 },
        huozhong: { name: '播火', addCards: [{ id: 'huo_zhong', count: 2 }] },
        tianhuo: { name: '天火', damage: 17 }
      },
      pattern: ['fentian', 'lieyan', 'huozhong', 'tianhuo'],
      phase2: { hpPct: 0.5, pattern: ['tianhuo', 'huozhong', 'fentian', 'lieyan'], strength: 2, log: '赤魃吞没天光，焚尽万物！' }
    },
    tai_xu: {
      id: 'tai_xu', name: '太虚·五行主', element: 'none', hp: [210, 224], boss: true, rotateElement: true,
      mechanic: { id: 'arrayBreak', name: '破阵', max: 3, hint: '用克制当前元素的攻击破阵。', description: '以克制太虚当前元素的攻击牌真正命中它，每张牌增加 1 点破阵。达到 3 时触发五行崩解：清除护甲，造成 12 点无视护甲伤害，并令太虚定身一次。同一玩家回合内只能触发一次崩解。' },
      presentation: { title: '第三幕之主', subtitle: '五行之主', intro: '五行之内，皆在我掌。', phase2: '五行同归，万法归墟。', defeat: '原来……序外亦有道。', arena: 'void' },
      moves: {
        lunzhuan: { name: '五行轮转', block: 15, buffs: [{ status: 'strength', value: 1 }] },
        taixu: { name: '太虚剑', damage: 14, hits: 2 },
        guixu: { name: '归墟', damage: 18, debuffs: [{ status: 'weak', value: 1 }] },
        zhenwu: { name: '真武', damage: 10, debuffs: [{ status: 'vulnerable', value: 2 }] }
      },
      pattern: ['lunzhuan', 'taixu', 'zhenwu', 'guixu'],
      phase2: { hpPct: 0.5, pattern: ['taixu', 'lunzhuan', 'guixu'], strength: 3, log: '太虚一分为二，五行同归！' }
    }
  };

  /* ---------------- 遭遇 ---------------- */
  const ENCOUNTERS = {
    1: {
      normal: {
        early: [
          { id: 'a1_shan_xiao', enemies: [{ id: 'shan_xiao' }], weight: 4 },
          { id: 'a1_qing_she', enemies: [{ id: 'qing_she' }], weight: 4 },
          { id: 'a1_huo_shu', enemies: [{ id: 'huo_shu' }], weight: 3 },
          { id: 'a1_shui_gui', enemies: [{ id: 'shui_gui' }], weight: 2 }
        ],
        mid: [
          { id: 'a1_tong_jia', enemies: [{ id: 'tong_jia' }], weight: 3 },
          { id: 'a1_teng_yao', enemies: [{ id: 'teng_yao' }], weight: 3 },
          { id: 'a1_luo_shi', enemies: [{ id: 'luo_shi' }], weight: 3 },
          { id: 'a1_shan_xiao_huo_shu', enemies: [{ id: 'shan_xiao' }, { id: 'huo_shu' }], weight: 1, hpScale: 0.50 },
          { id: 'a1_qing_she_shui_gui', enemies: [{ id: 'qing_she' }, { id: 'shui_gui' }], weight: 1, hpScale: 0.50 }
        ],
        late: [
          { id: 'a1_tong_jia', enemies: [{ id: 'tong_jia' }], weight: 2 },
          { id: 'a1_teng_yao', enemies: [{ id: 'teng_yao' }], weight: 2 },
          { id: 'a1_luo_shi', enemies: [{ id: 'luo_shi' }], weight: 2 },
          { id: 'a1_tong_jia_huo_shu', enemies: [{ id: 'tong_jia' }, { id: 'huo_shu' }], weight: 1.5, hpScale: 0.50 },
          { id: 'a1_teng_yao_qing_she', enemies: [{ id: 'teng_yao' }, { id: 'qing_she' }], weight: 1.5, hpScale: 0.50 },
          { id: 'a1_luo_shi_shui_gui', enemies: [{ id: 'luo_shi' }, { id: 'shui_gui' }], weight: 1.5, hpScale: 0.50 },
          { id: 'a1_shan_xiao_teng_yao', enemies: [{ id: 'shan_xiao' }, { id: 'teng_yao' }], weight: 1.5, hpScale: 0.50 }
        ]
      },
      elite: [{ enemies: [{ id: 'jin_jia_shi_jiang' }] }],
      boss: { enemies: [{ id: 'shan_gui' }] }
    },
    2: {
      normal: {
        early: [
          { id: 'a2_xue_sha', enemies: [{ id: 'xue_sha' }], weight: 3 },
          { id: 'a2_bing_po', enemies: [{ id: 'bing_po' }], weight: 3 },
          { id: 'a2_shi_kui', enemies: [{ id: 'shi_kui' }], weight: 2 },
          { id: 'a2_you_huo', enemies: [{ id: 'you_huo' }], weight: 3 }
        ],
        mid: [
          { id: 'a2_jin_jia', enemies: [{ id: 'jin_jia' }], weight: 3 },
          { id: 'a2_shi_teng', enemies: [{ id: 'shi_teng' }], weight: 3 },
          { id: 'a2_xuan_gui', enemies: [{ id: 'xuan_gui' }], weight: 3 },
          { id: 'a2_xue_sha_you_huo', enemies: [{ id: 'xue_sha' }, { id: 'you_huo' }], weight: 0.9, hpScale: 0.45 },
          { id: 'a2_bing_po_shi_kui', enemies: [{ id: 'bing_po' }, { id: 'shi_kui' }], weight: 0.9, hpScale: 0.45 },
          { id: 'a2_shi_teng_xue_sha', enemies: [{ id: 'shi_teng' }, { id: 'xue_sha' }], weight: 0.9, hpScale: 0.45 }
        ],
        late: [
          { id: 'a2_xuan_gui', enemies: [{ id: 'xuan_gui' }], weight: 2 },
          { id: 'a2_jin_jia', enemies: [{ id: 'jin_jia' }], weight: 2 },
          { id: 'a2_shi_teng', enemies: [{ id: 'shi_teng' }], weight: 2 },
          { id: 'a2_jin_jia_xue_sha', enemies: [{ id: 'jin_jia' }, { id: 'xue_sha' }], weight: 1.5, hpScale: 0.45 },
          { id: 'a2_xuan_gui_you_huo', enemies: [{ id: 'xuan_gui' }, { id: 'you_huo' }], weight: 1.5, hpScale: 0.45 },
          { id: 'a2_shi_teng_bing_po', enemies: [{ id: 'shi_teng' }, { id: 'bing_po' }], weight: 1.5, hpScale: 0.45 },
          { id: 'a2_shi_kui_jin_jia', enemies: [{ id: 'shi_kui' }, { id: 'jin_jia' }], weight: 1.5, hpScale: 0.45 }
        ]
      },
      elite: [{ enemies: [{ id: 'shi_ling_teng_mu' }] }],
      boss: { enemies: [{ id: 'chi_ba' }] }
    },
    3: {
      normal: {
        early: [
          { id: 'a3_tian_bing', enemies: [{ id: 'tian_bing' }], weight: 3 },
          { id: 'a3_xing_huo', enemies: [{ id: 'xing_huo' }], weight: 3 },
          { id: 'a3_huang_quan', enemies: [{ id: 'huang_quan' }], weight: 2 }
        ],
        mid: [
          { id: 'a3_lei_shou', enemies: [{ id: 'lei_shou' }], weight: 3 },
          { id: 'a3_xuan_bing', enemies: [{ id: 'xuan_bing' }], weight: 3 },
          { id: 'a3_gu_mu', enemies: [{ id: 'gu_mu' }], weight: 3 },
          { id: 'a3_tian_bing_xing_huo', enemies: [{ id: 'tian_bing' }, { id: 'xing_huo' }], weight: 1, hpScale: 0.45 },
          { id: 'a3_huang_quan_lei_shou', enemies: [{ id: 'huang_quan' }, { id: 'lei_shou' }], weight: 1, hpScale: 0.45 }
        ],
        late: [
          { id: 'a3_lei_shou', enemies: [{ id: 'lei_shou' }], weight: 2 },
          { id: 'a3_xuan_bing', enemies: [{ id: 'xuan_bing' }], weight: 2 },
          { id: 'a3_tian_bing_lei_shou', enemies: [{ id: 'tian_bing' }, { id: 'lei_shou' }], weight: 1.6, hpScale: 0.45 },
          { id: 'a3_xuan_bing_xing_huo', enemies: [{ id: 'xuan_bing' }, { id: 'xing_huo' }], weight: 1.6, hpScale: 0.45 },
          { id: 'a3_gu_mu_huang_quan', enemies: [{ id: 'gu_mu' }, { id: 'huang_quan' }], weight: 1.6, hpScale: 0.45 },
          { id: 'a3_tian_bing_gu_mu', enemies: [{ id: 'tian_bing' }, { id: 'gu_mu' }], weight: 1.6, hpScale: 0.45 }
        ]
      },
      elite: [{ enemies: [{ id: 'xuan_shui_jiao_wang' }] }],
      boss: { enemies: [{ id: 'tai_xu' }] }
    }
  };

  /* ---------------- 事件 ---------------- */
  const EVENTS = [
    {
      id: 'gu_bei', title: '无字古碑', acts: [1, 2, 3],
      text: '荒径尽头立着一块无字古碑，碑面沁出丝丝凉意。你伸手触碰，识海中忽然涌入万千剑影。',
      choices: [
        { label: '凝神参悟（失去 8 点生命）', effects: [{ op: 'damage', value: 8 }, { op: 'upgradeRandomCards', count: 1 }], result: '剑影散去，你的一张牌在识海中淬炼成形。' },
        { label: '拱手离开', effects: [], result: '你压下心中悸动，转身离去。' }
      ]
    },
    {
      id: 'yao_nong', title: '采药老农', acts: [1, 2, 3],
      text: '一位背着竹篓的老农坐在路边，篓中草药清香扑鼻。他笑眯眯地看着你，说这些药可以换些盘缠。',
      choices: [
        { label: '买下灵药（花费 40 金币）', require: { gold: 40 }, effects: [{ op: 'gold', value: -40 }, { op: 'heal', value: 10 }, { op: 'addPotion' }], result: '老农塞给你一瓶丹药，又替你敷了药。' },
        { label: '讨一碗药汤', effects: [{ op: 'heal', value: 8 }], result: '药汤微苦，入腹却暖。' },
        { label: '强抢药篓', effects: [{ op: 'gold', value: 35 }, { op: 'curse' }], result: '你抢过药篓扬长而去，身后传来老农的叹息。一缕黑气缠上心头。' }
      ]
    },
    {
      id: 'jian_zhong', title: '剑冢', acts: [1, 2, 3],
      text: '无数断剑插满山谷，剑意冲霄。最深处有一柄完整的古剑，剑柄缠着褪色的红绳。',
      choices: [
        { label: '拔剑（获得随机遗物与一张诅咒）', effects: [{ op: 'addRandomRelic' }, { op: 'curse' }], result: '古剑出鞘，剑鸣如泣。你得到了一件遗物，却也听见了剑中怨魂的低语。' },
        { label: '拂衣而去', effects: [], result: '你向剑冢行了一礼，没有惊动那些沉睡的剑。' }
      ]
    },
    {
      id: 'wen_quan', title: '山间温泉', acts: [1, 2, 3],
      text: '雾气氤氲的温泉藏在竹林深处，水面浮着几片红叶。连日厮杀留下的疲惫似乎都被热气化开了。',
      choices: [
        { label: '沐浴疗伤（回复 30% 最大生命）', effects: [{ op: 'healPct', value: 30 }], result: '你浸入泉中，伤痕与疲惫一同消散。' },
        { label: '在泉边打坐（随机移除一张牌，失去 10 点生命）', effects: [{ op: 'damage', value: 10 }, { op: 'removeRandomCard' }], result: '你斩去一缕杂念，也割舍了一段旧学。' }
      ]
    },
    {
      id: 'du_fang', title: '地下赌坊', acts: [1, 2, 3],
      text: '昏暗的赌坊里人声鼎沸，骰盅起落间，有人一夜暴富，也有人输掉了本命法器。',
      choices: [
        { label: '押上 50 金币', require: { gold: 50 }, effects: [{ op: 'gold', value: -50 }, { op: 'random', outcomes: [
          { weight: 45, text: '骰盅揭开，你赢了。庄家脸色铁青地推来一堆金币。', effects: [{ op: 'gold', value: 100 }] },
          { weight: 55, text: '骰盅揭开，你输了。庄家笑着收走了你的金币。', effects: [] }
        ] }], result: '骰盅落定。' },
        { label: '离开赌坊', effects: [], result: '你头也不回地走出了赌坊。' }
      ]
    },
    {
      id: 'luo_nan', title: '落难修士', acts: [1, 2, 3],
      text: '一名修士瘫坐在树下，道袍破损，气息奄奄。他看见你，眼中燃起一丝希望。',
      choices: [
        { label: '赠予 30 金币', require: { gold: 30 }, effects: [{ op: 'gold', value: -30 }, { op: 'addRandomCard', rarity: 'uncommon' }], result: '修士千恩万谢，将一卷功法塞进你手中。' },
        { label: '为他护法疗伤', effects: [{ op: 'damage', value: 5 }, { op: 'heal', value: 6 }], result: '你损耗了些许真气，修士的脸色好转了一些。' },
        { label: '视而不见', effects: [], result: '你从他身旁走过。修真路上，这样的场景并不少见。' }
      ]
    },
    {
      id: 'wu_se', title: '五色祭坛', acts: [1, 2, 3],
      text: '一座古老的祭坛立在荒野中央，五个凹槽分别泛着青、赤、黄、白、蓝五色微光。你将手按在其中一个凹槽上。',
      choices: [
        { label: '青·木', effects: [{ op: 'addRandomCard', element: 'wood' }], result: '青光亮起，一枚木行符箓落入你手中。' },
        { label: '赤·火', effects: [{ op: 'addRandomCard', element: 'fire' }], result: '赤焰翻涌，一枚火行符箓落入你手中。' },
        { label: '黄·土', effects: [{ op: 'addRandomCard', element: 'earth' }], result: '大地低鸣，一枚土行符箓落入你手中。' },
        { label: '白·金', effects: [{ op: 'addRandomCard', element: 'metal' }], result: '金气铮鸣，一枚金行符箓落入你手中。' },
        { label: '蓝·水', effects: [{ op: 'addRandomCard', element: 'water' }], result: '水波流转，一枚水行符箓落入你手中。' }
      ]
    },
    {
      id: 'xin_mo', title: '心魔', acts: [1, 2, 3],
      text: '你看见另一个自己站在路中央。他穿着你的衣服，用你的声音说话：“把身体交给我，你不必再苦修。”',
      choices: [
        { label: '斩心魔（失去 12 点生命，获得随机稀有遗物）', effects: [{ op: 'damage', value: 12 }, { op: 'addRandomRelic', rarity: 'rare' }], result: '剑光落下，心魔化作黑烟。你从灰烬中拾起一件古物。' },
        { label: '承认它（获得一张诅咒，回复 10 点生命）', effects: [{ op: 'curse' }, { op: 'heal', value: 10 }], result: '你与心魔对视良久，最终各自退了一步。' }
      ]
    },
    {
      id: 'cang_shu', title: '藏书阁', acts: [2, 3],
      text: '一座半塌的藏书阁，玉简散落一地。最深处的书案上，放着一卷以金线封缄的功法。',
      choices: [
        { label: '以 60 金币换取功法', require: { gold: 60 }, effects: [{ op: 'gold', value: -60 }, { op: 'addRandomCard', rarity: 'rare' }], result: '守阁的老者收下金币，将金线功法递给了你。' },
        { label: '悄悄拿走', effects: [{ op: 'addRandomCard', rarity: 'rare' }, { op: 'curse' }], result: '你揣起功法离开，身后书架轰然倒塌，一缕怨气缠上了你。' },
        { label: '离开', effects: [], result: '你没有惊动这座沉寂的书阁。' }
      ]
    },
    {
      id: 'yun_you', title: '云游商人', acts: [1, 2, 3],
      text: '一个挑着担子的商人从雾中走出，担子两头的箱子里装满了稀奇古怪的物件。',
      choices: [
        { label: '买一件法器（花费 100 金币）', require: { gold: 100 }, effects: [{ op: 'gold', value: -100 }, { op: 'addRandomRelic' }], result: '商人从箱底摸出一件法器，神秘兮兮地塞给了你。' },
        { label: '买一瓶丹药（花费 35 金币）', require: { gold: 35 }, effects: [{ op: 'gold', value: -35 }, { op: 'addPotion' }], result: '商人递来一瓶丹药，瓶身还带着雾气。' },
        { label: '目送商人离开', effects: [], result: '商人挑着担子，哼着小曲消失在雾里。' }
      ]
    },
    {
      id: 'ling_mai', title: '地底灵脉', acts: [1, 2, 3],
      text: '脚下传来汩汩水声般的灵气波动。你循着感应，找到一条裸露的地底灵脉。',
      choices: [
        { label: '引灵入体（生命上限 +6）', effects: [{ op: 'maxHp', value: 6 }], result: '灵气冲刷经脉，你的根基更厚了一分。' },
        { label: '采集灵晶（获得 40 金币）', effects: [{ op: 'gold', value: 40 }], result: '你凿下几块灵晶，收进储物袋。' }
      ]
    },
    {
      id: 'ku_jing', title: '枯井', acts: [1, 2, 3],
      text: '一口枯井藏在乱石间，井口结着蛛网。你隐约听见井底传来铜钱碰撞的脆响。',
      choices: [
        { label: '投下 20 金币', require: { gold: 20 }, effects: [{ op: 'gold', value: -20 }, { op: 'random', outcomes: [
          { weight: 40, text: '井底亮起金光，一袋金币被一股力量托了上来。', effects: [{ op: 'gold', value: 80 }] },
          { weight: 25, text: '一件蒙尘的法器从井底浮起，落入你手中。', effects: [{ op: 'addRandomRelic' }] },
          { weight: 35, text: '井底传来一声轻笑，然后归于寂静。', effects: [] }
        ] }], result: '金币落井，回声久久不散。' },
        { label: '离开', effects: [], result: '你绕开了这口枯井。' }
      ]
    },
    {
      id: 'hu_xian', title: '狐仙', acts: [1, 2, 3],
      text: '月光下，一只白狐蹲在石上，尾巴轻轻摇晃。它开口说话，声音像溪水：“过路人，可要一份机缘？”',
      choices: [
        { label: '接受祝福（随机升级两张牌）', effects: [{ op: 'upgradeRandomCards', count: 2 }, { op: 'curse' }], result: '白狐化作青烟散去，你的两张牌泛起灵光，心底却多了一丝说不清的牵挂。' },
        { label: '献上敬意（获得 25 金币）', effects: [{ op: 'gold', value: 25 }], result: '白狐叼来一小袋金币放在你脚边，转身跃入林中。' }
      ]
    },
    {
      id: 'tian_lei', title: '渡雷崖', acts: [2, 3],
      text: '前方山崖上雷云翻滚，一道雷柱不时劈落，将岩石烧成焦黑。崖壁间却有一株雷灵草。',
      choices: [
        { label: '冲上崖顶采药（失去 15 点生命，获得随机稀有牌）', effects: [{ op: 'damage', value: 15 }, { op: 'addRandomCard', rarity: 'rare' }], result: '雷光擦着你的肩膀落下，你攥着雷灵草滚下山崖，怀里多了一卷被雷火淬过的功法。' },
        { label: '绕路', effects: [], result: '你远远看了一眼崖顶，选择了更安全的路。' }
      ]
    }
  ];

  const DAO_BLESSINGS = [
    { id: 'dao_sword_intent', character: 'sword', tag: 'sword_intent', path: '藏锋', name: '剑心通明', ranks: [
      { text: '每场第一次剑意满时，抽 1 张牌。' }, { text: '每场第一次剑意满时，抽 1 张牌并获得 1 点灵气。' }] },
    { id: 'dao_sword_cycle', character: 'sword', tag: 'sword_cycle', path: '行云', name: '云行无迹', ranks: [
      { text: '每回合打出第 4 张牌时，获得 1 点灵气。' }, { text: '每回合打出第 4 张牌时，获得 1 点灵气并抽 1 张牌。' }] },
    { id: 'dao_sword_chain', character: 'sword', tag: 'sword_chain', path: '剑阵', name: '金水交鸣', ranks: [
      { text: '每回合第一次连携达到 3 层时，抽 1 张牌。' }, { text: '每回合第一次连携达到 3 层时，抽 1 张牌并获得 1 点灵气。' }] },
    { id: 'dao_poison', character: 'alchemist', tag: 'poison', path: '万毒', name: '百毒不绝', ranks: [
      { text: '每场第一次毒爆只消耗 35% 中毒。' }, { text: '每场第一次毒爆只消耗 20% 中毒。' }] },
    { id: 'dao_burn', character: 'alchemist', tag: 'burn', path: '焚炉', name: '炉火不熄', ranks: [
      { text: '每场第一次灼烧爆发后保留 3 层灼烧。' }, { text: '每场第一次灼烧爆发后保留 6 层灼烧。' }] },
    { id: 'dao_regen', character: 'alchemist', tag: 'regen', path: '生生', name: '青帝余泽', ranks: [
      { text: '每场第一次主动兑现回春时，溢出治疗的 50% 转为护甲，最多 12 点。' }, { text: '每场第一次主动兑现回春时，溢出治疗全部转为护甲，最多 20 点。' }] },
    { id: 'dao_monk_block', character: 'monk', tag: 'monk_block', path: '镇岳', name: '山河不动', ranks: [
      { text: '每场第一次护甲兑现只损失 25% 护甲。' }, { text: '每场前两次护甲兑现均只损失 25% 护甲。' }] },
    { id: 'dao_monk_thorns', character: 'monk', tag: 'monk_thorns', path: '金刚', name: '反震无极', ranks: [
      { text: '每场第一次荆棘兑现只损失 25% 荆棘。' }, { text: '每场前两次荆棘兑现均只损失 25% 荆棘。' }] },
    { id: 'dao_monk_ritual', character: 'monk', tag: 'monk_ritual', path: '蓄势', name: '一力破天', ranks: [
      { text: '每场第一次战势满时，下一张体修终结牌费用 -1，最低为 1。' }, { text: '每场第一次战势满时，下一张体修终结牌费用 -2，最低为 1。' }] }
  ];

  const DATA = {
    version: 1,
    elements: ELEMENTS,
    elementOrder: ELEMENT_ORDER,
    statuses: STATUSES,
    characters: CHARACTERS,
    daoBlessings: DAO_BLESSINGS,
    cards: CARDS,
    cardMap: CARD_MAP,
    relics: RELICS,
    relicMap: RELIC_MAP,
    potions: POTIONS,
    potionMap: POTION_MAP,
    enemies: ENEMIES,
    encounters: ENCOUNTERS,
    events: EVENTS,
    treasure: {
      gold: [20, 40],
      relicChance: 0.7,
      potionChance: 0.35
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  if (root) root.WX_DATA = DATA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
