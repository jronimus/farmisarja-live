import { describe, expect, it } from "vitest";
import { HANDOVER_HOURS, gameweekConfirmedAt, gameweekHandsOverAt, nextGameweekFreeTransfers, provisionalAutosubSquad, sellingPrice, sellingPriceMoves, usedChipsForHalf } from "./fplRules";
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

describe("handing the header over to the next gameweek", () => {
  it("puts the confirmation at 09:00 UK the morning after the last match", () => {
    // GW1's last kick-off was 20:00 London on Monday 24 Aug 2026, and the fixtures
    // actually flipped to confirmed at 09:13 the next morning. The model says 09:00.
    expect(new Date(gameweekConfirmedAt("2026-08-24T19:00:00Z")).toISOString())
      .toBe("2026-08-25T08:00:00.000Z");

    // A Sunday tea-time kick-off is confirmed on the Monday, not on the Sunday it started.
    expect(new Date(gameweekConfirmedAt("2026-08-23T15:30:00Z")).toISOString())
      .toBe("2026-08-24T08:00:00.000Z");

    // Winter: London is on GMT, so 09:00 there is 09:00 UTC. A table of clock changes was
    // not written for this — the hour is read back out of the zone.
    expect(new Date(gameweekConfirmedAt("2026-12-14T20:00:00Z")).toISOString())
      .toBe("2026-12-15T09:00:00.000Z");
  });

  it("waits half a day after that, so the confirmed state is seen at all", () => {
    const kickoff = "2026-08-24T19:00:00Z";
    expect(gameweekHandsOverAt(kickoff) - gameweekConfirmedAt(kickoff)).toBe(HANDOVER_HOURS * 3_600_000);
    // 21:00 London on the day of the confirmation, which is 23:00 in Finland.
    expect(new Date(gameweekHandsOverAt(kickoff)).toISOString()).toBe("2026-08-25T20:00:00.000Z");
  });
});

describe("selling price", () => {
  it("shares a rise and does not share a fall", () => {
    // Half the profit, rounded down: 0.3 up is 0.1 banked, 0.4 up is 0.2.
    expect(sellingPrice(50, 53)).toBe(51);
    expect(sellingPrice(50, 54)).toBe(52);
    // At or under what you paid, the price is the price.
    expect(sellingPrice(50, 50)).toBe(50);
    expect(sellingPrice(50, 47)).toBe(47);
  });

  it("knows a rise only pays every second time", () => {
    // Nothing banked yet at 0.1 up, so the second rise is the one that pays.
    expect(sellingPriceMoves(50, 50, "rise")).toBe(false);
    expect(sellingPriceMoves(50, 51, "rise")).toBe(true);
    expect(sellingPriceMoves(50, 52, "rise")).toBe(false);
    // Below what you paid there is no profit to halve: every rise comes straight back.
    expect(sellingPriceMoves(50, 48, "rise")).toBe(true);
  });

  it("knows a fall out of unbanked profit costs nothing", () => {
    // 0.5 up and 0.4 up both bank 0.2, so this fall does not reach the selling price.
    expect(sellingPriceMoves(50, 55, "fall")).toBe(false);
    expect(sellingPriceMoves(50, 54, "fall")).toBe(true);
    // At or below what you paid, every fall is the squad's own.
    expect(sellingPriceMoves(50, 50, "fall")).toBe(true);
    expect(sellingPriceMoves(50, 48, "fall")).toBe(true);
  });
});
