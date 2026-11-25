#!/usr/bin/env node
/**
 * predictulator-keeper
 *
 * Environment:
 *   RPC_URL, PROGRAM_ID, MARKET      as for the resolver
 *   KEEPER_KEYPAIR                   fee payer / cranker
 *   REWARD_PORTFOLIO                 optional portfolio address to collect cranker fee shares
 *   TICK_MS                          default 15000
 *   DRY_RUN=1
 */
import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "@predictulator/sdk";
import { KeeperService } from "./service.js";

async function main(): Promise<void> {
  const env = process.env;
  const required = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`missing ${k}`);
    return v;
  };
  const service = new KeeperService({
    connection: new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed"),
    programId: env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID,
    market: new PublicKey(required("MARKET")),
    keeper: Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(required("KEEPER_KEYPAIR"), "utf8")))),
    ...(env["REWARD_PORTFOLIO"] ? { rewardPortfolio: new PublicKey(env["REWARD_PORTFOLIO"]) } : {}),
    dryRun: env["DRY_RUN"] === "1",
  });
  const tickMs = Number(env["TICK_MS"] ?? 15_000);
  let running = false;
  const loop = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const r = await service.tick();
      if (r.cranks.length || r.forceCloses.length || r.maintenance.length) {
        console.log(`slot ${r.slot}`, JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
      }
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
