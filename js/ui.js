/* 《五行问道》界面层：屏幕渲染、交互、动画与音效。 */
(function () {
  'use strict';
  const D = window.WX_DATA;
  const E = window.WXEngine;
  const FX = window.WXEffects;
  function visual(method, options) {
    try { return Promise.resolve(FX?.[method]?.(options)).catch(() => {}); }
    catch (_) { return Promise.resolve(); }
  }

  const TYPE_NAMES = { attack: '攻击', skill: '技法', power: '功法', curse: '禁制', status: '业障' };
  const CHAR_GLYPHS = { sword: '剑', alchemist: '丹', monk: '体' };
  const CHAR_PORTRAITS = { sword: 'assets/characters/sword.webp', alchemist: 'assets/characters/alchemist.webp', monk: 'assets/characters/monk.webp' };
  const ENEMY_PORTRAITS = {};
  for (const [act, pool] of Object.entries(D.encounters)) {
    const normal = Array.isArray(pool.normal) ? pool.normal : Object.values(pool.normal).flat();
    for (const encounter of [...normal, ...pool.elite, pool.boss]) {
      for (const enemy of encounter.enemies) {
        ENEMY_PORTRAITS[enemy.id] = `assets/monsters/${act.padStart(2, '0')}/${enemy.id}.webp`;
      }
    }
  }
  const CHAR_SIGILS = {
    sword: '<path d="M50 8 58 23 54 66 50 73 46 66 42 23Z M35 65h30 M42 65l-6 9m22-9 6 9M50 73v10"/><path d="M21 34c8-14 17-19 29-20m29 20c-8-14-17-19-29-20"/>',
    alchemist: '<path d="M43 12h14m-11 0v19L25 69c-4 7 0 13 8 13h34c8 0 12-6 8-13L54 31V12M34 58h32"/><path d="M42 68c7-12 14-12 20-1M49 75c-3-9-1-15 5-20"/>',
    monk: '<circle cx="50" cy="48" r="36"/><path d="M22 65 41 37l10 14 10-20 18 34M31 65h38M50 13v12M18 48h11m42 0h11"/><circle cx="50" cy="48" r="5"/>'
  };
  const ACT_FLAVOR = {
    1: '山门之外，妖雾初起。循着香火与剑鸣，向山巅行去。',
    2: '魔窟深处，赤焰焚心。每一步都踩在旧日的灰烬上。',
    3: '天阙将倾，五行失序。去问一问，这天到底是谁的天。'
  };
  const RARITY_LABEL = { starter: '初始', common: '凡品', uncommon: '灵品', rare: '玄品', curse: '禁制', special: '异数' };
  const CHAR_STYLE = { sword: '连携爆发 · 直伤抽牌', alchemist: '持续伤害 · 中毒回春', monk: '厚甲反伤 · 稳健推进' };
  const CHAR_TIPS = {
    sword: '先金后水接链，遇到木属敌人时，断链打相克往往更赚。',
    alchemist: '叠毒之后靠灼烧与回春拖长战线，别急着和敌人换血。',
    monk: '留甲反伤，用土生金接攻击；护甲保留让你更敢卖血。'
  };
  const CARD_MOTIFS = {
    wood: '<path d="M49 70V19M49 47C32 45 22 36 18 25M49 38C64 35 75 25 79 13M49 58C66 57 77 48 82 38"/><path d="M18 25c4-12 14-15 20-11-1 10-9 15-20 11Zm61-12c-12-3-19 2-20 12 10 4 18-1 20-12Zm3 25c-11-4-19 0-22 9 9 6 18 2 22-9Z"/>',
    fire: '<path d="M49 72C27 69 21 54 29 40c1 11 8 12 10 9-5-13 5-22 12-39 4 14 1 20 10 28 3-7 4-12 3-18 20 22 17 48-15 52Z"/><path d="M50 67c-8-2-11-9-7-16 1 5 4 6 6 3 0-5 4-10 7-14 0 7 7 12 4 20-2 5-5 7-10 7Z"/>',
    earth: '<path d="M9 69 33 32l12 16L60 17l31 52H9Z"/><path d="m24 46 9-14 7 9m10-12 10-12 11 19M13 74h74"/>',
    metal: '<path d="m50 9 8 13-4 36-4 7-4-7-4-36 8-13ZM29 56h42M42 56l-6 9m22-9 6 9M50 65v13M39 78h22"/><path d="m24 25 11-8m30 0 11 8M20 40h13m34 0h13"/>',
    water: '<path d="M50 11c-9 13-20 24-20 38a20 20 0 0 0 40 0C70 35 59 24 50 11Z"/><path d="M21 61c9-5 17-5 26 0s17 5 26 0m-59 11c12-6 22-6 34 0s22 6 38 0"/>',
    none: '<circle cx="50" cy="43" r="25"/><path d="M50 11v64M18 43h64M27 20l46 46M73 20 27 66"/>',
    jian_yi: '<path d="M51 5 59 18 54 59 50 69 46 59 41 18Z M28 56h44M39 56l-8 9m30-9 8 9M50 69v12"/><path d="M16 24 31 16m53 8-15-8M12 42h17m59 0H71"/>',
    huo_zhong: '<path d="M50 73C28 69 24 51 34 37c-1 11 6 15 10 13-4-16 7-25 12-39 2 13 0 20 9 29 3-5 4-9 3-14 16 20 12 39-18 47Z"/><path d="M48 68c-8-5-5-13 4-21 0 7 9 11 5 18-2 4-6 5-9 3Z"/><circle cx="50" cy="63" r="3"/>',
    curse: '<circle cx="50" cy="43" r="27" stroke-dasharray="6 7"/><path d="m20 17 23 22-13 25m48-44L57 42l12 24M50 13l-6 22 12 13-8 27M27 47l16-7m15 7 17-8"/>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function enemyPortrait(id, name, loading = 'lazy', className = '') {
    const src = ENEMY_PORTRAITS[id];
    return src ? `<img class="${className}" src="${esc(src)}" alt="" loading="${loading}" decoding="async">` : esc(name.slice(0, 1));
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function hpPct(cur, max) { return Math.max(0, Math.min(100, Math.round(cur / Math.max(1, max) * 100))); }
  function pctNum(a, b) { return Math.max(0, Math.min(100, Math.round(a / Math.max(1, b) * 100))); }
  const KW_CLASS = {
    '中毒': 'debuff', '灼烧': 'debuff', '虚弱': 'debuff', '易伤': 'debuff', '定身': 'debuff',
    '护甲': 'block', '格挡': 'block', '灵气': 'energy', '连携': 'chain', '周天': 'chain',
    '锐气': 'buff', '坚韧': 'buff', '荆棘': 'buff', '回春': 'buff', '蓄势': 'buff',
    '贯穿': 'muted', '消耗': 'muted', '保留': 'muted'
  };
  function formatText(text) {
    return esc(text).replace(/中毒|灼烧|虚弱|易伤|定身|护甲|格挡|灵气|连携|周天|锐气|坚韧|荆棘|回春|蓄势|贯穿|消耗|保留/g, m => `<em class="kw kw-${KW_CLASS[m] || 'muted'}">${m}</em>`);
  }

  function sortDeck(list) {
    const typeOrder = { attack: 0, skill: 1, curse: 2, status: 3 };
    return list.slice().sort((a, b) => {
      const da = D.cardMap[a.id], db = D.cardMap[b.id];
      return (typeOrder[da.type] || 0) - (typeOrder[db.type] || 0) ||
        da.cost - db.cost ||
        (da.name > db.name ? 1 : da.name < db.name ? -1 : 0);
    });
  }

  function elem(id) { return D.elements[id] || D.elements.none; }
  function elemBadge(id) {
    const el = elem(id);
    return `<span class="elem-badge" style="--el:${el.color};--el-dark:${el.dark}" title="${esc(el.name)}行" aria-label="${esc(el.name)}行">${esc(el.glyph)}</span>`;
  }
  function statusChips(statuses, owner, index) {
    if (!statuses) return '';
    return Object.keys(D.statuses).filter(k => statuses[k] > 0).map(k => {
      const s = D.statuses[k];
      return `<button type="button" class="status-chip ${s.debuff ? 'debuff' : 'buff'}" data-action="inspect-status" data-status="${k}" data-owner="${owner}" ${owner === 'enemy' ? `data-index="${index}"` : ''} title="${esc(s.name)}：${esc(s.desc)}" aria-label="${esc(s.name)} ${statuses[k]} 层：${esc(s.desc)}">${esc(s.glyph)}<b>${statuses[k]}</b></button>`;
    }).join('');
  }
  function weakElement(enemyElem) {
    return D.elementOrder.find(e => D.elements[e].overcomes === enemyElem) || null;
  }
  function relicById(id) { return D.relicMap[id]; }
  function potionById(id) { return D.potionMap[id]; }
  function characterSigil(id) {
    return `<span class="char-sigil sigil-${esc(id)}" aria-hidden="true"><svg viewBox="0 0 100 96" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" focusable="false">${CHAR_SIGILS[id] || ''}</svg></span>`;
  }
  function relicEmblem(id) {
    const r = relicById(id);
    return r ? `<span class="relic-emblem relic-${esc(r.rarity)}" aria-hidden="true"><span class="relic-emblem-core">${esc(r.name.slice(0, 1))}</span></span>` : '';
  }
  function potionVessel(id) {
    const p = potionById(id);
    return p ? `<span class="potion-vessel potion-${esc(id)}" aria-hidden="true"><svg viewBox="0 0 36 44" focusable="false"><path class="vessel-stop" d="M12 5h12v5H12z"/><path class="vessel-glass" d="M13 10h10v5c0 2 8 8 8 16 0 6-5 9-13 9S5 37 5 31c0-8 8-14 8-16z"/><path class="vessel-liquid" d="M8 29c6-3 13 2 20-1 2 7-2 9-10 9S7 35 8 29z"/><path class="vessel-shine" d="M11 25c1-3 3-6 5-8"/></svg><span class="potion-rune">${esc(p.icon)}</span></span>` : '';
  }
  function cardData(inst) { return E.getCardData(inst); }
  function cardArt(element, id, rarity) {
    const key = id === 'jian_yi' || id === 'huo_zhong' ? id : rarity === 'curse' ? 'curse' : element;
    const motif = CARD_MOTIFS[key] || CARD_MOTIFS.none;
    return `<svg class="card-art-icon motif-${key.replace(/_/g, '-')}" viewBox="0 0 100 85" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${motif}</svg>`;
  }

  function cardHTML(inst, opts) {
    opts = opts || {};
    const data = cardData(inst);
    if (!data) return '';
    const mode = opts.mode || 'static';
    const el = elem(data.element);
    const upgraded = !!inst.up;
    const faceName = D.cardMap[inst.id] ? D.cardMap[inst.id].name : data.name;
    const isHand = mode === 'hand';
    const canPlay = isHand ? E.canPlayCard(UI.state, opts.index) : null;
    const cost = canPlay && canPlay.ok ? canPlay.cost : data.cost;
    const discounted = isHand && canPlay && canPlay.ok && cost < data.cost;
    let preview = null;
    if (isHand && UI.state && UI.state.combat && UI.state.combat.phase === 'player') {
      try { preview = E.getPreview(UI.state, opts.index, UI.targetIndex); } catch (err) { preview = null; }
    }
    const live = [];
    if (preview) {
      if (preview.damage != null) live.push(`<span class="live live-dmg">${preview.damage}${preview.hits > 1 ? '×' + preview.hits : ''} 伤</span>`);
      if (preview.block != null) live.push(`<span class="live live-block">${preview.block} 甲</span>`);
      if (preview.cross) live.push('<span class="live live-cross">克制</span>');
      if (preview.chainAfter > 0 && preview.linked) live.push(`<span class="live live-chain">连携 ${preview.chainAfter}</span>`);
      if (preview.poison) live.push(`<span class="live live-poison">毒 ${preview.poison}</span>`);
      if (preview.heal) live.push(`<span class="live live-heal">愈 ${preview.heal}</span>`);
      if (preview.draw) live.push(`<span class="live live-draw">抽 ${preview.draw}</span>`);
    }
    const classes = ['card', 'el-' + data.element, 'rarity-' + data.rarity];
    if (data.rarity === 'special') classes.push('card-special', 'card-id-' + data.id.replace(/_/g, '-'));
    if (data.rarity === 'curse') classes.push('card-curse');
    if (upgraded) classes.push('upgraded');
    if (isHand) classes.push('in-hand');
    if (isHand && canPlay && !canPlay.ok) classes.push('disabled');
    if (isHand && UI.selected === opts.index) classes.push('selected');
    if (opts.locked) classes.push('locked');
    if (opts.sold) classes.push('sold');
    if (opts.selectable) classes.push('selectable');
    if (opts.selected) classes.push('picked');
    const style = `--el:${el.color};--el-dark:${el.dark};${isHand ? `--rot:${opts.rot || 0}deg;--lift:${opts.lift || 0}px;margin-left:${opts.marginLeft || 0}px` : ''}`;
    const tag = opts.tag || (isHand || opts.inspect ? 'button' : 'div');
    const actionAttr = isHand ? `data-action="play-card" data-index="${opts.index}"` :
      (opts.pickUid ? `data-action="pick-card" data-uid="${esc(opts.pickUid)}"` :
        (opts.inspect ? `data-action="inspect-card" data-id="${esc(inst.id)}" data-up="${upgraded ? '1' : '0'}"` : ''));
    const other = data.up ? cardData({ id: inst.id, up: !upgraded }) : null;
    const upgradeHint = other ? `${upgraded ? '升级前' : '升级后'}（灵气 ${other.cost}）：${other.text}` : '';
    const tooltip = `${data.name}（${TYPE_NAMES[data.type] || ''}·${RARITY_LABEL[data.rarity] || ''}）\n${data.text}${upgraded ? '\n（已悟）' : ''}${upgradeHint ? '\n' + upgradeHint : ''}`;
    const inner = `
      <div class="card-inner">
        <div class="card-top">
          <span class="card-cost ${discounted ? 'discounted' : ''}">${cost}</span>
          <span class="card-name">${esc(faceName)}</span>
        </div>
        <div class="card-art" style="--el:${el.color};--el-dark:${el.dark}">
          ${upgraded ? '<span class="card-up-mark" aria-label="已升级">悟</span>' : ''}
          <span class="card-elem" style="--el:${el.color}">${esc(el.glyph)}</span>
          ${cardArt(data.element, data.id, data.rarity)}
          <span class="card-type">${TYPE_NAMES[data.type] || ''} · ${RARITY_LABEL[data.rarity] || ''}</span>
        </div>
        <div class="card-text">${formatText(data.text)}</div>
        <div class="card-live">${live.join('')}</div>
        <div class="card-foot">
          <span>${data.exhaust ? '消耗' : ''}${data.retain ? ' 保留' : ''}${!data.exhaust && !data.retain ? el.name + '行' : ''}</span>
          <span class="card-rarity">${RARITY_LABEL[data.rarity] || ''}</span>
        </div>
      </div>`;
    if (tag === 'button') {
      return `<button type="button" class="${classes.join(' ')}" style="${style}" ${actionAttr} title="${esc(tooltip)}" aria-label="${esc(tooltip)}" ${isHand && upgradeHint ? `data-upgrade-preview="${esc(upgradeHint)}"` : ''}>${inner}</button>`;
    }
    return `<div class="${classes.join(' ')}" style="${style}" ${actionAttr} title="${esc(tooltip)}">${inner}</div>`;
  }

  function relicChip(id, opts) {
    opts = opts || {};
    const r = relicById(id);
    if (!r) return '';
    const tag = opts.inspect ? 'button' : 'span';
    return `<${tag} class="relic-chip ${opts.big ? 'big' : ''}" ${opts.inspect ? `type="button" data-action="inspect-relic" data-id="${esc(id)}"` : ''} title="${esc(r.name)}：${esc(r.desc)}">${relicEmblem(id)}${opts.showName ? `<span>${esc(r.name)}</span>` : ''}</${tag}>`;
  }
  function potionChip(id, opts) {
    opts = opts || {};
    const p = potionById(id);
    if (!p) return '';
    const tag = opts.inspect ? 'button' : 'span';
    return `<${tag} class="potion-chip ${opts.big ? 'big' : ''}" ${opts.inspect ? `type="button" data-action="inspect-potion" data-id="${esc(id)}"` : ''} title="${esc(p.name)}：${esc(p.desc)}">${potionVessel(id)}</${tag}>`;
  }
  function hpBarHTML(cur, max, cls) {
    return `<span class="hpbar ${cls || ''}"><span class="hpbar-fill" style="width:${hpPct(cur, max)}%"></span><span class="hpbar-text">${cur} / ${max}</span></span>`;
  }
  function goldHTML(gold) { return `<span class="gold-pill" title="金币">◈ ${gold}</span>`; }
  function statusName(k) { return D.statuses[k] ? D.statuses[k].name : k; }
  function statusList(arr) { return (arr || []).map(s => `${statusName(s.status)}${s.value || ''}`).join('、'); }
  function outcomeText(value) { return value > 0 ? `+${value}` : `${value}`; }

  const UI = {
    init(opts) {
      try { FX?.init(); } catch (_) {}
      this.app = opts.app;
      this.meta = opts.meta;
      this.state = opts.saved || null;
      this.hasRun = !!opts.saved;
      this.screen = 'title';
      this.savedScreen = opts.saved ? opts.saved.screen : null;
      this.selectedChar = 'sword';
      this.ascension = 0;
      this.selected = null;
      this.targetIndex = 0;
      this.busy = false;
      this.finishing = false;
      this.overlay = null;
      this.detail = null;
      this.detailReturn = null;
      this.picker = null;
      this.pile = null;
      this.compTab = 'cards';
      this.victoryHandled = false;
      this.gameoverHandled = false;
      this.soundOn = !!(this.meta.settings && this.meta.settings.sound);
      this.audio = null;
      this.bg = null;
      this.bind();
      this.initBackground();
      this.render();
    },

    /* ---------------- 事件绑定 ---------------- */
    bind() {
      const root = document.getElementById('app');
      root.addEventListener('click', (ev) => {
        const target = ev.target.closest('[data-action]');
        if (!target) return;
        ev.preventDefault();
        this.action(target.dataset.action, target);
      });
      window.addEventListener('resize', () => {
        this.resizeBackground();
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
          if (!this.busy && (this.screen === 'select' || (this.state && (this.screen === 'combat' || this.screen === 'reward')))) this.render();
        }, 160);
      });
    },

    action(name, el) {
      if (!['toggle-sound', 'close-overlay', 'overlay-stop'].includes(name)) this.sfx('click');
      const idx = el.dataset.index != null ? Number(el.dataset.index) : null;
      switch (name) {
        case 'title-new': this.screen = 'select'; this.render(); break;
        case 'title-continue':
          if (this.state) { this.screen = this.state.screen === 'title' ? 'map' : this.state.screen; this.render(); }
          break;
        case 'title-compendium': this.screen = 'compendium'; this.compTab = 'cards'; this.render(); break;
        case 'select-char': this.selectedChar = el.dataset.char; this.render(); break;
        case 'asc-minus': this.ascension = Math.max(0, this.ascension - 1); this.render(); break;
        case 'asc-plus': this.ascension = Math.min(this.meta.maxAscension, this.ascension + 1); this.render(); break;
        case 'begin-run': this.beginRun(); break;
        case 'to-title': this.screen = 'title'; this.render(); break;
        case 'comp-tab': this.compTab = el.dataset.tab; this.render(); break;
        case 'node': this.enterNode(el.dataset.id); break;
        case 'play-card':
          if (window.innerWidth <= 600) this.inspectHandCard(Number(el.dataset.index));
          else this.onCardClick(Number(el.dataset.index));
          break;
        case 'enemy': this.onEnemyClick(Number(el.dataset.index)); break;
        case 'end-turn': this.endTurn(); break;
        case 'use-potion':
          if (window.innerWidth <= 600) this.inspectPotionSlot(Number(el.dataset.index));
          else this.usePotion(Number(el.dataset.index));
          break;
        case 'inspect-card': this.openDetail({ kind: 'card', id: el.dataset.id, up: el.dataset.up === '1' }); break;
        case 'inspect-character': this.openDetail({ kind: 'character', id: el.dataset.char || (this.state && this.state.characterId) }); break;
        case 'inspect-enemy': this.openDetail({ kind: 'enemy', id: el.dataset.id, index: idx }); break;
        case 'inspect-relic': this.openDetail({ kind: 'relic', id: el.dataset.id }); break;
        case 'inspect-potion': this.openDetail({ kind: 'potion', id: el.dataset.id }); break;
        case 'inspect-status': {
          const key = el.dataset.status;
          const owner = el.dataset.owner;
          const index = owner === 'enemy' ? Number(el.dataset.index) : null;
          const c = this.state && this.state.combat;
          const entity = c && (owner === 'player' ? c : owner === 'enemy' ? c.enemies[index] : null);
          if (D.statuses[key] && entity && entity.statuses && entity.statuses[key] > 0) {
            this.openDetail({ kind: 'status', id: key, count: entity.statuses[key], ownerName: owner === 'player' ? '自身' : entity.name });
          }
          break;
        }
        case 'confirm-detail': this.confirmDetail(); break;
        case 'view-deck': this.overlay = 'deck'; this.render(); break;
        case 'view-relics': this.overlay = 'relics'; this.render(); break;
        case 'open-piles': this.pile = el.dataset.pile; this.overlay = 'piles'; this.render(); break;
        case 'close-overlay': this.closeOverlay(); break;
        case 'take-card':
          if (window.innerWidth <= 600 || el.dataset.confirm === '1') this.inspectRewardCard(Number(el.dataset.index));
          else this.takeRewardCard(Number(el.dataset.index));
          break;
        case 'skip-card': this.skipReward(); break;
        case 'continue-reward': this.continueReward(); break;
        case 'shop-buy': this.buy(el.dataset.kind, Number(el.dataset.index)); break;
        case 'shop-remove': this.openRemovePicker(); break;
        case 'shop-leave': this.leaveShop(); break;
        case 'rest-heal': this.restHeal(); break;
        case 'rest-upgrade': this.openUpgradePicker(); break;
        case 'event-choice': this.applyEvent(Number(el.dataset.index)); break;
        case 'continue-event': this.continueEvent(); break;
        case 'treasure-continue': this.continueTreasure(); break;
        case 'pick-card':
          if (window.innerWidth <= 600 || (this.picker && this.picker.mode === 'upgrade-rest')) this.inspectPickerCard(el.dataset.uid);
          else this.pickCard(el.dataset.uid);
          break;
        case 'settings': this.overlay = 'settings'; this.render(); break;
        case 'help': this.overlay = 'help'; this.render(); break;
        case 'toggle-sound': this.toggleSound(); break;
        case 'abandon-run': this.abandonRun(); break;
        case 'back-title-keep': this.screen = 'title'; this.overlay = null; this.render(); break;
        case 'game-new': this.screen = 'select'; this.overlay = null; this.render(); break;
        case 'game-home': this.screen = 'title'; this.overlay = null; this.render(); break;
        case 'victory-new': this.screen = 'select'; this.render(); break;
        case 'victory-home': this.screen = 'title'; this.render(); break;
        case 'open-potion-slot': break;
        default: break;
      }
    },

    handleKey(ev) {
      if (ev.key === 'Escape') {
        if (this.overlay) this.closeOverlay();
        else if (this.screen === 'combat' && this.selected != null) { this.selected = null; this.render(); }
        return;
      }
      if (this.screen !== 'combat' || this.overlay || this.busy) return;
      if (ev.key === 'e' || ev.key === 'E') { ev.preventDefault(); this.endTurn(); return; }
      if (/^[1-9]$/.test(ev.key)) {
        const i = Number(ev.key) - 1;
        const c = this.state && this.state.combat;
        if (c && c.hand[i]) {
          ev.preventDefault();
          const can = E.canPlayCard(this.state, i);
          if (can.ok) this.playCard(i, this.targetIndex);
          else this.toast(can.reason || '无法打出');
        }
      }
    },

    /* ---------------- 核心流程 ---------------- */
    sync() {
      if (!this.state) { this.screen = 'title'; return; }
      this.screen = this.state.screen;
      if (this.screen === 'victory' && !this.victoryHandled) {
        this.victoryHandled = true;
        this.hasRun = false;
        this.app.onVictory(this.state);
      }
      if (this.screen === 'gameover' && !this.gameoverHandled) {
        this.gameoverHandled = true;
        this.hasRun = false;
        this.app.onGameOver(this.state);
      }
    },
    commit() {
      this.sync();
      if (this.hasRun) this.app.saveRun(this.state);
      this.render();
    },
    beginRun() {
      if (this.hasRun && this.state && !window.confirm('当前进度会被覆盖，确定开始新的轮回吗？')) return;
      const st = this.app.newRun(this.selectedChar, this.ascension);
      this.state = st;
      this.hasRun = true;
      this.victoryHandled = false;
      this.gameoverHandled = false;
      this.ascension = st.ascension;
      this.selected = null;
      this.targetIndex = 0;
      this.overlay = null;
      this.commit();
      this.sfx('start');
    },
    enterNode(id) {
      if (this.busy) return;
      const res = E.enterNode(this.state, id);
      if (!res.ok) { this.toast(res.reason || '无法前往'); return; }
      this.selected = null;
      this.targetIndex = 0;
      this.commit();
    },
    onCardClick(index) {
      if (!this.state || !this.state.combat || this.busy) return;
      const c = this.state.combat;
      if (c.phase !== 'player') return;
      const inst = c.hand[index];
      if (!inst) return;
      const data = cardData(inst);
      if (!data) return;
      if (data.unplayable || data.type === 'curse' || data.type === 'status') { this.toast('这张牌无法打出，只能留在手中。'); return; }
      const can = E.canPlayCard(this.state, index);
      if (!can.ok) { this.toast(can.reason || '无法打出'); return; }
      const alive = c.enemies.filter(e => e.hp > 0);
      if (E.cardNeedsTarget(data) && alive.length > 1) {
        if (this.selected === index) { this.selected = null; this.render(); return; }
        this.selected = index;
        this.targetIndex = 0;
        this.render();
        return;
      }
      this.playCard(index, alive.length === 1 ? c.enemies.indexOf(alive[0]) : this.targetIndex);
    },
    onEnemyClick(index) {
      if (!this.state || !this.state.combat || this.busy) return;
      const c = this.state.combat;
      const enemy = c.enemies[index];
      if (!enemy || enemy.hp <= 0) return;
      if (this.selected != null) { this.playCard(this.selected, index); return; }
      this.targetIndex = index;
      this.toast('已锁定目标：' + enemy.name);
      this.render();
    },
    openDetail(detail) {
      if (!detail || !detail.id) return;
      this.detailReturn = this.overlay && this.overlay !== 'detail' ? this.overlay : null;
      this.detail = detail;
      this.overlay = 'detail';
      this.render();
    },
    closeOverlay() {
      if (this.overlay === 'detail') {
        this.overlay = this.detailReturn;
        this.detailReturn = null;
        this.detail = null;
      } else {
        this.overlay = null;
        this.picker = null;
      }
      this.render();
    },
    inspectHandCard(index) {
      const c = this.state && this.state.combat;
      if (!c || this.busy || c.phase !== 'player' || !c.hand[index]) return;
      const inst = c.hand[index];
      this.openDetail({ kind: 'card', id: inst.id, up: !!inst.up, action: 'play-card', index, uid: inst.uid });
    },
    inspectPotionSlot(index) {
      const st = this.state;
      if (!st || !st.combat || st.combat.phase !== 'player' || this.busy || !st.potions[index]) return;
      this.openDetail({ kind: 'potion', id: st.potions[index], action: 'use-potion', index });
    },
    inspectRewardCard(index) {
      const r = this.state && this.state.reward;
      if (!r || r.cardTaken || !r.cards[index]) return;
      const inst = r.cards[index];
      this.openDetail({ kind: 'card', id: inst.id, up: !!inst.up, action: 'take-card', index });
    },
    inspectPickerCard(uid) {
      const inst = this.state && this.state.deck.find(c => String(c.uid) === String(uid));
      if (!inst || !this.picker) return;
      this.openDetail({ kind: 'card', id: inst.id, up: !!inst.up, action: 'pick-card', uid });
    },
    confirmDetail() {
      const d = this.detail;
      if (!d || this.overlay !== 'detail') return;
      this.closeOverlay();
      if (d.action === 'use-potion' && this.state && this.state.potions[d.index] === d.id) this.usePotion(d.index);
      else if (d.action === 'take-card' && this.state && this.state.reward && !this.state.reward.cardTaken && this.state.reward.cards[d.index] && this.state.reward.cards[d.index].id === d.id) this.takeRewardCard(d.index);
      else if (d.action === 'play-card' && this.state && this.state.combat && this.state.combat.hand[d.index] && this.state.combat.hand[d.index].uid === d.uid) this.onCardClick(d.index);
      else if (d.action === 'pick-card' && this.picker && this.state && this.state.deck.some(c => String(c.uid) === String(d.uid))) this.pickCard(d.uid);
    },
    async playCard(index, target) {
      if (this.busy) return;
      const c = this.state.combat;
      if (!c || c.phase !== 'player') return;
      const card = c.hand[index];
      const cardData = card && E.getCardData(card);
      const cardEl = document.querySelector('.hand .card[data-index="' + index + '"]');
      let captured = null;
      try { captured = FX?.captureCard(cardEl, cardData?.element); } catch (_) {}
      const allEnemies = cardData?.effects?.some(effect => effect.op === 'damage' && effect.target === 'all');
      let targetEl = null;
      if (cardData?.type === 'attack') {
        targetEl = allEnemies ? document.querySelector('.enemy-zone') :
          document.querySelector('[data-enemy-uid="' + c.enemies[target]?.uid + '"]') ||
          document.querySelector('.enemy-unit[data-index="' + target + '"]');
      }
      const rect = targetEl?.getBoundingClientRect();
      const destination = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } :
        { x: window.innerWidth / 2, y: window.innerHeight * .38 };
      this.busy = true;
      this.selected = null;
      this.sfx('card');
      try {
        const res = E.playCard(this.state, index, target);
        if (!res.ok) {
          this.toast(res.reason || '无法打出');
          this.render();
          return;
        }
        this.render();
        await visual('playCardFlight', { visual: captured, element: cardData?.element, cardType: cardData?.type, target: destination });
        await this.fx(res.events);
        this.busy = false;
        this.commit();
        this.checkCombatState();
      } finally {
        try { FX?.clear(captured); } catch (_) {}
        this.busy = false;
      }
    },
    async usePotion(index) {
      if (this.busy || !this.state || !this.state.combat) return;
      if (this.state.combat.phase !== 'player') return;
      this.busy = true;
      const res = E.usePotion(this.state, index, this.targetIndex);
      if (!res.ok) { this.busy = false; this.toast(res.reason || '无法使用'); this.render(); return; }
      this.render();
      await this.fx(res.events);
      this.busy = false;
      this.commit();
      this.checkCombatState();
    },
    async endTurn() {
      if (this.busy || !this.state || !this.state.combat) return;
      const c = this.state.combat;
      if (c.phase !== 'player') return;
      this.busy = true;
      this.selected = null;
      this.sfx('endturn');
      const res = E.endPlayerTurn(this.state);
      this.render();
      await this.fx(res.events);
      this.busy = false;
      this.commit();
      if (!this.state.combat || this.state.combat.phase !== 'enemy') { this.checkCombatState(); return; }
      this.busy = true;
      await sleep(320);
      const res2 = E.runEnemyTurn(this.state);
      this.render();
      await this.fx(res2.events);
      this.busy = false;
      this.commit();
      this.checkCombatState();
    },
    async checkCombatState() {
      if (this.finishing) return;
      const c = this.state && this.state.combat;
      if (!c) return;
      if (c.phase === 'won') {
        this.finishing = true;
        this.sfx('win');
        await sleep(650);
        if (this.state && this.state.combat && this.state.combat.phase === 'won') {
          const res = E.finishCombat(this.state);
          if (!res.ok) this.toast(res.reason || '结算失败');
          this.overlay = null;
          this.picker = null;
          this.sync();
          if (this.hasRun) this.app.saveRun(this.state);
          this.render();
        }
        this.finishing = false;
      } else if (c.phase === 'lost') {
        this.finishing = true;
        this.sfx('lose');
        await sleep(900);
        if (this.state && this.state.combat && this.state.combat.phase === 'lost') {
          this.state.screen = 'gameover';
          this.overlay = null;
          this.picker = null;
          this.sync();
          this.render();
        }
        this.finishing = false;
      }
    },
    takeRewardCard(index) {
      if (!this.state || !this.state.reward) return;
      const res = E.takeRewardCard(this.state, index);
      if (!res.ok) this.toast(res.reason || '无法选择');
      this.app.saveRun(this.state);
      this.render();
      this.sfx('card');
    },
    skipReward() {
      if (!this.state || !this.state.reward) return;
      E.skipReward(this.state);
      this.app.saveRun(this.state);
      this.render();
    },
    continueReward() {
      if (!this.state || !this.state.reward) return;
      const prevAct = this.state.act;
      E.continueReward(this.state);
      this.sync();
      if (this.hasRun) this.app.saveRun(this.state);
      this.render();
      if (this.hasRun && this.state.screen === 'map' && this.state.act !== prevAct) {
        setTimeout(() => this.banner(E.getActName(this.state.act) + ' · 新的去路', 'gold'), 150);
      }
    },
    buy(kind, index) {
      const res = E.buyItem(this.state, kind, index);
      if (!res.ok) { this.toast(res.reason || '无法购买'); return; }
      this.sfx('coin');
      this.app.saveRun(this.state);
      this.render();
    },
    openRemovePicker() {
      const shop = this.state.shop;
      if (!shop || shop.removeUsed) { this.toast('本店已使用过移除服务'); return; }
      if (this.state.gold < shop.removePrice) { this.toast('金币不足'); return; }
      this.picker = { mode: 'remove-shop', title: '选择一张牌移除', price: shop.removePrice };
      this.overlay = 'picker';
      this.render();
    },
    openUpgradePicker() {
      if (!this.state || this.state.screen !== 'rest') return;
      this.picker = { mode: 'upgrade-rest', title: '选择一张牌参悟' };
      this.overlay = 'picker';
      this.render();
    },
    pickCard(uid) {
      if (!this.picker || !this.state) return;
      if (this.picker.mode === 'upgrade-rest') {
        const res = E.restUpgrade(this.state, uid);
        if (!res.ok) { this.toast(res.reason || '无法升级'); return; }
        this.overlay = null;
        this.picker = null;
        this.sfx('upgrade');
        this.commit();
      } else if (this.picker.mode === 'remove-shop') {
        const res = E.removeCardFromDeck(this.state, uid);
        if (!res.ok) { this.toast(res.reason || '无法移除'); return; }
        this.overlay = null;
        this.picker = null;
        this.sfx('coin');
        this.app.saveRun(this.state);
        this.render();
      }
    },
    restHeal() {
      const res = E.restHeal(this.state);
      if (!res.ok) { this.toast(res.reason); return; }
      this.sfx('heal');
      this.commit();
    },
    applyEvent(index) {
      const res = E.applyEventChoice(this.state, index);
      if (!res.ok) { this.toast(res.reason || '无法选择'); return; }
      this.sfx('event');
      this.app.saveRun(this.state);
      this.render();
    },
    continueEvent() {
      E.continueEvent(this.state);
      this.commit();
    },
    continueTreasure() {
      E.continueTreasure(this.state);
      this.commit();
      this.sfx('coin');
    },
    leaveShop() {
      E.leaveShop(this.state);
      this.commit();
    },
    toggleSound() {
      this.soundOn = !this.soundOn;
      this.meta.settings.sound = this.soundOn;
      this.app.saveMeta();
      this.render();
      if (this.soundOn) this.sfx('click');
    },
    abandonRun() {
      if (!window.confirm('确定放弃本次轮回？当前存档会被清除。')) return;
      this.state = null;
      this.hasRun = false;
      this.overlay = null;
      this.app.clearRun();
      this.screen = 'title';
      this.render();
    },

    /* ---------------- 特效 / 音效 ---------------- */
    async fx(events) {
      if (!events || !events.length) return;
      for (const ev of events) {
        switch (ev.t) {
          case 'damage': {
            const el = ev.target === 'player' ? document.getElementById('player-panel') : document.querySelector('[data-enemy-uid="' + ev.uid + '"]');
            const amount = Math.max(0, (ev.amount || 0) - (ev.blocked || 0));
            if (ev.target === 'player') {
              this.shakeScreen();
              this.floatAt(el, ev.blocked > 0 && amount === 0 ? '格挡' : '-' + amount, ev.blocked > 0 ? 'fx-block' : 'fx-hurt');
              this.sfx(ev.blocked > 0 && amount === 0 ? 'block' : 'hurt');
            } else {
              this.hitPulse(el);
              this.floatAt(el, ev.cross ? '克制 -' + amount : '-' + amount, ev.cross ? 'fx-cross' : 'fx-damage');
              this.sfx(ev.cross ? 'cross' : 'hit');
              void visual('impact', { target: el, element: ev.element, heavy: ev.cross || amount >= 20 });
              if (ev.cross) void visual('overcomeBurst', { target: el, element: ev.element });
            }
            await sleep(ev.target === 'player' ? 110 : 85);
            break;
          }
          case 'block': {
            const el = ev.target === 'player' ? document.getElementById('player-panel') : document.querySelector('[data-enemy-uid="' + ev.uid + '"]');
            this.floatAt(el, '甲 +' + ev.amount, 'fx-block');
            this.sfx('block');
            void visual('block', { target: el });
            await sleep(60);
            break;
          }
          case 'heal': {
            const el = ev.target === 'enemy' ? document.querySelector('[data-enemy-uid="' + ev.uid + '"]') : document.getElementById('player-panel');
            this.floatAt(el, '+' + ev.amount, 'fx-heal');
            this.sfx('heal');
            void visual('heal', { target: el });
            await sleep(70);
            break;
          }
          case 'status': {
            const el = ev.target === 'player' ? document.getElementById('player-panel') : document.querySelector('[data-enemy-uid="' + ev.uid + '"]');
            const s = D.statuses[ev.key];
            this.floatAt(el, (s ? s.glyph : '') + (ev.amount > 0 ? '+' + ev.amount : ev.amount), s && s.debuff ? 'fx-debuff' : 'fx-buff');
            void visual('status', { target: el, key: ev.key, debuff: !!s?.debuff });
            await sleep(55);
            break;
          }
          case 'chain': {
            if (ev.linked) {
              this.floatAt(document.querySelector('.chain-panel'), '相生 · 连携 ' + ev.chain, 'fx-chain');
              this.sfx('chain');
              void visual('chainPulse', { target: document.querySelector('.chain-panel'), element: ev.element });
            } else if (ev.reset) {
              this.floatAt(document.querySelector('.chain-panel'), '周天归元', 'fx-chain');
            } else if (ev.element && ev.prev) {
              this.floatAt(document.querySelector('.chain-panel'), '断链', 'fx-break');
            } else if (ev.element) {
              this.floatAt(document.querySelector('.chain-panel'), '起手 · ' + elem(ev.element).glyph, 'fx-chain');
            }
            await sleep(70);
            break;
          }
          case 'zhoutian': {
            this.sfx('zhoutian');
            const motionReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (!motionReduced) document.body.classList.add('zhoutian-flash');
            this.floatAt(document.querySelector('.chain-panel'), '五行周天', 'fx-zhoutian');
            setTimeout(() => document.body.classList.remove('zhoutian-flash'), 650);
            if (FX?.zhoutian) await visual('zhoutian');
            else await sleep(motionReduced ? 30 : 520);
            break;
          }
          case 'phase': {
            this.banner(ev.log || '阶段转换');
            this.sfx('phase');
            await sleep(700);
            break;
          }
          case 'enemyMove': {
            const el = document.querySelector('[data-enemy-uid="' + ev.uid + '"]');
            this.hitPulse(el);
            await sleep(90);
            break;
          }
          case 'death': {
            const el = document.querySelector('[data-enemy-uid="' + ev.uid + '"]');
            if (el) el.classList.add('dying');
            this.sfx('death');
            await sleep(180);
            break;
          }
          case 'potion': this.sfx('potion'); await sleep(60); break;
          case 'energy': this.sfx('energy'); await sleep(45); break;
          case 'draw':
          case 'shuffle': await sleep(25); break;
          case 'turnStart':
            this.sfx('turn');
            await sleep(80);
            break;
          case 'lose': this.sfx('lose'); await sleep(200); break;
          case 'win': this.sfx('win'); await sleep(150); break;
          case 'combatStart': this.sfx('start'); await sleep(180); break;
          default: break;
        }
      }
    },
    floatAt(el, text, cls) {
      if (!el || !text) return;
      const rect = el.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'float-text ' + (cls || '');
      span.textContent = text;
      span.style.left = (rect.left + rect.width / 2 + (Math.random() * 30 - 15)) + 'px';
      span.style.top = (rect.top + rect.height * 0.32) + 'px';
      document.getElementById('fx-layer').appendChild(span);
      setTimeout(() => span.remove(), 1100);
    },
    hitPulse(el) {
      if (!el) return;
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 280);
    },
    shakeScreen() {
      const app = document.getElementById('app');
      app.classList.remove('shake');
      void app.offsetWidth;
      app.classList.add('shake');
      setTimeout(() => app.classList.remove('shake'), 260);
    },
    banner(text, kind) {
      const div = document.createElement('div');
      div.className = 'banner ' + (kind || '');
      div.innerHTML = `<span>${esc(text)}</span>`;
      document.getElementById('fx-layer').appendChild(div);
      setTimeout(() => div.remove(), 1900);
    },
    initAudio() {
      if (this.audio) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.audio = new Ctx();
      } catch (err) { this.audio = null; }
    },
    unlockAudio() {
      this.initAudio();
      if (this.audio && this.audio.state === 'suspended') this.audio.resume();
    },
    tone(freq, dur, type, vol, delay) {
      if (!this.audio || !this.soundOn) return;
      const t0 = this.audio.currentTime + (delay || 0);
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.audio.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },
    sfx(name) {
      if (!this.soundOn) return;
      this.initAudio();
      if (!this.audio) return;
      if (this.audio.state === 'suspended') this.audio.resume();
      switch (name) {
        case 'click': this.tone(560, 0.05, 'triangle', 0.025); break;
        case 'card': this.tone(420, 0.09, 'sine', 0.045); this.tone(640, 0.11, 'sine', 0.035, 0.05); break;
        case 'hit': this.tone(150, 0.1, 'sawtooth', 0.05); this.tone(90, 0.14, 'triangle', 0.045, 0.02); break;
        case 'cross': this.tone(220, 0.09, 'square', 0.04); this.tone(880, 0.12, 'triangle', 0.035, 0.04); break;
        case 'hurt': this.tone(110, 0.16, 'sawtooth', 0.055); this.tone(75, 0.2, 'triangle', 0.045, 0.04); break;
        case 'block': this.tone(300, 0.08, 'square', 0.03); break;
        case 'heal': this.tone(660, 0.12, 'sine', 0.035); this.tone(880, 0.16, 'sine', 0.03, 0.08); break;
        case 'chain': this.tone(620, 0.1, 'triangle', 0.04); this.tone(820, 0.12, 'triangle', 0.035, 0.07); break;
        case 'zhoutian': [220, 330, 440, 660].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.04, i * 0.055)); break;
        case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.04, i * 0.1)); break;
        case 'lose': [220, 185, 147, 110].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.04, i * 0.12)); break;
        case 'coin': this.tone(980, 0.07, 'square', 0.025); this.tone(1320, 0.09, 'square', 0.02, 0.06); break;
        case 'turn': this.tone(330, 0.1, 'sine', 0.03); break;
        case 'endturn': this.tone(280, 0.1, 'triangle', 0.03); break;
        case 'phase': this.tone(120, 0.4, 'sawtooth', 0.05); this.tone(80, 0.5, 'sine', 0.04, 0.1); break;
        case 'death': this.tone(160, 0.2, 'sawtooth', 0.035); break;
        case 'start': [330, 440, 550].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.035, i * 0.08)); break;
        case 'potion': this.tone(700, 0.08, 'sine', 0.03); this.tone(900, 0.12, 'sine', 0.025, 0.06); break;
        case 'event': this.tone(480, 0.16, 'triangle', 0.03); break;
        case 'upgrade': [660, 990, 1320].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.03, i * 0.07)); break;
        default: break;
      }
    },
    toast(msg) {
      const layer = document.getElementById('toast-layer');
      const div = document.createElement('div');
      div.className = 'toast';
      div.textContent = msg;
      layer.appendChild(div);
      setTimeout(() => div.classList.add('out'), 1500);
      setTimeout(() => div.remove(), 2100);
    },

    /* ---------------- 渲染 ---------------- */
    render() {
      if (!this.state && !['title', 'select', 'compendium'].includes(this.screen)) this.screen = 'title';
      this.markSeen();
      const app = document.getElementById('app');
      const screenChanged = this._lastRenderedScreen !== this.screen;
      this._lastRenderedScreen = this.screen;
      let html = '';
      switch (this.screen) {
        case 'title': html = this.titleHTML(); break;
        case 'select': html = this.selectHTML(); break;
        case 'map': html = this.state ? this.mapHTML() : this.titleHTML(); break;
        case 'combat': html = this.state && this.state.combat ? this.combatHTML() : this.mapHTML(); break;
        case 'reward': html = this.state && this.state.reward ? this.rewardHTML() : this.mapHTML(); break;
        case 'shop': html = this.state && this.state.shop ? this.shopHTML() : this.mapHTML(); break;
        case 'rest': html = this.state ? this.restHTML() : this.mapHTML(); break;
        case 'event': html = this.state && this.state.event ? this.eventHTML() : this.mapHTML(); break;
        case 'treasure': html = this.state && this.state.treasure ? this.treasureHTML() : this.mapHTML(); break;
        case 'victory': html = this.endHTML(true); break;
        case 'gameover': html = this.endHTML(false); break;
        case 'compendium': html = this.compendiumHTML(); break;
        default: html = this.titleHTML(); break;
      }
      app.innerHTML = html + this.overlayHTML();
      app.classList.remove('screen-enter');
      if (screenChanged) {
        void app.offsetWidth;
        app.classList.add('screen-enter');
      }
      document.body.dataset.screen = this.screen;
      this.afterRender();
    },
    afterRender() {
      if (this.screen === 'map') {
        const scroller = document.getElementById('map-scroll');
        if (scroller) {
          requestAnimationFrame(() => {
            const cur = scroller.querySelector('.map-node.current');
            if (cur) cur.scrollIntoView({ block: 'center', behavior: 'auto' });
            else scroller.scrollTop = scroller.scrollHeight;
          });
        }
      }
      if (this.screen === 'combat' && this.state && this.state.combat && !this.busy && !this.finishing) {
        const ph = this.state.combat.phase;
        if (ph === 'won' || ph === 'lost') setTimeout(() => this.checkCombatState(), 350);
      }
    },
    markSeen() {
      const st = this.state;
      if (!st) return;
      const m = this.meta;
      let changed = false;
      const add = (arr, id) => { if (id && !arr.includes(id)) { arr.push(id); changed = true; } };
      (st.deck || []).forEach(c => add(m.seenCards, c.id));
      (st.relics || []).forEach(id => add(m.seenRelics, id));
      if (st.combat) {
        (st.combat.enemies || []).forEach(e => add(m.seenEnemies, e.id));
        (st.combat.hand || []).forEach(c => add(m.seenCards, c.id));
      }
      if (st.reward) {
        (st.reward.cards || []).forEach(c => add(m.seenCards, c.id));
        add(m.seenRelics, st.reward.relicId);
      }
      if (st.shop) {
        (st.shop.cards || []).forEach(x => add(m.seenCards, x.card.id));
        (st.shop.relics || []).forEach(x => add(m.seenRelics, x.id));
      }
      if (changed) this.app.saveMeta();
    },

    /* ---------------- 标题 / 选择 ---------------- */
    titleHTML() {
      const has = this.hasRun && this.state;
      const info = has ? `${this.state.characterId === 'sword' ? '剑修·凌霄' : this.state.characterId === 'alchemist' ? '丹修·青萝' : '体修·磐石'} · ${E.getActName(this.state.act)}` : '';
      return `
      <main class="screen title-screen">
        <div class="title-emblem">
          <div class="orbit orbit-1"></div>
          <div class="orbit orbit-2"></div>
          <div class="five-orbs">
            ${['wood', 'fire', 'earth', 'metal', 'water'].map((id, i) => `<span class="orb orb-${id}" style="--i:${i}">${D.elements[id].glyph}</span>`).join('')}
          </div>
          <div class="title-seal">道</div>
        </div>
        <h1 class="game-logo">五行问道</h1>
        <p class="game-sub">木生火 · 火生土 · 土生金 · 金生水 · 水生木</p>
        <div class="title-menu">
          ${has ? `<button class="btn btn-primary btn-lg" data-action="title-continue"><span>继续修行</span><small>${esc(info)}</small></button>` : ''}
          <button class="btn ${has ? 'btn-ghost' : 'btn-primary btn-lg'}" data-action="title-new"><span>${has ? '另起轮回' : '开始新局'}</span>${has ? '' : '<small>三幕 · 三角色 · 五行连携</small>'}</button>
          <div class="title-row">
            <button class="btn btn-ghost" data-action="help">玩法</button>
            <button class="btn btn-ghost" data-action="title-compendium">图鉴</button>
            <button class="btn btn-ghost" data-action="settings">设置</button>
          </div>
        </div>
        <div class="title-foot">
          <span>最高天劫 ${this.meta.maxAscension}</span>
          <span>轮回 ${this.meta.stats.runs || 0} 次 · 通关 ${this.meta.stats.wins || 0} 次</span>
          <span>${this.soundOn ? '音效开' : '音效关'}</span>
        </div>
        <p class="title-credit">以五行相生为链，以相克为刃。每一步，都是道心。</p>
      </main>`;
    },
    selectHTML() {
      const chars = window.innerWidth <= 600
        ? D.characters.slice().sort((a, b) => Number(b.id === this.selectedChar) - Number(a.id === this.selectedChar))
        : D.characters;
      const chosen = D.characters.find(ch => ch.id === this.selectedChar) || D.characters[0];
      return `
      <main class="screen select-screen">
        <header class="page-head">
          <button class="btn btn-ghost btn-sm" data-action="to-title">← 返回</button>
          <div><h1>择一道心</h1><p>三位修士，三种活法。选定后不可更改。</p></div>
          <span class="head-spacer"></span>
        </header>
        <section class="char-grid">
          ${chars.map(ch => this.charCardHTML(ch)).join('')}
        </section>
        <footer class="select-foot">
          <div class="ascension-box">
            <span class="asc-label">天劫</span>
            <button class="btn btn-square" data-action="asc-minus" ${this.ascension <= 0 ? 'disabled' : ''}>−</button>
            <b class="asc-value">${this.ascension}</b>
            <button class="btn btn-square" data-action="asc-plus" ${this.ascension >= this.meta.maxAscension ? 'disabled' : ''}>＋</button>
            <span class="asc-desc">${this.ascension === 0 ? '无劫，寻常山门。' : `敌人生命 +${this.ascension * 4}%，伤害 +${this.ascension * 2}%，起始诅咒 ${this.ascension >= 10 ? 2 : this.ascension >= 6 ? 1 : 0} 张。`}</span>
          </div>
          <button class="btn btn-primary btn-lg start-btn start-btn-desktop" data-action="begin-run">踏入此道 · ${esc(chosen.name.split('·')[0])}</button>
        </footer>
        <p class="select-tip">提示：相生顺序为 木 → 火 → 土 → 金 → 水 → 木。用克敌属性出牌，可无视护甲。</p>
      </main>
      <div class="select-mobile-action"><button class="btn btn-primary btn-lg start-btn" data-action="begin-run">踏入此道 · ${esc(chosen.name.split('·')[0])}</button></div>`;
    },
    charCardHTML(ch) {
      const selected = this.selectedChar === ch.id;
      const deck = ch.deck.map(d => {
        const data = D.cardMap[d.id];
        return `<span class="deck-chip el-${data.element}">${esc(data.name)}<b>×${d.count}</b></span>`;
      }).join('');
      const relic = D.relicMap[ch.relic];
      return `
      <div class="char-entry ${selected ? 'selected' : ''}">
      <button class="char-card ${selected ? 'selected' : ''}" data-action="select-char" data-char="${ch.id}" style="--accent:${ch.accent}" aria-pressed="${selected}">
        <span class="char-choose">${selected ? '已选' : '选择'}</span>
        <span class="char-visual" aria-hidden="true">
          <img class="char-portrait" src="${CHAR_PORTRAITS[ch.id]}" alt="" loading="eager" decoding="async">
          <span class="char-glyph">${characterSigil(ch.id)}</span>
          <span class="char-visual-rule"></span>
        </span>
        <span class="char-name">${esc(ch.name)}</span>
        <span class="char-title">${esc(ch.title)}</span>
        <span class="char-elems">${ch.elements.map(e => elemBadge(e)).join('')}</span>
        <span class="char-hp">生命 ${ch.maxHp}</span>
        <span class="char-style">${CHAR_STYLE[ch.id]}</span>
        <span class="char-passive"><b>${esc(ch.passive)}</b>　${esc(ch.passiveText)}</span>
        <span class="char-tip">${CHAR_TIPS[ch.id]}</span>
        <span class="char-label deck-label">初始牌组</span>
        <span class="char-deck">${deck}</span>
        <span class="char-label relic-label">初始遗物</span>
        <span class="char-relic">${relicChip(relic.id, { showName: true })}</span>
        <span class="char-flavor">“${esc(ch.flavor)}”</span>
      </button>
      <button class="btn btn-ghost btn-sm char-detail-btn" data-action="inspect-character" data-char="${ch.id}">查看角色详情</button>
      </div>`;
    },

    /* ---------------- HUD ---------------- */
    hudHTML() {
      const st = this.state;
      const ch = E.getCharacter(st);
      const act = E.getActName(st.act);
      return `
      <header class="hud">
        <button class="hud-char inspect-hud-char" data-action="inspect-character" title="查看角色详情">
          <span class="hud-glyph">${CHAR_GLYPHS[ch.id]}</span>
          <span><b>${esc(ch.name)}</b><small>${esc(act)}</small></span>
        </button>
        <div class="hud-hp">${hpBarHTML(st.hp, st.maxHp)}</div>
        ${goldHTML(st.gold)}
        <span class="hud-asc" title="天劫等级">劫 ${st.ascension}</span>
        <div class="hud-actions">
          <button class="btn btn-ghost btn-sm" data-action="view-deck">牌组 ${st.deck.length}</button>
          <button class="btn btn-ghost btn-sm" data-action="view-relics">遗物 ${st.relics.length}</button>
          <button class="btn btn-ghost btn-sm" data-action="settings">设置</button>
        </div>
      </header>`;
    },
    miniStatusHTML() {
      return `<span class="mini-hp">${hpBarHTML(this.state.hp, this.state.maxHp)}</span>${goldHTML(this.state.gold)}`;
    },

    /* ---------------- 地图 ---------------- */
    mapHTML() {
      const st = this.state;
      const map = st.map;
      const avail = E.availableNodes(st);
      const availIds = new Set(avail.map(n => n.id));
      const curId = map.currentNode;
      const pos = {};
      const H = 1080;
      map.byRow.forEach((row, r) => row.forEach((node, i) => {
        const x = 500 + (i - (row.length - 1) / 2) * 235;
        const y = 50 + (8 - r) * 112;
        pos[node.id] = { x, y };
      }));
      const lines = [];
      map.nodes.forEach(node => {
        node.next.forEach(nid => {
          const a = pos[node.id], b = pos[nid];
          if (!a || !b) return;
          const active = curId && node.id === curId;
          lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${active ? 'active' : ''}" />`);
        });
      });
      const cur = curId ? E.nodeById(st, curId) : null;
      const hasRoutes = map.nodes.some(node => node.route && E.ROUTE_META[node.route]);
      const nodeHTML = map.nodes.map(node => {
        const p = pos[node.id];
        const meta = E.getNodeMeta(node.type);
        const isAvail = availIds.has(node.id);
        const isCur = node.id === curId;
        const visited = node.visited && !isCur;
        const cls = ['map-node', 'type-' + node.type];
        const route = E.ROUTE_META[node.route] ? node.route : null;
        if (route) cls.push('route-' + route);
        if (isAvail) cls.push('available');
        if (isCur) cls.push('current');
        if (visited) cls.push('visited');
        if (node.type === 'boss') cls.push('boss');
        const disabled = !isAvail;
        return `<button class="${cls.join(' ')}" style="left:${p.x / 10}%;top:${p.y}px" ${route ? `data-route="${route}"` : ''} data-action="node" data-id="${node.id}" ${disabled ? 'disabled' : ''} title="${esc(meta.name)}：${esc(meta.desc)}${route ? `&#10;路线倾向：${esc(E.ROUTE_META[route].name)}` : ''}">
          <span class="node-ring"></span>
          <span class="node-glyph">${meta.glyph}</span>
          ${node.row === 0 && route ? `<span class="route-start-label">${esc(E.ROUTE_META[route].short)}</span>` : ''}
          ${isCur ? '<span class="you-marker">你</span>' : ''}
          ${node.type === 'boss' ? `<span class="node-label">${esc(D.enemies[map.bossId ? D.encounters[map.act].boss.enemies[0].id : 'tai_xu'].name)}</span>` : ''}
        </button>`;
      }).join('');
      return `
      <main class="screen map-screen">
        ${this.hudHTML()}
        <div class="map-layout">
          <aside class="map-side">
            <h2>${esc(E.getActName(st.act))}</h2>
            <p class="act-flavor">${esc(ACT_FLAVOR[st.act] || '')}</p>
            ${hasRoutes ? `<div class="map-route-hint" aria-label="路线倾向">
              <span class="route-hint-row route-safe"><b>稳</b>休整、商店偏多</span>
              <span class="route-hint-row route-resource"><b>缘</b>事件、宝箱偏多</span>
              <span class="route-hint-row route-danger"><b>险</b>精英、战斗偏多</span>
            </div>` : ''}
            <div class="map-legend">
              ${['combat', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'].map(t => {
                const m = E.getNodeMeta(t);
                return `<span class="legend-row"><i class="legend-dot type-${t}">${m.glyph}</i>${m.name}</span>`;
              }).join('')}
            </div>
            <div class="map-actions">
              <button class="btn btn-ghost btn-sm" data-action="view-deck">查看牌组</button>
              <button class="btn btn-ghost btn-sm" data-action="view-relics">查看遗物</button>
              <button class="btn btn-ghost btn-sm" data-action="settings">设置</button>
            </div>
            <div class="map-potions">
              <span class="char-label">丹药</span>
              ${[0,1,2].map(i => st.potions[i] ? potionChip(st.potions[i], { big: true, inspect: true }) : '<span class="potion-chip empty">空</span>').join('')}
            </div>
            <div class="map-boss">
              <span class="map-boss-label">幕主</span>
              <b>${esc(D.enemies[D.encounters[st.act].boss.enemies[0].id].name)}</b>
              ${elemBadge(D.enemies[D.encounters[st.act].boss.enemies[0].id].element)}
            </div>
            <div class="map-tip">
              <b>${cur ? '去路已现' : '择路而入'}</b>
              <span>${cur ? '点击发光的节点继续前行。' : '从山脚的三条路中选一条开始。'}</span>
            </div>
          </aside>
          <section class="map-scroll" id="map-scroll">
            <div class="map-canvas" style="height:${H}px">
              <svg class="map-lines" viewBox="0 0 1000 ${H}" preserveAspectRatio="none">${lines.join('')}</svg>
              ${nodeHTML}
            </div>
          </section>
        </div>
      </main>`;
    },

    /* ---------------- 战斗 ---------------- */
    combatHTML() {
      const st = this.state;
      const c = st.combat;
      const ch = E.getCharacter(st);
      const alive = c.enemies.filter(e => e.hp > 0);
      const targetIdx = this.targetIndex < c.enemies.length && c.enemies[this.targetIndex] && c.enemies[this.targetIndex].hp > 0 ? this.targetIndex : c.enemies.indexOf(alive[0]);
      this.targetIndex = targetIdx >= 0 ? targetIdx : 0;
      const enemyHTML = c.enemies.map((e, i) => this.enemyHTML(e, i, targetIdx)).join('');
      const n = c.hand.length;
      const mid = (n - 1) / 2;
      const compactH = window.innerHeight <= 780;
      const compactW = window.innerWidth <= 1060;
      const mobile = window.innerWidth <= 600;
      const cardW = mobile ? 116 : (compactH || compactW) ? 132 : (window.innerWidth <= 1200 ? 138 : 152);
      const avail = mobile ? window.innerWidth : Math.max(320, window.innerWidth - 380);
      const overlap = !mobile && n > 1 && n * cardW > avail ? Math.min(96, Math.ceil((n * cardW - avail) / (n - 1))) : 0;
      const hand = c.hand.map((inst, i) => {
        return cardHTML(inst, { mode: 'hand', index: i, rot: 0, lift: 0, marginLeft: i === 0 ? 0 : -overlap });
      }).join('');
      const focusName = c.enemies[targetIdx] && c.enemies[targetIdx].hp > 0 ? c.enemies[targetIdx].name : '';
      const mobileUI = window.innerWidth <= 600;
      const selectedHint = this.selected != null
        ? `选择目标：点击敌方单位打出「${esc(cardData(c.hand[this.selected]).name)}」`
        : (c.phase === 'enemy' ? '敌方回合……'
          : (alive.length > 1
            ? (mobileUI ? `当前目标：${esc(focusName)} · 点按手牌查看详情，确认后选敌人` : `当前目标：${esc(focusName)} · 点击卡牌后点敌人切换 · 数字键直接出牌`)
            : `${mobileUI ? '点按手牌查看详情并确认出牌' : '点击卡牌出牌 · 数字键 1–9 · E 结束回合'}`));
      return `
      <main class="screen combat-screen ${c.phase === 'enemy' ? 'enemy-phase' : ''}">
        <header class="combat-top">
          <div class="turn-tag">第 ${c.turn} 回合</div>
          <div class="combat-act">${esc(E.getActName(st.act))}</div>
          <div class="hud-actions">
            <button class="btn btn-ghost btn-xs" data-action="view-deck">牌组</button>
            <button class="btn btn-ghost btn-xs" data-action="view-relics">遗物</button>
            <button class="btn btn-ghost btn-xs" data-action="settings">设置</button>
          </div>
        </header>
        <section class="enemy-zone ${c.enemies.length > 1 ? 'multi' : ''}">
          ${enemyHTML}
        </section>
        <section class="battle-mid">
          <div class="player-panel" id="player-panel">
            <div class="player-portrait"><span>${characterSigil(ch.id)}</span></div>
            <div class="player-info">
              <div class="player-name">${esc(ch.name)} <small>${esc(ch.passive)}</small></div>
              ${hpBarHTML(st.hp, st.maxHp)}
              <div class="player-sub">
                ${c.block > 0 ? `<span class="block-pill" title="护甲">甲 ${c.block}</span>` : ''}
                <span class="statuses">${statusChips(c.statuses, 'player')}</span>
              </div>
              <div class="relic-strip">${st.relics.map(id => relicChip(id, { inspect: true })).join('')}</div>
            </div>
            <button class="entity-info player-info-btn" data-action="inspect-character" data-char="${ch.id}" aria-label="查看${esc(ch.name)}详情">详情</button>
          </div>
          ${this.chainHTML()}
          <div class="energy-box" title="灵气：每回合恢复至上限">
            <span class="energy-orb"><b>${c.energy}</b><small>/${c.maxEnergy}</small></span>
            <span class="energy-label">灵气</span>
          </div>
        </section>
        <section class="hand-zone">
          <div class="left-tray">
            <div class="potions">
              ${[0, 1, 2].map(i => st.potions[i] ? `<button class="potion-btn filled" data-action="use-potion" data-index="${i}" ${c.phase !== 'player' ? 'disabled' : ''} title="${esc(potionById(st.potions[i]).name)}：${esc(potionById(st.potions[i]).desc)}" aria-label="${esc(potionById(st.potions[i]).name)}：${esc(potionById(st.potions[i]).desc)}">${potionVessel(st.potions[i])}</button>` : `<span class="potion-btn empty">空</span>`).join('')}
            </div>
            <div class="piles">
              <button class="pile-btn" data-action="open-piles" data-pile="draw" title="抽牌堆"><b>${c.drawPile.length}</b><span>抽</span></button>
              <button class="pile-btn" data-action="open-piles" data-pile="discard" title="弃牌堆"><b>${c.discardPile.length}</b><span>弃</span></button>
              <button class="pile-btn" data-action="open-piles" data-pile="exhaust" title="消耗堆"><b>${c.exhaustPile.length}</b><span>灭</span></button>
            </div>
          </div>
          <div class="hand-area">
            <div class="hand" style="--n:${n}">${hand || '<span class="empty-hand">手牌已空</span>'}</div>
          </div>
          <div class="combat-actions">
            <button class="btn btn-primary end-turn" data-action="end-turn" ${c.phase !== 'player' ? 'disabled' : ''}>结束回合 <small>E</small></button>
          </div>
        </section>
        <p class="combat-hint ${this.selected != null ? 'targeting' : ''}">${selectedHint}</p>
      </main>`;
    },
    enemyHTML(e, i, targetIdx) {
      const alive = e.hp > 0;
      const intent = E.getEnemyIntent(this.state, e);
      const weak = weakElement(e.element);
      const statuses = statusChips(e.statuses, 'enemy', i);
      const sub = `${e.block > 0 ? `<span class="block-pill">甲 ${e.block}</span>` : ''}${e.phase === 2 ? '<span class="phase-tag">狂怒</span>' : ''}${statuses ? `<span class="statuses">${statuses}</span>` : ''}`;
      const targetable = this.selected != null && alive;
      const showTarget = alive && i === targetIdx && (targetable || this.state.combat.enemies.length > 1);
      const detail = intent ? [
        intent.damage && intent.block ? `+${intent.block} 甲` : '',
        statusList(intent.debuffs),
        statusList(intent.buffs),
        intent.heal ? `回复 ${intent.heal}` : '',
        intent.addCards.length ? '塞入业障' : ''
      ].filter(Boolean).join(' · ') : '';
      return `
      <div class="enemy-unit ${alive ? '' : 'dead'} ${targetable ? 'targetable' : ''} ${i === targetIdx && alive ? 'focused' : ''} ${showTarget ? 'show-target' : ''}" style="--enemy-index:${i};--enemy-element:${elem(e.element).color}" data-enemy-uid="${e.uid}" data-action="enemy" data-index="${i}">
        ${alive ? `<button class="entity-info enemy-info-btn" data-action="inspect-enemy" data-id="${esc(e.id)}" data-index="${i}" aria-label="查看${esc(e.name)}详情">详情</button>` : ''}
        <div class="intent ${intent && intent.damage ? 'intent-attack' : ''}" title="${intent ? esc(intent.name + '：' + intent.label) : ''}">
          <span class="intent-icon">${intent ? esc(intent.icon) : '？'}</span>
          <span class="intent-label">${intent ? esc(intent.label) : '未知'}</span>
          ${detail ? `<span class="intent-detail">${esc(detail)}</span>` : ''}
        </div>
        <div class="enemy-body">
          <div class="enemy-top">
            <span class="enemy-name">${esc(e.name)}</span>
            ${elemBadge(e.element)}
            ${weak ? `<span class="weak-tag" title="相克弱点">弱 ${elem(weak).glyph}</span>` : ''}
          </div>
          <div class="enemy-art"><div class="enemy-art-motion">${enemyPortrait(e.id, e.name, 'eager', 'enemy-art-figure')}</div></div>
          ${hpBarHTML(e.hp, e.maxHp, 'enemy-hp')}
          ${sub ? `<div class="enemy-sub">${sub}</div>` : ''}
        </div>
      </div>`;
    },
    chainHTML() {
      const c = this.state.combat;
      const cur = c.currentElement ? elem(c.currentElement) : null;
      const next = cur && cur.generates ? elem(cur.generates) : null;
      const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < c.chain ? 'on' : ''}"></i>`).join('');
      let hint;
      if (!cur) hint = '打出任意五行牌起手';
      else if (next) hint = `下一张「${next.glyph}」可续链`;
      if (this.selected != null && c.hand[this.selected]) {
        const sd = cardData(c.hand[this.selected]);
        if (sd.element && sd.element !== 'none' && cur && cur.generates === sd.element) hint = '此牌可续链 +1';
        else if (sd.element && sd.element !== 'none' && cur) hint = '此牌会断链';
      }
      return `
      <div class="chain-panel">
        <div class="chain-flow">
          <span class="chain-elem ${cur ? '' : 'empty'}" style="${cur ? `--el:${cur.color};--el-dark:${cur.dark}` : ''}">${cur ? cur.glyph : '起'}</span>
          <span class="chain-arrow">${cur ? '生' : '→'}</span>
          <span class="chain-elem ${next ? '' : 'empty'}" style="${next ? `--el:${next.color};--el-dark:${next.dark}` : ''}">${next ? next.glyph : '—'}</span>
        </div>
        <div class="chain-meta">
          <div class="chain-pips" title="连携层数">${pips}<b>${c.chain}<small>/5</small></b></div>
          <div class="chain-hint">${hint}</div>
        </div>
      </div>`;
    },

    /* ---------------- 奖励 / 商店 / 休整 ---------------- */
    rewardHTML() {
      const st = this.state;
      const r = st.reward;
      const mobile = window.innerWidth <= 600;
      const titles = { combat: '战后所得', elite: '精英战利品', boss: '幕主遗藏' };
      const chosen = r.selected >= 0 && r.cards[r.selected] ? cardData(r.cards[r.selected]) : null;
      const choices = r.cards.map((inst, i) => {
        if (!mobile) return `<div class="choice-slot ${r.cardTaken && r.selected === i ? 'chosen' : ''} ${r.cardTaken && r.selected !== i ? 'faded' : ''}" ${!r.cardTaken ? `data-action="take-card" data-index="${i}"` : ''}>
          ${cardHTML(inst, { mode: 'choice' })}
          ${!r.cardTaken ? `<button class="btn btn-ghost btn-sm choice-btn" data-action="inspect-card" data-id="${esc(inst.id)}" data-up="${inst.up ? '1' : '0'}">查看效果与升级</button><button class="btn btn-ghost btn-sm choice-btn" data-action="take-card" data-index="${i}">选此牌</button>` : ''}
        </div>`;
        const data = cardData(inst);
        const tag = r.cardTaken ? 'div' : 'button';
        const traits = [data.exhaust ? '消耗' : '', data.retain ? '保留' : '', inst.up ? '已悟' : ''].filter(Boolean);
        const el = elem(data.element);
        return `<${tag} class="reward-option el-${data.element} ${r.cardTaken && r.selected === i ? 'chosen' : ''} ${r.cardTaken && r.selected !== i ? 'faded' : ''}" style="--el:${el.color};--el-dark:${el.dark}" ${r.cardTaken ? '' : `type="button" data-action="take-card" data-index="${i}" data-confirm="1"`}>
          <span class="reward-option-top"><span class="reward-option-cost">${data.cost}</span><span class="reward-option-name">${esc(data.name)}</span><span class="reward-option-seal">${esc(el.glyph)}</span></span>
          <span class="reward-option-meta">${TYPE_NAMES[data.type] || ''} · ${RARITY_LABEL[data.rarity] || ''}${traits.length ? ` · ${traits.join(' · ')}` : ''}</span>
          <span class="reward-option-text">${esc(data.text)}</span>
          <span class="reward-option-cta">${r.cardTaken ? r.selected === i ? '已领取' : '' : '查看详情并领取 →'}</span>
        </${tag}>`;
      }).join('');
      return `
      <main class="screen panel-screen reward-screen">
        ${this.miniHeader('战利品', E.getActName(st.act))}
        <section class="panel reward-panel">
          <h1>${titles[r.kind] || '战利品'}</h1>
          <div class="reward-line"><span class="reward-coin">◈</span> 获得 <b>${r.gold}</b> 金币</div>
          ${r.relicId ? `<div class="reward-relic">${relicChip(r.relicId, { big: true, showName: true })}<span>${esc(relicById(r.relicId).desc)}</span></div>` : ''}
          ${r.potionId ? `<div class="reward-potion">获得丹药：${potionChip(r.potionId)} <b>${esc(potionById(r.potionId).name)}</b></div>` : ''}
          ${r.potionFull ? '<p class="dim">丹药腰带已满，多余丹药化为 20 金币。</p>' : ''}
          <h2 class="sub-title">${r.cardTaken ? '已收入囊中' : mobile ? '三选一 · 点按查看详情并确认领取' : '选一张牌带走'}</h2>
          <div class="${mobile ? 'reward-option-list' : 'card-choice-row'}">${choices}</div>
          ${chosen ? `<p class="chosen-note">「${esc(chosen.name)}」已加入牌组。</p>` : ''}
          <div class="panel-actions">
            ${!r.cardTaken ? `<button class="btn btn-ghost" data-action="skip-card">跳过选牌</button>` : `<button class="btn btn-primary" data-action="continue-reward">继续前行</button>`}
          </div>
        </section>
      </main>`;
    },
    shopHTML() {
      const st = this.state;
      const shop = st.shop;
      const cardItem = (it, i) => {
        const p = cardData(it.card);
        return `<div class="shop-card ${it.sold ? 'sold' : ''}">
          ${cardHTML(it.card, { mode: 'shop', inspect: true })}
          <div class="shop-buy">
            <span class="price">◈ ${it.price}</span>
            <button class="btn btn-sm ${st.gold >= it.price && !it.sold ? 'btn-primary' : 'btn-ghost'}" data-action="shop-buy" data-kind="card" data-index="${i}" ${it.sold || st.gold < it.price ? 'disabled' : ''}>${it.sold ? '已售' : '买下'}</button>
          </div>
        </div>`;
      };
      return `
      <main class="screen panel-screen shop-screen">
        ${this.miniHeader('云游商铺', '“看一眼无妨，买不买随缘。”')}
        <section class="panel shop-panel">
          <div class="shop-top"><h1>云游商铺</h1><div class="shop-top-right">${goldHTML(st.gold)}<button class="btn btn-ghost btn-sm" data-action="shop-leave">离开</button></div></div>
          <p class="shop-quote">“五行流转，万物皆可交易。只收现钱，不赊账。”</p>
          <h2 class="sub-title">功法</h2>
          <div class="shop-cards">${shop.cards.map(cardItem).join('')}</div>
          <div class="shop-cols">
            <div>
              <h2 class="sub-title">法器</h2>
              ${shop.relics.map((it, i) => {
                const r = relicById(it.id);
                return `<div class="shop-relic ${it.sold ? 'sold' : ''}">
                  ${relicChip(it.id, { big: true })}
                  <div class="shop-relic-info"><b>${esc(r.name)}</b><span>${esc(r.desc)}</span></div>
                  <span class="price">◈ ${it.price}</span>
                  <button class="btn btn-sm ${st.gold >= it.price && !it.sold ? 'btn-primary' : 'btn-ghost'}" data-action="shop-buy" data-kind="relic" data-index="${i}" ${it.sold || st.gold < it.price ? 'disabled' : ''}>${it.sold ? '已售' : '买下'}</button>
                </div>`;
              }).join('') || '<p class="dim">法器已售罄。</p>'}
            </div>
            <div>
              <h2 class="sub-title">丹药</h2>
              ${shop.potions.map((it, i) => {
                const p = potionById(it.id);
                return `<div class="shop-potion ${it.sold ? 'sold' : ''}">
                  ${potionChip(it.id, { big: true })}
                  <div class="shop-potion-info"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div>
                  <span class="price">◈ ${it.price}</span>
                  <button class="btn btn-sm ${st.gold >= it.price && !it.sold && st.potions.length < 3 ? 'btn-primary' : 'btn-ghost'}" data-action="shop-buy" data-kind="potion" data-index="${i}" ${it.sold || st.gold < it.price || st.potions.length >= 3 ? 'disabled' : ''}>${it.sold ? '已售' : (st.potions.length >= 3 ? '腰带满' : '买下')}</button>
                </div>`;
              }).join('') || '<p class="dim">丹药已售罄。</p>'}
              <div class="shop-remove">
                <div><b>洗去旧学</b><span>移除牌组中的一张牌</span></div>
                <span class="price">◈ ${shop.removePrice}</span>
                <button class="btn btn-sm ${!shop.removeUsed && st.gold >= shop.removePrice ? 'btn-primary' : 'btn-ghost'}" data-action="shop-remove" ${shop.removeUsed || st.gold < shop.removePrice ? 'disabled' : ''}>${shop.removeUsed ? '已用过' : '选牌移除'}</button>
              </div>
            </div>
          </div>
        </section>
      </main>`;
    },
    restHTML() {
      const st = this.state;
      const heal = Math.ceil(st.maxHp * 0.3);
      const upgradable = st.deck.some(c => !c.up && D.cardMap[c.id].up);
      return `
      <main class="screen panel-screen rest-screen">
        ${this.miniHeader('山间营地', E.getActName(st.act))}
        <section class="panel rest-panel">
          <h1>且歇一程</h1>
          <p class="scene-text">篝火噼啪作响，山风把远处的妖气吹得很淡。你还有一点时间，做一件事。</p>
          <div class="rest-choices">
            <button class="rest-choice" data-action="rest-heal">
              <span class="rest-glyph">息</span>
              <b>疗伤</b>
              <span>回复 ${heal} 点生命（最大生命的 30%）</span>
              <small>当前 ${st.hp} / ${st.maxHp}</small>
            </button>
            <button class="rest-choice" data-action="rest-upgrade" ${upgradable ? '' : 'disabled'}>
              <span class="rest-glyph">悟</span>
              <b>参悟</b>
              <span>升级牌组中的一张牌</span>
              <small>${upgradable ? '选择一张未悟的牌' : '已无牌可悟'}</small>
            </button>
          </div>
          <div class="panel-actions">
            <button class="btn btn-ghost" data-action="view-deck">查看牌组</button>
          </div>
        </section>
      </main>`;
    },
    eventHTML() {
      const st = this.state;
      const ev = D.events.find(e => e.id === st.event.id);
      if (!ev) return this.mapHTML();
      const resolved = st.event.resolved;
      return `
      <main class="screen panel-screen event-screen">
        ${this.miniHeader('山野异闻', E.getActName(st.act))}
        <section class="panel event-panel">
          <span class="event-mark">缘</span>
          <h1>${esc(ev.title)}</h1>
          <p class="event-text">${esc(ev.text)}</p>
          ${resolved ? `
            <div class="event-result"><span>结果</span><p>${esc(st.event.resultText)}</p></div>
            <div class="panel-actions"><button class="btn btn-primary" data-action="continue-event">继续前行</button></div>
          ` : `
            <div class="event-choices">
              ${ev.choices.map((ch, i) => {
                const need = ch.require && ch.require.gold ? ch.require.gold : 0;
                const disabled = need > st.gold;
                return `<button class="event-choice" data-action="event-choice" data-index="${i}" ${disabled ? 'disabled' : ''}>
                  <span class="choice-index">${i + 1}</span>
                  <span>${esc(ch.label)}</span>
                  ${need ? `<small class="${disabled ? 'warn' : 'dim'}">需要 ${need} 金币${disabled ? '（不足）' : ''}</small>` : ''}
                </button>`;
              }).join('')}
            </div>
          `}
        </section>
      </main>`;
    },
    treasureHTML() {
      const st = this.state;
      const t = st.treasure;
      return `
      <main class="screen panel-screen treasure-screen">
        ${this.miniHeader('古箱', E.getActName(st.act))}
        <section class="panel treasure-panel">
          <div class="chest">宝</div>
          <h1>箱中有物</h1>
          <div class="loot-list">
            <div class="loot-row">◈ 金币 <b>+${t.gold}</b></div>
            ${t.relicId ? `<div class="loot-row">${relicChip(t.relicId, { big: true, showName: true })}<b>${esc(relicById(t.relicId).name)}</b><span>${esc(relicById(t.relicId).desc)}</span></div>` : ''}
            ${t.potionId ? `<div class="loot-row">${potionChip(t.potionId, { big: true })}<b>${esc(potionById(t.potionId).name)}</b><span>${esc(potionById(t.potionId).desc)}</span></div>` : ''}
          </div>
          <div class="panel-actions"><button class="btn btn-primary" data-action="treasure-continue">收好，继续前行</button></div>
        </section>
      </main>`;
    },
    miniHeader(title, sub) {
      const st = this.state;
      return `
      <header class="hud mini">
        <button class="hud-char inspect-hud-char" data-action="inspect-character" title="查看角色详情"><span class="hud-glyph">${esc(title.slice(0, 1))}</span><span><b>${esc(E.getCharacter(st).name)}</b><small>${esc(sub || '')}</small></span></button>
        <div class="hud-hp">${hpBarHTML(st.hp, st.maxHp)}</div>
        ${goldHTML(st.gold)}
        <div class="hud-actions">
          <button class="btn btn-ghost btn-sm" data-action="view-deck">牌组</button>
          <button class="btn btn-ghost btn-sm" data-action="view-relics">遗物</button>
          <button class="btn btn-ghost btn-sm" data-action="settings">设置</button>
        </div>
      </header>`;
    },

    /* ---------------- 结束 / 图鉴 ---------------- */
    endHTML(win) {
      const st = this.state;
      const s = st ? E.getRunSummary(st) : { character: '无名', floor: 0, kills: 0, deckSize: 0, gold: 0, ascension: 0 };
      return `
      <main class="screen end-screen ${win ? 'victory' : 'defeat'}">
        <div class="end-glow"></div>
        <span class="end-mark">${win ? '道' : '陨'}</span>
        <h1>${win ? '此身合道' : '道途未竟'}</h1>
        <p class="end-sub">${win ? '五行归元，天阙重开。你终于走到了问心之处。' : '山风收走了最后一缕气息。道还在，人再来。'}</p>
        <div class="end-stats">
          <span><b>${esc(s.character)}</b><small>修士</small></span>
          <span><b>${s.floor}</b><small>层数</small></span>
          <span><b>${s.kills}</b><small>击杀</small></span>
          <span><b>${s.deckSize}</b><small>牌组</small></span>
          <span><b>${s.ascension}</b><small>天劫</small></span>
        </div>
        ${win ? `<p class="unlock-note">当前最高天劫 ${this.meta.maxAscension}${this.meta.maxAscension >= 10 ? ' · 已至十重' : ' · 下一次，风会更冷。'}</p>` : ''}
        <div class="end-actions">
          <button class="btn btn-primary btn-lg" data-action="${win ? 'victory-new' : 'game-new'}">${win ? '再入轮回' : '重入轮回'}</button>
          <button class="btn btn-ghost" data-action="${win ? 'victory-home' : 'game-home'}">返回标题</button>
        </div>
      </main>`;
    },
    compendiumHTML() {
      const m = this.meta;
      const tabs = [['cards', '卡牌'], ['characters', '角色'], ['relics', '遗物'], ['enemies', '敌人'], ['potions', '丹药']];
      let body = '';
      if (this.compTab === 'cards') {
        const allCards = D.cards;
        body = `<div class="comp-grid">${allCards.map(c => {
          const seen = m.seenCards.includes(c.id);
          if (!seen) return `<div class="comp-locked"><span>？</span><small>${RARITY_LABEL[c.rarity] || ''}</small></div>`;
          return cardHTML({ uid: 'comp_' + c.id, id: c.id, up: false }, { mode: 'compendium', inspect: true });
        }).join('')}</div>`;
      } else if (this.compTab === 'characters') {
        body = `<div class="comp-characters">${D.characters.map(ch => `<button class="comp-character comp-inspect" data-action="inspect-character" data-char="${esc(ch.id)}" style="--accent:${ch.accent}">
          <span class="comp-character-art"><img class="comp-character-portrait" src="${CHAR_PORTRAITS[ch.id]}" alt="" loading="lazy" decoding="async"><span class="comp-character-sigil">${characterSigil(ch.id)}</span></span>
          <span class="comp-character-info"><b>${esc(ch.name)}</b><span>${esc(ch.title)}</span><small>${esc(ch.passive)} · ${esc(CHAR_STYLE[ch.id])}</small></span>
        </button>`).join('')}</div>`;
      } else if (this.compTab === 'relics') {
        body = `<div class="comp-relics">${D.relics.filter(r => r.rarity !== 'starter').map(r => {
          const seen = m.seenRelics.includes(r.id);
          return `<${seen ? 'button' : 'div'} class="comp-relic ${seen ? 'comp-inspect' : 'locked'}" ${seen ? `data-action="inspect-relic" data-id="${esc(r.id)}"` : ''}>
            <span class="comp-relic-icon">${seen ? relicEmblem(r.id) : '？'}</span>
            <div><b>${seen ? esc(r.name) : '未识法器'}</b><span>${seen ? esc(r.desc) : '尚未在轮回中得见。'}</span></div>
            <small>${RARITY_LABEL[r.rarity] || ''}</small>
          </${seen ? 'button' : 'div'}>`;
        }).join('')}</div>`;
      } else if (this.compTab === 'enemies') {
        body = `<div class="comp-enemies">${Object.values(D.enemies).map(e => {
          const seen = m.seenEnemies.includes(e.id);
          return `<${seen ? 'button' : 'div'} class="comp-enemy ${seen ? 'comp-inspect' : 'locked'}" ${seen ? `data-action="inspect-enemy" data-id="${esc(e.id)}"` : ''}>
            <span class="comp-enemy-art" style="--el:${elem(e.element).color}">${seen ? enemyPortrait(e.id, e.name) : '？'}</span>
            <div><b>${seen ? esc(e.name) : '未识之敌'}</b>${seen ? `<span>${elemBadge(e.element)} ${e.boss ? '幕主' : e.elite ? '精英' : '寻常'}</span>` : '<span>尚未交手。</span>'}</div>
          </${seen ? 'button' : 'div'}>`;
        }).join('')}</div>`;
      } else if (this.compTab === 'potions') {
        body = `<div class="comp-relics">${D.potions.map(p => `<button class="comp-relic comp-inspect" data-action="inspect-potion" data-id="${esc(p.id)}"><span class="comp-relic-icon">${potionVessel(p.id)}</span><span><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></span></button>`).join('')}</div>`;
      }
      return `
      <main class="screen compendium-screen">
        <header class="page-head">
          <button class="btn btn-ghost btn-sm" data-action="to-title">← 返回</button>
          <div><h1>问道图鉴</h1><p>卡牌、修士、法器、妖敌与丹药。</p></div>
          <span class="head-spacer"></span>
        </header>
        <div class="comp-tabs">
          ${tabs.map(([id, name]) => `<button class="comp-tab ${this.compTab === id ? 'active' : ''}" data-action="comp-tab" data-tab="${id}">${name}</button>`).join('')}
        </div>
        <div class="comp-count">${this.compTab === 'cards' ? `已识 ${m.seenCards.filter(id => D.cardMap[id]).length} / ${D.cards.length}` : this.compTab === 'relics' ? `已识 ${m.seenRelics.filter(id => D.relicMap[id] && D.relicMap[id].rarity !== 'starter').length} / ${D.relics.filter(r => r.rarity !== 'starter').length}` : this.compTab === 'enemies' ? `已识 ${m.seenEnemies.length} / ${Object.keys(D.enemies).length}` : this.compTab === 'characters' ? `${D.characters.length} 位修士` : `${D.potions.length} 种丹药`}</div>
        <section class="comp-body">${body}</section>
      </main>`;
    },

    /* ---------------- 覆盖层 ---------------- */
    detailHTML() {
      const d = this.detail;
      if (!d) return '';
      let title = '';
      let body = '';
      let confirm = '';
      if (d.kind === 'card') {
        const data = cardData({ id: d.id, up: !!d.up });
        if (!data) return '';
        const other = data.up ? cardData({ id: d.id, up: !d.up }) : null;
        title = data.name;
        const traits = [data.exhaust ? '消耗' : '', data.retain ? '保留' : ''].filter(Boolean);
        let preview = '';
        if (d.action === 'play-card' && this.state && this.state.combat) {
          const p = E.getPreview(this.state, d.index, this.targetIndex);
          const values = p ? [p.damage != null ? `预计伤害 ${p.damage}${p.hits > 1 ? ' × ' + p.hits : ''}` : '',
            p.block != null ? `预计护甲 ${p.block}` : '', p.cross ? '克制破防' : '',
            p.linked ? `连携 ${p.chainAfter}` : ''].filter(Boolean) : [];
          if (values.length) preview = `<div class="detail-note">${values.map(esc).join(' · ')}</div>`;
        }
        body = `<div class="card-current-label" style="--el:${elem(data.element).color}">${other ? d.up ? '已升级 · 当前效果' : '升级前 · 当前效果' : '当前效果'}</div>
          <div class="detail-meta">${elemBadge(data.element)}<span>${TYPE_NAMES[data.type] || ''}</span><span>${RARITY_LABEL[data.rarity] || ''}</span><span>灵气 ${data.cost}</span>${d.up ? '<span>已悟</span>' : ''}</div>
          <p class="card-detail-text">${formatText(data.text)}</p>
          ${traits.length ? `<p class="detail-note">关键词：${traits.join(' · ')}</p>` : ''}${preview}
          ${other ? `<section class="card-upgrade-preview" aria-label="${d.up ? '升级前' : '升级后'}效果">
            <div class="card-upgrade-head"><b>${d.up ? '升级前' : '升级后'}</b><span>灵气 ${other.cost}</span></div>
            <p class="card-upgrade-text">${formatText(other.text)}</p>
            ${other.exhaust || other.retain ? `<small>${[other.exhaust ? '消耗' : '', other.retain ? '保留' : ''].filter(Boolean).join(' · ')}</small>` : ''}
          </section>` : ''}`;
        if (d.action === 'take-card') confirm = '确认领取';
        if (d.action === 'pick-card') confirm = this.picker && this.picker.mode === 'remove-shop' ? '确认移除' : '确认参悟';
        if (d.action === 'play-card') {
          const can = E.canPlayCard(this.state, d.index);
          confirm = can.ok ? (E.cardNeedsTarget(data) && E.aliveEnemies(this.state).length > 1 ? '选择目标' : '确认出牌') : '';
          if (!can.ok) body += `<p class="detail-note">${esc(can.reason || '当前无法打出')}</p>`;
        }
      } else if (d.kind === 'potion') {
        const p = potionById(d.id);
        if (!p) return '';
        title = p.name;
        const enemy = this.state && this.state.combat && this.state.combat.enemies[this.targetIndex];
        body = `<div class="entity-showcase potion-showcase">${potionVessel(p.id)}<span>丹 · ${esc(p.name)}</span></div><p class="detail-text">${formatText(p.desc)}</p>
          <p class="detail-note">${p.target === 'enemy' ? `目标：${esc(enemy && enemy.hp > 0 ? enemy.name : '当前敌人')}` : '作用于自身'}</p>`;
        if (d.action === 'use-potion') confirm = '确认使用';
      } else if (d.kind === 'relic') {
        const r = relicById(d.id);
        if (!r) return '';
        title = r.name;
        body = `<div class="entity-showcase relic-showcase">${relicEmblem(r.id)}<span>器 · ${esc(r.name)}</span></div><div class="detail-meta"><span>${RARITY_LABEL[r.rarity] || '法器'}</span></div><p class="detail-text">${formatText(r.desc)}</p>`;
      } else if (d.kind === 'status') {
        const status = D.statuses[d.id];
        if (!status) return '';
        title = status.name;
        body = `<div class="detail-glyph">${esc(status.glyph)}</div><div class="detail-meta"><span>${status.debuff ? '负面状态' : '增益状态'}</span><span>${esc(d.ownerName)} · 当前 ${d.count} 层</span></div><p class="detail-text">${formatText(status.desc)}</p>`;
      } else if (d.kind === 'character') {
        const ch = D.characters.find(x => x.id === d.id);
        if (!ch) return '';
        title = ch.name;
        const relic = relicById(ch.relic);
        body = `<div class="entity-hero entity-hero-${ch.id}" style="--accent:${ch.accent}">${characterSigil(ch.id)}<div><b>${esc(ch.title)}</b><span>“${esc(ch.flavor)}”</span></div></div>
          <div class="detail-meta">${ch.elements.map(id => elemBadge(id)).join('')}<span>生命 ${ch.maxHp}</span></div>
          <p class="detail-text">${esc(ch.title)} · ${esc(CHAR_STYLE[ch.id])}</p>
          <h3>${esc(ch.passive)}</h3><p class="detail-text">${formatText(ch.passiveText)}</p>
          <h3>初始牌组</h3><div class="detail-list">${ch.deck.map(x => `<span>${esc(D.cardMap[x.id].name)} × ${x.count}</span>`).join('')}</div>
          <h3>初始遗物 · ${esc(relic.name)}</h3><p class="detail-text">${formatText(relic.desc)}</p>
          <p class="detail-note">${esc(CHAR_TIPS[ch.id])}</p>`;
      } else if (d.kind === 'enemy') {
        const e = D.enemies[d.id];
        if (!e) return '';
        title = e.name;
        const live = this.state && this.state.combat && this.state.combat.enemies[d.index] && this.state.combat.enemies[d.index].id === d.id ? this.state.combat.enemies[d.index] : null;
        const weak = weakElement(e.element);
        const intent = live ? E.getEnemyIntent(this.state, live) : null;
        body = `<div class="detail-enemy-portrait" style="--el:${elem(e.element).color}">${enemyPortrait(e.id, e.name, 'eager')}</div>
          <div class="detail-meta">${elemBadge(e.element)}<span>${e.boss ? '幕主' : e.elite ? '精英' : '寻常敌人'}</span>${live ? `<span>生命 ${live.hp} / ${live.maxHp}</span><span>护甲 ${live.block}</span>` : ''}</div>
          <p class="detail-note">${weak ? `弱点：${elem(weak).name}行攻击可破甲并增伤` : '无五行弱点'}</p>
          ${intent ? `<h3>当前意图 · ${esc(intent.name)}</h3><p class="detail-text">${esc(intent.label)}</p>` : ''}
          <h3>招式</h3><div class="detail-list">${Object.values(e.moves).map(m => `<span><b>${esc(m.name)}</b>　${esc([m.damage ? `伤害 ${m.damage}${m.hits > 1 ? ' × ' + m.hits : ''}` : '', m.block ? `护甲 ${m.block}` : '', m.heal ? `回复 ${m.heal}` : '', statusList(m.debuffs), statusList(m.buffs), ...(m.addCards || []).map(x => `塞入 ${x.count || 1} 张${D.cardMap[x.id] ? D.cardMap[x.id].name : '业障'}`)].filter(Boolean).join(' · ') || '特殊效果')}</span>`).join('')}</div>
          ${live ? `<h3>当前状态</h3><div class="detail-list">${Object.keys(D.statuses).filter(k => live.statuses && live.statuses[k] > 0).map(k => `<span>${esc(D.statuses[k].name)} ${live.statuses[k]}：${esc(D.statuses[k].desc)}</span>`).join('') || '<span>无</span>'}</div>` : ''}`;
      }
      return `<div class="overlay detail-overlay" data-action="close-overlay">
        <div class="overlay-panel detail-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}详情" data-action="overlay-stop">
          <header class="overlay-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-sm" data-action="close-overlay">关闭</button></header>
          <div class="overlay-body detail-body">${body}</div>
          ${confirm ? `<footer class="detail-actions"><button class="btn btn-ghost" data-action="close-overlay">取消</button><button class="btn btn-primary" data-action="confirm-detail">${confirm}</button></footer>` : ''}
        </div>
      </div>`;
    },
    overlayHTML() {
      if (!this.overlay) return '';
      if (this.overlay === 'detail') return this.detailHTML();
      let body = '';
      let title = '';
      if (this.overlay === 'deck') {
        title = `牌组 · ${this.state ? this.state.deck.length : 0} 张`;
        body = `<div class="overlay-card-grid">${sortDeck(this.state.deck).map(inst => cardHTML(inst, { mode: 'deck', inspect: true })).join('')}</div>`;
      } else if (this.overlay === 'relics') {
        title = '遗物';
        const relics = this.state.relics.map(id => {
          const r = relicById(id);
          return `<div class="overlay-relic">${relicEmblem(id)}<div><b>${esc(r.name)}</b><p>${esc(r.desc)}</p></div></div>`;
        }).join('');
        body = relics || '<p class="dim">尚未拾得遗物。</p>';
      } else if (this.overlay === 'piles') {
        const c = this.state.combat;
        const map = { draw: c.drawPile, discard: c.discardPile, exhaust: c.exhaustPile };
        const names = { draw: '抽牌堆', discard: '弃牌堆', exhaust: '消耗堆' };
        const pile = (map[this.pile] || []).slice().sort((a, b) => (D.cardMap[a.id].name > D.cardMap[b.id].name ? 1 : -1));
        title = `${names[this.pile]} · ${pile.length} 张`;
        body = `<div class="overlay-card-grid">${pile.map(inst => cardHTML(inst, { mode: 'deck', inspect: true })).join('') || '<p class="dim">空。</p>'}</div>`;
      } else if (this.overlay === 'picker') {
        title = this.picker.title;
        const isUpgrade = this.picker.mode === 'upgrade-rest';
        body = `<div class="overlay-card-grid">${sortDeck(this.state.deck).map(inst => {
          const data = D.cardMap[inst.id];
          const ok = isUpgrade ? (!inst.up && data.up) : true;
          return `<div class="pick-wrap ${ok ? '' : 'ineligible'}">${cardHTML(inst, { mode: 'deck', pickUid: ok ? inst.uid : null, selectable: ok })}</div>`;
        }).join('')}</div>`;
      } else if (this.overlay === 'help') {
        title = '玩法';
        body = `
          <div class="help-grid">
            <div class="help-block"><b>灵气与手牌</b><p>每回合 3 点灵气、抽 5 张牌。打出卡牌消耗灵气；回合结束弃掉手牌。灵气不足时打不出牌，但可以先打出低费牌调整顺序。</p></div>
            <div class="help-block"><b>回灵构筑</b><p>调息返还费用并抽牌，连携达到 2 时再回 1 点灵气。普通调息打出后消耗；升级后不再消耗，可配合抽牌组成持续回灵。归元可净赚 1 点灵气；聚气丹炉在偶数回合回灵。</p></div>
            <div class="help-block"><b>相生连携</b><p>上一张牌的五行「生」出下一张，就能续上连携。顺序：木 → 火 → 土 → 金 → 水 → 木。连携每 +1，当前牌的伤害与护甲也 +1。断链会清零，但不会额外惩罚。</p></div>
            <div class="help-block"><b>相克破防</b><p>用克敌属性攻击：木克土、土克水、水克火、火克金、金克木。相克伤害 ×1.5，并且无视护甲。保连携还是断链打弱点，是每回合最核心的取舍。</p></div>
            <div class="help-block"><b>五行周天</b><p>连携叠到 5 层时，立即对所有敌人造成 8 点伤害、回复 1 点灵气、抽 1 张牌，然后连携归零。连携会跨回合保留。</p></div>
            <div class="help-block"><b>状态与关键词</b><p>中毒/灼烧按层数持续掉血；虚弱降低输出，易伤放大受伤；锐气/坚韧强化攻击与护甲。「消耗」的牌本场不再回来，「贯穿」无视护甲。</p></div>
            <div class="help-block"><b>一局的目标</b><p>沿分支地图走过三幕，击败每幕的幕主。战斗后选牌、精英掉遗物、商店删牌、休整升级——把牌组捏成能稳定续链的样子。</p></div>
          </div>
          <div class="help-keys"><span>1–9 出牌</span><span>E 结束回合</span><span>Esc 关闭面板</span></div>`;
      } else if (this.overlay === 'settings') {
        title = '设置';
        body = `
          <div class="settings-list">
            <button class="settings-row" data-action="help"><span>玩法说明</span><b>五行 · 连携 · 状态</b></button>
            <button class="settings-row" data-action="toggle-sound"><span>音效</span><b>${this.soundOn ? '开' : '关'}</b></button>
            <div class="settings-row static"><span>操作</span><b>${window.innerWidth <= 600 ? '点击出牌 · 点击结束回合' : '点击出牌 · 1–9 · E 结束回合'}</b></div>
            <div class="settings-row static"><span>规则</span><b>相生续链 · 相克破甲</b></div>
            <button class="settings-row danger" data-action="abandon-run"><span>放弃轮回</span><b>回到标题</b></button>
            <button class="settings-row" data-action="back-title-keep"><span>返回标题</span><b>保留进度</b></button>
          </div>
          <p class="settings-version">五行问道 v1.0 · 本地存档</p>`;
      }
      return `
      <div class="overlay" data-action="close-overlay">
        <div class="overlay-panel" data-action="overlay-stop">
          <header class="overlay-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-sm" data-action="close-overlay">关闭</button></header>
          <div class="overlay-body">${body}</div>
        </div>
      </div>`;
    },

    /* ---------------- 背景粒子 ---------------- */
    initBackground() {
      const canvas = document.getElementById('bg-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const state = { canvas, ctx, w: 0, h: 0, dpr: 1, parts: [], raf: null };
      this.bg = state;
      const resize = () => this.resizeBackground();
      resize();
      const colors = ['#5aa86e', '#d95b45', '#c6a05a', '#e8dfc8', '#5f95bd'];
      for (let i = 0; i < 46; i++) {
        state.parts.push({
          x: Math.random(), y: Math.random(),
          r: Math.random() * 2.2 + 0.6,
          s: Math.random() * 0.00022 + 0.00006,
          drift: (Math.random() - 0.5) * 0.00008,
          c: colors[Math.floor(Math.random() * colors.length)],
          a: Math.random() * 0.35 + 0.1
        });
      }
      const loop = () => {
        const { ctx: g, w, h } = state;
        g.clearRect(0, 0, w, h);
        state.parts.forEach(p => {
          p.y -= p.s;
          p.x += p.drift;
          if (p.y < -0.03) { p.y = 1.03; p.x = Math.random(); }
          if (p.x < -0.02) p.x = 1.02;
          if (p.x > 1.02) p.x = -0.02;
          g.beginPath();
          g.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
          g.fillStyle = p.c;
          g.globalAlpha = p.a;
          g.fill();
        });
        g.globalAlpha = 1;
        state.raf = requestAnimationFrame(loop);
      };
      loop();
    },
    resizeBackground() {
      const s = this.bg;
      if (!s) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      s.w = window.innerWidth;
      s.h = window.innerHeight;
      s.dpr = dpr;
      s.canvas.width = Math.floor(s.w * dpr);
      s.canvas.height = Math.floor(s.h * dpr);
      s.canvas.style.width = s.w + 'px';
      s.canvas.style.height = s.h + 'px';
      s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  window.WX_UI = UI;
})();
