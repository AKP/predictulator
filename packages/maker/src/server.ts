/**
 * RFQ maker over node:http.
 *
 *   GET  /health
 *   GET  /quotes                          -> { [assetIndex]: Quote & { marketId, makerPortfolio, makerPortfolioId, makerPositionEpoch, feeBps } }
 *   GET  /quotes/:assetIndex
 *   GET  /fair?assetIndex=..&marketId=..  -> { probability }   (for the resolver's HttpMarkSource)
 *   POST /fill  { transaction: base64 }   -> { signature } | { error }
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { AssetLifecycle, OracleMode, Predictulator, percolatorErrorName, type MarketGroup, type Portfolio } from "@predictulator/sdk";
import { validateFill } from "./fill.js";
import { inventoryShares, quote, type Quote } from "./quote.js";

export interface MakerConfig {
  connection: Connection;
  programId: PublicKey;
  market: PublicKey;
  maker: Keypair;
  makerPortfolio: PublicKey;
  halfSpreadE6: bigint;
  inventoryCapShares: number;
  maxSkewE6: bigint;
  maxFillShares: number;
  /** Fee the maker consents to, in bps; defaults to the market base fee. */
  feeBps?: bigint;
  /** Only quote questions the maker has not opted out of. */
  excludeAssets?: Set<number>;
  corsOrigin?: string;
  /** How long a fetched market/portfolio snapshot is reused. */
  cacheMs?: number;
}

export interface PublishedQuote extends Quote {
  assetIndex: number;
  marketId: string;
  makerPortfolio: string;
  makerOwner: string;
  makerPortfolioId: string;
  makerPositionEpoch: string;
  feeBps: string;
  inventoryShares: number;
}

interface Snapshot {
  at: number;
  market: MarketGroup;
  portfolio: Portfolio;
}

export class Maker {
  private readonly client: Predictulator;
  private snap: Snapshot | null = null;
  private inflight: Promise<Snapshot> | null = null;

  constructor(readonly cfg: MakerConfig) {
    this.client = new Predictulator({ connection: cfg.connection, market: cfg.market, programId: cfg.programId });
  }

  async snapshot(force = false): Promise<Snapshot> {
    const ttl = this.cfg.cacheMs ?? 4_000;
    if (!force && this.snap && Date.now() - this.snap.at < ttl) return this.snap;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const [market, portfolio] = await Promise.all([
        this.client.fetchMarket(),
        this.client.fetchPortfolio(this.cfg.makerPortfolio),
      ]);
      if (!portfolio) throw new Error("maker portfolio not found");
      if (!portfolio.owner.equals(this.cfg.maker.publicKey)) throw new Error("maker portfolio is not owned by the maker key");
      const s = { at: Date.now(), market, portfolio };
      this.snap = s;
      return s;
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  quoteFor(s: Snapshot, assetIndex: number): PublishedQuote | null {
    const asset = s.market.assets[assetIndex];
    if (!asset || assetIndex === 0) return null;
    if (asset.lifecycle !== AssetLifecycle.Active) return null;
    if (asset.oracle.oracleMode !== OracleMode.AuthMark) return null;
    if (this.cfg.excludeAssets?.has(assetIndex)) return null;
    if (asset.effectivePrice !== asset.rawOracleTargetPrice) return null; // let the mark settle
    const inv = inventoryShares(s.portfolio.legs, assetIndex, asset.marketId);
    const q = quote({
      fairE6: asset.effectivePrice,
      halfSpreadE6: this.cfg.halfSpreadE6,
      inventoryShares: inv,
      inventoryCapShares: this.cfg.inventoryCapShares,
      maxSkewE6: this.cfg.maxSkewE6,
      maxFillShares: this.cfg.maxFillShares,
    });
    return {
      ...q,
      assetIndex,
      marketId: asset.marketId.toString(),
      makerPortfolio: this.cfg.makerPortfolio.toBase58(),
      makerOwner: this.cfg.maker.publicKey.toBase58(),
      makerPortfolioId: s.portfolio.portfolioId.toString(),
      makerPositionEpoch: s.portfolio.positionEpoch.toString(),
      feeBps: (this.cfg.feeBps ?? s.market.wrapper.tradeFeeBaseBps).toString(),
      inventoryShares: inv,
    };
  }

  async quotes(): Promise<Record<number, PublishedQuote>> {
    const s = await this.snapshot();
    const out: Record<number, PublishedQuote> = {};
    for (const a of s.market.assets) {
      const q = this.quoteFor(s, a.index);
      if (q) out[a.index] = q;
    }
    return out;
  }

  async fill(txBase64: string): Promise<{ signature: string } | { error: string }> {
    const tx = Transaction.from(Buffer.from(txBase64, "base64"));
    // Always validate against a fresh snapshot so the epoch check is current.
    const s = await this.snapshot(true);
    const ours = tx.instructions.find((i) => i.programId.equals(this.cfg.programId));
    if (!ours) return { error: "no Percolator instruction" };
    let assetIndex: number;
    try {
      assetIndex = Number(new DataView(ours.data.buffer, ours.data.byteOffset + 33, 2).getUint16(0, true));
    } catch {
      return { error: "malformed instruction" };
    }
    const q = this.quoteFor(s, assetIndex);
    if (!q) return { error: `not quoting asset ${assetIndex}` };
    const check = validateFill(tx, {
      programId: this.cfg.programId,
      market: this.cfg.market,
      makerOwner: this.cfg.maker.publicKey,
      makerPortfolio: this.cfg.makerPortfolio,
      makerPortfolioId: s.portfolio.portfolioId,
      makerPositionEpoch: s.portfolio.positionEpoch,
      assetIndex,
      marketId: BigInt(q.marketId),
      quote: q,
      minFeeBps: s.market.wrapper.tradeFeeBaseBps,
      maxFeeBps: BigInt(q.feeBps),
    });
    if (!check.ok) return { error: check.reason };
    // Verify the taker actually signed before we add our signature.
    const takerSig = tx.signatures.find((sg) => sg.publicKey.equals(check.takerOwner));
    if (!takerSig?.signature) return { error: "taker has not signed" };
    tx.partialSign(this.cfg.maker);
    try {
      const signature = await this.cfg.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      this.snap = null; // position epoch changes on success
      return { signature };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const m = /custom program error: 0x([0-9a-f]+)/i.exec(msg);
      return { error: m ? `${msg} (${percolatorErrorName(Number.parseInt(m[1]!, 16))})` : msg };
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown, cors?: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (cors) {
    res.setHeader("access-control-allow-origin", cors);
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

async function readJson(req: IncomingMessage, limit = 16 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createMakerServer(maker: Maker) {
  const cors = maker.cfg.corsOrigin;
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "OPTIONS") return send(res, 204, null, cors);
      if (req.method === "GET" && parts[0] === "health") {
        return send(res, 200, { ok: true, maker: maker.cfg.maker.publicKey.toBase58(), portfolio: maker.cfg.makerPortfolio.toBase58() }, cors);
      }
      if (req.method === "GET" && parts[0] === "quotes") {
        const all = await maker.quotes();
        if (parts.length === 1) return send(res, 200, all, cors);
        const q = all[Number(parts[1])];
        return q ? send(res, 200, q, cors) : send(res, 404, { error: "not quoting" }, cors);
      }
      if (req.method === "GET" && parts[0] === "fair") {
        const all = await maker.quotes();
        const q = all[Number(url.searchParams.get("assetIndex"))];
        if (!q || q.marketId !== url.searchParams.get("marketId")) return send(res, 404, { error: "not quoting" }, cors);
        return send(res, 200, { probability: Number(q.fairE6 + q.skewE6) / 1e6 }, cors);
      }
      if (req.method === "POST" && parts[0] === "fill") {
        const body = (await readJson(req)) as { transaction?: unknown };
        if (typeof body.transaction !== "string") return send(res, 400, { error: "transaction (base64) required" }, cors);
        const r = await maker.fill(body.transaction);
        return send(res, "error" in r ? 400 : 200, r, cors);
      }
      return send(res, 404, { error: "no route" }, cors);
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) }, cors);
    }
  });
}
