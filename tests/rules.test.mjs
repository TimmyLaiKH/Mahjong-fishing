/* Table-driven tests for the pure rules engine. Run: node tests/rules.test.mjs */
import assert from 'node:assert/strict';
import {
  ABSORBS, FAN_CAP, FAN_VALUES, FLOWER_PATTERN_TABLE, ORPHANS, PATTERN_TABLE, TERMINALS,
  countTiles, createWall, decompose, evaluateHand, evaluateFlowers,
  findWaits, flowerWin, flowerWinResult, formatWinBreakdown, getAssistTiles,
  getUsefulTiles, isNineGates, isThirteenOrphans, normalizeMelds, randomTileKind, shanten, withFlowers,
} from '../js/rules.js';
import { FLOWER_IDS, isFlower, TILE_IDS, tileName } from '../js/tiles.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message.split('\n').join('\n    ')}`);
  }
}

const tiles = (spec) => (Array.isArray(spec) ? [...spec] : spec.trim().split(/\s+/).filter(Boolean));
const kong = (tile) => ({ tile, type: 'kong', tiles: [tile, tile, tile, tile] });
const names = (result) => result.patterns.map((p) => p.id);
const evalTiles = (spec, extra = {}) => evaluateHand({ concealed: tiles(spec), ...extra });

function mulberry32(seed) {
  return function rng() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('\n— 基本胡牌與聽牌 —');

test('有效／有效的 14 張牌判定', () => {
  assert.equal(evalTiles('m1 m2 m3 m4 m5 m6 p2 p3 p4 s7 s8 s9 p9 p9').isWin, true);
  assert.equal(evalTiles('m1 m2 m3 m4 m5 m6 p2 p3 p4 s7 s8 s9 p9 p8').isWin, false);
  assert.equal(evalTiles('m1 m1 m1 m1 m1 m2 m3 m4 p2 p3 p4 s7 s8 s9').isWin, true);
});

test('無四張上限：五張、六張相同牌都能組成胡牌', () => {
  assert.equal(evalTiles('m1 m1 m1 m1 m1 m2 m3 m4 p2 p3 p4 s7 s8 s9').isWin, true);
  assert.equal(evalTiles('m1 m1 m1 m1 m1 m1 m2 m3 m4 p2 p3 p4 s7 s7').isWin, true);
});

test('無四張上限：四張相同牌可當兩對，仍可成立七對子', () => {
  const result = evalTiles('m1 m1 m1 m1 p2 p2 s3 s3 s4 s4 E E C C');
  assert.equal(result.isWin, true);
  assert.ok(names(result).includes('七對子'));
});

test('無限牌池維持普通牌 4：1 花牌加權', () => {
  assert.equal(randomTileKind(() => 0), 'm1');
  assert.equal(randomTileKind(() => 0.999), 'H8');
  const drawn = Array.from({ length: 144 }, (_, i) => randomTileKind(() => (i + 0.5) / 144));
  assert.equal(drawn.filter((id) => isFlower(id)).length, 8);
  assert.equal(drawn.filter((id) => id === 'm1').length, 4);
});

test('B2：3萬4萬 的兩面聽（2萬／5萬）都能找到', () => {
  const hand = tiles('m1 m1 m1 m3 m4 p5 p6 p7 s2 s3 s4 E E');
  const waits = findWaits(hand);
  assert.deepEqual(waits, ['m2', 'm5']);
});

test('B2：坎張、邊張、單騎聽', () => {
  const kanchan = tiles('m1 m1 m1 m3 m5 p5 p6 p7 s2 s3 s4 E E');
  assert.deepEqual(findWaits(kanchan), ['m4']);
  const edge = tiles('m1 m1 m1 m8 m9 p5 p6 p7 s2 s3 s4 E E');
  assert.deepEqual(findWaits(edge), ['m7']);
  const pair = tiles('m1 m2 m3 p2 p3 p4 s2 s3 s4 s7 s8 s9 E');
  assert.deepEqual(findWaits(pair), ['E']);
});

test('九子連環 1112345678999萬 有九面聽', () => {
  const hand = tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9');
  assert.deepEqual(findWaits(hand), TILE_IDS.slice(0, 9));
  // 門前清聽牌時可直接吃胡別人打出的牌，不必自摸。
  const claim = evaluateHand({
    concealed: tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m5'),
    winningTile: 'm5',
    context: { selfDraw: false },
  });
  assert.ok(names(claim).includes('九子連環'));
  assert.ok(!names(claim).includes('自摸'));
  assert.ok(claim.patterns.find((p) => p.id === '九子連環').includes.includes('門前清'));
});

test('findWaits 尊重牌牆剩餘張數', () => {
  const hand = tiles('m1 m1 m1 m3 m4 p5 p6 p7 s2 s3 s4 E E');
  const availability = Object.fromEntries(TILE_IDS.map((id) => [id, 4]));
  availability.m2 = 0;
  assert.deepEqual(findWaits(hand, [], {}, availability), ['m5']);
});

console.log('\n— 槓與分解 —');

test('B1：1／2／3／4 個暗槓都能胡', () => {
  assert.equal(evaluateHand({
    concealed: tiles('m2 m2 m2 m3 m3 m3 p4 p4 p4 E E'), melds: [kong('m1')],
  }).isWin, true);
  assert.equal(evaluateHand({
    concealed: tiles('m3 m3 m3 s4 s4 s4 E E'), melds: [kong('m1'), kong('p2')],
  }).isWin, true);
  assert.equal(evaluateHand({
    concealed: tiles('s4 s4 s4 E E'), melds: [kong('m1'), kong('p2'), kong('m3')],
  }).isWin, true);
  const four = evaluateHand({
    concealed: tiles('E E'),
    melds: [kong('m1'), kong('p2'), kong('m3'), kong('s4')],
  });
  assert.equal(four.isWin, true);
  assert.ok(names(four).includes('十八羅漢'));
});

test('十八羅漢的聽牌是剩下那對將', () => {
  const melds = [kong('m1'), kong('p2'), kong('m3'), kong('s4')];
  assert.deepEqual(findWaits(['E'], melds), ['E']);
});

test('碰／上／明槓保留 open 旗標，長度為三張；暗槓為四張', () => {
  const pung = normalizeMelds([{ tile: 'E', type: 'pung', tiles: ['E', 'E', 'E'], open: true }])[0];
  assert.equal(pung.open, true);
  assert.equal(pung.tiles.length, 3);
  const chow = normalizeMelds([{ tile: 'm1', type: 'chow', tiles: ['m1', 'm2', 'm3'], open: true }])[0];
  assert.equal(chow.open, true);
  assert.equal(chow.tiles.length, 3);
  assert.equal(normalizeMelds(['m1'])[0].open, false);
  assert.equal(normalizeMelds(['m1'])[0].tiles.length, 4);
  assert.equal(normalizeMelds([{ tile: 'm1', type: 'chow' }])[0].tiles.length, 3);
});

test('碰／上／明槓與暗槓都抑制門前清；暗槓也抑制坎坎胡', () => {
  const concealed = tiles('m2 m2 m2 m3 m3 m3 p4 p4 p4 E E');
  const openPung = evaluateHand({
    concealed,
    melds: [{ tile: 'C', type: 'pung', tiles: ['C', 'C', 'C'], open: true }],
  });
  assert.equal(openPung.isWin, true);
  assert.ok(names(openPung).includes('自摸'), names(openPung).join(','));
  assert.ok(!names(openPung).includes('門前清'));

  const openKong = evaluateHand({ concealed, melds: [{ ...kong('m1'), open: true }] });
  assert.ok(names(openKong).includes('自摸'));
  assert.ok(!names(openKong).includes('門前清'));
  assert.ok(names(openKong).includes('對對糊'));

  const concealedKong = evaluateHand({ concealed, melds: [kong('m1')] });
  assert.ok(names(concealedKong).includes('自摸'));
  assert.ok(!names(concealedKong).includes('坎坎胡'));
  assert.ok(!names(concealedKong).includes('門前清'));
  assert.ok(names(concealedKong).includes('對對糊'));
});

test('上視為順子，可與其他順子組成平糊', () => {
  const result = evaluateHand({
    concealed: tiles('p2 p3 p4 s2 s3 s4 s7 s8 s9 p9 p9'),
    melds: [{ tile: 'm1', type: 'chow', tiles: ['m1', 'm2', 'm3'], open: true }],
  });
  assert.equal(result.isWin, true);
  assert.ok(names(result).includes('平糊'), names(result).join(','));
  assert.ok(names(result).includes('自摸'));
  assert.ok(!names(result).includes('門前清'));
});

test('胡對手打出牌不算自摸，但沒有副露仍計門前清', () => {
  const result = evaluateHand({
    concealed: tiles('m1 m2 m3 p2 p3 p4 s2 s3 s4 s7 s8 s9 p9 p9'),
    winningTile: 'p9',
    context: { selfDraw: false },
  });
  assert.equal(result.isWin, true);
  assert.ok(names(result).includes('門前清'));
  assert.ok(!names(result).includes('自摸'));
  assert.equal(result.totalFan, 2); // 門前清 1 + 平糊 1

  // 胡他人打出牌要湊成單騎才算坎坎胡；吃胡別人的刻子降為對對糊，仍計門前清。
  const tripletClaim = evaluateHand({
    concealed: tiles('m1 m1 m1 p2 p2 p2 s3 s3 s3 E E m4 m4 m4'),
    winningTile: 'm4',
    context: { selfDraw: false },
  });
  assert.ok(names(tripletClaim).includes('對對糊'), names(tripletClaim).join(','));
  assert.ok(!names(tripletClaim).includes('坎坎胡'), names(tripletClaim).join(','));
  assert.ok(names(tripletClaim).includes('門前清'), names(tripletClaim).join(','));
  assert.match(formatWinBreakdown(tripletClaim), /門前清/);

  const pairClaim = evaluateHand({
    concealed: tiles('m1 m1 m1 p2 p2 p2 s3 s3 s3 m4 m4 m4 E E'),
    winningTile: 'E',
    context: { selfDraw: false },
  });
  assert.ok(names(pairClaim).includes('坎坎胡'), names(pairClaim).join(','));
  assert.ok(pairClaim.patterns.find((p) => p.id === '坎坎胡').includes.includes('門前清'));

  const selfDraw = evaluateHand({
    concealed: tiles('m1 m1 m1 p2 p2 p2 s3 s3 s3 E E m4 m4 m4'),
    winningTile: 'm4',
  });
  assert.ok(names(selfDraw).includes('坎坎胡'));
});

test('B3：111222333萬 + 789筒 + 將牌 取最高番的分解（平糊）', () => {
  const hand = tiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 p7 p8 p9 s5 s5');
  assert.ok(decompose(hand).length >= 2, 'should enumerate several decompositions');
  const result = evalTiles(hand);
  assert.ok(names(result).includes('平糊'), names(result).join(','));
  assert.ok(!names(result).includes('雞糊'));
  assert.ok(result.decomposition.every((g) => g.type !== 'triplet'));
  // 原始回報的牌型（東東作將，平糊不成立）也必須正常評估
  const original = evalTiles('m1 m1 m1 m2 m2 m2 m3 m3 m3 p7 p8 p9 E E');
  assert.equal(original.isWin, true);
  assert.ok(!names(original).includes('平糊'));
  // 真正四組刻子時仍要拿到坎坎胡（13 番）
  assert.ok(names(evalTiles('m1 m1 m1 p2 p2 p2 s3 s3 s3 E E E C C')).includes('坎坎胡'));
});

test('特殊牌型仍需要合法牌型（B4）', () => {
  const junk = evalTiles('C C C F F F B B B m1 m2 m3 m4 m5');
  assert.equal(junk.isWin, false);
  assert.equal(junk.totalFan, 0);
  assert.equal(evalTiles('C C C F F F B B B m1 m2 m3 m9 m9').isWin, true);
});

test('B5：暗槓仍計入清一色／混一色，但不成坎坎胡', () => {
  const mixed = evaluateHand({
    concealed: tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m9 m9'), melds: [kong('C')],
  });
  assert.ok(names(mixed).includes('混一色'), names(mixed).join(','));
  assert.ok(!names(mixed).includes('清一色'));
  const pure = evaluateHand({
    concealed: tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m9 m9'), melds: [kong('m8')],
  });
  assert.ok(names(pure).includes('清一色'));
  assert.ok(!names(pure).includes('混一色'));
});

console.log('\n— 番數與規則表 —');

test('B6：花幺九與坎坎胡可疊加，共用對對糊只扣一次；清／混一色互斥', () => {
  const hua = evalTiles('m1 m1 m1 p9 p9 p9 s1 s1 s1 E E E C C');
  assert.ok(names(hua).includes('花幺九'));
  assert.ok(names(hua).includes('坎坎胡'));
  assert.equal(hua.patterns.find((p) => p.id === '坎坎胡').fan, 13);
  const overlap = hua.patterns.find((p) => p.id === '重疊扣減');
  assert.equal(overlap.detail, '對對糊');
  assert.equal(overlap.fan, -3);
  assert.ok(!(names(hua).includes('清一色') && names(hua).includes('混一色')));
});

test('B6：大小三元、大小四喜不疊加，番數不設上限', () => {
  const big = evalTiles('C C C F F F B B B m1 m2 m3 m9 m9');
  assert.ok(names(big).includes('大三元'));
  assert.ok(!names(big).includes('小三元'));
  assert.equal(big.totalFan, big.rawFan);
  assert.equal(big.capped, false);
  const small = evalTiles('C C C F F F B B m1 m2 m3 p4 p5 p6');
  assert.ok(names(small).includes('小三元'));
  assert.ok(!names(small).includes('大三元'));
  const bigWind = evalTiles('E E E S S S W W W N N N C C');
  assert.ok(names(bigWind).includes('大四喜'));
  assert.ok(!names(bigWind).includes('小四喜'));
  // Duplicate triplets cannot substitute for the three different dragons/winds.
  const dupDragons = evalTiles('B B B B B B F F m1 m2 m3 p4 p5 p6');
  assert.ok(!names(dupDragons).includes('小三元'));
  assert.ok(!names(dupDragons).includes('大三元'));
  const dupWinds = evalTiles('E E E E E E S S W W W m1 m2 m3');
  assert.ok(!names(dupWinds).includes('小四喜'));
  assert.ok(!names(dupWinds).includes('大四喜'));
});

test('B7：槓上開花只在開槓補摸的那一張生效', () => {
  const args = {
    concealed: tiles('m2 m2 m2 m3 m3 m3 p4 p4 p4 E E'),
    melds: [kong('m1')],
  };
  assert.ok(!names(evaluateHand({ ...args, context: { kongReplacementChain: 0 } })).includes('槓上開花'));
  assert.ok(names(evaluateHand({ ...args, context: { kongReplacementChain: 1 } })).includes('槓上開花'));
  const chain = names(evaluateHand({ ...args, context: { kongReplacementChain: 2 } }));
  assert.ok(chain.includes('連槓開花'));
  assert.ok(!chain.includes('槓上開花'));
});

test('海底撈月：最後 5 秒自摸或胡他人打出牌都計，自摸另計', () => {
  const hand = 'm1 m2 m3 m4 m5 m6 p2 p3 p4 s7 s8 s9 p9 p9'.split(' ');
  assert.ok(!names(evaluateHand({ concealed: hand })).includes('海底撈月'));
  assert.ok(!names(evaluateHand({ concealed: hand, context: { haidi: false } })).includes('海底撈月'));

  const selfDraw = evaluateHand({ concealed: hand, context: { haidi: true } });
  assert.deepEqual(names(selfDraw).sort(), ['海底撈月', '門前清', '平糊', '自摸'].sort());
  assert.equal(selfDraw.patterns.find((p) => p.id === '海底撈月').fan, 1);
  assert.equal(selfDraw.totalFan, 4); // 門前清 1 + 平糊 1 + 海底撈月 1 + 自摸 1

  const claim = evaluateHand({ concealed: hand, context: { haidi: true, selfDraw: false } });
  assert.deepEqual(names(claim).sort(), ['海底撈月', '門前清', '平糊'].sort());
  assert.equal(claim.patterns.find((p) => p.id === '海底撈月').fan, 1);
  assert.equal(claim.totalFan, 3); // 門前清 1 + 平糊 1 + 海底撈月 1

  assert.equal(FAN_VALUES['海底撈月'], 1);
  assert.equal(PATTERN_TABLE.find((p) => p.id === '海底撈月').desc, '倒數剩餘 5 秒內胡牌。');
});

test('天胡：開局補花後立即自摸，13 番且不另計門清／自摸', () => {
  const hand = 'm1 m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4 E E';
  const normal = evalTiles(hand);
  const tiangu = evalTiles(hand, { context: { tiangu: true } });
  assert.ok(!names(normal).includes('天胡'));
  assert.ok(names(tiangu).includes('天胡'));
  assert.equal(FAN_VALUES['天胡'], 13);
  assert.equal(tiangu.totalFan, 13);
  assert.ok(!names(tiangu).includes('自摸'));
  assert.ok(!names(tiangu).includes('門前清'));

  const capped = evalTiles(hand, { context: { tiangu: true, fanCap: 13 } });
  assert.equal(capped.totalFan, 13);
  assert.equal(capped.capped, false);

  // 暗槓後再摸只算槓上開花，不是天胡。
  const afterKong = evalTiles(hand, { context: { tiangu: true, kongReplacementChain: 1 } });
  assert.ok(!names(afterKong).includes('天胡'));
});

test('地胡／人胡：地胡食莊家開局第一隻打出牌，人胡為閒家第一釣自摸，各 13 番', () => {
  const hand = 'm1 m1 m1 m2 m3 m4 p5 p6 p7 s2 s3 s4 E E';
  const normal = evalTiles(hand);
  assert.ok(!names(normal).includes('地胡'));
  assert.ok(!names(normal).includes('人胡'));

  const dihu = evalTiles(hand, { context: { selfDraw: false, dihuClaim: true } });
  assert.ok(names(dihu).includes('地胡'));
  assert.equal(FAN_VALUES['地胡'], 13);
  assert.equal(dihu.totalFan, 13);
  assert.ok(!names(dihu).includes('自摸'));
  assert.ok(!names(dihu).includes('門前清'));
  // A claim flag never turns an ordinary self-draw into 地胡.
  assert.ok(!names(evalTiles(hand, { context: { dihuClaim: true } })).includes('地胡'));

  const renhu = evalTiles(hand, { context: { renhu: true } });
  assert.ok(names(renhu).includes('人胡'));
  assert.equal(FAN_VALUES['人胡'], 13);
  assert.equal(renhu.totalFan, 13);
  assert.ok(!names(renhu).includes('自摸'));
  assert.ok(!names(renhu).includes('門前清'));

  const both = evalTiles(hand, { context: { tiangu: true, renhu: true } });
  assert.ok(names(both).includes('天胡'));
  assert.ok(!names(both).includes('人胡'));
  const afterKong = evalTiles(hand, { context: { renhu: true, kongReplacementChain: 1 } });
  assert.ok(!names(afterKong).includes('人胡'));
});

test('B11：九子連環／十三幺必須門前清', () => {
  const nine = tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m5');
  const thirteen = tiles('m1 m9 p1 p9 s1 s9 E S W N C F B B');
  assert.equal(evaluateHand({ concealed: nine }).isWin, true);
  assert.equal(evaluateHand({ concealed: nine, melds: [kong('m1')] }).isWin, false);
  const nineClaim = evaluateHand({
    concealed: nine, winningTile: 'm5', context: { selfDraw: false },
  });
  assert.ok(names(nineClaim).includes('九子連環'));
  assert.ok(!names(nineClaim).includes('自摸'));
  assert.ok(nineClaim.patterns.find((p) => p.id === '九子連環').includes.includes('門前清'));
  assert.equal(evaluateHand({ concealed: thirteen }).isWin, true);
  assert.equal(evaluateHand({ concealed: thirteen, melds: [kong('m1')] }).isWin, false);
  const rob = evaluateHand({
    concealed: thirteen,
    winningTile: 'B',
    context: { selfDraw: false, qianggang: true },
  });
  assert.deepEqual(names(rob).sort(), ['十三幺', '搶槓'].sort());
  assert.equal(rob.totalFan, 14);
  assert.ok(!names(evaluateHand({ concealed: thirteen, context: { qianggang: true } })).includes('搶槓'));
  const dupOrphans = tiles('m1 m1 m1 m9 p1 p9 s1 s9 E S W N C B');
  assert.equal(isThirteenOrphans(dupOrphans), false);
  assert.equal(isNineGates(tiles('m1 m1 m1 m2 m2 m2 m4 m5 m6 m7 m8 m9 m9 m9')), false);
});

test('十三幺的 13 種對子都能胡', () => {
  for (const pair of ORPHANS) {
    const hand = [...ORPHANS, pair];
    assert.ok(isThirteenOrphans(hand), pair);
    assert.ok(names(evaluateHand({ concealed: hand })).includes('十三幺'), pair);
  }
});

test('B10：牌型一覽的每個範例都通過規則引擎', () => {
  for (const pattern of PATTERN_TABLE) {
    const result = evaluateHand(pattern.example);
    assert.equal(result.isWin, true, `${pattern.id} 的範例不是胡牌`);
    assert.ok(names(result).includes(pattern.id),
      `${pattern.id} 的範例得到 ${names(result).join(',')}`);
    assert.equal(FAN_VALUES[pattern.id], pattern.fan, `${pattern.id} 番數不一致`);
  }
});

test('番數無上限，高番不再封頂', () => {
  const hand = evalTiles('E E E S S S W W W N N N C C');
  assert.ok(hand.rawFan > 13, `rawFan=${hand.rawFan}`);
  assert.equal(hand.totalFan, hand.rawFan);
  assert.equal(hand.capped, false);
});

test('可選擇 13 番上限（自訂屋規）', () => {
  const ids = 'E E E S S S W W W N N N C C'.split(' ');
  const uncapped = evaluateHand({ concealed: ids });
  const capped = evaluateHand({ concealed: ids, context: { fanCap: 13 } });
  assert.ok(uncapped.rawFan > 13);
  assert.equal(capped.fanCap, 13);
  assert.equal(capped.totalFan, 13);
  assert.equal(capped.capped, true);
  assert.equal(capped.rawFan, uncapped.rawFan);
});

test('共用細項文字只顯示番數，不換算分數', () => {
  const result = evalTiles('C C C F F F B B B m1 m2 m3 m9 m9');
  const text = formatWinBreakdown(result);
  assert.match(text, /大三元/);
  assert.match(text, /共 13 番/);
  assert.doesNotMatch(text, /分/);
});

test('番子細項標明中、發、白與場風／門風', () => {
  for (const [tile, label] of [['C', '中'], ['F', '發'], ['B', '白']]) {
    const result = evalTiles(`${tile} ${tile} ${tile} m1 m2 m3 p2 p3 p4 s7 s8 s9 E E`);
    assert.match(formatWinBreakdown(result), new RegExp(`番子（${label}）`));
  }
  const winds = evalTiles('E E E S S S m1 m2 m3 p2 p3 p4 s7 s7', {
    context: { roundWind: 'E', seatWind: 'S' },
  });
  const windText = formatWinBreakdown(winds);
  assert.match(windText, /番子（場風）/);
  assert.match(windText, /番子（門風）/);

  const singleWind = evalTiles('E E E m1 m2 m3 p2 p3 p4 s7 s8 s9 C C', {
    context: { roundWind: 'E', seatWind: 'S' },
  });
  const doubleWind = evalTiles('E E E m1 m2 m3 p2 p3 p4 s7 s8 s9 C C', {
    context: { roundWind: 'E', seatWind: 'E' },
  });
  assert.match(formatWinBreakdown(doubleWind), /番子（場風／門風）（2 番）/);
  const doublePattern = doubleWind.patterns.find((p) => p.detail === '場風／門風');
  assert.equal(doublePattern.fan, 2);
  assert.equal(doubleWind.patterns.filter((p) => p.id === '番子').length, 1);
  assert.equal(doubleWind.rawFan, singleWind.rawFan + 1);
});

test('牌型說明與番數依據新定義', () => {
  const byId = Object.fromEntries(PATTERN_TABLE.map((p) => [p.id, p]));
  assert.equal(byId['門前清'].desc, '沒有上、碰、槓（包括暗槓）；自摸或吃胡他人打出的牌都計。');
  assert.equal(byId['坎坎胡'].desc,
    '沒有碰、槓過的對對胡（又稱四暗刻；已含對對糊、門前清）。自摸成立；胡他人打出牌時必須是單騎。');
  assert.equal(byId['搶槓'].fan, 1);
  assert.equal(FAN_VALUES['搶槓'], 1);
  assert.match(byId['搶槓'].desc, /暗槓只有十三幺可搶/);
  assert.equal(byId['地胡'].desc, '開局後，閒家食莊家打出的第一隻牌。');
  assert.equal(byId['人胡'].desc, '閒家於開局第一輪即自摸；必為門前清，不另計自摸。');
  assert.equal(byId['對對糊'].desc, '只有刻子的牌型。');
  assert.equal(byId['對對糊'].fan, 3);
  assert.equal(FAN_VALUES['對對糊'], 3);
  assert.equal(byId['自摸'].desc, '自己摸到胡牌。');
  assert.equal(byId['花幺九'].desc, '全部由幺九牌及字牌的刻子／槓子與一對將組成（已含對對糊）。');
  assert.equal(byId['海底撈月'].desc, '倒數剩餘 5 秒內胡牌。');
  assert.equal(byId['十三幺'].desc, '集齊六種么九牌及七種字牌牌，再加其中一張。');
  assert.equal(byId['大三元'].desc, '集齊中、發、白三個刻子（已含小三元及中、發、白番子）。');
  assert.equal(byId['小三元'].desc, '以全部三種三元牌組成兩副刻子加一對將（已含兩組番子）。');
});

test('對對糊 3 番，坎坎胡 13 番且碰／槓（包括暗槓）都不計', () => {
  const concealed = evalTiles('m1 m1 m1 p2 p2 p2 s3 s3 s3 E E E C C');
  assert.ok(names(concealed).includes('坎坎胡'));
  assert.equal(FAN_VALUES['坎坎胡'], 13);
  assert.equal(concealed.patterns.find((p) => p.id === '坎坎胡').fan, 13);
  assert.ok(!names(concealed).includes('對對糊'));

  const withConcealedKong = evaluateHand({
    concealed: tiles('m2 m2 m2 s3 s3 s3 E E E C C'),
    melds: [kong('p2')],
  });
  assert.ok(!names(withConcealedKong).includes('坎坎胡'));
  assert.ok(names(withConcealedKong).includes('對對糊'));
  assert.ok(!names(withConcealedKong).includes('門前清'));

  const open = evaluateHand({
    concealed: tiles('m2 m2 m2 s3 s3 s3 E E E C C'),
    melds: [{ ...kong('p2'), open: true }],
  });
  assert.ok(names(open).includes('對對糊'), names(open).join(','));
  assert.ok(!names(open).includes('坎坎胡'));
  assert.ok(!names(open).includes('門前清'));
});

test('綠一色與藍一色各計 13 番', () => {
  const green = evalTiles('s2 s3 s4 s2 s3 s4 s6 s6 s6 F F F s8 s8');
  assert.ok(names(green).includes('綠一色'), names(green).join(','));
  assert.equal(FAN_VALUES['綠一色'], 13);
  assert.ok(!names(evalTiles('s2 s3 s4 s2 s3 s4 s5 s5 s5 F F F s8 s8')).includes('綠一色'));

  const blue = evalTiles('E E E S S S W W W B B B p8 p8', {
    context: { roundWind: 'E', seatWind: 'S' },
  });
  assert.ok(names(blue).includes('藍一色'), names(blue).join(','));
  assert.equal(FAN_VALUES['藍一色'], 13);
  assert.ok(!names(evalTiles('E E E S S S W W W C C C p8 p8')).includes('藍一色'));
});

console.log('\n— 花牌（四季／四君子）—');

test('八張花牌的名稱、系列與門風對應', () => {
  assert.equal(FLOWER_IDS.length, 8);
  assert.deepEqual(FLOWER_IDS.map((id) => tileName(id)), ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹']);
  assert.ok(FLOWER_IDS.every(isFlower));
  assert.ok(!isFlower('m1') && !isFlower('E'));
  const east = evaluateFlowers(['H1', 'H5'], 'E');
  assert.equal(east.patterns.filter((p) => p.id === '正花').length, 2);
  const north = evaluateFlowers(['H1', 'H5'], 'N');
  assert.equal(north.patterns.filter((p) => p.id === '正花').length, 0);
});

test('無花、正花與一檯花（同系列正花不再另計）', () => {
  assert.deepEqual(evaluateFlowers([], 'E').patterns.map((p) => p.id), ['無花']);
  const oneTable = evaluateFlowers(['H5', 'H6', 'H7', 'H8', 'H1'], 'E');
  assert.deepEqual(oneTable.patterns.map((p) => p.id), ['一檯花', '正花']);
  assert.equal(oneTable.fan, 3); // 一檯花 2 + 春（東家正花）1
  const both = evaluateFlowers(FLOWER_IDS, 'E');
  assert.equal(both.patterns.filter((p) => p.id === '一檯花').length, 2);
  assert.equal(both.patterns.filter((p) => p.id === '正花').length, 0);
});

test('一檯花的牌型範例不多放春', () => {
  const example = FLOWER_PATTERN_TABLE.find((p) => p.id === '一檯花').example;
  assert.deepEqual(example.flowers, ['H5', 'H6', 'H7', 'H8']);
  assert.ok(evaluateFlowers(example.flowers, example.seatWind).patterns.some((p) => p.id === '一檯花'));
});

test('花糊（七花）與大花糊（八仙過海）即時胡牌', () => {
  const seven = ['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'];
  assert.equal(flowerWin(seven).id, '花糊');
  assert.equal(flowerWin(FLOWER_IDS).id, '大花糊');
  assert.equal(flowerWin([]), null);
  // Only distinct flower IDs count; duplicates cannot complete a set.
  assert.equal(flowerWin([...seven.slice(0, 6), 'H1']), null);
  assert.equal(flowerWin([...FLOWER_IDS.slice(0, 7), 'H1']).id, '花糊');
  assert.ok(!evaluateFlowers(['H5', 'H6', 'H7', 'H5'], 'E').patterns.some((p) => p.id === '一檯花'));
  const sevenResult = flowerWinResult(seven, 'E');
  assert.equal(sevenResult.isWin, true);
  assert.deepEqual(names(sevenResult), ['花糊']);
  assert.equal(sevenResult.totalFan, 3);
  const afterKong = flowerWinResult(seven, 'E', FAN_CAP, { kongReplacementChain: 1 });
  assert.deepEqual(names(afterKong).sort(), ['花糊', '槓上開花', '重疊扣減'].sort());
  assert.equal(afterKong.patterns.find((p) => p.id === '重疊扣減').detail, '自摸');
  assert.equal(afterKong.totalFan, 4);
  const eight = flowerWinResult(FLOWER_IDS, 'E');
  assert.deepEqual(names(eight), ['大花糊']);
  assert.equal(eight.totalFan, 8);
  assert.equal(eight.specialHand, true);
});

test('花糊開局加計天胡／人胡，海底撈月與自摸分開計', () => {
  const seven = ['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'];
  for (const [key, id] of [['tiangu', '天胡'], ['renhu', '人胡']]) {
    const result = flowerWinResult(seven, 'S', FAN_CAP, { [key]: true });
    assert.deepEqual(names(result).sort(), ['花糊', id, '重疊扣減'].sort());
    assert.equal(result.patterns.find((p) => p.id === '重疊扣減').detail, '自摸');
    assert.equal(result.patterns.find((p) => p.id === '重疊扣減').fan, -1);
    assert.equal(result.totalFan, 15);
  }
  // 地胡 is a discard claim, so it never appears on a flower self-draw.
  assert.ok(!names(flowerWinResult(seven, 'S', FAN_CAP, { dihuClaim: true })).includes('地胡'));
  const haidi = flowerWinResult(seven, 'S', FAN_CAP, { haidi: true });
  assert.deepEqual(names(haidi).sort(), ['海底撈月', '花糊'].sort());
  assert.equal(haidi.totalFan, 4);
});

test('花牌番數合併到普通胡牌，並遵守番數上限', () => {
  const hand = 'C C C F F F B B B m1 m2 m3 m9 m9'.split(' ');
  const base = evaluateHand({ concealed: hand });
  const withOneFlower = withFlowers(base, ['H5'], 'E');
  assert.equal(withOneFlower.totalFan, base.totalFan + 1);
  assert.ok(withOneFlower.patterns.some((p) => p.id === '正花'));
  const capped = withFlowers(base, ['H5'], 'E', 13);
  assert.equal(capped.totalFan, 13);
  assert.equal(capped.capped, true);
  assert.equal(capped.rawFan, withOneFlower.rawFan);
});

test('拒絕花糊後，花糊番數加到之後的手牌胡牌並吸收自摸與花牌番', () => {
  const seven = ['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'];
  const hand = 'C C C F F F B B B m1 m2 m3 m9 m9'.split(' ');
  const base = evaluateHand({ concealed: hand });
  assert.ok(base.isWin);

  const normal = withFlowers(base, seven, 'E');
  assert.ok(!names(normal).includes('花糊'));

  const declined = withFlowers(base, seven, 'E', FAN_CAP, { declinedFlowerWin: true });
  assert.deepEqual(names(declined).sort(), ['大三元', '門前清', '花糊', '混一色'].sort());
  assert.ok(!names(declined).includes('自摸'));
  assert.equal(declined.totalFan, 15);

  // 拒絕七花後仍可即時胡八花，大花糊不受拒絕狀態影響。
  assert.deepEqual(names(flowerWinResult(FLOWER_IDS, 'E', FAN_CAP, { declinedFlowerWin: true })), ['大花糊']);
});

test('花牌牌型一覽範例都通過規則引擎', () => {
  for (const pattern of FLOWER_PATTERN_TABLE) {
    const { flowers, seatWind = 'E' } = pattern.example;
    const result = flowerWinResult(flowers, seatWind) ?? evaluateFlowers(flowers, seatWind);
    const ids = result.patterns.map((p) => p.id);
    assert.ok(ids.includes(pattern.id), `${pattern.id} 的範例得到 ${ids.join(',')}`);
    assert.equal(FAN_VALUES[pattern.id], pattern.fan);
  }
});

test('七對子不再與花糊（七花）混淆', () => {
  const result = evalTiles('m1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E E C C');
  assert.ok(names(result).includes('七對子'));
  assert.ok(!names(result).includes('花糊'));
  assert.equal(FAN_VALUES['七對子'], 3);
});

console.log('\n— 牌牆、AI 與模擬 —');

test('B12：144 張牌牆（含 8 張花牌），整場不超過 4 張', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const wall = createWall(mulberry32(seed));
    assert.equal(wall.length, 144);
    for (const id of TILE_IDS) assert.equal(wall.filter((t) => t === id).length, 4, id);
    for (const id of FLOWER_IDS) assert.equal(wall.filter((t) => t === id).length, 1, id);
    assert.ok(wall.every((id) => TILE_IDS.includes(id) || isFlower(id)));
  }
  // Simulate a full game: caught tiles are held, uncaught fish return to the
  // wall. A physical copy can be drawn more than once but never duplicated.
  const rng = mulberry32(7);
  const wall = createWall(rng);
  const held = countTiles([]);
  while (wall.length) {
    const tile = wall.pop();
    if (rng() < 0.7) {
      held[tile] = (held[tile] ?? 0) + 1;
      assert.ok(held[tile] <= 4, `${tile} 同時出現第 ${held[tile]} 張`);
    } else {
      wall.push(tile); // 未釣到的魚回到牌牆
      if (rng() < 0.5) wall.push(wall.pop()); // 洗回牌牆
    }
  }
  for (const id of TILE_IDS) assert.equal(held[id] ?? 0, 4, id);
});

test('B13：getUsefulTiles 回傳能減少向聽的牌', () => {
  const hand = tiles('m1 m2 m3 p4 p5 p6 s7 s8 s9 m9 m9 E E');
  assert.equal(shanten(hand), 0);
  const useful = getUsefulTiles(hand);
  assert.ok(useful.length > 0);
  assert.ok(useful.every((id) => TILE_IDS.includes(id)));
});

test('AI 輔助涵蓋七對子、十三幺、綠一色與藍一色', () => {
  const sevenPairs = getAssistTiles({ concealed: tiles('m1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E E C') });
  assert.deepEqual(sevenPairs.wins, ['C']);

  const orphans = getAssistTiles({ concealed: [...ORPHANS] });
  for (const id of ORPHANS) assert.ok(orphans.wins.includes(id), id);

  const green = getAssistTiles({ concealed: tiles('s2 s3 s4 s2 s3 s4 s6 s6 s6 F F F s8') });
  assert.ok(green.wins.includes('s8'));
  assert.ok(green.progress.includes('s2'));

  const blue = getAssistTiles({ concealed: tiles('E E E S S S W W W B B B p8') });
  assert.deepEqual(blue.wins, ['p8']);
});

test('AI 輔助會引導花糊與大花糊，但不過早狂送花', () => {
  const hand = tiles('m1 m2 m3 m4 m5 m6 p2 p3 p4 s7 s8 s9 E');
  const wallWith = (held) => {
    const availability = Object.fromEntries(FLOWER_IDS.map((id) => [id, 1]));
    for (const id of held) availability[id] = 0;
    return availability;
  };
  const early = getAssistTiles({
    concealed: hand,
    flowers: FLOWER_IDS.slice(0, 2),
    availability: wallWith(FLOWER_IDS.slice(0, 2)),
  });
  assert.deepEqual(early.flowers, []);
  const late = getAssistTiles({
    concealed: hand,
    flowers: FLOWER_IDS.slice(0, 3),
    availability: wallWith(FLOWER_IDS.slice(0, 3)),
  });
  assert.deepEqual(new Set(late.flowers), new Set(FLOWER_IDS.slice(3)));
  const six = getAssistTiles({
    concealed: hand,
    flowers: FLOWER_IDS.slice(0, 6),
    availability: wallWith(FLOWER_IDS.slice(0, 6)),
  });
  assert.deepEqual(new Set(six.flowers), new Set(FLOWER_IDS.slice(6)));
  assert.equal(flowerWinResult(FLOWER_IDS.slice(0, 7))?.patterns[0].id, '花糊');
  assert.equal(flowerWinResult(FLOWER_IDS)?.patterns[0].id, '大花糊');
});

test('AI 輔助的 wins 能補足每一種普通牌型的最後一張胡牌', () => {
  for (const pattern of PATTERN_TABLE) {
    const concealed = [...(pattern.example.concealed ?? [])];
    const melds = pattern.example.melds ?? [];
    const context = pattern.example.context ?? {};
    assert.ok(concealed.length > 0, `${pattern.id} 沒有可用的胡牌範例`);

    let verified = false;
    for (const id of new Set(concealed)) {
      const index = concealed.indexOf(id);
      const before = concealed.slice(0, index).concat(concealed.slice(index + 1));
      const full = evaluateHand({ concealed, melds, winningTile: id, context });
      if (!full.isWin || !names(full).includes(pattern.id)) continue;

      const assist = getAssistTiles({
        concealed: before,
        melds,
        context,
        availability: countTiles(concealed),
      });
      assert.ok(assist.wins.includes(id), `${pattern.id} 差 ${id} 時 wins 沒有包含 ${id}`);
      verified = true;
      break;
    }
    assert.ok(verified, `${pattern.id} 找不到可驗證的胡牌張`);
  }
});

test('AI 輔助的 progress/kongs 會推進各特殊牌型家族', () => {
  const cases = [
    {
      label: '七對子',
      concealed: 'm1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E C F',
      groups: { progress: ['m1', 'E', 'C', 'F'] },
      improves: 'E',
    },
    {
      label: '十三幺',
      concealed: 'm1 m9 p1 p9 s1 s9 E S W N C C C',
      groups: { progress: ['B', 'F'] },
      improves: 'F',
    },
    {
      label: '綠一色',
      concealed: 's2 s2 s3 s3 s4 s4 s6 s6 s6 F F F p1',
      groups: { progress: ['s8', 's2', 'F'] },
    },
    {
      label: '藍一色',
      concealed: 'E E E S S S W W W B B B m1',
      groups: { progress: ['p8', 'B', 'E'] },
    },
    {
      label: '番子／大三元',
      concealed: 'C C C F F F B B m1 m2 m3 p4 p4',
      groups: { wins: ['B'], progress: ['B', 'E'] },
    },
    {
      label: '小四喜',
      concealed: 'E E E S S S W W W N m1 m2 m3',
      groups: { wins: ['N'], progress: ['N', 'C'] },
    },
    {
      label: '花幺九／清幺九',
      concealed: 'm1 m1 m1 p9 p9 p9 s1 s1 s1 E E m9 p1',
      groups: { progress: ['s9', 'm9', 'p9'] },
    },
    {
      label: '清一色／九子連環',
      concealed: 'm1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 p1 p2',
      groups: { progress: ['m5', 'm9'] },
    },
    {
      label: '槓上開花／連槓開花／十八羅漢',
      concealed: 'm2 m2 m2 p3 p3 p3 s4 s4 s4 E E C F',
      groups: { kongs: ['m2', 'p3', 's4'], progress: ['m2', 'E'] },
    },
  ];

  for (const item of cases) {
    const concealed = tiles(item.concealed);
    const assist = getAssistTiles({ concealed });
    for (const [group, expected] of Object.entries(item.groups)) {
      for (const id of expected) {
        assert.ok(assist[group].includes(id), `${item.label} 的 ${group} 沒有包含 ${id}`);
      }
    }
    if (item.improves) {
      assert.ok(shanten([...concealed, item.improves]) < shanten(concealed),
        `${item.label} 補 ${item.improves} 後沒有更接近聽牌`);
    }
  }
});

test('AI 輔助只回傳牌牆仍有的牌', () => {
  const hand = tiles('m1 m1 m3 m3 p2 p2 p7 p7 s4 s4 E E C');
  const availability = countTiles(hand);
  availability.C = 0;
  const assist = getAssistTiles({ concealed: hand, availability });
  assert.ok(!assist.wins.includes('C'));
  for (const group of [assist.wins, assist.flowers, assist.kongs, assist.progress]) {
    for (const id of group) assert.ok((availability[id] ?? 0) > 0, id);
  }
});

test('1000 場隨機遊戲模擬沒有例外', () => {
  let wins = 0;
  let draws = 0;
  for (let seed = 0; seed < 1000; seed += 1) {
    const rng = mulberry32(seed + 10000);
    const wall = createWall(rng);
    let concealed = wall.splice(0, 13);
    const melds = [];
    let context = { selfDraw: true, roundWind: 'E', seatWind: 'S' };
    let guard = 0;
    while (wall.length && guard < 200) {
      guard += 1;
      if (wall.length === 0) break;
      let drawn = wall.pop();
      // 花牌不進手牌：補花直到摸到普通牌（或牌牆用罄）。
      while (isFlower(drawn) && wall.length) drawn = wall.pop();
      if (isFlower(drawn)) break;
      concealed.push(drawn);
      context = { ...context, haidi: wall.length === 0 };
      let result = evaluateHand({ concealed, melds, winningTile: drawn, context });
      if (!result.isWin) {
        const counts = countTiles(concealed);
        const kongTile = Object.keys(counts).find((id) => counts[id] === 4);
        if (kongTile && wall.length && melds.length < 4) {
          concealed = concealed.filter((t) => t !== kongTile);
          melds.push(kong(kongTile));
          let replacement = wall.pop();
          while (isFlower(replacement) && wall.length) replacement = wall.pop();
          if (isFlower(replacement)) break;
          concealed.push(replacement);
          context.kongReplacementChain = 1;
          result = evaluateHand({ concealed, melds, winningTile: replacement, context });
        }
      }
      if (result.isWin) {
        wins += 1;
        assert.ok(result.totalFan >= 0 && result.totalFan <= FAN_CAP);
        break;
      }
      context.kongReplacementChain = 0;
      const discardIndex = Math.floor(rng() * concealed.length);
      concealed.splice(discardIndex, 1);
      if (!wall.length) draws += 1;
    }
  }
  assert.ok(wins > 0, 'at least one simulated game should be won');
  assert.ok(wins + draws <= 1000);
});

console.log('\n— 疊加規則與必要測試（T1–T13）—');

test('ABSORBS：高番牌型不高於被吸收的牌型，海底撈月不吸收自摸', () => {
  assert.ok(!ABSORBS['海底撈月']?.includes('自摸'));
  assert.equal(FAN_VALUES['海底撈月'], 1);
  for (const [id, absorbed] of Object.entries(ABSORBS)) {
    assert.ok(FAN_VALUES[id] !== undefined, `${id} 沒有番數`);
    for (const key of absorbed) {
      const base = key.startsWith('番子:') ? '番子' : key;
      assert.ok(FAN_VALUES[base] !== undefined, `${base} 沒有番數`);
      assert.ok(FAN_VALUES[id] >= FAN_VALUES[base], `${id} 不應吸收較高番的 ${base}`);
    }
  }
});

test('T1：九子連環 11 番，清一色與門前清被吸收', () => {
  const hand = tiles('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9 m5');
  assert.ok(decompose(hand).some((groups) => groups.some(
    (group) => group.type === 'pair' && group.tiles[0] === 'm5',
  )));
  const result = evalTiles(hand);
  assert.deepEqual(names(result).sort(), ['九子連環', '自摸'].sort());
  assert.equal(result.totalFan, 11);
  assert.match(formatWinBreakdown(result), /九子連環（已包含：清一色、門前清）（10 番）/);
});

test('T2：大三元與坎坎胡疊加，番子／對對糊／門前清被吸收', () => {
  const result = evalTiles('C C C F F F B B B m2 m2 m2 p5 p5');
  assert.deepEqual(names(result).sort(), ['大三元', '坎坎胡', '自摸'].sort());
  assert.equal(result.totalFan, 22);
});

test('T3：坎坎胡與花幺九共用對對糊，只扣一次 3 番', () => {
  const result = evalTiles('m1 m1 m1 p9 p9 p9 W W W N N N s1 s1');
  assert.deepEqual(names(result).sort(), ['坎坎胡', '花幺九', '重疊扣減', '自摸'].sort());
  const overlap = result.patterns.find((p) => p.id === '重疊扣減');
  assert.equal(overlap.detail, '對對糊');
  assert.equal(overlap.fan, -3);
  assert.equal(result.totalFan, 15);
  assert.match(formatWinBreakdown(result), /重疊扣減（與多個牌型共用 對對糊）（-3 番）/);
});

test('T4：明槓後補摸胡牌只有雞糊與槓上開花，共 2 番', () => {
  const result = evaluateHand({
    concealed: tiles('m1 m2 m3 p4 p5 p6 s7 s8 s9 p2 p2'),
    melds: [{ tile: 's1', type: 'kong', tiles: ['s1', 's1', 's1', 's1'], open: true }],
    context: { kongReplacementChain: 1 },
  });
  assert.deepEqual(names(result).sort(), ['雞糊', '槓上開花'].sort());
  assert.equal(result.totalFan, 2);
});

test('T5：碰過的中刻子仍計番子，自摸不受 open 影響，共 2 番', () => {
  const result = evaluateHand({
    concealed: tiles('m1 m2 m3 p4 p5 p6 s7 s8 s9 p2 p2'),
    melds: [{ tile: 'C', type: 'pung', tiles: ['C', 'C', 'C'], open: true }],
  });
  assert.deepEqual(names(result).sort(), ['番子', '自摸'].sort());
  assert.equal(result.patterns.find((p) => p.id === '番子').tile, 'C');
  assert.equal(result.totalFan, 2);
});

test('T6：小三元吸收兩組三元番子，但風牌番子仍可疊加，共 11 番', () => {
  const result = evalTiles('C C C F F F B B E E E m1 m2 m3');
  assert.deepEqual(names(result).sort(), ['小三元', '番子', '混一色', '門前清', '自摸'].sort());
  assert.equal(result.patterns.filter((p) => p.id === '番子').length, 1);
  assert.equal(result.patterns.find((p) => p.id === '番子').tile, 'E');
  assert.equal(result.totalFan, 11);
});

test('T7：大四喜與坎坎胡疊加，對對糊只扣一次；字一色吸收場風／門風番子', () => {
  const result = evalTiles('E E E S S S W W W N N N m5 m5');
  assert.deepEqual(names(result).sort(), ['大四喜', '坎坎胡', '重疊扣減', '混一色', '自摸'].sort());
  assert.ok(!names(result).includes('番子'));
  assert.equal(result.totalFan, 27);
  const bigWind = result.patterns.find((p) => p.id === '大四喜');
  assert.ok(bigWind.includes.includes('對對糊'), bigWind.includes?.join(','));

  const allHonors = evaluateHand({
    concealed: tiles('E E E S S S W W W W W W C C'),
    melds: [],
    context: { roundWind: 'E', seatWind: 'S' },
  });
  const honor = allHonors.patterns.find((p) => p.id === '字一色');
  assert.ok(honor, names(allHonors).join(','));
  assert.deepEqual([...(honor.includes ?? [])].sort(), ['對對糊', '番子', '花幺九'].sort());
  assert.ok(!names(allHonors).includes('番子'));
  assert.equal(allHonors.totalFan, 21);
});

test('T8：清幺九傳遞吸收花幺九與對對糊，共 16 番', () => {
  const result = evalTiles('m1 m1 m1 m9 m9 m9 p1 p1 p1 s9 s9 s9 p9 p9');
  assert.deepEqual(names(result).sort(), ['清幺九', '坎坎胡', '重疊扣減', '自摸'].sort());
  assert.equal(result.totalFan, 21);
});

test('T9：暗槓仍計對對糊與自摸，但不成坎坎胡，共 4 番', () => {
  const result = evaluateHand({
    concealed: tiles('m2 m2 m2 m3 m3 m3 p4 p4 p4 E E'),
    melds: [kong('m1')],
  });
  assert.deepEqual(names(result).sort(), ['對對糊', '自摸'].sort());
  assert.equal(result.totalFan, 4);
});

test('T10：七張花牌的花糊固定 3 番，不另列自摸', () => {
  const result = flowerWinResult(['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'], 'E');
  assert.deepEqual(names(result), ['花糊']);
  assert.equal(result.totalFan, 3);
});

test('T11：七花補槓胡牌為 3 + 2 − 1 = 4 番', () => {
  const result = flowerWinResult(['H1', 'H2', 'H3', 'H5', 'H6', 'H7', 'H8'], 'E', FAN_CAP, {
    kongReplacementChain: 1,
  });
  assert.deepEqual(names(result).sort(), ['花糊', '槓上開花', '重疊扣減'].sort());
  assert.equal(result.patterns.find((p) => p.id === '重疊扣減').detail, '自摸');
  assert.equal(result.totalFan, 4);
});

test('T12：八張花牌的大花糊固定 8 番', () => {
  const result = flowerWinResult(FLOWER_IDS, 'E');
  assert.deepEqual(names(result), ['大花糊']);
  assert.equal(result.totalFan, 8);
});

test('T13：0 番雞糊仍是合法胡牌，不設起糊', () => {
  const example = PATTERN_TABLE.find((p) => p.id === '雞糊').example;
  const result = evaluateHand({ ...example, context: { ...example.context, selfDraw: false } });
  assert.equal(result.isWin, true);
  assert.deepEqual(names(result), ['雞糊']);
  assert.equal(result.totalFan, 0);
  assert.equal(FAN_CAP, Infinity);
});

console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
process.exitCode = failed ? 1 : 0;
