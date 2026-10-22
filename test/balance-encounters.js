'use strict';
/* 普通双怪遭遇的可重复参数扫描；仅在进程内覆盖 hpScale，不改游戏数据文件。 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATA = require('../js/data.js');
const { runOne } = require('./sim.js');

const CHARACTERS = ['sword', 'alchemist', 'monk'];
const STAGES = ['early', 'mid', 'late'];
const DEFAULT_SCALES = [0.45, 0.50, 0.55, 0.60];
const SEED_START = 10000;
const SEED_STEP = 31;

function withDoubleEncounterScales(scalesByAct, fn) {
  const original = [];
  const seen = new Set();
  try {
    for (const act of [1, 2, 3]) {
      const scale = scalesByAct[act - 1];
      if (!Number.isFinite(scale) || scale <= 0) throw new Error(`Act ${act} hpScale 无效`);
      for (const stage of STAGES) {
        for (const encounter of DATA.encounters[act].normal[stage]) {
          if (encounter.enemies.length !== 2 || seen.has(encounter)) continue;
          seen.add(encounter);
          original.push({ encounter, value: encounter.hpScale, hadScale: Object.hasOwn(encounter, 'hpScale') });
          encounter.hpScale = scale;
        }
      }
    }
    return fn();
  } finally {
    for (const { encounter, value, hadScale } of original) {
      if (hadScale) encounter.hpScale = value;
      else delete encounter.hpScale;
    }
  }
}

function parseNumberList(value, name, predicate) {
  if (!String(value).trim() || String(value).split(',').some(part => !part.trim())) {
    throw new Error(`${name} 参数无效: ${value}`);
  }
  const numbers = String(value).split(',').map(part => Number(part.trim()));
  if (!numbers.length || numbers.some(number => !Number.isFinite(number) || !predicate(number))) {
    throw new Error(`${name} 参数无效: ${value}`);
  }
  return [...new Set(numbers)];
}

function parseArgs(argv) {
  const options = { runs: 1000, ascensions: [0, 5], scales: DEFAULT_SCALES.slice(), quick: false };
  let hasRuns = false;
  let hasScales = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--quick') { options.quick = true; continue; }
    if (arg === '--full') { options.quick = false; continue; }
    if (arg === '--runs' || arg === '--asc' || arg === '--scales' || arg === '--act-scales') {
      const value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} 缺少参数`);
      if (arg === '--runs') {
        const runs = Number(value);
        if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs 参数无效: ${value}`);
        options.runs = runs;
        hasRuns = true;
      } else if (arg === '--asc') options.ascensions = parseNumberList(value, 'asc', number => Number.isInteger(number) && number >= 0 && number <= 10);
      else if (arg === '--scales') {
        options.scales = parseNumberList(value, 'scales', number => number > 0 && number <= 1);
        hasScales = true;
      }
      else options.actScales = value.split(';').map(part => {
        const scales = part.split(',').map(item => Number(item.trim()));
        if (scales.length !== 3 || scales.some(number => !Number.isFinite(number) || number <= 0 || number > 1)) {
          throw new Error(`act-scales 需要每幕各一个倍率: ${part}`);
        }
        return scales;
      });
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  if (options.actScales && !hasScales) options.scales = [];
  if (options.quick && !hasRuns) options.runs = 150;
  return options;
}

function runBalance(options) {
  const configs = [];
  const plans = options.scales.map(scale => ({ scale, actScales: [scale, scale, scale] }));
  for (const actScales of options.actScales || []) {
    plans.push({ scale: actScales.map(scale => scale.toFixed(2)).join('/'), actScales });
  }
  for (const ascension of options.ascensions) {
    for (const { scale, actScales } of plans) {
      const runs = [];
      const combats = [];
      withDoubleEncounterScales(actScales, () => {
        for (const character of CHARACTERS) {
          for (let index = 0; index < options.runs; index++) {
            const seed = SEED_START + index * SEED_STEP;
            const result = runOne(character, seed, ascension, null, null, {
              onNormalCombat: combat => combats.push({ ...combat, character, seed })
            });
            if (result.stuck || (!result.win && !result.dead)) {
              throw new Error(`模拟未完成：${character} seed=${seed} asc=${ascension} scale=${scale}`);
            }
            runs.push({ ...result, character, seed });
          }
        }
      });
      configs.push({ scale, actScales, ascension, runs, combats });
    }
  }
  return { options, configs };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}
function combatStats(rows) {
  return {
    count: rows.length,
    avgHpLoss: mean(rows.map(row => row.hpLoss)),
    medianHpLoss: percentile(rows.map(row => row.hpLoss), 0.5),
    p90HpLoss: percentile(rows.map(row => row.hpLoss), 0.9),
    avgTurns: mean(rows.map(row => row.turns)),
    avgDamageTaken: mean(rows.map(row => row.damageTaken)),
    medianDamageTaken: percentile(rows.map(row => row.damageTaken), 0.5),
    p90DamageTaken: percentile(rows.map(row => row.damageTaken), 0.9),
    noLossRate: rows.length ? rows.filter(row => row.hpLoss <= 0).length / rows.length : null,
    exactNoLossRate: rows.length ? rows.filter(row => row.hpLoss === 0).length / rows.length : null,
    damageFreeRate: rows.length ? rows.filter(row => row.damageTaken === 0).length / rows.length : null,
    deaths: rows.filter(row => row.dead).length,
    deathRate: rows.length ? rows.filter(row => row.dead).length / rows.length : null
  };
}
function matchedRatio(rows, field) {
  let singleTotal = 0, doubleTotal = 0;
  for (const act of [1, 2, 3]) {
    for (const stage of ['mid', 'late']) {
      const group = rows.filter(row => row.act === act && row.stage === stage);
      const singles = group.filter(row => row.enemyCount === 1);
      const doubles = group.filter(row => row.enemyCount === 2);
      if (!singles.length || !doubles.length) continue;
      singleTotal += mean(singles.map(row => row[field])) * doubles.length;
      doubleTotal += doubles.reduce((sum, row) => sum + row[field], 0);
    }
  }
  return singleTotal > 0 ? doubleTotal / singleTotal : null;
}
function targetDiagnostics(rows) {
  const firstKills = {};
  const secondKills = {};
  const deathAlive = {};
  const firstKillOutcomes = {};
  for (const row of rows) {
    const first = row.firstKill || 'none';
    const second = row.secondKill || 'none';
    firstKills[first] = (firstKills[first] || 0) + 1;
    secondKills[second] = (secondKills[second] || 0) + 1;
    const outcome = firstKillOutcomes[first] || { fights: 0, deaths: 0 };
    outcome.fights++;
    if (row.dead) {
      outcome.deaths++;
      for (const id of new Set(row.aliveAtDeath || [])) deathAlive[id] = (deathAlive[id] || 0) + 1;
    }
    firstKillOutcomes[first] = outcome;
  }
  return { firstKills, secondKills, deathAlive, firstKillOutcomes };
}
function summarizeConfig(config) {
  const { runs, combats, scale, actScales, ascension } = config;
  const characters = Object.fromEntries(['all', ...CHARACTERS].map(character => {
    const matches = character === 'all' ? runs : runs.filter(row => row.character === character);
    const fights = character === 'all' ? combats : combats.filter(row => row.character === character);
    const single = combatStats(fights.filter(row => row.enemyCount === 1));
    const double = combatStats(fights.filter(row => row.enemyCount === 2));
    return [character, {
      runs: matches.length,
      wins: matches.filter(row => row.win).length,
      winRate: matches.filter(row => row.win).length / matches.length,
      avgFinalHpPct: mean(matches.map(row => row.hp / row.maxHp)),
      avgNormalCombatHpLoss: mean(fights.map(row => row.hpLoss)),
      single, double,
      lossRatio: single.avgHpLoss > 0 ? double.avgHpLoss / single.avgHpLoss : null,
      matchedLossRatio: matchedRatio(fights, 'hpLoss'),
      matchedDamageRatio: matchedRatio(fights, 'damageTaken'),
      actDeaths: [1, 2, 3].map(act => matches.filter(row => row.dead && row.act === act).length),
      bossDeaths: matches.filter(row => row.dead && row.deathType === 'boss').length,
      lateNormalDeaths: fights.filter(row => row.dead && row.stage === 'late').length
    }];
  }));
  const stages = [];
  for (const act of [1, 2, 3]) {
    for (const stage of STAGES) {
      const rows = combats.filter(row => row.act === act && row.stage === stage);
      const single = combatStats(rows.filter(row => row.enemyCount === 1));
      const double = combatStats(rows.filter(row => row.enemyCount === 2));
      stages.push({ act, stage, ...combatStats(rows), single, double, doubles: double.count,
        doubleRate: rows.length ? double.count / rows.length : null,
        lossRatio: single.avgHpLoss > 0 ? double.avgHpLoss / single.avgHpLoss : null,
        damageRatio: single.avgDamageTaken > 0 ? double.avgDamageTaken / single.avgDamageTaken : null });
    }
  }
  const rows = [];
  for (const act of [1, 2, 3]) {
    for (let mapRow = 0; mapRow <= 8; mapRow++) {
      const fights = combats.filter(row => row.act === act && row.mapRow === mapRow);
      rows.push({ act, mapRow, floor: mapRow + 1,
        stage: mapRow <= 1 ? 'early' : mapRow <= 4 ? 'mid' : mapRow <= 7 ? 'late' : 'boss',
        ...combatStats(fights),
        allDeaths: runs.filter(row => row.dead && row.act === act && row.deathRow === mapRow).length });
    }
  }
  const encounters = [...new Set(combats.map(row => row.id))].sort().map(id => {
    const rows = combats.filter(row => row.id === id);
    return { id, act: rows[0].act, stage: [...new Set(rows.map(row => row.stage))].join('/'), enemyCount: rows[0].enemyCount,
      ...combatStats(rows), ...(rows[0].enemyCount === 2 ? targetDiagnostics(rows) : {}) };
  });
  const overall = characters.all;
  const rates = CHARACTERS.map(character => characters[character].winRate);
  const mid = stages.filter(row => row.stage === 'mid');
  const late = stages.filter(row => row.stage === 'late');
  const midCount = mid.reduce((sum, row) => sum + row.count, 0);
  const lateCount = late.reduce((sum, row) => sum + row.count, 0);
  const midDeaths = mid.reduce((sum, row) => sum + row.deaths, 0);
  const lateDeaths = late.reduce((sum, row) => sum + row.deaths, 0);
  const midRate = midCount ? midDeaths / midCount : 0;
  const lateRate = lateCount ? lateDeaths / lateCount : 0;
  const warnings = [];
  if (overall.matchedDamageRatio != null && overall.matchedDamageRatio < 1.10) warnings.push('DOUBLE TOO EASY');
  if (overall.matchedDamageRatio != null && overall.matchedDamageRatio > 1.80) warnings.push('DOUBLE TOO PUNISHING');
  if (Math.max(...rates) - Math.min(...rates) > 0.15) warnings.push('CHARACTER GAP');
  if (lateRate >= midRate * 2 && lateRate - midRate >= 0.02) warnings.push('LATE DEATH SPIKE');
  return { scale, actScales, ascension, characters, stages, rows, encounters, warnings, midNormalDeathRate: midRate, lateNormalDeathRate: lateRate };
}

function summarizeBalance(balance) {
  const configs = balance.configs.map(summarizeConfig);
  const paired = [];
  for (const ascension of balance.options.ascensions) {
    const baseline = balance.configs.find(config => config.ascension === ascension && config.scale === balance.options.scales[0]);
    if (!baseline) continue;
    for (const config of balance.configs.filter(row => row.ascension === ascension && row !== baseline)) {
      const baselineByKey = new Map(baseline.runs.map(row => [`${row.character}:${row.seed}`, row]));
      let baselineWinCandidateLoss = 0, baselineLossCandidateWin = 0;
      for (const run of config.runs) {
        const before = baselineByKey.get(`${run.character}:${run.seed}`);
        if (before.win && !run.win) baselineWinCandidateLoss++;
        if (!before.win && run.win) baselineLossCandidateWin++;
      }
      paired.push({ ascension, baselineScale: baseline.scale, candidateScale: config.scale,
        baselineWinCandidateLoss, baselineLossCandidateWin });
    }
  }
  return { options: balance.options, configs, paired };
}

function fixed(value, digits = 1) { return value == null ? '' : Number(value).toFixed(digits); }
function printSummary(summary) {
  console.log('===== Encounter Balance =====');
  for (const config of summary.configs) {
    const chars = config.characters;
    console.log(`Scale ${config.scale} / Asc ${config.ascension}: 总胜率 ${fixed(chars.all.winRate * 100)}% | 剑修 ${fixed(chars.sword.winRate * 100)}% | 丹修 ${fixed(chars.alchemist.winRate * 100)}% | 体修 ${fixed(chars.monk.winRate * 100)}%`);
    console.log(`  单怪净耗血 ${fixed(chars.all.single.avgHpLoss)} / 双怪净耗血 ${fixed(chars.all.double.avgHpLoss)} / 同阶段承伤比 ${fixed(chars.all.matchedDamageRatio, 2)} | 单怪 ${fixed(chars.all.single.avgTurns, 2)} 回合 / 双怪 ${fixed(chars.all.double.avgTurns, 2)} 回合`);
    if (config.warnings.length) console.log(`  ⚠ ${config.warnings.join(' · ')}`);
  }
  console.log('scale,ascension,character,runs,wins,winRate,avgFinalHpPct,avgNormalCombatHpLoss,avgSingleHpLoss,avgDoubleHpLoss,singleTurns,doubleTurns,act1Deaths,act2Deaths,act3Deaths,lateDeaths');
  for (const config of summary.configs) {
    for (const character of ['all', ...CHARACTERS]) {
      const row = config.characters[character];
      console.log([config.scale, config.ascension, character, row.runs, row.wins, fixed(row.winRate, 4),
        fixed(row.avgFinalHpPct, 4), fixed(row.avgNormalCombatHpLoss, 2), fixed(row.single.avgHpLoss, 2),
        fixed(row.double.avgHpLoss, 2), fixed(row.single.avgTurns, 2), fixed(row.double.avgTurns, 2),
        ...row.actDeaths, row.lateNormalDeaths].join(','));
    }
  }
}

function resultFilename(options) {
  const reference = options.runs === 1000 && JSON.stringify(options.ascensions) === JSON.stringify([0, 5]);
  if (reference && JSON.stringify(options.scales) === JSON.stringify(DEFAULT_SCALES) && !options.actScales) {
    return 'encounter-v2-results.json';
  }
  if (reference && JSON.stringify(options.scales) === JSON.stringify([0.45]) &&
      JSON.stringify(options.actScales) === JSON.stringify([[0.50, 0.45, 0.45], [0.50, 0.55, 0.60]])) {
    return 'encounter-v2-mixed-results.json';
  }
  if (reference && JSON.stringify(options.scales) === JSON.stringify([]) &&
      JSON.stringify(options.actScales) === JSON.stringify([[0.50, 0.45, 0.45]])) {
    return 'encounter-v2-adopted-results.json';
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify({
    runs: options.runs, ascensions: options.ascensions, scales: options.scales,
    actScales: options.actScales || []
  })).digest('hex').slice(0, 12);
  return `encounter-v2-custom-${digest}.json`;
}
function writeResults(summary) {
  const directory = path.join(__dirname, '..', 'docs', 'balance');
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, resultFilename(summary.options));
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n');
  return jsonPath;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = summarizeBalance(runBalance(options));
    printSummary(summary);
    if (!options.quick) console.log(`汇总数据：${writeResults(summary)}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { withDoubleEncounterScales, parseArgs, runBalance, summarizeConfig, summarizeBalance, combatStats, resultFilename };
