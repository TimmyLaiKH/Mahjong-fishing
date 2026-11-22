/* Tests for the pure payout engine. Run: node tests/payout.test.mjs */
import assert from 'node:assert/strict';
import { payoutMultiplier, payoutValue, settleRound, winPayout } from '../js/payout.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (error) { failed += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
}

console.log('\n— 香港麻雀賠率表 —');

const TABLE = [
  [0, 1], [1, 2], [2, 4], [3, 8], [4, 16], [5, 24], [6, 32], [7, 48],
  [8, 64], [9, 96], [10, 128], [11, 192], [12, 256], [13, 384],
  [14, 512], [15, 768], [16, 1024], [17, 1536], [18, 2048], [19, 3072],
  [20, 4096], [22, 8192], [25, 24576],
];

test('賠率表與 Wikipedia 一致並延伸到 25 番', () => {
  for (const [fan, expected] of TABLE) {
    assert.equal(payoutMultiplier(fan), expected, `${fan} 番應為 ${expected}`);
    assert.equal(payoutValue(fan, 1), expected, `${fan} 番金額倍數 1 應為 ${expected}`);
  }
});

test('金額倍數線性放大', () => {
  assert.equal(payoutValue(5, 100), 2400);
  assert.equal(payoutValue(13, 100), 38400);
});

test('放槍由出銃者支付 V', () => {
  assert.deepEqual(winPayout(5, 100, false), {
    value: 2400, each: 2400, total: 2400, selfDraw: false,
  });
});

test('自摸三家各付 V/2，贏家共得 1.5 V', () => {
  assert.deepEqual(winPayout(5, 100, true), {
    value: 2400, each: 1200, total: 3600, selfDraw: true,
  });
});

console.log('\n— 結算與連莊 —');

test('自摸從三家扣錢給贏家', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: 2, fan: 5, base: 1,
    selfDraw: true, dealerSeat: 0, totalWinds: 4,
  });
  assert.deepEqual(r.money, [988, 988, 1036, 988]);
  assert.equal(r.payout.total, 36);
});

test('放槍只有出銃者付錢', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: 1, discarder: 3,
    fan: 4, base: 1, selfDraw: false, dealerSeat: 0, totalWinds: 4,
  });
  assert.deepEqual(r.money, [1000, 1016, 1000, 984]);
});

test('莊家胡牌連莊，圈數不推進', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: 0, fan: 3, base: 1,
    selfDraw: true, dealerSeat: 0, repeatCount: 2, handNumber: 1, totalWinds: 4,
  });
  assert.equal(r.dealerSeat, 0);
  assert.equal(r.repeatCount, 3);
  assert.equal(r.handNumber, 1);
  assert.equal(r.log.dealerWon, true);
});

test('非莊家胡牌換莊並推進一手', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: 2, discarder: 1,
    fan: 2, base: 1, selfDraw: false, dealerSeat: 0, repeatCount: 1,
    handNumber: 1, totalWinds: 4,
  });
  assert.equal(r.dealerSeat, 1);
  assert.equal(r.repeatCount, 0);
  assert.equal(r.handNumber, 2);
  assert.equal(r.windIndex, 0);
});

test('四手後進入下一圈', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: null,
    dealerSeat: 3, handNumber: 3, totalWinds: 4,
  });
  assert.equal(r.dealerSeat, 0);
  assert.equal(r.handNumber, 4);
  assert.equal(r.windIndex, 1);
});

test('有人破產時比賽結束', () => {
  const r = settleRound({
    money: [10, 1000, 1000, 1000], winner: 1, discarder: 0,
    fan: 5, base: 1, selfDraw: false, dealerSeat: 0, totalWinds: 4,
  });
  assert.equal(r.money[0], 10 - 24);
  assert.equal(r.over, true);
});

test('打完指定圈數後比賽結束', () => {
  const r = settleRound({
    money: [1000, 1000, 1000, 1000], winner: null,
    dealerSeat: 3, handNumber: 3, totalWinds: 1,
  });
  assert.equal(r.over, true);
});

test('流局不扣錢但換莊', () => {
  const r = settleRound({
    money: [500, 600, 700, 800], winner: null,
    dealerSeat: 1, handNumber: 0, totalWinds: 4,
  });
  assert.deepEqual(r.money, [500, 600, 700, 800]);
  assert.equal(r.payout, null);
  assert.equal(r.dealerSeat, 2);
  assert.equal(r.handNumber, 1);
});

console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
process.exitCode = failed ? 1 : 0;
