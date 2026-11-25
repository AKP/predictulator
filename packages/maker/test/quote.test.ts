import { describe, expect, it } from "vitest";
import { inventoryShares, quote } from "../src/quote.js";

describe("quote model", () => {
  const base = { fairE6: 600_000n, halfSpreadE6: 20_000n, inventoryShares: 0, inventoryCapShares: 100, maxSkewE6: 50_000n, maxFillShares: 25 };

  it("brackets fair with the half spread at zero inventory", () => {
    const q = quote(base);
    expect(q.bidE6).toBe(580_000n);
    expect(q.askE6).toBe(620_000n);
    expect(q.maxBuyShares).toBe(25);
    expect(q.maxSellShares).toBe(25);
    expect(q.skewE6).toBe(0n);
  });

  it("skews against inventory and shrinks the side that would add to it", () => {
    const long = quote({ ...base, inventoryShares: 50 });
    expect(long.skewE6).toBe(-25_000n);
    expect(long.askE6).toBe(595_000n);
    expect(long.bidE6).toBe(555_000n);
    expect(long.maxSellShares).toBe(25); // taker selling YES pushes us longer: room = 50
    const nearCap = quote({ ...base, inventoryShares: 90 });
    expect(nearCap.maxSellShares).toBe(10);
    expect(nearCap.maxBuyShares).toBe(25);
    const short = quote({ ...base, inventoryShares: -100 });
    expect(short.skewE6).toBe(50_000n);
    expect(short.maxBuyShares).toBe(0);
  });

  it("never quotes at the outcome bounds", () => {
    const hi = quote({ ...base, fairE6: 999_000n });
    expect(hi.askE6).toBe(990_000n);
    expect(hi.bidE6).toBe(970_000n);
    const lo = quote({ ...base, fairE6: 3_000n });
    expect(lo.bidE6).toBe(10_000n);
  });

  it("inventory sums only the matching asset generation", () => {
    const legs = [
      { active: true, assetIndex: 1, marketId: 2n, side: 0, basisPosQ: 5_000_000n },
      { active: true, assetIndex: 1, marketId: 2n, side: 1, basisPosQ: -2_000_000n },
      { active: true, assetIndex: 1, marketId: 9n, side: 0, basisPosQ: 100_000_000n },
      { active: false, assetIndex: 1, marketId: 2n, side: 0, basisPosQ: 100_000_000n },
    ];
    expect(inventoryShares(legs, 1, 2n)).toBe(3);
  });
});
