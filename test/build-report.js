'use strict';
const { runOne } = require('./sim.js');
const DATA = require('../js/data.js');

const runs = Math.max(1, Number(process.argv[2] || 3000));
const ascension = Number(process.argv[3] || 0);
const tags = [
  ['sword_intent', '金锋·剑意'],
  ['sword_cycle', '流云·循环'],
  ['sword_chain', '金水·连携']
];
const firstActOffers = [];
const results = Array.from({ length: runs }, (_, index) => {
  const offers = { sword_intent: 0, sword_cycle: 0, sword_chain: 0 };
  const result = runOne('sword', 10000 + 31 * index, ascension, null, null, {
    onReward({ act, cards }) {
      if (act !== 1) return;
      for (const id of cards) for (const tag of DATA.cardMap[id]?.tags || []) {
        if (offers[tag] != null) offers[tag]++;
      }
    }
  });
  firstActOffers.push(Math.max(...Object.values(offers)));
  return result;
});
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const percent = count => `${(count / runs * 100).toFixed(1)}%`;
const peak = key => Math.max(...results.map(result => result.highlights[key]));

console.log(`剑修构筑 V2 · 天劫 ${ascension} · ${runs} 局`);
console.log(`通关率 ${percent(results.filter(result => result.win).length)} · 平均牌组 ${mean(results.map(result => result.deck)).toFixed(1)} · 卡死 ${results.filter(result => result.stuck).length}`);
console.log(`第一幕同系奖励出现 2–4 次的对局 ${percent(firstActOffers.filter(count => count >= 2 && count <= 4).length)} · 平均最多同系出现 ${mean(firstActOffers).toFixed(1)} 次（重复卡牌分别计数）`);
for (const [tag, name] of tags) {
  const initial = results.filter(result => result.deckTags[tag] >= 4).length;
  const complete = results.filter(result => result.deckTags[tag] >= 6 && result.payoffTags[tag]).length;
  console.log(`${name}: 初步成型 ${percent(initial)} · 完整成型 ${percent(complete)}`);
}
console.log(`峰值伤害 ${peak('maxTurnDamage')} · 平均单局最高回合伤害 ${mean(results.map(result => result.highlights.maxTurnDamage)).toFixed(1)}`);
console.log(`峰值护甲 ${peak('maxTurnBlock')} · 单回合最多出牌 ${peak('maxCardsPlayedInTurn')} · 达到 7 张的对局 ${percent(results.filter(result => result.highlights.maxCardsPlayedInTurn >= 7).length)}`);
console.log(`剑意到达上限的对局 ${percent(results.filter(result => result.highlights.maxResource >= 10).length)} · 终结牌打出 ${results.reduce((sum, result) => sum + result.highlights.finisherCount, 0)} 次`);
