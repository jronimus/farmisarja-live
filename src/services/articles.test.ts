import { describe, expect, it } from "vitest";
import { pressersFor, type Article } from "./articles";

/**
 * The real headlines Fantasy Football Scout published for Gameweek 1 on 21 Aug.
 *
 * The parser and the daily cap are tested against the same nine in `worker/articles.test.ts`,
 * where the Cloudflare types live — a test in `src/` that imports Worker code drags it into
 * the app's TypeScript project, which has no `KVNamespace` and no `cf` on a request, and the
 * incremental build hid that locally until the deploy failed on it.
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

const article = (club: string, title: string, published: string, gameweek = 1): Article => ({
  id: `${club}-${published}`, title, url: `https://x/${club}`, source: "Fantasy Football Scout",
  published, excerpt: "", club, gameweek,
});

const pieces = [
  article("ARS", HEADLINES[0], "2026-08-21T09:00:00Z"),
  article("MUN", HEADLINES[1], "2026-08-21T10:00:00Z"),
  article("TOT", HEADLINES[2], "2026-08-21T11:00:00Z"),
  article("CHE", HEADLINES[3], "2026-08-21T12:00:00Z"),
];

describe("the pieces the page shows", () => {
  it("gives one per club for the gameweek asked for", () => {
    expect(pressersFor(pieces, 1).map((entry) => entry.club)).toEqual(["ARS", "CHE", "MUN", "TOT"]);
  });

  it("is empty for a gameweek nobody has written about yet", () => {
    // Rather than falling back to an older one: last week's press conference is a record of
    // a match that has already been played.
    expect(pressersFor(pieces, 2)).toEqual([]);
  });

  it("keeps only the latest piece when a club gets two", () => {
    const twice = [...pieces, article("ARS", "Later: Arsenal injury latest for FPL Gameweek 1", "2026-08-21T18:00:00Z")];
    const arsenal = pressersFor(twice, 1).filter((entry) => entry.club === "ARS");
    expect(arsenal).toHaveLength(1);
    expect(arsenal[0].published).toBe("2026-08-21T18:00:00Z");
  });
});
