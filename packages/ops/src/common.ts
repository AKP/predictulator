import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID, Predictulator, percolatorErrorName } from "@predictulator/sdk";

export interface Ctx {
  connection: Connection;
  programId: PublicKey;
  market: PublicKey | null;
}

export function ctxFromEnv(requireMarket = true): Ctx {
  const env = process.env;
  const market = env["MARKET"] ? new PublicKey(env["MARKET"]) : null;
  if (requireMarket && !market) throw new Error("MARKET is not set");
  return {
    connection: new Connection(env["RPC_URL"] ?? "https://api.devnet.solana.com", "confirmed"),
    programId: env["PROGRAM_ID"] ? new PublicKey(env["PROGRAM_ID"]) : DEFAULT_PROGRAM_ID,
    market,
  };
}

export function client(ctx: Ctx): Predictulator {
  if (!ctx.market) throw new Error("MARKET is not set");
  return new Predictulator({ connection: ctx.connection, market: ctx.market, programId: ctx.programId });
}

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
}

export function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return args[i + 1];
}

export function requireArg(args: string[], name: string): string {
  const v = arg(args, name);
  if (v === undefined) throw new Error(`--${name} is required`);
  return v;
}

export function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

export async function send(
  ctx: Ctx,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  label: string,
): Promise<string> {
  const tx = new Transaction().add(...instructions);
  tx.feePayer = signers[0]!.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(ctx.connection, tx, signers, { commitment: "confirmed" });
    console.log(`${label}: ${sig}`);
    return sig;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = /custom program error: 0x([0-9a-f]+)/i.exec(msg);
    throw new Error(`${label} failed: ${msg}${m ? ` (${percolatorErrorName(Number.parseInt(m[1]!, 16))})` : ""}`);
  }
}

export const json = (v: unknown): string =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x instanceof PublicKey ? x.toBase58() : x), 2);
