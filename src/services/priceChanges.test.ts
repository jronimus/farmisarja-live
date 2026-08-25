import { describe, expect, it } from "vitest";
import type { PriceRow } from "../types";
import { buildPriceMarket, daysUntilChangeDay, hoursToChange, lastChangeBeforeDeadline, maybeThisWeek, nextPriceDeadline, outlookFor, outlookRank, perHourFromProjections, type PriceElement } from "./priceChanges";

const projections = (a: number, b: number, c: number, likelihood = 3) => [
  { offset: 0, projected_percent: String(a), likelihood },
  { offset: 1, projected_percent: String(b), likelihood },
  { offset: 2, projected_percent: String(c), likelihood },
];

const element = (over: Partial<PriceElement> = {}): PriceElement => ({
  id: 1, web_name: "Calafiori", team: 1, element_type: 2, now_cost: 55, cost_change_start: 0,
  selected_by_percent: "37.8", transfers_in_event: 18037, transfers_out_event: 13626,
  price_change_percent: "52.5", price_change_projections: projections(59.4, 99.5, 139.6),
  price_change_locked_until: null, price_change_calibrating: false, ...over,
});

const teams = [{ id: 1, short_name: "ARS", code: 3 }];

describe("price changes", () => {
  it("reads a rate per hour out of two projections a day apart", () => {
    // Calafiori's real numbers on 23 Aug: 99.5 tomorrow, 139.6 the day after.
    expect(perHourFromProjections([
      { offset: 0, percent: 59.4, likelihood: 3 },
      { offset: 1, percent: 99.5, likelihood: 5 },
      { offset: 2, percent: 139.6, likelihood: 5 },
    ])).toBeCloseTo(1.67, 2);
  });

  it("has no rate to give when FPL projects nothing", () => {
    expect(perHourFromProjections([])).toBe(0);
  });

  it("counts the hours to a change in whichever direction it is going", () => {
    expect(hoursToChange(52.5, 1.67)).toBeCloseTo(28.4, 1);
    expect(hoursToChange(-54.3, -1.6)).toBeCloseTo(28.6, 1);
  });

  it("returns no estimate when the rate pulls the other way or is flat", () => {
    expect(hoursToChange(52.5, -1.2)).toBeNull();
    expect(hoursToChange(52.5, 0)).toBeNull();
  });

  // The three FPL published on 25 Aug 2026: 02:00 Finnish time on each of the next three
  // nights.
  const deadlines = ["2026-08-25T23:00:00Z", "2026-08-26T23:00:00Z", "2026-08-27T23:00:00Z"];
  const morning = Date.parse("2026-08-25T05:33:00Z");

  it("names the deadline a player's own rate carries him to", () => {
    // De Cuyper, already past 100: the next deadline takes him, whatever the rate does.
    expect(outlookFor({ progress: 105.3, perHour: 2.14 }, deadlines, morning))
      .toMatchObject({ deadline: "2026-08-25T23:00:00Z", direction: "rise" });

    // Sangaré, five hours short: still inside tonight's deadline.
    expect(outlookFor({ progress: 92, perHour: 1.53 }, deadlines, morning))
      .toMatchObject({ deadline: "2026-08-25T23:00:00Z", direction: "rise" });

    // Calafiori, twenty-two hours short, which is past tonight's 02:00. FPL's own page
    // calls this one tomorrow; his change is the night after.
    expect(outlookFor({ progress: 81.3, perHour: 0.85 }, deadlines, morning))
      .toMatchObject({ deadline: "2026-08-26T23:00:00Z", direction: "rise" });

    expect(outlookFor({ progress: -92, perHour: -1.5 }, deadlines, morning))
      .toMatchObject({ deadline: "2026-08-25T23:00:00Z", direction: "fall" });
  });

  it("names no day past the published deadlines, or when nothing is moving", () => {
    // Tzolis at 87 hours: the list runs out first, and a rate stretched further than FPL
    // will announce a time for is a guess.
    expect(outlookFor({ progress: 53.5, perHour: 0.53 }, deadlines, morning)).toBeNull();
    expect(outlookFor({ progress: 52.5, perHour: 0 }, deadlines, morning)).toBeNull();
    expect(outlookFor({ progress: 52.5, perHour: -1.2 }, deadlines, morning)).toBeNull();
    expect(outlookFor({ progress: 105.3, perHour: 2.14 }, [], morning)).toBeNull();
  });

  it("names a 02:00 change after the evening it belongs to, not the date it falls on", () => {
    // Built in local time on both sides, so the assertion holds in any zone the reader is in.
    const local = (day: number, hour: number) => new Date(2026, 7, day, hour).toISOString();
    const morningOf25 = new Date(2026, 7, 25, 8, 33).getTime();

    // Tonight's change, seventeen hours away. Nobody reading this at breakfast calls that
    // tomorrow, and FPL's own `offset` 0 does not either.
    expect(daysUntilChangeDay(local(26, 2), morningOf25)).toBe(0);
    expect(daysUntilChangeDay(local(27, 2), morningOf25)).toBe(1);
    expect(daysUntilChangeDay(local(28, 2), morningOf25)).toBe(2);

    // An hour before the change, and an hour after it: both are still tonight's day.
    expect(daysUntilChangeDay(local(26, 2), new Date(2026, 7, 26, 1).getTime())).toBe(-1);
    expect(daysUntilChangeDay(local(27, 2), new Date(2026, 7, 26, 3).getTime())).toBe(0);
  });

  it("will not state a night flatly when the projection lands on the line", () => {
    // 17.45 hours to the first change. Calafiori at 82.3 and 1.07 an hour lands on 100.1
    // at it — over, by a tenth of a point. The night is named and the caveat is under it.
    expect(outlookFor({ progress: 82.3, perHour: 1.07 }, deadlines, morning)).toEqual({
      deadline: "2026-08-25T23:00:00Z", direction: "rise",
      couldBe: { deadline: "2026-08-26T23:00:00Z", sooner: false },
    });

    // The same margin read from the other side: 96.8 at tonight's change, three short, so
    // the night after is the estimate and tonight is the caveat.
    expect(outlookFor({ progress: 80, perHour: 0.96 }, deadlines, morning)).toEqual({
      deadline: "2026-08-26T23:00:00Z", direction: "rise",
      couldBe: { deadline: "2026-08-25T23:00:00Z", sooner: true },
    });

    // Clear of the line on both sides: 123 at tomorrow's change, and only 75 at tonight's.
    expect(outlookFor({ progress: 40, perHour: 2 }, deadlines, morning)?.couldBe).toBeNull();

    // A faller is the same arithmetic with the sign flipped.
    expect(outlookFor({ progress: -79.7, perHour: -1.4 }, deadlines, morning)?.couldBe)
      .toEqual({ deadline: "2026-08-26T23:00:00Z", sooner: false });
  });

  // GW2's own shape: three nightly changes, the last of them at 02:00 on the Friday the
  // deadline falls on.
  const week = { deadlines, gameweekDeadline: "2026-08-28T17:30:00Z", players: [] };

  it("stops the week at the last change before the gameweek deadline", () => {
    expect(lastChangeBeforeDeadline(week)).toBe("2026-08-27T23:00:00Z");
    // A list that ran past the deadline would otherwise stretch the week silently.
    expect(lastChangeBeforeDeadline({ ...week, deadlines: [...deadlines, "2026-08-28T23:00:00Z"] }))
      .toBe("2026-08-27T23:00:00Z");
    expect(lastChangeBeforeDeadline({ ...week, deadlines: [] })).toBeNull();
  });

  it("hedges a player who is near 100 by the last change of the week", () => {
    // 65 hours to that change. 20 % and 1.3 an hour comes to 104 and has a night named for
    // it; these two do not, and only the first of them gets there.
    expect(maybeThisWeek({ progress: 40, perHour: 0.9 }, week, morning)).toBe("rise");
    expect(maybeThisWeek({ progress: 53.5, perHour: 0.53 }, week, morning)).toBeNull();
    expect(maybeThisWeek({ progress: -40, perHour: -0.9 }, week, morning)).toBe("fall");
  });

  it("hedges nothing that is flat, turned around, or out of week", () => {
    expect(maybeThisWeek({ progress: 40, perHour: 0 }, week, morning)).toBeNull();
    // Rising now but the rate has turned: projecting it through zero and out the far side
    // would announce a fall.
    expect(maybeThisWeek({ progress: 40, perHour: -2.5 }, week, morning)).toBeNull();
    expect(maybeThisWeek({ progress: 40, perHour: 0.9 }, week, Date.parse("2026-08-28T05:00:00Z"))).toBeNull();
  });

  it("ranks the prediction column by when, and by how sure of it", () => {
    const row = (over: Partial<PriceRow>): PriceRow => ({
      id: 1, name: "X", club: "ARS", clubCode: 3, position: "DEF", cost: 5.5, costChangeStart: 0,
      ownership: 10, netTransfers: 0, progress: 0, projections: [], perHour: 0,
      lockedUntil: null, calibrating: false, ...over,
    });
    const rank = (over: Partial<PriceRow>) => outlookRank(row(over), week, morning);
    const order = (entries: Array<Partial<PriceRow>>) => entries
      .map((entry, index) => ({ index, key: rank(entry) }))
      .sort((a, b) => {
        for (let i = 0; i < 3; i += 1) { const gap = (a.key[i] ?? 0) - (b.key[i] ?? 0); if (gap) return gap; }
        return 0;
      })
      .map((entry) => entry.index);

    // Tonight, tonight but less certainly, tomorrow, hedged, going nowhere, calibrating,
    // locked — fed in backwards and sorted into that order.
    expect(order([
      { progress: 50, perHour: 0.2, lockedUntil: "2026-08-28T23:00:00Z" },
      { progress: 50, perHour: 0.2, calibrating: true },
      { progress: 20, perHour: 0.3 },
      { progress: 40, perHour: 0.9 },
      { progress: 81.3, perHour: 0.85 },
      { progress: 82.3, perHour: 1.07 },
      { progress: 105.3, perHour: 2.14 },
    ])).toEqual([6, 5, 4, 3, 2, 1, 0]);

    // A faller ranks beside a riser on the same night: the column says when, not which way.
    expect(rank({ progress: -105, perHour: -2 })[0]).toBe(0);
    expect(rank({ progress: -105, perHour: -2 })[1]).toBeCloseTo(rank({ progress: 105, perHour: 2 })[1], 5);

    // Locked sorts by when it comes free, so the tier is not one undifferentiated heap.
    expect(rank({ lockedUntil: "2026-08-26T23:00:00Z" })[1])
      .toBeLessThan(rank({ lockedUntil: "2026-08-28T23:00:00Z" })[1]);
  });

  it("maps an element onto a row, strings and tenths included", () => {
    const [row] = buildPriceMarket([element({ now_cost: 55, cost_change_start: -2 })], teams, []).players;
    expect(row).toMatchObject({ name: "Calafiori", club: "ARS", position: "DEF", cost: 5.5, costChangeStart: -0.2, ownership: 37.8, netTransfers: 4411, progress: 52.5 });
    expect(row.perHour).toBeCloseTo(1.67, 2);
  });

  it("takes the next published change time and ignores the ones that have passed", () => {
    const market = buildPriceMarket([element()], teams, ["2026-08-23T23:00:00Z", "2026-08-24T23:00:00Z"]);
    expect(nextPriceDeadline(market, Date.parse("2026-08-23T21:00:00Z"))).toBe("2026-08-23T23:00:00Z");
    expect(nextPriceDeadline(market, Date.parse("2026-08-23T23:30:00Z"))).toBe("2026-08-24T23:00:00Z");
    expect(nextPriceDeadline(market, Date.parse("2026-08-26T00:00:00Z"))).toBeNull();
    expect(nextPriceDeadline(undefined, Date.now())).toBeNull();
  });
});
