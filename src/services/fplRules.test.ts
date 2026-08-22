import { describe, expect, it } from "vitest";
import { nextGameweekFreeTransfers, provisionalAutosubSquad, usedChipsForHalf } from "./fplRules";
import type { SquadPlayer } from "../types";

const player = (id: number, position: SquadPlayer["position"], squadPosition: number, starter: boolean, state: SquadPlayer["state"] = "upcoming", minutes = 0): SquadPlayer => ({
  id, position, squadPosition, starter, state, minutes, name: String(id), club: "ARS", clubCode: 1, opponent: "CHE", venue: "H", points: 0, bonus: 0, cost: 5, ownership: 10,
});

describe("FPL rules", () => {
  it("resets chip usage at GW20", () => {
    const chips = [{ name: "wildcard", event: 5 }, { name: "3xc", event: 21 }];
    expect(usedChipsForHalf(chips, 19)).toEqual(["WC"]);
    expect(usedChipsForHalf(chips, 20)).toEqual([]);
    expect(usedChipsForHalf(chips, 21)).toEqual(["TC"]);
  });

  it("banks at most five transfers and preserves the bank through a wildcard", () => {
    expect(nextGameweekFreeTransfers([], [], 1)).toBe(1);
    expect(nextGameweekFreeTransfers([{ event: 2, event_transfers: 0 }, { event: 3, event_transfers: 0 }, { event: 4, event_transfers: 0 }, { event: 5, event_transfers: 0 }, { event: 6, event_transfers: 0 }], [], 6)).toBe(5);
    expect(nextGameweekFreeTransfers([{ event: 2, event_transfers: 0 }, { event: 3, event_transfers: 9 }], [{ name: "wildcard", event: 3 }], 3)).toBe(2);
  });

  it("uses the first legal bench player and restores the original when the starter appears", () => {
    const squad = [
      player(1, "GK", 1, true), player(2, "DEF", 2, true, "live"), player(3, "DEF", 3, true), player(4, "DEF", 4, true),
      player(5, "DEF", 5, true), player(6, "MID", 6, true), player(7, "MID", 7, true), player(8, "MID", 8, true),
      player(9, "MID", 9, true), player(10, "FWD", 10, true), player(11, "FWD", 11, true),
      player(12, "GK", 12, false), player(13, "MID", 13, false), player(14, "DEF", 14, false), player(15, "FWD", 15, false),
    ];
    expect(provisionalAutosubSquad(squad, true).find((item) => item.id === 13)?.starter).toBe(true);
    squad[1].minutes = 1;
    const restored = provisionalAutosubSquad(squad, true);
    expect(restored.find((item) => item.id === 2)?.starter).toBe(true);
    expect(restored.find((item) => item.id === 13)?.starter).toBe(false);
  });

  it("allows a legal 5-2-3 formation", () => {
    const squad = [
      player(1, "GK", 1, true), player(2, "DEF", 2, true), player(3, "DEF", 3, true), player(4, "DEF", 4, true), player(5, "DEF", 5, true),
      player(6, "MID", 6, true, "live"), player(7, "MID", 7, true), player(8, "MID", 8, true), player(9, "FWD", 9, true), player(10, "FWD", 10, true), player(11, "FWD", 11, true),
      player(12, "GK", 12, false), player(13, "DEF", 13, false), player(14, "MID", 14, false), player(15, "FWD", 15, false),
    ];
    const result = provisionalAutosubSquad(squad, true);
    expect(result.find((item) => item.id === 13)?.starter).toBe(true);
    expect(result.filter((item) => item.starter && item.position === "MID")).toHaveLength(2);
  });
});
