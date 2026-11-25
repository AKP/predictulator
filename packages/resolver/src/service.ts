import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  AssetLifecycle,
  Predictulator,
  instructions as ix,
  percolatorErrorName,
  type MarketGroup,
  type QuestionState,
  type SignedQuestion,
} from "@predictulator/sdk";
import { nextAction, type Action, type LifecycleInput } from "./lifecycle.js";
import type { MarkSource } from "./marks.js";
import { Registry } from "./registry.js";

export interface ResolverServiceConfig {
  connection: Connection;
  programId: PublicKey;
  market: PublicKey;
  /** Oracle authority for every question this service resolves. */
  resolver: Keypair;
  /** Signs SHUTDOWN. marketauth, or the per-asset admin (defaults to `resolver`). */
  shutdownAuthority?: Keypair;
  registry: Registry;
  markSource: MarkSource;
  minMarkDeltaE6?: bigint;
  dryRun?: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface TickReport {
  slot: bigint;
  questions: Array<{ key: string; action: Action; signature?: string; error?: string }>;
}

export class ResolverService {
  private readonly client: Predictulator;
  private readonly log: NonNullable<ResolverServiceConfig["log"]>;

  constructor(private readonly cfg: ResolverServiceConfig) {
    this.client = new Predictulator({
      connection: cfg.connection,
      market: cfg.market,
      programId: cfg.programId,
    });
    this.log = cfg.log ?? ((m, e) => console.log(m, e ?? ""));
  }

  /** One pass over every registered question. */
  async tick(): Promise<TickReport> {
    const market = await this.client.fetchMarket();
    const slot = BigInt(await this.cfg.connection.getSlot("confirmed"));
    const nowMs = Date.now();
    const questions = await this.cfg.registry.list();
    const report: TickReport = { slot, questions: [] };
    const canRetire = market.wrapper.marketauth.equals(this.shutdownSigner().publicKey);

    for (const q of questions) {
      const key = Registry.key(q);
      const asset = market.assets[q.manifest.assetIndex];
      if (!asset || asset.marketId !== BigInt(q.manifest.marketId)) {
        report.questions.push({
          key,
          action: { kind: "none", why: asset ? `slot now holds generation ${asset.marketId}` : "slot not activated" },
        });
        continue;
      }
      if (!asset.oracle.oracleAuthority.equals(this.cfg.resolver.publicKey)) {
        report.questions.push({
          key,
          action: { kind: "none", why: `oracle authority is ${asset.oracle.oracleAuthority.toBase58()}, not this resolver` },
        });
        continue;
      }
      const state = Predictulator.questionState(asset);
      const input: LifecycleInput = {
        state,
        manifest: q.manifest,
        decision: await this.cfg.registry.getDecision(q.manifest.assetIndex, q.manifest.marketId),
        fairProbabilityE6: state.phase === "open" ? await this.cfg.markSource.fairMarkE6(q) : null,
        nowMs,
        nowSlot: slot,
        minMarkDeltaE6: this.cfg.minMarkDeltaE6 ?? 5_000n,
        canRetire,
      };
      const action = nextAction(input);
      const entry: TickReport["questions"][number] = { key, action };
      try {
        const sig = await this.execute(market, state, action, slot);
        if (sig) entry.signature = sig;
      } catch (e) {
        entry.error = describeError(e);
        this.log(`resolver: ${key} ${action.kind} failed`, { error: entry.error });
      }
      report.questions.push(entry);
    }
    return report;
  }

  private shutdownSigner(): Keypair {
    return this.cfg.shutdownAuthority ?? this.cfg.resolver;
  }

  private async execute(
    market: MarketGroup,
    state: QuestionState,
    action: Action,
    slot: bigint,
  ): Promise<string | null> {
    const asset = state.asset;
    let instruction: TransactionInstruction;
    let signer: Keypair = this.cfg.resolver;
    switch (action.kind) {
      case "configure_authmark":
        instruction = this.client.buildConfigureAuthMark(asset, this.cfg.resolver.publicKey, slot, action.initialMarkE6);
        break;
      case "push_mark":
        instruction = this.client.buildPushMark(asset, this.cfg.resolver.publicKey, slot, action.markE6);
        break;
      case "shutdown":
        signer = this.shutdownSigner();
        instruction = this.client.buildShutdown(market, asset, signer.publicKey, slot);
        break;
      case "retire": {
        signer = this.shutdownSigner();
        if (asset.lifecycle !== AssetLifecycle.Recovery) return null;
        const epoch = market.assets[0]!.control.authorityEpoch;
        instruction = ix.retireAsset(
          { authority: signer.publicKey, market: this.cfg.market },
          { assetIndex: asset.index, marketId: asset.marketId, authorityEpoch: epoch, nowSlot: slot },
          { programId: this.cfg.programId },
        );
        break;
      }
      default:
        return null;
    }
    this.log(`resolver: ${action.kind} asset ${asset.index} gen ${asset.marketId}`, {
      ...("markE6" in action ? { markE6: action.markE6.toString() } : {}),
      dryRun: this.cfg.dryRun ?? false,
    });
    if (this.cfg.dryRun) return null;
    const tx = new Transaction().add(instruction);
    tx.feePayer = signer.publicKey;
    return sendAndConfirmTransaction(this.cfg.connection, tx, [signer], { commitment: "confirmed" });
  }

  /** Record a decision. The next tick pushes the final mark and shuts the question down once converged. */
  async resolve(q: SignedQuestion, outcome: "YES" | "NO", note?: string): Promise<void> {
    if (Date.now() < Date.parse(q.manifest.closesAt)) {
      throw new Error(`question closes at ${q.manifest.closesAt}; refusing to resolve early`);
    }
    await this.cfg.registry.putDecision(q.manifest.assetIndex, q.manifest.marketId, {
      outcome,
      decidedAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    });
  }
}

export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(msg);
  if (m) return `${msg} (${percolatorErrorName(Number.parseInt(m[1]!, 16))})`;
  return msg;
}
