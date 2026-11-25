import {describe, expect, it} from "vitest";
import {Keypair} from "@solana/web3.js";
import {tradePreview} from "../src/server.js";

const quote = {
  assetIndex: 1,
  marketId: "2",
  askE6: "630000",
  bidE6: "610000",
  maxBuyShares: 100,
  maxSellShares: 100,
  makerOwner: Keypair.generate().publicKey.toBase58(),
  makerPortfolio: Keypair.generate().publicKey.toBase58(),
  makerPortfolioId: "7",
  makerPositionEpoch: "3",
  feeBps: "20",
};

describe("trade preview", () => {
  it("prices a YES purchase at the ask", () => {
    const p = tradePreview("YES", 25, quote, 10_000n);
    expect(p.pricePerShare).toBe("63.0%");
    expect(p.costNow).toBe("15.75");
    expect(p.fee).toBe("0.0315");
    expect(p.initialMargin).toBe("15.75");
    expect(p.paysIfRight).toBe("25");
    expect(p.maxLoss).toBe("15.749975");
    expect(p.sizeQ).toBe(25_000_000n);
    expect(p.priceE6).toBe(630_000n);
  });

  it("prices a NO purchase as a short at the bid", () => {
    const p = tradePreview("NO", 10, quote, 10_000n);
    expect(p.pricePerShare).toBe("39.0%");
    expect(p.costNow).toBe("3.9");
    expect(p.maxLoss).toBe("3.9");
    expect(p.sizeQ).toBe(-10_000_000n);
    expect(p.priceE6).toBe(610_000n);
  });
});
