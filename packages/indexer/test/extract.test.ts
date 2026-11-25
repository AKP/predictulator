import {describe, expect, it} from "vitest";
import {Keypair} from "@solana/web3.js";
import {AssetAction, MEMO_PROGRAM_ID, instructions as ix, manifestMemo, type QuestionManifest} from "@predictulator/sdk";
import {bs58decode, bs58encode, decodeLifecycleHeader, extractActivation, reconcile, type ParsedTxLike} from "../src/extract.js";

const programId = Keypair.generate().publicKey;
const market = Keypair.generate().publicKey;
const creator = Keypair.generate().publicKey;
const resolver = Keypair.generate().publicKey;

const manifest: QuestionManifest = {
  version: 1,
  market: market.toBase58(),
  assetIndex: 3,
  marketId: "7",
  title: "Will it rain in Lisbon on 2026-12-01?",
  description: "",
  resolutionCriteria: "YES if IPMA records any precipitation at Lisboa/Geofísico on that date.",
  closesAt: "2026-12-01T00:00:00.000Z",
  resolvesBy: "2026-12-02T00:00:00.000Z",
  resolver: resolver.toBase58(),
  creator: creator.toBase58(),
  tags: [],
  createdAt: "2026-11-10T00:00:00.000Z",
};

function activationTx(over: Partial<ParsedTxLike> = {}, action: number = AssetAction.Activate): ParsedTxLike {
  const lifecycle = ix.encodeUpdateAssetLifecycle({
    action,
    assetIndex: 3,
    marketId: 7n,
    authorityEpoch: 0n,
    nowSlot: 1n,
    initialPrice: 550_000n,
    maxInitFee: 1_000_000n,
    insuranceAuthority: resolver,
    insuranceOperator: resolver,
    backingBucketAuthority: resolver,
    oracleAuthority: resolver,
  });
  return {
    signature: "5igNature",
    slot: 1234,
    blockTime: 1_700_000_000,
    err: null,
    accountKeys: [creator.toBase58(), market.toBase58(), MEMO_PROGRAM_ID.toBase58(), programId.toBase58()],
    instructions: [
      {programId: MEMO_PROGRAM_ID.toBase58(), parsed: manifestMemo(manifest)},
      {programId: programId.toBase58(), data: bs58encode(lifecycle), accounts: [0, 1]},
    ],
    ...over,
  };
}

describe("base58", () => {
  it("round-trips, including leading zeros", () => {
    const k = Keypair.generate().publicKey;
    expect(bs58encode(k.toBytes())).toBe(k.toBase58());
    expect(bs58decode(k.toBase58())).toEqual(k.toBytes());
    const z = new Uint8Array([0, 0, 1, 2, 3]);
    expect(bs58decode(bs58encode(z))).toEqual(z);
  });
});

describe("activation extraction", () => {
  it("pairs the memo hash with the activate instruction's slot and generation", () => {
    const a = extractActivation(activationTx(), programId);
    expect(a).not.toBeNull();
    expect(a).toMatchObject({assetIndex: 3, marketId: 7n, activator: creator.toBase58(), slot: 1234});
    expect(a!.manifestHash).toBe(manifestMemo(manifest).slice("predictulator:q:v1:".length));
  });

  it("reads the memo from raw base58 data as well as parsed text", () => {
    const raw = bs58encode(new TextEncoder().encode(manifestMemo(manifest)));
    const tx = activationTx({
      instructions: [{programId: MEMO_PROGRAM_ID.toBase58(), data: raw}, activationTx().instructions[1]!],
    });
    expect(extractActivation(tx, programId)?.manifestHash).toHaveLength(64);
  });

  it("ignores failed transactions, non-activate actions, and memos without the prefix", () => {
    expect(extractActivation(activationTx({err: {InstructionError: [1, "Custom"]}}), programId)).toBeNull();
    expect(extractActivation(activationTx({}, AssetAction.Shutdown), programId)).toBeNull();
    const tx = activationTx({
      instructions: [{programId: MEMO_PROGRAM_ID.toBase58(), parsed: "hello"}, activationTx().instructions[1]!],
    });
    expect(extractActivation(tx, programId)).toBeNull();
  });

  it("decodes only the lifecycle header it needs", () => {
    expect(decodeLifecycleHeader(new Uint8Array([40, 0, 5, 0, 9, 0, 0, 0, 0, 0, 0, 0]))).toEqual({action: 0, assetIndex: 5, marketId: 9n});
    expect(decodeLifecycleHeader(new Uint8Array([6, 0, 0]))).toBeNull();
  });
});

describe("reconcile", () => {
  const a = extractActivation(activationTx(), programId)!;

  it("classifies every pairing", () => {
    const r = reconcile(
      [a, {...a, assetIndex: 4, marketId: 8n, manifestHash: "f".repeat(64)}],
      [
        {assetIndex: 3, marketId: "7", hash: a.manifestHash},
        {assetIndex: 4, marketId: "8", hash: "0".repeat(64)},
        {assetIndex: 9, marketId: "9", hash: "1".repeat(64)},
      ],
    );
    expect(r.map((x) => [x.key, x.verdict])).toEqual([
      ["3/7", "verified"],
      ["4/8", "hash-mismatch"],
      ["9/9", "not-on-chain"],
    ]);
    expect(reconcile([a], [])).toEqual([{key: "3/7", verdict: "unregistered", activation: a}]);
  });
});
