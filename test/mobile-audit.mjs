/* 移动端布局审计：无依赖，启动静态服务与 headless Chrome，逐页断言并截图。
   用法：npm run audit:mobile（可用 CHROME_BIN 指定浏览器路径）。 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'screenshots', 'mobile-audit');
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function launchChrome() {
  if (!fs.existsSync(CHROME_BIN)) {
    throw new Error(`找不到 Chrome：${CHROME_BIN}。可设置 CHROME_BIN 指向可执行文件。`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wuxing-audit-'));
  const child = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions',
    '--disable-crash-reporter', '--disable-breakpad', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank'
  ], { stdio: 'ignore' });
  return { child, dir };
}

async function waitForDevTools(dir, timeout = 20000) {
  const file = path.join(dir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fs.existsSync(file)) {
      const [port] = fs.readFileSync(file, 'utf8').split('\n');
      if (port) return Number(port);
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools 端口未就绪');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }
  close() { this.ws.close(); }
}

const CHECK = `(() => {
  const vw = innerWidth, vh = innerHeight;
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && r.bottom > -1 && r.top < vh;
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const actions = [...document.querySelectorAll('[data-action]')].filter(visible);
  const small = actions.filter(el => el.getBoundingClientRect().width < 44 && el.getBoundingClientRect().height < 44)
                       .map(el => ({ action: el.dataset.action, ...rect(el) }));
  const offscreen = actions.filter(el => !el.closest('.hand') && !el.closest('.enemy-zone'))
                           .filter(el => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
                           .map(el => ({ action: el.dataset.action, ...rect(el) }));
  const hand = document.querySelector('.hand');
  const endTurn = document.querySelector('.end-turn');
  const overlap = hand && endTurn ? (() => {
    const a = hand.getBoundingClientRect(), b = endTurn.getBoundingClientRect();
    return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  })() : null;
  const handCard = document.querySelector('.hand .card-text');
  const hudActions = document.querySelector('.hud-actions');
  return {
    vw, vh,
    scrollW: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth > vw + 1,
    small, offscreen,
    endTurnOverlap: overlap,
    handFont: handCard ? parseFloat(getComputedStyle(handCard).fontSize) : null,
    hudActionsRight: hudActions ? hudActions.getBoundingClientRect().right : null,
    screen: window.WX_UI ? WX_UI.screen : null
  };
})()`;

const SCREENS = [
  {
    name: 'title',
    prepare: null
  },
  {
    name: 'select',
    prepare: "(() => { WX_UI.screen='select'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'map',
    prepare: "(() => { localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun(); WX_UI.hasRun=false; WX_UI.screen='map'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'combat',
    prepare: "(() => { const st=WX_UI.state; WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'card-detail',
    combat: true,
    prepare: "(() => { document.querySelector('.hand .card').click(); return 1; })()"
  },
  {
    name: 'earth-card-detail',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state.combat.hand=[{uid:'audit-earth',id:'shan_yue',up:false}]; WX_UI.render(); document.querySelector('.hand .card').click(); return 1; })()"
  },
  {
    name: 'potion-detail',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state.potions=['heal']; WX_UI.render(); document.querySelector('.potion-btn.filled').click(); return 1; })()"
  },
  {
    name: 'status',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state.combat.statuses.poison=2; WX_UI.state.combat.enemies[0].statuses.weak=1; WX_UI.render(); return 1; })()"
  },
  {
    name: 'status-info',
    combat: true,
    prepare: "(() => { document.querySelector('.player-sub .status-chip').click(); return 1; })()"
  },
  {
    name: 'enemy-status-info',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.render(); window.__enemyClicks=0; const original=WX_UI.onEnemyClick; WX_UI.onEnemyClick=()=>{ window.__enemyClicks++; }; document.querySelector('.enemy-sub .status-chip').click(); WX_UI.onEnemyClick=original; return 1; })()"
  },
  {
    name: 'reward',
    prepare: `(() => {
      const st = WX_UI.state;
      WX_UI.overlay = null;
      st.combat = null;
      st.reward = { kind:'combat', gold:15, cards: WXEngine.rollCardChoices(st,3,0,false), relicId:null, potionId:null, cardTaken:false, selected:-1, potionFull:false };
      WX_UI.screen = 'reward'; WX_UI.render(); return 1;
    })()`
  },
  {
    name: 'reward-detail',
    prepare: "(() => { document.querySelector('.reward-option').click(); return 1; })()"
  },
  {
    name: 'upgrade-picker',
    prepare: "(() => { WX_UI.overlay='picker'; WX_UI.picker={mode:'upgrade-rest',title:'选择一张牌参悟'}; WX_UI.state.screen='rest'; WX_UI.screen='rest'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'upgrade-detail',
    prepare: "(() => { document.querySelector('.pick-wrap:not(.ineligible) .card').click(); return 1; })()"
  },
  {
    name: 'shop',
    prepare: "(() => { const st=WX_UI.state; WX_UI.overlay=null; WXEngine.generateShop(st); WX_UI.screen='shop'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'settings',
    combat: true,
    prepare: "(() => { WX_UI.overlay='settings'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'deck',
    combat: true,
    prepare: "(() => { WX_UI.overlay='deck'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'compendium',
    prepare: "(() => { WX_UI.overlay=null; WX_UI.screen='compendium'; WX_UI.compTab='cards'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'characters',
    prepare: "(() => { WX_UI.overlay=null; WX_UI.screen='compendium'; WX_UI.compTab='characters'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'multi',
    combat: true,
    prepare: "(() => { const st=WX_UI.state; WX_UI.overlay=null; WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'},{id:'shan_xiao'},{id:'shan_xiao'}]},'combat'); WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'upgraded-hand',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state.combat.hand=[{uid:'audit-up',id:'bai_cao',up:true}]; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'monster-act2',
    combat: true,
    prepare: "(() => { WX_UI.state.act=2; WXEngine.startCombat(WX_UI.state,{enemies:[{id:'chi_ba'}]},'boss'); WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'monster-act3',
    combat: true,
    prepare: "(() => { WX_UI.state.act=3; WXEngine.startCombat(WX_UI.state,{enemies:[{id:'tai_xu'}]},'boss'); WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'monster-compendium',
    prepare: "(() => { WX_UI.overlay=null; WX_UI.meta.seenEnemies=['shan_xiao','chi_ba','tai_xu']; WX_UI.screen='compendium'; WX_UI.compTab='enemies'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'monster-detail',
    prepare: "(() => { WX_UI.detail={kind:'enemy',id:'tai_xu'}; WX_UI.overlay='detail'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'alchemist-resource',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state=WXEngine.createRun({characterId:'alchemist',seed:71}); WXEngine.startCombat(WX_UI.state,{enemies:[{id:'shan_xiao'}]},'combat'); WX_UI.state.combat.characterResource.value=8; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'monk-resource',
    combat: true,
    prepare: "(() => { WX_UI.overlay=null; WX_UI.state=WXEngine.createRun({characterId:'monk',seed:71}); WXEngine.startCombat(WX_UI.state,{enemies:[{id:'shan_xiao'}]},'combat'); WX_UI.state.combat.characterResource.value=10; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'formed-sword',
    combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); for(let i=0;i<4;i++) WXEngine.addCardToDeck(st,'ning_feng'); WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); st.combat.characterResource.value=10; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'formed-alchemist',
    combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'alchemist',seed:71}); for(let i=0;i<4;i++) WXEngine.addCardToDeck(st,'shi_gu_dan'); WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); st.combat.enemies[0].statuses.poison=24; st.combat.characterResource.value=8; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'formed-monk',
    combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'monk',seed:71}); for(let i=0;i<4;i++) WXEngine.addCardToDeck(st,'zhen_yue_zhuang'); WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); st.combat.block=40; st.combat.characterResource.value=10; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'dao-record',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); for(let i=0;i<4;i++) WXEngine.addCardToDeck(st,'ning_feng'); st.dao.blessings.sword_intent=2; st.dao.blessings.sword_chain=1; st.victory=true; st.screen='victory'; st.highlights.maxSingleHit=76; st.highlights.maxTurnDamage=94; WX_UI.state=st; WX_UI.screen='victory'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'dao-ding',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); st.reward={kind:'boss',cards:[],cardTaken:true,selected:-1}; WXEngine.continueReward(st); WX_UI.state=st; WX_UI.screen='dao'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'dao-wu',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'alchemist',seed:71}); st.reward={kind:'boss',cards:[],cardTaken:true,selected:-1}; WXEngine.continueReward(st); WXEngine.chooseDaoBlessing(st,'poison'); WXEngine.continueDao(st); st.reward={kind:'boss',cards:[],cardTaken:true,selected:-1}; WXEngine.continueReward(st); for(let i=0;i<4;i++) WXEngine.addCardToDeck(st,'shi_gu_dan'); WX_UI.state=st; WX_UI.screen='dao'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'dao-chosen',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); st.reward={kind:'boss',cards:[],cardTaken:true,selected:-1}; WXEngine.continueReward(st); WXEngine.chooseDaoBlessing(st,'sword_intent'); WX_UI.state=st; WX_UI.screen='dao'; WX_UI.daoRevealing=false; WX_UI.render(); return 1; })()"
  },
  {
    name: 'fate-select',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'alchemist',seed:71}); st.fate.triggered=true; st.fate.pending={choices:['fate_alchemy_furnace','fate_five_elements_book'],selected:null}; st.screen='fate'; WX_UI.state=st; WX_UI.screen='fate'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'fate-chosen',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'alchemist',seed:71}); st.fate.triggered=true; st.fate.pending={choices:['fate_alchemy_furnace','fate_five_elements_book'],selected:null}; st.screen='fate'; WXEngine.chooseFate(st,'fate_alchemy_furnace'); WX_UI.state=st; WX_UI.screen='fate'; WX_UI.fateRevealing=false; WX_UI.render(); return 1; })()"
  },
  {
    name: 'fate-hud', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); st.fate.itemId='fate_sword_box'; st.fate.triggered=true; st.fate.resolved=true; st.relics.push('fate_sword_box'); WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'}]},'combat'); WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'fate-collection',
    prepare: "(() => { WX_UI.meta.seenRelics=['fate_sword_box']; WX_UI.screen='compendium'; WX_UI.compTab='fate'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'fate-record',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); st.fate.itemId='fate_sword_box'; st.fate.triggered=true; st.fate.resolved=true; st.relics.push('fate_sword_box'); st.victory=true; st.screen='victory'; WX_UI.state=st; WX_UI.screen='victory'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'elite-execution', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'jin_jia_shi_jiang'}]},'elite'); const e=st.combat.enemies[0]; e.special.corpseEnergy=2; e.intent='execute'; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'elite-vines', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'shi_ling_teng_mu'}]},'elite'); st.combat.hand.push({uid:'audit-vine',id:'ji_sheng_teng_zhong',up:false,temp:true}); WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'elite-tide', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'xuan_shui_jiao_wang'}]},'elite'); const e=st.combat.enemies[0]; e.special.tide=2; e.intent='abyss'; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'boss-mountain', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'shan_gui'}]},'boss'); const e=st.combat.enemies[0]; e.special.mountainMight=2; e.intent='collapse'; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'boss-inferno', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'chi_ba'}]},'boss'); const e=st.combat.enemies[0]; e.special.firePressure=3; e.intent='fentian'; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'boss-taixu', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'tai_xu'}]},'boss'); const e=st.combat.enemies[0]; e.special.arrayBreak=2; e.element='metal'; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'boss-phase2', combat: true,
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); WXEngine.startCombat(st,{enemies:[{id:'chi_ba'}]},'boss'); const e=st.combat.enemies[0]; e.phase=2; e.patternIndex=1; e.intent='huozhong'; e.statuses.strength=2; WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  },
  {
    name: 'boss-intro',
    prepare: "(() => { const st=WXEngine.createRun({characterId:'sword',seed:71}); const opened=WXEngine.startCombat(st,{enemies:[{id:'shan_gui'}]},'boss'); WX_UI.state=st; WX_UI.screen='combat'; WX_UI.render(); const ev=opened.events.find(x=>x.t==='encounterIntro'); void WX_UI.encounterMoment({tier:ev.tier,title:ev.title,name:ev.name,subtitle:ev.subtitle,line:ev.intro,hint:ev.hint,duration:5000}); return 1; })()"
  }
];

const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
];

const failures = [];

function fail(msg) { failures.push(msg); }

async function auditAt(cdp, baseUrl, vp) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height, screenWidth: vp.width, screenHeight: vp.height,
    deviceScaleFactor: 1, mobile: false, scale: 1
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
  await sleep(1500);

  for (const screen of SCREENS) {
    if (screen.prepare) {
      await cdp.eval(screen.prepare);
      await sleep(450);
    }
    const r = await cdp.eval(CHECK);
    const tag = `${screen.name}@${vp.width}`;
    if (r.overflowX) fail(`${tag}: 横向溢出 scrollWidth=${r.scrollW} > ${r.vw}`);
    for (const s of r.small) fail(`${tag}: 触控目标过小 ${s.action} ${Math.round(s.w)}x${Math.round(s.h)}`);
    for (const o of r.offscreen) fail(`${tag}: 操作元素出屏 ${o.action} right=${Math.round(o.right)} > ${r.vw}`);
    if (screen.name === 'map' && r.hudActionsRight != null && r.hudActionsRight > r.vw + 1) {
      fail(`${tag}: HUD 操作区出屏 right=${Math.round(r.hudActionsRight)} > ${r.vw}`);
    }
    if (screen.name === 'select') {
      const hero = await cdp.eval(`(() => {
        const image = document.querySelector('.char-card.selected .char-portrait');
        const button = document.querySelector('.select-mobile-action .start-btn');
        const box = button?.getBoundingClientRect();
        return { loaded: !!image && image.complete && image.naturalWidth > 0,
          startVisible: !!box && box.top >= 0 && box.bottom <= innerHeight,
          selected: document.querySelectorAll('.char-card.selected').length };
      })()`);
      if (!hero.loaded) fail(`${tag}: 已选修士立绘未加载`);
      if (!hero.startVisible) fail(`${tag}: 开始按钮未在首屏完整显示`);
      if (hero.selected !== 1) fail(`${tag}: 已选修士数量异常`);
      const promises = await cdp.eval(`(() => ({ count:document.querySelectorAll('.char-promise').length,
        visible:document.querySelector('.char-card.selected .char-promise')?.getBoundingClientRect().width>0,
        text:[...document.querySelectorAll('.char-promise')].map(el=>el.textContent).join(' ') }))()`);
      if (promises.count !== 3 || !promises.visible || !promises.text.includes('快、连、爆') || !promises.text.includes('养、叠、炸') || !promises.text.includes('扛、蓄、崩')) fail(`${tag}: 角色核心体验不完整`);
      const changed = await cdp.eval(`(() => {
        document.querySelector('.char-card[data-char="alchemist"]')?.click();
        const chosen = document.querySelector('.char-card.selected');
        const label = document.querySelector('.select-mobile-action .start-btn')?.textContent || '';
        document.querySelector('.char-card[data-char="sword"]')?.click();
        return chosen?.dataset.char === 'alchemist' && label.includes('丹修');
      })()`);
      if (!changed) fail(`${tag}: 切换修士后主卡或开始按钮未更新`);
    }
    if (screen.name === 'characters') {
      const portraits = await cdp.eval(`(() => {
        const cards=[...document.querySelectorAll('.comp-character')];
        const images=cards.map(card=>card.querySelector('.comp-character-portrait'));
        return { count:cards.length, loaded:images.every(img=>img?.complete && img.naturalWidth>0),
          clickable:cards.every(card=>card.dataset.action==='inspect-character'),
          inside:cards.every(card=>{const r=card.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),
          artHeight:cards[0]?.querySelector('.comp-character-art')?.getBoundingClientRect().height||0 };
      })()`);
      if (portraits.count !== 3 || !portraits.loaded || !portraits.clickable || !portraits.inside || portraits.artHeight < 110 || portraits.artHeight > 150) {
        fail(`${tag}: 角色图鉴立绘、点击入口或手机布局异常 ${JSON.stringify(portraits)}`);
      }
      const detail = await cdp.eval(`(() => { document.querySelector('.comp-character')?.click();
        return { open:WX_UI.overlay==='detail', name:document.querySelector('.detail-panel')?.textContent||'' }; })()`);
      if (!detail.open || !detail.name.includes('凌霄')) fail(`${tag}: 点击角色图鉴未打开角色详情`);
      await cdp.eval("(() => { WX_UI.closeOverlay(); return 1; })()");
    }
    if (screen.combat) {
      if (r.endTurnOverlap) fail(`${tag}: 结束回合与手牌相交`);
      if (r.handFont != null && r.handFont < 11) fail(`${tag}: 手牌字号 ${r.handFont}px < 11px`);
    }
    if (screen.name === 'alchemist-resource' || screen.name === 'monk-resource') {
      const monk = screen.name === 'monk-resource';
      const resource = await cdp.eval(`(() => {
        const bar=document.querySelector('.resource-${monk ? 'battleMomentum' : 'furnaceFire'}');
        const pips=bar?.querySelector('.character-resource-pips');
        const info=document.querySelector('.player-info');
        const hp=document.querySelector('.player-info .hpbar');
        const br=bar?.getBoundingClientRect(), pr=pips?.getBoundingClientRect(), ir=info?.getBoundingClientRect(), hr=hp?.getBoundingClientRect();
        return { text:bar?.textContent||'', count:pips?.children.length||0,
          within:!!br&&!!pr&&!!ir&&br.left>=ir.left-1&&pr.right<=ir.right+1,
          belowHp:!hr||!!br&&br.top>=hr.bottom-1 };
      })()`);
      if (!resource.text.includes(monk ? '战势 10/10' : '炉火 8/8') || resource.count !== (monk ? 10 : 8) || !resource.within || !resource.belowHp) {
        fail(`${tag}: 角色资源条与头像或生命条重叠、格数不完整 ${JSON.stringify(resource)}`);
      }
    }
    if (screen.name.startsWith('formed-')) {
      const formed = await cdp.eval(`(() => ({ text:document.querySelector('.build-identity')?.textContent||'',
        title:document.querySelector('.build-identity')?.title||'',
        level:document.querySelector('.combat-screen')?.className||'' }))()`);
      if (!formed.text.includes('道 ·') || !formed.title.includes('成势') || !formed.level.includes('path-level-2')) fail(`${tag}: 成型道途反馈缺失`);
    }
    if (screen.name === 'dao-record') {
      const record = await cdp.eval(`(() => ({ title:document.querySelector('.dao-record-title')?.textContent||'',
        deck:document.querySelector('.dao-deck-list')?.children.length||0,
        blessing:document.querySelector('.dao-record-blessings')?.textContent||'',
        button:!!document.querySelector('[data-action="victory-new"]') }))()`);
      if (record.title !== '一剑开天' || record.deck < 10 || !record.button || !record.blessing.includes('剑心通明Ⅱ') || !record.blessing.includes('金水交鸣Ⅰ')) fail(`${tag}: 证道录内容或再入轮回入口缺失`);
    }
    if (screen.name === 'dao-ding' || screen.name === 'dao-wu') {
      const dao = await cdp.eval(`(() => { const cards=[...document.querySelectorAll('.dao-card')];
        const title=document.querySelector('.dao-head h1')?.textContent||'';
        const screen=document.querySelector('.dao-screen');
        return { title, count:cards.length, singleColumn:cards.length===3&&Math.abs(cards[0].getBoundingClientRect().left-cards[1].getBoundingClientRect().left)<2,
          legible:cards.every(card=>{const r=card.getBoundingClientRect();return r.width>250&&r.left>=0&&r.right<=innerWidth&&card.scrollHeight<=card.clientHeight+1;}),
          scrollable:screen?.scrollHeight>=screen?.clientHeight }; })()`);
      if (dao.title !== (screen.name === 'dao-ding' ? '定道' : '悟道') || dao.count !== 3 || !dao.singleColumn || !dao.legible || !dao.scrollable) fail(`${tag}: 道印选择卡布局异常 ${JSON.stringify(dao)}`);
    }
    if (screen.name === 'dao-chosen') {
      const chosen = await cdp.eval(`(() => { const button=document.querySelector('[data-action="continue-dao"]');
        const card=document.querySelector('.dao-card.chosen');
        return { button:!!button&&!button.disabled&&button.getBoundingClientRect().width>=44,
          correct:card?.textContent.includes('抽 1 张牌。')&&!card?.textContent.includes('获得 1 点灵气') }; })()`);
      if (!chosen.button || !chosen.correct) fail(`${tag}: 道印选择后确认入口或已选效果异常 ${JSON.stringify(chosen)}`);
    }
    if (screen.name === 'fate-select') {
      const fate = await cdp.eval(`(() => { const cards=[...document.querySelectorAll('.fate-card')];
        const a=cards[0]?.getBoundingClientRect(),b=cards[1]?.getBoundingClientRect();
        return {count:cards.length,title:document.querySelector('.fate-head h1')?.textContent,
          singleColumn:!!a&&!!b&&Math.abs(a.left-b.left)<2,legible:cards.every(card=>card.scrollHeight<=card.clientHeight+1),
          firstVisible:!!a&&a.bottom<=innerHeight,secondVisible:!!b&&b.top<innerHeight,
          selected:cards.every(card=>card.dataset.action==='choose-fate')}; })()`);
      if (fate.count !== 2 || fate.title !== '天机乍现' || !fate.singleColumn || !fate.legible || !fate.selected || (vp.width >= 390 && (!fate.firstVisible || !fate.secondVisible))) fail(`${tag}: 天命二选一手机布局异常 ${JSON.stringify(fate)}`);
    }
    if (screen.name === 'fate-chosen') {
      const chosen = await cdp.eval(`(() => ({name:document.querySelector('.fate-result')?.textContent||'',
        button:!!document.querySelector('[data-action="continue-fate"]'),faded:!!document.querySelector('.fate-card.faded')}))()`);
      if (!chosen.name.includes('九转丹炉') || !chosen.button || !chosen.faded) fail(`${tag}: 天命选定后缺少确认 ${JSON.stringify(chosen)}`);
    }
    if (screen.name === 'fate-hud') {
      const hud = await cdp.eval(`(() => ({button:!!document.querySelector('[data-action="view-fate"]'),icon:document.querySelector('.fate-info-mobile')?.textContent||''}))()`);
      if (!hud.button || hud.icon !== '✦') fail(`${tag}: 天命 HUD 不可查看 ${JSON.stringify(hud)}`);
    }
    if (screen.name === 'fate-collection') {
      const collection = await cdp.eval(`(() => ({count:document.querySelectorAll('.fate-collection').length,
        hidden:document.querySelectorAll('.fate-collection.locked').length,text:document.querySelector('.comp-fate')?.textContent||''}))()`);
      if (collection.count !== 6 || collection.hidden !== 5 || collection.text.includes('九转丹炉')) fail(`${tag}: 天命图鉴未隐藏未知效果 ${JSON.stringify(collection)}`);
    }
    if (screen.name === 'fate-record' && !await cdp.eval(`!!document.querySelector('.dao-record-fate')?.textContent.includes('无名剑匣')`)) fail(`${tag}: 证道录缺少天命`);
    if (['elite-execution', 'elite-vines', 'elite-tide', 'boss-mountain', 'boss-inferno', 'boss-taixu', 'boss-phase2'].includes(screen.name)) {
      const mechanic = await cdp.eval(`(() => ({className:document.querySelector('.combat-screen')?.className||'',
        meter:document.querySelector('.enemy-mechanic')?.textContent||'',intent:document.querySelector('.intent')?.textContent||'',
        intentBottom:document.querySelector('.intent')?.getBoundingClientRect()?.bottom||0,
        enemyTop:document.querySelector('.enemy-body')?.getBoundingClientRect()?.top||0,
        enemy:document.querySelector('.enemy-body')?.getBoundingClientRect()?.bottom||0,
        mid:document.querySelector('.battle-mid')?.getBoundingClientRect()?.top||0}))()`);
      const expected = {
        'elite-execution':['arena-corpse','尸煞 2/2','攻击 20'],
        'elite-vines':['arena-vines','寄生','藤种'],
        'elite-tide':['arena-tide','潮位 2/3','攻击 25'],
        'boss-mountain':['arena-mountain','山势 2/2','山势强化'],
        'boss-inferno':['arena-inferno','焚势 3/3','焚势爆发'],
        'boss-taixu':['arena-void','破阵 2/3',''],
        'boss-phase2':['arena-inferno','焚势 0/3','播火']
      }[screen.name];
      if (!mechanic.className.includes(expected[0]) || !mechanic.meter.includes(expected[1]) ||
          !(mechanic.intent + mechanic.meter).includes(expected[2]) ||
          mechanic.intentBottom > mechanic.enemyTop - 2 || mechanic.enemy > mechanic.mid + 1) {
        fail(`${tag}: 机制、意图或敌人面板布局异常 ${JSON.stringify(mechanic)}`);
      }
    }
    if (screen.name === 'boss-intro') {
      const intro = await cdp.eval(`(() => { const el=document.querySelector('.encounter-moment-inner');
        const r=el?.getBoundingClientRect(); return { text:el?.innerText||'',left:r?.left,right:r?.right,top:r?.top,bottom:r?.bottom }; })()`);
      if (!intro.text.includes('山鬼·魑') || !intro.text.includes('凡人，也敢踏我山骨？') ||
          !intro.text.includes('打碎地脉护甲') || intro.left < 0 || intro.right > vp.width || intro.top < 0 || intro.bottom > vp.height) {
        fail(`${tag}: Boss 登场文字不完整或出屏 ${JSON.stringify(intro)}`);
      }
    }
    if (screen.name === 'upgraded-hand') {
      const title = await cdp.eval(`(() => { const el=document.querySelector('.hand .card-name');
        return el && { text:el.textContent, full:el.scrollWidth <= el.clientWidth + 1 }; })()`);
      if (!title || title.text !== '百草回春' || !title.full) fail(`${tag}: 升级牌完整牌名不可见`);
    }
    if (screen.name === 'status-info') {
      const info = await cdp.eval(`(() => {
        const panel = document.querySelector('.detail-panel');
        const text = panel && panel.querySelector('.detail-body')?.innerText || '';
        return { open: !!panel, full: text.includes('当前 2 层') && text.includes('无视护甲') };
      })()`);
      if (!info.open || !info.full) fail(`${tag}: 状态详情未显示当前层数和完整说明`);
    }
    if (screen.name === 'earth-card-detail') {
      const badge = await cdp.eval(`(() => {
        const el = document.querySelector('.detail-meta .elem-badge');
        return el && { text:el.textContent, title:el.title, overflow:el.scrollWidth > el.clientWidth + 1 };
      })()`);
      if (!badge || badge.text !== '土' || badge.title !== '土行' || badge.overflow) fail(`${tag}: 土行徽章文字错误或溢出`);
    }
    if (screen.name === 'combat' || screen.name.startsWith('monster-')) {
      const art = await cdp.eval(`(() => {
        const selector = WX_UI.screen === 'combat' ? '.enemy-art img' : WX_UI.overlay === 'detail' ? '.detail-enemy-portrait img' : '.comp-enemy:not(.locked) .comp-enemy-art img';
        const images = [...document.querySelectorAll(selector)];
        const visible = images.filter(img => img.getBoundingClientRect().top < innerHeight && img.getBoundingClientRect().bottom > 0);
        return { count: images.length, loaded: visible.every(img => img.complete && img.naturalWidth > 0),
          fullDetail: WX_UI.overlay !== 'detail' || images.every(img => getComputedStyle(img).objectFit === 'contain'),
          lockedImages: document.querySelectorAll('.comp-enemy.locked img').length,
          lockedGlyphSize: parseFloat(getComputedStyle(document.querySelector('.comp-enemy.locked .comp-enemy-art') || document.body).fontSize) };
      })()`);
      if (!art.count || !art.loaded || !art.fullDetail || art.lockedImages || (screen.name === 'monster-compendium' && art.lockedGlyphSize < 20)) {
        fail(`${tag}: 怪物立绘未正确加载或图鉴泄露未解锁图片`);
      }
    }
    if (screen.name === 'combat') {
      const motion = await cdp.eval(`(() => {
        const enemy=document.querySelector('.enemy-unit');
        const inner=enemy?.querySelector('.enemy-art-motion');
        const image=enemy?.querySelector('.enemy-art-figure');
        const idle=inner && getComputedStyle(inner).animationName;
        const imageAnimation=image && getComputedStyle(image).animationName;
        enemy?.classList.add('hit');
        const hit=enemy && getComputedStyle(enemy).animationName;
        enemy?.classList.remove('hit');
        enemy?.classList.add('dead');
        const dead=inner && getComputedStyle(inner).animationName;
        enemy?.classList.remove('dead');
        return { idle, imageAnimation, hit, dead, focused:!!enemy?.classList.contains('focused') };
      })()`);
      if (motion.idle !== 'enemyIdle' || motion.imageAnimation !== 'none' || !motion.hit.includes('hitShake') || motion.dead !== 'none' || !motion.focused) {
        fail(`${tag}: 怪物呼吸层与受击、死亡或目标高亮冲突 ${JSON.stringify(motion)}`);
      }
    }
    if (screen.name === 'enemy-status-info') {
      const info = await cdp.eval(`(() => ({ enemyClicks:window.__enemyClicks,
        text:document.querySelector('.detail-panel .detail-body')?.innerText || '' }))()`);
      if (info.enemyClicks || !info.text.includes('当前 1 层') || !info.text.includes('伤害降低 25%')) {
        fail(`${tag}: 点击敌人状态时误选目标或未显示状态详情`);
      }
    }
    if (screen.name === 'reward') {
      const options = await cdp.eval(`(() => {
        const rows = [...document.querySelectorAll('.reward-option')];
        return rows.map((row, i) => {
          const box = row.getBoundingClientRect();
          const text = row.querySelector('.reward-option-text');
          const expected = WXEngine.getCardData(WX_UI.state.reward.cards[i]);
          return { x:box.x, y:box.y, right:box.right, width:box.width,
                   complete:!!expected && !!text && text.textContent === expected.text,
                   clipped:!!text && text.scrollHeight > text.clientHeight + 1 };
        });
      })()`);
      if (options.length !== 3) fail(`${tag}: 奖励选项不是三张`);
      for (let i = 0; i < options.length; i++) {
        const o = options[i];
        if (!o.complete || o.clipped) fail(`${tag}: 第 ${i + 1} 张牌效果缺失或被裁剪`);
        if (o.x < -1 || o.right > vp.width + 1) fail(`${tag}: 第 ${i + 1} 张牌超出屏幕`);
        if (i && (o.y <= options[i - 1].y || Math.abs(o.width - options[i - 1].width) > 1)) fail(`${tag}: 奖励卡牌未等宽纵向排列`);
      }
      if (vp.width === 393) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 700, height: vp.height, screenWidth: 700, screenHeight: vp.height,
          deviceScaleFactor: 1, mobile: false, scale: 1
        });
        await sleep(300);
        const wide = await cdp.eval(`(() => ({ cards:document.querySelectorAll('.choice-slot .card').length,
          mobileOptions:document.querySelectorAll('.reward-option').length }))()`);
        if (wide.cards !== 3 || wide.mobileOptions) fail(`${tag}: 扩宽后未切换到桌面奖励布局`);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width, height: vp.height, screenWidth: vp.width, screenHeight: vp.height,
          deviceScaleFactor: 1, mobile: false, scale: 1
        });
        await sleep(300);
        const narrow = await cdp.eval(`(() => document.querySelectorAll('.reward-option').length)()`);
        if (narrow !== 3) fail(`${tag}: 缩回手机宽度后未恢复纵向奖励布局`);
      }
    }
    if (screen.name === 'monster-detail') {
      const panel = await cdp.eval(`(() => {
        const el = document.querySelector('.detail-panel');
        const close = el?.querySelector('[data-action="close-overlay"]');
        if (!el || !close) return null;
        const r = el.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
      })()`);
      if (!panel || panel.left < -1 || panel.right > vp.width + 1 || panel.top < -1 || panel.bottom > vp.height + 1) {
        fail(`${tag}: 怪物详情面板或关闭按钮出屏`);
      }
    }
    if (screen.name.endsWith('-detail') && screen.name !== 'monster-detail') {
      const detail = await cdp.eval(`(() => {
        const panel = document.querySelector('.detail-panel');
        const body = document.querySelector('.detail-body');
        const confirm = document.querySelector('[data-action="confirm-detail"]');
        if (!panel || !body || !confirm) return null;
        const p = panel.getBoundingClientRect(), c = confirm.getBoundingClientRect();
        return { top:p.top, bottom:p.bottom, left:p.left, right:p.right,
                 confirmTop:c.top, confirmBottom:c.bottom,
                 text:body.innerText };
      })()`);
      if (!detail) fail(`${tag}: 详情或确认按钮缺失`);
      else {
        if (detail.top < -1 || detail.bottom > vp.height + 1 || detail.left < -1 || detail.right > vp.width + 1) fail(`${tag}: 详情面板出屏`);
        if (detail.confirmTop < 0 || detail.confirmBottom > vp.height) fail(`${tag}: 确认按钮出屏`);
        if (!detail.text.trim()) fail(`${tag}: 详情内容为空`);
        if (screen.name === 'upgrade-detail' && (!detail.text.includes('升级后') || !detail.text.includes('升级前'))) {
          fail(`${tag}: 参悟详情未显示升级前后效果`);
        }
      }
    }

    if (vp.width === 393 && (!screen.name.endsWith('-detail') || screen.name === 'upgrade-detail' || screen.name === 'earth-card-detail' || screen.name === 'monster-detail') && !screen.name.endsWith('-info')) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(SHOT_DIR, `after-${screen.name}-393.png`), Buffer.from(data, 'base64'));
    }
    console.log(`CHECK ${tag}: screen=${r.screen} scrollW=${r.scrollW} vw=${r.vw} small=${r.small.length} offscreen=${r.offscreen.length}`);
  }
}

async function captureCardShowcase(cdp, baseUrl) {
  const vp = { width: 1280, height: 800 };
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: vp.width, height: vp.height, screenWidth: vp.width, screenHeight: vp.height,
    deviceScaleFactor: 1, mobile: false, scale: 1
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
  await sleep(1500);
  await cdp.eval("(() => { WX_UI.screen = 'select'; WX_UI.render(); return 1; })()");
  await sleep(450);
  const select = await cdp.eval(`(() => {
    const cards = [...document.querySelectorAll('.char-card')];
    const images = [...document.querySelectorAll('.char-portrait')];
    const start = document.querySelector('.start-btn-desktop')?.getBoundingClientRect();
    return { count: cards.length, row: cards.every(card => Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 2),
      loaded: images.every(image => image.complete && image.naturalWidth > 0),
      startVisible: !!start && start.bottom <= innerHeight };
  })()`);
  if (select.count !== 3 || !select.row || !select.loaded || !select.startVisible) fail(`桌面选角立绘、三栏布局或开始按钮异常 ${JSON.stringify(select)}`);
  await sleep(300);
  const selectShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(ROOT, 'docs', 'screenshots', 'select.png'), Buffer.from(selectShot.data, 'base64'));
  console.log('CHECK 选角样板@1280: 三栏立绘与开始按钮');
  const compCharacters = await cdp.eval(`(() => {
    WX_UI.meta = WX_UI.meta || {seenCards:[],seenRelics:[],seenEnemies:[]};
    WX_UI.screen='compendium'; WX_UI.compTab='characters'; WX_UI.render();
    const cards=[...document.querySelectorAll('.comp-character')];
    const images=cards.map(card=>card.querySelector('.comp-character-portrait'));
    return { count:cards.length, loaded:images.every(img=>img?.complete && img.naturalWidth>0),
      row:cards.every(card=>Math.abs(card.getBoundingClientRect().top-cards[0].getBoundingClientRect().top)<2) };
  })()`);
  await sleep(350);
  const loadedCharacters = await cdp.eval(`(() => [...document.querySelectorAll('.comp-character-portrait')].every(img=>img.complete && img.naturalWidth>0))()`);
  if (compCharacters.count !== 3 || !loadedCharacters || !compCharacters.row) fail(`桌面角色图鉴立绘或三栏布局异常 ${JSON.stringify(compCharacters)}`);
  console.log('CHECK 角色图鉴@1280: 三位修士立绘与三栏布局');
  const sample = await cdp.eval(`(() => {
    localStorage.clear(); WX_UI.hasRun = false; WX_UI.beginRun();
    WX_UI.state.deck = [
      { uid:'sample-wood', id:'yin_du', up:false },
      { uid:'sample-fire', id:'chi_yan', up:true },
      { uid:'sample-earth', id:'yan_quan', up:false },
      { uid:'sample-metal', id:'po_jun', up:false },
      { uid:'sample-water', id:'xin_jian', up:false }
    ];
    WX_UI.screen = 'map'; WX_UI.overlay = 'deck'; WX_UI.render();
    return {
      motifs:[...document.querySelectorAll('.overlay-card-grid .card-art-icon')].map(el => el.classList[1]),
      rareBorders:[...document.querySelectorAll('.overlay-card-grid .card.rarity-rare .card-inner')].map(el => getComputedStyle(el).borderTopColor)
    };
  })()`);
  const expected = ['motif-wood', 'motif-fire', 'motif-earth', 'motif-metal', 'motif-water'];
  if (sample.motifs.length !== 5 || expected.some(name => !sample.motifs.includes(name))) fail('五行卡面样板缺失');
  if (sample.rareBorders.length !== 2 || sample.rareBorders[0] === sample.rareBorders[1]) fail('稀有牌未保留五行边框色');
  await sleep(350);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.join(ROOT, 'docs', 'screenshots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'screenshots', 'card-ui-five-elements.png'), Buffer.from(data, 'base64'));
  console.log('CHECK 五行卡面样板@1280: ' + sample.motifs.join(', '));
}

async function auditShortCombat(cdp, baseUrl) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 800, height: 412, screenWidth: 800, screenHeight: 412,
    deviceScaleFactor: 2, mobile: false, scale: 1
  });
  await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
  await sleep(900);
  await cdp.eval(`(() => {
    localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun();
    WXEngine.startCombat(WX_UI.state,{enemies:[{id:'jin_jia_shi_jiang'}]},'elite');
    WX_UI.screen='combat'; WX_UI.render(); return 1;
  })()`);
  await sleep(350);
  const layout = await cdp.eval(`(() => {
    const enemy=document.querySelector('.enemy-unit').getBoundingClientRect();
    const mid=document.querySelector('.battle-mid').getBoundingClientRect();
    const art=document.querySelector('.enemy-art-figure');
    const frame=document.querySelector('.enemy-art').getBoundingClientRect();
    return { enemyBottom:enemy.bottom, midTop:mid.top, enemyLeft:enemy.left, enemyRight:enemy.right,
      fit:getComputedStyle(art).objectFit, loaded:art.complete && art.naturalWidth>0,
      artWidth:frame.width, artHeight:frame.height,
      scrollWidth:document.documentElement.scrollWidth, viewport:innerWidth };
  })()`);
  if (!layout.loaded || layout.fit !== 'contain' || layout.enemyBottom > layout.midTop + 1 ||
      layout.artWidth < 100 || Math.abs(layout.artWidth - layout.artHeight) > 1 ||
      layout.enemyLeft < -1 || layout.enemyRight > layout.viewport + 1 || layout.scrollWidth > layout.viewport + 1) {
    fail(`高缩放短视口战斗怪物图片被裁切或面板重叠 ${JSON.stringify(layout)}`);
  }
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(ROOT, 'docs', 'screenshots', 'monster-short-viewport.png'), Buffer.from(data, 'base64'));
  console.log('CHECK 怪物立绘@800×412（双倍像素）: ' + JSON.stringify(layout));

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1100, height: 550, screenWidth: 1100, screenHeight: 550,
    deviceScaleFactor: 1, mobile: false, scale: 1
  });
  await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
  await sleep(900);
  await cdp.eval(`(() => {
    localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun();
    WXEngine.startCombat(WX_UI.state,{enemies:[{id:'jin_jia_shi_jiang'}]},'elite');
    WX_UI.screen='combat'; WX_UI.render(); return 1;
  })()`);
  const short = await cdp.eval(`(() => ({
    endTurnBottom:document.querySelector('.end-turn').getBoundingClientRect().bottom,
    scrollHeight:document.documentElement.scrollHeight,
    enemyBottom:document.querySelector('.enemy-unit').getBoundingClientRect().bottom,
    midTop:document.querySelector('.battle-mid').getBoundingClientRect().top
  }))()`);
  if (short.endTurnBottom > short.scrollHeight + 1 || short.enemyBottom > short.midTop + 1) {
    fail(`矮屏桌面战斗按钮不可滚动到达或面板重叠 ${JSON.stringify(short)}`);
  }
  console.log('CHECK 怪物战斗@1100×550: ' + JSON.stringify(short));
}

async function auditCombatStage(cdp, baseUrl) {
  const outputDir = path.join(ROOT, 'docs', 'screenshots', 'combat-v2');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [width, height] of [[800, 650], [1280, 720], [1440, 900], [1920, 1080]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, screenWidth: width, screenHeight: height,
      deviceScaleFactor: 1, mobile: false, scale: 1
    });
    await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
    await sleep(900);
    await cdp.eval(`(() => {
      localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun();
      WXEngine.startCombat(WX_UI.state,{enemies:[{id:'shan_gui'}]},'boss');
      WX_UI.screen='combat'; WX_UI.render(); return 1;
    })()`);
    await cdp.eval(`Promise.all([...document.querySelectorAll('.enemy-art-figure,.player-figure img')].map(img => img.decode().catch(() => {})))`);
    await cdp.eval(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await sleep(180);
    const layout = await cdp.eval(`(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const enemy = rect('.enemy-unit'), player = rect('.player-zone'), hand = rect('.hand-zone');
      const enemyBody = rect('.enemy-body'), playerAnchor = rect('.player-anchor');
      const art = document.querySelector('.enemy-art-figure');
      const playerArt = document.querySelector('.player-figure img');
      const subjectsOverlap = enemyBody && playerAnchor && enemyBody.left < playerAnchor.right - 2 &&
        enemyBody.right > playerAnchor.left + 2 && enemyBody.top < playerAnchor.bottom - 2 &&
        enemyBody.bottom > playerAnchor.top + 2;
      return {
        stage: !!document.querySelector('.battlefield .battle-ground'),
        portrait: !!playerArt?.naturalWidth,
        artLoaded: !!art?.naturalWidth,
        subjectsOverlap,
        headerBottom:rect('.combat-top')?.bottom, intentTop:rect('.intent')?.top,
        enemyBottom: enemy?.bottom, playerTop: player?.top, playerBottom: player?.bottom,
        handTop: hand?.top, endTurnBottom: rect('.end-turn')?.bottom,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight
      };
    })()`);
    if (!layout.stage || !layout.portrait || !layout.artLoaded || layout.subjectsOverlap ||
        layout.intentTop < layout.headerBottom - 1 || layout.enemyBottom > layout.handTop - 4 ||
        layout.playerBottom > layout.handTop + 1 || layout.scrollWidth > width + 1 ||
        (width >= 1060 && layout.endTurnBottom > height + 1) ||
        (width < 1060 && layout.scrollHeight < layout.endTurnBottom - 1)) {
      fail(`战斗舞台@${width}×${height}: 敌我或手牌重叠、素材缺失 ${JSON.stringify(layout)}`);
    }
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(outputDir, `boss-${width}x${height}.png`), Buffer.from(data, 'base64'));
    console.log(`CHECK 战斗舞台@${width}×${height}: ${JSON.stringify(layout)}`);
    if (width === 1440) {
      for (const [tier, id] of [['normal', 'shan_xiao'], ['elite', 'jin_jia_shi_jiang'], ['final', 'tai_xu']]) {
        await cdp.eval(`(() => {
          WX_UI.state.act=${tier === 'final' ? 3 : 1};
          WXEngine.startCombat(WX_UI.state,{enemies:[{id:'${id}'}]},'${tier === 'normal' ? 'combat' : tier === 'elite' ? 'elite' : 'boss'}');
          WX_UI.screen='combat'; WX_UI.render(); return 1;
        })()`);
        await cdp.eval(`Promise.all([...document.querySelectorAll('.enemy-art-figure,.player-figure img')].map(img => img.decode().catch(() => {})))`);
        await cdp.eval(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
        await sleep(180);
        const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(outputDir, `${tier}-1440x900.png`), Buffer.from(image.data, 'base64'));
      }
    }
  }

  async function showHandScene(width, height, name, { character = 'sword', cards, chain = 0, currentElement = null, selected = null, fullResource = false, hover = false }) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, screenWidth: width, screenHeight: height,
      deviceScaleFactor: 1, mobile: false, scale: 1
    });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4 });
    await cdp.eval(`(() => {
      WX_UI.state = WXEngine.createRun({ characterId: '${character}', seed: 71 });
      WXEngine.startCombat(WX_UI.state, { enemies: [{ id: 'shan_gui' }] }, 'boss');
      WX_UI.state.combat.hand = ${JSON.stringify(cards)}.map(id => ({ id, up: false }));
      WX_UI.state.combat.chain = ${chain};
      WX_UI.state.combat.currentElement = ${currentElement ? `'${currentElement}'` : 'null'};
      if (${fullResource}) WX_UI.state.combat.characterResource.value = WX_UI.state.combat.characterResource.max;
      WX_UI.selected = ${selected == null ? 'null' : selected};
      WX_UI.screen = 'combat'; WX_UI.render();
    })()`);
    await cdp.eval(`Promise.all([...document.querySelectorAll('.enemy-art-figure,.player-figure img')].map(img => img.decode().catch(() => {})))`);
    await cdp.eval(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await sleep(180);
    const metrics = await cdp.eval(`(() => {
      const cards = [...document.querySelectorAll('.hand .card')];
      const rects = cards.map(card => card.getBoundingClientRect());
      return { count: cards.length, lefts: rects.map(rect => Math.round(rect.left)),
        firstLeft: rects[0]?.left, lastRight: rects.at(-1)?.right,
        trayRight: document.querySelector('.left-tray')?.getBoundingClientRect().right,
        actionsLeft: document.querySelector('.combat-actions')?.getBoundingClientRect().left,
        scrollWidth: document.documentElement.scrollWidth, handScrollWidth: document.querySelector('.hand')?.scrollWidth,
        visibleElements: cards.filter(card => {
          const badge = card.querySelector('.card-elem');
          const r = badge?.getBoundingClientRect();
          return r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.card') === card;
        }).length,
        selected: cards.filter(card => card.classList.contains('selected')).length,
        full: !!document.querySelector('.five-ring.full') };
    })()`);
    if (metrics.count !== cards.length || metrics.scrollWidth > width + 1 ||
        (cards.length === 10 && (metrics.visibleElements !== 10 || metrics.lefts.some((left, index) => index && left <= metrics.lefts[index - 1] + 25) ||
          metrics.firstLeft < metrics.trayRight + 4 || metrics.lastRight > metrics.actionsLeft - 4))) {
      fail(`战斗手牌 ${name}: ${JSON.stringify(metrics)}`);
    }
    if (hover) {
      const point = await cdp.eval(`(() => { const r = document.querySelectorAll('.hand .card')[2].getBoundingClientRect(); return { x:r.left+r.width/2, y:r.bottom-8 }; })()`);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
      for (let frame = 0; frame < 5; frame++) {
        await sleep(100);
        const hoverStable = await cdp.eval(`document.querySelectorAll('.hand .card')[2].matches(':hover')`);
        if (!hoverStable) fail(`战斗手牌 ${name}: 指针停在牌面下缘时悬停状态抖动`);
      }
    }
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(image.data, 'base64'));
    console.log(`CHECK 战斗手牌 ${name}: ${JSON.stringify(metrics)}`);
  }

  async function showRarityGallery(width, name, cards, { mobile = false } = {}) {
    const height = mobile ? 852 : 900;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, screenWidth: width, screenHeight: height,
      deviceScaleFactor: 1, mobile: false, scale: 1
    });
    await cdp.eval(`new Promise(resolve => setTimeout(resolve, 230))`);
    await cdp.eval(`(() => {
      WX_UI.state = WXEngine.createRun({ characterId: 'sword', seed: 71 });
      WXEngine.startCombat(WX_UI.state, { enemies: [{ id: 'shan_gui' }] }, 'boss');
      WX_UI.state.combat.hand = ${JSON.stringify(cards)}.map((card, i) => typeof card === 'string'
        ? ({ uid:'rarity-'+i, id:card, up:false }) : ({ uid:'rarity-'+i, ...card }));
      WX_UI.screen='combat'; WX_UI.selected=null; WX_UI.render();
      const source=[...document.querySelectorAll('.hand .card')];
      const sheet=document.createElement('section');
      sheet.setAttribute('aria-label','卡牌品级视觉对照');
      sheet.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:rgba(6,10,12,.88);padding:18px;box-sizing:border-box';
      const title=document.createElement('div');
      title.textContent='卡牌品级 · 五行主色保留，牌框逐级成章';
      title.style.cssText='font:22px serif;color:#ead8ad;letter-spacing:.16em;text-align:center';
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;justify-content:center;gap:${mobile ? 6 : 18}px;width:100%';
      for(const original of source){
        const card=original.cloneNode(true);
        card.classList.remove('in-hand','selected','disabled','chain-next','will-overcome','fan-right');
        card.removeAttribute('data-action'); card.removeAttribute('data-index'); card.removeAttribute('data-card-uid');
        card.style.cssText += ';width:${mobile ? 108 : 190}px;height:${mobile ? 170 : 272}px;flex:0 1 auto;min-width:0;margin:0;transform:none;cursor:default';
        row.append(card);
      }
      sheet.append(title,row); document.querySelector('.combat-v2').append(sheet);
      return { count:source.length, classes:source.map(card=>card.className), visible:[...row.children].every(card=>{const r=card.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}) };
    })()`);
    await cdp.eval(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await sleep(180);
    const image=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(outputDir,`${name}.png`),Buffer.from(image.data,'base64'));
    const result=await cdp.eval(`(() => ({count:document.querySelectorAll('[aria-label="卡牌品级视觉对照"] .card').length,
      visible:[...document.querySelectorAll('[aria-label="卡牌品级视觉对照"] .card')].every(card=>{const r=card.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),
      rareOrnaments:document.querySelectorAll('[aria-label="卡牌品级视觉对照"] .rarity-rare .card-rarity-ornament').length}))()`);
    if(result.count!==cards.length||!result.visible) fail(`卡牌品级对照 ${name}: ${JSON.stringify(result)}`);
    console.log(`CHECK 卡牌品级对照 ${name}: ${JSON.stringify(result)}`);
  }
  await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
  await sleep(800);
  const examples = ['jin_ren', 'liu_yun', 'duan_yue', 'chi_yan', 'yan_quan', 'teng_bian', 'jin_feng', 'shi_fu', 'chun_feng', 'lie_yan'];
  for (const count of [3, 5, 8]) await showHandScene(1440, 900, `hand-${count}cards-1440`, { cards: examples.slice(0, count) });
  await showHandScene(1280, 720, 'hand-10cards-1280', { cards: examples });
  await showHandScene(1440, 900, 'hand-hover', { cards: examples.slice(0, 5), hover: true });
  await showHandScene(1440, 900, 'hand-selected', { cards: examples.slice(0, 5), selected: 2 });
  const focusAndReflow = await cdp.eval(`(() => {
    WX_UI.state.combat.hand = ['jin_ren','liu_yun','duan_yue','chi_yan','yan_quan'].map((id,i) => ({ uid:'reflow-'+i, id, up:false }));
    WX_UI.selected = null; WX_UI.render();
    document.querySelectorAll('.hand .card')[2].focus();
    const focusZ = getComputedStyle(document.querySelectorAll('.hand .card')[2]).zIndex;
    WX_UI.state.combat.hand.splice(1,1); WX_UI.render();
    return { focusZ, count:document.querySelectorAll('.hand .card').length,
      animated:[...document.querySelectorAll('.hand .card')].filter(card => card.getAnimations().length).length };
  })()`);
  if (focusAndReflow.focusZ !== '55' || focusAndReflow.count !== 4 || focusAndReflow.animated < 2) {
    fail(`战斗手牌键盘焦点或重排动画缺失: ${JSON.stringify(focusAndReflow)}`);
  }
  for (const [name, chain, currentElement] of [['chain-empty', 0, null], ['chain-3', 3, 'metal'], ['chain-5', 5, 'water']]) {
    await showHandScene(1440, 900, name, { cards: examples.slice(0, 5), chain, currentElement });
  }
  for (const [character, cards] of [
    ['sword', ['jin_ren', 'yi_jian_kai_tian', 'liu_yun']],
    ['alchemist', ['chan_si', 'bai_du_gui_yuan', 'chi_yan']],
    ['monk', ['yan_quan', 'beng_tian_shi', 'jin_zhong']]
  ]) await showHandScene(1440, 900, `finisher-${character}`, { character, cards, fullResource: true });
  await showRarityGallery(1440, 'card-rarity-hierarchy', ['jin_ren','jin_feng','she_ji','wu_lei','yi_jian_kai_tian']);
  await showRarityGallery(1440, 'card-rarity-elements', ['qing_mu','xing_huo','da_di','wu_lei','xuan_wu']);
  await showRarityGallery(1440, 'card-rarity-variants', ['wu_lei',{id:'wu_lei',up:true},'yi_jian_kai_tian']);
  await showRarityGallery(393, 'card-rarity-mobile', ['jin_feng','she_ji','wu_lei'], { mobile:true });
}

async function auditCombatEffects(cdp, baseUrl) {
  for (const width of [393, 1280]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height: 852, screenWidth: width, screenHeight: 852,
      deviceScaleFactor: 1, mobile: false, scale: 1
    });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await cdp.send('Page.navigate', { url: `${baseUrl}/index.html?v=${Date.now()}` });
    await sleep(900);
    const started = await cdp.eval(`(() => {
      localStorage.clear(); WX_UI.hasRun=false; WX_UI.beginRun();
      WXEngine.startCombat(WX_UI.state,{enemies:[{id:'shan_xiao'}]},'combat');
      WX_UI.screen='combat'; WX_UI.overlay=null;
      const combat=WX_UI.state.combat;
      combat.hand=[{uid:'audit-attack',id:'po_jun',up:false}];
      combat.energy=10; combat.enemies[0].hp=1000; combat.enemies[0].maxHp=1000;
      WX_UI.render();
      const card=document.querySelector('.hand .card');
      if (!card) return { error:'missing hand card' };
      WX_UI.selected=0; WX_UI.render();
      const targeting={ active:document.querySelector('.combat-screen').classList.contains('combat-targeting'),
        line:!!document.querySelector('#fx-layer .fx-target-overlay path'), seal:!!document.querySelector('#fx-layer .fx-target-seal'),
        focused:!!document.querySelector('.enemy-unit.focused .enemy-art'),
        path:document.querySelector('#fx-layer .fx-target-overlay path')?.getAttribute('d'),
        stroke:document.querySelector('#fx-layer .fx-target-overlay path') && getComputedStyle(document.querySelector('#fx-layer .fx-target-overlay path')).stroke,
        lineBox:document.querySelector('#fx-layer .fx-target-overlay')?.getBoundingClientRect().toJSON() };
      if (!targeting.active || !targeting.line || !targeting.focused) return { error:'target mode failed', targeting };
      const overlay=document.createElement('div'); overlay.className='overlay'; document.body.appendChild(overlay);
      const overlayZ=Number(getComputedStyle(overlay).zIndex); overlay.remove();
      const before=combat.hand.length;
      return { before,
        pointer:getComputedStyle(document.getElementById('fx-layer')).pointerEvents,
        fxZ:Number(getComputedStyle(document.getElementById('fx-layer')).zIndex),
        overlayZ, targeting };
    })()`);
    if (started.error || started.pointer !== 'none' || started.fxZ >= started.overlayZ) {
      fail(`出牌特效@${width}: 快照、即时结算或遮挡层级异常 ${JSON.stringify(started)}`);
    }
    if (width === 393) console.log(`CHECK 目标线样式@${width}: ${JSON.stringify(started.targeting)}`);
    if (width === 393) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(SHOT_DIR, 'target-mode-393.png'), Buffer.from(data, 'base64'));
      console.log('CHECK 目标选择@393: 战斗进入瞄准态并生成五行目标线');
    }
    const played = await cdp.eval(`(() => { const before=WX_UI.state.combat.hand.length; window.__fxPlay=WX_UI.playCard(0,0); return { before, after:WX_UI.state.combat.hand.length, ghost:!!document.querySelector('.fx-card-ghost') }; })()`);
    if (!played.ghost || played.after !== played.before - 1) fail(`出牌特效@${width}: 快照或即时结算异常 ${JSON.stringify(played)}`);
    await cdp.eval(`(() => { WXEffects.clearTargetLine(); WX_UI.selected=null; WX_UI.render(); return true; })()`);
    await sleep(175);
    const midFlight = await cdp.eval(`(() => { const ghost=document.querySelector('.fx-card-ghost');
      return { visible:!!ghost, opacity:ghost?Number(getComputedStyle(ghost).opacity):0 }; })()`);
    if (!midFlight.visible || midFlight.opacity < .65) fail(`出牌特效@${width}: 飞牌中段过早淡出 ${JSON.stringify(midFlight)}`);
    await sleep(1500);
    const settled = await cdp.eval(`(() => ({ busy:WX_UI.busy, ghost:document.querySelectorAll('.fx-card-ghost').length,
      temporary:document.querySelectorAll('#fx-layer .fx-particle,#fx-layer .fx-ring,#fx-layer .fx-slash,#fx-layer .fx-flash').length,
      hand:WX_UI.state.combat.hand.length }))()`);
    if (settled.busy || settled.ghost || settled.temporary || settled.hand) fail(`出牌特效@${width}: 动画未清理或忙碌状态未解除 ${JSON.stringify(settled)}`);
    for (const element of ['wood','fire','earth','metal','water']) {
      const burst = await cdp.eval(`(() => {
        window.__fxBurst=WXEffects.elementBurst({element:'${element}',x:innerWidth/2,y:innerHeight/2});
        return { particles:document.querySelectorAll('#fx-layer .fx-particle').length,
          distinct:document.querySelectorAll('#fx-layer .fx-element-${element}').length };
      })()`);
      if (!burst.distinct || burst.particles > 12) fail(`五行特效@${width}/${element}: 粒子形态或数量异常 ${JSON.stringify(burst)}`);
      const finished = await cdp.eval(`Promise.race([window.__fxBurst.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),1000))])`);
      const leftover = await cdp.eval(`(() => [...document.querySelectorAll('#fx-layer .fx-particle,#fx-layer .fx-ring,#fx-layer .fx-slash,#fx-layer .fx-flash')].map(el=>el.className))()`);
      if (!finished || leftover.length) fail(`五行特效@${width}/${element}: 动画未结束或节点未清理 ${JSON.stringify(leftover)}`);
    }
    const zhou = await cdp.eval(`(() => { window.__fxZhou=WXEffects.zhoutian();
      return { ring:document.querySelectorAll('.fx-zhoutian-ring').length,
        particles:document.querySelectorAll('#fx-layer .fx-particle').length }; })()`);
    if (zhou.ring !== 1 || zhou.particles > 30) fail(`周天特效@${width}: 环或粒子异常 ${JSON.stringify(zhou)}`);
    const zhouFinished = await cdp.eval(`Promise.race([window.__fxZhou.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),1100))])`);
    if (!zhouFinished || await cdp.eval(`(() => document.querySelectorAll('.fx-zhoutian-ring,.fx-zhoutian-wave,#fx-layer .fx-particle,#fx-layer .fx-flash').length)()`)) fail(`周天特效@${width}: 动画未结束或节点未清理`);
    console.log(`CHECK 出牌特效@${width}: 飞牌、五行、周天、清理和层级`);
  }
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await cdp.eval(`(() => { WXEffects.elementBurst({element:'fire',x:100,y:100});
    WXEffects.zhoutian(); WX_UI.floatAt(document.querySelector('.enemy-unit'), '-12', 'fx-damage');
    return { particles:document.querySelectorAll('#fx-layer .fx-particle').length,
      ring:document.querySelectorAll('.fx-zhoutian-ring').length,
      clone:WXEffects.captureCard(document.querySelector('.hand .card')),
      floatOpacity:Number(getComputedStyle(document.querySelector('.float-text')).opacity),
      enemyIdle:getComputedStyle(document.querySelector('.enemy-art-motion')).animationName }; })()`);
  if (reduced.particles || reduced.ring || reduced.clone || reduced.floatOpacity < .5 || reduced.enemyIdle !== 'none') fail(`减少动态效果下粒子、飞牌、怪物呼吸或必要飘字异常 ${JSON.stringify(reduced)}`);
  console.log('CHECK 减少动态效果: 粒子与飞牌已关闭');
}

let server, chrome, cdp;
try {
  server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  chrome = launchChrome();
  const port = await waitForDevTools(chrome.dir);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('未找到页面目标');
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  if (process.env.AUDIT_STAGE_ONLY) {
    await auditCombatStage(cdp, baseUrl);
  } else if (!process.env.AUDIT_EFFECTS_ONLY) {
    for (const vp of viewports) await auditAt(cdp, baseUrl, vp);
    await captureCardShowcase(cdp, baseUrl);
    await auditShortCombat(cdp, baseUrl);
    await auditCombatStage(cdp, baseUrl);
  }
  if (!process.env.AUDIT_STAGE_ONLY) await auditCombatEffects(cdp, baseUrl);
} finally {
  try { cdp && cdp.close(); } catch {}
  try { chrome && chrome.child.kill('SIGKILL'); } catch {}
  try { chrome && fs.rmSync(chrome.dir, { recursive: true, force: true }); } catch {}
  try { server && server.close(); } catch {}
}

if (failures.length) {
  console.error('\nFAIL');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('\nPASS: 移动端布局审计通过');
