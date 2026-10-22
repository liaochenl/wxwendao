'use strict';
/* 自动模拟对局：随机/贪心策略跑完整流程，用于发现崩溃、死循环与平衡问题。 */
const DATA = require('../js/data.js');
const E = require('../js/engine.js');

function tally(metrics, character, id, field) {
  if (!metrics || !id) return;
  const key = character + ':' + id;
  const row = metrics.get(key) || { character, id, offered: 0, picked: 0, seen: 0, played: 0, shopOffered: 0, shopBought: 0 };
  row[field]++;
  metrics.set(key, row);
}

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
  const enemyCount = c.enemies.filter(e => e.hp > 0).length;
  const damageIsArea = d.effects.some(e => e.op === 'damage' && e.target === 'all');
  let score = (p.damage || 0) * (p.hits || 1) * (damageIsArea ? enemyCount : 1);
  if (dangerous && p.block) score += p.block * 2.2;
  else score += (p.block || 0) * 0.7;
  if (lowHp && p.heal) score += p.heal * 2.2;
  else score += (p.heal || 0) * 0.6;
  score += (p.draw || 0) * 3;
  // 模拟器的粗略出牌价值：持续状态和群体目标也必须计入，才能分析其实际使用机会。
  const statusValue = { poison: 2, burn: 1.8, weak: dangerous ? 4 : 2, vulnerable: 2,
    strength: 7, dexterity: 5, regen: lowHp ? 2.5 : 1, thorns: 2, ritual: 8, stun: 8 };
  for (const effect of d.effects) {
    if (effect.op === 'status') {
      const targets = effect.target === 'allEnemies' ? enemyCount : 1;
      score += (statusValue[effect.status] || 0) * (effect.value || 0) * targets;
    }
    if (effect.op === 'loseHp') score -= (effect.value || 0) * (lowHp ? 4 : 2);
  }
  if (dangerous && !p.block && p.damage) score *= 0.65;
  if (d.type === 'skill' && d.effects.some(e => e.op === 'energy')) score += 8;
  return score;
}

function combatTurn(s, metrics, observeResult, observePlay) {
  const record = result => {
    if (observeResult) observeResult(result);
    return result;
  };
  let guard = 0;
  const seen = new Set();
  while (s.combat && s.combat.phase === 'player' && guard++ < 30) {
    const c = s.combat;
    for (const inst of c.hand) {
      if (seen.has(inst.uid)) continue;
      seen.add(inst.uid);
      tally(metrics, s.characterId, inst.id, 'seen');
    }
    // 濒死喝药；其它丹药也尽量用掉
    if (s.hp < s.maxHp * 0.4 || incomingDamage(s) > s.hp) {
      const idx = s.potions.findIndex(p => p === 'heal' || p === 'block' || p === 'cleanse');
      if (idx >= 0) { record(E.usePotion(s, idx, 0)); continue; }
    }
    if (s.potions.length && (s.combat.turn >= 2 || s.potions.length >= 2)) {
      record(E.usePotion(s, 0, 0));
      continue;
    }
    let best = -1, bestScore = 0;
    for (let i = 0; i < c.hand.length; i++) {
      if (!E.canPlayCard(s, i).ok) continue;
      const sc = scoreCard(s, i);
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) break;
    const played = c.hand[best];
    const r = record(E.playCard(s, best, 0));
    if (!r.ok) break;
    tally(metrics, s.characterId, played.id, 'played');
    if (observePlay) observePlay(played, r, c);
  }
  if (!s.combat) return;
  if (s.combat.phase === 'player') {
    record(E.endPlayerTurn(s));
    if (s.combat && s.combat.phase === 'enemy') record(E.runEnemyTurn(s));
  }
  if (s.combat && s.combat.phase === 'won') record(E.finishCombat(s));
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

function observeEnemyKills(sample, enemies) {
  if (sample.enemyCount !== 2 || !sample.aliveEnemies) return;
  const remaining = new Set(enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.uid));
  const fallen = sample.aliveEnemies.filter(enemy => !remaining.has(enemy.uid));
  if (!fallen.length) return;
  sample.aliveEnemies = sample.aliveEnemies.filter(enemy => remaining.has(enemy.uid));
  if (sample.firstKill == null) {
    sample.firstKill = fallen.length > 1 ? 'simultaneous' : fallen[0].id;
  } else if (sample.secondKill == null) {
    sample.secondKill = fallen.length > 1 ? 'simultaneous' : fallen[0].id;
  }
}

function runOne(charId, seed, asc, metrics, encounterMetrics, observer) {
  const s = E.createRun({ characterId: charId, seed, ascension: asc });
  let steps = 0;
  let normalCombats = 0;
  let activeNormal = null;
  const highlights = { maxTurnDamage: 0, maxTurnBlock: 0, maxCardsPlayedInTurn: 0,
    maxPoison: 0, maxBurn: 0, maxResource: 0, finisherCount: 0 };
  let highlightCombat = null;
  let highlightTurn = 0;
  let turnDamage = 0;
  function observePlay(card, played, combat) {
    if (highlightCombat !== combat || highlightTurn !== combat.turn) {
      highlightCombat = combat;
      highlightTurn = combat.turn;
      turnDamage = 0;
    }
    turnDamage += played.events.filter(event => event.t === 'damage' && event.target === 'enemy')
      .reduce((sum, event) => sum + Math.max(0, event.amount - (event.blocked || 0)), 0);
    highlights.maxTurnDamage = Math.max(highlights.maxTurnDamage, turnDamage);
    highlights.maxTurnBlock = Math.max(highlights.maxTurnBlock, combat.block);
    highlights.maxCardsPlayedInTurn = Math.max(highlights.maxCardsPlayedInTurn, combat.cardsPlayedThisTurn);
    highlights.maxResource = Math.max(highlights.maxResource, combat.characterResource?.value || 0);
    if (DATA.cardMap[card.id]?.finisher) highlights.finisherCount++;
    for (const enemy of combat.enemies) {
      highlights.maxPoison = Math.max(highlights.maxPoison, enemy.statuses.poison || 0);
      highlights.maxBurn = Math.max(highlights.maxBurn, enemy.statuses.burn || 0);
    }
  }
  function recordCombatEvents(result) {
    if (!activeNormal) return;
    if (s.combat) observeEnemyKills(activeNormal, s.combat.enemies);
    if (!result?.events) return;
    for (const event of result.events) {
      if (event.t === 'damage' && event.target === 'player' && event.direct) {
        activeNormal.directDamageTaken += event.amount;
      }
    }
  }
  function finishNormalSample() {
    if (!activeNormal) return;
    const row = activeNormal;
    activeNormal = null;
    const dead = s.screen === 'gameover' || s.hp <= 0 || s.combat?.phase === 'lost';
    if (observer && observer.onNormalCombat) observer.onNormalCombat({
      id: row.id, act: row.act, mapRow: row.mapRow, stage: row.stage,
      enemyCount: row.enemyCount, hpBefore: row.hpBefore, hpAfter: s.hp,
      hpLoss: row.hpBefore - s.hp,
      damageTaken: s.stats.damageTaken - row.damageBefore + row.directDamageTaken,
      directDamageTaken: row.directDamageTaken,
      turns: row.maxTurn,
      dead,
      firstKill: row.firstKill,
      secondKill: row.secondKill,
      aliveAtDeath: dead ? (s.combat?.enemies || []).filter(enemy => enemy.hp > 0).map(enemy => enemy.id) : null
    });
  }
  while (steps++ < 3000) {
    if (s.screen === 'victory' || s.screen === 'gameover') break;
    if (s.screen === 'map') {
      const n = chooseNode(s);
      if (!n) break;
      E.enterNode(s, n.id);
      if (n.type === 'combat') {
        normalCombats++;
        activeNormal = {
          id: s.recentEncounters.at(-1), act: s.act, mapRow: n.row,
          stage: n.row <= 1 ? 'early' : n.row <= 4 ? 'mid' : 'late',
          enemyCount: s.combat.enemies.length, hpBefore: s.hp,
          damageBefore: s.stats.damageTaken, directDamageTaken: 0, maxTurn: s.combat.turn,
          aliveEnemies: s.combat.enemies.map(enemy => ({ uid: enemy.uid, id: enemy.id })),
          firstKill: null, secondKill: null
        };
        if (encounterMetrics) {
          const stage = n.row <= 1 ? 'early' : n.row <= 4 ? 'mid' : 'late';
          const key = `${s.act}:${stage}`;
          const row = encounterMetrics.get(key) || { act: s.act, stage, count: 0, doubles: 0 };
          row.count++;
          if (s.combat.enemies.length === 2) row.doubles++;
          encounterMetrics.set(key, row);
          const id = s.recentEncounters.at(-1);
          if (id) encounterMetrics.set(`id:${id}`, (encounterMetrics.get(`id:${id}`) || 0) + 1);
        }
      }
    } else if (s.screen === 'combat') {
      if (s.combat.phase === 'player') combatTurn(s, metrics, recordCombatEvents, observePlay);
      else if (s.combat.phase === 'won') recordCombatEvents(E.finishCombat(s));
      else if (s.combat.phase === 'lost') { s.screen = 'gameover'; break; }
      else if (s.combat.phase === 'enemy') recordCombatEvents(E.runEnemyTurn(s));
    } else if (s.screen === 'reward') {
      if (observer?.onReward) observer.onReward({ act: s.act, cards: s.reward.cards.map(card => card.id) });
      for (const inst of s.reward.cards) tally(metrics, charId, inst.id, 'offered');
      if (!s.reward.cardTaken && s.deck.length < 20) {
        const picked = s.reward.cards[0];
        const take = E.takeRewardCard(s, 0);
        if (take.ok && picked) tally(metrics, charId, picked.id, 'picked');
      }
      else E.skipReward(s);
      E.continueReward(s);
    } else if (s.screen === 'shop') {
      for (const entry of s.shop.cards) tally(metrics, charId, entry.card.id, 'shopOffered');
      const kinds = ['relic', 'card', 'potion'];
      for (const k of kinds) {
        const list = k === 'card' ? s.shop.cards : k === 'relic' ? s.shop.relics : s.shop.potions;
        for (let i = 0; i < list.length; i++) {
          if (!list[i].sold && s.gold >= list[i].price && (k !== 'potion' || s.potions.length < 3)) {
            const bought = E.buyItem(s, k, i);
            if (bought.ok && k === 'card') tally(metrics, charId, list[i].card.id, 'shopBought');
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
    if (activeNormal && s.combat) activeNormal.maxTurn = Math.max(activeNormal.maxTurn, s.combat.turn);
    if (activeNormal && s.screen !== 'combat') finishNormalSample();
  }
  finishNormalSample();
  const deathNode = s.screen === 'gameover' ? E.currentNode(s) : null;
  const deckTags = { sword_intent: 0, sword_cycle: 0, sword_chain: 0 };
  const payoffTags = { sword_intent: false, sword_cycle: false, sword_chain: false };
  for (const card of s.deck) for (const tag of DATA.cardMap[card.id]?.tags || []) {
    if (deckTags[tag] != null) deckTags[tag]++;
    if (payoffTags[tag] != null && DATA.cardMap[card.id].rarity === 'rare' && DATA.cardMap[card.id].finisher) payoffTags[tag] = true;
  }
  return {
    win: s.screen === 'victory',
    dead: s.screen === 'gameover',
    act: s.act,
    floor: s.stats.floors,
    hp: s.hp,
    maxHp: s.maxHp,
    deck: s.deck.length,
    kills: s.stats.kills,
    normalCombats,
    deathRow: deathNode?.row ?? null,
    deathType: deathNode?.type ?? null,
    steps,
    stuck: steps >= 3000,
    deckTags,
    payoffTags,
    highlights
  };
}

function runCli() {
const runs = Number(process.argv[2] || 600);
const ascension = Number(process.argv[3] || 0);
const reportCards = process.argv.includes('--report-cards');
const reportEncounters = process.argv.includes('--report-encounters');
const cardMetrics = reportCards ? new Map() : null;
const encounterMetrics = reportEncounters ? new Map() : null;
const results = [];
for (const char of ['sword', 'alchemist', 'monk']) {
  for (let i = 0; i < runs / 3; i++) {
    try {
      results.push(Object.assign({ char }, runOne(char, 10000 + i * 31, ascension, cardMetrics, encounterMetrics)));
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
if (reportEncounters) {
  console.log('ENCOUNTER_STATS_START');
  console.log('幕,阶段,普通战斗,双怪');
  for (const act of [1, 2, 3]) {
    for (const stage of ['early', 'mid', 'late']) {
      const row = encounterMetrics.get(`${act}:${stage}`) || { count: 0, doubles: 0 };
      console.log([act, stage, row.count, row.doubles].join(','));
    }
  }
  console.log('遭遇ID,次数');
  for (const [key, count] of [...encounterMetrics.entries()].filter(([key]) => key.startsWith('id:')).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${key.slice(3)},${count}`);
  }
  console.log('死亡幕,剑修,丹修,体修');
  for (const act of [1, 2, 3]) {
    console.log([act, ...['sword', 'alchemist', 'monk'].map(char => results.filter(r => r.char === char && r.dead && r.act === act).length)].join(','));
  }
  console.log('死亡阶段,剑修,丹修,体修');
  for (const stage of ['early', 'mid', 'late', 'boss']) {
    const matches = row => stage === 'boss' ? row === 8 : row != null &&
      (row <= 1 ? 'early' : row <= 4 ? 'mid' : 'late') === stage && row < 8;
    console.log([stage, ...['sword', 'alchemist', 'monk'].map(char => results.filter(r => r.char === char && r.dead && matches(r.deathRow)).length)].join(','));
  }
  for (const char of ['sword', 'alchemist', 'monk']) {
    const rows = results.filter(r => r.char === char);
    const avgCombats = (rows.reduce((sum, r) => sum + r.normalCombats, 0) / rows.length).toFixed(1);
    const wins = rows.filter(r => r.win);
    const avgWinHp = wins.length ? (wins.reduce((sum, r) => sum + r.hp, 0) / wins.length).toFixed(1) : '0.0';
    console.log(`${char}: 平均普通战斗 ${avgCombats} | 通关时平均生命 ${avgWinHp}`);
  }
  console.log('ENCOUNTER_STATS_END');
}
if (reportCards) {
  console.log('CARD_STATS_START');
  console.log('角色,卡牌ID,奖励出现,奖励选取,手牌回合实例数,实际打出,商店出现,商店购买');
  const order = { sword: 0, alchemist: 1, monk: 2 };
  for (const row of [...cardMetrics.values()].sort((a, b) => order[a.character] - order[b.character] || a.id.localeCompare(b.id))) {
    console.log([row.character, row.id, row.offered, row.picked, row.seen, row.played, row.shopOffered, row.shopBought].join(','));
  }
  console.log('CARD_STATS_END');
}
}

if (require.main === module) runCli();
module.exports = { runOne, observeEnemyKills };
