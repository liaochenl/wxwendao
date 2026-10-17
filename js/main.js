/* 启动、存档、全局快捷键。 */
(function () {
  'use strict';
  const E = window.WXEngine;
  const UI = window.WX_UI;
  const RUN_KEY = 'wuxing_run_v1';
  const META_KEY = 'wuxing_meta_v1';

  function defaultMeta() {
    return {
      version: 1,
      maxAscension: 0,
      seenCards: [],
      seenRelics: [],
      seenEnemies: [],
      settings: { sound: true },
      stats: { runs: 0, wins: 0, deaths: 0 }
    };
  }
  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return defaultMeta();
      const m = JSON.parse(raw);
      const base = defaultMeta();
      return {
        ...base, ...m,
        maxAscension: Math.max(0, Math.min(10, Number(m.maxAscension) || 0)),
        settings: Object.assign({}, base.settings, m.settings || {}),
        stats: Object.assign({}, base.stats, m.stats || {}),
        seenCards: Array.isArray(m.seenCards) ? m.seenCards : [],
        seenRelics: Array.isArray(m.seenRelics) ? m.seenRelics : [],
        seenEnemies: Array.isArray(m.seenEnemies) ? m.seenEnemies : []
      };
    } catch (err) { return defaultMeta(); }
  }
  function loadRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      const state = E.deserialize(raw);
      if (!state || state.screen === 'gameover' || state.screen === 'victory') return null;
      return state;
    } catch (err) { return null; }
  }

  const meta = loadMeta();
  const saved = loadRun();

  const app = {
    meta,
    seed: 0,
    saveRun(state) {
      try {
        if (!state || state.screen === 'gameover' || state.screen === 'victory') return;
        localStorage.setItem(RUN_KEY, E.serialize(state));
      } catch (err) { /* 存储不可用时仍可游玩 */ }
    },
    clearRun() {
      try { localStorage.removeItem(RUN_KEY); } catch (err) {}
    },
    saveMeta() {
      try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (err) {}
    },
    newRun(characterId, ascension) {
      const state = E.createRun({ characterId, ascension, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
      meta.stats.runs++;
      app.saveMeta();
      app.saveRun(state);
      return state;
    },
    onVictory(state) {
      meta.stats.wins++;
      const next = Math.min(10, Math.max(meta.maxAscension, (state.ascension || 0) + 1));
      meta.maxAscension = next;
      app.saveMeta();
      app.clearRun();
    },
    onGameOver(state) {
      meta.stats.deaths++;
      app.saveMeta();
      app.clearRun();
    }
  };

  function boot() {
    if (!UI) {
      document.getElementById('app').innerHTML = '<div class="fatal">界面加载失败，请检查 js/ui.js。</div>';
      return;
    }
    UI.init({
      app,
      meta,
      saved,
      onSave: (state) => app.saveRun(state)
    });
    window.addEventListener('keydown', (ev) => UI.handleKey(ev));
    window.addEventListener('pagehide', () => { if (UI.state) app.saveRun(UI.state); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && UI.state) app.saveRun(UI.state); });
    // 首次交互后启动音频上下文
    const unlock = () => { UI.unlockAudio && UI.unlockAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
