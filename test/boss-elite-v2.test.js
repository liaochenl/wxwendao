'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/data.js');
const SIM = require('./sim.js');

function battle(id, characterId = 'sword') {
  const state = E.createRun({ characterId, seed: 701 });
  state.maxHp = 300;
  state.hp = 300;
  const opened = E.startCombat(state, { enemies: [{ id }] }, D.enemies[id].boss ? 'boss' : 'elite');
  const combat = state.combat;
  const enemy = combat.enemies[0];
  combat.hand = [];
  combat.drawPile = [];
  combat.discardPile = [];
  combat.exhaustPile = [];
  combat.energy = 30;
  combat.firstAttackUsed = true;
  enemy.damageScale = 1;
  enemy.statuses.strength = 0;
  enemy.hp = enemy.maxHp = 500;
  return { state, combat, enemy, opened };
}
function hand(combat, id, uid = id) { combat.hand.push({ uid, id, up: false, temp: !!D.cardMap[id].temp }); }
function enemyMove(state, enemy, intent) {
  state.combat.phase = 'enemy';
  enemy.intent = intent;
  return E.runEnemyTurn(state);
}

test('六名目标有机制与登场资料，普通怪不触发登场', () => {
  for (const id of ['jin_jia_shi_jiang', 'shi_ling_teng_mu', 'xuan_shui_jiao_wang', 'shan_gui', 'chi_ba', 'tai_xu']) {
    assert.ok(D.enemies[id].mechanic?.id, id);
    assert.ok(D.enemies[id].presentation?.intro, id);
    assert.ok(D.enemies[id].presentation?.defeat, id);
    const { opened, enemy } = battle(id);
    assert.deepEqual(enemy.special, {});
    assert.ok(opened.events.some(event => event.t === 'encounterIntro' && event.uid === enemy.uid));
  }
  for (const id of ['shan_xiao', 'qing_she', 'xue_sha', 'tian_bing']) {
    const { opened, enemy } = battle(id);
    assert.equal(E.getEnemyMechanicInfo(battle(id).state, enemy), null);
    assert.equal(opened.events.some(event => event.t === 'encounterIntro'), false);
  }
});

test('金甲尸将每次漏血攻击只涨一尸煞，格挡不涨，强化处决预览与结算一致', () => {
  const { state, combat, enemy } = battle('jin_jia_shi_jiang');
  combat.block = 14;
  enemyMove(state, enemy, 'combo');
  assert.equal(enemy.special.corpseEnergy || 0, 0);
  combat.block = 0;
  const combo = enemyMove(state, enemy, 'combo');
  assert.equal(enemy.special.corpseEnergy, 1);
  assert.equal(combo.events.filter(event => event.t === 'enemyMechanic' && event.id === 'corpseEnergy').length, 1);
  enemyMove(state, enemy, 'combo');
  assert.equal(enemy.special.corpseEnergy, 2);
  enemy.intent = 'execute';
  assert.equal(E.getEnemyIntent(state, enemy).damage, 20);
  const hp = state.hp;
  const execute = enemyMove(state, enemy, 'execute');
  assert.equal(hp - state.hp, 20);
  assert.equal(enemy.special.corpseEnergy, 0);
  assert.equal(execute.events.some(event => event.t === 'enemyMechanic' && event.reason === 'execution'), true);
});

test('寄生藤母播种到弃牌堆，藤种可付费拔除或留手伤人回血', () => {
  const { state, combat, enemy } = battle('shi_ling_teng_mu');
  const planted = enemyMove(state, enemy, 'poison');
  assert.equal(planted.events.filter(event => event.t === 'addCard' && event.cardId === 'ji_sheng_teng_zhong' && event.pile === 'discard').length, 1);
  assert.equal([...combat.hand, ...combat.discardPile, ...combat.drawPile].filter(card => card.id === 'ji_sheng_teng_zhong').length, 1);
  assert.equal(D.cardMap.ji_sheng_teng_zhong.temp, true);
  combat.hand = [];
  hand(combat, 'ji_sheng_teng_zhong');
  const energy = combat.energy;
  const hp = state.hp;
  assert.equal(E.canPlayCard(state, 0).ok, true);
  E.playCard(state, 0, 0);
  assert.equal(combat.energy, energy - 1);
  assert.equal(combat.exhaustPile.at(-1).id, 'ji_sheng_teng_zhong');
  assert.equal(state.hp, hp);
  combat.hand = [];
  hand(combat, 'ji_sheng_teng_zhong', 'left');
  enemy.hp = 450;
  const leftHp = state.hp;
  E.endPlayerTurn(state);
  assert.equal(state.hp, leftHp - 3);
  assert.equal(enemy.hp, 453);
  assert.equal(state.deck.some(card => card.id === 'ji_sheng_teng_zhong'), false);
});

test('潮汐与冰封升潮，深渊随潮位增伤并泄潮，周天镇潮', () => {
  const { state, enemy } = battle('xuan_shui_jiao_wang');
  enemyMove(state, enemy, 'tide');
  assert.equal(enemy.special.tide, 1);
  enemyMove(state, enemy, 'freeze');
  assert.equal(enemy.special.tide, 2);
  enemy.intent = 'abyss';
  assert.equal(E.getEnemyIntent(state, enemy).damage, 25);
  const hp = state.hp;
  enemyMove(state, enemy, 'abyss');
  assert.equal(hp - state.hp, 25);
  assert.equal(enemy.special.tide, 0);
  enemy.special.tide = 2;
  state.combat.chain = 4;
  state.combat.currentElement = 'metal';
  hand(state.combat, 'shui_dun');
  E.playCard(state, 0, 0);
  assert.equal(enemy.special.tide, 1);
});

test('山鬼保留护甲才涨山势，满山势逐击强化并在攻击后清零', () => {
  const { state, combat, enemy } = battle('shan_gui');
  enemyMove(state, enemy, 'vein');
  assert.equal(enemy.block, 10);
  enemyMove(state, enemy, 'rockfall');
  assert.equal(enemy.special.mountainMight, 1);
  enemy.block = 0;
  enemyMove(state, enemy, 'vein');
  enemy.block = 0;
  enemyMove(state, enemy, 'rockfall');
  assert.equal(enemy.special.mountainMight, 1);
  enemy.special.mountainMight = 2;
  enemy.statuses.strength = 0;
  enemy.intent = 'collapse';
  assert.equal(E.getEnemyIntent(state, enemy).damage, 11);
  const hp = state.hp;
  enemyMove(state, enemy, 'collapse');
  assert.equal(hp - state.hp, 22);
  assert.equal(enemy.special.mountainMight, 0);
  assert.equal(combat.phase, 'player');
});

test('赤魃火种可熄灭，留手催生焚势，满焚势强制天火后重置', () => {
  const { state, combat, enemy } = battle('chi_ba');
  assert.ok(D.enemies.chi_ba.phase2.pattern.includes('huozhong'));
  assert.equal(D.cardMap.huo_zhong.cost, 1);
  hand(combat, 'huo_zhong');
  const hp = state.hp;
  E.playCard(state, 0, 0);
  assert.equal(state.hp, hp);
  assert.equal(combat.exhaustPile.at(-1).id, 'huo_zhong');
  for (let n = 0; n < 3; n++) {
    combat.phase = 'player';
    hand(combat, 'huo_zhong', `seed-${n}`);
    E.endPlayerTurn(state);
  }
  assert.equal(state.hp, hp - 6);
  assert.equal(enemy.special.firePressure, 3);
  enemy.intent = 'fentian';
  assert.equal(E.getEnemyIntent(state, enemy).name, '天火');
  const before = state.hp;
  enemyMove(state, enemy, 'fentian');
  assert.equal(before - state.hp, 17);
  assert.equal(enemy.special.firePressure, 0);
});

test('太虚仅记录真正命中的克制攻击，每张牌一次，破阵后本回合不再累积', () => {
  const { state, combat, enemy } = battle('tai_xu');
  enemy.element = 'wood';
  hand(combat, 'lie_kong');
  E.playCard(state, 0, 0);
  assert.equal(enemy.special.arrayBreak, 1);
  hand(combat, 'yan_quan');
  E.playCard(state, 0, 0);
  assert.equal(enemy.special.arrayBreak, 1);
  hand(combat, 'jin_ren');
  E.playCard(state, 0, 0);
  enemy.block = 20;
  const hp = enemy.hp;
  hand(combat, 'jin_ren');
  const preview = E.getPreview(state, combat.hand.length - 1, 0);
  const expectedHit = preview.damage;
  assert.equal(preview.mechanicDamage, 12);
  assert.equal(preview.mechanicStun, true);
  assert.equal(preview.mechanicBlockCleared, 20);
  const broken = E.playCard(state, 0, 0);
  assert.equal(enemy.block, 0);
  assert.equal(hp - enemy.hp, expectedHit + 12);
  assert.equal(enemy.statuses.stun, 1);
  assert.equal(E.getEnemyIntent(state, enemy).damage, 0);
  assert.match(E.getEnemyIntent(state, enemy).label, /跳过行动/);
  assert.equal(enemy.special.arrayBreak, 0);
  assert.equal(broken.events.some(event => event.t === 'enemyMechanic' && event.reason === 'arrayCollapse'), true);
  hand(combat, 'jin_ren');
  E.playCard(state, 0, 0);
  assert.equal(enemy.special.arrayBreak, 0);
  E.startPlayerTurnForTest(state);
  hand(combat, 'jin_ren');
  E.playCard(state, 0, 0);
  assert.equal(enemy.special.arrayBreak, 1);
  assert.equal(E.getEnemyMechanicInfo(state, enemy).nextElement, 'fire');
});

test('破阵预览仅在第三次有效克制命中且敌人仍存活时显示崩解', () => {
  const { state, combat, enemy } = battle('tai_xu');
  enemy.element = 'wood';
  enemy.special.arrayBreak = 2;
  hand(combat, 'jin_ren');
  assert.equal(E.getPreview(state, 0, 0).mechanicDamage, 12);
  enemy.special.arrayBreakUsedThisTurn = true;
  assert.equal(E.getPreview(state, 0, 0).mechanicDamage, 0);
  enemy.special.arrayBreakUsedThisTurn = false;
  enemy.hp = 1;
  assert.equal(E.getPreview(state, 0, 0).mechanicDamage, 0);
  enemy.hp = 25;
  combat.hand = [];
  hand(combat, 'wan_jian');
  const multi = E.getPreview(state, 0, 0);
  assert.equal(multi.mechanicDamage, 12);
  assert.equal(multi.mechanicStun, false);
});

test('旧战斗存档补特殊状态，不重播登场；Boss 二阶段仍只触发一次', () => {
  const { state, combat, enemy } = battle('shan_gui');
  delete enemy.special;
  const restored = E.deserialize(E.serialize(state));
  const oldEnemy = restored.combat.enemies[0];
  assert.deepEqual(oldEnemy.special, {});
  assert.equal(E.getEnemyMechanicInfo(restored, oldEnemy).value, 0);
  combat.hand = [];
  enemy.hp = 55;
  hand(combat, 'jin_ren');
  const first = E.playCard(state, 0, 0);
  assert.equal(enemy.phase, 2);
  assert.equal(enemy.special.mountainMight, 1);
  assert.equal(first.events.filter(event => event.t === 'phase').length, 1);
  hand(combat, 'jin_ren');
  const second = E.playCard(state, 0, 0);
  assert.equal(second.events.filter(event => event.t === 'phase').length, 0);
});

test('模拟 AI 会把火种与藤种视为可清除的危险牌', () => {
  for (const [id, card] of [['chi_ba', 'huo_zhong'], ['shi_ling_teng_mu', 'ji_sheng_teng_zhong']]) {
    const { state, combat } = battle(id);
    hand(combat, card);
    const score = SIM.scoreCard(state, 0);
    assert.ok(score > 7 && score < 40, `${card} 应值得清除，但并非总压过输出牌：${score}`);
  }
});
