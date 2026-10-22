'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { runOne } = require('./sim.js');

test('完整模拟记录最终构筑标签和回合高光', () => {
  const result = runOne('sword', 10000, 0);
  assert.equal(typeof result.deckTags.sword_intent, 'number');
  assert.equal(typeof result.deckTags.sword_cycle, 'number');
  assert.equal(typeof result.deckTags.sword_chain, 'number');
  for (const key of ['maxTurnDamage', 'maxTurnBlock', 'maxCardsPlayedInTurn', 'maxResource', 'finisherCount']) {
    assert.ok(Number.isFinite(result.highlights[key]), key);
  }
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
