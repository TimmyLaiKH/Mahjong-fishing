/*
 * Tile definitions, emoji compatibility mapping and image helpers.
 *
 * This module is safe to import from Node (used by the test suite): no DOM or
 * browser globals are touched at module scope. All image work happens inside
 * functions that are only called by the browser game.
 */

const CODE = {
  E: 0x1f000, S: 0x1f001, W: 0x1f002, N: 0x1f003,
  C: 0x1f004, F: 0x1f005, B: 0x1f006,
  m: 0x1f007, s: 0x1f010, p: 0x1f019,
};

const FACE_FILE = {
  E: 'Ton', S: 'Nan', W: 'Shaa', N: 'Pei',
  C: 'Chun', F: 'Hatsu', B: 'Haku',
};

const HONOR_NAME = { E: '東', S: '南', W: '西', N: '北', C: '中', F: '發', B: '白' };
const NUMBER_NAME = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SUIT_NAME = { m: '萬', p: '筒', s: '索' };

/** The 34 regular tile kinds in canonical order (used everywhere for sorting). */
export const TILE_IDS = [
  ...Array.from({ length: 9 }, (_, i) => `m${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `p${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `s${i + 1}`),
  'E', 'S', 'W', 'N', 'C', 'F', 'B',
];

/**
 * The 8 flower tiles. They never join the concealed hand: opening flowers are
 * replaced while dealing; in play the player hooks the next tile. Wind mapping
 * follows the HK rule:
 * 1=東 (春/梅), 2=南 (夏/蘭), 3=西 (秋/菊), 4=北 (冬/竹).
 */
export const FLOWER_IDS = Object.freeze(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8']);
export const SEASON_IDS = Object.freeze(['H1', 'H2', 'H3', 'H4']);
export const PLANT_IDS = Object.freeze(['H5', 'H6', 'H7', 'H8']);
export const FLOWER_INFO = Object.freeze({
  H1: { name: '春', series: 'season', wind: 'E' },
  H2: { name: '夏', series: 'season', wind: 'S' },
  H3: { name: '秋', series: 'season', wind: 'W' },
  H4: { name: '冬', series: 'season', wind: 'N' },
  H5: { name: '梅', series: 'plant', wind: 'E' },
  H6: { name: '蘭', series: 'plant', wind: 'S' },
  H7: { name: '菊', series: 'plant', wind: 'W' },
  H8: { name: '竹', series: 'plant', wind: 'N' },
});
export const isFlower = (id) => Object.hasOwn(FLOWER_INFO, id);

const SUIT_OF_PREFIX = { m: 'wan', p: 'tong', s: 'sou' };

function makeTileInfo(id) {
  const isHonor = id.length === 1;
  const prefix = id[0];
  const value = isHonor ? 0 : Number(id[1]);
  const suit = isHonor ? 'honor' : SUIT_OF_PREFIX[prefix];
  const codePoint = isHonor ? CODE[id] : CODE[prefix] + value - 1;
  const name = isHonor
    ? HONOR_NAME[id]
    : `${NUMBER_NAME[value]}${SUIT_NAME[prefix]}`;
  return {
    id,
    emoji: String.fromCodePoint(codePoint),
    file: isHonor ? FACE_FILE[id] : `${prefix === 'm' ? 'Man' : prefix === 'p' ? 'Pin' : 'Sou'}${value}`,
    suit,
    value,
    name,
    isHonor,
    isTerminal: !isHonor && (value === 1 || value === 9),
  };
}

/** id -> { id, emoji, source file, suit, value, Chinese name, flags }. */
export const TILE_INFO = Object.fromEntries([
  ...TILE_IDS.map((id) => [id, makeTileInfo(id)]),
  ...FLOWER_IDS.map((id) => [id, {
    id,
    emoji: FLOWER_INFO[id].name,
    file: id,
    suit: 'flower',
    value: Number(id[1]),
    name: FLOWER_INFO[id].name,
    isHonor: false,
    isFlower: true,
    isTerminal: false,
    series: FLOWER_INFO[id].series,
    wind: FLOWER_INFO[id].wind,
  }]),
]);

/** Emoji from the old single-file version -> stable tile id. */
export const EMOJI_TO_ID = Object.fromEntries(
  TILE_IDS.map((id) => [TILE_INFO[id].emoji, id]),
);

export const BACK_ID = 'BACK';
export const TILE_IMAGE_DIR = 'assets/tiles/faces';
// Bump after replacing runtime faces so browsers reload them without a hard refresh.
export const TILE_ASSET_VERSION = 7;

export function tileImagePath(id) {
  const suffix = `?v=${TILE_ASSET_VERSION}`;
  if (id === BACK_ID) return `${TILE_IMAGE_DIR}/Back.png${suffix}`;
  // Runtime faces are named after the tile id (m1, p9, s5, E, C, ...).
  return `${TILE_IMAGE_DIR}/${id}.png${suffix}`;
}

export function tileName(id) {
  return id === BACK_ID ? '牌背' : (TILE_INFO[id]?.name ?? id);
}

export function emojiForTile(id) {
  return id === BACK_ID ? '🀫' : (TILE_INFO[id]?.emoji ?? '?');
}

/** Preload every runtime image. Resolves even if some images fail. */
export function loadImages(ids, onProgress = () => {}) {
  const paths = [[BACK_ID, tileImagePath(BACK_ID)], ...ids.map((id) => [id, tileImagePath(id)])];
  const images = Object.create(null);
  const failed = [];
  let done = 0;

  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ images, failed: paths.map(([id]) => id) });
      return;
    }
    for (const [id, path] of paths) {
      const img = new Image();
      img.onload = () => { images[id] = img; finish(); };
      img.onerror = () => { failed.push(id); finish(); };
      img.src = path;
    }
    function finish() {
      done += 1;
      onProgress(done, paths.length);
      if (done === paths.length) resolve({ images, failed });
    }
  });
}

/**
 * Draw a tile centred on (x, y). Falls back to the legacy emoji when the
 * image for that tile failed to load.
 */
export function drawTile(ctx, id, x, y, width, height, options = {}) {
  const { faceDown = false, shadow = false, alpha = 1, rotation = 0 } = options;
  const imageId = faceDown ? BACK_ID : id;
  const image = options.images?.[imageId];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
  }
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#f6f1e6';
    ctx.strokeStyle = '#b23a3a';
    ctx.lineWidth = 2;
    const r = Math.min(width, height) * 0.1;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = `${Math.floor(height * 0.62)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiForTile(imageId), 0, 0);
  }
  ctx.restore();
}

/** Build a DOM tile (img with emoji fallback) for the HUD and modal panels. */
export function createTileElement(id, options = {}) {
  const { faceDown = false, images, className = '' } = options;
  const span = document.createElement('span');
  span.className = `tile-img ${className}`.trim();
  span.dataset.tile = faceDown ? BACK_ID : id;
  const imageId = faceDown ? BACK_ID : id;
  const img = images?.[imageId];
  if (img) {
    const clone = document.createElement('img');
    clone.src = img.src;
    clone.alt = tileName(id);
    clone.draggable = false;
    span.appendChild(clone);
  } else {
    span.textContent = emojiForTile(imageId);
    span.classList.add('tile-fallback');
  }
  return span;
}
