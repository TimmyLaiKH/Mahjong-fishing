/*
 * Game state machine, shared fish sea, canvas rendering and input for Mahjong-fishing.
 * All gameplay happens in one logical world (height 1080; width follows the
 * viewport aspect ratio), so mouse, touch and canvas coordinates agree.
 */
import {
  TILE_IDS, TILE_INFO, FLOWER_IDS, isFlower, loadImages, drawTile,
  createTileElement, tileName,
} from './tiles.js';
import { createMusic } from './audio.js';
import { createNet, randomPlayerId } from './net.js';
import { settleRound } from './payout.js';
import {
  WINDS, PATTERN_TABLE, FLOWER_PATTERN_TABLE, countTiles, randomTileKind,
  evaluateHand, findWaits, formatWinBreakdown,
  withFlowers, flowerWin, flowerWinResult,
} from './rules.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const el = (id) => document.getElementById(id);
const ui = {
  loading: el('loading'), loadingProgress: el('loadingProgress'),
  hud: el('hud'), status: el('status'), toast: el('toast'), hand: el('hand'), target: el('target'),
  tilesMeta: el('tilesMeta'), flowers: el('flowers'),
  claimBar: el('claimBar'), claimWho: el('claimWho'), claimTile: el('claimTile'),
  claimTimer: el('claimTimer'), claimActions: el('claimActions'),
  claimProgress: el('claimProgress'),
  selfWinBar: el('selfWinBar'), selfWinLabel: el('selfWinLabel'),
  selfWinTile: el('selfWinTile'), selfWinActions: el('selfWinActions'),
  roundWind: el('roundWind'), seatWind: el('seatWind'),
  scoreBtn: el('scoreBtn'), moneyCount: el('moneyCount'),
  scorePanel: el('scorePanel'), scoreRoundInfo: el('scoreRoundInfo'),
  scoreStandings: el('scoreStandings'), scoreHistory: el('scoreHistory'),
  timer: el('timer'), turnCount: el('turnCount'),
  fanCount: el('fanCount'), bestFanCount: el('bestFanCount'),
  exposedKongs: el('exposedKongs'),
  overlay: el('overlay'), patternsBody: el('patternsBody'),
  claimBoxes: el('claimBoxes'),
  meldPanel: el('meldPanel'), meldRows: el('meldRows'),
  menu: el('menuScreen'), menuStart: el('menuStart'), menuTiles: el('menuTiles'),
  menuRecord: el('menuRecord'), menuHost: el('menuHost'), menuJoin: el('menuJoin'),
  menuPlayerName: el('menuPlayerName'),
  join: el('joinScreen'), joinRoomCode: el('joinRoomCode'), joinMessage: el('joinMessage'),
  joinSubmit: el('joinSubmit'), joinBack: el('joinBack'),
  room: el('roomScreen'), roomTitle: el('roomTitle'), roomWaitHint: el('roomWaitHint'),
  roomShareBlock: el('roomShareBlock'), roomCode: el('roomCode'), roomLink: el('roomLink'),
  roomPlayerName: el('roomPlayerName'), settingsPlayerName: el('settingsPlayerName'),
  roomCopy: el('roomCopy'), roomPlayers: el('roomPlayers'), roomAvatars: el('roomAvatars'),
  roomHostControls: el('roomHostControls'), roomGuestInfo: el('roomGuestInfo'),
  roomHookSpeed: el('roomHookSpeed'), roomHookSpeedValue: el('roomHookSpeedValue'),
  roomGameDuration: el('roomGameDuration'), roomGameDurationValue: el('roomGameDurationValue'),
  roomGameDurationText: el('roomGameDurationText'),
  roomStartingMoney: el('roomStartingMoney'), roomStartingMoneyText: el('roomStartingMoneyText'),
  roomStartingMoneyValue: el('roomStartingMoneyValue'),
  roomWinds: el('roomWinds'), roomBase: el('roomBase'), roomBaseText: el('roomBaseText'),
  roomBaseValue: el('roomBaseValue'),
  roomStart: el('roomStart'), roomLeave: el('roomLeave'), roomMessage: el('roomMessage'),
  settingsSound: el('settingsSound'),
  musicVolume: el('musicVolume'), musicVolumeValue: el('musicVolumeValue'),
  gameDuration: el('gameDuration'), gameDurationValue: el('gameDurationValue'),
  gameDurationText: el('gameDurationText'),
  hookSpeed: el('hookSpeed'), hookSpeedValue: el('hookSpeedValue'),
  matchStartingMoney: el('matchStartingMoney'), matchStartingMoneyText: el('matchStartingMoneyText'),
  matchStartingMoneyValue: el('matchStartingMoneyValue'),
  matchWinds: el('matchWinds'), matchBase: el('matchBase'), matchBaseText: el('matchBaseText'),
  matchBaseValue: el('matchBaseValue'),
};

const music = createMusic();
const net = createNet();
const MULTI_CLAIM_SECONDS = 5;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AVATAR_COLORS = ['#a9e5ff', '#ffd27f', '#c8a9ff', '#ff9b9b'];
// Full-body icons: neutral player, male 允行, female 一心, female 念慈.
const AVATAR_ICONS = ['🧍', '🧍‍♂️', '🧍‍♀️', '💃'];
// Codes that failed to produce a live host this session. PeerJS can leave a
// stale id registered for a while after the host leaves, so never retry them.
const deadRooms = new Set();

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
const DEFAULT_PLAYER_NAME = '幼羚';
const GAME_SECONDS = 300;
const MIN_GAME_SECONDS = 30;
const MAX_GAME_SECONDS = 1800;
/** 海底撈月: any tile won within the final 5 seconds; 自摸 is still scored separately. */
const HAIDI_SECONDS = 5;
/** Match scoring: one shared amount multiplier, a wind limit and a starting purse per seat. */
const MIN_STARTING_MONEY = 1;
const MAX_STARTING_MONEY = 100000000;
const DEFAULT_STARTING_MONEY = 20;
const MIN_WINDS = 1;
const MAX_WINDS = 4;
const DEFAULT_WINDS = 1;
const MIN_BASE = 1;
const MAX_BASE = 100;
const DEFAULT_BASE = 1;
/** The host owns the shared sea and sends compact snapshots ten times a second. */
const SEA_BROADCAST_INTERVAL = 0.1;
const HOOK_BROADCAST_INTERVAL = 0.1;
/** AI claims wait briefly so a nearby human press still wins the tile. */
const AI_CLAIM_DELAY_MIN = 0.25;
const AI_CLAIM_DELAY_RANGE = 0.6;

const view = { scale: 1, width: REFERENCE_W, dpr: 1 };
const game = {
  state: S.LOADING,
  images: {},
  bg: null,
  hand: [],                 // [{ uid, id }] — uid keeps discard clicks stable
  flowers: [],              // flower tile ids, kept outside the hand (補花)
  melds: [], river: [], fish: [],
  fishSeq: 0,               // shared-sea fish ids stay unique even with duplicate kinds
  seaClock: 0, hookClock: 0,
  pendingCatch: null,       // fish id requested by this seat, awaiting host ruling
  seatFlowers: {},          // seat -> public flower ids, used by the 副露 panel
  aiStates: {},             // host/solo only: seat -> full simulated player state
  hookPeers: {},            // seat -> latest ghost hook state received over the network
  pendingAiClaims: [],      // host/solo only: delayed AI claims on a discard
  bots: [], botIndex: -1,
  nextUid: 1,
  roundWind: 'E', seatWind: 'S',
  turn: 1, timeLeft: GAME_SECONDS,
  timeDeadline: 0,          // host: wall-clock end time, so hidden tabs still count down
  timeBase: GAME_SECONDS,   // guest: most recent host-approved remaining time
  timeSyncAt: 0,            // guest: Date.now() when timeBase was received
  clockOffset: 0,           // guest: host clock minus local clock, for claim deadlines
  leavingRoom: false,       // ignore hostClose while we are the one leaving
  joinOutcome: null,        // pending | joined | full | closed
  joinTimer: null,
  toastTimer: null,
  // Fan records stay local; match money is a per-game setting chosen by the
  // host (no new localStorage keys are introduced).
  fanTotal: readNumber('mf-fantotal'), bestFan: readNumber('mf-bestfan'),
  matchSetup: {
    startingMoney: DEFAULT_STARTING_MONEY, winds: DEFAULT_WINDS, base: DEFAULT_BASE,
  },
  match: null,              // created by resetMatch(); authoritative on the host
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
  // Multiplayer (PeerJS room). Devices keep private hands; the host owns the
  // shared fish sea and arbitrates catches/claims.
  mode: 'solo',             // 'solo' | 'multi'
  role: 'none',             // 'host' | 'guest'
  seat: 0,                  // 0 = room host, 1–3 = guests / AI fill-ins
  playerName: DEFAULT_PLAYER_NAME,
  playerCustomName: false,
  playerId: null,
  roomCode: null,
  players: [],              // [{ seat, name, wind, isBot, playerId }]
  roomSettings: {
    hookSpeed: 1, gameSeconds: GAME_SECONDS,
    startingMoney: DEFAULT_STARTING_MONEY, winds: DEFAULT_WINDS, base: DEFAULT_BASE,
  },
  claimBoxes: [],           // multiplayer claim slots (one per recent discard)
  claimedKeys: new Set(),   // solo: one AI claim per played tile
  seatMelds: {},            // seat -> meld[], used by the 副露 panel
  mustDiscard: false,       // after 碰／上／明槓, block further claims until discard
  grabPending: false,       // from casting until the grabbed tile is discarded
  pendingMultiStart: null,
  rematchVotes: [],         // seats that agreed to another round
  rematchRequired: [],      // human seats that must agree
  rematchMessage: '',
  restartActive: false,     // mid-game restart vote opened by any human seat
  restartVotes: [],
  restartRequired: [],
  restartRequester: null,
  restartMessage: '',
};

game.roomSettings = {
  hookSpeed: game.hookSpeed, gameSeconds: game.settings.gameSeconds,
  ...game.matchSetup,
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

/* ------------------------------------------------------------------ *
 * Match scoring (money, winds, dealer continuity)
 * ------------------------------------------------------------------ */

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeMatchSetup(source = {}) {
  return {
    startingMoney: clampInt(source.startingMoney, MIN_STARTING_MONEY, MAX_STARTING_MONEY, DEFAULT_STARTING_MONEY),
    winds: clampInt(source.winds, MIN_WINDS, MAX_WINDS, DEFAULT_WINDS),
    base: clampInt(source.base, MIN_BASE, MAX_BASE, DEFAULT_BASE),
  };
}

function formatMoney(value) {
  return Math.round(Number(value) || 0).toLocaleString('zh-Hant');
}

function resetMatch(setup = game.matchSetup, dealerSeat = null) {
  const settings = normalizeMatchSetup(setup);
  game.matchSetup = settings;
  const money = Array.from({ length: 4 }, () => settings.startingMoney);
  game.match = {
    ...settings,
    money,
    dealerSeat: dealerSeat === null
      ? Math.floor(Math.random() * 4)
      : clampInt(dealerSeat, 0, 3, 0),
    repeatCount: 0,
    handNumber: 0,
    history: [],
    lastPayout: null,
    over: false,
    winner: null,
    active: false,
  };
  updateScoreUI();
  return game.match;
}

/** Plain copy for network messages (no prototypes, no local UI references). */
function cloneMatch(match = game.match) {
  if (!match) return null;
  return {
    startingMoney: match.startingMoney, winds: match.winds, base: match.base,
    money: [...match.money], dealerSeat: match.dealerSeat,
    repeatCount: match.repeatCount, handNumber: match.handNumber,
    history: match.history.map((entry) => ({ ...entry })),
    lastPayout: match.lastPayout ? { ...match.lastPayout } : null,
    over: match.over, winner: match.winner === undefined ? null : [...(match.winner ?? [])],
    active: Boolean(match.active),
  };
}

function adoptMatch(data) {
  if (!data || !Array.isArray(data.money) || data.money.length !== 4) return;
  game.matchSetup = normalizeMatchSetup(data);
  game.match = {
    ...game.matchSetup,
    money: data.money.map((value) => Math.round(Number(value) || 0)),
    dealerSeat: clampInt(data.dealerSeat, 0, 3, 0),
    repeatCount: clampInt(data.repeatCount, 0, 999, 0),
    handNumber: clampInt(data.handNumber, 0, 999, 0),
    history: Array.isArray(data.history) ? data.history.map((entry) => ({ ...entry })) : [],
    lastPayout: data.lastPayout ? { ...data.lastPayout } : null,
    over: Boolean(data.over),
    winner: Array.isArray(data.winner) ? [...data.winner] : null,
    active: Boolean(data.active),
  };
  updateScoreUI();
}

function windIndexFor(match = game.match) {
  return Math.min(MAX_WINDS - 1, Math.floor((match?.handNumber ?? 0) / 4));
}

/** Seat 0's wind such that the dealer carries the current round wind. */
function seatZeroWind(match = game.match) {
  return WINDS[(windIndexFor(match) - (match?.dealerSeat ?? 0) + WINDS.length) % WINDS.length];
}

/** Apply a host-chosen setup, keeping the dealer steady while in the lobby. */
function applyMatchSetup(setup) {
  const normalized = normalizeMatchSetup(setup);
  game.matchSetup = normalized;
  if (game.match && game.match.handNumber === 0 && !game.match.history.length) {
    resetMatch(normalized, game.match.dealerSeat);
  }
}

function bestSeats(money) {
  const best = Math.max(...money);
  return money.map((value, seat) => (value === best ? seat : -1)).filter((seat) => seat >= 0);
}

function scoreSeatName(seat) {
  const player = game.players.find((item) => item.seat === seat);
  return withAiTag(seatName(seat), Boolean(player?.isBot));
}

/** Three bots sit after the player in wind order; the last one is 上家. */
function createBots() {
  const start = WINDS.indexOf(game.seatWind);
  return BOT_NAMES.map((name, offset) => ({
    name,
    wind: WINDS[(start + offset + 1) % WINDS.length],
    isBot: true,
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
  return `${withAiTag(bot.name, bot.isBot)}（${role}${TILE_INFO[bot.wind].name}）`;
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
  return seatWinContext(game.seat, { opening: true });
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
}

/** Small transient notice for room events such as a player leaving. */
function showToast(text, ms = 4500) {
  if (!ui.toast) return;
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  if (game.toastTimer) clearTimeout(game.toastTimer);
  game.toastTimer = setTimeout(() => {
    ui.toast.classList.remove('show');
    game.toastTimer = null;
  }, ms);
}

function clearNotices() {
  if (game.toastTimer) clearTimeout(game.toastTimer);
  game.toastTimer = null;
  if (ui.toast) ui.toast.classList.remove('show');
  setStatus('');
}

/* ------------------------------------------------------------------ *
 * Endless weighted pool and opening deals
 * ------------------------------------------------------------------ */

function newTile(id) {
  return { id, uid: game.nextUid++ };
}

function randomTile() {
  return newTile(randomTileKind());
}

/** Every seat gets its own private hand from the same 4:1 weighted pool. */
function dealTiles(count = 13) {
  const hand = [];
  const flowers = [];
  while (hand.length < count) {
    const id = randomTileKind();
    if (isFlower(id)) flowers.push(id);
    else hand.push(newTile(id));
  }
  hand.sort((a, b) => TILE_IDS.indexOf(a.id) - TILE_IDS.indexOf(b.id));
  return { hand, flowers };
}

function seatWindOf(seat) {
  if (seat === game.seat) return game.seatWind;
  return game.players.find((player) => player?.seat === seat)?.wind
    ?? WINDS[(WINDS.indexOf(game.roundWind ?? 'E') + seat) % WINDS.length];
}

function seatWinContext(seat, { opening = false, ...extra } = {}) {
  const seatWind = seatWindOf(seat);
  const dealer = seatWind === game.roundWind;
  const context = {
    selfDraw: true,
    kongReplacementChain: 0,
    haidi: game.timeLeft <= HAIDI_SECONDS,
    roundWind: game.roundWind,
    seatWind,
    fanCap: game.settings.fanCap,
    declinedFlowerWin: seat === game.seat ? game.declinedFlowerWin : false,
  };
  if (opening) {
    context.haidi = false;
    context.tiangu = dealer;
    context.dihu = !dealer;
  }
  return { ...context, ...extra };
}

/** Public flower display is shared; concealed hands are never sent. */
function syncSeatFlowers(seat, flowers = null) {
  const source = flowers ?? (seat === game.seat ? game.flowers : game.aiStates[seat]?.flowers ?? []);
  game.seatFlowers[seat] = [...source];
  broadcastFlowers(seat);
  renderMeldsPanel();
}

function broadcastFlowers(seat) {
  if (game.mode !== 'multi') return;
  const msg = { t: 'flowers', seat, flowers: [...(game.seatFlowers[seat] ?? [])] };
  if (net.isHost) net.broadcast(msg);
  else if (seat === game.seat) net.sendToHost(msg);
}

/** Return true when the opening self-draw ended the round (天胡／地胡 or 花糊). */
function checkInitialSelfDraw() {
  const flowers = [];
  let tile = randomTileKind();
  while (isFlower(tile)) {
    flowers.push(tile);
    tile = randomTileKind();
  }
  const allFlowers = [...game.flowers, ...flowers];
  const context = seatWinContext(game.seat, { opening: true });
  const flowerResult = flowerWinResult(
    allFlowers, game.seatWind, game.settings.fanCap, context,
  );
  // A declined 花糊 can only be upgraded to 大花糊, never re-offered here.
  if (flowerResult && (!game.declinedFlowerWin
    || flowerResult.patterns.some((p) => p.id === '大花糊'))) {
    game.flowers = [...allFlowers];
    syncSeatFlowers(game.seat);
    sortHand();
    updateHUD();
    commitWin(flowerResult);
    return true;
  }

  const tiangu = withFlowers(evaluateHand({
    concealed: [...concealedIds(), tile],
    melds: game.melds,
    winningTile: tile,
    context,
  }), allFlowers, game.seatWind, game.settings.fanCap, context);
  if (!tiangu.isWin) return false;

  game.flowers = [...allFlowers];
  const drawn = { id: tile, uid: game.nextUid++, source: 'tiangu' };
  game.hand.push(drawn);
  game.lastDraw = drawn;
  sortHand();
  syncSeatFlowers(game.seat);
  updateHUD();
  commitWin(tiangu);
  return true;
}

function startGame({ keepTurn = false, preset = null } = {}) {
  // A fresh hand spawns a fresh sea. Any in-flight host pause belongs to the
  // old round — never apply its elapsed time to brand-new fish.
  hostSeaPausedAt = 0;
  const nextTurn = keepTurn ? game.turn : 1;
  // Uids must be allocated before dealing so AI hands and discards never reuse
  // a human tile's uid (claim ids and click handlers depend on uniqueness).
  game.nextUid = 1;
  const dealt = dealTiles(13);
  game.hand = dealt.hand;
  game.flowers = dealt.flowers;
  game.melds = [];
  game.river = [];
  // Fish x/vx are normalised to 0..1 of the logical sea width, never pixels.
  // Resizing a window (or restoring a hidden tab) therefore cannot shift the
  // shared sea: every device maps the same coordinates onto its own canvas.
  game.fish = [];
  game.fishSeq = 0;
  game.seaClock = 0;
  game.hookClock = 0;
  game.pendingCatch = null;
  game.hookPeers = {};
  game.pendingAiClaims = [];
  game.turn = nextTurn;
  game.timeLeft = game.settings.gameSeconds;
  game.timeDeadline = Date.now() + game.settings.gameSeconds * 1000;
  game.timeBase = game.settings.gameSeconds;
  game.timeSyncAt = Date.now();
  game.restartActive = false;
  game.restartVotes = [];
  game.restartRequired = [];
  game.restartRequester = null;
  game.restartMessage = '';
  game.kongChain = 0;
  game.lastDraw = null;
  game.hookLen = 0;
  game.spawnTimer = 0;
  game.pendingResult = null;
  game.declinedFlowerWin = false;
  game.claimBoxes = [];
  game.claimedKeys = new Set();
  game.seatMelds = {};
  game.seatFlowers = {};
  game.aiStates = {};
  game.mustDiscard = false;
  game.grabPending = false;
  clearClaim();
  clearSelfWin();
  // Winds follow the match's dealer: the dealer holds the round wind, and 連莊
  // keeps both the dealer and the wind unchanged for the next hand.
  if (!game.match) resetMatch();
  game.match.active = true;
  updateSettingsUI();
  const roundWind = WINDS[windIndexFor(game.match)];
  const seatZeroWindName = seatZeroWind(game.match);
  game.roundWind = roundWind;
  game.seatWind = WINDS[(WINDS.indexOf(seatZeroWindName) + game.seat) % WINDS.length];
  if (preset) {
    game.players = preset.players.map((player) => ({
      ...player,
      wind: WINDS[(WINDS.indexOf(seatZeroWindName) + player.seat) % WINDS.length],
    }));
  } else {
    game.players = [
      { seat: 0, name: game.playerName, wind: seatZeroWindName, isBot: false, playerId: game.playerId },
      ...createBots().map((bot, index) => ({
        seat: index + 1, name: bot.name, wind: bot.wind, isBot: true, playerId: null,
      })),
    ];
  }
  game.bots = game.players
    .filter((player) => player && !player.isEmpty && player.seat !== game.seat)
    .map((player) => ({ name: player.name, wind: player.wind, isBot: true }));
  game.botIndex = -1;
  // AI seats are full simulated players on the host (and in single-player).
  // Guests only receive their public actions and ghost hook positions.
  if (game.mode !== 'multi' || net.isHost) {
    for (const player of game.players) {
      if (player?.isBot && !player.isEmpty) game.aiStates[player.seat] = createAiState(player.seat);
    }
  }
  syncSeatFlowers(game.seat, game.flowers);
  for (const seat of Object.keys(game.aiStates)) {
    syncSeatFlowers(Number(seat), game.aiStates[seat].flowers);
  }
  let openingFlowerWin = null;
  if (game.flowers.length) {
    openingFlowerWin = flowerWinResult(
      game.flowers, game.seatWind, game.settings.fanCap, openingWinContext(),
    );
  }
  sortHand();
  updateHUD();
  let awaitingFlowerDecision = false;
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
    awaitingFlowerDecision = true;
  }
  if (!awaitingFlowerDecision && checkInitialSelfDraw()) return;
  // AI seats also get opening flower / self-draw wins. A host broadcasts the
  // result so every device ends the round together.
  if (checkAiOpeningWins()) return;
  if (awaitingFlowerDecision) return;
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
    // Inline on the left of the rod, just like the self-win prompt.
    offerSelfWin(null, kongTile, () => setState(S.AWAIT_CAST));
  } else {
    setState(S.AWAIT_CAST);
  }
  if (game.mode === 'multi') setMultiUIVisibility(true);
  else {
    renderClaimBoxes();
    renderMeldsPanel();
  }
}

/** Restarting a hand keeps the 巡 counter and its difficulty pace. */
function restartGame() {
  // A finished match starts from a fresh purse; an unfinished one continues
  // with the same dealer, money and wind.
  if (game.match?.over && (game.mode !== 'multi' || net.isHost)) {
    resetMatch(game.matchSetup);
  }
  if (game.mode === 'multi') {
    if (net.isHost) startMultiGame();
    else setStatus('請等待房主重新開始。');
    return;
  }
  startGame({ keepTurn: true });
}

function sortHand() {
  game.hand.sort((a, b) => TILE_IDS.indexOf(a.id) - TILE_IDS.indexOf(b.id));
}

function findKongTile() {
  const counts = countTiles(concealedIds());
  return Object.keys(counts).find((id) => counts[id] >= 4) ?? null;
}

function startCast() {
  if (game.state !== S.AWAIT_CAST || paused()) return;
  game.hookLen = 0;
  // Lock claims from the moment the hook drops: a grabbed tile must be
  // discarded before 碰／上／明槓, even while it is still on the line.
  game.grabPending = true;
  setState(S.CASTING);
  if (game.mode === 'multi') renderClaimBoxes();
}

function fishAuthority() {
  return game.mode !== 'multi' || net.isHost;
}

/** A contested catch is sent to the host; only the host removes the fish. */
function requestCatch(fish) {
  if (game.pendingCatch || game.lastDraw) return;
  if (game.mode === 'multi' && !net.isHost) {
    game.pendingCatch = fish.id;
    net.sendToHost({ t: 'catch', fishId: fish.id, seat: game.seat });
    setStatus('鉤到牌了，等待房主裁定…');
    return;
  }
  handleCatchRequest({ fishId: fish.id, seat: game.seat });
}

function handleCatchRequest(msg, rejectIfMissing = false) {
  if (!fishAuthority()) return false;
  const index = game.fish.findIndex((fish) => fish.id === msg.fishId);
  if (index === -1) {
    // The guest's sea snapshot can be slightly behind the host's. Tell the
    // requesting seat so its hook does not wait forever for a ruling.
    if (rejectIfMissing && net.isHost) {
      const player = game.players.find((item) => item?.seat === msg.seat);
      if (player?.playerId) net.sendToPeer(player.playerId, { t: 'catchRejected', fishId: msg.fishId });
    }
    return false;
  }
  const [fish] = game.fish.splice(index, 1);
  const result = { t: 'fishCaught', fishId: fish.id, seat: msg.seat, tileId: fish.tileId };
  if (game.mode === 'multi') net.broadcast(result);
  applyFishCaught(result, fish);
  return true;
}

function applyFishCaught(msg, caughtFish = null) {
  // Guests trust the host's fish list; the host has already removed this fish.
  if (!caughtFish && !net.isHost) {
    game.fish = game.fish.filter((fish) => fish.id !== msg.fishId);
  }
  const ai = game.aiStates[msg.seat];
  if (ai) assignCatchToAi(msg.seat, msg.tileId);
  if (msg.seat === game.seat && !ai) {
    const flower = isFlower(msg.tileId);
    const kongReplacement = !flower && game.kongChain > 0;
    game.pendingCatch = null;
    game.lastDraw = {
      id: msg.tileId,
      uid: game.nextUid++,
      source: flower ? 'flower' : (kongReplacement ? 'kong' : 'fish'),
    };
    if (!kongReplacement) game.kongChain = 0;
    setState(S.REELING);
    setStatus(flower
      ? `釣到花牌 ${tileName(msg.tileId)}！再釣一張牌。`
      : `釣到 ${tileName(msg.tileId)}！`);
  } else if (game.pendingCatch === msg.fishId) {
    game.pendingCatch = null;
    setStatus('這張牌被別人釣走了！');
  }
}

function checkCatch() {
  // Once a tile is hooked, ignore everything else on the way back. Otherwise a
  // second contact would overwrite lastDraw and silently lose both tiles.
  if (game.lastDraw || game.pendingCatch) return;
  const { hookX, hookY } = hookPosition();
  const hookNormX = hookX / view.width;
  const catchWidth = 16 / view.width;
  for (const fish of game.fish) {
    if (Math.abs(fish.x - hookNormX) <= fish.w / 2 / view.width + catchWidth
      && Math.abs(fish.y - hookY) <= fish.h / 2 + 16) {
      requestCatch(fish);
      return;
    }
  }
}

function finishReel() {
  if (game.lastDraw?.source === 'flower') {
    // A flower never enters the hand, but a flower caught as a kong replacement
    // still leaves us waiting for the actual replacement tile.
    const waitingForKongReplacement = game.kongChain > 0;
    if (!waitingForKongReplacement) game.grabPending = false;
    game.flowers.push(game.lastDraw.id);
    syncSeatFlowers(game.seat, game.flowers);
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
        if (!waitingForKongReplacement) game.kongChain = 0;
        setState(S.AWAIT_CAST);
      });
      return;
    }
    // No automatic replacement: the player hooks the next tile instead.
    game.lastDraw = null;
    if (!waitingForKongReplacement) game.kongChain = 0;
    setState(S.AWAIT_CAST);
    if (waitingForKongReplacement) setStatus('釣到花牌！再釣一張牌補槓。');
    return;
  }
  if (game.lastDraw?.source === 'fish' || game.lastDraw?.source === 'kong') {
    game.hand.push({ id: game.lastDraw.id, uid: game.lastDraw.uid });
    sortHand();
    setState(S.RESOLVE_DRAW);
    resolveDraw();
  } else {
    // An empty cast releases the claim lock, unless we still owe a replacement
    // draw after 槓 — in that case the next successful catch must be discarded.
    if (game.kongChain === 0) game.grabPending = false;
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
    // Inline on the left of the rod, no blocking screen popup.
    offerSelfWin(null, kongTile, () => setState(S.AWAIT_DISCARD));
  } else {
    setState(S.AWAIT_DISCARD);
  }
}

function declareKong(kind) {
  let removed = 0;
  game.hand = game.hand.filter((tile) => {
    if (tile.id === kind && removed < 4) { removed += 1; return false; }
    return true;
  });
  if (removed !== 4) return;
  const meld = { tile: kind, type: 'kong', tiles: [kind, kind, kind, kind] };
  game.melds.push(meld);
  addSeatMeld(game.seat, meld);
  if (game.mode === 'multi') broadcastOrSend({ t: 'meld', seat: game.seat, meld });
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
  game.mustDiscard = false;
  game.grabPending = false;
  // With bots discarding independently, nothing else advances the player's
  // turn after a discard. Return to casting so fishing can continue.
  setState(S.AWAIT_CAST);
  publishDiscard(game.seat, tile, false);
  if (game.mode === 'multi') renderClaimBoxes();
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

function handIdsForSeat(seat) {
  if (seat === game.seat) return concealedIds();
  return (game.aiStates[seat]?.hand ?? []).map((tile) => tile.id);
}

function meldsForSeat(seat) {
  return seat === game.seat ? game.melds : (game.aiStates[seat]?.melds ?? []);
}

function flowersForSeat(seat) {
  if (seat === game.seat) return game.flowers;
  return game.aiStates[seat]?.flowers ?? game.seatFlowers[seat] ?? [];
}

/** The 13-tile-equivalent hand used while a discard is still claimable. If a
 *  fish has already been reeled in, wait until that tile is discarded before
 *  treating it as part of the hand. */
function claimReadyTiles() {
  let tiles = game.hand;
  const uid = game.lastDraw?.uid;
  if (uid != null) {
    const index = tiles.findIndex((tile) => tile.uid === uid);
    if (index !== -1) tiles = tiles.filter((_, i) => i !== index);
  }
  return tiles;
}

/** Winning off a discard is never 自摸; open calls additionally remove 門前清. */
function claimWinResultFor(seat, discardId, tiles = null) {
  const context = seatWinContext(seat, { selfDraw: false });
  const concealed = tiles ? tiles.map((tile) => tile.id) : handIdsForSeat(seat);
  return withFlowers(evaluateHand({
    concealed: [...concealed, discardId],
    melds: meldsForSeat(seat),
    winningTile: discardId,
    context,
  }), flowersForSeat(seat), seatWindOf(seat), game.settings.fanCap, context);
}

function claimWinResult(discardId, tiles = null) {
  return claimWinResultFor(game.seat, discardId, tiles);
}

function clearClaim() {
  game.pendingClaim = null;
  game.claimActions = [];
  game.claimTimeLeft = 0;
  game.claimBoxes = [];
  renderClaim();
  renderClaimBoxes();
}

/** Cancel delayed AI reactions once the human has resolved the same tile. */
function cancelAiClaimsForTile(tileId) {
  if (!game.pendingAiClaims.length) return;
  game.pendingAiClaims = game.pendingAiClaims.filter((claim) => claim.tileId !== tileId);
}

function clearSelfWin() {
  game.pendingSelfWin = null;
  if (!ui.selfWinBar) return;
  ui.selfWinBar.hidden = true;
  ui.selfWinBar.classList.remove('actionable');
  if (ui.selfWinTile) ui.selfWinTile.innerHTML = '';
  if (ui.selfWinActions) ui.selfWinActions.innerHTML = '';
}

/** Show the inline 胡牌／開槓／過 prompt beside the rod instead of a modal. */
function offerSelfWin(result, kongTile, onDecline) {
  game.pendingSelfWin = { result, kongTile, onDecline };
  setStatus(result?.isWin
    ? '可以胡牌！選擇胡牌或過。'
    : `手上有四張 ${tileName(kongTile)}，要開暗槓嗎？`);
  renderSelfWin();
}

function chooseOpponentDiscardKind() {
  return randomTileKind();
}

function takeTilesFromList(list, kinds) {
  const needed = countTiles(kinds);
  const chosen = [];
  for (const id of Object.keys(needed)) {
    const matching = list.filter((tile) => tile.id === id).slice(0, needed[id]);
    if (matching.length < needed[id]) return null;
    chosen.push(...matching);
  }
  return chosen;
}

function takeHandTiles(kinds) {
  return takeTilesFromList(game.hand, kinds);
}

/** A claim needs a 13-tile-equivalent hand: a freshly hooked tile must be
 *  discarded first, and a successful 碰／上／明槓 also locks claims until then. */
function handReadyForClaim() {
  return game.hand.length === Math.max(0, 13 - game.melds.length * 3);
}

/** A claim on a played tile is only possible while we are free to react: the
 *  hook must be home empty, or its tile must already have been discarded. No
 *  claim may be made while the rod is out, a kong replacement is owed, or a
 *  forced discard is still pending. */
function canDeclareClaim() {
  if (game.mustDiscard || game.grabPending || game.lastDraw || game.kongChain > 0) return false;
  if (!handReadyForClaim()) return false;
  return ![S.LOADING, S.RESOLVE_DRAW, S.WIN, S.DRAW_GAME].includes(game.state);
}

/** Pung/chow/kong additionally require a pending discard and room for a
 *  fourth set; a hand can never hold more than four melds plus a pair. */
function canDeclareMeld() {
  if (!canDeclareClaim() || game.grabPending || game.state === S.AWAIT_DISCARD) return false;
  return game.melds.length < 4 && game.hand.length >= 4;
}

/** Build the actions a discard can offer. In `potential` mode the buttons are
 *  produced even while the rod is out; they are marked disabled so the box stays
 *  visible and only becomes clickable once the hook is home and the hand is
 *  ready again. */
function buildClaimActions(discardId, bot = game.pendingClaim?.bot, includePass = false, { potential = false } = {}) {
  const tiles = potential ? claimReadyTiles() : game.hand;
  const hand = tiles.map((tile) => tile.id);
  const counts = countTiles(hand);
  const actions = [];
  const win = claimWinResult(discardId, tiles);
  if (win.isWin) {
    actions.push({
      label: '胡牌', type: 'win', result: win,
      disabled: !canDeclareClaim(),
      onClick: () => commitWin(win),
    });
  }

  // `callShape` decides whether the box should list a call at all; `canCall`
  // is the live permission that only controls whether its button is disabled.
  const callShape = potential
    ? game.melds.length < 4 && tiles.length >= 4
    : canDeclareMeld();
  const canCall = canDeclareMeld();
  const canChow = canChowFrom(bot);
  // The shared pool is endless, so a replacement tile is always available.
  const hasReplacement = true;
  if (callShape && hasReplacement && (counts[discardId] ?? 0) >= 3) {
    const kinds = [discardId, discardId, discardId];
    actions.push({
      label: `明槓 ${tileName(discardId)}`,
      type: 'kong', kinds,
      disabled: !canCall,
      onClick: () => declareOpenMeld('kong', discardId, kinds),
    });
  }
  if (callShape && (counts[discardId] ?? 0) >= 2) {
    const kinds = [discardId, discardId];
    actions.push({
      label: `碰 ${tileName(discardId)}`,
      type: 'pung', kinds,
      disabled: !canCall,
      onClick: () => declareOpenMeld('pung', discardId, kinds),
    });
  }
  for (const combo of chowCombinations(discardId, hand)) {
    if (!canChow) break;
    actions.push({
      label: `上 ${combo.tiles.map(tileName).join('')}`,
      type: 'chow', kinds: combo.tiles,
      disabled: !canCall || !canChow,
      onClick: () => declareOpenMeld('chow', discardId, combo.tiles),
    });
  }
  // The 過 button does nothing that the five-second timeout doesn't already do,
  // so claim boxes never show it (single player included).
  if (includePass) actions.push({ label: '過', primary: false, onClick: passClaim });
  return actions;
}

/** Test helper: make the next AI discard immediately from its own hand. */
function nextBotDiscard() {
  if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
  const seats = Object.keys(game.aiStates).map(Number);
  if (!seats.length) return;
  const seat = seats[(game.botIndex + 1) % seats.length];
  game.botIndex += 1;
  aiChooseAndDiscard(game.aiStates[seat]);
}

/* ------------------------------------------------------------------ *
 * Simulated AI players
 *
 * An AI seat owns a private hand and its own hook. It fishes from the shared
 * sea, decides what to discard, and evaluates its own wins. It only receives
 * public discards — never another seat's concealed hand.
 * ------------------------------------------------------------------ */

/** Choose where an AI aims its next cast. Some casts deliberately go all the
 *  way to a side so the hook visibly reaches the bottom corner like a player's. */
function aiCastTarget() {
  const limit = swingLimit();
  const roll = Math.random();
  if (roll < 0.2) return -limit;
  if (roll < 0.4) return limit;
  return (Math.random() * 2 - 1) * limit;
}

/** Reset the rod to a fresh swing toward a new aim point. */
function resetAiRod(state, minWait = 0.35) {
  const rod = state.rod;
  const limit = swingLimit();
  rod.angle = Math.max(-limit, Math.min(limit, rod.angle ?? 0));
  rod.targetAngle = aiCastTarget();
  rod.dir = rod.targetAngle >= rod.angle ? 1 : -1;
  rod.hookLen = 0;
  rod.phase = 'swing';
  rod.wait = minWait + Math.random() * 0.9;
}

function createAiState(seat) {
  const dealt = dealTiles(13);
  const state = {
    seat,
    hand: dealt.hand,
    flowers: dealt.flowers,
    melds: [],
    river: [],
    lastDraw: null,
    kongChain: 0,
    mustDiscard: false,
    discardTimer: 0,
    caught: null,
    fanTotal: 0,
    bestFan: 0,
    rod: {
      angle: 0,
      targetAngle: 0,
      dir: 1,
      hookLen: 0,
      phase: 'swing',
      wait: 0,
    },
  };
  resetAiRod(state, 0.5 + Math.random() * 2.5);
  return state;
}

function isAiSeat(seat) {
  return Boolean(game.aiStates[seat])
    || Boolean(game.players.find((player) => player?.seat === seat && player.isBot && !player.isEmpty));
}

/** AI seats get the same opening flower / 天胡 / 地胡 check as the human seat. */
function checkAiOpeningWins() {
  for (const state of Object.values(game.aiStates)) {
    const seatWind = seatWindOf(state.seat);
    const context = seatWinContext(state.seat, { opening: true });
    if (state.flowers.length) {
      const flowerResult = flowerWinResult(
        state.flowers, seatWind, game.settings.fanCap, context,
      );
      if (flowerResult) {
        commitAiWin(state.seat, flowerResult);
        return true;
      }
    }
    let tile = randomTileKind();
    while (isFlower(tile)) tile = randomTileKind();
    const result = withFlowers(evaluateHand({
      concealed: [...state.hand.map((item) => item.id), tile],
      melds: state.melds,
      winningTile: tile,
      context,
    }), state.flowers, seatWind, game.settings.fanCap, context);
    if (result.isWin) {
      commitAiWin(state.seat, result);
      return true;
    }
  }
  return false;
}

function canChowFromSeat(seat, discarderSeat) {
  const wind = seatWindOf(seat);
  const previous = WINDS[(WINDS.indexOf(wind) + WINDS.length - 1) % WINDS.length];
  return seatWindOf(discarderSeat) === previous;
}

function swingAiRod(rod, dt) {
  const limit = swingLimit();
  rod.angle += rod.dir * 0.9 * game.hookSpeed * paceFactor() * dt;
  if (rod.angle > limit) { rod.angle = limit; rod.dir = -1; }
  else if (rod.angle < -limit) { rod.angle = -limit; rod.dir = 1; }
}

function aiHookPosition(state) {
  return hookPositionFor(state.rod.angle, state.rod.hookLen);
}

function aiCheckCatch(state) {
  // Reeling is when most catches happen (the hook sweeps back through the
  // whole sea), so only the already-caught flag may skip the check.
  if (state.caught) return;
  const { hookX, hookY } = aiHookPosition(state);
  const hookNormX = hookX / view.width;
  const catchWidth = 16 / view.width;
  for (const fish of game.fish) {
    if (Math.abs(fish.x - hookNormX) <= fish.w / 2 / view.width + catchWidth
      && Math.abs(fish.y - hookY) <= fish.h / 2 + 16) {
      handleCatchRequest({ fishId: fish.id, seat: state.seat });
      return;
    }
  }
}

/** Contact only grabs the fish: like the human seat, the AI keeps the hook
 *  extended and must reel it all the way back before the tile enters its hand. */
function assignCatchToAi(seat, tileId) {
  const state = game.aiStates[seat];
  if (!state) return;
  state.caught = tileId;
  state.rod.phase = 'reeling';
}

/** Called when the AI's hook reaches the rod again, mirroring finishReel(). */
function finishAiReel(state) {
  const tileId = state.caught;
  const seat = state.seat;
  state.caught = null;
  if (!tileId) {
    resetAiRod(state);
    return;
  }
  if (isFlower(tileId)) {
    state.flowers.push(tileId);
    syncSeatFlowers(seat, state.flowers);
    const result = flowerWinResult(
      state.flowers, seatWindOf(seat), game.settings.fanCap, seatWinContext(seat),
    );
    if (result) commitAiWin(seat, result);
    else resetAiRod(state);
    return;
  }
  state.hand.push(newTile(tileId));
  state.hand.sort((a, b) => TILE_IDS.indexOf(a.id) - TILE_IDS.indexOf(b.id));
  const kongReplacement = state.kongChain > 0;
  const context = seatWinContext(seat, { kongReplacementChain: state.kongChain });
  const result = withFlowers(evaluateHand({
    concealed: state.hand.map((tile) => tile.id),
    melds: state.melds,
    winningTile: tileId,
    context,
  }), state.flowers, seatWindOf(seat), game.settings.fanCap, context);
  if (result.isWin) {
    commitAiWin(seat, result);
    return;
  }
  if (!kongReplacement) state.kongChain = 0;
  const handCounts = countTiles(state.hand.map((tile) => tile.id));
  const kongTile = state.melds.length < 4
    ? Object.keys(handCounts).find((id) => handCounts[id] >= 4)
    : null;
  if (kongTile) {
    let removed = 0;
    state.hand = state.hand.filter((tile) => {
      if (tile.id === kongTile && removed < 4) { removed += 1; return false; }
      return true;
    });
    const meld = { tile: kongTile, type: 'kong', tiles: Array(4).fill(kongTile), open: false };
    state.melds.push(meld);
    addSeatMeld(seat, meld);
    if (game.mode === 'multi' && net.isHost) broadcastOrSend({ t: 'meld', seat, meld });
    state.kongChain += 1;
    // Like the human seat, a kong owes a replacement draw before any discard.
    resetAiRod(state);
    return;
  }
  state.mustDiscard = true;
  state.discardTimer = 0.6 + Math.random() * 1.2;
  resetAiRod(state);
}

function aiChooseAndDiscard(state) {
  if (!state?.hand.length) {
    if (state) { state.mustDiscard = false; state.discardTimer = 0; }
    return;
  }
  const context = seatWinContext(state.seat, { selfDraw: false });
  let best = null;
  for (const tile of state.hand) {
    const remaining = state.hand.filter((item) => item.uid !== tile.uid).map((item) => item.id);
    const waits = findWaits(remaining, state.melds, context, null);
    if (!best || waits.length > best.waits.length) best = { tile, waits };
  }
  const tile = best?.tile ?? state.hand[Math.floor(Math.random() * state.hand.length)];
  const index = state.hand.findIndex((item) => item.uid === tile.uid);
  if (index === -1) return;
  const [discarded] = state.hand.splice(index, 1);
  state.river.push(discarded);
  state.lastDraw = null;
  state.kongChain = 0;
  state.mustDiscard = false;
  state.discardTimer = 0;
  // A claimed fish keeps `caught` and the line extended until the forced
  // discard; reset both or the next cast would relock and start at full depth.
  state.caught = null;
  resetAiRod(state);
  publishDiscard(state.seat, discarded, true);
}

function publishDiscard(seat, tile, isBot) {
  const player = game.players.find((item) => item?.seat === seat);
  const wind = player?.wind ?? seatWindOf(seat);
  const sourceKey = `${seat}:${tile.uid ?? tile.id}:${game.nextUid++}`;
  const entry = {
    t: 'discard',
    // Host wall-clock deadline; every device converts it to its own clock so
    // the five-second claim boxes expire at the same moment everywhere.
    deadline: Date.now() + MULTI_CLAIM_SECONDS * 1000,
    claimId: sourceKey,
    sourceKey,
    seat,
    tileId: tile.id,
    uid: tile.uid,
    name: seatName(seat),
    isBot: Boolean(isBot),
    wind,
  };
  if (game.mode !== 'multi') {
    addClaimBox(entry);
  } else if (net.isHost || seat === game.seat) {
    if (net.isHost) {
      net.broadcast(entry);
      addClaimBox(entry);
    } else {
      net.sendToHost(entry);
    }
  }
  scheduleAiClaims(tile, seat, sourceKey);
}

function bestAiClaim(seat, tileId, discarderSeat) {
  const state = game.aiStates[seat];
  if (!state || state.mustDiscard || state.caught || state.lastDraw || state.kongChain > 0) return null;
  if (state.hand.length !== Math.max(0, 13 - state.melds.length * 3)) return null;
  const result = claimWinResultFor(seat, tileId);
  if (result.isWin) {
    return {
      type: 'win',
      result,
      fanTotal: state.fanTotal + result.totalFan,
      bestFan: Math.max(state.bestFan, result.totalFan),
    };
  }
  if (state.melds.length >= 4) return null;
  const counts = countTiles(state.hand.map((tile) => tile.id));
  if ((counts[tileId] ?? 0) >= 3) return { type: 'kong', kinds: [tileId, tileId, tileId] };
  if ((counts[tileId] ?? 0) >= 2) return { type: 'pung', kinds: [tileId, tileId] };
  if (canChowFromSeat(seat, discarderSeat)) {
    const combo = chowCombinations(tileId, state.hand.map((tile) => tile.id))[0];
    if (combo) return { type: 'chow', kinds: combo.tiles };
  }
  return null;
}

function scheduleAiClaims(tile, discarderSeat, sharedSourceKey = null) {
  if (!Object.keys(game.aiStates).length || game.state === S.WIN || game.state === S.DRAW_GAME) return;
  const tileId = typeof tile === 'string' ? tile : tile.id;
  const sourceKey = sharedSourceKey ?? `${discarderSeat}:${tile.uid ?? tileId}:${game.nextUid++}`;
  for (const seat of Object.keys(game.aiStates).map(Number)) {
    if (seat === discarderSeat) continue;
    const claim = bestAiClaim(seat, tileId, discarderSeat);
    if (!claim) continue;
    game.pendingAiClaims.push({
      ...claim,
      seat,
      tileId,
      sourceKey,
      claimId: `ai:${seat}:${sourceKey}`,
      discarderSeat,
      time: AI_CLAIM_DELAY_MIN + Math.random() * AI_CLAIM_DELAY_RANGE,
    });
  }
}

/** Re-check an AI reaction when its delay expires: it may have hooked a tile
 *  or completed a meld in the meantime, which must invalidate the old claim. */
function aiClaimStillValid(claim) {
  const state = game.aiStates[claim.seat];
  if (!state || game.state === S.WIN || game.state === S.DRAW_GAME) return false;
  if (state.mustDiscard || state.caught || state.lastDraw || state.kongChain > 0) return false;
  if (state.hand.length !== Math.max(0, 13 - state.melds.length * 3)) return false;
  if (claim.type === 'win') {
    // Flowers or a freshly fished tile can change the result, so evaluate the
    // still-waiting 13-tile hand against the old discard one more time.
    const fresh = claimWinResultFor(claim.seat, claim.tileId);
    if (!fresh.isWin) return false;
    claim.result = fresh;
    claim.fanTotal = state.fanTotal + fresh.totalFan;
    claim.bestFan = Math.max(state.bestFan, fresh.totalFan);
    return true;
  }
  if (state.melds.length >= 4) return false;
  const counts = countTiles(state.hand.map((tile) => tile.id));
  const needed = countTiles(claim.kinds ?? []);
  return Object.keys(needed).every((id) => (counts[id] ?? 0) >= needed[id]);
}

function aiClaimTick(dt) {
  if (!game.pendingAiClaims.length) return;
  const due = [];
  game.pendingAiClaims = game.pendingAiClaims.filter((claim) => {
    claim.time -= dt;
    if (claim.time > 0) return true;
    due.push(claim);
    return false;
  });
  for (const claim of due) {
    if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
    if (!aiClaimStillValid(claim)) continue;
    handleClaim({
      t: 'claim',
      claimId: claim.claimId,
      sourceKey: claim.sourceKey,
      seat: claim.seat,
      tileId: claim.tileId,
      type: claim.type,
      kinds: claim.kinds ?? null,
      result: claim.result ?? null,
      fanTotal: claim.fanTotal ?? null,
      bestFan: claim.bestFan ?? null,
      discarderSeat: claim.discarderSeat,
    });
  }
}

function applyAiMeldClaim(msg) {
  const state = game.aiStates[msg.seat];
  if (!state) return;
  const removed = takeTilesFromList(state.hand, msg.kinds ?? []);
  if (!removed) return;
  state.hand = state.hand.filter((tile) => !removed.includes(tile));
  const meld = {
    tile: msg.tileId,
    type: msg.type,
    tiles: [...removed.map((tile) => tile.id), msg.tileId],
    open: true,
  };
  state.melds.push(meld);
  addSeatMeld(msg.seat, meld);
  state.caught = null;
  resetAiRod(state);
  if (msg.type === 'kong') {
    // 明槓 also needs a replacement fish before the forced discard.
    state.kongChain += 1;
    return;
  }
  state.mustDiscard = true;
  state.discardTimer = 0.8 + Math.random() * 1.2;
}

function commitAiWin(seat, result, fanTotal = null, bestFan = null, meta = {}) {
  if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
  game.pendingAiClaims = [];
  const state = game.aiStates[seat];
  const total = fanTotal ?? (state?.fanTotal ?? 0) + result.totalFan;
  const best = bestFan ?? Math.max(state?.bestFan ?? 0, result.totalFan);
  const selfDraw = meta.selfDraw === undefined ? winIsSelfDraw(result) : Boolean(meta.selfDraw);
  const winMeta = { discarder: selfDraw ? null : (meta.discarder ?? null), selfDraw };
  if (game.mode === 'multi') {
    if (net.isHost) {
      net.broadcast({ t: 'win', seat, result, fanTotal: total, bestFan: best, isBot: true, ...winMeta });
    }
    finishMultiWin(seat, result, total, best, winMeta);
    return;
  }
  const log = recordRoundResult({ winner: seat, result, ...winMeta });
  clearClaim();
  clearSelfWin();
  setState(S.WIN);
  const name = seatLabel(seat);
  setStatus(`${name} 胡牌！${result.totalFan} 番`);
  showOverlay({
    title: `${name} 胡牌`,
    message: withMatchSummary(`${formatWinBreakdown(result)}\n\n${name}：本局 ${result.totalFan} 番`, log),
    tiles: [
      ...winningTiles(result),
      ...(result.flowers ?? []).map((id) => ({ id })),
    ],
    actions: [{ label: '再玩一局', onClick: restartGame }],
  });
}

function aiTick(dt) {
  if (!Object.keys(game.aiStates).length || game.state === S.WIN || game.state === S.DRAW_GAME) return;
  const hookRate = game.hookSpeed * paceFactor();
  for (const state of Object.values(game.aiStates)) {
    const rod = state.rod;
    if (state.mustDiscard) {
      state.discardTimer -= dt;
      if (state.discardTimer <= 0) aiChooseAndDiscard(state);
      // Do not fish again until the claimed tile has been discarded.
      continue;
    }
    if (rod.phase === 'swing') {
      // Aim across the whole player-reachable range, including the bottom
      // corners. Sweep to that aim point before casting instead of freezing at
      // whatever angle the previous reel happened to finish.
      const limit = swingLimit();
      const target = Math.max(-limit, Math.min(limit, rod.targetAngle ?? 0));
      rod.targetAngle = target;
      const diff = target - rod.angle;
      if (Math.abs(diff) < 0.002) {
        rod.angle = target;
      } else {
        const dir = Math.sign(diff);
        rod.dir = dir;
        swingAiRod(rod, dt);
        if ((dir > 0 && rod.angle >= target) || (dir < 0 && rod.angle <= target)) {
          rod.angle = target;
        }
      }
      if (rod.wait > 0) {
        rod.wait -= dt;
        if (rod.wait > 0) continue;
      }
      if (Math.abs(rod.targetAngle - rod.angle) >= 0.002) continue;
      rod.phase = 'casting';
      rod.hookLen = 0;
    }
    if (rod.phase === 'casting') {
      // Check for contact on every frame on the way down (just like the
      // player), but keep extending to the sea floor when nothing is caught so
      // the ghost rod visibly reaches the bottom corners.
      const maxLen = maxHookLength(rod.angle);
      rod.hookLen = Math.min(maxLen, rod.hookLen + 980 * hookRate * dt);
      aiCheckCatch(state);
      if (rod.phase === 'casting' && rod.hookLen >= maxLen) {
        rod.hookLen = maxLen;
        rod.phase = 'reeling';
      }
    } else if (rod.phase === 'reeling') {
      aiCheckCatch(state);
      if (rod.phase === 'reeling') {
        rod.hookLen -= 820 * hookRate * dt;
        if (rod.hookLen <= 0) {
          rod.hookLen = 0;
          // The tile is only collected once the hook is back at the rod, then
          // the AI waits briefly before discarding — same order as a player.
          finishAiReel(state);
        }
      }
    }
  }
}

function declareOpenMeld(type, discardId, handKinds) {
  if (!canDeclareMeld()) return;
  cancelAiClaimsForTile(discardId);
  const removed = takeHandTiles(handKinds);
  if (!removed) return;
  game.hand = game.hand.filter((tile) => !removed.includes(tile));
  const meld = {
    tile: discardId,
    type,
    tiles: [...removed.map((tile) => tile.id), discardId],
    open: true,
  };
  game.melds.push(meld);
  addSeatMeld(game.seat, meld);
  if (game.mode === 'multi') broadcastOrSend({ t: 'meld', seat: game.seat, meld });
  clearClaim();
  clearSelfWin();
  game.lastDraw = null;
  game.kongChain = 0;
  // The replacement draw (or forced discard) must happen before another claim.
  game.grabPending = true;
  game.mustDiscard = type !== 'kong';
  if (type === 'kong') {
    game.kongChain = 1;
    setState(S.AWAIT_CAST);
  } else {
    setState(S.AWAIT_DISCARD);
    setStatus(`${type === 'pung' ? '碰' : '上'}成功！請選一張牌打出。`);
  }
}

/** Passing removes the buttons but leaves the tile visible for its full 5s. */
function passClaim() {
  if (!game.pendingClaim) return;
  game.river.push(game.pendingClaim.tile);
  game.claimActions = [];
  renderClaim();
}

function winIsSelfDraw(result) {
  return Boolean(result?.patterns?.some((pattern) => pattern.id === '自摸'));
}

/** Settle one finished hand and keep the money/dealer state in sync. */
function recordRoundResult({ winner = null, discarder = null, result = null, selfDraw = false } = {}) {
  const match = game.match;
  if (!match || match.over) return null;
  // A guest may see the win message and the host's match snapshot in either
  // order; the round key makes settlement idempotent on every device.
  const roundKey = `${match.handNumber}:${match.repeatCount}:${match.dealerSeat}`;
  if (match.lastPayout?.roundKey === roundKey) return match.lastPayout;
  const settled = settleRound({
    money: match.money,
    winner,
    discarder,
    fan: result?.totalFan ?? 0,
    base: match.base,
    selfDraw,
    dealerSeat: match.dealerSeat,
    repeatCount: match.repeatCount,
    handNumber: match.handNumber,
    totalWinds: match.winds,
  });
  settled.log.roundKey = roundKey;
  match.money = settled.money;
  match.dealerSeat = settled.dealerSeat;
  match.repeatCount = settled.repeatCount;
  match.handNumber = settled.handNumber;
  match.history.push(settled.log);
  match.lastPayout = settled.log;
  match.over = settled.over;
  match.winner = settled.over ? bestSeats(settled.money) : null;
  if (game.mode === 'multi' && net.isHost) {
    net.broadcast({ t: 'match', match: cloneMatch(match) });
  }
  updateScoreUI();
  return settled.log;
}

function payoutSummary(log = game.match?.lastPayout) {
  if (!log) return '';
  const money = log.after.map((value, seat) => `${scoreSeatName(seat)} ${formatMoney(value)}`).join('　');
  const wind = WINDS[log.windIndex] ?? WINDS[0];
  const lines = [];
  if (log.winner !== null && log.winner !== undefined) {
    lines.push(`${scoreSeatName(log.winner)} ${log.fan} 番`);
    if (log.selfDraw) {
      lines.push(`自摸：三家各付 ${formatMoney(log.payout.each)}，共得 ${formatMoney(log.payout.total)}`);
    } else {
      lines.push(`放槍：${scoreSeatName(log.discarder)} 支付 ${formatMoney(log.payout.value)}`);
    }
  } else {
    lines.push('流局：不派彩');
  }
  if (log.dealerWon) lines.push(`${scoreSeatName(log.dealerSeat)} 連莊（第 ${log.repeatCount} 次）`);
  lines.push(`資金：${money}`);
  lines.push(`${TILE_INFO[wind]?.name ?? wind}風第 ${log.windIndex * 4 + 1} 局`);
  return lines.join('\n');
}

function matchEndMessage() {
  const match = game.match;
  if (!match?.over) return '';
  const winners = bestSeats(match.money);
  const names = winners.map((seat) => scoreSeatName(seat)).join('、');
  const amounts = winners.map((seat) => formatMoney(match.money[seat])).join('、');
  return amounts
    ? `比賽結束！資金最多：${names}（${amounts}）`
    : `比賽結束！資金最多：${names}`;
}

function withMatchSummary(message, log = game.match?.lastPayout) {
  const summary = payoutSummary(log);
  const combined = summary ? `${message}\n\n${summary}` : message;
  const ending = matchEndMessage();
  return ending ? `${ending}\n\n${combined}` : combined;
}

function commitWin(result, { discarder = null, selfDraw = null } = {}) {
  const isSelfDraw = selfDraw === null ? winIsSelfDraw(result) : Boolean(selfDraw);
  const meta = { discarder: isSelfDraw ? null : discarder, selfDraw: isSelfDraw };
  game.pendingAiClaims = [];
  if (game.mode === 'multi') {
    const fanTotal = game.fanTotal + result.totalFan;
    const bestFan = Math.max(game.bestFan, result.totalFan);
    game.fanTotal = fanTotal;
    game.bestFan = bestFan;
    save('mf-fantotal', fanTotal);
    save('mf-bestfan', bestFan);
    clearClaim();
    clearSelfWin();
    broadcastOrSend({ t: 'win', seat: game.seat, result, fanTotal, bestFan, ...meta });
    finishMultiWin(game.seat, result, fanTotal, bestFan, meta);
    return;
  }
  recordRoundResult({ winner: game.seat, result, ...meta });
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
    message: withMatchSummary(`${formatWinBreakdown(result)}\n\n累計 ${game.fanTotal} 番　最佳 ${game.bestFan} 番`),
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
  const log = recordRoundResult({ winner: null });
  game.timeLeft = 0;
  setState(S.DRAW_GAME);
  setStatus('時間到，流局。');
  updateTimer();
  showOverlay({
    title: '流局',
    message: withMatchSummary(`時間到，沒有胡牌。\n累計 ${game.fanTotal} 番　最佳 ${game.bestFan} 番`, log),
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
 * Casual multiplayer (PeerJS rooms)
 *
 * Every device keeps its own concealed hand, but all four seats fish in the
 * same host-owned sea. Human actions are shared: discards, claims, resulting
 * melds and the final result. The host relays public messages and decides
 * catches and claims by whichever request arrives first.
 * ------------------------------------------------------------------ */

function makeRoomCode() {
  return Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
}

function normalizeRoomCode(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function botNameForSeat(seat) {
  return BOT_NAMES[seat - 1] ?? `好友${seat}`;
}

function windForSeat(seat) {
  const base = WINDS.indexOf(game.seatWind ?? 'E');
  return WINDS[(base + seat) % WINDS.length];
}

function makeBotPlayer(seat) {
  return {
    seat,
    name: botNameForSeat(seat),
    wind: windForSeat(seat),
    isBot: true,
    isEmpty: false,
    playerId: null,
  };
}

function makeEmptyPlayer(seat) {
  return {
    seat,
    name: '空位',
    wind: windForSeat(seat),
    isBot: false,
    isEmpty: true,
    playerId: null,
  };
}

function defaultRoomPlayers() {
  return [
    { seat: 0, name: game.playerName, wind: game.seatWind ?? 'E', isBot: false, isEmpty: false, playerId: game.playerId },
    ...[1, 2, 3].map(makeEmptyPlayer),
  ];
}

/** Solo uses the same room screen, but all three opponent seats are AI from the start. */
function defaultSoloPlayers() {
  return [
    defaultRoomPlayers()[0],
    ...[1, 2, 3].map(makeBotPlayer),
  ];
}

/** The room controls are editable in the solo lobby and by the multiplayer host. */
function canEditRoomSettings() {
  return game.mode === 'solo' || (net.isHost && game.role === 'host');
}

function fillEmptySeatsWithBots() {
  if (!net.isHost || game.mode !== 'multi') return false;
  let changed = false;
  for (let seat = 1; seat <= 3; seat += 1) {
    if (game.players[seat]?.isEmpty) {
      game.players[seat] = makeBotPlayer(seat);
      changed = true;
    }
  }
  if (changed) {
    net.broadcast({ t: 'players', players: game.players });
    refreshMultiBots();
    renderRoom();
    renderMeldsPanel();
  }
  return changed;
}

function toggleAiSeat(seat) {
  if (!net.isHost || game.mode !== 'multi') return;
  const player = game.players[seat];
  if (!player || player.seat !== seat || !player.isBot && !player.isEmpty) return;
  game.players[seat] = player.isBot ? makeEmptyPlayer(seat) : makeBotPlayer(seat);
  net.broadcast({ t: 'players', players: game.players });
  refreshMultiBots();
  renderRoom();
  renderMeldsPanel();
}

function setRoomMessage(text) {
  if (ui.roomMessage) ui.roomMessage.textContent = text;
}

function normalizePlayerName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 12) || DEFAULT_PLAYER_NAME;
}

/** Seat names shown to other devices; our own seat always uses its current name. */
function seatName(seat) {
  if (seat === game.seat) return game.playerName;
  return game.players.find((player) => player.seat === seat)?.name
    ?? (seat === 0 ? DEFAULT_PLAYER_NAME : BOT_NAMES[seat - 1] ?? `好友${seat}`);
}

/** Player-facing name: AI seats are always marked so nobody mistakes them for friends. */
function withAiTag(name, isBot) {
  return isBot ? `${name} (AI)` : name;
}

function playerDisplayName(player) {
  if (player?.isEmpty) return '空位';
  return withAiTag(player?.name ?? seatName(player?.seat ?? 0), Boolean(player?.isBot));
}

function seatLabel(seat) {
  const player = game.players.find((item) => item.seat === seat);
  if (player?.isEmpty) return '空位';
  return withAiTag(seatName(seat), Boolean(player?.isBot));
}

function setPlayerName(value, notify = true) {
  const name = normalizePlayerName(value);
  game.playerName = name;
  game.playerCustomName = true;
  const me = game.players.find((player) => player.seat === game.seat);
  if (me) me.name = name;
  for (const input of [ui.menuPlayerName, ui.roomPlayerName, ui.settingsPlayerName]) {
    if (input) input.value = name;
  }
  if (game.mode === 'multi' && notify) {
    broadcastOrSend({ t: 'name', seat: game.seat, name });
  }
  renderRoom();
  renderMeldsPanel();
  renderClaimBoxes();
}

function commitPlayerNameInput(event) {
  setPlayerName(event.target.value);
}

/** Guests adopt the name assigned by the host, or their own edited name once relayed. */
function adoptPlayersList(players) {
  game.players = players.map((player) => ({ ...player }));
  const me = game.players.find((player) => player.seat === game.seat);
  if (me) {
    game.playerName = me.name;
    for (const input of [ui.menuPlayerName, ui.roomPlayerName, ui.settingsPlayerName]) {
      if (input) input.value = me.name;
    }
  }
  refreshMultiBots();
}

function setMultiUIVisibility(visible) {
  if (!visible) {
    if (ui.claimBoxes) { ui.claimBoxes.hidden = true; ui.claimBoxes.innerHTML = ''; }
    if (ui.meldPanel) ui.meldPanel.hidden = true;
    if (ui.meldRows) ui.meldRows.innerHTML = '';
    return;
  }
  renderClaimBoxes();
  renderMeldsPanel();
}

function refreshMultiBots() {
  if (game.mode !== 'multi') return;
  game.bots = game.players
    .filter((player) => player && !player.isEmpty && player.seat !== game.seat)
    .map((player) => ({ name: player.name, wind: player.wind, isBot: Boolean(player.isBot) }));
}

function broadcastOrSend(msg) {
  if (net.isHost) net.broadcast(msg);
  else net.sendToHost(msg);
}

function roomLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function setWaitingRoom(visible) {
  document.body.classList.toggle('waiting-room', visible);
}

function askRoomCode() {
  if (ui.joinMessage) ui.joinMessage.textContent = '';
  closeModal('menuScreen');
  openModal('joinScreen');
  ui.joinRoomCode?.focus();
}

function clearJoinWatchdog() {
  if (game.joinTimer) clearTimeout(game.joinTimer);
  game.joinTimer = null;
}

/** A rejected/closed room must never leave a half-joined room screen behind. */
function rejectJoin(title, message) {
  if (game.joinOutcome === 'joined') return;
  game.joinOutcome = 'failed';
  clearJoinWatchdog();
  resetMultiState();
  showMenu();
  if (ui.joinMessage) ui.joinMessage.textContent = message;
  showOverlay({
    title,
    message,
    actions: [{
      label: '返回',
      primary: false,
      onClick: () => { ui.overlay.classList.remove('show'); askRoomCode(); },
    }],
  });
}

/** Solo now uses a lobby too: four AI-filled seats, no room code or share link. */
function openSoloRoom() {
  clearJoinWatchdog();
  ui.overlay.classList.remove('show');
  clearNotices();
  game.pendingResult = null;
  game.state = S.LOADING;
  game.timeLeft = game.settings.gameSeconds;
  game.timeDeadline = 0;
  game.clockOffset = 0;
  game.mode = 'solo';
  game.role = 'none';
  game.seat = 0;
  game.roomCode = null;
  game.players = defaultSoloPlayers();
  game.roomSettings = {
    hookSpeed: game.hookSpeed,
    gameSeconds: game.settings.gameSeconds,
    ...game.matchSetup,
  };
  resetMatch(game.matchSetup);
  setRoomMessage('');
  closeModal('menuScreen');
  closeModal('joinScreen');
  openModal('roomScreen');
  setWaitingRoom(true);
  renderRoom();
  updateSettingsUI();
  unlockMusic();
}

async function openRoom() {
  if (!net.available) {
    setRoomMessage('聯機功能無法使用：請重新整理頁面。');
    return;
  }
  clearJoinWatchdog();
  ui.overlay.classList.remove('show');
  clearNotices();
  game.pendingResult = null;
  game.state = S.LOADING;
  game.timeLeft = game.settings.gameSeconds;
  game.timeDeadline = 0;
  game.clockOffset = 0;
  game.mode = 'multi';
  game.role = 'host';
  game.seat = 0;
  game.playerId = randomPlayerId();
  game.roomCode = makeRoomCode();
  game.players = defaultRoomPlayers();
  game.roomSettings = {
    hookSpeed: game.hookSpeed, gameSeconds: game.settings.gameSeconds,
    ...game.matchSetup,
  };
  resetMatch(game.matchSetup);
  setRoomMessage('正在建立房間…');
  closeModal('menuScreen');
  closeModal('joinScreen');
  openModal('roomScreen');
  setWaitingRoom(true);
  renderRoom();
  try {
    await net.startHost(game.roomCode);
    setRoomMessage('房間已建立，等待好友加入。');
    renderRoom();
  } catch (error) {
    setRoomMessage(error?.message === 'room-timeout'
      ? '建立房間失敗，請再試一次。'
      : '無法連線到配對服務，請檢查網路後再試。');
  }
}

async function joinRoom() {
  const code = normalizeRoomCode(ui.joinRoomCode?.value);
  if (code.length !== 4) {
    if (ui.joinMessage) ui.joinMessage.textContent = '請輸入四位房間代碼。';
    openModal('joinScreen');
    ui.joinRoomCode?.focus();
    return;
  }
  if (ui.joinRoomCode) ui.joinRoomCode.value = code;
  if (deadRooms.has(code)) {
    if (ui.joinMessage) ui.joinMessage.textContent = '房間已關閉，請重新開房間。';
    openModal('joinScreen');
    ui.joinRoomCode?.focus();
    return;
  }
  if (!net.available) {
    if (ui.joinMessage) ui.joinMessage.textContent = '聯機功能無法使用：請重新整理頁面。';
    openModal('joinScreen');
    return;
  }
  clearJoinWatchdog();
  ui.overlay.classList.remove('show');
  clearNotices();
  game.pendingResult = null;
  game.state = S.LOADING;
  game.timeLeft = game.settings.gameSeconds;
  game.timeDeadline = 0;
  game.clockOffset = 0;
  game.joinOutcome = 'pending';
  game.mode = 'multi';
  game.role = 'guest';
  game.playerId = randomPlayerId();
  game.roomCode = code;
  // Stay on the join screen until the host actually welcomes us. A stale
  // PeerJS id can open a data channel after the host left, and showing the
  // room screen first made an empty, unusable lobby look like a valid room.
  if (ui.joinMessage) ui.joinMessage.textContent = '正在加入房間…';
  closeModal('menuScreen');
  closeModal('roomScreen');
  openModal('joinScreen');
  // Start the watchdog before connecting so both the connection and the
  // welcome are covered — a dead room can never trap the player in a lobby.
  game.joinTimer = setTimeout(() => {
    if (game.joinOutcome === 'pending') {
      deadRooms.add(code);
      rejectJoin('房間已關閉', '房間已關閉，請重新開房間。');
    }
  }, 8000);
  try {
    await net.joinRoom(code, game.playerId, game.playerCustomName ? game.playerName : null);
    if (game.joinOutcome === 'pending' && ui.joinMessage) {
      ui.joinMessage.textContent = '等待房主回應…';
    }
  } catch (error) {
    console.warn('[mf] 加入房間失敗：', error);
    if (game.joinOutcome !== 'pending') return;
    if (error?.message === 'peer-unavailable' || error?.message === 'room-timeout') {
      deadRooms.add(code);
    }
    rejectJoin('無法加入房間', error?.message === 'room-timeout'
      || error?.message === 'peer-unavailable'
      ? '找不到這個房間，請確認代碼是否正確。'
      : '無法連線到房間，請檢查網路後再試。');
  }
}

function renderRoom() {
  if (!ui.room) return;
  const isSoloRoom = game.mode === 'solo';
  const isMultiHost = net.isHost && game.role === 'host';
  const isHost = isSoloRoom || isMultiHost;
  if (ui.room) ui.room.setAttribute('aria-label', isSoloRoom ? '單機房間' : '聯機房間');
  if (ui.roomTitle) ui.roomTitle.textContent = isSoloRoom ? '單機房間' : '聯機房間';
  if (ui.roomWaitHint) {
    ui.roomWaitHint.textContent = isSoloRoom
      ? '三位 AI 對手已自動補位，按下「開始遊戲」即可開始。'
      : '所有人加入後，請等待房主按下「開始遊戲」。';
  }
  if (ui.roomShareBlock) ui.roomShareBlock.hidden = isSoloRoom;
  if (ui.roomCode) ui.roomCode.textContent = isSoloRoom || !game.roomCode ? '—' : game.roomCode;
  if (ui.roomLink) ui.roomLink.value = isSoloRoom || !game.roomCode ? '' : roomLink(game.roomCode);
  if (ui.roomLeave) ui.roomLeave.textContent = isSoloRoom ? '返回主選單' : '離開房間';
  if (ui.roomHostControls) ui.roomHostControls.hidden = !isHost;
  if (ui.roomStart) ui.roomStart.hidden = !isHost;
  if (ui.roomGuestInfo) {
    ui.roomGuestInfo.hidden = isHost;
    if (!isHost) {
      const setup = normalizeMatchSetup(game.roomSettings);
      ui.roomGuestInfo.textContent = `房主設定：鉤速 ${Number(game.roomSettings.hookSpeed).toFixed(1)}×・每局 ${formatClock(game.roomSettings.gameSeconds)}・起始資金 ${formatMoney(setup.startingMoney)}・${setup.winds} 圈・金額倍數 ${setup.base}×`;
    }
  }
  if (ui.roomHookSpeed) {
    ui.roomHookSpeed.value = String(game.roomSettings.hookSpeed);
    ui.roomHookSpeedValue.textContent = `${Number(game.roomSettings.hookSpeed).toFixed(1)}×`;
  }
  if (ui.roomGameDuration) {
    ui.roomGameDuration.value = String(game.roomSettings.gameSeconds);
    ui.roomGameDurationValue.textContent = formatClock(game.roomSettings.gameSeconds);
  }
  if (ui.roomGameDurationText
    && document.activeElement !== ui.roomGameDurationText) {
    ui.roomGameDurationText.value = formatClock(game.roomSettings.gameSeconds);
  }
  const setup = normalizeMatchSetup(game.roomSettings);
  if (ui.roomStartingMoney) {
    ui.roomStartingMoney.value = String(setup.startingMoney);
    ui.roomStartingMoneyValue.textContent = formatMoney(setup.startingMoney);
  }
  if (ui.roomStartingMoneyText && document.activeElement !== ui.roomStartingMoneyText) {
    ui.roomStartingMoneyText.value = String(setup.startingMoney);
  }
  if (ui.roomWinds) ui.roomWinds.value = String(setup.winds);
  if (ui.roomBase) {
    ui.roomBase.value = String(setup.base);
    ui.roomBaseValue.textContent = `${setup.base}×`;
  }
  if (ui.roomBaseText && document.activeElement !== ui.roomBaseText) {
    ui.roomBaseText.value = String(setup.base);
  }
  if (ui.roomAvatars) {
    ui.roomAvatars.innerHTML = '';
    const players = game.players.length ? game.players : defaultRoomPlayers();
    for (let seat = 0; seat < 4; seat += 1) {
      const player = players.find((item) => item?.seat === seat);
      const avatar = document.createElement('span');
      avatar.className = 'room-avatar';
      avatar.style.background = AVATAR_COLORS[seat];
      if (!player || player.isEmpty) avatar.classList.add('empty');
      avatar.textContent = AVATAR_ICONS[seat];
      ui.roomAvatars.appendChild(avatar);
    }
  }
  if (ui.roomPlayers) {
    ui.roomPlayers.innerHTML = '';
    const players = game.players.length ? game.players : defaultRoomPlayers();
    for (const player of players) {
      const row = document.createElement('div');
      row.className = `room-player${player.seat === game.seat ? ' you' : ''}`;
      const label = document.createElement('span');
      label.textContent = `${playerDisplayName(player)}（${player.wind ?? ''}）`;
      const role = document.createElement('span');
      role.className = 'room-player-role';
      role.textContent = player.isEmpty ? '等待加入'
        : player.seat === game.seat ? '你'
          : isSoloRoom ? 'AI 對手'
            : player.isBot ? 'AI 補位' : player.seat === 0 ? '房主' : '好友';
      row.append(label, role);
      if (isMultiHost && player.seat !== 0 && (player.isEmpty || player.isBot)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'room-seat-btn';
        button.dataset.seat = String(player.seat);
        button.textContent = player.isBot ? '移除 AI' : '加入 AI';
        button.addEventListener('click', () => toggleAiSeat(player.seat));
        row.appendChild(button);
      }
      ui.roomPlayers.appendChild(row);
    }
  }
}

function copyRoomLink() {
  const link = ui.roomLink?.value ?? '';
  if (!link) return;
  navigator.clipboard?.writeText(link).then(
    () => setRoomMessage('分享連結已複製。'),
    () => { ui.roomLink?.select(); setRoomMessage('請手動複製上方連結。'); },
  );
}

function currentRoomMatchSetup() {
  return normalizeMatchSetup({
    startingMoney: ui.roomStartingMoney?.value ?? game.matchSetup.startingMoney,
    winds: ui.roomWinds?.value ?? game.matchSetup.winds,
    base: ui.roomBase?.value ?? game.matchSetup.base,
  });
}

function updateRoomSettings() {
  if (!canEditRoomSettings()) return;
  const setup = currentRoomMatchSetup();
  game.roomSettings = {
    hookSpeed: Number(ui.roomHookSpeed.value),
    gameSeconds: Number(ui.roomGameDuration.value),
    ...setup,
  };
  applyMatchSetup(setup);
  if (game.mode === 'multi') net.broadcast({ t: 'settings', settings: game.roomSettings });
  renderRoom();
  updateSettingsUI();
}

/** Host can type a clock (5:00, 05:00, 0:30 or 5) instead of dragging. */
function commitRoomDurationText() {
  if (!canEditRoomSettings()) return;
  const parsed = parseClock(ui.roomGameDurationText?.value);
  const seconds = parsed === null ? game.roomSettings.gameSeconds : clampGameSeconds(parsed);
  ui.roomGameDuration.value = String(seconds);
  updateRoomSettings();
}

/** Numeric text inputs mirror the sliders so big values can be typed exactly. */
function commitRoomMoneyText() {
  if (!canEditRoomSettings()) return;
  const setup = normalizeMatchSetup({
    ...currentRoomMatchSetup(),
    startingMoney: clampInt(ui.roomStartingMoneyText?.value, MIN_STARTING_MONEY, MAX_STARTING_MONEY, game.matchSetup.startingMoney),
  });
  if (ui.roomStartingMoney) ui.roomStartingMoney.value = String(setup.startingMoney);
  updateRoomSettings();
}

function commitRoomBaseText() {
  if (!canEditRoomSettings()) return;
  const setup = normalizeMatchSetup({
    ...currentRoomMatchSetup(),
    base: clampInt(ui.roomBaseText?.value, MIN_BASE, MAX_BASE, game.matchSetup.base),
  });
  if (ui.roomBase) ui.roomBase.value = String(setup.base);
  updateRoomSettings();
}

/** Start whichever lobby is open: solo begins locally, multiplayer broadcasts. */
function startRoomGame() {
  if (game.mode === 'multi') {
    startMultiGame();
    return;
  }
  if (game.mode !== 'solo') return;
  const setup = currentRoomMatchSetup();
  game.roomSettings = {
    hookSpeed: Number(ui.roomHookSpeed.value),
    gameSeconds: Number(ui.roomGameDuration.value),
    ...setup,
  };
  game.hookSpeed = game.roomSettings.hookSpeed;
  game.settings.gameSeconds = game.roomSettings.gameSeconds;
  resetMatch(setup, game.match?.dealerSeat ?? null);
  game.players = defaultSoloPlayers();
  closeModal('roomScreen');
  closeModal('joinScreen');
  ui.overlay.classList.remove('show');
  setWaitingRoom(false);
  updateSettingsUI();
  startGame();
}

function startMultiGame() {
  if (game.mode !== 'multi' || !net.isHost) return;
  fillEmptySeatsWithBots();
  const seatWind = seatZeroWind(game.match);
  const msg = {
    t: 'start',
    settings: { ...game.roomSettings },
    match: cloneMatch(game.match),
    timeLeft: game.roomSettings.gameSeconds,
    roundWind: WINDS[windIndexFor(game.match)],
    seatWind,
    players: game.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      isBot: Boolean(player.isBot),
      playerId: player.playerId,
    })),
  };
  game.pendingMultiStart = msg;
  net.broadcast(msg);
  applyMultiStart(msg);
}

function applyMultiStart(msg) {
  if (game.mode !== 'multi') return;
  game.pendingMultiStart = msg;
  game.roomSettings = { ...msg.settings };
  if (msg.match) adoptMatch(msg.match);
  else game.matchSetup = normalizeMatchSetup(msg.settings);
  game.hookSpeed = msg.settings.hookSpeed;
  game.settings.gameSeconds = msg.settings.gameSeconds;
  game.rematchVotes = [];
  game.rematchRequired = [];
  game.rematchMessage = '';
  closeModal('joinScreen');
  closeModal('roomScreen');
  ui.overlay.classList.remove('show');
  setWaitingRoom(false);
  updateSettingsUI();
  startGame({ preset: msg });
  // The host's clock may differ from ours, so keep its remaining seconds and
  // count down from the moment this device received the message.
  if (!net.isHost) {
    const seconds = Number.isFinite(msg.timeLeft)
      ? Math.max(0, msg.timeLeft)
      : game.settings.gameSeconds;
    syncRemoteTime(seconds);
  }
}

/** Adopt a host-approved remaining time without trusting the host's clock. */
function syncRemoteTime(seconds) {
  game.timeBase = seconds;
  game.timeSyncAt = Date.now();
  game.timeLeft = seconds;
  game.timeDeadline = 0;
  updateTimer();
}

function hostTimeLeft() {
  return Math.max(0, (game.timeDeadline - Date.now()) / 1000);
}

function guestTimeLeft() {
  return Math.max(0, game.timeBase - (Date.now() - game.timeSyncAt) / 1000);
}

/** Runs on an interval as well as the frame loop so a hidden host tab still
 *  publishes time and eventually ends the round. */
function broadcastHostTime() {
  if (game.mode !== 'multi' || !net.isHost) return;
  if ([S.LOADING, S.WIN, S.DRAW_GAME].includes(game.state)) return;
  const seconds = hostTimeLeft();
  game.timeLeft = seconds;
  updateTimer();
  net.broadcast({ t: 'time', timeLeft: seconds, sentAt: Date.now() });
  if (seconds <= 0) {
    net.broadcast({ t: 'draw' });
    applyMultiDraw();
  }
}

/** Convert the host's wall-clock deadline to this device's clock. */
function claimDeadline(entry) {
  if (Number.isFinite(entry.deadline)) {
    return net.isHost ? entry.deadline : entry.deadline - game.clockOffset;
  }
  return Date.now() + MULTI_CLAIM_SECONDS * 1000;
}

function addClaimBox(entry) {
  // Keep a host-side box even for the host's own discard: the host needs it to
  // arbitrate human and AI claims. Rendering still hides that seat's box.
  // One box per opponent: a newer discard replaces that opponent's older one.
  game.claimBoxes = game.claimBoxes.filter((box) => box.seat !== entry.seat);
  game.claimBoxes.push({
    ...entry,
    isBot: entry.isBot ?? Boolean(game.players.find((player) => player.seat === entry.seat)?.isBot),
    expiresAt: claimDeadline(entry),
    timeLeft: MULTI_CLAIM_SECONDS, resolved: false, awaiting: false,
  });
  renderClaimBoxes();
}

function sendClaimMessage(msg) {
  if (game.mode !== 'multi' || net.isHost) handleClaim(msg);
  else net.sendToHost(msg);
}

function claimFromBox(box, action) {
  if (box.resolved || box.awaiting) return;
  const bot = { name: box.name, wind: box.wind };
  // The hand can change while a discard is still inside its five-second
  // window. Rebuild the actions on press so a stale 上／碰／明槓 button can
  // never spend tiles we no longer hold, and a newly completed 胡 is offered.
  const fresh = buildClaimActions(box.tileId, bot, false, { potential: true }).find((item) => item.type === action.type
    && (item.kinds ?? []).join(',') === (action.kinds ?? []).join(','));
  if (!fresh || fresh.disabled) {
    renderClaimBoxes();
    return;
  }
  if (fresh.type === 'win' ? !canDeclareClaim() : !canDeclareMeld()) {
    renderClaimBoxes();
    return;
  }
  box.awaiting = true;
  renderClaimBoxes();
  const msg = {
    t: 'claim',
    claimId: box.claimId,
    sourceKey: box.sourceKey,
    seat: game.seat,
    tileId: box.tileId,
    type: fresh.type,
    kinds: fresh.kinds ?? null,
    discarderSeat: box.seat,
  };
  if (fresh.type === 'win') {
    msg.result = fresh.result;
    msg.fanTotal = game.fanTotal + fresh.result.totalFan;
    msg.bestFan = Math.max(game.bestFan, fresh.result.totalFan);
  }
  // Wait for the host's first-press-wins ruling before touching our own hand.
  sendClaimMessage(msg);
}

function declareOpenMeldMulti(type, discardId, kinds) {
  if (!canDeclareMeld() || !Array.isArray(kinds) || !kinds.length) return;
  const removed = takeHandTiles(kinds);
  if (!removed) return;
  game.hand = game.hand.filter((tile) => !removed.includes(tile));
  const meld = {
    tile: discardId,
    type,
    tiles: [...removed.map((tile) => tile.id), discardId],
    open: true,
  };
  game.melds.push(meld);
  addSeatMeld(game.seat, meld);
  clearClaim();
  clearSelfWin();
  game.lastDraw = null;
  game.kongChain = 0;
  game.mustDiscard = true;
  game.grabPending = true;
  setState(type === 'kong' ? S.AWAIT_CAST : S.AWAIT_DISCARD);
  setStatus(`${type === 'pung' ? '碰' : type === 'chow' ? '上' : '明槓'}成功！請先打出一張牌。`);
}

function handleClaim(msg) {
  // AI claims carry an `ai:<seat>:` claim id, so match the shared discard key
  // first; every human claim carries it too.
  const box = game.claimBoxes.find((item) => msg.sourceKey
    ? item.sourceKey === msg.sourceKey
    : item.claimId === msg.claimId);
  // A late press must not win a tile whose five-second window has already closed.
  if (box && box.expiresAt !== undefined && box.expiresAt <= Date.now()) return;
  if (game.mode === 'multi' && (!box || box.resolved)) return;
  if (!box && !game.aiStates[msg.seat]) return;
  if (msg.sourceKey) {
    if (game.claimedKeys.has(msg.sourceKey)) return;
    game.claimedKeys.add(msg.sourceKey);
  }
  if (box) box.resolved = true;
  const tileId = msg.tileId ?? box?.tileId;
  const meld = msg.type === 'win' ? null : {
    tile: tileId,
    type: msg.type,
    tiles: [...(msg.kinds ?? []), tileId],
    open: true,
  };
  const result = {
    t: 'claimResult',
    claimId: msg.claimId,
    sourceKey: msg.sourceKey ?? box?.sourceKey ?? null,
    seat: msg.seat,
    tileId,
    type: msg.type,
    meld,
    kinds: msg.kinds ?? null,
    result: msg.result ?? null,
    fanTotal: msg.fanTotal ?? null,
    bestFan: msg.bestFan ?? null,
    discarderSeat: msg.discarderSeat ?? box?.seat ?? null,
  };
  if (game.mode === 'multi') net.broadcast(result);
  applyClaimResult(result);
}

function applyClaimResult(msg) {
  const box = game.claimBoxes.find((item) => msg.sourceKey
    ? item.sourceKey === msg.sourceKey
    : item.claimId === msg.claimId);
  if (box) box.resolved = true;
  if (msg.type === 'win') {
    const winMeta = { discarder: msg.discarderSeat ?? null, selfDraw: false };
    if (msg.seat === game.seat && game.mode !== 'multi') {
      commitWin(msg.result, winMeta);
    } else if (game.aiStates[msg.seat] && (net.isHost || game.mode !== 'multi')) {
      commitAiWin(msg.seat, msg.result, msg.fanTotal, msg.bestFan, winMeta);
    } else {
      finishMultiWin(msg.seat, msg.result, msg.fanTotal, msg.bestFan, winMeta);
    }
    return;
  }
  if (msg.seat === game.seat) {
    declareOpenMeldMulti(msg.type, msg.tileId, msg.kinds ?? []);
  } else if (game.aiStates[msg.seat]) {
    applyAiMeldClaim(msg);
  } else if (msg.meld) {
    addSeatMeld(msg.seat, msg.meld);
  }
  renderClaimBoxes();
}

function addSeatMeld(seat, meld) {
  if (!game.seatMelds[seat]) game.seatMelds[seat] = [];
  game.seatMelds[seat].push(meld);
  renderMeldsPanel();
}

function winnerName(seat) {
  return seatLabel(seat);
}

function humanSeats() {
  return game.players.filter((player) => player && !player.isBot && !player.isEmpty).map((player) => player.seat);
}

function showMultiEndOverlay(title, message, tiles = []) {
  if (game.mode !== 'multi') {
    showOverlay({ title, message, tiles, actions: [{ label: '再玩一局', onClick: restartGame }] });
    return;
  }
  game.rematchVotes = [];
  game.rematchRequired = humanSeats();
  game.rematchMessage = message;
  showOverlay({
    title,
    message,
    tiles,
    actions: [
      {
        label: '再來一局',
        keepOpen: true,
        pendingLabel: '已同意，等待其他玩家…',
        onClick: voteRematch,
      },
      { label: '回到主選單', primary: false, onClick: leaveMultiRoom },
    ],
  });
}

function updateRematchOverlay() {
  if (!ui.overlay.classList.contains('show') || !game.rematchMessage) return;
  const body = ui.overlay.querySelector('.breakdown');
  if (!body) return;
  const required = game.rematchRequired.length ? game.rematchRequired : humanSeats();
  const names = required.map((seat) => {
    const mark = game.rematchVotes.includes(seat) ? '✓' : '○';
    return `${mark}${seatLabel(seat)}`;
  }).join('　');
  body.textContent = `${game.rematchMessage}\n\n再來一局投票：${names}（${game.rematchVotes.length}/${required.length}）`;
  const button = ui.overlay.querySelector('[data-keep-open]');
  if (button && game.rematchVotes.includes(game.seat)) {
    button.disabled = true;
    button.textContent = button.dataset.pendingLabel;
  }
}

function broadcastRematchStatus() {
  if (!net.isHost) return;
  net.broadcast({
    t: 'rematchStatus',
    votes: [...game.rematchVotes],
    required: [...game.rematchRequired],
  });
  updateRematchOverlay();
}

function checkRematchReady() {
  if (!net.isHost || ![S.WIN, S.DRAW_GAME].includes(game.state)) return;
  const required = game.rematchRequired.length ? game.rematchRequired : humanSeats();
  if (!required.length || !required.every((seat) => game.rematchVotes.includes(seat))) return;
  game.rematchVotes = [];
  game.rematchRequired = [];
  game.rematchMessage = '';
  ui.overlay.classList.remove('show');
  if (game.match?.over) resetMatch(game.matchSetup);
  startMultiGame();
}

function addRematchVote(seat) {
  if (!game.rematchVotes.includes(seat)) game.rematchVotes.push(seat);
}

function voteRematch() {
  if (game.mode !== 'multi' || ![S.WIN, S.DRAW_GAME].includes(game.state)) return;
  addRematchVote(game.seat);
  if (net.isHost) {
    broadcastRematchStatus();
    checkRematchReady();
  } else {
    net.sendToHost({ t: 'rematch', seat: game.seat, playerId: game.playerId });
    updateRematchOverlay();
  }
}

/* ---- Mid-game restart vote (all human seats must agree) ---- */

function restartVoteMessage() {
  const required = game.restartRequired.length ? game.restartRequired : humanSeats();
  const names = required.map((seat) => {
    const mark = game.restartVotes.includes(seat) ? '✓' : '○';
    return `${mark}${seatLabel(seat)}${seat === game.seat ? '（你）' : ''}`;
  }).join('　');
  // The requester is a seat, not a pre-rendered sentence: "你" must only appear
  // on that player's own screen.
  const requester = game.restartRequester;
  const reason = requester === null
    ? (game.restartMessage || '有玩家要求重新開始。')
    : requester === game.seat
      ? '你要求重新開始這一局。'
      : `${seatLabel(requester)} 要求重新開始這一局。`;
  return `${reason}\n\n重新開始投票：${names}（${game.restartVotes.length}/${required.length}）`;
}

function showRestartVoteOverlay() {
  showOverlay({
    title: '重新開始投票',
    message: restartVoteMessage(),
    actions: [
      {
        label: '同意重新開始',
        keepOpen: true,
        pendingLabel: '已同意，等待其他玩家…',
        onClick: voteRestart,
      },
      { label: '取消', primary: false, onClick: cancelRestart },
    ],
  });
}

function updateRestartOverlay() {
  if (!game.restartActive || !ui.overlay.classList.contains('show')) return;
  const body = ui.overlay.querySelector('.breakdown');
  if (body) body.textContent = restartVoteMessage();
  const button = ui.overlay.querySelector('[data-keep-open]');
  if (button && game.restartVotes.includes(game.seat)) {
    button.disabled = true;
    button.textContent = button.dataset.pendingLabel;
  }
}

function broadcastRestartStatus() {
  if (!net.isHost) return;
  net.broadcast({
    t: 'restartStatus',
    active: game.restartActive,
    votes: [...game.restartVotes],
    required: [...game.restartRequired],
    requester: game.restartRequester,
    message: game.restartMessage,
  });
  updateRestartOverlay();
}

function addRestartVote(seat) {
  if (!game.restartVotes.includes(seat)) game.restartVotes.push(seat);
}

function startRestartVote(requester) {
  if (game.mode !== 'multi' || !net.isHost || game.restartActive) return;
  const humans = humanSeats();
  if (!humans.length) return;
  game.restartActive = true;
  game.restartRequired = humans;
  game.restartVotes = humans.includes(requester) ? [requester] : [];
  game.restartRequester = requester;
  game.restartMessage = '';
  showRestartVoteOverlay();
  broadcastRestartStatus();
  checkRestartReady();
}

function checkRestartReady() {
  if (!net.isHost || !game.restartActive) return;
  const required = game.restartRequired.length ? game.restartRequired : humanSeats();
  if (!required.length || !required.every((seat) => game.restartVotes.includes(seat))) return;
  game.restartActive = false;
  game.restartVotes = [];
  game.restartRequired = [];
  game.restartRequester = null;
  game.restartMessage = '';
  ui.overlay.classList.remove('show');
  net.broadcast({ t: 'restartNow' });
  startMultiGame();
}

function cancelRestartVote() {
  if (!net.isHost || !game.restartActive) return;
  game.restartActive = false;
  game.restartVotes = [];
  game.restartRequired = [];
  game.restartRequester = null;
  game.restartMessage = '';
  ui.overlay.classList.remove('show');
  broadcastRestartStatus();
}

/** HUD 重來這局: solo restarts immediately; multiplayer opens a vote. */
function requestRestart() {
  if (game.mode !== 'multi') {
    startGame({ keepTurn: true });
    return;
  }
  if (net.isHost) {
    startRestartVote(game.seat);
    return;
  }
  net.sendToHost({ t: 'restartRequest', seat: game.seat });
  showOverlay({
    title: '重新開始投票',
    message: '已向房主提出重新開始，等待投票。',
    actions: [{
      label: '取消請求',
      primary: false,
      onClick: () => {
        net.sendToHost({ t: 'restartCancel', seat: game.seat });
        ui.overlay.classList.remove('show');
      },
    }],
  });
}

function voteRestart() {
  if (game.mode !== 'multi' || !game.restartActive) return;
  if (net.isHost) {
    addRestartVote(game.seat);
    broadcastRestartStatus();
    checkRestartReady();
  } else {
    net.sendToHost({ t: 'restartVote', seat: game.seat });
  }
  updateRestartOverlay();
}

function cancelRestart() {
  if (game.mode !== 'multi') return;
  if (net.isHost) {
    cancelRestartVote();
  } else {
    net.sendToHost({ t: 'restartCancel', seat: game.seat });
    ui.overlay.classList.remove('show');
  }
}

function refreshRematchParticipants() {
  if (!net.isHost || ![S.WIN, S.DRAW_GAME].includes(game.state)) return;
  const humans = humanSeats();
  game.rematchRequired = humans;
  game.rematchVotes = game.rematchVotes.filter((seat) => humans.includes(seat));
  broadcastRematchStatus();
  checkRematchReady();
}

function finishMultiWin(seat, result, fanTotal, bestFan, meta = {}) {
  if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
  const selfDraw = meta.selfDraw === undefined ? winIsSelfDraw(result) : Boolean(meta.selfDraw);
  const log = recordRoundResult({
    winner: seat,
    discarder: selfDraw ? null : (meta.discarder ?? null),
    result,
    selfDraw,
  });
  if (seat === game.seat) {
    game.fanTotal = fanTotal ?? game.fanTotal + (result?.totalFan ?? 0);
    game.bestFan = bestFan ?? Math.max(game.bestFan, result?.totalFan ?? 0);
    save('mf-fantotal', game.fanTotal);
    save('mf-bestfan', game.bestFan);
  }
  clearClaim();
  clearSelfWin();
  game.claimBoxes = [];
  renderClaimBoxes();
  setState(S.WIN);
  const name = winnerName(seat);
  setStatus(`${name} 胡牌！${result?.totalFan ?? 0} 番`);
  showMultiEndOverlay(
    seat === game.seat ? '🎉 胡牌成功！' : `${name} 胡牌`,
    withMatchSummary(`遊戲結束。${formatWinBreakdown(result)}\n\n${name}：累計 ${fanTotal ?? game.fanTotal} 番　最佳 ${bestFan ?? game.bestFan} 番`, log),
    [
      ...winningTiles(result),
      ...(result?.flowers ?? []).map((id) => ({ id })),
    ],
  );
}

function applyMultiDraw() {
  if (game.state === S.WIN || game.state === S.DRAW_GAME) return;
  const log = recordRoundResult({ winner: null });
  clearClaim();
  clearSelfWin();
  game.claimBoxes = [];
  renderClaimBoxes();
  game.timeLeft = 0;
  setState(S.DRAW_GAME);
  setStatus('時間到，流局。');
  updateTimer();
  showMultiEndOverlay('流局', withMatchSummary('遊戲結束。時間到，沒有胡牌。', log));
}

function resetMultiState() {
  // Mark the intentional exit before closing the PeerJS peer: its close event
  // can fire synchronously and would otherwise show 房主已離開 to the leaver.
  game.leavingRoom = true;
  net.close();
  clearJoinWatchdog();
  game.joinOutcome = null;
  game.mode = 'solo';
  game.role = 'none';
  if (!game.playerCustomName) {
    game.playerName = DEFAULT_PLAYER_NAME;
    for (const input of [ui.menuPlayerName, ui.roomPlayerName, ui.settingsPlayerName]) {
      if (input) input.value = DEFAULT_PLAYER_NAME;
    }
  }
  game.seat = 0;
  game.roomCode = null;
  game.players = [];
  game.claimBoxes = [];
  game.claimedKeys = new Set();
  game.seatMelds = {};
  game.seatFlowers = {};
  game.aiStates = {};
  game.hookPeers = {};
  game.pendingCatch = null;
  game.fish = [];
  game.pendingAiClaims = [];
  game.mustDiscard = false;
  game.grabPending = false;
  game.pendingMultiStart = null;
  game.timeLeft = game.settings.gameSeconds;
  game.timeDeadline = 0;
  game.timeBase = game.settings.gameSeconds;
  game.timeSyncAt = 0;
  game.clockOffset = 0;
  game.restartActive = false;
  game.restartVotes = [];
  game.restartRequired = [];
  game.restartRequester = null;
  game.pendingResult = null;
  ui.overlay.classList.remove('show');
  clearNotices();
  game.state = S.LOADING;
  resetMatch(game.matchSetup);
  setMultiUIVisibility(false);
  setWaitingRoom(false);
  closeModal('joinScreen');
  closeModal('roomScreen');
  updateSettingsUI();
  game.leavingRoom = false;
}

function leaveMultiRoom() {
  if (game.mode !== 'multi') return;
  net.broadcast({
    t: 'leave', seat: game.seat, playerId: game.playerId, name: game.playerName,
  });
  resetMultiState();
  showMenu();
}

function leaveRoom() {
  if (game.mode === 'multi') {
    leaveMultiRoom();
    return;
  }
  quitToMenu();
}

function wireNetEvents() {
  net.on('guestOpen', (msg, conn) => {
    if (!net.isHost || game.mode !== 'multi') return;
    // Take a genuinely empty seat first; only replace an AI when the room has
    // no empty seats. Four human seats cannot accept another connection.
    const seat = [1, 2, 3].find((value) => game.players[value]?.isEmpty)
      ?? [1, 2, 3].find((value) => game.players[value]?.isBot);
    if (!seat || humanSeats().length >= 4) {
      conn.send({ t: 'full' });
      return;
    }
    game.players[seat] = {
      ...game.players[seat],
      isBot: false,
      isEmpty: false,
      playerId: conn.peer,
      name: botNameForSeat(seat),
    };
    conn.send({
      t: 'welcome', seat, players: game.players, settings: game.roomSettings,
    });
    net.broadcast({ t: 'players', players: game.players });
    refreshMultiBots();
    renderRoom();
    renderMeldsPanel();
  });

  net.on('join', (msg, conn) => {
    if (!net.isHost) return;
    const player = game.players.find((item) => item.playerId === conn.peer);
    if (!player) return;
    player.gamePlayerId = msg.playerId;
    if (typeof msg.name === 'string' && msg.name.trim()) {
      player.name = normalizePlayerName(msg.name);
      net.broadcast({ t: 'players', players: game.players });
      refreshMultiBots();
      renderRoom();
      renderMeldsPanel();
    }
  });

  net.on('name', (msg, conn) => {
    if (game.mode !== 'multi') return;
    if (net.isHost) {
      const player = game.players.find((item) => item.seat === msg.seat && item.playerId === conn.peer);
      if (!player || typeof msg.name !== 'string') return;
      player.name = normalizePlayerName(msg.name);
      net.broadcast({ t: 'players', players: game.players });
      refreshMultiBots();
      renderRoom();
      renderMeldsPanel();
      return;
    }
    const player = game.players.find((item) => item.seat === msg.seat);
    if (player && typeof msg.name === 'string') {
      adoptPlayersList(game.players.map((item) => item.seat === msg.seat
        ? { ...item, name: normalizePlayerName(msg.name) } : item));
      renderRoom();
    }
  });

  net.on('welcome', (msg) => {
    if (game.mode !== 'multi' || game.role !== 'guest') return;
    game.joinOutcome = 'joined';
    clearJoinWatchdog();
    if (game.roomCode) deadRooms.delete(game.roomCode);
    game.seat = msg.seat;
    adoptPlayersList(msg.players);
    game.roomSettings = { ...msg.settings };
    applyMatchSetup(normalizeMatchSetup(msg.settings));
    // Only now is the room confirmed live, so reveal the lobby.
    closeModal('joinScreen');
    openModal('roomScreen');
    setWaitingRoom(true);
    setRoomMessage(`你的座位：${seatName(msg.seat)}`);
    renderRoom();
  });

  net.on('players', (msg) => {
    adoptPlayersList(msg.players);
    renderRoom();
    renderMeldsPanel();
  });

  net.on('settings', (msg) => {
    game.roomSettings = { ...msg.settings };
    applyMatchSetup(normalizeMatchSetup(msg.settings));
    renderRoom();
  });

  net.on('start', (msg) => {
    if (net.isHost) return;
    applyMultiStart(msg);
  });

  net.on('full', () => rejectJoin('房間已滿', '房間已滿，請換一個房間。'));

  net.on('discard', (msg) => {
    if (net.isHost) {
      // A guest's message reaches us after its own deadline was stamped; use
      // the host's clock from this point on so arbitration stays consistent.
      msg.deadline = Date.now() + MULTI_CLAIM_SECONDS * 1000;
      net.broadcast(msg);
      addClaimBox(msg);
      // Guests' discards are public; the host's AI seats may contest them.
      // Reuse the same sourceKey as the public claim box so a human and an AI
      // can never both win the same discard.
      scheduleAiClaims({ id: msg.tileId, uid: msg.uid }, msg.seat, msg.sourceKey);
      return;
    }
    addClaimBox(msg);
  });

  net.on('sea', (msg) => applySea(msg));

  net.on('time', (msg) => {
    if (net.isHost || game.mode !== 'multi' || !Number.isFinite(msg.timeLeft)) return;
    if (Number.isFinite(msg.sentAt)) game.clockOffset = msg.sentAt - Date.now();
    syncRemoteTime(msg.timeLeft);
  });

  net.on('hook', (msg) => {
    // Guests can only talk to the host; relay their ghost hooks so the other
    // guests see every seat's rod, not just the host-owned AI rods.
    if (net.isHost && msg.seat !== game.seat) net.broadcast(msg);
    applyHook(msg);
  });

  net.on('catch', (msg) => {
    if (net.isHost) handleCatchRequest(msg, true);
  });

  net.on('catchRejected', (msg) => {
    if (game.pendingCatch !== msg.fishId) return;
    game.pendingCatch = null;
    setStatus('這張牌已經被釣走了！');
  });

  net.on('fishCaught', (msg) => applyFishCaught(msg));

  net.on('flowers', (msg) => {
    if (!Array.isArray(msg.flowers)) return;
    game.seatFlowers[msg.seat] = [...msg.flowers];
    // Only the host relays; guests send their own flowers straight to the host.
    if (net.isHost && msg.seat !== game.seat) net.broadcast(msg);
    renderMeldsPanel();
  });

  net.on('claim', (msg) => {
    if (net.isHost) handleClaim(msg);
  });

  net.on('claimResult', (msg) => applyClaimResult(msg));

  net.on('meld', (msg) => {
    if (msg.seat !== game.seat && msg.meld) addSeatMeld(msg.seat, msg.meld);
  });

  net.on('win', (msg) => {
    if (net.isHost && msg.seat !== game.seat) net.broadcast(msg);
    const selfDraw = msg.selfDraw === undefined ? winIsSelfDraw(msg.result) : Boolean(msg.selfDraw);
    finishMultiWin(msg.seat, msg.result, msg.fanTotal, msg.bestFan, {
      discarder: msg.discarder ?? null,
      selfDraw,
    });
  });

  net.on('match', (msg) => {
    if (!net.isHost) adoptMatch(msg.match);
  });

  net.on('draw', () => {
    if (net.isHost) net.broadcast({ t: 'draw' });
    applyMultiDraw();
  });

  net.on('rematch', (msg, conn) => {
    if (!net.isHost || ![S.WIN, S.DRAW_GAME].includes(game.state)) return;
    // The seat alone identifies the voter. Connection ids and the guest's own
    // random id are not guaranteed to match after reconnects, so requiring
    // them here can silently swallow the last vote and block the new round.
    const player = game.players.find((item) => item.seat === msg.seat && !item.isBot && !item.isEmpty);
    if (!player) return;
    addRematchVote(msg.seat);
    broadcastRematchStatus();
    checkRematchReady();
  });

  net.on('rematchStatus', (msg) => {
    if (game.mode !== 'multi') return;
    game.rematchVotes = Array.isArray(msg.votes) ? [...msg.votes] : [];
    game.rematchRequired = Array.isArray(msg.required) ? [...msg.required] : humanSeats();
    updateRematchOverlay();
  });

  const humanSeatFromMessage = (msg) => game.players.find(
    (player) => player?.seat === msg.seat && !player.isBot && !player.isEmpty,
  );

  net.on('restartRequest', (msg) => {
    if (!net.isHost || game.mode !== 'multi' || !humanSeatFromMessage(msg)) return;
    if (!game.restartActive) startRestartVote(msg.seat);
  });

  net.on('restartVote', (msg) => {
    if (!net.isHost || !game.restartActive || !humanSeatFromMessage(msg)) return;
    if (!game.restartRequired.includes(msg.seat)) return;
    addRestartVote(msg.seat);
    broadcastRestartStatus();
    checkRestartReady();
  });

  net.on('restartCancel', (msg) => {
    if (!net.isHost || !game.restartActive || !humanSeatFromMessage(msg)) return;
    cancelRestartVote();
  });

  net.on('restartStatus', (msg) => {
    if (game.mode !== 'multi' || net.isHost) return;
    game.restartActive = Boolean(msg.active);
    game.restartVotes = Array.isArray(msg.votes) ? [...msg.votes] : [];
    game.restartRequired = Array.isArray(msg.required) ? [...msg.required] : humanSeats();
    game.restartRequester = Number.isInteger(msg.requester) ? msg.requester : null;
    game.restartMessage = typeof msg.message === 'string' ? msg.message : '';
    if (!game.restartActive) {
      ui.overlay.classList.remove('show');
      return;
    }
    showRestartVoteOverlay();
  });

  net.on('restartNow', () => {
    if (net.isHost || game.mode !== 'multi') return;
    game.restartActive = false;
    game.restartVotes = [];
    game.restartRequired = [];
    game.restartRequester = null;
    game.restartMessage = '';
    ui.overlay.classList.remove('show');
  });

  function fillSeatWithBot(player) {
    if (!player || player.seat === 0) return;
    if (game.restartActive && game.restartRequired.includes(player.seat)) cancelRestartVote();
    player.isBot = true;
    player.playerId = null;
    player.name = BOT_NAMES[player.seat - 1] ?? `好友${player.seat}`;
    net.broadcast({ t: 'players', players: game.players });
    refreshMultiBots();
    renderRoom();
    renderMeldsPanel();
    refreshRematchParticipants();
  }

  net.on('leave', (msg, conn) => {
    if (!net.isHost) return;
    const name = typeof msg.name === 'string' && msg.name.trim()
      ? msg.name : seatLabel(msg.seat);
    const text = `${name} 已離開房間。`;
    showToast(text);
    net.broadcast({ t: 'notice', message: text }, conn?.peer);
    fillSeatWithBot(game.players.find((item) => item.seat === msg.seat));
  });

  net.on('notice', (msg) => {
    if (typeof msg.message === 'string') showToast(msg.message);
  });

  net.on('guestClose', (msg) => {
    if (!net.isHost) return;
    const leaving = game.players.find((item) => item.playerId === msg.peerId);
    if (!leaving) return;
    // A tab can close without sending `leave`; notify the remaining seats in
    // that case too. An explicit leave has already cleared the playerId above.
    const text = `${leaving.name || seatLabel(leaving.seat)} 已離開房間。`;
    showToast(text);
    net.broadcast({ t: 'notice', message: text });
    fillSeatWithBot(leaving);
  });

  net.on('hostClose', () => {
    if (game.leavingRoom || game.mode !== 'multi' || game.role !== 'guest') return;
    // The host is gone for good; don't let the player rejoin the same stale id.
    if (game.roomCode) deadRooms.add(game.roomCode);
    resetMultiState();
    showMenu();
    showOverlay({
      title: '房主已離開',
      message: '房主已離開，請重新開房間',
      actions: [{ label: '返回主選單', onClick: () => ui.overlay.classList.remove('show') }],
    });
  });

  net.on('error', ({ error }) => {
    if (game.joinOutcome === 'pending') {
      if (error?.message === 'peer-unavailable' && game.roomCode) deadRooms.add(game.roomCode);
      rejectJoin('無法加入房間', error?.message === 'peer-unavailable'
        ? '找不到這個房間，請確認代碼是否正確。'
        : '無法連線到房間，請檢查網路後再試。');
      return;
    }
    if (!ui.room?.classList.contains('show')) return;
    setRoomMessage('連線發生問題，請稍後再試。');
  });
}

function renderClaimBoxes() {
  if (!ui.claimBoxes) return;
  // Keep a box for every claimable discard even while the rod is out; only its
  // buttons are disabled. An empty box for an unclaimable tile is still noise.
  const actionsFor = (box) => buildClaimActions(
    box.tileId, { name: box.name, wind: box.wind }, false, { potential: true },
  );
  const boxes = game.claimBoxes.filter((box) => {
    if (box.seat === game.seat || box.resolved) return false;
    return actionsFor(box).length > 0;
  });
  ui.claimBoxes.hidden = boxes.length === 0;
  ui.claimBoxes.innerHTML = '';
  for (const box of boxes) {
    const node = document.createElement('div');
    node.className = 'claim-box';
    const who = document.createElement('span');
    who.className = 'claim-label';
    who.textContent = `${withAiTag(box.name, box.isBot)}（${TILE_INFO[box.wind]?.name ?? box.wind}）打出`;
    const tile = document.createElement('span');
    tile.className = 'claim-tile';
    addTileTo(tile, box.tileId);
    const timer = document.createElement('span');
    timer.className = 'claim-timer';
    timer.textContent = `${box.timeLeft.toFixed(1)} 秒`;
    const actions = document.createElement('span');
    actions.className = 'claim-actions';
    for (const action of actionsFor(box)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.disabled = action.disabled || box.awaiting;
      button.addEventListener('click', () => claimFromBox(box, action));
      actions.appendChild(button);
    }
    const progress = document.createElement('span');
    progress.className = 'claim-progress';
    progress.style.width = `${box.timeLeft / MULTI_CLAIM_SECONDS * 100}%`;
    node.append(who, tile, timer, actions, progress);
    box.timerEl = timer;
    box.progressEl = progress;
    ui.claimBoxes.appendChild(node);
  }
  positionClaimBoxes();
}

function positionClaimBoxes() {
  if (!ui.claimBoxes || ui.claimBoxes.hidden) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.clientHeight / WORLD_H;
  const seaTop = rect.top + WATER_TOP * scale;
  const margin = 8;
  const width = ui.claimBoxes.firstElementChild?.offsetWidth ?? 220;
  const height = ui.claimBoxes.offsetHeight;
  const left = Math.max(rect.left + margin, rect.right - margin - width);
  const top = Math.max(rect.top + margin, Math.min(
    window.innerHeight - height - margin,
    seaTop - height - 12,
  ));
  ui.claimBoxes.style.left = `${left}px`;
  ui.claimBoxes.style.top = `${top}px`;
}

function renderMeldsPanel() {
  if (!ui.meldPanel) return;
  const visible = game.state !== S.LOADING && game.players.length > 0;
  ui.meldPanel.hidden = !visible;
  if (!visible || !ui.meldRows) return;
  ui.meldRows.innerHTML = '';
  for (let seat = 0; seat < 4; seat += 1) {
    // 自己的花牌與副露已在 HUD 另行顯示，這裡只列其他三家。
    if (seat === game.seat) continue;
    const player = game.players.find((item) => item?.seat === seat)
      ?? makeBotPlayer(seat);
    const row = document.createElement('div');
    row.className = 'meld-row';
    const name = document.createElement('span');
    name.className = 'meld-row-name';
    name.textContent = playerDisplayName(player);
    row.appendChild(name);

    const flowers = game.seatFlowers[seat] ?? flowersForSeat(seat) ?? [];
    if (flowers.length) {
      const label = document.createElement('span');
      label.className = 'flowers-label';
      label.textContent = `花 ${flowers.length}`;
      row.appendChild(label);
      const set = document.createElement('div');
      set.className = 'kong-set flower-set';
      for (const id of flowers) set.appendChild(createTileElement(id, { images: game.images }));
      row.appendChild(set);
    }

    const melds = game.seatMelds[seat] ?? meldsForSeat(seat) ?? [];
    for (const meld of melds) {
      const label = document.createElement('span');
      label.className = 'flowers-label';
      label.textContent = meldLabel(meld);
      row.appendChild(label);
      const set = document.createElement('div');
      set.className = 'kong-set';
      const concealed = isConcealedKong(meld);
      meld.tiles.forEach((id, index) => {
        set.appendChild(createTileElement(id, {
          images: game.images,
          faceDown: concealed && (index === 0 || index === 3),
        }));
      });
      row.appendChild(set);
    }

    if (!flowers.length && !melds.length) {
      const empty = document.createElement('span');
      empty.className = 'meld-row-empty';
      empty.textContent = '—';
      row.appendChild(empty);
    }
    ui.meldRows.appendChild(row);
  }
}

function tickClaimBoxes() {
  let expired = false;
  const now = Date.now();
  for (const box of game.claimBoxes) {
    if (box.resolved) continue;
    box.timeLeft = Math.max(0, (box.expiresAt - now) / 1000);
    if (box.timerEl) box.timerEl.textContent = `${box.timeLeft.toFixed(1)} 秒`;
    if (box.progressEl) box.progressEl.style.width = `${box.timeLeft / MULTI_CLAIM_SECONDS * 100}%`;
    if (box.timeLeft <= 0) { box.resolved = true; expired = true; }
  }
  if (expired) renderClaimBoxes();
}

/* ------------------------------------------------------------------ *
 * Canvas rendering
 * ------------------------------------------------------------------ */

function resizeCanvas() {
  // Start the canvas below the fixed HUD so the rod, line and resting hook are
  // never hidden. HUD content is capped and scrolls internally, so only window
  // resizes (and the observer safety net) change this geometry.
  const hudBottom = ui.hud?.getBoundingClientRect().bottom ?? 0;
  canvas.style.top = `${hudBottom}px`;
  canvas.style.height = `calc(100% - ${hudBottom}px)`;
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  // A minimised/restored window can report zero dimensions. Keep the last
  // valid geometry so the world width never becomes zero or infinity and the
  // shared sea does not jump when the tab is shown again.
  if (!(width > 0) || !(height > 0)) return;
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
// The HUD height is fixed by CSS; the observer only reacts to viewport changes.
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

function hookPositionFor(angle, hookLen) {
  const baseX = view.width / 2;
  const tipX = baseX + Math.sin(angle) * ROD_LENGTH;
  const tipY = ROD_BASE_Y + Math.cos(angle) * ROD_LENGTH;
  // Safety net after a resize; normal play is bounded by swingLimit() so the
  // hook never visibly sits still against the edge.
  const hookX = Math.max(TILE_W, Math.min(
    view.width - TILE_W,
    tipX + Math.sin(angle) * hookLen,
  ));
  return { baseX, tipX, tipY, hookX, hookY: tipY + Math.cos(angle) * hookLen };
}

function hookPosition() {
  return hookPositionFor(game.rodAngle, game.hookLen);
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
    drawTile(ctx, f.tileId, f.x * view.width, f.y, f.w, f.h, {
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

function drawGhostRod(seat, position, phase, caughtTile = null, label = '') {
  const baseX = view.width / 2;
  const tipX = baseX + (position.hookX - baseX) * 0.08;
  const tipY = ROD_BASE_Y + (position.hookY - ROD_BASE_Y) * 0.08;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = seat % 2 ? '#ffd27f' : '#a9e5ff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(baseX, ROD_BASE_Y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = '#e8f4f8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(position.hookX, position.hookY);
  ctx.stroke();
  ctx.font = '40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🪝', position.hookX, position.hookY);
  // Show the grabbed tile riding the hook back up, just like the player's rod.
  if (caughtTile && phase === 'reeling') {
    const tileY = Math.min(position.hookY + 100, WORLD_H - TILE_H / 2 - 8);
    drawTile(ctx, caughtTile, position.hookX, tileY, TILE_W, TILE_H, {
      images: game.images, shadow: true,
    });
  }
  // Identifier so everyone can tell whose ghost hook this is.
  if (label) {
    const text = String(label);
    ctx.globalAlpha = 0.85;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = position.hookX + 26;
    const y = position.hookY - 26;
    const width = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(4, 32, 44, 0.75)';
    ctx.fillRect(x - 6, y - 15, width + 12, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function renderGhostRods() {
  const now = performance.now();
  for (const seat of Object.keys(game.hookPeers)) {
    if (now - game.hookPeers[seat].seen > 1500) delete game.hookPeers[seat];
  }
  for (const state of Object.values(game.aiStates)) {
    drawGhostRod(state.seat, aiHookPosition(state), state.rod.phase, state.caught, seatLabel(state.seat));
  }
  for (const [seat, hook] of Object.entries(game.hookPeers)) {
    const value = Number(seat);
    if (value === game.seat || game.aiStates[value]) continue;
    drawGhostRod(value, { hookX: hook.x * view.width, hookY: hook.y }, hook.phase,
      hook.caught, seatLabel(value));
  }
}

/** Four small player avatars beside the rod, in seat order (0–3). */
function drawPlayerAvatars() {
  const baseX = view.width / 2;
  const spread = Math.min(160, view.width / 10);
  const offsets = [-spread, -spread * 0.45, spread * 0.45, spread];
  const y = 52;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let seat = 0; seat < 4; seat += 1) {
    const player = game.players.find((item) => item?.seat === seat);
    const empty = !player || player.isEmpty;
    const x = baseX + offsets[seat];
    ctx.globalAlpha = empty ? 0.3 : 1;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = AVATAR_COLORS[seat];
    ctx.fill();
    ctx.font = '34px sans-serif';
    ctx.fillStyle = '#06384a';
    ctx.fillText(AVATAR_ICONS[seat], x, y + 1);
  }
  ctx.restore();
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
  drawPlayerAvatars();
  renderGhostRods();
  drawRod();
  positionClaimBar();
  positionClaimBoxes();
  if (!paused() && fishAuthority()) {
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
// Whenever the host pauses (hidden tab OR an open modal) the shared sea freezes
// while guests keep extrapolating. On resume we advance the host by the real
// elapsed time and publish a fresh snapshot so nobody sees a backwards snap.
let hostSeaPausedAt = 0;

function syncHostSeaPause() {
  const live = game.mode === 'multi' && net.isHost
    && ![S.LOADING, S.WIN, S.DRAW_GAME].includes(game.state);
  if (!live) { hostSeaPausedAt = 0; return; }
  if (paused()) {
    if (!hostSeaPausedAt) hostSeaPausedAt = Date.now();
  } else if (hostSeaPausedAt) {
    const elapsed = Math.min(30, Math.max(0, (Date.now() - hostSeaPausedAt) / 1000));
    hostSeaPausedAt = 0;
    if (elapsed > 0.05) {
      updateFish(elapsed);
      broadcastSeaSnapshot();
    }
  }
}

function gameLoop(timestamp) {
  const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
  lastFrame = timestamp;
  syncHostSeaPause();
  // Multiplayer time is wall-clock based: a host changing tabs cannot pause it,
  // and every guest counts down from the last host sync on its own clock.
  // LOADING is excluded too: a room lobby must never inherit a previous
  // round's expired deadline and immediately declare 流局.
  if (![S.LOADING, S.WIN, S.DRAW_GAME].includes(game.state)) {
    if (game.mode === 'multi') {
      game.timeLeft = net.isHost ? hostTimeLeft() : guestTimeLeft();
      updateTimer();
      if (net.isHost && game.timeLeft <= 0) {
        net.broadcast({ t: 'draw' });
        applyMultiDraw();
      }
    } else if (!paused()) {
      game.timeLeft = Math.max(0, game.timeLeft - dt);
      updateTimer();
      if (game.timeLeft <= 0) endDrawGame();
    }
  }
  // Claim deadlines are wall-clock based and must stay identical on every
  // screen, so they tick even while a tab's animation loop is throttled.
  tickClaimBoxes();
  if (!paused()) {
    if (game.state !== S.WIN && game.state !== S.DRAW_GAME) {
      if (game.mode !== 'multi') updateClaimTimer(dt);
      aiTick(dt);
      aiClaimTick(dt);
      broadcastHookState(dt);
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
    updateRemoteFish(dt);
    if (game.mode === 'multi' && net.isHost) {
      game.seaClock += dt;
      if (game.seaClock >= SEA_BROADCAST_INTERVAL) {
        game.seaClock = 0;
        broadcastSeaSnapshot();
      }
    }
  }
  draw(dt);
  requestAnimationFrame(gameLoop);
}

function broadcastSeaSnapshot() {
  if (game.mode !== 'multi' || !net.isHost) return;
  net.broadcast({
    t: 'sea',
    worldWidth: view.width,
    sentAt: Date.now(),
    fish: game.fish.map((fish) => ({
      id: fish.id,
      tileId: fish.tileId,
      // x is a fraction of the host sea, vx a fraction of REFERENCE_W per
      // second; both are device-independent. Never rescale them here.
      x: fish.x,
      y: fish.y,
      vx: fish.vx,
      vy: fish.vy,
      rotation: fish.rotation,
      phase: fish.phase,
      age: fish.age,
      memoryFlip: fish.memoryFlip,
    })),
  });
}

function applySea(msg) {
  if (net.isHost || !Array.isArray(msg.fish)) return;
  // x/vx are device-independent fractions from the host. Keep each fish's
  // current position and only move the snapshot target: hard-snapping ten
  // times a second looked like jitter.
  const previous = new Map(game.fish.map((fish) => [fish.id, fish]));
  game.fish = msg.fish.map((fish) => {
    const old = previous.get(fish.id);
    // Keep the snapshot's normalised coordinates; only the drawing step maps
    // them onto this device's canvas.
    const x = fish.x;
    return {
      id: fish.id,
      tileId: fish.tileId,
      x: old ? old.x : x,
      y: old ? old.y : fish.y,
      vx: fish.vx,
      vy: fish.vy,
      w: TILE_W,
      h: TILE_H,
      rotation: fish.rotation,
      phase: fish.phase,
      age: fish.age,
      memoryFlip: fish.memoryFlip,
      targetX: x,
      targetY: fish.y,
      targetAt: Date.now(),
    };
  });
}

/** Guests extrapolate between host snapshots instead of waiting/jittering. */
function updateRemoteFish(dt) {
  if (game.mode !== 'multi' || net.isHost) return;
  const minY = WATER_TOP + TILE_H / 2 + 16;
  const maxY = WATER_BOTTOM - TILE_H / 2 - 6;
  for (const fish of game.fish) {
    // Cap extrapolation so a long host outage never drifts fish absurdly far
    // before the next authoritative snapshot corrects them.
    const elapsed = Math.min(30, Math.max(0, (Date.now() - (fish.targetAt ?? Date.now())) / 1000));
    const desiredX = (fish.targetX ?? fish.x) + fish.vx * elapsed;
    const desiredY = Math.min(maxY, Math.max(minY, (fish.targetY ?? fish.y) + fish.vy * elapsed));
    const alpha = Math.min(1, dt * 12);
    fish.x += (desiredX - fish.x) * alpha;
    fish.y += (desiredY - fish.y) * alpha;
    fish.age += dt;
  }
}

function broadcastHookState(dt) {
  if (game.mode !== 'multi') return;
  game.hookClock += dt;
  if (game.hookClock < HOOK_BROADCAST_INTERVAL) return;
  game.hookClock = 0;
  const own = hookPosition();
  // A guest cannot broadcast to other guests — `net.broadcast` only iterates
  // the host's inbound connections. Send the guest's rod to the host, which
  // applies it locally and relays it to every other seat.
  broadcastOrSend({
    t: 'hook', seat: game.seat, x: own.hookX / view.width, y: own.hookY,
    phase: game.state, caught: game.state === S.REELING ? game.lastDraw?.id ?? null : null,
  });
  for (const state of Object.values(game.aiStates)) {
    const position = aiHookPosition(state);
    net.broadcast({
      t: 'hook', seat: state.seat,
      x: position.hookX / view.width, y: position.hookY,
      phase: state.rod.phase, caught: state.caught ?? null,
    });
  }
}

function applyHook(msg) {
  if (msg.seat === game.seat) return;
  game.hookPeers[msg.seat] = {
    x: msg.x, y: msg.y, phase: msg.phase, caught: msg.caught ?? null, seen: performance.now(),
  };
}

function spawnFish(count) {
  if (!fishAuthority() || paused() || game.state === S.LOADING
    || game.state === S.WIN || game.state === S.DRAW_GAME) return;
  for (let i = 0; i < count && game.fish.length < MAX_FISH; i += 1) {
    const direction = Math.random() < 0.5 ? 1 : -1;
    const speed = (85 + Math.random() * 95) * difficulty();
    // A little per-tile variance means two fish never drift in lockstep.
    const speedFactor = 0.8 + Math.random() * 0.4;
    const minY = WATER_TOP + TILE_H / 2 + 30;
    const maxY = WATER_BOTTOM - TILE_H / 2 - 10;
    game.fish.push({
      id: `f${++game.fishSeq}`,
      tileId: randomTileKind(),
      x: direction > 0 ? -TILE_W / view.width : 1 + TILE_W / view.width,
      y: minY + Math.random() * (maxY - minY),
      // Use a fixed reference width, never the host's current canvas width.
      // Otherwise a phone host (narrow sea) makes fish race across every PC
      // guest's much wider screen, and a host rotation rewrites all speeds.
      vx: speed * speedFactor * direction / REFERENCE_W,
      vy: (Math.random() - 0.5) * 34 * speedFactor,
      w: TILE_W, h: TILE_H,
      rotation: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      memoryFlip: Math.random() < MEMORY_FLIP_CHANCE,
    });
  }
  broadcastSeaSnapshot();
}

function updateFish(dt) {
  if (!fishAuthority()) return;
  const minY = WATER_TOP + TILE_H / 2 + 16;
  const maxY = WATER_BOTTOM - TILE_H / 2 - 6;
  game.fish = game.fish.filter((fish) => {
    fish.age += dt;
    fish.x += fish.vx * dt;
    fish.y += fish.vy * dt;
    if (fish.y < minY || fish.y > maxY) {
      fish.y = Math.min(maxY, Math.max(minY, fish.y));
      fish.vy *= -1;
    }
    // The endless pool never recycles fish; they simply swim off screen.
    const margin = TILE_W * 2 / view.width;
    return fish.x >= -margin && fish.x <= 1 + margin;
  });
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */

function updateScoreUI() {
  if (ui.moneyCount) {
    ui.moneyCount.textContent = game.match
      ? formatMoney(game.match.money[game.seat] ?? 0) : '—';
  }
  if (ui.scoreRoundInfo) {
    const match = game.match;
    if (!match) {
      ui.scoreRoundInfo.textContent = '尚未開始';
    } else {
      const wind = WINDS[windIndexFor(match)];
      const pieces = [
        `${TILE_INFO[wind]?.name ?? wind}風第 ${match.handNumber % 4 + 1} 局`,
        `${match.winds} 圈`,
        `金額倍數 ${match.base}×`,
      ];
      if (match.repeatCount) pieces.push(`連莊 ${match.repeatCount}`);
      if (match.over) pieces.push('比賽結束');
      ui.scoreRoundInfo.textContent = pieces.join('・');
    }
  }
  if (ui.scoreStandings) {
    ui.scoreStandings.innerHTML = '';
    const match = game.match;
    if (!match) {
      ui.scoreStandings.innerHTML = '<div class="score-empty">開始遊戲後顯示資金。</div>';
    } else {
      const rows = match.money
        .map((value, seat) => ({ value, seat }))
        .sort((a, b) => b.value - a.value);
      rows.forEach(({ value, seat }, index) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        if (seat === game.seat) row.classList.add('you');
        if (seat === match.dealerSeat) row.classList.add('dealer');
        const rank = document.createElement('span');
        rank.textContent = String(index + 1);
        const name = document.createElement('span');
        name.className = 'score-seat';
        const wind = TILE_INFO[seatWindOf(seat)]?.name ?? '';
        const suffix = seat === game.seat ? '（你）' : '';
        name.textContent = `${wind} ${scoreSeatName(seat)}${suffix}`;
        const money = document.createElement('span');
        money.className = 'score-money';
        money.textContent = formatMoney(value);
        row.append(rank, name, money);
        ui.scoreStandings.appendChild(row);
      });
    }
  }
  if (ui.scoreHistory) {
    ui.scoreHistory.innerHTML = '';
    const history = [...(game.match?.history ?? [])].reverse();
    if (!history.length) {
      ui.scoreHistory.innerHTML = '<div class="score-empty">尚無派彩紀錄。</div>';
    } else {
      for (const log of history) {
        const item = document.createElement('div');
        item.className = `score-history-item${log.winner === null ? ' draw' : ''}`;
        const detail = log.winner === null
          ? '流局'
          : `${scoreSeatName(log.winner)} ${log.fan} 番・${log.selfDraw
            ? `自摸 三家各 ${formatMoney(log.payout.each)}`
            : `放槍 ${scoreSeatName(log.discarder)} 付 ${formatMoney(log.payout.value)}`}`;
        item.textContent = `第 ${log.windIndex * 4 + 1} 局　${detail}${log.dealerWon ? '・連莊' : ''}`;
        ui.scoreHistory.appendChild(item);
      }
    }
  }
}

function updateHUD() {
  updateScoreUI();
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
  // A newly fished tile can unlock 碰／上／胡 on a discard that is still inside
  // the five-second window, so recompute which boxes are actionable here.
  renderClaimBoxes();
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
    // A meld locks claims until the forced discard is made; recompute here so
    // a pending bot tile never offers an illegal second call in the same turn.
    const allowed = action.type === 'win' ? canDeclareClaim()
      : action.type ? canDeclareMeld() : true;
    if (!allowed) continue;
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

/** Inline 胡牌／開槓／過 prompt on the left of the rod. */
function renderSelfWin() {
  if (!ui.selfWinBar) return;
  const pending = game.pendingSelfWin;
  ui.selfWinBar.hidden = !pending;
  ui.selfWinBar.classList.toggle('actionable', Boolean(pending));
  if (ui.selfWinTile) ui.selfWinTile.innerHTML = '';
  if (ui.selfWinActions) ui.selfWinActions.innerHTML = '';
  if (!pending) return;

  const isWin = Boolean(pending.result?.isWin);
  const kongOnly = !isWin && Boolean(pending.kongTile);
  if (ui.selfWinLabel) ui.selfWinLabel.textContent = kongOnly ? '暗槓機會' : '可以胡牌！';
  const tileId = isWin ? pending.result.winningTile : pending.kongTile;
  if (ui.selfWinTile && tileId) addTileTo(ui.selfWinTile, tileId);

  const actions = [];
  if (isWin) {
    actions.push({ label: '胡牌', onClick: () => { clearSelfWin(); commitWin(pending.result); } });
  }
  if (pending.kongTile) {
    actions.push({
      label: kongOnly ? '開槓' : `開槓（${tileName(pending.kongTile)}）`,
      onClick: () => { clearSelfWin(); declareKong(pending.kongTile); },
    });
  }
  actions.push({
    label: kongOnly ? '不開槓' : '過',
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
  if (dt > 0 && game.claimTimeLeft <= 0) clearClaim();
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
  // The shared pool is endless, so wait hints are not limited by tile counts.
  for (const tile of game.hand) {
    const after = game.hand.filter((t) => t.uid !== tile.uid).map((t) => t.id);
    const waits = findWaits(after, game.melds, winContext(), null);
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

  // The pool is endless, so waits are never limited by remaining tile counts.
  const waits = findWaits(concealedIds(), game.melds, winContext(), null);
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
    if (action.keepOpen) {
      button.dataset.keepOpen = '1';
      button.dataset.pendingLabel = action.pendingLabel ?? '已同意';
    }
    button.addEventListener('click', () => {
      if (action.keepOpen) {
        button.disabled = true;
        button.textContent = button.dataset.pendingLabel;
        action.onClick();
        return;
      }
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
  const open = [...document.querySelectorAll('.modal.show')]
    .filter((m) => m !== ui.loading && m !== ui.menu);
  if (open.length) closeModal(open[open.length - 1].id);
}

/** Title screen shown after assets load, before the first round is dealt. */
function showMenu() {
  if (ui.menuTiles) {
    ui.menuTiles.innerHTML = '';
    for (const id of ['m1', 'm2', 'm3', 'p2', 'p3', 'p4', 's7', 's7']) {
      addTileTo(ui.menuTiles, id);
    }
  }
  if (ui.menuRecord) ui.menuRecord.textContent = `最佳紀錄：${game.bestFan} 番`;
  ui.menu?.classList.add('show');
}

/** Leave the title screen and open the solo lobby (AI seats filled automatically). */
function startFromMenu() {
  openSoloRoom();
}

/** Quit the current round from settings and return to the title screen. */
function quitToMenu() {
  closeModal('settingsPanel');
  closeModal('joinScreen');
  closeModal('roomScreen');
  clearClaim();
  clearSelfWin();
  game.pendingResult = null;
  if (game.mode === 'multi') {
    net.broadcast({
      t: 'leave', seat: game.seat, playerId: game.playerId, name: game.playerName,
    });
    resetMultiState();
  } else {
    game.state = S.LOADING;
    game.pendingResult = null;
    resetMatch(game.matchSetup);
  }
  ui.overlay.classList.remove('show');
  setWaitingRoom(false);
  showMenu();
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

function currentMatchSetup() {
  return normalizeMatchSetup({
    startingMoney: ui.matchStartingMoney?.value ?? game.matchSetup.startingMoney,
    winds: ui.matchWinds?.value ?? game.matchSetup.winds,
    base: ui.matchBase?.value ?? game.matchSetup.base,
  });
}

function updateMatchSettings() {
  const setup = currentMatchSetup();
  applyMatchSetup(setup);
  renderMatchSettingsUI();
}

/** The typed values are kept in sync with the sliders for very large purses. */
function renderMatchSettingsUI() {
  const setup = game.matchSetup;
  if (ui.matchStartingMoney) ui.matchStartingMoney.value = String(setup.startingMoney);
  if (ui.matchStartingMoneyValue) ui.matchStartingMoneyValue.textContent = formatMoney(setup.startingMoney);
  if (ui.matchStartingMoneyText && document.activeElement !== ui.matchStartingMoneyText) {
    ui.matchStartingMoneyText.value = String(setup.startingMoney);
  }
  if (ui.matchWinds) ui.matchWinds.value = String(setup.winds);
  if (ui.matchBase) ui.matchBase.value = String(setup.base);
  if (ui.matchBaseValue) ui.matchBaseValue.textContent = `${setup.base}×`;
  if (ui.matchBaseText && document.activeElement !== ui.matchBaseText) {
    ui.matchBaseText.value = String(setup.base);
  }
}

function commitMatchMoneyText() {
  const setup = normalizeMatchSetup({
    ...currentMatchSetup(),
    startingMoney: clampInt(ui.matchStartingMoneyText?.value, MIN_STARTING_MONEY, MAX_STARTING_MONEY, game.matchSetup.startingMoney),
  });
  applyMatchSetup(setup);
  renderMatchSettingsUI();
}

function commitMatchBaseText() {
  const setup = normalizeMatchSetup({
    ...currentMatchSetup(),
    base: clampInt(ui.matchBaseText?.value, MIN_BASE, MAX_BASE, game.matchSetup.base),
  });
  applyMatchSetup(setup);
  renderMatchSettingsUI();
}

function updateSettingsUI() {
  renderMatchSettingsUI();
  if (ui.settingsPlayerName) ui.settingsPlayerName.value = game.playerName;
  ui.gameDuration.value = String(game.settings.gameSeconds);
  ui.gameDurationValue.textContent = formatClock(game.settings.gameSeconds);
  ui.gameDurationText.value = formatClock(game.settings.gameSeconds);
  ui.settingsSound.checked = game.settings.sound;
  ui.musicVolume.value = String(Math.round(game.settings.musicVolume * 100));
  ui.musicVolumeValue.textContent = `${Math.round(game.settings.musicVolume * 100)}%`;
  ui.hookSpeed.value = String(game.hookSpeed);
  ui.hookSpeedValue.textContent = `${game.hookSpeed.toFixed(1)}×`;
  // The room host picks these before the round starts; nobody may change them
  // mid-game or the four screens would drift apart.
  const locked = game.mode === 'multi' || Boolean(game.match?.active);
  for (const input of [ui.hookSpeed, ui.gameDuration, ui.gameDurationText]) {
    if (!input) continue;
    input.disabled = locked;
    input.closest('.field')?.classList.toggle('disabled', locked);
  }
  // Scoring is chosen before the first deal. Once a solo match is underway it
  // is locked just like the host's room settings.
  const scoringLocked = locked || Boolean(game.match?.active);
  for (const input of [
    ui.matchStartingMoney, ui.matchStartingMoneyText, ui.matchWinds,
    ui.matchBase, ui.matchBaseText,
  ]) {
    if (!input) continue;
    input.disabled = scoringLocked;
    input.closest('.field')?.classList.toggle('disabled', scoringLocked);
  }
  ui.matchStartingMoney?.closest('.match-setup')?.classList.toggle('disabled', scoringLocked);
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
  wireNetEvents();
  // Browsers require a user gesture before audio can play.
  document.addEventListener('pointerdown', unlockMusic);
  document.addEventListener('keydown', unlockMusic);
  document.addEventListener('visibilitychange', () => {
    // Sea catch-up is unified in syncHostSeaPause() so a hidden tab and an
    // open modal behave identically (both call paused()). rAF is throttled
    // while hidden, so call it here too — otherwise the gameLoop never gets a
    // chance to record when the pause started.
    if (document.hidden) {
      music.suspend();
      syncHostSeaPause();
    } else {
      if (game.settings.sound) music.resume();
      syncHostSeaPause();
      // A background tab's rAF timestamp is stale; restart the frame clock.
      lastFrame = performance.now();
    }
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startCast();
  });
  ui.menuStart.addEventListener('click', openSoloRoom);
  ui.menuHost.addEventListener('click', openRoom);
  ui.menuJoin.addEventListener('click', askRoomCode);
  ui.joinSubmit.addEventListener('click', joinRoom);
  ui.joinBack.addEventListener('click', () => {
    closeModal('joinScreen');
    showMenu();
  });
  ui.joinRoomCode.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); joinRoom(); }
  });
  for (const input of [ui.menuPlayerName, ui.roomPlayerName, ui.settingsPlayerName]) {
    if (!input) continue;
    input.addEventListener('change', commitPlayerNameInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
  }
  ui.roomStart.addEventListener('click', startRoomGame);
  ui.roomLeave.addEventListener('click', leaveRoom);
  ui.roomCopy.addEventListener('click', copyRoomLink);
  ui.roomHookSpeed.addEventListener('input', updateRoomSettings);
  ui.roomGameDuration.addEventListener('input', updateRoomSettings);
  ui.roomStartingMoney?.addEventListener('input', updateRoomSettings);
  ui.roomWinds?.addEventListener('change', updateRoomSettings);
  ui.roomBase?.addEventListener('input', updateRoomSettings);
  ui.roomStartingMoneyText?.addEventListener('change', commitRoomMoneyText);
  ui.roomBaseText?.addEventListener('change', commitRoomBaseText);
  for (const [input, commit] of [
    [ui.roomStartingMoneyText, commitRoomMoneyText],
    [ui.roomBaseText, commitRoomBaseText],
    [ui.roomGameDurationText, commitRoomDurationText],
  ]) {
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commit();
      input.blur();
    });
  }
  ui.roomGameDurationText.addEventListener('change', commitRoomDurationText);
  el('menuHelp').addEventListener('click', () => openModal('helpPanel'));
  el('menuSettings').addEventListener('click', () => openModal('settingsPanel'));
  el('menuCredits').addEventListener('click', () => openModal('creditsPanel'));
  el('restartBtn').addEventListener('click', () => { closeTopModal(); requestRestart(); });
  el('helpBtn').addEventListener('click', () => openModal('helpPanel'));
  el('settingsBtn').addEventListener('click', () => openModal('settingsPanel'));
  el('creditsBtn').addEventListener('click', () => openModal('creditsPanel'));
  ui.scoreBtn?.addEventListener('click', () => {
    updateScoreUI();
    openModal('scorePanel');
  });
  ui.matchStartingMoney?.addEventListener('input', updateMatchSettings);
  ui.matchWinds?.addEventListener('change', updateMatchSettings);
  ui.matchBase?.addEventListener('input', updateMatchSettings);
  ui.matchStartingMoneyText?.addEventListener('change', commitMatchMoneyText);
  ui.matchBaseText?.addEventListener('change', commitMatchBaseText);
  for (const [input, commit] of [
    [ui.matchStartingMoneyText, commitMatchMoneyText],
    [ui.matchBaseText, commitMatchBaseText],
  ]) {
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commit();
      input.blur();
    });
  }
  el('settingsQuit').addEventListener('click', quitToMenu);
  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  }
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal && modal.id !== 'overlay'
        && modal.id !== 'loading' && modal.id !== 'menuScreen'
        && modal.id !== 'joinScreen' && modal.id !== 'roomScreen') {
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
  resetMatch(game.matchSetup);
  music.setVolume(game.settings.musicVolume);
  music.setEnabled(game.settings.sound);
  setInterval(broadcastHostTime, 500);
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
  showMenu();
  // A shared ?room=XXXX link drops straight into that room's lobby.
  const roomParam = normalizeRoomCode(new URLSearchParams(location.search).get('room'));
  if (roomParam.length === 4 && game.mode === 'solo') {
    if (ui.joinRoomCode) ui.joinRoomCode.value = roomParam;
    joinRoom();
  }
  requestAnimationFrame(gameLoop);
}

/* Optional, query-string-only hook for automated/manual state-machine tests.
   Normal play never exposes internal state. */
if (new URLSearchParams(location.search).has('test')) {
  window.__mf = {
    game, S, view,
    handFrom: (ids) => ids.map((id) => ({ id, uid: game.nextUid++ })),
    setState, resolveDraw, declareKong, commitWin, endDrawGame, startGame,
    renderHand, renderTarget, updateHUD, findKongTile, hookPosition, music,
    paceFactor, GAME_SECONDS, MIN_GAME_SECONDS, MAX_GAME_SECONDS, setGameSeconds, formatClock, parseClock,
    HAIDI_SECONDS, winContext, openingWinContext, checkCatch, randomTileKind, analyzeDiscards, selectDiscard,
    finishReel, startCast, renderFlowers, checkInitialSelfDraw, checkAiOpeningWins, hookPositionFor,
    MEMORY_FLIP_CHANCE, MEMORY_FLIP_DELAY, MEMORY_FLIP_DURATION, CLAIM_SECONDS, fishFaceDown,
    discard, nextBotDiscard, passClaim, buildClaimActions, chooseOpponentDiscardKind,
    previousWind, canChowFrom, botLabel, positionClaimBar,
    chowCombinations, claimWinResult, declareOpenMeld, renderMelds, renderClaim,
    renderSelfWin, clearSelfWin, positionSelfWinBar, setMusicVolume,
    showMenu, startFromMenu, openSoloRoom, startRoomGame, quitToMenu, net, openRoom, joinRoom,
    askRoomCode, setPlayerName, leaveRoom,
    voteRematch, showMultiEndOverlay, requestRestart, startRestartVote, voteRestart, cancelRestart,
    updateClaimTimer, maxHookLength, swingLimit, spawnFish,
    renderMeldsPanel, handleCatchRequest, applyFishCaught, applySea, applyHook,
    aiTick, createAiState, resetAiRod, publishDiscard, scheduleAiClaims, bestAiClaim,
    canDeclareClaim, canDeclareMeld, handReadyForClaim, claimFromBox, handleClaim, aiClaimStillValid,
    addClaimBox, tickClaimBoxes, hostTimeLeft, guestTimeLeft, syncRemoteTime, broadcastHostTime,
    updateRemoteFish, showToast, rejectJoin, clearJoinWatchdog, broadcastHookState,
    renderClaimBoxes, leaveMultiRoom, deadRooms, commitRoomDurationText, renderRoom,
    syncHostSeaPause, updateFish, broadcastSeaSnapshot,
    resetMatch, cloneMatch, adoptMatch, recordRoundResult, payoutSummary,
    updateScoreUI, normalizeMatchSetup, windIndexFor, seatZeroWind,
    updateRoomSettings, currentRoomMatchSetup, updateMatchSettings,
  };
}

boot();
