import type { Article } from "./articles";

/**
 * Which clubs have had their press conference for the coming gameweek, and where to read it.
 *
 * Fantasy Football Scout covers them two ways, and only having both makes the section
 * complete before a deadline:
 *
 * 1. **A running article per press day** — *"FPL Gameweek 2 team news: Wednesday's live
 *    injury updates"* — with a heading per club inside it. Wednesday and Thursday are mostly
 *    this, and it is the only place those clubs appear at all.
 * 2. **A piece per club on the Friday**, titled *"Bruno G, Saka, Timber: Arsenal injury
 *    latest for FPL Gameweek 1"*. `articles.ts` recognises those from the headline alone.
 *
 * The running article has to be read rather than matched, because the clubs it covers are
 * only in its body. It carries more than one list — `GAMEWEEK 2 PREMIER LEAGUE PRESSERS` and
 * `EFL CUP/CONFERENCE LEAGUE PRESSERS` — and **both count**.
 *
 * The first attempt took only the Premier League one, on the reasoning that a manager talking
 * about Tuesday's cup tie has said nothing about Saturday's team sheet. That was wrong, and
 * the article says so in as many words: under the cup heading, *"Alonso hopes Caicedo can be
 * available for the visit of Brighton this weekend"*, *"Fofana remains suspended"*, *"Palmer
 * is fine after Monday's substitution"*. **The heading says which match the press conference
 * was called for, not what was said in it** — a manager is asked about his squad, and the
 * answers are about the squad. Dropping that section threw away three clubs' worth of exactly
 * what this section exists to show.
 *
 * A heading that is not one of FPL's own club names is skipped rather than guessed at, so a
 * new section appearing in that article costs nothing.
 */

export interface Presser {
  /** FPL's own short club name. */
  club: string;
  gameweek: number;
  title: string;
  url: string;
  source: string;
  published: string;
  /** True when it is that club's own piece rather than a section of a running article. */
  own: boolean;
}

/** Any `<h2>` naming a set of pressers: the Premier League one, the cup one, whatever comes. */
const SECTION = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
/** The gameweek, which only the Premier League heading carries. */
const GAMEWEEK = /GAMEWEEK\s+(\d+)/i;
const CLUB_HEADING = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Every club listed under any pressers heading of one running article.
 *
 * Returns nothing at all when no such heading is there, which is the honest answer for a day
 * whose article has been published but not yet filled in.
 */
export function clubsInArticle(html: string, shortByName: Map<string, string>, fallbackGameweek = 0): { gameweek: number; clubs: string[] } | undefined {
  const sections = [...html.matchAll(SECTION)].filter((match) => /pressers/i.test(match[1]));
  if (!sections.length) return undefined;

  let gameweek = fallbackGameweek;
  const clubs: string[] = [];
  for (const [index, section] of sections.entries()) {
    const stated = GAMEWEEK.exec(text(section[1]));
    if (stated) gameweek = Number(stated[1]);
    const from = section.index + section[0].length;
    const to = sections[index + 1]?.index ?? html.length;
    for (const heading of html.slice(from, to).matchAll(CLUB_HEADING)) {
      const club = shortByName.get(text(heading[1]).toLowerCase());
      if (club && !clubs.includes(club)) clubs.push(club);
    }
  }
  return gameweek > 0 ? { gameweek, clubs } : undefined;
}

/** The running articles worth reading: a press day's own, for the gameweek being asked about. */
export function liveBlogs(articles: Article[], gameweek: number): Article[] {
  return articles
    .filter((article) => /team news:.*live injury updates/i.test(article.title))
    .filter((article) => !article.gameweek || article.gameweek === gameweek)
    .sort((a, b) => b.published.localeCompare(a.published));
}

export async function pressersFrom(
  articles: Article[],
  gameweek: number,
  shortByName: Map<string, string>,
  fetchPage: (url: string) => Promise<string>,
  limit = 2,
): Promise<Presser[]> {
  const out: Presser[] = [];

  // A club's own piece needs no reading: the headline names it.
  for (const article of articles) {
    if (article.club && article.gameweek === gameweek) {
      out.push({
        club: article.club, gameweek, title: article.title, url: article.url,
        source: article.source, published: article.published, own: true,
      });
    }
  }

  // The running articles, newest first. Two is a press week's worth — Wednesday's and
  // Thursday's — and the newest is the one still being added to.
  for (const article of liveBlogs(articles, gameweek).slice(0, limit)) {
    try {
      const found = clubsInArticle(await fetchPage(article.url), shortByName, gameweek);
      if (!found || found.gameweek !== gameweek) continue;
      for (const club of found.clubs) {
        out.push({
          club, gameweek, title: article.title, url: article.url,
          source: article.source, published: article.published, own: false,
        });
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "presser_read_error", url: article.url, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  return best(out);
}

/**
 * One per club: a club's own piece beats a section of a running article, and after that the
 * later reading wins.
 *
 * The Friday piece is written after the press conference and quotes it at length; a
 * Wednesday section is a paragraph filed as the manager spoke. Where both exist the reader
 * wants the fuller one.
 */
export function best(pressers: Presser[]): Presser[] {
  const byClub = new Map<string, Presser>();
  for (const presser of pressers) {
    const held = byClub.get(presser.club);
    if (!held
      || (presser.own && !held.own)
      || (presser.own === held.own && presser.published > held.published)) {
      byClub.set(presser.club, presser);
    }
  }
  return [...byClub.values()].sort((a, b) => a.club.localeCompare(b.club));
}
