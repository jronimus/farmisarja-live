import { describe, expect, it } from "vitest";
import { buildOwnership, pickMultiplier } from "./ownership";
import type { ManagerRow, SquadPlayer } from "../types";

const player = (id: number, starter: boolean, extra: Partial<SquadPlayer> = {}): SquadPlayer => ({
  id, position: "MID", squadPosition: starter ? id : 11 + id, starter, state: "upcoming", minutes: 0,
  name: `P${id}`, club: "ARS", clubCode: 1, opponent: "CHE", venue: "H", points: 0, bonus: 0, cost: 5, ownership: 10,
  ...extra,
});

const manager = (id: number, squad: SquadPlayer[], chip?: ManagerRow["chip"]): ManagerRow => ({
  id, position: id, previousPosition: id, teamName: `T${id}`, managerName: `M${id}`, gameweekPoints: 0,
  provisionalBonus: 0, totalPoints: 0, overallRank: 0, previousOverallRank: 0, captain: "", captainPoints: 0,
  transfers: [], hit: 0, chip, availableChips: [], usedChips: [], seasonTransfers: 0, seasonHitPoints: 0,
  benchPointsBeforeGw: 0, teamValue: 100, previousTeamValue: 100, finished: 0, live: 0, upcoming: 0,
  form: [], formGameweeks: [], formRankMovement: [], squad,
});

describe("ownership", () => {
  it("counts the armband twice, and three times under the triple captain", () => {
    expect(pickMultiplier(player(1, true), undefined)).toBe(1);
    expect(pickMultiplier(player(1, true, { captain: true }), undefined)).toBe(2);
    expect(pickMultiplier(player(1, true, { captain: true }), "TC")).toBe(3);
    expect(pickMultiplier(player(1, false), undefined)).toBe(0);
    expect(pickMultiplier(player(1, false), "BB")).toBe(1);
  });

  it("reports a league that all captain the same player as 100% owned and 200% effective", () => {
    const managers = [1, 2, 3].map((id) => manager(id, [player(7, true, { captain: true })]));
    const [entry] = buildOwnership(managers, false);
    expect(entry.owners).toBe(3);
    expect(entry.captains).toBe(3);
    expect(entry.ownedPercent).toBe(100);
    expect(entry.effectivePercent).toBe(200);
  });

  it("separates owning a player from fielding him", () => {
    const managers = [
      manager(1, [player(7, true, { captain: true })]),
      manager(2, [player(7, false)]),
    ];
    const [entry] = buildOwnership(managers, false);
    expect(entry.owners).toBe(2);
    expect(entry.benched).toBe(1);
    expect(entry.ownedPercent).toBe(100);
    // One captain at 2 and one bench at 0, over two managers.
    expect(entry.effectivePercent).toBe(100);
  });

  it("orders by effective ownership, not by how many squads hold the player", () => {
    const managers = [
      manager(1, [player(7, true, { captain: true }), player(8, true)]),
      manager(2, [player(8, true)]),
    ];
    expect(buildOwnership(managers, false).map((entry) => entry.id)).toEqual([8, 7]);
    const captained = [
      manager(1, [player(7, true, { captain: true })], "TC"),
      manager(2, [player(8, true)]),
    ];
    expect(buildOwnership(captained, false).map((entry) => entry.id)).toEqual([7, 8]);
  });
});
