/**
 * Question manifests.
 *
 * The chain only knows an asset slot, a market id, and a probability mark.
 * Everything a human needs (the question text, resolution criteria, who
 * resolves it, when) lives in a signed manifest. Its hash is committed on
 * chain in an SPL Memo inside the activation transaction, so anyone can bind
 * a manifest to the exact slot generation it describes.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";
import { z } from "zod";
import { toHex } from "./bytes.js";

const base58 = z.string().refine(
  (s) => {
    try {
      new PublicKey(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "not a base58 public key" },
);

const u64String = z.string().regex(/^\d+$/).refine((s) => BigInt(s) <= (1n << 64n) - 1n);

export const QuestionManifestSchema = z.object({
  version: z.literal(1),
  /** Market group account. */
  market: base58,
  /** Asset slot index inside the market group. */
  assetIndex: z.number().int().min(1).max(65_535),
  /** Slot generation (`market_id`) the question was activated under. Never reused. */
  marketId: u64String,
  title: z.string().min(8).max(200),
  description: z.string().max(4_000),
  /** What exactly counts as YES. Written for a stranger. */
  resolutionCriteria: z.string().min(20).max(4_000),
  resolutionSource: z.string().max(500).optional(),
  /** Trading stops; the resolver will not accept marks after this. ISO 8601. */
  closesAt: z.string().datetime(),
  /** Latest time the resolver commits to a YES/NO. ISO 8601. */
  resolvesBy: z.string().datetime(),
  /** Oracle authority that pushes marks and the final resolution. */
  resolver: base58,
  creator: base58,
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
  createdAt: z.string().datetime(),
});

export type QuestionManifest = z.infer<typeof QuestionManifestSchema>;

export const SignedQuestionSchema = z.object({
  manifest: QuestionManifestSchema,
  /** hex sha256 of the canonical manifest JSON. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** base64 ed25519 signature over the hash bytes by `manifest.creator`. */
  creatorSignature: z.string(),
  /** base64 ed25519 signature over the hash bytes by `manifest.resolver`, once accepted. */
  resolverSignature: z.string().optional(),
});

export type SignedQuestion = z.infer<typeof SignedQuestionSchema>;

/** Deterministic JSON: keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

export function manifestHash(m: QuestionManifest): Uint8Array {
  return sha256(new TextEncoder().encode(canonicalJson(QuestionManifestSchema.parse(m))));
}

export function manifestHashHex(m: QuestionManifest): string {
  return toHex(manifestHash(m));
}

export const MEMO_PREFIX = "predictulator:q:v1:";

/** Memo text committed in the activation transaction. */
export function manifestMemo(m: QuestionManifest): string {
  return `${MEMO_PREFIX}${manifestHashHex(m)}`;
}

export function parseManifestMemo(text: string): string | null {
  if (!text.startsWith(MEMO_PREFIX)) return null;
  const h = text.slice(MEMO_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function unb64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

export function signManifest(m: QuestionManifest, secretKey: Uint8Array): SignedQuestion {
  const parsed = QuestionManifestSchema.parse(m);
  const hash = manifestHash(parsed);
  const signer = nacl.sign.keyPair.fromSecretKey(secretKey);
  const signerKey = new PublicKey(signer.publicKey).toBase58();
  if (signerKey !== parsed.creator) {
    throw new Error("secret key does not belong to manifest.creator");
  }
  return {
    manifest: parsed,
    hash: toHex(hash),
    creatorSignature: b64(nacl.sign.detached(hash, secretKey)),
  };
}

export function countersignManifest(q: SignedQuestion, resolverSecretKey: Uint8Array): SignedQuestion {
  verifySignedQuestion(q);
  const signer = nacl.sign.keyPair.fromSecretKey(resolverSecretKey);
  if (new PublicKey(signer.publicKey).toBase58() !== q.manifest.resolver) {
    throw new Error("secret key does not belong to manifest.resolver");
  }
  const hash = manifestHash(q.manifest);
  return { ...q, resolverSignature: b64(nacl.sign.detached(hash, resolverSecretKey)) };
}

/** Throws if the hash or any present signature is wrong. */
export function verifySignedQuestion(q: SignedQuestion): QuestionManifest {
  const parsed = SignedQuestionSchema.parse(q);
  const hash = manifestHash(parsed.manifest);
  if (toHex(hash) !== parsed.hash) throw new Error("manifest hash mismatch");
  const creator = new PublicKey(parsed.manifest.creator).toBytes();
  if (!nacl.sign.detached.verify(hash, unb64(parsed.creatorSignature), creator)) {
    throw new Error("creator signature invalid");
  }
  if (parsed.resolverSignature !== undefined) {
    const resolver = new PublicKey(parsed.manifest.resolver).toBytes();
    if (!nacl.sign.detached.verify(hash, unb64(parsed.resolverSignature), resolver)) {
      throw new Error("resolver signature invalid");
    }
  }
  return parsed.manifest;
}

/** Stable identity of a question: the slot generation inside its market. */
export function questionKey(m: Pick<QuestionManifest, "market" | "assetIndex" | "marketId">): string {
  return `${m.market}/${m.assetIndex}/${m.marketId}`;
}
