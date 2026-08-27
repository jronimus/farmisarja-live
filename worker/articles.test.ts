import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excerptFrom, parseFeed, plain, selectArticles, teamNewsFor, topicFor, type Article } from "./articles";

// A real Fantasy Football Scout feed, saved 26 Aug 2026. Parsing is only worth testing
// against what a publisher actually sends, entities, CDATA, tabs and all.
const feed = readFileSync(new URL("./fixtures/ffs-feed.xml", import.meta.url), "utf8");

describe("article feed", () => {
  it("reads a real feed into headlines and links", () => {
    const articles = parseFeed(feed, "Fantasy Football Scout");
    expect(articles).toHaveLength(12);
    const [first] = articles;
    expect(first.title).toBe("Best cheap FPL players for a Gameweek 2 Bench Boost");
    expect(first.url).toMatch(/^https:\/\/www\.fantasyfootballscout\.co\.uk\/2026\/08\/26\//);
    expect(first.published).toBe("2026-08-26T09:00:00.000Z");
    expect(first.topic).toBe("chips");
  });

  it("keeps the lead sentence and drops WordPress's back-link", () => {
    const [first] = parseFeed(feed, "Fantasy Football Scout");
    expect(first.excerpt).toBe("Some low-cost options to consider this week and beyond");
    expect(first.excerpt).not.toMatch(/appeared first on/i);
  });

  it("unescapes what a feed escapes", () => {
    expect(plain("<![CDATA[Set pieces + penalties: All 20 clubs&#8217; takers]]>"))
      // The curly apostrophe the publisher typed, not an ASCII one straightened for it.
      .toBe("Set pieces + penalties: All 20 clubs’ takers");
    expect(plain("Tips &amp; Captaincy &#038; More")).toBe("Tips & Captaincy & More");
  });

  it("takes the publisher's own category and ignores its SEO tags", () => {
    // The first entries in a WordPress feed are categories; the lowercase tail is tagging.
    expect(topicFor(["Team News", "Gameweek 2 injury news"])).toBe("team-news");
    expect(topicFor(["fpl gw2", "best bench boost options"])).toBeUndefined();
  });

  it("drops the stale, the duplicated, and one masthead's flood", () => {
    const now = Date.parse("2026-08-26T12:00:00Z");
    const at = (days: number, hour: number) => new Date(now - days * 86_400_000 + hour * 3_600_000).toISOString();
    const article = (id: string, published: string, source = "A") =>
      ({ id, title: id, url: id, source, published, excerpt: "" });
    const picked = selectArticles([
      article("a", at(0, -1)),
      article("a", at(0, -1)),
      ...Array.from({ length: 8 }, (_, index) => article(`flood${index}`, at(0, -2 - index))),
      article("old", at(9, 0)),
      article("other-source", at(0, -3), "B"),
    ], now);
    expect(picked.some((entry) => entry.id === "old")).toBe(false);
    expect(picked.filter((entry) => entry.id === "a")).toHaveLength(1);
    // Five of one source per day, so the other source is not squeezed off the page.
    expect(picked.filter((entry) => entry.source === "A")).toHaveLength(5);
    expect(picked.some((entry) => entry.source === "B")).toBe(true);
  });

  it("caps an excerpt rather than running a paragraph across the card", () => {
    const long = `<p>${"word ".repeat(80)}</p>`;
    expect(excerptFrom(long).length).toBeLessThanOrEqual(220);
    expect(excerptFrom(long).endsWith("…")).toBe(true);
  });
});

describe("a club's own team news for a gameweek", () => {
  // FPL's own names, which is where the matcher gets them.
  const teams = new Map([["arsenal", "ARS"], ["spurs", "TOT"], ["man utd", "MUN"], ["aston villa", "AVL"]]);

  it("reads the club and the gameweek out of the headline", () => {
    expect(teamNewsFor("Bruno G, Saka, Timber: Arsenal injury latest for FPL Gameweek 1", teams))
      .toEqual({ club: "ARS", gameweek: 1 });
    expect(teamNewsFor("Manzambi, Madjo, Watkins: Aston Villa injury latest for FPL Gameweek 12", teams))
      .toEqual({ club: "AVL", gameweek: 12 });
  });

  it("knows the names the two spell differently", () => {
    // Fantasy Football Scout writes Man United and Tottenham; FPL files them as Man Utd and
    // Spurs, so neither would match the other's list without this.
    expect(teamNewsFor("Sesko, Mount, De Ligt: Man United injury latest for FPL Gameweek 1", teams))
      .toEqual({ club: "MUN", gameweek: 1 });
    expect(teamNewsFor("Porro, Solanke: Tottenham injury latest for FPL Gameweek 1", teams))
      .toEqual({ club: "TOT", gameweek: 1 });
  });

  it("returns nothing rather than guessing", () => {
    // A headline that is not one of these, and a club nobody has heard of.
    expect(teamNewsFor("FPL Gameweek 2 team news: Wednesday's live injury updates", teams)).toBeUndefined();
    expect(teamNewsFor("Someone: Real Madrid injury latest for FPL Gameweek 1", teams)).toBeUndefined();
    expect(teamNewsFor("Best cheap FPL players for a Gameweek 2 Bench Boost", teams)).toBeUndefined();
  });
});

describe("the daily cap", () => {
  const piece = (over: Partial<Article>): Article => ({
    id: String(Math.random()), title: "t", url: "u", source: "Fantasy Football Scout",
    published: "2026-08-27T12:00:00Z", excerpt: "", ...over,
  });

  it("holds an ordinary source to five a day", () => {
    const many = Array.from({ length: 9 }, (_, index) => piece({ id: `a${index}` }));
    expect(selectArticles(many, Date.parse("2026-08-27T18:00:00Z"))).toHaveLength(5);
  });

  it("lets every club's own piece through", () => {
    // Twenty land on one afternoon; the cap would keep five, and which five would be
    // arbitrary.
    const clubs = Array.from({ length: 20 }, (_, index) => piece({ id: `c${index}`, club: `C${index}`, gameweek: 2 }));
    expect(selectArticles(clubs, Date.parse("2026-08-27T18:00:00Z"))).toHaveLength(20);
  });
});

/** The real headlines Fantasy Football Scout published for Gameweek 1 on 21 Aug. */
const HEADLINES = [
  "Bruno G, Saka, Timber: Arsenal injury latest for FPL Gameweek 1",
  "Sesko, Mount, De Ligt: Man United injury latest for FPL Gameweek 1",
  "Porro, Solanke, Van de Ven: Tottenham injury latest for FPL Gameweek 1",
  "Rogers, Enzo, Welbeck: Chelsea injury latest for FPL Gameweek 1",
  "Norgaard, Garner: Everton injury latest for FPL Gameweek 1",
  "Gomez, David, Minteh: Brighton injury latest for FPL Gameweek 1",
  "Ekitike, Jones, Gomez: Liverpool injury latest for FPL Gameweek 1",
  "Dedic, Livramento: Newcastle injury latest for FPL Gameweek 1",
  "Manzambi, Madjo, Watkins: Aston Villa injury latest for FPL Gameweek 1",
  // Not one of these: an aggregate piece and a chip article, both real.
  "FPL Gameweek 2 team news: Wednesday's live injury updates",
  "Best cheap FPL players for a Gameweek 2 Bench Boost",
];

const pressFeed = `<rss><channel>${HEADLINES.map((title, index) =>
  `<item><title><![CDATA[${title}]]></title><link>https://x/${index}</link>`
  + `<pubDate>Fri, 21 Aug 2026 ${String(9 + index).padStart(2, "0")}:00:00 GMT</pubDate>`
  + "<description><![CDATA[lead]]></description></item>").join("")}</channel></rss>`;

/** FPL's own names, which is where the matcher gets them. */
const feedTeams = new Map(Object.entries({
  arsenal: "ARS", "man utd": "MUN", spurs: "TOT", chelsea: "CHE", everton: "EVE",
  brighton: "BHA", liverpool: "LIV", newcastle: "NEW", "aston villa": "AVL",
}));

describe("a press day, end to end", () => {
  const parsed = parseFeed(pressFeed, "Fantasy Football Scout", feedTeams);
  const selected = selectArticles(parsed, Date.parse("2026-08-21T20:00:00Z"));

  it("tags every club piece and nothing else", () => {
    expect(parsed.filter((article) => article.club)).toHaveLength(9);
    expect(parsed.filter((article) => !article.club)).toHaveLength(2);
  });

  it("carries all nine past a cap of five a day", () => {
    // The cap is the whole reason these are recognised: it would have kept five of nine,
    // and which four it dropped would have been an accident of publishing order.
    expect(selected.filter((article) => article.club)).toHaveLength(9);
    expect(selected.filter((article) => !article.club).length).toBeLessThanOrEqual(5);
  });
});
