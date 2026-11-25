/**
 * HarmonicBuilder — the low-level transport to a separated block builder.
 *
 * It speaks a Jito-style block-engine JSON-RPC: submit a bundle of signed
 * transactions, poll for its status. Mithril wraps this; nothing here knows
 * about tips or Predictulator. Point it at Harmonic, Jito, or any builder.
 */
import {Transaction, VersionedTransaction} from "@solana/web3.js";
import type {BundleState, BundleStatus} from "./types.js";

export function toBase64(tx: Transaction | VersionedTransaction): string {
  const bytes =
    tx instanceof VersionedTransaction
      ? tx.serialize()
      : tx.serialize({requireAllSignatures: false, verifySignatures: false});
  return Buffer.from(bytes).toString("base64");
}

export function normalizeState(raw: string): BundleState {
  const s = raw.toLowerCase();
  if (s.includes("land") || s === "finalized" || s === "confirmed") return "landed";
  if (s.includes("pend") || s.includes("process") || s.includes("queue")) return "pending";
  if (s.includes("fail") || s.includes("invalid") || s.includes("drop") || s.includes("reject")) return "failed";
  return "unknown";
}

export class HarmonicBuilder {
  constructor(
    private readonly endpoint: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await this.fetchFn(this.endpoint, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
    });
    if (!res.ok) throw new Error(`harmonic ${method}: http ${res.status}`);
    const body = (await res.json()) as {result?: T; error?: {message?: string}};
    if (body.error) throw new Error(`harmonic ${method}: ${body.error.message ?? "error"}`);
    if (body.result === undefined) throw new Error(`harmonic ${method}: empty result`);
    return body.result;
  }

  /** Submit one or more signed transactions as an atomic bundle. */
  async sendBundle(txs: Array<Transaction | VersionedTransaction>): Promise<string> {
    if (txs.length === 0) throw new Error("bundle is empty");
    return this.rpc<string>("sendBundle", [txs.map(toBase64), {encoding: "base64"}]);
  }

  /** One status poll for a bundle. */
  async bundleStatus(bundleId: string): Promise<BundleStatus> {
    const result = await this.rpc<{value: Array<{status?: string; landed_slot?: number | null} | null>}>(
      "getBundleStatuses",
      [[bundleId]],
    );
    const row = result.value[0] ?? null;
    const raw = row?.status ?? "unknown";
    return {bundleId, state: normalizeState(raw), slot: row?.landed_slot ?? null, raw};
  }
}
