'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/data.js');
const SIM = require('./sim.js');

function run(characterId = 'sword') { return E.createRun({ characterId, seed: 197 }); }
function bossReward(state, act) {
  state.act = act;
  state.reward = { kind: 'boss', cards: [], cardTaken: true, selected: -1 };
  state.screen = 'reward';
  return E.continueReward(state);
}
function battle(character, tag, rank = 1) {
  const state = run(character);
  state.dao.blessings[tag] = rank;
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.enemies[0].hp = state.combat.enemies[0].maxHp = 999;
  state.combat.energy = 20;
  state.combat.drawPile = Array.from({ length: 30 }, (_, i) => ({ uid: `draw-${i}`, id: 'jin_ren', up: false }));
  return state;
}
function hand(state, ...ids) {
  state.combat.hand = ids.map((id, i) => ({ uid: `hand-${i}`, id, up: false }));
}

test('剑意满值每场只抽一次，二重额外回一灵气', () => {
  for (const rank of [1, 2]) {
    const state = battle('sword', 'sword_intent', rank);
    state.combat.characterResource.value = 9;
    hand(state, 'ning_feng');
    const result = E.playCard(state, 0, 0);
    assert.equal(result.events.filter(event => event.t === 'daoTrigger').length, 1);
    assert.equal(result.events.filter(event => event.t === 'draw').length, 1);
    assert.equal(state.combat.energy, 19 + (rank === 2 ? 1 : 0));
    state.combat.characterResource.value = 9;
    hand(state, 'ning_feng');
    assert.equal(E.playCard(state, 0, 0).events.some(event => event.t === 'daoTrigger'), false);
  }
});

test('行云第四张与金水三层均每回合只触发一次，下一回合重置', () => {
  const cycle = battle('sword', 'sword_cycle', 2);
  hand(cycle, ...Array(8).fill('liu_yun'));
  for (let i = 0; i < 8; i++) {
    const events = E.playCard(cycle, 0, 0).events;
    assert.equal(events.some(event => event.t === 'daoTrigger'), i === 3);
  }
  cycle.combat.phase = 'enemy';
  E.startPlayerTurnForTest(cycle);
  cycle.combat.energy = 20;
  hand(cycle, ...Array(4).fill('liu_yun'));
  let triggered = 0;
  for (let i = 0; i < 4; i++) triggered += E.playCard(cycle, 0, 0).events.filter(event => event.t === 'daoTrigger').length;
  assert.equal(triggered, 1);

  const chain = battle('sword', 'sword_chain', 2);
  chain.combat.chain = 2;
  chain.combat.currentElement = 'metal';
  hand(chain, 'liu_yun');
  let result = E.playCard(chain, 0, 0);
  assert.equal(result.events.filter(event => event.t === 'daoTrigger').length, 1);
  assert.equal(result.events.filter(event => event.t === 'draw').length >= 1, true);
  chain.combat.chain = 2;
  chain.combat.currentElement = 'metal';
  hand(chain, 'liu_yun');
  result = E.playCard(chain, 0, 0);
  assert.equal(result.events.some(event => event.t === 'daoTrigger'), false);
});

test('毒爆首次按 35% 或 20% 消耗；火爆按完整层数伤害后保留层数', () => {
  for (const [rank, remaining] of [[1, 19], [2, 24]]) {
    const poison = battle('alchemist', 'poison', rank);
    poison.combat.enemies[0].statuses.poison = 30;
    hand(poison, 'bai_du_gui_yuan');
    const result = E.playCard(poison, 0, 0);
    assert.equal(poison.combat.enemies[0].statuses.poison, remaining);
    assert.equal(result.events.some(event => event.t === 'daoTrigger'), true);
    hand(poison, 'bai_du_gui_yuan');
    E.playCard(poison, 0, 0);
    assert.equal(poison.combat.enemies[0].statuses.poison, remaining - Math.ceil(remaining * .5));
  }
  for (const [rank, remaining] of [[1, 3], [2, 6]]) {
    const burn = battle('alchemist', 'burn', rank);
    burn.combat.enemies[0].statuses.burn = 20;
    hand(burn, 'chi_lu_fen_tian');
    const result = E.playCard(burn, 0, 0);
    assert.equal(burn.combat.enemies[0].statuses.burn, remaining);
    assert.equal(result.events.find(event => event.t === 'statusDetonate')?.stacks, 20);
    hand(burn, 'chi_lu_fen_tian');
    E.playCard(burn, 0, 0);
    assert.equal(burn.combat.enemies[0].statuses.burn, 0);
  }
});

test('回春主动兑现只按实际溢出治疗转甲，首次触发有上限', () => {
  for (const [rank, block] of [[1, 5], [2, 10]]) {
    const state = battle('alchemist', 'regen', rank);
    state.hp = 60;
    state.combat.statuses.regen = 8;
    hand(state, 'qing_di_hui_tian');
    E.playCard(state, 0, 0);
    assert.equal(state.hp, 66);
    assert.equal(state.combat.block, block);
    state.combat.statuses.regen = 8;
    hand(state, 'qing_di_hui_tian');
    E.playCard(state, 0, 0);
    assert.equal(state.combat.block, block);
  }
});

test('镇岳和金刚首次兑现仅损失四分之一，伤害仍用兑现前层数', () => {
  const block = battle('monk', 'monk_block', 1);
  block.combat.block = 40;
  hand(block, 'han_shan_shi');
  const blockResult = E.playCard(block, 0, 0);
  assert.equal(block.combat.block, 30);
  assert.equal(blockResult.events.find(event => event.t === 'blockCashout')?.before, 40);
  hand(block, 'han_shan_shi');
  E.playCard(block, 0, 0);
  assert.equal(block.combat.block, 15);

  const thorn = battle('monk', 'monk_thorns', 2);
  thorn.combat.statuses.thorns = 8;
  hand(thorn, 'jin_gang_zhen_nu');
  let result = E.playCard(thorn, 0, 0);
  assert.equal(thorn.combat.statuses.thorns, 6);
  assert.equal(result.events.find(event => event.t === 'statusDetonate')?.stacks, 8);
  hand(thorn, 'jin_gang_zhen_nu');
  E.playCard(thorn, 0, 0);
  assert.equal(thorn.combat.statuses.thorns, 4);
  hand(thorn, 'jin_gang_zhen_nu');
  E.playCard(thorn, 0, 0);
  assert.equal(thorn.combat.statuses.thorns, 2);
});

test('战势满后终结牌折扣在成功出牌时才消耗，最低一费且不跨战斗', () => {
  const state = battle('monk', 'monk_ritual', 2);
  state.combat.block = 99;
  state.combat.characterResource.value = 9;
  state.combat.phase = 'enemy';
  E.runEnemyTurn(state);
  assert.equal(state.combat.daoFinisherDiscount, 2);
  hand(state, 'beng_tian_shi');
  assert.equal(E.getPreview(state, 0, 0).cost, 1);
  state.combat.energy = 0;
  assert.equal(E.playCard(state, 0, 0).ok, false);
  assert.equal(state.combat.daoFinisherDiscount, 2);
  state.combat.energy = 1;
  assert.equal(E.playCard(state, 0, 0).ok, true);
  assert.equal(state.combat.daoFinisherDiscount, 0);
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.equal(state.combat.daoFinisherDiscount, 0);
});

test('定道与悟道在 Boss 奖励之后、下一幕之前；第三幕直接证道', () => {
  const state = run();
  state.hp = 30;
  const beforeRng = state.rng;
  assert.equal(bossReward(state, 1).ok, true);
  assert.equal(state.screen, 'dao');
  assert.equal(state.act, 1);
  assert.equal(state.rng, beforeRng);
  assert.equal(state.dao.pending.stage, 'dingdao');
  assert.equal(E.getDaoChoices(state).length, 3);
  assert.equal(E.continueDao(state).ok, false);
  assert.equal(E.chooseDaoBlessing(state, 'sword_intent').ok, true);
  assert.equal(E.chooseDaoBlessing(state, 'sword_cycle').ok, false);
  assert.equal(state.act, 1);
  assert.equal(E.continueDao(state).ok, true);
  assert.equal(state.act, 2);
  assert.equal(state.screen, 'map');
  assert.equal(state.hp, 48);
  assert.equal(E.continueDao(state).ok, false);
  assert.equal(state.hp, 48);
  assert.equal(bossReward(state, 2).ok, true);
  assert.equal(state.dao.pending.stage, 'wudao');
  assert.equal(E.chooseDaoBlessing(state, 'sword_intent').ok, true);
  assert.equal(E.getDaoRank(state, 'sword_intent'), 2);
  assert.equal(E.continueDao(state).ok, true);
  assert.equal(state.act, 3);
  assert.equal(bossReward(state, 3).ok, true);
  assert.equal(state.screen, 'victory');
});

test('第二幕可以兼修另一道，道印选择不消耗随机数且不能超过二重', () => {
  const state = run('alchemist');
  bossReward(state, 1);
  assert.equal(E.chooseDaoBlessing(state, 'poison').ok, true);
  E.continueDao(state);
  const beforeRng = state.rng;
  bossReward(state, 2);
  const choices = E.getDaoChoices(state);
  assert.deepEqual(choices.map(choice => choice.tag), ['poison', 'burn', 'regen']);
  assert.equal(state.rng, beforeRng);
  assert.equal(E.chooseDaoBlessing(state, 'regen').ok, true);
  assert.equal(E.getDaoRank(state, 'poison'), 1);
  assert.equal(E.getDaoRank(state, 'regen'), 1);
  assert.deepEqual(state.dao.history.map(item => item.stage), ['dingdao', 'wudao']);
  state.dao.pending = { act: 2, stage: 'wudao', chosen: null };
  state.dao.blessings.poison = 2;
  assert.equal(E.chooseDaoBlessing(state, 'poison').ok, false);
  assert.equal(E.chooseDaoBlessing(state, 'sword_intent').ok, false);
});

test('仅已有构筑方向才显示当前道途契合标记', () => {
  const state = run();
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getDaoChoices(state).some(choice => choice.matching), false);
  E.addCardToDeck(state, 'ning_feng');
  assert.equal(E.getDaoChoices(state).find(choice => choice.tag === 'sword_intent').matching, true);
});

test('模拟器在道印流程提前中断时计为异常', () => {
  const original = E.chooseDaoBlessing;
  E.chooseDaoBlessing = () => ({ ok: false });
  try {
    const result = SIM.runOne('sword', 10000, 0);
    assert.equal(result.win, false);
    assert.equal(result.dead, false);
    assert.equal(result.stuck, true);
  } finally {
    E.chooseDaoBlessing = original;
  }
});

test('道印页面可存档恢复；旧存档迁移悟道记录且不补发错过的幕', () => {
  const state = run();
  bossReward(state, 1);
  const loaded = E.deserialize(E.serialize(state));
  assert.equal(loaded.screen, 'dao');
  assert.equal(loaded.dao.pending.stage, 'dingdao');
  assert.equal(E.getDaoChoices(loaded).length, 3);
  const old = run();
  old.act = 2;
  delete old.dao;
  old.attraction = { awakenedTags: ['sword_intent'] };
  const restored = E.deserialize(E.serialize(old));
  assert.deepEqual(restored.dao, { blessings: {}, history: [], pending: null });
  assert.equal(restored.attraction.buildMilestones.sword_intent, 2);
  assert.equal(restored.screen, 'map');
  bossReward(restored, 2);
  assert.equal(restored.dao.pending.stage, 'wudao');
  const oldAct3 = run();
  oldAct3.act = 3;
  delete oldAct3.dao;
  const restoredAct3 = E.deserialize(E.serialize(oldAct3));
  bossReward(restoredAct3, 3);
  assert.equal(restoredAct3.screen, 'victory');
});

test('道途成势和大成各提示一次，跳级时只提示实际最高级', () => {
  const state = run();
  for (let i = 0; i < 4; i++) E.addCardToDeck(state, 'ning_feng');
  let events = E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events;
  assert.deepEqual(events.filter(event => event.t === 'buildAwakened').map(event => event.levelName), ['成势']);
  assert.equal(E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events.some(event => event.t === 'buildAwakened'), false);
  E.addCardToDeck(state, 'ning_feng');
  E.addCardToDeck(state, 'ning_feng');
  E.addCardToDeck(state, 'yi_jian_kai_tian');
  events = E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events;
  assert.deepEqual(events.filter(event => event.t === 'buildAwakened').map(event => event.levelName), ['大成']);
  assert.equal(E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events.some(event => event.t === 'buildAwakened'), false);
  const jump = run();
  for (let i = 0; i < 6; i++) E.addCardToDeck(jump, 'ning_feng');
  E.addCardToDeck(jump, 'yi_jian_kai_tian');
  events = E.startCombat(jump, { enemies: [{ id: 'shan_xiao' }] }, 'combat').events;
  assert.deepEqual(events.filter(event => event.t === 'buildAwakened').map(event => event.levelName), ['大成']);
});

test('模拟 AI 按当前构筑选择道印，不消耗随机数', () => {
  const state = run('alchemist');
  for (let i = 0; i < 4; i++) E.addCardToDeck(state, 'shi_gu_dan');
  bossReward(state, 1);
  const before = state.rng;
  assert.equal(SIM.chooseDaoForSim(state), 'poison');
  assert.equal(state.rng, before);
  state.dao.blessings.poison = 2;
  assert.equal(SIM.chooseDaoForSim(state), 'burn');
});
