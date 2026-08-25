import { describe, expect, it } from "vitest";
import { PER_PAGE, buildCurve, plannedPages, provisionalMultipliers, scoreEntry, type RankSample, type SampledEntry } from "./liveRank";

const entry = (over: Partial<SampledEntry> = {}): SampledEntry => ({
  id: 1, weight: 1, before: 0, hit: 0,
  // A 1-4-4-2 with a keeper, four defenders, four midfielders and two forwards, then a
  // bench of keeper, defender, midfielder, forward. The captain is pick 2.
  picks: [
    [101, 1, 1], [102, 2, 2], [103, 1, 2], [104, 1, 2], [105, 1, 2],
    [106, 1, 3], [107, 1, 3], [108, 1, 3], [109, 1, 3], [110, 1, 4], [111, 1, 4],
    [112, 0, 1], [113, 0, 2], [114, 0, 3], [115, 0, 4],
  ],
  ...over,
});

const points = (values: Record<number, number>) => new Map(Object.entries(values).map(([id, value]) => [Number(id), value]));
const asIs = (row: SampledEntry) => row.picks.map((pick) => pick[1]);

describe("live rank", () => {
  it("spreads pages over the whole field and still adds up to it", () => {
    const ranked = 8_903_695;
    const pages = plannedPages(ranked);
    const total = pages.reduce((sum, page) => sum + page.weight * PER_PAGE, 0);
    // Every manager is spoken for exactly once, however unevenly the pages are placed.
    expect(total).toBeCloseTo(Math.ceil(ranked / 50) * 50, -2);
    expect(pages[0].page).toBe(1);
    expect(pages[pages.length - 1].page).toBe(Math.ceil(ranked / 50));
    // Log-spaced: the first gaps are single pages and the last are tens of thousands, which
    // is what puts the resolution where a rank is read as a proportion.
    expect(pages[1].page - pages[0].page).toBeLessThan(5);
    expect(pages[pages.length - 1].page - pages[pages.length - 2].page).toBeGreaterThan(1000);
  });

  it("scores a squad the way FPL does: multiplier, then the hit", () => {
    const squad = entry({ before: 120, hit: 4 });
    const live = points({ 101: 6, 102: 9, 103: 2, 104: 2, 105: 2, 106: 5, 107: 1, 108: 1, 109: 1, 110: 7, 111: 2, 112: 3, 113: 8, 114: 8, 115: 8 });
    // 6 + 18 + 2+2+2 + 5+1+1+1 + 7+2 = 47, the bench counting nothing, less a −4.
    expect(scoreEntry(squad, live, asIs)).toBe(120 + 47 - 4);
  });

  it("takes the bench in order, not by position", () => {
    const squad = entry();
    // 110 is a forward who never took the pitch. The first bench player is the reserve
    // goalkeeper, who cannot come on for him, and the second is a defender, who can: three
    // at the back becomes four and one forward is still one forward. FPL fills the place
    // from the bench in the order the manager set, not with a like-for-like.
    const multipliers = provisionalMultipliers(squad, (element) => element !== 110, () => true);
    expect(multipliers[9]).toBe(0);
    expect(multipliers[12]).toBe(1);
    expect(multipliers.slice(13)).toEqual([0, 0]);
  });

  it("swaps the goalkeeper only with the goalkeeper", () => {
    const squad = entry();
    const multipliers = provisionalMultipliers(squad, (element) => element !== 101, () => true);
    expect(multipliers[0]).toBe(0);
    expect(multipliers[11]).toBe(1);
    // The outfield bench stays seated: an outfielder cannot keep goal.
    expect(multipliers.slice(12)).toEqual([0, 0, 0]);
  });

  it("refuses a substitution that would break the formation", () => {
    // Two of a back three are missing and the bench is a keeper and three forwards. Bringing
    // one on would leave two defenders, so neither place is filled and both simply score
    // nothing — which is what FPL does with a squad it cannot make legal.
    const squad = entry({
      picks: [
        [101, 1, 1], [102, 1, 2], [103, 1, 2], [104, 1, 2],
        [105, 1, 3], [106, 1, 3], [107, 1, 3], [108, 1, 3], [109, 1, 3],
        [110, 1, 4], [111, 1, 4],
        [112, 0, 1], [113, 0, 4], [114, 0, 4], [115, 0, 4],
      ],
    });
    const multipliers = provisionalMultipliers(squad, (element) => element !== 103 && element !== 104, () => true);
    expect(multipliers).toEqual(asIs(squad));
  });

  it("leaves a squad alone while its matches are still to come", () => {
    const squad = entry();
    // Nobody has played, but nothing is over either — an autosub here would take points off
    // a manager whose player has not kicked off yet.
    expect(provisionalMultipliers(squad, () => false, () => false)).toEqual(asIs(squad));
  });

  it("folds the sample into a curve of who stands above each total", () => {
    const sample: RankSample = {
      version: 1, gameweek: 2, ranked: 1_000_000, pending: [], queue: [],
      entries: [
        entry({ id: 1, weight: 10, before: 90 }),
        entry({ id: 2, weight: 20, before: 50 }),
        entry({ id: 3, weight: 30, before: 50 }),
      ],
    };
    const live = points({ 101: 1 });
    // Each squad scores 1 from its keeper, so the totals are 91, 51 and 51.
    const curve = buildCurve(sample, live, asIs, Date.parse("2026-08-25T12:00:00Z"));
    expect(curve.weight).toBe(60);
    expect(curve.above).toEqual([[91, 0], [51, 10]]);
    expect(curve.ranked).toBe(1_000_000);
    // Unsettled unless told otherwise, so a curve is never mistaken for a final one.
    expect(curve.settled).toBe(false);
    expect(buildCurve(sample, live, asIs, 0, true).settled).toBe(true);
  });
});
