'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('卡牌模拟报告可复现，并包含奖励与出牌统计', () => {
  const sim = path.join(__dirname, 'sim.js');
  const run = () => spawnSync(process.execPath, [sim, '30', '0', '--report-cards'], { encoding: 'utf8' });
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.match(first.stdout, /CARD_STATS_START/);
  assert.match(first.stdout, /角色,卡牌ID,奖励出现,奖励选取,手牌回合实例数,实际打出,商店出现,商店购买/);
  assert.match(first.stdout, /sword,jin_ren,/);
  assert.match(first.stdout, /CARD_STATS_END/);
});

test('模拟出牌会考虑持续增益牌', () => {
  const sim = path.join(__dirname, 'sim.js');
  const result = spawnSync(process.execPath, [sim, '90', '0', '--report-cards'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const row = result.stdout.match(/^alchemist,huo_ling,([^\n]+)$/m);
  assert.ok(row, '火灵附体应出现在模拟报告中');
  assert.ok(Number(row[1].split(',')[3]) > 0, '火灵附体出现在手牌时应有实际打出记录');
});

test('遭遇模拟报告按幕和阶段统计普通战斗、双怪与死亡', () => {
  const sim = path.join(__dirname, 'sim.js');
  const result = spawnSync(process.execPath, [sim, '90', '5', '--report-encounters'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ENCOUNTER_STATS_START/);
  assert.match(result.stdout, /幕,阶段,普通战斗,双怪/);
  assert.match(result.stdout, /遭遇ID,次数/);
  assert.match(result.stdout, /a1_shan_xiao,\d+/);
  assert.match(result.stdout, /死亡幕,剑修,丹修,体修/);
  assert.match(result.stdout, /ENCOUNTER_STATS_END/);
});
