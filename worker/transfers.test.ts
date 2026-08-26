import { describe, expect, it } from "vitest";
import { dealsFromWire, mergeDeals, type Deal, type WireTransfer } from "./transfers";

const elements = [
  { id: 3, web_name: "Grealish", first_name: "Jack", second_name: "Grealish", team: 15 },
  { id: 5, web_name: "Watkins", first_name: "Ollie", second_name: "Watkins", team: 2 },
];
const teamByShort = new Map([["AVL", 2], ["MCI", 15]]);

/** Shaped exactly as the wire returns it, off a real response read on 26 Aug. */
const wire = (over: Partial<WireTransfer> = {}): WireTransfer => ({
  name: "Ollie Watkins", fromClubId: 10252, toClub: "Al Hilal", toClubId: 100,
  transferDate: "2026-08-26T20:57:07Z", ...over,
});

describe("the transfer wire", () => {
  it("keeps a departure from a Premier League club", () => {
    expect(dealsFromWire([wire()], elements, teamByShort)).toEqual([{
      element: 5, player: "Ollie Watkins", fromClub: "AVL", toClub: "Al Hilal",
      staysInLeague: false, onLoan: false, at: "2026-08-26T20:57:07.000Z",
    }]);
  });

  it("marks a move that keeps him in the game", () => {
    const [deal] = dealsFromWire([wire({ name: "Jack Grealish", fromClubId: 8456, toClub: "Aston Villa", toClubId: 10252 })], elements, teamByShort);
    expect(deal.staysInLeague).toBe(true);
    expect(deal.fromClub).toBe("MCI");
  });

  it("drops what is not a departure from this league", () => {
    // An arrival: he is not in the game yet, and FPL adds him to it itself.
    expect(dealsFromWire([wire({ name: "Nico González", fromClubId: 8634, toClubId: 10261 })], elements, teamByShort)).toEqual([]);
    // A contract extension is not a move at all — both clubs are the same one.
    expect(dealsFromWire([wire({ contractExtension: true })], elements, teamByShort)).toEqual([]);
    // A name that cannot be matched onto an FPL element is not printable on an FPL page.
    expect(dealsFromWire([wire({ name: "Somebody Else" })], elements, teamByShort)).toEqual([]);
  });

  it("keeps a deal that has scrolled off the wire", () => {
    // Fifty moves to a page and a busy evening: a deal drops off the window within hours,
    // and falling off the wire is not the move being undone.
    const stored: Deal[] = [{ element: 5, player: "Ollie Watkins", fromClub: "AVL", toClub: "Al Hilal", staysInLeague: false, onLoan: false, at: "2026-08-26T20:57:07.000Z" }];
    const now = Date.parse("2026-08-27T09:00:00Z");
    expect(mergeDeals(stored, [], now)).toHaveLength(1);
  });

  it("lets the wire correct itself, and forgets a move a fortnight old", () => {
    const stored: Deal[] = [{ element: 5, player: "Ollie Watkins", fromClub: "AVL", toClub: "Fenerbahce", staysInLeague: false, onLoan: false, at: "2026-08-26T20:57:07.000Z" }];
    const fresh = dealsFromWire([wire()], elements, teamByShort);
    const now = Date.parse("2026-08-27T09:00:00Z");
    // One line per player: the later reading of the same move replaces the earlier one.
    expect(mergeDeals(stored, fresh, now)).toEqual([expect.objectContaining({ toClub: "Al Hilal" })]);
    // By a fortnight FPL has flagged him itself, and this is no longer the page that knows.
    expect(mergeDeals(stored, [], Date.parse("2026-09-20T09:00:00Z"))).toEqual([]);
  });
});
