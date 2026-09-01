import { describe, expect, it } from "vitest";
import { feedDue } from "./index";
import { CATALOG_VERSION, type Catalog } from "./catalog";

/** A gameweek with a Saturday three o'clock in it, and FPL's word on whether it is over. */
const catalog = (finished: boolean): Catalog => ({
  version: CATALOG_VERSION,
  builtAt: "2026-08-29T12:00:00Z",
  events: [{ id: 2, deadline_time: "2026-08-28T17:30:00Z", is_current: true, is_next: false, finished, ranked_count: 0 }],
  teams: [],
  elements: [],
  fixtures: [{ event: 2, kickoff: "2026-08-29T14:00:00Z" }],
});

const duringMatch = Date.parse("2026-08-29T15:00:00Z");
const afterMatches = Date.parse("2026-08-30T09:00:00Z");

describe("how often the feed is worth writing", () => {
  it("takes every other minute while a match is on", () => {
    // The ticker is the point of the site for these ninety minutes.
    expect(feedDue(catalog(false), duringMatch, 14)).toBe(true);
    expect(feedDue(catalog(false), duringMatch, 15)).toBe(false);
  });

  it("drops to hourly once the football stops but before FPL has confirmed", () => {
    // Bonus still moves, slowly, so it is worth one look an hour and no more.
    expect(feedDue(catalog(false), afterMatches, 30)).toBe(true);
    expect(feedDue(catalog(false), afterMatches, 14)).toBe(false);
    expect(feedDue(catalog(false), afterMatches, 0)).toBe(false);
  });

  it("stops entirely once FPL says the gameweek is finished", () => {
    // Three or four days a week where the cheapest work is the work not done: no fetch, no
    // parse, no write, until the next gameweek turns over.
    for (const minute of [0, 14, 30, 44]) {
      expect(feedDue(catalog(true), afterMatches, minute)).toBe(false);
    }
    expect(feedDue(catalog(true), duringMatch, 14)).toBe(false);
  });
});
