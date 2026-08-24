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
  /** Points the player gained on this tick, which is what makes an event worth reading. */
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
interface LiveElement { id: number; stats: LiveStats; explain: Array<{ fixture: number }> }
interface Fixture {
  id: number; event: number | null; kickoff_time: string; team_h: number; team_a: number;
  team_h_score: number | null; team_a_score: number | null;
  minutes: number; started: boolean; finished: boolean; finished_provisional: boolean;
}
interface Bootstrap {
  events: Array<{ id: number; is_current: boolean }>;
  elements: Array<{ id: number; web_name: string; team: number; element_type: number }>;
  teams: Array<{ id: number; short_name: string; name: string }>;
}

export interface EventsEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredFeed {
  gameweek: number;
  /** element id → the watched counters, in WATCHED order. Only players who have appeared. */
  snapshot: Record<string, number[]>;
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

const MAX_EVENTS = 300;
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
): Array<{ kind: EventKind; value: number }> {
  const before = previous ?? WATCHED.map(() => 0);
  const out: Array<{ kind: EventKind; value: number }> = [];
  WATCHED.forEach((stat, index) => {
    const delta = current[index] - before[index];
    if (delta <= 0) return;
    if (stat === "saves") {
      const gained = Math.floor(current[index] / 3) - Math.floor(before[index] / 3);
      if (gained > 0) out.push({ kind: "save_point", value: Math.floor(current[index] / 3) });
      return;
    }
    // The count itself is not the event; crossing the threshold for the position is.
    if (stat === "defensive_contribution") {
      const threshold = position === undefined ? undefined : DEFCON_THRESHOLD[position];
      if (threshold !== undefined && before[index] < threshold && current[index] >= threshold) {
        out.push({ kind: "defcon", value: current[index] });
      }
      return;
    }
    if (stat === "total_points") return;
    const kind = KIND_BY_STAT[stat];
    if (kind) out.push({ kind, value: current[index] });
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

export async function updateFeed(env: EventsEnv, now = Date.now()): Promise<{ written: boolean; added: number }> {
  const bootstrap = await fpl<Bootstrap>("/bootstrap-static/");
  const event = bootstrap.events.find((entry) => entry.is_current);
  if (!event) return { written: false, added: 0 };

  const fixtures = (await fpl<Fixture[]>("/fixtures/")).filter((fixture) => fixture.event === event.id);
  const stored = await readFeed(env, event.id);
  if (!isLive(fixtures, stored?.lastLiveAt, now)) return { written: false, added: 0 };

  const live = await fpl<{ elements: LiveElement[] }>(`/event/${event.id}/live/`);
  const teamById = new Map(bootstrap.teams.map((team) => [team.id, team.short_name]));
  const teamNameById = new Map(bootstrap.teams.map((team) => [team.id, team.name]));
  const elementById = new Map(bootstrap.elements.map((element) => [element.id, element]));
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const previous = stored?.snapshot ?? {};
  // Only the very first write of a gameweek seeds in silence. After that a player who was
  // not in the last snapshot is one whose match has just kicked off or who has just come
  // on, and what he has done since is news — which is what the opening minutes of a match
  // used to be swallowed by.
  const bootstrapping = !stored;
  const snapshot: Record<string, number[]> = {};
  const fresh: FeedEvent[] = [];
  const at = new Date(now).toISOString();

  for (const element of live.elements) {
    const current = counters(element.stats);
    // Players who have not appeared stay out of the snapshot; absent reads as all zeroes.
    if (element.stats.minutes === 0 && current.every((value) => value === 0)) continue;
    snapshot[element.id] = current;
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
    const pointsDelta = current[pointsIndex] - (before ? before[pointsIndex] : 0);
    for (const change of changes) {
      fresh.push({
        id: `${event.id}:${element.id}:${change.kind}:${change.value}`,
        at,
        gameweek: event.id,
        element: element.id,
        player: meta?.web_name ?? String(element.id),
        club: teamById.get(meta?.team ?? -1) ?? "—",
        clubName: teamNameById.get(meta?.team ?? -1) ?? "—",
        kind: change.kind,
        value: change.value,
        pointsDelta,
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
  const stillLive = fixtures.some((fixture) => fixture.started && !fixture.finished_provisional);

  await env.TELEGRAM_STATE.put(feedKey(event.id), JSON.stringify({
    gameweek: event.id,
    snapshot,
    events,
    lastLiveAt: stillLive ? at : stored?.lastLiveAt ?? at,
  } satisfies StoredFeed));

  if (added.length) {
    console.log(JSON.stringify({ event: "feed_events_added", gameweek: event.id, added: added.length }));
  }
  return { written: true, added: added.length };
}
