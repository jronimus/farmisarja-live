/**
 * Transfer rumours, graded and sourced.
 *
 * FPL answers "can he play" and never "will he". A fit, unflagged player can be out of the
 * side for a fortnight because a move is being negotiated, and FPL's shirt stays clean the
 * whole time. The first attempt at filling that gap counted starts, which was wrong twice
 * over: a player can come off the bench every week and never start, and what he did last
 * Saturday says nothing about whether he is leaving.
 *
 * What does say it is a rumour with a source on it. FotMob's team payload carries an
 * `allRumours` list, and every entry has the two clubs, the reported fee, **who reported
 * it** and a graded `probability` — `Imminent`, `High` or `Low`. That is somebody else's
 * judgement, attributed and dated, rather than an inference of ours dressed up as data.
 *
 * This is an undocumented endpoint on somebody else's site, so it is read gently — half the
 * league every half hour, which is a full refresh hourly and about 5 MB a request — the
 * reporting outlet is always named on the page, and the page links to the report rather
 * than restating it. If it ever stops answering, the stored list simply ages out.
 */

export interface Rumour {
  /** FotMob's own id for the report, which is what makes a repeat of it one line. */
  id: number;
  /** The FPL element, once matched. Unmatched rumours are dropped: this is an FPL page. */
  element: number;
  player: string;
  /** FPL's own short name for the club he would leave, so the page can match a shirt to it. */
  fromClub: string;
  toClub: string;
  /** True when he would still be in the Premier League afterwards. */
  staysInLeague: boolean;
  strength: "imminent" | "high" | "low";
  source: string;
  sourceUrl?: string;
  reportedAt: string;
}

export interface RumoursEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredRumours {
  checkAfter: string;
  /** Which half of the league goes next, so a tick reads ten clubs and not twenty. */
  half: number;
  rumours: Rumour[];
}

const RUMOURS_KEY = "rumours:list";

/**
 * FotMob's club ids for the 2026-27 Premier League, against FPL's own short names.
 *
 * Read off FotMob's league table on 26 Aug 2026 rather than guessed. Promotion and
 * relegation move three of these every summer; an FPL club missing from the map is skipped
 * and logged rather than mismatched onto the wrong side.
 */
const CLUBS: Record<number, string> = {
  9825: "ARS", 10252: "AVL", 8678: "BOU", 9937: "BRE", 10204: "BHA",
  8455: "CHE", 8669: "COV", 9826: "CRY", 8668: "EVE", 9879: "FUL",
  8667: "HUL", 9902: "IPS", 8463: "LEE", 8650: "LIV", 8456: "MCI",
  10260: "MUN", 10261: "NEW", 10203: "NFO", 8472: "SUN", 8586: "TOT",
};

/** Half an hour a half, so the whole league is an hour old at worst. */
const CHECK_MS = 30 * 60_000;
/** A rumour nobody has repeated in a fortnight has been overtaken by events. */
const MAX_AGE_MS = 14 * 86_400_000;

interface FotMobRumour {
  name: string;
  fromClubId: number;
  fromClub: string;
  toClub: string;
  toClubId: number;
  probability?: string;
  sourceName?: string;
  sourceUrl?: string;
  transferDate: string;
  rumourId: number;
}

interface Element { id: number; web_name: string; first_name: string; second_name: string; team: number }
interface Bootstrap { elements: Element[]; teams: Array<{ id: number; short_name: string }> }

/** Lower case, no accents, no punctuation — the only form two sites ever agree on. */
export function normalise(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Which FPL player a rumour is about.
 *
 * The two sites do not spell anybody the same way. FotMob says `Emiliano Martínez`, FPL
 * files him as `Emiliano` / `Martínez Romero` with a web name of `Martinez`, and there is a
 * second Martínez at another club. So the club comes first — a rumour is always attached to
 * one — and inside it the match is on shared name parts, with the forename breaking a tie.
 * Nothing matches across clubs, which is what keeps the two Martínezes apart.
 */
export function matchElement(name: string, clubId: number, elements: Element[], teamByShort: Map<string, number>): number | null {
  const short = CLUBS[clubId];
  const team = short ? teamByShort.get(short) : undefined;
  if (!team) return null;
  const parts = new Set(normalise(name).split(" ").filter((part) => part.length >= 3));
  if (!parts.size) return null;

  let best: { id: number; score: number } | null = null;
  for (const element of elements) {
    if (element.team !== team) continue;
    const own = new Set([
      ...normalise(`${element.first_name} ${element.second_name}`).split(" "),
      ...normalise(element.web_name).split(" "),
    ].filter((part) => part.length >= 3));
    let score = 0;
    for (const part of parts) if (own.has(part)) score += 1;
    if (!score) continue;
    // A surname alone is one part; a forename and a surname together are two, and that is
    // what separates the right Rodrigo from the other one at the same club.
    if (!best || score > best.score) best = { id: element.id, score };
  }
  return best ? best.id : null;
}

const STRENGTH: Record<string, Rumour["strength"]> = { imminent: "imminent", high: "high", low: "low" };

export function rumoursFromTeam(
  payload: { transfers?: { allRumours?: FotMobRumour[] } },
  elements: Element[],
  teamByShort: Map<string, number>,
): Rumour[] {
  const out: Rumour[] = [];
  for (const entry of payload.transfers?.allRumours ?? []) {
    // Only players leaving a Premier League club. An incoming rumour is about somebody who
    // is not in the game yet, and FPL squads cannot hold him either way.
    if (!CLUBS[entry.fromClubId]) continue;
    const strength = STRENGTH[(entry.probability ?? "").toLowerCase()];
    if (!strength) continue;
    const element = matchElement(entry.name, entry.fromClubId, elements, teamByShort);
    if (!element) continue;
    out.push({
      id: entry.rumourId,
      element,
      player: entry.name,
      // FPL's short name, not FotMob's label: every other club on this site is `MCI`, and
      // it is also what a batch is merged by. The destination keeps FotMob's own wording,
      // because it can be any club in the world and there is no FPL name for AC Milan.
      fromClub: CLUBS[entry.fromClubId],
      toClub: entry.toClub,
      staysInLeague: Boolean(CLUBS[entry.toClubId]),
      strength,
      source: entry.sourceName ?? "—",
      sourceUrl: entry.sourceUrl,
      reportedAt: new Date(entry.transferDate).toISOString(),
    });
  }
  return out;
}

/**
 * The stored list after a batch: the fresh reports, the ones from the clubs this tick did
 * not read, and nothing a fortnight old.
 *
 * Merging by club rather than wholesale is what lets a tick read half the league: a club
 * that was not asked keeps what it last said instead of vanishing for half an hour.
 */
export function mergeRumours(stored: Rumour[], fresh: Rumour[], clubsRead: string[], now: number): Rumour[] {
  const read = new Set(clubsRead);
  const kept = stored.filter((rumour) => !read.has(rumour.fromClub));
  const byId = new Map<number, Rumour>();
  for (const rumour of [...kept, ...fresh]) byId.set(rumour.id, rumour);
  return [...byId.values()]
    .filter((rumour) => now - Date.parse(rumour.reportedAt) < MAX_AGE_MS)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}

export async function readRumours(env: RumoursEnv): Promise<StoredRumours | null> {
  return await env.TELEGRAM_STATE.get<StoredRumours>(RUMOURS_KEY, "json");
}

export async function updateRumours(env: RumoursEnv, now = Date.now()): Promise<{ written: boolean; count: number }> {
  const stored = await readRumours(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, count: 0 };

  const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  }).then((response) => response.json() as Promise<Bootstrap>);
  const teamByShort = new Map(bootstrap.teams.map((team) => [team.short_name, team.id]));

  const ids = Object.keys(CLUBS).map(Number);
  const half = (stored?.half ?? 0) % 2;
  const batch = ids.slice(half * 10, half * 10 + 10);

  const results = await Promise.all(batch.map(async (clubId) => {
    try {
      const response = await fetch(`https://www.fotmob.com/api/data/teams?id=${clubId}&ccode3=FIN`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Farmisarja-Live/0.1)" },
        cf: { cacheEverything: true, cacheTtl: 900 },
      });
      if (!response.ok) throw new Error(`FotMob ${clubId} ${response.status}`);
      return rumoursFromTeam(await response.json(), bootstrap.elements, teamByShort);
    } catch (error) {
      console.error(JSON.stringify({ event: "rumour_fetch_error", club: clubId, error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }));

  // A club that failed is not a club with no rumours, so it keeps what it last said.
  const clubsRead = batch.filter((_, index) => results[index] !== null).map((clubId) => CLUBS[clubId]);
  const fresh = results.flatMap((entry) => entry ?? []);
  const rumours = mergeRumours(stored?.rumours ?? [], fresh, clubsRead, now);

  await env.TELEGRAM_STATE.put(RUMOURS_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    half: half + 1,
    rumours,
  } satisfies StoredRumours));
  return { written: true, count: rumours.length };
}
