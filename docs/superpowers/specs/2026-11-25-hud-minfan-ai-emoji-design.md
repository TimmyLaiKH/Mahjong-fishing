# HUD 起糊顯示與 AI 表情回應設計

## 意圖

使用者要求：「just always push to main on github directly」，並澄清這是**未來一貫流程**；同時要求移除 `玩法說明` 的 `前往番數表` 按鈕、在 HUD 局數/`門風`/`資金`附近顯示本場 `起糊 N 番`，並加入多種 AI 表情回應。

後續補充的機率是最終決定：AI 出銃 30%（😭/😡）、AI 胡牌 30%（😎/😀）、流局 30%（😮/😂）；其餘採用提議值：你胡 10 番以上時出銃 AI 必定 😡、其他 AI 55% 從 👏/👍/😮/🔥 挑一個；AI 上/碰/明槓 8%（😍/🙏）；比赛结束每个 AI 70% 🎉。`ready to go` 表示設計已批准。

## 目標

- HUD 固定高度不變，在 round block 加一行 `起糊 N 番`，跟本場 `match.minFan` 同步。
- `玩法說明` 只剩三個分頁與關閉按鈕；不再有 `前往番數表` 按鈕與 `jumpToFanTable()`。
- AI 表情只在有 AI 座位的主機/單機端產生；聯機由 host 廣播，讓其他裝置也看到氣泡。
- 不新增表情素材，重用 `EMOJIS`。
- 不改計分、派彩、連線協定、音訊、儲存鍵或遊戲規則；不新增底部 `釣魚` 按鈕。

## 做法取捨

### HUD 起糊
- 方案 A：加 `.counters` 的第三個 span `#minFanCount`，在 `updateScoreUI()` 寫入。維持 HUD 固定高度與既有排版，最貼近需求。
- 方案 B：用 toast 或狀態列顯示。會干擾固定狀態字串，也可被覆蓋；不採用。
- 選 A。

### AI 表情
- 方案 A：在 `recordRoundResult()` 這個已經冪等、同時覆蓋單機與聯機 host 的結算入口集中產生胡牌/出銃/大胡/流局/比赛结束表情；只有 `applyAiMeldClaim()` 另外處理上/碰/明槓。好處是每一事件只發一次，不會在 `commitAiWin`、`finishMultiWin`、`showWinEnd` 等重疊路徑重複。
- 方案 B：在每個 win/draw/meld 呼叫點各自插入。容易在聯機中重複或漏掉。
- 選 A。`emitAiReactions()` 內以 `game.mode !== 'multi' || net.isHost` 把關；`aiEmoji()` 負責氣泡與 host 廣播。

## 固定規則

- `recordRoundResult()` 仍以 `roundKey` 冪等；表情必须在真正新的一局結算才觸發。
- 你胡 10 番以上的出銃 AI 固定 😡，不論該 AI 是否也通过 `AI 出銃 30%` 再抽一次；二者互斥，避免重複怒氣。
- AI 自己的胡牌 30% 與出銃 30% 可同時發生：贏家 😎/😀，出銃者 😭/😡。
- 流局 30% 與比赛结束 70% 可同時針對不同 AI 觸發。
- 所有玩家可見文字維持繁體中文。
- 版本升為 `1.4.99`；`index.html` 的 CSS/game、`js/game.js` 的 tiles import、README 遊玩連結與 CHANGELOG 同步。`./rules.js?v=1.4.97`、音訊與 net cachebust 不變。
- `FAN_CAP` 仍是 `Infinity`；不新增 localStorage 鍵。
- 之後一律直接 push 到 GitHub `main`，不開 PR、不問分支；本機驗證通過後推送並以不同 cachebust 驗證線上頁面。

## 驗收

- 靜態套件仍印出 `8 通過，0 失敗`，規則 64、賠率 12、連線 2 全綠，syntax 與 `git diff --check` 乾淨。
- 瀏覽器檢查：HUD 出現 `起糊 N 番`；說明 Modal 沒有 `前往番數表`；單機觸發各事件時氣泡出現且不會重複；無 console error 或 404。
- 推送 `main` 後以不同 cachebust 確認線上頁面帶有新字串與版本。
