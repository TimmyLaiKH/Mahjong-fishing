/*
 * Pure Hong Kong mahjong rules engine.
 *
 * No DOM, no timers, no globals that change during play. Everything the game
 * and the test suite need is passed in explicitly via evaluateHand() and
 * friends. Tile ids are the stable strings from tiles.js (m1..m9, p1..p9,
 * s1..s9, E/S/W/N, C/F/B).
 */
import {
  TILE_IDS, TILE_INFO, FLOWER_IDS, FLOWER_INFO, SEASON_IDS, PLANT_IDS,
} from './tiles.js';

export const WINDS = ['E', 'S', 'W', 'N'];
export const DRAGONS = ['C', 'F', 'B'];
export const TERMINALS = ['m1', 'm9', 'p1', 'p9', 's1', 's9'];
export const ORPHANS = [...TERMINALS, ...WINDS, ...DRAGONS];

// Custom 10-fan colour hands from the HK fan table.
const GREEN_TILES = new Set(['s2', 's3', 's4', 's6', 's8', 'F']);
const BLUE_TILES = new Set(['E', 'S', 'W', 'N', 'B', 'p8']);

// Tile universes of the special pattern families. The AI assist uses these to
// steer toward any pattern, not just the ordinary four-sets-and-a-pair hand.
const HONOR_TILES = new Set([...WINDS, ...DRAGONS]);
const TERMINAL_SET = new Set(TERMINALS);
const ORPHAN_SET = new Set(ORPHANS);
const SUIT_TILES = ['m', 'p', 's'].map((suit) => new Set(TILE_IDS.filter((id) => id.startsWith(suit))));
const SUIT_PREFIXES = ['m', 'p', 's'];

/** All fan values live in one configurable object (see README / CHANGELOG). */
export const FAN_VALUES = Object.freeze({
  '雞糊': 0,
  '平糊': 1,
  '門前清': 1,
  '自摸': 1,
  '番子': 1,          // per dragon / seat-wind / round-wind role; double wind counts 2
  '海底撈月': 1,       // 最後 5 秒胡牌；自摸或胡他人打出牌皆計，自摸另計
  '無花': 1,          // flower patterns: 見evaluateFlowers()
  '正花': 1,
  '一檯花': 2,
  '花糊': 3,          // 七花：三番，已含自摸
  '槓上開花': 2,
  '搶槓': 1,          // 聽牌者搶別家槓出的牌；被搶者視作出銃
  '混一色': 3,
  '花么九': 4,        // 香港麻雀總例：花么 1 番另加對對糊 3 番
  '小三元': 5,
  '小四喜': 10,
  '清一色': 7,
  '七對子': 3,        // 自訂牌型；香港稱「嚦咕嚦咕」，不要再叫「花糊」
  '大三元': 8,
  '坎坎胡': 10,
  '對對糊': 3,         // 只有刻子的牌型；坎坎胡不另計此項
  '連槓開花': 10,
  '大花糊': 10,       // 八仙過海，已含自摸
  '字一色': 10,
  '清么九': 10,
  '九子連環': 10,
  '大四喜': 10,
  '十三么': 10,
  '十八羅漢': 10,
  '綠一色': 10,       // 自訂牌型
  '藍一色': 10,       // 自訂牌型
  '天胡': 10,        // 開局補花後立即自摸，必為門前清，不再另計自摸
  '地胡': 10,        // 閒家食莊家開局第一隻打出牌，不再另計自摸
  '人胡': 10,        // 閒家開局第一釣自摸，必為門前清，不再另計自摸
  // 自訂牌型（粵語維基；原十三番改為十番）
  '一般高': 1, '一般低': 1, '缺門': 1,
  '三般高': 2, '三般低': 2, '一條龍': 2,
  '兩般高': 3, '兩般低': 3, '鏡糊糊': 3, '四般高': 3, '四般低': 3,
  '三槓子': 3, '三喜臨門': 3, '雙色同刻': 3, '四歸四': 3,
  '萬綠叢中一點紅': 10, '百萬石': 10, '紅孔雀': 10,
});

/** No upper limit: a hand keeps every fan it scores. */
export const FAN_CAP = Infinity;

/** Order table rows by fan, keeping custom patterns after official and flower ones. */
export function sortPatternRows(rows) {
  const isCustom = (row) => row.category === '自訂牌型';
  return [...rows].sort((a, b) => (isCustom(a) - isCustom(b)) || (a.fan - b.fan));
}

/**
 * The pattern table used both by evaluateHand() and by the in-game
 * 牌型一覽. Every example is validated by tests/rules.test.mjs.
 */
export const PATTERN_TABLE = Object.freeze([
  {
    id: '雞糊', fan: 0, desc: '四組一將，沒有其他牌型。',
    example: {
      concealed: ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's2', 's3', 's4', 'E', 'E'],
      melds: [{ tile: 'm9', type: 'pung', tiles: ['m9', 'm9', 'm9'], open: true }],
      context: {},
    },
  },
  {
    id: '平糊', fan: 1, desc: '四組順子加一對將（可為字牌）。',
    example: { concealed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p2', 'p3', 'p4', 's7', 's8', 's9', 'p9', 'p9'], melds: [], context: {} },
  },
  {
    id: '門前清', fan: 1, desc: '沒有上、碰、槓（包括暗槓）；自摸或吃胡他人打出的牌都計。',
    example: { concealed: ['m1', 'm2', 'm3', 'p2', 'p3', 'p4', 's2', 's3', 's4', 's7', 's8', 's9', 'p9', 'p9'], melds: [], context: {} },
  },
  {
    id: '自摸', fan: 1, desc: '自己摸到胡牌。',
    example: { concealed: ['m1', 'm2', 'm3', 'p2', 'p3', 'p4', 's2', 's3', 's4', 's7', 's8', 's9', 'p9', 'p9'], melds: [], context: {} },
  },
  {
    id: '番子', fan: 1, desc: '每組中、發、白或場風／門風刻子各加一番；場風與門風重疊時計兩番，胡牌細項會標明是哪一種。',
    example: { concealed: ['C', 'C', 'C', 'm2', 'm3', 'm4', 'p2', 'p3', 'p4', 's7', 's8', 's9', 'E', 'E'], melds: [], context: {} },
  },
  {
    id: '海底撈月', fan: 1, desc: '倒數剩餘 5 秒內胡牌。',
    example: { concealed: ['m1', 'm2', 'm3', 'p2', 'p3', 'p4', 's2', 's3', 's4', 's7', 's8', 's9', 'p9', 'p9'], melds: [], context: { haidi: true } },
  },
  {
    id: '槓上開花', fan: 2, desc: '開槓後補摸的第一張牌就胡牌（已含自摸）。',
    example: {
      concealed: ['m2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p4', 'p4', 'p4', 'E', 'E'],
      melds: [{ tile: 'm1', type: 'kong', tiles: ['m1', 'm1', 'm1', 'm1'] }],
      context: { kongReplacementChain: 1 },
    },
  },
  {
    id: '搶槓', fan: 1, desc: '聽牌時別家槓出自己所聽之牌即可胡牌並加 1 番；暗槓只有十三么可搶，被搶槓者視作出銃。',
    example: {
      concealed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p2', 'p3', 'p4', 's7', 's8', 's9', 'p9', 'p9'],
      melds: [],
      context: { selfDraw: false, qianggang: true },
    },
  },
  {
    id: '混一色', fan: 3, desc: '一門花色加字牌組成的胡牌。',
    example: { concealed: ['m1', 'm1', 'm1', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'E', 'E', 'E', 'S', 'S'], melds: [], context: {} },
  },
  {
    id: '花么九', fan: 4, desc: '全部由么九牌及字牌的刻子／槓子與一對將組成；基本 1 番另加對對糊 3 番，合計 4 番（香港麻雀協會《香港麻雀總例》稱「花么」）。',
    example: { concealed: ['m1', 'm1', 'm1', 'p9', 'p9', 'p9', 's1', 's1', 's1', 'E', 'E', 'E', 'C', 'C'], melds: [], context: {} },
  },
  {
    id: '小三元', fan: 5, desc: '以全部三種三元牌組成兩副刻子加一對將（已含兩組番子）。',
    example: { concealed: ['C', 'C', 'C', 'F', 'F', 'F', 'B', 'B', 'm1', 'm2', 'm3', 'p4', 'p5', 'p6'], melds: [], context: {} },
  },
  {
    id: '小四喜', fan: 10, desc: '三種不同風牌刻子加剩下一種風牌將。',
    example: { concealed: ['E', 'E', 'E', 'S', 'S', 'S', 'W', 'W', 'W', 'N', 'N', 'm1', 'm2', 'm3'], melds: [], context: {} },
  },
  {
    id: '清一色', fan: 7, desc: '全部由同一門花色組成。',
    example: { concealed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm2', 'm3', 'm4', 'm9', 'm9'], melds: [], context: {} },
  },
  {
    id: '七對子', fan: 3, category: '自訂牌型', desc: '自訂牌型：門前清七種不同牌各一對（又稱嚦咕嚦咕）；四張相同牌不能當兩對。香港麻雀協會《香港麻雀總例》沒有此番種。',
    example: { concealed: ['m1', 'm1', 'm3', 'm3', 'p2', 'p2', 'p7', 'p7', 's4', 's4', 'E', 'E', 'C', 'C'], melds: [], context: {} },
  },
  {
    id: '大三元', fan: 8, desc: '集齊中、發、白三個刻子（已含小三元及中、發、白番子）。',
    example: { concealed: ['C', 'C', 'C', 'F', 'F', 'F', 'B', 'B', 'B', 'm1', 'm2', 'm3', 'm9', 'm9'], melds: [], context: {} },
  },
  {
    id: '坎坎胡', fan: 10, desc: '沒有碰、槓過的對對胡（又稱四暗刻；已含對對糊、門前清）。自摸成立；胡他人打出牌時必須是單騎。',
    example: { concealed: ['m1', 'm1', 'm1', 'p2', 'p2', 'p2', 's3', 's3', 's3', 'E', 'E', 'E', 'C', 'C'], melds: [], context: {} },
  },
  {
    id: '對對糊', fan: 3, desc: '只有刻子的牌型。',
    example: {
      concealed: ['m2', 'm2', 'm2', 's3', 's3', 's3', 'E', 'E', 'E', 'C', 'C'],
      melds: [{ tile: 'p2', type: 'pung', tiles: ['p2', 'p2', 'p2'], open: true }],
      context: {},
    },
  },
  {
    id: '連槓開花', fan: 10, desc: '連續開兩次或以上槓後，補摸的第一張牌胡牌（香港麻雀協會《香港麻雀總例》稱「槓上槓自摸」；已含槓上開花、自摸）。',
    example: {
      concealed: ['m3', 'm3', 'm3', 's4', 's4', 's4', 'E', 'E'],
      melds: [
        { tile: 'm1', type: 'kong', tiles: ['m1', 'm1', 'm1', 'm1'] },
        { tile: 'p2', type: 'kong', tiles: ['p2', 'p2', 'p2', 'p2'] },
      ],
      context: { kongReplacementChain: 2 },
    },
  },
  {
    id: '字一色', fan: 10, desc: '全部由字牌組成（香港麻雀協會《香港麻雀總例》稱「全番子」；已含花么九、對對糊與場風／門風番子）。',
    example: { concealed: ['E', 'E', 'E', 'S', 'S', 'S', 'W', 'W', 'W', 'C', 'C', 'C', 'B', 'B'], melds: [], context: {} },
  },
  {
    id: '清么九', fan: 10, desc: '全部由各花色的么九牌（一、九）組成，不含字牌。',
    example: { concealed: ['m1', 'm1', 'm1', 'p1', 'p1', 'p1', 's9', 's9', 's9', 'm9', 'm9', 'm9', 'p9', 'p9'], melds: [], context: {} },
  },
  {
    id: '九子連環', fan: 10, desc: '門前清，同一花色 1112345678999 再加任意一張同花色牌（已含清一色、門前清）；聽牌時也可胡他人打出牌。',
    example: { concealed: ['m1', 'm1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm9', 'm9', 'm5'], melds: [], context: {} },
  },
  {
    id: '天胡', fan: 10, desc: '開局補花後立即自摸；必為門前清，不另計自摸。',
    example: {
      concealed: ['m1', 'm1', 'm1', 'm2', 'm3', 'm4', 'p5', 'p6', 'p7', 's2', 's3', 's4', 'E', 'E'],
      melds: [],
      context: { tiangu: true },
    },
  },
  {
    id: '地胡', fan: 10, desc: '開局後，閒家食莊家打出的第一隻牌。',
    example: {
      concealed: ['m1', 'm1', 'm1', 'm2', 'm3', 'm4', 'p5', 'p6', 'p7', 's2', 's3', 's4', 'E', 'E'],
      melds: [],
      context: { dihuClaim: true, selfDraw: false },
    },
  },
  {
    id: '人胡', fan: 10, category: '自訂牌型', desc: '自訂牌型：閒家於開局第一輪即自摸；必為門前清，不另計自摸。香港麻雀協會《香港麻雀總例》沒有此番種。',
    example: {
      concealed: ['m1', 'm1', 'm1', 'm2', 'm3', 'm4', 'p5', 'p6', 'p7', 's2', 's3', 's4', 'E', 'E'],
      melds: [],
      context: { renhu: true },
    },
  },
  {
    id: '大四喜', fan: 10, desc: '東南西北四組風牌刻子（已含小四喜、對對糊及場風、門風番子）。',
    example: { concealed: ['E', 'E', 'E', 'S', 'S', 'S', 'W', 'W', 'W', 'N', 'N', 'N', 'C', 'C'], melds: [], context: {} },
  },
  {
    id: '十三么', fan: 10, desc: '集齊六種么九牌及七種字牌牌，再加其中一張。',
    example: { concealed: ['m1', 'm9', 'p1', 'p9', 's1', 's9', 'E', 'S', 'W', 'N', 'C', 'F', 'B', 'B'], melds: [], context: {} },
  },
  {
    id: '十八羅漢', fan: 10, desc: '四個槓子加一對將。',
    example: {
      concealed: ['m1', 'm1'],
      melds: ['m2', 'm3', 'p4', 's5'].map((tile) => ({ tile, type: 'kong', tiles: [tile, tile, tile, tile] })),
      context: {},
    },
  },
  {
    id: '綠一色', fan: 10, category: '自訂牌型', desc: '自訂牌型：全部由二、三、四、六、八索或發財組成。香港麻雀協會《香港麻雀總例》沒有此番種。',
    example: { concealed: ['s2', 's3', 's4', 's2', 's3', 's4', 's6', 's6', 's6', 'F', 'F', 'F', 's8', 's8'], melds: [], context: {} },
  },
  {
    id: '藍一色', fan: 10, category: '自訂牌型', desc: '自訂牌型：全部由東、南、西、北、白板或八筒組成。香港麻雀協會《香港麻雀總例》沒有此番種。',
    example: { concealed: ['E', 'E', 'E', 'S', 'S', 'S', 'W', 'W', 'W', 'B', 'B', 'B', 'p8', 'p8'], melds: [], context: { roundWind: 'E', seatWind: 'S' } },
  },
  {
    id: '一般高', fan: 1, category: '自訂牌型', desc: '自訂牌型：同一花色兩組完全相同的順子（二同順）。',
    example: { concealed: ['m1', 'm2', 'm3', 'm1', 'm2', 'm3', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '一般低', fan: 1, category: '自訂牌型', desc: '自訂牌型：同一花色兩組相差一階的順子（二步高）。',
    example: { concealed: ['m1', 'm2', 'm2', 'm3', 'm3', 'm4', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '缺門', fan: 1, category: '自訂牌型', desc: '自訂牌型：手中缺少一門數字花色。',
    example: { concealed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '三般高', fan: 2, category: '自訂牌型', desc: '自訂牌型：同一花色三組完全相同的順子（三同順）。',
    example: { concealed: ['m1', 'm2', 'm3', 'm1', 'm2', 'm3', 'm1', 'm2', 'm3', 'p1', 'p2', 'p3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '三般低', fan: 2, category: '自訂牌型', desc: '自訂牌型：同一花色三組逐階上升的順子（三步高）。',
    example: { concealed: ['m1', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm5', 'p1', 'p2', 'p3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '一條龍', fan: 2, category: '自訂牌型', desc: '自訂牌型：同一花色一至九各一張（一氣通貫）；九子連環不再另計此項。',
    example: { concealed: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '兩般高', fan: 3, category: '自訂牌型', desc: '自訂牌型：兩組不同的同順（雙龍抱）。',
    example: { concealed: ['m1', 'm2', 'm3', 'm1', 'm2', 'm3', 'p1', 'p2', 'p3', 'p1', 'p2', 'p3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '兩般低', fan: 3, category: '自訂牌型', desc: '自訂牌型：兩組不同的步高（雙蛇抱）。',
    example: { concealed: ['m1', 'm2', 'm2', 'm3', 'm3', 'm4', 'p1', 'p2', 'p2', 'p3', 'p3', 'p4', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '鏡糊糊', fan: 3, category: '自訂牌型', desc: '自訂牌型：兩種花色各有一組相同數字的順子。',
    example: { concealed: ['m1', 'm2', 'm3', 'p1', 'p2', 'p3', 'm7', 'm8', 'm9', 'p7', 'p8', 'p9', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '四般高', fan: 3, category: '自訂牌型', desc: '自訂牌型：同一花色四組完全相同的順子（四同順）。',
    example: { concealed: ['m1', 'm2', 'm3', 'm1', 'm2', 'm3', 'm1', 'm2', 'm3', 'm1', 'm2', 'm3', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '四般低', fan: 3, category: '自訂牌型', desc: '自訂牌型：同一花色四組逐階上升的順子（步步高）。',
    example: { concealed: ['m1', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm4', 'm5', 'm5', 'm6', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '三槓子', fan: 3, category: '自訂牌型', desc: '自訂牌型：開出三個槓子。',
    example: {
      concealed: ['m5', 'm5', 'm5', 'E', 'E'],
      melds: ['m1', 'p2', 's3'].map((tile) => ({ tile, type: 'kong', tiles: [tile, tile, tile, tile] })),
      context: { customPatterns: true },
    },
  },
  {
    id: '三喜臨門', fan: 3, category: '自訂牌型', desc: '自訂牌型：東南西北其中三種風牌刻子（三風刻）。',
    example: { concealed: ['E', 'E', 'E', 'S', 'S', 'S', 'W', 'W', 'W', 'p1', 'p2', 'p3', 'm5', 'm5'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '雙色同刻', fan: 3, category: '自訂牌型', desc: '自訂牌型：兩種花色各有相同數字的刻子，且沒有順子。',
    example: { concealed: ['m1', 'm1', 'm1', 'p1', 'p1', 'p1', 'm2', 'm2', 'm2', 'p2', 'p2', 'p2', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '四歸四', fan: 3, category: '自訂牌型', desc: '自訂牌型：四張相同牌分佈在四組順子之中。',
    example: { concealed: ['m1', 'm2', 'm3', 'm2', 'm3', 'm4', 'm3', 'm4', 'm5', 'm3', 'm4', 'm5', 'E', 'E'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '萬綠叢中一點紅', fan: 10, category: '自訂牌型', desc: '自訂牌型：全綠牌加五索或紅中其中之一（原十三番改十番）。',
    example: { concealed: ['s2', 's3', 's4', 's2', 's3', 's4', 's6', 's6', 's6', 'F', 'F', 'F', 'C', 'C'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '百萬石', fan: 10, category: '自訂牌型', desc: '自訂牌型：清一色以外的門清牌，所有數字合計達一百（百萬雄兵；原十三番改十番）。',
    example: { concealed: ['m9', 'm9', 'm9', 'p9', 'p9', 'p9', 's9', 's9', 's9', 'm8', 'm8', 'm8', 'p8', 'p8'], melds: [], context: { customPatterns: true } },
  },
  {
    id: '紅孔雀', fan: 10, category: '自訂牌型', desc: '自訂牌型：只由一、五、七、九索與紅中組成（原十三番改十番）。',
    example: { concealed: ['s1', 's1', 's1', 's5', 's5', 's5', 's7', 's7', 's7', 's9', 's9', 's9', 'C', 'C'], melds: [], context: { customPatterns: true } },
  },
]);

const PATTERN_BY_ID = Object.fromEntries(PATTERN_TABLE.map((p) => [p.id, p]));

/**
 * Flower-only patterns, based on the HK fan table:
 * https://zh.wikipedia.org/wiki/香港麻將番牌列表
 * Flowers are kept outside the concealed hand, so these are scored separately
 * and merged into the win result by withFlowers() / flowerWinResult().
 */
export const FLOWER_PATTERN_TABLE = Object.freeze([
  {
    id: '無花', fan: 1, desc: '完全沒有花牌。',
    example: { flowers: [], seatWind: 'E' },
  },
  {
    id: '正花', fan: 1, desc: '花牌與門風配合：東配春／梅，南配夏／蘭，西配秋／菊，北配冬／竹；每張一番。',
    example: { flowers: ['H5'], seatWind: 'E' },
  },
  {
    id: '一檯花', fan: 2, desc: '集齊「春、夏、秋、冬」或「梅、蘭、菊、竹」；同系列的正花不再另計。',
    example: { flowers: ['H5', 'H6', 'H7', 'H8'], seatWind: 'E' },
  },
  {
    id: '花糊', fan: 3, desc: '集齊七張花牌即時胡牌；三番（已含自摸）。',
    example: { flowers: ['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'] },
  },
  {
    id: '大花糊', fan: 10, desc: '集齊八張花牌（八仙過海）即時胡牌，已計自摸。',
    example: { flowers: [...FLOWER_IDS] },
  },
]);

const FLOWER_PATTERN_BY_ID = Object.fromEntries(
  FLOWER_PATTERN_TABLE.map((p) => [p.id, p]),
);

/** Small patterns that may stack with a main hand pattern. 番子 is deliberately
 *  not here: a hand whose only fan are 番子 is not 雞糊. */
const BONUS_IDS = new Set([
  '門前清', '自摸', '海底撈月', '槓上開花', '連槓開花', '搶槓',
  '無花', '正花', '一檯花', '花糊', '大花糊',
]);

/**
 * Patterns that always overlap and are therefore absorbed by the higher one.
 * `番子:C/F/B` are the dragon roles; `番子:SEAT` / `番子:ROUND` are the wind
 * roles; `番子:PUNG_DRAGON` is a dragon pung (not a dragon pair) for 小三元.
 * 海底撈月 does NOT absorb 自摸: they are counted separately. It applies both to
 * a self-draw and to 胡他人打出牌, so a claim win still scores this 1 fan.
 */
export const ABSORBS = Object.freeze({
  '九子連環': ['清一色', '門前清', '一條龍'],
  '十三么': ['門前清'],
  '七對子': ['門前清'],
  '天胡': ['自摸', '門前清'],
  '地胡': ['自摸', '門前清'],
  '人胡': ['自摸', '門前清'],
  '四般高': ['三般高', '一般高'],
  '三般高': ['一般高'],
  '兩般高': ['一般高'],
  '四般低': ['三般低', '一般低'],
  '三般低': ['一般低'],
  '兩般低': ['一般低'],
  '坎坎胡': ['對對糊', '門前清'],
  '十八羅漢': ['對對糊'],
  '花么九': ['對對糊'],
  '清么九': ['花么九', '對對糊'],
  '字一色': ['花么九', '對對糊', '番子:SEAT', '番子:ROUND'],
  '大四喜': ['對對糊', '小四喜', '番子:SEAT', '番子:ROUND'],
  '小四喜': ['混一色'],
  '大三元': ['小三元', '番子:C', '番子:F', '番子:B'],
  '小三元': ['番子:PUNG_DRAGON'],
  '綠一色': ['清一色', '混一色'],
  '藍一色': ['對對糊', '混一色'],
  '槓上開花': ['自摸'],
  '連槓開花': ['槓上開花', '自摸'],
  '花糊': ['自摸', '無花', '正花', '一檯花'],
  '大花糊': ['自摸', '無花', '正花', '一檯花'],
  '一檯花': ['正花'],
});

const isPung = (set) => set.type === 'triplet' || set.type === 'pung';

const sortByTileIndex = (a, b) => TILE_IDS.indexOf(a) - TILE_IDS.indexOf(b);

export function countTiles(tiles) {
  const counts = Object.create(null);
  for (const tile of tiles) counts[tile] = (counts[tile] ?? 0) + 1;
  return counts;
}

function nextTile(id, delta) {
  const info = TILE_INFO[id];
  if (!info || info.isHonor) return null;
  const value = info.value + delta;
  if (value < 1 || value > 9) return null;
  return `${id[0]}${value}`;
}

export function normalizeMelds(melds = []) {
  return melds.map((meld) => {
    if (typeof meld === 'string') {
      return { tile: meld, type: 'kong', tiles: [meld, meld, meld, meld], open: false };
    }
    const tile = meld.tile ?? meld.tiles?.[0];
    // 碰／上 only expose three tiles; kongs (open or concealed) expose four.
    const length = meld.type === 'pung' || meld.type === 'chow' ? 3 : 4;
    return {
      tile,
      type: meld.type ?? 'kong',
      tiles: meld.tiles ? [...meld.tiles] : Array(length).fill(tile),
      open: Boolean(meld.open),
    };
  });
}

function subtract(counts, tiles) {
  const next = { ...counts };
  for (const tile of tiles) {
    next[tile] -= 1;
    if (next[tile] === 0) delete next[tile];
  }
  return next;
}

/**
 * Enumerate every valid decomposition of a concealed hand.
 * Canonical ordering fixes the old "first key only / upward only" wait bug.
 */
export function decompose(concealed, meldCount = 0) {
  const tiles = [...concealed];
  if (tiles.length < 2 || (tiles.length - 2) % 3 !== 0) return [];
  const requiredSets = (tiles.length - 2) / 3;
  if (requiredSets + meldCount > 4) return [];
  // The fishing game draws from an endless weighted pool, so a tile kind may
  // appear more than four times. Any repeated kind can still form sets/pairs.
  const counts = countTiles(tiles);

  const results = [];
  const seen = new Set();
  const walk = (current, groups, pairUsed) => {
    const remaining = Object.keys(current).filter((t) => current[t] > 0).sort(sortByTileIndex);
    if (remaining.length === 0) {
      const sets = groups.filter((g) => g.type !== 'pair');
      const pairs = groups.filter((g) => g.type === 'pair');
      if (sets.length === requiredSets && pairs.length === 1) {
        const key = JSON.stringify(groups);
        if (!seen.has(key)) { seen.add(key); results.push(groups.map((g) => ({ ...g, tiles: [...g.tiles] }))); }
      }
      return;
    }
    const tile = remaining[0];
    const count = current[tile];
    if (!pairUsed && count >= 2) {
      walk(subtract(current, [tile, tile]), [...groups, { type: 'pair', tiles: [tile, tile] }], true);
    }
    if (count >= 3) {
      walk(subtract(current, [tile, tile, tile]), [...groups, { type: 'triplet', tiles: [tile, tile, tile] }], pairUsed);
    }
    const t2 = nextTile(tile, 1);
    const t3 = nextTile(tile, 2);
    if (t2 && t3 && (current[t2] ?? 0) > 0 && (current[t3] ?? 0) > 0) {
      walk(subtract(current, [tile, t2, t3]), [...groups, { type: 'sequence', tiles: [tile, t2, t3] }], pairUsed);
    }
  };
  walk(counts, [], false);
  return results;
}

export function isValidWinningHand(concealed, melds = []) {
  const normalized = typeof melds === 'number'
    ? normalizeMelds(new Array(melds).fill('E'))
    : normalizeMelds(melds);
  return decompose(concealed, normalized.length).length > 0 || isSpecialHand(concealed, normalized);
}

export function isThirteenOrphans(tiles) {
  if (tiles.length !== 14) return false;
  const counts = countTiles(tiles);
  if (Object.keys(counts).length !== 13) return false;
  if (!ORPHANS.every((id) => (counts[id] ?? 0) > 0)) return false;
  return Object.values(counts).some((n) => n === 2);
}

export function isSevenPairs(tiles) {
  if (tiles.length !== 14) return false;
  // Seven distinct pairs: four identical tiles cannot be split into two pairs.
  const counts = countTiles(tiles);
  const kinds = Object.keys(counts);
  return kinds.length === 7 && kinds.every((id) => counts[id] === 2);
}

export function isNineGates(tiles) {
  if (tiles.length !== 14) return false;
  const info = TILE_INFO[tiles[0]];
  if (!info || info.isHonor) return false;
  const prefix = tiles[0][0];
  const counts = Array(10).fill(0);
  for (const tile of tiles) {
    if (TILE_INFO[tile]?.suit !== info.suit) return false;
    counts[TILE_INFO[tile].value] += 1;
  }
  return counts[1] >= 3 && counts[9] >= 3 && counts.slice(2, 9).every((n) => n >= 1);
}

function isSpecialHand(concealed, melds) {
  if (melds.length === 0 && (isThirteenOrphans(concealed) || isNineGates(concealed) || isSevenPairs(concealed))) return true;
  return melds.length === 4 && melds.every((m) => m.type === 'kong')
    && concealed.length === 2 && concealed[0] === concealed[1];
}

/** Transitive absorbed sub-patterns, e.g. 清么九 → 花么九 → 對對糊. */
function expandAbsorbed(id, visiting = new Set()) {
  if (visiting.has(id)) return [];
  visiting.add(id);
  const keys = [];
  for (const key of ABSORBS[id] ?? []) {
    keys.push(key);
    const base = key.startsWith('番子:') ? '番子' : key;
    keys.push(...expandAbsorbed(base, visiting));
  }
  return [...new Set(keys)];
}

function matchesAbsorbKey(pattern, key, ctx) {
  if (!key.startsWith('番子:')) return pattern.id === key;
  if (pattern.id !== '番子') return false;
  const role = key.slice(3);
  if (role === 'SEAT') return pattern.tile === ctx.seatWind;
  if (role === 'ROUND') return pattern.tile === ctx.roundWind;
  if (role === 'PUNG_DRAGON') return (ctx.dragonPungTiles ?? []).includes(pattern.tile);
  return pattern.tile === role;
}

/** Drop patterns always covered by a higher one. If k kept patterns share an
 *  absorbed sub-pattern, subtract its fan k−1 times so it is counted once. */
function resolveOverlaps(found, ctx = {}) {
  const kept = found.filter((pattern) => !found.some((other) => other !== pattern
    && expandAbsorbed(other.id).some((key) => matchesAbsorbKey(pattern, key, ctx))));
  // Only describe absorbed patterns that were actually scored. A hand with a
  // meld never scores 門前清, so it must not appear in the breakdown either.
  const presentAbsorbed = (pattern) => expandAbsorbed(pattern.id)
    .filter((key) => found.some((p) => matchesAbsorbKey(p, key, ctx)));

  const subPatterns = [...new Set(kept.flatMap(presentAbsorbed))];
  const adjustments = [];
  for (const key of subPatterns) {
    const sharers = kept.filter((p) => presentAbsorbed(p).includes(key));
    if (sharers.length < 2) continue;
    const base = key.startsWith('番子:') ? '番子' : key;
    adjustments.push({
      id: '重疊扣減',
      name: '重疊扣減',
      fan: -(FAN_VALUES[base] ?? 0) * (sharers.length - 1),
      detail: base,
    });
  }
  for (const pattern of kept) {
    const absorbed = presentAbsorbed(pattern)
      .map((key) => (key.startsWith('番子:') ? '番子' : key))
      .filter((id) => id !== pattern.id);
    if (absorbed.length) pattern.includes = [...new Set(absorbed)];
  }
  return [...kept, ...adjustments];
}

/**
 * Detect all custom (自訂牌型) patterns. The four legacy customs are on unless
 * context.customPatterns is explicitly false; the wiki customs fire only when
 * context.customPatterns is explicitly true, so the legacy 64-rule baseline is
 * unchanged. The game always passes an explicit boolean for the room toggle.
 */
export function detectCustomPatterns({
  concealed = [], groups = [], melds = [], sets = [], pair = null, context = {},
} = {}) {
  const found = [];
  const add = (id, detail) => {
    found.push(detail ? { id, fan: FAN_VALUES[id] ?? 0, detail } : { id, fan: FAN_VALUES[id] ?? 0 });
  };
  const enableLegacy = context.customPatterns !== false;
  const enableWiki = context.customPatterns === true;
  const allTiles = [...concealed, ...melds.flatMap((m) => m.tiles.slice(0, 3))];
  const effectiveSets = sets.length ? sets : [
    ...groups.filter((g) => g.type !== 'pair').map((g) => ({ type: g.type, tiles: g.tiles })),
    ...melds.map((m) => ({ type: m.type === 'chow' ? 'sequence' : 'pung', tiles: m.tiles.slice(0, 3) })),
  ];
  const effectivePair = pair ?? groups.find((g) => g.type === 'pair')?.tiles
    ?? (concealed.length === 2 ? [concealed[0], concealed[1]] : null);

  if (enableLegacy) {
    if (melds.length === 0 && isSevenPairs(concealed)) add('七對子');
    if (effectiveSets.length === 4 && allTiles.every((t) => GREEN_TILES.has(t))) add('綠一色');
    if (effectiveSets.length === 4 && allTiles.every((t) => BLUE_TILES.has(t))) add('藍一色');
    const openingSelfDraw = context.selfDraw && melds.length === 0 && context.kongReplacementChain === 0;
    if (openingSelfDraw && !context.tiangu && context.renhu) add('人胡');
  }
  if (!enableWiki) return found;

  const chowCounts = new Map();
  const startsBySuit = new Map();
  const tileInChows = new Map();
  for (const set of effectiveSets) {
    if (set.type !== 'sequence' || !/^[mps]/.test(set.tiles[0])) continue;
    const suit = set.tiles[0][0];
    const start = Math.min(...set.tiles.map((t) => Number(t[1])));
    const key = `${suit}:${start}`;
    chowCounts.set(key, (chowCounts.get(key) ?? 0) + 1);
    if (!startsBySuit.has(suit)) startsBySuit.set(suit, new Set());
    startsBySuit.get(suit).add(start);
    for (const tile of set.tiles) tileInChows.set(tile, (tileInChows.get(tile) ?? 0) + 1);
  }
  const maxChow = Math.max(0, ...chowCounts.values());
  const duplicateChows = [...chowCounts.values()].filter((n) => n >= 2).length;
  if (duplicateChows >= 2) add('兩般高');
  if (maxChow >= 4) add('四般高');
  else if (maxChow >= 3) add('三般高');
  else if (maxChow >= 2) add('一般高');

  const stairRuns = [];
  for (const starts of startsBySuit.values()) {
    const sorted = [...starts].sort((a, b) => a - b);
    if (!sorted.some((start, i) => i > 0 && start === sorted[i - 1] + 1)) continue;
    let run = 1;
    let best = 1;
    for (let i = 1; i < sorted.length; i += 1) {
      run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    stairRuns.push(best);
  }
  if (stairRuns.length >= 2) add('兩般低');
  const maxStep = Math.max(0, ...stairRuns);
  if (maxStep >= 4) add('四般低');
  else if (maxStep >= 3) add('三般低');
  else if (stairRuns.length >= 1) add('一般低');

  for (const suit of SUIT_PREFIXES) {
    const numbers = new Set(allTiles.filter((t) => t.startsWith(suit)).map((t) => Number(t[1])));
    if (Array.from({ length: 9 }, (_, i) => i + 1).every((n) => numbers.has(n))) {
      add('一條龍');
      break;
    }
  }

  const suitsByStart = new Map();
  for (const key of chowCounts.keys()) {
    const [suit, start] = key.split(':');
    if (!suitsByStart.has(start)) suitsByStart.set(start, new Set());
    suitsByStart.get(start).add(suit);
  }
  if ([...suitsByStart.values()].some((suits) => suits.size >= 2)) add('鏡糊糊');

  const suitsPresent = new Set(allTiles.filter((t) => /^[mps]/.test(t)).map((t) => t[0]));
  if (suitsPresent.size === 2) add('缺門');

  if (melds.filter((m) => m.type === 'kong').length >= 3) add('三槓子');

  const windPungs = new Set(effectiveSets
    .filter((set) => isPung(set) && WINDS.includes(set.tiles[0]))
    .map((set) => set.tiles[0]));
  if (windPungs.size >= 3) add('三喜臨門');

  const pungsBySuitRank = new Map();
  for (const set of effectiveSets) {
    if (!isPung(set) || !/^[mps]/.test(set.tiles[0])) continue;
    const key = `${set.tiles[0][0]}:${set.tiles[0][1]}`;
    pungsBySuitRank.set(key, (pungsBySuitRank.get(key) ?? 0) + 1);
  }
  const suitsByRank = new Map();
  for (const key of pungsBySuitRank.keys()) {
    const [suit, rank] = key.split(':');
    if (!suitsByRank.has(rank)) suitsByRank.set(rank, new Set());
    suitsByRank.get(rank).add(suit);
  }
  if ([...suitsByRank.values()].some((suits) => suits.size >= 2)) add('雙色同刻');

  if ([...tileInChows.values()].some((count) => count >= 4)) add('四歸四');

  if (allTiles.length && allTiles.every((t) => GREEN_TILES.has(t) || t === 's5' || t === 'C')) {
    if (allTiles.includes('s5') !== allTiles.includes('C')) add('萬綠叢中一點紅');
  }
  const RED_PEACOCK = new Set(['s1', 's5', 's7', 's9', 'C']);
  if (allTiles.length && allTiles.every((t) => RED_PEACOCK.has(t))) add('紅孔雀');
  if (melds.length === 0 && suitsPresent.size >= 2 && allTiles.length
      && allTiles.every((t) => /^[mps][1-9]$/.test(t))) {
    const total = allTiles.reduce((sum, t) => sum + Number(t[1]), 0);
    if (total >= 100) add('百萬石');
  }
  return found;
}

function evaluateDecomposition(concealed, groups, melds, context) {
  const allTiles = [...concealed, ...melds.flatMap((m) => m.tiles.slice(0, 3))];
  const sets = [
    ...groups.filter((g) => g.type !== 'pair').map((g) => ({ type: g.type, tiles: g.tiles })),
    // 上 is a sequence, while 碰／槓 (open or concealed) count as a pung set.
    ...melds.map((m) => ({
      type: m.type === 'chow' ? 'sequence' : 'pung',
      tiles: m.tiles.slice(0, 3),
    })),
  ];
  const pair = groups.find((g) => g.type === 'pair')?.tiles
    ?? (concealed.length === 2 ? [concealed[0], concealed[1]] : null);

  const found = [];
  const add = (id, detail = null, fan = null, tile = null) => {
    const pattern = { id, name: PATTERN_BY_ID[id]?.name ?? id, fan: fan ?? FAN_VALUES[id] ?? 0 };
    if (detail) pattern.detail = detail;
    if (tile) pattern.tile = tile;
    found.push(pattern);
  };

  // 極高番牌型先判定；之後仍然檢查其餘牌型。預設不設番數上限。
  if (melds.length === 4 && melds.every((m) => m.type === 'kong') && pair && pair[0] === pair[1]) add('十八羅漢');
  if (melds.length === 0 && isThirteenOrphans(concealed)) add('十三么');
  if (melds.length === 0 && isNineGates(concealed)) add('九子連環');

  const windPungs = sets.filter((s) => isPung(s) && WINDS.includes(s.tiles[0]));
  const dragonPungs = sets.filter((s) => isPung(s) && DRAGONS.includes(s.tiles[0]));
  // These limit hands need distinct tile kinds: two white pungs and a middle
  // pair are not 小三元, just as repeated East pungs are not 大四喜.
  const windPungTiles = new Set(windPungs.map((set) => set.tiles[0]));
  const dragonPungTiles = new Set(dragonPungs.map((set) => set.tiles[0]));
  if (windPungTiles.size === 4) add('大四喜');
  else if (windPungTiles.size === 3 && pair && WINDS.includes(pair[0])
    && !windPungTiles.has(pair[0])) add('小四喜');
  if (dragonPungTiles.size === 3) add('大三元');
  else if (dragonPungTiles.size === 2 && pair && DRAGONS.includes(pair[0])
    && !dragonPungTiles.has(pair[0])) add('小三元');
  if (sets.length === 4 && allTiles.every((t) => TILE_INFO[t].isHonor)) add('字一色');
  if (sets.length === 4 && allTiles.every((t) => TERMINALS.includes(t))) add('清么九');

  if (sets.length === 4 && sets.every(isPung)) {
    // 對對糊 is the plain all-pung hand; 坎坎胡 is its fully concealed (四暗刻)
    // form and absorbs it. Any meld, including 暗槓, breaks 坎坎胡. A discard
    // claim only counts when the claimed tile completes the single pair (單騎);
    // claiming a completed triplet is just 對對糊.
    add('對對糊');
    const singlePairClaim = context.selfDraw
      || !context.winningTile
      || Boolean(pair?.includes(context.winningTile));
    if (melds.length === 0 && singlePairClaim) add('坎坎胡');
  }
  if (sets.length === 4 && sets.every((s) => s.type === 'sequence') && pair) add('平糊');

  const suits = new Set(allTiles.filter((t) => !TILE_INFO[t].isHonor).map((t) => TILE_INFO[t].suit));
  const hasHonor = allTiles.some((t) => TILE_INFO[t].isHonor);
  if (suits.size === 1 && !hasHonor) add('清一色');
  else if (suits.size === 1 && hasHonor) add('混一色');

  if (sets.length === 4 && sets.every(isPung)
      && allTiles.every((t) => TERMINALS.includes(t) || TILE_INFO[t].isHonor)) add('花么九');

  // Always generate one 番子 per dragon pung and per seat/round wind pung;
  // overlapping big patterns absorb them later via resolveOverlaps().
  const valuePungs = [
    ...dragonPungs.map((set) => ({
      tile: set.tiles[0],
      labels: [TILE_INFO[set.tiles[0]].name],
    })),
    ...windPungs
      .filter((set) => set.tiles[0] === context.roundWind || set.tiles[0] === context.seatWind)
      .map((set) => ({
        tile: set.tiles[0],
        labels: [
          set.tiles[0] === context.roundWind ? '場風' : null,
          set.tiles[0] === context.seatWind ? '門風' : null,
        ].filter(Boolean),
      })),
  ];
  for (const pung of valuePungs) add('番子', pung.labels.join('／'), pung.labels.length, pung.tile);

  const openingSelfDraw = context.selfDraw && melds.length === 0 && context.kongReplacementChain === 0;
  const isTiangu = openingSelfDraw && context.tiangu;
  const isRenhu = openingSelfDraw && !isTiangu && context.renhu;
  // 地胡 is a claim on the dealer's first discard, never an opening self-draw.
  const isDihu = !context.selfDraw && context.dihuClaim && context.kongReplacementChain === 0;
  if (isTiangu) add('天胡');
  if (isDihu) add('地胡');
  if (!isTiangu && context.kongReplacementChain === 1 && context.selfDraw) add('槓上開花');
  if (!isTiangu && context.kongReplacementChain >= 2 && context.selfDraw) add('連槓開花');
  // 海底撈月 applies to both self-draws and claim wins; 自摸 below is scored
  // separately whenever context.selfDraw is true. 槓上開花／連槓開花 never
  // combine with 海底撈月.
  if (!isTiangu && context.haidi && context.kongReplacementChain === 0) add('海底撈月');
  // 搶槓 is a claim-only bonus; the kong declarer becomes the 出銃 seat.
  if (context.qianggang && !context.selfDraw) add('搶槓');
  // 門前清 needs a fully concealed hand (no 碰／上／槓, including 暗槓), but
  // the winning tile may be self-drawn or claimed from another player.
  if (melds.length === 0) add('門前清');
  if (context.selfDraw) add('自摸');

  for (const custom of detectCustomPatterns({ concealed, groups, melds, sets, pair, context })) {
    add(custom.id, custom.detail);
  }

  let patterns = resolveOverlaps(found, {
    ...context,
    dragonPungTiles: [...dragonPungTiles],
  });
  if (!patterns.some((p) => !BONUS_IDS.has(p.id) && p.id !== '重疊扣減')) {
    patterns = [{ id: '雞糊', name: '雞糊', fan: 0 }, ...patterns];
  }

  const rawFan = patterns.reduce((sum, p) => sum + p.fan, 0);
  const fanCap = context.fanCap ?? FAN_CAP;
  return {
    patterns,
    rawFan,
    totalFan: Math.min(rawFan, fanCap),
    capped: rawFan > fanCap,
    fanCap,
    decomposition: groups,
    sets,
    pair,
  };
}

function betterResult(candidate, best) {
  if (!best) return true;
  if (candidate.totalFan !== best.totalFan) return candidate.totalFan > best.totalFan;
  if (candidate.rawFan !== best.rawFan) return candidate.rawFan > best.rawFan;
  return candidate.patterns.length > best.patterns.length;
}

function flowerPattern(id) {
  return {
    id,
    name: (FLOWER_PATTERN_BY_ID[id] ?? PATTERN_BY_ID[id])?.name ?? id,
    fan: FAN_VALUES[id] ?? 0,
  };
}

/** 無花／正花／一檯花. Flowers never form melds, so this is purely additive. */
export function evaluateFlowers(flowers = [], seatWind = 'E') {
  const held = new Set(flowers.filter((id) => FLOWER_INFO[id]));
  const patterns = [];
  if (held.size === 0) patterns.push(flowerPattern('無花'));

  const fullSeasons = SEASON_IDS.every((id) => held.has(id));
  const fullPlants = PLANT_IDS.every((id) => held.has(id));
  if (fullSeasons) patterns.push(flowerPattern('一檯花'));
  if (fullPlants) patterns.push(flowerPattern('一檯花'));

  // A completed series replaces its own 正花 (but not the other series').
  const seatFlowers = FLOWER_IDS.filter((id) => held.has(id) && FLOWER_INFO[id].wind === seatWind);
  const counted = seatFlowers.filter((id) => !(
    (fullSeasons && SEASON_IDS.includes(id)) || (fullPlants && PLANT_IDS.includes(id))
  ));
  for (let i = 0; i < counted.length; i += 1) patterns.push(flowerPattern('正花'));

  return { patterns, fan: patterns.reduce((sum, p) => sum + p.fan, 0) };
}

/** 七花 = 花糊, 八花 = 大花糊. Both are immediate self-draw wins. */
export function flowerWin(flowers = []) {
  const count = new Set(flowers.filter((id) => FLOWER_INFO[id])).size;
  if (count >= FLOWER_IDS.length) return flowerPattern('大花糊');
  if (count >= 7) return flowerPattern('花糊');
  return null;
}

function capResult(result, fanCap) {
  const rawFan = result.patterns.reduce((sum, p) => sum + p.fan, 0);
  return {
    ...result,
    rawFan,
    totalFan: Math.min(rawFan, fanCap),
    capped: rawFan > fanCap,
    fanCap,
  };
}

/** Merge flower fans into an ordinary winning hand. A declined 花糊 (seven
 *  flowers) is added as a 3-fan pattern on a later hand win; it absorbs 自摸
 *  and the ordinary flower fans, and shares 自摸 with other limit hands. */
export function withFlowers(result, flowers = [], seatWind = 'E', fanCap = FAN_CAP, context = {}) {
  if (!result?.isWin) return result;
  const flower = evaluateFlowers(flowers, seatWind);
  const declinedFlowerWin = context.declinedFlowerWin
    && flowerWin(flowers)?.id === '花糊';
  let patterns = [
    ...result.patterns.filter((p) => p.id !== '重疊扣減'),
    ...flower.patterns,
  ];
  if (declinedFlowerWin) {
    patterns.push(flowerPattern('花糊'));
    patterns = resolveOverlaps(patterns, {
      selfDraw: true,
      kongReplacementChain: 0,
      haidi: false,
      tiangu: false,
      dihuClaim: false,
      renhu: false,
      roundWind: 'E',
      seatWind,
      ...context,
    });
  }
  return capResult({
    ...result,
    patterns,
    flowers: [...flowers],
  }, fanCap);
}

/** Synthetic result for 花糊／大花糊 — no ordinary hand decomposition needed.
 *  一檯花／正花 are not stacked here (they apply to ordinary hand wins), but
 *  opening/kong/timing contexts are resolved with the same ABSORBS table. */
export function flowerWinResult(flowers = [], seatWind = 'E', fanCap = FAN_CAP, context = {}) {
  const win = flowerWin(flowers);
  if (!win) return null;
  const ctx = {
    selfDraw: true,
    kongReplacementChain: 0,
    haidi: false,
    tiangu: false,
    dihuClaim: false,
    renhu: false,
    roundWind: 'E',
    seatWind,
    fanCap,
    ...context,
  };
  const found = [win];
  if (ctx.selfDraw) found.push(flowerPattern('自摸'));
  const openingSelfDraw = ctx.selfDraw && ctx.kongReplacementChain === 0;
  // 一開牌／補花後摸齊七花：莊家計天胡、閒家計地胡；首釣自摸才計人胡。
  // 暗槓或其他槓後補到七花只計槓上開花，不計天地人胡。
  if (openingSelfDraw && ctx.tiangu) found.push(flowerPattern('天胡'));
  else if (openingSelfDraw && ctx.dihuaClaim) found.push(flowerPattern('地胡'));
  else if (openingSelfDraw && ctx.renhu && ctx.customPatterns !== false) found.push(flowerPattern('人胡'));
  if (ctx.kongReplacementChain === 1 && ctx.selfDraw) found.push(flowerPattern('槓上開花'));
  if (ctx.kongReplacementChain >= 2 && ctx.selfDraw) found.push(flowerPattern('連槓開花'));
  if (ctx.haidi && ctx.kongReplacementChain === 0) found.push(flowerPattern('海底撈月'));
  return capResult({
    isWin: true,
    patterns: resolveOverlaps(found, ctx),
    concealed: [],
    melds: [],
    winningTile: null,
    flowers: [...flowers],
    specialHand: true,
  }, fanCap);
}

/**
 * The single entry point used by the game, the hints and all tests.
 * context: { selfDraw, winningTile, kongReplacementChain, haidi, tiangu, dihuClaim,
 *   renhu, qianggang, roundWind, seatWind }
 * melds: { tile, type: 'kong'|'pung'|'chow', tiles, open } — any meld, including
 * 暗槓, suppresses 門前清; a claim win (selfDraw: false) still counts it.
 * 自摸 depends only on context.selfDraw; 坎坎胡 also needs no melds, and a claim
 * must complete the single pair. 搶槓 is a claim-only 1-fan bonus.
 * fanCap 仍可選擇性傳入以配合自訂屋規，但遊戲預設為無上限。
 */
export function evaluateHand({ concealed = [], melds = [], winningTile = null, context = {} } = {}) {
  const normalizedMelds = normalizeMelds(melds);
  const ctx = {
    selfDraw: true,             // every fished tile is a self-draw (documented design decision)
    winningTile,
    kongReplacementChain: 0,
    haidi: false,
    roundWind: 'E',
    seatWind: 'S',
    fanCap: FAN_CAP,
    ...context,
  };
  const decompositions = decompose(concealed, normalizedMelds.length);
  const candidates = decompositions.length ? decompositions
    : (isSpecialHand(concealed, normalizedMelds) ? [[]] : []);

  let best = null;
  for (const groups of candidates) {
    const result = evaluateDecomposition(concealed, groups, normalizedMelds, ctx);
    if (betterResult(result, best)) best = result;
  }
  if (!best) return { isWin: false, patterns: [], totalFan: 0, rawFan: 0, capped: false, decomposition: [] };

  return {
    isWin: true,
    ...best,
    concealed: [...concealed],
    melds: normalizedMelds,
    winningTile,
    specialHand: best.patterns.some((p) => p.fan >= 10 || ['花糊', '大花糊'].includes(p.id)),
  };
}

/** Tiles that complete the hand right now, optionally restricted by wall supply. */
export function findWaits(concealed, melds = [], context = {}, availability = null) {
  const waits = [];
  for (const tile of TILE_IDS) {
    if (availability && (availability[tile] ?? 0) <= 0) continue;
    const result = evaluateHand({
      concealed: [...concealed, tile],
      melds,
      winningTile: tile,
      context,
    });
    if (result.isWin && !waits.includes(tile)) waits.push(tile);
  }
  return waits;
}

/** Standard + orphans + seven-pairs shanten. -1 means a complete hand. */
export function shanten(tiles, meldCount = 0) {
  const counts = countTiles(tiles);
  let best = -1;
  const limit = 4 - meldCount;

  const walk = (current, sets, taatsu, pair) => {
    if (sets + taatsu > limit) return;
    best = Math.max(best, 2 * (sets + meldCount) + taatsu + pair);
    const remaining = Object.keys(current).filter((t) => current[t] > 0).sort(sortByTileIndex);
    if (!remaining.length) return;
    const tile = remaining[0];
    const count = current[tile];
    const t2 = nextTile(tile, 1);
    const t3 = nextTile(tile, 2);
    if (count >= 3) walk(subtract(current, [tile, tile, tile]), sets + 1, taatsu, pair);
    if (t2 && t3 && (current[t2] ?? 0) > 0 && (current[t3] ?? 0) > 0) {
      walk(subtract(current, [tile, t2, t3]), sets + 1, taatsu, pair);
    }
    if (!pair && count >= 2) walk(subtract(current, [tile, tile]), sets, taatsu, 1);
    if (count >= 2) walk(subtract(current, [tile, tile]), sets, taatsu + 1, pair);
    if (t2 && (current[t2] ?? 0) > 0) walk(subtract(current, [tile, t2]), sets, taatsu + 1, pair);
    walk(subtract(current, [tile]), sets, taatsu, pair);
  };
  walk(counts, 0, 0, 0);
  let result = 8 - best;

  if (meldCount === 0) {
    const orphanCounts = countTiles(tiles.filter((t) => ORPHANS.includes(t)));
    const unique = Object.keys(orphanCounts).length;
    const pair = Object.values(orphanCounts).some((n) => n >= 2) ? 1 : 0;
    result = Math.min(result, 13 - unique - pair);
    const pairs = Object.values(countTiles(tiles)).filter((n) => n >= 2).length;
    const kinds = Object.keys(countTiles(tiles)).length;
    result = Math.min(result, 6 - pairs + Math.max(0, 7 - kinds));
  }
  return result;
}

/** Tiles that reduce shanten after the best discard (used by AI assist). */
export function getUsefulTiles(concealed, melds = [], availability = null) {
  const currentShanten = shanten(concealed, melds.length);
  const useful = [];
  for (const tile of TILE_IDS) {
    if (availability && (availability[tile] ?? 0) <= 0) continue;
    const drawn = [...concealed, tile];
    // Keeping all 14 tiles (i.e. this tile completes the hand) is also a valid
    // improvement, which is what makes waits useful for a tenpai hand.
    let bestAfter = shanten(drawn, melds.length);
    for (const discard of new Set(drawn)) {
      const index = drawn.indexOf(discard);
      const after = drawn.slice(0, index).concat(drawn.slice(index + 1));
      bestAfter = Math.min(bestAfter, shanten(after, melds.length));
    }
    if (bestAfter < currentShanten) useful.push(tile);
  }
  return useful;
}

function countInTiles(tiles, universe) {
  let count = 0;
  for (const tile of tiles) if (universe.has(tile)) count += 1;
  return count;
}

function hasSequenceNeighbour(counts, id) {
  const match = /^([mps])(\d)$/.exec(id);
  if (!match) return false;
  const rank = Number(match[2]);
  return [rank - 2, rank - 1, rank + 1, rank + 2]
    .some((r) => r >= 1 && r <= 9 && (counts[`${match[1]}${r}`] ?? 0) > 0);
}

/**
 * Ranked candidate tiles for the AI fish assist.
 *
 * `wins` complete a hand right now — findWaits() runs the full evaluator, so
 * this already covers 十三么、七對子、綠一色、藍一色、九子連環 and every
 * ordinary pattern. `flowers` advances 花糊／大花糊, `kongs` completes a
 * concealed kong, and `progress` advances any other pattern family: pairs and
 * pungs (七對子／對對糊), sequences, 十三么, the colour/honour/terminal hands
 * and the one-suit hands.
 *
 * This deliberately uses cheap tile counts instead of repeated shanten() calls:
 * shanten() is expensive and this runs every time a fish is spawned.
 */
export function getAssistTiles({
  concealed = [], melds = [], flowers = [], availability = null, context = {},
} = {}) {
  const available = (id) => !availability || (availability[id] ?? 0) > 0;
  const counts = countTiles(concealed);
  const ids = Object.keys(counts);
  const held = ids.flatMap((id) => Array(counts[id]).fill(id));

  const wins = findWaits(concealed, melds, context, availability);
  const flowerCandidates = flowers.length >= 3 && flowers.length < FLOWER_IDS.length
    ? FLOWER_IDS.filter(available)
    : [];
  const kongs = ids.filter((id) => counts[id] === 3 && available(id));

  const orphanCount = countInTiles(held, ORPHAN_SET);
  const greenCount = countInTiles(held, GREEN_TILES);
  const blueCount = countInTiles(held, BLUE_TILES);
  const honorCount = countInTiles(held, HONOR_TILES);
  const terminalCount = countInTiles(held, TERMINAL_SET);
  const suitCounts = SUIT_TILES.map((suit) => countInTiles(held, suit));

  const progress = [];
  for (const id of TILE_IDS) {
    if (!available(id) || (counts[id] ?? 0) >= 4) continue;
    const count = counts[id] ?? 0;
    const suitIndex = SUIT_PREFIXES.findIndex((prefix) => id.startsWith(prefix));
    const useful = count > 0
      || hasSequenceNeighbour(counts, id)
      || (ORPHAN_SET.has(id) && orphanCount >= 7)
      || (GREEN_TILES.has(id) && greenCount >= 6)
      || (BLUE_TILES.has(id) && blueCount >= 6)
      || (HONOR_TILES.has(id) && honorCount >= 6)
      || (TERMINAL_SET.has(id) && terminalCount >= 5)
      || (suitIndex >= 0 && suitCounts[suitIndex] >= 6);
    if (useful) progress.push(id);
  }

  return { wins, flowers: flowerCandidates, kongs, progress };
}

/** A shuffled 144-tile wall: 136 regular tiles plus the 8 flower tiles. */
export function createWall(rng = Math.random) {
  const wall = [];
  for (const id of TILE_IDS) for (let i = 0; i < 4; i += 1) wall.push(id);
  for (const id of FLOWER_IDS) wall.push(id);
  return shuffle(wall, rng);
}

/** Weighted endless pool: ordinary kinds 4:1 against each flower kind. */
const WEIGHTED_TILE_KINDS = Object.freeze([
  ...TILE_IDS.flatMap((id) => [id, id, id, id]),
  ...FLOWER_IDS,
]);

export function randomTileKind(rng = Math.random) {
  return WEIGHTED_TILE_KINDS[Math.floor(rng() * WEIGHTED_TILE_KINDS.length)];
}

export function shuffle(array, rng = Math.random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** One shared, zh-Hant breakdown used by every win dialog. */
export function formatWinBreakdown(result) {
  if (!result?.isWin) return '';
  const lines = ['胡牌！', '', '牌型：'];
  for (const pattern of result.patterns) {
    if (pattern.id === '重疊扣減') {
      lines.push(`• 重疊扣減（與多個牌型共用 ${pattern.detail}）（${pattern.fan} 番）`);
      continue;
    }
    const label = pattern.detail ? `${pattern.name}（${pattern.detail}）` : pattern.name;
    const includes = pattern.includes?.length
      ? `（已包含：${pattern.includes.join('、')}）`
      : '';
    lines.push(`• ${label}${includes}（${pattern.fan} 番）`);
  }
  lines.push('');
  lines.push(`共 ${result.totalFan} 番${result.capped ? `（已達上限 ${result.fanCap} 番）` : ''}`);
  return lines.join('\n');
}
