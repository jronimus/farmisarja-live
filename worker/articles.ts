import { pressersFrom, type Presser } from "./pressers";
/**
 * The article feed.
 *
 * RSS, from a whitelist of two, rather than a news API over the whole internet. That is the
 * junk filter: a search for "Fantasy Premier League" returns every tabloid that has noticed
 * the phrase, and the free tiers of NewsAPI and GNews are 12–24 hours behind anyway, which
 * for a Friday deadline is worthless.
 *
 * Eleven candidate feeds were tested on 26 Aug 2026. Two are alive and worth reading:
 * Fantasy Football Scout's own `/feed/` (12 items, several a day, fresh within the hour)
 * and AllAboutFPL (about one a week). The rest were dead or never existed —
 * fantasyfootballfix.com and fplfocus.com answer 404, planetfpl.com does not respond,
 * premierleague.com and the Guardian publish no RSS at all, Reddit rate-limits a
 * datacenter IP, and the tag feed the internet recommends
 * (`/tag/fantasy-premier-league/feed/`) returns an HTML page with no items in it.
 *
 * The browser cannot read any of them directly — no CORS — so the Worker does it, the same
 * way it already keeps the event log and the price log.
 */

export interface Article {
  /** The link, which is the only identifier a feed reliably gives. */
  id: string;
  title: string;
  url: string;
  source: string;
  published: string;
  excerpt: string;
  /** Our own tag, mapped from the publisher's category. Absent when it maps to nothing. */
  topic?: string;
  /**
   * FPL's own short club name, when this is that club's team-news piece for a gameweek.
   *
   * Fantasy Football Scout writes one of these per club off the manager's press conference,
   * titled *"Bruno G, Saka, Timber: Arsenal injury latest for FPL Gameweek 1"*. Twenty of
   * them land on the same afternoon, which is why they are recognised rather than left in
   * the general list: the per-day cap would throw away fifteen of the twenty.
   */
  club?: string;
  /** The gameweek that piece is about, which is the only one worth reading before a deadline. */
  gameweek?: number;
}

export interface ArticlesEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredArticles {
  checkAfter: string;
  articles: Article[];
  /** Which clubs have spoken about the coming gameweek, and where to read it. */
  pressers?: Presser[];
  /** The gameweek those pressers are for, so a stale set is not shown against a new one. */
  pressersFor?: number;
}

const ARTICLES_KEY = "articles:list";

const SOURCES = [
  { name: "Fantasy Football Scout", url: "https://www.fantasyfootballscout.co.uk/feed/" },
  { name: "AllAboutFPL", url: "https://allaboutfpl.com/feed/" },
];

/** Twenty minutes. These are articles, not scores; a fresher feed would only cost writes. */
const CHECK_MS = 20 * 60_000;
/** A wildcard draft for Gameweek 2 is dead by Gameweek 4. */
const MAX_AGE_MS = 7 * 86_400_000;
/**
 * Sixty was chosen when a day held five or six pieces. A press day adds twenty club pieces
 * on top of them, and dropping the twentieth club because the number was set two weeks ago
 * would be the cap deciding which half of the league is worth reading.
 */
const MAX_ARTICLES = 90;
/**
 * How many of one source's articles may share a day.
 *
 * Fantasy Football Scout publishes six or seven a day and AllAboutFPL one a week, so
 * without a cap the list is one masthead with a rounding error attached. The cap is per
 * day rather than overall so a quiet Tuesday still shows what there was.
 */
const PER_SOURCE_PER_DAY = 5;

/**
 * The club whose team news a headline is about, and the gameweek it is for.
 *
 * The shape is fixed and the club is spelt out in full: *"<players>: <Club> injury latest
 * for FPL Gameweek <n>"*. Matching the club name against FPL's own list means no table of
 * our own to keep in step — only the handful of names the two spell differently, which is
 * what `ALIASES` holds. A headline that does not fit the shape is not one of these, and
 * says so by returning nothing rather than by guessing.
 */
const ALIASES: Record<string, string> = {
  "man united": "MUN", "manchester united": "MUN", "man utd": "MUN",
  "manchester city": "MCI", "tottenham": "TOT", "tottenham hotspur": "TOT",
  "nottingham forest": "NFO", "forest": "NFO", "wolves": "WOL",
  "brighton and hove albion": "BHA", "west ham": "WHU", "leicester": "LEI",
};

const TEAM_NEWS = /^.*?:\s*(.+?)\s+injury latest for FPL Gameweek\s+(\d+)/i;

export function teamNewsFor(title: string, shortByName: Map<string, string>): { club: string; gameweek: number } | undefined {
  const match = TEAM_NEWS.exec(title);
  if (!match) return undefined;
  const name = match[1].trim().toLowerCase();
  const club = shortByName.get(name) ?? ALIASES[name];
  if (!club) return undefined;
  return { club, gameweek: Number(match[2]) };
}

/**
 * The publisher's own category, mapped to ours.
 *
 * This is the whole junk filter and it costs nothing, because Fantasy Football Scout tags
 * every post itself: `Team News`, `Scout Picks`, `Chip Strategy`, `Set Piece Takers`. No
 * keyword guessing, no reading the title for the letters FPL. Anything unmapped keeps the
 * article but shows no tag — the lowercase entries in a WordPress feed are SEO tags rather
 * than categories, and there are six of them per post.
 */
const TOPICS: Record<string, string> = {
  "team news": "team-news",
  "scout notes": "notes",
  "scout picks": "picks",
  "scout picks - bus team": "picks",
  "scout reports": "analysis",
  "moving target": "analysis",
  "the great and the good": "analysis",
  "chip strategy": "chips",
  "set piece takers": "setpieces",
  "differential picks": "picks",
  "captain picks": "captaincy",
  "captaincy": "captaincy",
  "game week preview": "preview",
  "transfers": "transfers",
  // Price posts arrive tagged by direction rather than by subject, so all three map to one.
  "fpl price changes": "prices",
  "fpl price rises": "prices",
  "fpl price falls": "prices",
  "statistics": "analysis",
};

const between = (xml: string, tag: string): string | null => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
};

/** CDATA off, entities out, tags stripped, whitespace squeezed. */
export function plain(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    // Not &#8217;: the numeric pass above has already turned it into the curly apostrophe
    // the publisher actually typed, and flattening that to an ASCII quote is a correction
    // nobody asked for.
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    // Last, so an escaped entity inside another one cannot be revived by an earlier pass.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The sentence the feed leads with, without WordPress's tail.
 *
 * Every WordPress feed ends its excerpt with "The post X appeared first on Y", which is a
 * back-link and not a summary; left in, it is the longest thing on every card and it is the
 * same on all of them.
 */
export function excerptFrom(description: string): string {
  const first = description.match(/<p>([\s\S]*?)<\/p>/);
  const text = plain(first ? first[1] : description);
  const trimmed = text.replace(/\s*The post .*? appeared first on .*$/i, "").trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 217).trimEnd()}…` : trimmed;
}

/** Our tag for a post, from the first of the publisher's categories that we know. */
export function topicFor(categories: string[]): string | undefined {
  for (const category of categories) {
    const topic = TOPICS[category.toLowerCase().trim()];
    if (topic) return topic;
  }
  return undefined;
}

export function parseFeed(xml: string, source: string, shortByName: Map<string, string> = new Map()): Article[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  const out: Article[] = [];
  for (const item of items) {
    const link = plain(between(item, "link") ?? "");
    const title = plain(between(item, "title") ?? "");
    const date = between(item, "pubDate");
    const published = date ? new Date(Date.parse(plain(date))) : null;
    if (!link || !title || !published || Number.isNaN(published.getTime())) continue;
    const categories = [...item.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map((match) => plain(match[1]));
    out.push({
      id: link,
      title,
      url: link,
      source,
      published: published.toISOString(),
      excerpt: excerptFrom(between(item, "description") ?? ""),
      topic: topicFor(categories),
      ...teamNewsFor(title, shortByName),
    });
  }
  return out;
}

/**
 * What the page gets: newest first, nothing stale, and no single masthead filling a day.
 *
 * Only the headline, the lead sentence and a link out are ever kept. AllAboutFPL puts the
 * whole article in its feed — 900 kB of it — and republishing that would be taking the
 * piece rather than pointing at it.
 */
export function selectArticles(articles: Article[], now: number): Article[] {
  const seen = new Set<string>();
  const perDay = new Map<string, number>();
  const out: Article[] = [];
  for (const article of [...articles].sort((a, b) => b.published.localeCompare(a.published))) {
    if (seen.has(article.id)) continue;
    if (now - Date.parse(article.published) > MAX_AGE_MS) continue;
    // A club's own team-news piece is exempt from the daily cap. Twenty of them arrive on
    // one afternoon and the cap keeps five, which would leave a page of team news covering
    // a quarter of the league — and the fifteen it dropped would be arbitrary.
    if (!article.club) {
      const key = `${article.source}:${article.published.slice(0, 10)}`;
      const count = perDay.get(key) ?? 0;
      if (count >= PER_SOURCE_PER_DAY) continue;
      perDay.set(key, count + 1);
    }
    seen.add(article.id);
    out.push(article);
    if (out.length >= MAX_ARTICLES) break;
  }
  return out;
}

export async function readArticles(env: ArticlesEnv): Promise<StoredArticles | null> {
  return await env.TELEGRAM_STATE.get<StoredArticles>(ARTICLES_KEY, "json");
}

export async function updateArticles(env: ArticlesEnv, now = Date.now()): Promise<{ written: boolean; count: number }> {
  const stored = await readArticles(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, count: 0 };

  // FPL's own club names, so the headline matcher has no table of its own to keep in step.
  let shortByName = new Map<string, string>();
  try {
    const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
      headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
      cf: { cacheEverything: true, cacheTtl: 3600 },
    }).then((response) => response.json() as Promise<{ teams: Array<{ name: string; short_name: string }> }>);
    shortByName = new Map(bootstrap.teams.map((team) => [team.name.toLowerCase(), team.short_name]));
  } catch (error) {
    // Without it the club pieces stay in the general list rather than the page breaking.
    console.error(JSON.stringify({ event: "article_teams_error", error: error instanceof Error ? error.message : String(error) }));
  }

  const fetched = await Promise.all(SOURCES.map(async (source) => {
    try {
      const response = await fetch(source.url, {
        headers: { Accept: "application/rss+xml, application/xml", "User-Agent": "Farmisarja-Live/0.1" },
        cf: { cacheEverything: true, cacheTtl: 600 },
      });
      if (!response.ok) throw new Error(`${source.name} ${response.status}`);
      return parseFeed(await response.text(), source.name, shortByName);
    } catch (error) {
      // One dead feed is not a dead page: the others still have something to say.
      console.error(JSON.stringify({ event: "article_feed_error", source: source.name, error: error instanceof Error ? error.message : String(error) }));
      return [] as Article[];
    }
  }));

  const articles = selectArticles(fetched.flat(), now);

  /**
   * Who has spoken about the coming gameweek.
   *
   * The gameweek is read off the club pieces and the running articles themselves rather than
   * from the fixture list: this file has no business knowing the calendar, and the headline
   * that says `Gameweek 2` is the same headline the reader is being pointed at.
   */
  const wanted = Math.max(0, ...articles.map((article) => article.gameweek ?? 0),
    ...articles.filter((article) => /team news:.*live injury updates/i.test(article.title))
      .map((article) => Number(/Gameweek\s+(\d+)/i.exec(article.title)?.[1] ?? 0)));
  let pressers: Presser[] = [];
  if (wanted > 0) {
    pressers = await pressersFrom(articles, wanted, shortByName, async (url) => {
      const response = await fetch(url, {
        headers: { Accept: "text/html", "User-Agent": "Farmisarja-Live/0.1" },
        cf: { cacheEverything: true, cacheTtl: 600 },
      });
      if (!response.ok) throw new Error(`${url} ${response.status}`);
      return await response.text();
    });
  }
  // A fetch that returned nothing at all leaves what is already stored alone rather than
  // wiping the page because both feeds happened to be down on one tick.
  if (!articles.length && stored?.articles.length) {
    await env.TELEGRAM_STATE.put(ARTICLES_KEY, JSON.stringify({ ...stored, checkAfter: new Date(now + CHECK_MS).toISOString() } satisfies StoredArticles));
    return { written: true, count: stored.articles.length };
  }
  await env.TELEGRAM_STATE.put(ARTICLES_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    articles,
    pressers,
    pressersFor: wanted,
  } satisfies StoredArticles));
  return { written: true, count: articles.length };
}
