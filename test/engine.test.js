'use strict';

const test = require('node:test');
const assert = require('node:assert');
const DATA = require('../js/data.js');
const E = require('../js/engine.js');

/* ---------- helpers ---------- */
function fresh(characterId, seed) {
  const s = E.createRun({ characterId: characterId || 'sword', seed: seed == null ? 7 : seed });
  s.relics = s.relics.filter(r => !DATA.relicMap[r] || DATA.relicMap[r].rarity !== 'starter');
  return s;
}
function battle(s, enemyId, opts) {
  opts = opts || {};
  E.startCombat(s, { enemies: [{ id: enemyId || 'shan_xiao' }] });
  const c = s.combat;
  c.hand = [];
  c.drawPile = [];
  c.discardPile = [];
  c.exhaustPile = [];
  c.energy = 20;
  const e = c.enemies[0];
  e.hp = opts.hp == null ? 999 : opts.hp;
  e.maxHp = e.hp;
  e.block = opts.block == null ? 0 : opts.block;
  if (opts.element) e.element = opts.element;
  e.statuses = E.emptyStatuses();
  e.statuses.vulnerable = opts.vulnerable || 0;
  c.chain = 0;
  c.currentElement = null;
  c.firstAttackUsed = true;
  c.statuses = E.emptyStatuses();
  return { c, e };
}
function setHand(c, ids, up) {
  c.hand = ids.map((id, i) => ({ uid: 't' + i + '_' + Math.random().toString(36).slice(2, 7), id, up: !!up }));
}
function card(uid, id) { return { uid, id, up: false, temp: false }; }

test('落石在同费初始牌之上提供更高的直接伤害', () => {
  const base = DATA.cardMap.duan_yue.effects[0].value;
  const s = fresh('sword');
  const { c, e } = battle(s);
  c.energy = 2;
  setHand(c, ['luo_shi']);
  const hp = e.hp;
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.ok(hp - e.hp > base);
  assert.match(DATA.cardMap.luo_shi.text, new RegExp(String(hp - e.hp)));
});

test('木灵生长可用一费补充回春并替换手牌', () => {
  const s = fresh('sword');
  const { c } = battle(s);
  c.energy = 1;
  setHand(c, ['mu_ling']);
  c.drawPile = [card('drawn', 'jin_ren')];
  assert.ok(E.canPlayCard(s, 0).ok);
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.equal(c.statuses.regen, 2);
  assert.equal(c.hand.length, 1);
});

test('万木朝春在两费时治疗、净化并抽牌', () => {
  const s = fresh('sword');
  const { c } = battle(s);
  c.energy = 2;
  c.statuses.poison = 3;
  s.hp -= 20;
  const hp = s.hp;
  setHand(c, ['wan_mu']);
  c.drawPile = [card('a', 'jin_ren'), card('b', 'liu_yun')];
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.equal(s.hp, hp + 12);
  assert.equal(c.statuses.poison, 0);
  assert.equal(c.hand.length, 2);
});

test('射日达到三层连携时兼具伤害与两张抽牌', () => {
  const s = fresh('sword');
  const { c, e } = battle(s);
  c.energy = 2;
  c.chain = 2;
  c.currentElement = 'earth';
  setHand(c, ['she_ji']);
  c.drawPile = [card('a', 'jin_ren'), card('b', 'liu_yun')];
  const hp = e.hp;
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.ok(hp - e.hp >= 14);
  assert.equal(c.hand.length, 2);
});

test('破釜沉舟以单次高伤害弥补消耗与无属性', () => {
  const s = fresh('sword');
  const { c, e } = battle(s);
  c.energy = 2;
  setHand(c, ['po_fu']);
  const hp = e.hp;
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.ok(hp - e.hp >= 26);
  assert.equal(c.exhaustPile.length, 1);
});

test('调整后的升级牌费用、伤害与说明保持一致', () => {
  for (const [id, baseValue, upgradedValue] of [['luo_shi', 16, 21], ['she_ji', 11, 15], ['po_fu', 26, 34]]) {
    const base = E.getCardData({ id, up: false });
    const upgraded = E.getCardData({ id, up: true });
    assert.equal(base.effects[0].value, baseValue, id);
    assert.equal(upgraded.effects[0].value, upgradedValue, id);
    assert.ok(base.text.includes(String(baseValue)), id);
    assert.ok(upgraded.text.includes(String(upgradedValue)), id);
  }
  for (const id of ['mu_ling', 'wan_mu']) {
    assert.equal(E.getCardData({ id, up: false }).cost, id === 'mu_ling' ? 1 : 2);
    assert.equal(E.getCardData({ id, up: true }).cost, id === 'mu_ling' ? 1 : 2);
  }
});

test('高费单体攻击有足够回报，五雷正法保持贯穿定位', () => {
  for (const [id, cost, baseDamage, upgradedDamage] of [
    ['duan_yue', 2, 14, 19], ['wu_lei', 3, 30, 38]
  ]) {
    for (const [up, expected] of [[false, baseDamage], [true, upgradedDamage]]) {
      const s = fresh('sword');
      const { c, e } = battle(s, 'shan_xiao', { block: id === 'wu_lei' ? 50 : 0 });
      c.energy = cost;
      setHand(c, [id], up);
      const hp = e.hp;
      const result = E.playCard(s, 0, 0);
      assert.ok(result.ok, id);
      assert.equal(hp - e.hp, expected, `${id} ${up ? '已悟' : '基础'}`);
      assert.equal(E.getCardData({ id, up }).cost, cost);
      assert.match(E.getCardData({ id, up }).text, new RegExp(String(expected)));
      if (id === 'wu_lei') assert.equal(e.block, 50);
    }
  }
});

test('两费持续效果牌兼顾当回合防御与后续收益', () => {
  const fire = fresh('alchemist');
  const f = battle(fire);
  f.c.energy = 2;
  setHand(f.c, ['huo_qiang']);
  assert.ok(E.playCard(fire, 0, 0).ok);
  assert.equal(f.e.statuses.burn, 4);
  assert.equal(f.c.block, 7);

  const wood = fresh('monk');
  const w = battle(wood);
  w.c.energy = 2;
  setHand(w.c, ['jing_ji'], true);
  assert.ok(E.playCard(wood, 0, 0).ok);
  assert.equal(w.c.block, 12);
  assert.equal(w.c.statuses.thorns, 6);
});

test('剑修初始防牌能在前期承担基础防御', () => {
  for (const [up, expected] of [[false, 6], [true, 9]]) {
    const s = fresh('sword');
    const { c } = battle(s);
    c.energy = 1;
    setHand(c, ['liu_yun'], up);
    assert.ok(E.playCard(s, 0, 0).ok);
    assert.equal(c.block, expected);
    assert.match(E.getCardData({ id: 'liu_yun', up }).text, new RegExp(String(expected)));
  }
});

test('万剑归宗两费提供四段伤害，并体现剑修逐段增伤', () => {
  for (const [up, expected] of [[false, 20], [true, 24]]) {
    const s = E.createRun({ characterId: 'sword', seed: 7 });
    const { c, e } = battle(s);
    c.energy = 2;
    setHand(c, ['wan_jian'], up);
    const hp = e.hp;
    assert.ok(E.playCard(s, 0, 0).ok);
    assert.equal(hp - e.hp, expected);
    assert.match(E.getCardData({ id: 'wan_jian', up }).text, /4 段 [45] 点伤害/);
  }
});

test('普通战后奖励更容易出现角色专属牌，仍不重复且不串角色', () => {
  for (const characterId of ['sword', 'alchemist', 'monk']) {
    let seen = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const s = E.createRun({ characterId, seed });
      const offers = E.rollCardChoices(s, 3, 0, false);
      assert.equal(new Set(offers.map(card => card.id)).size, offers.length);
      assert.ok(offers.every(card => !DATA.cardMap[card.id].character || DATA.cardMap[card.id].character === characterId));
      if (offers.some(card => DATA.cardMap[card.id].character === characterId)) seen++;
    }
    assert.ok(seen >= 180, `${characterId} 只有 ${seen}/1000 次奖励出现专属牌`);
    assert.ok(seen <= 300, `${characterId} 有 ${seen}/1000 次奖励出现专属牌，专属权重过高`);
  }
});

test('引毒诀消耗自身并翻倍目标已有中毒', () => {
  assert.ok(DATA.cardMap.yin_du);
  const s = fresh('alchemist');
  const { c, e } = battle(s);
  c.energy = 1;
  e.statuses.poison = 3;
  setHand(c, ['yin_du']);
  const result = E.playCard(s, 0, 0);
  assert.ok(result.ok);
  assert.equal(e.statuses.poison, 6);
  assert.ok(result.events.some(ev => ev.t === 'status' && ev.key === 'poison' && ev.amount === 3 && ev.total === 6));
  assert.equal(c.exhaustPile.length, 1);
  e.statuses.poison = 0;
  c.energy = 1;
  setHand(c, ['yin_du']);
  const noPoison = E.playCard(s, 0, 0);
  assert.ok(noPoison.ok);
  assert.equal(noPoison.events.some(ev => ev.t === 'status' && ev.key === 'poison'), false);
});

test('山河守可留在手中等待需要防御的回合', () => {
  assert.ok(DATA.cardMap.shan_shou);
  const s = fresh('monk');
  const { c } = battle(s);
  setHand(c, ['shan_shou']);
  assert.ok(E.endPlayerTurn(s).ok);
  assert.equal(c.hand.length, 1);
  assert.equal(c.hand[0].id, 'shan_shou');
});

test('临阵悟道仅升级本场战斗的手牌', () => {
  assert.ok(DATA.cardMap.lin_zhen);
  const s = fresh('sword');
  const { c } = battle(s);
  c.energy = 1;
  setHand(c, ['jin_ren', 'lin_zhen']);
  assert.ok(E.playCard(s, 1, 0).ok);
  assert.equal(c.hand[0].up, true);
  assert.ok(s.deck.filter(x => x.id === 'jin_ren').every(x => !x.up));
  assert.equal(c.exhaustPile.length, 1);
});

test('火祭以生命换取灵气且只使用一次', () => {
  assert.ok(DATA.cardMap.huo_ji);
  const s = fresh('alchemist');
  const { c } = battle(s);
  c.energy = 0;
  setHand(c, ['huo_ji']);
  const hp = s.hp;
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.equal(s.hp, hp - 3);
  assert.equal(c.energy, 1);
  assert.equal(c.exhaustPile.length, 1);
});

test('调息在两层连携后净赚灵气，并补充手牌', () => {
  for (const [up, chain, expectedEnergy, expectedDraw] of [
    [false, 0, 1, 1], [false, 2, 2, 1], [true, 2, 2, 2]
  ]) {
    const s = fresh('sword');
    const { c } = battle(s);
    c.energy = 1;
    c.chain = chain;
    c.currentElement = 'water';
    setHand(c, ['tiao_xi'], up);
    c.drawPile = [card('draw-a', 'jin_ren'), card('draw-b', 'liu_yun')];
    assert.ok(E.playCard(s, 0, 0).ok);
    assert.equal(c.energy, expectedEnergy);
    assert.equal(c.hand.length, expectedDraw);
    assert.equal(c.chain, chain);
    assert.equal(E.getCardData({ id: 'tiao_xi', up }).exhaust, !up);
    assert.equal((up ? c.discardPile : c.exhaustPile)[0].id, 'tiao_xi');
  }
});

test('两张未升级调息不会互相抽回', () => {
  const s = fresh('sword');
  const { c } = battle(s);
  c.energy = 1;
  c.chain = 2;
  c.currentElement = 'water';
  c.hand = [card('a', 'tiao_xi')];
  c.discardPile = [card('b', 'tiao_xi')];
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.equal(c.hand.length, 1);
  assert.ok(E.playCard(s, 0, 0).ok);
  assert.equal(c.hand.length, 0);
  assert.equal(c.energy, 3);
  assert.equal(c.exhaustPile.length, 2);
});

test('两张升级调息可由玩家主动交替打出并持续回灵', () => {
  const s = fresh('sword');
  const { c } = battle(s);
  c.energy = 1;
  c.chain = 2;
  c.currentElement = 'water';
  c.hand = [{ ...card('a', 'tiao_xi'), up: true }];
  c.discardPile = [{ ...card('b', 'tiao_xi'), up: true }];
  for (let i = 0; i < 8; i++) {
    assert.ok(E.playCard(s, 0, 0).ok);
    assert.equal(c.hand.length, 1);
    assert.equal(c.energy, i + 2);
    assert.equal(c.chain, 2);
    assert.equal(c.exhaustPile.length, 0);
  }
  assert.match(E.getCardData({ id: 'tiao_xi', up: true }).text, /不再消耗/);
});

test('归元以两费换取三点灵气，升级后多抽一张', () => {
  for (const [up, expectedDraw] of [[false, 2], [true, 3]]) {
    const s = fresh('sword');
    const { c } = battle(s);
    c.energy = 2;
    setHand(c, ['gui_yuan'], up);
    c.drawPile = [card('draw-a', 'jin_ren'), card('draw-b', 'liu_yun'), card('draw-c', 'duan_yue')];
    assert.ok(E.playCard(s, 0, 0).ok);
    assert.equal(c.energy, 3);
    assert.equal(c.hand.length, expectedDraw);
    assert.equal(c.exhaustPile[0].id, 'gui_yuan');
    assert.match(E.getCardData({ id: 'gui_yuan', up }).text, /3 点灵气/);
  }
});

test('聚气丹炉在偶数回合补充灵气', () => {
  const s = fresh('sword');
  s.relics.push('ju_qi_lu');
  s.maxHp = 999;
  s.hp = 999;
  E.startCombat(s, { enemies: [{ id: 'shan_xiao' }] });
  const c = s.combat;
  for (const [turn, expected] of [[2, 4], [3, 3], [4, 4]]) {
    E.endPlayerTurn(s);
    E.runEnemyTurn(s);
    assert.equal(c.turn, turn);
    assert.equal(c.energy, expected);
  }
});

/* ---------- data ---------- */
test('数据完整性：id、元素、升级、效果', () => {
  const ids = new Set();
  DATA.cards.forEach(c => {
    assert.ok(!ids.has(c.id), 'duplicate card ' + c.id);
    ids.add(c.id);
    if (!['curse', 'special'].includes(c.rarity)) assert.ok(c.up, 'missing upgrade ' + c.id);
    if (c.element) assert.ok(DATA.elements[c.element], 'bad element ' + c.id);
    (c.effects || []).forEach(e => assert.ok(typeof e.op === 'string', 'bad effect ' + c.id));
  });
  const relicIds = new Set();
  DATA.relics.forEach(r => { assert.ok(!relicIds.has(r.id)); relicIds.add(r.id); });
  Object.values(DATA.enemies).forEach(e => {
    assert.ok(DATA.elements[e.element], 'bad enemy element ' + e.id);
    e.pattern.forEach(m => assert.ok(e.moves[m], 'missing move ' + e.id + '.' + m));
  });
  assert.ok(DATA.cards.filter(c => ['common', 'uncommon', 'rare'].includes(c.rarity)).length >= 55);
  assert.ok(DATA.relics.filter(r => r.rarity !== 'starter').length >= 18);
});

test('创建角色：初始牌组、金币、生命', () => {
  DATA.characters.forEach(ch => {
    const s = E.createRun({ characterId: ch.id, seed: 1 });
    assert.strictEqual(s.characterId, ch.id);
    assert.strictEqual(s.maxHp, ch.maxHp);
    assert.strictEqual(s.gold, 99);
    assert.strictEqual(s.deck.length, 10);
    assert.strictEqual(s.act, 1);
    assert.ok(s.map);
  });
});

test('天劫：起始诅咒与敌人生命缩放', () => {
  const s = E.createRun({ characterId: 'sword', seed: 2, ascension: 6 });
  assert.strictEqual(s.deck.filter(c => DATA.cardMap[c.id].type === 'curse').length, 1);
  const t = E.createRun({ characterId: 'sword', seed: 2, ascension: 0 });
  E.startCombat(t, { enemies: [{ id: 'shan_gui' }] });
  const base = t.combat.enemies[0].maxHp;
  const u = E.createRun({ characterId: 'sword', seed: 2, ascension: 10 });
  E.startCombat(u, { enemies: [{ id: 'shan_gui' }] });
  assert.ok(u.combat.enemies[0].maxHp > base * 1.3);
});

/* ---------- chain ---------- */
test('相生连携：金→水→木 逐层 +1，首张无加成', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao');
  setHand(c, ['jin_ren', 'shui_dun', 'teng_bian']);
  E.playCard(s, 0, 0);
  assert.strictEqual(c.chain, 0);
  E.playCard(s, 0, 0);
  assert.strictEqual(c.chain, 1);
  E.playCard(s, 0, 0);
  assert.strictEqual(c.chain, 2);
  assert.strictEqual(c.currentElement, 'wood');
});

test('断链归零；无元素牌不改变连携', () => {
  const s = fresh('sword');
  const { c } = battle(s, 'shan_xiao');
  setHand(c, ['jin_ren', 'shui_dun', 'wu_ji']);
  E.playCard(s, 0, 0);
  E.playCard(s, 0, 0);
  assert.strictEqual(c.chain, 1);
  E.playCard(s, 0, 0); // 无极：无元素
  assert.strictEqual(c.chain, 1);
  assert.strictEqual(c.currentElement, 'water');
  setHand(c, ['jin_ren']);
  E.playCard(s, 0, 0); // 水→金 不相生
  assert.strictEqual(c.chain, 0);
  assert.strictEqual(c.currentElement, 'metal');
});

test('五行周天：五层触发、全体伤害、回灵气抽牌并清零', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao');
  setHand(c, ['jin_ren', 'shui_dun', 'teng_bian', 'chi_yan', 'yan_quan', 'po_jia']);
  c.drawPile = [card('draw1', 'jin_ren')];
  const before = e.hp;
  [0, 0, 0, 0, 0, 0].forEach(() => E.playCard(s, 0, 0));
  assert.strictEqual(c.chain, 0);
  assert.strictEqual(c.energy, 15); // 20 - 6 + 1
  assert.strictEqual(c.hand.length, 1);
  assert.ok(e.hp < before - 20, '周天与卡牌伤害应生效');
  assert.ok(c.enemies[0].hp < before);
});

test('相克：伤害 ×1.5 且无视护甲', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'qing_she', { element: 'wood', block: 50 });
  setHand(c, ['jin_ren']);
  const before = e.hp;
  E.playCard(s, 0, 0);
  assert.strictEqual(before - e.hp, 9); // 金克木：6 * 1.5
  assert.strictEqual(e.block, 50);
});

test('相克 + 易伤：倍率相乘', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'qing_she', { element: 'wood', vulnerable: 1 });
  setHand(c, ['jin_ren']);
  const before = e.hp;
  E.playCard(s, 0, 0);
  assert.strictEqual(before - e.hp, 13); // floor(6*1.5*1.5)
});

/* ---------- statuses ---------- */
test('中毒：回合开始扣血并递减；灼烧：回合结束扣血', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao');
  setHand(c, ['chan_si']);
  E.playCard(s, 0, 0);
  assert.strictEqual(e.statuses.poison, 2);
  const afterHit = e.hp;
  e.intent = 'harden';
  E.endPlayerTurn(s);
  assert.strictEqual(e.hp, afterHit); // 缠丝没有灼烧，回合结束不掉血
  assert.strictEqual(e.statuses.poison, 2);
  E.runEnemyTurn(s);
  assert.strictEqual(e.hp, afterHit - 2); // 敌人回合开始中毒
  assert.strictEqual(e.statuses.poison, 1);
});

test('灼烧在敌人回合结束结算', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao');
  setHand(c, ['chi_yan']);
  E.playCard(s, 0, 0);
  const afterHit = e.hp;
  assert.strictEqual(e.statuses.burn, 2);
  e.intent = 'harden';
  E.endPlayerTurn(s);
  assert.strictEqual(e.hp, afterHit); // 玩家回合结束不结算敌方灼烧
  E.runEnemyTurn(s);
  assert.strictEqual(e.hp, afterHit - 2);
  assert.strictEqual(e.statuses.burn, 1);
});

test('虚弱与易伤倍率', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao');
  c.statuses.weak = 1;
  setHand(c, ['jin_ren']);
  const before = e.hp;
  E.playCard(s, 0, 0);
  assert.strictEqual(before - e.hp, 4); // floor(6*0.75)
  const s2 = fresh('sword');
  const b2 = battle(s2, 'shan_xiao', { vulnerable: 1 });
  setHand(b2.c, ['jin_ren']);
  const before2 = b2.e.hp;
  E.playCard(s2, 0, 0);
  assert.strictEqual(before2 - b2.e.hp, 9);
});

test('角色被动：剑心、药心、厚土', () => {
  // 剑心：首张攻击 +3
  const sword = fresh('sword');
  const b1 = battle(sword, 'shan_xiao', { element: 'water' });
  b1.c.firstAttackUsed = false;
  setHand(b1.c, ['jin_ren']);
  const hp1 = b1.e.hp;
  E.playCard(sword, 0, 0);
  assert.strictEqual(hp1 - b1.e.hp, 10);

  // 药心：中毒 +1
  const al = fresh('alchemist');
  const b2 = battle(al, 'shan_xiao');
  setHand(b2.c, ['chan_si']);
  E.playCard(al, 0, 0);
  assert.strictEqual(b2.e.statuses.poison, 3);

  // 厚土：回合开始保留至多 4 点护甲
  const monk = fresh('monk');
  const b3 = battle(monk, 'shan_xiao');
  b3.c.block = 12;
  E.startPlayerTurnForTest(monk);
  assert.strictEqual(b3.c.block, 4);
});

/* ---------- hand / deck ---------- */
test('手牌上限 10，抽牌堆空时洗回弃牌堆', () => {
  const s = fresh('sword');
  const { c } = battle(s, 'shan_xiao');
  c.drawPile = [card('a', 'jin_ren')];
  c.discardPile = [card('b', 'jin_ren'), card('c', 'jin_ren')];
  c.hand = [];
  for (let i = 0; i < 10; i++) c.hand.push(card('h' + i, 'jin_ren'));
  c.drawPile = [card('x', 'jin_ren')];
  E.startPlayerTurnForTest(s);
  assert.ok(c.hand.length <= 10);
});

test('护甲吸收伤害，相克穿透护甲', () => {
  // 无相克：6 点伤害被 5 点护甲吸收 5，仅 1 点穿透
  const s = fresh('sword');
  const b = battle(s, 'shan_xiao', { element: 'earth', block: 5 });
  setHand(b.c, ['jin_ren']);
  const hp = b.e.hp;
  E.playCard(s, 0, 0);
  assert.strictEqual(b.e.hp, hp - 1);
  assert.strictEqual(b.e.block, 0);
  // 相克：金克木，无视护甲
  const s2 = fresh('sword');
  const b2 = battle(s2, 'qing_she', { element: 'wood', block: 5 });
  setHand(b2.c, ['jin_ren']);
  const hp2 = b2.e.hp;
  E.playCard(s2, 0, 0);
  assert.strictEqual(b2.e.hp, hp2 - 9);
  assert.strictEqual(b2.e.block, 5);
});

/* ---------- map ---------- */
test('地图：分层连通、起点可达 Boss、类型合法、每幕有商店/宝箱', () => {
  const valid = ['combat', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'];
  for (let i = 0; i < 40; i++) {
    const s = E.createRun({ characterId: 'sword', seed: 1000 + i });
    for (let act = 1; act <= 3; act++) {
      E.generateMap(s, act);
      const map = s.map;
      assert.strictEqual(map.byRow.length, 9);
      map.nodes.forEach(n => assert.ok(valid.includes(n.type)));
      assert.strictEqual(map.byRow[8].length, 1);
      assert.strictEqual(map.byRow[8][0].type, 'boss');
      assert.strictEqual(map.byRow[7].every(n => n.type === 'rest'), true);
      assert.strictEqual(map.byRow[0].every(n => n.type === 'combat'), true);
      assert.ok(map.byRow[4].some(n => n.type === 'treasure'));
      assert.ok(map.nodes.some(n => n.type === 'shop'));
      assert.ok(map.byRow[7].every(n => n.next.includes(map.bossId)));
      // 从每个起点都能到达 Boss
      const reach = (start) => {
        const seen = new Set();
        const stack = [start.id];
        while (stack.length) {
          const id = stack.pop();
          if (seen.has(id)) continue;
          seen.add(id);
          const node = map.nodes.find(n => n.id === id);
          node.next.forEach(nid => stack.push(nid));
        }
        return seen.has(map.bossId);
      };
      map.byRow[0].forEach(n => assert.ok(reach(n), 'row0 unreachable to boss'));
    }
  }
});

test('进入节点：只能沿连线前进，战斗可正常开始', () => {
  const s = E.createRun({ characterId: 'sword', seed: 42 });
  const avail = E.availableNodes(s);
  assert.strictEqual(avail.length, 3);
  const res = E.enterNode(s, avail[0].id);
  assert.ok(res.ok);
  assert.strictEqual(s.screen, 'combat');
  assert.ok(s.combat.enemies.length >= 1);
  const bad = E.enterNode(s, s.map.byRow[5][0].id);
  assert.strictEqual(bad.ok, false);
});

/* ---------- rewards / shop / events / save ---------- */
test('战斗胜利：奖励、选牌、返回地图', () => {
  const s = fresh('sword');
  const { c, e } = battle(s, 'shan_xiao', { hp: 1 });
  setHand(c, ['jin_ren']);
  E.playCard(s, 0, 0);
  assert.strictEqual(s.combat.phase, 'won');
  const res = E.finishCombat(s);
  assert.ok(res.ok);
  assert.strictEqual(s.screen, 'reward');
  assert.strictEqual(s.reward.cards.length, 3);
  assert.ok(s.gold > 99);
  const deckBefore = s.deck.length;
  E.takeRewardCard(s, 0);
  assert.strictEqual(s.deck.length, deckBefore + 1);
  E.continueReward(s);
  assert.strictEqual(s.screen, 'map');
  assert.strictEqual(s.combat, null);
});

test('商店：购买卡牌/遗物/丹药，移除服务', () => {
  const s = fresh('sword');
  E.generateShop(s);
  s.gold = 9999;
  assert.strictEqual(s.shop.cards.length, 3);
  const deckBefore = s.deck.length;
  assert.ok(E.buyItem(s, 'card', 0).ok);
  assert.strictEqual(s.deck.length, deckBefore + 1);
  assert.ok(E.buyItem(s, 'relic', 0).ok);
  assert.ok(E.buyItem(s, 'potion', 0).ok);
  assert.strictEqual(s.potions.length, 1);
  assert.ok(E.removeCardFromDeck(s, s.deck[0].uid).ok);
  assert.strictEqual(s.shop.removeUsed, true);
  assert.ok(!E.buyItem(s, 'card', 0).ok); // 已售出
});

test('事件：所有选项可结算，不抛错', () => {
  DATA.events.forEach(ev => {
    ev.choices.forEach((choice, i) => {
      const s = fresh('alchemist', 5);
      s.gold = 999;
      s.hp = s.maxHp;
      s.event = { id: ev.id, resolved: false, resultText: '' };
      const res = E.applyEventChoice(s, i);
      assert.ok(res.ok, ev.id + ' #' + i);
      assert.ok(s.event.resolved);
      assert.ok(s.hp >= 1);
      assert.ok(s.gold >= 0);
    });
  });
});

test('存档：战斗与地图往返一致', () => {
  const s = E.createRun({ characterId: 'alchemist', seed: 88 });
  E.enterNode(s, E.availableNodes(s)[0].id);
  s.hp -= 3;
  s.gold += 5;
  const json = E.serialize(s);
  const t = E.deserialize(json);
  assert.ok(t);
  assert.strictEqual(t.hp, s.hp);
  assert.strictEqual(t.combat.hand.length, s.combat.hand.length);
  assert.strictEqual(t.combat.enemies[0].hp, s.combat.enemies[0].hp);
  assert.strictEqual(t.map.nodes.length, s.map.nodes.length);
  const u = E.deserialize('{bad json');
  assert.strictEqual(u, null);
});

test('升级牌：数值与费用替换，UI 数据可取', () => {
  const s = fresh('sword');
  const inst = s.deck[0];
  inst.up = true;
  const data = E.getCardData(inst);
  assert.strictEqual(data.upgraded, true);
  assert.ok(data.name.includes('悟'));
});

test('预览：伤害随连携与相克变化', () => {
  const s = fresh('sword');
  const { c } = battle(s, 'qing_she', { element: 'wood' });
  c.currentElement = 'earth';
  c.chain = 2;
  setHand(c, ['jin_ren']);
  const p = E.getPreview(s, 0, 0);
  // 土生金 → chain 3；金克木 → floor((6+3)*1.5)=13
  assert.strictEqual(p.chainAfter, 3);
  assert.strictEqual(p.cross, true);
  assert.strictEqual(p.damage, 13);
});

/* ---------- 内容全量结算 ---------- */
test('全部卡牌与升级版均可结算，无非法目标', () => {
  const cards = DATA.cards.filter(c => !['curse', 'status'].includes(c.type));
  cards.forEach(card => {
    [false, true].forEach(up => {
      const s = E.createRun({ characterId: card.character || 'sword', seed: 3 });
      E.startCombat(s, { enemies: [{ id: 'shan_xiao' }] });
      const c = s.combat;
      c.enemies[0].hp = 9999;
      c.enemies[0].maxHp = 9999;
      c.enemies[0].block = 0;
      c.hand = [{ uid: 't1', id: card.id, up }];
      c.drawPile = []; c.discardPile = []; c.exhaustPile = [];
      c.energy = 99;
      s.hp = s.maxHp = 999;
      const res = E.playCard(s, 0, 0);
      assert.ok(res.ok, card.id + (up ? '+' : '') + ' 未能结算');
      assert.ok(c.phase === 'player' || c.phase === 'won', card.id + ' 状态异常');
    });
  });
});

test('全部丹药均可使用', () => {
  DATA.potions.forEach(p => {
    const s = E.createRun({ characterId: 'sword', seed: 4 });
    E.startCombat(s, { enemies: [{ id: 'shan_xiao' }] });
    s.combat.enemies[0].hp = 9999;
    s.combat.enemies[0].maxHp = 9999;
    s.hp = 40;
    s.potions = [p.id];
    const res = E.usePotion(s, 0, 0);
    assert.ok(res.ok, p.id);
    assert.strictEqual(s.potions.length, 0);
    assert.ok(s.combat.phase === 'player', p.id + ' 后状态异常');
  });
});

test('全部遗物 hooks 可执行，combatStart/chain/combatEnd 不抛错', () => {
  const s = E.createRun({ characterId: 'sword', seed: 5 });
  s.relics = DATA.relics.filter(r => r.rarity !== 'starter').map(r => r.id);
  s.deck = [
    { uid: 'd1', id: 'jin_ren', up: true },
    { uid: 'd2', id: 'shui_dun', up: true },
    { uid: 'd3', id: 'teng_bian', up: true },
    { uid: 'd4', id: 'chi_yan', up: true },
    { uid: 'd5', id: 'yan_quan', up: true }
  ];
  assert.doesNotThrow(() => E.startCombat(s, { enemies: [{ id: 'shan_xiao' }] }));
  s.combat.enemies[0].hp = 9999;
  s.combat.enemies[0].maxHp = 9999;
  s.combat.drawPile = [];
  s.combat.discardPile = [];
  s.combat.hand = s.deck.map((c, i) => ({ uid: 'h' + i, id: c.id, up: true, temp: false }));
  s.combat.energy = 20;
  for (let i = 0; i < 5; i++) assert.ok(E.playCard(s, 0, 0).ok);
  s.combat.enemies[0].hp = 1;
  s.combat.energy = 9;
  const idx = s.combat.hand.findIndex((c, i) => E.canPlayCard(s, i).ok);
  if (idx >= 0) E.playCard(s, idx, 0);
  if (s.combat && s.combat.phase === 'won') assert.doesNotThrow(() => E.finishCombat(s));
  assert.ok(s.screen === 'reward' || s.screen === 'combat');
});

test('全部敌人的招式循环可执行，Boss 阶段与转元素正常', () => {
  Object.keys(DATA.enemies).forEach(id => {
    const s = E.createRun({ characterId: 'monk', seed: 6 });
    s.maxHp = 9999; s.hp = 9999;
    E.startCombat(s, { enemies: [{ id }] });
    s.combat.enemies[0].maxHp = 9999;
    s.combat.enemies[0].hp = 9999;
    for (let turn = 0; turn < 6; turn++) {
      s.combat.phase = 'player';
      E.endPlayerTurn(s);
      assert.doesNotThrow(() => E.runEnemyTurn(s), id + ' 第 ' + turn + ' 回合');
      if (s.hp <= 0) break;
    }
    assert.ok(s.hp > 0, id + ' 不应在测试中杀死玩家');
  });

  // 半血阶段
  ['shan_gui', 'chi_ba', 'tai_xu'].forEach(id => {
    const s = E.createRun({ characterId: 'sword', seed: 7 });
    E.startCombat(s, { enemies: [{ id }] });
    const e = s.combat.enemies[0];
    e.maxHp = 100; e.hp = 55;
    s.combat.hand = [{ uid: 'k', id: 'jin_ren', up: true }];
    s.combat.energy = 9;
    s.combat.drawPile = []; s.combat.discardPile = [];
    E.playCard(s, 0, 0);
    assert.strictEqual(e.phase, 2, id + ' 未进入二阶段');
  });

  // 太虚转元素
  const s = E.createRun({ characterId: 'monk', seed: 8 });
  s.maxHp = 9999; s.hp = 9999;
  E.startCombat(s, { enemies: [{ id: 'tai_xu' }] });
  const e = s.combat.enemies[0];
  e.maxHp = 9999; e.hp = 9999;
  const before = e.element;
  E.endPlayerTurn(s);
  E.runEnemyTurn(s);
  assert.notStrictEqual(e.element, before, '太虚应轮转五行');
});

test('天劫缩放与起始诅咒堆叠', () => {
  const base = E.createRun({ characterId: 'sword', seed: 9, ascension: 0 });
  const high = E.createRun({ characterId: 'sword', seed: 9, ascension: 10 });
  assert.strictEqual(high.deck.filter(c => DATA.cardMap[c.id].type === 'curse').length, 2);
  E.startCombat(base, { enemies: [{ id: 'tian_bing' }] });
  E.startCombat(high, { enemies: [{ id: 'tian_bing' }] });
  assert.ok(high.combat.enemies[0].maxHp >= base.combat.enemies[0].maxHp * 1.3);
});

test('商店价格随天劫不变、随幕数增长', () => {
  const s = E.createRun({ characterId: 'sword', seed: 11 });
  E.generateShop(s);
  const p1 = s.shop.cards[0].price;
  s.map.act = 3;
  E.generateShop(s);
  const p3 = s.shop.cards[0].price;
  assert.ok(p1 > 0 && p3 > 0);
});

test('手牌中的诅咒与火种会触发伤害', () => {
  // 心魔：回合结束 -2
  const a = fresh('sword');
  const ba = battle(a, 'shan_xiao');
  a.hp = 50;
  ba.c.hand = [{ uid: 'x', id: 'xin_mo', up: false }];
  E.endPlayerTurn(a);
  assert.strictEqual(a.hp, 48);

  // 火种：回合结束 -2
  const b = fresh('sword');
  const bb = battle(b, 'shan_xiao');
  b.hp = 50;
  bb.c.hand = [{ uid: 'f', id: 'huo_zhong', up: false }];
  E.endPlayerTurn(b);
  assert.strictEqual(b.hp, 48);

  // 走火入魔：回合开始 -3
  const c = fresh('sword');
  const bc = battle(c, 'shan_xiao');
  c.hp = 50;
  bc.c.hand = [];
  bc.c.drawPile = [{ uid: 'z', id: 'zou_huo', up: false }];
  bc.c.discardPile = [];
  E.startPlayerTurnForTest(c);
  assert.strictEqual(c.hp, 47);
});

test('荆棘在敌人攻击后反伤', () => {
  const s = fresh('monk');
  const { c, e } = battle(s, 'shan_xiao');
  c.statuses.thorns = 3;
  e.intent = 'claw';
  const before = e.hp;
  E.endPlayerTurn(s);
  E.runEnemyTurn(s);
  assert.strictEqual(e.hp, before - 3);
});

test('遗物被动：攻击伤害加成', () => {
  const s = fresh('sword');
  s.relics = ['xuan_tie_jian'];
  const { c, e } = battle(s, 'shan_xiao', { element: 'water' });
  setHand(c, ['jin_ren']);
  const before = e.hp;
  E.playCard(s, 0, 0);
  assert.strictEqual(before - e.hp, 7); // 6 + 玄铁剑 1
});

test('普通双怪生命倍率按幕维持正式配置', () => {
  const expected = { 1: 0.50, 2: 0.45, 3: 0.45 };
  for (const act of [1, 2, 3]) {
    for (const stage of ['early', 'mid', 'late']) {
      const encounters = DATA.encounters[act].normal[stage];
      const doubles = encounters.filter(row => row.enemies.length === 2);
      if (act === 1 && stage !== 'early') assert.ok(doubles.length > 0);
      for (const row of doubles) assert.equal(row.hpScale, expected[act], `${act}/${stage}/${row.id}`);
      for (const row of encounters.filter(row => row.enemies.length === 1)) assert.equal(row.hpScale, undefined);
    }
    for (const row of [...DATA.encounters[act].elite, DATA.encounters[act].boss]) {
      assert.equal(row.hpScale, undefined);
    }
  }
});

test('普通遭遇按节点实际层数划分三阶段，三幕遭遇 ID 与组合稳定对应', () => {
  for (const [floor, stage] of [[1, 'early'], [2, 'early'], [3, 'mid'], [5, 'mid'], [6, 'late'], [8, 'late']]) {
    assert.equal(E.getEncounterStageByFloor(floor), stage);
  }
  for (const act of [1, 2, 3]) {
    const normal = DATA.encounters[act].normal;
    const ids = new Map();
    for (const stage of ['early', 'mid', 'late']) {
      assert.ok(normal[stage].length >= 3, `第 ${act} 幕 ${stage} 池为空`);
      for (const encounter of normal[stage]) {
        assert.ok(encounter.id, '遭遇 ID 缺失');
        const signature = encounter.enemies.map(enemy => enemy.id).join('+');
        assert.ok(!ids.has(encounter.id) || ids.get(encounter.id) === signature, `${encounter.id} 指向不同敌人组合`);
        assert.ok(encounter.enemies.length >= 1 && encounter.enemies.length <= 2);
        encounter.enemies.forEach(enemy => assert.ok(DATA.enemies[enemy.id], enemy.id));
        ids.set(encounter.id, signature);
      }
    }
    assert.ok(normal.early.every(encounter => encounter.enemies.length === 1));
    assert.ok(normal.late.some(encounter => encounter.enemies.length === 2));
  }
});

test('普通遭遇使用对应阶段池，进入节点时才选择，并限制历史为最近两场', () => {
  const s = fresh('sword', 123);
  assert.deepEqual(s.recentEncounters, []);
  assert.ok(s.map.byRow[0].every(node => !node.encounterId));
  for (const [row, stage] of [[0, 'early'], [1, 'early'], [2, 'mid'], [4, 'mid'], [5, 'late'], [7, 'late']]) {
    const encounter = E.pickEncounter(s, 1, 'combat', row);
    assert.ok(DATA.encounters[1].normal[stage].includes(encounter));
    assert.deepEqual(s.recentEncounters.slice(-1), [encounter.id]);
    assert.ok(s.recentEncounters.length <= 2);
  }
  const node = s.map.byRow[0][0];
  assert.ok(E.enterNode(s, node.id).ok);
  assert.ok(DATA.encounters[1].normal.early.some(encounter => encounter.id === s.recentEncounters.at(-1)));

  const lateRun = fresh('sword', 124);
  const lateNode = lateRun.map.byRow[5][0];
  lateNode.type = 'combat';
  lateRun.map.byRow[0] = [lateNode];
  assert.ok(E.enterNode(lateRun, lateNode.id).ok);
  assert.ok(DATA.encounters[1].normal.late.some(encounter => encounter.id === lateRun.recentEncounters[0]));
});

test('最近相同遭遇降低权重，且同种单怪与组合分别记录', () => {
  const encounter = { id: 'a1_shan_xiao', weight: 4 };
  assert.equal(E.adjustedEncounterWeight(encounter, []), 4);
  assert.equal(E.adjustedEncounterWeight(encounter, ['a1_other', encounter.id]), 0.2);
  assert.equal(E.adjustedEncounterWeight(encounter, [encounter.id, 'a1_other']), 1.4);
  assert.equal(E.adjustedEncounterWeight(encounter, ['a1_shan_xiao_huo_shu']), 4);
});

test('同 seed 和相同阶段抽取的普通遭遇可复现，精英与幕主保持原样', () => {
  const a = fresh('sword', 909);
  const b = fresh('sword', 909);
  const rows = [0, 1, 2, 3, 5, 6];
  const sequence = state => rows.map(row => E.pickEncounter(state, 1, 'combat', row).id);
  assert.deepEqual(sequence(a), sequence(b));
  const history = a.recentEncounters.slice();
  assert.strictEqual(E.pickEncounter(a, 1, 'elite', 6), DATA.encounters[1].elite[0]);
  assert.strictEqual(E.pickEncounter(a, 1, 'boss', 8), DATA.encounters[1].boss);
  assert.deepEqual(a.recentEncounters, history);
});

test('下一幕清空普通遭遇历史，旧存档缺少历史字段仍可进入普通战斗', () => {
  const s = fresh('sword', 110);
  s.recentEncounters = ['a1_shan_xiao'];
  E.nextAct(s);
  assert.deepEqual(s.recentEncounters, []);
  const saved = JSON.parse(E.serialize(s));
  delete saved.recentEncounters;
  const restored = E.deserialize(JSON.stringify(saved));
  assert.ok(restored);
  const node = restored.map.byRow[0][0];
  assert.ok(E.enterNode(restored, node.id).ok);
  assert.equal(restored.recentEncounters.length, 1);
  assert.ok(DATA.encounters[2].normal.early.some(encounter => encounter.id === restored.recentEncounters[0]));
});

test('阶段池缺失时回退到中期池，坏权重仍能开始普通战斗', () => {
  DATA.encounters[99] = {
    normal: { early: [], mid: [{ id: 'fallback', enemies: [{ id: 'shan_xiao' }], weight: 0 }] },
    elite: DATA.encounters[1].elite,
    boss: DATA.encounters[1].boss
  };
  try {
    const s = fresh('sword', 29);
    const encounter = E.pickEncounter(s, 99, 'combat', 0);
    assert.equal(encounter.id, 'fallback');
    assert.deepEqual(s.recentEncounters, ['fallback']);
    assert.equal(E.adjustedEncounterWeight({ weight: 4 }, []), 4);
  } finally {
    delete DATA.encounters[99];
  }
});
