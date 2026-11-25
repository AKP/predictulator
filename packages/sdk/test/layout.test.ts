import { describe, expect, it } from "vitest";
import {
  ASSET_CONTROL_SEQUENCES,
  ASSET_ORACLE_PROFILE,
  ASSET_ORACLE_PROFILE_LEN,
  ASSET_ORACLE_WRAPPER_LEN,
  ASSET_STATE,
  ENGINE_ASSET_SLOT_LEN,
  HEADER_LEN,
  MARKET_ASSET_SLOT_LEN,
  MARKET_GROUP_LEN,
  MARKET_GROUP_OFF,
  PORTFOLIO_ACCOUNT_LEN,
  PORTFOLIO_ID_OFF,
  PORTFOLIO_LEG,
  PORTFOLIO_MATCHER_CONFIG_OFF,
  PORTFOLIO_MATCHER_CONTROL_OFF,
  PORTFOLIO_MATCHER_SEQUENCE_OFF,
  PORTFOLIO_SOURCE_DOMAIN,
  PORTFOLIO_STATE,
  PORTFOLIO_STATE_LEN,
  PROVENANCE_HEADER,
  V16_CONFIG,
  WRAPPER_CONFIG,
  WRAPPER_CONFIG_LEN,
  fieldOffset,
  marketAccountLenForCapacity,
  marketSlotCapacityFromLen,
  structSize,
} from "@predictulator/sdk";

describe("engine layouts match the Rust compile-time assertions", () => {
  it("PortfolioAccountV16Account is 9419 bytes (asserted in v16.rs)", () => {
    expect(PORTFOLIO_STATE_LEN).toBe(9419);
  });

  it("component sizes", () => {
    expect(structSize(PROVENANCE_HEADER)).toBe(100);
    expect(structSize(PORTFOLIO_LEG)).toBe(152);
    expect(structSize(PORTFOLIO_SOURCE_DOMAIN)).toBe(196);
    expect(structSize(V16_CONFIG)).toBe(249);
    expect(structSize(ASSET_STATE)).toBe(515);
  });

  it("portfolio field offsets", () => {
    expect(fieldOffset(PORTFOLIO_STATE, "owner")).toBe(100);
    expect(fieldOffset(PORTFOLIO_STATE, "capital")).toBe(132);
    expect(fieldOffset(PORTFOLIO_STATE, "pnl")).toBe(148);
    expect(fieldOffset(PORTFOLIO_STATE, "legs")).toBe(340);
    expect(fieldOffset(PORTFOLIO_STATE, "source_domains")).toBe(340 + 16 * 152);
    expect(fieldOffset(PORTFOLIO_STATE, "health_cert")).toBe(340 + 16 * 152 + 32 * 196);
  });
});

describe("wrapper layouts match the program constants", () => {
  it("WrapperConfigV16 is 448 bytes", () => {
    expect(structSize(WRAPPER_CONFIG)).toBe(WRAPPER_CONFIG_LEN);
    expect(WRAPPER_CONFIG_LEN).toBe(448);
  });

  it("AssetOracleProfileV16 is 424 bytes and control sequences fill the 512-byte lane", () => {
    expect(structSize(ASSET_ORACLE_PROFILE)).toBe(ASSET_ORACLE_PROFILE_LEN);
    expect(ASSET_ORACLE_PROFILE_LEN).toBe(424);
    expect(structSize(ASSET_CONTROL_SEQUENCES)).toBe(ASSET_ORACLE_WRAPPER_LEN - ASSET_ORACLE_PROFILE_LEN);
  });

  it("portfolio tail offsets", () => {
    expect(PORTFOLIO_MATCHER_CONFIG_OFF).toBe(HEADER_LEN + 9419);
    expect(PORTFOLIO_MATCHER_CONTROL_OFF).toBe(HEADER_LEN + 9419 + 96);
    expect(PORTFOLIO_ID_OFF).toBe(HEADER_LEN + 9419 + 104);
    expect(PORTFOLIO_MATCHER_SEQUENCE_OFF).toBe(PORTFOLIO_ID_OFF + 8);
    expect(PORTFOLIO_ACCOUNT_LEN).toBe(PORTFOLIO_ID_OFF + 24);
  });

  it("market account geometry is header + wrapper config + engine header + N slots", () => {
    expect(MARKET_GROUP_OFF).toBe(464);
    expect(MARKET_ASSET_SLOT_LEN).toBe(ASSET_ORACLE_WRAPPER_LEN + ENGINE_ASSET_SLOT_LEN);
    const one = marketAccountLenForCapacity(1);
    expect(one).toBe(MARKET_GROUP_OFF + MARKET_GROUP_LEN + MARKET_ASSET_SLOT_LEN);
    expect(marketSlotCapacityFromLen(one)).toBe(1);
    expect(marketSlotCapacityFromLen(marketAccountLenForCapacity(7))).toBe(7);
    expect(() => marketSlotCapacityFromLen(one + 1)).toThrow(/layout mismatch/);
  });

  it("pins the derived sizes that scripts/verify-layouts.mjs checks against the Rust source", () => {
    // Not asserted upstream; these are what the structs at the pinned engine
    // commit add up to. `npm run verify:layouts` re-derives them from the Rust.
    expect(MARKET_GROUP_LEN).toBe(726);
    expect(ENGINE_ASSET_SLOT_LEN).toBe(1301);
    expect(MARKET_ASSET_SLOT_LEN).toBe(512 + 1301);
  });
});
