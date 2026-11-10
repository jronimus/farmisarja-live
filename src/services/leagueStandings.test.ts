import { describe, expect, it } from "vitest";
import { liveLeagueStandings } from "./leagueStandings";
import { demoData } from "../demoData";
const manager = demoData.managers[0];
describe("live league standings", () => {
  it("moves an overtaking manager on net totals and applies bonus and hits once", () => {
    const rows = [
      { ...manager, id: 1, position: 1, totalPoints: 100, provisionalBonus: 0, hit: 0 },
      { ...manager, id: 2, position: 2, totalPoints: 99, provisionalBonus: 3, hit: 4 },
      { ...manager, id: 3, position: 3, totalPoints: 103, provisionalBonus: 0, hit: 0 },
    ];
    expect(liveLeagueStandings(rows).map((r) => [r.id, r.position])).toEqual([[1, 2], [2, 3], [3, 1]]);
    expect(rows[0].position).toBe(1);
  });
  it("preserves FPL tie ordering and shared positions when total points are equal", () => {
    const rows = [
      { ...manager, id: 1, position: 2, totalPoints: 100, provisionalBonus: 0, hit: 0 },
      { ...manager, id: 2, position: 1, totalPoints: 100, provisionalBonus: 0, hit: 0 },
      { ...manager, id: 3, position: 1, totalPoints: 100, provisionalBonus: 0, hit: 0 },
    ];
    expect(liveLeagueStandings(rows).map((r) => [r.id, r.position])).toEqual([[1, 3], [2, 1], [3, 1]]);
  });
});
