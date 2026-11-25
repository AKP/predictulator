/**
 * Keeper planning as pure functions over decoded state.
 *
 * Two jobs:
 *  1. Crank portfolios that need bounded progress (stale legs, invalid
 *     health certificate, active bankrupt close, pending B settlement).
 *  2. Net longs against shorts on questions that are in Recovery after
 *     resolution, once the force-close delay has elapsed.
 */
import {
  AssetLifecycle,
  type MarketAsset,
  type MarketGroup,
  type Portfolio,
  type PortfolioLeg,
} from "@predictulator/sdk";

export interface CrankTarget {
  portfolio: Portfolio;
  reasons: string[];
  /** Asset indices whose legs are stale on this portfolio. */
  staleAssets: number[];
}

export function crankTargets(market: MarketGroup, portfolios: Portfolio[]): CrankTarget[] {
  const out: CrankTarget[] = [];
  for (const p of portfolios) {
    const reasons: string[] = [];
    const legs = p.legs.filter((l) => l.active);
    const staleAssets = legs.filter((l) => l.stale || l.bStale).map((l) => l.assetIndex);
    if (staleAssets.length) reasons.push(`stale legs on assets ${staleAssets.join(",")}`);
    if (legs.length && !p.healthCert.valid) reasons.push("health certificate invalid");
    if (legs.length && p.healthCert.valid && p.healthCert.certOracleEpoch !== market.oracleEpoch) {
      reasons.push("certificate behind oracle epoch");
    }
    if (p.closeActive) reasons.push("bankrupt close in progress");
    if (p.liquidationLock) reasons.push("liquidation lock");
    if (p.healthCert.valid && p.healthCert.certifiedLiqDeficit > 0n) reasons.push("liquidatable");
    if (reasons.length) out.push({ portfolio: p, reasons, staleAssets });
  }
  // Worst first: liquidatable, then active closes, then staleness and lag.
  const rank = (t: CrankTarget): number => {
    if (t.reasons.includes("liquidatable")) return 0;
    if (t.reasons.some((r) => r.startsWith("bankrupt"))) return 1;
    return 2;
  };
  return out.sort((a, b) => rank(a) - rank(b));
}

export interface ForceClosePair {
  asset: MarketAsset;
  longPortfolio: Portfolio;
  shortPortfolio: Portfolio;
  /** Quantity to net, in POS_SCALE units. */
  closeQ: bigint;
}

/** Effective quantity of a leg; positive long, negative short. Raw basis is a conservative proxy. */
function signedQ(leg: PortfolioLeg): bigint {
  const abs = leg.basisPosQ < 0n ? -leg.basisPosQ : leg.basisPosQ;
  return leg.side === 0 ? abs : -abs;
}

/**
 * Questions in Recovery whose force-close delay has elapsed, with greedy
 * largest-against-largest pairing so each transaction nets as much as it can.
 */
export function forceClosePairs(
  market: MarketGroup,
  portfolios: Portfolio[],
  nowSlot: bigint,
): ForceClosePair[] {
  const delay = market.wrapper.forceCloseDelaySlots;
  if (delay === 0n) return [];
  const pairs: ForceClosePair[] = [];
  for (const asset of market.assets) {
    if (asset.lifecycle !== AssetLifecycle.Recovery) continue;
    const shutdownSlot = asset.oracle.lastGoodOracleSlot;
    if (shutdownSlot === 0n || nowSlot < shutdownSlot + delay) continue;
    if (asset.oiEffLongQ === 0n && asset.oiEffShortQ === 0n) continue;

    const longs: Array<{ p: Portfolio; q: bigint }> = [];
    const shorts: Array<{ p: Portfolio; q: bigint }> = [];
    for (const p of portfolios) {
      for (const leg of p.legs) {
        if (!leg.active || leg.assetIndex !== asset.index || leg.marketId !== asset.marketId) continue;
        const q = signedQ(leg);
        if (q > 0n) longs.push({ p, q });
        else if (q < 0n) shorts.push({ p, q: -q });
      }
    }
    longs.sort((a, b) => (b.q > a.q ? 1 : b.q < a.q ? -1 : 0));
    shorts.sort((a, b) => (b.q > a.q ? 1 : b.q < a.q ? -1 : 0));
    let i = 0;
    let j = 0;
    while (i < longs.length && j < shorts.length) {
      const l = longs[i]!;
      const s = shorts[j]!;
      const closeQ = l.q < s.q ? l.q : s.q;
      pairs.push({ asset, longPortfolio: l.p, shortPortfolio: s.p, closeQ });
      l.q -= closeQ;
      s.q -= closeQ;
      if (l.q === 0n) i++;
      if (s.q === 0n) j++;
    }
    // A lone residue (one side empty) is handled by the program's forfeit
    // branch when a pair is submitted with a flat counterparty; the service
    // submits those using any flat portfolio as the other account.
    const residue = i < longs.length ? longs.slice(i) : shorts.slice(j);
    for (const r of residue) {
      const flat = portfolios.find((p) => !p.legs.some((l) => l.active && l.assetIndex === asset.index) && p !== r.p);
      if (!flat) break;
      const isLong = i < longs.length;
      pairs.push({
        asset,
        longPortfolio: isLong ? r.p : flat,
        shortPortfolio: isLong ? flat : r.p,
        closeQ: r.q,
      });
    }
  }
  return pairs;
}
