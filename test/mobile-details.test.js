const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function makeUI(width = 393, effects = null) {
  const listeners = {};
  const window = { WX_DATA: D, WXEngine: E, WXEffects: effects, innerWidth: width, innerHeight: 852, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const document = { getElementById: () => ({ addEventListener() {} }), querySelector: () => null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8'), { window, document, clearTimeout() {}, setTimeout(fn) { fn(); return 1; } });
  const ui = window.WX_UI;
  ui._testWindow = window;
  ui._testDocument = document;
  ui._testListeners = listeners;
  ui.render = () => {};
  ui.sfx = () => {};
  ui.toast = () => {};
  ui.meta = { seenCards: [], seenRelics: [], seenEnemies: [] };
  ui.app = { saveRun() {}, saveMeta() {} };
  ui.overlay = null;
  ui.detail = null;
  ui.screen = 'combat';
  ui.state = E.createRun({ characterId: 'sword', seed: 42 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.potions = ['heal'];
  return ui;
}

test('天机乍现手机页提供两件完整说明，选定后可继续且不可改选', async () => {
  const ui = makeUI(393);
  ui.state.fate.triggered = true;
  ui.state.fate.pending = { choices: ['fate_sword_box', 'fate_creation_jade'], selected: null };
  ui.screen = ui.state.screen = 'fate';
  let html = ui.fateHTML();
  for (const label of ['天机乍现', '无名剑匣', '造化玉牒', '应此天命']) assert.match(html, new RegExp(label));
  assert.equal((html.match(/data-action="choose-fate"/g) || []).length, 2);
  await ui.chooseFate('fate_sword_box');
  html = ui.fateHTML();
  assert.match(html, /天命已定 · 无名剑匣/);
  assert.match(html, /继续问道/);
  assert.equal(ui.state.fate.itemId, 'fate_sword_box');
  assert.equal(E.chooseFate(ui.state, 'fate_creation_jade').ok, false);
  ui.continueFate();
  assert.equal(ui.state.screen, 'map');
});

test('天命显示于战斗、地图、证道录与独立图鉴，未发现效果隐藏', () => {
  const ui = makeUI(393);
  ui.state.fate.itemId = 'fate_sword_box';
  ui.state.relics.push('fate_sword_box');
  assert.match(ui.combatHTML(), /data-action="view-fate"/);
  assert.match(ui.mapHTML(), /data-action="view-fate"/);
  assert.match(ui.hudHTML(), /遗物 1/);
  ui.overlay = 'fate';
  assert.match(ui.overlayHTML(), /每场战斗第一次打出终结牌后/);
  ui.overlay = 'relics';
  assert.match(ui.overlayHTML(), /天命/);
  assert.match(ui.endHTML(true), /天命 · 无名剑匣/);
  ui.compTab = 'fate';
  let html = ui.compendiumHTML();
  assert.match(html, /天机未显/);
  assert.doesNotMatch(html, /每场战斗第一次打出终结牌后/);
  ui.meta.seenRelics.push('fate_sword_box');
  html = ui.compendiumHTML();
  assert.match(html, /无名剑匣/);
  assert.match(html, /每场战斗第一次打出终结牌后/);
});

test('定道和悟道页展示三种道印、契合与深悟兼修，选择后保留继续入口', async () => {
  const ui = makeUI(393);
  ui.state.reward = { kind: 'boss', cards: [], cardTaken: true, selected: -1 };
  E.continueReward(ui.state);
  ui.screen = 'dao';
  let html = ui.daoHTML();
  for (const name of ['定道', '剑心通明', '云行无迹', '金水交鸣', '未得', '一重']) assert.match(html, new RegExp(name));
  assert.equal((html.match(/data-action="choose-dao"/g) || []).length, 3);
  await ui.chooseDao('sword_intent');
  assert.match(ui.daoHTML(), /踏入下一幕/);
  const chosenCard = ui.daoHTML().match(/<button[^>]*class="dao-card chosen[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(chosenCard, /每场第一次剑意满时，抽 1 张牌。/);
  assert.doesNotMatch(chosenCard, /抽 1 张牌并获得 1 点灵气/);
  assert.match(chosenCard, /已铭刻 · 一重/);
  assert.doesNotMatch(chosenCard, /未得 <em>→<\/em> 一重/);
  ui.banner = () => {};
  ui.continueDao();
  ui.state.reward = { kind: 'boss', cards: [], cardTaken: true, selected: -1 };
  E.continueReward(ui.state);
  ui.screen = 'dao';
  for (let i = 0; i < 4; i++) E.addCardToDeck(ui.state, 'ning_feng');
  html = ui.daoHTML();
  for (const name of ['悟道', '一重', '二重', '深悟', '兼修', '当前道途']) assert.match(html, new RegExp(name));
});

test('道印在战斗、地图和证道录可见，移动端可点开完整规则', async () => {
  const ui = makeUI(393);
  ui.state.dao.blessings.sword_intent = 1;
  ui.state.dao.blessings.sword_chain = 1;
  assert.match(ui.combatHTML(), /道印 ×2/);
  assert.match(ui.combatHTML(), /data-action="view-dao"/);
  assert.match(ui.mapHTML(), /剑心通明/);
  assert.match(ui.endHTML(true), /金水交鸣Ⅰ/);
  ui.overlay = 'dao';
  assert.match(ui.overlayHTML(), /每场第一次剑意满时/);
  const shown = [];
  ui.floatAt = (_el, message) => shown.push(message);
  await ui.fx([{ t: 'daoTrigger', name: '剑心通明' }]);
  assert.deepEqual(shown, ['剑心通明']);
});

test('一力破天折扣在手牌与出牌确认详情中一致，即使当前灵气不足', () => {
  const ui = makeUI(393);
  ui.state = E.createRun({ characterId: 'monk', seed: 42 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.dao.blessings.monk_ritual = 2;
  ui.state.combat.daoFinisherDiscount = 2;
  ui.state.combat.energy = 0;
  ui.state.combat.hand = [{ uid: 'finisher', id: 'beng_tian_shi', up: false }];
  assert.match(ui.combatHTML(), /card-cost discounted">1</);
  ui.detail = { kind: 'card', id: 'beng_tian_shi', up: false, action: 'play-card', index: 0, uid: 'finisher' };
  assert.match(ui.detailHTML(), /灵气 1/);
});

test('道途大成时觉醒提示显示实际境界', async () => {
  const ui = makeUI();
  const shown = [];
  ui.floatAt = (_element, message) => shown.push(message);
  await ui.fx([{ t: 'buildAwakened', name: '藏锋', levelName: '大成' }]);
  assert.deepEqual(shown, ['藏锋大成']);
});

test('出牌前复制卡牌，视觉失败也会完成规则结算并解除忙碌状态', async () => {
  const order = [];
  const effects = {
    captureCard(card) { order.push('capture'); assert.ok(card); return { ghost: { remove() {} } }; },
    async playCardFlight() { order.push('flight'); throw new Error('animation unavailable'); },
    clear() { order.push('clear'); }
  };
  const ui = makeUI(393, effects);
  ui._testDocument.querySelector = selector => selector.includes('.hand .card') ? { classList: { add() {} }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } : null;
  ui.fx = async () => { order.push('events'); };
  ui.commit = () => { order.push('commit'); };
  ui.checkCombatState = () => {};
  const before = ui.state.combat.hand.length;
  await ui.playCard(0, 0);
  assert.equal(order[0], 'capture');
  assert.ok(order.includes('flight'));
  assert.ok(order.includes('events'));
  assert.ok(order.includes('commit'));
  assert.equal(ui.busy, false);
  assert.equal(ui.state.combat.hand.length, before - 1);
});

test('剑修面板显示剑意，终结牌结算时调用专属演出', async () => {
  const order = [];
  const effects = {
    captureCard() { return null; },
    async playCardFlight(options) { order.push(['flight', options.finisher]); },
    async finisher() { order.push(['finisher']); }
  };
  const ui = makeUI(393, effects);
  ui.state.combat.hand = [{ uid: 'finish', id: 'yi_jian_kai_tian', up: false }];
  ui.state.combat.energy = 2;
  ui.state.combat.characterResource.value = 8;
  ui.state.combat.enemies[0].hp = ui.state.combat.enemies[0].maxHp = 999;
  ui.state.combat.firstAttackUsed = true;
  assert.match(ui.combatHTML(), /剑意 8\/10/);
  ui.fx = async () => { order.push(['events']); };
  ui.commit = () => {};
  ui.checkCombatState = () => {};
  await ui.playCard(0, 0);
  assert.deepEqual(order, [['flight', true], ['finisher'], ['events']]);
});

test('终结演出与伤害反馈在飞牌结束前并行启动', async () => {
  const started = [];
  let finishFlight, finishFinisher, finishEvents;
  const effects = {
    captureCard() { return null; },
    playCardFlight() { started.push('flight'); return new Promise(resolve => { finishFlight = resolve; }); },
    finisher() { started.push('finisher'); return new Promise(resolve => { finishFinisher = resolve; }); }
  };
  const ui = makeUI(393, effects);
  ui.state.combat.hand = [{ uid: 'finish', id: 'yi_jian_kai_tian', up: false }];
  ui.state.combat.energy = 2;
  ui.state.combat.enemies[0].hp = ui.state.combat.enemies[0].maxHp = 999;
  ui.fx = () => { started.push('events'); return new Promise(resolve => { finishEvents = resolve; }); };
  ui.commit = () => {};
  ui.checkCombatState = () => {};
  const play = ui.playCard(0, 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['flight', 'finisher', 'events']);
  assert.equal(ui.busy, true);
  finishFlight();
  finishFinisher();
  finishEvents();
  await play;
  assert.equal(ui.busy, false);
});

test('剑修奖励在手机和桌面标明构筑方向', () => {
  const ui = makeUI(393);
  ui.state.reward = { kind: 'combat', gold: 10, cards: [
    { uid: 'a', id: 'ning_feng', up: false },
    { uid: 'b', id: 'xing_yun_jue', up: false },
    { uid: 'c', id: 'jin_shui_yin', up: false }
  ], cardTaken: false, selected: -1 };
  for (const [width, marker] of [[393, 'reward-option-meta'], [1280, 'card-build-tags']]) {
    ui._testWindow.innerWidth = width;
    const html = ui.rewardHTML();
    assert.match(html, new RegExp(marker));
    for (const name of ['剑意', '流云', '金水']) assert.match(html, new RegExp(name));
  }
});

test('丹修显示八格炉火并预览热炉状态爆发及构筑方向', () => {
  const ui = makeUI(393);
  ui.state = E.createRun({ characterId: 'alchemist', seed: 42 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.characterResource.value = 4;
  ui.state.combat.enemies[0].statuses.poison = 20;
  ui.state.combat.hand = [{ uid: 'burst', id: 'bai_du_gui_yuan', up: false }];
  const combat = ui.combatHTML();
  assert.match(combat, /resource-furnaceFire/);
  assert.match(combat, /炉火 4\/8/);
  assert.match(combat, /毒爆 30/);
  ui.state.reward = { kind: 'combat', gold: 10, cards: [
    { uid: 'a', id: 'shi_gu_dan', up: false },
    { uid: 'b', id: 'cui_huo_jue', up: false },
    { uid: 'c', id: 'yang_yuan_dan', up: false }
  ], cardTaken: false, selected: -1 };
  const reward = ui.rewardHTML();
  for (const name of ['万毒', '焚炉', '生生']) assert.match(reward, new RegExp(name));
});

test('体修十格战势与三种兑现预览显示消耗和构筑方向', () => {
  const ui = makeUI(393);
  ui.state = E.createRun({ characterId: 'monk', seed: 42 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const c = ui.state.combat;
  c.enemies[0].hp = c.enemies[0].maxHp = 999;
  c.enemies[0].element = 'fire';
  c.characterResource.value = 8;
  c.block = 40;
  c.hand = [{ uid: 'han', id: 'han_shan_shi', up: false }];
  const combat = ui.combatHTML();
  assert.match(combat, /resource-battleMomentum/);
  assert.match(combat, /战势 8\/10/);
  assert.match(combat, /36 伤/);
  assert.match(combat, /耗甲 20/);
  assert.match(combat, /耗战势 4/);
  c.statuses.thorns = 8;
  c.hand = [{ uid: 'nu', id: 'jin_gang_zhen_nu', up: false }];
  assert.match(ui.combatHTML(), /每敌 32/);
  assert.match(ui.combatHTML(), /耗荆棘 4/);
  c.statuses.strength = 6;
  c.hand = [{ uid: 'beng', id: 'beng_tian_shi', up: false }];
  assert.match(ui.combatHTML(), /60 伤/);
  assert.match(ui.combatHTML(), /耗战势 8/);
  ui.state.reward = { kind: 'combat', gold: 10, cards: [
    { uid: 'a', id: 'zhen_yue_zhuang', up: false },
    { uid: 'b', id: 'jie_li_fan_zhen', up: false },
    { uid: 'c', id: 'bao_yuan_shou_yi', up: false }
  ], cardTaken: false, selected: -1 };
  const reward = ui.rewardHTML();
  for (const name of ['镇岳', '金刚', '蓄势']) assert.match(reward, new RegExp(name));
});

test('选角页突出三种爽点，只有选中角色展示循环示意', () => {
  const ui = makeUI(1280);
  ui.selectedChar = 'sword';
  const html = ui.selectHTML();
  for (const phrase of ['快、连、爆', '养、叠、炸', '扛、蓄、崩', '核心体验']) assert.match(html, new RegExp(phrase));
  assert.equal((html.match(/promise-active/g) || []).length, 1);
  assert.match(html, /剑意 10/);
  assert.match(html, /一剑开天/);
});

test('战斗道途与成型视觉按牌组、资源和状态变化，未成型时无持续特效', () => {
  const ui = makeUI();
  assert.match(ui.combatHTML(), /道途未定/);
  assert.doesNotMatch(ui.combatHTML(), /path-sword-intent/);
  for (let i = 0; i < 4; i++) E.addCardToDeck(ui.state, 'ning_feng');
  ui.state.combat.characterResource.value = 10;
  const html = ui.combatHTML();
  assert.match(html, /道途 · 藏锋 · 成势/);
  assert.match(html, /path-sword-intent/);
  assert.match(html, /resource-full/);
});

test('通关证道录显示称号、道途、最终牌组及高光，并提供再入轮回', () => {
  const ui = makeUI(393);
  for (let i = 0; i < 4; i++) E.addCardToDeck(ui.state, 'ning_feng');
  ui.state.highlights.maxSingleHit = 78;
  ui.state.highlights.maxTurnDamage = 92;
  ui.state.highlights.maxResource = 10;
  const html = ui.endHTML(true);
  for (const phrase of ['证 道', '一剑开天', '藏锋 · 成势', '最终牌组', '凝锋诀', '最高单击', '92', '再入轮回']) assert.match(html, new RegExp(phrase));
  assert.match(html, /data-action="victory-new"/);
  assert.doesNotMatch(ui.endHTML(false), /证 道/);
});

test('角色图鉴直接展示三位修士立绘，且保持可点开的角色入口', () => {
  const ui = makeUI();
  ui.compTab = 'characters';
  const html = ui.compendiumHTML();
  assert.equal((html.match(/class="comp-character-portrait"/g) || []).length, 3);
  for (const id of ['sword', 'alchemist', 'monk']) {
    assert.match(html, new RegExp(`assets/characters/${id}\\.webp`));
    assert.match(html, new RegExp(`data-action="inspect-character" data-char="${id}"`));
  }
});

test('战斗怪物立绘有独立呼吸层，受击单位仍独立存在', () => {
  const ui = makeUI();
  const html = ui.enemyHTML(ui.state.combat.enemies[0], 0, 0);
  assert.match(html, /class="enemy-unit [^"]*focused[^"]*"/);
  assert.match(html, /class="enemy-art-motion"/);
  assert.match(html, /class="enemy-art-figure"/);
});

test('六名精英与幕主显示独立战场、紧凑机制和真实强化意图', () => {
  const ui = makeUI(393);
  for (const [id, arena, name] of [
    ['jin_jia_shi_jiang', 'corpse', '尸煞'], ['shi_ling_teng_mu', 'vines', '寄生'],
    ['xuan_shui_jiao_wang', 'tide', '潮位'], ['shan_gui', 'mountain', '山势'],
    ['chi_ba', 'inferno', '焚势'], ['tai_xu', 'void', '破阵']
  ]) {
    E.startCombat(ui.state, { enemies: [{ id }] }, D.enemies[id].boss ? 'boss' : 'elite');
    ui.screen = ui.state.screen = 'combat';
    const enemy = ui.state.combat.enemies[0];
    assert.match(ui.combatHTML(), new RegExp(`arena-${arena}`));
    assert.match(ui.enemyHTML(enemy, 0, 0), new RegExp(name));
    ui.detail = { kind: 'enemy', id, index: 0 };
    assert.match(ui.detailHTML(), new RegExp(D.enemies[id].mechanic.hint));
  }
  const taiXu = ui.state.combat.enemies[0];
  taiXu.element = 'metal';
  taiXu.special.arrayBreak = 2;
  const html = ui.enemyHTML(taiXu, 0, 0);
  assert.match(html, /破阵 2\/3/);
  assert.match(html, /金 → 水/);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.doesNotMatch(ui.combatHTML(), /arena-/);
  assert.doesNotMatch(ui.enemyHTML(ui.state.combat.enemies[0], 0, 0), /enemy-mechanic/);
});

test('太虚第三次克制攻击在手牌和确认页显示破阵额外伤害', () => {
  const ui = makeUI(393);
  E.startCombat(ui.state, { enemies: [{ id: 'tai_xu' }] }, 'boss');
  const enemy = ui.state.combat.enemies[0];
  enemy.element = 'wood';
  enemy.special.arrayBreak = 2;
  enemy.block = 20;
  ui.state.combat.hand = [{ uid: 'break-hit', id: 'jin_ren', up: false }];
  ui.targetIndex = 0;
  assert.match(ui.combatHTML(), /五行崩解 12 穿甲/);
  assert.match(ui.combatHTML(), /清除护甲 20/);
  ui.detail = { kind: 'card', id: 'jin_ren', index: 0, up: false, action: 'play-card', uid: 'break-hit' };
  assert.match(ui.detailHTML(), /五行崩解 12 穿甲/);
  assert.match(ui.detailHTML(), /清除护甲 20/);
  assert.match(ui.detailHTML(), /定身 1/);
});

test('强化处决、潮位深渊和强制天火在意图中说明触发原因', () => {
  const ui = makeUI(393);
  for (const [id, key, value, intent, label] of [
    ['jin_jia_shi_jiang', 'corpseEnergy', 2, 'execute', '尸煞强化'],
    ['xuan_shui_jiao_wang', 'tide', 2, 'abyss', '潮位2'],
    ['chi_ba', 'firePressure', 3, 'fentian', '焚势爆发'],
    ['shan_gui', 'mountainMight', 2, 'collapse', '山势强化']
  ]) {
    E.startCombat(ui.state, { enemies: [{ id }] }, D.enemies[id].boss ? 'boss' : 'elite');
    const enemy = ui.state.combat.enemies[0];
    enemy.special[key] = value;
    enemy.intent = intent;
    assert.match(ui.enemyHTML(enemy, 0, 0), new RegExp(label));
  }
});

test('地图起点说明三种路线，旧存档缺少路线字段仍可显示', () => {
  const ui = makeUI(390);
  ui.state.combat = null;
  ui.state.screen = 'map';
  let html = ui.mapHTML();
  assert.match(html, /稳途/);
  assert.match(html, /机缘/);
  assert.match(html, /险途/);
  assert.match(html, /data-route="safe"/);
  assert.match(html, /路线倾向：稳健/);
  for (const node of ui.state.map.nodes) delete node.route;
  ui.state = E.deserialize(E.serialize(ui.state));
  html = ui.mapHTML();
  assert.match(html, /map-canvas/);
  assert.doesNotMatch(html, /route-start-label/);
});

function setReward(ui) {
  ui.state.reward = {
    kind: 'combat', gold: 10,
    cards: ['shui_yue', 'xin_jian', 'wan_mu'].map((id, i) => ({ uid: 900 + i, id, up: false })),
    relicId: null, potionId: null, cardTaken: false, selected: -1
  };
  ui.state.combat = null;
  ui.screen = 'reward';
}

test('手机手牌先显示完整说明，确认前不出牌', () => {
  const ui = makeUI();
  let played = 0;
  ui.playCard = () => { played++; };
  ui.action('play-card', { dataset: { index: '0' } });
  assert.equal(played, 0);
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /确认出牌/);
  assert.match(ui.overlayHTML(), /card-detail-text/);
});

test('手机丹药先显示效果，确认后才使用', () => {
  const ui = makeUI();
  let used = 0;
  ui.usePotion = () => { used++; };
  ui.action('use-potion', { dataset: { index: '0' } });
  assert.equal(used, 0);
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /回复 15 点生命/);
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(used, 1);
});

test('玩法说明解释调息与条件回灵', () => {
  const ui = makeUI();
  ui.overlay = 'help';
  const html = ui.overlayHTML();
  assert.match(html, /调息/);
  assert.match(html, /连携达到 2/);
  assert.match(html, /聚气丹炉/);
});

test('战后奖励先显示完整卡牌属性，取消不领取，确认后领取', () => {
  const ui = makeUI();
  const card = { uid: 999, id: 'jin_ren', up: false };
  ui.state.reward = { kind: 'combat', gold: 10, cards: [card], relicId: null, potionId: null, cardTaken: false, selected: -1 };
  ui.state.combat = null;
  ui.screen = 'reward';
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('take-card', { dataset: { index: '0' } });
  assert.equal(taken, 0);
  assert.match(ui.overlayHTML(), /造成 6 点伤害/);
  ui.action('close-overlay', { dataset: {} });
  assert.equal(taken, 0);
  ui.action('take-card', { dataset: { index: '0' } });
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(taken, 1);
});

test('手机奖励纵向展示三张牌的完整效果和属性，桌面保留原卡牌布局', () => {
  const mobile = makeUI();
  setReward(mobile);
  const html = mobile.rewardHTML();
  const text = html.replace(/<[^>]*>/g, '');
  assert.equal((html.match(/class="reward-option /g) || []).length, 3);
  for (const inst of mobile.state.reward.cards) {
    const card = E.getCardData(inst);
    assert.ok(text.includes(card.text), `${card.name} 的完整效果应直接可见`);
    assert.ok(text.includes(card.name));
  }
  assert.match(html, /data-action="take-card" data-index="0"/);
  assert.doesNotMatch(html, /class="card el-/);

  const desktop = makeUI(1280);
  setReward(desktop);
  assert.match(desktop.rewardHTML(), /class="card el-/);
});

test('奖励页跨手机宽度时重排，旧手机按钮仍要求确认', () => {
  const ui = makeUI();
  setReward(ui);
  assert.match(ui.rewardHTML(), /data-confirm="1"/);
  let renders = 0;
  ui.render = () => { renders++; };
  ui.resizeBackground = () => {};
  ui.bind();
  ui._testWindow.innerWidth = 800;
  ui._testListeners.resize();
  assert.equal(renders, 1);
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('take-card', { dataset: { index: '0', confirm: '1' } });
  assert.equal(taken, 0);
  assert.equal(ui.overlay, 'detail');
});

test('图鉴有角色与丹药入口，敌人和遗物可点开说明', () => {
  const ui = makeUI();
  ui.screen = 'compendium';
  ui.meta.seenRelics = [D.relics.find(r => r.rarity !== 'starter').id];
  ui.meta.seenEnemies = ['shan_xiao'];
  const tabs = ui.compendiumHTML();
  assert.match(tabs, /data-tab="characters"/);
  assert.match(tabs, /data-tab="potions"/);
  ui.compTab = 'enemies';
  assert.match(ui.compendiumHTML(), /data-action="inspect-enemy"/);
  ui.compTab = 'relics';
  assert.match(ui.compendiumHTML(), /data-action="inspect-relic"/);
});

test('三幕怪物立绘在战斗、已解锁图鉴和详情中显示，未解锁图鉴隐藏立绘', () => {
  const ui = makeUI();
  const expected = new Map();
  for (const [act, pool] of Object.entries(D.encounters)) {
    const normal = Array.isArray(pool.normal) ? pool.normal : Object.values(pool.normal).flat();
    for (const encounter of [...normal, ...pool.elite, pool.boss]) {
      for (const enemy of encounter.enemies) expected.set(enemy.id, `assets/monsters/${String(act).padStart(2, '0')}/${enemy.id}.webp`);
    }
  }
  assert.equal(expected.size, Object.keys(D.enemies).length);
  for (const [id, art] of expected) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', art)), `${id} 的图片文件缺失`);
    E.startCombat(ui.state, { enemies: [{ id }] }, 'combat');
    assert.ok(ui.enemyHTML(ui.state.combat.enemies[0], 0, 0).includes(`src="${art}"`), `${id} 战斗立绘缺失`);
    ui.detail = { kind: 'enemy', id };
    assert.ok(ui.detailHTML().includes(`src="${art}"`), `${id} 详情立绘缺失`);
  }
  ui.screen = 'compendium';
  ui.compTab = 'enemies';
  ui.meta.seenEnemies = ['shan_xiao'];
  const compendium = ui.compendiumHTML();
  assert.match(compendium, /src="assets\/monsters\/01\/shan_xiao.webp"/);
  assert.doesNotMatch(compendium, /src="assets\/monsters\/03\/tai_xu.webp"/);
  assert.match(compendium, /未识之敌/);
});

test('怪物无护甲与状态时不预留空状态栏，受状态影响时仍显示层数', () => {
  const ui = makeUI();
  const enemy = ui.state.combat.enemies[0];
  assert.doesNotMatch(ui.enemyHTML(enemy, 0, 0), /class="enemy-sub"/);
  enemy.statuses.weak = 2;
  assert.match(ui.enemyHTML(enemy, 0, 0), /class="enemy-sub"[\s\S]*虚弱 2 层/);
});

test('敌人详情显示招式附加的业障，关闭卡牌详情返回原面板', () => {
  const ui = makeUI();
  ui.action('inspect-enemy', { dataset: { id: 'chi_ba' } });
  assert.match(ui.overlayHTML(), /播火/);
  assert.match(ui.overlayHTML(), /塞入 2 张火种/);
  ui.overlay = 'deck';
  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '0' } });
  ui.action('close-overlay', { dataset: {} });
  assert.equal(ui.overlay, 'deck');
});

test('战斗状态可点开查看当前层数与完整效果', () => {
  const ui = makeUI();
  ui.state.combat.statuses.poison = 2;
  ui.state.combat.enemies[0].statuses.weak = 1;
  const html = ui.combatHTML();
  assert.match(html, /data-action="inspect-status" data-status="poison" data-owner="player"/);
  assert.match(html, /data-action="inspect-status" data-status="weak" data-owner="enemy" data-index="0"/);

  ui.action('inspect-status', { dataset: { status: 'poison', owner: 'player' } });
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /当前 2 层/);
  assert.match(ui.overlayHTML(), /回合开始时失去等同层数的生命/);
  ui.state.combat.statuses.poison = 0;
  assert.match(ui.overlayHTML(), /当前 2 层/);
  ui.action('close-overlay', { dataset: {} });

  ui.action('inspect-status', { dataset: { status: 'weak', owner: 'enemy', index: '0' } });
  assert.match(ui.overlayHTML(), /当前 1 层/);
  assert.match(ui.overlayHTML(), /造成的攻击伤害降低 25%/);
});

test('卡牌详情展示升级前后效果，已升级牌也能回看原效果', () => {
  const ui = makeUI();
  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '0' } });
  const base = ui.overlayHTML();
  assert.match(base, /升级前/);
  assert.match(base, /造成 6 点伤害/);
  assert.match(base, /升级后/);
  assert.match(base, /造成 9 点伤害/);
  assert.match(base, /灵气 1/);
  ui.action('close-overlay', { dataset: {} });

  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '1' } });
  const upgraded = ui.overlayHTML();
  assert.match(upgraded, /已悟/);
  assert.match(upgraded, /升级前/);
  assert.match(upgraded, /造成 6 点伤害/);

  ui.action('inspect-card', { dataset: { id: 'xin_mo', up: '0' } });
  assert.doesNotMatch(ui.overlayHTML(), /升级后/);
});

test('五行详情圆徽章只显示单字，完整行名保留在提示中', () => {
  const ui = makeUI();
  for (const id of D.elementOrder) {
    const card = D.cards.find(c => c.element === id);
    ui.action('inspect-card', { dataset: { id: card.id, up: '0' } });
    const badge = ui.overlayHTML().match(/<span class="elem-badge"[^>]*>[^<]*<\/span>/)?.[0] || '';
    assert.match(badge, new RegExp(`title="${D.elements[id].name}行"`));
    assert.match(badge, new RegExp(`>${D.elements[id].glyph}<\\/span>$`));
    ui.action('close-overlay', { dataset: {} });
  }
  ui.action('inspect-character', { dataset: { char: 'monk' } });
  assert.match(ui.overlayHTML(), /title="土行"[^>]*>土<\/span>/);
  ui.action('close-overlay', { dataset: {} });
  ui.action('inspect-enemy', { dataset: { id: 'shan_xiao', index: '0' } });
  assert.match(ui.overlayHTML(), /title="土行"[^>]*>土<\/span>/);
});

test('调息升级预览明确说明移除消耗', () => {
  const ui = makeUI();
  ui.action('inspect-card', { dataset: { id: 'tiao_xi', up: '0' } });
  const text = ui.overlayHTML().replace(/<[^>]*>/g, '');
  assert.match(text, /升级后/);
  assert.match(text, /不再消耗/);
});

test('角色选择与详情使用各自的符纹肖像', () => {
  const ui = makeUI(1280);
  const select = ui.selectHTML();
  for (const id of ['sword', 'alchemist', 'monk']) {
    assert.match(select, new RegExp(`char-sigil sigil-${id}`));
    ui.action('inspect-character', { dataset: { char: id } });
    assert.match(ui.overlayHTML(), new RegExp(`entity-hero entity-hero-${id}`));
    ui.action('close-overlay', { dataset: {} });
  }
});

test('手机选角优先展示已选角色立绘，并可切换到其他角色', () => {
  const ui = makeUI(393);
  ui.screen = 'select';
  ui.ascension = 0;
  ui.meta.maxAscension = 0;
  const initial = ui.selectHTML();
  assert.match(initial, /assets\/characters\/sword\.webp/);
  assert.match(initial, /assets\/characters\/alchemist\.webp/);
  assert.match(initial, /assets\/characters\/monk\.webp/);
  assert.ok(initial.indexOf('data-char="sword"') < initial.indexOf('data-char="alchemist"'));
  ui.action('select-char', { dataset: { char: 'monk' } });
  const changed = ui.selectHTML();
  assert.ok(changed.indexOf('data-char="monk"') < changed.indexOf('data-char="sword"'));
  assert.match(changed, /char-card selected[^>]*data-char="monk"/);
  assert.match(changed, /char-card selected[^>]*aria-pressed="true"/);
  assert.match(changed, /踏入此道 · 体修/);
  let rerenders = 0;
  ui.render = () => { rerenders++; };
  ui.resizeBackground = () => {};
  ui.bind();
  ui._testWindow.innerWidth = 1280;
  ui._testListeners.resize();
  ui._testWindow.innerWidth = 393;
  ui._testListeners.resize();
  assert.equal(rerenders, 2);
  assert.ok(ui.selectHTML().indexOf('data-char="monk"') < ui.selectHTML().indexOf('data-char="sword"'));
});

test('遗物与丹药在图鉴和详情中使用可识别的器物造型', () => {
  const ui = makeUI();
  ui.screen = 'compendium';
  ui.compTab = 'potions';
  const potions = ui.compendiumHTML();
  assert.equal((potions.match(/potion-vessel/g) || []).length, D.potions.length);
  ui.action('inspect-potion', { dataset: { id: 'energy' } });
  assert.match(ui.overlayHTML(), /potion-showcase/);
  assert.match(ui.overlayHTML(), /potion-vessel/);
  ui.action('close-overlay', { dataset: {} });

  ui.action('inspect-relic', { dataset: { id: 'ju_qi_lu' } });
  assert.match(ui.overlayHTML(), /relic-showcase/);
  assert.match(ui.overlayHTML(), /relic-emblem/);
});

test('特殊卡和诅咒有独立图案，动效尊重减少动态效果设置', () => {
  const ui = makeUI();
  ui.state.combat.hand = [
    { uid: 'special-a', id: 'jian_yi', up: false },
    { uid: 'special-b', id: 'huo_zhong', up: false },
    { uid: 'curse-a', id: 'xin_mo', up: false }
  ];
  const hand = ui.combatHTML();
  assert.match(hand, /card-id-jian-yi/);
  assert.match(hand, /motif-jian-yi/);
  assert.match(hand, /card-id-huo-zhong/);
  assert.match(hand, /motif-huo-zhong/);
  assert.match(hand, /card-curse/);
  ui.meta.seenCards.push('jian_yi', 'huo_zhong');
  ui.compTab = 'cards';
  const compendium = ui.compendiumHTML();
  assert.match(compendium, /card-id-jian-yi/);
  assert.match(compendium, /card-id-huo-zhong/);
  assert.match(compendium, new RegExp(`已识 \\d+ / ${D.cards.length}`));
  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('桌面休整参悟先预览差异，确认后才升级', () => {
  const ui = makeUI(1280);
  ui.state.screen = 'rest';
  ui.screen = 'rest';
  ui.picker = { mode: 'upgrade-rest', title: '选择一张牌参悟' };
  const inst = ui.state.deck.find(c => c.id === 'jin_ren');
  let upgrades = 0;
  ui.pickCard = () => { upgrades++; };
  ui.action('pick-card', { dataset: { uid: inst.uid } });
  assert.equal(upgrades, 0);
  assert.match(ui.overlayHTML(), /造成 9 点伤害/);
  assert.match(ui.overlayHTML(), /确认参悟/);
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(upgrades, 1);
});

test('桌面奖励可单独查看升级差异，手牌提示也包含升级效果', () => {
  const ui = makeUI(1280);
  setReward(ui);
  const reward = ui.rewardHTML();
  assert.match(reward, /data-action="inspect-card" data-id="shui_yue"/);
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('inspect-card', { dataset: { id: 'shui_yue', up: '0' } });
  assert.equal(taken, 0);
  assert.match(ui.overlayHTML(), /升级后/);

  ui.action('close-overlay', { dataset: {} });
  ui.screen = 'combat';
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = [{ uid: 'hand-jin', id: 'jin_ren', up: false }];
  assert.match(ui.combatHTML(), /升级后（灵气 1）/);
});

test('五行卡牌使用各自纹样和边框色，升级牌有明确印记', () => {
  const ui = makeUI();
  ui.meta.seenCards = ['chan_si', 'chi_yan', 'yan_quan', 'jin_ren', 'liu_yun'];
  ui.screen = 'compendium';
  ui.compTab = 'cards';
  const html = ui.compendiumHTML();
  for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) {
    assert.match(html, new RegExp(`class="card el-${element}[^\"]*" style="--el:`));
    assert.match(html, new RegExp(`class="card-art-icon motif-${element}"`));
  }
  ui.state.deck[0].up = true;
  ui.overlay = 'deck';
  assert.match(ui.overlayHTML(), /class="card-up-mark"[^>]*>悟</);
});

test('手机奖励卡也继承五行视觉强调', () => {
  const ui = makeUI();
  setReward(ui);
  const html = ui.rewardHTML();
  assert.match(html, /class="reward-option el-water/);
  assert.match(html, /class="reward-option el-wood/);
  assert.match(html, /class="reward-option-seal"/);
});

test('升级牌标题行留出完整牌名空间', () => {
  const ui = makeUI();
  ui.state.deck = [{ uid: 'up-long', id: 'bai_cao', up: true }];
  ui.overlay = 'deck';
  const html = ui.overlayHTML();
  const title = html.match(/<div class="card-top">([\s\S]*?)<\/div>/)[1];
  const art = html.match(/<div class="card-art"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.match(title, /百草回春/);
  assert.doesNotMatch(title, /百草回春·悟/);
  assert.doesNotMatch(title, /card-up-mark|card-elem/);
  assert.match(art, /card-up-mark/);
  assert.match(art, /card-elem/);
});
