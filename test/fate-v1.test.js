'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/data.js');
const SIM = require('./sim.js');

function run(characterId = 'sword') { return E.createRun({ characterId, seed: 197 }); }
function fateSeedFor(hit) {
  for (let seed = 0; seed < 10000; seed++) {
    const state = run();
    state.fate.rng = seed;
    if ((E.randFate(state) < .05) === hit) return seed;
  }
  throw new Error('No matching fate seed');
}
function openFate(state) {
  state.fate.rng = fateSeedFor(true);
  E.enterEvent(state);
  assert.equal(state.screen, 'fate');
}
function battle(character, fateId, daoTag, rank = 1) {
  const state = run(character);
  state.fate.itemId = fateId;
  state.fate.triggered = true;
  state.fate.resolved = true;
  state.relics.push(fateId);
  if (daoTag) state.dao.blessings[daoTag] = rank;
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.enemies[0].hp = state.combat.enemies[0].maxHp = 999;
  state.combat.energy = 30;
  state.combat.drawPile = Array.from({ length: 30 }, (_, i) => ({ uid: `draw-${i}`, id: 'jin_ren', up: false }));
  return state;
}
function play(state, id) {
  state.combat.hand = [{ uid: `hand-${state.stats.cardsPlayed}`, id, up: false }];
  return E.playCard(state, 0, 0);
}

test('六件天命分为三件角色专属和三件通用，普通遗物池隔离', () => {
  const items = D.relics.filter(relic => relic.fateOnly);
  assert.equal(items.length, 6);
  assert.deepEqual(items.filter(item => item.character).map(item => item.character).sort(), ['alchemist', 'monk', 'sword']);
  assert.equal(items.filter(item => !item.character).length, 3);
  const state = run();
  for (let i = 0; i < 50; i++) {
    E.generateShop(state);
    assert.equal(state.shop.relics.some(entry => D.relicMap[entry.id].fateOnly), false);
  }
});

test('天命概率逐次升至11%，使用独立随机序列', () => {
  const state = run();
  assert.deepEqual([0, 1, 2, 3, 4].map(misses => E.fateChance(misses)), [.05, .07, .09, .11, .11]);
  assert.equal(state.fate.triggered, false);
  assert.equal(state.fate.rng, (state.seed ^ 0x9E3779B9) >>> 0);
  const mainRng = state.rng;
  E.randFate(state);
  assert.equal(state.rng, mainRng);
  assert.notEqual(state.fate.rng, (state.seed ^ 0x9E3779B9) >>> 0);
});

test('天命错过时普通事件仍沿用主随机序列', () => {
  const withMiss = run();
  const ordinary = run();
  withMiss.fate.rng = fateSeedFor(false);
  ordinary.fate.triggered = true;
  E.enterEvent(withMiss);
  E.enterEvent(ordinary);
  assert.equal(withMiss.screen, 'event');
  assert.equal(withMiss.event.id, ordinary.event.id);
  assert.equal(withMiss.rng, ordinary.rng);
  assert.equal(withMiss.fate.eventMisses, 1);
});

test('天命只在事件触发，候选固化并且每局最多领取一件', () => {
  for (const [character, exclusive] of [['sword', 'fate_sword_box'], ['alchemist', 'fate_alchemy_furnace'], ['monk', 'fate_monk_stele']]) {
    const state = run(character);
    openFate(state);
    assert.deepEqual(state.fate.pending.choices.length, 2);
    assert.equal(state.fate.pending.choices[0], exclusive);
    assert.equal(D.relicMap[state.fate.pending.choices[1]].character, undefined);
    assert.equal(state.event, null);
    assert.equal(state.usedEvents.length, 0);
    const loaded = E.deserialize(E.serialize(state));
    assert.equal(loaded.screen, 'fate');
    assert.deepEqual(loaded.fate.pending.choices, state.fate.pending.choices);
    assert.equal(E.chooseFate(loaded, exclusive).ok, true);
    assert.equal(E.chooseFate(loaded, loaded.fate.pending.choices[1]).ok, false);
    assert.equal(loaded.fate.itemId, exclusive);
    assert.equal(loaded.relics.includes(exclusive), true);
    assert.equal(E.continueFate(loaded).ok, true);
    for (let i = 0; i < 10; i++) {
      E.enterEvent(loaded);
      assert.equal(loaded.screen, 'event');
      E.continueEvent(loaded);
    }
  }
});

test('旧存档补天命状态且不会对已打开的普通事件重新抽取', () => {
  const state = run();
  state.fate.triggered = true;
  E.enterEvent(state);
  const eventId = state.event.id;
  delete state.fate;
  const loaded = E.deserialize(E.serialize(state));
  assert.equal(loaded.screen, 'event');
  assert.equal(loaded.event.id, eventId);
  assert.equal(loaded.fate.triggered, false);
  assert.equal(loaded.fate.rng, (loaded.rng ^ 0x9E3779B9) >>> 0);
});

test('无名剑匣每场第一次剑修终结后补五剑意和一张牌', () => {
  const state = battle('sword', 'fate_sword_box');
  const first = play(state, 'yi_jian_kai_tian');
  assert.equal(first.events.filter(event => event.t === 'fateTrigger').length, 1);
  assert.equal(first.events.filter(event => event.t === 'draw').length >= 1, true);
  assert.equal(state.combat.characterResource.value >= 5, true);
  assert.equal(play(state, 'yi_jian_kai_tian').events.some(event => event.t === 'fateTrigger'), false);
  E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  state.combat.enemies[0].hp = 999;
  state.combat.energy = 30;
  assert.equal(play(state, 'yi_jian_kai_tian').events.some(event => event.t === 'fateTrigger'), true);
});

test('九转丹炉首次毒爆不耗毒，道印机会留至下一次，随后回归普通消耗', () => {
  const state = battle('alchemist', 'fate_alchemy_furnace', 'poison');
  state.combat.enemies[0].statuses.poison = 30;
  const first = play(state, 'bai_du_gui_yuan');
  assert.equal(first.events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(state.combat.enemies[0].statuses.poison, 30);
  assert.equal(state.combat.daoUsed.poison || 0, 0);
  assert.equal(play(state, 'bai_du_gui_yuan').events.some(event => event.t === 'daoTrigger'), true);
  assert.equal(state.combat.enemies[0].statuses.poison, 19);
  play(state, 'bai_du_gui_yuan');
  assert.equal(state.combat.enemies[0].statuses.poison, 9);
});

test('九转丹炉首次火爆和回春兑现保留原层数，空状态不浪费机会', () => {
  const fire = battle('alchemist', 'fate_alchemy_furnace');
  assert.equal(play(fire, 'bai_du_gui_yuan').events.some(event => event.t === 'fateTrigger'), false);
  fire.combat.enemies[0].statuses.burn = 18;
  const hit = play(fire, 'chi_lu_fen_tian');
  assert.equal(hit.events.find(event => event.t === 'statusDetonate' && event.status === 'burn')?.stacks, 18);
  assert.equal(fire.combat.enemies[0].statuses.burn, 18);
  const regen = battle('alchemist', 'fate_alchemy_furnace');
  regen.hp = 60;
  regen.combat.statuses.regen = 8;
  assert.equal(play(regen, 'qing_di_hui_tian').events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(regen.hp > 60, true);
  assert.equal(regen.combat.statuses.regen, 8);
});

test('镇岳神碑护甲和荆棘共用首次兑现，天命先于道印', () => {
  const block = battle('monk', 'fate_monk_stele', 'monk_block', 2);
  block.combat.block = 40;
  assert.equal(play(block, 'han_shan_shi').events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(block.combat.block, 40);
  assert.equal(block.combat.daoUsed.monk_block || 0, 0);
  play(block, 'han_shan_shi');
  assert.equal(block.combat.block, 30);
  const thorn = battle('monk', 'fate_monk_stele', 'monk_thorns');
  thorn.combat.statuses.thorns = 8;
  assert.equal(play(thorn, 'jin_gang_zhen_nu').events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(thorn.combat.statuses.thorns, 8);
  thorn.combat.block = 40;
  assert.equal(play(thorn, 'han_shan_shi').events.some(event => event.t === 'fateTrigger'), false);
  assert.equal(thorn.combat.block, 20);
});

test('五行天书首个周天额外八点穿甲与抽牌，第二次不触发', () => {
  const state = battle('sword', 'fate_five_elements_book');
  state.combat.enemies[0].block = 20;
  state.combat.chain = 4;
  state.combat.currentElement = 'metal';
  const first = play(state, 'liu_yun');
  assert.equal(first.events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(state.combat.enemies[0].hp, 999 - 16);
  assert.equal(first.events.filter(event => event.t === 'draw').length >= 2, true);
  state.combat.chain = 4;
  state.combat.currentElement = 'metal';
  assert.equal(play(state, 'liu_yun').events.some(event => event.t === 'fateTrigger'), false);
});

test('混元珠资源首次满值回灵抽牌，造化玉牒首个道印触发共鸣', () => {
  const pearl = battle('sword', 'fate_hunyuan_pearl');
  pearl.combat.characterResource.value = 9;
  const first = play(pearl, 'ning_feng');
  assert.equal(first.events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(first.events.some(event => event.t === 'energy' && event.amount === 1), true);
  pearl.combat.characterResource.value = 9;
  assert.equal(play(pearl, 'ning_feng').events.some(event => event.t === 'fateTrigger'), false);
  const jade = battle('sword', 'fate_creation_jade', 'sword_intent');
  jade.combat.characterResource.value = 9;
  const resonated = play(jade, 'ning_feng');
  assert.equal(resonated.events.some(event => event.t === 'daoTrigger'), true);
  assert.equal(resonated.events.some(event => event.t === 'fateTrigger'), true);
  assert.equal(resonated.events.some(event => event.t === 'energy' && event.amount === 1), true);
  jade.combat.characterResource.value = 9;
  assert.equal(play(jade, 'ning_feng').events.some(event => event.t === 'fateTrigger'), false);
});

test('模拟器处理天命页面并记录两类选择，提前中断计异常', () => {
  const results = Array.from({ length: 90 }, (_, i) => SIM.runOne(['sword', 'alchemist', 'monk'][i % 3], 10000 + i * 31, 0));
  assert.equal(results.some(result => result.stuck), false);
  const found = results.filter(result => result.fateTriggered);
  assert.ok(found.length > 0);
  assert.ok(found.some(result => D.relicMap[result.fateItem]?.character));
  assert.ok(found.some(result => !D.relicMap[result.fateItem]?.character));
});

test('天命首次免消耗在卡牌预览中与实际结算一致', () => {
  const poison = battle('alchemist', 'fate_alchemy_furnace', 'poison');
  poison.combat.enemies[0].statuses.poison = 30;
  poison.combat.hand = [{ uid: 'preview', id: 'bai_du_gui_yuan', up: false }];
  assert.equal(E.getPreview(poison, 0, 0).statusConsumed, 0);
  E.playCard(poison, 0, 0);
  poison.combat.hand = [{ uid: 'preview-2', id: 'bai_du_gui_yuan', up: false }];
  assert.equal(E.getPreview(poison, 0, 0).statusConsumed, 11);
  const block = battle('monk', 'fate_monk_stele', 'monk_block');
  block.combat.block = 40;
  block.combat.hand = [{ uid: 'preview', id: 'han_shan_shi', up: false }];
  assert.equal(E.getPreview(block, 0, 0).blockConsumed, 0);
  E.playCard(block, 0, 0);
  block.combat.hand = [{ uid: 'preview-2', id: 'han_shan_shi', up: false }];
  assert.equal(E.getPreview(block, 0, 0).blockConsumed, 10);
});

test('零护甲兑现不会耗掉镇岳神碑或山河不动的首次机会', () => {
  const state = battle('monk', 'fate_monk_stele', 'monk_block');
  state.combat.block = 0;
  assert.equal(play(state, 'han_shan_shi').events.some(event => event.t === 'fateTrigger' || event.t === 'daoTrigger'), false);
  assert.equal(state.combat.fateUsed.fate_monk_stele || false, false);
  assert.equal(state.combat.daoUsed.monk_block || 0, 0);
  state.combat.block = 40;
  play(state, 'han_shan_shi');
  assert.equal(state.combat.block, 40);
  play(state, 'han_shan_shi');
  assert.equal(state.combat.block, 30);
});
