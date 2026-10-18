const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function makeUI(width = 393) {
  const listeners = {};
  const window = { WX_DATA: D, WXEngine: E, innerWidth: width, innerHeight: 852, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const document = { getElementById: () => ({ addEventListener() {} }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8'), { window, document, clearTimeout() {}, setTimeout(fn) { fn(); return 1; } });
  const ui = window.WX_UI;
  ui._testWindow = window;
  ui._testListeners = listeners;
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

function setReward(ui) {
  ui.state.reward = {
    kind: 'combat', gold: 10,
    cards: ['shui_yue', 'xin_jian', 'wan_mu'].map((id, i) => ({ uid: 900 + i, id, up: false })),
    relicId: null, potionId: null, cardTaken: false, selected: -1
  };
  ui.state.combat = null;
  ui.screen = 'reward';
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

test('手机奖励纵向展示三张牌的完整效果和属性，桌面保留原卡牌布局', () => {
  const mobile = makeUI();
  setReward(mobile);
  const html = mobile.rewardHTML();
  const text = html.replace(/<[^>]*>/g, '');
  assert.equal((html.match(/class="reward-option /g) || []).length, 3);
  for (const inst of mobile.state.reward.cards) {
    const card = E.getCardData(inst);
    assert.ok(text.includes(card.text), `${card.name} 的完整效果应直接可见`);
    assert.ok(text.includes(card.name));
  }
  assert.match(html, /data-action="take-card" data-index="0"/);
  assert.doesNotMatch(html, /class="card el-/);

  const desktop = makeUI(1280);
  setReward(desktop);
  assert.match(desktop.rewardHTML(), /class="card el-/);
});

test('奖励页跨手机宽度时重排，旧手机按钮仍要求确认', () => {
  const ui = makeUI();
  setReward(ui);
  assert.match(ui.rewardHTML(), /data-confirm="1"/);
  let renders = 0;
  ui.render = () => { renders++; };
  ui.resizeBackground = () => {};
  ui.bind();
  ui._testWindow.innerWidth = 800;
  ui._testListeners.resize();
  assert.equal(renders, 1);
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('take-card', { dataset: { index: '0', confirm: '1' } });
  assert.equal(taken, 0);
  assert.equal(ui.overlay, 'detail');
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

test('战斗状态可点开查看当前层数与完整效果', () => {
  const ui = makeUI();
  ui.state.combat.statuses.poison = 2;
  ui.state.combat.enemies[0].statuses.weak = 1;
  const html = ui.combatHTML();
  assert.match(html, /data-action="inspect-status" data-status="poison" data-owner="player"/);
  assert.match(html, /data-action="inspect-status" data-status="weak" data-owner="enemy" data-index="0"/);

  ui.action('inspect-status', { dataset: { status: 'poison', owner: 'player' } });
  assert.equal(ui.overlay, 'detail');
  assert.match(ui.overlayHTML(), /当前 2 层/);
  assert.match(ui.overlayHTML(), /回合开始时失去等同层数的生命/);
  ui.state.combat.statuses.poison = 0;
  assert.match(ui.overlayHTML(), /当前 2 层/);
  ui.action('close-overlay', { dataset: {} });

  ui.action('inspect-status', { dataset: { status: 'weak', owner: 'enemy', index: '0' } });
  assert.match(ui.overlayHTML(), /当前 1 层/);
  assert.match(ui.overlayHTML(), /造成的攻击伤害降低 25%/);
});

test('卡牌详情展示升级前后效果，已升级牌也能回看原效果', () => {
  const ui = makeUI();
  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '0' } });
  const base = ui.overlayHTML();
  assert.match(base, /升级前/);
  assert.match(base, /造成 6 点伤害/);
  assert.match(base, /升级后/);
  assert.match(base, /造成 9 点伤害/);
  assert.match(base, /灵气 1/);
  ui.action('close-overlay', { dataset: {} });

  ui.action('inspect-card', { dataset: { id: 'jin_ren', up: '1' } });
  const upgraded = ui.overlayHTML();
  assert.match(upgraded, /已悟/);
  assert.match(upgraded, /升级前/);
  assert.match(upgraded, /造成 6 点伤害/);

  ui.action('inspect-card', { dataset: { id: 'xin_mo', up: '0' } });
  assert.doesNotMatch(ui.overlayHTML(), /升级后/);
});

test('桌面休整参悟先预览差异，确认后才升级', () => {
  const ui = makeUI(1280);
  ui.state.screen = 'rest';
  ui.screen = 'rest';
  ui.picker = { mode: 'upgrade-rest', title: '选择一张牌参悟' };
  const inst = ui.state.deck.find(c => c.id === 'jin_ren');
  let upgrades = 0;
  ui.pickCard = () => { upgrades++; };
  ui.action('pick-card', { dataset: { uid: inst.uid } });
  assert.equal(upgrades, 0);
  assert.match(ui.overlayHTML(), /造成 9 点伤害/);
  assert.match(ui.overlayHTML(), /确认参悟/);
  ui.action('confirm-detail', { dataset: {} });
  assert.equal(upgrades, 1);
});

test('桌面奖励可单独查看升级差异，手牌提示也包含升级效果', () => {
  const ui = makeUI(1280);
  setReward(ui);
  const reward = ui.rewardHTML();
  assert.match(reward, /data-action="inspect-card" data-id="shui_yue"/);
  let taken = 0;
  ui.takeRewardCard = () => { taken++; };
  ui.action('inspect-card', { dataset: { id: 'shui_yue', up: '0' } });
  assert.equal(taken, 0);
  assert.match(ui.overlayHTML(), /升级后/);

  ui.action('close-overlay', { dataset: {} });
  ui.screen = 'combat';
  E.startCombat(ui.state, { enemies: [{ id: 'shan_xiao' }] }, 'combat');
  ui.state.combat.hand = [{ uid: 'hand-jin', id: 'jin_ren', up: false }];
  assert.match(ui.combatHTML(), /升级后（灵气 1）/);
});

test('五行卡牌使用各自纹样和边框色，升级牌有明确印记', () => {
  const ui = makeUI();
  ui.meta.seenCards = ['chan_si', 'chi_yan', 'yan_quan', 'jin_ren', 'liu_yun'];
  ui.screen = 'compendium';
  ui.compTab = 'cards';
  const html = ui.compendiumHTML();
  for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) {
    assert.match(html, new RegExp(`class="card el-${element}[^\"]*" style="--el:`));
    assert.match(html, new RegExp(`class="card-art-icon motif-${element}"`));
  }
  ui.state.deck[0].up = true;
  ui.overlay = 'deck';
  assert.match(ui.overlayHTML(), /class="card-up-mark"[^>]*>悟</);
});

test('手机奖励卡也继承五行视觉强调', () => {
  const ui = makeUI();
  setReward(ui);
  const html = ui.rewardHTML();
  assert.match(html, /class="reward-option el-water/);
  assert.match(html, /class="reward-option el-wood/);
  assert.match(html, /class="reward-option-seal"/);
});

test('升级牌标题行留出完整牌名空间', () => {
  const ui = makeUI();
  ui.state.deck = [{ uid: 'up-long', id: 'bai_cao', up: true }];
  ui.overlay = 'deck';
  const html = ui.overlayHTML();
  const title = html.match(/<div class="card-top">([\s\S]*?)<\/div>/)[1];
  const art = html.match(/<div class="card-art"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.match(title, /百草回春/);
  assert.doesNotMatch(title, /百草回春·悟/);
  assert.doesNotMatch(title, /card-up-mark|card-elem/);
  assert.match(art, /card-up-mark/);
  assert.match(art, /card-elem/);
});
