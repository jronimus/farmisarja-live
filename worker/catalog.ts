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
 * So the bootstrap is read on one tick in ten, narrowed to the four fields per player that
 * anything hot wants, and left in KV. What comes back out is about thirty kilobytes and
 * parses in a fifth of a millisecond. Everything that used to reach for the bootstrap on
 * every tick now reads this instead, and the tick has room to do its job.
 *
 * The gated readers — prices, articles, rumours, transfers, line-ups, history, appearances,
 * insights — still fetch the bootstrap themselves. They already return after one KV read on
 * the ticks they are not due, they want fields nobody else does, and they now get a tick to
 * themselves. There is nothing to gain by routing them through here.
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
}

export interface CatalogEnv { TELEGRAM_STATE: KVNamespace }

interface Bootstrap {
  events: Array<{ id: number; deadline_time: string; is_current: boolean; is_next: boolean; finished: boolean; ranked_count: number }>;
  teams: Array<{ id: number; short_name: string; name: string }>;
  elements: Array<{ id: number; web_name: string; first_name: string; second_name: string; team: number; element_type: number }>;
}

const CATALOG_KEY = "catalog:v1";
/** Bumped when a field is added, so a stored catalog without it is rebuilt rather than read. */
export const CATALOG_VERSION = 3;

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
  };
  await env.TELEGRAM_STATE.put(CATALOG_KEY, JSON.stringify(catalog));
  console.log(JSON.stringify({ event: "catalog_built", players: catalog.elements.length, bytes: JSON.stringify(catalog).length }));
  return { written: true };
}
