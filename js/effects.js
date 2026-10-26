/* 《五行问道》出牌视觉层；只读取战斗状态，不参与规则结算。 */
(function () {
  'use strict';

  const D = window.WX_DATA;
  const ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];
  let layer;
  let targetOverlay;
  let targetSeal;

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
          new Promise(resolve => { timeout = setTimeout(() => { expired = true; resolve(); }, Math.min((options.duration || 0) + (options.delay || 0) + 120, 900)); })
        ]);
        if (expired) animation.cancel?.();
      }
    } catch (_) { /* A missing or cancelled animation is only a visual failure. */ }
    finally { clearTimeout(timeout); el.remove(); }
  }

  function ring(x, y, element, className = 'fx-ring', duration = 300, scale = 2, delay = 0) {
    return animateAndRemove(node(className, x, y, element), [
      { transform: 'translate(-50%, -50%) scale(.25)', opacity: .95 },
      { transform: `translate(-50%, -50%) scale(${scale})`, opacity: 0 }
    ], { duration, delay, easing: 'ease-out' });
  }

  function flash(x, y, element, className = 'fx-flash', duration = 180, delay = 0) {
    return animateAndRemove(node(className, x, y, element), [
      { transform: 'translate(-50%, -50%) scale(.35)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: .92, offset: .35 },
      { transform: 'translate(-50%, -50%) scale(1.35)', opacity: 0 }
    ], { duration, delay, easing: 'ease-out' });
  }

  function init() { ensureLayer(); }

  function captureCard(card, element) {
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
      ghost.style.setProperty('--fx-color', color(element));
      layer.appendChild(ghost);
      return { ghost, rect, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
    } catch (_) { return null; }
  }

  function clear(visual) { try { visual?.ghost?.remove(); } catch (_) {} }

  function clearTargetLine() {
    try { targetOverlay?.remove(); } catch (_) {}
    try { targetSeal?.remove(); } catch (_) {}
    targetOverlay = null;
    targetSeal = null;
  }

  function targetLine({ source, target, element = 'earth', overcome = false } = {}) {
    clearTargetLine();
    const sourceRect = source?.getBoundingClientRect?.();
    const from = sourceRect ? { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + 2 } : centerOf(source);
    const to = centerOf(target), root = ensureLayer();
    if (!from || !to || !root) return null;
    const svg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg');
    if (!svg) return null;
    svg.setAttribute('class', `fx-target-overlay fx-target-${element}${overcome ? ' will-overcome' : ''}`);
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, window.innerWidth)} ${Math.max(1, window.innerHeight)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = to.x - from.x, dy = to.y - (from.y - 10);
    const length = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.max(26, Math.min(54, length * .075));
    const side = from.x < window.innerWidth / 2 ? 1 : -1;
    const controlX = (from.x + to.x) / 2 + (-dy / length) * bend * side;
    const controlY = ((from.y - 10) + to.y) / 2 + (dx / length) * bend * side;
    const d = `M ${from.x} ${from.y - 10} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glow.setAttribute('d', d);
    glow.setAttribute('class', 'fx-target-glow');
    svg.appendChild(glow);
    path.setAttribute('d', d);
    path.setAttribute('class', 'fx-target-path');
    svg.appendChild(path);
    root.appendChild(svg);
    targetOverlay = svg;
    if (overcome) {
      const seal = node('fx-target-seal', to.x, to.y, element);
      targetSeal = seal;
      if (seal) { seal.textContent = '克'; if (!reduced()) animateAndRemove(seal, [
        { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: .55 },
        { transform: 'translate(-50%, -50%) scale(.8)', opacity: .72 }
      ], { duration: 900, easing: 'ease-out' }); }
    }
    return svg;
  }

  function elementHit({ element, target, heavy = false, overcome = false } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    const type = ORDER.includes(element) ? element : 'earth';
    const className = `fx-hit-${type}`;
    const figure = target?.querySelector?.('.enemy-art-figure') || target?.querySelector?.('.enemy-art');
    try { figure?.animate?.(type === 'earth' ? [
      { transform: 'translateY(0) scaleY(1)' }, { transform: heavy ? 'translateY(4px) scaleY(.92)' : 'translateY(2px) scaleY(.97)' },
      { transform: 'translateY(0) scaleY(1)' }
    ] : [
      { transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }
    ], { duration: heavy ? 205 : 155, easing: 'ease-out' }); } catch (_) {}
    const animations = [ring(pos.x, pos.y, type, `fx-ring fx-element-${type} ${className}`, heavy ? 210 : 175, type === 'water' ? 2.9 : 2.35)];
    if (type === 'wood') {
      for (let i = 0; i < 3; i++) animations.push(animateAndRemove(node(`fx-vine ${className}`, pos.x, pos.y, type), [
        { transform: `translate(-50%, -50%) rotate(${i * 60 - 60}deg) scaleX(.05)`, opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${i * 60 - 60}deg) scaleX(1)`, opacity: .85, offset: .55 },
        { transform: `translate(-50%, -50%) rotate(${i * 60 - 60}deg) scaleX(1.2)`, opacity: 0 }
      ], { duration: 190, easing: 'ease-out' }));
    } else if (type === 'fire') {
      animations.push(flash(pos.x, pos.y, type, `fx-flash fx-fire-core ${className}`, 180));
    } else if (type === 'earth') {
      animations.push(ring(pos.x, pos.y + 18, type, `fx-ring fx-earth-impact ${className}`, 190, 3.2));
    } else if (type === 'metal') {
      for (let i = 0; i < (heavy ? 3 : 2); i++) animations.push(animateAndRemove(node(`fx-slash ${className}`, pos.x, pos.y, type), [
        { transform: `translate(-50%, -50%) rotate(${i ? 30 : -32}deg) scaleX(.05)`, opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${i ? 30 : -32}deg) scaleX(1.25)`, opacity: 1, offset: .42 },
        { transform: `translate(-50%, -50%) rotate(${i ? 30 : -32}deg) scaleX(.45)`, opacity: 0 }
      ], { duration: 175 + i * 15, delay: i * 20, easing: 'ease-out' }));
    } else {
      animations.push(ring(pos.x, pos.y, type, `fx-ring fx-water-ripple ${className}`, 190, 3.3, 25));
    }
    if (overcome) animations.push(overcomeBurst({ target, element: type }));
    return Promise.all(animations);
  }

  function drawCard({ target, index = 0, total = 1 } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const el = node('fx-draw-card', p.x + 18, p.y + 12, 'water');
    return animateAndRemove(el, [
      { transform: 'translate(-50%, -50%) translate(16px, 22px) scale(.72)', opacity: 0 },
      { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)', opacity: 1 }
    ], { duration: 200, delay: Math.max(0, index) * Math.min(55, 180 / Math.max(1, total)), easing: 'cubic-bezier(.2,.8,.3,1)' });
  }

  function discardHand({ target } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const el = node('fx-discard', p.x, p.y, 'earth');
    return animateAndRemove(el, [
      { transform: 'translate(-50%, -50%) translateY(0)', opacity: 1 },
      { transform: 'translate(-50%, -50%) translateY(24px)', opacity: 0 }
    ], { duration: 165, easing: 'ease-in' });
  }

  function cameraPunch({ strength = 'normal' } = {}) {
    if (reduced()) return Promise.resolve();
    const battlefield = document.querySelector?.('.battlefield');
    if (!battlefield?.animate) return Promise.resolve();
    const px = strength === 'heavy' ? 6 : strength === 'light' ? 2 : 3;
    try { battlefield.animate([
      { transform: 'translate(0, 0)' }, { transform: `translate(${-px}px, ${px / 2}px)` },
      { transform: `translate(${px}px, ${-px / 2}px)` }, { transform: 'translate(0, 0)' }
    ], { duration: strength === 'heavy' ? 230 : 160, easing: 'ease-out' }); } catch (_) {}
    return Promise.resolve();
  }

  async function hitStop({ duration = 45 } = {}) {
    if (reduced()) return;
    const ms = Math.max(0, Math.min(70, Number(duration) || 0));
    if (!ms) return;
    let animations;
    try {
      const scopes = [document.querySelector?.('.battlefield'), document.getElementById?.('fx-layer')].filter(Boolean);
      animations = [...new Set(scopes.flatMap(scope => scope.getAnimations?.({ subtree: true }) || []))]
        .filter(animation => animation.playState === 'running' && typeof animation.pause === 'function');
    }
    catch (_) { return; }
    for (const animation of animations) { try { animation.pause(); } catch (_) {} }
    try { await new Promise(resolve => setTimeout(resolve, ms)); }
    finally { for (const animation of animations) { try { if (animation.playState === 'paused') animation.play(); } catch (_) {} } }
  }

  function resourceReady({ target, id } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const flavor = id === 'swordIntent' ? 'metal' : id === 'furnaceFire' ? 'fire' : 'earth';
    return ring(p.x, p.y, flavor, `fx-ring fx-resource-ready fx-resource-ready-${id || 'generic'}`, 240, 1.8);
  }

  function relicAcquire({ target, rarity = 'common' } = {}) {
    const p = centerOf(target);
    if (!p || !ensureLayer()) return Promise.resolve();
    const duration = reduced() ? 170 : rarity === 'rare' ? 620 : rarity === 'uncommon' ? 520 : 440;
    const emblem = target.querySelector?.('.relic-art') || target;
    const glow = node(`fx-relic-acquire fx-relic-acquire-${rarity}`, p.x, p.y, 'metal');
    const tasks = [animateAndRemove(glow, [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(.55)' },
      { opacity: .86, transform: 'translate(-50%, -50%) scale(1)', offset: .45 },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1.55)' }
    ], { duration, easing: 'ease-out' })];
    if (!reduced()) {
      try { emblem.animate?.([
        { opacity: .35, transform: 'translateY(10px) scale(.55)' },
        { opacity: 1, transform: 'translateY(-5px) scale(1.13)', offset: .6 },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration, easing: 'ease-out' }); } catch (_) {}
    }
    return Promise.all(tasks);
  }

  function relicTrigger({ id, target, priority = 'quiet' } = {}) {
    const p = centerOf(target);
    if (!p || !ensureLayer()) return Promise.resolve();
    const art = target.querySelector?.('.relic-art') || target;
    try {
      art.animate?.([
        { filter: 'brightness(1)', transform: 'scale(1)' },
        { filter: 'brightness(1.7)', transform: reduced() ? 'scale(1)' : 'scale(1.12)', offset: .42 },
        { filter: 'brightness(1)', transform: 'scale(1)' }
      ], { duration: reduced() ? 150 : 260, easing: 'ease-out' });
    } catch (_) {}
    if (priority === 'quiet' || reduced()) return Promise.resolve();
    return ring(p.x, p.y, id === 'ju_qi_lu' ? 'fire' : 'metal', `fx-ring fx-relic-trigger fx-relic-trigger-${id}`, priority === 'highlight' ? 330 : 260, 1.25);
  }

  async function potionUse({ id, source, target } = {}) {
    const from = centerOf(source), to = centerOf(target);
    if (!from || !to || !ensureLayer()) return;
    const element = ({ heal: 'wood', fire: 'fire', block: 'earth', energy: 'water', draw: 'water', cleanse: 'wood', strength: 'metal', chain: 'metal' })[id] || 'wood';
    const flight = node(`fx-potion-flight fx-potion-flight-${id}`, from.x, from.y, element);
    if (flight) flight.innerHTML = window.WXItemArt?.potionArt?.(id) || '';
    const duration = reduced() ? 135 : id === 'chain' ? 300 : 240;
    await animateAndRemove(flight, [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${(to.x - from.x) * .38}px), calc(-50% + ${(to.y - from.y) * .38 - (reduced() ? 0 : 38)}px)) scale(1.18)`, opacity: 1, offset: .42 },
      { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.55)`, opacity: 0 }
    ], { duration, easing: 'ease-in-out' });
    if (reduced()) return flash(to.x, to.y, element, `fx-flash fx-potion-land fx-potion-land-${id}`, 120);
    if (id === 'chain') {
      await Promise.all(ORDER.map((flavor, i) => {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const mote = node(`fx-potion-chain-mote fx-element-${flavor}`, to.x, to.y, flavor);
        return animateAndRemove(mote, [
          { transform: `translate(calc(-50% + ${Math.cos(a) * 35}px), calc(-50% + ${Math.sin(a) * 35}px)) scale(.75)`, opacity: 0 },
          { opacity: 1, offset: .24 },
          { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 }
        ], { duration: 280, delay: i * 24, easing: 'ease-in' });
      }));
      return;
    }
    if (id === 'fire') return Promise.all([flash(to.x, to.y, 'fire', 'fx-flash fx-potion-fire', 180), ring(to.x, to.y, 'fire', 'fx-ring fx-potion-fire-ring', 190, 1.7)]);
    if (id === 'block') return ring(to.x, to.y, 'earth', 'fx-ring fx-potion-shield', 210, 1.35);
    if (id === 'cleanse') return Promise.all([ring(to.x, to.y, 'wood', 'fx-ring fx-potion-cleanse', 210, .4), flash(to.x, to.y, 'wood', 'fx-flash fx-potion-heal', 160)]);
    if (id === 'heal') return flash(to.x, to.y, 'wood', 'fx-flash fx-potion-heal', 180);
    if (id === 'energy') return ring(to.x, to.y, 'water', 'fx-ring fx-potion-energy', 180, 1.2);
    if (id === 'draw') return ring(to.x, to.y, 'water', 'fx-ring fx-potion-draw', 170, 1.4);
    return flash(to.x, to.y, element, `fx-flash fx-potion-land-${id}`, 170);
  }

  function screenFlash({ tone = 'gold', intensity = 'strong' } = {}) {
    if (reduced() || !ensureLayer()) return Promise.resolve();
    const el = node(`fx-screen-flash fx-screen-flash-${tone} fx-screen-flash-${intensity}`, window.innerWidth / 2, window.innerHeight / 2, 'metal');
    return animateAndRemove(el, [
      { opacity: 0 }, { opacity: intensity === 'ritual' ? .16 : intensity === 'finisher' ? .12 : .08, offset: .18 }, { opacity: 0 }
    ], { duration: intensity === 'ritual' ? 360 : 190, easing: 'ease-out' });
  }

  function cardTrail({ from, to, element = 'earth', finisher = false } = {}) {
    const start = centerOf(from), end = centerOf(to);
    if (!start || !end || reduced()) return Promise.resolve();
    const count = finisher ? 5 : 3;
    return Promise.all(Array.from({ length: count }, (_, i) => {
      const nodeEl = node(`fx-card-trail fx-card-trail-${element}`, start.x, start.y, element);
      const t = (i + 1) / (count + 1);
      const x = end.x - start.x, y = end.y - start.y;
      return animateAndRemove(nodeEl, [
        { transform: `translate(-50%, -50%) translate(${x * (t - .16)}px, ${y * (t - .16)}px) scale(.45)`, opacity: 0 },
        { transform: `translate(-50%, -50%) translate(${x * t}px, ${y * t}px) scale(1)`, opacity: finisher ? .85 : .58, offset: .42 },
        { transform: `translate(-50%, -50%) translate(${x * (t + .1)}px, ${y * (t + .1)}px) scale(.2)`, opacity: 0 }
      ], { duration: finisher ? 280 : 220, delay: i * (finisher ? 34 : 28), easing: 'ease-out' });
    }));
  }

  async function playCardFlight({ visual, element, cardType, target, finisher = false } = {}) {
    if (!visual?.ghost) return;
    const destination = centerOf(target) || { x: window.innerWidth / 2, y: window.innerHeight * .38 };
    const dx = destination.x - visual.centerX;
    const dy = destination.y - visual.centerY;
    const duration = finisher ? 295 : cardType === 'power' ? 285 : cardType === 'skill' ? 255 : 230;
    try {
      if (!reduced()) {
        void cardTrail({ from: { x: visual.centerX, y: visual.centerY }, to: destination, element, finisher });
        await animateAndRemove(visual.ghost, [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0, easing: 'ease-out' },
          { transform: `translate(0, -18px) scale(${finisher ? 1.34 : 1.20})`, opacity: 1, offset: .2, easing: 'cubic-bezier(.2,.8,.25,1)' },
          { transform: `translate(0, -18px) scale(${finisher ? 1.34 : 1.20})`, opacity: 1, filter: 'drop-shadow(0 0 25px var(--fx-color))', offset: .31, easing: 'ease-in' },
          { transform: `translate(${dx * .53}px, ${dy * .47 - 32}px) rotate(${cardType === 'attack' ? -9 : 3}deg) scale(1.23)`, opacity: 1, offset: .58, easing: 'ease-in' },
          { transform: `translate(${dx * .88}px, ${dy * .84}px) rotate(0deg) scale(1.05)`, opacity: 1, offset: .82, easing: 'ease-in' },
          { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(.82)`, opacity: 0, offset: 1 }
        ], { duration, easing: 'linear' });
      }
    } finally { clear(visual); }
  }

  function elementBurst({ element, x, y, strength = 1 } = {}) {
    if (reduced() || !ensureLayer() || !Number.isFinite(x) || !Number.isFinite(y)) return Promise.resolve();
    const type = ORDER.includes(element) ? element : 'earth';
    const count = Math.min(strength > 1 ? 16 : 10, 18);
    const travel = ({ wood: 78, fire: 98, earth: 43, metal: 85, water: 82 })[type] * Math.min(strength, 1.35);
    const animations = [ring(x, y, type, 'fx-ring fx-element-' + type, type === 'water' ? 350 : 320, type === 'water' ? 2.8 : type === 'earth' ? 2 : 2.25)];
    if (type === 'fire') animations.push(flash(x, y, type, 'fx-flash fx-fire-core', 200));
    if (type === 'metal') {
      animations.push(animateAndRemove(node('fx-slash fx-element-metal', x, y, type), [
        { transform: 'translate(-90%, -50%) rotate(-34deg) scaleX(.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-34deg) scaleX(1.2)', opacity: 1, offset: .45 },
        { transform: 'translate(-10%, -50%) rotate(-34deg) scaleX(.7)', opacity: 0 }
      ], { duration: 265, easing: 'ease-out' }));
      animations.push(animateAndRemove(node('fx-slash fx-slash-secondary fx-element-metal', x + 9, y - 9, type), [
        { transform: 'translate(-80%, -50%) rotate(-34deg) scaleX(.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-34deg) scaleX(1)', opacity: .55, offset: .5 },
        { transform: 'translate(-10%, -50%) rotate(-34deg) scaleX(.7)', opacity: 0 }
      ], { duration: 240, delay: 35, easing: 'ease-out' }));
    }
    for (let i = 0; i < count; i++) {
      const a = 2 * Math.PI * i / count + .32;
      const distance = travel * (.64 + (i % 3) * .18);
      const px = Math.cos(a) * distance;
      const py = Math.sin(a) * distance - (type === 'wood' ? 24 : type === 'fire' ? 27 : 0);
      const p = node('fx-particle fx-element-' + type, x, y, type);
      animations.push(animateAndRemove(p, [
        { transform: `translate(-50%, -50%) rotate(${i * 28}deg) scale(.5)`, opacity: 0 },
        { transform: `translate(calc(-50% + ${px * .25}px), calc(-50% + ${py * .25}px)) rotate(${i * 28 + 25}deg) scale(1)`, opacity: 1, offset: .22 },
        { transform: `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${i * 28 + 90}deg) scale(.4)`, opacity: 0 }
      ], { duration: 275 + (i % 3) * 24, easing: 'cubic-bezier(.15,.75,.4,1)' }));
    }
    return Promise.all(animations);
  }

  async function impact({ target, element, heavy = false, legend = false } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return;
    try {
      const hitEl = target?.querySelector?.('.enemy-art-figure') || target?.querySelector?.('.enemy-art') || target?.querySelector?.('.enemy-body') || target;
      if (hitEl && typeof hitEl.animate === 'function') {
        hitEl.animate(element === 'earth' ? [
          { transform: 'translateY(0) scaleY(1)' }, { transform: heavy ? 'translateY(3px) scaleY(.94)' : 'translateY(1.5px) scaleY(.98)' },
          { transform: 'translateY(0) scaleY(1)' }
        ] : heavy ? [
          { transform: 'translateX(0) scale(1)' }, { transform: 'translateX(-5px) scale(1.03)' },
          { transform: 'translateX(5px) scale(.98)' }, { transform: 'translateX(0) scale(1)' }
        ] : [
          { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }
        ], { duration: heavy ? 260 : 220, easing: 'ease-out' });
      }
    } catch (_) {}
    return Promise.all([
      ring(pos.x, pos.y, element, heavy ? 'fx-ring fx-impact fx-impact-heavy' : 'fx-ring fx-impact', heavy ? 340 : 315, heavy ? 2.9 : 2.2),
      heavy ? flash(pos.x, pos.y, element, 'fx-flash fx-impact-flash', legend ? 260 : 180) : Promise.resolve(),
      legend ? ring(pos.x, pos.y, element, 'fx-ring fx-impact-legend', 390, 3.7) : Promise.resolve()
    ]);
  }

  function block({ target, amount = 0 } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    const arc = offsetY => animateAndRemove(node('fx-shield-arc', p.x, p.y + offsetY, 'water'), [
      { transform: 'translate(-50%, -45%) scale(.72)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: .9, offset: .4 },
      { transform: 'translate(-50%, -58%) scale(1.18)', opacity: 0 }
    ], { duration: 230, easing: 'ease-out' });
    return Promise.all([
      ring(p.x, p.y, 'water', 'fx-ring fx-shield', 300, 2.3),
      arc(0),
      amount >= 15 ? arc(12) : Promise.resolve()
    ]);
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
    const animations = [ring(p.x, p.y, element, debuff ? 'fx-ring fx-status-debuff' : 'fx-ring fx-status-buff', 280, 1.65)];
    if (key === 'poison') for (let i = 0; i < 4; i++) {
      const x = p.x + (i - 1.5) * 17, y = p.y + 16;
      animations.push(animateAndRemove(node('fx-poison-mist', x, y, 'wood'), [
        { transform: 'translate(-50%, 0) scale(.65)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(i - 1.5) * 10}px), -22px) scale(1.1)`, opacity: .72, offset: .38 },
        { transform: `translate(calc(-50% + ${(i - 1.5) * 15}px), -38px) scale(.7)`, opacity: 0 }
      ], { duration: 320 + i * 24, easing: 'ease-out' }));
    } else if (key === 'burn') {
      animations.push(animateAndRemove(node('fx-status-flame', p.x, p.y + 28, 'fire'), [
        { transform: 'translate(-50%, -50%) scale(.45)', opacity: 0 },
        { transform: 'translate(-50%, -85%) scale(1)', opacity: .9, offset: .3 },
        { transform: 'translate(-50%, -140%) scale(.65)', opacity: 0 }
      ], { duration: 390, easing: 'ease-out' }));
    }
    return Promise.all(animations);
  }

  function chainPulse({ target, element } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    try { target.animate?.([
      { transform: 'scale(1)' }, { transform: 'scale(1.10)' }, { transform: 'scale(1)' }
    ], { duration: 350, easing: 'ease-out' }); } catch (_) {}
    return ring(p.x, p.y, element, 'fx-ring fx-chain-pulse', 350, 2.7);
  }

  function overcomeBurst({ target, element } = {}) {
    const p = centerOf(target);
    if (!p || reduced()) return Promise.resolve();
    return Promise.all([
      elementBurst({ element, x: p.x, y: p.y, strength: 1.4 }),
      ring(p.x, p.y, element, 'fx-ring fx-overcome', 340, 2.7),
      ring(p.x, p.y, element, 'fx-ring fx-overcome-echo', 330, 3, 70),
      flash(p.x, p.y, element, 'fx-flash fx-overcome-flash', 190),
      screenFlash({ tone: 'overcome', intensity: 'strong' })
    ]);
  }

  function monkFinisher({ target, source, cardId, element, empowered }) {
    const pos = centerOf(target);
    if (!pos) return Promise.resolve();
    const origin = centerOf(source) || { x: window.innerWidth / 2, y: window.innerHeight * .68 };
    const style = `fx-monk-${cardId.replaceAll('_', '-')}`;
    const isBlock = cardId === 'han_shan_shi';
    const isThorns = cardId === 'jin_gang_zhen_nu';
    const color = isThorns ? 'metal' : element;
    const animations = [
      ring(pos.x, pos.y, color, `fx-ring ${style}${empowered ? ' fx-empowered' : ''}${isThorns ? ' fx-finisher-metal-ring' : ''}`, isThorns ? 390 : 420, empowered ? 4.3 : isThorns ? 3.2 : 3.8),
      flash(pos.x, pos.y, color, `fx-flash ${style}`, isThorns ? 180 : 205, isThorns ? 45 : 85),
      cameraPunch({ strength: 'heavy' })
    ];
    if (isThorns) animations.push(ring(origin.x, origin.y, color, `fx-ring ${style}`, 360, 2.7));
    else animations.push(ring(pos.x, pos.y, color, `fx-ring ${style}`, 390, 2.7, 45));
    const particleCount = (isThorns ? 8 : 6) + (empowered ? 2 : 0);
    for (let i = 0; i < particleCount; i++) {
      const angle = i * Math.PI * 2 / particleCount;
      const dx = Math.cos(angle) * (isThorns ? 115 : 80);
      const dy = Math.sin(angle) * (isThorns ? 85 : 68);
      const x = isBlock || isThorns ? origin.x : pos.x;
      const y = isBlock || isThorns ? origin.y : pos.y;
      const particle = node(`fx-particle fx-finisher-particle ${style}`, x, y, color);
      if (isThorns) particle?.classList?.add?.('fx-finisher-metal');
      animations.push(animateAndRemove(particle, isBlock ? [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(pos.x - origin.x) * .55 + dx * .2}px), calc(-50% + ${(pos.y - origin.y) * .55 + dy * .2}px)) scale(1)`, opacity: 1, offset: .52 },
        { transform: `translate(calc(-50% + ${pos.x - origin.x + dx * .2}px), calc(-50% + ${pos.y - origin.y + dy * .2}px)) scale(.1)`, opacity: 0 }
      ] : [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`, opacity: 1, offset: .42 },
        { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy * 1.3}px)) scale(.15)`, opacity: 0 }
      ], { duration: isThorns ? 360 : 400, easing: 'ease-out' }));
    }
    return Promise.all(animations);
  }

  function finisher({ target, source, element = 'metal', kind, cardId, empowered = false } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    if (kind === 'monk' && ['han_shan_shi', 'jin_gang_zhen_nu', 'beng_tian_shi'].includes(cardId)) {
      return monkFinisher({ target, source, cardId, element, empowered });
    }
    if (kind === 'alchemist') return alchemistFinisher({ target, source, cardId, element, empowered });
    const slash = node(`fx-slash fx-finisher-slash fx-finisher-${element}`, pos.x, pos.y, element);
    const animations = [
      ring(pos.x, pos.y, element, `fx-ring fx-finisher-ring${empowered ? ' fx-empowered' : ''}`, 360, empowered ? 3.8 : 3.2),
      ring(pos.x, pos.y, element, 'fx-ring fx-finisher-ring fx-finisher-echo', 330, 2.6, 30),
      flash(pos.x, pos.y, element, 'fx-flash fx-finisher-flash', 190, 75),
      cameraPunch({ strength: 'heavy' }),
      animateAndRemove(slash, [
        { transform: 'translate(-90%, -50%) rotate(-34deg) scaleX(.1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-34deg) scaleX(1.35)', opacity: 1, offset: .5 },
        { transform: 'translate(10%, -50%) rotate(-34deg) scaleX(.8)', opacity: 0 }
      ], { duration: 330, easing: 'ease-out' })
    ];
    const particleCount = empowered ? 8 : 6;
    for (let index = 0; index < particleCount; index++) {
      const angle = Math.PI * 2 * index / particleCount;
      const dx = Math.cos(angle) * 95;
      const dy = Math.sin(angle) * 75;
      animations.push(animateAndRemove(node(`fx-particle fx-element-metal fx-finisher-particle${element === 'metal' ? ' fx-finisher-metal' : ''}`, pos.x, pos.y, element), [
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * .7}px), calc(-50% + ${dy * .7}px)) scale(1)`, opacity: 1, offset: .25 },
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 }
      ], { duration: 300, easing: 'ease-in' }));
    }
    if (cardId === 'cang_lang') {
      for (let i = 0; i < 3; i++) animations.push(animateAndRemove(node(`fx-slash fx-finisher-slash fx-sword-cang-lang`, pos.x, pos.y, 'water'), [
        { transform: `translate(-50%, -50%) translateX(-70px) rotate(${i * 12 - 28}deg) scaleX(.1)`, opacity: 0 },
        { transform: `translate(-50%, -50%) rotate(${i * 12 - 28}deg) scaleX(1.2)`, opacity: 1, offset: .46 },
        { transform: `translate(-50%, -50%) translateX(70px) rotate(${i * 12 - 28}deg) scaleX(.7)`, opacity: 0 }
      ], { duration: 200, delay: i * 45, easing: 'ease-out' }));
    } else if (cardId === 'tian_he') {
      animations.push(ring(pos.x - 54, pos.y, 'water', 'fx-ring fx-sword-tian-he', 350, 2.4));
      animations.push(ring(pos.x + 54, pos.y, 'metal', 'fx-ring fx-sword-tian-he', 350, 2.4, 40));
    } else if (cardId === 'yi_jian_kai_tian') {
      animations.push(animateAndRemove(node('fx-slash fx-finisher-slash fx-sword-kai-tian', pos.x, pos.y, 'metal'), [
        { transform: 'translate(-50%, -50%) rotate(-70deg) scaleX(.05)', opacity: 0 },
        { transform: 'translate(-50%, -50%) rotate(-70deg) scaleX(1.45)', opacity: 1, offset: .42 },
        { transform: 'translate(-50%, -50%) rotate(-70deg) scaleX(1.1)', opacity: 0 }
      ], { duration: 300, delay: 50, easing: 'ease-out' }));
    }
    return Promise.all(animations);
  }

  function alchemistFinisher({ target, source, cardId, element, empowered }) {
    const pos = centerOf(target), origin = centerOf(source) || { x: window.innerWidth / 2, y: window.innerHeight * .68 };
    if (!pos) return Promise.resolve();
    const style = `fx-alchemist-${(cardId || 'finisher').replaceAll('_', '-')}`;
    const animations = [ring(pos.x, pos.y, element, `fx-ring fx-finisher-ring ${style}${empowered ? ' fx-empowered' : ''}`, 420, empowered ? 4.1 : 3.4)];
    if (cardId === 'bai_du_gui_yuan') {
      animations.push(animateAndRemove(node(`fx-alchemist-vortex ${style}`, pos.x, pos.y, 'wood'), [
        { transform: 'translate(-50%, -50%) scale(2.8) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.25) rotate(150deg)', opacity: .95, offset: .52 },
        { transform: 'translate(-50%, -50%) scale(.1) rotate(300deg)', opacity: 0 }
      ], { duration: 410, easing: 'ease-in' }));
    } else if (cardId === 'chi_lu_fen_tian') {
      animations.push(animateAndRemove(node(`fx-alchemist-pillar ${style}`, pos.x, pos.y + 30, 'fire'), [
        { transform: 'translate(-50%, 0) scaleY(.1)', opacity: 0 },
        { transform: 'translate(-50%, -80px) scaleY(1)', opacity: .9, offset: .5 },
        { transform: 'translate(-50%, -130px) scaleY(.7)', opacity: 0 }
      ], { duration: 360, easing: 'ease-out' }));
      animations.push(flash(pos.x, pos.y, 'fire', `fx-flash ${style}`, 200, 125));
    } else if (cardId === 'qing_di_hui_tian') {
      for (let i = 0; i < (empowered ? 7 : 5); i++) {
        const angle = i * Math.PI * 2 / 5;
        const sx = origin.x + Math.cos(angle) * 36, sy = origin.y + Math.sin(angle) * 25;
        animations.push(animateAndRemove(node(`fx-particle fx-element-wood fx-alchemist-heal ${style}`, sx, sy, 'wood'), [
          { transform: 'translate(-50%, -50%) scale(.25)', opacity: 0 },
          { transform: `translate(calc(-50% + ${(pos.x - sx) * .55}px), calc(-50% + ${(pos.y - sy) * .55}px)) scale(1.2)`, opacity: 1, offset: .55 },
          { transform: `translate(calc(-50% + ${pos.x - sx}px), calc(-50% + ${pos.y - sy}px)) scale(.1)`, opacity: 0 }
        ], { duration: 340 + i * 12, delay: i * 20, easing: 'ease-in' }));
      }
    }
    return Promise.all(animations);
  }

  function buildAwakening({ target } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    return Promise.all([
      ring(pos.x, pos.y, 'metal', 'fx-ring fx-build-awakening', 900, 3.8),
      flash(pos.x, pos.y, 'metal', 'fx-flash fx-build-awakening', 360, 80)
    ]);
  }

  function daoAwakening({ target, element = 'metal' } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    const animations = [
      ring(pos.x, pos.y, element, 'fx-ring fx-dao-awakening', 900, 4.1),
      flash(pos.x, pos.y, element, 'fx-flash fx-dao-awakening', 520, 110)
    ];
    for (let i = 0; i < ORDER.length; i++) {
      const angle = i * Math.PI * 2 / ORDER.length;
      const startX = pos.x + Math.cos(angle) * 100;
      const startY = pos.y + Math.sin(angle) * 80;
      animations.push(animateAndRemove(node('fx-particle fx-dao-awakening-particle', startX, startY, ORDER[i]), [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: .15 },
        { transform: `translate(calc(-50% + ${pos.x - startX}px), calc(-50% + ${pos.y - startY}px)) scale(.45)`, opacity: .95, offset: .7 },
        { transform: `translate(calc(-50% + ${pos.x - startX}px), calc(-50% + ${pos.y - startY}px)) scale(0)`, opacity: 0 }
      ], { duration: 850, easing: 'ease-in' }));
    }
    return Promise.all(animations);
  }

  function fateReveal({ target } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    const animations = [
      ring(pos.x, pos.y, 'metal', 'fx-ring fx-fate-reveal', 1200, 4.8),
      flash(pos.x, pos.y, 'metal', 'fx-flash fx-fate-reveal', 580, 140)
    ];
    for (let i = 0; i < ORDER.length; i++) {
      const angle = i * Math.PI * 2 / ORDER.length;
      const startX = pos.x + Math.cos(angle) * 150;
      const startY = pos.y + Math.sin(angle) * 115;
      animations.push(animateAndRemove(node('fx-particle fx-fate-particle', startX, startY, ORDER[i]), [
        { transform: 'translate(-50%, -50%) scale(.7)', opacity: 0 },
        { transform: `translate(calc(-50% + ${pos.x - startX}px), calc(-50% + ${pos.y - startY}px)) scale(1.2)`, opacity: 1, offset: .72 },
        { transform: `translate(calc(-50% + ${pos.x - startX}px), calc(-50% + ${pos.y - startY}px)) scale(0)`, opacity: 0 }
      ], { duration: 1120, easing: 'ease-in-out' }));
    }
    return Promise.all(animations);
  }

  function fatePulse({ target } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    return Promise.all([
      ring(pos.x, pos.y, 'metal', 'fx-ring fx-fate-pulse', 480, 2.6),
      flash(pos.x, pos.y, 'metal', 'fx-flash fx-fate-pulse', 280, 70)
    ]);
  }

  function encounterIntro({ target, tier = 'elite', element = 'metal' } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    const boss = tier === 'boss';
    return Promise.all([
      ring(pos.x, pos.y, element, 'fx-ring fx-encounter-intro', boss ? 760 : 480, boss ? 3.5 : 2.3),
      flash(pos.x, pos.y, element, 'fx-flash fx-encounter-intro', boss ? 360 : 230, 80)
    ]);
  }

  async function bossPhase({ target, element = 'earth', enemyId } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    const identity = enemyId === 'shan_gui' ? 'shan-gui' : enemyId === 'chi_ba' ? 'chi-ba' : enemyId === 'tai_xu' ? 'tai-xu' : 'generic';
    const animations = identity === 'tai-xu' ? [] : [cameraPunch({ strength: 'heavy' })];
    if (identity === 'shan-gui') {
      try { target?.querySelector?.('.enemy-art')?.animate?.([
        { transform: 'translateY(0)' }, { transform: 'translateY(6px)' },
        { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }
      ], { duration: 220, easing: 'ease-out' }); } catch (_) {}
      const crack = node('fx-boss-phase fx-boss-phase-shan-gui', pos.x, pos.y + 52, 'earth');
      animations.push(animateAndRemove(crack, [
        { transform: 'translate(-50%, -50%) scale(.35, .2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1, 1)', opacity: .95, offset: .38 },
        { transform: 'translate(-50%, -50%) scale(1.35, .65)', opacity: 0 }
      ], { duration: 350, easing: 'ease-out' }));
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        animations.push(animateAndRemove(node('fx-particle fx-boss-phase fx-boss-phase-shan-gui', pos.x, pos.y + 45, 'earth'), [
          { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * 62}px), calc(-50% + ${Math.sin(angle) * 36}px - 18px)) scale(1)`, opacity: .9, offset: .45 },
          { transform: `translate(calc(-50% + ${Math.cos(angle) * 92}px), calc(-50% + ${Math.sin(angle) * 58}px)) scale(.2)`, opacity: 0 }
        ], { duration: 390, delay: i * 12, easing: 'ease-out' }));
      }
    } else if (identity === 'chi-ba') {
      const pillar = node('fx-boss-phase fx-boss-phase-chi-ba fx-alchemist-pillar', pos.x, pos.y + 52, 'fire');
      animations.push(animateAndRemove(pillar, [
        { transform: 'translate(-50%, 0) scaleY(.08)', opacity: 0 },
        { transform: 'translate(-50%, -90px) scaleY(1.15)', opacity: .98, offset: .52 },
        { transform: 'translate(-50%, -145px) scaleY(.7)', opacity: 0 }
      ], { duration: 430, easing: 'ease-out' }));
      animations.push(flash(pos.x, pos.y, 'fire', 'fx-flash fx-boss-phase fx-boss-phase-chi-ba', 220));
      animations.push(screenFlash({ tone: 'fire', intensity: 'strong' }));
      for (let i = 0; i < 6; i++) {
        const x = pos.x + (i - 2.5) * 18;
        animations.push(animateAndRemove(node('fx-particle fx-boss-phase fx-boss-phase-chi-ba', x, pos.y + 42, 'fire'), [
          { transform: 'translate(-50%, 0) scale(.8)', opacity: 0 },
          { transform: 'translate(-50%, -65px) scale(1)', opacity: 1, offset: .35 },
          { transform: `translate(calc(-50% + ${(i - 2.5) * 13}px), -130px) scale(.2)`, opacity: 0 }
        ], { duration: 400, delay: i * 24, easing: 'ease-out' }));
      }
    } else if (identity === 'tai-xu') {
      const fiveElements = [];
      for (let index = 0; index < ORDER.length; index++) {
        const angle = index * Math.PI * 2 / ORDER.length - Math.PI / 2;
        const x = pos.x + Math.cos(angle) * 100, y = pos.y + Math.sin(angle) * 68;
        const element = ORDER[index], delay = index * 45;
        fiveElements.push(animateAndRemove(node(`fx-particle fx-boss-phase fx-boss-phase-tai-xu fx-element-${element}`, x, y, element), [
          { transform: 'translate(-50%, -50%) scale(.35)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.15)', opacity: .95, offset: .4 },
          { transform: `translate(calc(-50% + ${pos.x - x}px), calc(-50% + ${pos.y - y}px)) scale(.18)`, opacity: 0 }
        ], { duration: 230, delay, easing: 'ease-in' }));
      }
      await Promise.all(fiveElements);
      return Promise.all([
        cameraPunch({ strength: 'heavy' }),
        ring(pos.x, pos.y, 'metal', 'fx-ring fx-boss-phase fx-boss-phase-tai-xu', 360, 3.6),
        flash(pos.x, pos.y, 'metal', 'fx-flash fx-boss-phase fx-boss-phase-tai-xu', 220),
        screenFlash({ tone: 'metal', intensity: 'strong' })
      ]);
    } else {
      animations.push(ring(pos.x, pos.y, element, 'fx-ring fx-boss-phase', 380, 3.2));
      animations.push(flash(pos.x, pos.y, element, 'fx-flash fx-boss-phase', 220, 80));
    }
    return Promise.all(animations);
  }

  function encounterDefeat({ target, tier = 'elite', element = 'metal' } = {}) {
    const pos = centerOf(target);
    if (!pos || reduced()) return Promise.resolve();
    return Promise.all([
      ring(pos.x, pos.y, element, 'fx-ring fx-encounter-defeat', tier === 'boss' ? 680 : 360, tier === 'boss' ? 3.3 : 2),
      flash(pos.x, pos.y, element, 'fx-flash fx-encounter-defeat', tier === 'boss' ? 360 : 210)
    ]);
  }

  async function statusDetonate({ status, target, source, stacks = 0 } = {}) {
    if (reduced()) return Promise.resolve();
    const dest = centerOf(target);
    if (!dest || !['poison', 'burn', 'regen', 'thorns'].includes(status)) return Promise.resolve();
    const element = status === 'burn' ? 'fire' : status === 'thorns' ? 'metal' : 'wood';
    const origin = centerOf(source) || dest;
    const stackSeal = status === 'poison' ? node('fx-detonate-stack fx-detonate-poison', dest.x, dest.y, element) : null;
    if (stackSeal) stackSeal.textContent = stacks > 0 ? `×${stacks}` : '';
    if (status === 'poison') {
      await animateAndRemove(stackSeal, [
        { transform: 'translate(-50%, -50%) scale(.65)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: .5 },
        { transform: 'translate(-50%, -50%) scale(1.45)', opacity: .88 }
      ], { duration: 110, easing: 'ease-out' });
      const vortex = node('fx-detonate-vortex', dest.x, dest.y, element);
      await animateAndRemove(vortex, [
        { transform: 'translate(-50%, -50%) scale(1.55) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(.62) rotate(180deg)', opacity: .95, offset: .64 },
        { transform: 'translate(-50%, -50%) scale(.18) rotate(285deg)', opacity: .3 }
      ], { duration: 100, easing: 'ease-in' });
      const burst = [ring(dest.x, dest.y, element, 'fx-ring fx-detonate-poison', 160, 3.1), flash(dest.x, dest.y, element, 'fx-flash fx-detonate-poison', 145)];
      for (let index = 0; index < 8; index++) {
        const angle = 2 * Math.PI * index / 8;
        const dx = Math.cos(angle) * 80, dy = Math.sin(angle) * 80;
        burst.push(animateAndRemove(node('fx-particle fx-detonate-particle fx-detonate-poison', dest.x, dest.y, element), [
          { transform: 'translate(-50%, -50%) scale(.25)', opacity: .1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.2)`, opacity: 1, offset: .32 },
          { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy * 1.25}px)) scale(.2)`, opacity: 0 }
        ], { duration: 145, easing: 'ease-out' }));
      }
      await Promise.all(burst);
      return;
    }
    if (status === 'burn') {
      await animateAndRemove(node('fx-detonate-fire-gather', dest.x, dest.y + 42, element), [
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: .55 },
        { transform: 'translate(-50%, -50%) scale(.82)', opacity: .9 }
      ], { duration: 100, easing: 'ease-in' });
      const column = animateAndRemove(node('fx-detonate-fire-column', dest.x, dest.y + 35, element), [
        { transform: 'translate(-50%, 0) scaleY(.12)', opacity: 0 },
        { transform: 'translate(-50%, -95px) scaleY(1.08)', opacity: .98, offset: .52 },
        { transform: 'translate(-50%, -155px) scaleY(.55)', opacity: 0 }
        ], { duration: 220, easing: 'ease-out' });
      const burst = [column, ring(dest.x, dest.y, element, 'fx-ring fx-detonate-burn', 220, 3.6), flash(dest.x, dest.y, element, 'fx-flash fx-detonate-burn', 170)];
      for (let index = 0; index < 8; index++) {
        const angle = 2 * Math.PI * index / 8, dx = Math.cos(angle) * 94, dy = Math.sin(angle) * 94;
        burst.push(animateAndRemove(node('fx-particle fx-detonate-particle fx-detonate-burn', dest.x, dest.y, element), [
          { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * .35}px), calc(-50% + ${dy * .35 - 35}px)) scale(1)`, opacity: 1, offset: .38 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy - 60}px)) scale(.18)`, opacity: 0 }
        ], { duration: 220, easing: 'ease-out' }));
      }
      await Promise.all(burst);
      return;
    }
    if (status === 'regen') {
      await Promise.all([
        ring(origin.x, origin.y, 'wood', 'fx-ring fx-detonate-regen-gather', 150, 1.6),
        ...Array.from({ length: 5 }, (_, i) => {
          const angle = i * Math.PI * 2 / 5, sx = origin.x + Math.cos(angle) * 34, sy = origin.y + Math.sin(angle) * 25;
          return animateAndRemove(node('fx-particle fx-detonate-regen-gather fx-element-wood', sx, sy, 'wood'), [
            { transform: 'translate(-50%, -50%) scale(.25)', opacity: 0 },
            { transform: `translate(calc(-50% + ${origin.x - sx}px), calc(-50% + ${origin.y - sy}px)) scale(.85)`, opacity: 1 }
          ], { duration: 140, easing: 'ease-in' });
        })
      ]);
      const release = [];
      for (let i = 0; i < 6; i++) {
        const sx = origin.x + (i - 2.5) * 9;
        release.push(animateAndRemove(node('fx-particle fx-detonate-particle fx-detonate-regen fx-element-wood', sx, origin.y, 'wood'), [
          { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
          { transform: `translate(calc(-50% + ${(dest.x - sx) * .55}px), calc(-50% + ${(dest.y - origin.y) * .55}px)) scale(1)`, opacity: 1, offset: .6 },
          { transform: `translate(calc(-50% + ${dest.x - sx}px), calc(-50% + ${dest.y - origin.y}px)) scale(.2)`, opacity: 0 }
        ], { duration: 220, delay: i * 12, easing: 'ease-in' }));
      }
      release.push(ring(dest.x, dest.y, 'wood', 'fx-ring fx-detonate-regen', 160, 1.9, 60));
      await Promise.all(release);
      return;
    }
    const animations = [ring(dest.x, dest.y, element, 'fx-ring fx-detonate-thorns', 260, 3.1), flash(dest.x, dest.y, element, 'fx-flash fx-detonate-thorns', 170)];
    for (let index = 0; index < 8; index++) {
      const angle = 2 * Math.PI * index / 8;
      const spread = 80;
      const dx = Math.cos(angle) * spread;
      const dy = Math.sin(angle) * spread;
      const particle = node('fx-particle fx-detonate-particle fx-detonate-thorns', dest.x, dest.y, element);
      animations.push(animateAndRemove(particle, [
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`, opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 1, offset: .38 },
        { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy * 1.25}px)) scale(.2)`, opacity: 0 }
      ], { duration: 260, easing: 'ease-out' }));
    }
    await Promise.all(animations);
  }

  async function zhoutian() {
    if (reduced() || !ensureLayer()) return;
    const x = window.innerWidth / 2;
    const y = window.innerHeight * .5;
    const prelude = [];
    for (let i = 0; i < ORDER.length; i++) {
      const angle = i * Math.PI * 2 / ORDER.length - Math.PI / 2;
      const sx = x + Math.cos(angle) * 120, sy = y + Math.sin(angle) * 88;
      const element = ORDER[i];
      const seal = node(`fx-ring fx-zhoutian-node fx-zhoutian-node-${element}`, sx, sy, element);
      const stream = node(`fx-particle fx-zhoutian-converge fx-element-${element}`, sx, sy, element);
      const delay = i * 40;
      prelude.push(animateAndRemove(seal, [
        { transform: 'translate(-50%, -50%) scale(.55)', opacity: .25 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: .9, offset: .38 },
        { transform: `translate(calc(-50% + ${x - sx}px), calc(-50% + ${y - sy}px)) scale(.2)`, opacity: 0 }
      ], { duration: 300, delay, easing: 'ease-in' }));
      prelude.push(animateAndRemove(stream, [
        { transform: `translate(calc(-50% + ${-Math.cos(angle) * 18}px), calc(-50% + ${-Math.sin(angle) * 18}px)) scale(.65)`, opacity: 0 },
        { transform: `translate(calc(-50% + ${(x - sx) * .62}px), calc(-50% + ${(y - sy) * .62}px)) scale(1.1)`, opacity: 1, offset: .62 },
        { transform: `translate(calc(-50% + ${x - sx}px), calc(-50% + ${y - sy}px)) scale(.3)`, opacity: 0 }
      ], { duration: 300, delay, easing: 'ease-in' }));
    }
    await Promise.all(prelude);
    const ringNode = node('fx-zhoutian-ring', x, y, 'metal');
    if (ringNode) ringNode.style.background = `conic-gradient(${ORDER.map(color).join(',')},${color('wood')})`;
    const wave = node('fx-zhoutian-wave', x, y, 'metal');
    const secondWave = node('fx-zhoutian-wave fx-zhoutian-wave-echo', x, y, 'metal');
    const animations = [cameraPunch({ strength: 'heavy' }), screenFlash({ tone: 'gold', intensity: 'ritual' }),
      animateAndRemove(ringNode, [
        { transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(180deg)', opacity: 1, offset: .52 },
        { transform: 'translate(-50%, -50%) scale(1.35) rotate(235deg)', opacity: 0 }
      ], { duration: 360, easing: 'ease-out' }),
      animateAndRemove(wave, [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0, offset: 0 },
        { transform: 'translate(-50%, -50%) scale(.45)', opacity: .8, offset: .46 },
        { transform: 'translate(-50%, -50%) scale(3.4)', opacity: 0 }
      ], { duration: 360, easing: 'ease-out' }),
      animateAndRemove(secondWave, [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(.7)', opacity: .95, offset: .24 },
        { transform: 'translate(-50%, -50%) scale(2.4)', opacity: 0 }
      ], { duration: 210, delay: 140, easing: 'ease-out' }),
      flash(x, y, 'metal', 'fx-flash fx-zhoutian-core', 200)
    ];
    for (let i = 0; i < 25; i++) {
      const a = Math.PI * 2 * i / 25;
      const p = node('fx-particle fx-element-' + ORDER[i % 5], x, y, ORDER[i % 5]);
      animations.push(animateAndRemove(p, [
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0, offset: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0, offset: .46 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * 160}px), calc(-50% + ${Math.sin(a) * 105}px)) scale(.75)`, opacity: 1, offset: .69 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * 225}px), calc(-50% + ${Math.sin(a) * 145}px)) scale(.2)`, opacity: 0 }
      ], { duration: 340, easing: 'ease-out' }));
    }
    try {
      document.querySelectorAll?.('.enemy-unit:not(.dead)').forEach(enemy => {
        enemy.animate?.([
          { transform: 'translateX(0)' }, { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }
        ], { duration: 180 });
      });
    } catch (_) {}
    await Promise.all(animations);
  }

  window.WXEffects = { init, captureCard, playCardFlight, cardTrail, elementBurst, elementHit, targetLine, clearTargetLine, drawCard, discardHand, cameraPunch, hitStop, resourceReady, relicAcquire, relicTrigger, potionUse, screenFlash, impact, block, heal, status, chainPulse, overcomeBurst, finisher, buildAwakening, daoAwakening, fateReveal, fatePulse, encounterIntro, bossPhase, encounterDefeat, statusDetonate, zhoutian, clear };
})();
