import { describe, expect, it } from "vitest";
import { parseFeed, selectArticles } from "../../worker/articles";
import { pressersFor } from "./articles";

/**
 * The real headlines Fantasy Football Scout published for Gameweek 1 on 21 Aug, run through
 * the whole path: the feed parser, the daily cap, and the per-club selection the page makes.
 * Nine clubs on one afternoon is exactly the case the cap used to eat.
 */
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

const feed = `<rss><channel>${HEADLINES.map((title, index) =>
  `<item><title><![CDATA[${title}]]></title><link>https://x/${index}</link>`
  + `<pubDate>Fri, 21 Aug 2026 ${String(9 + index).padStart(2, "0")}:00:00 GMT</pubDate>`
  + "<description><![CDATA[lead]]></description></item>").join("")}</channel></rss>`;

/** FPL's own names, which is where the matcher gets them. */
const teams = new Map(Object.entries({
  arsenal: "ARS", "man utd": "MUN", spurs: "TOT", chelsea: "CHE", everton: "EVE",
  brighton: "BHA", liverpool: "LIV", newcastle: "NEW", "aston villa": "AVL",
}));

describe("a press day, end to end", () => {
  const parsed = parseFeed(feed, "Fantasy Football Scout", teams);
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

  it("gives the page one piece per club for the gameweek asked for", () => {
    const pressers = pressersFor(selected, 1);
    expect(pressers.map((article) => article.club)).toEqual(
      ["ARS", "AVL", "BHA", "CHE", "EVE", "LIV", "MUN", "NEW", "TOT"],
    );
    // A gameweek nobody has written about yet is empty rather than falling back to an older
    // one — last week's press conference is a record of a match already played.
    expect(pressersFor(selected, 2)).toEqual([]);
  });

  it("keeps only the latest piece when a club gets two", () => {
    const twice = [...selected, {
      ...selected.find((article) => article.club === "ARS")!,
      id: "later", published: "2026-08-21T18:00:00Z", title: "Later: Arsenal injury latest for FPL Gameweek 1",
    }];
    const arsenal = pressersFor(twice, 1).filter((article) => article.club === "ARS");
    expect(arsenal).toHaveLength(1);
    expect(arsenal[0].id).toBe("later");
  });
});
