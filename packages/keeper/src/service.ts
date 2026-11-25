import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Predictulator, instructions as ix, percolatorErrorName } from "@predictulator/sdk";
import { crankTargets, forceClosePairs } from "./plan.js";

export interface KeeperConfig {
  connection: Connection;
  programId: PublicKey;
  market: PublicKey;
  keeper: Keypair;
  /** Keeper's own portfolio, to receive cranker fee shares when the market pays them. */
  rewardPortfolio?: PublicKey;
  maxCranksPerTick?: number;
  maxForceClosesPerTick?: number;
  dryRun?: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface KeeperTick {
  slot: bigint;
  cranks: Array<{ portfolio: string; reasons: string[]; signature?: string; error?: string }>;
  forceCloses: Array<{ asset: number; long: string; short: string; closeQ: string; signature?: string; error?: string }>;
  maintenance: Array<{ portfolio: string; signature?: string; error?: string }>;
}

export class KeeperService {
  private readonly client: Predictulator;
  private readonly log: NonNullable<KeeperConfig["log"]>;

  constructor(private readonly cfg: KeeperConfig) {
    this.client = new Predictulator({ connection: cfg.connection, market: cfg.market, programId: cfg.programId });
    this.log = cfg.log ?? ((m, e) => console.log(m, e ?? ""));
  }

  async tick(): Promise<KeeperTick> {
    const market = await this.client.fetchMarket();
    const portfolios = await this.client.listPortfolios();
    const slot = BigInt(await this.cfg.connection.getSlot("confirmed"));
    const out: KeeperTick = { slot, cranks: [], forceCloses: [], maintenance: [] };

    const rewardEnabled = market.wrapper.liquidationCrankerFeeShareBps > 0 && this.cfg.rewardPortfolio !== undefined;

    for (const t of crankTargets(market, portfolios).slice(0, this.cfg.maxCranksPerTick ?? 8)) {
      const addr = t.portfolio.address!;
      const entry: KeeperTick["cranks"][number] = { portfolio: addr.toBase58(), reasons: t.reasons };
      try {
        const hints = [...new Set(t.staleAssets)].slice(0, 16).map((assetIndex) => ({ assetIndex, oracleAccounts: 0 }));
        const instruction = this.client.buildCrank(
          this.cfg.keeper.publicKey,
          addr,
          slot,
          hints,
          rewardEnabled ? this.cfg.rewardPortfolio : undefined,
        );
        const sig = await this.send([instruction]);
        if (sig) entry.signature = sig;
      } catch (e) {
        entry.error = describeError(e);
      }
      out.cranks.push(entry);
    }

    for (const p of forceClosePairs(market, portfolios, slot).slice(0, this.cfg.maxForceClosesPerTick ?? 8)) {
      const entry: KeeperTick["forceCloses"][number] = {
        asset: p.asset.index,
        long: p.longPortfolio.address!.toBase58(),
        short: p.shortPortfolio.address!.toBase58(),
        closeQ: p.closeQ.toString(),
      };
      try {
        const instruction = this.client.buildForceClose(
          this.cfg.keeper.publicKey,
          p.asset,
          p.longPortfolio.address!,
          p.shortPortfolio.address!,
          p.closeQ,
          slot,
        );
        const sig = await this.send([instruction]);
        if (sig) entry.signature = sig;
      } catch (e) {
        entry.error = describeError(e);
      }
      out.forceCloses.push(entry);
    }

    // Maintenance fees: only when the market charges them and the keeper can earn a share.
    if (market.wrapper.maintenanceFeePerSlot > 0n && market.wrapper.maintenanceCrankerFeeShareBps > 0 && this.cfg.rewardPortfolio) {
      const due = portfolios
        .filter((p) => p.capital > 0n && slot - p.lastFeeSlot > 5_000n)
        .slice(0, 4);
      for (const p of due) {
        const entry: KeeperTick["maintenance"][number] = { portfolio: p.address!.toBase58() };
        try {
          const instruction = ix.syncMaintenanceFee(
            { market: this.cfg.market, portfolio: p.address!, crankerPortfolio: this.cfg.rewardPortfolio },
            { nowSlot: slot },
            { programId: this.cfg.programId },
          );
          const sig = await this.send([instruction]);
          if (sig) entry.signature = sig;
        } catch (e) {
          entry.error = describeError(e);
        }
        out.maintenance.push(entry);
      }
    }

    return out;
  }

  private async send(instructions: import("@solana/web3.js").TransactionInstruction[]): Promise<string | null> {
    if (this.cfg.dryRun) {
      this.log("keeper: dry run", { instructions: instructions.length });
      return null;
    }
    const tx = new Transaction().add(...instructions);
    tx.feePayer = this.cfg.keeper.publicKey;
    return sendAndConfirmTransaction(this.cfg.connection, tx, [this.cfg.keeper], { commitment: "confirmed" });
  }
}

export function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(msg);
  return m ? `${msg} (${percolatorErrorName(Number.parseInt(m[1]!, 16))})` : msg;
}
