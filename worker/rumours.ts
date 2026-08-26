import { CLUBS, matchElement, type Element } from "./fotmob";

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
  strength: "imminent" | "high" | "medium" | "low";
  source: string;
  sourceUrl?: string;
  reportedAt: string;
}

/**
 * Who a club cannot pick, in FotMob's own words.
 *
 * This rides along on the team payload the rumours are read from, which is the whole reason
 * it lives here rather than with the line-ups: the same ten payloads an hour already carry
 * it, so the injury list costs nothing extra and covers the entire league all week. The
 * match payload carries the same list, but only for a fixture close enough to kick-off to
 * be worth asking about — and an injury is news on a Tuesday too.
 */
export interface Absence {
  /** The FPL element when the name matched; null keeps an unmatched name readable. */
  element: number | null;
  name: string;
  club: string;
  /** FotMob's own word: `injury` or `suspension`. */
  reason: string;
  /** FotMob's own phrasing — "Early September 2026", "Back in training", "Doubtful". */
  expectedReturn: string;
}

export interface RumoursEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredRumours {
  checkAfter: string;
  /** Which half of the league goes next, so a tick reads ten clubs and not twenty. */
  half: number;
  rumours: Rumour[];
  absences?: Absence[];
}

const RUMOURS_KEY = "rumours:list";

/** Half an hour a half, so the whole league is an hour old at worst. */
const CHECK_MS = 30 * 60_000;
/** A rumour nobody has repeated in a fortnight has been overtaken by events. */
const MAX_AGE_MS = 14 * 86_400_000;

interface Bootstrap { elements: Element[]; teams: Array<{ id: number; short_name: string }> }

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

/**
 * FotMob's four grades, all four of them.
 *
 * `Medium` was missing here, and an unknown grade is skipped rather than kept ungraded, so
 * every `Medium` report was being dropped on the floor: eighteen of the four hundred live
 * across the league on 26 Aug, among them Romano on Nicolas Jackson to Villa. The list is
 * copied from what the endpoint actually returns rather than from what the first sample
 * happened to contain.
 */
const STRENGTH: Record<string, Rumour["strength"]> = { imminent: "imminent", high: "high", medium: "medium", low: "low" };

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
/** The unavailable list off the same payload, matched onto FPL where it can be. */
export function absencesFromTeam(
  payload: { overview?: { lastLineupStats?: { id?: number; unavailable?: Array<{ name: string; unavailability?: { type?: string; expectedReturn?: string } }> } } },
  clubId: number,
  elements: Element[],
  teamByShort: Map<string, number>,
): Absence[] {
  const club = CLUBS[clubId];
  if (!club) return [];
  return (payload.overview?.lastLineupStats?.unavailable ?? []).map((player) => ({
    element: matchElement(player.name, clubId, elements, teamByShort),
    name: player.name,
    club,
    reason: player.unavailability?.type ?? "injury",
    expectedReturn: player.unavailability?.expectedReturn ?? "",
  }));
}

/** The same club-wise merge the rumours get, for the same reason. */
export function mergeAbsences(stored: Absence[], fresh: Absence[], clubsRead: string[]): Absence[] {
  const read = new Set(clubsRead);
  return [...stored.filter((absence) => !read.has(absence.club)), ...fresh];
}

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
      const payload = await response.json() as Parameters<typeof rumoursFromTeam>[0] & Parameters<typeof absencesFromTeam>[0];
      return {
        rumours: rumoursFromTeam(payload, bootstrap.elements, teamByShort),
        absences: absencesFromTeam(payload, clubId, bootstrap.elements, teamByShort),
      };
    } catch (error) {
      console.error(JSON.stringify({ event: "rumour_fetch_error", club: clubId, error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }));

  // A club that failed is not a club with no rumours, so it keeps what it last said.
  const clubsRead = batch.filter((_, index) => results[index] !== null).map((clubId) => CLUBS[clubId]);
  const rumours = mergeRumours(stored?.rumours ?? [], results.flatMap((entry) => entry?.rumours ?? []), clubsRead, now);
  const absences = mergeAbsences(stored?.absences ?? [], results.flatMap((entry) => entry?.absences ?? []), clubsRead);

  await env.TELEGRAM_STATE.put(RUMOURS_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    half: half + 1,
    rumours,
    absences,
  } satisfies StoredRumours));
  console.log(JSON.stringify({ event: "rumours_updated", rumours: rumours.length, absences: absences.length }));
  return { written: true, count: rumours.length };
}
