import type { Catalog } from "./catalog";

/**
 * The live event feed.
 *
 * FPL publishes state, not events: `/event/{gw}/live/` says Szoboszlai has one goal, never
 * that it went in at 20:31. Every feed of this kind, LiveFPL's included, derives its events
 * by diffing successive snapshots and stamping the time itself. So does this one.
 *
 * The diff runs on the cron that already ticks every two minutes, and both the snapshot and
 * the log live in one KV value so a tick costs one write. Writes only happen while football
 * is being played — the free KV plan allows 1,000 a day, and a tick every two minutes around
 * the clock would be 720 of them for nothing.
 */

export interface FeedEvent {
  /** Stable across ticks, so a replayed diff cannot duplicate a line. */
  id: string;
  at: string;
  gameweek: number;
  element: number;
  player: string;
  club: string;
  /** The club written out, for the lines that name it instead of the tie. */
  clubName: string;
  kind: EventKind;
  /** The new total: a second goal is value 2. */
  value: number;
  /** What it was before. Only bonus reads it: that is the one counter that moves both ways. */
  previous?: number;
  /** What this event is worth, not what the player gained on the tick: a goal and the
   *  bonus that lands with it are separate lines and each carries its own figure. */
  pointsDelta: number;
  points: number;
  fixture?: { home: string; away: string; homeScore: number; awayScore: number; minutes: number };
}

export type EventKind =
  | "goal" | "assist" | "own_goal" | "yellow" | "red"
  | "penalty_save" | "penalty_miss" | "save_point" | "defcon" | "bonus";

interface LiveStats {
  minutes: number; goals_scored: number; assists: number; own_goals: number;
  yellow_cards: number; red_cards: number; penalties_saved: number; penalties_missed: number;
  bonus: number; defensive_contribution: number; saves: number; total_points: number;
}
interface ExplainStat { identifier: string; points: number }
interface LiveElement { id: number; stats: LiveStats; explain: Array<{ fixture: number; stats: ExplainStat[] }> }
interface Fixture {
  id: number; event: number | null; kickoff_time: string; team_h: number; team_a: number;
  team_h_score: number | null; team_a_score: number | null;
  minutes: number; started: boolean; finished: boolean; finished_provisional: boolean;
}
export interface EventsEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredFeed {
  gameweek: number;
  /** element id → the watched counters, in WATCHED order. Only players who have appeared. */
  snapshot: Record<string, number[]>;
  /**
   * element id → what each of those counters is currently worth, in the same order. FPL
   * publishes it per stat in `explain`, so a goal's own points never have to be modelled
   * from the position and the rules. Absent on feeds written before this was stored.
   */
  points?: Record<string, number[]>;
  /** Which repair pass has run over this gameweek's log; see REPAIR_VERSION. */
  repair?: number;
  events: FeedEvent[];
  lastLiveAt?: string;
}

/** The counters worth watching, in the order they are stored. */
const WATCHED = [
  "goals_scored", "assists", "own_goals", "yellow_cards", "red_cards",
  "penalties_saved", "penalties_missed", "bonus", "defensive_contribution", "saves", "total_points",
] as const;

const KIND_BY_STAT: Partial<Record<(typeof WATCHED)[number], EventKind>> = {
  goals_scored: "goal", assists: "assist", own_goals: "own_goal",
  yellow_cards: "yellow", red_cards: "red",
  penalties_saved: "penalty_save", penalties_missed: "penalty_miss",
  bonus: "bonus", defensive_contribution: "defcon",
};

/** Which counter is behind each kind of line, for pricing one after the fact. */
const STAT_BY_KIND: Partial<Record<EventKind, (typeof WATCHED)[number]>> = {
  goal: "goals_scored", assist: "assists", own_goal: "own_goals",
  yellow: "yellow_cards", red: "red_cards",
  penalty_save: "penalties_saved", penalty_miss: "penalties_missed",
  save_point: "saves", defcon: "defensive_contribution",
};

const MAX_EVENTS = 300;
/** Bumped when repairEvents learns to mend something new, so it runs again over old logs. */
const REPAIR_VERSION = 2;
/** Bonus is still being recalculated for a while after full time. */
const GRACE_MS = 30 * 60_000;
/**
 * How early a baseline is taken. A snapshot written before the whistle gives the first tick
 * after it something to diff against; without one, everything that happened before that
 * first tick is already in the baseline and is never reported. That is how a goal in the
 * first minute went missing while the points column had it.
 */
const KICKOFF_LEAD_MS = 12 * 60_000;

/**
 * Defensive contribution is a running count of clearances, blocks, interceptions and
 * tackles, not a score: it ticks up several times a minute for half the pitch. What is
 * worth reporting is the moment it buys the two points, which happens once, at 10 for a
 * defender and 12 for anyone else, and never stacks. Goalkeepers do not score it at all.
 */
export const DEFCON_THRESHOLD: Record<number, number> = { 2: 10, 3: 12, 4: 12 };

const feedKey = (gameweek: number) => `feed:gw:${gameweek}`;

const counters = (stats: LiveStats): number[] => WATCHED.map((name) => Number(stats[name] ?? 0));

/** What each watched counter is currently worth, summed over the player's fixtures. */
const pointsFor = (element: LiveElement): number[] => {
  const byIdentifier = new Map<string, number>();
  for (const entry of element.explain ?? []) {
    for (const stat of entry.stats ?? []) {
      byIdentifier.set(stat.identifier, (byIdentifier.get(stat.identifier) ?? 0) + stat.points);
    }
  }
  return WATCHED.map((name) => byIdentifier.get(name) ?? 0);
};

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
  });
  if (!response.ok) throw new Error(`FPL ${path} ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * One player's changes between two ticks.
 *
 * Saves are the one counter that is not an event on its own: three of them are worth a
 * point, so the feed reports the point rather than every stop.
 */
export function eventsForPlayer(
  previous: number[] | undefined,
  current: number[],
  position?: number,
): Array<{ kind: EventKind; value: number; stat: (typeof WATCHED)[number] }> {
  const before = previous ?? WATCHED.map(() => 0);
  const out: Array<{ kind: EventKind; value: number; previous: number; stat: (typeof WATCHED)[number] }> = [];
  WATCHED.forEach((stat, index) => {
    /**
     * Bonus is provisional while the match runs and is the one counter that legitimately
     * moves both ways: three, two and one go to the top three of the bonus points system,
     * and a player is promoted and demoted between those places as the figures move. So a
     * fall is reported as readily as a rise, and both carry where they came from — a bare
     * "+2" after a bare "+3" reads as five points gained, and a demotion from three to two
     * reads as a gain when it is a loss.
     */
    if (stat === "bonus") {
      if (current[index] !== before[index]) {
        out.push({ kind: "bonus", value: current[index], previous: before[index], stat });
      }
      return;
    }
    const delta = current[index] - before[index];
    if (delta <= 0) return;
    if (stat === "saves") {
      const gained = Math.floor(current[index] / 3) - Math.floor(before[index] / 3);
      if (gained > 0) out.push({ kind: "save_point", value: Math.floor(current[index] / 3), previous: Math.floor(before[index] / 3), stat });
      return;
    }
    // The count itself is not the event; crossing the threshold for the position is.
    if (stat === "defensive_contribution") {
      const threshold = position === undefined ? undefined : DEFCON_THRESHOLD[position];
      if (threshold !== undefined && before[index] < threshold && current[index] >= threshold) {
        out.push({ kind: "defcon", value: current[index], previous: before[index], stat });
      }
      return;
    }
    if (stat === "total_points") return;
    const kind = KIND_BY_STAT[stat];
    if (kind) out.push({ kind, value: current[index], previous: before[index], stat });
  });
  return out;
}

/** Whether there is any football to watch, which is the only time this writes to KV. */
export function isLive(fixtures: Fixture[], lastLiveAt: string | undefined, now: number): boolean {
  if (fixtures.some((fixture) => fixture.started && !fixture.finished_provisional)) return true;
  // Just before a kick-off too, to lay the baseline the first live tick will diff against.
  if (fixtures.some((fixture) => {
    if (fixture.started || !fixture.kickoff_time) return false;
    const kickoff = new Date(fixture.kickoff_time).getTime();
    return kickoff > now && kickoff - now <= KICKOFF_LEAD_MS;
  })) return true;
  return Boolean(lastLiveAt && now - new Date(lastLiveAt).getTime() < GRACE_MS);
}

export async function readFeed(env: EventsEnv, gameweek: number): Promise<StoredFeed | null> {
  return await env.TELEGRAM_STATE.get<StoredFeed>(feedKey(gameweek), "json");
}

/**
 * A one-off pass over lines written before a line carried its own worth. Those stored the
 * player's whole gain on the tick, so a goal and the bonus that arrived beside it both read
 * the same figure. Nothing is guessed: FPL publishes what each stat is worth per player, and
 * every unit of a stat is worth the same to that player, so one unit is the whole over the
 * count. Bonus points are the place itself, so a move is worth the difference between the
 * place left and the place taken, recovered by walking a player's lines oldest first.
 *
 * It runs inside the cron because that is the only writer of this key; editing it from
 * outside is overwritten by the next tick.
 */
export function repairEvents(
  events: FeedEvent[],
  live: LiveElement[],
  snapshot?: Record<string, number[]>,
  points?: Record<string, number[]>,
): void {
  const byId = new Map(live.map((element) => [element.id, element]));

  const lastBonus = new Map<number, number>();
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    if (event.kind !== "bonus") continue;
    const from = lastBonus.get(event.element) ?? 0;
    event.previous = from;
    event.pointsDelta = event.value - from;
    lastBonus.set(event.element, event.value);
  }

  for (const event of events) {
    if (event.kind === "bonus") continue;
    const stat = STAT_BY_KIND[event.kind];
    const element = byId.get(event.element);
    if (!stat || !element) continue;
    const worth = pointsFor(element)[WATCHED.indexOf(stat)];
    // A save point is one point by definition, and a defensive contribution is the whole
    // two: it lands once and never stacks, so it is not divided by the count behind it.
    if (event.kind === "save_point") { event.pointsDelta = 1; continue; }
    if (event.kind === "defcon") { event.pointsDelta = worth; continue; }
    const count = Number(element.stats[stat] ?? 0);
    if (!count) continue;
    event.pointsDelta = Math.round(worth / count);
  }

  /**
   * A fall used to emit nothing at all, so a player overtaken for third place simply kept
   * the place he had last been reported in — two of them showing three bonus at once. The
   * fall itself cannot be read back out of a log that never recorded it, but the place he
   * actually holds is in the live data, so winding his stored bonus back to the last one
   * reported leaves the ordinary diff to report the move on the next tick, with a time it
   * genuinely noticed rather than one invented for it.
   */
  if (!snapshot) return;
  const bonusIndex = WATCHED.indexOf("bonus");
  for (const [elementId, stored] of Object.entries(snapshot)) {
    const reported = lastBonus.get(Number(elementId)) ?? 0;
    if (stored[bonusIndex] === reported) continue;
    stored[bonusIndex] = reported;
    // Bonus points are the place itself, so the stored worth winds back with it.
    const storedPoints = points?.[elementId];
    if (storedPoints) storedPoints[bonusIndex] = reported;
  }
}

/**
 * The gameweek list, the squads and the clubs arrive already narrowed, from `catalog.ts`.
 *
 * This used to open with a 1.6 MB parse of its own on every tick — four milliseconds of a
 * ten millisecond budget, for three fields per player — and it was one of the three that
 * together put the invocation over the limit and killed it before it could write. Fixtures
 * and the live payload are still read here: they are a tenth the size and they are the two
 * things that actually change minute to minute.
 */
export async function updateFeed(env: EventsEnv, catalog: Catalog, now = Date.now()): Promise<{ written: boolean; added: number }> {
  const event = catalog.events.find((entry) => entry.is_current);
  if (!event) return { written: false, added: 0 };

  const fixtures = (await fpl<Fixture[]>("/fixtures/")).filter((fixture) => fixture.event === event.id);
  const stored = await readFeed(env, event.id);
  if (!isLive(fixtures, stored?.lastLiveAt, now)) return { written: false, added: 0 };

  const live = await fpl<{ elements: LiveElement[] }>(`/event/${event.id}/live/`);
  const teamById = new Map(catalog.teams.map((team) => [team.id, team.short_name]));
  const teamNameById = new Map(catalog.teams.map((team) => [team.id, team.name]));
  const elementById = new Map(catalog.elements.map((element) => [element.id, element]));
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const previous = stored?.snapshot ?? {};
  const previousPoints = stored?.points ?? {};
  // Only the very first write of a gameweek seeds in silence. After that a player who was
  // not in the last snapshot is one whose match has just kicked off or who has just come
  // on, and what he has done since is news — which is what the opening minutes of a match
  // used to be swallowed by.
  const bootstrapping = !stored;
  const snapshot: Record<string, number[]> = {};
  const points: Record<string, number[]> = {};
  const fresh: FeedEvent[] = [];
  const at = new Date(now).toISOString();

  for (const element of live.elements) {
    const current = counters(element.stats);
    // Players who have not appeared stay out of the snapshot; absent reads as all zeroes.
    if (element.stats.minutes === 0 && current.every((value) => value === 0)) continue;
    const currentPoints = pointsFor(element);
    snapshot[element.id] = current;
    points[element.id] = currentPoints;
    const before = previous[element.id];
    if (!before && bootstrapping) continue;

    const meta = elementById.get(element.id);
    const changes = eventsForPlayer(before, current, meta?.element_type);
    if (!changes.length) continue;

    const fixture = fixtureById.get(element.explain[element.explain.length - 1]?.fixture ?? -1);
    // `before` is undefined for a player whose match has just kicked off or who has just
    // come on, which is the case the bootstrap guard above deliberately lets through; an
    // absent snapshot reads as nought, the same way eventsForPlayer treats it.
    const pointsIndex = WATCHED.indexOf("total_points");
    const beforePoints = previousPoints[element.id];
    for (const change of changes) {
      // What this one event is worth. The tick's whole gain would put the same figure on
      // every line it produced — a goal and the bonus that arrived with it both reading +8.
      const statIndex = WATCHED.indexOf(change.stat);
      const gained = currentPoints[statIndex] - (beforePoints ? beforePoints[statIndex] : 0);
      fresh.push({
        // Bonus can move back and forth between the same two places over a match, so its id
        // carries the move and the tick that saw it; anything else happens once per value.
        id: change.kind === "bonus"
          ? `${event.id}:${element.id}:bonus:${change.previous}>${change.value}:${at}`
          : `${event.id}:${element.id}:${change.kind}:${change.value}`,
        at,
        gameweek: event.id,
        element: element.id,
        player: meta?.web_name ?? String(element.id),
        club: teamById.get(meta?.team ?? -1) ?? "—",
        clubName: teamNameById.get(meta?.team ?? -1) ?? "—",
        kind: change.kind,
        value: change.value,
        previous: change.kind === "bonus" ? change.previous : undefined,
        pointsDelta: gained,
        points: current[pointsIndex],
        fixture: fixture ? {
          home: teamById.get(fixture.team_h) ?? "—",
          away: teamById.get(fixture.team_a) ?? "—",
          homeScore: fixture.team_h_score ?? 0,
          awayScore: fixture.team_a_score ?? 0,
          minutes: fixture.minutes,
        } : undefined,
      });
    }
  }

  const known = new Set((stored?.events ?? []).map((entry) => entry.id));
  const added = fresh.filter((entry) => !known.has(entry.id));
  const events = [...added, ...(stored?.events ?? [])].slice(0, MAX_EVENTS);
  if ((stored?.repair ?? 0) < REPAIR_VERSION) repairEvents(events, live.elements, snapshot, points);
  const stillLive = fixtures.some((fixture) => fixture.started && !fixture.finished_provisional);

  await env.TELEGRAM_STATE.put(feedKey(event.id), JSON.stringify({
    gameweek: event.id,
    snapshot,
    points,
    repair: REPAIR_VERSION,
    events,
    lastLiveAt: stillLive ? at : stored?.lastLiveAt ?? at,
  } satisfies StoredFeed));

  if (added.length) {
    console.log(JSON.stringify({ event: "feed_events_added", gameweek: event.id, added: added.length }));
  }
  return { written: true, added: added.length };
}
