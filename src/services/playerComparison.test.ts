import { describe, expect, it } from "vitest";
import { COMPARISON_METRICS, comparisonPlayers, comparisonTones } from "./playerComparison";
import type { ComparisonPlayer } from "./playerComparison";
import type { DashboardData, PlayerStat } from "../types";
import { demoData } from "../demoData";

const player: ComparisonPlayer = { id: 1, name: "Test", club: "ARS", position: "MID", cost: 5 };
const stat = { totalPoints: 45, minutes: 180, goals: 2, pointsPerGame: 15 } as PlayerStat;
describe("season player comparison", () => {
  it("ranks larger point totals and smaller penalties in the right direction", () => {
    expect(comparisonTones([40, 80, 60], "higher")).toEqual(["worst", "best", "middle"]);
    expect(comparisonTones([3, 1, 2], "lower")).toEqual(["worst", "best", "middle"]);
    for (const key of ["yellowCards", "redCards", "goalsConceded", "expectedGoalsConceded", "ownGoals", "penaltiesMissed"]) {
      expect(COMPARISON_METRICS.find((m) => m.key === key)?.direction).toBe("lower");
    }
  });
  it("keeps ties neutral, highlights tied leaders and never treats missing data as zero", () => {
    expect(comparisonTones([0, 0, 0], "lower")).toEqual(["equal", "equal", "equal"]);
    expect(comparisonTones([8, 8, 5], "higher")).toEqual(["best", "best", "worst"]);
    expect(comparisonTones([null, NaN, 0], "higher")).toEqual(["missing", "missing", "equal"]);
    expect(comparisonTones([1.234, 1.232], "higher", 2)).toEqual(["equal", "equal"]);
  });
  it("computes season value and per90 rates without captain multipliers", () => {
    expect(COMPARISON_METRICS.find((m) => m.key === "value")!.value(stat, player)).toBe(9);
    expect(COMPARISON_METRICS.find((m) => m.key === "goals90")!.value(stat, player)).toBe(1);
    expect(COMPARISON_METRICS.find((m) => m.key === "totalPoints90")!.value(stat, player)).toBe(22.5);
    expect(COMPARISON_METRICS.find((m) => m.key === "goals90")!.value({ ...stat, minutes: 0 }, player)).toBeNull();
    expect(COMPARISON_METRICS.find((m) => m.key === "totalPoints")!.value(undefined, player)).toBeNull();
  });
  it("includes unowned players and deduplicates players appearing in multiple squads", () => {
    const base = demoData.managers[0].squad[0];
    const data: DashboardData = { ...demoData, players: [{ ...base, id: 999999, name: "Unowned", photoCode: 123 }] };
    const catalogue = comparisonPlayers(data);
    expect(catalogue.find((p) => p.id === 999999)).toMatchObject({ name: "Unowned", photoCode: 123 });
    expect(new Set(catalogue.map((p) => p.id)).size).toBe(catalogue.length);
    expect(COMPARISON_METRICS.some((m) => m.key === "eventPoints" || m.key === "form")).toBe(false);
  });
});
