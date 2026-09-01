import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_VERSION, footballOn, gameweekSettled, readCatalog, refreshCatalog, refreshDue, type Catalog, type CatalogEnv } from "./catalog";

function testEnv() {
  const state = new Map<string, string>();
  return {
    TELEGRAM_STATE: {
      get: vi.fn(async (key: string, type?: string) => {
        const value = state.get(key) ?? null;
        return value !== null && type === "json" ? JSON.parse(value) : value;
      }),
      put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
    },
  } as unknown as CatalogEnv;
}

const bootstrap = {
  events: [
    { id: 1, deadline_time: "2026-08-21T17:30:00Z", is_current: false, is_next: false, finished: true, ranked_count: 11_000_000 },
    { id: 2, deadline_time: "2026-08-28T17:30:00Z", is_current: true, is_next: false, finished: false, ranked_count: 10_500_000 },
  ],
  teams: [{ id: 1, short_name: "ARS", name: "Arsenal", strength: 5, pulse_id: 1 }],
  elements: [{ id: 7, web_name: "Saka", first_name: "Bukayo", second_name: "Saka", team: 1, element_type: 3, now_cost: 100, selected_by_percent: "40.0" }],
};

const fixtures = [{ event: 2, kickoff_time: "2026-08-29T14:00:00Z" }, { event: 2, kickoff_time: null }];

/** Both payloads the rebuild reads, answered by url. */
const stubFpl = () => vi.fn(async (input: RequestInfo | URL) =>
  String(input).includes("/fixtures/") ? Response.json(fixtures) : Response.json(bootstrap));

const catalogAt = (builtAt: string, deadline = "2026-08-28T17:30:00Z"): Catalog => ({
  version: CATALOG_VERSION,
  builtAt,
  events: [{ id: 2, deadline_time: deadline, is_current: true, is_next: false, finished: false, ranked_count: 0 }],
  teams: [],
  elements: [],
  fixtures: [],
});

afterEach(() => vi.unstubAllGlobals());

describe("catalog freshness", () => {
  it("rebuilds when there is nothing stored", () => {
    expect(refreshDue(null, Date.parse("2026-08-25T12:00:00Z"))).toBe(true);
  });

  it("leaves a half-hour-old catalog alone on an ordinary day", () => {
    const now = Date.parse("2026-08-25T12:00:00Z");
    expect(refreshDue(catalogAt("2026-08-25T11:45:00Z"), now)).toBe(false);
    expect(refreshDue(catalogAt("2026-08-25T11:25:00Z"), now)).toBe(true);
  });

  it("rebuilds every three minutes around a deadline", () => {
    // `is_current` turns over as the deadline passes and the card waits on it, so half an
    // hour of staleness there is half an hour of a late card.
    const justAfter = Date.parse("2026-08-28T17:35:00Z");
    expect(refreshDue(catalogAt("2026-08-28T17:33:00Z"), justAfter)).toBe(false);
    expect(refreshDue(catalogAt("2026-08-28T17:32:00Z"), justAfter)).toBe(true);
  });

  it("is back to half-hourly once the window has passed", () => {
    const wellAfter = Date.parse("2026-08-28T21:00:00Z");
    expect(refreshDue(catalogAt("2026-08-28T20:45:00Z"), wellAfter)).toBe(false);
  });
});

describe("building the catalog", () => {
  it("keeps only the fields the every-tick work reads", async () => {
    const env = testEnv();
    vi.stubGlobal("fetch", stubFpl());

    await refreshCatalog(env, Date.parse("2026-08-25T12:00:00Z"));

    const stored = await readCatalog(env);
    // Only the current gameweek's kickoffs, and only the ones that have a time yet.
    expect(stored?.fixtures).toEqual([{ event: 2, kickoff: "2026-08-29T14:00:00Z" }]);
    // The filed names ride along for `fotmob.ts`; `now_cost` and the rest are dropped.
    expect(stored?.elements).toEqual([{ id: 7, web_name: "Saka", first_name: "Bukayo", second_name: "Saka", team: 1, element_type: 3 }]);
    expect(stored?.teams).toEqual([{ id: 1, short_name: "ARS", name: "Arsenal" }]);
    expect(stored?.events[1]).toEqual({
      id: 2, deadline_time: "2026-08-28T17:30:00Z", is_current: true, is_next: false, finished: false, ranked_count: 10_500_000,
    });
  });

  it("does not fetch the bootstrap when the stored catalog is still fresh", async () => {
    const env = testEnv();
    const fetchMock = stubFpl();
    vi.stubGlobal("fetch", fetchMock);
    await refreshCatalog(env, Date.parse("2026-08-25T12:00:00Z"));

    const again = await refreshCatalog(env, Date.parse("2026-08-25T12:05:00Z"));

    expect(again.written).toBe(false);
    // The one rebuild's two payloads, and nothing for the turn that was not due.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a catalog from an older shape as no catalog at all", async () => {
    const env = testEnv();
    await env.TELEGRAM_STATE.put("catalog:v1", JSON.stringify({ ...catalogAt("2026-08-25T11:59:00Z"), version: CATALOG_VERSION - 1 }));

    expect(await readCatalog(env)).toBeNull();
    expect(refreshDue(await readCatalog(env), Date.parse("2026-08-25T12:00:00Z"))).toBe(true);
  });
});

describe("knowing whether football is on", () => {
  const withFixtures = (kickoffs: string[], finished = false): Catalog => ({
    ...catalogAt("2026-08-29T12:00:00Z"),
    events: [{ id: 2, deadline_time: "2026-08-28T17:30:00Z", is_current: true, is_next: false, finished, ranked_count: 0 }],
    fixtures: kickoffs.map((kickoff) => ({ event: 2, kickoff })),
  });
  const at = (time: string) => Date.parse(time);

  it("counts the quarter hour before a kickoff as football", () => {
    const catalog = withFixtures(["2026-08-29T14:00:00Z"]);
    expect(footballOn(catalog, at("2026-08-29T13:40:00Z"))).toBe(false);
    expect(footballOn(catalog, at("2026-08-29T13:50:00Z"))).toBe(true);
    expect(footballOn(catalog, at("2026-08-29T15:30:00Z"))).toBe(true);
  });

  it("keeps the tail after full time, where the bonus is still moving", () => {
    const catalog = withFixtures(["2026-08-29T14:00:00Z"]);
    expect(footballOn(catalog, at("2026-08-29T16:45:00Z"))).toBe(true);
    expect(footballOn(catalog, at("2026-08-29T17:30:00Z"))).toBe(false);
  });

  it("is quiet on a Tuesday", () => {
    expect(footballOn(withFixtures(["2026-08-29T14:00:00Z"]), at("2026-09-01T11:00:00Z"))).toBe(false);
  });

  it("waits for FPL's own word before calling a gameweek over", () => {
    // The last whistle is not the end: bonus is recalculated for hours afterwards, and on
    // 1 Sep FPL had still not confirmed a gameweek whose last match ended the night before.
    expect(gameweekSettled(withFixtures(["2026-08-29T14:00:00Z"], false))).toBe(false);
    expect(gameweekSettled(withFixtures(["2026-08-29T14:00:00Z"], true))).toBe(true);
  });
});
