'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

function run(characterId = 'sword') { return E.createRun({ characterId, seed: 197 }); }

test('道途识别排除初始牌，并按 2、4、6 加对应终结牌升级', () => {
  const state = run('sword');
  assert.deepEqual(E.getBuildIdentity(state), { tag: null, name: '未定', count: 0, level: 0, levelName: '未定' });
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getBuildIdentity(state).level, 0);
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getBuildIdentity(state).levelName, '初窥');
  E.addCardToDeck(state, 'ning_feng');
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getBuildIdentity(state).levelName, '成势');
  E.addCardToDeck(state, 'ning_feng');
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getBuildIdentity(state).level, 2);
  E.addCardToDeck(state, 'yi_jian_kai_tian');
  assert.deepEqual(E.getBuildIdentity(state), { tag: 'sword_intent', name: '藏锋', count: 7, level: 3, levelName: '大成' });
});

test('三角色道途与称号按同一套规则决定，未成势保持通用称号', () => {
  const cases = [
    ['sword', 'xing_yun_jue', 'sword_cycle', '行云', '流云无尽'],
    ['alchemist', 'shi_gu_dan', 'poison', '万毒', '百毒丹尊'],
    ['monk', 'zhen_yue_zhuang', 'monk_block', '镇岳', '镇岳真身']
  ];
  for (const [character, card, tag, name, title] of cases) {
    const state = run(character);
    assert.equal(E.getRunSummary(state).title, '五行行者');
    for (let i = 0; i < 4; i++) E.addCardToDeck(state, card);
    assert.equal(E.getBuildIdentity(state).tag, tag);
    assert.equal(E.getBuildIdentity(state).name, name);
    assert.equal(E.getRunSummary(state).title, title);
  }
});

test('成势提示每条道途只在首次进入战斗时出现，旧存档可补齐记录', () => {
  const state = run('monk');
  for (let i = 0; i < 4; i++) E.addCardToDeck(state, 'zhen_yue_zhuang');
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.equal(state.attraction.buildMilestones.monk_block, 2);
  assert.equal(E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events.some(ev => ev.t === 'buildAwakened'), false);
  const legacy = run('monk');
  for (let i = 0; i < 4; i++) E.addCardToDeck(legacy, 'zhen_yue_zhuang');
  delete legacy.attraction;
  delete legacy.highlights;
  const restored = E.deserialize(E.serialize(legacy));
  assert.ok(restored);
  assert.equal(E.getRunSummary(restored).highlights.maxTurnDamage, 0);
  assert.equal(E.startCombat(restored, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events.filter(ev => ev.t === 'buildAwakened').length, 1);
});

test('证道录记录实际单击、单回合伤害、护甲、资源、连携与战斗场数', () => {
  const state = run('sword');
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const c = state.combat;
  c.enemies[0].hp = c.enemies[0].maxHp = 999;
  c.hand = [{ uid: 'shield', id: 'jin_zhong', up: false }, { uid: 'strike', id: 'shan_yue', up: false }];
  c.energy = 10;
  E.playCard(state, 0, 0);
  E.playCard(state, 0, 0);
  const summary = E.getRunSummary(state);
  assert.equal(summary.combats, 1);
  assert.ok(summary.highlights.maxBlock >= 9);
  assert.ok(summary.highlights.maxSingleHit >= 13);
  assert.ok(summary.highlights.maxTurnDamage >= 13);
  assert.ok(summary.highlights.maxChain >= 0);
  assert.equal(summary.relicCount, state.relics.length);
  assert.equal(summary.deck.length, state.deck.length);
});

test('周天直伤、状态翻倍和遗物护甲也计入证道高光', () => {
  const sword = run('sword');
  E.startCombat(sword, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  sword.combat.enemies[0].hp = 999;
  sword.combat.currentElement = 'earth';
  sword.combat.chain = 4;
  sword.combat.hand = [{ uid: 'chain', id: 'ning_feng', up: false }];
  E.playCard(sword, 0, 0);
  assert.equal(E.getRunSummary(sword).highlights.maxChain, 5);
  assert.ok(E.getRunSummary(sword).highlights.maxSingleHit >= 8);

  const alchemist = run('alchemist');
  E.startCombat(alchemist, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  alchemist.combat.enemies[0].statuses.poison = 12;
  alchemist.combat.hand = [{ uid: 'double', id: 'yin_du', up: false }];
  E.playCard(alchemist, 0, 0);
  assert.ok(E.getRunSummary(alchemist).highlights.maxPoison >= 24);

  const monk = run('monk');
  E.startCombat(monk, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.ok(E.getRunSummary(monk).highlights.maxBlock >= 6);
});

test('证道总伤害按敌人实际失去的生命统计，不把溢出伤害算进去', () => {
  const state = run('monk');
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.enemies[0].hp = 2;
  state.combat.hand = [{ uid: 'last-hit', id: 'yan_quan', up: false }];
  E.playCard(state, 0, 0);
  assert.equal(E.getRunSummary(state).damageDealt, 2);
  assert.equal(E.getRunSummary(state).highlights.maxSingleHit, 2);
});

test('单回合最高伤害只累计玩家回合，敌方阶段的中毒单独计入总伤害', () => {
  const state = run('monk');
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const enemy = state.combat.enemies[0];
  enemy.hp = enemy.maxHp = 999;
  enemy.statuses.poison = 12;
  state.combat.hand = [{ uid: 'strike', id: 'yan_quan', up: false }];
  E.playCard(state, 0, 0);
  const playerTurnDamage = E.getRunSummary(state).highlights.maxTurnDamage;
  E.endPlayerTurn(state);
  E.runEnemyTurn(state);
  const summary = E.getRunSummary(state);
  assert.equal(summary.highlights.maxTurnDamage, playerTurnDamage);
  assert.ok(summary.damageDealt > playerTurnDamage);
});
