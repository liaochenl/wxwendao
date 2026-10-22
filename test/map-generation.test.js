'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

function generated(seed, act) {
  const state = E.createRun({ characterId: 'sword', seed, ascension: 5 });
  return act === 1 ? state.map : E.generateMap(state, act);
}
function signature(map) {
  return map.nodes.map(node => [node.id, node.type, node.route, node.next]);
}
function reachable(map, startId) {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  const seen = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of byId.get(id)?.next || []) stack.push(next);
  }
  return seen;
}

test('横向位置决定路线倾向，不消耗随机数', () => {
  assert.equal(E.getMapRouteProfile({ col: 0 }, [{}, {}, {}]), 'safe');
  assert.equal(E.getMapRouteProfile({ col: 1 }, [{}, {}, {}]), 'resource');
  assert.equal(E.getMapRouteProfile({ col: 2 }, [{}, {}, {}]), 'danger');
  assert.equal(E.getMapRouteProfile({ col: 0 }, [{}, {}]), 'safe');
  assert.equal(E.getMapRouteProfile({ col: 1 }, [{}, {}]), 'danger');
  assert.equal(E.getMapRouteProfile({ col: 0 }, [{}]), 'resource');
});

test('节点权重遵守阶段合法性与所有入边的特殊节点限制', () => {
  const base = { act: 2, route: 'danger', typeCounts: { shop: 0, event: 0, elite: 0, treasure: 1, rest: 0 }, predecessors: [] };
  const early = E.getMapTypeWeights({ ...base, row: 1 });
  assert.equal(early.elite, 0);
  assert.equal(early.rest, 0);
  const sixth = E.getMapTypeWeights({ ...base, row: 6 });
  assert.equal(sixth.rest, 0);
  const blocked = E.getMapTypeWeights({ ...base, row: 4, predecessors: [{ type: 'shop' }, { type: 'elite' }] });
  assert.equal(blocked.shop, 0);
  assert.equal(blocked.elite, 0);
  const safe = E.getMapTypeWeights({ ...base, route: 'safe', row: 4 });
  const danger = E.getMapTypeWeights({ ...base, row: 4 });
  assert.ok(safe.rest > danger.rest);
  assert.ok(danger.elite > safe.elite);
});

test('同一输入地图完全复现，不同种子保留变化', () => {
  for (const act of [1, 2, 3]) {
    assert.deepEqual(signature(generated(10000, act)), signature(generated(10000, act)));
    const unique = new Set([100, 101, 102, 103, 104].map(seed => JSON.stringify(signature(generated(seed, act)))));
    assert.ok(unique.size > 1);
  }
});

test('三幕共三千张地图满足连通、节点配额与连续限制', () => {
  for (let seed = 10000; seed < 11000; seed++) {
    for (const act of [1, 2, 3]) {
      const map = generated(seed, act);
      const check = E.validateMap(map);
      assert.equal(check.valid, true, `seed=${seed} act=${act}: ${check.errors?.join('; ')}`);
      assert.equal(map.byRow[0].length, 3);
      assert.equal(map.byRow[7].length, 2);
      assert.ok(map.byRow.slice(1, 7).every(row => row.length >= 2 && row.length <= 3));
      const seen = new Set(map.byRow[0].flatMap(node => [...reachable(map, node.id)]));
      assert.equal(seen.size, map.nodes.length, `unreachable node seed=${seed} act=${act}`);
      for (const node of map.nodes) assert.ok(reachable(map, node.id).has(map.bossId), `dead end ${node.id}`);
      const middle = map.nodes.filter(node => node.row >= 1 && node.row <= 6);
      const counts = Object.fromEntries(['shop', 'event', 'elite', 'treasure', 'rest'].map(type =>
        [type, middle.filter(node => node.type === type).length]));
      assert.ok(counts.shop >= 1 && counts.shop <= 2);
      assert.ok(counts.event >= 1 && counts.event <= 4);
      assert.ok(counts.treasure >= 1 && counts.treasure <= 2);
      assert.ok(counts.rest <= 2);
      assert.ok(counts.elite >= 1 && counts.elite <= (act === 1 ? 2 : 3));
      assert.ok(map.byRow.slice(3, 6).some(row => row.some(node => node.type === 'treasure')));
      assert.ok(map.byRow[6].every(node => node.type !== 'rest'));
    }
  }
});

test('大量地图中的稳健、机缘、险途有统计差异', () => {
  const totals = Object.fromEntries([1, 2, 3].map(act => [act, {
    mapCount: 0, types: { shop: 0, elite: 0, treasure: 0 },
    treasureRows: new Set(),
    routes: Object.fromEntries(['safe', 'resource', 'danger'].map(route => [route, { nodes: 0, elite: 0, resource: 0, recovery: 0, treasure: 0 }]))
  }]));
  for (let seed = 20000; seed < 20500; seed++) {
    for (const act of [1, 2, 3]) {
      const row = totals[act];
      row.mapCount++;
      const map = generated(seed, act);
      for (const node of map.nodes.filter(node => node.row >= 1 && node.row <= 6)) {
        if (row.types[node.type] != null) row.types[node.type]++;
        const route = row.routes[node.route];
        route.nodes++;
        if (node.type === 'elite') route.elite++;
        if (['event', 'shop', 'treasure'].includes(node.type)) route.resource++;
        if (['rest', 'shop'].includes(node.type)) route.recovery++;
        if (node.type === 'treasure') {
          route.treasure++;
          if (node.row >= 3 && node.row <= 5) row.treasureRows.add(node.row);
        }
      }
    }
  }
  const all = Object.fromEntries(['safe', 'resource', 'danger'].map(route => [route,
    Object.values(totals).reduce((sum, act) => {
      for (const key of ['nodes', 'elite', 'resource', 'recovery', 'treasure']) sum[key] += act.routes[route][key];
      return sum;
    }, { nodes: 0, elite: 0, resource: 0, recovery: 0, treasure: 0 })]));
  const rate = (route, field) => all[route][field] / all[route].nodes;
  assert.ok(rate('danger', 'elite') >= rate('safe', 'elite') * 1.5);
  assert.ok(rate('resource', 'resource') > rate('safe', 'resource'));
  assert.ok(rate('resource', 'resource') > rate('danger', 'resource'));
  assert.ok(rate('resource', 'treasure') > rate('safe', 'treasure'));
  assert.ok(rate('safe', 'treasure') > rate('danger', 'treasure'));
  assert.ok(rate('safe', 'recovery') > rate('danger', 'recovery'));
  for (const act of Object.values(totals)) assert.deepEqual([...act.treasureRows].sort(), [3, 4, 5]);
  const dangerElite = act => totals[act].routes.danger.elite / totals[act].routes.danger.nodes;
  assert.ok(dangerElite(3) >= dangerElite(2) - 0.01);
  assert.ok(dangerElite(2) >= dangerElite(1) - 0.01);
});

test('旧地图缺少 route 字段仍能读取并继续选择节点', () => {
  const state = E.createRun({ characterId: 'sword', seed: 42 });
  for (const node of state.map.nodes) delete node.route;
  const restored = E.deserialize(E.serialize(state));
  assert.ok(restored);
  assert.equal(E.availableNodes(restored).length, 3);
  assert.ok(E.enterNode(restored, E.availableNodes(restored)[0].id).ok);
});
