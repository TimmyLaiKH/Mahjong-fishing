# 創意自訂牌型設計

> 短設計文件。使用者已在對話中批准（`yep`）。

## 使用者意圖

使用者想在已有的自訂牌型系統上再加一組創意胡牌牌型。第一個是「全部同一種牌」，例如 14 張一萬；因為四槓時實際有 18 張，命名為 `一心一意` 而不是 `十四同`。使用者要求建議其他特別牌型，並逐一指定取捨與番數。

## 已鎖定牌型

全部 `category: '自訂牌型'`，受房主 `自訂牌型` 開關控制（關時不計番、不語音），在 `牌型一覽` 中無條件顯示並由 `sortPatternRows()` 排到最底。

| 牌型 | 條件 | 番數 |
| --- | --- | --- |
| 一心一意 | 全部牌都是同一種；同一種牌含四槓時共 18 張 | 13 |
| 九五之尊 | 全部牌只含各花色 5 與 9 | 10 |
| 四連刻 | 四組連續數字的刻子 | 3 |
| 三色同順 | 同一數字的順子在萬、筒、索各一組 | 2 |
| 三色同刻 | 同一數字的刻子在萬、筒、索各一組 | 2 |
| 全帶么九 | 每組面子與將都帶么九或字牌 | 2 |
| 五門齊 | 萬、筒、索、風牌、三元牌五類同時出現 | 2 |
| 全求人 | 四組副露全為碰／上／槓，並胡他人打出的將 | 1 |
| 斷么九 | 全為 2–8 數字牌，無字牌、無么九 | 1 |

不加入：`全么九（清老頭）`（既有官方 `清么九` 已覆蓋，使用者稱「if there is already 么九 then no need to add it」）、`五湖四海`、`七連對`；`雙色同刻` 不改（與順子互斥，使用者確認無需修正）。

## 決策

- 一心一意 **不吸收任何牌型**，與清么九、坎坎胡、清一色等並存；13 番即使在預設 10 番房間也照常計入 breakdown，派彩仍依上限封頂（既有行為，不改房間預設）。
- 吸收建議：`三色同順` 吸收 `鏡糊糊`、`三色同刻` 吸收 `雙色同刻`、`花么九` 吸收 `全帶么九`、`四連刻` 吸收 `對對糊`。
- 一心一意偵測必須用完整槓牌（`melds.flatMap(m => m.tiles)`）加隱手牌，不能用 `evaluateDecomposition()` 的 `allTiles`（該陣列只取槓前三張，四槓時會把 18 張誤算成 14 張）。
- 做法：擴充既有 `js/rules.js` 的集中式 `detectCustomPatterns()`，沿用 `FAN_VALUES`、`PATTERN_TABLE`（含經過驗證的 `example`）、`ABSORBS`、`context.customPatterns` 開關與 `sortPatternRows()` 排序。不新增 UI／網路欄位／localStorage key。

## 限制

- 所有玩家文字繁體中文；沒有底部 `釣魚` 按鈕；三個說明分頁維持。
- `FAN_CAP = Infinity`；13 番只是明顯高番，房間上限仍只影響派彩。
- 每個新牌型都要有 `FAN_VALUES`、附 `desc`／`example` 的 `PATTERN_TABLE` 列，以及 `tests/custom-patterns.test.mjs` 的通過測試；`tests/rules.test.mjs` 保持 64 項。
- cachebust 升級至 1.4.109，`./rules.js` import 同步；tiles 1.4.99、audio／net 不變。
- 完成後直接 push 到 `main`（使用者長期指示），live cachebust 驗證。

## 檔案

- `js/rules.js`：番數表、牌型表、ABSORBS、偵測邏輯。
- `tests/custom-patterns.test.mjs`：新牌型與開關、範例驗證。
- `tests/hkma-ui.test.mjs`：版本與接線靜態斷言。
- `README.md`、`CHANGELOG.md`、`AGENTS.md`：文件；cachebust 1.4.109。

## 驗證

- 四個 `node --check`；static、custom、rules 64、payout 12、net 2 全綠；`git diff --check`。
- 瀏覽器：開／關自訂牌型時牌型表都顯示新牌型於底部，開時可胡並計番，關時不計番。
