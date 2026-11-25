import { PublicKey } from "@solana/web3.js";

export interface AppConfig {
  rpcUrl: string;
  programId: PublicKey;
  market: PublicKey;
  resolverUrl: string;
  makerUrl: string;
}

function pk(v: string | undefined): PublicKey | null {
  if (!v) return null;
  try {
    return new PublicKey(v);
  } catch {
    return null;
  }
}

export function loadConfig(): { config: AppConfig | null; missing: string[] } {
  const env = import.meta.env;
  const programId = pk(env["VITE_PROGRAM_ID"]);
  const market = pk(env["VITE_MARKET"]);
  const missing: string[] = [];
  if (!programId) missing.push("VITE_PROGRAM_ID");
  if (!market) missing.push("VITE_MARKET");
  if (!env["VITE_RESOLVER_URL"]) missing.push("VITE_RESOLVER_URL");
  if (!env["VITE_MAKER_URL"]) missing.push("VITE_MAKER_URL");
  if (missing.length || !programId || !market) return { config: null, missing };
  return {
    config: {
      rpcUrl: env["VITE_RPC_URL"] ?? "https://api.devnet.solana.com",
      programId,
      market,
      resolverUrl: env["VITE_RESOLVER_URL"]!,
      makerUrl: env["VITE_MAKER_URL"]!,
    },
    missing,
  };
}
