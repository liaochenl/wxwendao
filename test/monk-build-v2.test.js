'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function battle(seed = 71, enemies = ['xuan_gui']) {
  const state = E.createRun({ characterId: 'monk', seed });
  state.relics = [];
  E.startCombat(state, { enemies: enemies.map(id => ({ id })) }, 'combat');
  const c = state.combat;
  c.hand = [];
  c.drawPile = [];
  c.discardPile = [];
  c.energy = 30;
  c.firstAttackUsed = true;
  for (const enemy of c.enemies) {
    enemy.hp = enemy.maxHp = 999;
    enemy.damageScale = 1;
    enemy.statuses = E.emptyStatuses();
  }
  return state;
}

function play(state, id, up = false, target = 0) {
  state.combat.hand.push({ uid: `test-${state.nextUid++}`, id, up });
  return E.playCard(state, state.combat.hand.length - 1, target);
}

test('战势从零开始，真实多段挡伤累计到阈值后才在敌方阶段汇总获取', () => {
  const state = battle();
  const c = state.combat;
  const enemy = c.enemies[0];
  assert.deepEqual(c.characterResource, { id: 'battleMomentum', value: 0, max: 10 });
  enemy.intent = 'tide'; // 潮汐：6×2
  c.block = 9; // 实际抵挡 6+3，不按每击单独取整
  assert.ok(E.endPlayerTurn(state).ok);
  const turn = E.runEnemyTurn(state);
  assert.equal(c.characterResource.value, 1);
  assert.equal(c.momentumBlockedThisEnemyTurn, 9);
  assert.equal(c.momentumGainedThisEnemyTurn, 1);
  assert.equal(turn.events.filter(ev => ev.t === 'resource' && ev.id === 'battleMomentum').length, 1);
  assert.ok(turn.events.some(ev => ev.t === 'momentumSummary' && ev.blocked === 9 && ev.generated === 1));
  assert.equal(c.block, 0);
  assert.equal(state.hp, state.maxHp - 3);
});

test('战势单敌方阶段最多三点，下一阶段重新计数并记录满额浪费', () => {
  const state = battle(71, Array(5).fill('xuan_gui'));
  const c = state.combat;
  c.enemies.forEach(enemy => { enemy.intent = 'tide'; }); // 五次 6×2，总挡伤 60
  c.block = 100;
  E.endPlayerTurn(state);
  const first = E.runEnemyTurn(state);
  assert.equal(c.characterResource.value, 3);
  assert.equal(c.momentumBlockedThisEnemyTurn, 60);
  assert.equal(first.events.find(ev => ev.t === 'momentumSummary').generated, 3);
  c.enemies.forEach(enemy => { enemy.intent = 'tide'; });
  c.block = 100;
  E.endPlayerTurn(state);
  E.runEnemyTurn(state);
  assert.equal(c.characterResource.value, 6);
  c.characterResource.value = 10;
  c.enemies.forEach(enemy => { enemy.intent = 'tide'; });
  c.block = 100;
  E.endPlayerTurn(state);
  const full = E.runEnemyTurn(state);
  assert.equal(c.characterResource.value, 10);
  assert.ok(full.events.some(ev => ev.t === 'momentumSummary' && ev.generated === 0 && ev.wasted === 3));
});

test('最后一名敌人被荆棘击败时，未结算的战势不算满额浪费', () => {
  const state = battle();
  const c = state.combat;
  c.enemies[0].hp = 2;
  c.enemies[0].intent = 'tide';
  c.block = 20;
  c.statuses.thorns = 2;
  E.endPlayerTurn(state);
  const turn = E.runEnemyTurn(state);
  assert.equal(c.phase, 'won');
  assert.ok(turn.events.some(ev => ev.t === 'momentumSummary' && ev.blocked === 6
    && ev.generated === 0 && ev.wasted === 0 && ev.potential === 0));
});

test('毒、灼烧、自损和未被护甲挡住的伤害不产生战势，旧存档恢复资源', () => {
  const state = battle();
  const c = state.combat;
  c.statuses.poison = 2;
  c.statuses.burn = 2;
  c.block = 0;
  c.enemies[0].intent = 'cannon';
  assert.ok(play(state, 'huo_ji').ok);
  assert.equal(c.characterResource.value, 0);
  E.endPlayerTurn(state);
  E.runEnemyTurn(state);
  assert.equal(c.characterResource.value, 0);
  delete c.characterResource;
  const restored = E.deserialize(E.serialize(state));
  assert.deepEqual(restored.combat.characterResource, { id: 'battleMomentum', value: 0, max: 10 });
  const sword = E.createRun({ characterId: 'sword', seed: 71 });
  const alchemist = E.createRun({ characterId: 'alchemist', seed: 71 });
  E.startCombat(sword, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  E.startCombat(alchemist, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.equal(sword.combat.characterResource.id, 'swordIntent');
  assert.equal(alchemist.combat.characterResource.id, 'furnaceFire');
});

test('穿透敌方攻击绕过护甲，也不会生成战势', () => {
  const state = battle();
  const c = state.combat;
  c.block = 20;
  c.enemies[0].intent = 'cannon';
  const move = D.enemies.xuan_gui.moves.cannon;
  move.pierce = true;
  try {
    E.endPlayerTurn(state);
    const turn = E.runEnemyTurn(state);
    assert.equal(state.hp, state.maxHp - 10);
    assert.equal(c.characterResource.value, 0);
    assert.equal(c.momentumBlockedThisEnemyTurn, 0);
    assert.ok(turn.events.some(ev => ev.t === 'damage' && ev.target === 'player' && ev.blocked === 0));
  } finally {
    delete move.pierce;
  }
});

test('镇岳桩只在出牌前已有十甲时抽牌；镇岳与金刚启动牌不会直接生成战势', () => {
  const state = battle();
  const c = state.combat;
  c.drawPile.push({ uid: 'draw-one', id: 'yan_quan', up: false });
  assert.ok(play(state, 'zhen_yue_zhuang').ok);
  assert.equal(c.block, 10);
  assert.equal(c.hand.length, 0);
  assert.equal(c.characterResource.value, 0);
  assert.ok(play(state, 'zhen_yue_zhuang', true).ok);
  assert.equal(c.block, 23);
  assert.equal(c.hand.length, 1);
  assert.ok(play(state, 'jie_li_fan_zhen').ok);
  assert.equal(c.statuses.thorns, 2);
  assert.equal(c.characterResource.value, 0);
  c.characterResource.value = 4;
  assert.ok(play(state, 'jie_li_fan_zhen', true).ok);
  assert.equal(c.statuses.thorns, 6); // 升级三层 + 热势额外一层
  assert.equal(c.characterResource.value, 4);
});

test('撼山式按消耗前护甲算伤害，热势提高转化率，再失去半甲与四战势', () => {
  for (const [momentum, expected] of [[0, 28], [4, 36]]) {
    const state = battle();
    const c = state.combat;
    const enemy = c.enemies[0];
    enemy.element = 'fire';
    c.block = 40;
    c.characterResource.value = momentum;
    c.hand.push({ uid: 'han', id: 'han_shan_shi', up: false });
    const preview = E.getPreview(state, 0, 0);
    assert.equal(preview.damage, expected);
    assert.equal(preview.blockConsumed, 20);
    assert.equal(preview.resourceConsumed, momentum);
    const result = E.playCard(state, 0, 0);
    assert.ok(result.ok);
    assert.equal(enemy.maxHp - enemy.hp, expected);
    assert.equal(c.block, 20);
    assert.equal(c.characterResource.value, 0);
    assert.ok(result.events.some(ev => ev.t === 'blockCashout' && ev.consumed === 20));
  }
});

test('撼山式统计实际削减生命，不将溢出伤害算入兑现伤害', () => {
  const state = battle();
  const c = state.combat;
  c.block = 40;
  c.enemies[0].element = 'fire';
  c.enemies[0].hp = 2;
  const result = play(state, 'han_shan_shi');
  assert.ok(result.ok);
  assert.equal(c.enemies[0].hp, 0);
  assert.equal(result.events.find(ev => ev.t === 'blockCashout').damage, 2);
});

test('金刚震怒按原荆棘层数对所有敌人造成穿甲状态伤害，只消耗半数荆棘', () => {
  for (const [momentum, expected] of [[0, 24], [4, 32]]) {
    const state = battle(71, ['xuan_gui', 'shan_xiao']);
    const c = state.combat;
    c.statuses.thorns = 8;
    c.statuses.strength = 20;
    c.characterResource.value = momentum;
    c.enemies.forEach(enemy => { enemy.block = 50; });
    c.hand.push({ uid: 'nu', id: 'jin_gang_zhen_nu', up: false });
    const preview = E.getPreview(state, 0, 0);
    assert.equal(preview.damageAll, expected);
    assert.equal(preview.statusConsumed, 4);
    assert.equal(preview.resourceConsumed, momentum);
    const result = E.playCard(state, 0, 0);
    assert.ok(result.ok);
    for (const enemy of c.enemies) {
      assert.equal(enemy.maxHp - enemy.hp, expected);
      assert.equal(enemy.block, 50);
    }
    assert.equal(c.statuses.thorns, 4);
    assert.equal(c.characterResource.value, 0);
    assert.ok(result.events.some(ev => ev.t === 'statusDetonate' && ev.status === 'thorns' && ev.damage === expected * 2));
  }
});

test('没有荆棘时金刚震怒不白烧战势', () => {
  const state = battle();
  state.combat.characterResource.value = 4;
  const result = play(state, 'jin_gang_zhen_nu');
  assert.ok(result.ok);
  assert.equal(state.combat.characterResource.value, 4);
  assert.equal(result.events.some(ev => ev.t === 'statusDetonate'), false);
});

test('抱元守一可建立蓄势且会消耗；崩天式以结算前战势与锐气重拳后清空战势', () => {
  const state = battle();
  const c = state.combat;
  const enemy = c.enemies[0];
  enemy.element = 'fire';
  assert.ok(play(state, 'bao_yuan_shou_yi').ok);
  assert.equal(c.block, 5);
  assert.equal(c.statuses.ritual, 1);
  assert.equal(c.exhaustPile.length, 1);
  c.drawPile.push({ uid: 'draw-two', id: 'yan_quan', up: false });
  assert.ok(play(state, 'bao_yuan_shou_yi', true).ok);
  assert.equal(c.statuses.ritual, 2);
  assert.equal(c.hand.length, 1);
  c.statuses.strength = 6;
  c.characterResource.value = 8;
  c.hand.push({ uid: 'beng', id: 'beng_tian_shi', up: false });
  const preview = E.getPreview(state, c.hand.length - 1, 0);
  assert.equal(preview.damage, 60);
  assert.equal(preview.resourceConsumed, 8);
  const result = E.playCard(state, c.hand.length - 1, 0);
  assert.ok(result.ok);
  assert.equal(enemy.maxHp - enemy.hp, 60);
  assert.equal(c.characterResource.value, 0);
});

test('三条体修构筑各有启动与终结，初始牌不计奖励协同且专属权重封顶', () => {
  assert.equal(D.cards.filter(card => card.character === 'monk').length, 9);
  for (const tag of ['monk_block', 'monk_thorns', 'monk_ritual']) {
    assert.ok(D.cards.filter(card => card.character === 'monk' && card.tags?.includes(tag)).length >= 3, tag);
  }
  const state = E.createRun({ characterId: 'monk', seed: 98 });
  const card = D.cardMap.han_shan_shi;
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3);
  state.deck.push({ uid: 'a', id: 'jing_gang', up: false }, { uid: 'b', id: 'di_mai', up: false });
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3 * 1.25);
  state.deck.push({ uid: 'c', id: 'zhen_yue_zhuang', up: false }, { uid: 'd', id: 'qi_men', up: false });
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3 * 1.4);
  assert.equal(D.cardMap.bao_yuan_shou_yi.exhaust, true);
  assert.equal(D.cardMap.jin_gang_zhen_nu.finisher, true);
  assert.equal(D.cardMap.beng_tian_shi.finisher, true);
});
