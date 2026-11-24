# HKMA 番數表與玩法說明增強 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把番數表改採香港麻雀協會《香港麻雀總例》為唯一番數依據，並在玩法說明加入詳細派彩表，同時以 CSS／canvas 方式讓牌面看起來更有立體感。

**Architecture:** 先修改純規則模組與其測試，失敗後再修正；接著只改靜態 HTML 的玩法說明與來源標示；再用 CSS 與 canvas 繪圖疊加細微斜角、反光與陰影，不重新產生 PNG；最後同步文件、執行完整驗證並部署。所有變更維持純靜態網站與既有遊戲流程。

**Tech Stack:** 純靜態 HTML／CSS／原生 ES modules；Node 內建 `assert` 測試；Canvas 2D；GitHub Pages。

**Spec:** 本對話中已核准的設計：番數表採 HKMA 官方、玩法說明加入 static 0–10 番派彩表、以 CSS/canvas 強化牌面 3D 感（未另存檔）。

## Global Constraints

- 所有玩家可見文字使用純繁體中文。
- `README.md` 頂端保留遊玩連結。
- 不引入 build、framework、bundler。
- `js/rules.js`、`js/payout.js` 必須保持可在 Node 執行的純模組。
- `export const FAN_CAP = Infinity;` 必須維持不變。
- 測試輸出必須維持 `64 通過，0 失敗`、`12 通過，0 失敗`、`2 通過，0 失敗`。
- 提交前執行 `node --check js/rules.js`、`js/payout.js`、`js/game.js`、`js/net.js` 與 `git diff --check`。
- Node 路徑使用 `/home/timmy/.local/node/bin/node`。
- localStorage 只可使用 `mf-sound`、`mf-volume`、`mf-fantotal`、`mf-hookspeed`、`mf-gameseconds`。
- 玩法說明必須正好六個 `<li>`；新增表格與來源註腳必須在 `<ol class="help-list">` 外。
- 「前往番數表」按鈕 `#helpFanTableBtn` 與 `#fanTableTitle` 必須保留且可用。
- 固定字串不可改：`拋竿釣起你需要的牌吧！(點擊屏幕)`、`流局 時間到，沒有胡牌。`、`房主已離開`、`房主已離開，請重新開房間`、`房間已滿，請換一個房間。`、`房間已關閉，請重新開房間。`、`所有人加入後，請等待房主按下「開始遊戲」。`
- 不能有底部「釣魚」按鈕。
- 語音只接受明確 `zh-HK`／`yue`／粵語語音，不退回普通話；不新增 MP3 TTS。
- 不改变包牌、過水、碰槓優先、多家同胡、搶槓算自摸、槓上包全額自摸、花牌即時補牌等流程規則。
- 不改变起糊／上限設定、`fanCapTen` 序列化、AI、連線、HUD 配置。
- 不重新產生牌面 PNG；`TILE_ASSET_VERSION` 保持 `6`。
- 不整段複製 HKMA 文件；只採番種名稱、番數與自撰短說明。
- 最終所有 changed asset 的快取版本統一為 `1.4.96`：`css/style.css`、`js/game.js`、`js/game.js` 內的 `./rules.js` 與 `./tiles.js` 匯入。
- 瀏覽器檢查使用全新 `?test=1&v=<新值>`，並設 `mf-sound:'0,1'`、`mf-volume:'0.5,0.5'`。

## Review Focus

| 風險 | pin 住的測試／檢查 | 負責任務 |
| --- | --- | --- |
| `花幺九` 5→4 後重疊扣減算錯 | T3 總番 `12`；T8 仍 `18`；T7 allHonors 仍 `18` | Task 1 |
| `自訂牌型` 集合或位置錯誤 | 測試預期 `['七對子','人胡','綠一色','藍一色']` 且無 `特殊牌型`；瀏覽器確認只在牌型一覽 | Task 1、Task 2 |
| 派彩表與 `payout.js` 公式不一致 | 表列 0–10 番倍率 `1,2,4,8,16,24,32,48,64,96,128`；自摸每家 `1,1,2,4,8,12,16,24,32,48,64` | Task 2 |
| 玩法說明被改成七項或跳轉按鈕失效 | 瀏覽器檢查六個 `<li>` 與 `#helpFanTableBtn` 捲動 | Task 2 |
| 3D 效果破壞牌面或阻礙點擊 | canvas 與 DOM 牌都需可見；`pointer-events:none`；Console 無錯誤；`TILE_ASSET_VERSION=6` 不變 | Task 3 |
| 舊 JS/CSS 被快取 | `index.html`、`js/game.js`、`js/rules.js`、`js/tiles.js`、`css/style.css` 全部用不同 cachebust 驗證 | Task 4 |

---

### Task 1: HKMA 番數與自訂牌型（TDD）

**Files:**
- Modify: `js/rules.js:45`, `js/rules.js:49`, `js/rules.js:61-62`, `js/rules.js:125`, `js/rules.js:141`, `js/rules.js:161`, `js/rules.js:172`, `js/rules.js:200`, `js/rules.js:224`, `js/rules.js:228`
- Test: `tests/rules.test.mjs:224`, `tests/rules.test.mjs:470`, `tests/rules.test.mjs:475`, `tests/rules.test.mjs:480-481`, `tests/rules.test.mjs:508`, `tests/rules.test.mjs:910-918`

**Interfaces:**
- Consumes: 現有 `FAN_VALUES`、`PATTERN_TABLE` 匯出。
- Produces: `FAN_VALUES['花幺九'] === 4`；`PATTERN_TABLE` 中 `category === '自訂牌型'` 的 id 順序為 `七對子`、`人胡`、`綠一色`、`藍一色`；不再有 `category === '特殊牌型'`；不新增匯出。

- [ ] **Step 1: 先改測試，讓它失敗**

在 `tests/rules.test.mjs` 做以下修改：

- 線 224 測試名 `特殊牌型仍需要合法牌型（B4）` 改為 `自訂牌型仍需要合法牌型（B4）`。
- 線 470 的 `人胡` desc 斷言改為：

```js
assert.equal(
  PATTERN_TABLE.find((p) => p.id === '人胡').desc,
  '自訂牌型：閒家於開局第一輪即自摸；必為門前清，不另計自摸。香港麻雀協會《香港麻雀總例》沒有此番種。',
);
```

- 線 475 的 desc 斷言改為：

```js
assert.equal(
  PATTERN_TABLE.find((p) => p.id === '花幺九').desc,
  '全部由幺九牌及字牌的刻子／槓子與一對將組成；基本 1 番另加對對糊 3 番，合計 4 番（香港麻雀協會《香港麻雀總例》稱「花么」）。',
);
```

- 線 480–481 改為：

```js
assert.deepEqual(
  PATTERN_TABLE.filter((p) => p.category === '自訂牌型').map((p) => p.id),
  ['七對子', '人胡', '綠一色', '藍一色'],
);
assert.equal(PATTERN_TABLE.filter((p) => p.category === '特殊牌型').length, 0);
```

- 線 508 測試名 `綠一色與藍一色各計 10 番，並列為特殊牌型` 改為 `綠一色與藍一色各計 10 番，並列為自訂牌型`。
- 線 916 `assert.equal(result.totalFan, 13);` 改為 `assert.equal(result.totalFan, 12);`。
- 在同一測試區塊增加兩個斷言：`連槓開花.desc` 包含 `槓上槓自摸`；`字一色.desc` 包含 `全番子`。
- 不增加測試數；總數仍必須是 64。

- [ ] **Step 2: 執行規則測試確認失敗**

Run:

```bash
/home/timmy/.local/node/bin/node tests/rules.test.mjs
```

Expected: 輸出仍有 64 項，但 `人胡` desc、`花幺九` desc、category 與 T3 總番相關測試失敗。

- [ ] **Step 3: 修改 `js/rules.js`**

- 線 45：`'花幺九': 5` 改為 `'花幺九': 4`，註解改為 `// 香港麻雀總例：花么 1 番另加對對糊 3 番`。
- 線 49、61、62 的註解 `特殊牌型` 改為 `自訂牌型`。
- 線 125：`fan: 5` 改 `fan: 4`；desc 改成 Step 1 的完整字串。
- 線 141：`category: '特殊牌型'` 改 `category: '自訂牌型'`；desc 改為 `自訂牌型：門前清七種不同牌各一對（又稱嚦咕嚦咕）；四張相同牌不能當兩對。香港麻雀協會《香港麻雀總例》沒有此番種。`
- 線 161 desc 改為 `連續開兩次或以上槓後，補摸的第一張牌胡牌（香港麻雀協會《香港麻雀總例》稱「槓上槓自摸」；已含槓上開花、自摸）。`
- 線 172 desc 改為 `全部由字牌組成（香港麻雀協會《香港麻雀總例》稱「全番子」；已含花幺九、對對糊與場風／門風番子）。`
- 線 200：`人胡` 加 `category: '自訂牌型'`；desc 改成 Step 1 的完整字串。
- 線 224、228：`category: '特殊牌型'` 改 `category: '自訂牌型'`；desc 開頭 `特殊牌型：` 改 `自訂牌型：`，並在句尾加入 `香港麻雀協會《香港麻雀總例》沒有此番種。`
- 不改 `FAN_CAP = Infinity`，不改任何 `example`。

- [ ] **Step 4: 執行三組測試確認通過**

Run:

```bash
set -e
/home/timmy/.local/node/bin/node tests/rules.test.mjs | tail -2
/home/timmy/.local/node/bin/node tests/payout.test.mjs | tail -2
/home/timmy/.local/node/bin/node tests/net.test.mjs | tail -2
```

Expected:

```text
結果：64 通過，0 失敗

結果：12 通過，0 失敗

結果：2 通過，0 失敗
```

- [ ] **Step 5: Commit**

```bash
git add js/rules.js tests/rules.test.mjs
git commit -m "番數表改採 HKMA 官方數值並標示自訂牌型（1.4.96）"
```

---

### Task 2: 玩法說明派彩表與來源標示

**Files:**
- Modify: `index.html:12`, `index.html:215`, `index.html:219`, `index.html:297`, `index.html:303`

**Interfaces:**
- Consumes: Task 1 產生的 HKMA 番數與 `自訂牌型` 分類；`payoutMultiplier()`／`winPayout()` 既有公式（不改 `js/payout.js`）。
- Produces: 玩法說明內的 `#payoutTableTitle` 表格、HKMA 來源註腳、資料來源連結、`1.4.96` cachebust。

- [ ] **Step 1: 更新玩法說明第 4 項**

在 `index.html:215` 同一個 `<li>` 內，把番數相關句子改為：

```text
番數以香港麻雀協會《香港麻雀總例》為準：花幺九 4 番；小四喜、大四喜、坎坎胡、十三幺、十八羅漢、連槓開花、天胡、地胡、字一色、清幺九、九子連環與大花糊均為 10 番。七對子、人胡、綠一色與藍一色為本遊戲保留的自訂牌型，在牌型一覽標示。門前清則沿用本遊戲既有花牌制計 1 番。
```

不可新增 `<li>`。

- [ ] **Step 2: 加入詳細派彩表**

在 `<ol class="help-list">` 之後、`#fanTableTitle` 之前，加入：

```html
<h3 id="payoutTableTitle" tabindex="-1">金錢派彩計算表</h3>
<div class="table-scroll">
  <table>
    <thead>
      <tr><th>番數</th><th>倍率 V/B</th><th>出銃支付（單家）</th><th>自摸每家</th><th>自摸三家合計</th></tr>
    </thead>
    <tbody>
      <tr><td>0</td><td>1B</td><td>1B</td><td>1B</td><td>3B</td></tr>
      <tr><td>1</td><td>2B</td><td>2B</td><td>1B</td><td>3B</td></tr>
      <tr><td>2</td><td>4B</td><td>4B</td><td>2B</td><td>6B</td></tr>
      <tr><td>3</td><td>8B</td><td>8B</td><td>4B</td><td>12B</td></tr>
      <tr><td>4</td><td>16B</td><td>16B</td><td>8B</td><td>24B</td></tr>
      <tr><td>5</td><td>24B</td><td>24B</td><td>12B</td><td>36B</td></tr>
      <tr><td>6</td><td>32B</td><td>32B</td><td>16B</td><td>48B</td></tr>
      <tr><td>7</td><td>48B</td><td>48B</td><td>24B</td><td>72B</td></tr>
      <tr><td>8</td><td>64B</td><td>64B</td><td>32B</td><td>96B</td></tr>
      <tr><td>9</td><td>96B</td><td>96B</td><td>48B</td><td>144B</td></tr>
      <tr><td>10</td><td>128B</td><td>128B</td><td>64B</td><td>192B</td></tr>
    </tbody>
  </table>
</div>
<p class="hint-text">B 為房主開局前設定的金額倍數，預設 1、範圍 1–100；每局起始資金預設 20。表中金額為 B = 1 的倍數，實際支付按公式四捨五入至整數：番 ≤ 4 時 V = 2^番 × B，番 ≥ 5 時每兩番加倍、單數番先乘 1.5。出銃由出銃者支付 V；自摸由其餘三家各付 V／2，胡牌者共得 1.5 × V，自摸至少計 1 番。流局不派彩；選擇無限番時，10 番以上依同一公式繼續計算。連莊不推進圈數。</p>
```

保留原有的 `#fanTableTitle` 與牌型表，不把新表放進 `<ol>`。

- [ ] **Step 3: 加入 HKMA 來源註腳**

在派彩表前或牌型表前加入：

```html
<p class="hint-text">番數以香港麻雀協會《香港麻雀總例》為準；標示「自訂牌型」者為本遊戲保留的變體，門前清則沿用本遊戲既有花牌制計 1 番。</p>
```

- [ ] **Step 4: 更新資料來源與快取版本**

- `index.html:297`：在「花牌與番數規則」最前面加入 `<a href="https://www.hkmahjong.org/rules">香港麻雀協會《香港麻雀總例》</a>、`；保留原本維基百科與麻將百科連結。
- `index.html:12`：`css/style.css?v=1.4.95` → `css/style.css?v=1.4.96`。
- `index.html:303`：`js/game.js?v=1.4.95` → `js/game.js?v=1.4.96`。

- [ ] **Step 5: 瀏覽器驗證**

用全新 cachebust 開啟本機頁面，例如：

```text
http://127.0.0.1:8000/index.html?test=1&v=1.4.96-help-<新值>
```

執行前設：

```js
localStorage.setItem('mf-sound', '0,1');
localStorage.setItem('mf-volume', '0.5,0.5');
```

Expected:

- `.help-list > li` 數量為 6。
- `#payoutTableTitle` 存在，表格 11 列資料，0–10 番倍率與金額符合 Step 2。
- 點 `#helpFanTableBtn` 後可捲到 `#fanTableTitle`。
- 牌型一覽中只有四個 `自訂牌型` 標籤：`七對子`、`人胡`、`綠一色`、`藍一色`。
- 結算與語音沒有出現 `自訂牌型`。
- 沒有底部「釣魚」按鈕。
- Console 沒有警告或錯誤。

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "玩法說明加入派彩表與 HKMA 來源（1.4.96）"
```

---

### Task 3: 牌面立體感（CSS 與 canvas）

**Files:**
- Modify: `js/tiles.js:149-183`
- Modify: `css/style.css:445-455`
- Modify: `js/game.js:9`

**Interfaces:**
- Consumes: 既有牌面 PNG 與 `drawTile(ctx, id, x, y, width, height, options = {})`、`createTileElement(id, options = {})`。
- Produces: DOM 牌與 canvas 牌都有細微斜角、反光與陰影；不改 PNG、不改 `TILE_ASSET_VERSION = 6`。

- [ ] **Step 1: 增強 DOM 牌面樣式**

在 `css/style.css` 的 `.tile-img` 與 `.tile-img img` 規則加入：

- `.tile-img { position: relative; display: inline-flex; line-height: 1; }`
- `.tile-img img { filter: drop-shadow(0 1px 0 rgba(255,255,255,.45)) drop-shadow(0 3px 3px rgba(0,0,0,.55)); transform: translateY(-1px); }`
- 新增 `.tile-img:not(.tile-fallback)::before { content: ''; position: absolute; inset: 0; border-radius: 6px; pointer-events: none; background: linear-gradient(135deg, rgba(255,255,255,.38), rgba(255,255,255,0) 42%, rgba(0,0,0,.12) 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,.5), inset 0 -2px 0 rgba(0,0,0,.18); }`

不可改各處 height 設定；不可加 `pointer-events:auto`。

- [ ] **Step 2: 增強 canvas 牌面繪製**

在 `js/tiles.js` 的 `drawTile()` 既有 image draw 之後、restore 之前，加入一個以牌面尺寸為準的細微效果：

- 用 `ctx.save()`、`globalAlpha` 乘上 `options.alpha`、`beginPath()`/`roundRect()` 或等值圓角矩形路徑裁切。
- 填上一層 `linearGradient`：左上 `rgba(255,255,255,.28)`，中段透明，右下 `rgba(0,0,0,.14)`。
- 加上 `strokeStyle = 'rgba(255,255,255,.35)'` 的頂邊與左邊細線，以及 `strokeStyle = 'rgba(0,0,0,.18)'` 的底邊與右邊細線。
- `faceDown` 與 fallback 路徑也使用同一效果；不影響 `rotation`、`shadow`、`alpha`。
- 不改 `TILE_ASSET_VERSION`，不改 `tileImagePath()`。

- [ ] **Step 3: 更新 tiles 匯入快取版本**

`js/game.js:9` 的 `from './tiles.js'` 改為 `from './tiles.js?v=1.4.96'`。

- [ ] **Step 4: 瀏覽器視覺與回歸檢查**

用全新 cachebust 開啟本機頁面，例如：

```text
http://127.0.0.1:8000/index.html?test=1&v=1.4.96-tiles-<新值>
```

設 `mf-sound:'0,1'`、`mf-volume:'0.5,0.5'`，並檢查：

- 手牌、河牌、魚身上的 canvas 牌仍可見且沒有被反光遮住。
- DOM 牌仍有陰影與邊緣反光，沒有擋住點擊或拖曳。
- 表格與玩法說明版面沒有橫向溢出。
- `diagnostic.frames` 持續增加；Console 沒有警告或錯誤。
- /resources 沒有新的 `404`。

- [ ] **Step 5: Commit**

```bash
git add js/tiles.js css/style.css js/game.js
git commit -m "以 CSS 與 canvas 強化牌面立體感（1.4.96）"
```

---

### Task 4: 文件同步、完整驗證與部署

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `CREDITS.md`

**Interfaces:**
- Consumes: Task 1–3 的最終數值、表格與視覺行為。
- Produces: 已推送到 `main` 的 1.4.96，並完成線上 cachebust 驗證。

- [ ] **Step 1: 更新文件**

- `README.md`：頂端遊玩連結 `?v=1.4.95` → `?v=1.4.96`；規則說明加入 HKMA 為番數來源、`花幺九 4 番`、`自訂牌型` 四項、玩法說明有詳細派彩表、牌面以 CSS/canvas 做 3D 效果但不重新產生圖片。
- `CHANGELOG.md`：在 1.4.95 前加入：

```markdown
## 1.4.96 — 番數表改採 HKMA 官方與玩法說明增強

- 番數表改以香港麻雀協會《香港麻雀總例》為唯一番數依據；`花幺九` 由 5 番改為 4 番。
- `七對子`、`人胡`、`綠一色`、`藍一色` 標示為「自訂牌型」，保留原有番數與玩法；「特殊牌型」標籤已移除。
- 玩法說明加入 0–10 番金錢派彩計算表，列出倍率、出銃支付、自摸每家與三家合計，並保留原有公式說明。
- 牌面以 CSS 與 canvas 疊加細微斜角、反光與陰影，不重新產生 PNG。
- 資料來源加入 HKMA 官方規則；README、`CHANGELOG.md`、`AGENTS.md`、`CREDITS.md` 同步更新；三組測試維持 64／12／2 全數通過。
```

- `AGENTS.md`：把「特殊牌型」標籤說明改為「自訂牌型」四項；補充 HKMA 為番數唯一依據、派彩表位置、CSS/canvas 3D 做法、cachebust 為 1.4.96。
- `CREDITS.md`：在 `# 素材來源與授權` 後加入 `## 規則來源`，列出 HKMA 官方規則頁 `https://www.hkmahjong.org/rules` 與中文《香港麻雀總例》Google Doc，註明維基百科與麻將百科為次要參考。不複製全文。

- [ ] **Step 2: 完整提交前檢查**

Run:

```bash
set -e
N=/home/timmy/.local/node/bin/node
$N --check js/rules.js
$N --check js/payout.js
$N --check js/game.js
$N --check js/net.js
$N tests/rules.test.mjs | tail -2
$N tests/payout.test.mjs | tail -2
$N tests/net.test.mjs | tail -2
git diff --check
```

Expected: 四個語法檢查無輸出；三組測試分別為 `64/12/2` 全數通過；`git diff --check` 無輸出。

- [ ] **Step 3: 最後一次全新瀏覽器檢查**

重複 Task 2 Step 5 與 Task 3 Step 4，使用另一個新的 `v` 值，確認沒有快取舊規則或舊樣式。

- [ ] **Step 4: Commit 與推送**

```bash
git add README.md CHANGELOG.md AGENTS.md CREDITS.md docs/superpowers/plans/2026-11-24-hkma-fan-table-and-help-enhancements.md
git commit -m "同步 1.4.96 文件與實作計劃"
git push origin main
```

- [ ] **Step 5: 線上 cachebust 驗證**

用不同 query string 驗證以下內容：

- `index.html`：含 `css/style.css?v=1.4.96`、`js/game.js?v=1.4.96`、`payoutTableTitle`、`香港麻雀協會`。
- `js/game.js`：含 `'./rules.js?v=1.4.96'`、`'./tiles.js?v=1.4.96'`。
- `js/rules.js`：含 `'花幺九': 4` 與 `自訂牌型`。
- `js/tiles.js`：含 canvas bevel 標記，例如 `linearGradient`。
- `css/style.css`：含 `drop-shadow` 與 `pointer-events: none`。

- [ ] **Step 6: 回報**

回報 commit hash、三組測試結果、瀏覽器檢查結果與新遊玩連結：

```text
https://timmylaikh.github.io/Mahjong-fishing/?v=1.4.96
```
