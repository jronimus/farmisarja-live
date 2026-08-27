import { describe, expect, it } from "vitest";
import { clubFixtures, playedAt } from "./appearances";

const kickoffs = new Map([
  [10, "2026-08-22T19:00:00Z"],
  [11, "2026-08-23T14:00:00Z"],
  [12, "2026-08-29T19:00:00Z"],
]);

const element = (id: number, entries: Array<[number, number]>) => ({
  id,
  stats: { minutes: entries.reduce((total, [, minutes]) => total + minutes, 0) },
  explain: entries.map(([fixture, minutes]) => ({ fixture, stats: [{ identifier: "minutes", value: minutes }] })),
});

describe("when a player last played", () => {
  it("takes the kick-off of the match he featured in", () => {
    expect(playedAt([element(1, [[10, 90]])], kickoffs).get(1)).toBe("2026-08-22T19:00:00Z");
  });

  it("takes the later of two matches in a double gameweek", () => {
    expect(playedAt([element(1, [[10, 90]], ), element(2, [[10, 12], [11, 90]])], kickoffs).get(2))
      .toBe("2026-08-23T14:00:00Z");
  });

  it("ignores a match he was named in but did not play", () => {
    // An unused substitute has an `explain` entry and no minutes, which is exactly the case
    // this has to get right: being in the squad is not having played.
    expect(playedAt([element(3, [[10, 0]])], kickoffs).has(3)).toBe(false);
    // And the earlier match still counts when the later one was a nought.
    expect(playedAt([element(4, [[10, 61], [11, 0]])], kickoffs).get(4)).toBe("2026-08-22T19:00:00Z");
  });

  it("says nothing about a player with no minutes at all", () => {
    expect(playedAt([element(5, [])], kickoffs).size).toBe(0);
  });
});

describe("when a club last played", () => {
  const fixtures = [
    { id: 10, event: 1, kickoff_time: "2026-08-22T19:00:00Z", finished: true, started: true, team_h: 1, team_a: 2 },
    { id: 11, event: 1, kickoff_time: "2026-08-23T14:00:00Z", finished: true, started: true, team_h: 1, team_a: 3 },
    // Started but not finished: the match is still being played, so it is not yet a match
    // anybody can be said to have missed.
    { id: 12, event: 2, kickoff_time: "2026-08-29T19:00:00Z", finished: false, started: true, team_h: 2, team_a: 3 },
  ];
  const now = Date.parse("2026-08-29T20:00:00Z");

  it("takes each club's most recent finished match", () => {
    const last = clubFixtures(fixtures, now);
    expect(last.get(1)).toBe("2026-08-23T14:00:00Z");
    expect(last.get(2)).toBe("2026-08-22T19:00:00Z");
    expect(last.get(3)).toBe("2026-08-23T14:00:00Z");
  });

  it("ignores a fixture that has not kicked off", () => {
    expect(clubFixtures(fixtures, Date.parse("2026-08-24T00:00:00Z")).get(2)).toBe("2026-08-22T19:00:00Z");
  });
});
