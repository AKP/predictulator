#!/usr/bin/env node
/**
 * predictulator-indexer
 *
 *   scan   [--out activations.json]        list every on-chain question activation for MARKET
 *   verify --resolver-url <url> [--json]   check the resolver's registry against the chain
 *
 * Environment: RPC_URL (default devnet), PROGRAM_ID, MARKET
 */
import {writeFileSync} from "node:fs";
import {Connection, PublicKey} from "@solana/web3.js";
import {DEFAULT_PROGRAM_ID, SignedQuestionSchema} from "@predictulator/sdk";
import {reconcile} from "./extract.js";
import {scanActivations} from "./scan.js";

const json = (v: unknown): string => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const arg = (k: string): string | undefined => {
    const i = args.indexOf(`--${k}`);
    return i === -1 ? undefined : args[i + 1];
  };
  if (cmd !== "scan" && cmd !== "verify") {
    console.log("usage: predictulator-indexer scan [--out file] | verify --resolver-url <url> [--json]");
    process.exit(cmd ? 1 : 0);
  }
  const env = process.env;
  if (!env["MARKET"]) throw new Error("MARKET is not set");
  const connection = new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed");
  const programId = env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID;
  const market = new PublicKey(env["MARKET"]);
  const acts = await scanActivations(connection, market, programId, {log: (m) => console.error(m)});

  if (cmd === "scan") {
    const out = arg("out");
    if (out) {
      writeFileSync(out, json(acts) + "\n");
      console.log(`wrote ${acts.length} activations to ${out}`);
    } else console.log(json(acts));
    return;
  }

  const url = arg("resolver-url");
  if (!url) throw new Error("--resolver-url is required");
  const res = await fetch(new URL("/questions", url));
  if (!res.ok) throw new Error(`resolver ${res.status}`);
  const registry = ((await res.json()) as unknown[])
    .map((q) => SignedQuestionSchema.parse(q))
    .map((q) => ({assetIndex: q.manifest.assetIndex, marketId: q.manifest.marketId, hash: q.hash}));
  const report = reconcile(acts, registry);
  if (args.includes("--json")) console.log(json(report));
  else {
    for (const r of report) {
      const chain = r.activation ? `tx ${r.activation.signature.slice(0, 12)}… hash ${r.activation.manifestHash.slice(0, 12)}…` : "";
      const reg = r.verdict === "hash-mismatch" ? ` registry ${r.registryHash!.slice(0, 12)}…` : "";
      console.log(`${r.verdict.padEnd(14)} ${r.key.padEnd(10)} ${chain}${reg}`);
    }
  }
  process.exit(report.some((r) => r.verdict !== "verified") ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
