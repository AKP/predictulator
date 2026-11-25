/**
 * Instruction builders.
 *
 * Byte layouts mirror `Instruction::decode` in the upstream program; account
 * orders mirror each `handle_*` function. Both were transcribed from source,
 * not guessed, and `instructions.test.ts` pins the byte vectors.
 */
import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { ByteWriter, readI128, readU16, readU64 } from "./bytes.js";
import {
  AssetAction,
  AssetAuthorityKind,
  CRANK_OBSERVATION_DECODE_MAX,
  DEFAULT_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  Tag,
} from "./constants.js";

const w = (k: PublicKey, signer = false): AccountMeta => ({
  pubkey: k,
  isSigner: signer,
  isWritable: true,
});
const r = (k: PublicKey, signer = false): AccountMeta => ({
  pubkey: k,
  isSigner: signer,
  isWritable: false,
});

function ix(programId: PublicKey, keys: AccountMeta[], data: Uint8Array): TransactionInstruction {
  return new TransactionInstruction({ programId, keys, data: Buffer.from(data) });
}

export interface ProgramOpts {
  programId?: PublicKey;
}
const pid = (o?: ProgramOpts): PublicKey => o?.programId ?? DEFAULT_PROGRAM_ID;

// ---------------------------------------------------------------------------
// Market lifecycle
// ---------------------------------------------------------------------------

export interface InitMarketParams {
  maxPortfolioAssets: number;
  hMin: bigint;
  hMax: bigint;
  initialPrice: bigint;
  minNonzeroMmReq: bigint;
  minNonzeroImReq: bigint;
  maintenanceMarginBps: bigint;
  initialMarginBps: bigint;
  maxTradingFeeBps: bigint;
  tradeFeeBaseBps: bigint;
  liquidationFeeBps: bigint;
  liquidationFeeCap: bigint;
  minLiquidationAbs: bigint;
  maxPriceMoveBpsPerSlot: bigint;
  maxAccrualDtSlots: bigint;
  maxAbsFundingE9PerSlot: bigint;
  minFundingLifetimeSlots: bigint;
  maxAccountBSettlementChunks: bigint;
  maxBankruptCloseChunks: bigint;
  maxBankruptCloseLifetimeSlots: bigint;
  publicBChunkAtoms: bigint;
  maintenanceFeePerSlot: bigint;
}

export function encodeInitMarket(p: InitMarketParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.InitMarket)
    .u16(p.maxPortfolioAssets)
    .u64(p.hMin)
    .u64(p.hMax)
    .u64(p.initialPrice)
    .u128(p.minNonzeroMmReq)
    .u128(p.minNonzeroImReq)
    .u64(p.maintenanceMarginBps)
    .u64(p.initialMarginBps)
    .u64(p.maxTradingFeeBps)
    .u64(p.tradeFeeBaseBps)
    .u64(p.liquidationFeeBps)
    .u128(p.liquidationFeeCap)
    .u128(p.minLiquidationAbs)
    .u64(p.maxPriceMoveBpsPerSlot)
    .u64(p.maxAccrualDtSlots)
    .u64(p.maxAbsFundingE9PerSlot)
    .u64(p.minFundingLifetimeSlots)
    .u64(p.maxAccountBSettlementChunks)
    .u64(p.maxBankruptCloseChunks)
    .u64(p.maxBankruptCloseLifetimeSlots)
    .u128(p.publicBChunkAtoms)
    .u128(p.maintenanceFeePerSlot)
    .toBytes();
}

/** accounts: [admin signer, market (writable, program-owned, pre-allocated), collateral mint] */
export function initMarket(
  a: { admin: PublicKey; market: PublicKey; mint: PublicKey },
  p: InitMarketParams,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market), r(a.mint)], encodeInitMarket(p));
}

// ---------------------------------------------------------------------------
// Portfolio lifecycle
// ---------------------------------------------------------------------------

/** accounts: [owner signer, market w, portfolio w (program-owned, PORTFOLIO_ACCOUNT_LEN, rent-exempt)] */
export function initPortfolio(
  a: { owner: PublicKey; market: PublicKey; portfolio: PublicKey },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(
    pid(o),
    [r(a.owner, true), w(a.market), w(a.portfolio)],
    new ByteWriter().u8(Tag.InitPortfolio).toBytes(),
  );
}

export interface SequencedAmount {
  portfolioId: bigint;
  /** Must equal the portfolio's current matcher sequence; it advances on success. */
  expectedSequence: bigint;
  amount: bigint;
}

export function encodeDeposit(p: SequencedAmount): Uint8Array {
  return new ByteWriter()
    .u8(Tag.Deposit)
    .u64(p.portfolioId)
    .u64(p.expectedSequence)
    .u128(p.amount)
    .toBytes();
}

/** accounts: [owner s, market w, portfolio w, source token w, vault token w, token program] */
export function deposit(
  a: {
    owner: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    sourceToken: PublicKey;
    vaultToken: PublicKey;
  },
  p: SequencedAmount,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(
    pid(o),
    [
      r(a.owner, true),
      w(a.market),
      w(a.portfolio),
      w(a.sourceToken),
      w(a.vaultToken),
      r(SPL_TOKEN_PROGRAM_ID),
    ],
    encodeDeposit(p),
  );
}

export function encodeWithdraw(p: SequencedAmount): Uint8Array {
  return new ByteWriter()
    .u8(Tag.Withdraw)
    .u64(p.portfolioId)
    .u64(p.expectedSequence)
    .u128(p.amount)
    .toBytes();
}

/** accounts: [owner s, market w, portfolio w, dest token w, vault token w, vault authority, token program] */
export function withdraw(
  a: {
    owner: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    destToken: PublicKey;
    vaultToken: PublicKey;
    vaultAuthority: PublicKey;
  },
  p: SequencedAmount,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(
    pid(o),
    [
      r(a.owner, true),
      w(a.market),
      w(a.portfolio),
      w(a.destToken),
      w(a.vaultToken),
      r(a.vaultAuthority),
      r(SPL_TOKEN_PROGRAM_ID),
    ],
    encodeWithdraw(p),
  );
}

export interface CloseBinding {
  portfolioId: bigint;
  expectedSequence: bigint;
  positionEpoch: bigint;
}

export function encodeClosePortfolio(p: CloseBinding): Uint8Array {
  return new ByteWriter()
    .u8(Tag.ClosePortfolio)
    .u64(p.portfolioId)
    .u64(p.expectedSequence)
    .u64(p.positionEpoch)
    .toBytes();
}

/** accounts: [closer s (owner, or marketauth on a resolved market), market w, portfolio w] */
export function closePortfolio(
  a: { closer: PublicKey; market: PublicKey; portfolio: PublicKey },
  p: CloseBinding,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.closer, true), w(a.market), w(a.portfolio)], encodeClosePortfolio(p));
}

// ---------------------------------------------------------------------------
// Trading (bilateral, both owners sign)
// ---------------------------------------------------------------------------

export interface TradeNoCpiParams {
  accountAPortfolioId: bigint;
  accountAPositionEpoch: bigint;
  accountBPortfolioId: bigint;
  accountBPositionEpoch: bigint;
  assetIndex: number;
  marketId: bigint;
  /** Signed quantity in POS_SCALE units from account A's point of view: > 0 long (YES), < 0 short (NO). */
  sizeQ: bigint;
  /** Execution price in collateral atoms per POS_SCALE units; for Predictulator this is probability * 1e6. */
  execPrice: bigint;
  /** Must be >= the market's trade_fee_base_bps. Both signers consent to it. */
  feeBps: bigint;
  backingFeeCapBps: number;
}

export function encodeTradeNoCpi(p: TradeNoCpiParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.TradeNoCpi)
    .u64(p.accountAPortfolioId)
    .u64(p.accountAPositionEpoch)
    .u64(p.accountBPortfolioId)
    .u64(p.accountBPositionEpoch)
    .u16(p.assetIndex)
    .u64(p.marketId)
    .i128(p.sizeQ)
    .u64(p.execPrice)
    .u64(p.feeBps)
    .u16(p.backingFeeCapBps)
    .toBytes();
}

/** Inverse of `encodeTradeNoCpi`; used by the maker to validate a taker-built transaction. */
export function decodeTradeNoCpi(data: Uint8Array): TradeNoCpiParams {
  const expected = 1 + 8 * 4 + 2 + 8 + 16 + 8 + 8 + 2;
  if (data.length !== expected) throw new Error(`TradeNoCpi payload must be ${expected} bytes, got ${data.length}`);
  if (data[0] !== Tag.TradeNoCpi) throw new Error(`not a TradeNoCpi instruction (tag ${data[0]})`);
  let o = 1;
  const u64 = (): bigint => {
    const v = readU64(data, o);
    o += 8;
    return v;
  };
  const accountAPortfolioId = u64();
  const accountAPositionEpoch = u64();
  const accountBPortfolioId = u64();
  const accountBPositionEpoch = u64();
  const assetIndex = readU16(data, o);
  o += 2;
  const marketId = u64();
  const sizeQ = readI128(data, o);
  o += 16;
  const execPrice = u64();
  const feeBps = u64();
  const backingFeeCapBps = readU16(data, o);
  return {
    accountAPortfolioId,
    accountAPositionEpoch,
    accountBPortfolioId,
    accountBPositionEpoch,
    assetIndex,
    marketId,
    sizeQ,
    execPrice,
    feeBps,
    backingFeeCapBps,
  };
}

/** accounts: [signer A, signer B, market w, portfolio A w, portfolio B w] */
export function tradeNoCpi(
  a: {
    signerA: PublicKey;
    signerB: PublicKey;
    market: PublicKey;
    portfolioA: PublicKey;
    portfolioB: PublicKey;
  },
  p: TradeNoCpiParams,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(
    pid(o),
    [r(a.signerA, true), r(a.signerB, true), w(a.market), w(a.portfolioA), w(a.portfolioB)],
    encodeTradeNoCpi(p),
  );
}

export interface PositionBinding {
  portfolioId: bigint;
  positionEpoch: bigint;
}

export function encodeRebalanceReduce(
  p: PositionBinding & { assetIndex: number; reduceQ: bigint },
): Uint8Array {
  return new ByteWriter()
    .u8(Tag.RebalanceReduce)
    .u64(p.portfolioId)
    .u64(p.positionEpoch)
    .u16(p.assetIndex)
    .u128(p.reduceQ)
    .toBytes();
}

/** accounts: [owner s, market w, portfolio w] — owner-signed risk reduction at the effective price. */
export function rebalanceReduce(
  a: { owner: PublicKey; market: PublicKey; portfolio: PublicKey },
  p: PositionBinding & { assetIndex: number; reduceQ: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.owner, true), w(a.market), w(a.portfolio)], encodeRebalanceReduce(p));
}

export function encodeConvertReleasedPnl(p: PositionBinding & { amount: bigint }): Uint8Array {
  return new ByteWriter()
    .u8(Tag.ConvertReleasedPnl)
    .u64(p.portfolioId)
    .u64(p.positionEpoch)
    .u128(p.amount)
    .toBytes();
}

/** accounts: [owner s, market w, portfolio w] — moves realizable positive PnL into capital. */
export function convertReleasedPnl(
  a: { owner: PublicKey; market: PublicKey; portfolio: PublicKey },
  p: PositionBinding & { amount: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.owner, true), w(a.market), w(a.portfolio)], encodeConvertReleasedPnl(p));
}

// ---------------------------------------------------------------------------
// Keeper paths
// ---------------------------------------------------------------------------

export interface CrankObservationHint {
  assetIndex: number;
  /** Number of oracle accounts appended for this asset. AuthMark assets need none. */
  oracleAccounts: number;
}

export function encodePermissionlessCrank(nowSlot: bigint, hints: CrankObservationHint[]): Uint8Array {
  if (hints.length > CRANK_OBSERVATION_DECODE_MAX) {
    throw new RangeError(`at most ${CRANK_OBSERVATION_DECODE_MAX} crank hints`);
  }
  const b = new ByteWriter().u8(Tag.PermissionlessCrank).u64(nowSlot).u8(hints.length);
  for (const h of hints) b.u16(h.assetIndex).u8(h.oracleAccounts);
  return b.toBytes();
}

/**
 * accounts: [caller, market w, target portfolio w, ...oracle accounts, reward portfolio w?]
 * The caller only needs to sign when a reward portfolio is appended and the
 * market pays a liquidation cranker share.
 */
export function permissionlessCrank(
  a: {
    caller: PublicKey;
    market: PublicKey;
    portfolio: PublicKey;
    oracleAccounts?: PublicKey[];
    rewardPortfolio?: PublicKey;
  },
  p: { nowSlot: bigint; hints: CrankObservationHint[] },
  o?: ProgramOpts,
): TransactionInstruction {
  const keys: AccountMeta[] = [
    r(a.caller, a.rewardPortfolio !== undefined),
    w(a.market),
    w(a.portfolio),
    ...(a.oracleAccounts ?? []).map((k) => r(k)),
  ];
  if (a.rewardPortfolio) keys.push(w(a.rewardPortfolio));
  return ix(pid(o), keys, encodePermissionlessCrank(p.nowSlot, p.hints));
}

/** accounts: [market w, portfolio w, cranker portfolio w?] — permissionless, no signer. */
export function syncMaintenanceFee(
  a: { market: PublicKey; portfolio: PublicKey; crankerPortfolio?: PublicKey },
  p: { nowSlot: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  const keys = [w(a.market), w(a.portfolio)];
  if (a.crankerPortfolio) keys.push(w(a.crankerPortfolio));
  return ix(pid(o), keys, new ByteWriter().u8(Tag.SyncMaintenanceFee).u64(p.nowSlot).toBytes());
}

export function encodeForceCloseAbandonedAsset(p: {
  assetIndex: number;
  nowSlot: bigint;
  closeQ: bigint;
}): Uint8Array {
  return new ByteWriter()
    .u8(Tag.ForceCloseAbandonedAsset)
    .u16(p.assetIndex)
    .u64(p.nowSlot)
    .u128(p.closeQ)
    .toBytes();
}

/**
 * accounts: [cranker s, market w, portfolio A w, portfolio B w]
 * Nets a long against a short at the frozen recovery mark once
 * `force_close_delay_slots` has elapsed since shutdown. Permissionless.
 */
export function forceCloseAbandonedAsset(
  a: { cranker: PublicKey; market: PublicKey; portfolioA: PublicKey; portfolioB: PublicKey },
  p: { assetIndex: number; nowSlot: bigint; closeQ: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(
    pid(o),
    [r(a.cranker, true), w(a.market), w(a.portfolioA), w(a.portfolioB)],
    encodeForceCloseAbandonedAsset(p),
  );
}

/**
 * accounts: [market w] — permissionless terminal exit once the market's oracle
 * has been stale for `permissionless_resolve_stale_slots`. No signer.
 */
export function resolveStalePermissionless(
  a: { market: PublicKey },
  p: { nowSlot: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [w(a.market)], new ByteWriter().u8(Tag.ResolveStalePermissionless).u64(p.nowSlot).toBytes());
}

// ---------------------------------------------------------------------------
// Question (asset) lifecycle
// ---------------------------------------------------------------------------

export interface AssetLifecycleParams {
  action: number;
  assetIndex: number;
  /** For ACTIVATE: the market's `next_market_id`. Otherwise the asset's current `market_id`. */
  marketId: bigint;
  /** Asset-0 authority epoch for marketauth; 0 for permissionless activation; the asset's own epoch for asset_admin shutdown. */
  authorityEpoch: bigint;
  nowSlot: bigint;
  /** Initial probability mark (e6) for ACTIVATE; must be 0 for SHUTDOWN. */
  initialPrice: bigint;
  /** Maximum creation fee the activator will pay. */
  maxInitFee: bigint;
  insuranceAuthority: PublicKey;
  insuranceOperator: PublicKey;
  backingBucketAuthority: PublicKey;
  oracleAuthority: PublicKey;
}

export function encodeUpdateAssetLifecycle(p: AssetLifecycleParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.UpdateAssetLifecycle)
    .u8(p.action)
    .u16(p.assetIndex)
    .u64(p.marketId)
    .u64(p.authorityEpoch)
    .u64(p.nowSlot)
    .u64(p.initialPrice)
    .u128(p.maxInitFee)
    .bytes32(p.insuranceAuthority.toBytes())
    .bytes32(p.insuranceOperator.toBytes())
    .bytes32(p.backingBucketAuthority.toBytes())
    .bytes32(p.oracleAuthority.toBytes())
    .toBytes();
}

/**
 * accounts: [authority s, market w, (fee source token w, vault token w, token program)?]
 * The three fee accounts are required only for a permissionless (fee-paying) ACTIVATE.
 */
export function updateAssetLifecycle(
  a: {
    authority: PublicKey;
    market: PublicKey;
    feeSourceToken?: PublicKey;
    vaultToken?: PublicKey;
  },
  p: AssetLifecycleParams,
  o?: ProgramOpts,
): TransactionInstruction {
  const keys = [r(a.authority, true), w(a.market)];
  if (a.feeSourceToken && a.vaultToken) {
    keys.push(w(a.feeSourceToken), w(a.vaultToken), r(SPL_TOKEN_PROGRAM_ID));
  }
  return ix(pid(o), keys, encodeUpdateAssetLifecycle(p));
}

const ZERO_KEY = new PublicKey(new Uint8Array(32));

/** Shutdown moves an Active asset to Recovery at its current effective price. */
export function shutdownAsset(
  a: { authority: PublicKey; market: PublicKey },
  p: { assetIndex: number; marketId: bigint; authorityEpoch: bigint; nowSlot: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return updateAssetLifecycle(
    a,
    {
      action: AssetAction.Shutdown,
      assetIndex: p.assetIndex,
      marketId: p.marketId,
      authorityEpoch: p.authorityEpoch,
      nowSlot: p.nowSlot,
      initialPrice: 0n,
      maxInitFee: 0n,
      insuranceAuthority: ZERO_KEY,
      insuranceOperator: ZERO_KEY,
      backingBucketAuthority: ZERO_KEY,
      oracleAuthority: ZERO_KEY,
    },
    o,
  );
}

/** Retire an empty Recovery slot so it can be reused (marketauth only). */
export function retireAsset(
  a: { authority: PublicKey; market: PublicKey },
  p: { assetIndex: number; marketId: bigint; authorityEpoch: bigint; nowSlot: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return updateAssetLifecycle(
    a,
    {
      action: AssetAction.Retire,
      assetIndex: p.assetIndex,
      marketId: p.marketId,
      authorityEpoch: p.authorityEpoch,
      nowSlot: p.nowSlot,
      initialPrice: 0n,
      maxInitFee: 0n,
      insuranceAuthority: ZERO_KEY,
      insuranceOperator: ZERO_KEY,
      backingBucketAuthority: ZERO_KEY,
      oracleAuthority: ZERO_KEY,
    },
    o,
  );
}

export interface AssetAuthorityParams {
  assetIndex: number;
  marketId: bigint;
  authorityEpoch: bigint;
  kind: number;
  newPubkey: PublicKey;
}

export function encodeUpdateAssetAuthority(p: AssetAuthorityParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.UpdateAssetAuthority)
    .u16(p.assetIndex)
    .u64(p.marketId)
    .u64(p.authorityEpoch)
    .u8(p.kind)
    .bytes32(p.newPubkey.toBytes())
    .toBytes();
}

/**
 * accounts: [current authority s, new authority (signer unless burning admin to zero), market w]
 * Signed by the asset admin or the current holder of that role.
 */
export function updateAssetAuthority(
  a: { current: PublicKey; newAuthority: PublicKey; market: PublicKey },
  p: AssetAuthorityParams,
  o?: ProgramOpts,
): TransactionInstruction {
  const burning = p.newPubkey.equals(ZERO_KEY) && p.kind === AssetAuthorityKind.Admin;
  return ix(
    pid(o),
    [r(a.current, true), r(a.newAuthority, !burning), w(a.market)],
    encodeUpdateAssetAuthority(p),
  );
}

// ---------------------------------------------------------------------------
// Marks (AuthMark mode: the resolver is the oracle)
// ---------------------------------------------------------------------------

export interface MarkParams {
  assetIndex: number;
  marketId: bigint;
  nowSlot: bigint;
  markE6: bigint;
  /** Strictly greater than the asset's current `oracle_observation` sequence. */
  observationSequence: bigint;
  /** Equal to the asset's current `authority_epoch`. */
  authorityEpoch: bigint;
}

export function encodeConfigureAuthMark(p: MarkParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.ConfigureAuthMark)
    .u16(p.assetIndex)
    .u64(p.marketId)
    .u64(p.nowSlot)
    .u64(p.markE6)
    .u64(p.observationSequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

export function encodePushAuthMark(p: MarkParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.PushAuthMark)
    .u16(p.assetIndex)
    .u64(p.marketId)
    .u64(p.nowSlot)
    .u64(p.markE6)
    .u64(p.observationSequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

/** accounts: [oracle authority s, market w] — switches an Active asset to AuthMark mode. */
export function configureAuthMark(
  a: { authority: PublicKey; market: PublicKey },
  p: MarkParams,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.authority, true), w(a.market)], encodeConfigureAuthMark(p));
}

/** accounts: [oracle authority s, market w] — sets the raw oracle target; the engine converges toward it. */
export function pushAuthMark(
  a: { authority: PublicKey; market: PublicKey },
  p: MarkParams,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.authority, true), w(a.market)], encodePushAuthMark(p));
}

// ---------------------------------------------------------------------------
// Market policy (marketauth)
// ---------------------------------------------------------------------------

export interface PolicyParams {
  policySequence: bigint;
  authorityEpoch: bigint;
}

export function encodeUpdateMarketInitFeePolicy(p: PolicyParams & { minInitFee: bigint }): Uint8Array {
  return new ByteWriter()
    .u8(Tag.UpdateMarketInitFeePolicy)
    .u128(p.minInitFee)
    .u64(p.policySequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

/** accounts: [marketauth s, market w] — nonzero fee makes question creation permissionless. */
export function updateMarketInitFeePolicy(
  a: { admin: PublicKey; market: PublicKey },
  p: PolicyParams & { minInitFee: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market)], encodeUpdateMarketInitFeePolicy(p));
}

function encodeCrankerSharePolicy(tag: number, p: PolicyParams & { crankerShareBps: number }): Uint8Array {
  return new ByteWriter()
    .u8(tag)
    .u16(p.crankerShareBps)
    .u64(p.policySequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

/** accounts: [marketauth s, market w] */
export function updateLiquidationFeePolicy(
  a: { admin: PublicKey; market: PublicKey },
  p: PolicyParams & { crankerShareBps: number },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market)], encodeCrankerSharePolicy(Tag.UpdateLiquidationFeePolicy, p));
}

/** accounts: [marketauth s, market w] */
export function updateMaintenanceFeePolicy(
  a: { admin: PublicKey; market: PublicKey },
  p: PolicyParams & { crankerShareBps: number },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market)], encodeCrankerSharePolicy(Tag.UpdateMaintenanceFeePolicy, p));
}

export function encodeUpdateTradeFeePolicy(p: PolicyParams & { tradeFeeBaseBps: bigint }): Uint8Array {
  return new ByteWriter()
    .u8(Tag.UpdateTradeFeePolicy)
    .u64(p.tradeFeeBaseBps)
    .u64(p.policySequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

/** accounts: [marketauth s, market w] */
export function updateTradeFeePolicy(
  a: { admin: PublicKey; market: PublicKey },
  p: PolicyParams & { tradeFeeBaseBps: bigint },
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market)], encodeUpdateTradeFeePolicy(p));
}

export interface PermissionlessResolveParams extends PolicyParams {
  /** Must equal the market's current `next_market_id`. */
  assetGenerationFrontier: bigint;
  staleSlots: bigint;
  forceCloseDelaySlots: bigint;
}

export function encodeConfigurePermissionlessResolve(p: PermissionlessResolveParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.ConfigurePermissionlessResolve)
    .u64(p.assetGenerationFrontier)
    .u64(p.staleSlots)
    .u64(p.forceCloseDelaySlots)
    .u64(p.policySequence)
    .u64(p.authorityEpoch)
    .toBytes();
}

/**
 * accounts: [marketauth s, market w]
 * `forceCloseDelaySlots` is the exit window after a question is shut down and
 * before anyone can force-close it. It must be nonzero for resolution to work.
 */
export function configurePermissionlessResolve(
  a: { admin: PublicKey; market: PublicKey },
  p: PermissionlessResolveParams,
  o?: ProgramOpts,
): TransactionInstruction {
  return ix(pid(o), [r(a.admin, true), w(a.market)], encodeConfigurePermissionlessResolve(p));
}

export interface InsuranceTopUpParams {
  marketId: bigint;
  intentId: bigint;
  authorityEpoch: bigint;
  amount: bigint;
}

export function encodeTopUpInsurance(p: InsuranceTopUpParams): Uint8Array {
  return new ByteWriter()
    .u8(Tag.TopUpInsurance)
    .u64(p.marketId)
    .u64(p.intentId)
    .u64(p.authorityEpoch)
    .u128(p.amount)
    .toBytes();
}

/** accounts: [signer s, market w, source token w, vault token w, token program, ledger w?] */
export function topUpInsurance(
  a: {
    signer: PublicKey;
    market: PublicKey;
    sourceToken: PublicKey;
    vaultToken: PublicKey;
    ledger?: PublicKey;
  },
  p: InsuranceTopUpParams,
  o?: ProgramOpts,
): TransactionInstruction {
  const keys = [r(a.signer, true), w(a.market), w(a.sourceToken), w(a.vaultToken), r(SPL_TOKEN_PROGRAM_ID)];
  if (a.ledger) keys.push(w(a.ledger));
  return ix(pid(o), keys, encodeTopUpInsurance(p));
}

// ---------------------------------------------------------------------------
// Memo (manifest binding)
// ---------------------------------------------------------------------------

/** SPL Memo carrying the question manifest hash, included in the activation transaction. */
export function memo(text: string, signers: PublicKey[] = []): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: signers.map((s) => r(s, true)),
    data: Buffer.from(new TextEncoder().encode(text)),
  });
}
