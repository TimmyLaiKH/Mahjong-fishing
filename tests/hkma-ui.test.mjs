/* Static checks for tracked text files. Run: node tests/hkma-ui.test.mjs */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message.split('\n').join('\n    ')}`);
  }
}

const oldChar = String.fromCharCode(0x5E7A);

test('所有 tracked 檔案都不再有舊字', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const offenders = files.filter((name) => {
    try { return readFileSync(name, 'utf8').includes(oldChar); }
    catch { return false; }
  });
  assert.deepEqual(offenders, []);
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
