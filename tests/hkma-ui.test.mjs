/* Static checks for tracked text files. Run: node tests/hkma-ui.test.mjs */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { sortPatternRows } from '../js/rules.js';
import { drawTile } from '../js/tiles.js';

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
  assert.doesNotMatch(html, /id="helpFanTableBtn"/);
  assert.doesNotMatch(html, /前往番數表/);
});

test('HUD 顯示本場起糊番數', () => {
  const game = readFileSync('js/game.js', 'utf8');
  assert.match(html, /id="minFanCount"/);
  assert.match(game, /ui\.minFanCount/);
  assert.match(game, /match\.minFan \?\? game\.matchSetup\?\.minFan \?\? 0/);
});

test('玩法說明清單可多於六項且保留固定入口', () => {
  assert.match(html, /id="payoutTableTitle"/);
  assert.match(html, /id="patternsBody"/);
});

test('自訂牌型排在牌型表最底', () => {
  const rows = [
    { id: '人胡', fan: 10, category: '自訂牌型' },
    { id: '平糊', fan: 1 },
    { id: '花糊', fan: 3 },
    { id: '七對子', fan: 3, category: '自訂牌型' },
  ];
  assert.deepEqual(sortPatternRows(rows).map((r) => r.id),
    ['平糊', '花糊', '七對子', '人胡']);
});

test('牌圖版本已升級且沒有雙重立體疊圖', () => {
  const tiles = readFileSync('js/tiles.js', 'utf8');
  const css = readFileSync('css/style.css', 'utf8');
  assert.match(tiles, /TILE_ASSET_VERSION = 8;/);
  assert.doesNotMatch(tiles, /createLinearGradient\(-width \/ 2, -height \/ 2/);
  assert.doesNotMatch(css, /\.tile-img:not\(\.tile-fallback\)::before/);
  assert.equal(statSync('scripts/restyle_tiles.py').isFile(), true);
});

test('43 張牌圖都是 RGBA 120x181', () => {
  const files = readdirSync('assets/tiles/faces').filter((f) => f.endsWith('.png'));
  assert.equal(files.length, 43);
  for (const file of files) {
    const buf = readFileSync(`assets/tiles/faces/${file}`);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    assert.equal(buf.readUInt32BE(16), 120, file);
    assert.equal(buf.readUInt32BE(20), 181, file);
    assert.equal(buf[25], 6, `${file} must be RGBA`);
  }

  // Canvas tiles must keep the PNG's natural aspect, like DOM tiles do.
  const drawn = [];
  const ctx = {
    save() {}, translate() {}, restore() {},
    drawImage(...args) { drawn.push(args); },
  };
  const image = { complete: true, naturalWidth: 120, naturalHeight: 181 };
  drawTile(ctx, 'T1', 0, 0, 132, 176, { images: { T1: image } });
  assert.equal(drawn.length, 1);
  const [, dx, dy, dw, dh] = drawn[0];
  const expectedHeight = 176;
  const expectedWidth = 120 * expectedHeight / 181;
  assert.ok(Math.abs(dh - expectedHeight) < 1e-6, `drawImage height ${dh}`);
  assert.ok(Math.abs(dw - expectedWidth) < 1e-6, `drawImage width ${dw}`);
  assert.ok(Math.abs(dw / dh - 120 / 181) < 1e-6, 'drawImage must keep the PNG aspect');
  assert.ok(Math.abs(dx + dw / 2) < 1e-6 && Math.abs(dy + dh / 2) < 1e-6,
    'drawImage must centre the fitted tile');
});

test('玩家版本與 cachebust 已更新', () => {
  const html = readFileSync('index.html', 'utf8');
  const game = readFileSync('js/game.js', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  assert.match(html, /css\/style\.css\?v=1\.4\.98/);
  assert.match(html, /js\/game\.js\?v=1\.4\.98/);
  assert.match(game, /\.\/tiles\.js\?v=1\.4\.98/);
  assert.match(game, /\.\/rules\.js\?v=1\.4\.97/);
  assert.match(readme, /\?v=1\.4\.98/);
  assert.match(changelog, /^## 1\.4\.98/m);

  const restyle = readFileSync('scripts/restyle_tiles.py', 'utf8');
  assert.doesNotMatch(restyle, /add_shadow/);
  assert.doesNotMatch(restyle, /RECOLOUR_TOLERANCE/);
  assert.doesNotMatch(restyle, /FACE_TARGET/);
  const process = readFileSync('scripts/process_assets.py', 'utf8');
  assert.match(process, /120×181/);
});

console.log(`結果：${passed} 通過，${failed} 失敗`);
process.exitCode = failed ? 1 : 0;
