/**
 * The little of `bootstrap-static` that the every-tick work actually needs.
 *
 * FPL's bootstrap is 1.6 MB and costs about four milliseconds to parse. That is the whole
 * story of the outage of 28–30 August: three tasks on every cron tick parsed it
 * independently — the Telegram schedule, the live feed and the rank sample — so a tick
 * spent twelve milliseconds of a ten millisecond budget before it had done anything, and
 * Cloudflare killed the invocation. Silently: no exception, no log line, just
 * `exceededCpu` in the analytics. Deadline reminders were never sent, the deadline card
 * arrived fourteen hours late and the ticker froze mid-afternoon, all from the one cause.
 *
 * So the bootstrap is read on one tick in ten, narrowed to the handful of fields per player
 * that anything else wants, and left in KV. What comes back out is about seventy kilobytes
 * and parses in a fifth of a millisecond. Everything that used to reach for the bootstrap on
 * every tick now reads this instead, and the tick has room to do its job.
 *
 * The rumour reader was added to that list afterwards, for the same reason arrived at from
 * the other end: it was the one job still too big for a tick on its own, and four of its
 * milliseconds were this parse. It is why the two filed names are carried here.
 *
 * The rest of the gated readers — prices, articles, transfers, line-ups, history,
 * appearances, insights — still fetch the bootstrap themselves. They return after one KV
 * read on the ticks they are not due, several want fields nobody else does, and each now
 * gets a tick to itself. Route one through here when it proves too heavy, not before.
 */

export interface CatalogEvent {
  id: number;
  deadline_time: string;
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
  /** How many squads FPL has ranked, which is what sizes the rank sample. */
  ranked_count: number;
}

export interface CatalogTeam { id: number; short_name: string; name: string }

/**
 * When the current gameweek's matches kick off, so any tick can tell whether football is on
 * without fetching a fixture list to find out.
 *
 * This is what lets the schedule have states rather than one fixed rhythm: the ticker is
 * worth every other minute while a match is running and worth nothing at four in the
 * morning, and the news is worth the opposite.
 */
export interface CatalogFixture { event: number; kickoff: string }

/**
 * Only what names a player and places him: the feed's lines, and the matcher in `fotmob.ts`
 * that has to recognise him under somebody else's spelling. The two filed names are here so
 * the rumour reader does not have to parse 1.6 MB to get them — they cost about sixteen
 * kilobytes and save four milliseconds every time that job takes a turn.
 */
export interface CatalogElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
}

export interface Catalog {
  version: number;
  builtAt: string;
  events: CatalogEvent[];
  teams: CatalogTeam[];
  elements: CatalogElement[];
  /** Only the current gameweek's and the next one's; the rest is history. */
  fixtures: CatalogFixture[];
}

export interface CatalogEnv { TELEGRAM_STATE: KVNamespace }

interface FixtureRow { event: number | null; kickoff_time: string | null }

interface Bootstrap {
  events: Array<{ id: number; deadline_time: string; is_current: boolean; is_next: boolean; finished: boolean; ranked_count: number }>;
  teams: Array<{ id: number; short_name: string; name: string }>;
  elements: Array<{ id: number; web_name: string; first_name: string; second_name: string; team: number; element_type: number }>;
}

const CATALOG_KEY = "catalog:v1";
/** Bumped when a field is added, so a stored catalog without it is rebuilt rather than read. */
export const CATALOG_VERSION = 4;

/** The ordinary refresh. Squad names and fixtures do not move faster than this. */
const FRESH_MS = 30 * 60_000;
/**
 * Around a deadline they do. `is_current` turns over as the deadline passes and
 * `ranked_count` fills in behind it, and the deadline card waits on both — so within half
 * an hour either side of a deadline, and for three hours after it, the catalog is rebuilt
 * every three minutes instead. That window is about four hours a week.
 */
const DEADLINE_FRESH_MS = 3 * 60_000;
const WINDOW_BEFORE_MS = 30 * 60_000;
const WINDOW_AFTER_MS = 3 * 3_600_000;

export async function readCatalog(env: CatalogEnv): Promise<Catalog | null> {
  const stored = await env.TELEGRAM_STATE.get<Catalog>(CATALOG_KEY, "json");
  return stored && stored.version === CATALOG_VERSION ? stored : null;
}

/** Whether a deadline is close enough that a half-hour-old catalog is too old. */
export function nearDeadline(catalog: Catalog, now: number): boolean {
  return catalog.events.some((event) => {
    const deadline = Date.parse(event.deadline_time);
    return now >= deadline - WINDOW_BEFORE_MS && now <= deadline + WINDOW_AFTER_MS;
  });
}

export function refreshDue(catalog: Catalog | null, now: number): boolean {
  if (!catalog) return true;
  const age = now - Date.parse(catalog.builtAt);
  return age >= (nearDeadline(catalog, now) ? DEADLINE_FRESH_MS : FRESH_MS);
}

/**
 * The one place the bootstrap is parsed on a schedule, and it runs on a tick of its own.
 *
 * Four milliseconds of the ten are spent here, which is affordable exactly because nothing
 * else heavy shares the tick.
 */
export async function refreshCatalog(env: CatalogEnv, now = Date.now()): Promise<{ written: boolean }> {
  const stored = await readCatalog(env);
  if (!refreshDue(stored, now)) return { written: false };

  const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 60 },
  });
  if (!response.ok) throw new Error(`FPL bootstrap-static ${response.status}`);
  const bootstrap = await response.json() as Bootstrap;

  // The kickoff times ride along. A tenth of the bootstrap's size, and every tick after this
  // one gets to ask whether football is on for the price of a comparison.
  const wanted = new Set(bootstrap.events.filter((event) => event.is_current || event.is_next).map((event) => event.id));
  const fixtureResponse = await fetch("https://fantasy.premierleague.com/api/fixtures/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 60 },
  });
  if (!fixtureResponse.ok) throw new Error(`FPL fixtures ${fixtureResponse.status}`);
  const fixtures = (await fixtureResponse.json() as FixtureRow[])
    .filter((fixture) => fixture.event !== null && wanted.has(fixture.event) && fixture.kickoff_time)
    .map((fixture) => ({ event: fixture.event as number, kickoff: fixture.kickoff_time as string }));

  const catalog: Catalog = {
    version: CATALOG_VERSION,
    builtAt: new Date(now).toISOString(),
    events: bootstrap.events.map((event) => ({
      id: event.id,
      deadline_time: event.deadline_time,
      is_current: event.is_current,
      is_next: event.is_next,
      finished: event.finished,
      ranked_count: event.ranked_count ?? 0,
    })),
    teams: bootstrap.teams.map((team) => ({ id: team.id, short_name: team.short_name, name: team.name })),
    elements: bootstrap.elements.map((element) => ({
      id: element.id,
      web_name: element.web_name,
      first_name: element.first_name,
      second_name: element.second_name,
      team: element.team,
      element_type: element.element_type,
    })),
    fixtures,
  };
  // Serialised once. The log line used to call for its own copy just to count the bytes,
  // which is a third of a millisecond spent on a number nobody reads twice.
  const body = JSON.stringify(catalog);
  await env.TELEGRAM_STATE.put(CATALOG_KEY, body);
  console.log(JSON.stringify({ event: "catalog_built", players: catalog.elements.length, bytes: body.length }));
  return { written: true };
}

/**
 * How long a kickoff is worth treating as football. A match is about two hours with the
 * half; the extra hour covers a long stoppage and the bonus points settling afterwards,
 * which is the tail the ticker still has something to say during.
 */
const MATCH_LEAD_MS = 15 * 60_000;
const MATCH_LENGTH_MS = 3 * 3_600_000;

/** Whether a match is being played right now, or is about to be. */
export function footballOn(catalog: Catalog, now: number): boolean {
  return catalog.fixtures.some((fixture) => {
    const kickoff = Date.parse(fixture.kickoff);
    return now >= kickoff - MATCH_LEAD_MS && now <= kickoff + MATCH_LENGTH_MS;
  });
}

/**
 * Whether FPL has confirmed the gameweek and there is nothing left to watch.
 *
 * `finished` is FPL's own word for it and it comes well after the last whistle — bonus is
 * recalculated, appeals are settled, and the flag turns over some hours later. Until it
 * does there is still something that can move, which is why this is the signal rather than
 * the fixture list being played out.
 */
export function gameweekSettled(catalog: Catalog): boolean {
  const current = catalog.events.find((event) => event.is_current);
  return Boolean(current?.finished);
}
