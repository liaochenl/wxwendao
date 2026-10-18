/* 《五行问道》出牌视觉层；只读取战斗状态，不参与规则结算。 */
(function () {
  'use strict';

  const D = window.WX_DATA;
  const ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];
  let layer;

  function reduced() {
    try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }

  function ensureLayer() {
    if (layer && layer.isConnected !== false) return layer;
    layer = document.getElementById('fx-layer');
    if (!layer && document.body) {
      layer = document.createElement('div');
      layer.id = 'fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function centerOf(target) {
    if (!target) return null;
    if (Number.isFinite(target.x) && Number.isFinite(target.y)) return target;
    if (typeof target.getBoundingClientRect !== 'function') return null;
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function color(element) { return D?.elements?.[element]?.color || '#d8b977'; }

  function node(className, x, y, element) {
    const root = ensureLayer();
    if (!root || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const el = document.createElement('i');
    el.className = className;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--fx-color', color(element));
    root.appendChild(el);
    return el;
  }

  async function animateAndRemove(el, frames, options) {
    if (!el) return;
    let timeout;
    try {
      if (typeof el.animate === 'function') {
        const animation = el.animate(frames, options);
        let expired = false;
        await Promise.race([
          Promise.resolve(animation.finished).catch(() => {}),
          new Promise(resolve => { timeout = setTimeout(() => { expired = true; resolve(); }, Math.min((options.duration || 0) + 120, 800)); })
        ]);
        if (expired) animation.cancel?.();
      }
    } catch (_) { /* A missing or cancelled animation is only a visual failure. */ }
    finally { clearTimeout(timeout); el.remove(); }
  }

  function ring(x, y, element, className = 'fx-ring', duration = 300, scale = 2) {
    return animateAndRemove(node(className, x, y, element), [
      { transform: 'translate(-50%, -50%) scale(.35)', opacity: .95 },
      { transform: `translate(-50%, -50%) scale(${scale})`, opacity: 0 }
    ], { duration, easing: 'ease-out' });
  }

  function init() { ensureLayer(); }

  function captureCard(card) {
    try {
      if (!card || reduced() || !ensureLayer()) return null;
      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      ghost.classList.add('fx-card-ghost');
      Object.assign(ghost.style, {
        position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
        width: rect.width + 'px', height: rect.height + 'px',
        margin: '0', transform: 'none', pointerEvents: 'none'
      });
      layer.appendChild(ghost);
      return { ghost, rect, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
    } catch (_) { return null; }
  }

  function clear(visual) { try { visual?.ghost?.remove(); } catch (_) {} }

  async function playCardFlight({ visual, element, cardType, target } = {}) {
    if (!visual?.ghost) return;
    const destination = centerOf(target) || { x: window.innerWidth / 2, y: window.innerHeight * .38 };
    const dx = destination.x - visual.centerX;
    const dy = destination.y - visual.centerY;
    const long = cardType === 'power';
    try {
      if (!reduced()) {
        await animateAndRemove(visual.ghost, [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
          { transform: 'translate(0, -16px) scale(1.12)', opacity: 1, offset: .24 },
          { transform: `translate(${dx * .53}px, ${dy * .47 - 32}px) rotate(${cardType === 'attack' ? -9 : 3}deg) scale(1.14)`, opacity: 1, offset: .62 },
          { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${long ? .7 : .82})`, opacity: 0, offset: 1 }
        ], { duration: long ? 340 : 270, easing: 'cubic-bezier(.2,.8,.25,1)' });
        try { void elementBurst({ element, x: destination.x, y: destination.y, strength: cardType === 'attack' ? 1 : .8 }).catch(() => {}); }
        catch (_) {}
      }
    } finally { clear(visual); }
  }

  function elementBurst({ element, x, y, strength = 1 } = {}) {
    if (reduced() || !ensureLayer() || !Number.isFinite(x) || !Number.isFinite(y)) return Promise.resolve();
    const type = ORDER.includes(element) ? element : 'earth';
    const count = Math.min(strength > 1 ? 16 : 10, 18);
    const travel = (type === 'earth' ? 31 : type === 'fire' ? 72 : 57) * Math.min(strength, 1.5);
    const animations = [ring(x, y, type, 'fx-ring fx-element-' + type, 220, type === 'water' ? 2.8 : 2.1)];
    if (type === 'metal') {
      animations.push(animateAndRemove(node('fx-slash fx-element-metal', x, y, type), [
        { transform: 'translate(-90%, -50%) rotate(-34deg) scaleX(.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-34deg) scaleX(1.2)', opacity: 1, offset: .45 },
        { transform: 'translate(-10%, -50%) rotate(-34deg) scaleX(.7)', opacity: 0 }
      ], { duration: 190, easing: 'ease-out' }));
    }
    for (let i = 0; i < count; i++) {
      const a = 2 * Math.PI * i / count + .32;
      const distance = travel * (.64 + (i % 3) * .18);
      const px = Math.cos(a) * distance;
      const py = Math.sin(a) * distance - (type === 'wood' ? 15 : type === 'fire' ? 22 : 0);
      const p = node('fx-particle fx-element-' + type, x, y, type);
      animations.push(animateAndRemove(p, [
        { transform: `translate(-50%, -50%) rotate(${i * 28}deg) scale(.5)`, opacity: 0 },
        { transform: `translate(calc(-50% + ${px * .25}px), calc(-50% + ${py * .25}px)) rotate(${i * 28 + 25}deg) scale(1)`, opacity: 1, offset: .22 },
        { transform: `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${i * 28 + 90}deg) scale(.4)`, opacity: 0 }
      ], { duration: 190 + (i % 3) * 25, easing: 'cubic-bezier(.15,.75,.4,1)' }));
    }
    return Promise.all(animations);
  }

  async function impact({ target, element, heavy = false } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return;
    try {
      if (target && typeof target.animate === 'function') {
        target.animate(heavy ? [
          { transform: 'translateX(0) scale(1)' }, { transform: 'translateX(-5px) scale(1.03)' },
          { transform: 'translateX(5px) scale(.98)' }, { transform: 'translateX(0) scale(1)' }
        ] : [
          { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }
        ], { duration: 210, easing: 'ease-out' });
      }
    } catch (_) {}
    return ring(pos.x, pos.y, element, heavy ? 'fx-ring fx-impact fx-impact-heavy' : 'fx-ring fx-impact', 250, heavy ? 2.6 : 1.8);
  }

  function block({ target } = {}) {
    const p = centerOf(target);
    return p && !reduced() ? ring(p.x, p.y, 'water', 'fx-ring fx-shield', 300, 2.3) : Promise.resolve();
  }

  function heal({ target } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const animations = [ring(p.x, p.y, 'wood', 'fx-ring fx-healing', 320, 2)];
    for (let i = 0; i < 6; i++) {
      const x = p.x + (i - 2.5) * 11;
      const y = p.y + 12 + i % 2 * 7;
      animations.push(animateAndRemove(node('fx-particle fx-healing fx-element-wood', x, y, 'wood'), [
        { transform: 'translate(-50%, 0) scale(.7)', opacity: 0 },
        { transform: 'translate(-50%, -17px) scale(1.1)', opacity: .9, offset: .35 },
        { transform: 'translate(-50%, -42px) scale(.6)', opacity: 0 }
      ], { duration: 320 + i * 20, easing: 'ease-out' }));
    }
    return Promise.all(animations);
  }

  function status({ target, key, debuff } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const element = key === 'poison' ? 'wood' : key === 'burn' ? 'fire' : debuff ? 'fire' : 'earth';
    return ring(p.x, p.y, element, debuff ? 'fx-ring fx-status-debuff' : 'fx-ring fx-status-buff', 280, 1.65);
  }

  function chainPulse({ target, element } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    try { target.animate?.([
      { transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }
    ], { duration: 300, easing: 'ease-out' }); } catch (_) {}
    return ring(p.x, p.y, element, 'fx-ring fx-chain-pulse', 300, 2.6);
  }

  function overcomeBurst({ target, element } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    return Promise.all([
      elementBurst({ element, x: p.x, y: p.y, strength: 1.4 }),
      ring(p.x, p.y, element, 'fx-ring fx-overcome', 310, 3)
    ]);
  }

  async function zhoutian() {
    if (reduced() || !ensureLayer()) return;
    const x = window.innerWidth / 2;
    const y = window.innerHeight * .5;
    const ringNode = node('fx-zhoutian-ring', x, y, 'metal');
    if (ringNode) ringNode.style.background = `conic-gradient(${ORDER.map(color).join(',')},${color('wood')})`;
    const wave = node('fx-zhoutian-wave', x, y, 'metal');
    const animations = [
      animateAndRemove(ringNode, [
        { transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(180deg)', opacity: 1, offset: .52 },
        { transform: 'translate(-50%, -50%) scale(1.35) rotate(235deg)', opacity: 0 }
      ], { duration: 560, easing: 'ease-out' }),
      animateAndRemove(wave, [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0, offset: 0 },
        { transform: 'translate(-50%, -50%) scale(.45)', opacity: .8, offset: .46 },
        { transform: 'translate(-50%, -50%) scale(3.4)', opacity: 0 }
      ], { duration: 560, easing: 'ease-out' })
    ];
    for (let i = 0; i < 25; i++) {
      const a = Math.PI * 2 * i / 25;
      const p = node('fx-particle fx-element-' + ORDER[i % 5], x, y, ORDER[i % 5]);
      animations.push(animateAndRemove(p, [
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0, offset: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0, offset: .4 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * 160}px), calc(-50% + ${Math.sin(a) * 105}px)) scale(.75)`, opacity: 1, offset: .66 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * 225}px), calc(-50% + ${Math.sin(a) * 145}px)) scale(.2)`, opacity: 0 }
      ], { duration: 560, easing: 'ease-out' }));
    }
    try {
      document.querySelectorAll?.('.enemy-unit:not(.dead)').forEach(enemy => {
        enemy.animate?.([
          { transform: 'translateX(0)' }, { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }
        ], { duration: 180, delay: 320 });
      });
    } catch (_) {}
    await Promise.all(animations);
  }

  window.WXEffects = { init, captureCard, playCardFlight, elementBurst, impact, block, heal, status, chainPulse, overcomeBurst, zhoutian, clear };
})();
