# 自訂牌型擴充與房主開關設計

> 短設計文件。這份文件批准後才進入實作計畫。

## 使用者意圖

使用者原話：
`https://zh-yue.wikipedia.org/wiki/香港麻將食糊牌型 according to this website, add all the 自訂牌型 except 冧手胡 and 鐘鼓齊鳴（槓爆）. set those with 13 fan in the website to 10 fan. Also in the room, let the host choose if this match should enable 自訂牌型 or not.`

追問回覆：
`一條龍（一氣通貫） should be absorbed by 9子連環`.

開關範圍回覆：
`every single custom pattern` — 關閉時連既有的 人胡、七對子、綠一色、藍一色 一起停用。

## 範圍與做法選擇

### 牌型偵測
- 方案 A（建議）：在 `js/rules.js` 新增一個集中的自訂牌型偵測 helper，從 `countTiles()`／`decompose()`／花色與數字集合算出所有自訂牌型，回傳 `{ id, fan }` 候選；`evaluateDecomposition()` 呼叫它。優點是規則全在純函式引擎、好測試、不會散落各處。
- 方案 B：每個牌型各寫一個獨立函式並在 `evaluateDecomposition()` 逐條呼叫。行為等價但重複更多、測試更零散。
- 選擇 A。

### 開關傳遞
- 方案 A（建議）：`evaluateHand()`／`withFlowers()`／`flowerWinResult()` 的 `context` 增加布林 `customPatterns`，引擎預設 `true` 以向後相容現有 64 項規則測試，但遊戲端一律傳入 `match.customPatterns`（房間預設 `false`）；`false` 時引擎完全不計任何 `category: '自訂牌型'` 的牌型。遊戲端從 `match.customPatterns` 讀取並帶入所有 evaluate 呼叫。牌型表也據此過濾。
- 方案 B：遊戲端拿到 result 後自己濾掉自訂牌型並重算番數。缺點是吸收／重疊扣減／門前清等連鎖會算錯，不採用。
- 選擇 A。

## 新增／既有牌型清單（以維基頁為準）

不加入：冧手胡、鐘鼓齊鳴（槓爆）。

| 牌型 | 本遊戲番數 | 狀態 |
| --- | --- | --- |
| 一般高（二同順） | 1 | 新增 |
| 一般低（二步高） | 1 | 新增 |
| 缺門（缺一門） | 1 | 新增 |
| 三般高（三同順） | 2 | 新增 |
| 三般低（三步高） | 2 | 新增 |
| 一條龍（一氣通貫） | 2 | 新增；被九子連環吸收 |
| 兩般高（雙龍抱） | 3 | 新增 |
| 兩般低（雙蛇抱） | 3 | 新增 |
| 鏡糊糊 | 3 | 新增 |
| 四般高（四同順） | 3 | 新增 |
| 四般低（步步高） | 3 | 新增 |
| 三槓子 | 3 | 新增 |
| 三喜臨門（三風刻） | 3 | 新增 |
| 七對子（嚦咕嚦咕） | 3 | 既有 |
| 雙色同刻 | 3 | 新增 |
| 四歸四 | 3 | 新增 |
| 萬綠叢中一點紅 | 10 | 新增 |
| 百萬石（百萬雄兵） | 10 | 新增 |
| 藍一色 | 10 | 既有（原站 13 → 10） |
| 綠一色 | 10 | 既有（原站 13 → 10） |
| 紅孔雀 | 10 | 新增（原站 13 → 10） |

另有既有的 `人胡`（10 番）雖然不在維基自訂清單內，仍保留為 `category: '自訂牌型'`，因此同樣受開關控制。

## 吸收關係

- 新增 `九子連環 → 一條龍`（使用者指定）。
- 同族高階吸收低階以避免重複計番：`四般高 → 三般高 → 一般高`、`四般低 → 三般低 → 一般低`、`兩般高 → 一般高`、`兩般低 → 一般低`。鏡糊糊、三槓子、三喜臨門、雙色同刻、四歸四、缺門、萬綠叢中一點紅、百萬石、紅孔雀不與其他自訂牌型互相吸收（官方牌型的既有吸收維持不變）。

## 開關行為

- 房間由房主設定 `自訂牌型` 開關，預設 **關**（使用者 2026-11-25 明確指定）；賓客看到不可編輯並標註 `(由房主設定)`。
- `roomSettings.customPatterns` → `matchSetup.customPatterns` → `match.customPatterns`，並進 `cloneMatch()`／`adoptMatch()`，只傳送布林值，不新增 localStorage key、不傳送 `Infinity`。
- 開：
  - 引擎照常計所有自訂牌型。
  - 牌型一覽顯示所有牌型，自訂牌型名稱格保留小的 `自訂牌型` 標籤。
- 關：
  - `context.customPatterns = false`，引擎完全不計任何 `category: '自訂牌型'` 的牌型；官方總例與番數計算不受影響。
  - 胡牌對話、語音與計分不會出現自訂牌型名稱。
  - 牌型一覽過濾掉所有自訂牌型列。
  - 起糊門檻仍按既有 `minFan` 逻辑運作，以過濾後的總番為準。

## Constraints

- All player-facing text Traditional Chinese; no bottom 釣魚 button.
- Three help tabs remain; no `前往番數表` / `jumpToFanTable()`; HUD `起糊 N 番` remains.
- `FAN_CAP` stays `Infinity`; fan values above are plain numbers; no new localStorage keys.
- Match setup stays runtime-only and serialisable; host-only controls sync to guests.
- Every new pattern needs an entry in `FAN_VALUES`, a `PATTERN_TABLE` row with `desc` and a validated `example`, plus a passing evaluator test.
- Existing official patterns and their fan values are untouched; settlement/speech never show the `自訂牌型` tag.
- 13 番 patterns from the page are 10 番 in game; 綠一色/藍一色 already satisfy this.

## 檔案

- `js/rules.js`：fan 表、pattern 表、ABSORBS、自訂偵測 helper、evaluate 的 `context.customPatterns` 開關。
- `js/game.js`：所有 evaluate 呼叫帶入 `match.customPatterns`；牌型表過濾；房間／計分面板顯示；開關同步。
- `index.html`：房主房間開關 UI（賓客唯讀）。
- `tests/custom-patterns.test.mjs`：新牌型與開關行為的規則測試（_rules 保持 64 項_）。
- `tests/hkma-ui.test.mjs`：靜態接線與版本斷言（可增加測試，更新 AGENTS 數量）。
- `README.md`、`CHANGELOG.md`、`AGENTS.md`：文件更新；cachebust 升至 `1.4.107`，`./rules.js` import 同步升級；tiles/audio/net cachebust 不變。

## 驗證

- `node --check` rules/payout/game/net；rules 64/0、payout 12/0、net 2/0、static 全綠、新自訂牌型測試全綠；`git diff --check`。
- 瀏覽器：房主開／關開關時牌型表與胡牌結果正確；賓客看到唯讀設定；help 表在關閉時不顯示自訂牌型。
- 完成後直接 push 到 GitHub `main`（使用者長期指示），live cachebust 驗證。
