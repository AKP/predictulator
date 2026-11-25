import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  canonicalJson,
  countersignManifest,
  manifestMemo,
  parseManifestMemo,
  questionKey,
  signManifest,
  verifySignedQuestion,
  type QuestionManifest,
} from "@predictulator/sdk";

const creator = Keypair.generate();
const resolver = Keypair.generate();
const market = Keypair.generate().publicKey;

function manifest(): QuestionManifest {
  return {
    version: 1,
    market: market.toBase58(),
    assetIndex: 1,
    marketId: "2",
    title: "Will SOL close above $300 on 2026-12-31?",
    description: "Settles on the Coinbase daily close.",
    resolutionCriteria:
      "YES if the SOL/USD daily close on Coinbase for 2026-12-31 (UTC) is strictly greater than 300.00.",
    resolutionSource: "https://www.coinbase.com/price/solana",
    closesAt: "2026-12-31T00:00:00.000Z",
    resolvesBy: "2027-01-02T00:00:00.000Z",
    resolver: resolver.publicKey.toBase58(),
    creator: creator.publicKey.toBase58(),
    tags: ["crypto", "sol"],
    createdAt: "2026-11-10T00:00:00.000Z",
  };
}

describe("question manifests", () => {
  it("canonical JSON sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("signs, hashes, and verifies; the memo carries the hash", () => {
    const q = signManifest(manifest(), creator.secretKey);
    expect(q.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySignedQuestion(q).title).toBe(manifest().title);
    const memo = manifestMemo(q.manifest);
    expect(parseManifestMemo(memo)).toBe(q.hash);
    expect(parseManifestMemo("hello")).toBeNull();
  });

  it("a resolver countersignature is verified too", () => {
    const q = countersignManifest(signManifest(manifest(), creator.secretKey), resolver.secretKey);
    expect(q.resolverSignature).toBeDefined();
    expect(() => verifySignedQuestion(q)).not.toThrow();
    const tampered = { ...q, manifest: { ...q.manifest, title: "Will SOL close above $3 on 2026-12-31?" } };
    expect(() => verifySignedQuestion(tampered)).toThrow(/hash mismatch/);
  });

  it("refuses to sign with the wrong key", () => {
    expect(() => signManifest(manifest(), resolver.secretKey)).toThrow(/creator/);
    expect(() => countersignManifest(signManifest(manifest(), creator.secretKey), creator.secretKey)).toThrow(/resolver/);
  });

  it("rejects an invalid manifest", () => {
    expect(() => signManifest({ ...manifest(), assetIndex: 0 }, creator.secretKey)).toThrow();
    expect(() => signManifest({ ...manifest(), closesAt: "yesterday" }, creator.secretKey)).toThrow();
  });

  it("question key is market/slot/generation", () => {
    expect(questionKey(manifest())).toBe(`${market.toBase58()}/1/2`);
  });
});
