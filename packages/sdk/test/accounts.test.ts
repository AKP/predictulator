import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  AccountKind,
  AssetLifecycle,
  HEADER_LEN,
  MAGIC,
  MARKET_ASSET_SLOT,
  MARKET_GROUP_HEADER,
  MARKET_GROUP_OFF,
  OracleMode,
  PORTFOLIO_ACCOUNT_LEN,
  PORTFOLIO_ID_OFF,
  PORTFOLIO_LEG,
  PORTFOLIO_MATCHER_CONTROL_OFF,
  PORTFOLIO_MATCHER_SEQUENCE_OFF,
  PORTFOLIO_STATE,
  Predictulator,
  V16_CONFIG,
  WRAPPER_CONFIG,
  WRAPPER_VERSION,
  decodeMarketGroup,
  decodePortfolio,
  fieldOffset,
  marketAccountLenForCapacity,
  marketAssetSlotOffset,
  structSize,
  writeUnsigned,
  ASSET_ORACLE_PROFILE,
  ASSET_CONTROL_SEQUENCES,
  ENGINE_ASSET_SLOT,
  ASSET_STATE,
  SOURCE_CREDIT_STATE,
} from "@predictulator/sdk";

function header(buf: Uint8Array, kind: number): void {
  buf.set(writeUnsigned(MAGIC, 8), 0);
  buf.set(writeUnsigned(BigInt(WRAPPER_VERSION), 2), 8);
  buf[10] = kind;
}
function put(buf: Uint8Array, off: number, v: bigint, n: number): void {
  buf.set(writeUnsigned(BigInt.asUintN(n * 8, v), n), off);
}

describe("portfolio decode", () => {
  it("reads owner, capital, pnl, one active leg, and the wrapper tail", () => {
    const owner = Keypair.generate().publicKey;
    const market = Keypair.generate().publicKey;
    const self = Keypair.generate().publicKey;
    const buf = new Uint8Array(PORTFOLIO_ACCOUNT_LEN);
    header(buf, AccountKind.Portfolio);
    const S = HEADER_LEN;
    buf.set(market.toBytes(), S + 0);
    buf.set(self.toBytes(), S + 32);
    buf.set(owner.toBytes(), S + 64);
    put(buf, S + 96, 1n, 2); // version
    put(buf, S + 98, 18n, 2); // layout discriminator
    buf.set(owner.toBytes(), S + fieldOffset(PORTFOLIO_STATE, "owner"));
    put(buf, S + fieldOffset(PORTFOLIO_STATE, "capital"), 25_000_000n, 16);
    put(buf, S + fieldOffset(PORTFOLIO_STATE, "pnl"), -1_250n, 16);
    // leg slot 2: active short on asset 3 gen 9, basis -4 shares
    const legBase = S + fieldOffset(PORTFOLIO_STATE, "legs") + 2 * structSize(PORTFOLIO_LEG);
    buf[legBase + fieldOffset(PORTFOLIO_LEG, "active")] = 1;
    put(buf, legBase + fieldOffset(PORTFOLIO_LEG, "asset_index"), 3n, 4);
    put(buf, legBase + fieldOffset(PORTFOLIO_LEG, "market_id"), 9n, 8);
    buf[legBase + fieldOffset(PORTFOLIO_LEG, "side")] = 1;
    put(buf, legBase + fieldOffset(PORTFOLIO_LEG, "basis_pos_q"), -4_000_000n, 16);
    // tail
    put(buf, PORTFOLIO_ID_OFF, 42n, 8);
    put(buf, PORTFOLIO_MATCHER_SEQUENCE_OFF, 5n, 8);
    // control: enabled=1, position_epoch=17 (<<1), fee cap 25 bps (<<50)
    put(buf, PORTFOLIO_MATCHER_CONTROL_OFF, 1n | (17n << 1n) | (25n << 50n), 8);

    const p = decodePortfolio(buf, self);
    expect(p.owner.equals(owner)).toBe(true);
    expect(p.marketGroupId.equals(market)).toBe(true);
    expect(p.layoutDiscriminator).toBe(18);
    expect(p.capital).toBe(25_000_000n);
    expect(p.pnl).toBe(-1_250n);
    const active = p.legs.filter((l) => l.active);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ slot: 2, assetIndex: 3, marketId: 9n, side: 1, basisPosQ: -4_000_000n });
    expect(p.portfolioId).toBe(42n);
    expect(p.matcherSequence).toBe(5n);
    expect(p.positionEpoch).toBe(17n);
    expect(p.matcherEnabled).toBe(true);
    expect(p.matcherTradeFeeCapBps).toBe(25);
  });

  it("rejects the wrong account kind", () => {
    const buf = new Uint8Array(PORTFOLIO_ACCOUNT_LEN);
    header(buf, AccountKind.Market);
    expect(() => decodePortfolio(buf)).toThrow(/kind/);
  });
});

describe("market decode", () => {
  it("reads config, totals, and per-asset state for a two-slot market", () => {
    const buf = new Uint8Array(marketAccountLenForCapacity(2));
    header(buf, AccountKind.Market);
    const auth = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const resolver = Keypair.generate().publicKey;
    const W = HEADER_LEN;
    buf.set(auth.toBytes(), W + fieldOffset(WRAPPER_CONFIG, "marketauth"));
    buf.set(mint.toBytes(), W + fieldOffset(WRAPPER_CONFIG, "collateral_mint"));
    put(buf, W + fieldOffset(WRAPPER_CONFIG, "permissionless_market_init_fee"), 5_000_000n, 16);
    put(buf, W + fieldOffset(WRAPPER_CONFIG, "force_close_delay_slots"), 1_500n, 8);
    put(buf, W + fieldOffset(WRAPPER_CONFIG, "next_portfolio_id"), 12n, 8);
    const H = MARKET_GROUP_OFF;
    const C = H + fieldOffset(MARKET_GROUP_HEADER, "config");
    put(buf, C + fieldOffset(V16_CONFIG, "max_portfolio_assets"), 14n, 2);
    put(buf, C + fieldOffset(V16_CONFIG, "max_market_slots"), 2n, 4);
    put(buf, C + fieldOffset(V16_CONFIG, "initial_margin_bps"), 10_000n, 8);
    put(buf, H + fieldOffset(MARKET_GROUP_HEADER, "asset_slot_capacity"), 2n, 4);
    put(buf, H + fieldOffset(MARKET_GROUP_HEADER, "vault"), 900n, 16);
    put(buf, H + fieldOffset(MARKET_GROUP_HEADER, "insurance"), 100n, 16);
    put(buf, H + fieldOffset(MARKET_GROUP_HEADER, "next_market_id"), 3n, 8);

    // asset 1: Active, AuthMark, mark 0.62 converged, resolver is oracle authority
    const A1 = marketAssetSlotOffset(1);
    const prof = A1 + fieldOffset(MARKET_ASSET_SLOT, "oracle_profile");
    buf[prof + fieldOffset(ASSET_ORACLE_PROFILE, "oracle_mode")] = OracleMode.AuthMark;
    buf.set(resolver.toBytes(), prof + fieldOffset(ASSET_ORACLE_PROFILE, "oracle_authority"));
    const ctl = A1 + fieldOffset(MARKET_ASSET_SLOT, "control_sequences");
    put(buf, ctl + fieldOffset(ASSET_CONTROL_SEQUENCES, "oracle_observation"), 8n, 8);
    const eng = A1 + fieldOffset(MARKET_ASSET_SLOT, "engine");
    const ast = eng + fieldOffset(ENGINE_ASSET_SLOT, "asset");
    put(buf, ast + fieldOffset(ASSET_STATE, "market_id"), 2n, 8);
    buf[ast + fieldOffset(ASSET_STATE, "lifecycle")] = AssetLifecycle.Active;
    put(buf, ast + fieldOffset(ASSET_STATE, "raw_oracle_target_price"), 620_000n, 8);
    put(buf, ast + fieldOffset(ASSET_STATE, "effective_price"), 620_000n, 8);
    put(buf, ast + fieldOffset(ASSET_STATE, "oi_eff_long_q"), 5_000_000n, 16);
    put(buf, ast + fieldOffset(ASSET_STATE, "oi_eff_short_q"), 5_000_000n, 16);
    const scShort = eng + fieldOffset(ENGINE_ASSET_SLOT, "source_credit_short");
    put(buf, scShort + fieldOffset(SOURCE_CREDIT_STATE, "credit_rate_num"), 1_000_000_000_000n, 16);
    const scLong = eng + fieldOffset(ENGINE_ASSET_SLOT, "source_credit_long");
    put(buf, scLong + fieldOffset(SOURCE_CREDIT_STATE, "credit_rate_num"), 250_000_000_000n, 16);

    const m = decodeMarketGroup(buf);
    expect(m.wrapper.marketauth.equals(auth)).toBe(true);
    expect(m.wrapper.collateralMint.equals(mint)).toBe(true);
    expect(m.wrapper.permissionlessMarketInitFee).toBe(5_000_000n);
    expect(m.wrapper.forceCloseDelaySlots).toBe(1_500n);
    expect(m.config.maxMarketSlots).toBe(2);
    expect(m.config.initialMarginBps).toBe(10_000n);
    expect(m.vault).toBe(900n);
    expect(m.insurance).toBe(100n);
    expect(m.nextMarketId).toBe(3n);
    expect(m.assets).toHaveLength(2);
    const a1 = m.assets[1]!;
    expect(a1.marketId).toBe(2n);
    expect(a1.lifecycleName).toBe("Active");
    expect(a1.oracle.oracleMode).toBe(OracleMode.AuthMark);
    expect(a1.oracle.oracleAuthority.equals(resolver)).toBe(true);
    expect(a1.control.oracleObservation).toBe(8n);

    const qs = Predictulator.questions(m);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({
      phase: "open",
      converged: true,
      probabilityE6: 620_000n,
      yesRealizable: 1,
      noRealizable: 0.25,
      openInterestYesShares: 5,
      openInterestNoShares: 5,
    });
  });

  it("refuses an account whose length is not header + N slots", () => {
    const buf = new Uint8Array(marketAccountLenForCapacity(1) + 3);
    header(buf, AccountKind.Market);
    expect(() => decodeMarketGroup(buf)).toThrow(/layout mismatch/);
  });
});
