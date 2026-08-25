/**
 * A live overall rank, which FPL does not publish and cannot be derived from what it does.
 *
 * FPL's own overall rank is a **pure function of total points** — every manager on 87
 * points shares rank 21 754, which is visible on any page of the global league — so the
 * only thing a rank needs is a count of how many managers are above a total. FPL publishes
 * that count for its own stored totals and for nothing else, and its stored totals lag: on
 * 25 Aug every GW1 fixture was confirmed and FPL's stored points still excluded every
 * autosub in the game.
 *
 * So the count is built here. The global league (id 314) holds every entry and is pageable
 * end to end, 50 rows a page, each row carrying an entry id and its true rank. Sampling it
 * gives a grid of real managers spread across the whole field; fetching their picks once
 * gives their squads; and scoring those squads from the same `/event/{gw}/live/` payload
 * the feed already reads gives their live totals. Where our own total falls among them is
 * the rank.
 *
 * **The expensive half happens once.** Picks freeze at the deadline, so the sample is built
 * over the ticks after it and every tick afterwards is arithmetic on data already in hand.
 *
 * Measured before any of this was written, against 195 managers drawn across the field:
 *
 * - Scoring is exact. All 104 squads with no autosubs matched FPL's own gameweek points to
 *   the point. Every one of the 87 that disagreed had autosubs, and disagreed upward.
 * - **Autosubs are worth 2.09 points to the average manager**, and 44 % of the field gains
 *   anything at all — those that do gain 4.76 each.
 * - Which is why looking a corrected total up on FPL's uncorrected curve is wrong, and by a
 *   lot: it moved our leader from 642 802 to 642 802 while the honest answer is 776 221. He
 *   gained nothing from autosubs and the field gained two points, so he goes **down**.
 */

export interface LiveRankEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface LeagueRow { entry: number; rank: number; total: number }
interface LeaguePage { standings: { results: LeagueRow[] } }
interface PickRow { element: number; multiplier: number; element_type: number }
interface PicksResponse {
  active_chip: string | null;
  picks: PickRow[];
  entry_history: { points: number; total_points: number; event_transfers_cost: number };
}

/** One sampled manager, stripped to what a score needs. */
export interface SampledEntry {
  /** FPL's entry id, kept so a sample can be topped up rather than rebuilt. */
  id: number;
  /** How many real managers this one stands for. */
  weight: number;
  /** Season points carried into this gameweek. */
  before: number;
  /** The hit taken this gameweek, already positive. */
  hit: number;
  /** element id, multiplier and element type, in squad order: 1–11 start, 12–15 bench. */
  picks: Array<[number, number, number]>;
}

export interface RankSample {
  version: number;
  gameweek: number;
  /** Entries FPL has ranked, which is what a rank is out of. */
  ranked: number;
  /** Pages still to fetch, and entries still to fetch picks for. */
  pending: Array<{ page: number; weight: number }>;
  queue: Array<{ id: number; weight: number }>;
  entries: SampledEntry[];
  /** Set once the queue empties, so a tick can tell a half-built sample from a finished one. */
  completedAt?: string;
}

/** The curve the page reads: how many of the sample stand above each total. */
export interface RankCurve {
  gameweek: number;
  ranked: number;
  /** Sampled managers, weighted — the denominator the counts are out of. */
  weight: number;
  /** Total points → the weight standing strictly above it, densest first. */
  above: Array<[number, number]>;
  scoredAt: string;
  /** How much of the sample is built, 0–1. Below 1 the curve is coarser than it will be. */
  coverage: number;
  /**
   * Every fixture is `finished` — confirmed, not merely at full time — so nothing about
   * this curve can move again. Bonus is still recalculated between the two.
   */
  settled: boolean;
}

export const SAMPLE_VERSION = 1;
/**
 * 120 pages of 8. The pages are spread on a log scale rather than evenly, because a rank is
 * read as a proportion: fifty thousand places matter at rank 600 000 and are invisible at
 * rank eight million. Evenly spaced pages put the same absolute resolution everywhere,
 * which measured 6.5 % out at the top of this league and 0.1 % at the bottom.
 */
export const SAMPLE_PAGES = 120;
export const PER_PAGE = 8;
/**
 * Requests per tick. A Worker invocation may make 50 subrequests on the free plan and the
 * cron already spends some on the feed, the Telegram schedule and this module's own
 * bootstrap read, so twenty leaves room rather than racing the ceiling. It finishes a
 * sample in under an hour, which is comfortably inside the gap between a Friday deadline
 * and a Saturday kick-off. This is also a public API being read in bulk: twenty requests a
 * minute, once a week, is a rate worth being able to state plainly.
 */
export const FETCH_BUDGET = 20;

const sampleKey = (gameweek: number) => `rank:gw:${gameweek}`;

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
  });
  if (!response.ok) throw new Error(`FPL ${path} ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Which pages to read, and how much of the field each one speaks for.
 *
 * Log-spaced, so the top of the table is resolved finely and the long tail coarsely. A page
 * stands for the managers between its neighbours' midpoints, which is what makes an uneven
 * sample still add up to the whole field.
 */
export function plannedPages(ranked: number, count = SAMPLE_PAGES, perPage = PER_PAGE): Array<{ page: number; weight: number }> {
  const pageCount = Math.max(1, Math.ceil(ranked / 50));
  const chosen = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const share = count === 1 ? 0 : index / (count - 1);
    chosen.add(Math.min(pageCount, Math.max(1, Math.round(pageCount ** share))));
  }
  const pages = [...chosen].sort((a, b) => a - b);
  return pages.map((page, index) => {
    const lower = index === 0 ? 1 : (pages[index - 1] + page) / 2;
    const upper = index === pages.length - 1 ? pageCount + 1 : (page + pages[index + 1]) / 2;
    // Managers this page speaks for, shared between the entries actually taken from it.
    return { page, weight: ((upper - lower) * 50) / perPage };
  });
}

/**
 * Take one tick's worth of the sample. Pages first, because each one produces the entries
 * the rest of the budget is spent on.
 */
export async function advanceSample(env: LiveRankEnv, now = Date.now()): Promise<{ fetched: number; entries: number; done: boolean }> {
  const bootstrap = await fpl<{ events: Array<{ id: number; is_current: boolean; ranked_count: number; deadline_time: string }> }>("/bootstrap-static/");
  const event = bootstrap.events.find((entry) => entry.is_current);
  if (!event || !event.ranked_count) return { fetched: 0, entries: 0, done: false };
  // Picks answer 404 until the deadline has passed. Starting before it would drain the
  // queue against errors and leave an empty sample marked complete for the whole gameweek.
  if (now < Date.parse(event.deadline_time)) return { fetched: 0, entries: 0, done: false };

  const stored = await env.TELEGRAM_STATE.get<RankSample>(sampleKey(event.id), "json");
  const sample: RankSample = stored && stored.version === SAMPLE_VERSION ? stored : {
    version: SAMPLE_VERSION,
    gameweek: event.id,
    ranked: event.ranked_count,
    pending: plannedPages(event.ranked_count),
    queue: [],
    entries: [],
  };
  if (sample.completedAt) return { fetched: 0, entries: sample.entries.length, done: true };

  let fetched = 0;
  while (fetched < FETCH_BUDGET && sample.pending.length) {
    const next = sample.pending[0];
    try {
      const page = await fpl<LeaguePage>(`/leagues-classic/314/standings/?page_standings=${next.page}`);
      for (const row of page.standings.results.slice(0, PER_PAGE)) sample.queue.push({ id: row.entry, weight: next.weight });
    } catch (error) {
      // A page that will not load is a page the field can do without; dropping it keeps the
      // sample building rather than stalling on one bad response for the rest of the week.
      console.error(JSON.stringify({ event: "rank_page_error", page: next.page, error: String(error) }));
    }
    sample.pending.shift();
    fetched += 1;
  }
  while (fetched < FETCH_BUDGET && sample.queue.length) {
    const next = sample.queue[0];
    try {
      const picks = await fpl<PicksResponse>(`/entry/${next.id}/event/${event.id}/picks/`);
      sample.entries.push({
        id: next.id,
        weight: next.weight,
        before: picks.entry_history.total_points - picks.entry_history.points,
        hit: picks.entry_history.event_transfers_cost,
        picks: picks.picks.map((pick) => [pick.element, pick.multiplier, pick.element_type]),
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "rank_picks_error", entry: next.id, error: String(error) }));
    }
    sample.queue.shift();
    fetched += 1;
  }
  if (!sample.pending.length && !sample.queue.length) sample.completedAt = new Date(now).toISOString();
  if (fetched) await env.TELEGRAM_STATE.put(sampleKey(event.id), JSON.stringify(sample));
  if (sample.completedAt && !stored?.completedAt && event.id > 1) {
    // A finished sample is a quarter of a megabyte of squads that will never be scored
    // again: the gameweek they belong to is over and its curve is computed on request.
    await env.TELEGRAM_STATE.delete(sampleKey(event.id - 1));
  }
  return { fetched, entries: sample.entries.length, done: Boolean(sample.completedAt) };
}

/**
 * One squad's live total.
 *
 * The multiplier does all the work a chip would: FPL writes 2 or 3 on a captain and 0 on a
 * bench player, and under a bench boost the bench carries 1. Verified against FPL's own
 * gameweek points on 104 squads that had no autosubs — every one to the point.
 */
export function scoreEntry(entry: SampledEntry, points: Map<number, number>, subs: (entry: SampledEntry) => number[]): number {
  const multipliers = subs(entry);
  let total = 0;
  for (let index = 0; index < entry.picks.length; index += 1) {
    total += multipliers[index] * (points.get(entry.picks[index][0]) ?? 0);
  }
  return entry.before + total - entry.hit;
}

const MINIMUMS: Record<number, number> = { 1: 1, 2: 3, 3: 2, 4: 1 };

/**
 * Provisional autosubs for a sampled squad, by the same rule the table applies to ours.
 *
 * FPL rewrites the multipliers itself once it settles a fixture, so this only has to cover
 * the hours in between — but those are the hours the number is watched. A starter who has
 * not played and whose match is over gives his place to the first bench player who can take
 * it without breaking the formation; the goalkeeper swaps only with the goalkeeper.
 */
export function provisionalMultipliers(entry: SampledEntry, played: (element: number) => boolean, over: (element: number) => boolean): number[] {
  const multipliers = entry.picks.map((pick) => pick[1]);
  const missing = (index: number) => !played(entry.picks[index][0]) && over(entry.picks[index][0]);
  const starters = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const bench = [11, 12, 13, 14].filter((index) => played(entry.picks[index][0]));
  const out = new Set<number>();

  const keeperOut = starters.find((index) => entry.picks[index][2] === 1 && missing(index));
  const keeperIn = bench.find((index) => entry.picks[index][2] === 1);
  if (keeperOut !== undefined && keeperIn !== undefined) {
    out.add(keeperOut);
    multipliers[keeperOut] = 0;
    multipliers[keeperIn] = 1;
  }

  let onPitch = starters.filter((index) => entry.picks[index][2] !== 1 && !out.has(index));
  for (const candidate of bench.filter((index) => entry.picks[index][2] !== 1)) {
    const replaced = onPitch.find((index) => {
      if (!missing(index)) return false;
      const next = onPitch.filter((other) => other !== index).concat(candidate);
      return Object.entries(MINIMUMS).every(([type, minimum]) => Number(type) === 1
        || next.filter((other) => entry.picks[other][2] === Number(type)).length >= minimum);
    });
    if (replaced === undefined) continue;
    out.add(replaced);
    // The armband follows the player, so a captain subbed out takes his multiplier with him.
    multipliers[candidate] = 1;
    multipliers[replaced] = 0;
    onPitch = onPitch.filter((index) => index !== replaced).concat(candidate);
  }
  return multipliers;
}

/** The whole sample scored, folded into the curve the page reads. */
export function buildCurve(sample: RankSample, points: Map<number, number>, multipliers: (entry: SampledEntry) => number[], now: number, settled = false): RankCurve {
  const byTotal = new Map<number, number>();
  let weight = 0;
  for (const entry of sample.entries) {
    const total = scoreEntry(entry, points, multipliers);
    byTotal.set(total, (byTotal.get(total) ?? 0) + entry.weight);
    weight += entry.weight;
  }
  const totals = [...byTotal.keys()].sort((a, b) => b - a);
  const above: Array<[number, number]> = [];
  let running = 0;
  for (const total of totals) {
    above.push([total, running]);
    running += byTotal.get(total) ?? 0;
  }
  const planned = plannedPages(sample.ranked).length * PER_PAGE;
  return {
    gameweek: sample.gameweek,
    ranked: sample.ranked,
    weight,
    above,
    scoredAt: new Date(now).toISOString(),
    coverage: planned ? Math.min(1, sample.entries.length / planned) : 0,
    settled,
  };
}

/**
 * The curve, computed when the page asks for it rather than parked in KV on a timer.
 *
 * A stored curve needs an interval, and every interval is wrong: fast enough to keep step
 * with the ticker costs about four hundred KV writes on a heavy Saturday, on top of the
 * four hundred the feed already spends against a free-plan thousand, and slow enough to
 * afford leaves a rank standing still for minutes after a goal has appeared in the strip
 * beside it. Computed on request there is no interval to be wrong: the sample is already in
 * KV, the live payload is a cached fetch, and scoring 960 squads is arithmetic. The
 * response carries a minute of cache, so the work happens once a minute however many people
 * are watching, and not at all when nobody is.
 *
 * It also settles the harder half of the question. Points stop moving when every fixture is
 * **`finished`** — confirmed — and not when it is `finished_provisional`, which is only full
 * time: bonus is still being recalculated in between, and FPL now confirms a whole gameweek
 * at 09:00 UK the morning after its last match. With nothing cached against a clock, that
 * distinction costs nothing to honour.
 */
export async function computeCurve(env: LiveRankEnv, gameweek: number, now = Date.now()): Promise<RankCurve | null> {
  const sample = await env.TELEGRAM_STATE.get<RankSample>(sampleKey(gameweek), "json");
  if (!sample || sample.version !== SAMPLE_VERSION || !sample.completedAt || !sample.entries.length) return null;

  const live = await fpl<{ elements: Array<{ id: number; stats: { total_points: number; minutes: number } }> }>(`/event/${gameweek}/live/`);
  const fixtures = (await fpl<Array<{ event: number | null; finished: boolean; finished_provisional: boolean }>>("/fixtures/"))
    .filter((fixture) => fixture.event === gameweek);
  const points = new Map(live.elements.map((element) => [element.id, element.stats.total_points]));
  const minutes = new Map(live.elements.map((element) => [element.id, element.stats.minutes]));
  // Whether a player's own match is over is not knowable per player from the live payload,
  // so the gameweek is treated as over only once every fixture has reached full time: an
  // autosub applied early would take points off a manager whose player has not kicked off.
  const allOver = fixtures.length > 0 && fixtures.every((fixture) => fixture.finished_provisional);
  const played = (element: number) => (minutes.get(element) ?? 0) > 0;
  const over = () => allOver;

  const settled = fixtures.length > 0 && fixtures.every((fixture) => fixture.finished);
  return buildCurve(sample, points, (entry) => provisionalMultipliers(entry, played, over), now, settled);
}
