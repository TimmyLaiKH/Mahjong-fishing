import assert from 'node:assert/strict';
import * as rules from '../js/rules.js';

const { FAN_VALUES, PATTERN_TABLE, evaluateHand } = rules;

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
const tiles = (spec) => String(spec).trim().split(/\s+/);
const names = (result) => result.patterns.map((pattern) => pattern.id);
const evalTiles = (spec, extra = {}) => evaluateHand({ concealed: tiles(spec), ...extra });

const EXPECTED_FAN = Object.freeze({
  一般高: 1, 一般低: 1, 缺門: 1,
  三般高: 2, 三般低: 2, 一條龍: 2,
  兩般高: 3, 兩般低: 3, 鏡糊糊: 3, 四般高: 3, 四般低: 3,
  三槓子: 3, 三喜臨門: 3, 雙色同刻: 3, 四歸四: 3,
  萬綠叢中一點紅: 10, 百萬石: 10, 紅孔雀: 10,
  七對子: 3, 人胡: 10, 綠一色: 10, 藍一色: 10,
});

test('approved custom patterns are in the fan table with wiki values', () => {
  for (const [id, fan] of Object.entries(EXPECTED_FAN)) {
    assert.equal(FAN_VALUES[id], fan, `${id} fan`);
  }
  assert.equal(FAN_VALUES.冧手胡, undefined);
  assert.equal(FAN_VALUES.鐘鼓齊鳴, undefined);
});

test('every custom pattern row has a validated example', () => {
  const customRows = PATTERN_TABLE.filter((row) => row.category === '自訂牌型');
  for (const id of Object.keys(EXPECTED_FAN)) {
    const row = customRows.find((entry) => entry.id === id);
    assert.ok(row, `missing PATTERN_TABLE row for ${id}`);
    assert.ok(row.desc, `${id} needs desc`);
    assert.ok(row.example, `${id} needs example`);
    const result = typeof row.example === 'string'
      ? evalTiles(row.example, row.context ?? {})
      : evaluateHand(row.example);
    assert.ok(names(result).includes(id), `${id} example must evaluate to ${id}: ${names(result).join(',')}`);
  }
});

test('customPatterns false disables every custom pattern', () => {
  const sevenPairs = 'm1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E E C C';
  assert.ok(names(evalTiles(sevenPairs)).includes('七對子'));
  const off = evalTiles(sevenPairs, { context: { customPatterns: false } });
  assert.ok(!names(off).includes('七對子'));
  const green = 's2 s3 s4 s2 s3 s4 s6 s6 s6 F F F s8 s8';
  assert.ok(names(evalTiles(green)).includes('綠一色'));
  assert.ok(!names(evalTiles(green, { context: { customPatterns: false } })).includes('綠一色'));
});

test('一條龍 is absorbed by 九子連環', () => {
  const result = evalTiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m5', { context: { customPatterns: true } });
  assert.ok(names(result).includes('九子連環'));
  assert.ok(!names(result).includes('一條龍'));
  const breakdown = JSON.stringify(result.patterns);
  assert.match(breakdown, /一條龍/);
});

test('兩般低 recognises two disjoint step-runs in the same suit', () => {
  const hand = 'm1 m2 m2 m3 m3 m4 m5 m6 m6 m7 m7 m8 E E';
  const result = evalTiles(hand, { context: { customPatterns: true } });
  assert.ok(names(result).includes('兩般低'), names(result).join(','));
});

test('detectCustomPatterns returns id/fan/detail entries only', () => {
  const concealed = tiles('m1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E E C C');
  const result = rules.detectCustomPatterns({
    concealed, groups: [], melds: [], sets: [], pair: null, context: {},
  });
  assert.ok(Array.isArray(result));
  assert.ok(result.some((entry) => entry.id === '七對子' && entry.fan === 3));
  for (const entry of result) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.fan, 'number');
  }
});

test('清一色不誤判缺門與百萬石', () => {
  const oneSuit = 'm9 m9 m9 m8 m8 m8 m7 m7 m7 m6 m6 m6 m5 m5';
  const result = evalTiles(oneSuit, { context: { customPatterns: true } });
  assert.ok(!names(result).includes('缺門'));
  assert.ok(!names(result).includes('百萬石'));
  const kongHand = evaluateHand({
    concealed: ['m9', 'm9'],
    melds: ['m1', 'p2', 's3', 's4'].map((tile) => ({ tile, type: 'kong', tiles: [tile, tile, tile, tile] })),
    context: { customPatterns: true },
  });
  assert.ok(!names(kongHand).includes('百萬石'));
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
