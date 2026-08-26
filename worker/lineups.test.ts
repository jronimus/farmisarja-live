import { describe, expect, it } from "vitest";
import { fotmobDate, mergeFixtures, readMatch, type FixtureLineup } from "./lineups";

const elements = [
  { id: 1, web_name: "Henderson", first_name: "Dean", second_name: "Henderson", team: 7 },
  { id: 2, web_name: "Mateta", first_name: "Jean-Philippe", second_name: "Mateta", team: 7 },
  { id: 3, web_name: "Haaland", first_name: "Erling", second_name: "Haaland", team: 15 },
  { id: 4, web_name: "Doku", first_name: "Jérémy", second_name: "Doku", team: 15 },
];
const teamByShort = new Map([["CRY", 7], ["MCI", 15]]);

// FotMob's own shape, cut down to what is read: Palace 9826, Man City 8456.
const details = (lineupType: string) => ({ content: { lineup: {
  lineupType,
  homeTeam: {
    id: 9826,
    starters: [{ name: "Dean Henderson" }, { name: "Jean-Philippe Mateta" }],
    unavailable: [{ name: "Chadi Riad", unavailability: { type: "injury", expectedReturn: "Unknown" } }],
  },
  awayTeam: {
    id: 8456,
    starters: [{ name: "Erling Haaland" }],
    unavailable: [{ name: "Jérémy Doku", unavailability: { type: "injury", expectedReturn: "Mid September 2026" } }],
  },
} } });

describe("predicted line-ups", () => {
  it("keeps an eleven only when it is actually a prediction", () => {
    const predicted = readMatch(1, "2026-08-28T19:00:00Z", details("predicted"), elements, teamByShort)!;
    expect(predicted.predicted).toBe(true);
    expect(predicted.starters).toEqual([1, 2, 3]);

    // FotMob shows last week's side for the matches further out, and it is worthless as a
    // forecast: a manager reading it would take a rotated player for an expected starter.
    const last = readMatch(1, "2026-08-30T15:30:00Z", details("lastStarting11"), elements, teamByShort)!;
    expect(last.predicted).toBe(false);
    expect(last.starters).toEqual([]);
  });

  it("keeps the injured and suspended either way, because that list does not expire", () => {
    for (const type of ["predicted", "lastStarting11"]) {
      const match = readMatch(1, "2026-08-28T19:00:00Z", details(type), elements, teamByShort)!;
      expect(match.unavailable).toHaveLength(2);
      // A name FPL has no player for stays readable rather than being dropped.
      expect(match.unavailable[0]).toMatchObject({ element: null, name: "Chadi Riad", club: "CRY", reason: "injury" });
      expect(match.unavailable[1]).toMatchObject({ element: 4, club: "MCI", expectedReturn: "Mid September 2026" });
    }
  });

  it("ignores a match outside the league it knows the clubs of", () => {
    const foreign = { content: { lineup: { lineupType: "predicted", homeTeam: { id: 999 }, awayTeam: { id: 8456 } } } };
    expect(readMatch(1, "2026-08-28T19:00:00Z", foreign, elements, teamByShort)).toBeNull();
  });

  it("refreshes one day and leaves the other days alone", () => {
    const now = Date.parse("2026-08-28T12:00:00Z");
    const fixture = (matchId: number, kickoff: string, predicted = false): FixtureLineup =>
      ({ matchId, kickoff, home: "CRY", away: "MCI", predicted, starters: [], unavailable: [] });
    const merged = mergeFixtures(
      [fixture(1, "2026-08-28T19:00:00Z"), fixture(2, "2026-08-30T13:00:00Z")],
      [fixture(1, "2026-08-28T19:00:00Z", true)],
      now,
    );
    expect(merged.find((entry) => entry.matchId === 1)?.predicted).toBe(true);
    expect(merged.find((entry) => entry.matchId === 2)).toBeTruthy();
    // A match well over has an eleven that is a fact elsewhere; it goes.
    expect(mergeFixtures([fixture(3, "2026-08-27T19:00:00Z")], [], now)).toEqual([]);
  });

  it("asks FotMob for a date the way FotMob spells one", () => {
    expect(fotmobDate(Date.parse("2026-08-28T19:00:00Z"))).toBe("20260828");
  });
});
