import { describe, expect, it } from "vitest";
import { createPlanningDemo, demoComparisonRounds } from "../planningDemo";
import { futureTeamFixtures } from "./futureComparison";

describe("future team fixtures", () => {
  it("keeps each player's three next games with the correct venue and FDR", () => {
    const data = createPlanningDemo();
    const team = futureTeamFixtures(data, data.managers[0]);
    expect(team.rows).toHaveLength(15);
    const arsenal = team.rows.find((row) => row.player.club === "ARS")!;
    expect(arsenal.fixtures[0]).toMatchObject({ gameweek: 25, opponent: "AVL", opponentName: "Aston Villa", venue: "H", difficulty: 2 });
    const fixtures = team.rows.filter((row) => row.player.starter).flatMap((row) => row.fixtures);
    expect(team.average).toBe(fixtures.reduce((sum, fixture) => sum + fixture.difficulty, 0) / fixtures.length);
  });
  it("makes demo results and demo historical player contributions agree", () => {
    const data = createPlanningDemo();
    const rounds = demoComparisonRounds(data);
    for (const manager of data.managers) for (const round of rounds) {
      const picks = round.teams.find((team) => team.managerId === manager.id)!.picks;
      expect(picks.reduce((sum, pick) => sum + round.points[pick.element] * pick.multiplier, 0)).toBe(manager.gameweekHistory!.find((row) => row.gameweek === round.gameweek)!.points);
    }
  });
});
