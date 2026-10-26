'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../js/data.js');
const E = require('../js/engine.js');
const ItemArt = require('../js/item-art.js');

function makeUI(width = 1280, height = 900, effects = null) {
  const window = { WX_DATA: D, WXEngine: E, WXEffects: effects, WXItemArt: ItemArt, innerWidth: width, innerHeight: height,
    addEventListener() {} };
  const document = { getElementById: () => ({ addEventListener() {} }), querySelector: () => null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8'),
    { window, document, clearTimeout, setTimeout });
  const ui = window.WX_UI;
  ui.state = E.createRun({ characterId: 'sword', seed: 71 });
  ui.screen = 'combat';
  return ui;
}

test('普通战斗拥有同一战场层级、幕别背景和独立玩家主体', () => {
  const ui = makeUI();
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const before = E.serialize(ui.state);
  const html = ui.combatHTML();
  assert.match(html, /class="screen combat-screen[^\"]*act-1/);
  assert.match(html, /character-sword/);
  for (const name of ['combat-backdrop', 'battlefield', 'battle-ground', 'player-zone', 'combat-bottom', 'enemy-zone', 'hand']) {
    assert.match(html, new RegExp(`class="[^"]*${name}`), name);
  }
  assert.match(html, /class="player-figure"/);
  assert.match(html, /assets\/characters\/sword\.webp/);
  assert.match(html, /enemy-normal/);
  assert.doesNotMatch(html, /enemy-boss|arena-boss/);
  assert.equal(E.serialize(ui.state), before);
  const alchemist = makeUI();
  alchemist.state = E.createRun({ characterId: 'alchemist', seed: 71 });
  E.startCombat(alchemist.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.match(alchemist.combatHTML(), /character-alchemist/);
});

test('攻击牌先飞抵目标，再结算生命并按命中、数字、Hit Stop 顺序反馈', async () => {
  const order = [];
  const effects = {
    captureCard() { return { ghost: {} }; },
    async playCardFlight() {
      order.push('flight-start');
      order.push(`flight-state:${ui.state.combat.enemies[0].hp}:${ui.state.combat.hand.length}`);
      order.push('flight-end');
    },
    async elementHit() { order.push('impact'); },
    async hitStop() { order.push('hit-stop'); },
    clear() {}
  };
  const ui = makeUI(393, 852, effects);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_gui' }] }, 'combat');
  ui.state.combat.hand = [{ uid: 'timing-attack', id: 'jin_feng', up: false }];
  ui.state.combat.energy = 10;
  ui.state.combat.enemies[0].hp = 100;
  ui.state.combat.enemies[0].maxHp = 100;
  ui.render = () => {};
  ui.sync = () => {};
  ui.checkCombatState = () => {};
  ui.floatAt = (_el, text, cls) => order.push(`number:${text}:${cls}`);
  ui.hitPulse = () => {};
  ui.sfx = () => {};
  await ui.playCard(0, 0);
  assert.ok(order.indexOf('flight-start') < order.indexOf('impact'));
  const firstDamageNumber = order.findIndex(item => item.startsWith('number:-') || item.startsWith('number:0:') || item.startsWith('number:6:'));
  assert.ok(order.indexOf('impact') < firstDamageNumber, JSON.stringify(order));
  assert.ok(order.find(item => item.startsWith('flight-state:')).includes(':100:1'), '飞行期间规则状态不应提前变化');
  assert.equal(order.includes('hit-stop'), false, '普通伤害不应停顿');
  assert.equal(ui.state.combat.enemies[0].hp, 90);
  assert.equal(ui.state.combat.hand.length, 0);
  await ui.fx([{ t: 'damage', target: 'enemy', uid: ui.state.combat.enemies[0].uid, amount: 18, cross: true, element: 'metal' }]);
  const crossDamageNumber = order.findIndex(item => item.startsWith('number:-18:'));
  assert.ok(crossDamageNumber >= 0);
  assert.ok(order.findIndex(item => item === 'hit-stop') > crossDamageNumber, '克制伤害数字出现后短暂停顿');
});

test('同一目标的多段伤害按约 85ms 逐段出现', async () => {
  const effects = { async elementHit() {}, async hitStop() {} };
  const ui = makeUI(393, 852, effects);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const uid = ui.state.combat.enemies[0].uid;
  const shownAt = [];
  ui.render = () => {};
  ui.hitPulse = () => {};
  ui.sfx = () => {};
  ui.floatAt = (_el, text) => { if (text.startsWith('-')) shownAt.push(Date.now()); };
  await ui.fx(Array.from({ length: 4 }, () => ({ t: 'damage', target: 'enemy', uid, amount: 6, element: 'metal' })));
  assert.equal(shownAt.length, 4);
  for (let i = 1; i < shownAt.length; i++) {
    const spacing = shownAt[i] - shownAt[i - 1];
    assert.ok(spacing >= 75 && spacing <= 125, `第 ${i + 1} 段间隔 ${spacing}ms`);
  }
});

test('终式伤害数字延后到飞行后的主视觉命中段', async () => {
  const effects = { async elementHit() {}, async hitStop() {} };
  const ui = makeUI(393, 852, effects);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const shownAt = Date.now();
  let damageAt = 0;
  ui.hitPulse = () => {};
  ui.sfx = () => {};
  ui.floatAt = (_el, text) => { if (text.startsWith('-')) damageAt = Date.now(); };
  await ui.fx([{ t: 'damage', target: 'enemy', uid: ui.state.combat.enemies[0].uid, amount: 30, element: 'metal' }], { finisher: true });
  assert.ok(damageAt - shownAt >= 140, `终式伤害只延迟了 ${damageAt - shownAt}ms`);
});

test('状态兑现先显示聚拢提示，最终伤害数字等演出结束后出现', async () => {
  const order = [];
  const effects = { async statusDetonate({ stacks }) { order.push(`detonate-start:${stacks}`); await new Promise(resolve => setTimeout(resolve, 2)); order.push('detonate-end'); } };
  const ui = makeUI(393, 852, effects);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const uid = ui.state.combat.enemies[0].uid;
  ui.floatAt = (_el, text) => order.push(`float:${text}`);
  ui.hitPulse = () => {};
  ui.sfx = () => {};
  await ui.fx([
    { t: 'statusDetonate', status: 'poison', uid, target: 'enemy', stacks: 6, damage: 42 },
    { t: 'damage', target: 'enemy', uid, amount: 42, source: 'poison', element: 'wood' }
  ]);
  assert.equal(order[0], 'float:毒层收束 ×6');
  assert.equal(order[1], 'detonate-start:6');
  assert.ok(order.indexOf('detonate-end') < order.findIndex(item => item === 'float:-42'));
  assert.ok(!order.some(item => item.includes('毒层收束') && item.includes('42')));
});

test('精英和幕主有不同视觉等级，Boss 二阶段持续可见', () => {
  const ui = makeUI();
  E.startCombat(ui.state, { enemies: [{ id: 'jin_jia_shi_jiang' }] }, 'elite');
  assert.match(ui.combatHTML(), /enemy-elite/);
  assert.doesNotMatch(ui.combatHTML(), /enemy-boss/);
  ui.state.act = 2;
  E.startCombat(ui.state, { enemies: [{ id: 'chi_ba' }] }, 'boss');
  ui.state.combat.enemies[0].phase = 2;
  const html = ui.combatHTML();
  assert.match(html, /act-2/);
  assert.match(html, /arena-boss/);
  assert.match(html, /enemy-boss/);
  assert.match(html, /phase-2/);
  assert.match(html, /第二幕之主/);
});

test('双敌保持独立单位且玩家仍可选择目标', () => {
  const ui = makeUI(393, 852);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }, { id: 'shan_xiao' }] }, 'combat');
  ui.selected = 0;
  const html = ui.combatHTML();
  assert.match(html, /enemy-zone multi/);
  assert.equal((html.match(/enemy-normal/g) || []).length, 2);
  assert.equal((html.match(/data-action="enemy"/g) || []).length, 2);
  assert.match(html, /targetable/);
  assert.match(html, /combat-targeting/);
  assert.match(handCards(html)[0][1], /selected-target-card/);
});

test('单敌定向牌也先进入瞄准态，确认点击敌人后才交给规则结算', () => {
  const ui = makeUI();
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = [{ id: 'jin_ren', up: false, uid: 'aim-card' }];
  ui.render = () => {};
  let played = null;
  ui.playCard = (index, target) => { played = { index, target }; };
  ui.onCardClick(0);
  assert.equal(ui.selected, 0);
  assert.equal(played, null);
  ui.onEnemyClick(0);
  assert.deepEqual(played, { index: 0, target: 0 });
});

function handCards(html) {
  return [...html.matchAll(/<button[^>]*class="([^"]*\bin-hand\b[^"]*)"[^>]*style="([^"]*)"[^>]*data-action="play-card"[^>]*>/g)];
}

test('桌面五张牌形成有中央高点的扇形，十张牌仍全部可用', () => {
  const ui = makeUI(1440, 900);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = Array.from({ length: 5 }, () => ({ id: 'jin_ren', up: false }));
  let cards = handCards(ui.combatHTML());
  assert.equal(cards.length, 5);
  const rotations = cards.map(card => Number(card[2].match(/--hand-rot:([\d.-]+)deg/)?.[1]));
  assert.ok(rotations[0] < 0 && rotations[2] === 0 && rotations[4] > 0);
  const arcs = cards.map(card => Number(card[2].match(/--hand-y:([\d.-]+)px/)?.[1]));
  assert.ok(arcs[0] > arcs[2] && arcs[4] > arcs[2]);
  ui.state.combat.hand = Array.from({ length: 10 }, () => ({ id: 'jin_ren', up: false }));
  cards = handCards(ui.combatHTML());
  assert.equal(cards.length, 10);
  assert.doesNotMatch(cards.map(card => card[2]).join(' '), /NaN|Infinity/);
});

test('手机手牌保持横向轻排，连携与克制提示只标记对应卡', () => {
  const ui = makeUI(393, 852);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.currentElement = 'wood';
  ui.state.combat.hand = [{ id: 'chi_yan', up: false }, { id: 'jin_ren', up: false }, { id: 'liu_yun', up: false }];
  let cards = handCards(ui.combatHTML());
  assert.equal(cards.length, 3);
  assert.match(cards[0][1], /chain-next/);
  assert.doesNotMatch(cards[1][1], /chain-next/);
  assert.ok(cards.every(card => Math.abs(Number(card[2].match(/--hand-rot:([\d.-]+)deg/)?.[1])) <= 2));
  ui.state.combat.enemies[0].element = 'wood';
  cards = handCards(ui.combatHTML());
  assert.match(cards[1][1], /will-overcome/);
  assert.doesNotMatch(cards[2][1], /will-overcome/);
});

test('终式、升级与五行资源具有独立标记，周天满层闭合', () => {
  for (const [character, finisher] of [['sword', 'yi_jian_kai_tian'], ['alchemist', 'bai_du_gui_yuan'], ['monk', 'beng_tian_shi']]) {
    const ui = makeUI();
    ui.state = E.createRun({ characterId: character, seed: 71 });
    E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
    ui.state.combat.hand = [{ id: finisher, up: true }];
    ui.state.combat.currentElement = 'wood';
    ui.state.combat.chain = 5;
    const html = ui.combatHTML();
    const card = handCards(html)[0][1];
    assert.match(card, /card-finisher/);
    assert.match(card, new RegExp(`char-${character}`));
    assert.match(card, /upgraded/);
    assert.match(card, /type-(attack|skill)/);
    assert.match(html, /终式/);
    assert.match(html, /class="five-ring[^"]*full/);
    assert.equal((html.match(/class="five-node/g) || []).length, 5);
    assert.match(html, /five-node[^\"]*current/);
    assert.match(html, /five-node[^\"]*next/);
    assert.match(html, /class="energy-orb"/);
  }
});

test('卡牌品级 class 与类型、终式、升级和异数身份互不覆盖', () => {
  const ui = makeUI(1440, 900);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = [
    { id: 'jin_ren', up: false },
    { id: 'jin_feng', up: false },
    { id: 'she_ji', up: false },
    { id: 'wu_lei', up: false },
    { id: 'xuan_wu', up: true },
    { id: 'yi_jian_kai_tian', up: true },
    { id: 'huo_zhong', up: false },
    { id: 'xin_mo', up: false }
  ];
  const html = ui.combatHTML();
  const cards = handCards(html).map(card => card[1]);
  for (const [index, rarity] of ['starter', 'common', 'uncommon', 'rare', 'rare'].entries()) {
    assert.match(cards[index], new RegExp(`rarity-${rarity}`));
  }
  assert.match(cards[2], /type-attack/);
  assert.match(cards[3], /type-attack/);
  assert.match(cards[4], /type-skill[^\"]*rarity-rare|rarity-rare[^\"]*type-skill/);
  assert.match(cards[4], /upgraded/);
  assert.match(cards[5], /rarity-rare[^\"]*card-finisher|card-finisher[^\"]*rarity-rare/);
  assert.match(cards[5], /char-sword/);
  assert.match(cards[5], /upgraded/);
  assert.match(cards[6], /card-special/);
  assert.doesNotMatch(cards[6], /rarity-(starter|common|uncommon|rare)/);
  assert.match(cards[7], /card-curse/);
  assert.doesNotMatch(cards[7], /rarity-(starter|common|uncommon|rare)/);
  assert.equal((html.match(/card-rarity-ornament/g) || []).length, 3);
});

test('金行采用冷银蓝，凡灵玄印与终式、升级印记独立显示', () => {
  assert.equal(D.elements.metal.color, '#AFC9D8');
  assert.equal(D.elements.metal.dark, '#243642');
  const ui = makeUI(1280, 900);
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = [
    { id: 'jin_ren' },
    { id: 'jin_feng' },
    { id: 'she_ji' },
    { id: 'wu_lei' },
    { id: 'wu_lei', up: true },
    { id: 'yi_jian_kai_tian', up: true }
  ];
  const cards = ui.combatHTML().match(/<button[^>]*in-hand[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(cards.length, 6);
  for (const [index, seal] of [[1, '凡'], [2, '灵'], [3, '玄'], [4, '玄']]) {
    assert.match(cards[index], /card-rarity-seal/);
    assert.match(cards[index], new RegExp(`card-rarity-seal[^>]*>${seal}<`));
  }
  assert.doesNotMatch(cards[0], /card-rarity-seal/);
  assert.match(cards[4], /rarity-rare/);
  assert.match(cards[4], /upgraded/);
  assert.match(cards[5], /card-finisher/);
  assert.match(cards[5], /card-finisher-seal[^>]*>终式</);
  assert.match(cards[5], /card-rarity-seal[^>]*>玄</);

  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  for (const token of ['--rarity-starter: #837D73', '--rarity-common: #B07A48', '--rarity-uncommon: #43A99A', '--rarity-rare: #8B67C7', '--rarity-finisher: #D3AE58']) {
    assert.ok(css.includes(token), `missing ${token}`);
  }
  assert.match(css, /\.card\.el-metal \.card-art[^{]*\{[^}]*#1b2b35/is);
  assert.match(css, /\.card\.rarity-rare \.card-inner::after[^{]*\{[^}]*var\(--rarity-rare\)/is);
});
