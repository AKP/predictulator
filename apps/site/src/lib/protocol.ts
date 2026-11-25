/**
 * Protocol math used by the charts. Each function mirrors a rule in the
 * engine, the spec, or the services, so the charts show what the system
 * does rather than an illustration of it.
 */

export const E6 = 1_000_000;
export const MARK_NO = 1;
export const MARK_YES = 1_000_000;

/**
 * Effective price path under the per-slot cap: each slot moves at most
 * `cap_bps / 10_000` of the current price toward the target (and at least
 * one atom). Same loop as the resolver's `convergenceSlots`.
 */
export function convergencePath(fromE6: number, toE6: number, capBps: number, maxSlots = 200): number[] {
  const out = [fromE6];
  let price = fromE6;
  for (let i = 0; i < maxSlots && price !== toE6; i++) {
    const step = Math.max(1, Math.floor((price * capBps) / 10_000));
    price = price < toE6 ? Math.min(toE6, price + step) : Math.max(toE6, price - step);
    out.push(price);
  }
  return out;
}

/** Profit or loss per share at a final mark, in collateral units. */
export function pnlPerShare(side: 'YES' | 'NO', entryE6: number, markE6: number): number {
  const delta = side === 'YES' ? markE6 - entryE6 : entryE6 - markE6;
  return delta / E6;
}

/** Collateral posted per share at `initial_margin_bps` of notional. */
export function postedPerShare(entryE6: number, marginBps: number): number {
  return (entryE6 / E6) * (marginBps / 10_000);
}

/** Worst-case loss per share held to resolution. */
export function worstCasePerShare(side: 'YES' | 'NO', entryE6: number): number {
  return side === 'YES' ? (entryE6 - MARK_NO) / E6 : (MARK_YES - entryE6) / E6;
}

/**
 * Engine credit rate for a source domain:
 *   claim_bound == 0 -> 1 (nothing is owed)
 *   else min(1, available_backing / claim_bound)
 */
export function creditRate(availableBacking: number, claimBound: number): number {
  if (claimBound <= 0) return 1;
  return Math.min(1, availableBacking / claimBound);
}

/** Slots needed to converge (for captions). */
export function convergenceSlots(fromE6: number, toE6: number, capBps: number): number {
  return convergencePath(fromE6, toE6, capBps, 100_000).length - 1;
}

export function fmtProb(e6: number, digits = 1): string {
  return `${((e6 / E6) * 100).toFixed(digits)}%`;
}

export function fmtUnits(v: number, digits = 2): string {
  return v.toFixed(digits);
}
