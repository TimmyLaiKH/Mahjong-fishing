/*
 * Pure helpers for the twelve character abilities.
 *
 * Node-runnable, side-effect free: imports only rules.js and tiles.js, never
 * touches DOM, audio, timers or localStorage. The browser game orchestration
 * lives in game.js; this module only holds deterministic calculations so the
 * same inputs give the same output on every device.
 */

import { findWaits } from './rules.js';
import { TILE_IDS } from './tiles.js';

/** Wildcard tile id (a NEW runtime asset; not one of TILE_IDS). */
export const WILDCARD_ID = 'WILD';

/** id -> ability definition. CD values in seconds (host-authoritative). */
export const ABILITY_DEFS = Object.freeze({
  'cat-boat': { id: 'cat-boat', kind: 'passive', desc: '胡牌收益 +10~50%' },
  squid: { id: 'squid', kind: 'active', cdSeconds: 60, desc: '潑墨遮擋對手視野 5 秒' },
  giraffe: { id: 'giraffe', kind: 'active', cdSeconds: 60, desc: '偷看指定對手手牌' },
  sparrow: { id: 'sparrow', kind: 'passive', desc: '開局多一張百搭牌' },
  bee: { id: 'bee', kind: 'passive', desc: '每 2 張花 +1 番' },
  monkey: { id: 'monkey', kind: 'active', cdSeconds: 180, desc: '隨機偷對手 1/20 資金' },
  phoenix: { id: 'phoenix', kind: 'passive', desc: '破產時以 $1 復活，之後收益 +20%' },
  dragon: { id: 'dragon', kind: 'passive', desc: '別人不能碰上槓你的牌' },
  turtle: { id: 'turtle', kind: 'passive', desc: '輸錢 -10~50%' },
  'panda-raft': { id: 'panda-raft', kind: 'passive', desc: '每 3 張索子 +1 番' },
  penguin: { id: 'penguin', kind: 'active', cdSeconds: 120, desc: '冰凍對手 3 秒' },
  pig: { id: 'pig', kind: 'passive', desc: '每局結束資金 +5% 利息' },
});

export function characterAbility(id) {
  return ABILITY_DEFS[id] ?? null;
}

/** Extra fan from Bee (flowers) / Panda (sou) — added to bonusFan before 起糊. */
export function bonusFanFor(characterId, { flowerCount = 0, souCount = 0 } = {}) {
  if (characterId === 'bee') return Math.floor(flowerCount / 2);
  if (characterId === 'panda-raft') return Math.floor(souCount / 3);
  return 0;
}

export function cooldownReady(cooldowns, id, now) {
  return (cooldowns?.[id] ?? 0) <= now;
}

/** Returns a NEW cooldown object (never mutates the argument). */
export function startCooldown(cooldowns, id, now) {
  const def = ABILITY_DEFS[id];
  const seconds = def?.cdSeconds ?? 0;
  // `now` and cooldowns are in SECONDS (game clock), not milliseconds.
  return { ...(cooldowns ?? {}), [id]: now + seconds };
}

/**
 * Apply money-modifying passives to a settled round. Pure.
 * Percentages (earnPct / losePct) are host-rolled 0..0.5 and passed in; this
 * function never generates randomness, so repeated calls with identical input
 * are identical — a hard requirement for multiplayer settlement idempotency.
 */
export function applyAbilityMoney({
  before, settledMoney, characters, revived, earnPct, losePct,
}) {
  const money = [];
  const changes = [];
  const nextRevived = [...(revived ?? [])];
  for (let seat = 0; seat < settledMoney.length; seat += 1) {
    const prior = before[seat];
    let delta = settledMoney[seat] - prior;
    const id = characters?.[seat];
    if (delta > 0 && id === 'cat-boat') {
      delta = Math.round(delta * (1 + (earnPct?.[seat] ?? 0)));
    }
    if (delta > 0 && id === 'phoenix' && nextRevived[seat]) {
      delta = Math.round(delta * 1.2);
    }
    if (delta < 0 && id === 'turtle') {
      delta = -Math.round(-delta * (1 - (losePct?.[seat] ?? 0)));
    }
    if (id === 'pig') {
      delta += Math.round(settledMoney[seat] * 0.05);
    }
    if (id === 'phoenix' && prior + delta <= 0) {
      delta = 1 - prior;
      nextRevived[seat] = true;
    }
    const value = Math.floor(prior + delta);
    money.push(value);
    changes.push({ seat, delta: value - prior, character: id });
  }
  return { money, changes, revived: nextRevived };
}

/**
 * Replace a wildcard in `concealed` with each of the 34 regular tiles and
 * return every substitute that leaves the hand 聽牌 (findWaits non-empty).
 * Runs ALL substitutes — never stops at the first, never reduces to one.
 */
export function wildcardWaitTiles(concealed, melds = [], context = {}) {
  const idx = concealed.indexOf(WILDCARD_ID);
  if (idx < 0) return [];
  const result = [];
  for (const tile of TILE_IDS) {
    const substituted = [...concealed];
    substituted[idx] = tile;
    if (findWaits(substituted, melds, context).length > 0 && !result.includes(tile)) {
      result.push(tile);
    }
  }
  return result;
}
