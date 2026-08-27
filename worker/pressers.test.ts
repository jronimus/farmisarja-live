import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { best, clubsInArticle, liveBlogs, pressersFrom, type Presser } from "./pressers";
import type { Article } from "./articles";

/** A real slice of Fantasy Football Scout's Wednesday article, saved 27 Aug. */
const page = readFileSync(new URL("./fixtures/ffs-pressers.html", import.meta.url), "utf8");

/** FPL's own names, which is where the matcher gets them. */
const teams = new Map(Object.entries({
  "crystal palace": "CRY", chelsea: "CHE", brighton: "BHA", fulham: "FUL", arsenal: "ARS",
}));

const article = (over: Partial<Article> = {}): Article => ({
  id: "a", title: "FPL Gameweek 2 team news: Wednesday's live injury updates",
  url: "https://x/wed", source: "Fantasy Football Scout",
  published: "2026-08-26T15:30:00Z", excerpt: "", ...over,
});

describe("reading a press day's running article", () => {
  it("takes every club that has spoken, from both lists", () => {
    // Crystal Palace under GAMEWEEK 2 PREMIER LEAGUE PRESSERS, and Chelsea, Brighton and
    // Fulham under EFL CUP/CONFERENCE LEAGUE PRESSERS.
    expect(clubsInArticle(page, teams)).toEqual({ gameweek: 2, clubs: ["CRY", "CHE", "BHA", "FUL"] });
  });

  it("keeps the cup section, which is about the squad and not only the cup", () => {
    // The first version of this dropped it, on the reasoning that a manager talking about
    // Tuesday's tie has said nothing about Saturday. The article says otherwise in as many
    // words — "Alonso hopes Caicedo can be available for the visit of Brighton this
    // weekend", "Fofana remains suspended" — so three clubs went missing from a section
    // whose whole job is to show exactly that.
    expect(clubsInArticle(page, teams)!.clubs).toContain("CHE");
    expect(page).toMatch(/available for the visit of Brighton this weekend/i);
  });

  it("says nothing when the article has no such section yet", () => {
    expect(clubsInArticle("<h2>Something else</h2><h3>ARSENAL</h3>", teams)).toBeUndefined();
  });

  it("knows a club the article spells out and FPL does not", () => {
    // The article writes BRIGHTON AND HOVE ALBION; FPL files it as Brighton. Brighton went
    // missing from a live press day for exactly this, because the aliases lived in one file
    // and this parser was in another.
    expect(clubsInArticle(page, teams)!.clubs).toContain("BHA");
  });

  it("skips a heading that is not a club", () => {
    const odd = "<h2>GAMEWEEK 2 PREMIER LEAGUE PRESSERS</h2><h3>ARSENAL</h3><h3>SOME NEW SECTION</h3>";
    expect(clubsInArticle(odd, teams)!.clubs).toEqual(["ARS"]);
  });

  it("takes the gameweek from the article when only a cup heading is there", () => {
    // A day whose Premier League pressers have not started yet still has cup ones, and the
    // gameweek they are relevant to is the one the article is titled for.
    const cupOnly = "<h2>EFL CUP/CONFERENCE LEAGUE PRESSERS</h2><h3>CHELSEA</h3>";
    expect(clubsInArticle(cupOnly, teams, 2)).toEqual({ gameweek: 2, clubs: ["CHE"] });
    expect(clubsInArticle(cupOnly, teams)).toBeUndefined();
  });
});

describe("which running articles are worth reading", () => {
  it("takes the press-day ones and leaves the rest", () => {
    const list = [article(), article({ id: "b", title: "Best cheap FPL players for a Gameweek 2 Bench Boost" })];
    expect(liveBlogs(list, 2).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("puts the newest first, because that is the one still being added to", () => {
    const wed = article({ id: "wed", published: "2026-08-26T15:30:00Z" });
    const thu = article({ id: "thu", title: "FPL Gameweek 2 team news: Thursday's live injury updates", published: "2026-08-27T15:30:00Z" });
    expect(liveBlogs([wed, thu], 2).map((entry) => entry.id)).toEqual(["thu", "wed"]);
  });
});

describe("one presser per club", () => {
  const of = (over: Partial<Presser>): Presser => ({
    club: "ARS", gameweek: 2, title: "t", url: "u", source: "s",
    published: "2026-08-26T12:00:00Z", own: false, ...over,
  });

  it("prefers the club's own piece to a section of a running article", () => {
    // The Friday piece is written after the press conference and quotes it at length; a
    // Wednesday section is a paragraph filed as the manager spoke.
    const kept = best([of({ url: "running" }), of({ url: "own", own: true, published: "2026-08-25T12:00:00Z" })]);
    expect(kept.map((entry) => entry.url)).toEqual(["own"]);
  });

  it("prefers the later reading when neither is a club's own", () => {
    const kept = best([of({ url: "wed" }), of({ url: "thu", published: "2026-08-27T12:00:00Z" })]);
    expect(kept.map((entry) => entry.url)).toEqual(["thu"]);
  });
});

describe("a press week, end to end", () => {
  it("joins the running article to the clubs' own pieces", async () => {
    const list = [
      article(),
      article({ id: "ars", title: "Bruno G, Saka: Arsenal injury latest for FPL Gameweek 2", url: "https://x/ars", club: "ARS", gameweek: 2, published: "2026-08-27T09:00:00Z" }),
    ];
    const found = await pressersFrom(list, 2, teams, async () => page);
    expect(found.map((entry) => `${entry.club}:${entry.own}`)).toEqual(["ARS:true", "BHA:false", "CHE:false", "CRY:false", "FUL:false"]);
  });

  it("survives an article that cannot be fetched", async () => {
    const found = await pressersFrom([article()], 2, teams, async () => { throw new Error("502"); });
    expect(found).toEqual([]);
  });
});
