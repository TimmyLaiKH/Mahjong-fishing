# Help Tabs, 么 Word Fix and Baked Tile Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved help-modal tabs, move custom patterns to the bottom of the pattern table, replace every `么` with `么`, and install the approved restyled CC0 tile PNGs into the game.

**Architecture:** Keep the static no-build architecture: HTML owns the new tab markup, CSS owns tab visibility/styling, `js/game.js` owns tab switching and table sorting, and `js/rules.js` exposes a small pure sorting helper. The approved restyle script becomes a repository script and `scripts/process_assets.py` applies it after regenerating faces, so runtime PNGs are reproducible without touching raw source art.

**Tech Stack:** Static HTML/CSS/ES modules, Node `.mjs` test harness with `node:assert/strict`, Pillow for PNG generation, PeerJS untouched.

**Spec:** `docs/superpowers/specs/2026-11-24-help-tabs-tile-edges-and-yao-word-design.md`

## Global Constraints

- All player-facing text stays Traditional Chinese.
- 玩法說明 may contain more than six `<li>`; it must be readable with the most important information first.
- `#helpFanTableBtn` text stays exactly `前往番數表` and must open the 牌型一覽 tab before scrolling to `#fanTableTitle`.
- `香港麻雀牌型一覽` is generated from `PATTERN_TABLE` + `FLOWER_PATTERN_TABLE`; every example remains validated.
- Patterns with `category: '自訂牌型'` are `七對子`, `人胡`, `綠一色`, `藍一色`; they stay at the bottom of the table and keep their in-name tag only.
- No occurrence of the old character remains in any tracked text file.
- Runtime tile faces are the 43 approved PNGs: 144×205 RGBA, transparent corner `(0,0,0,0)`, face green `(26,125,26)`, face grey `(176,176,181)`, back ivory top, back dark-green side `(26,125,26)`, back body green `(34,158,34)`.
- Raw sources under `assets/tiles/raw/` are never overwritten.
- Remove only the 1.4.96 CSS/canvas bevel; keep the optional canvas `shadow` option and DOM `drop-shadow`.
- `TILE_ASSET_VERSION = 7`; app version/cachebust becomes `1.4.97` in `README.md`, `index.html` and `js/game.js` rule/tile imports.
- `FAN_CAP` stays `Infinity`; localStorage keys stay only `mf-sound`, `mf-volume`, `mf-fantotal`, `mf-hookspeed`, `mf-gameseconds`.
- Required suite outputs stay exactly `64 通過，0 失敗`, `12 通過，0 失敗`, `2 通過，0 失敗`; the new static suite is run explicitly.
- If `node` is not on PATH use `/home/timmy/.local/node/bin/node`.

## Review Focus

- **Hidden help panel plus jump button:** if `#helpFanTableBtn` scrolls while the pattern panel is hidden, the button appears dead; Task 2 pins `jumpToFanTable()` calling `switchHelpTab('patterns')` and a fresh browser click check.
- **Old character in tests/docs/IDs:** a partial rename breaks rule tests or leaves contractual strings stale; Task 1 pins zero matches across tracked text and reruns 64/12/2 suites.
- **Custom patterns in generated table:** sorting only by fan mixes custom patterns into official rows; Task 3 pins `sortPatternRows()` with fake rows and browser check that the four custom rows are last.
- **Tile alpha/double 3D:** opaque corners or leftover bevels produce square corners and layered shadows; Task 4 pins PNG header/colour type and absence of bevel code, plus a zoomed-corner browser check.
- **Stale cache/geometry:** old cached assets or extra modal height can hide the fix; Task 5 pins version strings and checks widths 320/375/768/1073/1366 px, no horizontal overflow, fixed HUD/canvas geometry, no console errors, and no 404s.

---

## File Structure

- `tests/hkma-ui.test.mjs` — new explicit static suite; grows one task at a time using the existing tiny harness.
- `index.html` — help modal tab markup, panel wrappers, cachebusts, unchanged button IDs.
- `css/style.css` — help tab styles; remove `.tile-img:not(.tile-fallback)::before`.
- `js/game.js` — `switchHelpTab()`, updated `jumpToFanTable()`, tab listeners, import of `sortPatternRows`, `buildPatternTable()` sorting, cachebusts.
- `js/rules.js` — pure `sortPatternRows()` export; old-character rename; `FAN_CAP` unchanged.
- `js/tiles.js` — `TILE_ASSET_VERSION = 7`; remove canvas bevel block from `drawTile()`.
- `scripts/restyle_tiles.py` — copy of the approved final restyle script.
- `scripts/process_assets.py` — applies restyle script output to generated faces.
- `assets/tiles/faces/*.png` — 43 approved runtime PNGs replaced; raw sources untouched.
- `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CREDITS.md`, spec doc — copy/version/reproducibility updates.

### Task 1: Add Static Suite and Replace the Old Character Everywhere

**Files:**
- Create: `tests/hkma-ui.test.mjs`
- Modify: all tracked text files containing the old character, including `js/rules.js`, `js/game.js`, `index.html`, `tests/rules.test.mjs`, README/CHANGELOG/AGENTS/CREDITS and docs.

**Interfaces:**
- Consumes: existing tiny test harness style from `tests/rules.test.mjs`.
- Produces: `node tests/hkma-ui.test.mjs` static suite; a tracked tree with zero old-character matches.

- [ ] **Step 1: Write the failing static test**

Create `tests/hkma-ui.test.mjs` with the same `passed`/`failed` counters and `test(name, fn)` helper as `tests/rules.test.mjs`. Do not write the old character literally in this file; use `const oldChar = String.fromCharCode(0x5E7A)`. Use `git ls-files` plus `node:fs` to read text files and assert:

```js
test('所有 tracked 檔案都不再有舊字', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const offenders = files.filter((name) => {
    try { return readFileSync(name, 'utf8').includes(oldChar); }
    catch { return false; }
  });
  assert.deepEqual(offenders, []);
});
```

End with `console.log(\`結果：${passed} 通過，${failed} 失敗\`)` and `process.exitCode = failed ? 1 : 0`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/hkma-ui.test.mjs`
Expected: FAIL with a non-empty offender list.

- [ ] **Step 3: Replace the character across tracked files**

Run a Python pass over `git ls-files`, using `old = '\u5e7a'` and `new = '么'`, skipping files that cannot decode as UTF-8. Change IDs, player strings, comments, test names, assertions, historical changelog entries, docs and plan files together. Do not add a new storage key or network field.

- [ ] **Step 4: Run all suites and verify**

Run:

```sh
node --check js/rules.js
node --check js/game.js
node tests/hkma-ui.test.mjs
node tests/rules.test.mjs
node tests/payout.test.mjs
node tests/net.test.mjs
git diff --check
```

Expected: static suite `1 通過，0 失敗`; rules `64 通過，0 失敗`; payout `12 通過，0 失敗`; net `2 通過，0 失敗`; no diff-check errors.

- [ ] **Step 5: Commit**

```sh
git add -A
git commit -m "將舊字統一為么並加入靜態檢查"
```

### Task 2: Split 玩法說明 into Three Tabs

**Files:**
- Modify: `index.html:202-250`
- Modify: `css/style.css:527-556`
- Modify: `js/game.js:6288-6299`, `js/game.js:6576-6582`
- Test: `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: `#helpPanel`, `#helpFanTableBtn`, `#fanTableTitle`, `#payoutTableTitle`, `#patternsBody`.
- Produces: `switchHelpTab(name)` with `name` one of `rules|patterns|payout`; panels `#helpTabRules`, `#helpTabPatterns`, `#helpTabPayout`.

- [ ] **Step 1: Add failing tab tests**

Append to `tests/hkma-ui.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/hkma-ui.test.mjs`
Expected: FAIL for the missing tab buttons/panels and `switchHelpTab()`.

- [ ] **Step 3: Add the tab markup**

In `index.html`, keep `.modal-head` and `#helpFanTableBtn`, then insert a `.help-tabs` `role="tablist"` with three buttons in this order: `玩法說明` (`data-help-tab="rules"`), `牌型一覽` (`patterns`), `派彩計算表` (`payout`). Wrap content in three `.help-tab-panel` divs with ids above; show rules by default, hide the other two with `hidden`. Move the existing payout heading/table/hint into `#helpTabPayout`; move the HKMA hint, `#fanTableTitle`, generated table and closing footnote into `#helpTabPatterns`. Reorganise the rules `<ol class="help-list">` into readable short items with important information first: cast/fish/win basics, controls, opponents/claims and 牌王, fan/起糊/派彩 entry, flowers/kongs, scoring authority/custom patterns, endless sea, waits/timer/settings/voice. Keep all existing factual content and fixed strings; do not add a bottom `釣魚` button.

- [ ] **Step 4: Add tab styling**

In `css/style.css` near `.modal-head`, add `.help-tabs`, `.help-tab`, `.help-tab.active` and `.help-tab-panel[hidden] { display: none; }`. Use existing modal colours; do not change `#hud`, canvas or `.modal-card` dimensions.

- [ ] **Step 5: Implement tab switching**

In `js/game.js`, define `switchHelpTab(name)`: find buttons `[data-help-tab]` inside `#helpPanel`, toggle `active`/`aria-selected`, toggle matching `.help-tab-panel` `hidden` and `aria-hidden`, and reset the help card `scrollTop` to 0. Make `jumpToFanTable()` call `switchHelpTab('patterns')` before its existing scroll/focus logic. Make both `menuHelp` and `helpBtn` listeners call `switchHelpTab('rules')` before `openModal('helpPanel')`. Wire each tab button to `switchHelpTab(button.dataset.helpTab)`. Keep the existing `#helpFanTableBtn` listener.

- [ ] **Step 6: Run tests and browser check**

Run: `node tests/hkma-ui.test.mjs`
Expected: `4 通過，0 失敗`.

Open `index.html?test=1&v=1.4.97-task2`, click each tab, then click `前往番數表`. Expected: correct panel visible, pattern title focused/scrolled, no console errors, HUD/canvas geometry unchanged.

- [ ] **Step 7: Commit**

```sh
git add index.html css/style.css js/game.js tests/hkma-ui.test.mjs
git commit -m "將玩法說明分為三個分頁"
```

### Task 3: Put Custom Patterns at the Bottom

**Files:**
- Modify: `js/rules.js` near `FAN_CAP` or table exports
- Modify: `js/game.js:13-17`, `js/game.js:6344-6375`
- Modify: `index.html:240`
- Test: `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: `PATTERN_TABLE`, `FLOWER_PATTERN_TABLE`, `pattern.category`, `pattern.fan`.
- Produces: `sortPatternRows(rows)` returning a new sorted array; official/flower rows first by fan, `category: '自訂牌型'` rows last by fan.

- [ ] **Step 1: Add failing sort test**

Append:

```js
import { sortPatternRows } from '../js/rules.js';
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/hkma-ui.test.mjs`
Expected: FAIL because `sortPatternRows` is not exported.

- [ ] **Step 3: Implement the pure sorter and use it**

In `js/rules.js`, export `sortPatternRows(rows)` with signature `(rows: Array<{fan:number, category?:string}>) => Array`. Sort by `(isCustom(a) - isCustom(b)) || (a.fan - b.fan)`, where `isCustom(row)` is `row.category === '自訂牌型'`. In `js/game.js`, add `sortPatternRows` to the `./rules.js?v=1.4.97` import and replace the inline sort in `buildPatternTable()` with `sortPatternRows([...PATTERN_ROWS, ...FLOWER_PATTERN_TABLE])`. Rename `#fanTableTitle` text to `香港麻雀牌型一覽`. Keep the `pattern-category` tag logic unchanged.

- [ ] **Step 4: Run tests and browser check**

Run: `node tests/hkma-ui.test.mjs` and `node tests/rules.test.mjs`
Expected: static suite `5 通過，0 失敗`; rules still `64 通過，0 失敗`.

Open the help modal with a fresh cachebust, choose 牌型一覽, and verify the last four rows are `七對子`, `人胡`, `綠一色`, `藍一色` in fan order, each with the `自訂牌型` tag.

- [ ] **Step 5: Commit**

```sh
git add js/rules.js js/game.js index.html tests/hkma-ui.test.mjs
git commit -m "把自訂牌型移到牌型表底部"
```

### Task 4: Install Approved Tile PNGs and Remove Layered Bevels

**Files:**
- Create: `scripts/restyle_tiles.py`
- Modify: `scripts/process_assets.py`
- Modify: `assets/tiles/faces/*.png` (43 files)
- Modify: `js/tiles.js:99-109`, `js/tiles.js:180-207`
- Modify: `css/style.css:445-463`
- Test: `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: approved script at `/tmp/opencode/restyle_tiles.py` and approved output at `.superpowers/restyle-faces/` (43 PNGs).
- Produces: reproducible restyle helpers `restyle(im)` and `restyle_back(im)` in `scripts/restyle_tiles.py`; runtime PNGs 144×205 RGBA.

- [ ] **Step 1: Add failing asset tests**

Append:

```js
import { readdirSync, statSync } from 'node:fs';
test('牌圖版本已升級且沒有雙重立體疊圖', () => {
  const tiles = readFileSync('js/tiles.js', 'utf8');
  const css = readFileSync('css/style.css', 'utf8');
  assert.match(tiles, /TILE_ASSET_VERSION = 7;/);
  assert.doesNotMatch(tiles, /createLinearGradient\(-width \/ 2, -height \/ 2/);
  assert.doesNotMatch(css, /\.tile-img:not\(\.tile-fallback\)::before/);
});
test('43 張牌圖都是 RGBA 144x205', () => {
  const files = readdirSync('assets/tiles/faces').filter((f) => f.endsWith('.png'));
  assert.equal(files.length, 43);
  for (const file of files) {
    const buf = readFileSync(`assets/tiles/faces/${file}`);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG');
    assert.equal(buf.readUInt32BE(16), 144, file);
    assert.equal(buf.readUInt32BE(20), 205, file);
    assert.equal(buf[25], 6, `${file} must be RGBA`);
  }
});
```

Also assert `statSync('scripts/restyle_tiles.py').isFile()` is true.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/hkma-ui.test.mjs`
Expected: FAIL for version, bevel code and/or PNG dimensions.

- [ ] **Step 3: Install the approved script and PNGs**

Copy `/tmp/opencode/restyle_tiles.py` verbatim to `scripts/restyle_tiles.py`; do not rewrite its logic or tweak top variables. Copy all 43 PNGs from `.superpowers/restyle-faces/` into `assets/tiles/faces/`, preserving filenames. Do not touch `assets/tiles/raw/`.

- [ ] **Step 4: Make regeneration reproducible**

In `scripts/process_assets.py`, import `restyle` and `restyle_back` from `restyle_tiles` and add a final pass after the existing face/back generation: for every generated face PNG, run `restyle_back()` for `Back.png` and `restyle()` for all others, then overwrite that runtime PNG. Update the docstring to say raw sources are unchanged and the approved restyle script adds the rounded green/grey bands and alpha-derived shadow.

- [ ] **Step 5: Remove old bevel overlays**

In `js/tiles.js`, delete only the 1.4.96 bevel block after the image/fallback draw (gradient, white top/left strokes, dark bottom/right strokes). Keep the optional `shadow` block and `ctx.restore()`. In `css/style.css`, remove `.tile-img:not(.tile-fallback)::before`; keep `.tile-img img` `filter: drop-shadow(...)` and `transform`. Bump `TILE_ASSET_VERSION` from `6` to `7`.

- [ ] **Step 6: Verify regeneration and tests**

Run:

```sh
python3 scripts/process_assets.py
node tests/hkma-ui.test.mjs
node --check js/tiles.js
git diff --check
```

Then use Pillow to compare every runtime PNG pixel-for-pixel with `.superpowers/restyle-faces/` and assert equal. Expected: static suite `7 通過，0 失敗`; no differences.

- [ ] **Step 7: Browser check**

Open a fresh `?test=1&v=1.4.97-task4` page. Check hand tiles, river tiles, flowers and face-down tiles: green/grey layers visible, rounded transparent corners, no square dark corners, no second canvas/CSS bevel, no 404s, no console errors.

- [ ] **Step 8: Commit**

```sh
git add scripts/restyle_tiles.py scripts/process_assets.py assets/tiles/faces js/tiles.js css/style.css tests/hkma-ui.test.mjs
git commit -m "使用烘焙立體邊的新牌圖並移除舊 bevel"
```

### Task 5: Version, Documentation and Final Verification

**Files:**
- Modify: `index.html:12`, `index.html:323`
- Modify: `js/game.js:9`, `js/game.js:17`
- Modify: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CREDITS.md`, `docs/superpowers/specs/2026-11-24-help-tabs-tile-edges-and-yao-word-design.md`
- Test: `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: app version `1.4.97` served to players and docs consistent with implementation.

- [ ] **Step 1: Add failing version tests**

Append:

```js
test('玩家版本與 cachebust 已更新', () => {
  const html = readFileSync('index.html', 'utf8');
  const game = readFileSync('js/game.js', 'utf8');
  const readme = readFileSync('README.md', 'utf8');
  const changelog = readFileSync('CHANGELOG.md', 'utf8');
  assert.match(html, /css\/style\.css\?v=1\.4\.97/);
  assert.match(html, /js\/game\.js\?v=1\.4\.97/);
  assert.match(game, /\.\/tiles\.js\?v=1\.4\.97/);
  assert.match(game, /\.\/rules\.js\?v=1\.4\.97/);
  assert.match(readme, /\?v=1\.4\.97/);
  assert.match(changelog, /^## 1\.4\.97/m);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/hkma-ui.test.mjs`
Expected: FAIL on old `1.4.96` strings.

- [ ] **Step 3: Update versions and docs**

Bump cachebusts in `index.html` and `js/game.js` to `1.4.97`; leave `audio.js`/`net.js` cachebusts unchanged. Change the README play link to `?v=1.4.97`. Add a `## 1.4.97` CHANGELOG entry at the top summarising the three tabs, custom pattern placement, `么`→`么`, approved baked tile edges and the suite results. Update `AGENTS.md`: help list may exceed six items; tile facts are 43 PNGs at 144×205 RGBA with `TILE_ASSET_VERSION = 7` and regeneration via `scripts/process_assets.py` + `scripts/restyle_tiles.py`; no CSS/canvas bevel. Update `CREDITS.md` to say the wiki page was visual reference only and no wiki artwork was used. Update the design doc's tile paragraph to match the installed script/output.

- [ ] **Step 4: Run complete verification**

Run:

```sh
node --check js/rules.js
node --check js/payout.js
node --check js/game.js
node --check js/net.js
node tests/hkma-ui.test.mjs
node tests/rules.test.mjs
node tests/payout.test.mjs
node tests/net.test.mjs
git diff --check
```

Expected: static suite `8 通過，0 失敗`; rules `64 通過，0 失敗`; payout `12 通過，0 失敗`; net `2 通過，0 失敗`; no diff-check errors.

- [ ] **Step 5: Browser and deployment check**

Use fresh cachebusts at widths 320, 375, 768, 1073 and 1366 px. Verify: three tabs and jump button; custom rows at bottom; payout table 0–10 exact; new tile faces/back; no horizontal overflow; HUD height fixed; canvas/sea geometry unchanged; no bottom `釣魚` button; no console errors/warnings; no 404s. Commit, push, then fetch live `index.html`, `js/game.js`, `js/rules.js`, `js/tiles.js`, `css/style.css` and one new PNG with distinct cachebusts; confirm `1.4.97`, `TILE_ASSET_VERSION = 7` and the new PNG bytes are served.

- [ ] **Step 6: Commit**

```sh
git add -A
git commit -m "發布 1.4.97：分頁、么字與新牌圖"
```
