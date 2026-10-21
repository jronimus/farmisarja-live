import { describe, expect, it } from "vitest";
import { demoData } from "../demoData";
import { pointsForPeriod } from "./periodScores";

describe("period scores", () => {
  const manager = { ...demoData.managers[0], gameweekPoints: 55, provisionalBonus: 3, hit: 4, totalPoints: 200,
    gameweekHistory: [{ gameweek: 1, month: "2026-08", points: 60, hit: 4 },
      { gameweek: 2, month: "2026-09", points: 50, hit: 0 }, { gameweek: 3, month: "2026-09", points: 40, hit: 4 }] };
  it("sums only the chosen month's weeks, net of transfer hits", () => {
    expect(pointsForPeriod(manager, "2026-08", 3)).toBe(56);
    expect(pointsForPeriod(manager, "2026-09", 3)).toBe(104);
    expect(pointsForPeriod(manager, "2026-10", 3)).toBe(0);
  });
  it("restores season totals and never invents history when unavailable", () => {
    expect(pointsForPeriod(manager, "total", 3)).toBe(199);
    expect(pointsForPeriod({ ...manager, gameweekHistory: undefined }, "2026-08", 3)).toBeNull();
  });
});
