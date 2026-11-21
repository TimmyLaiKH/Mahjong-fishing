/* ------------------------------------------------------------------ *
 * HK mahjong payout math — pure, no DOM, runnable in Node.
 *
 * V(f) = 2^f x B                                                  if f <= 4
 * V(f) = 16 x 2^floor((f-4)/2) x (1.5 if (f-4) is odd, else 1) x B  if f >= 5
 *
 * 放槍: the discarder pays V.
 * 自摸: each of the other three pays V/2, so the winner gains 1.5 x V.
 * ------------------------------------------------------------------ */

/** Table value multiplier at fan f, in units of the base stake B. */
export function payoutMultiplier(fan) {
  const f = Math.max(0, Math.floor(Number(fan) || 0));
  if (f <= 4) return 2 ** f;
  const steps = Math.floor((f - 4) / 2);
  return 16 * (2 ** steps) * ((f - 4) % 2 ? 1.5 : 1);
}

/** Table value V in dollars. Always an integer for integer base. */
export function payoutValue(fan, base) {
  const b = Math.max(1, Math.floor(Number(base) || 1));
  return Math.round(payoutMultiplier(fan) * b);
}

/**
 * Describe a win's money movement.
 * { value, each, total, selfDraw }
 *   value  — discarder's payment (放槍) or each payer's share (自摸)
 *   each   — per-payer amount
 *   total  — winner's gain
 */
export function winPayout(fan, base, selfDraw = false) {
  const value = payoutValue(fan, base);
  if (selfDraw) {
    const each = Math.round(value / 2);
    return { value, each, total: each * 3, selfDraw: true };
  }
  return { value, each: value, total: value, selfDraw: false };
}

/**
 * Apply a completed round to a four-seat money array (non-mutating).
 * winner === null means a draw (no payment).
 * Returns { money, payout, log, dealerSeat, repeatCount, handNumber, windIndex, over }.
 */
export function settleRound({
  money = [0, 0, 0, 0],
  winner = null,
  discarder = null,
  fan = 0,
  base = 1,
  selfDraw = false,
  dealerSeat = 0,
  repeatCount = 0,
  handNumber = 0,
  totalWinds = 4,
} = {}) {
  const seats = [0, 1, 2, 3];
  const before = seats.map((seat) => Math.floor(Number(money[seat]) || 0));
  const after = [...before];
  let payout = null;

  if (winner !== null && winner !== undefined && after[winner] !== undefined) {
    payout = winPayout(fan, base, selfDraw);
    if (selfDraw) {
      for (const seat of seats) {
        if (seat === winner) continue;
        after[seat] -= payout.each;
        after[winner] += payout.each;
      }
    } else if (after[discarder] !== undefined && discarder !== winner) {
      after[discarder] -= payout.value;
      after[winner] += payout.value;
    }
  }

  const dealerWon = winner === dealerSeat;
  const nextDealer = dealerWon ? dealerSeat : (dealerSeat + 1) % 4;
  const nextRepeat = dealerWon ? repeatCount + 1 : 0;
  const nextHandNumber = dealerWon ? handNumber : handNumber + 1;

  const log = {
    winner, discarder: selfDraw ? null : discarder, fan, base,
    selfDraw, payout,
    before, after: [...after],
    dealerSeat, dealerWon, repeatCount: nextRepeat,
    windIndex: Math.floor(handNumber / 4),
  };

  const over = after.some((value) => value <= 0) || nextHandNumber >= totalWinds * 4;

  return {
    money: after, payout, log,
    dealerSeat: nextDealer, repeatCount: nextRepeat,
    handNumber: nextHandNumber,
    windIndex: Math.floor(nextHandNumber / 4),
    over,
  };
}
