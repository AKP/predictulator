#!/usr/bin/env node
/**
 * predictulator-mithril — dry-run the protected fill path.
 *
 *   predictulator-mithril demo    build a sample tipped fill and print the bundle
 *
 * Environment: HARMONIC_ENDPOINT, HARMONIC_TIP_ACCOUNT, HARMONIC_MIN_TIP (lamports)
 */
import {Keypair, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {Mithril} from "./mithril.js";

function main(): void {
  const [cmd] = process.argv.slice(2);
  if (cmd !== "demo") {
    console.log("usage: predictulator-mithril demo");
    process.exit(cmd ? 1 : 0);
  }
  const env = process.env;
  const tipAccount = new PublicKey(env["HARMONIC_TIP_ACCOUNT"] ?? "6pCe2HaKwU7oUV1CRwdDK3tkmGz4NjhU92kBiLfKzFQB");
  const mithril = new Mithril({
    builderEndpoint: env["HARMONIC_ENDPOINT"] ?? "https://mainnet.harmonic.example/api/v1/bundles",
    tipAccount,
    minTipLamports: Number(env["HARMONIC_MIN_TIP"] ?? 10_000),
  });

  // A stand-in for a co-signed TradeNoCpi. The real path uses ix.tradeNoCpi.
  const taker = Keypair.generate();
  const maker = Keypair.generate();
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({fromPubkey: taker.publicKey, toPubkey: maker.publicKey, lamports: 1}));
  mithril.attachTip(tx, taker.publicKey, 50_000);
  tx.feePayer = taker.publicKey;
  tx.recentBlockhash = "11111111111111111111111111111111";

  console.log("Mithril -> Harmonic, protected fill as a one-transaction bundle:");
  console.log(`  instructions: ${tx.instructions.length} (trade + tip)`);
  console.log(`  tip account:  ${tipAccount.toBase58()}`);
  console.log(`  tip:          50000 lamports`);
  console.log(`  builder:      ${env["HARMONIC_ENDPOINT"] ?? "(preview endpoint)"}`);
  console.log("  submit with mithril.sendProtected(signedTx, 50000) once both parties sign.");
}

main();
