import { BOUND_SCALE, type InitMarketParams } from "@predictulator/sdk";

/**
 * Default risk parameters for a prediction market.
 *
 * Prices live in [0.000001, 1.000000], so "notional" is the YES price times
 * shares. A long is fully collateralized at 100% initial margin; a short at
 * price p posts p per share against a worst case of (1 - p). That gap is
 * covered the way any Percolator perp covers it: per-slot price caps,
 * liquidation at maintenance margin, insurance, and realizable-credit
 * containment. See docs/DESIGN.md, "Margin".
 *
 * The solvency envelope in the spec (section 1.3) must hold:
 *   price_budget_bps = max_price_move_bps_per_slot * max_accrual_dt_slots = 1200
 *   loss on X        = 12% of X (no funding)
 *   liquidation fee  = 1% of ~1.12 X
 *   maintenance      = 25% of X  >= 12% + 1.12%
 */
export const PREDICTION_MARKET_PARAMS: InitMarketParams = {
  maxPortfolioAssets: 14,
  hMin: 0n,
  hMax: BOUND_SCALE,
  // Asset 0 is the base slot; it is never a question. Any valid price works.
  initialPrice: 500_000n,
  minNonzeroMmReq: 1_000n,
  minNonzeroImReq: 1_000n,
  maintenanceMarginBps: 2_500n,
  initialMarginBps: 10_000n,
  maxTradingFeeBps: 1_000n,
  tradeFeeBaseBps: 20n,
  liquidationFeeBps: 100n,
  liquidationFeeCap: 1_000_000_000n,
  minLiquidationAbs: 10_000n,
  maxPriceMoveBpsPerSlot: 300n,
  maxAccrualDtSlots: 4n,
  maxAbsFundingE9PerSlot: 0n,
  minFundingLifetimeSlots: 4n,
  maxAccountBSettlementChunks: 8n,
  maxBankruptCloseChunks: 8n,
  maxBankruptCloseLifetimeSlots: 10_000n,
  publicBChunkAtoms: 1_000_000n,
  maintenanceFeePerSlot: 0n,
};

/** Post-init policies. Slots are ~400ms on Solana. */
export const PREDICTION_MARKET_POLICY = {
  /** 1 USDC-like unit to create a question; goes to asset-0 insurance. */
  questionCreationFeeAtoms: 1_000_000n,
  /** A question can be force-closed 1,500 slots (~10 min) after shutdown. */
  forceCloseDelaySlots: 1_500n,
  /** If no oracle update lands for ~3 days the market can be resolved permissionlessly. */
  permissionlessResolveStaleSlots: 648_000n,
  liquidationCrankerShareBps: 2_000,
  maintenanceCrankerShareBps: 0,
};
