# 《五行问道》移动端适配实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让《五行问道》在 iPhone 15 Pro（393×852）上完整可玩，同时保证桌面 1280×800 的布局与交互零回归。

**Architecture:** 以 `@media (max-width: 600px)` 为唯一新增断点，用 CSS 重排现有 DOM（战斗页靠 flex `order`、地图页靠 grid），只在 `js/ui.js` 的 `combatHTML()` 中增加手牌宽度/重叠的移动分支。引擎、数据、存档格式不动。用无依赖的 CDP 审计脚本在 393×852 与 430×932 下断言"无横向溢出、触控目标 ≥44、结束回合不压手牌"。

**Tech Stack:** 原生 HTML/CSS/JavaScript（ES2020）、Node 24（`node:test` / 内置 `http` / 全局 `WebSocket`）、headless Chrome + CDP、GitHub Pages 静态部署。

## Global Constraints

- 不改 `js/engine.js`、`js/data.js`、`js/main.js`；不改存档键与结构。
- 所有移动端规则限定 `max-width: 600px`；`>600px` 的桌面布局与视觉不变。
- 唯一 viewport 变更：`viewport-fit=cover`。
- 触控目标 ≥44×44（至少一个维度）；手牌 `.card-text` ≥11px。
- 393×852 与 430×932 下 `document.documentElement.scrollWidth <= innerWidth + 1`。
- 战斗页结束回合按钮与手牌区矩形不相交；地图页 `.hud-actions` 完整在视口内。
- 不引入运行时依赖、不引入构建步骤；`file://` 仍可直接运行。
- 保持简体中文文案与水墨视觉，不重做美术。

---

## File Structure

| 文件 | 职责 | 变更 |
|---|---|---|
| `test/mobile-audit.mjs` | 无依赖 CDP 审计：起静态服务、驱动六个页面、断言并截图 | 新增 |
| `package.json` | 增加 `audit:mobile` 脚本 | 修改 |
| `index.html` | viewport meta 增加 `viewport-fit=cover` | 修改 |
| `css/style.css` | 新增手机端区块；`:hover` 规则包裹；安全区/触控/字号 | 修改 |
| `js/ui.js` | `combatHTML()` 手牌尺寸与重叠的移动分支 | 修改 |
| `README.md` | 增加手机端说明 | 修改 |
| `docs/screenshots/mobile-audit/` | 适配后截图（`after-*.png`） | 新增 |

---

### Task 1: 审计脚本与失败基线

**Files:**
- Create: `test/mobile-audit.mjs`
- Modify: `package.json`（`"audit:mobile": "node test/mobile-audit.mjs"`）

**Interfaces:**
- 产出：`npm run audit:mobile`，成功退出码 0，失败退出码 1；截图写入 `docs/screenshots/mobile-audit/after-<screen>-393.png`。
- 复用现有公开接口：`WX_UI`（`screen`、`render()`、`beginRun()`、`hasRun`）、`WXEngine`（`startCombat`、`rollCardChoices`、`generateShop`）。

- [ ] **Step 1: 写审计脚本**

脚本包含四部分：

1. **静态服务**：`node:http` 读取仓库根目录，`index.html` 默认 `text/html`，CSS/JS 按扩展名设置 MIME，端口 `0` 自动分配。
2. **Chrome 启动**：`CHROME_BIN` 或 macOS 默认路径；`--headless=new --no-sandbox --remote-debugging-port=9333 --user-data-dir=<mkdtemp>`；轮询 `http://127.0.0.1:9333/json/list` 直到拿到 `type === 'page'`。
3. **CDP 驱动**：`Emulation.setDeviceMetricsOverride`（宽、高、DPR 3、`mobile:false`、`scale:1`）、`setTouchEmulationEnabled`、iPhone UA；`Runtime.evaluate` 驱动页面；`Page.captureScreenshot` 落盘。
4. **断言**（每个页面、两种尺寸）：
   - `document.documentElement.scrollWidth <= innerWidth + 1`；
   - 可见 `[data-action]` 的 `width >= 44 || height >= 44`；
   - 地图：`.hud-actions` 的 `right <= innerWidth + 1`；
   - 战斗：`.end-turn` 与 `.hand-zone` 矩形不相交；
   - 战斗：`.hand .card-text` 计算字号 `>= 11`。

页面驱动顺序：

```js
// 标题 → 选人 → 地图 → 战斗 → 奖励 → 商店
await evalJs("WX_UI.screen='select'; WX_UI.render(); 1");
await evalJs("localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun(); WX_UI.hasRun=false; 1");
await evalJs("const st=WX_UI.state; WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); WX_UI.screen='combat'; WX_UI.render(); 1");
await evalJs(`(() => {
  const st = WX_UI.state;
  st.combat = null;
  st.reward = { kind:'combat', gold:15, cards: WXEngine.rollCardChoices(st,3,0,false), relicId:null, potionId:null, cardTaken:false, selected:-1, potionFull:false };
  WX_UI.screen = 'reward'; WX_UI.render(); return 1;
})()`);
await evalJs("WXEngine.generateShop(WX_UI.state); WX_UI.screen='shop'; WX_UI.render(); 1");
```

- [ ] **Step 2: 运行确认失败（RED）**

Run: `npm run audit:mobile`
Expected: 退出码 1；失败项至少包含地图 `scrollWidth 566 > 393`、`.hud-actions` 出屏、战斗结束回合与手牌相交、若干触控目标 <44。

- [ ] **Step 3: 不在红色状态提交**

脚本保留在工作区，与 Task 2–5 的实现一起在绿色后提交。

---

### Task 2: 全局触控与 iOS 基础

**Files:**
- Modify: `index.html:5`
- Modify: `css/style.css`（文件末尾新增区块；`:hover` 规则包裹）

**Interfaces:**
- 产出：所有页面继承安全区、`svh/dvh`、44px 触控目标与触屏按压反馈。

- [ ] **Step 1: viewport 增加 `viewport-fit=cover`**

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

- [ ] **Step 2: 包裹所有 `:hover` 规则**

把现有 15 条单行 `:hover` 规则（`.btn`、`.btn-primary`、`.btn-ghost`、`.char-card`、`.map-node.available`、`.pile-btn`、`.potion-btn.filled`、`.card.in-hand`、`.card.in-hand.disabled`、`.card.selectable`、`.rest-choice`、`.event-choice`、`.comp-tab`、`.settings-row`、`.settings-row.static`）整体移入：

```css
@media (hover: hover) and (pointer: fine) { /* 原 15 条悬停规则 */ }
```

- [ ] **Step 3: 手机端基础规则**

```css
@media (max-width: 600px) {
  html { -webkit-text-size-adjust: 100%; }
  body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
  .screen {
    padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
             max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  }
  .btn, .btn-sm, .btn-xs { min-height: 44px; touch-action: manipulation; }
  .btn:active, .char-card:active, .map-node:active { transform: scale(0.98); }
  .card.in-hand.selected { transform: translateY(-8px) scale(1.02); }
  .toast { bottom: calc(24px + env(safe-area-inset-bottom)); }
  .overlay { padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom)); }
}
```

- [ ] **Step 4: 验证**

Run: `npm run audit:mobile`
Expected: 标题/选人页面通过；地图/战斗仍失败（正常，后续任务处理）。

---

### Task 3: 战斗页重排

**Files:**
- Modify: `js/ui.js:990-996`（`combatHTML()` 的 `cardW/avail/overlap`）
- Modify: `css/style.css`（手机端战斗区块）

**Interfaces:**
- 消费：Task 2 的手机断点与触控基础。
- 产出：`.hand-zone` 内三段式布局（工具行 / 手牌 / 结束回合），手牌 116×162 横向滚动。

- [ ] **Step 1: 手牌计算增加移动分支**

```js
const mobile = window.innerWidth <= 600;
const compactH = window.innerHeight <= 780;
const compactW = window.innerWidth <= 1060;
const cardW = mobile ? 116 : (compactH || compactW) ? 132 : (window.innerWidth <= 1200 ? 138 : 152);
const avail = mobile ? window.innerWidth : Math.max(320, window.innerWidth - 380);
const overlap = !mobile && n > 1 && n * cardW > avail
  ? Math.min(96, Math.ceil((n * cardW - avail) / (n - 1))) : 0;
```

- [ ] **Step 2: 战斗页 CSS**

```css
@media (max-width: 600px) {
  .combat-screen { height: auto; min-height: 100vh; min-height: 100svh; overflow: visible; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
  .combat-top { gap: 8px; padding: 0 2px 4px; }
  .turn-tag { font-size: 12px; padding: 2px 9px; }
  .combat-act { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .combat-top .hud-actions { gap: 6px; }
  .combat-top .btn { width: 44px; padding: 0; font-size: 11px; }

  .enemy-zone { min-height: 190px; padding: 0 4px; gap: 10px; flex: 0 0 auto; }
  .enemy-unit { width: 300px; padding-top: 40px; }
  .enemy-zone.multi { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; scroll-snap-type: x mandatory; }
  .enemy-zone.multi .enemy-unit { width: 165px; scroll-snap-align: center; }
  .intent { min-width: 130px; font-size: 11px; }
  .intent-detail { font-size: 10px; }
  .enemy-art { height: 48px; font-size: 34px; }
  .enemy-name { font-size: 15px; }

  .battle-mid { display: grid; grid-template-columns: minmax(0,1fr) auto; grid-template-areas: "player player" "chain energy"; gap: 8px; padding: 6px 0 4px; }
  .player-panel { grid-area: player; width: 100%; padding: 6px 10px; gap: 8px; }
  .player-portrait { width: 40px; height: 40px; flex-basis: 40px; font-size: 20px; }
  .player-name { font-size: 14px; }
  .player-sub { min-height: 16px; }
  .relic-strip { gap: 4px; }
  .chain-panel { grid-area: chain; padding: 4px 8px; gap: 8px; max-width: none; }
  .chain-elem { width: 32px; height: 32px; font-size: 15px; }
  .chain-flow { gap: 4px; }
  .chain-hint { font-size: 10px; }
  .energy-box { grid-area: energy; width: 44px; }
  .energy-orb { width: 42px; height: 42px; }
  .energy-orb b { font-size: 18px; }
  .energy-label { display: none; }

  .hand-zone { display: flex; flex-direction: column; align-items: stretch; gap: 4px; min-height: 0; padding-bottom: 0; position: relative; }
  .left-tray { position: static; order: 1; flex-direction: row; width: 100%; justify-content: space-between; align-items: center; gap: 8px; }
  .left-tray .potions { gap: 6px; }
  .left-tray .piles { gap: 6px; }
  .potion-btn { width: 44px; height: 44px; }
  .pile-btn { width: 48px; height: 56px; }
  .hand-area { order: 2; padding: 0; width: 100%; }
  .hand { min-height: 0; padding: 24px 2px 4px; justify-content: flex-start; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; }
  .hand::-webkit-scrollbar { display: none; }
  .hand .card { width: 116px; height: 162px; scroll-snap-align: center; }
  .hand .card-art { height: 46px; margin: 4px 0 3px; }
  .hand .card-watermark { font-size: 32px; }
  .hand .card-name { font-size: 13px; }
  .hand .card-text { font-size: 11px; line-height: 1.35; }
  .hand .card-type { font-size: 8px; }
  .hand .card-foot { font-size: 8px; }
  .combat-actions { position: static; order: 3; width: 100%; }
  .end-turn { width: 100%; height: 52px; font-size: 15px; justify-content: center; }
  .combat-hint { font-size: 11px; min-height: 18px; padding: 4px 2px 2px; }
  .combat-hint .key-hint { display: none; }
}
```

- [ ] **Step 3: 验证**

Run: `npm run audit:mobile`
Expected: 战斗页四项断言通过（无横向溢出、结束回合与手牌不相交、字号 ≥11、目标 ≥44）；地图仍失败。

---

### Task 4: 地图页重排

**Files:**
- Modify: `css/style.css`（手机端地图区块）

- [ ] **Step 1: HUD 两行网格 + 侧栏瘦身 + 画布自适应**

```css
@media (max-width: 600px) {
  .hud { display: grid; grid-template-columns: minmax(0,1fr) auto auto;
         grid-template-areas: "char gold asc" "hp hp actions";
         gap: 6px 10px; padding: 8px 10px; margin-bottom: 10px; }
  .hud-char { grid-area: char; min-width: 0; }
  .hud-hp { grid-area: hp; width: 100%; }
  .gold-pill { grid-area: gold; align-self: center; }
  .hud-asc { grid-area: asc; align-self: center; }
  .hud-actions { grid-area: actions; margin-left: 0; gap: 6px; }
  .hud-actions .btn { width: 44px; padding: 0; font-size: 11px; }

  .map-layout { grid-template-columns: 1fr; gap: 8px; }
  .map-side { position: static; display: grid; grid-template-columns: minmax(0,1fr) auto;
              gap: 6px 10px; padding: 10px 12px; }
  .map-side h2 { font-size: 18px; }
  .act-flavor, .map-legend, .map-actions, .map-tip { display: none; }
  .map-potions { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
  .map-boss { padding: 6px 8px; }
  .map-scroll { max-height: calc(100svh - 230px); }
  .map-canvas { min-width: 0; }
  .map-node { width: 64px; height: 64px; }
  .map-node.boss { width: 80px; height: 80px; }
  .map-node .node-glyph { font-size: 21px; }
  .node-label { font-size: 11px; }
}
```

- [ ] **Step 2: 验证**

Run: `npm run audit:mobile`
Expected: 地图断言通过；六类页面在两种尺寸下全部 PASS。

---

### Task 5: 其余页面、桌面回归与文档

**Files:**
- Modify: `css/style.css`（奖励/商店/覆盖层/结算/图鉴）
- Modify: `README.md`
- Create: 适配后截图（由审计脚本生成）

- [ ] **Step 1: 奖励与商店**

```css
@media (max-width: 600px) {
  .panel { padding: 16px 14px; }
  .panel h1 { font-size: 24px; }
  .card-choice-row { gap: 8px; }
  .card-choice-row .card { width: 104px; height: 146px; }
  .card-choice-row .card-art { height: 40px; }
  .card-choice-row .card-text { font-size: 10.5px; line-height: 1.3; }
  .card-choice-row .card-name { font-size: 12px; }
  .choice-slot { min-width: 0; }
  .choice-btn { min-height: 44px; font-size: 12px; padding: 6px 4px; }
  .shop-cards { gap: 10px; }
  .shop-card .card { width: 132px; height: 186px; }
  .shop-buy { gap: 6px; }
  .shop-buy .btn { min-height: 44px; }
  .shop-relic, .shop-potion, .shop-remove { flex-wrap: wrap; }
  .shop-relic .btn, .shop-potion .btn, .shop-remove .btn { min-height: 44px; }
  .rest-choices { gap: 10px; }
  .rest-choice { padding: 14px; }
  .event-choice { min-height: 48px; }
  .end-actions { flex-direction: column; width: 100%; max-width: 280px; }
  .end-stats { gap: 16px; padding: 12px 16px; }
}
```

- [ ] **Step 2: 覆盖层与图鉴**

```css
@media (max-width: 600px) {
  .overlay-panel { width: 100%; max-height: 92svh; }
  .overlay-head { padding: 10px 14px; }
  .overlay-head .btn { min-height: 44px; }
  .overlay-body { padding: 12px 14px 16px; }
  .overlay-card-grid { gap: 10px; }
  .overlay-card-grid .card { width: 132px; height: 186px; }
  .comp-tabs { overflow-x: auto; padding-bottom: 4px; }
  .comp-tab { flex: 0 0 auto; min-height: 44px; }
  .comp-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .comp-body { max-height: calc(100svh - 230px); }
  .settings-row { min-height: 48px; }
  .help-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 桌面回归（矩形对比）**

Run（实现前/后各一次，1280×800）：

```js
// 通过 CDP 在标题/地图/战斗/奖励各页读取以下选择器矩形
['.hud', '.map-layout', '.hand-zone', '.enemy-zone', '.battle-mid', '.card-choice-row', '.panel']
```

Expected: 两次 JSON 完全一致（`JSON.stringify` 相等）。

- [ ] **Step 4: 全量验证**

Run: `npm run audit:mobile`
Expected: 六类页面 × 两种尺寸全部 PASS，退出码 0。

Run: `npm test`
Expected: 31 项全部通过。

- [ ] **Step 5: README 增加手机端说明**

```md
## 手机端

已适配 iPhone 15 Pro（393×852）等竖屏手机：

- 战斗页手牌横向滑动，结束回合独立成行，不再遮挡手牌；
- 地图页 HUD 折成两行，牌组/遗物/设置始终可点；
- 支持安全区、动态视口高度与触屏按压反馈。

横屏未做专属布局，建议竖屏游玩。
```

- [ ] **Step 6: 提交**

```bash
git add index.html css/style.css js/ui.js test/mobile-audit.mjs package.json README.md docs/screenshots/mobile-audit
git commit -m "feat: 适配 iPhone 竖屏布局"
```

---

## Self-Review

- 规格第 6/7/8/9 节分别对应 Task 3/4/5/2；第 11 节验收由 Task 1 的脚本与 Task 5 的桌面对比覆盖。
- 规格要求的"手牌 116×162、不重叠"由 Task 3 的 JS + CSS 同时保证，避免内联 `margin-left` 冲突。
- 规格第 10 节"不改 DOM 顺序"：Task 3 仅用 flex `order`，Task 4 仅用 grid 区域，未移动节点。
- 无 TBD/TODO；所有验证命令与预期结果明确。
