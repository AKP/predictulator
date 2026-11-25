#!/usr/bin/env node
/**
 * predictulator-maker
 *
 * Environment:
 *   RPC_URL, PROGRAM_ID, MARKET
 *   MAKER_KEYPAIR            owner of the maker portfolio; co-signs fills
 *   MAKER_PORTFOLIO          the maker's portfolio account
 *   HALF_SPREAD_E6           default 20000 (2 points)
 *   INVENTORY_CAP_SHARES     default 500
 *   MAX_SKEW_E6              default 50000
 *   MAX_FILL_SHARES          default 100
 *   FEE_BPS                  optional consented fee (defaults to market base fee)
 *   PORT                     default 8788
 *   CORS_ORIGIN
 */
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "@predictulator/sdk";
import { Maker, createMakerServer } from "./server.js";

function main(): void {
  const env = process.env;
  const required = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`missing ${k}`);
    return v;
  };
  const maker = new Maker({
    connection: new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed"),
    programId: env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID,
    market: new PublicKey(required("MARKET")),
    maker: Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(required("MAKER_KEYPAIR"), "utf8")))),
    makerPortfolio: new PublicKey(required("MAKER_PORTFOLIO")),
    halfSpreadE6: BigInt(env["HALF_SPREAD_E6"] ?? 20_000),
    inventoryCapShares: Number(env["INVENTORY_CAP_SHARES"] ?? 500),
    maxSkewE6: BigInt(env["MAX_SKEW_E6"] ?? 50_000),
    maxFillShares: Number(env["MAX_FILL_SHARES"] ?? 100),
    ...(env["FEE_BPS"] ? { feeBps: BigInt(env["FEE_BPS"]) } : {}),
    ...(env["CORS_ORIGIN"] ? { corsOrigin: env["CORS_ORIGIN"] } : {}),
  });
  const port = Number(env["PORT"] ?? 8788);
  createMakerServer(maker).listen(port, () => console.log(`maker on :${port} as ${maker.cfg.maker.publicKey.toBase58()}`));
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
