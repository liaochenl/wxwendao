'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function battle(characterId = 'alchemist', seed = 71, enemies = ['shan_xiao']) {
  const state = E.createRun({ characterId, seed });
  state.relics = [];
  E.startCombat(state, { enemies: enemies.map(id => ({ id })) }, 'combat');
  const combat = state.combat;
  combat.hand = [];
  combat.drawPile = [];
  combat.discardPile = [];
  combat.energy = 30;
  combat.firstAttackUsed = true;
  for (const enemy of combat.enemies) enemy.hp = enemy.maxHp = 999;
  return state;
}
function play(state, id, up = false) {
  state.combat.hand.push({ uid: `t${state.nextUid++}`, id, up });
  return E.playCard(state, state.combat.hand.length - 1, 0);
}

test('炉火从零开始，毒火治疗回春各得一，养元丹单牌最多二点', () => {
  const state = battle();
  const c = state.combat;
  assert.deepEqual(c.characterResource, { id: 'furnaceFire', value: 0, max: 8 });
  for (const [id, total] of [['chan_si', 1], ['chi_yan', 2], ['bai_cao', 3], ['sheng_sheng', 4], ['yin_du', 5], ['yang_yuan_dan', 7]]) {
    assert.ok(play(state, id).ok, id);
    assert.equal(c.characterResource.value, total, id);
  }
  assert.ok(play(state, 'yang_yuan_dan').ok);
  assert.equal(c.characterResource.value, 8);
  assert.ok(play(state, 'yang_yuan_dan').ok);
  assert.equal(c.characterResource.value, 8);
  const sword = battle('sword');
  const monk = battle('monk');
  assert.equal(sword.combat.characterResource.id, 'swordIntent');
  assert.equal(monk.combat.characterResource, undefined);
  const oldSave = battle();
  delete oldSave.combat.characterResource;
  assert.deepEqual(E.deserialize(E.serialize(oldSave)).combat.characterResource, { id: 'furnaceFire', value: 0, max: 8 });
});

test('蚀骨丹和催火诀的条件读取出牌前状态，催火不抽牌', () => {
  const state = battle();
  const c = state.combat;
  const enemy = c.enemies[0];
  const first = play(state, 'shi_gu_dan');
  assert.ok(first.ok);
  assert.equal(enemy.statuses.poison, 5); // 药心追加 1 层
  assert.equal(first.events.some(ev => ev.t === 'draw'), false);
  enemy.statuses.poison = 8;
  c.drawPile.push({ uid: 'drawn', id: 'chan_si', up: false });
  const second = play(state, 'shi_gu_dan');
  assert.ok(second.events.some(ev => ev.t === 'draw'));
  const cold = play(state, 'cui_huo_jue');
  assert.equal(cold.events.some(ev => ev.t === 'energy' && ev.amount === 1), false);
  const handBefore = c.hand.length;
  const energyBefore = c.energy;
  const hot = play(state, 'cui_huo_jue');
  assert.ok(hot.events.some(ev => ev.t === 'energy' && ev.amount === 1));
  assert.equal(c.energy, energyBefore);
  assert.equal(c.hand.length, handBefore);
  assert.equal(hot.events.some(ev => ev.t === 'draw'), false);
});

test('百毒归元按原毒层造成无视护甲的状态伤害，热炉消耗四火并留半毒', () => {
  for (const [fire, damage] of [[0, 20], [4, 30]]) {
    const state = battle();
    const enemy = state.combat.enemies[0];
    enemy.statuses.poison = 20;
    enemy.block = 50;
    state.combat.statuses.strength = 12;
    state.combat.characterResource.value = fire;
    state.combat.hand.push({ uid: 'payoff', id: 'bai_du_gui_yuan', up: false });
    const preview = E.getPreview(state, 0, 0);
    assert.equal(preview.detonateDamage, damage);
    const before = enemy.hp;
    const result = E.playCard(state, 0, 0);
    assert.equal(before - enemy.hp, damage);
    assert.equal(enemy.block, 50);
    assert.equal(enemy.statuses.poison, 10);
    assert.equal(state.combat.characterResource.value, 0);
    assert.ok(result.events.some(ev => ev.t === 'statusDetonate' && ev.status === 'poison' && ev.stacks === 20 && ev.consumed === 10 && ev.damage === damage));
  }
});

test('赤炉焚天先攻击再引爆全部灼烧，状态伤害不吃护甲或锐气', () => {
  for (const [fire, damage] of [[0, 12], [4, 18]]) {
    const state = battle();
    const enemy = state.combat.enemies[0];
    enemy.statuses.burn = 12;
    enemy.block = 99;
    state.combat.statuses.strength = 20;
    state.combat.characterResource.value = fire;
    state.combat.hand.push({ uid: 'payoff', id: 'chi_lu_fen_tian', up: false });
    const preview = E.getPreview(state, 0, 0);
    assert.equal(preview.detonateDamage, damage);
    const before = enemy.hp;
    const result = E.playCard(state, 0, 0);
    assert.equal(before - enemy.hp, damage);
    assert.equal(enemy.statuses.burn, 0);
    assert.equal(state.combat.characterResource.value, 0);
    assert.equal(result.events.filter(ev => ev.t === 'statusDetonate' && ev.status === 'burn').length, 1);
  }
});

test('赤炉焚天先手攻击击杀目标时，预览不再显示未触发的焚炉', () => {
  const state = battle();
  const enemy = state.combat.enemies[0];
  enemy.hp = 5;
  enemy.statuses.burn = 12;
  state.combat.characterResource.value = 4;
  state.combat.hand.push({ uid: 'lethal', id: 'chi_lu_fen_tian', up: false });
  assert.equal(E.getPreview(state, 0, 0).detonateDamage, 0);
  const result = E.playCard(state, 0, 0);
  assert.equal(result.events.some(ev => ev.t === 'statusDetonate'), false);
  assert.equal(state.combat.characterResource.value, 4);
  assert.equal(enemy.statuses.burn, 12);
});

test('赤炉焚天只引爆选中目标的灼烧，不复制到另一名敌人', () => {
  const state = battle('alchemist', 71, ['shan_xiao', 'huo_shu']);
  const [first, second] = state.combat.enemies;
  first.statuses.burn = 12;
  second.statuses.burn = 12;
  state.combat.characterResource.value = 4;
  const result = play(state, 'chi_lu_fen_tian');
  assert.equal(first.statuses.burn, 0);
  assert.equal(second.statuses.burn, 12);
  assert.equal(second.hp, 999);
  assert.deepEqual(result.events.filter(ev => ev.t === 'statusDetonate').map(ev => ev.uid), [first.uid]);
});

test('青帝回天消耗全部回春，治疗并按固定种子随机分配多段状态伤害', () => {
  const run = () => {
    const state = battle('alchemist', 91, ['shan_xiao', 'huo_shu']);
    state.hp = 40;
    state.combat.statuses.regen = 5;
    state.combat.characterResource.value = 4;
    for (const enemy of state.combat.enemies) enemy.block = 50;
    const result = play(state, 'qing_di_hui_tian');
    return { state, result, targets: result.events.filter(ev => ev.t === 'damage' && ev.source === 'regen').map(ev => ev.uid) };
  };
  const first = run();
  const second = run();
  assert.equal(first.state.hp, 50);
  assert.equal(first.state.combat.statuses.regen, 0);
  assert.equal(first.state.combat.characterResource.value, 0);
  assert.equal(first.targets.length, 5);
  assert.deepEqual(first.targets, second.targets);
  assert.equal(first.result.events.filter(ev => ev.t === 'damage' && ev.source === 'regen').reduce((sum, ev) => sum + ev.amount, 0), 15);
  assert.ok(first.result.events.some(ev => ev.t === 'statusDetonate' && ev.status === 'regen' && ev.stacks === 5 && ev.consumed === 5));
  assert.ok(first.result.events.findIndex(ev => ev.t === 'heal') < first.result.events.findIndex(ev => ev.t === 'statusDetonate'));
  assert.equal(first.state.combat.enemies.every(enemy => enemy.block === 50), true);
});

test('青帝回天对残血敌人的爆发数字按实际命中显示', () => {
  const state = battle();
  state.hp = 40;
  state.combat.enemies[0].hp = 1;
  state.combat.statuses.regen = 10;
  state.combat.characterResource.value = 4;
  state.combat.hand.push({ uid: 'overkill', id: 'qing_di_hui_tian', up: false });
  assert.equal(E.getPreview(state, 0, 0).detonateDamage, 1);
  const result = E.playCard(state, 0, 0);
  const burst = result.events.find(ev => ev.t === 'statusDetonate');
  assert.equal(burst.damage, 1);
  assert.equal(burst.hits, 1);
  assert.deepEqual(result.events.filter(ev => ev.t === 'damage' && ev.source === 'regen').map(ev => ev.amount), [1]);
});

test('有消费资源效果的复合终结牌不会在结算后返还炉火', () => {
  const state = battle();
  state.combat.statuses.regen = 2;
  state.combat.characterResource.value = 4;
  const card = D.cardMap.qing_di_hui_tian;
  const extra = { op: 'status', status: 'regen', target: 'self', value: 1 };
  card.effects.push(extra);
  try {
    const result = play(state, card.id);
    assert.ok(result.ok);
    assert.equal(state.combat.characterResource.value, 0);
    assert.equal(state.combat.statuses.regen, 1);
  } finally {
    card.effects.pop();
  }
});

test('丹修九张专属牌与三条机制标签齐备，starter 不污染奖励协同', () => {
  const own = D.cards.filter(card => card.character === 'alchemist');
  assert.equal(own.length, 9);
  for (const tag of ['poison', 'burn', 'regen']) {
    assert.ok(D.cards.filter(card => card.tags?.includes(tag)).length >= 3, tag);
  }
  const state = E.createRun({ characterId: 'alchemist', seed: 98 });
  assert.equal(E.getCardRewardWeight(state, D.cardMap.shi_gu_dan), 3 * 1.3);
  state.deck.push({ uid: 'a', id: 'wan_du', up: false }, { uid: 'b', id: 'yin_du', up: false });
  assert.equal(E.getCardRewardWeight(state, D.cardMap.shi_gu_dan), 3 * 1.3 * 1.25);
  state.deck.push({ uid: 'c', id: 'bai_du_gui_yuan', up: false }, { uid: 'd', id: 'shi_gu_dan', up: false });
  assert.equal(E.getCardRewardWeight(state, D.cardMap.shi_gu_dan), 3 * 1.3 * 1.4);
  assert.equal(E.getCardRewardWeight(E.createRun({ characterId: 'sword', seed: 98 }), D.cardMap.ning_feng), 3 * 1.3);
  const monk = E.createRun({ characterId: 'monk', seed: 98 });
  monk.deck.push({ uid: 'e', id: 'yin_du', up: false }, { uid: 'f', id: 'yin_du', up: false });
  assert.equal(E.getCardRewardWeight(monk, D.cardMap.yin_du), 1);
});

test('第一幕万毒加两次引毒再爆发不会轻易突破百伤', () => {
  const state = battle();
  play(state, 'wan_du');
  play(state, 'yin_du');
  play(state, 'yin_du');
  const result = play(state, 'bai_du_gui_yuan');
  const burst = result.events.find(ev => ev.t === 'statusDetonate');
  assert.ok(burst.damage < 100);
  assert.equal(D.cardMap.yin_du.exhaust, true);
});

test('目标没有可兑现状态时终结牌不会白白烧掉四点炉火', () => {
  for (const id of ['bai_du_gui_yuan', 'chi_lu_fen_tian', 'qing_di_hui_tian']) {
    const state = battle();
    state.combat.characterResource.value = 4;
    const result = play(state, id);
    assert.ok(result.ok, id);
    assert.equal(result.events.some(ev => ev.t === 'statusDetonate'), false, id);
    assert.equal(state.combat.characterResource.value, 4, id);
  }
});
