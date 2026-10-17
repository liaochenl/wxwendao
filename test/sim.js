'use strict';
/* 自动模拟对局：随机/贪心策略跑完整流程，用于发现崩溃、死循环与平衡问题。 */
const DATA = require('../js/data.js');
const E = require('../js/engine.js');

function incomingDamage(state) {
  const c = state.combat;
  let total = 0;
  c.enemies.forEach(e => {
    if (e.hp <= 0) return;
    const it = E.getEnemyIntent(state, e);
    if (it && it.damage) {
      let d = it.damage * it.hits;
      if (c.statuses.vulnerable > 0) d = Math.floor(d * 1.5);
      total += d;
    }
  });
  return total;
}

function scoreCard(state, i) {
  const p = E.getPreview(state, i, 0);
  const d = E.getCardData(state.combat.hand[i]);
  if (!p) return 0;
  const c = state.combat;
  const incoming = incomingDamage(state);
  const dangerous = incoming > c.block + state.hp * 0.18;
  const lowHp = state.hp < state.maxHp * 0.5;
  let score = (p.damage || 0) * (p.hits || 1);
  if (dangerous && p.block) score += p.block * 2.2;
  else score += (p.block || 0) * 0.7;
  if (lowHp && p.heal) score += p.heal * 2.2;
  else score += (p.heal || 0) * 0.6;
  score += (p.draw || 0) * 3;
  score += (p.poison || 0) * 2;
  if (dangerous && !p.block && p.damage) score *= 0.65;
  if (d.type === 'skill' && d.effects.some(e => e.op === 'energy')) score += 8;
  return score;
}

function combatTurn(s) {
  let guard = 0;
  while (s.combat && s.combat.phase === 'player' && guard++ < 30) {
    const c = s.combat;
    // 濒死喝药；其它丹药也尽量用掉
    if (s.hp < s.maxHp * 0.4 || incomingDamage(s) > s.hp) {
      const idx = s.potions.findIndex(p => p === 'heal' || p === 'block' || p === 'cleanse');
      if (idx >= 0) { E.usePotion(s, idx, 0); continue; }
    }
    if (s.potions.length && (s.combat.turn >= 2 || s.potions.length >= 2)) {
      E.usePotion(s, 0, 0);
      continue;
    }
    let best = -1, bestScore = 0;
    for (let i = 0; i < c.hand.length; i++) {
      if (!E.canPlayCard(s, i).ok) continue;
      const sc = scoreCard(s, i) + Math.random() * 0.5;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) break;
    const r = E.playCard(s, best, 0);
    if (!r.ok) break;
  }
  if (!s.combat) return;
  if (s.combat.phase === 'player') {
    E.endPlayerTurn(s);
    if (s.combat && s.combat.phase === 'enemy') E.runEnemyTurn(s);
  }
  if (s.combat && s.combat.phase === 'won') E.finishCombat(s);
}

function chooseNode(s) {
  const avail = E.availableNodes(s);
  if (!avail.length) return null;
  const hpPct = s.hp / s.maxHp;
  const order = [];
  if (hpPct < 0.5) order.push('rest', 'shop', 'event', 'treasure', 'combat', 'elite');
  else order.push('treasure', 'shop', 'event', 'combat', 'rest', 'elite');
  for (const t of order) {
    const n = avail.find(x => x.type === t);
    if (n && !(t === 'elite' && (hpPct < 0.8 || s.deck.length < 14))) return n;
  }
  return avail[0];
}

function runOne(charId, seed, asc) {
  const s = E.createRun({ characterId: charId, seed, ascension: asc });
  let steps = 0;
  while (steps++ < 3000) {
    if (s.screen === 'victory' || s.screen === 'gameover') break;
    if (s.screen === 'map') {
      const n = chooseNode(s);
      if (!n) break;
      E.enterNode(s, n.id);
    } else if (s.screen === 'combat') {
      if (s.combat.phase === 'player') combatTurn(s);
      else if (s.combat.phase === 'won') E.finishCombat(s);
      else if (s.combat.phase === 'lost') { s.screen = 'gameover'; break; }
      else if (s.combat.phase === 'enemy') E.runEnemyTurn(s);
    } else if (s.screen === 'reward') {
      if (!s.reward.cardTaken && s.deck.length < 20) E.takeRewardCard(s, 0);
      else E.skipReward(s);
      E.continueReward(s);
    } else if (s.screen === 'shop') {
      const kinds = ['relic', 'card', 'potion'];
      for (const k of kinds) {
        const list = k === 'card' ? s.shop.cards : k === 'relic' ? s.shop.relics : s.shop.potions;
        for (let i = 0; i < list.length; i++) {
          if (!list[i].sold && s.gold >= list[i].price && (k !== 'potion' || s.potions.length < 3)) {
            E.buyItem(s, k, i);
            break;
          }
        }
      }
      E.leaveShop(s);
    } else if (s.screen === 'rest') {
      if (s.hp < s.maxHp * 0.7) E.restHeal(s);
      else {
        const up = s.deck.find(c => !c.up && DATA.cardMap[c.id].up);
        if (up) E.restUpgrade(s, up.uid);
        else E.restHeal(s);
      }
    } else if (s.screen === 'event') {
      if (!s.event.resolved) {
        const ev = DATA.events.find(e => e.id === s.event.id);
        let idx = 0;
        for (let i = 0; i < ev.choices.length; i++) {
          const req = ev.choices[i].require;
          if (!req || !req.gold || s.gold >= req.gold) { idx = i; break; }
        }
        E.applyEventChoice(s, idx);
      } else E.continueEvent(s);
    } else if (s.screen === 'treasure') {
      E.continueTreasure(s);
    } else {
      break;
    }
  }
  return {
    win: s.screen === 'victory',
    act: s.act,
    floor: s.stats.floors,
    hp: s.hp,
    maxHp: s.maxHp,
    deck: s.deck.length,
    kills: s.stats.kills,
    steps,
    stuck: steps >= 3000
  };
}

const runs = Number(process.argv[2] || 600);
const ascension = Number(process.argv[3] || 0);
const results = [];
for (const char of ['sword', 'alchemist', 'monk']) {
  for (let i = 0; i < runs / 3; i++) {
    try {
      results.push(Object.assign({ char }, runOne(char, 10000 + i * 31, ascension)));
    } catch (err) {
      console.error('CRASH', char, i, err && err.stack || err);
      process.exit(1);
    }
  }
}
for (const char of ['sword', 'alchemist', 'monk']) {
  const rs = results.filter(r => r.char === char);
  const wins = rs.filter(r => r.win).length;
  const avgFloor = (rs.reduce((a, r) => a + r.floor, 0) / rs.length).toFixed(1);
  const avgDeck = (rs.reduce((a, r) => a + r.deck, 0) / rs.length).toFixed(1);
  console.log(`${char}: 胜率 ${(wins / rs.length * 100).toFixed(1)}% | 平均层数 ${avgFloor} | 平均牌组 ${avgDeck} | 卡死 ${rs.filter(r => r.stuck).length}`);
}
console.log('天劫', ascension, '· 总计', results.length, '局，异常 0');
