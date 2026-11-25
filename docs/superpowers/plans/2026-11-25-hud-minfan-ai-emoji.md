# HUD 起糊與 AI 表情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `前往番數表` jump button, show the match's `起糊 N 番` in the HUD round block, and add probabilistic AI emoji reactions on discard/win/meld/draw/match-end, then release as 1.4.99 and push directly to `main`.

**Architecture:** UI changes stay in `index.html`/`js/game.js`; AI emoji reactions are centralised in the already-idempotent `recordRoundResult()` settlement funnel plus one hook in `applyAiMeldClaim()`. Only host/solo emits; the host broadcasts AI emoji so guests see bubbles without owning AI state.

**Tech Stack:** static HTML/CSS/ES modules, no build step; tiny Node `assert` harness.

**Spec:** `docs/superpowers/specs/2026-11-25-hud-minfan-ai-emoji-design.md`

## Global Constraints

- All player-facing text stays Traditional Chinese; no bottom `釣魚` button.
- `玩法說明` keeps three tabs (`rules`/`patterns`/`payout`) and `#fanTableTitle`; the `前往番數表` button and `jumpToFanTable()` are removed.
- HUD height and canvas geometry stay fixed; add only a short `起糊 N 番` counter.
- Reuse existing `EMOJIS` at `js/game.js:76`; no new emoji assets.
- Exact odds: AI 出銃 `0.30` (😭/😡), AI win `0.30` (😎/😀), 流局 `0.30` (😮/😂), human win ≥10 fan → 出銃 AI always 😡 and other AIs `0.55` from 👏/👍/😮/🔥, AI 上/碰/明槓 `0.08` (😍/🙏), match end `0.70` 🎉 per AI.
- Forced angry and the generic AI-discard chance are mutually exclusive for the same seat/event.
- `recordRoundResult()` stays idempotent by `roundKey`; emoji fire only on a genuine new settlement.
- Only host/solo generates AI emoji; multiplayer host broadcasts `{t:'emoji',seat,emoji}`.
- `FAN_CAP` stays `Infinity`; no new localStorage keys; no scoring/settlement/net/audio/gameplay changes beyond emoji reactions.
- Version `1.4.99`: bump `index.html` CSS/game cachebusts, `js/game.js` `./tiles.js?v=...`, README play link and CHANGELOG. Keep `./rules.js?v=1.4.97`, audio and net cachebusts unchanged.
- Required suites: static `8 通過，0 失敗`, rules `64 通過，0 失敗`, payout `12 通過，0 失敗`, net `2 通過，0 失敗`; four `node --check` and `git diff --check` clean.
- Standing workflow from the user: always push directly to GitHub `main`, no PR and no branch question, for this and future changes.

## Review Focus

- **起糊 synchronisation:** when host changes `起糊` or a guest adopts `match`, `#minFanCount` must show the same number; test pins `updateScoreUI()` to `match.minFan ?? game.matchSetup?.minFan ?? 0`.
- **Multiplayer duplicate emoji:** host broadcast plus guest receive must not double-bubble; test pins the `game.mode !== 'multi' || net.isHost` gate and host-only broadcast.
- **Big-win exclusivity:** a 10+ fan human win with an AI discarder must show one forced 😡, not an extra random cry/angry; test pins the mutually exclusive branch in `emitAiReactions()`.
- **Meld success only:** AI 上/碰/明槓 emoji must fire only after a successful meld, not on failed takeover or timeout; test pins the call inside `applyAiMeldClaim()`.
- **Stale cache/contract drift:** cachebusts, README, CHANGELOG and AGENTS must drop the old button contract and carry 1.4.99; test pins the exact version strings and absence of `前往番數表`.

---

### Task 1: Remove jump button and add HUD 起糊

**Files:**
- Modify: `index.html:42-48`, `index.html:202-210`, `index.html:345`
- Modify: `js/game.js:30-34`, `js/game.js:6289-6310`, `js/game.js:5784-5803`, `js/game.js:6596-6604`, `js/game.js:6750`
- Test: `tests/hkma-ui.test.mjs:36-53`

**Interfaces:**
- Consumes: `match.minFan` / `game.matchSetup.minFan` already normalised by `normalizeMatchSetup()`.
- Produces: `#minFanCount` element, `ui.minFanCount`, no `#helpFanTableBtn` / `前往番數表`, no `jumpToFanTable()` export.

- [ ] **Step 1: Write the failing tests**

In `tests/hkma-ui.test.mjs`, change the three existing tests at lines 36-53:
- In `玩法說明有三個分頁按鈕與三個面板`, add `assert.doesNotMatch(html, /id="helpFanTableBtn"/)` and `assert.doesNotMatch(html, /前往番數表/)`.
- Replace `前往番數表會先切到牌型一覽分頁` with `HUD 顯示本場起糊番數` asserting `html` has `id="minFanCount"` and `js/game.js` has both `ui.minFanCount` and the expression `match.minFan ?? game.matchSetup?.minFan ?? 0`.
- In `玩法說明清單可多於六項且保留固定入口`, remove the `helpFanTableBtn` assertion and keep `#payoutTableTitle` / `#patternsBody`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: RED; failures report the still-present button/`jumpToFanTable()` and missing `#minFanCount`.

- [ ] **Step 3: Implement the UI change**

- Delete `<button id="helpFanTableBtn" ...>前往番數表</button>` from `index.html:207`.
- Delete `jumpToFanTable()` from `js/game.js`, its `el('helpFanTableBtn')?.addEventListener(...)` line, and its `window.__mf` export; keep `switchHelpTab()` and all three tabs.
- Add `<span>起糊 <b id="minFanCount">3 番</b></span>` to `.counters` in `index.html`.
- Add `minFanCount: el('minFanCount')` to the `ui` object.
- In `updateScoreUI()`, set `ui.minFanCount.textContent` to `` `${game.match?.minFan ?? game.matchSetup?.minFan ?? 0} 番` ``.

- [ ] **Step 4: Run all suites**

Run with `NODE=/home/timmy/.local/node/bin/node`:
`node --check js/rules.js`, `node --check js/payout.js`, `node --check js/game.js`, `node --check js/net.js`, then `node tests/hkma-ui.test.mjs`, `node tests/rules.test.mjs`, `node tests/payout.test.mjs`, `node tests/net.test.mjs`, then `git diff --check`.
Expected: static `8 通過，0 失敗`, rules `64 通過，0 失敗`, payout `12 通過，0 失敗`, net `2 通過，0 失敗`; all syntax checks and diff-check clean.

- [ ] **Step 5: Commit**

```bash
git add index.html js/game.js tests/hkma-ui.test.mjs
git commit -m "移除前往番數表按鈕並在 HUD 顯示起糊"
```

---

### Task 2: Add AI emoji reactions

**Files:**
- Modify: `js/game.js:76` (constants), `js/game.js:584-618` (helpers), `js/game.js:2228-2262` (`applyAiMeldClaim`), `js/game.js:2438-2493` (`recordRoundResult`), `js/game.js:6759` (`window.__mf`)
- Test: `tests/hkma-ui.test.mjs:43` (add assertions, keep 8 tests)

**Interfaces:**
- Consumes: `showEmojiBubble(seat, emoji)`, `isAiSeat(seat)`, `net.isHost`, `game.mode`.
- Produces: `aiEmoji(seat, emoji)`, `maybeAiEmoji(seat, chance, options)`, `emitAiReactions({ winner, discarder, fan, draw })`, exported on `window.__mf` under the test flag.

- [ ] **Step 1: Write the failing test**

Extend the `HUD 顯示本場起糊番數` test in `tests/hkma-ui.test.mjs` (rename it `HUD 起糊與 AI 表情已接上`) with assertions that `js/game.js` contains:
- `AI_DISCARD_EMOJI_CHANCE`, `AI_WIN_EMOJI_CHANCE`, `DRAW_EMOJI_CHANCE`, `MATCH_END_EMOJI_CHANCE`, `BIG_WIN_AI_EMOJI_CHANCE`, `AI_MELD_EMOJI_CHANCE`
- `function aiEmoji(`
- `function emitAiReactions(`
- `emitAiReactions({` inside `recordRoundResult()` and `maybeAiEmoji(` inside `applyAiMeldClaim()`
- `game.mode !== 'multi' || net.isHost`
- `net.broadcast({ t: 'emoji', seat, emoji })`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: RED on every new AI-emoji assertion.

- [ ] **Step 3: Implement the helpers and hooks**

- Add constants next to `EMOJIS` with the exact values from Global Constraints.
- Implement `aiEmoji(seat, emoji)`: return unless `isAiSeat(seat)` and `EMOJIS.includes(emoji)`; call `showEmojiBubble(seat, emoji)`; if `game.mode === 'multi' && net.isHost`, call `net.broadcast({ t: 'emoji', seat, emoji })`.
- Implement `maybeAiEmoji(seat, chance, options)`: return unless `isAiSeat(seat)`; if `Math.random() < chance`, call `aiEmoji(seat, options[Math.floor(Math.random() * options.length)])`.
- Implement `emitAiReactions({ winner = null, discarder = null, fan = 0, draw = false } = {})`:
  - Return unless `game.mode !== 'multi' || net.isHost`.
  - Let `bigWin = winner !== null && winner !== undefined && !isAiSeat(winner) && fan >= 10`.
  - If `bigWin`: if `discarder !== null && isAiSeat(discarder)`, call `aiEmoji(discarder, '😡')`; for every seat `0..3` where `isAiSeat(seat) && seat !== discarder`, call `maybeAiEmoji(seat, BIG_WIN_AI_EMOJI_CHANCE, ['👏', '👍', '😮', '🔥'])`. Skip the generic discarder chance entirely.
  - Else if `winner !== null && isAiSeat(winner)`, call `maybeAiEmoji(winner, AI_WIN_EMOJI_CHANCE, ['😎', '😀'])`.
  - Else if `discarder !== null && isAiSeat(discarder)`, call `maybeAiEmoji(discarder, AI_DISCARD_EMOJI_CHANCE, ['😭', '😡'])`.
  - If `draw`, for every AI seat call `maybeAiEmoji(seat, DRAW_EMOJI_CHANCE, ['😮', '😂'])`.
  - If `game.match?.over`, for every AI seat call `maybeAiEmoji(seat, MATCH_END_EMOJI_CHANCE, ['🎉'])`.
- In `recordRoundResult()`, after `match.winner` is set and before `updateScoreUI()`, call `emitAiReactions({ winner, discarder, fan: result?.totalFan ?? 0, draw: winner === null })`.
- In `applyAiMeldClaim()`, after `state.melds.push(meld)` / `addSeatMeld(...)`, call `maybeAiEmoji(msg.seat, AI_MELD_EMOJI_CHANCE, ['😍', '🙏'])`.
- Add `aiEmoji, maybeAiEmoji, emitAiReactions` to the `window.__mf` export object near the existing emoji helpers.

- [ ] **Step 4: Run all suites**

Run the same command block as Task 1 Step 4.
Expected: static `8 通過，0 失敗`, rules `64`, payout `12`, net `2`; syntax and diff-check clean.

- [ ] **Step 5: Commit**

```bash
git add js/game.js tests/hkma-ui.test.mjs
git commit -m "加入 AI 表情回應並集中於結算觸發"
```

---

### Task 3: Release 1.4.99, verify locally, push to main

**Files:**
- Modify: `index.html:12`, `index.html:345`, `js/game.js:9`
- Modify: `README.md:3`, `README.md:70`, `CHANGELOG.md:5`, `AGENTS.md` (help button contract, HUD counters, AI emoji behaviour, static suite description, version)
- Test: `tests/hkma-ui.test.mjs:105-123`

**Interfaces:**
- Consumes: Task 1 and Task 2 commits.
- Produces: `1.4.99` cachebusts and docs; live `main` at the release commit.

- [ ] **Step 1: Write the failing version test**

In `tests/hkma-ui.test.mjs`, change `玩家版本與 cachebust 已更新` so it asserts:
- `css/style.css?v=1.4.99`, `js/game.js?v=1.4.99`
- `./tiles.js?v=1.4.99`
- `./rules.js?v=1.4.97` (unchanged)
- README `?v=1.4.99`
- CHANGELOG `^## 1.4.99`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: RED on the old `1.4.98` pins.

- [ ] **Step 3: Bump versions and docs**

- `index.html:12` CSS and `index.html:345` game → `?v=1.4.99`.
- `js/game.js:9` tiles import → `./tiles.js?v=1.4.99`; leave line 17 rules import at `1.4.97`.
- README: play link `?v=1.4.99`; remove any `前往番數表` wording; mention HUD `起糊` and AI emoji reactions.
- CHANGELOG: insert `## 1.4.99 — HUD 起糊與 AI 表情` above `1.4.98`, describing the button removal, HUD counter, emoji odds and that the change was pushed directly to `main`.
- AGENTS: remove the `前往番數表` contractual sentence; add `起糊 N 番` to the HUD counter list; add a short AI emoji reaction rule; update the static-suite description to mention HUD/emoji checks instead of the jump button.

- [ ] **Step 4: Run all suites and syntax checks**

Run the same command block as Task 1 Step 4.
Expected: all green as listed there.

- [ ] **Step 5: Browser check**

Start a local server in the worktree and open `index.html?test=1&v=1.4.99-browser`. Confirm: no console errors or 404s; HUD shows `起糊 3 番`; `玩法說明` has no `前往番數表`; tiles still render; use `window.__mf.emitAiReactions(...)` to confirm a bubble appears without throwing. Do not contact the live site here.

- [ ] **Step 6: Commit**

```bash
git add index.html js/game.js README.md CHANGELOG.md AGENTS.md tests/hkma-ui.test.mjs
git commit -m "發布 1.4.99：HUD 起糊與 AI 表情"
```

- [ ] **Step 7: Push directly to main and verify live**

From the main repo root `/home/timmy/Mahjong-fishing`:
```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff hkma-fan-table -m "合併 1.4.99 HUD 起糊與 AI 表情"
git push origin main
```
Then fetch `index.html`, `js/game.js`, `css/style.css` with distinct cachebusts and confirm `1.4.99`, `minFanCount`, absence of `前往番數表`, and `aiEmoji` are served. No PR.
