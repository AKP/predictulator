/**
 * Fill validation.
 *
 * The taker builds a TradeNoCpi transaction with itself as account A and the
 * maker as account B, signs it, and posts it. Before co-signing the maker
 * checks every byte it cares about: one Percolator instruction (plus an
 * optional compute-budget instruction), the maker's own portfolio as B with
 * the current id and position epoch, the asset and generation the quote was
 * for, size within the quoted cap, and a price no worse for the maker than
 * the quote. Anything else is refused.
 */
import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import { instructions as ix, type TradeNoCpiParams } from "@predictulator/sdk";
import type { Quote } from "./quote.js";

export interface FillContext {
  programId: PublicKey;
  market: PublicKey;
  makerOwner: PublicKey;
  makerPortfolio: PublicKey;
  makerPortfolioId: bigint;
  makerPositionEpoch: bigint;
  assetIndex: number;
  marketId: bigint;
  quote: Quote;
  /** Market's trade_fee_base_bps; the signed fee must be at least this. */
  minFeeBps: bigint;
  /** Maximum fee the maker will consent to. */
  maxFeeBps: bigint;
}

export interface FillCheck {
  ok: true;
  params: TradeNoCpiParams;
  takerOwner: PublicKey;
  takerPortfolio: PublicKey;
  /** From the taker's side. */
  side: "YES" | "NO";
  shares: number;
}

export interface FillReject {
  ok: false;
  reason: string;
}

export function validateFill(tx: Transaction, ctx: FillContext): FillCheck | FillReject {
  const reject = (reason: string): FillReject => ({ ok: false, reason });

  const ours = tx.instructions.filter((i) => i.programId.equals(ctx.programId));
  const others = tx.instructions.filter((i) => !i.programId.equals(ctx.programId));
  if (ours.length !== 1) return reject(`expected exactly one Percolator instruction, found ${ours.length}`);
  if (others.some((i) => !i.programId.equals(ComputeBudgetProgram.programId))) {
    return reject("only compute-budget instructions may accompany the trade");
  }
  const trade = ours[0]!;

  let params: TradeNoCpiParams;
  try {
    params = ix.decodeTradeNoCpi(new Uint8Array(trade.data));
  } catch (e) {
    return reject(e instanceof Error ? e.message : String(e));
  }

  // accounts: [signer A, signer B, market w, portfolio A w, portfolio B w]
  if (trade.keys.length !== 5) return reject(`expected 5 accounts, found ${trade.keys.length}`);
  const [kA, kB, kMarket, kPA, kPB] = trade.keys as [typeof trade.keys[number], typeof trade.keys[number], typeof trade.keys[number], typeof trade.keys[number], typeof trade.keys[number]];
  if (!kB.pubkey.equals(ctx.makerOwner)) return reject("account B signer is not the maker");
  if (!kPB.pubkey.equals(ctx.makerPortfolio)) return reject("portfolio B is not the maker's portfolio");
  if (!kMarket.pubkey.equals(ctx.market)) return reject("wrong market");
  if (kPA.pubkey.equals(ctx.makerPortfolio)) return reject("taker may not trade against itself");
  if (!kA.isSigner || !kB.isSigner) return reject("both owners must be signers");
  if (!kMarket.isWritable || !kPA.isWritable || !kPB.isWritable) return reject("market and portfolios must be writable");

  if (params.accountBPortfolioId !== ctx.makerPortfolioId) return reject("maker portfolio id mismatch");
  if (params.accountBPositionEpoch !== ctx.makerPositionEpoch) return reject("maker position epoch is stale");
  if (params.assetIndex !== ctx.assetIndex) return reject("asset index does not match the quote");
  if (params.marketId !== ctx.marketId) return reject("asset generation does not match the quote");
  if (params.feeBps < ctx.minFeeBps) return reject("fee below the market base fee");
  if (params.feeBps > ctx.maxFeeBps) return reject("fee above what the maker consents to");
  if (params.backingFeeCapBps !== 0) return reject("backing fee cap must be zero on this market");
  if (params.sizeQ === 0n) return reject("zero size");

  const side: "YES" | "NO" = params.sizeQ > 0n ? "YES" : "NO";
  const absQ = params.sizeQ < 0n ? -params.sizeQ : params.sizeQ;
  if (absQ % 1_000_000n !== 0n) return reject("size must be whole shares");
  const shares = Number(absQ / 1_000_000n);

  if (side === "YES") {
    // Taker buys YES from the maker: price must be >= ask, size <= maxBuy.
    if (params.execPrice < ctx.quote.askE6) return reject(`price ${params.execPrice} below ask ${ctx.quote.askE6}`);
    if (shares > ctx.quote.maxBuyShares) return reject(`size ${shares} above quoted ${ctx.quote.maxBuyShares}`);
  } else {
    // Taker sells YES (goes NO): price must be <= bid, size <= maxSell.
    if (params.execPrice > ctx.quote.bidE6) return reject(`price ${params.execPrice} above bid ${ctx.quote.bidE6}`);
    if (shares > ctx.quote.maxSellShares) return reject(`size ${shares} above quoted ${ctx.quote.maxSellShares}`);
  }

  // The maker signs but never pays fees: the taker must be the fee payer.
  if (!tx.feePayer || tx.feePayer.equals(ctx.makerOwner)) return reject("fee payer must be the taker");

  return { ok: true, params, takerOwner: kA.pubkey, takerPortfolio: kPA.pubkey, side, shares };
}
