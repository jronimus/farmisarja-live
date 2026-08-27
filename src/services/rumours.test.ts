import { describe, expect, it } from "vitest";
import { absencesByElement, reportsSince, type Absence, type Rumour } from "./rumours";

const rumour = (over: Partial<Rumour> = {}): Rumour => ({
  id: 1, element: 5, player: "Ollie Watkins", fromClub: "AVL", toClub: "Al Hilal",
  staysInLeague: false, strength: "high", source: "Fabrizio Romano",
  reportedAt: "2026-08-20T08:00:00Z", ...over,
});

const seen = {
  lastPlayedAt: { "5": "2026-08-23T14:00:00Z" },
  lastFixtureAt: { AVL: "2026-08-23T14:00:00Z" },
};

describe("a report the player has already answered on the pitch", () => {
  it("is dropped once he has played since it was filed", () => {
    expect(reportsSince([rumour()], seen.lastPlayedAt)).toEqual([]);
  });

  it("is kept when it was filed after his last appearance", () => {
    // New talk with no minutes after it is exactly the case worth a mark.
    expect(reportsSince([rumour({ reportedAt: "2026-08-25T09:00:00Z" })], seen.lastPlayedAt)).toHaveLength(1);
  });

  it("keeps every report for a player who has not played at all", () => {
    // Absence of evidence that he played is not evidence that he did.
    expect(reportsSince([rumour()], {})).toHaveLength(1);
  });

  it("keeps the newer of two reports and drops the older", () => {
    const kept = reportsSince([rumour({ id: 1 }), rumour({ id: 2, reportedAt: "2026-08-26T09:00:00Z" })], seen.lastPlayedAt);
    expect(kept.map((entry) => entry.id)).toEqual([2]);
  });
});

describe("an absence the player has played through", () => {
  const absence = (over: Partial<Absence> = {}): Absence => ({
    element: 5, name: "Ollie Watkins", club: "AVL", reason: "injury", expectedReturn: "About a week", ...over,
  });

  it("is dropped when he played in his club's most recent match", () => {
    expect(absencesByElement([absence()], seen).size).toBe(0);
  });

  it("is kept when he did not play in it", () => {
    expect(absencesByElement([absence()], { lastPlayedAt: { "5": "2026-08-16T14:00:00Z" }, lastFixtureAt: seen.lastFixtureAt }).size).toBe(1);
  });

  it("is kept when nothing is known about either", () => {
    expect(absencesByElement([absence()]).size).toBe(1);
    expect(absencesByElement([absence()], { lastPlayedAt: {}, lastFixtureAt: {} }).size).toBe(1);
  });

  it("still drops a name that could not be matched onto an FPL player", () => {
    expect(absencesByElement([absence({ element: null })], seen).size).toBe(0);
  });
});
