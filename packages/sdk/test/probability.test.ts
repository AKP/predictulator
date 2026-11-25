import { describe, expect, it } from "vitest";
import {
  MARK_NO,
  MARK_YES,
  formatAtoms,
  marginAtoms,
  notionalAtoms,
  pnlAtMark,
  probToMark,
  markToProb,
  sharesToQ,
  signedSizeQ,
  worstCaseLossAtoms,
} from "@predictulator/sdk";

describe("probability <-> mark", () => {
  it("maps the unit interval onto [1, 1e6] without ever producing zero", () => {
    expect(probToMark(0)).toBe(1n);
    expect(probToMark(1)).toBe(1_000_000n);
    expect(probToMark(0.6234)).toBe(623_400n);
    expect(probToMark(-5)).toBe(1n);
    expect(probToMark(7)).toBe(1_000_000n);
    expect(markToProb(250_000n)).toBeCloseTo(0.25, 9);
  });

  it("one share at p costs p atoms and is worth 1.000000 if YES", () => {
    const q = sharesToQ(1);
    expect(q).toBe(1_000_000n);
    expect(notionalAtoms(q, 400_000n)).toBe(400_000n);
    expect(pnlAtMark("YES", q, 400_000n, MARK_YES)).toBe(600_000n);
    expect(pnlAtMark("YES", q, 400_000n, MARK_NO)).toBe(-399_999n);
    expect(pnlAtMark("NO", q, 400_000n, MARK_NO)).toBe(399_999n);
    expect(pnlAtMark("NO", q, 400_000n, MARK_YES)).toBe(-600_000n);
  });

  it("worst case loss is bounded by the outcome range", () => {
    const q = sharesToQ(10);
    expect(worstCaseLossAtoms("YES", q, 300_000n)).toBe(2_999_990n);
    expect(worstCaseLossAtoms("NO", q, 300_000n)).toBe(7_000_000n);
  });

  it("signed size follows YES = long, NO = short", () => {
    expect(signedSizeQ("YES", 2)).toBe(2_000_000n);
    expect(signedSizeQ("NO", 2)).toBe(-2_000_000n);
  });

  it("margin rounds up", () => {
    expect(marginAtoms(1_000_001n, 10_000n)).toBe(1_000_001n);
    expect(marginAtoms(1_000_001n, 5_000n)).toBe(500_001n);
  });

  it("formats 6-decimal atoms", () => {
    expect(formatAtoms(1_500_000n)).toBe("1.5");
    expect(formatAtoms(-250n)).toBe("-0.00025");
    expect(formatAtoms(0n)).toBe("0");
  });
});
