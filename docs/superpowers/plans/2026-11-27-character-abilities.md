# 十二角色技能系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓十二隻角色各有在單機與連線都生效的能力（8 被動、4 主動），且不破壞既有結算冪等、胡牌規則、連線同步與固定 HUD/canvas 幾何。

**Architecture:** 把可純化的規則放進新檔 `js/abilities.js`（Node-importable、不碰 DOM），`js/game.js` 負責 runtime state、掛點、host 仲裁與 UI；跨座位效果一律走 host 權威 `ability`/`abilityResult` 訊息，金錢修正集中在唯一的 `recordRoundResult()` 漏斗。百搭牌用 34 種替代的共用 pure helper 同時供胡牌判定與打出聽牌預覽。

**Tech Stack:** 靜態 HTML/CSS/ES modules、Node 原生測試（無框架）、Pillow 產圖、PeerJS。`js/payout.js` 與 `js/rules.js` 保持 pure 不改動。

**Spec:** `docs/superpowers/specs/2026-11-27-character-abilities-design.md`

## Global Constraints

- 43 張已批准牌圖 PNG 不動；百搭牌是**新增** `assets/tiles/wildcard.png`，由 `B.png` 疊麻雀圖示衍生，不改 `B.png`。
- HUD/canvas 固定幾何不變；技能 UI 塞進既有 HUD grid 空位或 absolute 定位，不加固定高度。
- 無新 localStorage key（只允許 `mf-sound`/`mf-volume`/`mf-fantotal`/`mf-hookspeed`/`mf-gameseconds`）；CD／復活／冰凍等全在 runtime state，`resetMatch()` 重置。
- `FAN_CAP = Infinity` 不變；`fanCapTen` 仍只走 boolean；能力番在 cap 之後加，可超過 10 番。
- `js/payout.js` 保持 pure，`settleRound()` 與 12 個 payout 測試數字不變；`recordRoundResult()` 仍是唯一結算漏斗，`roundKey` 冪等檢查在最前面。
- 所有 player-facing 文字用繁體中文；技能提示固定字串：「百搭牌不能打出」「被冰凍，無法動作」。
- 版本 1.4.145 → **1.4.146**：index 的 `css/style.css` 與 `js/game.js` pin、`js/game.js` 的 `./rules.js` import 與 **兩個** `assets/characters/…png` src、README play link、CHANGELOG 條目全部升級。
- native/inline 執行，不派 subagent；直接 push `main` 不開 PR；完整驗證後才 push。
- 既有測試數字不變：rules 64/0、payout 12/0、net 2/0、static 10/0、custom 8/0（新 pure helper 放新檔 `tests/abilities.test.mjs`，不增加 static block 數）。

## Review Focus

- **連線重播／重連不得重抽 Cat/Turtle 百分比或重複扣錢**：host 抽一次寫進 `settled.log.abilities` 並廣播，guest 用收到的值；`actionId` 去重 Monkey。→ Task 3 Step 4 測 `applyAbilityMoney` 同輸入兩次結果一致、guest 不重抽；Task 4 Step 4 測 `actionId` 重複被忽略。
- **百搭牌必須跑完 34 種替代，且結果要餵打出階段聽牌預覽（不只是胡牌判定）**：→ Task 2 Step 4 測 `wildcardWaitTiles` 回傳全部讓手牌聽牌的替代（不是第一個），且 discard preview 呼叫它。
- **冰凍玩家不能做任何動作，且到期走 host 同步時鐘**：→ Task 4 Step 4 測 `isFrozen` 到期判斷與 `paused()`/`cast()`/`discard()` 的 gating 断言。
- **Dragon 只擋別人碰上槓，不擋胡，且只在 discarder 是 dragon 時生效**：→ Task 3 Step 4 測 claim 入口對 dragon 與非 dragon discarder 的差異。
- **Phoenix 復活後錢設 $1、比赛不結束、重播不再復活**：→ Task 3 Step 4 測 `applyAbilityMoney` 在 `before+delta<=0` 時回 $1 且 `revived=true`，重播冪等。

---

### Task 1: 純能力 helper 與測試

**Files:**
- Create: `js/abilities.js`
- Create: `tests/abilities.test.mjs`

**Interfaces:**
- Consumes: `TILE_IDS` (`js/tiles.js`), `evaluateHand`, `findWaits` (`js/rules.js`)
- Produces:
  - `ABILITY_DEFS`（id → `{ kind:'passive'|'active', cdSeconds?, desc }`，含 cat/squid/giraffe/sparrow/bee/monkey/phoenix/dragon/turtle/panda/penguin/pig）
  - `characterAbility(id) -> def`
  - `bonusFanFor(characterId, { flowerCount=0, souCount=0 }) -> integer`（bee `floor(flowerCount/2)`、panda `floor(souCount/3)`、其餘 0）
  - `cooldownReady(cooldowns, id, now) -> boolean`、`startCooldown(cooldowns, id, now) -> object`（回新物件，不 mutate）
  - `applyAbilityMoney({ before, settledMoney, characters, revived, earnPct, losePct }) -> { money, changes, revived }`
    - `characters`/`revived`/`earnPct`/`losePct` 皆為以 seat 為索引的陣列；百分比 0..0.5，host 提供
    - 逐座 `delta = settledMoney[s]-before[s]`；cat 正 delta `× (1+earnPct[s])`、phoenix 已復活正 delta `×1.2`、turtle 負 delta `× (1-losePct[s])`、pig `+ round(settledMoney[s]*0.05)`、`before+delta<=0` 且 phoenix → delta 改為 `1-before[s]` 且 `revived[s]=true`；四捨五入後 `money[s]=floor(before[s]+delta)`
  - `wildcardWaitTiles(concealed, melds=[], context={}) -> string[]`：把 `concealed` 中的 wildcard 依次換成 34 個普通 `TILE_IDS`，回傳所有使 `findWaits(...)` 非空的替代牌 ID（可為空陣列）
  - 註：既有 `js/game.js:6550-6570` 的聽牌提示是 inline 程式碼（沒有 `buildDiscardPreview()` 函式）；Task 2 須把該段包成一個本地函式再呼叫 `wildcardWaitTiles()`，讓 win check 與打出預覽共用。

- [ ] **Step 1: 寫失敗測試** `tests/abilities.test.mjs`（仿既有 tiny harness，`process.exitCode`）：assert `bonusFanFor('bee',{flowerCount:5})===2`、`bonusFanFor('panda',{souCount:7})===2`；`applyAbilityMoney` 對 cat 正 delta 用 `earnPct=0.3` 得 1.3 倍、turtle 負 delta 用 `losePct=0.2` 得 0.8 倍、pig 利息 5%、phoenix 復活到 $1；同輸入呼叫兩次結果 deepEqual；`cooldownReady`/`startCooldown` 的 180s monkey CD；`wildcardWaitTiles` 對已知 13 張聽牌手回傳多於一個替代且不中途停止。

- [ ] **Step 2: 跑測試確認 FAIL**
Run: `/home/timmy/.local/node/bin/node tests/abilities.test.mjs`
Expected: FAIL（Cannot find module `js/abilities.js`）

- [ ] **Step 3: 實作 `js/abilities.js`** 依上列精確 signature 與pin住的值；`wildcardWaitTiles` 從 `js/rules.js` import `findWaits`、從 `js/tiles.js` import `TILE_IDS`，wildcard ID 用 `'WILD'`。

- [ ] **Step 4: 跑測試確認 PASS**
Run: `/home/timmy/.local/node/bin/node tests/abilities.test.mjs`
Expected: `結果：N 通過，0 失敗`

- [ ] **Step 5: commit**
`git add js/abilities.js tests/abilities.test.mjs && git commit -m "加入角色能力 pure helper 與測試"`

---

### Task 2: 百搭牌素材與胡牌／聽牌整合

**Files:**
- Create: `assets/tiles/wildcard.png`（由 `assets/tiles/faces/B.png` 疊麻雀圖示，Pillow 產生，透明背景，不改 `B.png`）
- Modify: `js/game.js`（import `wildcardWaitTiles`；`startGame()` 發牌、`discard()`、`canDeclareMeld()`、`resolveDraw()`/`finishAiReel()` win check、打出聽牌預覽 row `js/game.js:6550-6570` 的「暫無聽牌」提示邏輯 — 目前是 inline，沒有 `buildDiscardPreview()` 函式，需把這段抽成同名 pure-wrapper 供 Task 共用）
- Modify: `CREDITS.md`（百搭牌衍生來源）
- Test: `tests/hkma-ui.test.mjs`（既有 block 內加断言，不加新 block）

**Interfaces:**
- Consumes: `wildcardWaitTiles` from Task 1；`evaluateHand`, `findWaits` from `js/rules.js`
- Produces: `game.wildcardSeat`（持有 wildcard 的 seat 或 `null`）；`'WILD'` 作為 hand 中的特殊 ID

- [ ] **Step 1: 寫失敗測試** 在 static test 既有 boat/rod block 加：`assert.match(game, /wildcardWaitTiles\(/)`、`assert.match(game, /'WILD'/)`、`assert.match(html, /wildcard\.png/)`（或 game asset src `wildcard.png?v=1.4.146`）、`assert.doesNotMatch(game, /discard\(\)\s*\{[^}]*WILD/)` 改為檢查「百搭牌不能打出」字串存在。

- [ ] **Step 2: 跑 static suite 確認 FAIL**
Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: FAIL（新增能力断言未匹配）

- [ ] **Step 3: 實作 production** `startGame()` 發牌後若 sparrow seat 存在，在其 private hand 加一張 `'WILD'` 並設 `game.wildcardSeat`；`discard()` 與 `canDeclareMeld()` 遇到 `'WILD'` 回绝並 toast「百搭牌不能打出」；win check（`resolveDraw()` 與 `finishAiReel()`）先呼叫 `wildcardWaitTiles()`，對每替代跑 `evaluateHand()`，取任一合法且 `qualifyingWin()` 通過者設為 result，`bonusFan` 另計；把 `js/game.js:6550-6570` 的聽牌提示抽成 wrapper 後，對含 wildcard 的 13 張手用同一 helper 的完整清單顯示所有可補牌。產生 `assets/tiles/wildcard.png`，更新 CREDITS.md。

- [ ] **Step 4: 跑 static suite 確認 PASS**
Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs`
Expected: `結果：10 通過，0 失敗`

- [ ] **Step 5: browser check** fresh cachebust `?test=1&v=1.4.146-wild`，確認 wildcard 圖示可見、console errors=[]。

- [ ] **Step 6: commit**
`git add assets/tiles/wildcard.png js/game.js CREDITS.md tests/hkma-ui.test.mjs && git commit -m "加入麻雀百搭牌並整合胡牌與聽牌預覽"`

---

### Task 3: Runtime state、被動能力與結算掛點

**Files:**
- Modify: `js/game.js`（`resetMatch()`、`CHARACTERS`、`characterAbility` wrapper、Bee/Panda `bonusFan`、`qualifyingWin()` 前、`recordRoundResult()`、`announceWin()` compact、`payoutSummary()`/end overlay、Dragon claim 入口）
- Test: `tests/hkma-ui.test.mjs`（既有 block 加断言）

**Interfaces:**
- Consumes: `ABILITY_DEFS`, `characterAbility`, `bonusFanFor`, `applyAbilityMoney` from Task 1
- Produces: `game.abilityState[seat]`、`game.pendingPeek`、`settled.log.abilities`

- [ ] **Step 1: 寫失敗測試** static 加：`assert.match(game, /abilityState\[/)`、`assert.match(game, /applyAbilityMoney\(/)`、`assert.match(game, /bonusFanFor\(/)`、`assert.match(game, /角色的能力 \+/, /角色能力/)`、`assert.match(game, /'dragon'/)` 於 claim 入口 block。

- [ ] **Step 2: 跑 static suite 確認 FAIL** → `9 通過，1 失敗`

- [ ] **Step 3: 實作 production**
  - `resetMatch()` 重置 `abilityState[seat] = { cooldowns:{squid:0,giraffe:0,monkey:0,penguin:0}, phoenixRevived:false }`、`seenAbilityActions = new Set()`、`pendingPeek = null`、`inkUntil`/`frozenUntil` 全 0。
  - `CHARACTERS` 每項加 `ability: { kind, id, cdSeconds?, desc }`（值逐字照 spec ©7）。
  - Bee/Panda：`bonusFan = bonusFanFor(characterId, {flowerCount, souCount})` 放進 `result.bonusFan`，`totalFan += bonusFan` 後才 `qualifyingWin()`；`announceWin()` compact result 帶 `bonusFan`；end overlay 額外一行「角色能力 +N 番」，`formatWinBreakdown()` 不改。
  - Dragon：`canDeclareMeld()` 與 `buildClaimActions()` 及 AI claim 共用入口加 `if (characterAbility(discarderCharacter).id === 'dragon')` 時不准 碰/上/槓（胡仍可）。
  - `recordRoundResult()`：在 `settleRound()` 之後、寫回 `match.money` 之前，host 用真隨機抽 cat `earnPct`/turtle `losePct`（各自獨立 0.10..0.50），呼叫 `applyAbilityMoney({before, settledMoney, characters, revived, earnPct, losePct})`，把 `changes` 寫進 `settled.log.abilities`，重算 `settled.over`（phoenix 復活不因錢≤0 結束）。

- [ ] **Step 4: 跑 static suite 與既有測試確認 PASS**
Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs && /home/timmy/.local/node/bin/node tests/abilities.test.mjs && /home/timmy/.local/node/bin/node tests/payout.test.mjs`
Expected: static `10/0`、abilities `通過 0 失敗`、payout `12/0`（數字不變）

- [ ] **Step 5: commit**
`git add js/game.js tests/hkma-ui.test.mjs && git commit -m "加入被動能力與結算金錢修正"`

---

### Task 4: 主動技能、host 仲裁訊息與 AI 發動

**Files:**
- Modify: `js/game.js`（`resolveAbility()`、`abilityReady`/`startCooldown` wrapper、`broadcastOrSend()`、`net.on(...)` whitelist + relay、`isFrozen()` gating、`aiTick()`、`inkUntil`/`frozenUntil`/`seenAbilityActions`、`pendingPeek`、giraffe `target` 驗證）
- Test: `tests/hkma-ui.test.mjs`（既有 block 加断言）

**Interfaces:**
- Consumes: `ABILITY_DEFS`, `cooldownReady`, `startCooldown` from Task 1；`game.abilityState` from Task 3
- Produces: 新訊息 `'ability'`, `'abilityResult'`；`resolveAbility({ seat, id, target, actionId })`；giraffe `target` 為三位對手之一的 seat

- [ ] **Step 1: 寫失敗測試** static 加：`assert.match(game, /t:'ability'/)`、`assert.match(game, /t:'abilityResult'/)`、`assert.match(game, /actionId/)`、`assert.match(game, /isFrozen\(/)`、`assert.match(game, /inkUntil\[/)`、`assert.match(game, /frozenUntil\[/)`、`assert.match(game, /giraffeTarget/)`（host 驗證 human giraffe 的指定 target 是合法對手 seat）。

- [ ] **Step 2: 跑 static suite 確認 FAIL** → `9 通過，1 失敗`

- [ ] **Step 3: 實作 production**
  - `resolveAbility({seat,id,target,actionId})`：host 側驗證 `cooldownReady` 與 target 合法；`seenAbilityActions.has(actionId)` 直接回；squid → inkUntil[對手] = now+5000、giraffe → 用 `giraffeTarget` 驗證 human 指定的 `target` 是三位對手之一（AI 則隨機選），`pendingPeek` 只回請求者、monkey → host 改 `match.money`（`amount = max(1, floor(targetMoney/20))`）並 `{t:'match'}` 廣播、penguin → frozenUntil[對手]=now+3000；`startCooldown` 寫入；`broadcastOrSend({t:'abilityResult',...})`。單機直接呼叫同一函式不發訊息。
  - `net.on('ability')` host relay、`net.on('abilityResult')` 各設備套用視覺／狀態；兩者加進 whitelist。`abilityResult.tiles` 只回 giraffe 請求者（`target` 指定座位的手牌），其餘設備不收 `tiles`。
  - gating：`paused()`、`startCast()`/`cast()`、`discard()`、`canDeclareClaim()`、`canDeclareMeld()`、`buildClaimActions()`、`aiTick()` 先查 `isFrozen(game.seat)`；host 收到 freeze 同步 `frozenUntil`。
  - `aiTick()`：CD 好時每秒約 1% 機率對合法目標發動（giraffe 隨機選一位對手偷看，其餘隨機對手）。

- [ ] **Step 4: 跑 static 與 net 測試確認 PASS**
Run: `/home/timmy/.local/node/bin/node tests/hkma-ui.test.mjs && /home/timmy/.local/node/bin/node tests/net.test.mjs`
Expected: static `10/0`、net `2/0`（數字不變）；static 加 `assert.doesNotMatch(abilityHandler, /Math\.random\(\)/)` 確認重播不重抽。

- [ ] **Step 5: commit**
`git add js/game.js tests/hkma-ui.test.mjs && git commit -m "加入主動技能與 host 仲裁訊息"`

---

### Task 5: UI／CSS／版本號與完整驗證

**Files:**
- Modify: `index.html`（HUD row 技能按鈕容器、giraffe 選目標小選單、peek modal、ink overlay、五個版本 pin）
- Modify: `css/style.css`（技能圓鈕、peek panel、ink overlay、CD 數字，不加固定高度）
- Modify: `js/game.js`（`./rules.js?v=1.4.146`、兩個 `assets/characters/${id}.png?v=1.4.146`）
- Modify: `README.md`, `CHANGELOG.md`, `tests/hkma-ui.test.mjs`

**Interfaces:**
- Consumes: Task 1–4 全部 helpers/state
- Produces: `ui.abilityButtons`, `ui.giraffeTargetPicker`（列出三位對手的小選單）, `ui.peekPanel`, `ui.inkOverlay`

- [ ] **Step 1: 寫失敗測試** static 把五個 pin 改 `1\.4\.146`、character asset src 改 `1.4.146`，加：`assert.match(game, /abilityButtons/)`、`assert.match(game, /giraffeTargetPicker/)`、`assert.match(game, /peekPanel/)`、`assert.match(css, /ink-overlay/)`、`assert.doesNotMatch(css, /height:\s*\d+px/)` 於技能 block（確認不撐高 HUD）。

- [ ] **Step 2: 跑 static suite 確認 FAIL** → `9 通過，1 失敗`（stale pin）

- [ ] **Step 3: 實作 production** HUD row 加最多四個小圓鈕（魷魚／長頸鹿／猴子／企鵝）顯示 CD 秒數，僅對應角色且未被冰凍時出現；按長頸鹿鈕先彈 `giraffeTargetPicker` 小選單列出三位對手，玩家點一位才送 `{t:'ability', id:'giraffe', target, actionId}`；peek panel 顯示該指定對手手牌（只請求者）；ink 時 canvas 上蓋半透明黑遮罩（`pointer-events:none`）；freeze 時角色頭像 ❄ + toast「被冰凍，無法動作」；CSS 用 absolute/既有 grid 空位不加固定高度。五個版本 pin 升至 1.4.146；README play link；CHANGELOG `## 1.4.146 — 十二角色技能系統`。

- [ ] **Step 4: 完整驗證**
Run:
```
NODE=/home/timmy/.local/node/bin/node
$NODE --check js/rules.js && $NODE --check js/payout.js && $NODE --check js/game.js && $NODE --check js/net.js
$NODE tests/rules.test.mjs        # 64 通過，0 失敗
$NODE tests/payout.test.mjs       # 12 通過，0 失敗
$NODE tests/net.test.mjs          # 2 通過，0 失敗
$NODE tests/hkma-ui.test.mjs      # 10 通過，0 失敗
$NODE tests/custom-patterns.test.mjs # 8 通過，0 失敗
$NODE tests/abilities.test.mjs    # N 通過，0 失敗
git diff --check
```
Expected: 全部 PASS，數字不變。

- [ ] **Step 5: browser check** fresh cachebust `?test=1&v=1.4.146-abilities`：單機開局確認技能按鈕、wildcard、ink/freeze 視覺、結算後 money 修正；兩 tab 訊息模擬確認 host 仲裁與 guest 同步；console errors=[]。

- [ ] **Step 6: commit、merge、push、live verify**
```
git add CHANGELOG.md README.md css/style.css index.html js/game.js tests/hkma-ui.test.mjs
git commit -m "完成角色技能 UI 與版本升級"
cd /home/timmy/Mahjong-fishing
git checkout main && git pull --ff-only origin main && git merge --no-ff hkma-fan-table -m "合併十二角色技能系統"
# 確認 merge 真的執行（git log -1）再 push
git push origin main
```
Expected: 直接 push 無 PR；live verify fresh cachebust 確認 pins 1.4.146、無 1.4.145 殘留、新素材與新訊息字串都存在。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-27-character-abilities.md`. 請 review。

依你一貫的 native/inline 執行方式（不派 subagent），我建議用 native 直接逐 task 實作：Task 1 的 pure helpers 是後面所有 task 的介面基礎，Tasks 2–5 都依賴它的回傳型別，且每一 task 各自有獨立 TDD 循環與 commit，交接成本很低。

Does it capture what you want? 確認後我就從 Task 1 開始。
