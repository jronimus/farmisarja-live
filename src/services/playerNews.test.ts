import { describe, expect, it } from "vitest";
import { flagOf, isNewsworthy, newsOrder } from "./playerNews";
import type { PlayerNews } from "../types";

const news = (over: Partial<PlayerNews> = {}): PlayerNews => ({
  id: 1, name: "Martinez", club: "AVL", position: "GK", cost: 5, ownership: 4.1,
  status: "a", chance: null, news: "", newsAt: null, starts: 0, minutes: 0, teamGames: 1,
  owners: [], ...over,
});

describe("availability flags", () => {
  it("reads FPL's letters the way FPL's own site paints them", () => {
    expect(flagOf({ status: "i", chance: 0 })).toEqual({ level: "out", chance: 0 });
    expect(flagOf({ status: "s", chance: 0 })).toEqual({ level: "out", chance: 0 });
    // A player who has left the league is unavailable, not injured, and still out.
    expect(flagOf({ status: "u", chance: 0 })).toEqual({ level: "out", chance: 0 });
    expect(flagOf({ status: "d", chance: 75 })).toEqual({ level: "doubt", chance: 75 });
    // Half or less is a different decision from the ordinary 75, so it is painted apart.
    expect(flagOf({ status: "d", chance: 50 })).toEqual({ level: "major", chance: 50 });
    expect(flagOf({ status: "d", chance: 25 })).toEqual({ level: "major", chance: 25 });
    expect(flagOf({ status: "a", chance: null })).toEqual({ level: "none", chance: null });
  });

  it("puts the worst news the league is most exposed to at the top", () => {
    const rows = [
      news({ id: 1, name: "Doubt, nobody here", status: "d", chance: 75, ownership: 40 }),
      news({ id: 2, name: "Out, two of ours", status: "i", chance: 0, ownership: 3, owners: [
        { managerId: 1, teamName: "A", starter: true, captain: false },
        { managerId: 2, teamName: "B", starter: false, captain: false },
      ] }),
      news({ id: 3, name: "Out, nobody here", status: "i", chance: 0, ownership: 30 }),
    ].sort(newsOrder);
    expect(rows.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it("keeps the 494 players nobody needs to read off the page", () => {
    expect(isNewsworthy(news())).toBe(false);
    expect(isNewsworthy(news({ status: "d", chance: 75 }))).toBe(true);
    // A note without a flag is still a note: FPL writes those for returning players.
    expect(isNewsworthy(news({ news: "Expected back 14 Sep" }))).toBe(true);
  });
});
