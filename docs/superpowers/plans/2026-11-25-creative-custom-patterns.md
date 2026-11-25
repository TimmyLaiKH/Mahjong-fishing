# 創意自訂牌型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nine new creative custom winning patterns to the pure rules engine, gated by the existing host 自訂牌型 toggle.

**Architecture:** Extend the existing centralized `detectCustomPatterns()` in `js/rules.js`; add fan values, pattern-table rows with validated examples, and absorption keys. No UI or network changes — the toggle and pattern-table sorting already exist. Tests live in the existing custom-pattern static suite.

**Tech Stack:** Plain ES modules, Node-runnable pure rules engine, tiny local test harness.

**Spec:** `docs/superpowers/specs/2026-11-25-creative-custom-patterns-design.md`

## Global Constraints

- Traditional Chinese player-facing text; no bottom `釣魚` button; three help tabs remain.
- All nine patterns are `category: '自訂牌型'`, gated by `context.customPatterns === true` (the game passes the host toggle boolean); rows always shown in 牌型一覽 and sorted to the bottom by `sortPatternRows()`.
- `一心一意` absorbs nothing and is 13 fan; the default 10-fan room still caps payout only, `FAN_CAP` stays `Infinity`.
- `一心一意` detection uses full meld tiles (`melds.flatMap(m => m.tiles)`) plus concealed, because four kongs make 18 physical tiles and `evaluateDecomposition()`'s `allTiles` keeps only three tiles per kong.
- Absorption: `三色同順` → `鏡糊糊`; `三色同刻` → `雙色同刻`; `花么九` → `全帶么九`; `四連刻` → `對對糊`.
- Not added: `全么九（清老頭）`, `五湖四海`, `七連對`; `雙色同刻` unchanged.
- Every pattern needs a `FAN_VALUES` entry, a `PATTERN_TABLE` row with `desc` + validated `example`, and a passing test. `tests/rules.test.mjs` stays at 64 tests.
- Version 1.4.109: bump `index.html` css/game pins, `js/game.js` `./rules.js` import, README play link, CHANGELOG top entry. Tiles 1.4.99, audio/net unchanged. No new localStorage keys.
- Verification: four `node --check`; static suite green; custom suite green; rules 64; payout 12; net 2; `git diff --check`. Then commit, merge locally to `main`, push `main` directly (no PR), live verify distinct cachebusts.

## Review Focus

- Four-kong 一心一意 must recognise all 18 physical tiles (not the 14-tile `allTiles`) — Task 1 test: concealed pair plus four kong melds of one kind scores 一心一意 13.
- Toggle OFF must not score or speak any of the nine new patterns — Task 1 test: each example with `{ context: { customPatterns: false } }` has no new pattern id.
- Absorption siblings must not double-count — Task 1 test: 三色同順 hand does not also show 鏡糊糊; 三色同刻 does not also show 雙色同刻; 全帶么九 hand does not also show 花么九; 四連刻 does not also show 對對糊.
- Examples must really be legal winning hands — Task 1 table-driven test calls `evaluateHand(row.example)` for every new row and asserts the id appears.
- Stale cached rules engine — Task 2 static test asserts `./rules.js?v=1.4.109` and css/game pins.

---

### Task 1: Rules engine patterns and tests

**Files:**
- Modify: `js/rules.js` (`FAN_VALUES`, `PATTERN_TABLE`, `ABSORBS`, `detectCustomPatterns()`)
- Modify: `tests/rules.test.mjs` (exact custom-id list only)
- Test: `tests/custom-patterns.test.mjs`

**Interfaces:**
- Consumes: existing `detectCustomPatterns({ concealed, groups, melds, sets, pair, context })`, `FAN_VALUES`, `PATTERN_TABLE`, `ABSORBS`, `countTiles`, `TILE_INFO`, `isPung`.
- Produces: new pattern ids return `{ id, fan, detail }` from `detectCustomPatterns()` when `context.customPatterns === true`; unchanged behaviour when false or absent.

- [ ] **Step 1: Write failing tests** in `tests/custom-patterns.test.mjs`:
  - `EXPECTED_FAN` gains 一心一意 13, 九五之尊 10, 四連刻 3, 三色同順 2, 三色同刻 2, 全帶么九 2, 五門齊 2, 全求人 1, 斷么九 1.
  - Table-driven test: each new id has a `PATTERN_TABLE` row with `category: '自訂牌型'`, `desc`, `example`; `evaluateHand(row.example)` must be a win and include the id.
  - Toggle test: each example with `context: { ...row.example.context, customPatterns: false }` must not include the new id.
  - 一心一意 four-kong test: concealed `['m1','m1']` plus four `kong` melds of `m1` with `customPatterns: true` → includes 一心一意 with fan 13.
  - Absorption test: each absorption pair above scores only the higher id.
  - `tests/rules.test.mjs`: extend the exact custom-id list in `牌型說明與番數依據新定義` with the nine new ids (test count stays 64).

- [ ] **Step 2: Run RED** — `/home/timmy/.local/node/bin/node tests/custom-patterns.test.mjs`; expected failures on missing fan values/rows/detection. Do not proceed until RED is confirmed.

- [ ] **Step 3: Add fan values and table rows** to `js/rules.js`. Each row carries `example: { concealed: [...], melds: [...], context: { customPatterns: true } }` with a legal 14-tile hand. Conditions:
  - 一心一意: every physical tile (concealed + all meld tiles) is the same id.
  - 九五之尊: every tile is one of `m5,m9,p5,p9,s5,s9`.
  - 四連刻: four pung sets with consecutive ranks in one suit.
  - 三色同順: same-rank sequence present in all three suits.
  - 三色同刻: same-rank pung present in all three suits.
  - 全帶么九: every set and the pair contains a terminal or honor tile.
  - 五門齊: at least one 萬, 筒, 索, wind, and dragon tile.
  - 全求人: four melds, all open claimed sets, and `context.selfDraw === false`.
  - 斷么九: all tiles are numbered 2–8, no honors.

- [ ] **Step 4: Extend `ABSORBS`** with the four pairs in Global Constraints; do not add any absorption for 一心一意.

- [ ] **Step 5: Extend `detectCustomPatterns()`** with the nine checks inside the existing `enableWiki` branch. Use full meld tiles for 一心一意, honour/suit sets from `effectiveSets` for the rest. Keep existing legacy-four and wiki-custom gating intact.

- [ ] **Step 6: Run GREEN** — custom suite plus rules 64/0, payout 12/0, net 2/0, four `node --check`, `git diff --check`.

- [ ] **Step 7: Commit** — `git add js/rules.js tests/custom-patterns.test.mjs tests/rules.test.mjs && git commit -m "加入創意自訂牌型與偵測"`.

### Task 2: Release 1.4.109 and verification

**Files:** `index.html`, `js/game.js`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: Task 1 pattern ids and gating; existing cachebust assertions in the static suite.
- Produces: coherent 1.4.109 pins and docs; static suite still green.

- [ ] **Step 1: Write failing version tests** — in `tests/hkma-ui.test.mjs` change pins from 1.4.108 to 1.4.109 for `css/style.css`, `js/game.js`, README, CHANGELOG, and `./rules.js`; keep tiles 1.4.99 and audio/net unchanged. Run static suite and watch RED.

- [ ] **Step 2: Bump versions and docs** — apply the pins; add `CHANGELOG.md` top entry `## 1.4.109` describing the nine patterns, 一心一意 13 fan and no absorption, toggle gating, and direct push; update AGENTS fan-authority/custom-pattern list and static-suite notes.

- [ ] **Step 3: Full verification** — four `node --check`, static suite, custom suite, rules 64/0, payout 12/0, net 2/0, `git diff --check`; confirm only the six listed files changed. Browser check `index.html?test=1&v=1.4.109-browser`: no console errors/404s; 牌型一覽 shows new rows at bottom with toggle off.

- [ ] **Step 4: Commit and ship** — `git commit -m "發布 1.4.109：創意自訂牌型"`; from `/home/timmy/Mahjong-fishing`, `git checkout main`, `git pull --ff-only origin main`, `git merge --no-ff hkma-fan-table -m "合併創意自訂牌型"`, re-verify, `git push origin main`, live verify distinct cachebusts for `1.4.109`, a new pattern id, and no stale `1.4.108` pin.
