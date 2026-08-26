import type { SquadPlayer } from "../types";

/**
 * The price change log, as the Worker keeps it.
 *
 * Nothing here is derived: the Worker watches FPL's prices and writes down what moved and
 * when, because FPL itself publishes only what a player costs today. The one consequence
 * worth knowing at this end is that the log has no past beyond the night it started —
 * there is no source to backfill it from, so the page says how far back it goes rather
 * than pretending a quiet week was a quiet week.
 */

export interface PriceChange {
  id: string;
  at: string;
  element: number;
  player: string;
  club: string;
  clubName?: string;
  position: SquadPlayer["position"];
  from: number;
  to: number;
  seasonChange: number;
  ownership: number;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/** Beside the feed on the Worker root; `/api` is the FPL proxy and this is not FPL's. */
export const historyEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/price-history` : null;

export async function loadPriceHistory(): Promise<PriceChange[] | null> {
  if (!historyEndpoint) return null;
  const response = await fetch(historyEndpoint);
  if (!response.ok) throw new Error(`Price history request failed: ${response.status}`);
  const body = await response.json() as { changes?: PriceChange[] };
  return body.changes ?? [];
}

export interface PriceChangeDay {
  /** The local calendar day the changes were noticed on, as `YYYY-MM-DD`. */
  day: string;
  /** The first moment logged on that day, which is what a heading is dated by. */
  at: string;
  risers: PriceChange[];
  fallers: PriceChange[];
}

/**
 * The night a change belongs to, in the reader's own zone.
 *
 * A price that moves at 01:30 GMT lands at 04:30 in Helsinki, on a date nobody calls it by:
 * the whole of FPL calls it Tuesday night's price changes, and so does LiveFPL's own page,
 * which titles that morning's list with the Tuesday. So the stamp is wound back half a day
 * before the date is read off it — anything between midnight and midday belongs to the day
 * before, anything after midday to its own day. It is the same reckoning the prediction
 * column uses for a deadline, read from the other side.
 */
export function nightOf(at: string): string {
  const date = new Date(Date.parse(at) - 12 * 3_600_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Changes grouped into the nights they belong to, newest first.
 *
 * Within a night the order is by ownership, so the moves that touch the most squads are
 * read first — every entry is exactly a tenth, so ownership is the only thing separating
 * them.
 */
export function groupByDay(changes: PriceChange[]): PriceChangeDay[] {
  const days = new Map<string, PriceChange[]>();
  for (const change of changes) {
    const day = nightOf(change.at);
    days.set(day, [...(days.get(day) ?? []), change]);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, entries]) => {
      const byOwnership = (a: PriceChange, b: PriceChange) => b.ownership - a.ownership || a.player.localeCompare(b.player);
      return {
        day,
        at: entries.map((entry) => entry.at).sort()[0],
        risers: entries.filter((entry) => entry.to > entry.from).sort(byOwnership),
        fallers: entries.filter((entry) => entry.to < entry.from).sort(byOwnership),
      };
    });
}

/** How far back the log actually reaches, which is not how far back the season does. */
export function loggedSince(changes: PriceChange[]): string | null {
  const earliest = changes.map((entry) => entry.at).sort()[0];
  return earliest ?? null;
}
