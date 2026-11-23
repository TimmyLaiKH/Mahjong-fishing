# Project instructions

## What this project is

`Mahjong-fishing` is **香港麻雀釣魚**, a static Hong Kong mahjong fishing game published at
https://timmylaikh.github.io/Mahjong-fishing/. Four seats cast rods into one shared underwater
sea, hook random tiles from an endless weighted pool, and race to form a legal winning hand.
Solo play opens a solo lobby with three automatically filled AI seats and no room code; casual
4-player 聯機 uses PeerJS P2P room codes. There is no backend, account system, matchmaking service, build step,
framework or bundler. All gameplay state lives in the browser.

The play link must stay at the top of `README.md`. All player-facing text is **Traditional
Chinese**. Keep changes small, explicit and testable; this repository has grown through careful
incremental fixes, each recorded in `CHANGELOG.md`.

## Quick start

```sh
cd /home/timmy/Mahjong-fishing
python3 -m http.server 8000 --bind 127.0.0.1
# open http://localhost:8000/index.html?test=1&v=<unique-number>
```

`?test=1` exposes `window.__mf` for browser probes; it must not change production behaviour.
Use a fresh cache-busting `v` for every browser check. If `node` is not on PATH use
`/home/timmy/.local/node/bin/node`.

Before committing, run:

```sh
node --check js/rules.js
node --check js/payout.js
node --check js/game.js
node --check js/net.js
node tests/rules.test.mjs        # must print 64 通過，0 失敗
node tests/payout.test.mjs       # must print 12 通過，0 失敗
node tests/net.test.mjs          # must print 2 通過，0 失敗
git diff --check
```

`npm test` currently runs **only** `tests/rules.test.mjs`; always run the payout suite explicitly.
Both suites use a tiny local harness with `process.exitCode`, not an external test framework.

Regenerating image assets (requires `curl`, `file`, `python3`, Pillow):

```sh
bash scripts/fetch_assets.sh
python3 scripts/process_assets.py
```

Deployment is GitHub Pages from `main`. Commit, push, then verify the live site with distinct
cachebusts (`index.html`, `js/game.js`, `js/payout.js`, `css/style.css`). `index.html` also pins a
`?v=` version on `css/style.css` and `js/game.js`; bump it whenever those files change so players do
not keep a stale cached 胡 handler. `js/game.js` also pins `./audio.js?v=...` and
`./rules.js?v=...`; bump those imports when the audio helper or rules engine changes so players do
not keep stale sounds or scoring.

## Repository map

| Path | Role and constraints |
| --- | --- |
| `index.html` | Markup only: canvas, HUD, lobbies, modals, claim bars, score panel, help/settings. No inline CSS or JS. Loads PeerJS from CDN with `js/vendor/peerjs.min.js` fallback, then `js/game.js` as a module. |
| `css/style.css` | All styling and responsive rules. Fixed HUD height, canvas positioning, claim bars, modals, score UI. |
| `js/tiles.js` | Node-safe tile IDs, names, image paths and draw helpers. 34 regular kinds + 8 flowers; DOM work only inside functions. |
| `js/rules.js` | Pure scoring engine. Node-runnable; imports only `tiles.js`; never touches DOM, audio, images, timers or `localStorage`. |
| `js/payout.js` | Pure payout/settlement engine. Node-runnable; no DOM or storage. |
| `js/game.js` | Browser orchestration: state machine, shared sea, canvas rendering, input, AI, network messages, HUD, settings and score UI. |
| `js/net.js` | Thin PeerJS wrapper: room IDs, host/guest connections, message relay. |
| `js/audio.js` | CC0 background-music player plus a short CC0 tile-strike effect; enable/volume controls. |
| `js/vendor/peerjs.min.js` | Local fallback when the CDN script fails. |
| `assets/` | Runtime tile faces, underwater background, five MP3s. Source originals live under `assets/tiles/raw/` and `assets/bg/underwater.source.jpg`. |
| `scripts/` | Asset download and processing scripts. Not part of runtime. |
| `tests/rules.test.mjs` | 64 rule tests: T1–T13, table-driven patterns, flowers, weighted pool, 1000-game simulation. |
| `tests/payout.test.mjs` | 12 payout/settlement tests. |
| `tests/net.test.mjs` | 2 tests for PeerJS-safe outgoing message normalisation. |
| `README.md`, `CHANGELOG.md`, `CREDITS.md`, `AGENTS.md` | Player docs, change history, asset licences, agent instructions. |

## Core game invariants

- **No finite wall.** The sea and opening tiles use `randomTileKind()` from the endless weighted
  pool: each of the 34 regular kinds has weight 4, each of the 8 flowers weight 1 (4:1).
  Sampling is independent; there is no depletion, no wall display, no four-copy cap. The
  evaluator deliberately allows 5+ identical tiles and four identical tiles as two pairs in
  七對子. `createWall()` exists as a tested utility but gameplay must not depend on it.
- **No dealing help.** AI seats are real players with private hands, their own rods, their own
  fishing and their own decisions. They never read other hands and never receive dealt tiles.
  `shanten`, `getUsefulTiles` and `getAssistTiles` are engine/test utilities; `game.js` does not
  import them. Do not reintroduce an assist mode or an AI strength/fan-cap setting.
- **Flowers are separate.** Flower IDs `H1`–`H8` are 春／夏／秋／冬／梅／蘭／菊／竹. They are
  revealed in the HUD flower panel, never enter the concealed hand, and never auto-replace a
  tile. Seat mapping is 東＝春/梅, 南＝夏/蘭, 西＝秋/菊, 北＝冬/竹. A full season or plant
  series gives 一檯花 (2) and suppresses that series' own 正花. 七花＝花糊 (3, includes 自摸),
  八花＝大花糊 (8); 七花 can be declined, after which only 八花 wins immediately and a later
  hand win adds 花糊. 七對子 is never called 花糊. All flower patterns count distinct IDs only:
  一檯花 needs all four seasons or all four plants, 花糊 needs seven distinct flowers and 大花糊
  needs all eight; duplicates never complete a set.
- **Combination patterns need distinct tiles.** 大／小三元 require all three dragon kinds (the
  small form's pair must be the missing dragon), and 大／小四喜 require the four wind kinds the
  same way. 十三幺 needs all 13 distinct orphans plus a duplicate of one of them; 九子連環 needs
  one suit's `1112345678999` plus one extra tile of that suit. Repeated triplets or pairs cannot
  substitute. 七對子 is the intentional exception: four identical tiles may supply two pairs.
- **Every fished tile is a self-draw.** `evaluateHand` defaults `context.selfDraw` to `true`;
  claim wins pass `selfDraw: false`. 自摸 and 門前清 both need that flag, plus no open meld for
  門前清; a fully concealed hand won off a discard is still not 門前清.
- **Opening wins.** After the 13 ordinary tiles and any supplemental flowers, check once for
  天胡 (dealer) / 地胡 (other seats), both 13 fan including 自摸 and 門前清. A failed check
  consumes nothing. All four seats, including AI, get the check.
- **海底撈月.** Any win with `game.timeLeft <= 5` gains 1 fan, self-draw or claim; 自摸 is
  added separately when applicable. No wall needs to be empty.
- **Fan cap stays `Infinity`.** `FAN_CAP` and default behaviour never change. `context.fanCap`
  is only an internal/test override. There is no 番數上限 UI and no separate point system.
- **Player-facing strings are contractual.** Waiting-to-cast status is exactly
  `拋竿釣起你需要的牌吧！(點擊屏幕)`. Other fixed strings include `房主已離開`,
  `房主已離開，請重新開房間`, `房間已滿，請換一個房間。`,
  `房間已關閉，請重新開房間。`, and
  `所有人加入後，請等待房主按下「開始遊戲」。` at the top of the 聯機 room screen.
  The solo lobby instead shows `三位 AI 對手已自動補位，按下「開始遊戲」即可開始。` and hides all
  room-code/share-link UI.
- **Help and pattern table.** 玩法說明 has exactly six `<li>` items. A footnote outside the list
  explains the payout using 金額倍數 `B`: `V = 2^番 × B` for 番 ≤ 4, then every two 番 doubles with
  a 1.5× factor for odd 番; 出銃 pays `V`, 自摸 pays `V／2` each, 流局 pays nothing. 牌型一覽 lives
  inside it and is generated from `PATTERN_TABLE` + `FLOWER_PATTERN_TABLE`; every pattern needs a
  validated `example` there. The closing footnote says `碰、上、明槓或胡對手打出牌都不計門前清。`
  without adding the old 自摸-source clause.
- **No bottom `釣魚` button.** Click/tap the canvas or press Space to cast. Hints are always on;
  terminology is 聽牌, not a hint toggle. Wait hints are advisory and never gate settlement: for
  each wait they show a hint-only `rawFan` that keeps current flowers but excludes 自摸, 門前清,
  海底撈月, 槓上開花, 連槓開花 and 無花; 坎坎胡 falls back to the plain 對對糊 3-fan baseline. If a
  self-draw of that tile reaches 起糊, the note is only `差 X 番，自摸才夠番`; otherwise the note
  is `差 X 番；可用…補番`, listing 花牌, 門前清, 自摸, 海底撈月 and kong bonuses. 門前清 is omitted
  for a claim win or once there is an open meld. One triplet/quad suggests 槓上開花 and two or
  more suggest 連槓開花.

## Rules engine (`js/rules.js`)

Keep it pure and side-effect free. It imports only `./tiles.js`; `tiles.js` also stays
Node-importable by keeping DOM access inside functions.

Key exports:

- Tile groups: `WINDS`, `DRAGONS`, `TERMINALS`, `ORPHANS`.
- Scoring tables: `FAN_VALUES` (fan dictionary), `PATTERN_TABLE` (27 ordinary patterns with
  `desc` and executable `example`), `FLOWER_PATTERN_TABLE` (5 flower patterns), `ABSORBS`
  (transitive higher-pattern → absorbed-pattern map, including `番子:*` pseudo-keys), `FAN_CAP`.
- Core: `countTiles`, `normalizeMelds`, `decompose`, `isValidWinningHand`, `isThirteenOrphans`,
  `isSevenPairs`, `isNineGates`.
- Flowers: `evaluateFlowers`, `flowerWin`, `withFlowers`, `flowerWinResult`.
- Evaluation: `evaluateHand`, `findWaits`, `shanten`, `getUsefulTiles`, `getAssistTiles`.
- Pool/utilities: `createWall`, `randomTileKind`, `shuffle`, `formatWinBreakdown`.

Scoring notes:

- `decompose()` enumerates all 4-sets+pair decompositions from the lowest remaining tile and
  dedupes them; do not restore the old greedy "first key only" behaviour.
- `evaluateDecomposition()` scores special/limit hands first, then suit/honour families, then
  timing and seat patterns. `betterResult()` picks by `totalFan → rawFan → pattern count`.
- `resolveOverlaps()` drops transitively absorbed patterns and emits `重疊扣減` once per shared
  sub-pattern with fan `-base × (sharers - 1)`. Attach `includes` only for absorbed patterns that
  were actually scored, so a claim win never shows 門前清 in the breakdown. `海底撈月` never absorbs
  `自摸`; `天胡`/`地胡` absorb 自摸+門前清; 暗槓 stays concealed; open melds and claim wins suppress
  門前清. `字一色` absorbs 花幺九, 對對糊 and the seat/round 番子 pseudo-keys; `大四喜` still absorbs
  對對糊. A 番子-only hand is not 雞糊.
- `formatWinBreakdown()` is the shared zh-Hant text used by win dialogs; it reports **fan only**
  and must never print money or 分. The game adds payout text separately.
- Adding a pattern requires entries in both `FAN_VALUES` and `PATTERN_TABLE` (or the flower
  tables), a validated example, and explicit tests. Preserve the 64-test baseline when adding
  coverage.

`tests/rules.test.mjs` has six named groups and exactly 64 tests: basic wins/waits, kongs and
decomposition, fan rules/table, flowers, pool/AI/simulation (including 1000 seeded games), and
T1–T13. Keep the seeded simulation meaningful: no exceptions, `wins > 0`, and fan within bounds.

## Payout engine (`js/payout.js`)

- `payoutMultiplier(fan)` and `payoutValue(fan, base)` implement
  `V(f)=2^f×B` for `f<=4` and
  `V(f)=16×2^floor((f-4)/2)×(1.5 if (f-4) odd else 1)×B` for `f>=5`.
  Reference multipliers: 0=1, 1=2, 2=4, 3=8, 4=16, 5=24, 6=32, 7=48, 8=64, 9=96, 10=128,
  11=192, 12=256, 13=384, 14=512, 15=768, 16=1024, 17=1536, 18=2048, 19=3072, 20=4096,
  22=8192, 25=24576.
- `winPayout()` returns `{ value, each, total, selfDraw }`. 出銃: discarder pays `V`. 自摸:
  each other seat pays `Math.round(V/2)`; winner receives `each × 3`. 自摸 always has at least
  1 fan. Draw pays nothing.
- `settleRound()` is **non-mutating** and returns `{ money, payout, log, dealerSeat,
  repeatCount, handNumber, windIndex, over }`. 連莊 keeps the dealer, increments `repeatCount`
  and does not advance `handNumber`; otherwise dealer advances by one and the hand number
  increments. Match ends when any seat has `<= 0` money or `handNumber >= winds × 4`; every
  seat tied for the most money is a winner.
- Game-side settlement must stay idempotent by
  `roundKey = ${handNumber}:${repeatCount}:${dealerSeat}` stored on `match.lastPayout`, so relayed
  win/match messages cannot double-pay. Keep the pure engine free of that runtime detail.

## Game orchestration (`js/game.js`)

- **State machine.** `S` has nine states: `LOADING`, `DEAL`, `AWAIT_CAST`, `CASTING`, `REELING`,
  `RESOLVE_DRAW`, `AWAIT_DISCARD`, `WIN`, `DRAW_GAME`. The menu, solo/聯機 lobby and rematch
  screens are modals, not states. `setState()` clears stale discard highlights, sets the exact status text, selects
  the just-drawn tile by uid for `AWAIT_DISCARD`, and refreshes the HUD. Exact statuses:
  `派牌中…`, `拋竿釣起你需要的牌吧！(點擊屏幕)`, `鉤子下降中，看準時機！`, `收線中…`,
  `檢查牌型…`, `請選一張牌打出（或直接點擊手牌）`, `胡牌！`, `流局`.
- **Deal.** `startGame()` resets the sea, uids, hands, flowers, melds, river, clocks, votes and
  kong/claim state; sets `match.active`; derives `roundWind`/`seatWind` from
  `match.dealerSeat` + `match.handNumber` (never from a random per-hand roll); deals private
  hands; checks opening flower / 天胡 / 地胡 wins for all seats; spawns fish. The dealer starts
  with 14 tiles and reaches `AWAIT_DISCARD` (offering an inline concealed-kong prompt first),
  while other seats start with 13 and reach `AWAIT_CAST`. Only the dealer may take an opening
  暗槓 before fishing; every other seat's quad is only offered after a real draw in `resolveDraw()`.
  The AI dealer follows the same rule through `prepareAiDealerOpening()`. `speakRoundStart()`
  reads the same `roundInfoText()` heading aloud at the start of each hand using the device's
  explicit Hong Kong/Cantonese voice; without one it stays silent, never Mandarin, and never
  blocks the deal.
- **Cast/reel.** Only host/solo (`fishAuthority()`) spawns and moves fish. Casting and reeling
  both check catches; the host arbitrates first-request-wins, broadcasts `fishCaught`, and
  rejects stale requests with `catchRejected`. Flowers go to the HUD panel and trigger another
  fish without consuming a turn; ordinary/kong tiles enter the hand only when the hook returns,
  then `resolveDraw()` checks win → inline kong prompt → `AWAIT_DISCARD`.
- **Discard and claims.** `discard()` bumps the turn, publishes a 5-second claim window with a
  shared `sourceKey`, and returns the human to fishing. `claimBoxes[]` gives each opponent one
  box; `renderClaimBoxes()` renders a box whenever `buildClaimActions({ potential: true })` is
  non-empty, even while the hook is out. Potential actions are rebuilt from the live
  13-tile-equivalent hand, so a tile that becomes winning after the player fishes and discards
  gains a `胡牌` button inside the same five-second window, and stale 上／碰／明槓 buttons
  disappear instead of spending tiles that are no longer held. While the rod is out, the box
  stays visible but every button is disabled; it unlocks when the hook returns empty or when a
  caught tile has been discarded. 胡／碰／明槓 can target any opponent; 上 only the previous
  wind's 上家 (label prefix `上家・`). First valid claim wins; a claimant must discard before
  claiming again; timeout implicitly passes. `canDeclareClaim()` requires a 13-tile-equivalent
  hand with the rod home, no pending kong replacement or forced discard; `canDeclareMeld()` adds
  the four-meld limit.
  Delayed AI claims are revalidated at execution for the same conditions and recomputed as wins.
  Opponent claim boxes include a local `過` button that only marks that box `passed` and hides it;
  it sends no network message and never cancels AI or other seats' claims on the same discard.
  `claimFromBox()` also ignores a passed box. A 胡 never enters the wait-for-ruling path: it calls
  `commitWin()` at once, settling locally and broadcasting `{t:'win'}` so every device ends the
  hand even if the claim message or host relay is late. `announceWin()` gives the win a unique
  `winId` and sends a compact result containing only settlement fields. A guest retries at
  250/800/1600/2600 ms until the host returns `{t:'winAck'}`; the host relays every copy at
  0/250/800 ms, and receivers dedupe by `winId` so repeats cannot settle a later hand. A guest that
  misses `win` entirely still ends the hand from the host's `{t:'match'}` payout fallback. Its button is never disabled by
  `canDeclareClaim()`: a rod in flight or a freshly fished tile must not make 胡 a no-op. Network
  sends are guarded in `net.js` so a dead peer cannot throw into the settlement path. Self wins, concealed kongs and 七花 use the
  enlarged inline `selfWinBar` left of the rod with `胡牌`／`開槓` and `過`／`不開槓` — never a
  blocking popup. 碰／上 show `成功！請選一張牌打出。`; 明槓 (solo and multiplayer) shows
  `明槓成功！再釣一張牌補槓。` and sets `kongChain = 1`, never asking for an immediate discard.
- **AI seats.** `createAiState()` deals private tiles and a rod to each AI. `aiTick()` sweeps the
  rod, casts to `maxHookLength()`, and checks catches on both descent and return; the tile is
  added in `finishAiReel()` only when the hook reaches the rod, and is drawn on the hook while
  reeling. AI handles flowers, concealed kongs, self-draw wins, delayed 胡／碰／上／明槓 claims,
  and discards the tile leaving the most waits. AI names render with ` (AI)`. AI states and
  ticks exist only on host/solo; the host relays their hooks and actions.
- **End of hand/match.** `commitWin`, `commitAiWin` and `finishMultiWin` settle through
  `recordRoundResult()` and show a shared terminal overlay; `endDrawGame` / `applyMultiDraw`
  settle a no-payment draw. Multiplayer settlement switches to `S.WIN` / `S.DRAW_GAME` **before**
  settling or rendering, so a failure in payout/overlay code can never leave rods, AI and the clock
  still running without a settlement screen. All three win paths call `showWinEnd(seat, result, log)`,
  which wraps the overlay in a fallback and then calls `speakWin(result, seat)`:
  the device's `zh-HK`/Cantonese voice reads the winner's name, pattern names and
  `共 XX 番` (Chinese numerals via `fanInCantonese()`). `speakAction()` uses the same helper for
  locally declared 上／碰／槓, and `speakDraw()` reads `流局 時間到，沒有胡牌。` from both
  draw paths. Only an explicit Hong Kong/Cantonese voice is accepted: `zh-TW`, `zh-CN` and generic
  `zh` voices are Mandarin and are never used as a fallback, so a device without one stays silent.
  Voice failures never affect settlement. The overlay leads with
  `X風第 X 局・X 圈`, then `ICON ID 胡牌!` and
  `formatWinBreakdown()` with its leading `胡牌！` line stripped (the heading already says `胡牌!`);
  `showOverlay({ inlineTiles })` inserts `handEndTiles(result)` between
  the 牌型 bullets and `共 N 番`, so a claimed tile sits at the far right like a self-drawn one.
  `payoutSummary()` adds the 出銃／自摸 and 連莊 lines, `matchEndMessage()` is rendered as a larger
  standalone line and appended to the 胡/draw speech as `比賽結束！資金最多：X（$N）.`, and
  `renderStandings()` supplies the ranked 計分 board with this 小局's `(+x)`／`(-x)` beside each purse.
  `進入下一局` advances
  solo immediately; multiplayer requires every human to press `準備下一局` (AI auto-agrees).
  A finished match swaps the button to `開新一場` in both modes, keeping the multiplayer vote.
  In multiplayer the host also gets a `房間設定` button during that vote; when every human has
  voted (or the host presses it early), `reopenMultiRoomSettings()` broadcasts `backToRoom` and
  returns all devices to the waiting room with host-only controls re-enabled. `startMultiGame()`
  calls `resetMatch()` when the finished match is left, so the newly chosen settings (including
  起糊) apply to the fresh match. `回到主選單` quits in both modes. Mid-hand `重來這局`
  opens a separate `重新開始投票` requiring all humans; anyone can cancel. Requester is stored as
  a seat so `你` appears only on that device; each seat is marked `（你）` in vote lists.
- **Scoring integration.** `normalizeMatchSetup()` clamps money `1–100000000` (default 20),
  winds `1–4` (default 1), the UI-named 金額倍數 `1–100` (default 1×) and 起糊 `minFan` `0–13`
  (default 0 = no minimum). `qualifyingWin()` is the only game-side 起糊 gate: every self-draw,
  claim, flower and AI win decision calls it, so a hand below the chosen minimum is never offered
  or settled; 0 keeps the original behaviour. `handleClaim()` never silently drops a 胡 just
  because the host's claim box expired in transit: only a tile already claimed by another seat is
  rejected, so latency cannot leave the hand running with no settlement. `minFan` rides in `roomSettings`, `matchSetup`,
  `match`, `cloneMatch()` and `adoptMatch()`, so guests use the host's rule. `resetMatch()` builds
  the four-purse runtime state; `cloneMatch()` /
  `adoptMatch()` snapshot it for the network. `recordRoundResult()` is the only settlement
  funnel: it checks `lastPayout.roundKey`, calls pure `settleRound()`, writes money/dealer/
  repeat/hand/history/over/winner, and has the host broadcast `{t:'match'}`. A dealer win on the
  final scheduled hand ends the match only when that dealer is already among the highest purses
  after settlement; otherwise the normal 連莊 applies and play continues. `payoutSummary()`
  emits only the payment/連莊 lines; `handEndMessage()` adds the breakdown, and
  `matchEndMessage()` supplies the large match-over notice. `moneyText()` prefixes every displayed
  purse or payout with `$`. `roundInfoText()` supplies `X風第 X 局・X 圈` to the HUD top line,
  計分 panel and end overlay. With a settled `log` it uses the log's `windIndex` and the
  pre-settlement `handNumber` stored by `recordRoundResult()`, so the end overlay names the hand
  that just finished. The HUD uses a frozen `hudRoundInfo` captured in `startGame()`, so the top
  line keeps showing the current hand until the next hand actually starts; the 計分 panel still
  shows the latest match state and adds `起糊 N 番` from the match so players can see the deal's
  minimum. `renderStandings()` is shared by the 計分 modal and overlay; the overlay passes the
  settled log so each row also shows its `(+x)`／`(-x)` movement.
  Solo lobby score settings lock once `match.active`; 聯機 uses host lobby controls only.
- **Test hook.** `window.__mf` is created only when the URL contains `test` and exposes the
  broad internal surface used by browser probes (`game`, `S`, `view`, `startFromMenu`,
  `startGame`, `commitWin`, `endDrawGame`, `updateHUD`, scoring helpers, `renderRoom`, `net`,
  votes, etc.). Do not depend on it in production paths.

## Multiplayer (`js/net.js` and game-side protocol)

- `createNet()` wraps PeerJS with room prefix `mf-`, four-character 聯機 room codes, host/guest
  connections, `on`/`emit`, `sendToHost`, `sendToPeer`, `broadcast`, `close`, `isHost`,
  `available`. `index.html` loads PeerJS from CDN and falls back to `js/vendor/peerjs.min.js`.
  The solo lobby never calls `createNet()`.
- **Lobby.** `openRoom()` creates a host plus three empty seats; the host toggles AI per seat.
  Guests fill the first empty seat before replacing AI; four humans means
  `房間已滿，請換一個房間。`. A stale PeerJS id with no responding host is rejected after an
  8-second watchdog with `房間已關閉，請重新開房間。`; that code is added to a session-only
  `deadRooms` set and never reopened. Guests stay on the join screen until `welcome`, then see
  the room screen with the large waiting hint at the top and a `表情` chip beside 離開房間.
  Clicking the room background must not
  dismiss it. The solo lobby reuses the same screen with `mode: 'solo'`: four AI icons, editable
  room settings, a `開始遊戲` button, no code/link, and `返回主選單` instead of `離開房間`.
- **Names.** Solo/host default `幼羚`; joining guests default by seat `允行`, `一心`, `念慈`.
  Names are editable from menu/lobby/settings, limited to 12 characters, synced via `name`, and
  AI seats always render ` (AI)`.
- **Authority.** The host owns the room code, seat list, fish sea, host-clock timer, catch and
  claim arbitration, AI seats, settings, and match snapshots. Guards keep private hands on each
  device: there is no dealing, no hand validation, and no server. A win is an authoritative
  notice: the winner sends `{t:'win', winId, seat, result, ...}` to the host, the host relays the
  exact notice to every other seat, and each device settles once. The notice carries a compact
  settlement-only result instead of the full evaluator object. Repeats share the same `winId`
  and are deduped; receivers do not reject a win for a round-key or local 起糊 mismatch. A guest
  retries until the host sends `{t:'winAck', winId}`; the host also repeats its relay at 0/250/800 ms.
  Every outgoing message passes through `networkSafe()` in `js/net.js`, which converts non-finite
  numbers to `null`; PeerJS's binary packer throws on `Infinity`, so a raw evaluator result could
  never leave a guest's device. The host's `{t:'match'}` payout snapshot remains a fallback for a
  device that missed `win` entirely.
- **Message types.** `welcome`, `full`, `players`, `name`, `settings`, `start`, `discard`, `sea`,
  `time`, `hook`, `catch`, `catchRejected`, `fishCaught`, `flowers`, `claim`, `claimResult`,
  `meld`, `win`, `winAck`, `match`, `draw`, `emoji`, `rematch`, `rematchStatus`, `backToRoom`, `restartRequest`,
  `restartVote`, `restartCancel`, `restartStatus`, `restartNow`, `leave`, `hostGone`, `notice`.
  `backToRoom` carries the host's current `settings` and returns every device to the read-only
  waiting room so the host can pick settings again for a new match. Host re-stamps guest
  discard deadlines with its own clock; guests apply `clockOffset` so claim timers end together
  and the round timer keeps counting when the host changes tabs.
- **Sea sync.** Fish x is a 0..1 sea fraction and vx a fraction of fixed `REFERENCE_W = 1920`
  per second. Snapshots every 0.1 s; guests ease toward targets and extrapolate briefly (capped
  at 30 s). `stepHostSea()` advances the authoritative sea from wall-clock time and is called by
  both rAF and a 250 ms background interval, so a hidden host keeps fish moving and replenishing
  instead of letting guests empty the sea; each call consumes the elapsed time once, and catch-up
  is capped at 30 s. 設定, 玩法說明, 計分 and the 重來這局 vote are informational:
  `simulationPaused()` ignores them on every device, so the timer, rod and AI keep moving whether
  the host or any guest opened them. `paused()` still blocks direct canvas/keypad input while any
  modal is open. `startGame()` resets the sea step clock. Guest hooks are relayed through the host
  so all four rods are visible.
- **Hook sync.** Hook poses broadcast every 0.05 s (`HOOK_BROADCAST_INTERVAL`), including host-simulated
  AI hooks and guest hooks relayed through the host. `applyHook()` keeps the latest target plus a
  smoothed vx/vy (fractions of sea width per second for x, world pixels per second for y); phase
  changes zero the velocity. `renderGhostRods()` extrapolates up to 80 ms past the last target and
  eases `renderX/renderY` toward it, clamping x to 0..1 and y to the canvas, so ghost rods track
  live rods without visible stepping or reversal overshoot. Draw it every frame even when input is
  paused.
- **Disconnect.** `hostClose` and the explicit `hostGone` notice both show exactly
  `房主已離開` / `房主已離開，請重新開房間` and return to menu. There is no host migration.
  `pagehide` and `beforeunload` call `notifyOthersOnExit()`: a closing guest sends `leave` to the
  host, a closing host broadcasts `hostGone` to guests, so seats change immediately instead of
  waiting for the WebRTC timeout. One notice per room is enforced across both events and reset
  when a new room opens or a guest receives `welcome`. Guest departures show and speak a notice
  on every remaining device and leave the seat to AI; a host departure speaks the fixed message.
  A deliberate leaver does not see the host-left message.

## UI, HUD and layout

- The HUD opens with one bar: **設定 → 玩法說明 → 表情** on the left, a large centered timer,
  and **計分 + round block** on the right. The round block stacks `X風第 X 局・X 圈` above
  counters that read only 門風 and 資金 (with a `$` prefix); 巡, 番數 and 最佳 are not shown
  during play. The main menu appears before any lobby or game starts and shows a legal 十三幺
  winning hand (all 13 orphans plus one duplicate), but no fan record line. The 設定 panel keeps only
  player name, sound on/off, 主音量, 音樂音量, 重來這局 and 回到主選單 — 鉤速 (default 1.0×) and
  每局時間 (default 05:00) live in
  the solo/聯機 room alongside money, winds and 金額倍數, ordered 鉤速 → 每局時間 → 圈子數 →
  起始資金 → 金額倍數. Each seat uses a distinct full-body icon from `AVATAR_ICONS`, beside the
  rod, in the lobby avatars and in `各家副露` as ICON → ID → live `$` purse → current 門風; 允行 is male, and
  一心 and 念慈 are female.
- `#hud` has a fixed `--hud-height`, `overflow: hidden` and a grid that distributes spare
  vertical space. Status, toast, claim boxes, meld rows, flowers, hand, score UI and modals must
  never resize the HUD, canvas or sea; only viewport resizes may change geometry. `resizeCanvas()`
  syncs CSS `top`/`height` to the HUD bottom with `ResizeObserver`, ignores zero-size dimensions,
  and keeps the resting hook at the waterline (`ROD_BASE_Y + ROD_LENGTH === WATER_TOP`).
  `swingLimit()` is a fixed ±85° (`MAX_SWING_ANGLE`), covering almost 170° under the rod so the
  ray reaches the sea's top corners as well as its floor. `maxHookLength()` stops at whichever
  comes first: the floor (`WORLD_H`) or the nearest side (`view.width / 2 - TILE_W / 2`), and
  `hookPositionFor()` clamps only at half a tile so the hook still reaches the edge without
  leaving the canvas.
- `各家副露` sits above your own 副露 (flowers and concealed kongs), below status/toast and above
  the hand; it is always expanded (never collapsible) and lists only the other three seats' live
  `$` purse, melds and flower counts with original tile sizes. `updateScoreUI()` refreshes these
  rows after every settlement. Your own flowers and concealed kongs stay in the
  HUD flower/meld panels. The `打出 → 暫無聽牌` preview row keeps a
  full tile image of height. Mouse users discard with one click; on touch-only devices
  `isTouchOnly()` makes the first tap select a tile (via `selectDiscard`) and only a second tap on
  that same tile call `discard()`, with hover/focus auto-selection disabled so the first tap cannot
  discard accidentally.
- Claim bars are anchored above the waterline, not in the HUD: one compact box per opponent with
  tile, name/wind, `N.N 秒`, progress bar and actionable buttons. The self-win/暗槓 bar is larger
  and anchored left of the rod. A claim box offering 胡牌 gets `win-claim`: the same enlarged green
  prompt with `可以胡牌！` and a big tile/button, still anchored on the right. Claim action buttons
  stay visible but disabled while the rod is out; the grey `過` dismissal stays enabled and hides
  only its own box.
- The `表情` chip opens a fixed emoji picker (`emojiPanel`) with 12 emojis; the same chip and id
  `roomEmojiBtn` sits directly under `#roomPlayers` in the waiting room, available to host and
  guests before the deal. `toggleEmojiPanel(anchor)` positions the picker under whichever chip was
  pressed.
  Picking an emoji calls `sendEmoji()`, sends `{t:'emoji', seat, emoji}` (host relays to other
  guests) and appends a `#emojiLayer` bubble beside that seat's sea avatar, or beside the matching
  `.room-avatar` while `body.waiting-room` is active. The layer sits above modals (`z-index:65`) but
  is `pointer-events:none` so casts, room controls and HUD clicks still work; bubbles remove
  themselves on `animationend`. The picker closes on outside click, Escape, resize or selection.
- A document-level click listener plays a short WebAudio click for every enabled `<button>`, while
  `discard()` plays `assets/audio/mahjong-tile-strike.mp3` via `music.tile()`. Both live in
  `js/audio.js`. Both share `mf-sound`, but clicks and the tile strike use only the master volume
  while the music track uses master × music volume; no storage keys are added.
- Modals: ordinary modals close on backdrop click, but `overlay`, `loading`, `menuScreen`,
  `joinScreen` and `roomScreen` never do. The in-game 設定／玩法說明／計分 panels and the
  `重新開始投票` overlay are informational — they block input but not simulation. In-game
  `回到主選單` quits the round, clears pending prompts, sets `LOADING`, and shows the menu.
  Settings must not mention AI or 番數上限; host hook speed and duration lock after start; both
  volume sliders save into `mf-volume`.
- Exact waiting status, help count, pattern table source and no-bottom-button rules are listed
  under **Core game invariants**; keep them in sync with `index.html`.

## Assets, audio and credits

- Tile faces are 43 runtime PNGs (34 regular, 8 flowers, 1 back) at 120×160, generated from CC0
  artwork by FluffyStuff and Lilia Chen May Wither. `H6.png` uses 繁體「蘭」.
- `assets/bg/underwater.jpg` is under 400 KB, derived from a CC BY 4.0 Wikimedia image by
  Olivier Dugornay / Ifremer; the game draws mountains, houses, bamboo and grass in canvas, so
  no extra scenery images are needed.
- `js/audio.js` plays five CC0 Freesound tracks, switches to a different track after each one,
  starts only after a user gesture, and supports enable plus master/music volumes. Both volumes
  live in `mf-volume` as `main,music`; a legacy single number is read as the master volume with
  music at 100%.
- Announcements follow `mf-sound` and the master half of `mf-volume`, and use only an explicit
  `zh-HK`/Cantonese `SpeechSynthesis` voice cached on the first user gesture. A device without one
  stays silent instead of falling back to Mandarin.
- `CREDITS.md` is the licence source of truth. The in-game 資料來源 panel must show the required
  attribution strings and links. Do not add assets with unclear licences.

## Storage

Only these keys may be read or written:

```
mf-sound  mf-volume  mf-fantotal  mf-hookspeed  mf-gameseconds
```

They cover sound on/off, master and music volumes (in one `mf-volume` value), accumulated fan,
hook speed and round length.
Match setup, money, dealer continuity and payout history live in runtime state only — never add
a localStorage key for them. Do not reintroduce `mf-strength`, `mf-fancap`, `mf-assist`,
`mf-hints` or any point-related key.

## Verification checklist

Beyond syntax/tests:

- Use `?test=1&v=...` and check widths 320, 375, 768, 1073 and 1366 px.
- No console warnings/errors, no horizontal overflow, no HUD scrolling. HUD height stays fixed;
  status, toast, claim boxes, meld rows, flowers, hand and score UI must not resize the canvas
  or sea. Only viewport resizes may change geometry.
- Resting hook sits at the waterline; a vertical cast reaches the sea floor and a full ±85° swing
  reaches the top side edges while staying fully on screen.
- Solo: settings editable before the first deal and locked afterwards; `重來這局` preserves turn
  count; money/dealer/winds survive mid-match restart; new match resets purses.
- Scoring: typed and slider inputs stay in sync (`1–100000000`, `1–4`, `1×–100×`); payout values,
  出銃/自摸, 連莊, dealer rotation, match winner and history are exact; settlements happen once.
- 聯機: host controls sync to guests; guests see the same room layout with all host controls
  disabled, 開始遊戲 disabled and the `(由房主設定)` note; 起糊 syncs with the host and blocks
  below-minimum wins; room join, full/dead room messages, start lock, rematch/restart votes,
  win/draw settlement and host disconnect behave as specified. Real two-device PeerJS WebRTC smoke tests are still pending; message-level/browser
  simulations are the current practical check.
- Deployment: after push, fetch live assets with distinct cachebusts and confirm the new code is
  served.
