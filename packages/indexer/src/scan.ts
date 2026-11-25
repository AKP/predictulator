import {Connection, PublicKey, type ParsedTransactionWithMeta} from "@solana/web3.js";
import {extractActivation, type Activation, type ParsedTxLike} from "./extract.js";

/** Flattens web3.js's parsed transaction into the minimal shape the extractor reads. */
export function toParsedTxLike(signature: string, tx: ParsedTransactionWithMeta): ParsedTxLike {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const instructions = tx.transaction.message.instructions.map((ix) => {
    if ("parsed" in ix) {
      const parsed = ix.parsed as unknown;
      return {programId: ix.programId.toBase58(), ...(typeof parsed === "string" ? {parsed} : {})};
    }
    return {
      programId: ix.programId.toBase58(),
      data: ix.data,
      accounts: ix.accounts.map((a) => keys.indexOf(a.toBase58())),
    };
  });
  return {signature, slot: tx.slot, blockTime: tx.blockTime ?? null, err: tx.meta?.err ?? null, accountKeys: keys, instructions};
}

/**
 * Walks the market account's transaction history and returns every
 * activation that carried a manifest memo. RPC returns newest first; the
 * result is oldest first so generations read in order.
 */
export async function scanActivations(
  connection: Connection,
  market: PublicKey,
  programId: PublicKey,
  opts: {limit?: number; log?: (m: string) => void} = {},
): Promise<Activation[]> {
  const out: Activation[] = [];
  let before: string | undefined;
  let fetched = 0;
  const limit = opts.limit ?? 5_000;
  while (fetched < limit) {
    const sigs = await connection.getSignaturesForAddress(
      market,
      {...(before ? {before} : {}), limit: Math.min(1_000, limit - fetched)},
      "confirmed",
    );
    if (sigs.length === 0) break;
    fetched += sigs.length;
    const txs = await connection.getParsedTransactions(
      sigs.map((s) => s.signature),
      {maxSupportedTransactionVersion: 0, commitment: "confirmed"},
    );
    txs.forEach((tx, i) => {
      if (!tx) return;
      const a = extractActivation(toParsedTxLike(sigs[i]!.signature, tx), programId);
      if (a) out.push(a);
    });
    opts.log?.(`scanned ${fetched} signatures, ${out.length} activations`);
    before = sigs[sigs.length - 1]!.signature;
    if (sigs.length < 1_000) break;
  }
  return out.reverse();
}
