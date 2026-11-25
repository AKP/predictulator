/**
 * Pure extraction of question activations from parsed transactions.
 *
 * A Predictulator activation transaction carries an SPL Memo
 * `predictulator:q:v1:<sha256>` and an `UpdateAssetLifecycle(ACTIVATE)`
 * instruction. We pair them: the memo gives the manifest hash, the
 * instruction gives the slot and the generation it was activated under.
 */
import type {PublicKey} from "@solana/web3.js";
import {AssetAction, MEMO_PROGRAM_ID, Tag, parseManifestMemo, readU16, readU64} from "@predictulator/sdk";

export interface Activation {
  signature: string;
  slot: number;
  blockTime: number | null;
  assetIndex: number;
  /** Generation (`market_id`) the slot was activated under. */
  marketId: bigint;
  manifestHash: string;
  activator: string;
}

/** Minimal shape of a parsed transaction that the extractor reads. */
export interface ParsedTxLike {
  signature: string;
  slot: number;
  blockTime?: number | null;
  err?: unknown;
  accountKeys: string[];
  instructions: Array<{programId: string; data?: string; accounts?: number[]; parsed?: unknown}>;
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function bs58decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const c of s) {
    let carry = ALPHABET.indexOf(c);
    if (carry < 0) throw new Error("bad base58");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

export function bs58encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const b of bytes) {
    let carry = b;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let s = "";
  for (const b of bytes) {
    if (b !== 0) break;
    s += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) s += ALPHABET[digits[i]!];
  return s;
}

/** Decodes an `UpdateAssetLifecycle` payload far enough to know action, slot, and generation. */
export function decodeLifecycleHeader(data: Uint8Array): {action: number; assetIndex: number; marketId: bigint} | null {
  if (data.length < 1 + 1 + 2 + 8 || data[0] !== Tag.UpdateAssetLifecycle) return null;
  return {action: data[1]!, assetIndex: readU16(data, 2), marketId: readU64(data, 4)};
}

export function extractActivation(tx: ParsedTxLike, programId: PublicKey): Activation | null {
  if (tx.err) return null;
  let hash: string | null = null;
  let lifecycle: {assetIndex: number; marketId: bigint} | null = null;
  let activator: string | null = null;
  const memoId = MEMO_PROGRAM_ID.toBase58();
  const progId = programId.toBase58();
  for (const ix of tx.instructions) {
    if (ix.programId === memoId) {
      const text = typeof ix.parsed === "string" ? ix.parsed : ix.data ? new TextDecoder().decode(bs58decode(ix.data)) : "";
      const h = parseManifestMemo(text);
      if (h) hash = h;
    } else if (ix.programId === progId && ix.data) {
      const head = decodeLifecycleHeader(bs58decode(ix.data));
      if (head && head.action === AssetAction.Activate) {
        lifecycle = {assetIndex: head.assetIndex, marketId: head.marketId};
        const idx = ix.accounts?.[0];
        if (idx !== undefined) activator = tx.accountKeys[idx] ?? null;
      }
    }
  }
  if (!hash || !lifecycle || !activator) return null;
  return {
    signature: tx.signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    assetIndex: lifecycle.assetIndex,
    marketId: lifecycle.marketId,
    manifestHash: hash,
    activator,
  };
}

export type Verdict = "verified" | "hash-mismatch" | "unregistered" | "not-on-chain";

export interface Reconciled {
  key: string;
  verdict: Verdict;
  activation?: Activation;
  registryHash?: string;
}

/**
 * Pairs on-chain activations with a resolver's registry by (slot, generation).
 * `verified`: both exist and hashes agree. `hash-mismatch`: the registry serves
 * a different manifest than the one committed on chain. `unregistered`: on
 * chain only. `not-on-chain`: the registry claims a question no activation carries.
 */
export function reconcile(
  activations: Activation[],
  registry: Array<{assetIndex: number; marketId: string; hash: string}>,
): Reconciled[] {
  const byKey = new Map<string, Activation>();
  for (const a of activations) byKey.set(`${a.assetIndex}/${a.marketId}`, a);
  const out: Reconciled[] = [];
  const seen = new Set<string>();
  for (const r of registry) {
    const key = `${r.assetIndex}/${r.marketId}`;
    seen.add(key);
    const a = byKey.get(key);
    if (!a) out.push({key, verdict: "not-on-chain", registryHash: r.hash});
    else if (a.manifestHash !== r.hash) out.push({key, verdict: "hash-mismatch", activation: a, registryHash: r.hash});
    else out.push({key, verdict: "verified", activation: a, registryHash: r.hash});
  }
  for (const [key, a] of byKey) if (!seen.has(key)) out.push({key, verdict: "unregistered", activation: a});
  return out.sort((x, y) => x.key.localeCompare(y.key, undefined, {numeric: true}));
}
