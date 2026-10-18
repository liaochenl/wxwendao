const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../js/data.js');

function makeNode(rect = { left: 20, top: 30, width: 100, height: 140 }) {
  const children = [];
  const classes = new Set();
  return {
    style: { setProperty(name, value) { this[name] = value; } }, children, parentNode: null,
    classList: { add: x => classes.add(x), contains: x => classes.has(x) },
    appendChild(child) { child.parentNode = this; children.push(child); return child; },
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    cloneNode() { return makeNode(rect); },
    getBoundingClientRect() { return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }; },
    animate() { return { finished: Promise.resolve(), cancel() {} }; }
  };
}

function loadEffects(reduced = false) {
  const layer = makeNode();
  const body = makeNode();
  const document = {
    body,
    getElementById(id) { return id === 'fx-layer' ? layer : null; },
    createElement() { return makeNode(); },
    querySelectorAll() { return []; }
  };
  const window = { WX_DATA: D, matchMedia: () => ({ matches: reduced }), innerWidth: 393, innerHeight: 852 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/effects.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
  return { FX: window.WXEffects, layer, document };
}

test('特效模块复制出牌卡到独立图层，飞行完成后清理且不移动原卡', async () => {
  const { FX, layer } = loadEffects();
  const card = makeNode();
  const visual = FX.captureCard(card);
  assert.ok(visual && visual.ghost);
  assert.notStrictEqual(visual.ghost, card);
  assert.equal(visual.ghost.parentNode, layer);
  assert.equal(card.parentNode, null);
  await FX.playCardFlight({ visual, element: 'metal', cardType: 'attack', target: { x: 250, y: 200 } });
  assert.equal(visual.ghost.parentNode, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(layer.children.length, 0);
});

test('减少动态效果时不生成粒子且缺失 DOM 安全返回', async () => {
  const { FX, layer } = loadEffects(true);
  await FX.elementBurst({ element: 'fire', x: 100, y: 100 });
  await FX.zhoutian();
  await FX.impact({ target: null, element: 'wood' });
  assert.equal(layer.children.length, 0);
  assert.equal(FX.captureCard(null), null);
});

test('浏览器动画未触发完成回调时，飞牌仍会超时清理', async () => {
  const { FX, layer } = loadEffects();
  const card = makeNode();
  card.cloneNode = () => {
    const ghost = makeNode();
    ghost.animate = () => ({ finished: new Promise(() => {}) });
    return ghost;
  };
  const visual = FX.captureCard(card);
  let timer;
  try {
    await Promise.race([
      FX.playCardFlight({ visual, element: 'fire', cardType: 'attack', target: { x: 200, y: 200 } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('animation stuck')), 700); })
    ]);
  } finally { clearTimeout(timer); }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(layer.children.length, 0);
});
