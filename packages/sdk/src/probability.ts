/**
 * Probability <-> Percolator price mapping.
 *
 * A question is a Percolator asset whose price is P(YES) scaled by 1e6, in
 * collateral atoms per POS_SCALE units of position. With a 6-decimal
 * collateral (devnet USDC), one share (POS_SCALE quantity) at price p costs
 * `p` atoms and pays 1_000_000 atoms (1.00) if YES resolves.
 *
 *   YES  = long  = positive size_q
 *   NO   = short = negative size_q
 *
 * Resolution marks: YES -> 1_000_000, NO -> 1 (the engine forbids a zero
 * price, so NO leaves one atom per share of residual on the table).
 */
import { MAX_POSITION_ABS_Q, POS_SCALE } from "./constants.js";

export const PROB_SCALE = 1_000_000n;
export const MARK_YES = 1_000_000n;
export const MARK_NO = 1n;
export const MIN_MARK = 1n;
export const MAX_MARK = 1_000_000n;

export type Outcome = "YES" | "NO";
/** Which side of a question a position is on. Distinct from the engine's numeric `Side`. */
export type BetSide = "YES" | "NO";

export function clampMark(m: bigint): bigint {
  if (m < MIN_MARK) return MIN_MARK;
  if (m > MAX_MARK) return MAX_MARK;
  return m;
}

/** Probability in [0, 1] -> mark e6 in [1, 1_000_000]. */
export function probToMark(p: number): bigint {
  if (!Number.isFinite(p)) throw new RangeError("probability must be finite");
  return clampMark(BigInt(Math.round(p * 1_000_000)));
}

export function markToProb(m: bigint): number {
  return Number(m) / 1_000_000;
}

export function outcomeMark(o: Outcome): bigint {
  return o === "YES" ? MARK_YES : MARK_NO;
}

/** Whole shares -> engine quantity (POS_SCALE units). */
export function sharesToQ(shares: number | bigint): bigint {
  const q = BigInt(typeof shares === "number" ? Math.round(shares * 1_000_000) : shares * POS_SCALE);
  if (q < 0n || q > MAX_POSITION_ABS_Q) throw new RangeError("share count out of range");
  return q;
}

export function qToShares(q: bigint): number {
  return Number(q) / 1_000_000;
}

/** Signed engine size from the taker's point of view. */
export function signedSizeQ(side: BetSide, shares: number | bigint): bigint {
  const q = sharesToQ(shares);
  return side === "YES" ? q : -q;
}

/** `trade_notional = floor(|size_q| * exec_price / POS_SCALE)` in collateral atoms. */
export function notionalAtoms(sizeQ: bigint, priceE6: bigint): bigint {
  const abs = sizeQ < 0n ? -sizeQ : sizeQ;
  return (abs * priceE6) / POS_SCALE;
}

/** Maximum loss of a position held to resolution, ignoring fees. */
export function worstCaseLossAtoms(side: BetSide, sizeQ: bigint, entryE6: bigint): bigint {
  const abs = sizeQ < 0n ? -sizeQ : sizeQ;
  const perShare = side === "YES" ? entryE6 - MARK_NO : MARK_YES - entryE6;
  return (abs * perShare) / POS_SCALE;
}

/** Profit (positive) or loss (negative) of a position at a given mark, in atoms. */
export function pnlAtMark(side: BetSide, sizeQ: bigint, entryE6: bigint, markE6: bigint): bigint {
  const abs = sizeQ < 0n ? -sizeQ : sizeQ;
  const delta = side === "YES" ? markE6 - entryE6 : entryE6 - markE6;
  return (abs * delta) / POS_SCALE;
}

/** Initial margin the engine requires for a notional at `initial_margin_bps`. */
export function marginAtoms(notional: bigint, marginBps: bigint): bigint {
  return (notional * marginBps + 9_999n) / 10_000n;
}

/** Format atoms of a 6-decimal collateral as a decimal string. */
export function formatAtoms(atoms: bigint, decimals = 6): string {
  const neg = atoms < 0n;
  const abs = neg ? -atoms : atoms;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function formatProb(markE6: bigint): string {
  return `${(markToProb(markE6) * 100).toFixed(1)}%`;
}

/**
 * Realizable fraction of a source domain's claims, from the engine's credit
 * rate (CREDIT_RATE_SCALE = 1e12 means every atom of claimed profit is backed).
 */
export function creditRateToFraction(creditRateNum: bigint): number {
  return Number(creditRateNum) / 1e12;
}
