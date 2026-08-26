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
