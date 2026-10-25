'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function makeUI(width = 1280, height = 900) {
  const window = { WX_DATA: D, WXEngine: E, WXEffects: null, innerWidth: width, innerHeight: height,
    addEventListener() {} };
  const document = { getElementById: () => ({ addEventListener() {} }), querySelector: () => null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8'),
    { window, document, clearTimeout() {}, setTimeout() {} });
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
