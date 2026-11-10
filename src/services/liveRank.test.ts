import { describe, expect, it } from "vitest";
import { estimateRank, type RankCurve } from "./liveRank";

// A field of a million, sampled as four equal quarters scoring 90, 70, 50 and 30.
const curve: RankCurve = {
  gameweek: 2,
  ranked: 1_000_000,
  weight: 400,
  above: [[90, 0], [70, 100], [50, 200], [30, 300]],
  scoredAt: "2026-08-29T15:00:00Z",
  coverage: 1,
  settled: false,
};

describe("live overall rank", () => {
  it("counts who stands above a total, because that is what a rank is", () => {
    expect(estimateRank(90, curve)).toBe(1);
    expect(estimateRank(70, curve)).toBe(250_001);
    expect(estimateRank(50, curve)).toBe(500_001);
    expect(estimateRank(30, curve)).toBe(750_001);
  });

  it("does not interpolate between two sampled totals, because nobody is there", () => {
    // 89 down to 71 all have the same quarter of the field above them and nobody else, so
    // they share a rank — which is exactly how FPL ranks: every manager on 87 points holds
    // rank 21 754.
    expect(estimateRank(89, curve)).toBe(estimateRank(71, curve));
    expect(estimateRank(89, curve)).toBe(250_001);
  });

  it("puts a total above the whole sample first and one below it last", () => {
    expect(estimateRank(200, curve)).toBe(1);
    expect(estimateRank(0, curve)).toBe(1_000_000);
  });

  it("has nothing to say without a curve", () => {
    expect(estimateRank(60, null)).toBeNull();
    expect(estimateRank(60, { ...curve, above: [] })).toBeNull();
    expect(estimateRank(60, { ...curve, weight: 0 })).toBeNull();
  });
});
