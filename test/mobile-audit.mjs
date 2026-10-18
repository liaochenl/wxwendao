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
    name: 'multi',
    combat: true,
    prepare: "(() => { const st=WX_UI.state; WX_UI.overlay=null; WXEngine.startCombat(st,{enemies:[{id:'shan_xiao'},{id:'shan_xiao'},{id:'shan_xiao'}]},'combat'); WX_UI.screen='combat'; WX_UI.render(); return 1; })()"
  }
];

const viewports = [
  { width: 360, height: 640 },
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
    if (screen.combat) {
      if (r.endTurnOverlap) fail(`${tag}: 结束回合与手牌相交`);
      if (r.handFont != null && r.handFont < 11) fail(`${tag}: 手牌字号 ${r.handFont}px < 11px`);
    }
    if (screen.name === 'status-info') {
      const info = await cdp.eval(`(() => {
        const panel = document.querySelector('.detail-panel');
        const text = panel && panel.querySelector('.detail-body')?.innerText || '';
        return { open: !!panel, full: text.includes('当前 2 层') && text.includes('无视护甲') };
      })()`);
      if (!info.open || !info.full) fail(`${tag}: 状态详情未显示当前层数和完整说明`);
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
    if (screen.name.endsWith('-detail')) {
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
      }
    }

    if (vp.width === 393 && !screen.name.endsWith('-detail') && !screen.name.endsWith('-info')) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(SHOT_DIR, `after-${screen.name}-393.png`), Buffer.from(data, 'base64'));
    }
    console.log(`CHECK ${tag}: screen=${r.screen} scrollW=${r.scrollW} vw=${r.vw} small=${r.small.length} offscreen=${r.offscreen.length}`);
  }
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

  for (const vp of viewports) await auditAt(cdp, baseUrl, vp);
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
