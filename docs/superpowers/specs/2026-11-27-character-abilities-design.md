# 十二角色技能系統 — 設計文件

日期：2026-11-27
狀態：等待使用者核准（核准後才進入 writing-plans，才開始寫 product code）

---

## 1. 意圖與動機

目前十二隻角色只是外觀（PNG + 選擇 + 頭像），玩法完全一樣。使用者希望每個角色有獨特能力，讓選角有實際意義。使用者明確選擇**完整版**：單機與連線都生效、需要新的 host 權威訊息、長頸鹿偷看手牌接受「房主中介」的隱私例外。

原始需求（逐字保留）：

```
anyway, now add abilities for the characters
Characters:
Cat Get Passive: 10-50% more earnings from winning.
Squid Active: Spilt ink to block the vision of other players for 5 secs.(1 min CD)
Giraffe: Active: Peak into a player's hand (1 min CD)
sparrow: Passive: Start the game with a 百搭牌 (make the image the current 白版 with the sparrow icon added) (you cannot play this tile or use it for 碰上槓)
Bee: Passive: Gain extra 1 fan for every 2 flower tiles.
Monkey stealer: Active: randomly steal 1/20th of the current money from a random player (3 min CD)
Phoenix: Passive: when money goes to 0 or below, revive with $1 and game goes on, from there on, gain 20% more earnings from winning.
Dragon: Passive: No one can 碰上槓 from you.
Turtle: Passive: lose 10-50% less from losing.
Panda: Passive: Gain extra 1 fan for every 3 索子 tiles.
Penguin: Active: Freeze enemies for 3 secs, they cannot perform any action. (2 min CD)
Pig: Passive: Piggy bank: After every round, gain interest of 5% of your current money.
```

---

## 2. 目標 / 非目標 / 反目標

**目標**
- 十二個能力在單機（含 AI）與連線（host + guest）都正確生效。
- 所有跨座位效果由 host 權威仲裁，廣播後各設備狀態一致。
- 不破壞既有結算冪等、`roundKey`、胡牌規則、連線同步、HKMA《香港麻雀總例》番值。
- 玩家能在 HUD 使用主動技能，並看到冷卻／持續時間。

**非目標**
- 不改 43 張已批准牌圖（新百搭牌是**新增**素材，不是改 `B.png`）。
- 不新增 localStorage key；冷卻、復活標記等全部只存在 runtime state。
- 不改 HUD／canvas 固定幾何：技能按鈕塞進既有 HUD 格線，不撐高。

**反目標（做了就算失敗）**
- 讓 guest 自己改錢、自己判定別人是否被冰凍／被偷 — 必須 host 仲裁。
- 讓百搭牌可被打出、碰上槓，或偷改造 `evaluateHand()` 本體。
- 用 `Date.now()` 直接乘時間倍率（1.4.144 已修過這個 bug，不能再犯）。

---

## 3. 約束（沿用專案既有規範）

- 43 張牌圖 PNG 不動；HUD/canvas 幾何固定；無新 localStorage key。
- `FAN_CAP = Infinity` 不變；`fanCapTen` 仍只走 boolean。
- `payout.js` 保持 pure；`recordRoundResult()` 仍是唯一結算漏斗。
- 所有 player-facing 文字用繁體中文。
- native/inline，不派 subagent（builder check 自己讀文件）。
- 直接 push `main`，不開 PR；完整驗證後才 push。
- 版本從 1.4.145 → **1.4.146**（五個 cachebust pin + 角色素材 pin）。

---

## 4. approaches（已與使用者討論，使用者選 1）

| 方案 | 內容 | 取捨 |
| --- | --- | --- |
| 1. 完整版（**選定**） | 12 能力單機＋連線全生效；新增 host 權威訊息；長頸鹿偷看走 host 中介 | 最忠於需求；改動最大、風險最高（結算／同步／隱私） |
| 2. 單機完整、連線視覺 | 單機 AI 全套；連線只做被動＋本地動畫 | 安全但連線玩家「看了等於沒用」 |
| 3. 兩階段 | 先做被動＋麻雀百搭牌，主動技能後做 | 最穩，但使用者明確要一次做完 |

我原本建議 3，並提醒方案 1 必須打破手牌隱私；使用者回 `1`，並接受長頸鹿的隱私例外。

---

## 5. 核心架構

### 5.1 Runtime state（全新，不進 localStorage）

在 `game` 上新增：

- `abilityState[seat] = { cooldowns: { squid:0, giraffe:0, monkey:0, penguin:0 }, phoenixRevived: false }`
- `inkUntil[seat]`：被墨汁遮蔽的本地到期時間戳（`game.clockOffset` 對齊）
- `frozenUntil[seat]`：被冰凍的到期時間戳
- `seenAbilityActions: Set<string>`：用 `actionId` 去重，避免重播／重連重複扣錢
- `pendingPeek`：長頸鹿偷看結果（只給請求者）

開新一場（`resetMatch()`）時全部重置。

### 5.2 能力資料表

在 `js/game.js` 的 `CHARACTERS` 每項增加 `ability: { kind: 'passive'|'active', id, cdSeconds?, desc }`，並新增 pure helper：

- `characterAbility(seatOrId)` → 定義
- `abilityReady(seat, id)` → 現在時間 ≥ cooldowns[id]
- `applyCooldown(seat, id)` → 寫入 `cooldowns[id]`
- `isFrozen(seat)` / `isInked(seat)` → 由到期時間判斷

### 5.3 結算與番數加成（關鍵設計）

分兩層，避免污染 pure engine：

1. **能力番（Bee / Panda）** — 由**贏家自己**在 `qualifyingWin()` 之前算好，放進 `result.bonusFan`，再 `totalFan = result.totalFan + bonusFan`。
   - `qualifyingWin()` 用加成後的 fan 判斷起糊。
   - `formatWinBreakdown()` 不改（它是官方牌型文字）；end overlay 額外顯示一行「角色能力 +N 番」。
   - 連線時 `announceWin()` 的 compact result 要帶 `bonusFan`，guest 用它結算。
   - 能力番在 `evaluateHand()` 的 cap 之後加，所以可以超過 10 番（與自訂 13 番同理）。

2. **金錢修正（Cat / Turtle / Phoenix / Pig / Monkey）** — 在 `recordRoundResult()` 內、`settleRound()` 回來後、**寫回 `match.money` 之前**，新增 pure helper `applyAbilityMoney({ settled, characters, abilityState, before })`（放在**新檔 `js/abilities.js`**；`js/payout.js` 完全不改，12 個 payout 測試數字不變）：
   - 輸入 `before = match.money`（舊值）、`settled.money`（引擎算完）、每個座位角色與 runtime 標記、以及 host 抽好的 `earnPct` / `losePct`（見下）。
   - 逐座算 `delta = settled.money[seat] - before[seat]`：
     - `delta > 0` 且 cat：`delta = round(delta * (1 + earnPct))`
     - `delta > 0` 且 phoenix 已復活：`delta = round(delta * 1.2)`
     - `delta < 0` 且 turtle：`delta = -round(-delta * (1 - losePct))`
     - **cat / turtle 的 `earnPct` / `losePct` 是每局隨機 10–50%**（使用者 2026-11-27 回饋：不要跟花數掛鉤）。使用者要求**由 host 算好再送給大家**：host 在結算時抽一次真隨機（cat `earn`、turtle `lose` 各自獨立，映射 10..50），把數值寫進 `settled.log.abilities` 並隨 `{t:'match'}`／win compact result 廣播；guest **直接使用收到的百分比，不可自行重抽**。單機時 host 就是本機，同樣只抽一次。這樣既保留真正隨機，也保證連線一致與冪等（不再用 `roundKey` hash）。
     - pig：`delta += round(settled.money[seat] * 0.05)`（利息按結算後、加能力前的錢算）
     - phoenix：若 `before[seat] + delta <= 0`，改為 `1 - before[seat]` 並標 `phoenixRevived = true`
   - 寫回 `settled.money[seat] = floor(before[seat] + delta)`，並在 `settled.log.abilities = [...]` 記錄每筆修正（供 end overlay 與除錯）。
   - `settled.over` 重算：phoenix 復活後不因「錢 ≤ 0」結束；手數上限仍可結束。
   - **冪等不變**：`roundKey` 檢查仍在最前面，重播同一手不會再套一次能力。
   - Monkey 偷錢是**局中**行為，不走這層；它直接改 `match.money` 並由 host 廣播 `{t:'match'}`，用 `actionId` 去重。

### 5.4 主動技能觸發與訊息

新增 net 訊息（都要加進 `net.on` whitelist + host relay）：

| 訊息 | 方向 | 內容 | host 行為 |
| --- | --- | --- | --- |
| `ability` | 任一 → host | `{ t:'ability', seat, id, target?, actionId }` | 驗證 CD／權限／目標 → 寫 cooldown → 廣播 `{t:'abilityResult', ...}` |
| `abilityResult` | host → all | `{ t:'abilityResult', seat, id, target, actionId, until?, amount?, tiles? }` | 各設備套用視覺效果；`tiles` 只回給 giraffe 請求者 |
| `ink` | 合併進 abilityResult | `id:'squid', until` | 對手 canvas 加暗色遮罩 5s |
| `freeze` | 合併進 abilityResult | `id:'penguin', until` | 對手 `frozenUntil` 設值 |
| `steal` | 合併進 abilityResult | `id:'monkey', from, to, amount` | host 改 `match.money` 並廣播 match |

單機時 host 就是本机，直接呼叫同一套 `resolveAbility()`，不發 net 訊息。

### 5.5 被動技能掛點

- **Dragon**：在 `canDeclareMeld()` / `buildClaimActions()` / AI claim 判斷的共用入口加 `if (characterOf(discarder).id === 'dragon') return false`（只擋碰上槓，不擋胡）。
- **Bee**：`beeBonus = floor(flowerCount(seat) / 2)`，花數是 HUD 公開資訊，各設備可各自算；為避免不一致，仍由贏家帶進 `bonusFan`。
- **Panda**：`pandaBonus = floor(countSouInWinningHand / 3)`；索子數由贏家從**替代百搭之後**的最終胡牌牌組（`game.hand + game.melds`）算，放進 `bonusFan`。
- **Cat / Turtle / Phoenix / Pig**：見 5.3 金錢修正層。

### 5.6 麻雀百搭牌（sparrow，最需要小心）

- 新增素材 `assets/tiles/wildcard.png?v=1`：以現有白版 `B.png` 為底，疊上麻雀圖示（新檔，**不改** `B.png` 本身）。CREDITS.md 記錄衍生來源。
- 開局時（`startGame()` 的發牌後）給 sparrow 座位額外放一張 `wildcard` 在其 private hand，hand 變成 14 張。
- 限制：
  - `discard()` 拒絕 wildcard（提示「百搭牌不能打出」）。
  - `canDeclareMeld()` 拒絕包含 wildcard 的碰上槓。
  - 不進 `game.flowers`，不算花。
- 胡牌判定：在 `resolveDraw()` / `finishAiReel()` 的 win check 前，若手上有 wildcard，**一律跑完 34 種普通牌替代**（使用者 2026-11-27 回饋：不要只跑到第一個就停），把每個「替代後能合法胡牌且達起糊」的牌記入清單。清單非空即可胡；胡牌 breakdown 用清單中任一合法替代（不必取最高番），牌風文字仍顯示原牌型（百搭不進 breakdown）。
- **34 種替代的結果要同時供聽牌提示使用（使用者 2026-11-27 兩次回饋）**：百搭牌的核心價值是讓玩家看到「所有可能讓他聽牌、進而補成胡牌的牌」。對某手牌做 34 種替代時，凡替代後**已聽牌（有 waits）**者，把該替代牌記入一份 `wildcardWaitTiles` 清單。這份清單不只判斷能不能胡，更要拿去餵 `buildDiscardPreview()`／聽牌提示（打出 → `暫無聽牌`／聽牌列）：玩家需要從**所有可能讓他補成胡牌的牌**得到聽牌 tips，而不是只看到單一替代。不能只在「等人胡」的 win check 才替代——打出階段算每張可打出牌的 `findWaits()`、判斷是否聽牌與番數是否達 `起糊` 時，若手上有 wildcard，也必須跑 34 種替代並用完整清單。抽成共用 pure helper `wildcardWaitTiles(hand, melds, ctx)`（在 `js/abilities.js` 或 rules 周邊），**回傳所有讓手牌聽牌的替代牌 ID 陣列（可能為空）**；win check（檢查清單是否含能胡且達起糊者）與 discard preview（把所有清單牌顯示為可補牌 tips）都呼叫它，避免兩處邏輯分歧。
- 抓取：抓到普通牌後仍必須打掉該張（hand 回到 14，含 wildcard）。

### 5.7 AI 使用主動技能

在 `aiTick()` 加簡單啟發式：CD 準備好時，依機率（例如每秒 1%）隨機選一個合法目標發動；giraffe 隨機選一個對手偷看（AI 不做選目標步驟）；penguin/squid/monkey 隨機選對手。不做複雜策略。

人類玩家使用長頸鹿技能時**可以指定目標**（使用者 2026-11-27 確認）：按下長頸鹿鈕後先彈出一個小選單列出三位對手，玩家選其中一位，host 仲裁後只把該對手的手牌回給請求者設備（見 §5.8）。

### 5.8 UI

- HUD 既有 row 加最多四個小圓鈕（魷魚／長頸鹿／猴子／企鵝），顯示 CD 秒數；只在該座位是對應角色時出現且未被冰凍。
- 冰凍 gating：`paused()`、`cast()`、`discard()`、`canDeclareClaim()`、`canDeclareMeld()`、`buildClaimActions()`、`aiTick()` 全部先查 `isFrozen(seat)`；host 收到冰凍訊息後同步 `frozenUntil`。
- 不撐高 HUD：用既有 `.hud-bar` 的 grid 空位或 absolute 定位；CSS 不加新的固定高度。
- ink 時在 canvas 上畫半透明黑遮罩（不擋 HUD／按鈕，`pointer-events` 不受影響）。
- freeze 時在該角色頭像上畫 ❄ 標記 + toast「被冰凍，無法動作」。
- 長頸鹿技能**可指定目標**（使用者 2026-11-27 確認）：按長頸鹿鈕時先彈出一個小選單列出三位對手（用名字／風位標示），玩家選一位後送出 `{t:'ability', id:'giraffe', target, actionId}`；host 仲裁 CD 後只把**該指定對手**的手牌以 `abilityResult.tiles` 回給請求者設備，其餘設備不收 `tiles`。結果用一個小 modal／inline panel 顯示（只在請求者設備）。AI 長頸鹿仍隨機選目標。此隱私例外（host 中介單向揭露手牌）已於設計階段獲使用者接受。

---

## 6. 測試與驗證

- **新檔** `tests/abilities.test.mjs`：測 pure helper（番加成、金錢修正、phoenix 復活、pig 利息、CD 判斷）。既有 rules 64/0、payout 12/0、net 2/0、static 10/0、custom 8/0 **數字不變**。
- static test：在既有 10 個 block 內加断言（能力表、新訊息、wildcard 素材、HUD 按鈕），不增加 block 數。
- TDD RED：先 bump 五個 version pin + 能力断言，看到 9/1 再寫 production。
- 完整驗證：四個 `node --check`、五套測試、`git diff --check`。
- 瀏覽器：單機跑一局，確認技能按鈕、wildcard、ink/freeze 視覺、結算後錢修正；連線用訊息模擬（兩個 tab）確認 host 仲裁與 guest 同步。
- live verify：fresh cachebust 確認 pins、新素材、新訊息字串。

---

## 7. 我替你做的決定（請在讀完時順便 confirm）

以下數值你只給了範圍，我選了固定值；如果不想這樣，告訴我改哪個：

1. **Cat / Turtle 幅度**：每局**隨機 10–50%**（使用者 2026-11-27 回饋：取消原本「跟花數掛鉤」的設計；且要求**由 host 算好送給大家**）。host 在結算時抽一次真隨機（cat `earn`、turtle `lose` 獨立），寫進 log 並廣播；guest 用收到的值、不自行重抽，確保連線一致與冪等。Cat 是「胡牌收益 +10~50%」，Turtle 是「輸錢 −10~50%」。（見 §5.3）
2. **Phoenix 復活**：錢 ≤ 0 時設為 $1，之後收益 +20%（永久，直到開新場）。
3. **Pig 利息**：每局結束結算後，按當時錢數 +5%，四捨五入。
4. **Bee / Panda**：每 2 花 / 每 3 索 +1 番，先加進 `bonusFan` 再判斷起糊；可超過 10 番上限。
5. **Monkey**：偷 `max(1, floor(目標錢 / 20))`，從隨機對手轉到自己；host 仲裁 + `actionId` 去重。**最低偷 $1**（使用者 2026-11-27 回饋：目標錢少於 $20 時仍要偷得到，例如 $5 也要被偷 $1）。CD 3 min（180s）不變（見下）。
6. **CD**：魷魚 60s、長頸鹿 60s、猴子 180s、企鵝 120s；效果 5s / 立即 / 立即 / 3s。
7. **百搭牌替代**：**一律跑完 34 種普通牌替代**（使用者 2026-11-27 回饋：不要跑到第一個就停、也不要只取最高番），把每個讓手牌聽牌（有 waits）的替代牌記入一份清單。win check 用這份清單判斷可否胡（清單中任一能胡且達起糊即可，不必最高番）；**更重要是聽牌提示要用這份完整清單**：玩家要從「所有可能讓他補成胡牌的牌」得到 聽牌 tips，而不是單一替代。這套替代不只用於 win check，也必須用於打出階段的聽牌預覽（`buildDiscardPreview()`／`findWaits()`），準確顯示打這張會不會聽牌、有哪些補牌、番數夠不夠胡。win check 與 discard preview 共用 `wildcardWaitTiles()` pure helper，回傳所有讓手牌聽牌的替代牌 ID 陣列。（見 §5.6）
8. **AI 技能**：CD 好時每秒約 1% 機率發動，隨機選合法對手。

---

## 8. builder 剩下的工作（核准後才做）

1. 跑 writing-plans skill，拆成可執行的 tasks。
2. 新素材 `wildcard.png`（從 `B.png` + 麻雀圖示衍生）。
3. 新增 `js/abilities.js`（pure helpers）與測試。
4. 改 `js/game.js`：state、CHARACTERS ability 欄、技能 helper、五個掛點、net 訊息、UI、AI。
5. 改 `js/payout.js` 或新檔：金錢修正 helper（pure）。
6. 改 `index.html` / `css/style.css`：技能按鈕、偷看 panel、ink overlay。
7. 改 `CREDITS.md`：百搭牌素材來源。
8. TDD RED → production → 完整驗證 → browser check → commit → merge → push → live verify → 繁中回報。

**在設計文件核准前，不寫任何 product code。**
