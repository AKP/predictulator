import { PublicKey } from "@solana/web3.js";

/**
 * Provenance of every number in this file.
 *
 * The wrapper program is `percolator-prog` (Anatoly Yakovenko), as vendored by
 * fivebar-perps at upstream commit 5cb331dde354517c6371a8acf92cecb194f3bb73.
 * The engine crate is pinned by that program to commit
 * 4db11a8cb0053815e23a35d3a7d3edc265d8d866. Layouts below were transcribed
 * from the `#[repr(C)]` Pod structs in `src/v16_program.rs` and the engine's
 * `src/v16.rs`. If you deploy a different build, re-check `layout.test.ts`
 * against that build's `dump_layout` example before trusting a decode.
 */
export const UPSTREAM = {
  program: "https://github.com/aeyakovenko/percolator-prog",
  programCommit: "5cb331dde354517c6371a8acf92cecb194f3bb73",
  engine: "https://github.com/aeyakovenko/percolator",
  engineCommit: "4db11a8cb0053815e23a35d3a7d3edc265d8d866",
} as const;

/** `declare_id!` in the upstream program. Override per deployment. */
export const DEFAULT_PROGRAM_ID = new PublicKey(
  "Perco1ator111111111111111111111111111111111",
);

export const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

// Engine scale constants (percolator/src/lib.rs).
export const POS_SCALE = 1_000_000n;
export const BOUND_SCALE = 1_000_000_000_000n;
export const CREDIT_RATE_SCALE = 1_000_000_000_000n;
export const ADL_ONE = 1_000_000_000_000_000n;
export const MAX_ORACLE_PRICE = 1_000_000_000_000n;
export const MAX_POSITION_ABS_Q = 100_000_000_000_000n;
export const MAX_BPS = 10_000;

// Engine layout constants (percolator/src/v16.rs).
export const V16_MAX_PORTFOLIO_ASSETS_N = 16;
export const PORTFOLIO_SOURCE_DOMAIN_CAP = 2 * V16_MAX_PORTFOLIO_ASSETS_N;
export const V16_ACTIVE_BITMAP_WORDS = 1;
export const V16_LAYOUT_DISCRIMINATOR = 18;
export const V16_ACCOUNT_VERSION = 1;

// Wrapper constants (v16_program.rs `constants`).
export const MAGIC = 0x5045_5243_5631_3600n; // "PERCV16\0"
export const WRAPPER_VERSION = 16;
export const HEADER_LEN = 16;
export const WRAPPER_CONFIG_LEN = 448;
export const ASSET_ORACLE_PROFILE_LEN = 424;
export const ASSET_ORACLE_WRAPPER_LEN = 512;
export const ASSET_CONTROL_SEQUENCES_OFF = ASSET_ORACLE_PROFILE_LEN;
export const MARKET_GROUP_OFF = HEADER_LEN + WRAPPER_CONFIG_LEN;
export const PORTFOLIO_MATCHER_CONFIG_LEN = 104;
export const ORACLE_LEG_CAP = 3;
export const WRAPPER_MAX_PORTFOLIO_ASSETS = 14;
export const MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS = 6_480_000n;
export const MAX_FORCE_CLOSE_DELAY_SLOTS = 10_000_000n;
export const CRANK_OBSERVATION_DECODE_MAX = 16;
export const BATCH_TRADE_DECODE_MAX_LEGS = 16;

export const AccountKind = {
  Market: 1,
  Portfolio: 2,
  BackingDomainLedger: 3,
  InsuranceLedger: 4,
  ClosedMarket: 5,
} as const;

export const OracleMode = {
  Manual: 0,
  HybridAfterHours: 1,
  EwmaMark: 2,
  AuthMark: 3,
} as const;
export type OracleMode = (typeof OracleMode)[keyof typeof OracleMode];

export const AssetLifecycle = {
  Disabled: 0,
  PendingActivation: 1,
  Active: 2,
  DrainOnly: 3,
  Retired: 4,
  Recovery: 5,
} as const;
export type AssetLifecycle = (typeof AssetLifecycle)[keyof typeof AssetLifecycle];

export const AssetLifecycleName: Record<number, string> = {
  0: "Disabled",
  1: "PendingActivation",
  2: "Active",
  3: "DrainOnly",
  4: "Retired",
  5: "Recovery",
};

export const MarketMode = {
  Live: 0,
  Resolved: 1,
  Recovery: 2,
} as const;
export type MarketMode = (typeof MarketMode)[keyof typeof MarketMode];

export const Side = { Long: 0, Short: 1 } as const;
export type Side = (typeof Side)[keyof typeof Side];

export const SideMode = { Normal: 0, DrainOnly: 1, ResetPending: 2 } as const;

export const BackingBucketStatus = {
  Empty: 0,
  Fresh: 1,
  Expired: 2,
  Impaired: 3,
} as const;

export const AssetAction = {
  Activate: 0,
  DrainOnly: 1,
  Retire: 2,
  Shutdown: 3,
} as const;
export type AssetAction = (typeof AssetAction)[keyof typeof AssetAction];

export const AssetAuthorityKind = {
  Admin: 0,
  Insurance: 1,
  InsuranceOperator: 2,
  BackingBucket: 3,
  Oracle: 4,
} as const;
export type AssetAuthorityKind =
  (typeof AssetAuthorityKind)[keyof typeof AssetAuthorityKind];

/** Instruction tags accepted by `Instruction::decode`. */
export const Tag = {
  InitMarket: 0,
  InitPortfolio: 1,
  Deposit: 3,
  Withdraw: 4,
  PermissionlessCrank: 5,
  TradeNoCpi: 6,
  ClosePortfolio: 8,
  TopUpInsurance: 9,
  TradeCpi: 10,
  CloseSlab: 13,
  ResolveMarket: 19,
  TopUpBackingBucket: 24,
  ConvertReleasedPnl: 28,
  CloseResolved: 30,
  UpdateAuthority: 32,
  ConfigureHybridOracle: 34,
  ConfigureEwmaMark: 35,
  PushEwmaMark: 36,
  UpdateLiquidationFeePolicy: 37,
  ConfigurePermissionlessResolve: 38,
  ResolveStalePermissionless: 39,
  UpdateAssetLifecycle: 40,
  WithdrawInsurance: 41,
  CureAndCancelClose: 42,
  ForfeitRecoveryLeg: 43,
  RebalanceReduce: 44,
  FinalizeResetSide: 45,
  ClaimResolvedPayoutTopup: 46,
  SyncMaintenanceFee: 48,
  UpdateMaintenanceFeePolicy: 49,
  WithdrawBackingBucket: 50,
  UpdateBackingFeePolicy: 51,
  WithdrawBackingBucketEarnings: 52,
  SyncBackingDomainLedger: 53,
  SyncInsuranceLedger: 54,
  UpdateTradeFeePolicy: 55,
  TopUpInsuranceDomain: 56,
  WithdrawInsuranceAsset: 57,
  UpdateFeeRedirectPolicy: 58,
  UpdateMarketInitFeePolicy: 59,
  UpdateBaseUnitMints: 60,
  SwapSecondaryForPrimary: 61,
  ConfigureAuthMark: 62,
  PushAuthMark: 63,
  ForceCloseAbandonedAsset: 64,
  UpdateAssetAuthority: 65,
  BatchTradeNoCpi: 66,
  BatchTradeCpi: 67,
  SetMatcherConfig: 68,
  RestartAssetOracle: 69,
} as const;

/** `PercolatorError` discriminants, in declaration order (ProgramError::Custom(n)). */
export const PercolatorErrorName = [
  "InvalidMagic",
  "InvalidVersion",
  "AlreadyInitialized",
  "NotInitialized",
  "InvalidAccountKind",
  "InvalidAccountLen",
  "ExpectedSigner",
  "ExpectedWritable",
  "Unauthorized",
  "InvalidInstruction",
  "InvalidMint",
  "InvalidTokenAccount",
  "InvalidVaultAccount",
  "InvalidTokenProgram",
  "EngineInvalidConfig",
  "EngineArithmeticOverflow",
  "EngineProvenanceMismatch",
  "EngineHiddenLeg",
  "EngineInvalidLeg",
  "EngineStale",
  "EngineBStale",
  "EngineLockActive",
  "EngineNonProgress",
  "EngineRecoveryRequired",
  "EngineCounterOverflow",
  "EngineCounterUnderflow",
  "OracleInvalid",
  "OracleStale",
  "OracleConfTooWide",
  "InvalidOracleKey",
  "AssetGenerationMismatch",
  "RentExemptRequired",
] as const;

export function percolatorErrorName(code: number): string {
  return PercolatorErrorName[code] ?? `Custom(${code})`;
}
