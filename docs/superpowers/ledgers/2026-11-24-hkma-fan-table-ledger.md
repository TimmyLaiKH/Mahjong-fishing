# SDD Ledger — 1.4.96 HKMA 番數表與玩法說明增強

- Plan: `docs/superpowers/plans/2026-11-24-hkma-fan-table-and-help-enhancements.md`
- Branch: `hkma-fan-table`
- Worktree: `/home/timmy/Mahjong-fishing/.worktrees/hkma-fan-table`
- Base: `0404438 加入 1.4.96 番數表與說明頁實作計劃`
- Execution: Native / inline (`executing-plans`)
- User intent: 執行已核准 1.4.96；加入 0–10 番詳細派彩表；以 CSS/canvas 讓牌面更有 3D 感；全部玩家可見文字維持繁體中文.

## Global constraints carried into every task

- `FAN_CAP = Infinity` unchanged.
- Node suites must remain 64 / 12 / 2 passing.
- 玩法說明 exactly six `<li>`; payout table and source notes outside the list.
- No PNG regeneration; `TILE_ASSET_VERSION = 6`.
- No new localStorage keys.
- Cachebusts converge on `1.4.96`.
- TDD: write failing test, watch it fail, write minimal production code, watch it pass.

## Interface pre-flight scan

- Task 1 changes only data in `js/rules.js` (`FAN_VALUES`, `PATTERN_TABLE`) and assertions in `tests/rules.test.mjs`.
- No export signatures change. `FAN_CAP` stays `Infinity`.
- Task 2 consumes the new `自訂牌型` category and `花么九 4 番`; it does not change logic.
- Task 3 changes only presentation in `js/tiles.js` / `css/style.css` plus the `js/game.js` import cachebust; no gameplay interfaces.
- Task 4 changes docs only and performs verification/deploy.
- Conflicts found: none. Sequence Tasks 1 → 2 → 3 → 4 is valid.

## Task status

- [x] Task 1 — HKMA 番數與自訂牌型（TDD）
- [x] Task 2 — 玩法說明派彩表與來源標示
- [x] Task 3 — 牌面立體感（CSS 與 canvas）
- [x] Task 4 — 文件同步、完整驗證與部署

## Ledger log

- 2026-11-24: Plan file committed on `main` as `0404438`; `.gitignore` for `.worktrees/` committed as `3917536`.
- 2026-11-24: Native OpenCode worktree creation failed twice; git worktree fallback created `hkma-fan-table` from `0404438`; session moved into it.
- 2026-11-24: Loaded `executing-plans`, `using-git-worktrees`, `test-driven-development`. No prior ledger found.
- 2026-11-24: Interface pre-flight completed; no conflicts.
- 2026-11-24: Task 1 RED observed (62/64; 人胡 desc, 花么九 desc/category, T3 total). GREEN after `js/rules.js` data changes: 64/12/2 passing; four `node --check` and `git diff --check` clean.
- 2026-11-24: Task 2 static-check RED (`要有派彩表標題`) then GREEN. Browser check on port 8124 with fresh `?test=1&v=1.4.96-task2-c`: six `<li>`, payout rows 0–10 exact, four `自訂牌型` tags, no `特殊牌型`, no bottom 釣魚 button, `#helpFanTableBtn` focuses/scrolls to `#fanTableTitle`, HUD/canvas unchanged, no console errors/warnings, no overflow. `.gitignore` gap with main noted for final reconciliation.
- 2026-11-24: Task 3 static-check RED (`要有 relative 定位`) then GREEN. Browser check on port 8124 with fresh `?test=1&v=1.4.96-task3-b`: solo game reached `AWAIT_CAST`; DOM tile bevel applied with `pointer-events:none` pseudo-element; canvas non-blank; no bottom 釣魚 button, no horizontal overflow; frames advanced 37→38; no console errors/warnings; no 4xx/5xx requests.
- 2026-11-24: Task 4 docs synced across `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CREDITS.md`; four `node --check`, suites 64/12/2 and `git diff --check` clean; stale-tag grep found only intentional test strings. Fresh browser check `?test=1&v=1.4.96-task4-b`: six `<li>`, exact 0–10 payout rows, four `自訂牌型` tags, no bottom 釣魚 button, DOM/canvas bevel visible, geometry unchanged, frames advancing, no 4xx/5xx requests; only a probe-induced `getImageData` warning.
- 2026-11-24: Rebased all four task commits onto main, re-ran four `node --check`, suites 64/12/2 and `git diff --check` clean, then pushed and fast-forwarded `main` to `b8de194`.
- 2026-11-24: Live cachebust verification caught stale `rules.js?v=1.4.92` in live `js/game.js`; TDD static check went RED then GREEN after changing the import to `./rules.js?v=1.4.96`. Committed and pushed as `5aaa0de`, fast-forwarded `main` again.
- 2026-11-24: Final live cachebust verification passed with fresh query strings for `index.html`, `js/game.js`, `js/rules.js`, `js/tiles.js` and `css/style.css`; all expected 1.4.96 strings present. Play link: `https://timmylaikh.github.io/Mahjong-fishing/?v=1.4.96`.
