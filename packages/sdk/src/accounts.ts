import { PublicKey } from "@solana/web3.js";
import { readU16, readU64, readU8, isZeroBytes } from "./bytes.js";
import {
  AccountKind,
  AssetLifecycle,
  HEADER_LEN,
  MAGIC,
  MARKET_GROUP_OFF,
  WRAPPER_VERSION,
} from "./constants.js";
import {
  ASSET_CONTROL_SEQUENCES,
  ASSET_ORACLE_PROFILE,
  ENGINE_ASSET_SLOT,
  MARKET_ASSET_SLOT,
  MARKET_GROUP_HEADER,
  PORTFOLIO_ID_OFF,
  PORTFOLIO_LEGACY_ACCOUNT_LEN,
  PORTFOLIO_MATCHER_CONFIG,
  PORTFOLIO_MATCHER_CONFIG_OFF,
  PORTFOLIO_MATCHER_CONTROL_OFF,
  PORTFOLIO_MATCHER_SEQUENCE_OFF,
  PORTFOLIO_STATE,
  WRAPPER_CONFIG,
  decodeStruct,
  marketAssetSlotOffset,
  marketSlotCapacityFromLen,
  type Decoded,
} from "./layout.js";

// ---------------------------------------------------------------------------
// Wrapper account header
// ---------------------------------------------------------------------------

export interface WrapperHeader {
  magic: bigint;
  version: number;
  kind: number;
}

export function readWrapperHeader(data: Uint8Array): WrapperHeader {
  if (data.length < HEADER_LEN) throw new Error("account shorter than wrapper header");
  return { magic: readU64(data, 0), version: readU16(data, 8), kind: readU8(data, 10) };
}

export function isInitialized(data: Uint8Array): boolean {
  return data.length >= HEADER_LEN && readU64(data, 0) === MAGIC;
}

export function expectKind(data: Uint8Array, kind: number): void {
  const h = readWrapperHeader(data);
  if (h.magic !== MAGIC) throw new Error("bad magic: not a Percolator account");
  if (h.version !== WRAPPER_VERSION) throw new Error(`unexpected wrapper version ${h.version}`);
  if (h.kind !== kind) throw new Error(`expected account kind ${kind}, found ${h.kind}`);
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface PortfolioLeg {
  slot: number;
  active: boolean;
  assetIndex: number;
  marketId: bigint;
  side: number;
  basisPosQ: bigint;
  aBasis: bigint;
  stale: boolean;
  bStale: boolean;
}

export interface PortfolioSourceDomain {
  domain: number;
  sourceClaimMarketId: bigint;
  sourceClaimBoundNum: bigint;
  sourceClaimLienedNum: bigint;
  sourceClaimImpairedNum: bigint;
  sourceLienEffectiveReserved: bigint;
}

export interface HealthCert {
  valid: boolean;
  certifiedEquity: bigint;
  certifiedInitialReq: bigint;
  certifiedMaintenanceReq: bigint;
  certifiedLiqDeficit: bigint;
  certifiedWorstCaseLoss: bigint;
  certOracleEpoch: bigint;
  certRiskEpoch: bigint;
}

export interface Portfolio {
  address: PublicKey | null;
  marketGroupId: PublicKey;
  portfolioAccountId: PublicKey;
  owner: PublicKey;
  layoutDiscriminator: number;
  capital: bigint;
  pnl: bigint;
  reservedPnl: bigint;
  feeCredits: bigint;
  lastFeeSlot: bigint;
  activeBitmap: bigint;
  legs: PortfolioLeg[];
  sourceDomains: PortfolioSourceDomain[];
  healthCert: HealthCert;
  staleState: number;
  bStaleState: number;
  rebalanceLock: boolean;
  liquidationLock: boolean;
  closeActive: boolean;
  closeResidualRemaining: bigint;
  /** Wrapper tail. */
  portfolioId: bigint;
  matcherSequence: bigint;
  positionEpoch: bigint;
  matcherEnabled: boolean;
  matcherTradeFeeCapBps: number;
  matcherProgram: PublicKey;
  matcherContext: PublicKey;
  /** Raw decoded engine state for anything not surfaced above. */
  raw: Decoded;
}

const POSITION_EPOCH_SHIFT = 1n;
const POSITION_EPOCH_BITS = 49n;
const POSITION_EPOCH_MASK = ((1n << POSITION_EPOCH_BITS) - 1n) << POSITION_EPOCH_SHIFT;
const TRADE_FEE_CAP_SHIFT = POSITION_EPOCH_SHIFT + POSITION_EPOCH_BITS;
const TRADE_FEE_CAP_MASK = 0x3fffn << TRADE_FEE_CAP_SHIFT;

export function decodeMatcherControl(control: bigint): {
  enabled: boolean;
  positionEpoch: bigint;
  tradeFeeCapBps: number;
} {
  return {
    enabled: (control & 1n) === 1n,
    positionEpoch: (control & POSITION_EPOCH_MASK) >> POSITION_EPOCH_SHIFT,
    tradeFeeCapBps: Number((control & TRADE_FEE_CAP_MASK) >> TRADE_FEE_CAP_SHIFT),
  };
}

function pk(bytes: unknown): PublicKey {
  return new PublicKey(bytes as Uint8Array);
}

export function decodePortfolio(data: Uint8Array, address?: PublicKey): Portfolio {
  expectKind(data, AccountKind.Portfolio);
  const raw = decodeStruct(PORTFOLIO_STATE, data, HEADER_LEN);
  const prov = raw["provenance_header"] as Decoded;
  const legsRaw = raw["legs"] as Decoded[];
  const domainsRaw = raw["source_domains"] as Decoded[];
  const cert = raw["health_cert"] as Decoded;
  const close = raw["close_progress"] as Decoded;

  const legs: PortfolioLeg[] = legsRaw.map((l, i) => ({
    slot: i,
    active: (l["active"] as number) === 1,
    assetIndex: l["asset_index"] as number,
    marketId: l["market_id"] as bigint,
    side: l["side"] as number,
    basisPosQ: l["basis_pos_q"] as bigint,
    aBasis: l["a_basis"] as bigint,
    stale: (l["stale"] as number) === 1,
    bStale: (l["b_stale"] as number) === 1,
  }));

  const sourceDomains: PortfolioSourceDomain[] = domainsRaw
    .map((d) => ({
      domain: d["domain"] as number,
      sourceClaimMarketId: d["source_claim_market_id"] as bigint,
      sourceClaimBoundNum: d["source_claim_bound_num"] as bigint,
      sourceClaimLienedNum: d["source_claim_liened_num"] as bigint,
      sourceClaimImpairedNum: d["source_claim_impaired_num"] as bigint,
      sourceLienEffectiveReserved: d["source_lien_effective_reserved"] as bigint,
    }))
    .filter(
      (d) =>
        d.sourceClaimBoundNum !== 0n ||
        d.sourceClaimLienedNum !== 0n ||
        d.sourceClaimImpairedNum !== 0n ||
        d.sourceLienEffectiveReserved !== 0n,
    );

  const portfolioId = readU64(data, PORTFOLIO_ID_OFF);
  const matcherSequence =
    data.length === PORTFOLIO_LEGACY_ACCOUNT_LEN ? 0n : readU64(data, PORTFOLIO_MATCHER_SEQUENCE_OFF);
  const control = readU64(data, PORTFOLIO_MATCHER_CONTROL_OFF);
  const ctl = decodeMatcherControl(control);
  const matcher = decodeStruct(PORTFOLIO_MATCHER_CONFIG, data, PORTFOLIO_MATCHER_CONFIG_OFF);

  return {
    address: address ?? null,
    marketGroupId: pk(prov["market_group_id"]),
    portfolioAccountId: pk(prov["portfolio_account_id"]),
    owner: pk(raw["owner"]),
    layoutDiscriminator: prov["layout_discriminator"] as number,
    capital: raw["capital"] as bigint,
    pnl: raw["pnl"] as bigint,
    reservedPnl: raw["reserved_pnl"] as bigint,
    feeCredits: raw["fee_credits"] as bigint,
    lastFeeSlot: raw["last_fee_slot"] as bigint,
    activeBitmap: (raw["active_bitmap"] as bigint[])[0]!,
    legs,
    sourceDomains,
    healthCert: {
      valid: (cert["valid"] as number) === 1,
      certifiedEquity: cert["certified_equity"] as bigint,
      certifiedInitialReq: cert["certified_initial_req"] as bigint,
      certifiedMaintenanceReq: cert["certified_maintenance_req"] as bigint,
      certifiedLiqDeficit: cert["certified_liq_deficit"] as bigint,
      certifiedWorstCaseLoss: cert["certified_worst_case_loss"] as bigint,
      certOracleEpoch: cert["cert_oracle_epoch"] as bigint,
      certRiskEpoch: cert["cert_risk_epoch"] as bigint,
    },
    staleState: raw["stale_state"] as number,
    bStaleState: raw["b_stale_state"] as number,
    rebalanceLock: (raw["rebalance_lock"] as number) === 1,
    liquidationLock: (raw["liquidation_lock"] as number) === 1,
    closeActive: (close["active"] as number) === 1,
    closeResidualRemaining: close["residual_remaining"] as bigint,
    portfolioId,
    matcherSequence,
    positionEpoch: ctl.positionEpoch,
    matcherEnabled: ctl.enabled,
    matcherTradeFeeCapBps: ctl.tradeFeeCapBps,
    matcherProgram: pk(matcher["matcher_program"]),
    matcherContext: pk(matcher["matcher_context"]),
    raw,
  };
}

/** Active legs only, in canonical slot order. */
export function activeLegs(p: Portfolio): PortfolioLeg[] {
  return p.legs.filter((l) => l.active);
}

// ---------------------------------------------------------------------------
// Market group
// ---------------------------------------------------------------------------

export interface WrapperConfig {
  marketauth: PublicKey;
  collateralMint: PublicKey;
  secondaryCollateralMint: PublicKey | null;
  maintenanceFeePerSlot: bigint;
  permissionlessMarketInitFee: bigint;
  tradeFeeBaseBps: bigint;
  permissionlessResolveStaleSlots: bigint;
  forceCloseDelaySlots: bigint;
  lastGoodOracleSlot: bigint;
  liquidationCrankerFeeShareBps: number;
  maintenanceCrankerFeeShareBps: number;
  freeMarketSlotCount: number;
  feeRedirectToMarket0Bps: number;
  nextPortfolioId: bigint;
  raw: Decoded;
}

export interface EngineConfig {
  maxPortfolioAssets: number;
  maxMarketSlots: number;
  hMin: bigint;
  hMax: bigint;
  maintenanceMarginBps: bigint;
  initialMarginBps: bigint;
  maxTradingFeeBps: bigint;
  liquidationFeeBps: bigint;
  maxPriceMoveBpsPerSlot: bigint;
  maxAccrualDtSlots: bigint;
  maxAbsFundingE9PerSlot: bigint;
  raw: Decoded;
}

export interface AssetOracleProfile {
  oracleMode: number;
  insuranceAuthority: PublicKey;
  insuranceOperator: PublicKey;
  backingBucketAuthority: PublicKey;
  oracleAuthority: PublicKey;
  assetAdmin: PublicKey;
  markEwmaE6: bigint;
  markEwmaLastSlot: bigint;
  oracleTargetPriceE6: bigint;
  lastGoodOracleSlot: bigint;
  effectivePriceProvenance: number;
  raw: Decoded;
}

export interface AssetControlSequences {
  oracleObservation: bigint;
  authorityEpoch: bigint;
  backingFee: bigint;
  tradeFee: bigint;
  liquidationFee: bigint;
  maintenanceFee: bigint;
  feeRedirect: bigint;
  marketInitFee: bigint;
  permissionlessResolve: bigint;
  insuranceTopUp: bigint;
  backingTopUp: bigint;
}

export interface SourceCredit {
  positiveClaimBoundNum: bigint;
  exactPositiveClaimNum: bigint;
  freshReservedBackingNum: bigint;
  validLienedBackingNum: bigint;
  impairedLienedBackingNum: bigint;
  insuranceCreditReservedNum: bigint;
  /** In CREDIT_RATE_SCALE units; CREDIT_RATE_SCALE means fully realizable. */
  creditRateNum: bigint;
  creditEpoch: bigint;
}

export interface MarketAsset {
  index: number;
  marketId: bigint;
  lifecycle: number;
  lifecycleName: string;
  rawOracleTargetPrice: bigint;
  effectivePrice: bigint;
  slotLast: bigint;
  oiEffLongQ: bigint;
  oiEffShortQ: bigint;
  storedPosCountLong: bigint;
  storedPosCountShort: bigint;
  staleAccountCountLong: bigint;
  staleAccountCountShort: bigint;
  modeLong: number;
  modeShort: number;
  insuranceDomainBudgetLong: bigint;
  insuranceDomainBudgetShort: bigint;
  /** Source domain that backs long-side (YES) profit: the shorts. */
  sourceCreditShort: SourceCredit;
  /** Source domain that backs short-side (NO) profit: the longs. */
  sourceCreditLong: SourceCredit;
  oracle: AssetOracleProfile;
  control: AssetControlSequences;
  raw: Decoded;
}

export interface MarketGroup {
  address: PublicKey | null;
  wrapper: WrapperConfig;
  config: EngineConfig;
  assetSlotCapacity: number;
  /** Slots actually backed by account bytes (from account length). */
  physicalSlotCapacity: number;
  vault: bigint;
  insurance: bigint;
  cTot: bigint;
  pnlPosTot: bigint;
  materializedPortfolioCount: bigint;
  nextMarketId: bigint;
  oracleEpoch: bigint;
  riskEpoch: bigint;
  slotLast: bigint;
  currentSlot: bigint;
  mode: number;
  bankruptcyHlockActive: boolean;
  thresholdStressActive: boolean;
  lossStaleActive: boolean;
  resolvedSlot: bigint;
  assets: MarketAsset[];
  raw: Decoded;
}

function decodeSourceCredit(d: Decoded): SourceCredit {
  return {
    positiveClaimBoundNum: d["positive_claim_bound_num"] as bigint,
    exactPositiveClaimNum: d["exact_positive_claim_num"] as bigint,
    freshReservedBackingNum: d["fresh_reserved_backing_num"] as bigint,
    validLienedBackingNum: d["valid_liened_backing_num"] as bigint,
    impairedLienedBackingNum: d["impaired_liened_backing_num"] as bigint,
    insuranceCreditReservedNum: d["insurance_credit_reserved_num"] as bigint,
    creditRateNum: d["credit_rate_num"] as bigint,
    creditEpoch: d["credit_epoch"] as bigint,
  };
}

export function decodeWrapperConfig(data: Uint8Array): WrapperConfig {
  const raw = decodeStruct(WRAPPER_CONFIG, data, HEADER_LEN);
  const secondary = raw["secondary_collateral_mint"] as Uint8Array;
  return {
    marketauth: pk(raw["marketauth"]),
    collateralMint: pk(raw["collateral_mint"]),
    secondaryCollateralMint: isZeroBytes(secondary) ? null : pk(secondary),
    maintenanceFeePerSlot: raw["maintenance_fee_per_slot"] as bigint,
    permissionlessMarketInitFee: raw["permissionless_market_init_fee"] as bigint,
    tradeFeeBaseBps: raw["trade_fee_base_bps"] as bigint,
    permissionlessResolveStaleSlots: raw["permissionless_resolve_stale_slots"] as bigint,
    forceCloseDelaySlots: raw["force_close_delay_slots"] as bigint,
    lastGoodOracleSlot: raw["last_good_oracle_slot"] as bigint,
    liquidationCrankerFeeShareBps: raw["liquidation_cranker_fee_share_bps"] as number,
    maintenanceCrankerFeeShareBps: raw["maintenance_cranker_fee_share_bps"] as number,
    freeMarketSlotCount: raw["free_market_slot_count"] as number,
    feeRedirectToMarket0Bps: raw["fee_redirect_to_market_0_bps"] as number,
    nextPortfolioId: raw["next_portfolio_id"] as bigint,
    raw,
  };
}

export function decodeMarketAsset(data: Uint8Array, index: number): MarketAsset {
  const base = marketAssetSlotOffset(index);
  const slot = decodeStruct(MARKET_ASSET_SLOT, data, base);
  const profile = slot["oracle_profile"] as Decoded;
  const control = slot["control_sequences"] as Decoded;
  const engine = slot["engine"] as Decoded;
  const asset = engine["asset"] as Decoded;
  const lifecycle = asset["lifecycle"] as number;
  return {
    index,
    marketId: asset["market_id"] as bigint,
    lifecycle,
    lifecycleName: lifecycleName(lifecycle),
    rawOracleTargetPrice: asset["raw_oracle_target_price"] as bigint,
    effectivePrice: asset["effective_price"] as bigint,
    slotLast: asset["slot_last"] as bigint,
    oiEffLongQ: asset["oi_eff_long_q"] as bigint,
    oiEffShortQ: asset["oi_eff_short_q"] as bigint,
    storedPosCountLong: asset["stored_pos_count_long"] as bigint,
    storedPosCountShort: asset["stored_pos_count_short"] as bigint,
    staleAccountCountLong: asset["stale_account_count_long"] as bigint,
    staleAccountCountShort: asset["stale_account_count_short"] as bigint,
    modeLong: asset["mode_long"] as number,
    modeShort: asset["mode_short"] as number,
    insuranceDomainBudgetLong: engine["insurance_domain_budget_long"] as bigint,
    insuranceDomainBudgetShort: engine["insurance_domain_budget_short"] as bigint,
    sourceCreditLong: decodeSourceCredit(engine["source_credit_long"] as Decoded),
    sourceCreditShort: decodeSourceCredit(engine["source_credit_short"] as Decoded),
    oracle: {
      oracleMode: profile["oracle_mode"] as number,
      insuranceAuthority: pk(profile["insurance_authority"]),
      insuranceOperator: pk(profile["insurance_operator"]),
      backingBucketAuthority: pk(profile["backing_bucket_authority"]),
      oracleAuthority: pk(profile["oracle_authority"]),
      assetAdmin: pk(profile["asset_admin"]),
      markEwmaE6: profile["mark_ewma_e6"] as bigint,
      markEwmaLastSlot: profile["mark_ewma_last_slot"] as bigint,
      oracleTargetPriceE6: profile["oracle_target_price_e6"] as bigint,
      lastGoodOracleSlot: profile["last_good_oracle_slot"] as bigint,
      effectivePriceProvenance: profile["effective_price_provenance"] as number,
      raw: profile,
    },
    control: {
      oracleObservation: control["oracle_observation"] as bigint,
      authorityEpoch: control["authority_epoch"] as bigint,
      backingFee: control["backing_fee"] as bigint,
      tradeFee: control["trade_fee"] as bigint,
      liquidationFee: control["liquidation_fee"] as bigint,
      maintenanceFee: control["maintenance_fee"] as bigint,
      feeRedirect: control["fee_redirect"] as bigint,
      marketInitFee: control["market_init_fee"] as bigint,
      permissionlessResolve: control["permissionless_resolve"] as bigint,
      insuranceTopUp: control["insurance_top_up"] as bigint,
      backingTopUp: control["backing_top_up"] as bigint,
    },
    raw: engine,
  };
}

export function lifecycleName(code: number): string {
  switch (code) {
    case AssetLifecycle.Disabled:
      return "Disabled";
    case AssetLifecycle.PendingActivation:
      return "PendingActivation";
    case AssetLifecycle.Active:
      return "Active";
    case AssetLifecycle.DrainOnly:
      return "DrainOnly";
    case AssetLifecycle.Retired:
      return "Retired";
    case AssetLifecycle.Recovery:
      return "Recovery";
    default:
      return `Unknown(${code})`;
  }
}

export function decodeMarketGroup(data: Uint8Array, address?: PublicKey): MarketGroup {
  expectKind(data, AccountKind.Market);
  const physicalSlotCapacity = marketSlotCapacityFromLen(data.length);
  const wrapper = decodeWrapperConfig(data);
  const raw = decodeStruct(MARKET_GROUP_HEADER, data, MARKET_GROUP_OFF);
  const cfg = raw["config"] as Decoded;
  const config: EngineConfig = {
    maxPortfolioAssets: cfg["max_portfolio_assets"] as number,
    maxMarketSlots: cfg["max_market_slots"] as number,
    hMin: cfg["h_min"] as bigint,
    hMax: cfg["h_max"] as bigint,
    maintenanceMarginBps: cfg["maintenance_margin_bps"] as bigint,
    initialMarginBps: cfg["initial_margin_bps"] as bigint,
    maxTradingFeeBps: cfg["max_trading_fee_bps"] as bigint,
    liquidationFeeBps: cfg["liquidation_fee_bps"] as bigint,
    maxPriceMoveBpsPerSlot: cfg["max_price_move_bps_per_slot"] as bigint,
    maxAccrualDtSlots: cfg["max_accrual_dt_slots"] as bigint,
    maxAbsFundingE9PerSlot: cfg["max_abs_funding_e9_per_slot"] as bigint,
    raw: cfg,
  };
  const assetSlotCapacity = raw["asset_slot_capacity"] as number;
  const configured = config.maxMarketSlots;
  if (configured > physicalSlotCapacity) {
    throw new Error(
      `market declares ${configured} configured slots but account holds ${physicalSlotCapacity}; layout mismatch`,
    );
  }
  const assets: MarketAsset[] = [];
  for (let i = 0; i < configured; i++) assets.push(decodeMarketAsset(data, i));
  return {
    address: address ?? null,
    wrapper,
    config,
    assetSlotCapacity,
    physicalSlotCapacity,
    vault: raw["vault"] as bigint,
    insurance: raw["insurance"] as bigint,
    cTot: raw["c_tot"] as bigint,
    pnlPosTot: raw["pnl_pos_tot"] as bigint,
    materializedPortfolioCount: raw["materialized_portfolio_count"] as bigint,
    nextMarketId: raw["next_market_id"] as bigint,
    oracleEpoch: raw["oracle_epoch"] as bigint,
    riskEpoch: raw["risk_epoch"] as bigint,
    slotLast: raw["slot_last"] as bigint,
    currentSlot: raw["current_slot"] as bigint,
    mode: raw["mode"] as number,
    bankruptcyHlockActive: (raw["bankruptcy_hlock_active"] as number) === 1,
    thresholdStressActive: (raw["threshold_stress_active"] as number) === 1,
    lossStaleActive: (raw["loss_stale_active"] as number) === 1,
    resolvedSlot: raw["resolved_slot"] as bigint,
    assets,
    raw,
  };
}

/** Domain index pair for an asset: `(long_domain, short_domain) = (2i, 2i+1)`. */
export function domainPairForAsset(assetIndex: number): { long: number; short: number } {
  return { long: assetIndex * 2, short: assetIndex * 2 + 1 };
}

// Re-exported for callers that want the raw schema objects next to the decoders.
export { ASSET_CONTROL_SEQUENCES, ASSET_ORACLE_PROFILE, ENGINE_ASSET_SLOT };
