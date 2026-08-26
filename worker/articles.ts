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
}

export interface ArticlesEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredArticles {
  checkAfter: string;
  articles: Article[];
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
const MAX_ARTICLES = 60;
/**
 * How many of one source's articles may share a day.
 *
 * Fantasy Football Scout publishes six or seven a day and AllAboutFPL one a week, so
 * without a cap the list is one masthead with a rounding error attached. The cap is per
 * day rather than overall so a quiet Tuesday still shows what there was.
 */
const PER_SOURCE_PER_DAY = 5;

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

export function parseFeed(xml: string, source: string): Article[] {
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
    const key = `${article.source}:${article.published.slice(0, 10)}`;
    const count = perDay.get(key) ?? 0;
    if (count >= PER_SOURCE_PER_DAY) continue;
    perDay.set(key, count + 1);
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

  const fetched = await Promise.all(SOURCES.map(async (source) => {
    try {
      const response = await fetch(source.url, {
        headers: { Accept: "application/rss+xml, application/xml", "User-Agent": "Farmisarja-Live/0.1" },
        cf: { cacheEverything: true, cacheTtl: 600 },
      });
      if (!response.ok) throw new Error(`${source.name} ${response.status}`);
      return parseFeed(await response.text(), source.name);
    } catch (error) {
      // One dead feed is not a dead page: the others still have something to say.
      console.error(JSON.stringify({ event: "article_feed_error", source: source.name, error: error instanceof Error ? error.message : String(error) }));
      return [] as Article[];
    }
  }));

  const articles = selectArticles(fetched.flat(), now);
  // A fetch that returned nothing at all leaves what is already stored alone rather than
  // wiping the page because both feeds happened to be down on one tick.
  if (!articles.length && stored?.articles.length) {
    await env.TELEGRAM_STATE.put(ARTICLES_KEY, JSON.stringify({ ...stored, checkAfter: new Date(now + CHECK_MS).toISOString() } satisfies StoredArticles));
    return { written: true, count: stored.articles.length };
  }
  await env.TELEGRAM_STATE.put(ARTICLES_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    articles,
  } satisfies StoredArticles));
  return { written: true, count: articles.length };
}
