import {describe, expect, it} from "vitest";
import {Keypair, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {Mithril} from "../src/mithril.js";

const TIP = new PublicKey("6pCe2HaKwU7oUV1CRwdDK3tkmGz4NjhU92kBiLfKzFQB");

function stub(responses: Array<{result?: unknown; error?: {message: string}}>) {
  const calls: Array<{method: string; params: unknown[]}> = [];
  let i = 0;
  const fetchFn = (async (_url: string, init?: {body?: string}) => {
    const req = JSON.parse(init?.body ?? "{}") as {method: string; params: unknown[]};
    calls.push({method: req.method, params: req.params});
    const body = responses[Math.min(i++, responses.length - 1)];
    return {ok: true, json: async () => body} as unknown as Response;
  }) as unknown as typeof fetch;
  return {fetchFn, calls};
}

function mithril(fetchFn: typeof fetch) {
  return new Mithril({builderEndpoint: "https://x", tipAccount: TIP, minTipLamports: 10_000, fetchFn, pollMs: 1});
}

function signedTx(): Transaction {
  const taker = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.transfer({fromPubkey: taker.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1}),
  );
  tx.feePayer = taker.publicKey;
  tx.recentBlockhash = "11111111111111111111111111111111";
  return tx;
}

describe("Mithril sidecar", () => {
  it("builds a tip transfer to the configured account and enforces the floor", () => {
    const m = mithril(stub([]).fetchFn);
    const from = Keypair.generate().publicKey;
    const ix = m.tipInstruction(from, 50_000);
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    expect(ix.keys[1]?.pubkey.equals(TIP)).toBe(true);
    expect(() => m.tipInstruction(from, 5_000)).toThrow(/below the Mithril minimum/);
  });

  it("routes a bundle to Harmonic as base64 JSON-RPC and returns the bundle id", async () => {
    const {fetchFn, calls} = stub([{result: "bundle-abc"}]);
    const id = await mithril(fetchFn).harmonic.sendBundle([signedTx()]);
    expect(id).toBe("bundle-abc");
    expect(calls[0]?.method).toBe("sendBundle");
    const encoded = (calls[0]?.params[0] as string[])[0] ?? "";
    expect(encoded.length).toBeGreaterThan(0);
    expect(() => Buffer.from(encoded, "base64")).not.toThrow();
  });

  it("polls to a landed state and reports slot, tip, and elapsed time", async () => {
    const {fetchFn, calls} = stub([
      {result: "bundle-xyz"},
      {result: {value: [{status: "Pending"}]}},
      {result: {value: [{status: "Landed", landed_slot: 467_763_692}]}},
    ]);
    const res = await mithril(fetchFn).sendProtected(signedTx(), 50_000);
    expect(res.state).toBe("landed");
    expect(res.slot).toBe(467_763_692);
    expect(res.tipLamports).toBe(50_000);
    expect(calls.map((c) => c.method)).toEqual(["sendBundle", "getBundleStatuses", "getBundleStatuses"]);
  });

  it("rejects a protected send below the tip floor before any network call", async () => {
    const {fetchFn, calls} = stub([]);
    await expect(mithril(fetchFn).sendProtected(signedTx(), 1_000)).rejects.toThrow(/below the Mithril minimum/);
    expect(calls.length).toBe(0);
  });
});
