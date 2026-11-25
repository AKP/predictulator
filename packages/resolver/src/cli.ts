#!/usr/bin/env node
/**
 * predictulator-resolver
 *
 * Environment:
 *   RPC_URL                  Solana RPC (default devnet)
 *   PROGRAM_ID               deployed percolator-prog id
 *   MARKET                   market group account
 *   RESOLVER_KEYPAIR         path to the oracle-authority keypair JSON
 *   SHUTDOWN_KEYPAIR         optional; marketauth or asset-admin keypair for SHUTDOWN/RETIRE
 *   REGISTRY_DIR             directory for questions/ and decisions/ (default ./registry)
 *   MARK_SOURCE              "none" | "file:<path>" | "http:<base url>"
 *   TICK_MS                  loop interval (default 20000)
 *   PORT                     HTTP API port (default 8787)
 *   RESOLVER_ADMIN_TOKEN     required to POST a resolution
 *   CORS_ORIGIN              optional origin for the web app
 *   DRY_RUN=1                log actions without sending
 */
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "@predictulator/sdk";
import { createApi } from "./api.js";
import { FileMarkSource, HttpMarkSource, NullMarkSource, type MarkSource } from "./marks.js";
import { Registry } from "./registry.js";
import { ResolverService } from "./service.js";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
}

function markSource(spec: string | undefined): MarkSource {
  if (!spec || spec === "none") return new NullMarkSource();
  if (spec.startsWith("file:")) return new FileMarkSource(spec.slice(5));
  if (spec.startsWith("http:") || spec.startsWith("https:")) return new HttpMarkSource(spec);
  throw new Error(`unknown MARK_SOURCE ${spec}`);
}

async function main(): Promise<void> {
  const env = process.env;
  const required = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`missing ${k}`);
    return v;
  };
  const connection = new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed");
  const programId = env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID;
  const market = new PublicKey(required("MARKET"));
  const resolver = loadKeypair(required("RESOLVER_KEYPAIR"));
  const shutdownAuthority = env["SHUTDOWN_KEYPAIR"] ? loadKeypair(env["SHUTDOWN_KEYPAIR"]) : undefined;
  const registry = new Registry(env["REGISTRY_DIR"] ?? "./registry");
  await registry.init();

  const service = new ResolverService({
    connection,
    programId,
    market,
    resolver,
    ...(shutdownAuthority ? { shutdownAuthority } : {}),
    registry,
    markSource: markSource(env["MARK_SOURCE"]),
    dryRun: env["DRY_RUN"] === "1",
  });

  const api = createApi({
    registry,
    service,
    resolver,
    adminToken: required("RESOLVER_ADMIN_TOKEN"),
    acceptedMarket: market.toBase58(),
    ...(env["CORS_ORIGIN"] ? { corsOrigin: env["CORS_ORIGIN"] } : {}),
  });
  const port = Number(env["PORT"] ?? 8787);
  api.listen(port, () => console.log(`resolver api on :${port} as ${resolver.publicKey.toBase58()}`));

  const tickMs = Number(env["TICK_MS"] ?? 20_000);
  let running = false;
  const loop = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const r = await service.tick();
      const acted = r.questions.filter((q) => q.action.kind !== "none" && q.action.kind !== "done");
      if (acted.length) console.log(`slot ${r.slot}:`, JSON.stringify(acted, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch (e) {
      console.error("tick failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  await loop();
  setInterval(loop, tickMs);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
