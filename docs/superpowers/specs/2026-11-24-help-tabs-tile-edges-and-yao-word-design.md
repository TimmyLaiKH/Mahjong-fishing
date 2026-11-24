# 玩法說明分頁、么字修正與牌圖立體邊設計

## 意圖

把玩法說明整理成兩個層次：操作說明與規則／派彩參考分開，讓玩家能在同一個視窗內快速切換。番數表採 HKMA《香港麻雀總例》為準，自訂牌型集中放在牌型一覽底部，避免混在官方番種之中。另有兩項一致性修正：把錯字「么」全部改成「么」；把牌面的立體感直接烘焙進現有 CC0 衍生 PNG，而不是只靠 CSS／canvas 疊圖。

## 已選做法

1. **玩法說明三分頁**：標籤為 `玩法說明`、`牌型一覽`、`派彩計算表`。首頁不再受限於六個 `<li>`，改為按可讀性重組的短清單，重要資訊放前面：先講拋竿／釣牌／胡牌基本流程，再講番數、起糊與派彩快速入口，其次是花牌、槓與補牌，再來是碰／上／明槓／搶槓與牌王，最後才是聽牌提示、語音與設定。必要時拆成更多 `<li>`，每項聚焦一個主題，並保留所有固定字串。牌型一覽保留 `#fanTableTitle` 與生成的 `#patternsBody`；派彩計算表保留 `#payoutTableTitle` 與 0–10 番表格。header 的 `前往番數表` 按鈕改為先切到 `牌型一覽`，再 focus 並捲動到 `#fanTableTitle`。
2. **自訂牌型置底**：`buildPatternTable()` 仍從 `PATTERN_TABLE` + `FLOWER_PATTERN_TABLE` 產生，但排序改為先官方／花牌（依番數），再 `category: '自訂牌型'`（依番數）。牌型一覽標題可改成 `香港麻雀牌型一覽`。四張自訂牌型是 `七對子`、`人胡`、`綠一色`、`藍一色`，只在名稱格顯示 `自訂牌型` 標籤。
3. **全部 `么` → `么`**：遍歷所有 tracked 檔案，包括 `index.html`、`js/rules.js`、`js/game.js`、`tests/rules.test.mjs`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`CREDITS.md`、既有計劃與 ledger。玩家字串、內部 pattern id、`ABSORBS` key、註解與測試斷言一起改，最終 `grep -R 么` 為零。只使用既有 runtime／network 欄位，不新增 localStorage key。
4. **烘焙牌圖立體邊**：修改 `scripts/process_assets.py`，在每張 120×160 最終牌圖（34 regular、8 花牌、背面）完成合成後，疊上一層很淺的頂部高光、右下暗影與細外框，模仿參考頁牌圖的 top/shadow/outline。素材仍來自現有 CC0 `Front.png`、face overlays 與花牌 overlays；不複製 wiki 的 CC BY-SA PNG。`js/tiles.js` 把 `TILE_ASSET_VERSION` 由 `6` 升到 `7`。移除 1.4.96 加在 `drawTile()` 內的 canvas bevel，避免雙重立體；DOM `.tile-img` 只保留原有分離陰影，移除 `::before` bevel。手指點擊、hover 與 transparency 行為不變。

## 考量過但沒有選

- **換成 wiki 的 `hk*.png`**：視覺最直接，但 wiki 預設 CC BY-SA 4.0，需逐檔確認授權並承受 share-alike 義務；本專案 `CREDITS.md` 要求授權清楚，因此不採用。
- **只保留 CSS／canvas 疊圖**：成本低且可逆，但使用者明確要求改 PNG，不能滿足需求；且與烘焙效果疊加會過度。

## 限制與驗證

- 所有玩家可見文字維持繁體中文；玩法說明不再要求正好六個 `<li>`，但必須易讀且把重要資訊放前面；不能有底部 `釣魚` 按鈕；固定字串與語音規則不變。
- `FAN_CAP = Infinity` 不變；localStorage 只可用既有五個 key；三組 Node 測試仍必須是 `64 通過，0 失敗`、`12 通過，0 失敗`、`2 通過，0 失敗`。
- 新增 Static TDD 檢查：分頁按鈕／panel、`前往番數表` 行為、自訂牌型排序、零 `么`、烘焙 function、`TILE_ASSET_VERSION = 7`、沒有 canvas bevel。
- 重新執行 `python3 scripts/process_assets.py` 產生 PNG；確認 43 張 face 皆為 120×160、背面存在、檔案大小合理。
- 全新瀏覽器檢查：三個 tab 可切換、按鈕可跳到牌型一覽、自訂牌型在底部、派彩表 0–10 番正確、DOM/canvas 牌圖可見且沒有雙重陰影、無 horizontal overflow、HUD/canvas geometry 不變、console 無錯誤、無 404。
- cachebust 提升到 `1.4.97`：`index.html` 的 CSS／game、`js/game.js` 的 `./rules.js` 與 `./tiles.js`；README 遊玩連結同步。
- `AGENTS.md` 移除「不重新產生 PNG／`TILE_ASSET_VERSION = 6`」舊限制，改為「PNG 已烘焙立體邊、`TILE_ASSET_VERSION = 7`、重產時執行 process_assets.py」；`CREDITS.md` 註明 wiki 僅作視覺參考、未使用其素材。

## 留給實作

- 提交順序：么字與自訂排序→分頁 HTML/CSS/JS→PNG 烘焙與版本→文件與部署驗證，每步做 RED→GREEN 與 commit。
- 最後推送 `main`，用不同 cachebust 驗證線上 `index.html`、`js/game.js`、`js/rules.js`、`js/tiles.js`、`css/style.css` 與新 PNG。
