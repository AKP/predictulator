/**
 * Mithril — Predictulator's protected-submission sidecar.
 *
 * Attach a tip to a fill before the taker signs, then hand the fully signed
 * TradeNoCpi to `sendProtected`. Mithril submits it to the Harmonic builder as
 * a one-transaction bundle and waits for a terminal state. It holds no keys;
 * the transaction arrives already signed.
 */
import {SystemProgram, Transaction, VersionedTransaction, type PublicKey, type TransactionInstruction} from "@solana/web3.js";
import {HarmonicBuilder} from "./harmonic.js";
import type {MithrilConfig, ProtectedResult} from "./types.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Mithril {
  private readonly builder: HarmonicBuilder;
  private readonly tipAccount: PublicKey;
  private readonly minTipLamports: number;
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(config: MithrilConfig) {
    this.builder = new HarmonicBuilder(config.builderEndpoint, config.fetchFn ?? fetch);
    this.tipAccount = config.tipAccount;
    this.minTipLamports = config.minTipLamports;
    this.pollMs = config.pollMs ?? 400;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /** The tip instruction. Append it to the fill BEFORE the taker signs. */
  tipInstruction(from: PublicKey, lamports: number): TransactionInstruction {
    if (lamports < this.minTipLamports) {
      throw new Error(`tip ${lamports} is below the Mithril minimum ${this.minTipLamports}`);
    }
    return SystemProgram.transfer({fromPubkey: from, toPubkey: this.tipAccount, lamports});
  }

  /** Convenience: append the tip to an unsigned fill. Returns the same tx. */
  attachTip(tx: Transaction, from: PublicKey, lamports: number): Transaction {
    tx.add(this.tipInstruction(from, lamports));
    return tx;
  }

  /** The raw Harmonic transport, if you need bundle status directly. */
  get harmonic(): HarmonicBuilder {
    return this.builder;
  }

  /**
   * Submit a signed fill through Harmonic and wait for a terminal state. The
   * transaction must already carry the tip instruction and every signature.
   */
  async sendProtected(tx: Transaction | VersionedTransaction, tipLamports: number): Promise<ProtectedResult> {
    if (tipLamports < this.minTipLamports) {
      throw new Error(`tip ${tipLamports} is below the Mithril minimum ${this.minTipLamports}`);
    }
    const started = Date.now();
    const bundleId = await this.builder.sendBundle([tx]);
    for (;;) {
      const status = await this.builder.bundleStatus(bundleId);
      if (status.state === "landed" || status.state === "failed") {
        return {bundleId, state: status.state, slot: status.slot, elapsedMs: Date.now() - started, tipLamports};
      }
      if (Date.now() - started > this.timeoutMs) {
        return {bundleId, state: "unknown", slot: null, elapsedMs: Date.now() - started, tipLamports};
      }
      await sleep(this.pollMs);
    }
  }
}
