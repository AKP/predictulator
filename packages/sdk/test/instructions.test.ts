import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  AssetAction,
  AssetAuthorityKind,
  SPL_TOKEN_PROGRAM_ID,
  Tag,
  instructions as ix,
  toHex,
} from "@predictulator/sdk";

const le = (v: bigint, n: number): string => {
  let s = "";
  let x = BigInt.asUintN(n * 8, v);
  for (let i = 0; i < n; i++) {
    s += Number(x & 0xffn).toString(16).padStart(2, "0");
    x >>= 8n;
  }
  return s;
};
const hex8 = (v: number): string => v.toString(16).padStart(2, "0");

describe("instruction payloads match Instruction::decode", () => {
  it("Deposit = tag 3, portfolio_id u64, expected_sequence u64, amount u128", () => {
    const b = ix.encodeDeposit({ portfolioId: 7n, expectedSequence: 2n, amount: 1_000_000n });
    expect(toHex(b)).toBe(hex8(Tag.Deposit) + le(7n, 8) + le(2n, 8) + le(1_000_000n, 16));
    expect(b.length).toBe(1 + 8 + 8 + 16);
  });

  it("TradeNoCpi field order and signed i128 size", () => {
    const b = ix.encodeTradeNoCpi({
      accountAPortfolioId: 1n,
      accountAPositionEpoch: 5n,
      accountBPortfolioId: 2n,
      accountBPositionEpoch: 9n,
      assetIndex: 3,
      marketId: 11n,
      sizeQ: -2_000_000n,
      execPrice: 620_000n,
      feeBps: 10n,
      backingFeeCapBps: 0,
    });
    expect(toHex(b)).toBe(
      hex8(Tag.TradeNoCpi) +
        le(1n, 8) +
        le(5n, 8) +
        le(2n, 8) +
        le(9n, 8) +
        le(3n, 2) +
        le(11n, 8) +
        le(-2_000_000n, 16) +
        le(620_000n, 8) +
        le(10n, 8) +
        le(0n, 2),
    );
    expect(b.length).toBe(1 + 8 * 4 + 2 + 8 + 16 + 8 + 8 + 2);
  });

  it("PermissionlessCrank = tag 5, now_slot u64, n u8, (asset_index u16, oracle_accounts u8)*", () => {
    const b = ix.encodePermissionlessCrank(123n, [
      { assetIndex: 1, oracleAccounts: 0 },
      { assetIndex: 2, oracleAccounts: 0 },
    ]);
    expect(toHex(b)).toBe(hex8(Tag.PermissionlessCrank) + le(123n, 8) + "02" + "0100" + "00" + "0200" + "00");
    expect(() => ix.encodePermissionlessCrank(1n, new Array(17).fill({ assetIndex: 0, oracleAccounts: 0 }))).toThrow();
  });

  it("PushAuthMark / ConfigureAuthMark share the same body shape", () => {
    const p = {
      assetIndex: 4,
      marketId: 9n,
      nowSlot: 1000n,
      markE6: 730_000n,
      observationSequence: 3n,
      authorityEpoch: 0n,
    };
    const body = le(4n, 2) + le(9n, 8) + le(1000n, 8) + le(730_000n, 8) + le(3n, 8) + le(0n, 8);
    expect(toHex(ix.encodePushAuthMark(p))).toBe(hex8(Tag.PushAuthMark) + body);
    expect(toHex(ix.encodeConfigureAuthMark(p))).toBe(hex8(Tag.ConfigureAuthMark) + body);
  });

  it("UpdateAssetLifecycle carries four 32-byte authorities after the scalars", () => {
    const k = Keypair.generate().publicKey;
    const b = ix.encodeUpdateAssetLifecycle({
      action: AssetAction.Activate,
      assetIndex: 2,
      marketId: 3n,
      authorityEpoch: 0n,
      nowSlot: 77n,
      initialPrice: 500_000n,
      maxInitFee: 5_000_000n,
      insuranceAuthority: k,
      insuranceOperator: k,
      backingBucketAuthority: k,
      oracleAuthority: k,
    });
    expect(b.length).toBe(1 + 1 + 2 + 8 + 8 + 8 + 8 + 16 + 32 * 4);
    expect(toHex(b.subarray(0, 4))).toBe(hex8(Tag.UpdateAssetLifecycle) + hex8(AssetAction.Activate) + le(2n, 2));
    expect(toHex(b.subarray(b.length - 32))).toBe(toHex(k.toBytes()));
  });

  it("ForceCloseAbandonedAsset = tag 64, asset_index u16, now_slot u64, close_q u128", () => {
    const b = ix.encodeForceCloseAbandonedAsset({ assetIndex: 1, nowSlot: 5n, closeQ: 3_000_000n });
    expect(toHex(b)).toBe(hex8(Tag.ForceCloseAbandonedAsset) + le(1n, 2) + le(5n, 8) + le(3_000_000n, 16));
  });

  it("InitMarket is 1 + 2 + 8*3 + 16*2 + 8*5 + 16*2 + 8*7 + 16*2 = 219 bytes", () => {
    const z = 0n;
    const b = ix.encodeInitMarket({
      maxPortfolioAssets: 14,
      hMin: z, hMax: z, initialPrice: 500_000n,
      minNonzeroMmReq: z, minNonzeroImReq: z,
      maintenanceMarginBps: z, initialMarginBps: z, maxTradingFeeBps: z, tradeFeeBaseBps: z,
      liquidationFeeBps: z, liquidationFeeCap: z, minLiquidationAbs: z,
      maxPriceMoveBpsPerSlot: z, maxAccrualDtSlots: z, maxAbsFundingE9PerSlot: z, minFundingLifetimeSlots: z,
      maxAccountBSettlementChunks: z, maxBankruptCloseChunks: z, maxBankruptCloseLifetimeSlots: z,
      publicBChunkAtoms: z, maintenanceFeePerSlot: z,
    });
    expect(b.length).toBe(1 + 2 + 8 * 3 + 16 * 2 + 8 * 5 + 16 * 2 + 8 * 7 + 16 * 2);
    expect(b.length).toBe(219);
    expect(b[0]).toBe(Tag.InitMarket);
  });
});

describe("account metas follow the handlers", () => {
  const market = Keypair.generate().publicKey;
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;
  const pa = Keypair.generate().publicKey;
  const pb = Keypair.generate().publicKey;

  it("TradeNoCpi: both owners sign, market and both portfolios writable", () => {
    const i = ix.tradeNoCpi(
      { signerA: a, signerB: b, market, portfolioA: pa, portfolioB: pb },
      {
        accountAPortfolioId: 1n, accountAPositionEpoch: 0n, accountBPortfolioId: 2n, accountBPositionEpoch: 0n,
        assetIndex: 1, marketId: 2n, sizeQ: 1n, execPrice: 1n, feeBps: 0n, backingFeeCapBps: 0,
      },
    );
    expect(i.keys.map((k) => [k.pubkey.equals(a) || k.pubkey.equals(b), k.isSigner, k.isWritable])).toEqual([
      [true, true, false],
      [true, true, false],
      [false, false, true],
      [false, false, true],
      [false, false, true],
    ]);
  });

  it("Deposit ends with the SPL token program, read-only", () => {
    const i = ix.deposit(
      { owner: a, market, portfolio: pa, sourceToken: b, vaultToken: pb },
      { portfolioId: 1n, expectedSequence: 0n, amount: 1n },
    );
    expect(i.keys.length).toBe(6);
    expect(i.keys[5]!.pubkey.equals(SPL_TOKEN_PROGRAM_ID)).toBe(true);
    expect(i.keys[5]!.isWritable).toBe(false);
    expect(i.keys[0]!.isSigner).toBe(true);
  });

  it("PermissionlessCrank: caller signs only when a reward portfolio is appended", () => {
    const plain = ix.permissionlessCrank({ caller: a, market, portfolio: pa }, { nowSlot: 1n, hints: [] });
    expect(plain.keys[0]!.isSigner).toBe(false);
    expect(plain.keys.length).toBe(3);
    const rewarded = ix.permissionlessCrank(
      { caller: a, market, portfolio: pa, rewardPortfolio: pb },
      { nowSlot: 1n, hints: [] },
    );
    expect(rewarded.keys[0]!.isSigner).toBe(true);
    expect(rewarded.keys[3]!.pubkey.equals(pb)).toBe(true);
    expect(rewarded.keys[3]!.isWritable).toBe(true);
  });

  it("UpdateAssetLifecycle adds fee accounts only when both token accounts are given", () => {
    const base = { action: AssetAction.Shutdown, assetIndex: 1, marketId: 2n, authorityEpoch: 0n, nowSlot: 1n, initialPrice: 0n, maxInitFee: 0n, insuranceAuthority: a, insuranceOperator: a, backingBucketAuthority: a, oracleAuthority: a };
    expect(ix.updateAssetLifecycle({ authority: a, market }, base).keys.length).toBe(2);
    expect(ix.updateAssetLifecycle({ authority: a, market, feeSourceToken: b, vaultToken: pb }, base).keys.length).toBe(5);
  });

  it("UpdateAssetAuthority: the incoming key signs unless the admin is being burned", () => {
    const zero = new PublicKey(new Uint8Array(32));
    const rotate = ix.updateAssetAuthority({ current: a, newAuthority: b, market }, { assetIndex: 1, marketId: 1n, authorityEpoch: 0n, kind: AssetAuthorityKind.Oracle, newPubkey: b });
    expect(rotate.keys[1]!.isSigner).toBe(true);
    const burn = ix.updateAssetAuthority({ current: a, newAuthority: zero, market }, { assetIndex: 1, marketId: 1n, authorityEpoch: 0n, kind: AssetAuthorityKind.Admin, newPubkey: zero });
    expect(burn.keys[1]!.isSigner).toBe(false);
  });
});
