/**
 * FPL's own figures, per gameweek, by writing down where the season totals stood.
 *
 * FPL publishes one window and one only: the season to date. So the statistics table had a
 * seam down the middle of it — the match statistics followed the reader's gameweek picker
 * and the FPL columns beside them were season totals whatever he picked. The picker said so,
 * which is not the same as it not being a seam.
 *
 * The way to close it is the way `priceHistory.ts` already closes the same gap for prices:
 * **snapshot the totals once per gameweek and difference successive snapshots.** A
 * gameweek's figures are the snapshot after it minus the snapshot before it.
 *
 * ### What it costs, measured rather than guessed
 *
 * 614 players × the 28 cumulative fields is **326 kB of JSON** written the obvious way, one
 * object per player, and 12 MB over a season. Written as a field list and a row of numbers
 * per player it is **43 kB**, and 1.7 MB over a season — the field names were seven eighths
 * of the file. A single KV value is capped at 25 MB, so either shape fits, but there is no
 * reason to spend eight times the storage and eight times the read.
 *
 * It is still **one key per gameweek** rather than one for the season. A finished gameweek's
 * totals never change, so its key is written once and never again: 38 writes a season against
 * a daily limit of a thousand. And a reader asking for two gameweeks should not be made to
 * read the other thirty-six.
 *
 * The season is not assembled from these at all. FPL's own bootstrap *is* the season total,
 * already on the page, so the season view costs nothing and the 38 KV reads never happen.
 *
 * ### Only the fields that accumulate
 *
 * Differencing a ratio produces a number that means nothing: `form` is an average over the
 * last four fixtures and `points_per_game` over all of them, so neither is here. Nor is
 * `event_points`, which is FPL's own per-gameweek figure and is already exact — a differenced
 * total would only be a worse copy of it, and it goes stale the moment the next gameweek
 * starts, which is exactly what a snapshot fixes.
 */

export interface FplHistoryEnv {
  TELEGRAM_STATE: KVNamespace;
}

/**
 * The cumulative fields, in FPL's own spelling.
 *
 * The order is the file format: a snapshot stores this list once and then a row of numbers
 * per player, so a field added in the middle would silently reinterpret every stored row.
 * **Append only.**
 */
export const FIELDS = [
  "total_points", "minutes", "starts", "goals_scored", "assists", "clean_sheets",
  "goals_conceded", "own_goals", "penalties_saved", "penalties_missed", "yellow_cards",
  "red_cards", "saves", "bonus", "bps", "influence", "creativity", "threat", "ict_index",
  "expected_goals", "expected_assists", "expected_goal_involvements",
  "expected_goals_conceded", "defensive_contribution", "clearances_blocks_interceptions",
  "recoveries", "tackles", "dreamteam_count",
] as const;

export interface Snapshot {
  gameweek: number;
  /** When the totals were read, which is not the gameweek's own end. */
  takenAt: string;
  fields: string[];
  /** `[elementId, ...values]`, in `fields` order. */
  rows: number[][];
}

/** Which gameweeks have a snapshot, so a tick knows what is missing without reading them. */
interface Cursor {
  checkAfter: string;
  taken: number[];
}

const CURSOR_KEY = "fplstats:cursor";
const snapshotKey = (gameweek: number) => `fplstats:gw:${gameweek}`;

/** A gameweek ends once a week; an hour between looks is already far more often than that. */
const CHECK_MS = 60 * 60_000;

interface Element { id: number; [field: string]: unknown }
interface Event { id: number; finished: boolean; data_checked: boolean }
interface Bootstrap { elements: Element[]; events: Event[] }

/** FPL sends most of these as strings — `"1.85"` for xG, `"12"` for minutes. */
function numberOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function snapshotFrom(elements: Element[], gameweek: number, takenAt: string): Snapshot {
  return {
    gameweek,
    takenAt,
    fields: [...FIELDS],
    rows: elements.map((element) => [element.id, ...FIELDS.map((field) => numberOf(element[field]))]),
  };
}

/**
 * One gameweek's figures: the snapshot after it, less the snapshot before it.
 *
 * A player missing from the earlier snapshot is a player who joined the game mid-season, and
 * his totals then *are* the gameweek's figures. A player missing from the later one has left
 * the game and has no figures for a gameweek he was not in.
 *
 * Negative results are clamped to zero. FPL does correct a total downwards after the fact —
 * a bonus point reallocated, an assist taken off somebody — and a negative "goals this
 * gameweek" is worse than a zero.
 */
export function difference(before: Snapshot | null, after: Snapshot): Map<number, number[]> {
  const earlier = new Map((before?.rows ?? []).map((row) => [row[0], row]));
  const out = new Map<number, number[]>();
  for (const row of after.rows) {
    const previous = earlier.get(row[0]);
    out.set(row[0], row.slice(1).map((value, index) => {
      const delta = value - (previous ? previous[index + 1] : 0);
      // Rounded because two floats that differ in the fifteenth decimal should read as 0.
      return delta > 0 ? Math.round(delta * 1000) / 1000 : 0;
    }));
  }
  return out;
}

/** Several gameweeks added together, which is what a reader picking a range asks for. */
export function sum(weeks: Array<Map<number, number[]>>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const week of weeks) {
    for (const [element, values] of week) {
      const held = out.get(element);
      if (!held) out.set(element, [...values]);
      else for (let index = 0; index < values.length; index += 1) {
        held[index] = Math.round((held[index] + values[index]) * 1000) / 1000;
      }
    }
  }
  return out;
}

export async function readCursor(env: FplHistoryEnv): Promise<Cursor | null> {
  return await env.TELEGRAM_STATE.get<Cursor>(CURSOR_KEY, "json");
}

export async function readSnapshot(env: FplHistoryEnv, gameweek: number): Promise<Snapshot | null> {
  return await env.TELEGRAM_STATE.get<Snapshot>(snapshotKey(gameweek), "json");
}

/**
 * The gameweek whose totals the bootstrap currently holds.
 *
 * Not the current gameweek and not the next one: the last one FPL has finished *and*
 * checked. Between the two, the season totals have had nothing added to them, which is the
 * one moment a snapshot is exactly that gameweek's own line.
 */
export function settledGameweek(events: Event[]): number {
  let settled = 0;
  for (const event of events) if (event.finished && event.data_checked) settled = Math.max(settled, event.id);
  return settled;
}

export async function updateFplHistory(env: FplHistoryEnv, now = Date.now()): Promise<{ written: number[] }> {
  const cursor = await readCursor(env);
  if (cursor?.checkAfter && Date.parse(cursor.checkAfter) > now) return { written: [] };

  const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  }).then((response) => response.json() as Promise<Bootstrap>);

  const settled = settledGameweek(bootstrap.events);
  const taken = new Set(cursor?.taken ?? []);
  const written: number[] = [];

  /**
   * Only the settled gameweek, and only once.
   *
   * A gameweek that ended before this ever ran cannot be recovered — its own line is the
   * difference between two totals nobody wrote down. The exception is the very first run,
   * where the settled gameweek's snapshot *is* its own figures because nothing has been
   * added to the totals since. That is why this took GW1: it went in before GW2 kicked off.
   */
  if (settled > 0 && !taken.has(settled)) {
    const snapshot = snapshotFrom(bootstrap.elements, settled, new Date(now).toISOString());
    await env.TELEGRAM_STATE.put(snapshotKey(settled), JSON.stringify(snapshot));
    taken.add(settled);
    written.push(settled);
  }

  await env.TELEGRAM_STATE.put(CURSOR_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    taken: [...taken].sort((a, b) => a - b),
  } satisfies Cursor));
  if (written.length) console.log(JSON.stringify({ event: "fpl_history_written", gameweeks: written }));
  return { written };
}

/**
 * The figures for a set of gameweeks, summed.
 *
 * A gameweek is only answerable when both ends of it were written down, and the first
 * snapshot taken is its own answer. Anything else is reported as unavailable rather than
 * guessed at — a gameweek differenced against nothing would return the whole season and
 * call it one week.
 */
export async function figuresFor(env: FplHistoryEnv, gameweeks: number[]): Promise<{
  fields: string[];
  players: Array<[number, ...number[]]>;
  unavailable: number[];
}> {
  const cursor = await readCursor(env);
  const taken = new Set(cursor?.taken ?? []);
  const first = Math.min(...(taken.size ? [...taken] : [Infinity]));

  const unavailable: number[] = [];
  const weeks: Array<Map<number, number[]>> = [];
  for (const gameweek of gameweeks) {
    if (!taken.has(gameweek)) { unavailable.push(gameweek); continue; }
    const after = await readSnapshot(env, gameweek);
    if (!after) { unavailable.push(gameweek); continue; }
    // The earliest snapshot has nothing before it, and needs nothing: it was taken in the
    // window where the season totals were that gameweek's own figures.
    if (gameweek === first) { weeks.push(difference(null, after)); continue; }
    // Every other gameweek is answerable only against the week immediately before it. A gap
    // cannot be differenced across — GW3 against GW1 would return two gameweeks and call
    // them one — so a missing neighbour makes this week unavailable rather than wrong.
    const before = taken.has(gameweek - 1) ? await readSnapshot(env, gameweek - 1) : null;
    if (!before) { unavailable.push(gameweek); continue; }
    weeks.push(difference(before, after));
  }

  const totals = sum(weeks);
  return {
    fields: [...FIELDS],
    players: [...totals].map(([element, values]) => [element, ...values] as [number, ...number[]]),
    unavailable,
  };
}
