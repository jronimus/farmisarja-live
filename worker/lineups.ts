import { CLUBS, matchElement, type Element } from "./fotmob";

/**
 * Predicted line-ups, and who is injured or suspended.
 *
 * Two things FPL does not publish and this site could not derive. FPL's own flags answer
 * "can he play"; a predicted eleven answers "will he start", which is the question that
 * decides a captaincy, and FotMob's per-match `unavailable` list is longer and more precise
 * than FPL's — expected returns in words ("Early September 2026", "Back in training") and
 * suspensions marked as suspensions.
 *
 * **The prediction is only a prediction some of the time**, and that is the whole difficulty.
 * FotMob shows an eleven for every upcoming match, but for the ones further out it is simply
 * the side that started last time — which is worthless as a forecast and actively
 * misleading, since a manager reading it would think a rotated player was expected to start.
 * The payload says which is which in `lineupType`: `predicted` for the real thing,
 * `lastStarting11` for the stand-in. Checked across a full round on 26 Aug 2026, the Friday
 * night match and the two early Saturday kick-offs read `predicted` and the six later ones
 * read `lastStarting11`, which is exactly what FotMob's own site shows.
 *
 * So a `lastStarting11` eleven is thrown away here and never reaches the page. The
 * unavailable list is kept either way: it is current in both, and it is the half of this
 * that does not expire.
 */

export interface UnavailablePlayer {
  /** The FPL element, when the name could be matched. Null keeps the name readable anyway. */
  element: number | null;
  name: string;
  club: string;
  /** FotMob's own word: `injury` or `suspension`. */
  reason: string;
  /** FotMob's own wording for the return, which is a phrase and not a date. */
  expectedReturn: string;
}

export interface FixtureLineup {
  matchId: number;
  kickoff: string;
  home: string;
  away: string;
  /** False when FotMob is still showing last week's eleven, in which case `starters` is empty. */
  predicted: boolean;
  /** FPL elements in the predicted eleven, both sides together. Empty unless predicted. */
  starters: number[];
  unavailable: UnavailablePlayer[];
}

export interface LineupsEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredLineups {
  checkAfter: string;
  fixtures: FixtureLineup[];
}

const LINEUPS_KEY = "lineups:list";

/**
 * A quarter of an hour. A prediction appears an hour or two before kick-off and does not
 * change after that, so this is well inside the window and costs 96 writes a day.
 */
const CHECK_MS = 15 * 60_000;
/**
 * How far ahead a fixture is worth asking about.
 *
 * Measured rather than assumed, and the assumption was wrong: a day and a half was tried
 * first, on the reasoning that a prediction appears an hour or two before kick-off, and it
 * found nothing — FotMob already had a predicted eleven for Friday's Palace v Man City on
 * the Wednesday afternoon, fifty-one hours out. Four days covers a whole round, and the
 * fixtures inside it are re-read every quarter of an hour, so a prediction is never more
 * than that old.
 */
const WINDOW_MS = 4 * 86_400_000;
/** A match is dropped once it is well over, since its eleven is then a fact elsewhere. */
const KEEP_AFTER_KICKOFF_MS = 4 * 3_600_000;

/** FotMob's own id for the Premier League. */
const LEAGUE = 47;

interface MatchesDay {
  leagues?: Array<{ primaryId?: number; matches?: Array<{ id: number; status?: { utcTime?: string } }> }>;
}
interface LineupSide {
  id: number;
  starters?: Array<{ name: string }>;
  unavailable?: Array<{ name: string; unavailability?: { type?: string; expectedReturn?: string } }>;
}
interface MatchDetails {
  content?: { lineup?: { lineupType?: string; homeTeam?: LineupSide; awayTeam?: LineupSide } };
}

async function fotmob<T>(path: string): Promise<T> {
  const response = await fetch(`https://www.fotmob.com/api/data/${path}`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Farmisarja-Live/0.1)" },
    cf: { cacheEverything: true, cacheTtl: 600 },
  });
  if (!response.ok) throw new Error(`FotMob ${path} ${response.status}`);
  return response.json() as Promise<T>;
}

/** `YYYYMMDD` in UTC, which is the only shape FotMob's date parameter takes. */
export function fotmobDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * One match, read into what the page needs.
 *
 * `predicted` decides everything: a `lastStarting11` eleven is dropped on the floor rather
 * than shown with a caveat, because a caveat under eleven names is not read. The
 * unavailable list survives either way.
 */
export function readMatch(
  matchId: number,
  kickoff: string,
  details: MatchDetails,
  elements: Element[],
  teamByShort: Map<string, number>,
): FixtureLineup | null {
  const lineup = details.content?.lineup;
  const home = lineup?.homeTeam;
  const away = lineup?.awayTeam;
  if (!home || !away || !CLUBS[home.id] || !CLUBS[away.id]) return null;
  const predicted = lineup?.lineupType === "predicted";

  const starters = !predicted ? [] : [
    ...(home.starters ?? []).map((player) => matchElement(player.name, home.id, elements, teamByShort)),
    ...(away.starters ?? []).map((player) => matchElement(player.name, away.id, elements, teamByShort)),
  ].filter((id): id is number => id !== null);

  const unavailable: UnavailablePlayer[] = [];
  for (const side of [home, away]) {
    for (const player of side.unavailable ?? []) {
      unavailable.push({
        element: matchElement(player.name, side.id, elements, teamByShort),
        name: player.name,
        club: CLUBS[side.id],
        reason: player.unavailability?.type ?? "injury",
        expectedReturn: player.unavailability?.expectedReturn ?? "",
      });
    }
  }

  return { matchId, kickoff, home: CLUBS[home.id], away: CLUBS[away.id], predicted, starters, unavailable };
}

/** What is stored after a tick: this date's matches refreshed, the others left alone. */
export function mergeFixtures(stored: FixtureLineup[], fresh: FixtureLineup[], now: number): FixtureLineup[] {
  const byId = new Map<number, FixtureLineup>();
  for (const fixture of [...stored, ...fresh]) byId.set(fixture.matchId, fixture);
  return [...byId.values()]
    .filter((fixture) => Date.parse(fixture.kickoff) + KEEP_AFTER_KICKOFF_MS > now)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export async function readLineups(env: LineupsEnv): Promise<StoredLineups | null> {
  return await env.TELEGRAM_STATE.get<StoredLineups>(LINEUPS_KEY, "json");
}

export async function updateLineups(env: LineupsEnv, now = Date.now()): Promise<{ written: boolean; predicted: number }> {
  const stored = await readLineups(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, predicted: 0 };

  const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  }).then((response) => response.json() as Promise<{ elements: Element[]; teams: Array<{ id: number; short_name: string }> }>);
  const teamByShort = new Map(bootstrap.teams.map((team) => [team.short_name, team.id]));

  /**
   * Which dates to ask FotMob about, from FPL's own fixture list.
   *
   * FotMob's date listing is every match in the world on that day — a third of a megabyte —
   * so asking about five days in a row to find the three that have football in them is most
   * of a megabyte wasted on empty Tuesdays. FPL already publishes exactly when its own
   * fixtures are, and it is a much smaller list.
   */
  const fplFixtures = await fetch("https://fantasy.premierleague.com/api/fixtures/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 600 },
  }).then((response) => response.json() as Promise<Array<{ kickoff_time: string | null; finished: boolean }>>);
  const dates = [...new Set(fplFixtures
    .filter((fixture) => {
      const kickoff = Date.parse(fixture.kickoff_time ?? "");
      return Number.isFinite(kickoff) && kickoff + KEEP_AFTER_KICKOFF_MS > now && kickoff - now < WINDOW_MS;
    })
    .map((fixture) => fotmobDate(Date.parse(fixture.kickoff_time as string))))];

  const fresh: FixtureLineup[] = [];
  for (const date of dates) {
    try {
      const listing = await fotmob<MatchesDay>(`matches?date=${date}`);
      const league = (listing.leagues ?? []).find((entry) => entry.primaryId === LEAGUE);
      const matches = (league?.matches ?? []).filter((match) => {
        const kickoff = Date.parse(match.status?.utcTime ?? "");
        return Number.isFinite(kickoff)
          && kickoff + KEEP_AFTER_KICKOFF_MS > now
          && kickoff - now < WINDOW_MS;
      });
      const read = await Promise.all(matches.map(async (match) => {
        try {
          const details = await fotmob<MatchDetails>(`matchDetails?matchId=${match.id}`);
          return readMatch(match.id, new Date(Date.parse(match.status?.utcTime ?? "")).toISOString(), details, bootstrap.elements, teamByShort);
        } catch (error) {
          console.error(JSON.stringify({ event: "lineup_match_error", match: match.id, error: error instanceof Error ? error.message : String(error) }));
          return null;
        }
      }));
      for (const entry of read) if (entry) fresh.push(entry);
    } catch (error) {
      console.error(JSON.stringify({ event: "lineup_day_error", date, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  const fixtures = mergeFixtures(stored?.fixtures ?? [], fresh, now);
  await env.TELEGRAM_STATE.put(LINEUPS_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    fixtures,
  } satisfies StoredLineups));
  const predicted = fixtures.filter((fixture) => fixture.predicted).length;
  console.log(JSON.stringify({ event: "lineups_updated", fixtures: fixtures.length, predicted }));
  return { written: true, predicted };
}
