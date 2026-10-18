const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function makeUI() {
  const window = { WX_DATA: D, WXEngine: E, innerWidth: 393, innerHeight: 852 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8'), { window });
  const ui = window.WX_UI;
  ui.render = () => {};
  ui.sfx = () => {};
  ui.toast = () => {};
  ui.meta = { seenCards: [], seenRelics: [], seenEnemies: [] };
  ui.app = { saveRun() {}, saveMeta() {} };
  ui.overlay = null;
  ui.detail = null;
  ui.screen = 'combat';
  ui.state = E.createRun({ characterId: 'sword', seed: 42 });
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.potions = ['heal'];
  return ui;
}

test('手机手牌先显示完整说明，确认前不出牌', () => {
  const ui = makeUI();
  let played = 0;
  ui.playCard = () => { played++; };
  ui.action('play-card', { dataset: { index: '0' } });
  assert.equal(played, 0);
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /确认出牌/);
  assert.match(ui.overlayHTML(), /card-detail-text/);
});

test('手机丹药先显示效果，确认后才使用', () => {
  const ui = makeUI();
  let used = 0;
  ui.usePotion = () => { used++; };
  ui.action('use-potion', { dataset: { index: '0' } });
  assert.equal(used, 0);
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /回复 15 点生命/);
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(used, 1);
});

test('战后奖励先显示完整卡牌属性，取消不领取，确认后领取', () => {
  const ui = makeUI();
  const card = { uid: 999, id: 'jin_ren', up: false };
  ui.state.reward = { kind: 'combat', gold: 10, cards: [card], relicId: null, potionId: null, cardTaken: false, selected: -1 };
  ui.state.combat = null;
  ui.screen = 'reward';
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('take-card', { dataset: { index: '0' } });
  assert.equal(taken, 0);
  assert.match(ui.overlayHTML(), /造成 6 点伤害/);
  ui.action('close-overlay', { dataset: {} });
  assert.equal(taken, 0);
  ui.action('take-card', { dataset: { index: '0' } });
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(taken, 1);
});

test('图鉴有角色与丹药入口，敌人和遗物可点开说明', () => {
  const ui = makeUI();
  ui.screen = 'compendium';
  ui.meta.seenRelics = [D.relics.find(r => r.rarity !== 'starter').id];
  ui.meta.seenEnemies = ['shan_xiao'];
  const tabs = ui.compendiumHTML();
  assert.match(tabs, /data-tab="characters"/);
  assert.match(tabs, /data-tab="potions"/);
  ui.compTab = 'enemies';
  assert.match(ui.compendiumHTML(), /data-action="inspect-enemy"/);
  ui.compTab = 'relics';
  assert.match(ui.compendiumHTML(), /data-action="inspect-relic"/);
});

test('敌人详情显示招式附加的业障，关闭卡牌详情返回原面板', () => {
  const ui = makeUI();
  ui.action('inspect-enemy', { dataset: { id: 'chi_ba' } });
  assert.match(ui.overlayHTML(), /播火/);
  assert.match(ui.overlayHTML(), /塞入 2 张火种/);
  ui.overlay = 'deck';
  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '0' } });
  ui.action('close-overlay', { dataset: {} });
  assert.equal(ui.overlay, 'deck');
});
