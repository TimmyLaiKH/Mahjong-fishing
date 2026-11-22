# Project instructions

## Architecture

- Pure static site: plain HTML, CSS and ES modules. **No build step, framework or bundler.**
- Serve locally with `python3 -m http.server 8000 --bind 127.0.0.1`, then open `http://localhost:8000/index.html`.
- `js/rules.js` is the pure rule engine. It must stay runnable in Node and must never import DOM, audio, images or `localStorage`.
- `js/payout.js` is the pure payout engine: payout table V(f), 放槍／自摸 settlement, 連莊 and match-end state. It must also stay Node-runnable and DOM/`localStorage`-free.
- `js/game.js` owns state (including match money, dealer continuity and score UI), the shared fish sea, canvas/rendering and input. `js/tiles.js` owns tile IDs/faces. `js/audio.js` owns the CC0 music.
- `tests/rules.test.mjs` is the source of truth for rules. Every new pattern needs an entry in both `FAN_VALUES` and `PATTERN_TABLE`, plus a validated example and explicit tests. `tests/payout.test.mjs` is the source of truth for the payout table and settlement.

## Verification

Run before committing:

```sh
node --check js/rules.js
node --check js/payout.js
node --check js/game.js
node tests/rules.test.mjs
node tests/payout.test.mjs
```

Browser checks should use a cache-busting query such as `?test=1&v=42`. `window.__mf` is exposed only when the URL contains `?test`. Check several widths (320–1366px), console errors, no horizontal overflow, and that both the resting and fully lowered hook stay on screen. For scoring changes also check that the 計分 panel fits and does not scroll horizontally, that solo settings lock after the first deal, that host lobby score controls sync to guests, and that a win/draw updates money, 連莊 and the payout history exactly once on every device.

## Game rules and UI invariants

- All player-facing text is **Traditional Chinese**. Accumulated fan and best fan stay local records; match money is a separate, per-game amount shown in the HUD and 計分 panel.
- Endless weighted pool: every ordinary kind has weight 4, every flower kind has weight 1; there is no finite wall and no four-copy cap. Flower IDs are 春／夏／秋／冬／梅／蘭／菊／竹.
- All four seats share one fish sea. The host owns fish movement and catch arbitration; other seats see ghost hooks. AI seats are full players with private hands, their own hook loop and their own wins. Four plain colored player avatars (no self outline, "你" or name labels) are drawn beside the rod and repeated in the multiplayer waiting room; each ghost hook carries a name label. Concealed-kong decisions are inline on the left of the rod via the self-win bar (`offerSelfWin(null, kongTile, onDecline)`), never a screen popup. The host lobby offers both a slider and a typed `分:秒` clock for the round length, plus starting money / 圈數 / base B controls; a session-level `deadRooms` set prevents rejoining codes whose host never responded, and guests only enter the room screen after a `welcome`. The 副露 panel sits above the hand (original order), is always expanded (never collapsible), and shows melds and flowers for the other three seats only with the original tile sizes/clamp; your own flowers and melds stay in the HUD. The discard-preview row (打出 → 暫無聽牌) keeps enough height for its tile image.
- Flowers never enter the hand. Reveal them in the HUD flower panel; the next tile is fished manually rather than dealt automatically. 7 flowers = 花糊 (3 fan, includes 自摸), 8 = 大花糊／八仙過海 (8 fan), both instant wins.
- Flower seat mapping: 東＝春/梅, 南＝夏/蘭, 西＝秋/菊, 北＝冬/竹. 一檯花 suppresses same-series 正花.
- 海底撈月 (1 fan) is awarded for any win with `game.timeLeft <= 5`, both a self-draw and a win on an opponent's played tile; 自摸 is scored separately when the win is a self-draw. No wall needs to be empty.
- The opening self-draw is checked once after the 13 ordinary tiles and any supplemental flowers: the dealer wins as 天胡, other seats as 地胡 (13 fan each, including 自摸／門前清). Opening 7/8-flower wins stack the same limit hand. If it does not win, the peeked tiles are not consumed. All four seats, including AI, get this check.
- Fan cap is always `無上限`; do not add a cap setting. Money is shown only as the four-seat match purse/payout history; do not add a `牌牆` HUD readout or any separate point system.
- Exact status text when waiting to cast: `拋竿釣起你需要的牌吧！(點擊屏幕)`.
- There is no bottom `釣魚` button. Click/tap the canvas or press Space to cast. Hints are always on; do not add a hint toggle.
- 牌型一覽 lives inside the 玩法說明 modal and is generated from `PATTERN_TABLE`.

## Match scoring and money

- Before the first deal the host (or the solo player in 設定) chooses starting money per seat `1–100000000`, number of 圈 `1–4`, and base stake B `1–100`. Sliders and typed inputs must stay in sync; once play starts these values are locked. Multiplayer broadcasts the setup and every settlement snapshot to all seats; settlement is idempotent by round key so relayed win/match messages cannot double-pay.
- Payouts live only in `js/payout.js`: `V(f) = 2^f × B` for `f <= 4`; `V(f) = 16 × 2^floor((f-4)/2) × (1.5 if (f-4) odd else 1) × B` for `f >= 5`. 放槍: discarder pays `V`. 自摸: each other seat pays `Math.round(V/2)`, winner receives `each × 3` (at least 1 fan). Draw pays nothing. Record one log entry after every hand.
- 連莊: if the dealer wins, keep `dealerSeat`, increment `repeatCount` and do not advance `handNumber`/wind; otherwise advance the dealer, reset `repeatCount` and advance one hand. Wind assignment derives from `match.dealerSeat` and `match.handNumber`, never from a random per-hand roll.
- The match ends when any seat's money is `<= 0` or `handNumber >= winds × 4`; the winner is every seat tied for the most money. End overlays show the payout breakdown and winner; the 計分 modal shows standings, current wind/連莊 and payout history. A new match (menu start, or full rematch after a finished match) resets purses with the same setup; mid-match `重來這局` preserves money, dealer and winds.

## Layout notes

- The canvas uses a logical world height of 1080 and a viewport-derived world width. Its CSS `top` is synced to the HUD bottom with `ResizeObserver` so the rod/hook are never hidden. Fish `x` is a 0..1 fraction of the sea and `vx` a fraction of the fixed `REFERENCE_W` (1920) per second, so fish speed never depends on the host's screen size or orientation; whenever the host pauses (hidden tab OR open modal — `paused()`) the sea freezes and `syncHostSeaPause()` advances it by real elapsed wall-clock time on resume, immediately rebroadcasting so guests never snap backwards; the visibilitychange handler also calls it because rAF is throttled while hidden. `startGame()` resets `hostSeaPausedAt` so a completed restart never applies stale pause time to fresh fish. `resizeCanvas()` ignores zero-size canvas dimensions. Claim boxes only render when `buildClaimActions()` is non-empty. AI hooks only add the fish to the hand in `finishAiReel()` once the hook returns to the rod, and carry the caught tile during reeling (also broadcast to guests). The HUD has a fixed CSS height (`--hud-height`) sized to fit the always-expanded meld rows, flowers, hand and discard preview without scrolling; extra vertical space is distributed between rows instead of piling up at the bottom, and HUD contents must never resize the HUD or the sea.
- Keep the resting hook at the waterline (`ROD_BASE_Y + ROD_LENGTH === WATER_TOP`). Compute full-cast depth from the current rod angle with `maxHookLength()` so the hook reaches `WORLD_H` at every allowed angle, and keep `swingLimit()` bounded by the on-screen horizontal margin.
- The shoreline is drawn in canvas: mountains, houses, bamboo and a grassy bank. No external image assets are needed for scenery.

## Storage

Only these keys are used: `mf-sound`, `mf-volume`, `mf-fantotal`, `mf-bestfan`, `mf-hookspeed`, `mf-gameseconds`. Match setup and money live in runtime state only — never add a localStorage key for them. There is no AI assist or tile-dealing help; the former `mf-strength`, `mf-fancap` and `mf-assist` keys are no longer read or written. Do not reintroduce `mf-hints` or point-related keys.
