import { describe, expect, it } from "vitest";
import { fixtureHeading, playerFixtureBreakdown } from "./playerDetails";
import { demoData } from "../demoData";
import type { GameweekFixture } from "../types";
const fixture: GameweekFixture = { id: 2, kickoff: "2026-11-07T15:00:00Z", home: "CRY", away: "LIV", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" };
describe("current player fixture presentation", () => {
  it("shows an upcoming matchup with kickoff instead of three score dashes", () => {
    const heading = fixtureHeading(fixture, "fi");
    expect(heading.title).toBe("CRY – LIV");
    expect(heading.status).not.toMatch(/alustava|provisional/i);
    expect(heading.status).toMatch(/\d/);
    expect(heading.upcoming).toBe(true);
  });
  it("switches to the live score and then the full-time confirmation state", () => {
    expect(fixtureHeading({ ...fixture, status: "live", homeScore: 1, awayScore: 2 }, "en")).toMatchObject({ title: "CRY 1 – 2 LIV", status: "LIVE", upcoming: false });
    expect(fixtureHeading({ ...fixture, status: "provisional" }, "fi").status).toContain("Päättynyt");
    expect(fixtureHeading({ ...fixture, status: "final" }, "en").status).toBe("Confirmed");
  });
  it("includes every double-gameweek match before explain arrives, without duplicating existing points", () => {
    const player = { ...demoData.managers[0].squad[0], club: "LIV", pointBreakdown: [{ fixture: 2, stats: [{ identifier: "bonus", points: 3, value: 3 }] }] };
    const blocks = playerFixtureBreakdown(player, [fixture, { ...fixture, id: 3, kickoff: "2026-11-10T20:00:00Z" }]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].stats[0].points).toBe(3);
    expect(blocks[1].stats).toEqual([]);
  });
});
