# 《五行问道》实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一款可直接在浏览器打开的完整 Roguelike 卡牌游戏《五行问道》，三幕、三角色、五行连携战斗、随机地图、遗物/丹药/事件、存档与天劫难度。

**Architecture:** 经典脚本分层：`data.js` 静态内容，`engine.js` 纯逻辑（UMD，Node 可测），`ui.js` 渲染/动画/音效，`main.js` 启动与自动存档，`style.css` 水墨风格。引擎不碰 DOM，所有规则通过纯函数与可序列化 state 完成。

**Tech Stack:** 原生 HTML/CSS/JavaScript（ES2020），Node 24 内置 `node:test`，Chrome headless 截图验收；零运行时依赖。

## Global Constraints

- 仅简体中文 UI。
- 零外部资源：不加载网络字体、图片、音频；图标用文字/CSS/SVG。
- 必须支持 `file://` 直接打开（不得使用 ES module `import`）。
- 存档键：`wuxing_run_v1`、`wuxing_meta_v1`；每次状态变化后写入。
- 引擎随机数必须来自可序列化种子，刷新后继续不改变结果。
- 目标分辨率 1280×800，最低 1024×700 可完整操作。
- 所有玩家可见文案使用中文；控制台不得报错。
- 卡牌/遗物/敌人/事件数据必须通过 id 引用，禁止在 UI 中硬编码规则。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架、屏幕容器、脚本加载顺序 |
| `css/style.css` | 全部视觉、卡牌、地图、动画、响应式 |
| `js/data.js` | 五行、状态、角色、卡牌、遗物、丹药、敌人、遭遇、事件、Boss |
| `js/engine.js` | 战斗、连携、状态、AI、地图、奖励、商店、事件、存档序列化 |
| `js/ui.js` | 屏幕渲染、卡牌交互、动画、音效、覆盖层 |
| `js/main.js` | 启动、读档、事件绑定、自动保存、全局快捷键 |
| `test/engine.test.js` | 规则单测 |
| `test/sim.js` | 自动模拟对局 |
| `README.md` | 玩法说明与运行方式 |

---

### Task 1: 工程骨架与可测试环境

**Files:** Create `index.html`, `css/style.css`, `js/data.js`, `js/engine.js`, `js/ui.js`, `js/main.js`, `test/engine.test.js`, `test/sim.js`, `package.json`（仅 test 脚本）

**Interfaces:**
- `data.js` 导出（Node）并挂载 `globalThis.WX_DATA`（浏览器）。
- `engine.js` 导出 `WXEngine`，浏览器挂 `globalThis.WXEngine`。
- `engine.js` 依赖 `data.js`（Node `require('./data.js')`；浏览器全局）。

- [ ] 写 `package.json`：`{"scripts":{"test":"node --test test/engine.test.js","sim":"node test/sim.js"}}`。
- [ ] 写 UMD 包装与空数据表，`node -e "require('./js/engine.js')"` 通过。
- [ ] 写首个失败测试：`createRun` 返回 3 个角色可选、初始金币 99。
- [ ] 实现 `createRun` 与角色数据。
- [ ] `npm test` 通过并提交。

### Task 2: 元素、状态与卡牌数据

**Files:** Modify `js/data.js`, `test/engine.test.js`

**Interfaces:**
- `DATA.elements = {wood,fire,earth,metal,water,none}`，每项 `{id,name,color,glyph,generates,overcomes}`。
- `DATA.statuses`：`poison,burn,weak,vulnerable,strength,dexterity,regen,thorns,ritual,stun`，含 `{name,debuff,decay,desc}`。
- 卡牌对象：`{id,name,element,cost,type,rarity,text,upText,effects,exhaust,retain,temp,character}`。
- 卡牌实例：`{uid,id,up,temp}`。
- 至少 60 张非诅咒牌、3 张诅咒，全部非诅咒牌有升级数据。

- [ ] 测试：所有 id 唯一；元素引用合法；升级后费用/效果与文本存在。
- [ ] 写五行表、状态表、40 张基础牌 + 9 张角色牌 + 通用稀有牌 + 3 诅咒。
- [ ] 写 `DATA.relics`（≥18）、`DATA.potions`（8）、`DATA.curses`（3）。
- [ ] 测试：遗物/丹药 id 合法，卡牌奖励池可构造。
- [ ] 提交。

### Task 3: 战斗骨架与回合

**Files:** Modify `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `createRun({characterId, ascension})`
- `startCombat(state, enemySpecs)`：`enemySpecs=[{id, hpScale}]`；初始化手牌/抽牌堆/弃牌堆。
- `playCard(state, handIndex, targetIndex)` → `{ok, events}`。
- `endPlayerTurn(state)` → 结算灼烧/回春/弃手，`phase='enemy'`。
- `runEnemyTurn(state)` → 敌人行动并开启新玩家回合。
- `getPreview(state, handIndex, targetIndex)` → `{damage, block, cross, lines}`。
- `state.combat = {turn, energy, maxEnergy, block, statuses, hand, drawPile, discardPile, exhaustPile, enemies, currentElement, chain, phase, cardsPlayedThisTurn}`。

- [ ] 测试：初始抽 5、3 灵气、打出 1 费牌后剩 2、结束回合弃手、敌人扣血。
- [ ] 实现抽/洗/弃、灵气、出牌校验、结束回合、敌人攻击与死亡。
- [ ] 测试：敌人全灭进入 `won`，玩家死亡进入 `lost`。
- [ ] 提交。

### Task 4: 五行连携、周天、相克

**Files:** Modify `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `advanceChain(state, element)` → `{chain, currentElement, linked, zhoutian}`。
- 连携加成只作用于卡牌的 `damage/block` 效果。
- 周天：全体 8 点无视护甲伤害、+1 灵气、抽 1、连携清零。
- 相克：伤害 ×1.5、无视护甲；多目标分别判定。

- [ ] 测试：金→水 +1；金→木归零；无元素不改变；连携 5 触发周天并清零；相克 ×1.5 且穿甲。
- [ ] 实现 `advanceChain`、伤害倍率、`resolveEffects` 的连携注入。
- [ ] `getPreview` 反映连携/相克后的数值。
- [ ] 提交。

### Task 5: 状态与效果全集

**Files:** Modify `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `applyStatus(state, target, status, amount)`
- `dealDamage(state, source, target, amount, opts)`
- 支持 op：`damage, damageAll, block, draw, energy, heal, status, statusAll, multiplyStatus, cleanse, addCard, loseHp, gainMaxHp, upgradeHand, discardRandom, chain`。
- 状态时机：中毒/蓄势于回合开始，灼烧/回春于回合结束，虚弱/易伤于拥有者回合结束递减。

- [ ] 测试：中毒无视护甲并递减；灼烧结算；虚弱 ×0.75；易伤 ×1.5；体修保留 4 甲；丹修中毒 +1；剑修首张攻击 +3。
- [ ] 实现状态结算、角色被动、多段攻击与荆棘。
- [ ] 提交。

### Task 6: 敌人 AI、遭遇与 Boss

**Files:** Modify `js/data.js`, `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- 敌人：`{id,name,element,hp,moves,pattern,phase2?,rotateElement?,actionsPerTurn?}`。
- `moves`：`{id,name,intent,damage,hits,block,statuses,selfStatuses,addCards,heal,log}`。
- `DATA.encounters = {1:{normal:[...],elite:[...],boss:'...'},...}`。
- 敌人实例：`{uid,id,name,element,hp,maxHp,block,statuses,intent,patternIndex,phase}`。
- 天劫缩放：HP ×(1+0.10N)，伤害 ×(1+0.06N)。

- [ ] 测试：意图与 pattern 循环；半血切阶段；Boss 转元素；天劫缩放。
- [ ] 写 20 个普通敌人、3 精英、3 Boss、三幕遭遇表。
- [ ] 实现意图预览、阶段转换、多动、添加状态牌。
- [ ] 提交。

### Task 7: 卡牌内容、奖励与升级

**Files:** Modify `js/data.js`, `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `rollCardRewards(state, rarityBoost=0, count=3)`。
- `addCardToDeck(state, cardId, upgraded)`。
- `upgradeCard(state, uid)`。
- `cardText(card, up)`。

- [ ] 测试：奖励不重复、稀有度权重、升级只作用一次、牌组增减。
- [ ] 补齐 60+ 卡牌与角色签名卡。
- [ ] 提交。

### Task 8: 地图生成与运行流程

**Files:** Modify `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `generateMap(state, act)` → `{act,nodes,rows,start,boss}`；节点 `{id,row,col,type,next,data}`。
- `availableNodes(state)`。
- `enterNode(state,nodeId)` → 设置 screen/content，生成遭遇/商店/事件并写入 state。
- `completeNode(state)`、`nextAct(state)`。
- 三幕，每幕 8 层 + Boss；起点 3 战斗；第 4 层含宝箱；第 7 层休整。

- [ ] 测试：每条路径连通 Boss、节点类型合法、三幕均可生成 100 次、起点可达。
- [ ] 实现分层生成、类型约束、路径连线、节点数据生成。
- [ ] 提交。

### Task 9: 遗物、丹药、商店、休整、事件

**Files:** Modify `js/data.js`, `js/engine.js`, `test/engine.test.js`

**Interfaces:**
- `triggerRelic(state,hook,payload)`。
- `usePotion(state,index,targetIndex)`。
- `getShopStock(state)`、`buyItem(state,kind,index)`、`buyRemove(state,uid)`。
- `restHeal(state)`、`restUpgrade(state,uid)`。
- `applyEventChoice(state,eventId,choiceIndex)` → `{events, needsCardPick}`。
- 事件/商店库存进入节点时生成并存档。

- [ ] 测试：遗物触发一次、商店扣款与库存、丹药消耗、休整治疗/升级、事件效果。
- [ ] 实现 18 遗物 hooks、8 丹药、商店、休整、12 事件。
- [ ] 提交。

### Task 10: 存档、天劫与元数据

**Files:** Modify `js/engine.js`, `js/main.js`, `test/engine.test.js`

**Interfaces:**
- `serialize(state)`/`deserialize(json)`。
- `saveRun(state)`/`loadRun()`/`clearRun()`。
- `loadMeta()`/`saveMeta(meta)`/`recordSeen(state)`。
- 通关解锁 `meta.maxAscension = max(current, ascension+1)`（上限 10）。

- [ ] 测试：往返序列化后战斗/地图/牌组一致；刷新后可继续；天劫奖励。
- [ ] 实现 localStorage 读写与容错（损坏存档回退标题）。
- [ ] 提交。

### Task 11: 页面骨架、标题与角色选择

**Files:** Create/modify `index.html`, `css/style.css`, `js/ui.js`, `js/main.js`

**Interfaces:**
- `UI.showScreen(name)`、`UI.render()`。
- 全局样式变量：`--ink,--paper,--wood,--fire,--earth,--metal,--water`。
- 屏幕容器：`#screen-title/#screen-select/#screen-map/#screen-combat/...`。

- [ ] 写水墨背景、标题、按钮、角色卡、天劫选择、图鉴入口。
- [ ] 开始新局/继续按钮正确读写存档。
- [ ] Chrome headless 截图确认无溢出。
- [ ] 提交。

### Task 12: 地图界面

**Files:** Modify `css/style.css`, `js/ui.js`

**Interfaces:**
- `renderMap()`：SVG 连线 + 节点按钮；`data-node-id`。
- 顶栏：生命、金币、天劫、遗物、牌组、设置。
- 节点图标：战/精/事/商/息/宝/BOSS。

- [ ] 实现地图布局、可达高亮、当前节点标记、点击进入。
- [ ] 牌组/遗物覆盖层。
- [ ] 提交。

### Task 13: 战斗界面与交互

**Files:** Modify `css/style.css`, `js/ui.js`, `js/main.js`

**Interfaces:**
- `renderCombat()`：敌人区、五行轮盘、连携、手牌、灵气、丹药、抽弃堆、结束回合。
- `UI.playCard(handIndex)`、`UI.selectTarget(index)`、`UI.endTurn()`、`UI.usePotion(index)`。
- 卡面预览由 `getPreview` 驱动。
- 键盘 1–9、E、Esc。

- [ ] 实现敌人意图、状态 tooltip、手牌扇形、悬停放大、目标选择。
- [ ] 接入 `playCard/endPlayerTurn/runEnemyTurn` 与动画队列。
- [ ] 提交。

### Task 14: 动画、音效与战斗表现

**Files:** Modify `css/style.css`, `js/ui.js`

**Interfaces:**
- `UI.animateEvents(events)` 异步串行；`UI.sfx(name)`。
- 事件：`damage/block/status/draw/play/chain/zhoutian/death/phase`。

- [ ] 出牌飞行、伤害飘字、受击抖动、格挡闪光、连携脉冲、周天波纹、Boss 阶段横幅。
- [ ] WebAudio 合成 8 种音效，静音设置持久化。
- [ ] 提交。

### Task 15: 奖励、商店、休整、事件、宝箱界面

**Files:** Modify `css/style.css`, `js/ui.js`

**Interfaces:**
- `renderReward()`、`renderShop()`、`renderRest()`、`renderEvent()`、`renderTreasure()`。
- 卡牌选择/跳过、遗物展示、丹药替换、删牌/升级选牌覆盖层。

- [ ] 实现全部节点界面与返回地图流程。
- [ ] 卡牌选择覆盖层复用（升级/删除/事件）。
- [ ] 提交。

### Task 16: 结算、图鉴与打磨

**Files:** Modify `js/ui.js`, `js/main.js`, `css/style.css`

- [ ] 失败/胜利界面、统计、重开、天劫解锁提示。
- [ ] 图鉴三页与已见记录。
- [ ] 响应式检查 1024×700；关键按钮可见。
- [ ] 控制台零报错。
- [ ] 提交。

### Task 17: 平衡与验收

**Files:** Modify `test/sim.js`, data, README

- [ ] 随机 AI 模拟 500 局：无异常、无死循环、记录各角色胜率。
- [ ] 根据模拟调整敌人血量/伤害与卡牌数值。
- [ ] Chrome headless 截取标题、选择、地图、战斗四屏，人工检查。
- [ ] 写 README（玩法、快捷键、开发/测试命令）。
- [ ] 最终提交。

---

## 验收命令

```bash
npm test
npm run sim
node -e "JSON.parse(require('fs').readFileSync('js/data.js','utf8'))" # 仅语法占位，不要求 JSON
```

浏览器：

```bash
open index.html
```

Chrome headless 截图：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --window-size=1280,800 \
  --screenshot=/tmp/wuxing-title.png \
  "file://$PWD/index.html"
```

## 关键规则常量（实现时不可改动）

- 玩家初始：HP 依角色，金币 99，灵气 3，抽 5，手牌上限 10。
- 连携上限 5；周天：全体 8 伤害、+1 灵气、抽 1。
- 相克倍率 1.5；虚弱 0.75；易伤 1.5。
- 战斗金币 12–20；商店删牌 75 起。
- 天劫：HP +10%/级，伤害 +6%/级，起始诅咒 floor(N/3)。
