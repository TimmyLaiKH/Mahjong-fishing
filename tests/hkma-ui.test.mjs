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

const html = readFileSync('index.html', 'utf8');

test('玩法說明有三個分頁按鈕與三個面板', () => {
  for (const name of ['rules', 'patterns', 'payout']) {
    assert.match(html, new RegExp(`data-help-tab="${name}"`));
    assert.match(html, new RegExp(`id="helpTab${name[0].toUpperCase()}${name.slice(1)}"`));
  }
});

test('前往番數表會先切到牌型一覽分頁', () => {
  const game = readFileSync('js/game.js', 'utf8');
  assert.match(game, /function switchHelpTab\(/);
  assert.match(game, /function jumpToFanTable\(\)[\s\S]{0,400}switchHelpTab\('patterns'\)/);
});

test('玩法說明清單可多於六項且保留固定入口', () => {
  assert.match(html, /id="helpFanTableBtn"[^>]*>前往番數表</);
  assert.match(html, /id="payoutTableTitle"/);
  assert.match(html, /id="patternsBody"/);
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
