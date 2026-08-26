import { describe, expect, it } from "vitest";
import { allChanges, changesBetween, inChangeWindow, nextCheck, SEEDED_CHANGES } from "./priceHistory";

const team = { id: 1, short_name: "ARS", name: "Arsenal" };

const element = (over: Partial<{ id: number; now_cost: number; cost_change_start: number }> = {}) => ({
  id: 1, web_name: "Saka", team: 1, element_type: 3,
  now_cost: 100, cost_change_start: 0, selected_by_percent: "42.5", ...over,
});

const bootstrap = (elements: ReturnType<typeof element>[]) => ({ elements, teams: [team] });

describe("price change log", () => {
  it("reports the move, and reports it once", () => {
    const [change] = changesBetween({ 1: 100 }, bootstrap([element({ now_cost: 101, cost_change_start: 1 })]), "2026-08-26T01:02:00Z");
    expect(change).toMatchObject({ player: "Saka", club: "ARS", position: "MID", from: 10, to: 10.1, seasonChange: 0.1 });
    // The id is the night and the new price, so the same change seen twice is one line.
    expect(change.id).toBe("1:2026-08-26:101");
    expect(changesBetween({ 1: 101 }, bootstrap([element({ now_cost: 101 })]), "2026-08-26T01:02:00Z")).toEqual([]);
  });

  it("says nothing about a player it has never priced", () => {
    // A mid-season addition has no before, and a price the log never saw did not move.
    expect(changesBetween({}, bootstrap([element()]), "2026-08-26T01:02:00Z")).toEqual([]);
  });

  it("reports a fall as readily as a rise", () => {
    const [change] = changesBetween({ 1: 100 }, bootstrap([element({ now_cost: 99, cost_change_start: -1 })]), "2026-08-26T01:02:00Z");
    expect(change).toMatchObject({ from: 10, to: 9.9, seasonChange: -0.1 });
  });

  it("watches for a few hours after a deadline and not before one", () => {
    // FPL's own deadline is 23:00Z and the prices land an hour or two later, so the window
    // has to outlast the gap rather than the deadline.
    const deadline = "2026-08-25T23:00:00Z";
    expect(inChangeWindow([deadline], Date.parse("2026-08-25T22:59:00Z"))).toBe(false);
    expect(inChangeWindow([deadline], Date.parse("2026-08-26T01:30:00Z"))).toBe(true);
    expect(inChangeWindow([deadline], Date.parse("2026-08-26T04:30:00Z"))).toBe(false);
    // FPL drops a spent deadline from the list, and an empty list is not a window.
    expect(inChangeWindow([], Date.parse("2026-08-26T01:30:00Z"))).toBe(false);
  });

  it("holds the gate still through a window, so a quiet night costs no writes", () => {
    const deadlines = ["2026-08-25T23:00:00Z", "2026-08-26T23:00:00Z"];
    const first = nextCheck(deadlines, Date.parse("2026-08-26T00:05:00Z"));
    const later = nextCheck(deadlines, Date.parse("2026-08-26T02:40:00Z"));
    expect(first).toBe(later);
    expect(Date.parse(first)).toBeLessThan(Date.parse("2026-08-26T00:05:00Z"));
  });

  it("carries the night that happened before the log did, and never twice", () => {
    expect(allChanges(null).map((entry) => entry.player))
      .toEqual(["M.Sangaré", "De Cuyper", "Gyökeres", "Martinelli"]);
    // A watched line of its own wins: the seed is a stand-in, not a second record.
    const watched = { snapshot: {}, changes: [{ ...SEEDED_CHANGES[0], ownership: 7.1 }] };
    const merged = allChanges(watched);
    expect(merged).toHaveLength(SEEDED_CHANGES.length);
    expect(merged.find((entry) => entry.player === "M.Sangaré")?.ownership).toBe(7.1);
  });

  it("waits for the next published deadline once the window has closed", () => {
    const deadlines = ["2026-08-26T01:00:00Z", "2026-08-27T01:00:00Z"];
    expect(nextCheck(deadlines, Date.parse("2026-08-26T09:00:00Z"))).toBe("2026-08-27T01:00:00.000Z");
    // Nothing published to wait for: look again in an hour rather than never.
    expect(nextCheck([], Date.parse("2026-08-26T09:00:00Z"))).toBe("2026-08-26T10:00:00.000Z");
  });
});
