import { describe, expect, it } from "vitest";
import { groupByDay, loggedSince, nightOf, type PriceChange } from "./priceHistory";

const change = (over: Partial<PriceChange> = {}): PriceChange => ({
  id: "1:2026-08-26:101", at: "2026-08-26T01:02:00Z", element: 1, player: "Saka", club: "ARS",
  position: "MID", from: 10, to: 10.1, seasonChange: 0.1, ownership: 42.5, ...over,
});

describe("price history", () => {
  it("groups the nights newest first, risers before fallers", () => {
    const groups = groupByDay([
      change({ id: "a", at: "2026-08-26T01:02:00Z" }),
      change({ id: "b", at: "2026-08-26T01:02:00Z", element: 2, player: "Salah", to: 9.9, from: 10, ownership: 60 }),
      change({ id: "c", at: "2026-08-24T01:02:00Z", element: 3, player: "Palmer" }),
    ]);
    // The night, not the stamp: a change at 01:02 belongs to the evening before it.
    expect(groups.map((group) => group.day)).toEqual(["2026-08-25", "2026-08-23"]);
    expect(groups[0].risers.map((entry) => entry.player)).toEqual(["Saka"]);
    expect(groups[0].fallers.map((entry) => entry.player)).toEqual(["Salah"]);
  });

  it("dates a change by the night it belongs to, not the morning it lands in", () => {
    expect(nightOf("2026-08-26T01:30:00Z")).toBe("2026-08-25");
    // An evening is its own night; only the small hours belong to the day before.
    expect(nightOf("2026-08-26T19:00:00Z")).toBe("2026-08-26");
  });

  it("orders a night by ownership, which is the only thing separating equal tenths", () => {
    const [group] = groupByDay([
      change({ id: "a", element: 1, player: "Saka", ownership: 12 }),
      change({ id: "b", element: 2, player: "Salah", ownership: 60 }),
    ]);
    expect(group.risers.map((entry) => entry.player)).toEqual(["Salah", "Saka"]);
  });

  it("knows how far back it actually reaches", () => {
    expect(loggedSince([change({ at: "2026-08-26T01:02:00Z" }), change({ id: "b", at: "2026-08-20T01:02:00Z" })]))
      .toBe("2026-08-20T01:02:00Z");
    expect(loggedSince([])).toBeNull();
  });
});
