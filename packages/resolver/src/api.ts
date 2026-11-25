/**
 * Minimal JSON API over node:http. No framework so the dependency surface
 * stays the SDK plus web3.js.
 *
 *   GET  /health
 *   GET  /questions                      -> SignedQuestion[]
 *   GET  /questions/:assetIndex/:marketId
 *   POST /questions                      body: SignedQuestion (creator-signed); resolver countersigns and stores
 *   POST /questions/:assetIndex/:marketId/resolve   body: { outcome: "YES"|"NO", note? }, header x-resolver-token
 *   GET  /decisions/:assetIndex/:marketId
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { SignedQuestionSchema, countersignManifest, type SignedQuestion } from "@predictulator/sdk";
import type { Keypair } from "@solana/web3.js";
import type { Registry } from "./registry.js";
import type { ResolverService } from "./service.js";

export interface ApiConfig {
  registry: Registry;
  service: ResolverService;
  resolver: Keypair;
  adminToken: string;
  /** Resolver only accepts manifests that name it. */
  acceptedMarket: string;
  corsOrigin?: string;
}

function send(res: ServerResponse, status: number, body: unknown, cors?: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (cors) {
    res.setHeader("access-control-allow-origin", cors);
    res.setHeader("access-control-allow-headers", "content-type, x-resolver-token");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function tokenOk(given: string | undefined, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function createApi(cfg: ApiConfig) {
  return createServer(async (req, res) => {
    const cors = cfg.corsOrigin;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "OPTIONS") return send(res, 204, null, cors);

      if (req.method === "GET" && parts[0] === "health") {
        return send(res, 200, { ok: true, resolver: cfg.resolver.publicKey.toBase58(), market: cfg.acceptedMarket }, cors);
      }

      if (parts[0] === "questions") {
        if (req.method === "GET" && parts.length === 1) {
          return send(res, 200, await cfg.registry.list(), cors);
        }
        if (req.method === "GET" && parts.length === 3) {
          const q = await cfg.registry.get(Number(parts[1]), parts[2]!);
          return q ? send(res, 200, q, cors) : send(res, 404, { error: "not found" }, cors);
        }
        if (req.method === "POST" && parts.length === 1) {
          const body = SignedQuestionSchema.parse(await readJson(req));
          if (body.manifest.market !== cfg.acceptedMarket) {
            return send(res, 400, { error: "manifest.market is not this resolver's market" }, cors);
          }
          if (body.manifest.resolver !== cfg.resolver.publicKey.toBase58()) {
            return send(res, 400, { error: "manifest.resolver is not this resolver" }, cors);
          }
          const existing = await cfg.registry.get(body.manifest.assetIndex, body.manifest.marketId);
          if (existing) return send(res, 409, { error: "already registered" }, cors);
          const signed: SignedQuestion = countersignManifest(body, cfg.resolver.secretKey);
          await cfg.registry.put(signed);
          return send(res, 201, signed, cors);
        }
        if (req.method === "POST" && parts.length === 4 && parts[3] === "resolve") {
          if (!tokenOk(req.headers["x-resolver-token"] as string | undefined, cfg.adminToken)) {
            return send(res, 401, { error: "bad token" }, cors);
          }
          const q = await cfg.registry.get(Number(parts[1]), parts[2]!);
          if (!q) return send(res, 404, { error: "not found" }, cors);
          const body = (await readJson(req)) as { outcome?: unknown; note?: unknown };
          if (body.outcome !== "YES" && body.outcome !== "NO") {
            return send(res, 400, { error: "outcome must be YES or NO" }, cors);
          }
          await cfg.service.resolve(q, body.outcome, typeof body.note === "string" ? body.note : undefined);
          return send(res, 200, { ok: true }, cors);
        }
      }

      if (req.method === "GET" && parts[0] === "decisions" && parts.length === 3) {
        const d = await cfg.registry.getDecision(Number(parts[1]), parts[2]!);
        return d ? send(res, 200, d, cors) : send(res, 404, { error: "undecided" }, cors);
      }

      return send(res, 404, { error: "no route" }, cors);
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) }, cors);
    }
  });
}
