'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../js/data.js');

test('模拟器可被安静地复用，并报告完整的普通战斗样本', () => {
  const { runOne } = require('./sim.js');
  assert.equal(typeof runOne, 'function');
  const combats = [];
  const result = runOne('sword', 10000, 0, null, null, { onNormalCombat: row => combats.push(row) });
  assert.ok(result.win || result.dead);
  assert.ok(combats.length > 0);
  for (const row of combats) {
    assert.ok(row.id && Number.isInteger(row.act) && Number.isInteger(row.mapRow));
    assert.ok(['early', 'mid', 'late'].includes(row.stage));
    assert.ok(row.enemyCount === 1 || row.enemyCount === 2);
    assert.ok(Number.isFinite(row.hpBefore) && Number.isFinite(row.hpAfter));
    assert.equal(row.hpLoss, row.hpBefore - row.hpAfter);
    assert.ok(Number.isInteger(row.turns) && row.turns >= 1);
    assert.ok(row.damageTaken >= 0);
    assert.ok(row.directDamageTaken >= 0);
    assert.ok(row.damageTaken >= row.directDamageTaken);
    assert.equal(typeof row.dead, 'boolean');
  }
});

test('普通战斗承伤包含中毒、灼烧与直接扣血', () => {
  const { runOne } = require('./sim.js');
  const combats = [];
  for (let i = 0; i < 20; i++) {
    runOne('sword', 10000 + i * 31, 5, null, null, { onNormalCombat: row => combats.push(row) });
  }
  assert.ok(combats.some(row => row.directDamageTaken > 0));
  assert.ok(combats.every(row => row.damageTaken >= row.directDamageTaken));
});

test('倍率覆盖只触及普通双怪，回调失败也恢复原值', () => {
  const { withDoubleEncounterScales } = require('./balance-encounters.js');
  const entries = [1, 2, 3].flatMap(act => ['early', 'mid', 'late'].flatMap(stage => DATA.encounters[act].normal[stage].map(encounter => ({ act, encounter }))));
  const original = entries.map(({ encounter }) => encounter.hpScale);
  assert.throws(() => withDoubleEncounterScales([0.50, 0.55, 0.60], () => {
    for (const { act, encounter } of entries) {
      if (encounter.enemies.length === 2) assert.equal(encounter.hpScale, [0.50, 0.55, 0.60][act - 1]);
      else assert.equal(encounter.hpScale, undefined);
    }
    throw new Error('restore');
  }), /restore/);
  assert.deepEqual(entries.map(({ encounter }) => encounter.hpScale), original);
});

test('同一遭遇对象跨阶段复用时也只覆盖并恢复一次', () => {
  const { withDoubleEncounterScales } = require('./balance-encounters.js');
  const shared = DATA.encounters[1].normal.mid.find(encounter => encounter.enemies.length === 2);
  const late = DATA.encounters[1].normal.late;
  const original = late[3];
  late[3] = shared;
  try {
    withDoubleEncounterScales([0.50, 0.50, 0.50], () => assert.equal(shared.hpScale, 0.50));
    assert.equal(shared.hpScale, 0.50);
  } finally {
    late[3] = original;
    shared.hpScale = 0.50;
  }
});

test('参数解析支持 quick、正式样本数及候选倍率', () => {
  const { parseArgs } = require('./balance-encounters.js');
  assert.deepEqual(parseArgs(['--quick']).runs, 150);
  assert.deepEqual(parseArgs(['--runs', '7', '--asc', '0,5', '--scales', '0.45,0.55']), {
    runs: 7, ascensions: [0, 5], scales: [0.45, 0.55], quick: false
  });
  assert.throws(() => parseArgs(['--scales', 'abc']), /scales/i);
  assert.throws(() => parseArgs(['--asc', '']), /asc/i);
  assert.deepEqual(parseArgs(['--scales', '0.45', '--act-scales', '0.50,0.45,0.45;0.50,0.55,0.60']).actScales,
    [[0.50, 0.45, 0.45], [0.50, 0.55, 0.60]]);
  assert.deepEqual(parseArgs(['--act-scales', '0.50,0.45,0.45']).scales, []);
});

test('小样本扫描保留相同角色和种子，并汇总战斗指标', () => {
  const { runBalance, summarizeBalance } = require('./balance-encounters.js');
  const result = runBalance({ runs: 3, ascensions: [0], scales: [0.45, 0.55], quick: true });
  assert.equal(result.configs.length, 2);
  for (const config of result.configs) {
    assert.equal(config.runs.length, 9);
    assert.ok(config.combats.length > 0);
    assert.deepEqual(config.runs.map(row => [row.character, row.seed]), result.configs[0].runs.map(row => [row.character, row.seed]));
  }
  assert.ok(result.configs[0].combats.every(row => row.hpLoss === row.hpBefore - row.hpAfter));
  const summary = summarizeBalance(result);
  const firstStage = summary.configs[0].stages.find(row => row.act === 1 && row.stage === 'mid');
  assert.ok(firstStage.single && firstStage.double);
  assert.equal(firstStage.single.count + firstStage.double.count, firstStage.count);
  assert.ok(summary.configs[0].characters.all.matchedDamageRatio > 0);
  assert.equal(summary.configs[0].rows.filter(row => row.act === 1 && row.mapRow >= 2 && row.mapRow <= 4)
    .reduce((sum, row) => sum + row.count, 0), firstStage.count);
  assert.equal(summary.configs[0].rows.reduce((sum, row) => sum + row.deaths, 0),
    summary.configs[0].stages.reduce((sum, row) => sum + row.deaths, 0));
  assert.equal(summary.paired.length, 1);
});

test('自定义正式测试使用独立文件名，不覆盖已发布的千局数据', () => {
  const { parseArgs, resultFilename } = require('./balance-encounters.js');
  assert.equal(resultFilename(parseArgs([])), 'encounter-v2-results.json');
  assert.equal(resultFilename(parseArgs(['--scales', '0.45', '--act-scales', '0.50,0.45,0.45;0.50,0.55,0.60'])),
    'encounter-v2-mixed-results.json');
  assert.equal(resultFilename(parseArgs(['--act-scales', '0.50,0.45,0.45'])),
    'encounter-v2-adopted-results.json');
  assert.match(resultFilename(parseArgs(['--runs', '7'])), /^encounter-v2-custom-[a-f0-9]+\.json$/);
  assert.notEqual(resultFilename(parseArgs(['--scales', '0.50'])), 'encounter-v2-results.json');
});

test('分幕配置和统一配置复用同一批种子', () => {
  const { runBalance } = require('./balance-encounters.js');
  const result = runBalance({ runs: 2, ascensions: [0], scales: [0.45], actScales: [[0.50, 0.45, 0.45]] });
  assert.equal(result.configs.length, 2);
  assert.deepEqual(result.configs[1].actScales, [0.50, 0.45, 0.45]);
  assert.deepEqual(result.configs[0].runs.map(row => row.seed), result.configs[1].runs.map(row => row.seed));
});

test('仅指定分幕倍率时只模拟该方案', () => {
  const { parseArgs, runBalance, summarizeBalance } = require('./balance-encounters.js');
  const options = parseArgs(['--runs', '2', '--asc', '0', '--act-scales', '0.50,0.45,0.45']);
  const summary = summarizeBalance(runBalance(options));
  assert.equal(summary.configs.length, 1);
  assert.equal(summary.configs[0].scale, '0.50/0.45/0.45');
  assert.equal(summary.paired.length, 0);
});

test('双怪击杀顺序记录单杀与同一次结算的双杀', () => {
  const { observeEnemyKills } = require('./sim.js');
  const sequential = { enemyCount: 2, aliveEnemies: [{ uid: 'a', id: 'huang_quan' }, { uid: 'b', id: 'lei_shou' }], firstKill: null, secondKill: null };
  observeEnemyKills(sequential, [{ uid: 'a', hp: 0 }, { uid: 'b', hp: 4 }]);
  assert.equal(sequential.firstKill, 'huang_quan');
  observeEnemyKills(sequential, [{ uid: 'a', hp: 0 }, { uid: 'b', hp: 0 }]);
  assert.equal(sequential.secondKill, 'lei_shou');
  const simultaneous = { enemyCount: 2, aliveEnemies: [{ uid: 'a', id: 'huang_quan' }, { uid: 'b', id: 'lei_shou' }], firstKill: null, secondKill: null };
  observeEnemyKills(simultaneous, [{ uid: 'a', hp: 0 }, { uid: 'b', hp: 0 }]);
  assert.equal(simultaneous.firstKill, 'simultaneous');
  assert.equal(simultaneous.secondKill, null);
});

test('普通双怪样本包含击杀顺序与玩家死亡时的存活敌人', () => {
  const { runOne } = require('./sim.js');
  const combats = [];
  for (let i = 0; i < 20; i++) {
    runOne('sword', 10000 + i * 31, 5, null, null, { onNormalCombat: row => combats.push(row) });
  }
  const doubles = combats.filter(row => row.enemyCount === 2);
  assert.ok(doubles.length > 0);
  assert.ok(doubles.some(row => row.firstKill));
  assert.ok(doubles.every(row => row.dead ? Array.isArray(row.aliveAtDeath) : row.aliveAtDeath === null));
});

test('遭遇汇总保留未击杀、同时击杀和死亡时存活敌人数', () => {
  const { summarizeConfig } = require('./balance-encounters.js');
  const runs = [{ character: 'sword', win: true, dead: false, hp: 40, maxHp: 60, act: 3 }];
  const base = { character: 'sword', id: 'pair', act: 3, mapRow: 4, stage: 'mid', enemyCount: 2, hpLoss: 10, damageTaken: 15, turns: 4 };
  const combats = [
    { ...base, dead: false, firstKill: 'huang_quan', secondKill: 'lei_shou', aliveAtDeath: null },
    { ...base, dead: false, firstKill: 'simultaneous', secondKill: null, aliveAtDeath: null },
    { ...base, dead: true, firstKill: null, secondKill: null, aliveAtDeath: ['huang_quan', 'lei_shou'] }
  ];
  const encounter = summarizeConfig({ scale: 0.45, ascension: 5, runs, combats }).encounters[0];
  assert.deepEqual(encounter.firstKills, { huang_quan: 1, simultaneous: 1, none: 1 });
  assert.deepEqual(encounter.deathAlive, { huang_quan: 1, lei_shou: 1 });
  assert.equal(encounter.firstKillOutcomes.huang_quan.deaths, 0);
  assert.equal(encounter.firstKillOutcomes.none.deaths, 1);
});

test('风险判断用同阶段承伤，避免净治疗让耗血比率失真', () => {
  const { summarizeConfig } = require('./balance-encounters.js');
  const runs = ['sword', 'alchemist', 'monk'].map(character => ({ character, win: true, dead: false, hp: 30, maxHp: 60, act: 3, deathType: null }));
  const combats = ['sword', 'alchemist', 'monk'].flatMap(character => [
    { character, id: 'single', act: 2, stage: 'mid', enemyCount: 1, hpLoss: -2, damageTaken: 10, turns: 3, dead: false },
    { character, id: 'double', act: 2, stage: 'mid', enemyCount: 2, hpLoss: 5, damageTaken: 12, turns: 4, dead: false }
  ]);
  const result = summarizeConfig({ scale: 0.45, ascension: 0, runs, combats });
  assert.equal(result.characters.all.matchedDamageRatio, 1.2);
  assert.ok(!result.warnings.includes('DOUBLE TOO PUNISHING'));
});

test('零耗血与零承伤分别统计，治疗超过受伤不算零耗血', () => {
  const { combatStats } = require('./balance-encounters.js');
  const rows = [-2, 0, 3].map((hpLoss, index) => ({ hpLoss, damageTaken: index === 2 ? 5 : 0, turns: 2, dead: false }));
  const stats = combatStats(rows);
  assert.equal(stats.exactNoLossRate, 1 / 3);
  assert.equal(stats.noLossRate, 2 / 3);
  assert.equal(stats.damageFreeRate, 2 / 3);
});
