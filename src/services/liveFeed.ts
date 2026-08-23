export type EventKind =
  | "goal" | "assist" | "own_goal" | "yellow" | "red"
  | "penalty_save" | "penalty_miss" | "save_point" | "defcon" | "bonus";

export interface FeedEvent {
  id: string;
  at: string;
  gameweek: number;
  element: number;
  player: string;
  club: string;
  clubName?: string;
  kind: EventKind;
  value: number;
  pointsDelta: number;
  points: number;
  fixture?: { home: string; away: string; homeScore: number; awayScore: number; minutes: number };
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/**
 * The feed lives on the Worker root rather than under `/api`, which only proxies FPL. With
 * no Worker configured — a bare `npm run dev` — there is nothing to read, and the ticker
 * says so instead of inventing events.
 */
export const feedEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/events` : null;

export async function loadFeed(gameweek: number): Promise<FeedEvent[] | null> {
  if (!feedEndpoint) return null;
  const response = await fetch(`${feedEndpoint}?gw=${gameweek}`);
  if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
  const body = await response.json() as { events?: FeedEvent[] };
  return body.events ?? [];
}
