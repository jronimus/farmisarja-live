import { describe, expect, it } from "vitest";
import type { DashboardData, ManagerRow, SquadPlayer } from "../types";
import { buildAwards } from "./awards";

const player = (
  id: number,
  position: SquadPlayer["position"],
  squadPosition: number,
  starter: boolean,
  points = 0,
  minutes = 90,
): SquadPlayer => ({
  id,
  position,
  squadPosition,
  starter,
  points,
  minutes,
  bonus: 0,
  state: "finished",
  name: String(id),
  club: "ARS",
  clubCode: 1,
  opponent: "CHE",
  venue: "H",
  cost: 5,
  ownership: 10,
});

const manager = (id: number, teamName: string, squad: SquadPlayer[]): ManagerRow => ({
  id,
  teamName,
  managerName: teamName,
  squad,
  position: id,
  previousPosition: id,
  gameweekPoints: 50,
  provisionalBonus: 0,
  totalPoints: 100,
  overallRank: 1,
  rankedPoints: 100,
  previousOverallRank: 1,
  captain: "",
  captainPoints: 0,
  transfers: [],
  hit: 0,
  availableChips: [],
  usedChips: [],
  seasonTransfers: 0,
  seasonHitPoints: 0,
  benchPointsBeforeGw: 0,
  teamValue: 100,
  previousTeamValue: 100,
  finished: 15,
  live: 0,
  upcoming: 0,
  form: [],
  formGameweeks: [],
  formRankMovement: [],
});

function squad(benchPoints: [number, number, number, number], missingStarter = false): SquadPlayer[] {
  return [
    player(1, "GK", 1, true),
    player(2, "DEF", 2, true), player(3, "DEF", 3, true), player(4, "DEF", 4, true),
    player(5, "MID", 5, true), player(6, "MID", 6, true), player(7, "MID", 7, true), player(8, "MID", 8, true),
    player(9, "FWD", 9, true), player(10, "FWD", 10, true),
    player(11, "FWD", 11, true, 0, missingStarter ? 0 : 90),
    player(12, "GK", 12, false, benchPoints[0]),
    player(13, "MID", 13, false, benchPoints[1]),
    player(14, "DEF", 14, false, benchPoints[2]),
    player(15, "FWD", 15, false, benchPoints[3]),
  ];
}

describe("awards", () => {
  it("does not count an autosubbed player as points left on the bench", () => {
    const tiksi = manager(1, "Tiksi United FC", squad([6, 14, 6, 1], true));
    const other = manager(2, "Other FC", squad([2, 10, 0, 0]));
    const awards = buildAwards({ managers: [tiksi, other] } as DashboardData);

    const bench = awards.find((award) => award.id === "bench");
    expect(bench).toMatchObject({ team: "Tiksi United FC", value: "13" });
  });
});
