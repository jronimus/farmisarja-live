import { afterEach, describe, expect, it, vi } from "vitest";
import { absencesFromTeam, mergeAbsences, mergeRumours, rumoursFromTeam, updateRumours, type Rumour, type RumoursEnv } from "./rumours";
import { matchElement, normalise } from "./fotmob";
import { CATALOG_VERSION, type Catalog } from "./catalog";

afterEach(() => vi.unstubAllGlobals());

const elements = [
  // Two Martínezes, one at Villa and one at United, which is the case a surname alone
  // cannot resolve and a club can.
  { id: 1, web_name: "Martinez", first_name: "Emiliano", second_name: "Martínez Romero", team: 2 },
  { id: 2, web_name: "Martinez", first_name: "Lisandro", second_name: "Martínez", team: 16 },
  { id: 3, web_name: "Grealish", first_name: "Jack", second_name: "Grealish", team: 15 },
  { id: 4, web_name: "Enzo", first_name: "Enzo", second_name: "Fernández", team: 6 },
];
const teamByShort = new Map([["AVL", 2], ["CHE", 6], ["MCI", 15], ["MUN", 16]]);

const rumour = (over: Partial<Rumour> = {}): Rumour => ({
  id: 1, element: 3, player: "Jack Grealish", fromClub: "MCI", toClub: "AC Milan",
  staysInLeague: false, strength: "low", source: "The Sun",
  reportedAt: "2026-08-25T08:00:00Z", ...over,
});

describe("transfer rumours", () => {
  it("matches a name across two sites that spell nobody the same way", () => {
    // FotMob's "Emiliano Martínez" against FPL's Emiliano / Martínez Romero.
    expect(matchElement("Emiliano Martínez", 10252, elements, teamByShort)).toBe(1);
    // The same surname at another club is the other man, and the club decides it.
    expect(matchElement("Lisandro Martínez", 10260, elements, teamByShort)).toBe(2);
    // FPL's web name is the whole name for some players.
    expect(matchElement("Enzo Fernández", 8455, elements, teamByShort)).toBe(4);
  });

  it("refuses a match it cannot make rather than guessing", () => {
    expect(matchElement("Someone Unknown", 8456, elements, teamByShort)).toBeNull();
    // A club outside the Premier League has no FPL players to match against at all.
    expect(matchElement("Jack Grealish", 999999, elements, teamByShort)).toBeNull();
  });

  it("keeps graded rumours about players leaving the league's own clubs", () => {
    const payload = { transfers: { allRumours: [
      { name: "Jack Grealish", fromClubId: 8456, fromClub: "Man City", toClub: "AC Milan", toClubId: 100,
        probability: "Low", sourceName: "The Sun", sourceUrl: "https://x", transferDate: "2026-08-25T08:00:00Z", rumourId: 11 },
      { name: "Omar Marmoush", fromClubId: 8456, fromClub: "Man City", toClub: "Tottenham", toClubId: 8586,
        probability: "Imminent", sourceName: "The Athletic", transferDate: "2026-08-26T08:37:00Z", rumourId: 12 },
      // Somebody moving *to* a Premier League club is not in the game yet.
      { name: "Allan", fromClubId: 10283, fromClub: "Palmeiras", toClub: "Man City", toClubId: 8456,
        probability: "High", sourceName: "ESPN", transferDate: "2026-08-25T06:51:00Z", rumourId: 13 },
      // No grade, no line: an ungraded report is the thing this page exists not to print.
      { name: "Jack Grealish", fromClubId: 8456, fromClub: "Man City", toClub: "Everton", toClubId: 8668,
        sourceName: "footyinsider247", transferDate: "2026-08-19T08:00:00Z", rumourId: 14 },
    ] } };
    const out = rumoursFromTeam(payload, [...elements, { id: 5, web_name: "Marmoush", first_name: "Omar", second_name: "Marmoush", team: 15 }], teamByShort);
    expect(out.map((entry) => entry.id)).toEqual([11, 12]);
    expect(out[1]).toMatchObject({ strength: "imminent", staysInLeague: true, source: "The Athletic", fromClub: "MCI" });
  });

  it("drops a move to the club he already plays for", () => {
    // FotMob files contract talk in the transfer list with both ends the same club: Romano
    // on Bruno Fernandes to Man United, while he is Man United's captain.
    const payload = { transfers: { allRumours: [
      { name: "Jack Grealish", fromClubId: 8456, fromClub: "Man City", toClub: "Man City", toClubId: 8456,
        probability: "Medium", sourceName: "Fabrizio Romano", transferDate: "2026-08-20T07:23:00Z", rumourId: 31 },
    ] } };
    expect(rumoursFromTeam(payload, elements, teamByShort)).toEqual([]);
  });

  it("keeps all four of FotMob's grades, Medium included", () => {
    // `Medium` was missing from the grade table and an unknown grade is skipped, so every
    // Medium report was being dropped: eighteen across the league on 26 Aug, among them
    // Romano on Nicolas Jackson to Villa.
    const payload = { transfers: { allRumours: [
      { name: "Jack Grealish", fromClubId: 8456, fromClub: "Man City", toClub: "Aston Villa", toClubId: 10252,
        probability: "Medium", sourceName: "Fabrizio Romano", transferDate: "2026-08-26T16:45:00Z", rumourId: 21 },
    ] } };
    expect(rumoursFromTeam(payload, elements, teamByShort)[0]).toMatchObject({ strength: "medium" });
  });

  it("keeps the clubs a half-league tick did not read", () => {
    const now = Date.parse("2026-08-26T12:00:00Z");
    const stored = [rumour({ id: 1, fromClub: "MCI" }), rumour({ id: 2, fromClub: "ARS" })];
    // Only Arsenal was read this tick, and it now reports nothing.
    const merged = mergeRumours(stored, [], ["ARS"], now);
    expect(merged.map((entry) => entry.id)).toEqual([1]);
    // A repeat of the same report is the same line, not a second one.
    expect(mergeRumours(stored, [rumour({ id: 1, fromClub: "MCI", strength: "high" })], ["MCI"], now))
      .toHaveLength(2);
  });

  it("lets a fortnight-old rumour age out", () => {
    const now = Date.parse("2026-09-20T12:00:00Z");
    expect(mergeRumours([rumour()], [], [], now)).toEqual([]);
  });

  it("normalises the accents the two sites disagree about", () => {
    expect(normalise("Jérémy Doku")).toBe("jeremy doku");
    expect(normalise("Nico González")).toBe("nico gonzalez");
  });

  it("takes the unavailable list off the same payload the rumours came from", () => {
    const payload = { overview: { lastLineupStats: { unavailable: [
      { name: "Jack Grealish", unavailability: { type: "injury", expectedReturn: "Early September 2026" } },
      { name: "Nobody Here", unavailability: { type: "suspension", expectedReturn: "Two matches" } },
    ] } } };
    const out = absencesFromTeam(payload, 8456, elements, teamByShort);
    expect(out[0]).toMatchObject({ element: 3, club: "MCI", reason: "injury", expectedReturn: "Early September 2026" });
    // An unmatched name is still worth printing, so it keeps its place with a null element.
    expect(out[1]).toMatchObject({ element: null, name: "Nobody Here", reason: "suspension" });
  });

  it("keeps the absences of the clubs a tick did not read", () => {
    const city = { element: 3, name: "Jack Grealish", club: "MCI", reason: "injury", expectedReturn: "" };
    const gunners = { element: 9, name: "Someone", club: "ARS", reason: "injury", expectedReturn: "" };
    expect(mergeAbsences([city, gunners], [], ["ARS"])).toEqual([city]);
  });
});

describe("reading somebody else's site four clubs at a time", () => {
  const catalog: Catalog = {
    version: CATALOG_VERSION, builtAt: "2026-09-01T00:00:00Z", events: [],
    teams: [{ id: 2, short_name: "AVL", name: "Aston Villa" }],
    elements: [{ id: 1, web_name: "Martinez", first_name: "Emiliano", second_name: "Martínez Romero", team: 2, element_type: 1 }],
  };

  function env() {
    const state = new Map<string, string>();
    return {
      TELEGRAM_STATE: {
        get: vi.fn(async (key: string, type?: string) => {
          const value = state.get(key) ?? null;
          return value !== null && type === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
      },
    } as unknown as RumoursEnv;
  }

  it("asks about four clubs a turn and walks the league in five", async () => {
    const asked: number[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const id = Number(new URL(String(input)).searchParams.get("id"));
      asked[asked.length - 1].push(id);
      return Response.json({});
    }));
    const store = env();

    // Five turns, each a little later than the gate, which is the rotation's own rhythm.
    for (let turn = 0; turn < 5; turn += 1) {
      asked.push([]);
      await updateRumours(store, catalog, Date.parse("2026-09-01T12:00:00Z") + turn * 10 * 60_000);
    }

    // Ten clubs at once was thirteen milliseconds of parsing and the tick died every time.
    expect(asked.map((turnAsked) => turnAsked.length)).toEqual([4, 4, 4, 4, 4]);
    // Twenty distinct clubs, nobody asked twice, nobody missed.
    expect(new Set(asked.flat()).size).toBe(20);
  });

  it("never reads the bootstrap: the squad arrives in the catalog", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);

    await updateRumours(env(), catalog, Date.parse("2026-09-01T12:00:00Z"));

    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes("bootstrap-static"))).toBe(true);
  });
});
