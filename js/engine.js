/* 《五行问道》规则引擎。纯逻辑，不依赖 DOM；浏览器挂载 WXEngine，Node 直接导出。 */
(function (root, factory) {
  'use strict';
  const DATA = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.WX_DATA;
  const engine = factory(DATA);
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  if (root) root.WXEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATA) {
  'use strict';

  const VERSION = 1;
  const ACT_NAMES = ['', '第一幕 · 山门问道', '第二幕 · 魔窟焚心', '第三幕 · 天阙归墟'];
  const NODE_META = {
    combat:  { name: '战斗', glyph: '战', desc: '一场遭遇战，胜利后获得卡牌奖励。' },
    elite:   { name: '精英', glyph: '精', desc: '强敌，胜利后获得遗物。' },
    event:   { name: '事件', glyph: '事', desc: '未知的机缘或灾祸。' },
    shop:    { name: '商店', glyph: '商', desc: '用金币购买卡牌、遗物与丹药。' },
    rest:    { name: '休整', glyph: '息', desc: '回复生命或升级一张牌。' },
    treasure:{ name: '宝箱', glyph: '宝', desc: '一件遗物或一笔金币。' },
    boss:    { name: '幕主', glyph: '主', desc: '本幕之主。' }
  };
  const ROUTE_META = {
    safe: { name: '稳健', glyph: '稳', short: '稳途', desc: '休整与商店倾向更高，精英较少' },
    resource: { name: '机缘', glyph: '缘', short: '机缘', desc: '事件、商店与宝箱倾向更高' },
    danger: { name: '险途', glyph: '险', short: '险途', desc: '精英与战斗倾向更高，收益也更集中' }
  };
  const ROUTE_MULTIPLIERS = {
    safe: { combat: 1.05, event: 0.90, elite: 0.45, shop: 1.35, rest: 1.55, treasure: 0.90 },
    resource: { combat: 0.75, event: 1.45, elite: 0.75, shop: 1.50, rest: 0.80, treasure: 1.50 },
    danger: { combat: 1.00, event: 0.70, elite: 1.70, shop: 0.55, rest: 0.55, treasure: 1.15 }
  };
  const MAP_SPECIAL_TYPES = ['shop', 'rest', 'treasure', 'elite'];
  const RARITY_NAME = { starter: '初始', common: '普通', uncommon: '罕见', rare: '稀有', curse: '诅咒', special: '特殊' };
  const CHARACTER_IDS = DATA.characters.map(c => c.id);
  const CURSE_IDS = ['xin_mo', 'za_nian', 'zou_huo'];
  const START_CURSES = ['za_nian', 'xin_mo'];
  const BUILD_NAMES = { sword_intent: '藏锋', sword_cycle: '行云', sword_chain: '剑阵', poison: '万毒', burn: '焚炉', regen: '生生', monk_block: '镇岳', monk_thorns: '金刚', monk_ritual: '蓄势' };
  const BUILD_TITLES = { sword_intent: '一剑开天', sword_cycle: '流云无尽', sword_chain: '天河剑主', poison: '百毒丹尊', burn: '赤炉真君', regen: '青帝丹心', monk_block: '镇岳真身', monk_thorns: '不动明王', monk_ritual: '崩天武尊' };
  const HIGHLIGHT_KEYS = ['maxTurnDamage', 'maxSingleHit', 'maxBlock', 'maxResource', 'maxPoison', 'maxBurn', 'maxThorns', 'maxChain', 'combats', 'turnDamage', 'totalDamage'];

  let EVENTS = [];
  function emit(ev) { EVENTS.push(ev); }
  function clearEvents() { EVENTS = []; }
  function result(ok, reason) { return { ok: !!ok, reason: reason || '', events: EVENTS }; }

  /* ---------------- 随机 ---------------- */
  function rand(state) {
    state.rng = (state.rng + 0x6D2B79F5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, min, max) { return min + Math.floor(rand(state) * (max - min + 1)); }
  function pick(state, arr) { return arr[Math.floor(rand(state) * arr.length)]; }
  function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(state) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function weighted(state, list, weightFn) {
    const total = list.reduce((s, it) => s + weightFn(it), 0);
    let r = rand(state) * total;
    for (const it of list) { r -= weightFn(it); if (r <= 0) return it; }
    return list[list.length - 1];
  }

  /* ---------------- 基础 ---------------- */
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function emptyStatuses() {
    const s = {};
    Object.keys(DATA.statuses).forEach(k => { s[k] = 0; });
    return s;
  }
  function newCard(state, id, up, temp) {
    const uid = 'c' + (state.nextUid++);
    return { uid, id, up: !!up, temp: !!temp };
  }
  function getCardData(inst) {
    const base = DATA.cardMap[inst.id];
    if (!base) return null;
    if (!inst.up || !base.up) return Object.assign({}, base, { upgraded: false });
    return Object.assign({}, base, {
      name: base.name + '·悟',
      cost: base.up.cost != null ? base.up.cost : base.cost,
      effects: base.up.effects || base.effects,
      text: base.up.text || base.text,
      exhaust: base.up.exhaust != null ? base.up.exhaust : base.exhaust,
      upgraded: true
    });
  }
  function getCharacter(state) { return DATA.characters.find(c => c.id === state.characterId) || DATA.characters[0]; }
  function getBuildIdentity(state) {
    const tags = getCharacter(state).buildTags || [];
    const counts = Object.fromEntries(tags.map(tag => [tag, 0]));
    const finishers = new Set();
    for (const instance of state.deck || []) {
      const card = DATA.cardMap[instance.id];
      if (!card || card.rarity === 'starter') continue;
      for (const tag of card.tags || []) {
        if (!(tag in counts)) continue;
        counts[tag]++;
        if (card.rarity === 'rare' && card.finisher) finishers.add(tag);
      }
    }
    const tag = tags.reduce((best, candidate) => counts[candidate] > (counts[best] || 0) ? candidate : best, null);
    const count = tag ? counts[tag] : 0;
    const level = count >= 6 && finishers.has(tag) ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
    return { tag, name: tag ? BUILD_NAMES[tag] : '未定', count, level, levelName: ['未定', '初窥', '成势', '大成'][level] };
  }
  function ensureDao(state) {
    if (!state.dao || typeof state.dao !== 'object') state.dao = {};
    if (!state.dao.blessings || typeof state.dao.blessings !== 'object') state.dao.blessings = {};
    if (!Array.isArray(state.dao.history)) state.dao.history = [];
    if (!state.dao.pending || typeof state.dao.pending !== 'object') state.dao.pending = null;
    return state.dao;
  }
  function getDaoRank(state, tag) { return Math.max(0, Math.min(2, Number(ensureDao(state).blessings[tag]) || 0)); }
  function getDaoBlessing(state, tag) { return DATA.daoBlessings.find(blessing => blessing.character === state.characterId && blessing.tag === tag) || null; }
  function getDaoChoices(state) {
    const identity = getBuildIdentity(state);
    const current = identity.level > 0 ? identity.tag : null;
    return DATA.daoBlessings.filter(blessing => blessing.character === state.characterId).map(blessing => {
      const rank = getDaoRank(state, blessing.tag);
      return { ...blessing, rank, nextRank: Math.min(2, rank + 1), disabled: rank >= 2, matching: current === blessing.tag };
    });
  }
  function daoCombatUsed(state, tag) { return Number(state.combat?.daoUsed?.[tag]) || 0; }
  function markDaoCombatUsed(state, tag) {
    if (!state.combat.daoUsed) state.combat.daoUsed = {};
    state.combat.daoUsed[tag] = daoCombatUsed(state, tag) + 1;
  }
  function triggerDao(state, tag) {
    const blessing = getDaoBlessing(state, tag);
    if (blessing) emit({ t: 'daoTrigger', id: blessing.id, name: blessing.name });
  }
  function grantDaoEnergy(state) {
    state.combat.energy++;
    emit({ t: 'energy', amount: 1, energy: state.combat.energy });
  }
  function triggerDaoChain(state) {
    const c = state.combat;
    const rank = getDaoRank(state, 'sword_chain');
    if (!c.daoTurnUsed) c.daoTurnUsed = {};
    if (c.phase !== 'player' || !rank || c.chain < 3 || c.daoTurnUsed.sword_chain) return;
    c.daoTurnUsed.sword_chain = true;
    triggerDao(state, 'sword_chain');
    itemDraw(state, 1);
    if (rank >= 2) grantDaoEnergy(state);
  }
  function prepareDaoChoice(state) {
    const dao = ensureDao(state);
    dao.pending = { act: state.act, stage: state.act === 1 ? 'dingdao' : 'wudao', chosen: null };
    state.screen = 'dao';
  }
  function chooseDaoBlessing(state, tag) {
    clearEvents();
    const dao = ensureDao(state);
    if (state.screen !== 'dao' || !dao.pending || dao.pending.act !== state.act || dao.pending.chosen) return result(false, '现在不能选择道印');
    const blessing = getDaoBlessing(state, tag);
    if (!blessing) return result(false, '此道印不属于当前角色');
    const rank = getDaoRank(state, tag);
    if (rank >= 2) return result(false, '此道印已至二重');
    dao.blessings[tag] = rank + 1;
    dao.pending.chosen = tag;
    dao.history.push({ act: state.act, stage: dao.pending.stage, id: tag, rank: rank + 1 });
    emit({ t: 'daoChosen', id: blessing.id, name: blessing.name, rank: rank + 1, stage: dao.pending.stage });
    return result(true);
  }
  function continueDao(state) {
    clearEvents();
    const pending = ensureDao(state).pending;
    if (state.screen !== 'dao' || !pending || pending.act !== state.act || !pending.chosen) return result(false, '请先选择一道印');
    state.dao.pending = null;
    nextAct(state);
    return result(true);
  }
  function ensureBuildMilestones(state) {
    if (!state.attraction || typeof state.attraction !== 'object') state.attraction = {};
    if (!state.attraction.buildMilestones || typeof state.attraction.buildMilestones !== 'object') {
      state.attraction.buildMilestones = {};
      for (const tag of state.attraction.awakenedTags || []) state.attraction.buildMilestones[tag] = 2;
    }
    delete state.attraction.awakenedTags;
    return state.attraction.buildMilestones;
  }
  function ensureHighlights(state) {
    if (!state.highlights || typeof state.highlights !== 'object') state.highlights = {};
    for (const key of HIGHLIGHT_KEYS) if (!Number.isFinite(state.highlights[key])) state.highlights[key] = 0;
    return state.highlights;
  }
  function recordDamageHighlight(state, damage) {
    const h = ensureHighlights(state);
    h.totalDamage += damage;
    h.maxSingleHit = Math.max(h.maxSingleHit, damage);
    if (state.combat?.phase === 'player') {
      h.turnDamage += damage;
      h.maxTurnDamage = Math.max(h.maxTurnDamage, h.turnDamage);
    }
  }
  function ensureCharacterResource(state) {
    const spec = getCharacter(state).resource;
    if (!state.combat || !spec) return null;
    const current = state.combat.characterResource;
    if (!current || current.id !== spec.id) state.combat.characterResource = { id: spec.id, value: 0, max: spec.max };
    else {
      current.max = spec.max;
      current.value = Math.max(0, Math.min(spec.max, Number(current.value) || 0));
    }
    return state.combat.characterResource;
  }
  function changeCharacterResource(state, delta) {
    const resource = ensureCharacterResource(state);
    if (!resource || !delta) return 0;
    const before = resource.value;
    const cardCap = state.combat.resourceGainedThisCard == null ? Infinity :
      Math.max(0, (getCharacter(state).resource.gainPerCardMax ?? Infinity) - state.combat.resourceGainedThisCard);
    const adjusted = delta > 0 ? Math.min(delta, cardCap) : delta;
    resource.value = Math.max(0, Math.min(resource.max, before + adjusted));
    const actual = resource.value - before;
    ensureHighlights(state).maxResource = Math.max(state.highlights.maxResource, resource.value);
    if (actual) {
      if (actual > 0 && state.combat.resourceGainedThisCard != null) state.combat.resourceGainedThisCard += actual;
      emit({ t: 'resource', id: resource.id, before, after: resource.value, delta: actual });
      if (before < resource.max && resource.value === resource.max) emit({ t: 'resourceReady', id: resource.id });
      if (before < resource.max && resource.value === resource.max) {
        if (resource.id === 'swordIntent' && getDaoRank(state, 'sword_intent') && !daoCombatUsed(state, 'sword_intent')) {
          markDaoCombatUsed(state, 'sword_intent');
          triggerDao(state, 'sword_intent');
          itemDraw(state, 1);
          if (getDaoRank(state, 'sword_intent') >= 2) grantDaoEnergy(state);
        }
        if (resource.id === 'battleMomentum' && getDaoRank(state, 'monk_ritual') && !daoCombatUsed(state, 'monk_ritual')) {
          markDaoCombatUsed(state, 'monk_ritual');
          state.combat.daoFinisherDiscount = getDaoRank(state, 'monk_ritual');
          triggerDao(state, 'monk_ritual');
        }
      }
    }
    return actual;
  }
  function awardCharacterResourceForPlayedCard(state, data, target, chainInfo) {
    const resource = ensureCharacterResource(state);
    if (!resource) return;
    // 消耗资源的终结牌在出牌结算后保持清空，不返还本次行为的基础资源。
    if (data.effects.some(effect => effect.consumeResource || effect.op === 'consumeResource')) return;
    if (resource.id === 'swordIntent' && data.type === 'attack') {
      changeCharacterResource(state, 1 + (chainInfo.linked ? 1 : 0) +
        (target && isCross(data.element, target.element) ? 1 : 0));
    } else if (resource.id === 'furnaceFire' && data.effects.some(effect =>
      (effect.op === 'status' && ['poison', 'burn', 'regen'].includes(effect.status)) ||
      (effect.op === 'multiplyStatus' && effect.status === 'poison') || effect.op === 'heal')) {
      changeCharacterResource(state, 1);
    }
  }
  function hasRelic(state, id) { return state.relics.includes(id); }
  function relicPassive(state, key) {
    let total = 0;
    state.relics.forEach(id => {
      const r = DATA.relicMap[id];
      if (r && r.passive && typeof r.passive[key] === 'number') total += r.passive[key];
    });
    return total;
  }
  function maxEnergy(state) { return 3 + relicPassive(state, 'maxEnergy'); }
  function elementData(id) { return DATA.elements[id] || DATA.elements.none; }
  function isCross(cardElement, enemyElement) {
    if (!cardElement || !enemyElement) return false;
    if (cardElement === 'none' || enemyElement === 'none') return false;
    return elementData(cardElement).overcomes === enemyElement;
  }
  function aliveEnemies(state) { return state.combat ? state.combat.enemies.filter(e => e.hp > 0) : []; }
  function firstEnemy(state) { return aliveEnemies(state)[0] || null; }
  function enemyById(state, uid) { return state.combat ? state.combat.enemies.find(e => e.uid === uid) : null; }
  function healPlayer(state, n) {
    const before = state.hp;
    state.hp = Math.min(state.maxHp, state.hp + Math.max(0, n));
    if (state.hp !== before) emit({ t: 'heal', amount: state.hp - before, hp: state.hp });
  }
  function directPlayerDamage(state, n) {
    if (n <= 0) return;
    state.hp = Math.max(0, state.hp - n);
    emit({ t: 'damage', target: 'player', amount: n, blocked: 0, hp: state.hp, direct: true });
    checkEnd(state);
  }
  function directEnemyDamage(state, enemy, n, source) {
    if (n <= 0 || enemy.hp <= 0) return;
    recordDamageHighlight(state, Math.min(enemy.hp, n));
    enemy.hp = Math.max(0, enemy.hp - n);
    emit({ t: 'damage', target: 'enemy', uid: enemy.uid, amount: n, blocked: 0, hp: enemy.hp, direct: true, source: source || 'effect' });
    afterEnemyHpChange(state, enemy);
  }
  function gainGold(state, n) {
    if (n > 0) n = Math.max(0, Math.floor(n * (1 - 0.02 * state.ascension)));
    state.gold = Math.max(0, state.gold + n);
    if (n !== 0) emit({ t: 'gold', amount: n, gold: state.gold });
  }

  /* ---------------- 角色创建 ---------------- */
  function createRun(opts) {
    opts = opts || {};
    const character = DATA.characters.find(c => c.id === opts.characterId) || DATA.characters[0];
    const ascension = Math.max(0, Math.min(10, (opts.ascension | 0)));
    const seed = opts.seed != null ? (opts.seed >>> 0) : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    const state = {
      version: VERSION,
      seed,
      rng: seed,
      ascension,
      characterId: character.id,
      hp: character.maxHp,
      maxHp: character.maxHp,
      gold: 99,
      deck: [],
      relics: character.relic ? [character.relic] : [],
      potions: [],
      nextUid: 1,
      act: 1,
      screen: 'map',
      map: null,
      combat: null,
      reward: null,
      event: null,
      shop: null,
      treasure: null,
      usedEvents: [],
      recentEncounters: [],
      stats: { floors: 0, kills: 0, elites: 0, cardsPlayed: 0, damageDealt: 0, damageTaken: 0 },
      highlights: Object.fromEntries(HIGHLIGHT_KEYS.map(key => [key, 0])),
      attraction: { buildMilestones: {} },
      dao: { blessings: {}, history: [], pending: null },
      victory: false,
      startedAt: Date.now()
    };
    character.deck.forEach(d => {
      for (let i = 0; i < d.count; i++) state.deck.push(newCard(state, d.id, false));
    });
    const curses = ascension >= 10 ? 2 : ascension >= 6 ? 1 : 0;
    for (let i = 0; i < curses; i++) state.deck.push(newCard(state, START_CURSES[i % START_CURSES.length], false));
    generateMap(state, 1);
    return state;
  }

  /* ---------------- 地图 ---------------- */
  function getMapRouteProfile(node, rowNodes) {
    const count = rowNodes?.length || 1;
    if (count === 1) return 'resource';
    if (node.col === 0) return 'safe';
    if (node.col === count - 1) return 'danger';
    return 'resource';
  }

  function getMapTypeLimits(act) {
    return { shop: 2, event: 4, treasure: 2, rest: 2, elite: act === 1 ? 2 : 3 };
  }

  function getMapTypeWeights({ act, row, route, predecessors = [], typeCounts = {}, reservedTreasureSuccessor = false }) {
    const weights = {
      combat: 46,
      event: 17,
      elite: row >= 2 ? (act === 1 ? 8 : act === 2 ? 11 : 14) : 0,
      shop: 8,
      rest: row >= 3 && row <= 5 ? 9 : 0,
      treasure: 6
    };
    const multiplier = ROUTE_MULTIPLIERS[route] || ROUTE_MULTIPLIERS.resource;
    const limits = getMapTypeLimits(act);
    for (const type of Object.keys(weights)) {
      if (limits[type] != null && (typeCounts[type] || 0) >= limits[type]) weights[type] = 0;
      if (MAP_SPECIAL_TYPES.includes(type) && predecessors.some(node => node.type === type)) weights[type] = 0;
      if (type === 'treasure' && reservedTreasureSuccessor) weights[type] = 0;
      if (type === 'event' && predecessors.some(node => node.type === 'event')) weights[type] *= 0.25;
      weights[type] *= multiplier[type];
    }
    return weights;
  }

  function mapIncoming(nodes) {
    const incoming = new Map(nodes.map(node => [node.id, []]));
    for (const node of nodes) for (const next of node.next) incoming.get(next)?.push(node);
    return incoming;
  }

  function validateMap(map) {
    const errors = [];
    if (!map || !Array.isArray(map.nodes) || !Array.isArray(map.byRow)) return { valid: false, errors: ['地图结构缺失'] };
    const byId = new Map(map.nodes.map(node => [node.id, node]));
    const incoming = mapIncoming(map.nodes);
    const hard = new Set(MAP_SPECIAL_TYPES);
    const boss = byId.get(map.bossId);
    if (!boss || boss.type !== 'boss' || boss.row !== 8) errors.push('幕主节点无效');
    if (map.byRow.length !== 9 || map.byRow[0]?.length !== 3 || map.byRow[7]?.length !== 2) errors.push('地图层数或固定节点数无效');
    for (let row = 1; row <= 6; row++) if (map.byRow[row]?.length < 2 || map.byRow[row]?.length > 3) errors.push(`第 ${row + 1} 层节点数无效`);
    for (const node of map.nodes) {
      if (node.row < 8 && !ROUTE_META[node.route]) errors.push(`${node.id} 缺少路线`);
      if (node.row === 0 && node.type !== 'combat') errors.push(`${node.id} 起点不是战斗`);
      if (node.row === 7 && node.type !== 'rest') errors.push(`${node.id} 幕主前不是休整`);
      if (node.row === 1 && ['elite', 'rest'].includes(node.type)) errors.push(`${node.id} 第 2 层类型无效`);
      if (node.row === 2 && node.type === 'rest') errors.push(`${node.id} 第 3 层不能休整`);
      if (node.row === 6 && node.type === 'rest') errors.push(`${node.id} 连续休整风险`);
      if (node.row < 8 && !node.next.length) errors.push(`${node.id} 无后继`);
      if (node.row > 0 && !(incoming.get(node.id) || []).length) errors.push(`${node.id} 无入边`);
      for (const nextId of node.next) {
        const next = byId.get(nextId);
        if (!next || next.row !== node.row + 1) errors.push(`${node.id} 连线无效`);
        else if (hard.has(node.type) && next.type === node.type) errors.push(`${node.id} → ${next.id} 连续特殊节点`);
      }
    }
    const middle = map.nodes.filter(node => node.row >= 1 && node.row <= 6);
    const count = type => middle.filter(node => node.type === type).length;
    const limits = getMapTypeLimits(map.act);
    for (const type of ['shop', 'event', 'elite', 'treasure']) if (count(type) < 1) errors.push(`缺少 ${type}`);
    for (const [type, maximum] of Object.entries(limits)) if (count(type) > maximum) errors.push(`${type} 超过上限`);
    if (!middle.some(node => node.type === 'treasure' && node.row >= 3 && node.row <= 5)) errors.push('缺少中段宝箱');
    const starts = map.byRow[0] || [];
    const forward = new Set();
    const stack = starts.slice();
    while (stack.length) {
      const node = stack.pop();
      if (forward.has(node.id)) continue;
      forward.add(node.id);
      for (const id of node.next) if (byId.has(id)) stack.push(byId.get(id));
    }
    if (forward.size !== map.nodes.length) errors.push('存在起点不可达节点');
    const backward = new Set();
    const reverse = boss ? [boss] : [];
    while (reverse.length) {
      const node = reverse.pop();
      if (backward.has(node.id)) continue;
      backward.add(node.id);
      reverse.push(...(incoming.get(node.id) || []));
    }
    if (backward.size !== map.nodes.length) errors.push('存在无法到达幕主的节点');
    return { valid: errors.length === 0, errors };
  }

  function assignMapTypes(state, map, guaranteedTreasure) {
    const { nodes, byRow, act } = map;
    const incoming = mapIncoming(nodes);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const middle = nodes.filter(node => node.row >= 1 && node.row <= 6);
    const minimum = { shop: 1, event: 1, elite: 1, treasure: 1 };
    const counts = { combat: 0, event: 0, elite: 0, shop: 0, rest: 0, treasure: 1 };
    for (const node of middle) node.type = 'combat';
    guaranteedTreasure.type = 'treasure';
    for (let row = 1; row <= 6; row++) {
      for (const node of byRow[row]) {
        if (node === guaranteedTreasure) continue;
        const weights = getMapTypeWeights({ act, row, route: node.route, predecessors: incoming.get(node.id),
          typeCounts: counts, reservedTreasureSuccessor: node.next.includes(guaranteedTreasure.id) });
        const choices = Object.keys(weights).filter(type => weights[type] > 0);
        node.type = weighted(state, choices, type => weights[type]);
        counts[node.type]++;
      }
    }
    for (const type of ['shop', 'event', 'elite']) {
      if (counts[type] >= minimum[type]) continue;
      const candidates = middle.filter(node => {
        if (node === guaranteedTreasure || node.type === type) return false;
        if (counts[node.type] <= (minimum[node.type] || 0)) return false;
        const weights = getMapTypeWeights({ act, row: node.row, route: node.route,
          predecessors: incoming.get(node.id), typeCounts: counts,
          reservedTreasureSuccessor: node.next.includes(guaranteedTreasure.id) });
        return weights[type] > 0 && !node.next.some(id => byId.get(id)?.type === type && MAP_SPECIAL_TYPES.includes(type));
      });
      if (!candidates.length) return false;
      const target = weighted(state, candidates, node => ROUTE_MULTIPLIERS[node.route][type]);
      counts[target.type]--;
      target.type = type;
      counts[type]++;
    }
    return true;
  }

  function generateMap(state, act) {
    const counts = [3, randInt(state, 2, 3), randInt(state, 2, 3), randInt(state, 2, 3), randInt(state, 2, 3), randInt(state, 2, 3), randInt(state, 2, 3), 2];
    const nodes = [];
    const byRow = [];
    for (let row = 0; row < 8; row++) {
      byRow[row] = [];
      for (let col = 0; col < counts[row]; col++) {
        const node = {
          id: 'a' + act + 'r' + row + 'n' + col,
          act, row, col,
          type: 'combat',
          next: [],
          visited: false
        };
        nodes.push(node);
        byRow[row].push(node);
      }
    }
    const boss = { id: 'a' + act + 'boss', act, row: 8, col: 0, type: 'boss', next: [], visited: false };
    nodes.push(boss);
    byRow[8] = [boss];

    // 连线：每层节点连向下一层 1-2 个邻近节点
    for (let row = 0; row < 7; row++) {
      const cur = byRow[row], nxt = byRow[row + 1];
      cur.forEach((node, i) => {
        const base = Math.floor(i * nxt.length / cur.length);
        const targets = new Set([nxt[Math.min(nxt.length - 1, base)].id]);
        if (rand(state) < 0.42) targets.add(nxt[Math.min(nxt.length - 1, base + 1)].id);
        node.next = Array.from(targets);
      });
      // 保证下一层每个节点都有入边
      nxt.forEach((node, j) => {
        if (!cur.some(n => n.next.includes(node.id))) {
          const src = cur[Math.min(cur.length - 1, Math.floor(j * cur.length / nxt.length))];
          src.next.push(node.id);
        }
      });
    }
    byRow[7].forEach(n => { n.next = [boss.id]; });

    // 路线只由横向位置决定；节点类型仍按每局种子抽取。
    for (let row = 0; row < 8; row++) {
      for (const node of byRow[row]) node.route = getMapRouteProfile(node, byRow[row]);
    }
    byRow[0].forEach(n => { n.type = 'combat'; });
    byRow[7].forEach(n => { n.type = 'rest'; });
    const treasureCandidates = byRow.slice(3, 6).flat();
    const guaranteedTreasure = weighted(state, treasureCandidates, node =>
      node.route === 'resource' ? 3 : node.route === 'safe' ? 2 : 1);
    const map = {
      act,
      nodes,
      byRow,
      bossId: boss.id,
      currentNode: null,
      rows: 9
    };
    let valid = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      if (assignMapTypes(state, map, guaranteedTreasure) && validateMap(map).valid) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      // 极端配额冲突时保持本局可玩；固定节点与连线仍沿用同一种子生成的结果。
      for (const node of nodes.filter(node => node.row >= 1 && node.row <= 6)) node.type = 'combat';
      guaranteedTreasure.type = 'treasure';
      byRow[1][0].type = 'shop';
      byRow[1][byRow[1].length - 1].type = 'event';
      byRow[2][byRow[2].length - 1].type = 'elite';
    }
    state.act = act;
    state.map = map;
    state.screen = 'map';
    return map;
  }

  function nodeById(state, id) {
    if (!state.map) return null;
    return state.map.nodes.find(n => n.id === id) || null;
  }
  function currentNode(state) { return state.map && state.map.currentNode ? nodeById(state, state.map.currentNode) : null; }
  function availableNodes(state) {
    if (!state.map) return [];
    const cur = currentNode(state);
    if (!cur) return state.map.byRow[0].filter(n => !n.visited);
    return cur.next.map(id => nodeById(state, id)).filter(n => n && !n.visited);
  }
  function getActName(act) { return ACT_NAMES[act] || ''; }
  function getNodeMeta(type) { return NODE_META[type] || NODE_META.combat; }

  function getEncounterStageByFloor(floor) {
    if (floor <= 2) return 'early';
    if (floor <= 5) return 'mid';
    return 'late';
  }
  function adjustedEncounterWeight(encounter, history) {
    const weight = encounter.weight == null ? 1 : Number(encounter.weight);
    if (!Number.isFinite(weight) || weight <= 0) return 0;
    const recent = Array.isArray(history) ? history : [];
    if (encounter.id && encounter.id === recent[recent.length - 1]) return weight * 0.05;
    if (encounter.id && encounter.id === recent[recent.length - 2]) return weight * 0.35;
    return weight;
  }
  function pickEncounter(state, act, type, row) {
    const table = DATA.encounters[act];
    if (!table) return { enemies: [{ id: 'shan_xiao' }] };
    if (type === 'elite') return table.elite[0];
    if (type === 'boss') return table.boss;
    const normal = table.normal || {};
    const currentRow = row == null ? (currentNode(state)?.row ?? 0) : row;
    const stage = getEncounterStageByFloor(currentRow + 1);
    const pools = Array.isArray(normal) ? [normal] : [normal[stage], normal.mid, ...Object.values(normal)];
    const pool = pools.find(items => Array.isArray(items) && items.length) || [];
    if (!pool.length) return { enemies: [{ id: 'shan_xiao' }] };
    const history = Array.isArray(state.recentEncounters) ? state.recentEncounters : [];
    const adjustedTotal = pool.reduce((sum, encounter) => sum + adjustedEncounterWeight(encounter, history), 0);
    const rawWeight = encounter => {
      const value = encounter.weight == null ? 1 : Number(encounter.weight);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const rawTotal = pool.reduce((sum, encounter) => sum + rawWeight(encounter), 0);
    const selected = weighted(state, pool, adjustedTotal > 0 && Number.isFinite(adjustedTotal)
      ? encounter => adjustedEncounterWeight(encounter, history)
      : rawTotal > 0 && Number.isFinite(rawTotal) ? rawWeight : () => 1);
    if (selected.id) state.recentEncounters = [...history, selected.id].slice(-2);
    return selected;
  }

  function enterNode(state, nodeId) {
    clearEvents();
    if (!state.map || state.combat) return result(false, '当前无法前进');
    if (state.screen !== 'map' && state.screen !== 'reward' && state.screen !== 'victory') return result(false, '请先处理当前事件');
    const allowed = availableNodes(state);
    const node = nodeById(state, nodeId);
    if (!node || !allowed.some(n => n.id === nodeId)) return result(false, '无法前往该节点');
    node.visited = true;
    state.map.currentNode = node.id;
    state.stats.floors++;
    state.reward = null;
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      const enc = pickEncounter(state, state.map.act, node.type, node.row);
      if (node.type === 'elite') state.stats.elites++;
      startCombat(state, enc, node.type);
    } else if (node.type === 'event') {
      enterEvent(state);
    } else if (node.type === 'shop') {
      generateShop(state);
    } else if (node.type === 'rest') {
      state.screen = 'rest';
    } else if (node.type === 'treasure') {
      enterTreasure(state);
    }
    return result(true, '', EVENTS);
  }

  /* ---------------- 战斗初始化 ---------------- */
  function createEnemy(state, spec, hpScale) {
    const data = DATA.enemies[spec.id];
    const scale = (hpScale || spec.hpScale || 1) * (1 + 0.04 * state.ascension);
    const baseHp = data.hp.length > 1 ? randInt(state, data.hp[0], data.hp[1]) : data.hp[0];
    const hp = Math.max(1, Math.round(baseHp * scale));
    const enemy = {
      uid: 'e' + (state.nextUid++),
      id: data.id,
      name: data.name,
      element: data.element,
      hp, maxHp: hp,
      block: 0,
      statuses: emptyStatuses(),
      patternIndex: 0,
      intent: null,
      phase: 1,
      actionsPerTurn: 1,
      damageScale: 1 + 0.02 * state.ascension,
      rotateElement: !!data.rotateElement,
      elite: !!data.elite,
      boss: !!data.boss
    };
    setEnemyIntent(state, enemy);
    return enemy;
  }

  function enemyPattern(enemy) {
    const data = DATA.enemies[enemy.id];
    if (enemy.phase === 2 && data.phase2 && data.phase2.pattern) return data.phase2.pattern;
    return data.pattern;
  }
  function setEnemyIntent(state, enemy) {
    const pattern = enemyPattern(enemy);
    if (!pattern || !pattern.length) { enemy.intent = null; return; }
    enemy.intent = pattern[enemy.patternIndex % pattern.length];
  }
  function advanceEnemyIntent(state, enemy) {
    enemy.patternIndex++;
    setEnemyIntent(state, enemy);
  }

  function startCombat(state, encounter, type) {
    clearEvents();
    const highlights = ensureHighlights(state);
    highlights.combats++;
    highlights.turnDamage = 0;
    const c = {
      turn: 1,
      phase: 'player',
      energy: maxEnergy(state),
      maxEnergy: maxEnergy(state),
      block: 0,
      statuses: emptyStatuses(),
      hand: [],
      drawPile: shuffle(state, state.deck.map(card => ({ uid: card.uid, id: card.id, up: card.up, temp: !!card.temp }))),
      discardPile: [],
      exhaustPile: [],
      enemies: [],
      currentElement: null,
      chain: 0,
      cardsPlayedThisTurn: 0,
      daoUsed: {},
      daoTurnUsed: {},
      daoFinisherDiscount: 0,
      firstAttackUsed: false,
      firstCardUsed: false,
      encounterType: type || 'combat',
      characterResource: getCharacter(state).resource ? { id: getCharacter(state).resource.id, value: 0, max: getCharacter(state).resource.max } : undefined,
      momentumBlockedThisEnemyTurn: 0,
      momentumGainedThisEnemyTurn: 0,
      relicUsed: {},
      log: []
    };
    state.combat = c;
    c.enemies = (encounter.enemies || []).map(spec => createEnemy(state, spec, encounter.hpScale));
    state.screen = 'combat';
    itemDraw(state, 5 + relicPassive(state, 'extraDraw') - relicPassive(state, 'drawPenalty'));
    triggerRelic(state, 'combatStart');
    emit({ t: 'combatStart', enemies: c.enemies.map(e => ({ uid: e.uid, name: e.name, element: e.element })) });
    const milestones = ensureBuildMilestones(state);
    const identity = getBuildIdentity(state);
    if (identity.level >= 2 && identity.level > (milestones[identity.tag] || 0)) {
      milestones[identity.tag] = identity.level;
      emit({ t: 'buildAwakened', tag: identity.tag, name: identity.name, levelName: identity.levelName });
    }
    checkEnd(state);
    return result(true);
  }

  /* ---------------- 抽牌 / 手牌 ---------------- */
  function itemDraw(state, n) {
    const c = state.combat;
    if (!c) return 0;
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (c.hand.length >= 10) break;
      if (!c.drawPile.length) {
        if (!c.discardPile.length) break;
        c.drawPile = shuffle(state, c.discardPile);
        c.discardPile = [];
        emit({ t: 'shuffle' });
      }
      const card = c.drawPile.pop();
      c.hand.push(card);
      drawn++;
      emit({ t: 'draw', uid: card.uid, id: card.id });
    }
    return drawn;
  }
  function discardHand(state, keepRetain) {
    const c = state.combat;
    const retained = [];
    c.hand.forEach(inst => {
      const data = getCardData(inst);
      if (keepRetain && data && data.retain) retained.push(inst);
      else c.discardPile.push(inst);
    });
    c.hand = retained;
  }

  /* ---------------- 状态 ---------------- */
  function addPlayerStatus(state, key, n) {
    if (!n) return;
    const c = state.combat;
    c.statuses[key] = Math.max(0, (c.statuses[key] || 0) + n);
    if (key === 'thorns') ensureHighlights(state).maxThorns = Math.max(state.highlights.maxThorns, c.statuses[key]);
    emit({ t: 'status', target: 'player', key, amount: n, total: c.statuses[key] });
  }
  function addEnemyStatus(state, enemy, key, n) {
    if (!enemy || enemy.hp <= 0 || !n) return;
    let amount = n;
    if (key === 'poison' && n > 0) {
      if (state.characterId === 'alchemist') amount += 1;
      amount += relicPassive(state, 'poisonBonus');
    }
    enemy.statuses[key] = Math.max(0, (enemy.statuses[key] || 0) + amount);
    if (key === 'poison' || key === 'burn') {
      const field = key === 'poison' ? 'maxPoison' : 'maxBurn';
      ensureHighlights(state)[field] = Math.max(state.highlights[field], enemy.statuses[key]);
    }
    emit({ t: 'status', target: 'enemy', uid: enemy.uid, key, amount, total: enemy.statuses[key] });
  }
  function cleansePlayer(state) {
    const c = state.combat;
    ['poison', 'burn', 'weak', 'vulnerable', 'stun'].forEach(k => { c.statuses[k] = 0; });
    emit({ t: 'cleanse' });
  }

  /* ---------------- 护甲 / 伤害 ---------------- */
  function gainBlock(state, base, chainBonus) {
    const c = state.combat;
    const amount = Math.max(0, base + (c.statuses.dexterity || 0) + (chainBonus || 0) + relicPassive(state, 'blockBonus'));
    if (amount <= 0) return 0;
    c.block += amount;
    ensureHighlights(state).maxBlock = Math.max(state.highlights.maxBlock, c.block);
    emit({ t: 'block', target: 'player', amount, total: c.block });
    return amount;
  }
  function gainEnemyBlock(state, enemy, amount) {
    if (!enemy || enemy.hp <= 0 || amount <= 0) return;
    enemy.block += amount;
    emit({ t: 'block', target: 'enemy', uid: enemy.uid, amount, total: enemy.block });
  }

  function calcPlayerHit(state, base, opts) {
    const c = state.combat;
    let dmg = base;
    if (opts.strength) dmg += c.statuses.strength || 0;
    if (opts.attackDamage) dmg += relicPassive(state, 'attackDamage');
    if (opts.fireAttackDamage) dmg += relicPassive(state, 'fireAttackDamage');
    if (opts.chainBonus) dmg += opts.chainBonus;
    if (c.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    if (opts.cross) dmg = Math.floor(dmg * (1.5 + relicPassive(state, 'crossBonus')));
    if (opts.target && opts.target.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    return Math.max(0, dmg);
  }

  function blockDamageBonus(effect, block, resource) {
    if (effect.perBlock == null) return 0;
    const hot = resource >= (effect.resourceAtLeast ?? Infinity);
    const rate = hot ? (effect.hotPerBlock ?? effect.perBlock) : effect.perBlock;
    const max = hot ? (effect.hotMaxBlockBonus ?? effect.maxBlockBonus ?? Infinity) : (effect.maxBlockBonus ?? Infinity);
    return Math.min(max, Math.floor(block * rate));
  }

  function selfStatusDamageBonus(effect, statuses) {
    return effect.perSelfStatus ? (statuses[effect.perSelfStatus.status] || 0) * (effect.perSelfStatus.value || 0) : 0;
  }

  function hurtEnemy(state, enemy, base, opts) {
    opts = opts || {};
    if (!enemy || enemy.hp <= 0) return 0;
    const dmg = calcPlayerHit(state, base, Object.assign({ target: enemy }, opts));
    let blocked = 0;
    if (!opts.pierce && !opts.cross) {
      blocked = Math.min(enemy.block, dmg);
      enemy.block -= blocked;
    }
    const loss = dmg - blocked;
    const actual = Math.min(enemy.hp, loss);
    enemy.hp = Math.max(0, enemy.hp - loss);
    state.stats.damageDealt += loss;
    recordDamageHighlight(state, actual);
    emit({ t: 'damage', target: 'enemy', uid: enemy.uid, amount: dmg, blocked, hp: enemy.hp, cross: !!opts.cross,
      element: opts.element || null, source: opts.source || undefined });
    afterEnemyHpChange(state, enemy);
    return loss;
  }

  function hurtPlayer(state, base, enemy, opts) {
    opts = opts || {};
    const c = state.combat;
    let dmg = base;
    if (enemy) {
      dmg = Math.ceil(dmg * enemy.damageScale);
      dmg += enemy.statuses.strength || 0;
      if (enemy.statuses.weak > 0) dmg = Math.floor(dmg * 0.75);
    }
    if (c.statuses.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    dmg = Math.max(0, dmg);
    let blocked = 0;
    if (!opts.pierce) {
      blocked = Math.min(c.block, dmg);
      c.block -= blocked;
    }
    const loss = dmg - blocked;
    state.hp = Math.max(0, state.hp - loss);
    state.stats.damageTaken += loss;
    if (enemy && c.phase === 'enemy' && state.characterId === 'monk' && blocked > 0) {
      c.momentumBlockedThisEnemyTurn = (c.momentumBlockedThisEnemyTurn || 0) + blocked;
      c.momentumGainedThisEnemyTurn = Math.min(3, Math.floor(c.momentumBlockedThisEnemyTurn / 5));
    }
    emit({ t: 'damage', target: 'player', amount: dmg, blocked, hp: state.hp, enemy: enemy ? enemy.uid : null });
    checkEnd(state);
    return loss;
  }

  function afterEnemyHpChange(state, enemy) {
    if (!enemy) return;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      if (!enemy.deadLogged) {
        enemy.deadLogged = true;
        state.stats.kills++;
        emit({ t: 'death', target: 'enemy', uid: enemy.uid, name: enemy.name });
      }
      checkEnd(state);
      return;
    }
    const data = DATA.enemies[enemy.id];
    if (enemy.phase === 1 && data.phase2 && enemy.hp <= enemy.maxHp * data.phase2.hpPct) {
      enemy.phase = 2;
      enemy.actionsPerTurn = data.phase2.actionsPerTurn || 1;
      if (data.phase2.strength) enemy.statuses.strength = (enemy.statuses.strength || 0) + data.phase2.strength;
      enemy.patternIndex = 0;
      setEnemyIntent(state, enemy);
      emit({ t: 'phase', uid: enemy.uid, name: enemy.name, log: data.phase2.log || (enemy.name + ' 进入了第二阶段！') });
    }
  }

  function checkEnd(state) {
    const c = state.combat;
    if (!c) return null;
    if (c.phase === 'won' || c.phase === 'lost') return c.phase;
    if (state.hp <= 0) {
      state.hp = 0;
      c.phase = 'lost';
      emit({ t: 'lose' });
      return 'lost';
    }
    if (c.enemies.length && c.enemies.every(e => e.hp <= 0)) {
      c.phase = 'won';
      emit({ t: 'win' });
      return 'won';
    }
    return null;
  }

  /* ---------------- 连携 ---------------- */
  function advanceChain(state, element) {
    const c = state.combat;
    if (!element || element === 'none') {
      return { linked: false, chainBonus: 0, zhoutian: false, chain: c.chain };
    }
    const prev = c.currentElement;
    let linked = false;
    if (prev && elementData(prev).generates === element) {
      c.chain = Math.min(5, c.chain + 1);
      linked = true;
    } else {
      c.chain = 0;
    }
    c.currentElement = element;
    ensureHighlights(state).maxChain = Math.max(state.highlights.maxChain, c.chain);
    emit({ t: 'chain', chain: c.chain, linked, element, current: c.currentElement, prev });
    triggerDaoChain(state);
    if (linked) triggerRelic(state, 'chainReached', { chain: c.chain, element });
    return { linked, chainBonus: linked ? c.chain : 0, zhoutian: c.chain === 5, chain: c.chain };
  }

  function gainChain(state, amount, trigger) {
    const c = state.combat;
    c.chain = Math.min(5, Math.max(0, c.chain + amount));
    ensureHighlights(state).maxChain = Math.max(state.highlights.maxChain, c.chain);
    emit({ t: 'chain', chain: c.chain, linked: amount > 0, element: null, current: c.currentElement });
    triggerDaoChain(state);
    triggerRelic(state, 'chainReached', { chain: c.chain, element: c.currentElement });
    if (trigger && c.chain >= 5) return true;
    return false;
  }

  function triggerZhoutian(state) {
    const c = state.combat;
    if (!c || c.phase !== 'player') return;
    emit({ t: 'zhoutian', chain: c.chain });
    aliveEnemies(state).forEach(e => directEnemyDamage(state, e, 8, 'zhoutian'));
    c.energy += 1;
    emit({ t: 'energy', amount: 1, energy: c.energy });
    itemDraw(state, 1);
    c.chain = 0;
    emit({ t: 'chain', chain: 0, linked: false, element: null, current: c.currentElement, reset: true });
  }

  /* ---------------- 卡牌结算 ---------------- */
  function cardNeedsTarget(data) {
    if (!data) return false;
    return data.effects.some(e => (e.op === 'damage' && (e.target || 'enemy') === 'enemy') ||
      (e.op === 'status' && (e.target || 'enemy') === 'enemy') ||
      (e.op === 'multiplyStatus' && (e.target || 'enemy') === 'enemy') ||
      (e.op === 'detonateStatus' && e.target === 'enemy'));
  }
  function pickTarget(state, targetIndex) {
    const alive = aliveEnemies(state);
    if (targetIndex != null) {
      const byIndex = state.combat.enemies[targetIndex];
      if (byIndex && byIndex.hp > 0) return byIndex;
    }
    return alive[0] || null;
  }
  function canPlayCard(state, index) {
    const c = state.combat;
    if (!c || c.phase !== 'player') return { ok: false, reason: '现在不是你的回合' };
    const inst = c.hand[index];
    if (!inst) return { ok: false, reason: '没有这张牌' };
    const data = getCardData(inst);
    if (!data || data.unplayable || data.type === 'curse' || data.type === 'status') return { ok: false, reason: '这张牌无法打出' };
    const cost = getCardCost(state, data);
    if (cost > c.energy) return { ok: false, reason: '灵气不足' };
    if (cardNeedsTarget(data) && !firstEnemy(state)) return { ok: false, reason: '没有目标' };
    return { ok: true, cost };
  }
  function getCardCost(state, data) {
    const c = state.combat;
    let cost = data.cost;
    if (!c.firstCardUsed && relicPassive(state, 'firstCardDiscount')) cost = Math.max(0, cost - relicPassive(state, 'firstCardDiscount'));
    if (state.characterId === 'monk' && data.finisher && c.daoFinisherDiscount > 0) cost = Math.max(1, cost - c.daoFinisherDiscount);
    return cost;
  }

  function playCard(state, handIndex, targetIndex) {
    clearEvents();
    const c = state.combat;
    if (!c || c.phase !== 'player') return result(false, '现在不是你的回合');
    const inst = c.hand[handIndex];
    if (!inst) return result(false, '没有这张牌');
    const data = getCardData(inst);
    const check = canPlayCard(state, handIndex);
    if (!check.ok) return result(false, check.reason);
    const cost = check.cost;
    const target = cardNeedsTarget(data) ? pickTarget(state, targetIndex) : pickTarget(state, targetIndex);
    if (cardNeedsTarget(data) && !target) return result(false, '没有目标');
    c.hand.splice(handIndex, 1);
    c.energy -= cost;
    c.cardsPlayedThisTurn++;
    if (!c.daoTurnUsed) c.daoTurnUsed = {};
    if (c.cardsPlayedThisTurn === 4 && getDaoRank(state, 'sword_cycle') && !c.daoTurnUsed.sword_cycle) {
      c.daoTurnUsed.sword_cycle = true;
      triggerDao(state, 'sword_cycle');
      grantDaoEnergy(state);
      if (getDaoRank(state, 'sword_cycle') >= 2) itemDraw(state, 1);
    }
    if (state.characterId === 'monk' && data.finisher && c.daoFinisherDiscount > 0) c.daoFinisherDiscount = 0;
    c.resourceGainedThisCard = 0;
    state.stats.cardsPlayed++;
    const isFirstAttack = !c.firstAttackUsed && data.type === 'attack';
    if (data.type === 'attack') c.firstAttackUsed = true;
    const wasFirstCard = !c.firstCardUsed;
    c.firstCardUsed = true;
    emit({ t: 'play', uid: inst.uid, id: inst.id, name: data.name, element: data.element, cost });
    if (cost > 0) emit({ t: 'energy', amount: -cost, energy: c.energy });

    const info = advanceChain(state, data.element);
    const chainBonus = info.chainBonus;
    resolveEffects(state, data, target, chainBonus, info, target ? { ...target.statuses } : null);
    awardCharacterResourceForPlayedCard(state, data, target, info);
    delete c.resourceGainedThisCard;

    if (state.characterId === 'sword' && isFirstAttack && target && target.hp > 0 && c.phase === 'player') {
      emit({ t: 'passive', name: '剑心' });
      hurtEnemy(state, target, 4, { pierce: false });
    }
    if (info.zhoutian || c.chain >= 5) triggerZhoutian(state);

    if (data.exhaust) c.exhaustPile.push(inst);
    else c.discardPile.push(inst);

    triggerRelic(state, 'cardPlayed', { card: inst, data, firstCard: wasFirstCard, firstAttack: isFirstAttack });
    checkEnd(state);
    return result(true);
  }

  function resolveEffects(state, data, target, chainBonus, chainInfo, targetStatusesBefore) {
    const c = state.combat;
    let didDetonate = false;
    const blockBefore = c.block;
    for (const effect of (data.effects || [])) {
      if (c.phase !== 'player' && effect.op !== 'consumeResource') break;
      if (effect.cond?.detonationOccurred && !didDetonate) continue;
      if (effect.cond && !checkCond(state, effect.cond, target, chainInfo?.linked, targetStatusesBefore, blockBefore)) continue;
      switch (effect.op) {
        case 'damage': {
          const isAll = effect.target === 'all';
          const targets = isAll ? aliveEnemies(state) : (target && target.hp > 0 ? [target] : []);
          const resource = ensureCharacterResource(state)?.value || 0;
          const hits = (effect.hits || 1) + (effect.extraHitsAtResource != null && resource >= effect.extraHitsAtResource ? effect.extraHits || 0 : 0) + (chainInfo?.linked ? effect.extraHitsOnLink || 0 : 0);
          const chainExtra = chainBonus || 0;
          const resourceBonus = (effect.perResource || 0) * resource + (effect.bonusAtResource != null && resource >= effect.bonusAtResource ? effect.bonusDamage || 0 : 0);
          const cardsBonus = (effect.perCardsPlayed || 0) * Math.min(Math.max(0, c.cardsPlayedThisTurn - 1), effect.maxCardsPlayedBonus || 99);
          const blockBeforeStrike = c.block;
          const blockBonus = blockDamageBonus(effect, blockBeforeStrike, resource);
          const statusBonus = selfStatusDamageBonus(effect, c.statuses);
          let dealt = 0;
          if (effect.consumeResource) changeCharacterResource(state, -resource);
          for (const enemy of targets) {
            for (let h = 0; h < hits; h++) {
              if (enemy.hp <= 0) break;
              if (state.hp <= 0) break;
              const perHitBase = (effect.value || 0) + (effect.perChain || 0) * c.chain + resourceBonus + cardsBonus + blockBonus + statusBonus;
              const cross = isCross(data.element, enemy.element);
              const hpBeforeHit = enemy.hp;
              const hitDamage = hurtEnemy(state, enemy, perHitBase, {
                strength: data.type === 'attack',
                attackDamage: data.type === 'attack',
                fireAttackDamage: data.type === 'attack' && data.element === 'fire',
                chainBonus: chainExtra,
                pierce: !!effect.pierce || (effect.pierceAtResource != null && resource >= effect.pierceAtResource),
                cross: !!cross,
                element: data.element,
                source: effect.perBlock != null ? 'blockCashout' : undefined
              });
              dealt += Math.min(hpBeforeHit, hitDamage);
            }
          }
          if (effect.consumeBlockFraction != null) {
            const daoBlock = getDaoRank(state, 'monk_block') && daoCombatUsed(state, 'monk_block') < getDaoRank(state, 'monk_block');
            const fraction = daoBlock ? .25 : effect.consumeBlockFraction;
            const consumed = Math.min(c.block, Math.ceil(blockBeforeStrike * fraction));
            c.block -= consumed;
            if (daoBlock) { markDaoCombatUsed(state, 'monk_block'); triggerDao(state, 'monk_block'); }
            emit({ t: 'blockCashout', before: blockBeforeStrike, consumed, total: c.block, bonus: blockBonus, damage: dealt });
          }
          break;
        }
        case 'block':
          gainBlock(state, effect.value || 0, chainBonus);
          break;
        case 'draw':
          itemDraw(state, effect.value || 0);
          break;
        case 'energy':
          c.energy += effect.value || 0;
          emit({ t: 'energy', amount: effect.value || 0, energy: c.energy });
          break;
        case 'gainResource':
          changeCharacterResource(state, effect.value || 0);
          break;
        case 'consumeResource':
          changeCharacterResource(state, -(effect.value || ensureCharacterResource(state)?.value || 0));
          break;
        case 'detonateStatus':
          didDetonate = detonateStatus(state, effect, target) || didDetonate;
          break;
        case 'heal':
          healPlayer(state, effect.value || 0);
          break;
        case 'status': {
          const tgt = effect.target || 'enemy';
          if (tgt === 'self') addPlayerStatus(state, effect.status, effect.value);
          else if (tgt === 'allEnemies') aliveEnemies(state).forEach(e => addEnemyStatus(state, e, effect.status, effect.value));
          else if (target) addEnemyStatus(state, target, effect.status, effect.value);
          break;
        }
        case 'multiplyStatus':
          if (target) {
            const before = target.statuses[effect.status] || 0;
            target.statuses[effect.status] = Math.max(0, before * (effect.factor || 2));
            const gained = target.statuses[effect.status] - before;
            if (effect.status === 'poison' || effect.status === 'burn') {
              const field = effect.status === 'poison' ? 'maxPoison' : 'maxBurn';
              ensureHighlights(state)[field] = Math.max(state.highlights[field], target.statuses[effect.status]);
            }
            if (gained) emit({ t: 'status', target: 'enemy', uid: target.uid, key: effect.status, amount: gained, total: target.statuses[effect.status] });
          }
          break;
        case 'cleanse':
          cleansePlayer(state);
          break;
        case 'addCard': {
          const pile = effect.pile || 'discard';
          for (let i = 0; i < (effect.count || 1); i++) {
            const card = newCard(state, effect.cardId, false, true);
            if (pile === 'hand' && c.hand.length < 10) c.hand.push(card);
            else if (pile === 'draw') c.drawPile.push(card);
            else c.discardPile.push(card);
            emit({ t: 'addCard', cardId: effect.cardId, pile });
          }
          break;
        }
        case 'loseHp':
          directPlayerDamage(state, effect.value || 0);
          break;
        case 'gainMaxHp':
          state.maxHp += effect.value || 0;
          state.hp += effect.value || 0;
          break;
        case 'upgradeHand': {
          const pool = c.hand.filter(h => !h.up && !(getCardData(h) || {}).unplayable);
          for (let i = 0; i < (effect.count || 1) && pool.length; i++) {
            const pickCard = pool.splice(Math.floor(rand(state) * pool.length), 1)[0];
            pickCard.up = true;
            emit({ t: 'upgrade', uid: pickCard.uid, id: pickCard.id });
          }
          break;
        }
        case 'discardRandom': {
          for (let i = 0; i < (effect.value || 1) && c.hand.length; i++) {
            const idx = Math.floor(rand(state) * c.hand.length);
            c.discardPile.push(c.hand.splice(idx, 1)[0]);
          }
          break;
        }
        case 'chain': {
          const willTrigger = gainChain(state, effect.value || 0, !!effect.trigger);
          if (willTrigger) triggerZhoutian(state);
          break;
        }
        default:
          break;
      }
    }
  }

  function planRandomStatusHits(rngState, enemies, stacks, perHit) {
    if (perHit <= 0) return [];
    const remaining = new Map(enemies.filter(enemy => enemy.hp > 0).map(enemy => [enemy, enemy.hp]));
    const hits = [];
    for (let i = 0; i < stacks && remaining.size; i++) {
      const enemy = pick(rngState, [...remaining.keys()]);
      const amount = Math.min(remaining.get(enemy), perHit);
      hits.push({ enemy, amount });
      const hp = remaining.get(enemy) - amount;
      if (hp > 0) remaining.set(enemy, hp);
      else remaining.delete(enemy);
    }
    return hits;
  }

  function detonateStatus(state, effect, target) {
    const self = effect.target === 'player';
    const owner = self ? state.combat : target;
    if (!owner || (!self && owner.hp <= 0)) return false;
    const stacks = owner.statuses[effect.status] || 0;
    if (stacks <= 0) return false;
    const hot = (ensureCharacterResource(state)?.value || 0) >= (effect.resourceAtLeast ?? Infinity);
    const damagePerStack = hot ? (effect.hotDamagePerStack ?? effect.damagePerStack ?? 0) : (effect.damagePerStack || 0);
    const randomPerStack = hot ? (effect.hotRandomDamagePerStack ?? effect.randomDamagePerStack ?? 0) : (effect.randomDamagePerStack || 0);
    const allPerStack = hot ? (effect.hotDamageAllPerStack ?? effect.damageAllPerStack ?? 0) : (effect.damageAllPerStack || 0);
    const damageAll = Math.floor(stacks * allPerStack);
    const damage = target ? Math.min(target.hp, Math.floor(stacks * damagePerStack)) : 0;
    const heal = stacks * (effect.healPerStack || 0);
    const daoTag = effect.status === 'thorns' ? 'monk_thorns' : effect.status;
    const rank = getDaoRank(state, daoTag);
    const used = daoCombatUsed(state, daoTag);
    const daoActive = rank > 0 && (daoTag === 'monk_thorns' ? used < rank : used === 0);
    const poisonFraction = effect.status === 'poison' && daoActive ? (rank === 2 ? .2 : .35) : effect.consumeFraction ?? 1;
    const thornFraction = effect.status === 'thorns' && daoActive ? .25 : effect.consumeFraction ?? 1;
    let consumed = Math.min(stacks, Math.ceil(stacks * (effect.status === 'poison' ? poisonFraction : thornFraction)));
    if (effect.status === 'burn' && daoActive) consumed = stacks - Math.min(stacks, rank === 2 ? 6 : 3);
    const overheal = effect.status === 'regen' && daoActive ? Math.max(0, heal - (state.maxHp - state.hp)) : 0;
    owner.statuses[effect.status] = stacks - consumed;
    const detonationEvent = { t: 'statusDetonate', status: effect.status, target: self ? 'player' : 'enemy', uid: self ? undefined : target.uid,
      stacks, consumed, damage, damageAll, heal, hits: randomPerStack || damageAll ? 0 : (damage ? 1 : 0) };
    if (!self) emit(detonationEvent);
    emit({ t: 'status', target: self ? 'player' : 'enemy', uid: self ? undefined : target.uid,
      key: effect.status, amount: -consumed, total: owner.statuses[effect.status] });
    if (heal) healPlayer(state, heal);
    if (daoActive) {
      markDaoCombatUsed(state, daoTag);
      triggerDao(state, daoTag);
      if (effect.status === 'regen' && overheal > 0) {
        const amount = Math.min(rank === 2 ? 20 : 12, Math.floor(overheal * (rank === 2 ? 1 : .5)));
        if (amount > 0) {
          state.combat.block += amount;
          ensureHighlights(state).maxBlock = Math.max(state.highlights.maxBlock, state.combat.block);
          emit({ t: 'block', target: 'player', amount, total: state.combat.block });
        }
      }
    }
    if (self) emit(detonationEvent);
    if (damage && target) {
      state.stats.damageDealt += Math.min(target.hp, damage);
      directEnemyDamage(state, target, damage, effect.status);
    }
    if (randomPerStack) {
      for (let i = 0; i < stacks; i++) {
        const alive = aliveEnemies(state);
        if (!alive.length) break;
        const enemy = pick(state, alive);
        const amount = Math.min(enemy.hp, randomPerStack);
        detonationEvent.damage += amount;
        detonationEvent.hits++;
        state.stats.damageDealt += amount;
        directEnemyDamage(state, enemy, amount, effect.status);
      }
    }
    if (damageAll) {
      for (const enemy of aliveEnemies(state)) {
        const amount = Math.min(enemy.hp, damageAll);
        detonationEvent.damage += amount;
        detonationEvent.hits++;
        state.stats.damageDealt += amount;
        directEnemyDamage(state, enemy, amount, effect.status);
      }
    }
    return true;
  }

  function checkCond(state, cond, target, linked, targetStatusesBefore, blockBefore) {
    const c = state.combat;
    if (cond.chainAtLeast != null && c.chain < cond.chainAtLeast) return false;
    if (cond.chainBelow != null && c.chain >= cond.chainBelow) return false;
    if (cond.enemyPoisoned && (!target || !target.statuses.poison)) return false;
    if (cond.linked != null && !!linked !== cond.linked) return false;
    if (cond.resourceAtLeast != null && (c.characterResource?.value || 0) < cond.resourceAtLeast) return false;
    if (cond.resourceBelow != null && (c.characterResource?.value || 0) >= cond.resourceBelow) return false;
    if (cond.targetStatusBefore && (targetStatusesBefore?.[cond.targetStatusBefore] || 0) < (cond.targetStatusBeforeAtLeast || 1)) return false;
    if (cond.blockBeforeAtLeast != null && (blockBefore ?? c.block) < cond.blockBeforeAtLeast) return false;
    return true;
  }

  /* ---------------- 卡牌预览 ---------------- */
  function getPreview(state, handIndex, targetIndex) {
    const c = state.combat;
    if (!c) return null;
    const inst = c.hand[handIndex];
    if (!inst) return null;
    const data = getCardData(inst);
    if (!data) return null;
    const target = pickTarget(state, targetIndex);
    let chainAfter = c.chain;
    let linked = false;
    if (data.element && data.element !== 'none') {
      if (c.currentElement && elementData(c.currentElement).generates === data.element) {
        chainAfter = Math.min(5, c.chain + 1);
        linked = true;
      } else chainAfter = 0;
    }
    const chainBonus = linked ? chainAfter : 0;
    let damage = null, hits = 1, block = null, cross = false, heal = null, draw = null, poison = null;
    let detonateDamage = 0, detonateHits = 0, detonateStatusName = null;
    let blockConsumed = 0, resourceConsumed = 0, statusConsumed = 0, damageAll = 0, previewDidDetonate = false;
    let previewTargetHp = target?.hp ?? 0;
    let previewTargetBlock = target?.block ?? 0;
    for (const effect of data.effects || []) {
      if (effect.cond?.detonationOccurred && !previewDidDetonate) continue;
      if (effect.cond && !checkCond(state, effect.cond, target, linked, target?.statuses, c.block)) continue;
      if (effect.op === 'damage' && damage == null) {
        const resource = c.characterResource?.value || 0;
        let per = (effect.value || 0) + (effect.perChain || 0) * chainAfter +
          (effect.perResource || 0) * resource +
          (effect.bonusAtResource != null && resource >= effect.bonusAtResource ? effect.bonusDamage || 0 : 0) +
          (effect.perCardsPlayed || 0) * Math.min(c.cardsPlayedThisTurn, effect.maxCardsPlayedBonus || 99) +
          blockDamageBonus(effect, c.block, resource) + selfStatusDamageBonus(effect, c.statuses);
        const tgt = effect.target === 'all' ? target : target;
        if (tgt) cross = isCross(data.element, tgt.element);
        per = calcPlayerHit(state, per, {
          strength: data.type === 'attack',
          attackDamage: data.type === 'attack',
          fireAttackDamage: data.type === 'attack' && data.element === 'fire',
          chainBonus,
          cross,
          target: tgt
        });
        damage = per;
        if (effect.consumeBlockFraction != null) {
          const daoBlock = getDaoRank(state, 'monk_block') && daoCombatUsed(state, 'monk_block') < getDaoRank(state, 'monk_block');
          blockConsumed = Math.min(c.block, Math.ceil(c.block * (daoBlock ? .25 : effect.consumeBlockFraction)));
        }
        if (effect.consumeResource) resourceConsumed = resource;
        hits = (effect.hits || 1) + (effect.extraHitsAtResource != null && resource >= effect.extraHitsAtResource ? effect.extraHits || 0 : 0) + (linked ? effect.extraHitsOnLink || 0 : 0);
        if (target && effect.target !== 'all') {
          const pierce = !!effect.pierce || (effect.pierceAtResource != null && resource >= effect.pierceAtResource);
          for (let i = 0; i < hits && previewTargetHp > 0; i++) {
            const blocked = pierce || cross ? 0 : Math.min(previewTargetBlock, per);
            previewTargetBlock -= blocked;
            previewTargetHp = Math.max(0, previewTargetHp - (per - blocked));
          }
        }
      }
      if (effect.op === 'block' && block == null) block = (effect.value || 0) + (c.statuses.dexterity || 0) + chainBonus + relicPassive(state, 'blockBonus');
      if (effect.op === 'heal') heal = effect.value || 0;
      if (effect.op === 'draw') draw = effect.value || 0;
      if (effect.op === 'status' && effect.status === 'poison') poison = effect.value || 0;
      if (effect.op === 'detonateStatus') {
        const owner = effect.target === 'player' ? c : target;
        const stacks = effect.target === 'player' || previewTargetHp > 0 ? (owner?.statuses[effect.status] || 0) : 0;
        const hot = (c.characterResource?.value || 0) >= (effect.resourceAtLeast ?? Infinity);
        const per = hot ? (effect.hotDamagePerStack ?? effect.damagePerStack ?? 0) : (effect.damagePerStack || 0);
        const random = hot ? (effect.hotRandomDamagePerStack ?? effect.randomDamagePerStack ?? 0) : (effect.randomDamagePerStack || 0);
        const allPer = hot ? (effect.hotDamageAllPerStack ?? effect.damageAllPerStack ?? 0) : (effect.damageAllPerStack || 0);
        const randomHits = random ? planRandomStatusHits({ rng: state.rng }, c.enemies, stacks, random) : [];
        damageAll = Math.floor(stacks * allPer);
        const allDamage = damageAll ? c.enemies.filter(enemy => enemy.hp > 0).reduce((sum, enemy) => sum + Math.min(enemy.hp, damageAll), 0) : 0;
        detonateDamage = Math.min(previewTargetHp, Math.floor(stacks * per)) + randomHits.reduce((total, hit) => total + hit.amount, 0) + allDamage;
        detonateHits = random ? randomHits.length : damageAll ? c.enemies.filter(enemy => enemy.hp > 0).length : detonateDamage ? 1 : 0;
        detonateStatusName = effect.status;
        const daoTag = effect.status === 'thorns' ? 'monk_thorns' : effect.status;
        const rank = getDaoRank(state, daoTag);
        const used = daoCombatUsed(state, daoTag);
        const active = rank > 0 && (daoTag === 'monk_thorns' ? used < rank : used === 0);
        const fraction = active && effect.status === 'poison' ? (rank === 2 ? .2 : .35) :
          active && effect.status === 'thorns' ? .25 : effect.consumeFraction ?? 1;
        statusConsumed = active && effect.status === 'burn' ? stacks - Math.min(stacks, rank === 2 ? 6 : 3) :
          Math.min(stacks, Math.ceil(stacks * fraction));
        previewDidDetonate = stacks > 0;
        heal = (heal || 0) + stacks * (effect.healPerStack || 0);
        if (active && effect.status === 'regen') {
          const overheal = Math.max(0, stacks * (effect.healPerStack || 0) - (state.maxHp - state.hp));
          block = (block || 0) + Math.min(rank === 2 ? 20 : 12, Math.floor(overheal * (rank === 2 ? 1 : .5)));
        }
      }
      if (effect.op === 'consumeResource') resourceConsumed = Math.min(c.characterResource?.value || 0, effect.value || c.characterResource?.value || 0);
    }
    return { damage, hits, block, cross, heal, draw, poison, detonateDamage, detonateHits,
      detonateStatus: detonateStatusName, damageAll, blockConsumed, resourceConsumed, statusConsumed,
      chainAfter, linked, cost: getCardCost(state, data) };
  }

  /* ---------------- 敌人意图 / 行动 ---------------- */
  function getEnemyIntent(state, enemy) {
    if (!enemy) return null;
    const data = DATA.enemies[enemy.id];
    const move = data.moves[enemy.intent];
    if (!move) return { label: '未知', icon: '？', damage: 0, hits: 1 };
    let damage = 0;
    let hits = move.hits || 1;
    if (move.damage) {
      damage = Math.ceil(move.damage * enemy.damageScale) + (enemy.statuses.strength || 0);
      if (enemy.statuses.weak > 0) damage = Math.floor(damage * 0.75);
      damage = Math.max(0, damage);
    }
    const icons = [];
    if (damage) icons.push('刃');
    if (move.block) icons.push('防');
    if (move.debuffs) icons.push('咒');
    if (move.buffs) icons.push('法');
    if (move.addCards) icons.push('祟');
    if (move.heal) icons.push('愈');
    if (enemy.statuses.stun > 0) icons.push('定');
    const label = damage ? ('攻击 ' + damage + (hits > 1 ? '×' + hits : '')) : (move.block ? '防御 ' + move.block : (move.name || '行动'));
    return {
      name: move.name,
      label,
      icon: icons[0] || '？',
      icons,
      damage, hits,
      block: move.block || 0,
      debuffs: move.debuffs || [],
      buffs: move.buffs || [],
      addCards: move.addCards || [],
      heal: move.heal || 0,
      intent: enemy.intent,
      stunned: enemy.statuses.stun > 0
    };
  }

  function performEnemyMove(state, enemy) {
    const c = state.combat;
    if (!enemy || enemy.hp <= 0 || c.phase !== 'enemy') return;
    const data = DATA.enemies[enemy.id];
    const move = data.moves[enemy.intent];
    if (!move) { advanceEnemyIntent(state, enemy); return; }
    emit({ t: 'enemyMove', uid: enemy.uid, name: enemy.name, move: move.name, intent: enemy.intent });
    if (move.damage) {
      const hits = move.hits || 1;
      for (let h = 0; h < hits; h++) {
        if (state.hp <= 0 || enemy.hp <= 0) break;
        hurtPlayer(state, move.damage, enemy, { pierce: !!move.pierce });
        if (state.hp > 0 && c.statuses.thorns > 0 && enemy.hp > 0) {
          directEnemyDamage(state, enemy, c.statuses.thorns, 'thorns');
        }
      }
    }
    if (move.block) gainEnemyBlock(state, enemy, move.block);
    if (move.heal) {
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + move.heal);
      if (enemy.hp !== before) emit({ t: 'heal', target: 'enemy', uid: enemy.uid, amount: enemy.hp - before });
    }
    (move.debuffs || []).forEach(st => addPlayerStatus(state, st.status, st.value));
    (move.buffs || []).forEach(st => {
      enemy.statuses[st.status] = (enemy.statuses[st.status] || 0) + st.value;
      emit({ t: 'status', target: 'enemy', uid: enemy.uid, key: st.status, amount: st.value, total: enemy.statuses[st.status] });
    });
    (move.addCards || []).forEach(add => {
      for (let i = 0; i < (add.count || 1); i++) {
        const card = newCard(state, add.id, false, true);
        c.discardPile.push(card);
        emit({ t: 'addCard', cardId: add.id, pile: 'discard', byEnemy: enemy.uid });
      }
    });
    if (move.log) emit({ t: 'log', text: move.log });
  }

  function tickStartStatuses(state, entity, isPlayer) {
    if (entity.statuses.poison > 0) {
      const n = entity.statuses.poison;
      entity.statuses.poison = Math.max(0, n - 1);
      if (isPlayer) directPlayerDamage(state, n);
      else {
        directEnemyDamage(state, entity, n, 'poison');
        emit({ t: 'status', target: 'enemy', uid: entity.uid, key: 'poison', amount: -1, total: entity.statuses.poison });
      }
    }
    if (entity.statuses.ritual > 0) {
      entity.statuses.strength = (entity.statuses.strength || 0) + entity.statuses.ritual;
      emit({ t: 'status', target: isPlayer ? 'player' : 'enemy', uid: entity.uid, key: 'strength', amount: entity.statuses.ritual, total: entity.statuses.strength });
    }
  }

  function tickEndStatuses(state, entity, isPlayer) {
    if (entity.statuses.burn > 0) {
      const n = entity.statuses.burn;
      entity.statuses.burn = Math.max(0, n - 1);
      if (isPlayer) directPlayerDamage(state, n);
      else {
        directEnemyDamage(state, entity, n, 'burn');
        emit({ t: 'status', target: 'enemy', uid: entity.uid, key: 'burn', amount: -1, total: entity.statuses.burn });
      }
    }
    if (entity.statuses.regen > 0) {
      const n = entity.statuses.regen;
      entity.statuses.regen = Math.max(0, n - 1);
      if (isPlayer) healPlayer(state, n);
      else {
        entity.hp = Math.min(entity.maxHp, entity.hp + n);
        emit({ t: 'heal', target: 'enemy', uid: entity.uid, amount: n });
      }
    }
    if (entity.statuses.weak > 0) entity.statuses.weak--;
    if (entity.statuses.vulnerable > 0) entity.statuses.vulnerable--;
  }

  function endPlayerTurn(state) {
    clearEvents();
    const c = state.combat;
    if (!c || c.phase !== 'player') return result(false, '现在不是你的回合');
    // 诅咒牌：回合结束伤害
    c.hand.forEach(inst => {
      const data = getCardData(inst);
      if (data && data.curseEffect === 'endTurnDamage') directPlayerDamage(state, data.curseValue || 2);
    });
    if (state.hp > 0) tickEndStatuses(state, { statuses: c.statuses }, true);
    if (state.hp > 0) discardHand(state, true);
    if (state.hp > 0) c.phase = 'enemy';
    emit({ t: 'endTurn' });
    return result(state.hp > 0);
  }

  function runEnemyTurn(state) {
    clearEvents();
    const c = state.combat;
    if (!c || c.phase !== 'enemy') return result(false, '现在不是敌人回合');
    c.momentumBlockedThisEnemyTurn = 0;
    c.momentumGainedThisEnemyTurn = 0;
    for (const enemy of c.enemies) {
      if (c.phase === 'lost' || c.phase === 'won') break;
      if (enemy.hp <= 0) continue;
      enemy.block = 0;
      tickStartStatuses(state, enemy, false);
      if (c.phase === 'lost' || c.phase === 'won') break;
      if (enemy.statuses.stun > 0) {
        enemy.statuses.stun--;
        emit({ t: 'stunned', uid: enemy.uid, name: enemy.name });
        advanceEnemyIntent(state, enemy);
      } else {
        let actions = enemy.actionsPerTurn;
        for (let a = 0; a < actions; a++) {
          if (c.phase !== 'enemy' || enemy.hp <= 0) break;
          performEnemyMove(state, enemy);
          advanceEnemyIntent(state, enemy);
          if (state.hp <= 0) break;
        }
      }
      tickEndStatuses(state, enemy, false);
      if (enemy.hp > 0 && enemy.rotateElement) {
        const order = DATA.elementOrder;
        const idx = order.indexOf(enemy.element);
        enemy.element = idx < 0 ? order[0] : order[(idx + 1) % order.length];
        emit({ t: 'elementShift', uid: enemy.uid, element: enemy.element, name: enemy.name });
      }
    }
    if (state.characterId === 'monk' && c.momentumBlockedThisEnemyTurn > 0) {
      const potential = c.phase === 'enemy' ? c.momentumGainedThisEnemyTurn : 0;
      const generated = potential ? changeCharacterResource(state, potential) : 0;
      emit({ t: 'momentumSummary', blocked: c.momentumBlockedThisEnemyTurn,
        generated, wasted: potential - generated, potential });
    }
    if (c.phase === 'enemy') {
      if (state.hp <= 0) { c.phase = 'lost'; emit({ t: 'lose' }); }
      else if (c.enemies.every(e => e.hp <= 0)) { c.phase = 'won'; emit({ t: 'win' }); }
      else beginNextTurn(state);
    }
    return result(true);
  }

  function beginNextTurn(state) {
    const c = state.combat;
    c.phase = 'player';
    c.turn++;
    ensureHighlights(state).turnDamage = 0;
    c.block = state.characterId === 'monk' ? Math.min(c.block, 4) : 0;
    c.energy = maxEnergy(state);
    c.firstAttackUsed = false;
    c.firstCardUsed = false;
    c.cardsPlayedThisTurn = 0;
    c.daoTurnUsed = {};
    emit({ t: 'turnStart', turn: c.turn, block: c.block });
    tickStartStatuses(state, { statuses: c.statuses }, true);
    if (state.hp <= 0) { c.phase = 'lost'; return; }
    triggerRelic(state, 'turnStart');
    itemDraw(state, 5 + relicPassive(state, 'extraDraw') - relicPassive(state, 'drawPenalty'));
    // 起始诅咒
    c.hand.forEach(inst => {
      const data = getCardData(inst);
      if (data && data.curseEffect === 'turnStartDamage') directPlayerDamage(state, data.curseValue || 3);
    });
    checkEnd(state);
  }

  /* ---------------- 丹药 ---------------- */
  function usePotion(state, index, targetIndex) {
    clearEvents();
    const c = state.combat;
    if (!c || c.phase !== 'player') return result(false, '现在不能使用丹药');
    const potionId = state.potions[index];
    const potion = DATA.potionMap[potionId];
    if (!potion) return result(false, '没有这瓶丹药');
    const target = pickTarget(state, targetIndex);
    if (potion.target === 'enemy' && !target) return result(false, '没有目标');
    state.potions.splice(index, 1);
    emit({ t: 'potion', id: potionId, name: potion.name });
    resolveEffects(state, { element: 'none', type: 'potion', effects: potion.effects }, target, 0);
    checkEnd(state);
    return result(true);
  }

  /* ---------------- 战斗结束 / 奖励 ---------------- */
  function finishCombat(state) {
    clearEvents();
    const c = state.combat;
    if (!c || c.phase !== 'won') return result(false, '战斗尚未结束');
    const type = c.encounterType;
    // 收集牌组
    const all = [].concat(c.drawPile, c.hand, c.discardPile, c.exhaustPile);
    state.deck = all.filter(card => !card.temp);
    triggerRelic(state, 'combatEnd');
    const act = state.map ? state.map.act : 1;
    let gold = 0;
    let rarityBoost = 0;
    let guaranteedRelic = false;
    let potionChance = 0.25;
    if (type === 'boss') {
      gold = randInt(state, 85, 110) + act * 8;
      guaranteedRelic = true;
      rarityBoost = 2;
      potionChance = 1;
      if (act === 3) state.victory = true;
    } else if (type === 'elite') {
      gold = randInt(state, 30, 45) + act * 4 + relicPassive(state, 'eliteGold');
      guaranteedRelic = true;
      rarityBoost = 1;
      potionChance = 0.5;
    } else {
      gold = randInt(state, 12, 20) + act * 2;
    }
    gold = Math.max(1, Math.floor(gold * (1 - 0.02 * state.ascension)));
    state.gold += gold;
    emit({ t: 'gold', amount: gold, gold: state.gold });
    const cards = rollCardChoices(state, 3, rarityBoost, type === 'boss');
    let potionId = null;
    let potionFull = false;
    if (rand(state) < potionChance) {
      if (state.potions.length < 3) potionId = pick(state, DATA.potions).id;
      else { potionFull = true; gold += 20; state.gold += 20; emit({ t: 'gold', amount: 20, gold: state.gold }); }
    }
    let relicId = null;
    if (guaranteedRelic) relicId = randomRelicId(state);
    if (relicId) {
      state.relics.push(relicId);
      const api = makeRelicApi(state);
      const relic = DATA.relicMap[relicId];
      if (relic.hooks && relic.hooks.pickup) relic.hooks.pickup(state, api);
      emit({ t: 'relic', id: relicId });
    }
    if (potionId) state.potions.push(potionId);
    state.reward = {
      kind: type,
      gold,
      cards,
      relicId,
      potionId,
      cardTaken: false,
      selected: -1,
      potionFull
    };
    state.screen = 'reward';
    state.combat = null;
    return result(true);
  }

  function randomRelicId(state, rarity) {
    const owned = new Set(state.relics);
    let pool = DATA.relics.filter(r => r.rarity !== 'starter' && !owned.has(r.id));
    if (rarity) {
      const filtered = pool.filter(r => r.rarity === rarity);
      if (filtered.length) pool = filtered;
    }
    if (!pool.length) return null;
    return pool[Math.floor(rand(state) * pool.length)].id;
  }

  function cardRewardPool(state, rarity, element) {
    return DATA.cards.filter(c => {
      if (!['common', 'uncommon', 'rare'].includes(c.rarity)) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (element && c.element !== element) return false;
      if (c.character && c.character !== state.characterId) return false;
      return true;
    });
  }

  function getCardRewardWeight(state, card) {
    const base = card.character === state.characterId ? (getCharacter(state).resource ? 3 * 1.3 : 3) : 1;
    if (!card.tags?.length) return base;
    const buildTags = getCharacter(state).buildTags || [];
    const candidateTags = card.tags.filter(tag => buildTags.includes(tag));
    if (!candidateTags.length) return base;
    const tagCounts = {};
    for (const instance of state.deck) {
      const cardData = DATA.cardMap[instance.id];
      if (cardData?.rarity === 'starter') continue;
      for (const tag of cardData?.tags || []) if (buildTags.includes(tag)) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const strongest = Math.max(0, ...candidateTags.map(tag => tagCounts[tag] || 0));
    return base * (strongest >= 4 ? 1.4 : strongest >= 2 ? 1.25 : 1);
  }

  function rollCardChoices(state, count, rarityBoost, guaranteeRare) {
    const boost = rarityBoost || 0;
    const weights = boost >= 2 ? { common: 22, uncommon: 40, rare: 38 } : boost === 1 ? { common: 40, uncommon: 40, rare: 20 } : { common: 60, uncommon: 30, rare: 10 };
    const chosen = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let pool = cardRewardPool(state).filter(c => !used.has(c.id));
      if (!pool.length) break;
      const rarity = weighted(state, ['common', 'uncommon', 'rare'], r => weights[r]);
      let rarityPool = pool.filter(c => c.rarity === rarity);
      if (!rarityPool.length) rarityPool = pool;
      const card = weighted(state, rarityPool, c => getCardRewardWeight(state, c));
      used.add(card.id);
      chosen.push(newCard(state, card.id, false, false));
    }
    if (guaranteeRare && chosen.length && !chosen.some(c => DATA.cardMap[c.id].rarity === 'rare')) {
      const rarePool = cardRewardPool(state, 'rare').filter(c => !used.has(c.id));
      if (rarePool.length) {
        const rare = weighted(state, rarePool, c => getCardRewardWeight(state, c));
        chosen[0] = newCard(state, rare.id, false, false);
      }
    }
    return chosen;
  }

  function addCardToDeck(state, cardId, upgraded) {
    const inst = newCard(state, cardId, !!upgraded, false);
    state.deck.push(inst);
    return inst;
  }

  function takeRewardCard(state, index) {
    clearEvents();
    const r = state.reward;
    if (!r || r.cardTaken) return result(false, '已经选择过了');
    if (index >= 0 && r.cards[index]) {
      addCardToDeck(state, r.cards[index].id, r.cards[index].up);
      r.cardTaken = true;
      r.selected = index;
      emit({ t: 'addCard', cardId: r.cards[index].id, pile: 'deck' });
    } else {
      r.cardTaken = true;
      r.selected = -1;
    }
    return result(true);
  }

  function skipReward(state) {
    clearEvents();
    if (!state.reward) return result(false, '没有奖励');
    state.reward.cardTaken = true;
    state.reward.selected = -1;
    return result(true);
  }

  function continueReward(state) {
    clearEvents();
    const r = state.reward;
    if (!r) return result(false, '没有奖励');
    if (!r.cardTaken) { r.cardTaken = true; r.selected = -1; }
    const kind = r.kind;
    state.reward = null;
    state.combat = null;
    // 清除本场临时牌
    state.deck = state.deck.filter(card => !card.temp);
    if (kind === 'boss') {
      if (state.act >= 3) {
        state.screen = 'victory';
      } else {
        prepareDaoChoice(state);
      }
    } else {
      state.screen = 'map';
    }
    return result(true);
  }

  function nextAct(state) {
    state.act++;
    if (state.act > 3) { state.screen = 'victory'; return; }
    state.recentEncounters = [];
    state.hp = Math.min(state.maxHp, state.hp + Math.ceil(state.maxHp * 0.25));
    state.screen = 'map';
    state.combat = null;
    state.reward = null;
    generateMap(state, state.act);
  }

  /* ---------------- 遗物 ---------------- */
  function triggerRelic(state, hook, payload) {
    const api = makeRelicApi(state);
    state.relics.slice().forEach(id => {
      const relic = DATA.relicMap[id];
      if (relic && relic.hooks && typeof relic.hooks[hook] === 'function') {
        try { relic.hooks[hook](state, api, payload || {}); } catch (err) { /* 单件遗物异常不影响整局 */ }
      }
    });
  }
  function makeRelicApi(state) {
    const c = state.combat;
    return {
      heal(n) { healPlayer(state, n); },
      block(n) {
        if (!state.combat) return;
        const amount = n + relicPassive(state, 'blockBonus');
        state.combat.block += amount;
        ensureHighlights(state).maxBlock = Math.max(state.highlights.maxBlock, state.combat.block);
        emit({ t: 'block', target: 'player', amount, total: state.combat.block, relic: true });
      },
      status(target, key, n) { if (target === 'player' && state.combat) addPlayerStatus(state, key, n); },
      energy(n) { if (state.combat) { state.combat.energy += n; emit({ t: 'energy', amount: n, energy: state.combat.energy }); } },
      draw(n) { if (state.combat) itemDraw(state, n); },
      addCardToHand(id) { if (state.combat) { state.combat.hand.push(newCard(state, id, false, true)); emit({ t: 'addCard', cardId: id, pile: 'hand' }); } },
      log(text) { emit({ t: 'log', text }); },
      first(key) {
        if (!c) return false;
        if (c.relicUsed[key]) return false;
        c.relicUsed[key] = true;
        return true;
      },
      randomElement() { return pick(state, DATA.elementOrder); },
      setChain(amount, element) {
        if (!c) return;
        c.chain = Math.max(0, Math.min(5, amount));
        ensureHighlights(state).maxChain = Math.max(state.highlights.maxChain, c.chain);
        if (element) c.currentElement = element;
        emit({ t: 'chain', chain: c.chain, linked: true, element, current: c.currentElement });
      },
      maxHp(n) { state.maxHp += n; state.hp += n; },
      gold(n) { gainGold(state, n); }
    };
  }

  /* ---------------- 商店 / 休整 / 宝箱 ---------------- */
  function shopDiscount(state) { return 1 - relicPassive(state, 'shopDiscount'); }
  function generateShop(state) {
    clearEvents();
    const act = state.map ? state.map.act : 1;
    const stock = { cards: [], relics: [], potions: [], removePrice: 75 + act * 5, removeUsed: false };
    const ids = new Set();
    for (let i = 0; i < 3; i++) {
      let pool = cardRewardPool(state).filter(c => !ids.has(c.id));
      if (!pool.length) pool = cardRewardPool(state);
      const rarity = weighted(state, ['common', 'uncommon', 'rare'], r => r === 'common' ? 58 : r === 'uncommon' ? 32 : 10);
      let rp = pool.filter(c => c.rarity === rarity);
      if (!rp.length) rp = pool;
      const card = rp[Math.floor(rand(state) * rp.length)];
      ids.add(card.id);
      const base = card.rarity === 'common' ? 45 : card.rarity === 'uncommon' ? 62 : 80;
      stock.cards.push({ card: newCard(state, card.id, false, false), price: Math.max(20, Math.floor((base + (act - 1) * 4) * shopDiscount(state))), sold: false });
    }
    const owned = new Set(state.relics);
    const relicPool = DATA.relics.filter(r => r.rarity !== 'starter' && !owned.has(r.id));
    shuffle(state, relicPool);
    relicPool.slice(0, 2).forEach(r => {
      const base = r.rarity === 'common' ? 135 : r.rarity === 'uncommon' ? 165 : 195;
      stock.relics.push({ id: r.id, price: Math.floor(base * shopDiscount(state)), sold: false });
    });
    const potionPool = shuffle(state, DATA.potions.slice());
    potionPool.slice(0, 3).forEach(p => {
      stock.potions.push({ id: p.id, price: Math.floor(52 * shopDiscount(state)), sold: false });
    });
    state.shop = stock;
    state.screen = 'shop';
    return stock;
  }

  function buyItem(state, kind, index) {
    clearEvents();
    const shop = state.shop;
    if (!shop) return result(false, '不在商店');
    if (kind === 'remove') return result(false, '请选择要移除的牌');
    const entry = kind === 'card' ? shop.cards[index] : kind === 'relic' ? shop.relics[index] : shop.potions[index];
    if (!entry || entry.sold) return result(false, '已经售出');
    if (state.gold < entry.price) return result(false, '金币不足');
    if (kind === 'potion' && state.potions.length >= 3) return result(false, '丹药腰带已满');
    state.gold -= entry.price;
    entry.sold = true;
    if (kind === 'card') addCardToDeck(state, entry.card.id, entry.card.up);
    else if (kind === 'relic') {
      state.relics.push(entry.id);
      const api = makeRelicApi(state);
      const relic = DATA.relicMap[entry.id];
      if (relic.hooks && relic.hooks.pickup) relic.hooks.pickup(state, api);
      emit({ t: 'relic', id: entry.id });
    } else state.potions.push(entry.id);
    emit({ t: 'buy', kind, price: entry.price, gold: state.gold });
    return result(true);
  }

  function removeCardFromDeck(state, uid, free) {
    clearEvents();
    const idx = state.deck.findIndex(c => c.uid === uid);
    if (idx < 0) return result(false, '牌组中没有这张牌');
    if (state.deck.length <= 1) return result(false, '牌组不能少于一张牌');
    const shop = state.shop;
    if (!free) {
      if (!shop || shop.removeUsed) return result(false, '本店已使用过移除服务');
      if (state.gold < shop.removePrice) return result(false, '金币不足');
      state.gold -= shop.removePrice;
      shop.removeUsed = true;
    }
    const [card] = state.deck.splice(idx, 1);
    emit({ t: 'removeCard', id: card.id });
    return result(true);
  }

  function restHeal(state) {
    clearEvents();
    if (state.screen !== 'rest') return result(false, '不在休整点');
    healPlayer(state, Math.ceil(state.maxHp * 0.3));
    state.screen = 'map';
    emit({ t: 'rest', kind: 'heal' });
    return result(true);
  }

  function restUpgrade(state, uid) {
    clearEvents();
    if (state.screen !== 'rest') return result(false, '不在休整点');
    const inst = state.deck.find(c => c.uid === uid);
    if (!inst) return result(false, '没有这张牌');
    const data = getCardData(inst);
    if (inst.up || !data.up) return result(false, '这张牌无法升级');
    inst.up = true;
    state.screen = 'map';
    emit({ t: 'upgrade', uid, id: inst.id });
    return result(true);
  }

  function enterTreasure(state) {
    clearEvents();
    const gold = randInt(state, DATA.treasure.gold[0], DATA.treasure.gold[1]) + (state.map ? state.map.act * 4 : 0);
    gainGold(state, gold);
    let relicId = null;
    if (rand(state) < DATA.treasure.relicChance) {
      relicId = randomRelicId(state);
      if (relicId) {
        state.relics.push(relicId);
        const api = makeRelicApi(state);
        const relic = DATA.relicMap[relicId];
        if (relic.hooks && relic.hooks.pickup) relic.hooks.pickup(state, api);
      }
    }
    let potionId = null;
    if (rand(state) < DATA.treasure.potionChance && state.potions.length < 3) {
      potionId = pick(state, DATA.potions).id;
      state.potions.push(potionId);
    }
    state.treasure = { gold, relicId, potionId };
    state.screen = 'treasure';
    emit({ t: 'treasure', gold, relicId, potionId });
    return result(true);
  }
  function continueTreasure(state) {
    state.treasure = null;
    state.screen = 'map';
    return result(true);
  }

  /* ---------------- 事件 ---------------- */
  function enterEvent(state) {
    const act = state.map ? state.map.act : 1;
    let pool = DATA.events.filter(e => (!e.acts || e.acts.includes(act)) && !state.usedEvents.includes(e.id));
    if (!pool.length) pool = DATA.events.filter(e => !e.acts || e.acts.includes(act));
    if (!pool.length) pool = DATA.events;
    const ev = pool[Math.floor(rand(state) * pool.length)];
    state.usedEvents.push(ev.id);
    state.event = { id: ev.id, resolved: false, resultText: '' };
    state.screen = 'event';
  }

  function applyEventChoice(state, choiceIndex) {
    clearEvents();
    if (!state.event || state.event.resolved) return result(false, '事件已结束');
    const evData = DATA.events.find(e => e.id === state.event.id);
    const ev = evData;
    const choice = ev && ev.choices[choiceIndex];
    if (!choice) return result(false, '没有这个选项');
    if (choice.require && choice.require.gold && state.gold < choice.require.gold) return result(false, '金币不足');
    const notes = [];
    applyEventEffects(state, choice.effects || [], notes);
    let text = choice.result || '';
    if (notes.length) text += ' ' + notes.join(' ');
    state.event.resolved = true;
    state.event.resultText = text;
    state.event.choice = choiceIndex;
    state.screen = 'event';
    return result(true);
  }

  function applyEventEffects(state, effects, notes) {
    effects.forEach(effect => {
      switch (effect.op) {
        case 'heal':
          healPlayer(state, effect.value || 0);
          break;
        case 'healPct':
          healPlayer(state, Math.ceil(state.maxHp * ((effect.value || 0) / 100)));
          break;
        case 'damage':
          state.hp = Math.max(1, state.hp - (effect.value || 0));
          notes.push('你失去了 ' + (effect.value || 0) + ' 点生命，但还撑得住。');
          break;
        case 'gold':
          gainGold(state, effect.value || 0);
          break;
        case 'maxHp':
          state.maxHp += effect.value || 0;
          state.hp += effect.value || 0;
          break;
        case 'addRandomRelic': {
          const id = randomRelicId(state, effect.rarity);
          if (id) {
            state.relics.push(id);
            const api = makeRelicApi(state);
            const relic = DATA.relicMap[id];
            if (relic.hooks && relic.hooks.pickup) relic.hooks.pickup(state, api);
            notes.push('获得遗物：' + DATA.relicMap[id].name + '。');
          }
          break;
        }
        case 'addRandomCard': {
          const rarity = effect.rarity || null;
          let pool = cardRewardPool(state, rarity, effect.element);
          if (!pool.length) pool = cardRewardPool(state);
          if (pool.length) {
            const card = pool[Math.floor(rand(state) * pool.length)];
            addCardToDeck(state, card.id, false);
            notes.push('获得卡牌：' + card.name + '。');
          }
          break;
        }
        case 'addPotion': {
          if (state.potions.length < 3) {
            const p = pick(state, DATA.potions);
            state.potions.push(p.id);
            notes.push('获得丹药：' + p.name + '。');
          } else {
            gainGold(state, 25);
            notes.push('丹药腰带已满，换得 25 金币。');
          }
          break;
        }
        case 'curse': {
          const id = pick(state, CURSE_IDS);
          addCardToDeck(state, id, false);
          notes.push('获得诅咒：' + DATA.cardMap[id].name + '。');
          break;
        }
        case 'removeRandomCard': {
          const candidates = state.deck.map((c, i) => ({ c, i })).filter(x => DATA.cardMap[x.c.id].type !== 'curse');
          const idx = candidates.length ? candidates[Math.floor(rand(state) * candidates.length)].i : -1;
          if (idx >= 0 && state.deck.length > 1) {
            const [removed] = state.deck.splice(idx, 1);
            notes.push('移除了：' + DATA.cardMap[removed.id].name + '。');
          }
          break;
        }
        case 'upgradeRandomCards': {
          const count = effect.count || 1;
          let pool = state.deck.filter(c => !c.up && DATA.cardMap[c.id].up);
          for (let i = 0; i < count && pool.length; i++) {
            const idx = Math.floor(rand(state) * pool.length);
            const inst = pool.splice(idx, 1)[0];
            inst.up = true;
            notes.push('升级了：' + DATA.cardMap[inst.id].name + '。');
          }
          break;
        }
        case 'random': {
          const outcome = weighted(state, effect.outcomes, o => o.weight || 1);
          notes.push(outcome.text);
          applyEventEffects(state, outcome.effects || [], notes);
          break;
        }
        default:
          break;
      }
    });
  }

  function continueEvent(state) {
    state.event = null;
    state.screen = 'map';
    return result(true);
  }
  function leaveShop(state) {
    state.shop = null;
    state.screen = 'map';
    return result(true);
  }
  function leaveTreasure(state) { return continueTreasure(state); }

  /* ---------------- 存档 ---------------- */
  function serialize(state) {
    const copy = Object.assign({}, state, { startedAt: state.startedAt });
    return JSON.stringify(copy);
  }
  function deserialize(json) {
    try {
      const state = JSON.parse(json);
      if (!state || state.version !== VERSION) return null;
      if (!state.characterId || !state.deck || !state.map) return null;
      if (typeof state.nextUid !== 'number') state.nextUid = 100000;
      if (!Array.isArray(state.recentEncounters)) state.recentEncounters = [];
      const legacyTotalDamage = state.highlights?.totalDamage == null;
      ensureHighlights(state);
      if (legacyTotalDamage) state.highlights.totalDamage = Math.max(0, Number(state.stats?.damageDealt) || 0);
      ensureBuildMilestones(state);
      ensureDao(state);
      if (state.combat) {
        ensureCharacterResource(state);
        if (!state.combat.daoUsed) state.combat.daoUsed = {};
        if (!state.combat.daoTurnUsed) state.combat.daoTurnUsed = {};
        if (!Number.isFinite(state.combat.daoFinisherDiscount)) state.combat.daoFinisherDiscount = 0;
      }
      return state;
    } catch (err) { return null; }
  }

  function getRunSummary(state) {
    const identity = getBuildIdentity(state);
    return {
      character: getCharacter(state).name,
      act: state.act,
      floor: state.stats.floors,
      kills: state.stats.kills,
      gold: state.gold,
      hp: state.hp,
      maxHp: state.maxHp,
      deckSize: state.deck.length,
      ascension: state.ascension,
      victory: !!state.victory,
      build: identity,
      title: identity.level >= 2 ? BUILD_TITLES[identity.tag] : '五行行者',
      highlights: { ...ensureHighlights(state) },
      relicCount: state.relics.length,
      combats: state.highlights.combats,
      damageDealt: ensureHighlights(state).totalDamage,
      deck: state.deck.map(card => ({ id: card.id, up: !!card.up }))
    };
  }

  /* ---------------- 导出 ---------------- */
  return {
    VERSION,
    ACT_NAMES,
    NODE_META,
    ROUTE_META,
    RARITY_NAME,
    createRun,
    generateMap,
    getMapRouteProfile,
    getMapTypeWeights,
    validateMap,
    nodeById,
    availableNodes,
    currentNode,
    enterNode,
    getEncounterStageByFloor,
    adjustedEncounterWeight,
    pickEncounter,
    getActName,
    getNodeMeta,
    startCombat,
    playCard,
    canPlayCard,
    getCardCost,
    getPreview,
    endPlayerTurn,
    runEnemyTurn,
    usePotion,
    finishCombat,
    rollCardChoices,
    getCardRewardWeight,
    addCardToDeck,
    takeRewardCard,
    skipReward,
    continueReward,
    ensureDao,
    getDaoRank,
    getDaoBlessing,
    getDaoChoices,
    chooseDaoBlessing,
    continueDao,
    nextAct,
    generateShop,
    buyItem,
    removeCardFromDeck,
    restHeal,
    restUpgrade,
    enterTreasure,
    continueTreasure,
    leaveTreasure,
    enterEvent,
    applyEventChoice,
    continueEvent,
    leaveShop,
    getEnemyIntent,
    getCardData,
    getCharacter,
    getBuildIdentity,
    elementData,
    isCross,
    emptyStatuses,
    serialize,
    deserialize,
    getRunSummary,
    // 只读辅助
    aliveEnemies,
    firstEnemy,
    enemyById,
    maxEnergy,
    relicPassive,
    cardNeedsTarget,
    pickTarget,
    startPlayerTurnForTest: function (state) { beginNextTurn(state); }
  };
});
