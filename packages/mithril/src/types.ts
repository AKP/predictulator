/**
 * Types for Mithril, Predictulator's protected-submission sidecar.
 *
 * Mithril is the connector you run next to a fill service. Instead of firing a
 * co-signed TradeNoCpi at a public RPC and hoping the next block builder does
 * not reorder it, Mithril hands the transaction to a Harmonic-style separated
 * builder as a bundle. A bundle lands atomically, in order, or not at all, so a
 * taker's fill cannot be front-run or sandwiched between signing and landing.
 *
 * The builder wire shape mirrors a Jito-style block-engine JSON-RPC, so the
 * same sidecar points at Harmonic, Jito, or any protected builder by endpoint.
 */
import type {PublicKey} from "@solana/web3.js";

export interface MithrilConfig {
  /** Harmonic (or any protected) builder block-engine JSON-RPC endpoint. */
  builderEndpoint: string;
  /** Account the builder credits the tip to; the last instruction pays it. */
  tipAccount: PublicKey;
  /** Minimum tip, in lamports, Mithril will submit with. */
  minTipLamports: number;
  /** Transport for the JSON-RPC POST. Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Status poll interval while waiting for a landing. Default 400ms. */
  pollMs?: number;
  /** How long to wait for a landing before giving up. Default 30s. */
  timeoutMs?: number;
}

export type BundleState = "pending" | "landed" | "failed" | "unknown";

export interface BundleStatus {
  bundleId: string;
  state: BundleState;
  /** Slot the bundle landed in, when known. */
  slot: number | null;
  /** The builder's raw status string, for logging. */
  raw: string;
}

export interface ProtectedResult {
  bundleId: string;
  state: BundleState;
  slot: number | null;
  /** Wall-clock milliseconds from submit to terminal state. */
  elapsedMs: number;
  /** Tip paid, in lamports. */
  tipLamports: number;
}
