import { describe, expect, it } from "vitest";
import { buildPriceMarket, hoursToChange, nextPriceDeadline, outlookFor, perHourFromProjections, type PriceElement } from "./priceChanges";

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

  it("takes the first projection that actually reaches a change", () => {
    expect(outlookFor({ projections: [
      { offset: 0, percent: 59.4, likelihood: 3 },
      { offset: 1, percent: 99.5, likelihood: 5 },
      { offset: 2, percent: 139.6, likelihood: 5 },
    ] })).toEqual({ offset: 2, likelihood: 5, direction: "rise" });

    expect(outlookFor({ projections: [
      { offset: 0, percent: -60.9, likelihood: -4 },
      { offset: 1, percent: -99.5, likelihood: -5 },
      { offset: 2, percent: -138, likelihood: -5 },
    ] })).toEqual({ offset: 2, likelihood: -5, direction: "fall" });

    expect(outlookFor({ projections: [
      { offset: 0, percent: 18.2, likelihood: 1 },
      { offset: 1, percent: 31.2, likelihood: 2 },
      { offset: 2, percent: 44.3, likelihood: 3 },
    ] })).toBeNull();
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
