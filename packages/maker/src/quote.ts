/**
 * Quote model for a binary question.
 *
 * Fair value comes from the engine's current mark (or an override). The
 * maker quotes a bid and ask around it, widened by a base spread, by its own
 * inventory on that question, and by time to close. All probabilities are
 * e6 bigints so the quote is exactly what goes on chain.
 */
export interface QuoteParams {
  /** Fair P(YES) e6. */
  fairE6: bigint;
  /** Half-spread in e6 at zero inventory (e.g. 20_000 = 2 points). */
  halfSpreadE6: bigint;
  /** Net YES shares the maker already holds (negative = net NO). */
  inventoryShares: number;
  /** Inventory at which the skew reaches `maxSkewE6`. */
  inventoryCapShares: number;
  maxSkewE6: bigint;
  /** Maximum shares per fill. */
  maxFillShares: number;
  /** Clamp so quotes never touch the outcome bounds. */
  minE6?: bigint;
  maxE6?: bigint;
}

export interface Quote {
  /** Price at which the maker SELLS YES to a taker (taker buys YES / goes long). */
  askE6: bigint;
  /** Price at which the maker BUYS YES from a taker (taker sells YES / goes short). */
  bidE6: bigint;
  maxBuyShares: number;
  maxSellShares: number;
  fairE6: bigint;
  skewE6: bigint;
}

function clampBig(v: bigint, lo: bigint, hi: bigint): bigint {
  return v < lo ? lo : v > hi ? hi : v;
}

export function quote(p: QuoteParams): Quote {
  const lo = p.minE6 ?? 10_000n;
  const hi = p.maxE6 ?? 990_000n;
  const cap = Math.max(p.inventoryCapShares, 1e-9);
  const ratio = Math.max(-1, Math.min(1, p.inventoryShares / cap));
  // Long inventory -> lower both prices to attract sellers of the other side.
  const skewE6 = -BigInt(Math.round(ratio * Number(p.maxSkewE6)));
  const mid = clampBig(p.fairE6 + skewE6, lo, hi);
  const askE6 = clampBig(mid + p.halfSpreadE6, lo, hi);
  const bidE6 = clampBig(mid - p.halfSpreadE6, lo, hi);
  // Taker buying YES pushes maker shorter: allowed until inventory hits -cap.
  const roomToSell = Math.max(0, cap + p.inventoryShares);
  const roomToBuy = Math.max(0, cap - p.inventoryShares);
  return {
    askE6,
    bidE6,
    maxBuyShares: Math.min(p.maxFillShares, roomToSell),
    maxSellShares: Math.min(p.maxFillShares, roomToBuy),
    fairE6: p.fairE6,
    skewE6,
  };
}

/** Net YES shares the maker holds on one asset, from its decoded legs. */
export function inventoryShares(legs: Array<{ active: boolean; assetIndex: number; marketId: bigint; side: number; basisPosQ: bigint }>, assetIndex: number, marketId: bigint): number {
  let q = 0n;
  for (const l of legs) {
    if (!l.active || l.assetIndex !== assetIndex || l.marketId !== marketId) continue;
    const abs = l.basisPosQ < 0n ? -l.basisPosQ : l.basisPosQ;
    q += l.side === 0 ? abs : -abs;
  }
  return Number(q) / 1e6;
}
