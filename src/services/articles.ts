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
 * Which clubs have spoken about the coming gameweek, and where to read it.
 *
 * Fantasy Football Scout covers a press week two ways and the section needs both: a running
 * article per press day with a heading per club inside it, which is all there is on the
 * Wednesday and Thursday, and a piece per club on the Friday. See `worker/pressers.ts`,
 * which also explains why the cup pressers in the same article are left out — a manager
 * talking about Tuesday's tie has said nothing about Saturday's team sheet.
 */
export interface Presser {
  /** Every club this one piece speaks for, in alphabetical order. */
  clubs: string[];
  gameweek: number;
  title: string;
  url: string;
  source: string;
  published: string;
  /** True when it is one club's own piece rather than a running article. */
  own: boolean;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/** On the Worker root beside the feed and the price log; `/api` is FPL's proxy alone. */
export const articlesEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/articles` : null;

export async function loadArticles(): Promise<{ articles: Article[]; pressers: Presser[]; pressersFor: number } | null> {
  if (!articlesEndpoint) return null;
  const response = await fetch(articlesEndpoint);
  if (!response.ok) throw new Error(`Articles request failed: ${response.status}`);
  const body = await response.json() as { articles?: Article[]; pressers?: Presser[]; pressersFor?: number };
  return { articles: body.articles ?? [], pressers: body.pressers ?? [], pressersFor: body.pressersFor ?? 0 };
}

/** The topics actually present, in a fixed order, so the filter row does not reshuffle. */
export const TOPIC_ORDER = ["pressers", "team-news", "notes", "picks", "captaincy", "chips", "transfers", "prices", "setpieces", "preview", "analysis"] as const;

export function topicsPresent(articles: Article[]): string[] {
  const present = new Set(articles.map((article) => article.topic).filter(Boolean) as string[]);
  return TOPIC_ORDER.filter((topic) => present.has(topic));
}
