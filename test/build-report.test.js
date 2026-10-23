'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { runOne, scoreCard } = require('./sim.js');
const E = require('../js/engine.js');

test('完整模拟记录最终构筑标签和回合高光', () => {
  const result = runOne('sword', 10000, 0);
  assert.equal(typeof result.deckTags.sword_intent, 'number');
  assert.equal(typeof result.deckTags.sword_cycle, 'number');
  assert.equal(typeof result.deckTags.sword_chain, 'number');
  for (const key of ['maxTurnDamage', 'maxTurnBlock', 'maxCardsPlayedInTurn', 'maxResource', 'finisherCount']) {
    assert.ok(Number.isFinite(result.highlights[key]), key);
  }
});

test('模拟器按当前毒层和炉火评估丹修爆发，报告记录兑现高光', () => {
  const state = E.createRun({ characterId: 'alchemist', seed: 91 });
  state.relics = [];
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.hand = [{ uid: 'burst', id: 'bai_du_gui_yuan', up: false }];
  state.combat.enemies[0].statuses.poison = 20;
  const cold = scoreCard(state, 0);
  state.combat.characterResource.value = 4;
  const hot = scoreCard(state, 0);
  assert.ok(cold >= 20);
  assert.ok(hot > cold);
  const result = runOne('alchemist', 10000, 0);
  for (const tag of ['poison', 'burn', 'regen']) assert.equal(typeof result.deckTags[tag], 'number');
  for (const field of ['maxPoison', 'maxBurn', 'maxRegen', 'maxResource', 'detonationCount', 'maxDetonationDamage']) {
    assert.ok(Number.isFinite(result.highlights[field]), field);
  }
  const script = path.join(__dirname, 'build-report.js');
  const report = execFileSync(process.execPath, [script, '30', '0', 'alchemist'], { encoding: 'utf8' });
  assert.match(report, /丹修构筑 V2/);
  assert.match(report, /最大毒层/);
  assert.match(report, /状态爆发/);
});

test('剑修构筑报告按相同种子复现，包含成型率与高光指标', () => {
  const script = path.join(__dirname, 'build-report.js');
  const one = execFileSync(process.execPath, [script, '30', '0'], { encoding: 'utf8' });
  const two = execFileSync(process.execPath, [script, '30', '0'], { encoding: 'utf8' });
  assert.equal(one, two);
  assert.match(one, /初步成型/);
  assert.match(one, /完整成型/);
  assert.match(one, /峰值伤害/);
  assert.match(one, /终结牌打出/);
  assert.match(one, /第一幕同系奖励出现/);
});

test('模拟器认识体修三种兑现，构筑报告包含挡伤、战势浪费与状态峰值', () => {
  const state = E.createRun({ characterId: 'monk', seed: 91 });
  state.relics = [];
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.enemies[0].hp = state.combat.enemies[0].maxHp = 999;
  state.combat.enemies[0].element = 'fire';
  state.combat.hand = [{ uid: 'han', id: 'han_shan_shi', up: false }];
  const plain = scoreCard(state, 0);
  state.combat.block = 40;
  state.combat.characterResource.value = 4;
  assert.ok(scoreCard(state, 0) > plain);
  state.combat.hand = [{ uid: 'nu', id: 'jin_gang_zhen_nu', up: false }];
  const empty = scoreCard(state, 0);
  state.combat.statuses.thorns = 8;
  assert.ok(scoreCard(state, 0) > empty);
  state.combat.hand = [{ uid: 'beng', id: 'beng_tian_shi', up: false }];
  const held = scoreCard(state, 0);
  state.combat.statuses.strength = 6;
  state.combat.characterResource.value = 8;
  assert.ok(scoreCard(state, 0) > held);
  const result = runOne('monk', 10000, 0);
  for (const tag of ['monk_block', 'monk_thorns', 'monk_ritual']) assert.equal(typeof result.deckTags[tag], 'number');
  for (const field of ['maxBattleMomentum', 'maxBlock', 'maxThorns', 'maxStrength', 'maxRitual', 'blockedDamage', 'momentumGenerated', 'momentumWasted', 'resourceWasteRate', 'blockCashoutDamage', 'thornsCashoutDamage']) {
    assert.ok(Number.isFinite(result.highlights[field]), field);
  }
  assert.equal(result.highlights.maxBattleMomentum, result.highlights.maxResource);
  assert.equal(result.highlights.maxBlock, result.highlights.maxTurnBlock);
  const script = path.join(__dirname, 'build-report.js');
  const report = execFileSync(process.execPath, [script, '30', '0', 'monk'], { encoding: 'utf8' });
  assert.match(report, /体修构筑 V2/);
  assert.match(report, /战势浪费率/);
  assert.match(report, /挡伤总量/);
});
