import { describe, expect, it } from "vitest";
import { buildClubOwnership, buildOwnership, ownershipOf, pickMultiplier } from "./ownership";
import type { ManagerRow, SquadPlayer } from "../types";

const player = (id: number, starter: boolean, extra: Partial<SquadPlayer> = {}): SquadPlayer => ({
  id, position: "MID", squadPosition: starter ? id : 11 + id, starter, state: "upcoming", minutes: 0,
  name: `P${id}`, club: "ARS", clubCode: 1, opponent: "CHE", venue: "H", points: 0, bonus: 0, cost: 5, ownership: 10,
  ...extra,
});

const manager = (id: number, squad: SquadPlayer[], chip?: ManagerRow["chip"]): ManagerRow => ({
  id, position: id, previousPosition: id, teamName: `T${id}`, managerName: `M${id}`, gameweekPoints: 0,
  provisionalBonus: 0, totalPoints: 0, overallRank: 0, rankedPoints: 0, previousOverallRank: 0, captain: "", captainPoints: 0,
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

  it("counts a club by the squad places it takes, not by its footballers", () => {
    // Two managers both holding the same two Arsenal players is four places Arsenal has
    // taken in this league — the question is exposure, and each of them is exposed twice.
    const managers = [1, 2].map((id) => manager(id, [
      player(1, true), player(2, true), player(3, true, { club: "CHE" }),
    ]));
    expect(buildClubOwnership(managers, false)).toEqual([
      { club: "ARS", owners: 2, picks: 4, captains: 0 },
      { club: "CHE", owners: 2, picks: 2, captains: 0 },
    ]);
  });

  it("counts a manager once for a club however many of its players he holds", () => {
    const managers = [
      manager(1, [player(1, true), player(2, true), player(3, true)]),
      manager(2, [player(4, true, { club: "CHE" })]),
    ];
    const [arsenal] = buildClubOwnership(managers, false);
    expect(arsenal).toMatchObject({ club: "ARS", owners: 1, picks: 3 });
  });

  it("drops a club's benched players with the starters-only switch, as a player list does", () => {
    const managers = [manager(1, [player(1, true), player(2, false), player(3, false, { club: "CHE" })])];
    expect(buildClubOwnership(managers, false, false)).toEqual([
      { club: "ARS", owners: 1, picks: 1, captains: 0 },
    ]);
  });

  it("marks a manager for a club he holds, and captains it only through that club", () => {
    const holder = manager(1, [player(1, true, { captain: true }), player(2, false)]);
    const other = manager(2, [player(3, true, { club: "CHE", captain: true })]);
    expect(ownershipOf(holder, { kind: "club", club: "ARS" }, false)).toEqual({ owns: true, captains: true, benched: false });
    expect(ownershipOf(other, { kind: "club", club: "ARS" }, false)).toEqual({ owns: false, captains: false, benched: false });
    expect(ownershipOf(holder, { kind: "player", id: 2 }, false)).toEqual({ owns: true, captains: false, benched: true });
    expect(ownershipOf(holder, null, false)).toEqual({ owns: false, captains: false, benched: false });
  });

  it("calls a club benched only when every one of its players here is", () => {
    // One on the pitch is the manager being exposed to the club, which is what the mark
    // means; the other way round a squad with ten Arsenal starters and one on the bench
    // would read as benching Arsenal.
    const mixed = manager(1, [player(1, true), player(2, false)]);
    const all = manager(2, [player(3, false), player(4, false)]);
    expect(ownershipOf(mixed, { kind: "club", club: "ARS" }, false).benched).toBe(false);
    expect(ownershipOf(all, { kind: "club", club: "ARS" }, false).benched).toBe(true);
    // And with the bench excluded he does not hold the club at all.
    expect(ownershipOf(all, { kind: "club", club: "ARS" }, false, false).owns).toBe(false);
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
