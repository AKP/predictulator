import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { AssetLifecycle, OracleMode, type MarketAsset, type QuestionManifest, type QuestionState } from "@predictulator/sdk";
import { convergenceSlots, nextAction, type LifecycleInput } from "../src/lifecycle.js";

const key = (): string => Keypair.generate().publicKey.toBase58();

function asset(over: Partial<MarketAsset> & { oracleMode?: number } = {}): MarketAsset {
  const pk = Keypair.generate().publicKey;
  const sc = { positiveClaimBoundNum: 0n, exactPositiveClaimNum: 0n, freshReservedBackingNum: 0n, validLienedBackingNum: 0n, impairedLienedBackingNum: 0n, insuranceCreditReservedNum: 0n, creditRateNum: 1_000_000_000_000n, creditEpoch: 0n };
  return {
    index: 1,
    marketId: 2n,
    lifecycle: AssetLifecycle.Active,
    lifecycleName: "Active",
    rawOracleTargetPrice: 500_000n,
    effectivePrice: 500_000n,
    slotLast: 0n,
    oiEffLongQ: 0n,
    oiEffShortQ: 0n,
    storedPosCountLong: 0n,
    storedPosCountShort: 0n,
    staleAccountCountLong: 0n,
    staleAccountCountShort: 0n,
    modeLong: 0,
    modeShort: 0,
    insuranceDomainBudgetLong: 0n,
    insuranceDomainBudgetShort: 0n,
    sourceCreditLong: sc,
    sourceCreditShort: sc,
    oracle: {
      oracleMode: over.oracleMode ?? OracleMode.AuthMark,
      insuranceAuthority: pk, insuranceOperator: pk, backingBucketAuthority: pk, oracleAuthority: pk, assetAdmin: pk,
      markEwmaE6: 500_000n, markEwmaLastSlot: 0n, oracleTargetPriceE6: 500_000n, lastGoodOracleSlot: 0n, effectivePriceProvenance: 0, raw: {},
    },
    control: { oracleObservation: 0n, authorityEpoch: 0n, backingFee: 0n, tradeFee: 0n, liquidationFee: 0n, maintenanceFee: 0n, feeRedirect: 0n, marketInitFee: 0n, permissionlessResolve: 0n, insuranceTopUp: 0n, backingTopUp: 0n },
    raw: {},
    ...over,
  };
}

function state(a: MarketAsset, phase: QuestionState["phase"] = "open"): QuestionState {
  return {
    asset: a,
    probabilityE6: a.effectivePrice,
    targetE6: a.rawOracleTargetPrice,
    converged: a.effectivePrice === a.rawOracleTargetPrice,
    phase,
    outcome: null,
    yesRealizable: 1,
    noRealizable: 1,
    openInterestYesShares: Number(a.oiEffLongQ) / 1e6,
    openInterestNoShares: Number(a.oiEffShortQ) / 1e6,
  };
}

const manifest: QuestionManifest = {
  version: 1, market: key(), assetIndex: 1, marketId: "2",
  title: "Will it rain in Lisbon on 2026-12-01?", description: "",
  resolutionCriteria: "YES if IPMA records any precipitation at Lisboa/Geofísico on that date.",
  closesAt: "2026-12-01T00:00:00.000Z", resolvesBy: "2026-12-02T00:00:00.000Z",
  resolver: key(), creator: key(), tags: [], createdAt: "2026-11-10T00:00:00.000Z",
};

const before = Date.parse("2026-11-20T00:00:00.000Z");
const after = Date.parse("2026-12-01T12:00:00.000Z");

function input(over: Partial<LifecycleInput>): LifecycleInput {
  return {
    state: state(asset()),
    manifest,
    decision: null,
    fairProbabilityE6: null,
    nowMs: before,
    nowSlot: 100n,
    minMarkDeltaE6: 5_000n,
    canRetire: false,
    ...over,
  };
}

describe("question lifecycle", () => {
  it("configures AuthMark first when the slot is still in Manual mode", () => {
    const a = asset({ oracleMode: OracleMode.Manual });
    expect(nextAction(input({ state: state(a) }))).toEqual({ kind: "configure_authmark", initialMarkE6: 500_000n });
  });

  it("pushes a fair mark only when it moved more than the tolerance", () => {
    expect(nextAction(input({ fairProbabilityE6: 503_000n }))).toMatchObject({ kind: "none" });
    expect(nextAction(input({ fairProbabilityE6: 560_000n }))).toEqual({ kind: "push_mark", markE6: 560_000n, reason: "fair" });
  });

  it("stops steering once the question is closed and waits for a decision", () => {
    expect(nextAction(input({ nowMs: after, fairProbabilityE6: 900_000n }))).toMatchObject({ kind: "none", why: /decision/ });
  });

  it("pushes the final mark, waits for convergence, then shuts down", () => {
    const decision = { outcome: "YES" as const, decidedAt: "2026-12-01T10:00:00.000Z" };
    expect(nextAction(input({ nowMs: after, decision }))).toEqual({ kind: "push_mark", markE6: 1_000_000n, reason: "final" });
    const pushed = asset({ rawOracleTargetPrice: 1_000_000n, effectivePrice: 700_000n });
    expect(nextAction(input({ nowMs: after, decision, state: state(pushed) }))).toEqual({
      kind: "await_convergence", targetE6: 1_000_000n, effectiveE6: 700_000n,
    });
    const converged = asset({ rawOracleTargetPrice: 1_000_000n, effectivePrice: 1_000_000n });
    expect(nextAction(input({ nowMs: after, decision, state: state(converged) }))).toEqual({ kind: "shutdown" });
  });

  it("NO resolves to the one-atom floor, never zero", () => {
    const decision = { outcome: "NO" as const, decidedAt: "2026-12-01T10:00:00.000Z" };
    expect(nextAction(input({ nowMs: after, decision }))).toEqual({ kind: "push_mark", markE6: 1n, reason: "final" });
  });

  it("after shutdown it waits for the keeper to net positions, then retires if it can", () => {
    const rec = asset({ lifecycle: AssetLifecycle.Recovery, lifecycleName: "Recovery", oiEffLongQ: 3_000_000n, oiEffShortQ: 3_000_000n });
    expect(nextAction(input({ state: state(rec, "resolving") }))).toEqual({ kind: "await_force_close", remainingYes: 3, remainingNo: 3 });
    const empty = asset({ lifecycle: AssetLifecycle.Recovery, lifecycleName: "Recovery" });
    expect(nextAction(input({ state: state(empty, "resolved") }))).toEqual({ kind: "done" });
    expect(nextAction(input({ state: state(empty, "resolved"), canRetire: true }))).toEqual({ kind: "retire" });
  });

  it("estimates convergence slots under the per-slot cap", () => {
    expect(convergenceSlots(500_000n, 500_000n, 500n)).toBe(0);
    const n = convergenceSlots(500_000n, 1_000_000n, 500n);
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(20);
    expect(convergenceSlots(1n, 2n, 0n)).toBe(Number.POSITIVE_INFINITY);
  });
});
