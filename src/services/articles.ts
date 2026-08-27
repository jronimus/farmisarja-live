/**
 * The article list, as the Worker keeps it.
 *
 * Two feeds, whitelisted, filtered by the publisher's own categories and capped so one
 * masthead cannot fill a day. Everything about why is in `worker/articles.ts`; this end only
 * reads it, because RSS cannot be fetched from a browser at all — none of these publishers
 * sends CORS headers.
 */

export interface Article {
  id: string;
  title: string;
  url: string;
  source: string;
  published: string;
  excerpt: string;
  topic?: string;
  /** FPL's own short club name, when this is that club's team-news piece for a gameweek. */
  club?: string;
  /** The gameweek it is about. */
  gameweek?: number;
}

/**
 * One piece per club for the gameweek that has not been played yet.
 *
 * Fantasy Football Scout writes these off each manager's press conference, and they are the
 * closest thing there is to hearing it from the manager. **Only the coming gameweek's**: the
 * whole value of a press conference is that it is about the team sheet nobody has seen, and
 * last week's is a record of a match that has already been played.
 *
 * Newest first per club, because on a press day a club can get more than one and the later
 * one has heard more.
 */
export function pressersFor(articles: Article[], gameweek: number): Article[] {
  return articles
    .filter((article) => article.club && article.gameweek === gameweek)
    .sort((a, b) => a.club!.localeCompare(b.club!) || b.published.localeCompare(a.published))
    .filter((article, index, list) => index === 0 || list[index - 1].club !== article.club);
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/** On the Worker root beside the feed and the price log; `/api` is FPL's proxy alone. */
export const articlesEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/articles` : null;

export async function loadArticles(): Promise<Article[] | null> {
  if (!articlesEndpoint) return null;
  const response = await fetch(articlesEndpoint);
  if (!response.ok) throw new Error(`Articles request failed: ${response.status}`);
  const body = await response.json() as { articles?: Article[] };
  return body.articles ?? [];
}

/** The topics actually present, in a fixed order, so the filter row does not reshuffle. */
export const TOPIC_ORDER = ["team-news", "notes", "picks", "captaincy", "chips", "transfers", "prices", "setpieces", "preview", "analysis"] as const;

export function topicsPresent(articles: Article[]): string[] {
  const present = new Set(articles.map((article) => article.topic).filter(Boolean) as string[]);
  return TOPIC_ORDER.filter((topic) => present.has(topic));
}
