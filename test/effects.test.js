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
    style: { setProperty(name, value) { this[name] = value; } }, children, animations: [], parentNode: null,
    classList: { add: x => classes.add(x), contains: x => classes.has(x) },
    appendChild(child) { child.parentNode = this; children.push(child); return child; },
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    cloneNode() { return makeNode(rect); },
    getBoundingClientRect() { return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }; },
    animate(frames, options) { this.animations.push({ frames, options }); return { finished: Promise.resolve(), cancel() {} }; }
  };
}

function loadEffects(reduced = false) {
  const layer = makeNode();
  const body = makeNode();
  const created = [];
  const document = {
    body,
    getElementById(id) { return id === 'fx-layer' ? layer : null; },
    createElement() { const el = makeNode(); created.push(el); return el; },
    querySelectorAll() { return []; }
  };
  const window = { WX_DATA: D, matchMedia: () => ({ matches: reduced }), innerWidth: 393, innerHeight: 852 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/effects.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
  return { FX: window.WXEffects, layer, document, created };
}

test('不同卡牌飞行时长和放大阶段有清晰层次', async () => {
  const { FX } = loadEffects();
  for (const [type, min, max] of [['attack', 360, 390], ['skill', 380, 420], ['power', 420, 460]]) {
    const card = makeNode();
    const visual = FX.captureCard(card);
    await FX.playCardFlight({ visual, element: 'wood', cardType: type, target: { x: 230, y: 160 } });
    const flight = visual.ghost.animations[0];
    assert.ok(flight.options.duration >= min && flight.options.duration <= max, `${type} 飞行时长`);
    assert.ok(flight.frames.some(frame => /scale\(1\.2[0-4]\)/.test(frame.transform)), `${type} 抬牌阶段应明显放大`);
    assert.equal(flight.options.easing, 'linear', `${type} 飞牌进度应与实际时间一致`);
    assert.ok(flight.frames.filter(frame => frame.offset <= .82).every(frame => frame.opacity === 1), `${type} 接近目标前应保持清晰`);
  }
});

test('克制双环和连携脉冲比普通反馈更显著', async () => {
  const { FX, created } = loadEffects();
  const target = makeNode();
  await FX.chainPulse({ target, element: 'fire' });
  const pulse = target.animations[0];
  assert.ok(pulse.frames.some(frame => frame.transform === 'scale(1.10)'));
  assert.ok(pulse.options.duration >= 320);
  await FX.overcomeBurst({ target, element: 'metal' });
  assert.equal(created.filter(el => el.className.includes('fx-overcome')).length, 3);
  assert.ok(created.some(el => el.className.includes('fx-overcome-echo')));
  assert.ok(created.some(el => el.className.includes('fx-overcome-flash')));
});

test('土系强命中的压缩幅度高于普通土系命中', async () => {
  const { FX } = loadEffects();
  const normal = makeNode();
  const heavy = makeNode();
  await FX.impact({ target: normal, element: 'earth', heavy: false });
  await FX.impact({ target: heavy, element: 'earth', heavy: true });
  assert.ok(normal.animations[0].frames.some(frame => frame.transform.includes('scaleY(.98)')));
  assert.ok(heavy.animations[0].frames.some(frame => frame.transform.includes('scaleY(.94)')));
});

test('五行爆发、剑光、命中和周天增强时长但保持粒子上限', async () => {
  const { FX, created } = loadEffects();
  await FX.elementBurst({ element: 'metal', x: 160, y: 160 });
  const slash = created.find(el => el.className.includes('fx-slash'));
  assert.ok(slash);
  assert.ok(slash.animations[0].options.duration >= 240);
  const ring = created.find(el => el.className.includes('fx-ring'));
  assert.ok(ring.animations[0].options.duration >= 300);
  const particles = created.filter(el => el.className.includes('fx-particle'));
  assert.ok(particles.length <= 12);
  assert.ok(particles.every(el => el.animations[0].options.duration >= 260));
  await FX.impact({ target: { x: 160, y: 160 }, element: 'earth', heavy: true });
  const impact = created.find(el => el.className.includes('fx-impact-heavy'));
  assert.ok(impact.animations[0].options.duration >= 300);
  await FX.zhoutian();
  assert.ok(created.filter(el => el.className.includes('fx-zhoutian-wave')).length >= 2);
  const zhou = created.find(el => el.className.includes('fx-zhoutian-ring'));
  assert.ok(zhou.animations[0].options.duration >= 620 && zhou.animations[0].options.duration <= 680);
  assert.ok(created.filter(el => el.className.includes('fx-particle')).length <= 42);
});

test('剑修终结演出比普通命中更重且尊重减少动态效果', async () => {
  const { FX, created } = loadEffects();
  await FX.finisher({ target: { x: 190, y: 210 }, element: 'metal', kind: 'swordIntent' });
  const rings = created.filter(el => el.className.includes('fx-finisher-ring'));
  assert.ok(rings.length >= 2);
  assert.ok(rings.some(el => el.animations[0].options.duration >= 500));
  assert.ok(created.some(el => el.className.includes('fx-finisher-slash')));
  assert.ok(created.filter(el => el.className.includes('fx-finisher-particle')).length >= 4);
  const reduced = loadEffects(true);
  await reduced.FX.finisher({ target: { x: 190, y: 210 }, element: 'metal' });
  assert.equal(reduced.created.length, 0);
});

test('毒爆火爆和生机化攻分别有独立粒子，并在结束后清理', async () => {
  for (const status of ['poison', 'burn', 'regen']) {
    const { FX, layer, created } = loadEffects();
    await FX.statusDetonate({ status, target: { x: 190, y: 210 }, source: { x: 90, y: 350 } });
    assert.ok(created.some(el => el.className.includes(`fx-detonate-${status}`)), status);
    assert.ok(created.filter(el => el.className.includes('fx-detonate-particle')).length >= 4, status);
    assert.equal(layer.children.length, 0, status);
  }
  const reduced = loadEffects(true);
  await reduced.FX.statusDetonate({ status: 'burn', target: { x: 190, y: 210 } });
  assert.equal(reduced.created.length, 0);
});

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
