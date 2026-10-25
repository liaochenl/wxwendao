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
