'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');

test('所有遗物具有独立图形入口与材质层级', () => {
  const art = require('../js/item-art.js');
  for (const relic of D.relics) {
    const html = art.relicArt(relic.id);
    assert.match(html, /<svg/);
    assert.match(html, new RegExp(`relic-art-${relic.id.replaceAll('_', '-')}`));
    assert.match(html, new RegExp(`rarity-${relic.rarity}`));
  }
  const motifs = ['huo_ling_zhu', 'di_ling_zhu', 'jin_ling_zhu', 'shui_ling_zhu', 'mu_ling_zhu', 'tu_ling_zhu']
    .map(id => art.relicArt(id).match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1]);
  assert.equal(new Set(motifs).size, motifs.length);
  assert.match(art.relicArt('fate_sword_box'), /rarity-fate/);
});

test('遗物图形在 HUD 和详情中分别使用小型与大型呈现', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const art = require('../js/item-art.js');
  const E = require('../js/engine.js');
  const window = { WX_DATA: D, WXEngine: E, WXEffects: {}, WXItemArt: art, innerWidth: 393, innerHeight: 852, addEventListener() {} };
  const document = { getElementById: () => ({ addEventListener() {} }), querySelector: () => null };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
  const ui = window.WX_UI;
  ui.state = E.createRun({ characterId: 'sword', seed: 7 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  assert.match(ui.combatHTML(), /relic-art-qing-feng/);
  ui.detail = { kind: 'relic', id: 'qing_feng' };
  assert.match(ui.detailHTML(), /relic-showcase[\s\S]*relic-art-qing-feng/);
});

test('遗物触发仅在效果兑现时发事件，高频被动使用安静档', () => {
  const E = require('../js/engine.js');
  const state = E.createRun({ characterId: 'sword', seed: 13 });
  state.relics = ['gui_jia', 'jin_ling_zhu'];
  const start = E.startCombat(state, { enemies: [{ id: 'qing_she' }] }, 'combat');
  assert.ok(start.events.some(event => event.t === 'relicTrigger' && event.id === 'gui_jia'));
  assert.equal(D.relicMap.jin_ling_zhu.presentation.trigger, 'quiet');
  assert.equal(D.relicMap.gu_deng.presentation.trigger, 'normal');
  state.combat.hand = [{ uid: 'test-metal', id: 'jin_feng', up: false }];
  state.combat.energy = 3;
  const hit = E.playCard(state, 0, 0);
  assert.ok(hit.events.some(event => event.t === 'relicTrigger' && event.id === 'jin_ling_zhu'));
  assert.equal(D.relicMap.ju_qi_lu.presentation.trigger, 'normal');
});

test('双鱼佩额外抽牌与土灵珠加成均有对应触发事件', () => {
  const E = require('../js/engine.js');
  const state = E.createRun({ characterId: 'sword', seed: 22 });
  state.relics = ['shuang_yu_pei', 'gui_jia', 'tu_ling_zhu'];
  const start = E.startCombat(state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  for (const id of ['shuang_yu_pei', 'gui_jia', 'tu_ling_zhu']) {
    assert.ok(start.events.some(event => event.t === 'relicTrigger' && event.id === id), id);
  }
});

test('商店第二件遗物获得动画定位到第二件', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const E = require('../js/engine.js');
  const art = require('../js/item-art.js');
  const targets = [{ name: 'first' }, { name: 'second' }];
  const shown = [];
  const document = {
    getElementById: () => ({ addEventListener() {} }),
    querySelectorAll: selector => selector === '.shop-relic' ? targets.map(target => ({ querySelector: () => target })) : []
  };
  const window = { WX_DATA: D, WXEngine: E, WXItemArt: art, WXEffects: { relicAcquire(options) { shown.push(options.target); } }, innerWidth: 1280, innerHeight: 900, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/ui.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
  const ui = window.WX_UI;
  ui.state = E.createRun({ characterId: 'sword', seed: 88 });
  ui.state.gold = 9999;
  E.generateShop(ui.state);
  ui.app = { saveRun() {} };
  ui.sfx = () => {};
  ui.render = () => {};
  ui.buy('relic', 0);
  ui.buy('relic', 1);
  assert.deepEqual(shown, targets);
});

test('遗物获得与触发视觉有统一入口，并在动画结束后清理', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const { created, FX } = (() => {
    const nodes = [];
    const layer = { isConnected: true, appendChild(node) { node.parentNode = this; nodes.push(node); }, removeChild(node) { nodes.splice(nodes.indexOf(node), 1); } };
    const document = { getElementById: () => layer, createElement() { return { style: { setProperty() {} }, classList: { add() {}, remove() {} }, animate() { return { finished: Promise.resolve() }; }, remove() { nodes.splice(nodes.indexOf(this), 1); } }; } };
    const window = { WX_DATA: D, innerWidth: 393, innerHeight: 852, matchMedia: () => ({ matches: false }) };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/effects.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
    return { created: nodes, FX: window.WXEffects };
  })();
  assert.equal(typeof FX.relicAcquire, 'function');
  assert.equal(typeof FX.relicTrigger, 'function');
  const target = { x: 140, y: 220 };
  await FX.relicAcquire({ target, rarity: 'rare' });
  assert.equal(created.length, 0);
  await FX.relicTrigger({ id: 'gu_deng', target, priority: 'normal' });
  assert.equal(created.length, 0);
  await FX.relicTrigger({ id: 'jin_ling_zhu', target, priority: 'quiet' });
  assert.equal(created.length, 0);
});

test('八种丹药都有不同造型与图形标记', () => {
  const art = require('../js/item-art.js');
  const shapes = D.potions.map(potion => {
    const html = art.potionArt(potion.id);
    assert.match(html, new RegExp(`potion-art-${potion.id}`));
    assert.match(html, /<svg/);
    return html.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  });
  assert.equal(new Set(shapes).size, 8);
});
