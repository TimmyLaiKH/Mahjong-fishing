/*
 * Game state machine, wall, canvas rendering and input for Mahjong-fishing.
 * All gameplay happens in one logical world (height 1080; width follows the
 * viewport aspect ratio), so mouse, touch and canvas coordinates agree.
 */
import {
  TILE_IDS, TILE_INFO, FLOWER_IDS, isFlower, loadImages, drawTile,
  createTileElement, tileName,
} from './tiles.js';
import { createMusic } from './audio.js';
import {
  WINDS, PATTERN_TABLE, FLOWER_PATTERN_TABLE, createWall, countTiles,
  evaluateHand, findWaits, getAssistTiles, formatWinBreakdown,
  withFlowers, flowerWin, flowerWinResult,
} from './rules.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = (id) => document.getElementById(id);
const ui = {
  loading: el('loading'), loadingProgress: el('loadingProgress'),
  hud: el('hud'), status: el('status'), hand: el('hand'), target: el('target'),
  tilesMeta: el('tilesMeta'), flowers: el('flowers'),
  claimBar: el('claimBar'), claimWho: el('claimWho'), claimTile: el('claimTile'),
  claimTimer: el('claimTimer'), claimActions: el('claimActions'),
  claimProgress: el('claimProgress'),
  selfWinBar: el('selfWinBar'), selfWinTile: el('selfWinTile'), selfWinActions: el('selfWinActions'),
  roundWind: el('roundWind'), seatWind: el('seatWind'),
  timer: el('timer'), turnCount: el('turnCount'),
  fanCount: el('fanCount'), bestFanCount: el('bestFanCount'),
  exposedKongs: el('exposedKongs'),
  overlay: el('overlay'), patternsBody: el('patternsBody'),
  settingsSound: el('settingsSound'),
  musicVolume: el('musicVolume'), musicVolumeValue: el('musicVolumeValue'),
  gameDuration: el('gameDuration'), gameDurationValue: el('gameDurationValue'),
  gameDurationText: el('gameDurationText'),
  hookSpeed: el('hookSpeed'), hookSpeedValue: el('hookSpeedValue'),
};

const music = createMusic();

const S = Object.freeze({
  LOADING: 'LOADING',
  DEAL: 'DEAL',
  AWAIT_CAST: 'AWAIT_CAST',
  CASTING: 'CASTING',
  REELING: 'REELING',
  RESOLVE_DRAW: 'RESOLVE_DRAW',
  AWAIT_DISCARD: 'AWAIT_DISCARD',
  WIN: 'WIN',
  DRAW_GAME: 'DRAW_GAME',
});

const WORLD_H = 1080;
const REFERENCE_W = 1920;
const WATER_TOP = 90;
const WATER_BOTTOM = 1030;
const TILE_W = 132;
const TILE_H = 176;
const ROD_BASE_Y = 4;
const ROD_LENGTH = 86;
const MAX_FISH = 12;
const SPAWN_INTERVAL = 1.2;
/** About one fish in seven briefly flashes its back as a memory test. */
const MEMORY_FLIP_CHANCE = 1 / 7;
const MEMORY_FLIP_DELAY = 3;
const MEMORY_FLIP_DURATION = 3;
/** A bot discard stays claimable for five seconds, shown beside the rod without pausing play. */
const CLAIM_SECONDS = 5;
/** The other three seats, in turn order starting after the player. */
const BOT_NAMES = ['允行', '一心', '念慈'];
const GAME_SECONDS = 300;
const MIN_GAME_SECONDS = 30;
const MAX_GAME_SECONDS = 1800;
/** 海底撈月: any tile won within the final 5 seconds; 自摸 is still scored separately. */
const HAIDI_SECONDS = 5;
/** AI assist applies to new fish only; bot discards are fully random. */
const ASSIST_CHANCE = 0.7;
const ASSIST_TIERS = [
  ['wins', 0.85],
  ['flowers', 0.75],
  ['kongs', 0.6],
  ['progress', 0.7],
];

const view = { scale: 1, width: REFERENCE_W, dpr: 1 };
const game = {
  state: S.LOADING,
  images: {},
  bg: null,
  wall: [],
  hand: [],                 // [{ uid, id }] — uid keeps discard clicks stable
  flowers: [],              // flower tile ids, kept outside the hand (補花)
  melds: [], river: [], fish: [],
  bots: [], botIndex: -1,
  nextUid: 1,
  roundWind: 'E', seatWind: 'S',
  turn: 1, timeLeft: GAME_SECONDS,
  // Only fan totals are tracked — there is no fan-to-points conversion.
  fanTotal: readNumber('mf-fantotal'), bestFan: readNumber('mf-bestfan'),
  settings: {
    sound: readSetting('mf-sound', true),
    musicVolume: Math.min(1, Math.max(0, readNumberWithDefault('mf-volume', 0.32))),
    fanCap: Infinity,
    gameSeconds: readGameSeconds(),
  },
  hookSpeed: Math.min(2, Math.max(0.5, readNumberWithDefault('mf-hookspeed', 1))),
  lastDraw: null,           // { uid, id, source: 'fish' | 'flower' | 'kong' }
  kongChain: 0,
  rodAngle: 0, rodDir: 1, hookLen: 0,
  spawnTimer: 0,
  selectedDiscard: 0,
  discardInfo: new Map(),
  pendingResult: null,
  pendingClaim: null,       // { tile: { id, uid }, bot: { name, wind } }
  claimActions: [], claimTimeLeft: 0,
  pendingSelfWin: null,     // { result, kongTile, onDecline } — inline 胡牌／過 prompt
  declinedFlowerWin: false, // 七花已拒絕；只接受八花，之後手牌胡加上花糊
};

function readNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function readNumberWithDefault(key, fallback) {
  try { return Number(localStorage.getItem(key) ?? fallback) || fallback; } catch { return fallback; }
}
function readSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch { return fallback; }
}
function clampGameSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return GAME_SECONDS;
  return Math.min(MAX_GAME_SECONDS, Math.max(MIN_GAME_SECONDS, Math.round(seconds)));
}
function readGameSeconds() {
  try {
    const raw = localStorage.getItem('mf-gameseconds');
    return raw === null ? GAME_SECONDS : clampGameSeconds(raw);
  } catch { return GAME_SECONDS; }
}
function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
/** Parse a typed clock such as "5:00", "05:00", "0:30" or "5" (minutes). */
function parseClock(text) {
  const value = String(text).trim();
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length === 1 && /^\d+$/.test(parts[0])) return Number(parts[0]) * 60;
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    if (Number(parts[1]) > 59) return null;
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return null;
}
function commitDurationText() {
  const parsed = parseClock(ui.gameDurationText.value);
  if (parsed === null) {
    ui.gameDurationText.value = formatClock(game.settings.gameSeconds);
    return;
  }
  setGameSeconds(parsed);
}
function save(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
}

/** Three bots sit after the player in wind order; the last one is 上家. */
function createBots() {
  const start = WINDS.indexOf(game.seatWind);
  return BOT_NAMES.map((name, offset) => ({
    name,
    wind: WINDS[(start + offset + 1) % WINDS.length],
  }));
}
function previousWind() {
  return WINDS[(WINDS.indexOf(game.seatWind) + WINDS.length - 1) % WINDS.length];
}
function canChowFrom(bot) {
  return Boolean(bot) && bot.wind === previousWind();
}
function botLabel(bot) {
  if (!bot) return '';
  const role = canChowFrom(bot) ? '上家・' : '';
  return `${bot.name}（${role}${TILE_INFO[bot.wind].name}）`;
}

const concealedIds = () => game.hand.map((t) => t.id);
const difficulty = () => 1 + Math.min(game.turn, 30) * 0.025;
/** The hook accelerates with both the number of turns and elapsed time. */
const paceFactor = () => {
  const duration = Math.max(1, game.settings.gameSeconds);
  const elapsed = Math.max(0, duration - game.timeLeft);
  return difficulty() * (1 + elapsed / duration * 0.5);
};
const modalOpen = () => [...document.querySelectorAll('.modal.show')]
  .some((m) => m !== ui.loading);
const paused = () => document.hidden || modalOpen();

function winContext() {
  return {
    selfDraw: true,
    kongReplacementChain: game.kongChain,
    haidi: game.timeLeft <= HAIDI_SECONDS,
    roundWind: game.roundWind,
    seatWind: game.seatWind,
    fanCap: game.settings.fanCap,
    declinedFlowerWin: game.declinedFlowerWin,
  };
}

/** The opening self-draw is 天胡 for the dealer and 地胡 for every other seat. */
function openingWinContext() {
  const dealer = game.seatWind === game.roundWind;
  return {
    ...winContext(),
    selfDraw: true,
    kongReplacementChain: 0,
    haidi: false,
    tiangu: dealer,
    dihu: !dealer,
  };
}

function setState(next) {
  game.state = next;
  // Discard analysis only applies while choosing a discard. Clearing it on
  // every state change stops stale tiles bouncing after a discard, win or 流局.
  game.discardInfo = new Map();
  const messages = {
    [S.DEAL]: '派牌中…',
    [S.AWAIT_CAST]: '拋竿釣起你需要的牌吧！(點擊屏幕)',
    [S.CASTING]: '鉤子下降中，看準時機！',
    [S.REELING]: '收線中…',
    [S.RESOLVE_DRAW]: '檢查牌型…',
    [S.AWAIT_DISCARD]: '請選一張牌打出（或直接點擊手牌）',
    [S.WIN]: '胡牌！',
    [S.DRAW_GAME]: '流局',
  };
  if (messages[next]) setStatus(messages[next]);
  if (next === S.AWAIT_DISCARD) {
    // Always highlight the tile that was just fished / drawn, not the
    // rightmost tile in the sorted hand.
    const drawnIndex = game.hand.findIndex((tile) => tile.uid === game.lastDraw?.uid);
    game.selectedDiscard = drawnIndex >= 0 ? drawnIndex : Math.max(0, game.hand.length - 1);
  }
  updateHUD();
}
function setStatus(text, bump = false) {
  ui.status.textContent = text;
  ui.status.classList.toggle('bump', bump);
  // Status length can wrap and change the HUD height; keep the canvas below it.
  resizeCanvas();
}

/* ------------------------------------------------------------------ *
 * Wall and turn flow
 * ------------------------------------------------------------------ */

function takeFromWall(kind = null) {
  if (!game.wall.length) return null;
  let index = game.wall.length - 1;
  if (kind !== null) {
    index = game.wall.lastIndexOf(kind);
    if (index === -1) return null;
  }
  const [id] = game.wall.splice(index, 1);
  return { id, uid: game.nextUid++ };
}

/**
 * Look at the tile the dealer would draw for 天胡, including any flowers that
 * must be replaced first. Non-winning hands leave the wall untouched so the
 * normal "fish for your first tile" flow is unchanged.
 */
function peekInitialDraw() {
  const flowers = [];
  let index = game.wall.length - 1;
  while (index >= 0 && isFlower(game.wall[index])) {
    flowers.push(game.wall[index]);
    index -= 1;
  }
  return { index, tile: index >= 0 ? game.wall[index] : null, flowers };
}

function consumeInitialDraw(peek) {
  game.flowers.push(...peek.flowers);
  if (peek.index >= 0) game.wall.splice(peek.index);
  else game.wall.length = 0;
}

/** Return true when the opening self-draw ended the round (天胡／地胡 or 花糊). */
function checkInitialSelfDraw() {
  const peek = peekInitialDraw();
  const allFlowers = [...game.flowers, ...peek.flowers];
  const flowerResult = flowerWinResult(
    allFlowers, game.seatWind, game.settings.fanCap, openingWinContext(),
  );
  // A declined 花糊 can only be upgraded to 大花糊, never re-offered here.
  if (flowerResult && (!game.declinedFlowerWin
    || flowerResult.patterns.some((p) => p.id === '大花糊'))) {
    consumeInitialDraw(peek);
    sortHand();
    updateHUD();
    commitWin(flowerResult);
    return true;
  }
  if (!peek.tile) return false;

  const tiangu = withFlowers(evaluateHand({
    concealed: [...concealedIds(), peek.tile],
    melds: game.melds,
    winningTile: peek.tile,
    context: openingWinContext(),
  }), allFlowers, game.seatWind, game.settings.fanCap, openingWinContext());
  if (!tiangu.isWin) return false;

  consumeInitialDraw(peek);
  const drawn = { id: peek.tile, uid: game.nextUid++, source: 'tiangu' };
  game.hand.push(drawn);
  game.lastDraw = drawn;
  sortHand();
  updateHUD();
  commitWin(tiangu);
  return true;
}

/** Tiles available for new fish and bot discards. Discards are recycled once
 *  the wall is empty so play continues until a win or the timer ends. */
function playableKinds() {
  if (game.wall.length) return game.wall;
  if (game.river.length) return game.river.map((tile) => tile.id);
  return TILE_IDS;
}

/** Draw from the wall, falling back to recycled discards or a fresh tile. */
function takeTileForPlay(kind = null) {
  const fromWall = takeFromWall(kind);
  if (fromWall) return fromWall;
  if (game.river.length) {
    let index = game.river.length - 1;
    if (kind !== null) {
      const match = game.river.findIndex((tile) => tile.id === kind);
      if (match !== -1) index = match;
    }
    const [tile] = game.river.splice(index, 1);
    return { id: tile.id, uid: tile.uid ?? game.nextUid++ };
  }
  return { id: kind ?? TILE_IDS[Math.floor(Math.random() * TILE_IDS.length)], uid: game.nextUid++ };
}

function chooseFishKind() {
  const supply = playableKinds();
  const fallback = () => supply[Math.floor(Math.random() * supply.length)];
  if (Math.random() > ASSIST_CHANCE) return fallback();
  const assist = getAssistTiles({
    concealed: concealedIds(),
    melds: game.melds,
    flowers: game.flowers,
    availability: countTiles(supply),
    context: winContext(),
  });
  for (const [key, chance] of ASSIST_TIERS) {
    const candidates = assist[key];
    if (candidates.length && Math.random() < chance) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return fallback();
}

function startGame({ keepTurn = false } = {}) {
  const nextTurn = keepTurn ? game.turn : 1;
  game.wall = createWall();
  game.hand = [];
  game.flowers = [];
  game.melds = [];
  game.river = [];
  game.fish = [];
  game.nextUid = 1;
  game.turn = nextTurn;
  game.timeLeft = game.settings.gameSeconds;
  game.kongChain = 0;
  game.lastDraw = null;
  game.hookLen = 0;
  game.spawnTimer = 0;
  game.pendingResult = null;
  game.declinedFlowerWin = false;
  clearClaim();
  clearSelfWin();
  game.roundWind = WINDS[Math.floor(Math.random() * WINDS.length)];
  game.seatWind = WINDS[(WINDS.indexOf(game.roundWind) + 1 + Math.floor(Math.random() * 3)) % 4];
  game.bots = createBots();
  game.botIndex = -1;
  // 花牌不進手牌：起手摸到就先亮出，再補一張，直到補滿 13 張普通牌。
  let openingFlowerWin = null;
  while (game.hand.length < 13 && game.wall.length) {
    const tile = takeFromWall();
    if (isFlower(tile.id)) {
      game.flowers.push(tile.id);
      const win = flowerWinResult(
        game.flowers, game.seatWind, game.settings.fanCap, openingWinContext(),
      );
      if (win) openingFlowerWin = win;
    } else {
      game.hand.push(tile);
    }
  }
  sortHand();
  updateHUD();
  if (openingFlowerWin) {
    // 八花沒有更大的花糊可等待，直接即時胡牌；七花可選「過」拒絕。
    if (!openingFlowerWin.patterns.some((p) => p.id === '花糊')) {
      commitWin(openingFlowerWin);
      return;
    }
    setState(S.RESOLVE_DRAW);
    offerSelfWin(openingFlowerWin, null, () => {
      game.declinedFlowerWin = true;
      continueAfterOpeningFlowerDecline();
    });
    return;
  }
  continueAfterOpeningFlowerDecline();
}

/** Resume the normal opening flow after a declined seven-flower win. */
function continueAfterOpeningFlowerDecline() {
  // 天胡／地胡：補花後的第一張自摸若已胡牌，直接以 13 番例牌結局。
  if (checkInitialSelfDraw()) return;

  sortHand();
  setState(S.DEAL);
  spawnFish(5);
  updateHUD();
  const kongTile = findKongTile();
  if (kongTile) {
    showOverlay({
      title: '開槓',
      message: '起手就有四張相同的牌，是否開暗槓？',
      actions: [
        { label: '開槓', onClick: () => declareKong(kongTile) },
        { label: '不開槓', primary: false, onClick: () => setState(S.AWAIT_CAST) },
      ],
    });
  } else {
    setState(S.AWAIT_CAST);
  }
  nextBotDiscard();
}

/** Restarting a hand keeps the 巡 counter and its difficulty pace. */
const restartGame = () => startGame({ keepTurn: true });

function sortHand() {
  game.hand.sort((a, b) => TILE_IDS.indexOf(a.id) - TILE_IDS.indexOf(b.id));
}

function findKongTile() {
  const counts = countTiles(concealedIds());
  return Object.keys(counts).find((id) => counts[id] === 4) ?? null;
}

function startCast() {
  if (game.state !== S.AWAIT_CAST || paused()) return;
  game.hookLen = 0;
  setState(S.CASTING);
}

function checkCatch() {
  // Once a tile is hooked, ignore everything else on the way back. Otherwise a
  // second contact would overwrite lastDraw and silently lose both tiles.
  if (game.lastDraw) return;
  const { hookX, hookY } = hookPosition();
  for (let i = 0; i < game.fish.length; i += 1) {
    const f = game.fish[i];
    if (Math.abs(f.x - hookX) <= f.w / 2 + 16 && Math.abs(f.y - hookY) <= f.h / 2 + 16) {
      const [caught] = game.fish.splice(i, 1);
      const flower = isFlower(caught.id);
      // A pending kong chain survives until the player hooks the replacement.
      // Catching a flower resets it, so that tile cannot score 槓上開花.
      const kongReplacement = !flower && !game.lastDraw && game.kongChain > 0;
      game.lastDraw = {
        id: caught.id,
        uid: game.nextUid++,
        source: flower ? 'flower' : (kongReplacement ? 'kong' : 'fish'),
      };
      if (!kongReplacement) game.kongChain = 0;
      setState(S.REELING);
      setStatus(flower
        ? `釣到花牌 ${tileName(caught.id)}！再釣一張牌。`
        : `釣到 ${tileName(caught.id)}！`);
      return;
    }
  }
}

function finishReel() {
  if (game.lastDraw?.source === 'flower') {
    game.flowers.push(game.lastDraw.id);
    const immediate = flowerWinResult(
      game.flowers, game.seatWind, game.settings.fanCap, winContext(),
    );
    if (immediate) {
      // 八花沒有更大的花糊可等待，直接即時胡牌；七花可選「過」拒絕。
      if (immediate.patterns.some((p) => p.id === '大花糊')
        || game.declinedFlowerWin) {
        commitWin(immediate);
        return;
      }
      setState(S.RESOLVE_DRAW);
      offerSelfWin(immediate, null, () => {
        game.declinedFlowerWin = true;
        game.lastDraw = null;
        game.kongChain = 0;
        setState(S.AWAIT_CAST);
      });
      return;
    }
    // No automatic replacement: the player hooks the next tile instead.
    game.lastDraw = null;
    game.kongChain = 0;
    setState(S.AWAIT_CAST);
    return;
  }
  if (game.lastDraw?.source === 'fish' || game.lastDraw?.source === 'kong') {
    game.hand.push({ id: game.lastDraw.id, uid: game.lastDraw.uid });
    sortHand();
    setState(S.RESOLVE_DRAW);
    resolveDraw();
  } else {
    setState(S.AWAIT_CAST);
  }
}

function resolveDraw() {
  const result = withFlowers(evaluateHand({
    concealed: concealedIds(),
    melds: game.melds,
    winningTile: game.lastDraw?.id ?? null,
    context: winContext(),
  }), game.flowers, game.seatWind, game.settings.fanCap, winContext());
  game.pendingResult = result;
  const kongTile = findKongTile();
  if (result.isWin) {
    // Ask inline beside the rod instead of blocking play with a modal.
    offerSelfWin(result, kongTile);
    return;
  }
  if (kongTile) {
    showResolveOverlay(result, kongTile);
  } else {
    setState(S.AWAIT_DISCARD);
  }
}

function showResolveOverlay(result, kongTile) {
  const actions = [];
  if (result.isWin) actions.push({ label: '胡牌', onClick: () => commitWin(result) });
  if (kongTile) actions.push({ label: `開槓（${tileName(kongTile)}）`, onClick: () => declareKong(kongTile) });
  actions.push({
    label: result.isWin ? '繼續摸牌' : '打出牌',
    primary: false,
    onClick: () => setState(S.AWAIT_DISCARD),
  });
  showOverlay({
    title: result.isWin ? '可以胡牌！' : '暗槓機會',
    message: [
      result.isWin ? formatWinBreakdown(result) : `手上有四張 ${tileName(kongTile)}，要開暗槓嗎？`,
      kongTile && result.isWin ? `\n亦有四張 ${tileName(kongTile)} 可以開槓。` : '',
    ].join('\n'),
    tiles: result.isWin ? winningTiles(result) : [],
    actions,
  });
}

function declareKong(kind) {
  let removed = 0;
  game.hand = game.hand.filter((tile) => {
    if (tile.id === kind && removed < 4) { removed += 1; return false; }
    return true;
  });
  if (removed !== 4) return;
  game.melds.push({ tile: kind, type: 'kong', tiles: [kind, kind, kind, kind] });
  const previousChain = game.lastDraw?.source === 'kong' ? game.kongChain : 0;
  game.kongChain = previousChain + 1;
  // No automatic replacement: the player hooks the next tile, which becomes
  // the kong replacement and keeps 槓上開花／連槓開花 available.
  game.lastDraw = null;
  game.pendingResult = null;
  clearSelfWin();
  setState(S.AWAIT_CAST);
  setStatus('開槓成功！再釣一張牌。');
}

function discard(uid) {
  if (game.state !== S.AWAIT_DISCARD) return;
  const index = game.hand.findIndex((tile) => tile.uid === uid);
  if (index === -1) return;
  const [tile] = game.hand.splice(index, 1);
  game.river.push(tile);
  game.lastDraw = null;
  game.kongChain = 0;
  game.turn += 1;
  // With bots discarding independently, nothing else advances the player's
  // turn after a discard. Return to casting so fishing can continue.
  setState(S.AWAIT_CAST);
}

/* ------------------------------------------------------------------ *
 * Simulated opponent discards and open calls (碰 / 上 / 明槓 / 胡)
 * ------------------------------------------------------------------ */

/** All two-tile combinations from the hand that complete a 上 with this tile. */
function chowCombinations(discardId, handIds = concealedIds()) {
  const info = TILE_INFO[discardId];
  if (!info || info.isHonor || info.isFlower) return [];
  const counts = countTiles(handIds);
  const prefix = discardId[0];
  const rank = info.value;
  const shapes = [[rank - 2, rank - 1], [rank - 1, rank + 1], [rank + 1, rank + 2]];
  const combinations = [];
  for (const [a, b] of shapes) {
    if (a < 1 || b > 9) continue;
    const first = `${prefix}${a}`;
    const second = `${prefix}${b}`;
    if ((counts[first] ?? 0) < 1 || (counts[second] ?? 0) < 1) continue;
    const tiles = [first, second].sort((x, y) => TILE_IDS.indexOf(x) - TILE_IDS.indexOf(y));
    const key = tiles.join(',');
    if (combinations.some((entry) => entry.key === key)) continue;
    combinations.push({ tiles, key });
  }
  return combinations;
}

/** Winning off a discard is never 自摸; open calls additionally remove 門前清. */
function claimWinResult(discardId) {
  return withFlowers(evaluateHand({
    concealed: [...concealedIds(), discardId],
    melds: game.melds,
    winningTile: discardId,
    context: { ...winContext(), selfDraw: false },
  }), game.flowers, game.seatWind, game.settings.fanCap, { ...winContext(), selfDraw: false });
}

function clearClaim() {
  game.pendingClaim = null;
  game.claimActions = [];
  game.claimTimeLeft = 0;
  renderClaim();
}

function clearSelfWin() {
  game.pendingSelfWin = null;
  if (!ui.selfWinBar) return;
  ui.selfWinBar.hidden = true;
  ui.selfWinBar.classList.remove('actionable');
  if (ui.selfWinTile) ui.selfWinTile.innerHTML = '';
  if (ui.selfWinActions) ui.selfWinActions.innerHTML = '';
}

/** Show the inline 胡牌／過 prompt beside the rod instead of a modal. */
function offerSelfWin(result, kongTile, onDecline) {
  game.pendingSelfWin = { result, kongTile, onDecline };
  setStatus('可以胡牌！選擇胡牌或過。');
  renderSelfWin();
}

/** Bot discards are random plays from the shared pool; they never read the
 *  player's hand, even after discards start being recycled. */
function chooseOpponentDiscardKind() {
  const supply = playableKinds();
  return supply[Math.floor(Math.random() * supply.length)];
}

function takeHandTiles(kinds) {
  const needed = countTiles(kinds);
  const chosen = [];
  for (const id of Object.keys(needed)) {
    const matching = game.hand.filter((tile) => tile.id === id).slice(0, needed[id]);
    if (matching.length < needed[id]) return null;
    chosen.push(...matching);
  }
  return chosen;
}

function buildClaimActions(discardId, bot = game.pendingClaim?.bot) {
  const hand = concealedIds();
  const counts = countTiles(hand);
  const actions = [];
  const win = claimWinResult(discardId);
  if (win.isWin) actions.push({ label: '胡牌', onClick: () => commitWin(win) });

  const canCall = hand.length >= 4;
  const canChow = canCall && canChowFrom(bot);
  const hasReplacement = game.wall.length + game.fish.length > 0;
  if (canCall && hasReplacement && (counts[discardId] ?? 0) >= 3) {
    actions.push({
      label: `明槓 ${tileName(discardId)}`,
      onClick: () => declareOpenMeld('kong', discardId, [discardId, discardId, discardId]),
    });
  }
  if (canCall && (counts[discardId] ?? 0) >= 2) {
    actions.push({
      label: `碰 ${tileName(discardId)}`,
      onClick: () => declareOpenMeld('pung', discardId, [discardId, discardId]),
    });
  }
  for (const combo of chowCombinations(discardId, hand)) {
    if (!canChow) break;
    actions.push({
      label: `上 ${combo.tiles.map(tileName).join('')}`,
      onClick: () => declareOpenMeld('chow', discardId, combo.tiles),
    });
  }
  actions.push({ label: '過', primary: false, onClick: passClaim });
  return actions;
}

/** Start the next bot's five-second discard without touching the player's state. */
function nextBotDiscard() {
  if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
  game.botIndex = (game.botIndex + 1) % game.bots.length;
  const bot = game.bots[game.botIndex];
  const tile = takeTileForPlay(chooseOpponentDiscardKind());
  game.pendingClaim = { tile, bot };
  game.claimActions = buildClaimActions(tile.id, bot);
  game.claimTimeLeft = CLAIM_SECONDS;
  renderClaim();
}

function declareOpenMeld(type, discardId, handKinds) {
  const removed = takeHandTiles(handKinds);
  if (!removed) return;
  game.hand = game.hand.filter((tile) => !removed.includes(tile));
  game.melds.push({
    tile: discardId,
    type,
    tiles: [...removed.map((tile) => tile.id), discardId],
    open: true,
  });
  clearClaim();
  clearSelfWin();
  game.lastDraw = null;
  game.kongChain = 0;
  if (type === 'kong') {
    game.kongChain = 1;
    setState(S.AWAIT_CAST);
  } else {
    setState(S.AWAIT_DISCARD);
    setStatus(`${type === 'pung' ? '碰' : '上'}成功！請選一張牌打出。`);
  }
  nextBotDiscard();
}

/** Passing removes the buttons but leaves the tile visible for its full 5s. */
function passClaim() {
  if (!game.pendingClaim) return;
  game.river.push(game.pendingClaim.tile);
  game.claimActions = [];
  renderClaim();
}

function commitWin(result) {
  game.fanTotal += result.totalFan;
  if (result.totalFan > game.bestFan) {
    game.bestFan = result.totalFan;
    save('mf-bestfan', game.bestFan);
  }
  save('mf-fantotal', game.fanTotal);
  clearClaim();
  clearSelfWin();
  setState(S.WIN);
  setStatus(`胡牌！${result.totalFan} 番`);
  showOverlay({
    title: '🎉 胡牌成功！',
    message: `${formatWinBreakdown(result)}\n\n累計 ${game.fanTotal} 番　最佳 ${game.bestFan} 番`,
    tiles: [
      ...winningTiles(result),
      ...(result.flowers ?? []).map((id) => ({ id })),
    ],
    actions: [{ label: '再玩一局', onClick: restartGame }],
  });
}

function endDrawGame() {
  clearClaim();
  clearSelfWin();
  game.timeLeft = 0;
  setState(S.DRAW_GAME);
  setStatus('時間到，流局。');
  updateTimer();
  showOverlay({
    title: '流局',
    message: `時間到，沒有胡牌。\n累計 ${game.fanTotal} 番　最佳 ${game.bestFan} 番`,
    actions: [{ label: '再玩一局', onClick: restartGame }],
  });
}

function winningTiles(result) {
  return [
    ...result.melds.flatMap((meld) => {
      const concealed = isConcealedKong(meld);
      return meld.tiles.map((id, index) => ({
        id,
        faceDown: concealed && (index === 0 || index === 3),
      }));
    }),
    ...result.concealed.map((id) => ({ id, faceDown: false })),
  ];
}

/* ------------------------------------------------------------------ *
 * Canvas rendering
 * ------------------------------------------------------------------ */

function resizeCanvas() {
  // Start the canvas below the HUD so the rod, line and resting hook are never
  // hidden behind the panel. The HUD can change height (flowers, hand wraps),
  // so this is re-run by a ResizeObserver as well as on window resize.
  const hudBottom = ui.hud?.getBoundingClientRect().bottom ?? 0;
  canvas.style.top = `${hudBottom}px`;
  canvas.style.height = `calc(100% - ${hudBottom}px)`;
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * view.dpr);
  canvas.height = Math.round(height * view.dpr);
  view.scale = height / WORLD_H;
  view.width = width / view.scale;
  ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
  draw(0);
  positionClaimBar();
  positionSelfWinBar();
}
window.addEventListener('resize', resizeCanvas);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resizeCanvas()).observe(ui.hud);

/** Line length needed for the hook to reach the sea floor at this rod angle. */
function maxHookLength(angle = game.rodAngle) {
  const verticalDrop = WORLD_H - ROD_BASE_Y;
  return Math.max(0, verticalDrop / Math.max(Math.cos(angle), 0.01) - ROD_LENGTH);
}

/** Largest swing whose fully lowered hook stays on screen at the sea floor. */
function swingLimit() {
  const available = Math.max(0, view.width / 2 - TILE_W);
  return Math.atan2(available, WORLD_H - ROD_BASE_Y);
}

function hookPosition() {
  const baseX = view.width / 2;
  const tipX = baseX + Math.sin(game.rodAngle) * ROD_LENGTH;
  const tipY = ROD_BASE_Y + Math.cos(game.rodAngle) * ROD_LENGTH;
  // Safety net after a resize; normal play is bounded by swingLimit() so the
  // hook never visibly sits still against the edge.
  const hookX = Math.max(TILE_W, Math.min(
    view.width - TILE_W,
    tipX + Math.sin(game.rodAngle) * game.hookLen,
  ));
  return {
    baseX, tipX, tipY, hookX,
    hookY: tipY + Math.cos(game.rodAngle) * game.hookLen,
  };
}

/** Distant mountain ridges above the waterline. */
function drawMountains() {
  const layers = [
    {
      fill: 'rgba(38, 88, 104, 0.45)',
      peaks: [0, 58, 0.12, 30, 0.24, 60, 0.38, 22, 0.52, 58, 0.67, 32, 0.82, 62, 1, 44],
    },
    {
      fill: 'rgba(21, 66, 79, 0.68)',
      peaks: [0, 76, 0.14, 48, 0.29, 74, 0.45, 44, 0.62, 72, 0.78, 48, 0.92, 76, 1, 64],
    },
  ];
  for (const layer of layers) {
    ctx.beginPath();
    ctx.moveTo(0, WATER_TOP);
    for (let i = 0; i < layer.peaks.length; i += 2) {
      ctx.lineTo(layer.peaks[i] * view.width, layer.peaks[i + 1]);
    }
    ctx.lineTo(view.width, WATER_TOP);
    ctx.closePath();
    ctx.fillStyle = layer.fill;
    ctx.fill();
  }
}

/** Gentle, slightly uneven top edge of the bank. */
function landTopAt(x) {
  return WATER_TOP - 20 - Math.sin(x / 140) * 4 - Math.sin(x / 57) * 2;
}

/** Grass-topped bank with soil and a wet sand edge at the waterline. */
function drawLand() {
  ctx.beginPath();
  ctx.moveTo(0, WATER_TOP);
  for (let x = 0; x <= view.width; x += 16) ctx.lineTo(x, landTopAt(x));
  ctx.lineTo(view.width, landTopAt(view.width));
  ctx.lineTo(view.width, WATER_TOP);
  ctx.closePath();
  ctx.fillStyle = 'rgba(104, 76, 50, 0.95)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, landTopAt(0));
  for (let x = 0; x <= view.width; x += 16) ctx.lineTo(x, landTopAt(x));
  for (let x = view.width; x >= 0; x -= 16) ctx.lineTo(x, landTopAt(x) + 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(76, 118, 68, 0.96)';
  ctx.fill();

  ctx.fillStyle = 'rgba(202, 175, 124, 0.9)';
  ctx.fillRect(0, WATER_TOP - 6, view.width, 6);
}

/** Small waterside cottage with a tiled roof and lit windows. */
function drawHouse(x, baseY, width, height) {
  ctx.fillStyle = 'rgba(228, 198, 154, 0.95)';
  ctx.fillRect(x - width / 2, baseY - height, width, height);

  ctx.fillStyle = 'rgba(88, 41, 36, 0.95)';
  ctx.beginPath();
  ctx.moveTo(x - width / 2 - 5, baseY - height);
  ctx.lineTo(x, baseY - height - 14);
  ctx.lineTo(x + width / 2 + 5, baseY - height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(70, 40, 30, 0.9)';
  ctx.fillRect(x - 4, baseY - 13, 8, 13);
  ctx.fillStyle = 'rgba(255, 236, 160, 0.85)';
  ctx.fillRect(x - width / 2 + 5, baseY - height + 6, 5, 5);
  ctx.fillRect(x + width / 2 - 10, baseY - height + 6, 5, 5);
}

/** A few bamboo stalks with leaves, drawn as silhouettes. */
function drawBambooCluster(x, baseY, height) {
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const sx = x + (i - 1) * 6;
    const top = baseY - height * (0.78 + 0.11 * i);
    ctx.strokeStyle = 'rgba(15, 74, 47, 0.9)';
    ctx.lineWidth = 2.6 - i * 0.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, baseY);
    ctx.lineTo(sx + Math.sin(i * 1.7) * 3, top);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(9, 52, 33, 0.65)';
    ctx.lineWidth = 1;
    for (let ny = baseY - 13; ny > top + 8; ny -= 13) {
      ctx.beginPath();
      ctx.moveTo(sx - 2, ny);
      ctx.lineTo(sx + 2, ny);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(26, 96, 56, 0.88)';
    for (let j = 0; j < 3; j += 1) {
      const ly = top + 9 + j * 13;
      const dir = j % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sx, ly);
      ctx.quadraticCurveTo(sx + dir * 10, ly - 7, sx + dir * 17, ly - 2);
      ctx.quadraticCurveTo(sx + dir * 9, ly + 2, sx, ly);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Shoreline scenery replaces the old flat dock bar. */
function drawShore() {
  drawMountains();
  drawLand();
  const house1 = view.width * 0.34;
  const house2 = view.width * 0.61;
  drawHouse(house1, landTopAt(house1) + 2, 44, 27);
  drawHouse(house2, landTopAt(house2) + 3, 34, 22);
  for (const [fraction, height] of [[0.07, 62], [0.23, 48], [0.79, 54], [0.94, 64]]) {
    const x = view.width * fraction;
    drawBambooCluster(x, landTopAt(x) + 3, height);
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_TOP);
  sky.addColorStop(0, '#d9f3ff');
  sky.addColorStop(0.7, '#8ecfe6');
  sky.addColorStop(1, '#4aa7c4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, WATER_TOP + 2);

  drawShore();

  if (game.bg?.complete && game.bg.naturalWidth) {
    const scale = Math.max(view.width / game.bg.naturalWidth, WORLD_H / game.bg.naturalHeight);
    const w = game.bg.naturalWidth * scale;
    const h = game.bg.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, WATER_TOP, view.width, WORLD_H - WATER_TOP);
    ctx.clip();
    ctx.globalAlpha = 0.82;
    ctx.drawImage(game.bg, (view.width - w) / 2, (WORLD_H - h) / 2, w, h);
    const veil = ctx.createLinearGradient(0, WATER_TOP, 0, WORLD_H);
    veil.addColorStop(0, 'rgba(4,50,70,0.28)');
    veil.addColorStop(1, 'rgba(2,24,40,0.5)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, WATER_TOP, view.width, WORLD_H - WATER_TOP);
    ctx.restore();
  } else {
    ctx.fillStyle = '#07516b';
    ctx.fillRect(0, WATER_TOP, view.width, WORLD_H - WATER_TOP);
  }

  // Animated water surface + faint caustic shimmer.
  const t = performance.now() / 1000;
  ctx.save();
  ctx.strokeStyle = 'rgba(230,255,255,0.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x <= view.width; x += 12) {
    const y = WATER_TOP + Math.sin(x / 70 + t * 1.6) * 6;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,245,255,0.11)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i += 1) {
    const y = WATER_TOP + 70 + i * 88;
    ctx.beginPath();
    for (let x = 0; x <= view.width; x += 24) {
      const yy = y + Math.sin(x / 90 + t * 0.9 + i) * 9;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** One fish in seven flashes its back for three seconds, then flips back. */
function fishFaceDown(f) {
  return Boolean(f.memoryFlip)
    && f.age >= MEMORY_FLIP_DELAY
    && f.age < MEMORY_FLIP_DELAY + MEMORY_FLIP_DURATION;
}

function drawFish() {
  const t = performance.now() / 1000;
  for (const f of game.fish) {
    drawTile(ctx, f.id, f.x, f.y, f.w, f.h, {
      images: game.images,
      shadow: true,
      // Hooked tiles are drawn face-up by drawRod(), so the flash never hides
      // the tile once the player has caught it.
      faceDown: fishFaceDown(f),
      // Each fish has its own full 360° orientation; the small wobble is just
      // extra life. Never mirror the face, even for fish swimming left.
      rotation: f.rotation + Math.sin(t * 2.4 + f.phase) * 0.07,
    });
  }
}

function drawRod() {
  const { baseX, tipX, tipY, hookX, hookY } = hookPosition();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8d5524';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(baseX, ROD_BASE_Y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = '#e8f4f8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(hookX, hookY);
  ctx.stroke();
  ctx.font = '56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🪝', hookX, hookY);
  // Show whatever the hook has caught, including flowers and kong replacements.
  if (game.lastDraw && (game.state === S.REELING || game.state === S.RESOLVE_DRAW)) {
    const tileY = Math.min(hookY + 100, WORLD_H - TILE_H / 2 - 8);
    drawTile(ctx, game.lastDraw.id, hookX, tileY, TILE_W, TILE_H, {
      images: game.images, shadow: true,
    });
  }
  ctx.restore();
}

function draw(dt) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
  ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, 0, 0);
  drawBackground();
  drawFish();
  drawRod();
  positionClaimBar();
  if (!paused()) {
    game.spawnTimer += dt;
    if (game.spawnTimer >= SPAWN_INTERVAL) {
      game.spawnTimer = 0;
      spawnFish(2);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Game loop
 * ------------------------------------------------------------------ */

let lastFrame = 0;
function gameLoop(timestamp) {
  const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
  lastFrame = timestamp;
  if (!paused()) {
    if (game.state !== S.WIN && game.state !== S.DRAW_GAME) {
      game.timeLeft = Math.max(0, game.timeLeft - dt);
      updateTimer();
      if (game.timeLeft <= 0) { endDrawGame(); }
    }
    if (game.state !== S.WIN && game.state !== S.DRAW_GAME) {
      updateClaimTimer(dt);
      if (game.wall.length && !game.pendingClaim) nextBotDiscard();
    }
    const hookRate = game.hookSpeed * paceFactor();
    if (game.state === S.AWAIT_CAST) {
      const limit = swingLimit();
      game.rodAngle += game.rodDir * 0.9 * hookRate * dt;
      if (game.rodAngle > limit) { game.rodAngle = limit; game.rodDir = -1; }
      else if (game.rodAngle < -limit) { game.rodAngle = -limit; game.rodDir = 1; }
    }
    if (game.state === S.CASTING) {
      const maxLen = maxHookLength();
      game.hookLen += 980 * hookRate * dt;
      if (game.hookLen >= maxLen) {
        game.hookLen = maxLen;
        setState(S.REELING);
      } else checkCatch();
    } else if (game.state === S.REELING) {
      // The hook can also snag a tile on the way back — not just on the way out.
      checkCatch();
      if (game.state === S.REELING) {
        game.hookLen -= 820 * hookRate * dt;
        if (game.hookLen <= 0) {
          game.hookLen = 0;
          finishReel();
        }
      }
    }
    updateFish(dt);
  }
  draw(dt);
  requestAnimationFrame(gameLoop);
}

function spawnFish(count) {
  if (paused() || game.state === S.LOADING || game.state === S.WIN || game.state === S.DRAW_GAME) return;
  for (let i = 0; i < count && game.fish.length < MAX_FISH; i += 1) {
    const kind = chooseFishKind();
    const tile = takeTileForPlay(kind);
    const direction = Math.random() < 0.5 ? 1 : -1;
    const speed = (85 + Math.random() * 95) * difficulty();
    // A little per-tile variance means two fish never drift in lockstep.
    const speedFactor = 0.8 + Math.random() * 0.4;
    const minY = WATER_TOP + TILE_H / 2 + 30;
    const maxY = WATER_BOTTOM - TILE_H / 2 - 10;
    game.fish.push({
      id: tile.id,
      x: direction > 0 ? -TILE_W : view.width + TILE_W,
      y: minY + Math.random() * (maxY - minY),
      vx: speed * speedFactor * direction,
      vy: (Math.random() - 0.5) * 34 * speedFactor,
      w: TILE_W, h: TILE_H,
      rotation: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      memoryFlip: Math.random() < MEMORY_FLIP_CHANCE,
    });
  }
}

function updateFish(dt) {
  const minY = WATER_TOP + TILE_H / 2 + 16;
  const maxY = WATER_BOTTOM - TILE_H / 2 - 6;
  game.fish = game.fish.filter((f) => {
    f.age += dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y < minY || f.y > maxY) {
      f.y = Math.min(maxY, Math.max(minY, f.y));
      f.vy *= -1;
    }
    if (f.x < -TILE_W * 2 || f.x > view.width + TILE_W * 2) {
      game.wall.push(f.id); // 游走的魚把牌放回牌牆，保持 144 張
      return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */

function updateHUD() {
  ui.roundWind.textContent = TILE_INFO[game.roundWind].name;
  ui.seatWind.textContent = TILE_INFO[game.seatWind].name;
  ui.turnCount.textContent = String(game.turn);
  ui.fanCount.textContent = String(game.fanTotal);
  ui.bestFanCount.textContent = String(game.bestFan);
  updateTimer();
  renderFlowers();
  renderClaim();
  renderHand();
  renderMelds();
  renderTarget();
  // Flower panels or wrapped hands can change HUD height.
  resizeCanvas();
}

/** Five-second claim panel beside the rod: tile image, discarder and actions. */
function renderClaim() {
  if (!ui.claimBar) return;
  const active = Boolean(game.pendingClaim);
  ui.claimBar.hidden = !active;
  ui.claimActions.innerHTML = '';
  ui.claimBar.classList.toggle('actionable', active
    && game.claimActions.some((action) => action.primary !== false));
  if (!active) return;
  if (ui.claimTile) {
    ui.claimTile.innerHTML = '';
    addTileTo(ui.claimTile, game.pendingClaim.tile.id);
  }
  if (ui.claimWho) ui.claimWho.textContent = `${botLabel(game.pendingClaim.bot)}打出`;
  for (const action of game.claimActions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.primary === false) button.dataset.pass = 'true';
    button.addEventListener('click', action.onClick);
    ui.claimActions.appendChild(button);
  }
  updateClaimTimer();
  positionClaimBar();
}

/** Inline 胡牌／過 prompt on the left of the rod for a completed self-draw. */
function renderSelfWin() {
  if (!ui.selfWinBar) return;
  const pending = game.pendingSelfWin;
  ui.selfWinBar.hidden = !pending;
  ui.selfWinBar.classList.toggle('actionable', Boolean(pending));
  if (ui.selfWinTile) ui.selfWinTile.innerHTML = '';
  if (ui.selfWinActions) ui.selfWinActions.innerHTML = '';
  if (!pending) return;

  if (ui.selfWinTile && pending.result.winningTile) {
    addTileTo(ui.selfWinTile, pending.result.winningTile);
  }
  const actions = [
    { label: '胡牌', onClick: () => { clearSelfWin(); commitWin(pending.result); } },
  ];
  if (pending.kongTile) {
    actions.push({
      label: `開槓（${tileName(pending.kongTile)}）`,
      onClick: () => { clearSelfWin(); declareKong(pending.kongTile); },
    });
  }
  actions.push({
    label: '過',
    primary: false,
    onClick: () => {
      const decline = pending.onDecline;
      clearSelfWin();
      if (decline) decline();
      else setState(S.AWAIT_DISCARD);
    },
  });
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.primary === false) button.dataset.pass = 'true';
    button.addEventListener('click', action.onClick);
    ui.selfWinActions.appendChild(button);
  }
  positionSelfWinBar();
}

/** Anchor the self-win panel just above the waterline on the rod's left. */
function positionSelfWinBar() {
  if (!ui.selfWinBar || ui.selfWinBar.hidden) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.clientHeight / WORLD_H;
  const margin = 8;
  const seaTop = rect.top + WATER_TOP * scale;
  const left = rect.left + margin;
  const top = Math.max(rect.top + margin, Math.min(
    window.innerHeight - ui.selfWinBar.offsetHeight - margin,
    seaTop - ui.selfWinBar.offsetHeight - 12,
  ));
  ui.selfWinBar.style.left = `${left}px`;
  ui.selfWinBar.style.top = `${top}px`;
}

/** Anchor the claim panel just above the waterline so it never tracks the
 *  swinging rod or covers the tiles in the sea. */
function positionClaimBar() {
  if (!ui.claimBar || ui.claimBar.hidden) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.clientHeight / WORLD_H;
  const width = ui.claimBar.offsetWidth;
  const height = ui.claimBar.offsetHeight;
  const margin = 8;
  const left = Math.max(margin, rect.right - width - margin);
  const seaTop = rect.top + WATER_TOP * scale;
  const top = Math.max(rect.top + margin, Math.min(
    window.innerHeight - height - margin,
    seaTop - height - 12,
  ));
  ui.claimBar.style.left = `${left}px`;
  ui.claimBar.style.top = `${top}px`;
}

function updateClaimTimer(dt = 0) {
  if (!game.pendingClaim) return;
  game.claimTimeLeft = Math.max(0, game.claimTimeLeft - dt);
  if (ui.claimTimer) ui.claimTimer.textContent = `${game.claimTimeLeft.toFixed(1)} 秒`;
  if (ui.claimProgress) {
    ui.claimProgress.style.width = `${game.claimTimeLeft / CLAIM_SECONDS * 100}%`;
  }
  if (dt > 0 && game.claimTimeLeft <= 0) nextBotDiscard();
}

function renderFlowers() {
  if (!ui.flowers) return;
  ui.flowers.innerHTML = '';
  const hasFlowers = game.flowers.length > 0;
  ui.flowers.hidden = !hasFlowers;
  ui.flowers.classList.toggle('has-flowers', hasFlowers);
  if (!hasFlowers) return;
  const label = document.createElement('span');
  label.className = 'flowers-label';
  label.textContent = `花牌 ${game.flowers.length}/8`;
  ui.flowers.appendChild(label);
  for (const id of game.flowers) addTileTo(ui.flowers, id, 'flower-tile');
}

function updateTimer() {
  ui.timer.textContent = formatClock(game.timeLeft);
  ui.timer.classList.toggle('urgent', game.timeLeft <= 60);
}

/** Hover / focus / arrow-key selection: highlight one tile and preview its 聽牌. */
function selectDiscard(index) {
  if (game.state !== S.AWAIT_DISCARD || index < 0 || index >= game.hand.length) return;
  if (game.discardInfo.size === 0) analyzeDiscards();
  game.selectedDiscard = index;
  const uid = game.hand[index].uid;
  // Toggle classes in place so hovering never rebuilds the buttons under the cursor.
  for (const button of ui.hand.querySelectorAll('.tile-btn')) {
    button.classList.toggle('selected', Number(button.dataset.uid) === uid);
  }
  renderTarget();
}

function renderHand() {
  ui.hand.innerHTML = '';
  // Recompute only when entering a discard turn (setState clears the cache).
  // Hover / arrow-key selection then re-renders without re-running 476 evaluations.
  if (game.state === S.AWAIT_DISCARD && game.discardInfo.size === 0) analyzeDiscards();
  for (let i = 0; i < game.hand.length; i += 1) {
    const tile = game.hand[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile-btn';
    button.dataset.uid = String(tile.uid);
    button.setAttribute('aria-label', `打出 ${tileName(tile.id)}`);
    if (game.state === S.AWAIT_DISCARD && game.discardInfo.get(tile.uid)?.good) {
      button.classList.add('keep-tenpai');
    }
    if (i === game.selectedDiscard && game.state === S.AWAIT_DISCARD) button.classList.add('selected');
    button.disabled = game.state !== S.AWAIT_DISCARD;
    button.appendChild(createTileElement(tile.id, { images: game.images }));
    button.addEventListener('click', () => discard(tile.uid));
    button.addEventListener('mouseenter', () => selectDiscard(i));
    button.addEventListener('focus', () => selectDiscard(i));
    ui.hand.appendChild(button);
  }
}

function meldLabel(meld) {
  if (meld.type === 'pung') return '碰';
  if (meld.type === 'chow') return '上';
  return meld.open ? '明槓' : '暗槓';
}

function isConcealedKong(meld) {
  return meld.type === 'kong' && !meld.open;
}

function renderMelds() {
  ui.exposedKongs.innerHTML = '';
  let currentLabel = null;
  for (const meld of game.melds) {
    const labelText = meldLabel(meld);
    if (labelText !== currentLabel) {
      const label = document.createElement('span');
      label.className = 'flowers-label';
      label.textContent = labelText;
      ui.exposedKongs.appendChild(label);
      currentLabel = labelText;
    }
    const concealed = isConcealedKong(meld);
    const set = document.createElement('div');
    set.className = 'kong-set';
    meld.tiles.forEach((id, index) => {
      set.appendChild(createTileElement(id, {
        images: game.images,
        faceDown: concealed && (index === 0 || index === 3),
      }));
    });
    ui.exposedKongs.appendChild(set);
  }
}

function analyzeDiscards() {
  game.discardInfo = new Map();
  const availability = countTiles([...game.wall, ...game.fish.map((f) => f.id)]);
  for (const tile of game.hand) {
    const after = game.hand.filter((t) => t.uid !== tile.uid).map((t) => t.id);
    const waits = findWaits(after, game.melds, winContext(), availability);
    game.discardInfo.set(tile.uid, {
      good: waits.length > 0,
      waits: waits.map((id) => ({ id })),
    });
  }
}

function addTileTo(target, id, className = '', faceDown = false) {
  target.appendChild(createTileElement(id, { images: game.images, className, faceDown }));
}

function appendHintText(text) {
  ui.target.appendChild(Object.assign(document.createElement('span'), { textContent: text }));
}

function renderTarget() {
  ui.target.innerHTML = '';
  const availability = countTiles([...game.wall, ...game.fish.map((f) => f.id)]);

  if (game.state === S.AWAIT_DISCARD) {
    const tile = game.hand[game.selectedDiscard];
    if (!tile) { ui.target.textContent = '暫無聽牌'; return; }
    appendHintText('打出 ');
    addTileTo(ui.target, tile.id);
    const info = game.discardInfo.get(tile.uid);
    if (info?.waits.length) {
      appendHintText(' → 聽 ');
      info.waits.forEach((wait, index) => {
        if (index) appendHintText('、');
        addTileTo(ui.target, wait.id);
      });
    } else {
      appendHintText(' → 暫無聽牌');
    }
    return;
  }

  const waits = findWaits(concealedIds(), game.melds, winContext(), availability);
  if (!waits.length) return; // No need to clutter the middle of the screen.
  ui.target.appendChild(Object.assign(document.createElement('span'), {
    textContent: '胡牌聽牌：',
  }));
  for (const id of waits) {
    const span = document.createElement('span');
    span.className = 'wait-note';
    addTileTo(span, id);
    ui.target.appendChild(span);
  }
}

/* ------------------------------------------------------------------ *
 * Modals and settings
 * ------------------------------------------------------------------ */

function showOverlay({ title, message, tiles = [], actions = [] }) {
  ui.overlay.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'modal-card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);
  const body = document.createElement('div');
  body.className = 'breakdown';
  body.textContent = message;
  card.appendChild(body);
  if (tiles.length) {
    const row = document.createElement('div');
    row.className = 'win-tiles';
    for (const tile of tiles) addTileTo(row, tile.id, tile.faceDown ? 'face-down' : '', tile.faceDown);
    card.appendChild(row);
  }
  const row = document.createElement('div');
  row.className = 'button-row';
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.primary === false) button.style.background = '#456';
    button.addEventListener('click', () => {
      ui.overlay.classList.remove('show');
      action.onClick();
    });
    row.appendChild(button);
  }
  card.appendChild(row);
  ui.overlay.appendChild(card);
  ui.overlay.classList.add('show');
}

function openModal(id) { el(id)?.classList.add('show'); }
function closeModal(id) { el(id)?.classList.remove('show'); }
function closeTopModal() {
  const open = [...document.querySelectorAll('.modal.show')].filter((m) => m !== ui.loading);
  if (open.length) closeModal(open[open.length - 1].id);
}

function buildPatternTable() {
  ui.patternsBody.innerHTML = '';
  const rows = [...PATTERN_ROWS, ...FLOWER_PATTERN_TABLE].sort((a, b) => a.fan - b.fan);
  for (const pattern of rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = pattern.id;
    const desc = document.createElement('td');
    desc.textContent = pattern.desc;
    const fan = document.createElement('td');
    fan.textContent = `${pattern.fan} 番`;
    const example = document.createElement('td');
    const row = document.createElement('div');
    row.className = 'example-tiles';
    for (const meld of pattern.example.melds ?? []) {
      const concealed = isConcealedKong(meld);
      meld.tiles.forEach((id, index) => addTileTo(row, id, '', concealed && (index === 0 || index === 3)));
    }
    for (const id of pattern.example.flowers ?? pattern.example.concealed ?? []) {
      addTileTo(row, id);
    }
    example.appendChild(row);
    tr.append(name, desc, fan, example);
    ui.patternsBody.appendChild(tr);
  }
}

const PATTERN_ROWS = PATTERN_TABLE;

function updateSettingsUI() {
  ui.gameDuration.value = String(game.settings.gameSeconds);
  ui.gameDurationValue.textContent = formatClock(game.settings.gameSeconds);
  ui.gameDurationText.value = formatClock(game.settings.gameSeconds);
  ui.settingsSound.checked = game.settings.sound;
  ui.musicVolume.value = String(Math.round(game.settings.musicVolume * 100));
  ui.musicVolumeValue.textContent = `${Math.round(game.settings.musicVolume * 100)}%`;
  ui.hookSpeed.value = String(game.hookSpeed);
  ui.hookSpeedValue.textContent = `${game.hookSpeed.toFixed(1)}×`;
}

function setSoundEnabled(value) {
  game.settings.sound = Boolean(value);
  music.setEnabled(game.settings.sound);
  if (game.settings.sound) music.start();
  save('mf-sound', game.settings.sound);
  updateSettingsUI();
}

function unlockMusic() {
  if (game.settings.sound) music.start();
}

function setMusicVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return;
  game.settings.musicVolume = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
  music.setVolume(game.settings.musicVolume);
  ui.musicVolume.value = String(Math.round(game.settings.musicVolume * 100));
  ui.musicVolumeValue.textContent = `${Math.round(game.settings.musicVolume * 100)}%`;
  save('mf-volume', game.settings.musicVolume);
}

function setHookSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return;
  game.hookSpeed = Math.min(2, Math.max(0.5, Math.round(speed * 10) / 10));
  ui.hookSpeed.value = String(game.hookSpeed);
  ui.hookSpeedValue.textContent = `${game.hookSpeed.toFixed(1)}×`;
  save('mf-hookspeed', game.hookSpeed);
}

function setGameSeconds(value) {
  const seconds = clampGameSeconds(value);
  game.settings.gameSeconds = seconds;
  ui.gameDuration.value = String(seconds);
  ui.gameDurationValue.textContent = formatClock(seconds);
  ui.gameDurationText.value = formatClock(seconds);
  save('mf-gameseconds', seconds);
  game.timeLeft = seconds;
  updateHUD();
}

function applySettings() {
  setGameSeconds(ui.gameDuration.value);
  setMusicVolume(Number(ui.musicVolume.value) / 100);
  setSoundEnabled(el('settingsSound').checked);
  updateHUD();
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

function wireInput() {
  // Browsers require a user gesture before audio can play.
  document.addEventListener('pointerdown', unlockMusic);
  document.addEventListener('keydown', unlockMusic);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.suspend();
    else if (game.settings.sound) music.resume();
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startCast();
  });
  el('restartBtn').addEventListener('click', () => { closeTopModal(); restartGame(); });
  el('helpBtn').addEventListener('click', () => openModal('helpPanel'));
  el('settingsBtn').addEventListener('click', () => openModal('settingsPanel'));
  el('creditsBtn').addEventListener('click', () => openModal('creditsPanel'));
  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  }
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal && modal.id !== 'overlay' && modal.id !== 'loading') {
        closeModal(modal.id);
      }
    });
  }
  ui.hookSpeed.addEventListener('input', (event) => setHookSpeed(event.target.value));
  ui.musicVolume.addEventListener('input', (event) => setMusicVolume(Number(event.target.value) / 100));
  for (const id of ['gameDuration', 'settingsSound']) {
    el(id).addEventListener('change', applySettings);
  }
  ui.gameDurationText.addEventListener('change', commitDurationText);
  ui.gameDurationText.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitDurationText();
    ui.gameDurationText.blur();
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      startCast();
      return;
    }
    if (event.key === 'Escape') { closeTopModal(); return; }
    if (game.state !== S.AWAIT_DISCARD || paused()) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      selectDiscard((game.selectedDiscard + delta + game.hand.length) % game.hand.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const tile = game.hand[game.selectedDiscard];
      if (tile) discard(tile.uid);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function loadBackground() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'assets/bg/underwater.jpg';
  });
}

async function boot() {
  music.setVolume(game.settings.musicVolume);
  music.setEnabled(game.settings.sound);
  wireInput();
  updateSettingsUI();
  const [loaded, bg] = await Promise.all([
    loadImages([...TILE_IDS, ...FLOWER_IDS], (done, total) => {
      ui.loadingProgress.textContent = `${done}/${total}`;
    }),
    loadBackground(),
  ]);
  game.images = loaded.images;
  game.bg = bg;
  if (loaded.failed.length) console.warn('牌面圖片載入失敗，將顯示文字替代：', loaded.failed);
  buildPatternTable();
  resizeCanvas();
  ui.loading.classList.remove('show');
  startGame();
  requestAnimationFrame(gameLoop);
}

/* Optional, query-string-only hook for automated/manual state-machine tests.
   Normal play never exposes internal state. */
if (new URLSearchParams(location.search).has('test')) {
  window.__mf = {
    game, S,
    handFrom: (ids) => ids.map((id) => ({ id, uid: game.nextUid++ })),
    setState, resolveDraw, declareKong, commitWin, endDrawGame, startGame,
    renderHand, renderTarget, updateHUD, findKongTile, hookPosition, music,
    paceFactor, GAME_SECONDS, MIN_GAME_SECONDS, MAX_GAME_SECONDS, setGameSeconds, formatClock, parseClock,
    HAIDI_SECONDS, winContext, openingWinContext, checkCatch, getAssistTiles, analyzeDiscards, selectDiscard,
    finishReel, renderFlowers, checkInitialSelfDraw,
    MEMORY_FLIP_CHANCE, MEMORY_FLIP_DELAY, MEMORY_FLIP_DURATION, CLAIM_SECONDS, fishFaceDown,
    discard, nextBotDiscard, passClaim, buildClaimActions, chooseOpponentDiscardKind,
    previousWind, canChowFrom, botLabel, positionClaimBar,
    chowCombinations, claimWinResult, declareOpenMeld, renderMelds, renderClaim,
    renderSelfWin, clearSelfWin, positionSelfWinBar, setMusicVolume,
    updateClaimTimer, maxHookLength, swingLimit, spawnFish,
  };
}

boot();
