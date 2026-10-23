'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function battle(characterId = 'sword') {
  const state = E.createRun({ characterId, seed: 71 });
  state.relics = [];
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  const combat = state.combat;
  combat.hand = [];
  combat.drawPile = [];
  combat.discardPile = [];
  combat.energy = 20;
  combat.firstAttackUsed = true;
  combat.enemies[0].hp = combat.enemies[0].maxHp = 999;
  return state;
}
function play(state, id, up = false) {
  state.combat.hand.push({ uid: `t${state.nextUid++}`, id, up });
  return E.playCard(state, state.combat.hand.length - 1, 0);
}

test('剑意由攻击、相生和克制积累，单牌最多三点，上限十点', () => {
  const state = battle();
  const combat = state.combat;
  assert.deepEqual(combat.characterResource, { id: 'swordIntent', value: 0, max: 10 });
  combat.enemies[0].element = 'wood';
  combat.currentElement = 'earth';
  const first = play(state, 'jin_ren');
  assert.ok(first.ok);
  assert.equal(combat.characterResource.value, 3);
  assert.ok(first.events.some(event => event.t === 'resource' && event.delta === 3));
  combat.characterResource.value = 9;
  const second = play(state, 'jin_ren');
  assert.ok(second.ok);
  assert.equal(combat.characterResource.value, 10);
  assert.ok(second.events.some(event => event.t === 'resourceReady'));
  const other = battle('alchemist');
  assert.ok(play(other, 'chan_si').ok);
  assert.deepEqual(other.combat.characterResource, { id: 'furnaceFire', value: 1, max: 8 });
});

test('旧存档战斗缺少剑意字段时仍能出牌并恢复资源结构', () => {
  const state = battle();
  delete state.combat.characterResource;
  const restored = E.deserialize(E.serialize(state));
  assert.ok(restored);
  assert.ok(play(restored, 'jin_ren').ok);
  assert.deepEqual(restored.combat.characterResource, { id: 'swordIntent', value: 1, max: 10 });
});

test('剑意终结牌按消耗前剑意结算并贯穿，原有三张专属牌形成资源组件', () => {
  const state = battle();
  const combat = state.combat;
  const enemy = combat.enemies[0];
  combat.characterResource.value = 8;
  enemy.element = 'fire';
  enemy.block = 30;
  const before = enemy.hp;
  const finisher = play(state, 'yi_jian_kai_tian');
  assert.ok(finisher.ok);
  assert.equal(before - enemy.hp, 44);
  assert.equal(enemy.block, 30);
  assert.equal(combat.characterResource.value, 0);
  assert.ok(finisher.events.some(event => event.t === 'resource' && event.delta === -8));

  combat.characterResource.value = 5;
  const hits = E.playCard(state, (combat.hand.push({ uid: 'wan', id: 'wan_jian', up: false }), combat.hand.length - 1), 0);
  assert.ok(hits.ok);
  assert.equal(hits.events.filter(event => event.t === 'damage' && event.target === 'enemy').length, 5);
  combat.characterResource.value = 6;
  enemy.block = 0;
  const hp = enemy.hp;
  assert.ok(play(state, 'po_jun').ok);
  assert.ok(hp - enemy.hp >= 28);
  assert.equal(combat.characterResource.value, 7);
  combat.currentElement = 'metal';
  combat.characterResource.value = 0;
  assert.ok(play(state, 'xin_jian').ok);
  assert.equal(combat.characterResource.value, 3);
});

test('剑修新增六张牌分成三条构筑，循环牌消耗以避免无限回能', () => {
  const ids = ['ning_feng', 'yi_jian_kai_tian', 'xing_yun_jue', 'cang_lang', 'jin_shui_yin', 'tian_he'];
  assert.equal(ids.filter(id => D.cardMap[id]?.character === 'sword').length, 6);
  const count = tag => D.cards.filter(card => card.character === 'sword' && card.tags?.includes(tag)).length;
  for (const tag of ['sword_intent', 'sword_cycle', 'sword_chain']) assert.ok(count(tag) >= 3, tag);
  assert.equal(D.cardMap.xing_yun_jue.exhaust, true);
  assert.equal(D.cardMap.yi_jian_kai_tian.finisher, true);
  assert.equal(D.cardMap.tian_he.finisher, true);
});

test('奖励倾向受牌组标签轻度影响，上限 1.4 且不强制发牌', () => {
  const state = E.createRun({ characterId: 'sword', seed: 98 });
  const card = D.cardMap.ning_feng;
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3);
  state.deck.push({ uid: 'a', id: 'wan_jian', up: false }, { uid: 'b', id: 'po_jun', up: false });
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3 * 1.25);
  state.deck.push({ uid: 'c', id: 'yi_jian_kai_tian', up: false }, { uid: 'd', id: 'ning_feng', up: false });
  assert.equal(E.getCardRewardWeight(state, card), 3 * 1.3 * 1.4);
  assert.equal(E.getCardRewardWeight(state, D.cardMap.teng_bian), 1);
  const offered = E.rollCardChoices(state, 3, 0, false);
  assert.equal(offered.length, 3);
  assert.equal(new Set(offered.map(card => card.id)).size, 3);
});
