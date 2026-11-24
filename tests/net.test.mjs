/* Regression test for PeerJS-safe outgoing messages. Run: node tests/net.test.mjs */
import assert from 'node:assert/strict';
import { networkSafe } from '../js/net.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}

test('非有限數字轉成 null，胡牌結果可以序列化', () => {
  const message = networkSafe({
    t: 'win',
    result: { fanCap: Infinity, totalFan: 13, scores: [NaN, 1, undefined] },
  });
  assert.equal(message.t, 'win');
  assert.equal(message.result.fanCap, null);
  assert.equal(message.result.totalFan, 13);
  assert.deepEqual(message.result.scores, [null, 1, null]);

  // Room fan-cap settings travel as a boolean; a raw Infinity would break PeerJS.
  const settings = networkSafe({
    t: 'settings',
    settings: { minFan: 3, fanCapTen: false, rawCap: Infinity },
  });
  assert.equal(settings.settings.minFan, 3);
  assert.equal(settings.settings.fanCapTen, false);
  assert.equal(settings.settings.rawCap, null);
});

test('純資料保持不變，特殊物件轉成 null', () => {
  const message = networkSafe({ t: 'emoji', seat: 2, emoji: '😀', extra: new Map() });
  assert.deepEqual(message, { t: 'emoji', seat: 2, emoji: '😀', extra: null });
});

console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
if (failed) process.exitCode = 1;
