import { describe, expect, it } from "vitest";
import { demoData } from "../demoData";
import { compareHistoricalPlayers, compareTeamPeriod } from "./teamComparison";
describe("team period comparison", () => {
  it("includes transfer deductions and compares only common gameweeks", () => {
    const left = { ...demoData.managers[0], gameweekHistory: [{ gameweek: 1, month: "2026-08", points: 60, hit: 4 }, { gameweek: 2, month: "2026-08", points: 70, hit: 0 }, { gameweek: 3, month: "2026-08", points: 80, hit: 0 }] };
    const right = { ...demoData.managers[1], gameweekHistory: [{ gameweek: 1, month: "2026-08", points: 64, hit: 0 }, { gameweek: 2, month: "2026-08", points: 60, hit: 4 }] };
    const result = compareTeamPeriod(left, right, 1, 3);
    expect(result.left).toMatchObject({ points: 126, hits: 4, average: 63, wins: 1 });
    expect(result.right).toMatchObject({ points: 120, hits: 4, wins: 1 });
    expect(result.missing).toBe(1);
    expect(result.rounds.map((row) => row.gap)).toEqual([-8, 14]);
  });
  it("counts old squads, shared players and changed captains in the player differences", () => {
    const rows = compareHistoricalPlayers([
      { gameweek: 1, points: { 10: 8, 20: 5 }, teams: [{ managerId: 1, picks: [{ element: 10, multiplier: 2 }] }, { managerId: 2, picks: [{ element: 10, multiplier: 1 }, { element: 20, multiplier: 1 }] }] },
      { gameweek: 2, points: { 10: 7, 20: 9 }, teams: [{ managerId: 1, picks: [{ element: 20, multiplier: 3 }] }, { managerId: 2, picks: [{ element: 10, multiplier: 1 }, { element: 20, multiplier: 0 }] }] },
    ], 1, 2);
    expect(rows.find((row) => row.id === 10)).toMatchObject({ left: 16, right: 15, gap: 1 });
    expect(rows.find((row) => row.id === 20)).toMatchObject({ left: 27, right: 5, gap: 22 });
  });
});
