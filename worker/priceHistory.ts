/**
 * The price change log.
 *
 * FPL publishes a price, never the moment it moved. The bootstrap carries `now_cost` and
 * `cost_change_start`, and both are totals: after 02:00 a player simply costs a tenth more
 * than he did, with nothing anywhere saying when, or from what. Every price history on the
 * internet — LiveFPL's, FPL Statistics' — is built the same way this one is, by diffing
 * successive snapshots and stamping the time itself. So the log only knows what it has
 * watched: it starts empty and fills a night at a time.
 *
 * Prices move once a day, at a time FPL publishes, so this does not poll like the event
 * feed does. The stored value carries the moment it is next worth looking, and a tick
 * outside the change window returns after one KV read without fetching anything.
 */

export interface PriceChange {
  /** Stable across ticks: one player changes at most once per night. */
  id: string;
  /** When the diff was noticed, which is within a minute of the change itself. */
  at: string;
  element: number;
  player: string;
  club: string;
  clubName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  /** Millions, the same unit the page prints. */
  from: number;
  to: number;
  /** Where the player stands against his starting price after this change. */
  seasonChange: number;
  ownership: number;
}

export interface PriceHistoryEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface HistoryElement {
  id: number;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  cost_change_start: number;
  selected_by_percent: string;
}

interface Bootstrap {
  elements: HistoryElement[];
  teams: Array<{ id: number; short_name: string; name: string }>;
  game_config?: { settings?: { price_change_deadlines?: string[] } };
}

export interface StoredHistory {
  /** element id → `now_cost` in tenths, as FPL states it. */
  snapshot: Record<string, number>;
  /** The next moment worth fetching the bootstrap; before it, a tick does nothing. */
  checkAfter?: string;
  changes: PriceChange[];
}

const HISTORY_KEY = "prices:history";

/** Roughly a month of nights. Older than that and it is a season summary, not news. */
const MAX_CHANGES = 1200;
const MAX_AGE_MS = 31 * 86_400_000;

/**
 * How long after a published deadline the log keeps watching every tick.
 *
 * The deadline is not when the new prices appear. FPL publishes 23:00Z, and the prices
 * themselves land somewhere around 00:30–01:30Z — an hour and a half later, and not to the
 * minute. Four hours covers that with room to spare; the window costs nothing but a fetch a
 * minute while it is open, and it closes the moment a change is actually seen.
 */
const WINDOW_MS = 4 * 3_600_000;

/**
 * The one night that happened before the log existed.
 *
 * 25 August 2026 was the first price change of the season and the only one before this was
 * built, so it is written down here rather than lost: four players, read off LiveFPL's own
 * page, and every one of them checked against FPL's `now_cost` and `cost_change_start` —
 * Sangaré and De Cuyper are +0.1 on the season and Gyökeres and Martinelli −0.1, which is
 * only true if these four moves are the whole of their season. Nothing else is seeded and
 * nothing else can be: this is the last night for which a source outside the log exists.
 *
 * The time is FPL's window rather than a minute anybody recorded, and the ownership is
 * today's rather than that night's. Both are stated here because neither can be recovered.
 */
export const SEEDED_CHANGES: PriceChange[] = [
  { id: "565:2026-08-26:56", at: "2026-08-26T01:30:00Z", element: 565, player: "M.Sangaré", club: "BRE", clubName: "Brentford", position: "MID", from: 5.5, to: 5.6, seasonChange: 0.1, ownership: 6.8 },
  { id: "115:2026-08-26:46", at: "2026-08-26T01:30:00Z", element: 115, player: "De Cuyper", club: "BHA", clubName: "Brighton", position: "DEF", from: 4.5, to: 4.6, seasonChange: 0.1, ownership: 6.2 },
  { id: "25:2026-08-26:74", at: "2026-08-26T01:30:00Z", element: 25, player: "Gyökeres", club: "ARS", clubName: "Arsenal", position: "FWD", from: 7.5, to: 7.4, seasonChange: -0.1, ownership: 7.5 },
  { id: "18:2026-08-26:64", at: "2026-08-26T01:30:00Z", element: 18, player: "Martinelli", club: "ARS", clubName: "Arsenal", position: "MID", from: 6.5, to: 6.4, seasonChange: -0.1, ownership: 0.2 },
];

/**
 * The log as the page reads it: what has been watched, plus the night that was not.
 *
 * The seed is merged rather than written into KV so that it cannot be lost with the value
 * and cannot be duplicated by it — the ids are the log's own scheme, so if the watcher ever
 * did record one of these moves, its own line wins and the seed drops out.
 */
export function allChanges(stored: StoredHistory | null): PriceChange[] {
  const known = new Set((stored?.changes ?? []).map((entry) => entry.id));
  return [...(stored?.changes ?? []), ...SEEDED_CHANGES.filter((entry) => !known.has(entry.id))]
    .sort((a, b) => b.at.localeCompare(a.at));
}

const positions = ["GK", "DEF", "MID", "FWD"] as const;

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
  });
  if (!response.ok) throw new Error(`FPL ${path} ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Whether the moment is inside a change window: a published deadline has passed within the
 * last few hours. Deadlines already spent drop out of FPL's list, so a list whose
 * first entry is still ahead says nothing about tonight — the day's own deadline is gone
 * from it by the time the prices move. That is why the window is measured from the entries
 * that have passed, and an empty list is treated as open rather than closed.
 */
export function inChangeWindow(deadlines: string[], now: number): boolean {
  const passed = deadlines.map(Date.parse).filter((time) => time <= now);
  if (!passed.length) return false;
  return now - Math.max(...passed) < WINDOW_MS;
}

/**
 * When it is next worth spending a fetch.
 *
 * Inside the window every tick looks, because the change can land on any of them. The gate
 * is then the deadline that opened the window — a moment already past, so it lets every
 * tick through, and the same moment on each of them, so a night of quiet ticks agrees with
 * itself and none of them writes. A clock reading would differ every minute and cost a
 * write for saying nothing.
 *
 * Outside the window the next published deadline is the next thing that can move a price,
 * and there is nothing to see until then. With no deadline left to wait for — FPL's list
 * runs out over an international break — the gate is an hour, which is cheap and keeps the
 * log honest about a change nobody announced.
 */
export function nextCheck(deadlines: string[], now: number): string {
  const times = deadlines.map(Date.parse);
  if (inChangeWindow(deadlines, now)) return new Date(Math.max(...times.filter((time) => time <= now))).toISOString();
  const upcoming = times.filter((time) => time > now).sort((a, b) => a - b)[0];
  return new Date(upcoming ?? now + 3_600_000).toISOString();
}

/**
 * One night's changes, as the difference between what was stored and what FPL now says.
 *
 * A player missing from the snapshot is seeded in silence: he is either the first write of
 * all, or a mid-season addition whose price the log has never seen and therefore cannot
 * claim moved.
 */
export function changesBetween(
  snapshot: Record<string, number>,
  bootstrap: Bootstrap,
  at: string,
): PriceChange[] {
  const teamById = new Map(bootstrap.teams.map((team) => [team.id, team]));
  const changes: PriceChange[] = [];
  for (const element of bootstrap.elements) {
    const before = snapshot[element.id];
    if (before === undefined || before === element.now_cost) continue;
    const team = teamById.get(element.team);
    changes.push({
      // The date rather than the minute: a replayed tick that saw the same move must not
      // write it twice, and two moves of one player on one night do not happen.
      id: `${element.id}:${at.slice(0, 10)}:${element.now_cost}`,
      at,
      element: element.id,
      player: element.web_name,
      club: team?.short_name ?? "—",
      clubName: team?.name ?? "—",
      position: positions[element.element_type - 1] ?? "MID",
      from: before / 10,
      to: element.now_cost / 10,
      seasonChange: element.cost_change_start / 10,
      ownership: Number(element.selected_by_percent),
    });
  }
  return changes;
}

export async function readHistory(env: PriceHistoryEnv): Promise<StoredHistory | null> {
  return await env.TELEGRAM_STATE.get<StoredHistory>(HISTORY_KEY, "json");
}

export async function updatePriceHistory(
  env: PriceHistoryEnv,
  now = Date.now(),
): Promise<{ written: boolean; added: number }> {
  const stored = await readHistory(env);
  // The whole point of the gate: on all but a few ticks a day this is the end of the work.
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, added: 0 };

  const bootstrap = await fpl<Bootstrap>("/bootstrap-static/");
  const deadlines = bootstrap.game_config?.settings?.price_change_deadlines ?? [];
  const at = new Date(now).toISOString();
  const snapshot: Record<string, number> = {};
  for (const element of bootstrap.elements) snapshot[element.id] = element.now_cost;

  const fresh = stored ? changesBetween(stored.snapshot, bootstrap, at) : [];
  const known = new Set((stored?.changes ?? []).map((entry) => entry.id));
  const added = fresh.filter((entry) => !known.has(entry.id));
  const changes = [...added, ...(stored?.changes ?? [])]
    .filter((entry) => now - Date.parse(entry.at) < MAX_AGE_MS)
    .slice(0, MAX_CHANGES);

  // Prices move once a night. Once the move has been seen there is nothing else coming, so
  // the window closes early rather than fetching the bootstrap every minute until it times
  // out — which is most of what the window would otherwise be spent doing.
  const checkAfter = added.length ? nextCheck(deadlines, now + WINDOW_MS) : nextCheck(deadlines, now);
  // A write costs one of the day's thousand, so a tick that found nothing and has nothing
  // new to say about when to look again writes nothing at all.
  const settled = stored
    && !added.length
    && changes.length === stored.changes.length
    && stored.checkAfter === checkAfter;
  if (settled) return { written: false, added: 0 };

  await env.TELEGRAM_STATE.put(HISTORY_KEY, JSON.stringify({ snapshot, checkAfter, changes } satisfies StoredHistory));
  if (added.length) {
    console.log(JSON.stringify({ event: "price_changes_logged", added: added.length }));
  }
  return { written: true, added: added.length };
}
