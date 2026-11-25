import { PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID } from "./constants.js";

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/** Associated token account for `owner` and `mint`. Works for PDAs (off-curve owners). */
export function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** The collateral vault this repo's tooling uses: the vault authority's associated token account. */
export function deriveVaultTokenAccount(
  market: PublicKey,
  mint: PublicKey,
  programId: PublicKey = DEFAULT_PROGRAM_ID,
): PublicKey {
  return deriveAssociatedTokenAddress(deriveVaultAuthority(market, programId)[0], mint);
}

const VAULT_SEED = new TextEncoder().encode("vault");
const MATCHER_SEED = new TextEncoder().encode("matcher");

/** `["vault", market_group_pubkey]` — owner of the collateral token account. */
export function deriveVaultAuthority(
  market: PublicKey,
  programId: PublicKey = DEFAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, market.toBytes()], programId);
}

/**
 * `["matcher", market, lp_portfolio, lp_owner, matcher_program, matcher_context]`.
 * Only needed for the TradeCpi path (not used by the v1 RFQ maker).
 */
export function deriveMatcherDelegate(
  market: PublicKey,
  lpPortfolio: PublicKey,
  lpOwner: PublicKey,
  matcherProgram: PublicKey,
  matcherContext: PublicKey,
  programId: PublicKey = DEFAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      MATCHER_SEED,
      market.toBytes(),
      lpPortfolio.toBytes(),
      lpOwner.toBytes(),
      matcherProgram.toBytes(),
      matcherContext.toBytes(),
    ],
    programId,
  );
}
