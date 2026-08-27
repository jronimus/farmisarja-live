/**
 * When each player last actually played, which is what settles a stale report.
 *
 * A transfer rumour and an absence list are both claims about the future, and both go stale
 * in the same way: **the player takes the pitch.** A move reported on Tuesday says nothing
 * about a man who played ninety minutes on Saturday, and a FotMob absence list that still
 * has him on it is a list that has not caught up. Neither source retracts anything — FotMob
 *'s rumours simply age out after a fortnight — so nothing but the football itself can close
 * them.
 *
 * That is a fact rather than a judgement, which is the whole reason it is worth doing here.
 * The page has refused all session to infer a player's situation from his minutes; this is
 * the opposite of an inference. He played, at a kick-off with a time on it, after the report
 * was filed. The report is about something that has since happened.
 *
 * Two figures come out of it:
 *
 * - `lastPlayedAt` — the kick-off of the most recent match he took any part in.
 * - `lastFixtureAt` per club — the kick-off of that club's most recent finished match,
 *   whether he played in it or not. A player left out of the last match is not evidence of
 *   anything; a player who *played* in it is.
 *
 * ### What it costs
 *
 * `event/{gw}/live/` is one request per gameweek and carries every element's minutes with
 * the fixture each came from. Rumours are kept a fortnight, so two gameweeks of it is all
 * that can matter — the current one and the one before. With the fixture list that is three
 * requests, on the same hourly gate as everything else that changes at this pace.
 */

export interface AppearancesEnv {
  TELEGRAM_STATE: KVNamespace;
}

export interface Appearances {
  /** Element id to the ISO kick-off of the last match he played any part in. */
  lastPlayedAt: Record<string, string>;
  /**
   * FPL's own short club name to the ISO kick-off of that club's last finished match.
   *
   * Keyed by `AVL` rather than by team id because that is what every list on the page
   * already carries — an absence names a club, not a number, and a lookup table nobody can
   * join against is no use.
   */
  lastFixtureAt: Record<string, string>;
}

interface Stored extends Appearances {
  checkAfter: string;
}

const KEY = "appearances:latest";

/** Minutes settle within the hour after a match; nothing here moves faster than that. */
const CHECK_MS = 60 * 60_000;

interface Fixture {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  finished: boolean;
  started: boolean;
  team_h: number;
  team_a: number;
}

interface LiveElement {
  id: number;
  stats: { minutes: number };
  explain: Array<{ fixture: number; stats: Array<{ identifier: string; value: number }> }>;
}

/**
 * The kick-off of the last match each player took part in.
 *
 * `explain` carries one entry per fixture the player featured in, which is what makes this
 * exact rather than per gameweek: a double gameweek has two, and only the one he actually
 * played counts. Minutes are read from `explain` and not from `stats.minutes`, because the
 * latter is his total for the gameweek and cannot say which of two matches it came from.
 */
export function playedAt(live: LiveElement[], kickoffs: Map<number, string>): Map<number, string> {
  const out = new Map<number, string>();
  for (const element of live) {
    for (const entry of element.explain ?? []) {
      const minutes = entry.stats?.find((stat) => stat.identifier === "minutes")?.value ?? 0;
      if (minutes <= 0) continue;
      const kickoff = kickoffs.get(entry.fixture);
      if (!kickoff) continue;
      const held = out.get(element.id);
      if (!held || kickoff > held) out.set(element.id, kickoff);
    }
  }
  return out;
}

/** The last match each club has finished, which is the match a player can be absent from. */
export function clubFixtures(fixtures: Fixture[], now: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const fixture of fixtures) {
    if (!fixture.finished || !fixture.kickoff_time) continue;
    if (Date.parse(fixture.kickoff_time) > now) continue;
    for (const team of [fixture.team_h, fixture.team_a]) {
      const held = out.get(team);
      if (!held || fixture.kickoff_time > held) out.set(team, fixture.kickoff_time);
    }
  }
  return out;
}

export async function readAppearances(env: AppearancesEnv): Promise<Stored | null> {
  return await env.TELEGRAM_STATE.get<Stored>(KEY, "json");
}

async function fpl<T>(path: string): Promise<T> {
  const response = await fetch(`https://fantasy.premierleague.com/api/${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  });
  if (!response.ok) throw new Error(`FPL ${path} ${response.status}`);
  return await response.json() as T;
}

export async function updateAppearances(env: AppearancesEnv, now = Date.now()): Promise<{ written: boolean; players: number }> {
  const stored = await readAppearances(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, players: 0 };

  const fixtures = await fpl<Fixture[]>("fixtures/");
  const bootstrap = await fpl<{ teams: Array<{ id: number; short_name: string }> }>("bootstrap-static/");
  const shortOf = new Map(bootstrap.teams.map((team) => [team.id, team.short_name]));
  const kickoffs = new Map(fixtures.filter((f) => f.kickoff_time).map((f) => [f.id, f.kickoff_time as string]));

  // The two most recent gameweeks that have started, because a rumour is kept a fortnight
  // and nothing older than that can still be open.
  const started = [...new Set(fixtures.filter((f) => f.started && f.event).map((f) => f.event as number))]
    .sort((a, b) => b - a)
    .slice(0, 2);

  const played = new Map<number, string>();
  for (const event of started) {
    try {
      const live = await fpl<{ elements: LiveElement[] }>(`event/${event}/live/`);
      for (const [element, kickoff] of playedAt(live.elements, kickoffs)) {
        const held = played.get(element);
        if (!held || kickoff > held) played.set(element, kickoff);
      }
    } catch (error) {
      console.error(JSON.stringify({ event: "appearances_gw_error", gameweek: event, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  const body: Stored = {
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    lastPlayedAt: Object.fromEntries(played),
    lastFixtureAt: Object.fromEntries([...clubFixtures(fixtures, now)]
      .map(([team, kickoff]) => [shortOf.get(team) ?? String(team), kickoff])),
  };
  await env.TELEGRAM_STATE.put(KEY, JSON.stringify(body));
  console.log(JSON.stringify({ event: "appearances_updated", players: played.size, gameweeks: started }));
  return { written: true, players: played.size };
}
