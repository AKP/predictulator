import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { instructions as ix } from "@predictulator/sdk";
import { validateFill, type FillContext } from "../src/fill.js";

const programId = Keypair.generate().publicKey;
const market = Keypair.generate().publicKey;
const taker = Keypair.generate();
const takerPortfolio = Keypair.generate().publicKey;
const maker = Keypair.generate();
const makerPortfolio = Keypair.generate().publicKey;

const ctx: FillContext = {
  programId,
  market,
  makerOwner: maker.publicKey,
  makerPortfolio,
  makerPortfolioId: 7n,
  makerPositionEpoch: 3n,
  assetIndex: 2,
  marketId: 5n,
  quote: { askE6: 620_000n, bidE6: 580_000n, maxBuyShares: 10, maxSellShares: 10, fairE6: 600_000n, skewE6: 0n },
  minFeeBps: 10n,
  maxFeeBps: 10n,
};

function trade(over: Partial<Parameters<typeof ix.encodeTradeNoCpi>[0]> = {}, accounts: Partial<Parameters<typeof ix.tradeNoCpi>[0]> = {}): Transaction {
  const i = ix.tradeNoCpi(
    { signerA: taker.publicKey, signerB: maker.publicKey, market, portfolioA: takerPortfolio, portfolioB: makerPortfolio, ...accounts },
    {
      accountAPortfolioId: 1n, accountAPositionEpoch: 0n, accountBPortfolioId: 7n, accountBPositionEpoch: 3n,
      assetIndex: 2, marketId: 5n, sizeQ: 4_000_000n, execPrice: 620_000n, feeBps: 10n, backingFeeCapBps: 0, ...over,
    },
    { programId },
  );
  const tx = new Transaction().add(i);
  tx.feePayer = taker.publicKey;
  tx.recentBlockhash = "11111111111111111111111111111111";
  return tx;
}

describe("fill validation", () => {
  it("accepts a YES buy at or above the ask within size", () => {
    const r = validateFill(trade(), ctx);
    expect(r).toMatchObject({ ok: true, side: "YES", shares: 4 });
    expect(validateFill(trade({ execPrice: 650_000n }), ctx).ok).toBe(true);
  });

  it("accepts a NO (sell YES) at or below the bid", () => {
    const r = validateFill(trade({ sizeQ: -3_000_000n, execPrice: 570_000n }), ctx);
    expect(r).toMatchObject({ ok: true, side: "NO", shares: 3 });
  });

  it("rejects prices worse than the quote for the maker", () => {
    expect(validateFill(trade({ execPrice: 619_999n }), ctx)).toMatchObject({ ok: false, reason: /below ask/ });
    expect(validateFill(trade({ sizeQ: -1_000_000n, execPrice: 580_001n }), ctx)).toMatchObject({ ok: false, reason: /above bid/ });
  });

  it("rejects oversize, fractional, and zero fills", () => {
    expect(validateFill(trade({ sizeQ: 11_000_000n }), ctx)).toMatchObject({ ok: false, reason: /above quoted/ });
    expect(validateFill(trade({ sizeQ: 1_500_000n }), ctx)).toMatchObject({ ok: false, reason: /whole shares/ });
    expect(validateFill(trade({ sizeQ: 0n }), ctx)).toMatchObject({ ok: false, reason: /zero size/ });
  });

  it("rejects stale maker epoch, wrong asset, wrong generation, and bad fees", () => {
    expect(validateFill(trade({ accountBPositionEpoch: 2n }), ctx)).toMatchObject({ ok: false, reason: /epoch/ });
    expect(validateFill(trade({ accountBPortfolioId: 8n }), ctx)).toMatchObject({ ok: false, reason: /portfolio id/ });
    expect(validateFill(trade({ assetIndex: 3 }), ctx)).toMatchObject({ ok: false, reason: /asset index/ });
    expect(validateFill(trade({ marketId: 6n }), ctx)).toMatchObject({ ok: false, reason: /generation/ });
    expect(validateFill(trade({ feeBps: 9n }), ctx)).toMatchObject({ ok: false, reason: /below the market/ });
    expect(validateFill(trade({ feeBps: 11n }), ctx)).toMatchObject({ ok: false, reason: /above what/ });
    expect(validateFill(trade({ backingFeeCapBps: 5 }), ctx)).toMatchObject({ ok: false, reason: /backing fee/ });
  });

  it("rejects account substitution and self-trades", () => {
    const other = Keypair.generate().publicKey;
    expect(validateFill(trade({}, { portfolioB: other }), ctx)).toMatchObject({ ok: false, reason: /portfolio B/ });
    expect(validateFill(trade({}, { signerB: other }), ctx)).toMatchObject({ ok: false, reason: /signer is not the maker/ });
    expect(validateFill(trade({}, { market: other }), ctx)).toMatchObject({ ok: false, reason: /wrong market/ });
    expect(validateFill(trade({}, { portfolioA: makerPortfolio }), ctx)).toMatchObject({ ok: false, reason: /itself/ });
  });

  it("allows a compute budget instruction but nothing else", () => {
    const ok = trade();
    ok.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
    expect(validateFill(ok, ctx).ok).toBe(true);
    const bad = trade();
    bad.add(SystemProgram.transfer({ fromPubkey: maker.publicKey, toPubkey: taker.publicKey, lamports: 1 }));
    expect(validateFill(bad, ctx)).toMatchObject({ ok: false, reason: /compute-budget/ });
    const two = trade();
    two.add(trade().instructions[0]!);
    expect(validateFill(two, ctx)).toMatchObject({ ok: false, reason: /exactly one/ });
  });

  it("refuses to be the fee payer", () => {
    const t = trade();
    t.feePayer = maker.publicKey;
    expect(validateFill(t, ctx)).toMatchObject({ ok: false, reason: /fee payer/ });
  });
});
