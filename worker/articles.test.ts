import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { excerptFrom, parseFeed, plain, selectArticles, topicFor } from "./articles";

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
