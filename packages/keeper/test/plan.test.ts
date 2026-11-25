import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { AssetLifecycle, type MarketAsset, type MarketGroup, type Portfolio, type PortfolioLeg } from "@predictulator/sdk";
import { crankTargets, forceClosePairs } from "../src/plan.js";

const pk = (): import("@solana/web3.js").PublicKey => Keypair.generate().publicKey;

function leg(assetIndex: number, marketId: bigint, side: 0 | 1, shares: number, stale = false): PortfolioLeg {
  return { slot: assetIndex, active: true, assetIndex, marketId, side, basisPosQ: BigInt(shares) * 1_000_000n * (side === 0 ? 1n : -1n), aBasis: 0n, stale, bStale: false };
}

function portfolio(legs: PortfolioLeg[], over: Partial<Portfolio> = {}): Portfolio {
  const k = pk();
  return {
    address: k, marketGroupId: k, portfolioAccountId: k, owner: pk(), layoutDiscriminator: 18,
    capital: 10_000_000n, pnl: 0n, reservedPnl: 0n, feeCredits: 0n, lastFeeSlot: 0n, activeBitmap: 0n,
    legs, sourceDomains: [],
    healthCert: { valid: true, certifiedEquity: 0n, certifiedInitialReq: 0n, certifiedMaintenanceReq: 0n, certifiedLiqDeficit: 0n, certifiedWorstCaseLoss: 0n, certOracleEpoch: 7n, certRiskEpoch: 0n },
    staleState: 0, bStaleState: 0, rebalanceLock: false, liquidationLock: false, closeActive: false, closeResidualRemaining: 0n,
    portfolioId: 1n, matcherSequence: 0n, positionEpoch: 0n, matcherEnabled: false, matcherTradeFeeCapBps: 0, matcherProgram: k, matcherContext: k, raw: {},
    ...over,
  };
}

function asset(index: number, over: Partial<MarketAsset> = {}): MarketAsset {
  const k = pk();
  const sc = { positiveClaimBoundNum: 0n, exactPositiveClaimNum: 0n, freshReservedBackingNum: 0n, validLienedBackingNum: 0n, impairedLienedBackingNum: 0n, insuranceCreditReservedNum: 0n, creditRateNum: 0n, creditEpoch: 0n };
  return {
    index, marketId: BigInt(index + 1), lifecycle: AssetLifecycle.Active, lifecycleName: "Active",
    rawOracleTargetPrice: 1n, effectivePrice: 1n, slotLast: 0n, oiEffLongQ: 0n, oiEffShortQ: 0n,
    storedPosCountLong: 0n, storedPosCountShort: 0n, staleAccountCountLong: 0n, staleAccountCountShort: 0n, modeLong: 0, modeShort: 0,
    insuranceDomainBudgetLong: 0n, insuranceDomainBudgetShort: 0n, sourceCreditLong: sc, sourceCreditShort: sc,
    oracle: { oracleMode: 3, insuranceAuthority: k, insuranceOperator: k, backingBucketAuthority: k, oracleAuthority: k, assetAdmin: k, markEwmaE6: 1n, markEwmaLastSlot: 0n, oracleTargetPriceE6: 1n, lastGoodOracleSlot: 0n, effectivePriceProvenance: 0, raw: {} },
    control: { oracleObservation: 0n, authorityEpoch: 0n, backingFee: 0n, tradeFee: 0n, liquidationFee: 0n, maintenanceFee: 0n, feeRedirect: 0n, marketInitFee: 0n, permissionlessResolve: 0n, insuranceTopUp: 0n, backingTopUp: 0n },
    raw: {}, ...over,
  };
}

function market(assets: MarketAsset[], forceCloseDelaySlots = 100n): MarketGroup {
  const k = pk();
  return {
    address: k,
    wrapper: { marketauth: k, collateralMint: k, secondaryCollateralMint: null, maintenanceFeePerSlot: 0n, permissionlessMarketInitFee: 0n, tradeFeeBaseBps: 0n, permissionlessResolveStaleSlots: 0n, forceCloseDelaySlots, lastGoodOracleSlot: 0n, liquidationCrankerFeeShareBps: 0, maintenanceCrankerFeeShareBps: 0, freeMarketSlotCount: 0, feeRedirectToMarket0Bps: 0, nextPortfolioId: 1n, raw: {} },
    config: { maxPortfolioAssets: 14, maxMarketSlots: assets.length, hMin: 0n, hMax: 0n, maintenanceMarginBps: 0n, initialMarginBps: 0n, maxTradingFeeBps: 0n, liquidationFeeBps: 0n, maxPriceMoveBpsPerSlot: 0n, maxAccrualDtSlots: 0n, maxAbsFundingE9PerSlot: 0n, raw: {} },
    assetSlotCapacity: assets.length, physicalSlotCapacity: assets.length, vault: 0n, insurance: 0n, cTot: 0n, pnlPosTot: 0n,
    materializedPortfolioCount: 0n, nextMarketId: 0n, oracleEpoch: 7n, riskEpoch: 0n, slotLast: 0n, currentSlot: 0n, mode: 0,
    bankruptcyHlockActive: false, thresholdStressActive: false, lossStaleActive: false, resolvedSlot: 0n, assets, raw: {},
  };
}

describe("crank targets", () => {
  it("picks stale, uncertified, liquidatable, and closing portfolios, worst first", () => {
    const m = market([asset(0), asset(1)]);
    const fine = portfolio([leg(1, 2n, 0, 1)]);
    const stale = portfolio([leg(1, 2n, 0, 1, true)]);
    const behind = portfolio([leg(1, 2n, 1, 1)], { healthCert: { ...fine.healthCert, certOracleEpoch: 6n } });
    const liq = portfolio([leg(1, 2n, 1, 1)], { healthCert: { ...fine.healthCert, certifiedLiqDeficit: 5n } });
    const closing = portfolio([], { closeActive: true });
    const flat = portfolio([]);
    const targets = crankTargets(m, [fine, stale, behind, liq, closing, flat]);
    expect(targets.map((t) => t.portfolio)).not.toContain(fine);
    expect(targets.map((t) => t.portfolio)).not.toContain(flat);
    expect(targets[0]!.portfolio).toBe(liq);
    expect(targets.find((t) => t.portfolio === stale)!.staleAssets).toEqual([1]);
    expect(targets.find((t) => t.portfolio === behind)!.reasons).toContain("certificate behind oracle epoch");
    expect(targets.find((t) => t.portfolio === closing)!.reasons).toContain("bankrupt close in progress");
  });
});

describe("force-close pairing", () => {
  it("does nothing before the delay elapses or for live assets", () => {
    const rec = asset(1, { lifecycle: AssetLifecycle.Recovery, oiEffLongQ: 1n, oiEffShortQ: 1n, oracle: { ...asset(1).oracle, lastGoodOracleSlot: 1000n } });
    const m = market([asset(0), rec]);
    const ps = [portfolio([leg(1, 2n, 0, 3)]), portfolio([leg(1, 2n, 1, 3)])];
    expect(forceClosePairs(m, ps, 1050n)).toEqual([]);
    expect(forceClosePairs(market([asset(0), asset(1)]), ps, 5000n)).toEqual([]);
    expect(forceClosePairs(m, ps, 1100n)).toHaveLength(1);
  });

  it("nets largest against largest and carries remainders", () => {
    const rec = asset(1, { lifecycle: AssetLifecycle.Recovery, oiEffLongQ: 1n, oiEffShortQ: 1n, oracle: { ...asset(1).oracle, lastGoodOracleSlot: 10n } });
    const m = market([asset(0), rec]);
    const l5 = portfolio([leg(1, 2n, 0, 5)]);
    const l2 = portfolio([leg(1, 2n, 0, 2)]);
    const s4 = portfolio([leg(1, 2n, 1, 4)]);
    const s3 = portfolio([leg(1, 2n, 1, 3)]);
    const pairs = forceClosePairs(m, [l2, s3, l5, s4], 10_000n);
    expect(pairs.map((p) => [p.longPortfolio, p.shortPortfolio, p.closeQ])).toEqual([
      [l5, s4, 4_000_000n],
      [l5, s3, 1_000_000n],
      [l2, s3, 2_000_000n],
    ]);
  });

  it("ignores legs from a previous generation of the same slot", () => {
    const rec = asset(1, { marketId: 9n, lifecycle: AssetLifecycle.Recovery, oiEffLongQ: 1n, oiEffShortQ: 1n, oracle: { ...asset(1).oracle, lastGoodOracleSlot: 10n } });
    const m = market([asset(0), rec]);
    const old = portfolio([leg(1, 2n, 0, 5)]);
    const cur = portfolio([leg(1, 9n, 1, 5)]);
    const flat = portfolio([]);
    const pairs = forceClosePairs(m, [old, cur, flat], 10_000n);
    // only the current-generation short exists; it is paired with the flat account for forfeit
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.shortPortfolio).toBe(cur);
    expect(pairs[0]!.longPortfolio).toBe(flat);
  });
});
