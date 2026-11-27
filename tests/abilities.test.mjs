import assert from 'node:assert/strict';
import {
  ABILITY_DEFS, characterAbility, bonusFanFor,
  cooldownReady, startCooldown, applyAbilityMoney, wildcardWaitTiles,
} from '../js/abilities.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
  }
}

test('ABILITY_DEFS has all 12 characters with correct kinds', () => {
  const ids = ['cat-boat', 'squid', 'giraffe', 'sparrow', 'bee', 'monkey',
    'phoenix', 'dragon', 'turtle', 'panda-raft', 'penguin', 'pig'];
  for (const id of ids) assert.ok(ABILITY_DEFS[id], `missing ${id}`);
  assert.equal(ABILITY_DEFS.monkey.cdSeconds, 180);
  assert.equal(ABILITY_DEFS.squid.cdSeconds, 60);
  assert.equal(ABILITY_DEFS.penguin.cdSeconds, 120);
  assert.equal(ABILITY_DEFS.giraffe.cdSeconds, 60);
});

test('characterAbility returns def', () => {
  assert.equal(characterAbility('cat-boat').kind, 'passive');
  assert.equal(characterAbility('squid').kind, 'active');
});

test('bonusFanFor bee = floor(flowers/2)', () => {
  assert.equal(bonusFanFor('bee', { flowerCount: 5 }), 2);
  assert.equal(bonusFanFor('bee', { flowerCount: 4 }), 2);
  assert.equal(bonusFanFor('bee', { flowerCount: 3 }), 1);
});

test('bonusFanFor panda = floor(sou/3)', () => {
  assert.equal(bonusFanFor('panda-raft', { souCount: 7 }), 2);
  assert.equal(bonusFanFor('panda-raft', { souCount: 9 }), 3);
});

test('bonusFanFor other characters is 0', () => {
  assert.equal(bonusFanFor('cat-boat', { flowerCount: 8, souCount: 9 }), 0);
});

test('applyAbilityMoney cat positive delta uses earnPct', () => {
  const r = applyAbilityMoney({
    before: [20, 20, 20, 20], settledMoney: [30, 20, 20, 20],
    characters: ['cat-boat', 'turtle', 'phoenix', 'pig'],
    revived: [false, false, false, false],
    earnPct: [0.3, 0, 0, 0], losePct: [0, 0, 0, 0],
  });
  assert.equal(r.money[0], 33); // 20 + round(10 * 1.3)
});

test('applyAbilityMoney turtle negative delta uses losePct', () => {
  const r = applyAbilityMoney({
    before: [20, 20, 20, 20], settledMoney: [10, 20, 20, 20],
    characters: ['turtle', 'turtle', 'turtle', 'turtle'],
    revived: [false, false, false, false],
    earnPct: [0, 0, 0, 0], losePct: [0.2, 0, 0, 0],
  });
  assert.equal(r.money[0], 12); // 20 - round(10 * 0.8)
});

test('applyAbilityMoney pig gains 5% interest', () => {
  const r = applyAbilityMoney({
    before: [20, 20, 20, 20], settledMoney: [20, 20, 20, 20],
    characters: ['pig', 'turtle', 'turtle', 'turtle'],
    revived: [false, false, false, false],
    earnPct: [0, 0, 0, 0], losePct: [0, 0, 0, 0],
  });
  assert.equal(r.money[0], 21); // 20 + round(20 * 0.05)
});

test('applyAbilityMoney phoenix revives to $1', () => {
  const r = applyAbilityMoney({
    before: [5, 20, 20, 20], settledMoney: [0, 20, 20, 20],
    characters: ['phoenix', 'turtle', 'turtle', 'turtle'],
    revived: [false, false, false, false],
    earnPct: [0, 0, 0, 0], losePct: [0, 0, 0, 0],
  });
  assert.equal(r.money[0], 1);
  assert.equal(r.revived[0], true);
});

test('applyAbilityMoney is deterministic for identical input', () => {
  const input = {
    before: [20, 20, 20, 20], settledMoney: [30, 10, 20, 20],
    characters: ['cat-boat', 'turtle', 'phoenix', 'pig'],
    revived: [false, false, true, false],
    earnPct: [0.3, 0, 0, 0], losePct: [0, 0.2, 0, 0],
  };
  const a = applyAbilityMoney(input);
  const b = applyAbilityMoney(input);
  assert.deepEqual(a, b);
});

test('monkey cooldown is 180 seconds and does not mutate', () => {
  assert.equal(cooldownReady({}, 'monkey', 1000), true);
  const cd = startCooldown({}, 'monkey', 1000);
  assert.equal(cd.monkey, 1180);
  assert.equal(cooldownReady(cd, 'monkey', 1179), false);
  assert.equal(cooldownReady(cd, 'monkey', 1180), true);
});

test('wildcardWaitTiles runs all 34 substitutes and returns multiple', () => {
  const concealed = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'WILD'];
  const waits = wildcardWaitTiles(concealed, [], {});
  // 4 melds + any substitute tile T is tenpai waiting on T -> all 34 kinds.
  assert.ok(waits.length > 1, `expected multiple waits, got ${waits.length}`);
  assert.equal(waits.length, 34);
  assert.ok(waits.includes('m9'));
  assert.ok(waits.includes('B'));
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
