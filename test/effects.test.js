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
  const battlefield = makeNode();
  const created = [];
  const running = { playState: 'running', pauses: 0, resumes: 0, pause() { this.playState = 'paused'; this.pauses++; }, play() { this.playState = 'running'; this.resumes++; } };
  battlefield.getAnimations = () => [running];
  const document = {
    body,
    getElementById(id) { return id === 'fx-layer' ? layer : null; },
    createElement() { const el = makeNode(); el.setAttribute = (name, value) => { el[name === 'class' ? 'className' : name] = value; }; created.push(el); return el; },
    createElementNS(_ns, tag) { const el = makeNode(); el.tagName = tag; el.setAttribute = (name, value) => { el[name === 'class' ? 'className' : name] = value; }; created.push(el); return el; },
    querySelector(selector) { return selector === '.battlefield' ? battlefield : null; },
    querySelectorAll() { return []; },
  };
  const window = { WX_DATA: D, matchMedia: () => ({ matches: reduced }), innerWidth: 393, innerHeight: 852 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/effects.js'), 'utf8'), { window, document, setTimeout, clearTimeout });
  return { FX: window.WXEffects, layer, document, created, battlefield, running };
}

test('天命获取具有独立五行汇聚，战斗触发较轻且减少动态效果时不生成粒子', async () => {
  const target = makeNode();
  const normal = loadEffects();
  await normal.FX.fateReveal({ target });
  const particles = normal.created.filter(node => node.className.includes('fx-fate-particle'));
  assert.equal(particles.length, 5);
  assert.ok(normal.created.some(node => node.animations.some(anim => anim.options.duration >= 1000)));
  await normal.FX.fatePulse({ target });
  const pulse = normal.created.find(node => node.className.includes('fx-fate-pulse'));
  assert.ok(pulse.animations[0].options.duration <= 550);
  const reduced = loadEffects(true);
  await reduced.FX.fateReveal({ target });
  assert.equal(reduced.created.length, 0);
});

test('角色资源满值使用对应五行颜色', async () => {
  const { FX, created } = loadEffects();
  for (const [id, flavor] of [['swordIntent', 'metal'], ['furnaceFire', 'fire'], ['battleMomentum', 'earth']]) {
    await FX.resourceReady({ target: makeNode(), id });
    assert.ok(created.some(node => node.className.includes(`fx-resource-ready-${id}`) && node.style['--fx-color'] === D.elements[flavor].color));
  }
});

test('丹药从托盘飞向正确目标，五行丹有五色汇聚且减少动态效果不产生粒子', async () => {
  const normal = loadEffects();
  const source = makeNode({ left: 20, top: 700, width: 40, height: 40 });
  const target = makeNode({ left: 170, top: 100, width: 80, height: 80 });
  await normal.FX.potionUse({ id: 'fire', source, target });
  assert.ok(normal.created.some(node => node.className.includes('fx-potion-flight-fire')));
  await normal.FX.potionUse({ id: 'chain', source, target });
  assert.equal(normal.created.filter(node => node.className.includes('fx-potion-chain-mote')).length, 5);
  assert.equal(normal.layer.children.length, 0);
  const reduced = loadEffects(true);
  await reduced.FX.potionUse({ id: 'chain', source, target });
  assert.equal(reduced.created.filter(node => node.className.includes('fx-potion-chain-mote')).length, 0);
  assert.equal(reduced.layer.children.length, 0);
});

test('精英与幕主登场、二阶段及击败有可复用特效，并尊重减少动态效果', async () => {
  const target = makeNode();
  const normal = loadEffects();
  await normal.FX.encounterIntro({ target, tier: 'elite', element: 'metal' });
  await normal.FX.encounterIntro({ target, tier: 'boss', element: 'earth' });
  await normal.FX.bossPhase({ target, element: 'fire', enemyId: 'chi_ba' });
  await normal.FX.bossPhase({ target, element: 'earth', enemyId: 'shan_gui' });
  await normal.FX.bossPhase({ target, element: 'none', enemyId: 'tai_xu' });
  await normal.FX.encounterDefeat({ target, tier: 'boss', element: 'water' });
  assert.ok(normal.created.some(node => node.className.includes('fx-encounter-intro')));
  assert.ok(normal.created.some(node => node.className.includes('fx-boss-phase')));
  for (const identity of ['shan-gui', 'chi-ba', 'tai-xu']) assert.ok(normal.created.some(node => node.className.includes(`fx-boss-phase-${identity}`)), identity);
  assert.ok(normal.created.some(node => node.className.includes('fx-encounter-defeat')));
  const reduced = loadEffects(true);
  await reduced.FX.encounterIntro({ target, tier: 'boss' });
  await reduced.FX.bossPhase({ target });
  await reduced.FX.encounterDefeat({ target, tier: 'boss' });
  assert.equal(reduced.created.length, 0);
});

test('太虚五行依序收束后才触发白色核心和重击', async () => {
  const { FX, created } = loadEffects();
  const phase = FX.bossPhase({ target: { x: 180, y: 200 }, enemyId: 'tai_xu' });
  assert.deepEqual(created.filter(el => el.className.includes('fx-boss-phase-tai-xu') && el.className.includes('fx-element-'))
    .map(el => el.className.match(/fx-element-(wood|fire|earth|metal|water)/)?.[1]), ['wood', 'fire', 'earth', 'metal', 'water']);
  const hasCoreRing = () => created.some(el => el.className.includes('fx-ring') && el.className.includes('fx-boss-phase-tai-xu'));
  assert.equal(hasCoreRing(), false, '五行收束前不提前落环');
  await phase;
  assert.ok(hasCoreRing());
});

test('普通、技法、功法和终式飞行在 220~300ms 内完成并保留抬牌阶段', async () => {
  const { FX } = loadEffects();
  for (const [type, min, max, finisher] of [['attack', 220, 300, false], ['skill', 220, 300, false], ['power', 220, 300, false], ['attack', 220, 300, true]]) {
    const card = makeNode();
    const visual = FX.captureCard(card);
    await FX.playCardFlight({ visual, element: 'wood', cardType: type, target: { x: 230, y: 160 }, finisher });
    const flight = visual.ghost.animations[0];
    assert.ok(flight.options.duration >= min && flight.options.duration <= max, `${type}${finisher ? ' finisher' : ''} 飞行时长`);
    assert.ok(flight.frames.some(frame => /scale\(1\.2[0-4]\)/.test(frame.transform)), `${type} 抬牌阶段应明显放大`);
    assert.equal(flight.options.easing, 'linear', `${type} 飞牌进度应与实际时间一致`);
    assert.ok(flight.frames.filter(frame => frame.offset <= .82).every(frame => frame.opacity === 1), `${type} 接近目标前应保持清晰`);
  }
});

test('Hit Stop 暂停当前战斗动画后恢复，并遵守减少动态效果', async () => {
  const normal = loadEffects();
  await normal.FX.hitStop({ duration: 1 });
  assert.equal(normal.running.pauses, 1);
  assert.equal(normal.running.resumes, 1);
  assert.equal(normal.running.playState, 'running');
  const reduced = loadEffects(true);
  await reduced.FX.hitStop({ duration: 1 });
  assert.equal(reduced.running.pauses, 0);
});

test('五行命中 Impact 演出在 120~220ms 内完成', async () => {
  for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) {
    const { FX, created } = loadEffects();
    await FX.elementHit({ element, target: { x: 180, y: 200 } });
    const impacts = created.filter(node => node.className.includes(`fx-hit-${element}`));
    assert.ok(impacts.length, element);
    for (const impact of impacts) {
      const { duration = 0, delay = 0 } = impact.animations[0]?.options || {};
      assert.ok(duration >= 120 && duration + delay <= 220, `${element}: ${duration}ms + ${delay}ms`);
    }
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
  const { FX, created, layer } = loadEffects();
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
  const zhouPlayback = FX.zhoutian();
  assert.equal(created.filter(el => el.className.includes('fx-zhoutian-ring')).length, 0, '五行节点汇聚前不提前出现中央周天环');
  assert.deepEqual(created.filter(el => el.className.includes('fx-zhoutian-node-')).map(el => el.className.match(/fx-zhoutian-node-(\w+)/)?.[1]), ['wood', 'fire', 'earth', 'metal', 'water']);
  await zhouPlayback;
  assert.ok(created.filter(el => el.className.includes('fx-zhoutian-wave')).length >= 2);
  const zhou = created.find(el => el.className.includes('fx-zhoutian-ring'));
  assert.ok(zhou.animations[0].options.duration >= 320 && zhou.animations[0].options.duration <= 400);
  for (const [index, element] of ['wood', 'fire', 'earth', 'metal', 'water'].entries()) {
    const seal = created.find(el => el.className.includes(`fx-zhoutian-node-${element}`));
    assert.ok(seal?.animations[0].options.delay === index * 40, `${element} 周天前摇顺序`);
  }
  assert.ok(created.filter(el => el.className.includes('fx-particle')).length <= 42);
  assert.equal(layer.children.length, 0);
});

test('剑修终结演出比普通命中更重且尊重减少动态效果', async () => {
  const { FX, created } = loadEffects();
  await FX.finisher({ target: { x: 190, y: 210 }, element: 'metal', kind: 'swordIntent' });
  const rings = created.filter(el => el.className.includes('fx-finisher-ring'));
  assert.ok(rings.length >= 2);
  assert.ok(rings.some(el => el.animations[0].options.duration >= 320 && el.animations[0].options.duration <= 400));
  assert.ok(created.some(el => el.className.includes('fx-finisher-slash')));
  assert.ok(created.filter(el => el.className.includes('fx-finisher-particle')).length >= 4);
  const reduced = loadEffects(true);
  await reduced.FX.finisher({ target: { x: 190, y: 210 }, element: 'metal' });
  assert.equal(reduced.created.length, 0);
});

test('九种角色终式包含角色专属视觉，而不是统一增加粒子', async () => {
  const signatures = [
    ['sword', 'yi_jian_kai_tian', 'fx-sword-kai-tian'],
    ['sword', 'cang_lang', 'fx-sword-cang-lang'],
    ['sword', 'tian_he', 'fx-sword-tian-he'],
    ['alchemist', 'bai_du_gui_yuan', 'fx-alchemist-vortex'],
    ['alchemist', 'chi_lu_fen_tian', 'fx-alchemist-pillar'],
    ['alchemist', 'qing_di_hui_tian', 'fx-alchemist-heal'],
    ['monk', 'han_shan_shi', 'fx-monk-han-shan-shi'],
    ['monk', 'jin_gang_zhen_nu', 'fx-monk-jin-gang-zhen-nu'],
    ['monk', 'beng_tian_shi', 'fx-monk-beng-tian-shi']
  ];
  for (const [kind, cardId, signature] of signatures) {
    const { FX, created } = loadEffects();
    await FX.finisher({ target: { x: 190, y: 210 }, source: { x: 90, y: 350 }, element: 'fire', kind, cardId });
    assert.ok(created.some(el => el.className.includes(signature)), cardId);
  }
});

test('毒爆火爆和生机化攻分别有独立粒子，并在结束后清理', async () => {
  for (const status of ['poison', 'burn', 'regen']) {
    const { FX, layer, created } = loadEffects();
    await FX.statusDetonate({ status, target: { x: 190, y: 210 }, source: { x: 90, y: 350 } });
    assert.ok(created.some(el => el.className.includes(`fx-detonate-${status}`)), status);
    assert.ok(created.filter(el => el.className.includes('fx-detonate-particle')).length >= 4, status);
    if (status === 'poison') assert.ok(created.some(el => el.className.includes('fx-detonate-vortex')));
    if (status === 'burn') assert.ok(created.some(el => el.className.includes('fx-detonate-fire-column')));
    if (status === 'poison') {
      const gather = created.findIndex(el => el.className.includes('fx-detonate-vortex'));
      const burst = created.findIndex(el => el.className.includes('fx-detonate-particle'));
      assert.ok(gather >= 0 && burst > gather, '毒层先收束再爆开');
    }
    if (status === 'burn') assert.ok(created.some(el => el.className.includes('fx-detonate-fire-gather')));
    if (status === 'regen') assert.ok(created.some(el => el.className.includes('fx-detonate-regen-gather')));
    assert.equal(layer.children.length, 0, status);
  }
  const reduced = loadEffects(true);
  await reduced.FX.statusDetonate({ status: 'burn', target: { x: 190, y: 210 } });
  assert.equal(reduced.created.length, 0);
});

test('体修三种终结牌有不同演出，荆棘震怒可环形波及多个目标', async () => {
  for (const cardId of ['han_shan_shi', 'jin_gang_zhen_nu', 'beng_tian_shi']) {
    const { FX, layer, created } = loadEffects();
    await FX.finisher({ target: { x: 190, y: 210 }, element: 'earth', kind: 'monk', cardId });
    const nodes = created.filter(el => el.className.includes(`fx-monk-${cardId.replaceAll('_', '-')}`));
    assert.ok(nodes.length >= 2, cardId);
    assert.ok(nodes.every(el => el.animations[0].options.duration < 700), cardId);
    assert.equal(layer.children.length, 0, cardId);
  }
  const thorns = loadEffects();
  await thorns.FX.statusDetonate({ status: 'thorns', target: { x: 190, y: 210 }, source: { x: 90, y: 350 } });
  assert.ok(thorns.created.some(el => el.className.includes('fx-detonate-thorns')));
  assert.equal(thorns.layer.children.length, 0);
  const reduced = loadEffects(true);
  await reduced.FX.finisher({ target: { x: 190, y: 210 }, kind: 'monk', cardId: 'beng_tian_shi' });
  await reduced.FX.statusDetonate({ status: 'thorns', target: { x: 190, y: 210 } });
  assert.equal(reduced.created.length, 0);
});

test('道途大成让终结演出略强，悟道提示在减少动态效果时不生成粒子', async () => {
  const normal = loadEffects();
  await normal.FX.finisher({ target: { x: 190, y: 210 }, element: 'earth', kind: 'monk', cardId: 'beng_tian_shi' });
  const empowered = loadEffects();
  await empowered.FX.finisher({ target: { x: 190, y: 210 }, element: 'earth', kind: 'monk', cardId: 'beng_tian_shi', empowered: true });
  assert.ok(empowered.created.length > normal.created.length);
  await empowered.FX.buildAwakening({ target: { x: 190, y: 210 } });
  assert.ok(empowered.created.some(el => el.className.includes('fx-build-awakening')));
  assert.equal(empowered.layer.children.length, 0);
  const reduced = loadEffects(true);
  await reduced.FX.buildAwakening({ target: { x: 190, y: 210 } });
  assert.equal(reduced.created.length, 0);
});

test('获得道印演出约九百毫秒并尊重减少动态效果', async () => {
  const normal = loadEffects();
  await normal.FX.daoAwakening({ target: { x: 190, y: 210 }, element: 'water' });
  assert.ok(normal.created.some(node => node.className.includes('fx-dao-awakening')));
  assert.equal(normal.layer.children.length, 0);
  const reduced = loadEffects(true);
  await reduced.FX.daoAwakening({ target: { x: 190, y: 210 }, element: 'water' });
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

test('V2-C 目标线可重绘、克制印独立显示，五行命中使用独立视觉标记', async () => {
  const { FX, layer, created, battlefield } = loadEffects();
  const source = makeNode({ left: 80, top: 500, width: 120, height: 180 });
  const target = makeNode({ left: 230, top: 90, width: 140, height: 250 });
  FX.targetLine({ source, target, element: 'wood', overcome: true });
  assert.ok(layer.children.some(el => el.className.includes('fx-target-overlay')));
  assert.ok(layer.children.some(el => el.className.includes('fx-target-seal')));
  FX.clearTargetLine();
  assert.equal(layer.children.some(el => el.className.includes('fx-target-overlay')), false);
  for (const element of ['wood', 'fire', 'earth', 'metal', 'water']) {
    await FX.elementHit({ element, target });
    assert.ok(created.some(el => el.className.includes(`fx-hit-${element}`)), element);
    assert.equal(layer.children.length, 0, `${element} 特效应及时清理`);
  }
  const reduced = loadEffects(true);
  await reduced.FX.elementHit({ element: 'fire', target });
  assert.equal(reduced.created.length, 0);
});

test('抽牌、弃牌和镜头强反馈接口遵守减少动态效果', async () => {
  const normal = loadEffects();
  const target = makeNode();
  await normal.FX.drawCard({ target, index: 2, total: 3 });
  await normal.FX.discardHand({ target });
  await normal.FX.cameraPunch({ strength: 'heavy' });
  assert.ok(normal.created.some(el => el.className.includes('fx-draw-card')));
  assert.ok(normal.created.some(el => el.className.includes('fx-discard')));
  assert.equal(normal.battlefield.animations.length, 1);
  const reduced = loadEffects(true);
  await reduced.FX.drawCard({ target });
  await reduced.FX.discardHand({ target });
  await reduced.FX.cameraPunch({ strength: 'heavy' });
  assert.equal(reduced.created.length, 0);
});

test('卡牌飞行轨迹只保留三至五道短光痕，并自动清理', async () => {
  const normal = loadEffects();
  await normal.FX.cardTrail({ from: { x: 80, y: 700 }, to: { x: 220, y: 180 }, element: 'water' });
  assert.equal(normal.created.filter(el => el.className.includes('fx-card-trail')).length, 3);
  assert.equal(normal.layer.children.length, 0);
  const finisher = loadEffects();
  await finisher.FX.cardTrail({ from: { x: 80, y: 700 }, to: { x: 220, y: 180 }, element: 'metal', finisher: true });
  assert.equal(finisher.created.filter(el => el.className.includes('fx-card-trail')).length, 5);
  const reduced = loadEffects(true);
  await reduced.FX.cardTrail({ from: { x: 80, y: 700 }, to: { x: 220, y: 180 }, element: 'water' });
  assert.equal(reduced.created.length, 0);
});

test('高额护甲出现双层盾纹，中毒与灼烧施加特效使用不同形态', async () => {
  const normal = loadEffects();
  const target = makeNode();
  await normal.FX.block({ target, amount: 18 });
  assert.equal(normal.created.filter(el => el.className.includes('fx-shield-arc')).length, 2);
  await normal.FX.status({ target, key: 'poison' });
  await normal.FX.status({ target, key: 'burn' });
  assert.ok(normal.created.some(el => el.className.includes('fx-poison-mist')));
  assert.ok(normal.created.some(el => el.className.includes('fx-status-flame')));
  assert.equal(normal.layer.children.length, 0);
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
