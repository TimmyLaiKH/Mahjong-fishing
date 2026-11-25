# 自訂牌型擴充與房主開關 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 21 approved 自訂牌型 from the Cantonese Wikipedia page to the pure rules engine with validated evaluators, and add a host-only room toggle (default OFF) that gates every custom pattern in scoring, speech, and the help table.

**Architecture:** `js/rules.js` gains one centralized custom-pattern detector called from `evaluateDecomposition()`, plus a `context.customPatterns` gate threaded through `evaluateHand`/`withFlowers`/`flowerWinResult`. `js/game.js` carries a boolean `customPatterns` through room settings → match setup → match snapshots, passes it into every evaluate call, and filters the generated pattern table. The game never post-filters a result, so absorption and overlap deductions stay correct.

**Tech Stack:** plain ES modules, Node test harness, static HTML/CSS, no framework.

**Spec:** `docs/superpowers/specs/2026-11-25-custom-patterns-toggle-design.md`

## Global Constraints

- Pattern inventory is authoritative in the spec; do NOT re-fetch Wikipedia. Exclude 冧手胡 and 鐘鼓齊鳴（槓爆）.
- 13 番 patterns on the page are 10 番 in game: 紅孔雀 new at 10; 綠一色/藍一色 already 10.
- 一條龍（一氣通貫） is absorbed by 九子連環; same-family higher patterns absorb lower ones (四般高→三般高→一般高, 四般低→三般低→一般低, 兩般高→一般高, 兩般低→一般低).
- `人胡` stays custom and gated even though it is not on the Wikipedia custom list.
- Toggle default OFF in the room; engine default `true` for backward compatibility with the 64 baseline tests; game always passes the room value.
- OFF ⇒ custom patterns not scored, not spoken, not shown in 牌型一覽; `minFan` applies to the filtered total. Official patterns unchanged.
- Host-only room toggle, guests see read-only `(由房主設定)`; sync via `roomSettings`/`matchSetup`/`match`/`cloneMatch`/`adoptMatch` as a boolean. No new localStorage keys. `FAN_CAP` stays `Infinity`; network snapshots stay serialisable.
- Every new pattern needs a `FAN_VALUES` entry, a `PATTERN_TABLE` row with `desc` and a validated `example`, and a passing evaluator test in `tests/custom-patterns.test.mjs`; `tests/rules.test.mjs` stays at 64 tests.
- Traditional Chinese player text; no bottom 釣魚 button; three help tabs remain; no `前往番數表`/`jumpToFanTable()`; HUD `起糊 N 番` remains; existing AI emoji odds unchanged; settlement/speech never show the `自訂牌型` tag.
- Version 1.4.107: `index.html` css+game pins, `js/game.js` `./rules.js` import; tiles `1.4.99`, audio `1.4.86`, net `1.4.69` unchanged.
- Verification: four `node --check`; static suite green (update count in AGENTS), rules 64/0, payout 12/0, net 2/0, new custom suite green; `git diff --check` clean.
- Standing workflow: commit on `hkma-fan-table`, merge locally to `main`, push `main` directly, live verify with distinct cachebusts (no PR).

## Review Focus

- Toggle OFF with a hand that also qualifies for official patterns: only official patterns remain and fan total drops correctly — pinned by a `customPatterns:false` test in Task 1.
- A hand that qualifies for both 九子連環 and 一條龍 must not double count — pinned by an absorption test in Task 1.
- Guest devices must not be able to change the toggle and must receive the host's value on join and after rematch — pinned by static wiring assertions in Task 2.
- Every new pattern's `example` must actually evaluate to that pattern, not just parse — pinned by table-driven example tests in Task 1.
- Stale cached `rules.js` must not serve old scoring — pinned by version/cachebust assertions in Task 3.

---

### Task 1: Rules engine — pattern data, detector, and toggle

**Files:**
- Modify: `js/rules.js` (`FAN_VALUES` line 31, `PATTERN_TABLE` line 81, `ABSORBS` lines 288-311, `evaluateDecomposition` 498-623, entry points 683/716/763)
- Create: `tests/custom-patterns.test.mjs`

**Interfaces:**
- Consumes: existing `countTiles`, `decompose`, `isSevenPairs`, `TILE_IDS`, `FLOWER_IDS`, `GREEN_TILES`, `BLUE_TILES`, `WINDS`, `resolveOverlaps` from `js/rules.js`; tiny test harness shape from `tests/rules.test.mjs`.
- Produces: `detectCustomPatterns({ concealed, groups, melds, sets, pair, context })` returning an array of `{ id, fan, detail }`; `context.customPatterns` honoured by `evaluateHand`, `withFlowers`, `flowerWinResult`; new pattern IDs usable by game-side tables and speech.

- [ ] **Step 1: Write failing tests for the toggle and absorption**

Create `tests/custom-patterns.test.mjs` with the same `passed`/`failed` harness and `test(name, fn)` helper as `tests/rules.test.mjs`. Add tests:
  - a seven-pairs hand returns pattern `七對子` with default context, and does NOT contain it with `customPatterns: false`;
  - a hand qualifying for both 九子連環 and 一條龍 reports `九子連環` only (no `一條龍` in the final patterns);
  - a hand with `綠一色` still reports official patterns and total fan is computed once (no custom double count when disabled).
  Use `evaluateHand({ concealed, melds: [], context: { customPatterns: false } })` and compare `result.patterns.map(p => p.id)`.

- [ ] **Step 2: Run the new test file and confirm RED**

Run: `/home/timmy/.local/node/bin/node tests/custom-patterns.test.mjs`
Expected: FAIL on missing `customPatterns` behaviour / missing detector.

- [ ] **Step 3: Add fan values and pattern rows**

In `js/rules.js` add to `FAN_VALUES` and `PATTERN_TABLE` (each with `name`-consistent id, `desc`, validated `example`, `category: '自訂牌型'`):
  一般高 1, 一般低 1, 缺門 1, 三般高 2, 三般低 2, 一條龍 2, 兩般高 3, 兩般低 3, 鏡糊糊 3, 四般高 3, 四般低 3, 三槓子 3, 三喜臨門 3, 雙色同刻 3, 四歸四 3, 萬綠叢中一點紅 10, 百萬石 10, 紅孔雀 10. Do not add 冧手胡 or 鐘鼓齊鳴（槓爆）. Reuse existing 七對子/人胡/綠一色/藍一色 rows unchanged.

- [ ] **Step 4: Extend ABSORBS**

Edit `ABSORBS`: add `一條龍` to the `九子連環` array; add custom-family entries `四般高 → 三般高 → 一般高`, `四般低 → 三般低 → 一般低`, `兩般高 → 一般高`, `兩般低 → 一般低`. Keep all official absorption entries untouched.

- [ ] **Step 5: Implement `detectCustomPatterns`**

Implement `export function detectCustomPatterns({ concealed = [], groups = [], melds = [], sets = [], pair = null, context = {} } = {})` in `js/rules.js`. It returns candidate `{ id, fan, detail }` objects using `countTiles` over concealed tiles plus meld tiles, the decomposition `sets`/`pair` when supplied, and suit/number sets. Detection rules:
  - chow families from the decomposition: 一般高 = two identical chows in one suit; 一般低 = two same-suit chows offset +1; 三般高/三般低/四般高/四般低 = three/four of those; 兩般高/兩般低 = two separate 一般高/一般低 groups; 鏡糊糊 = two identical chows in two suits; 一條龍 = all 1–9 of one suit present; 雙色同刻 = two identical pungs in two suits with no chows; 四歸四 = one tile kind appearing in each of four chows.
  - honour/suit sets: 缺門 = missing one numbered suit with at least two suits present; 三槓子 = three kongs in melds; 三喜臨門 = three wind pungs; 萬綠叢中一點紅 = only 發財 plus exactly one of 五索/紅中; 百萬石 = all numbers sum ≥ 100 in a clean hand; 紅孔雀 = only 索 1/5/7/9 plus 紅中; 七對子/綠一色/藍一色/人胡 keep their existing detection logic moved into the helper.
  Return candidates in descending fan order; dedupe by id.

- [ ] **Step 6: Wire detector and toggle into evaluation**

In `evaluateDecomposition`, replace the inline custom `add()` calls (lines ~536, 539-540, 588) with a single gated call: when `context.customPatterns !== false`, iterate `detectCustomPatterns(...)` and `add(candidate.id, candidate.detail, candidate.fan)`. In `evaluateHand`, `withFlowers`, and `flowerWinResult`, forward `context` (including `customPatterns`) unchanged to every nested evaluate call. Keep engine default `true` when the field is absent.

- [ ] **Step 7: Add table-driven example and fan tests**

Extend `tests/custom-patterns.test.mjs` with one table-driven test over the new `PATTERN_TABLE` rows: for each row with `category: '自訂牌型'`, assert `FAN_VALUES[row.id] === row.fan` and that `evaluateHand` on `row.example` produces a result containing `row.id` (with `customPatterns: true`). Assert 紅孔雀 is 10 and 一條龍 never survives alongside 九子連環.

- [ ] **Step 8: Run new suite and baseline suites**

Run with `NODE=/home/timmy/.local/node/bin/node`:
  `node --check js/rules.js`; `node tests/custom-patterns.test.mjs`; `node tests/rules.test.mjs` (expect `64 通過，0 失敗`); `node tests/payout.test.mjs`; `node tests/net.test.mjs`.
Expected: all green; if `rules.test.mjs` regresses, fix the engine, do not lower its count.

- [ ] **Step 9: Commit**

```bash
git add js/rules.js tests/custom-patterns.test.mjs
git commit -m "加入維基自訂牌型與開關式偵測"
```

### Task 2: Game integration — host toggle, context threading, help table

**Files:**
- Modify: `index.html` (room settings UI), `js/game.js` (state/setup/room UI/evaluate call sites/pattern table), `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: `context.customPatterns` from Task 1; existing `roomSettings`/`matchSetup`/`match` objects and `cloneMatch`/`adoptMatch` serialisation.
- Produces: boolean `customPatterns` on room and match snapshots; helper `customPatternsEnabled()` returning the effective boolean; generated pattern table filtered by the toggle.

- [ ] **Step 1: Write failing static tests**

In `tests/hkma-ui.test.mjs` add assertions inside existing tests (keep top-level test count documented in AGENTS):
  - room markup has an id `customPatternsToggle` and a guest read-only note `(由房主設定)`;
  - `js/game.js` has `function customPatternsEnabled()` reading `game.match?.customPatterns ?? game.matchSetup?.customPatterns ?? false`;
  - `normalizeMatchSetup()` includes `customPatterns` default `false`; `cloneMatch()` and `adoptMatch()` carry `customPatterns`;
  - every evaluate call site passes `customPatterns: customPatternsEnabled()`;
  - `buildPatternTable()` filters rows with `category === '自訂牌型'` when the toggle is off.

- [ ] **Step 2: Run static suite and confirm RED**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: FAIL on the new toggle assertions.

- [ ] **Step 3: Add room UI**

In `index.html` room settings, add a host-only checkbox/switch for 自訂牌型 with id `customPatternsToggle`, default unchecked; guests render it disabled with the note `(由房主設定)`. Follow the existing room setting markup pattern.

- [ ] **Step 4: Thread the flag through state and network**

In `js/game.js`: add `customPatterns` to `roomSettings`, `matchSetup`, `match`, `normalizeMatchSetup()` (default `false`), `cloneMatch()`, `adoptMatch()`, and the settings broadcast handler; host control writes it and broadcasts `{t:'settings'}`. Add `customPatternsEnabled()` and pass it at every evaluate call site listed in the anchors (869, 977, 1176, 1220, 1616, 1892, 1902, 2031, 2049, 6218, 6229).

- [ ] **Step 5: Filter the pattern table and settlement display**

In `buildPatternTable()`, filter `PATTERN_TABLE` rows by `category !== '自訂牌型'` when `customPatternsEnabled()` is false before calling `sortPatternRows()`. Ensure win dialogs and speech use only the already-filtered result patterns from the engine.

- [ ] **Step 6: Run all suites**

Run four `node --check`; static suite; rules 64/0; custom-pattern suite; payout 12/0; net 2/0; `git diff --check`. Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add index.html js/game.js tests/hkma-ui.test.mjs
git commit -m "加入房主自訂牌型開關並接入引擎"
```

### Task 3: Release 1.4.107 and verification

**Files:** `index.html`, `js/game.js`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `tests/hkma-ui.test.mjs`

- [ ] **Step 1: Write failing version tests**

In the version test, change pins to `css/style.css?v=1.4.107`, `js/game.js?v=1.4.107`, `./rules.js?v=1.4.107`, README `?v=1.4.107`, CHANGELOG `^## 1.4.107`. Keep tiles `1.4.99`, audio/net unchanged. Run static suite and confirm RED.

- [ ] **Step 2: Bump versions and docs**

Apply the pins above. Add CHANGELOG entry describing the new patterns, 13→10 mapping, 一條龍 absorption, host toggle default OFF, and direct push. Update README play link and AGENTS (pattern list, toggle, static test count, rules import version).

- [ ] **Step 3: Full verification**

Run all suites and syntax checks; `git diff --check`; confirm modified files are only the six listed. Browser check with `index.html?test=1&v=1.4.107-browser`: host toggle present and guest read-only, help table hides custom patterns when off, no console errors/404s.

- [ ] **Step 4: Commit, merge, push, live verify**

Commit `發布 1.4.107：自訂牌型與房主開關`; merge locally to `main`; `git push origin main`; verify live assets with distinct cachebusts for `1.4.107`, `customPatternsToggle`, `customPatternsEnabled`, no stale `1.4.106` pin.
