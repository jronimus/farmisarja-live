import { CLUBS, matchElement, type Element } from "./fotmob";

/**
 * Moves that have already happened, off a wire rather than out of a digest.
 *
 * The complaint that produced this: the page was showing a `Goal` rumour about Watkins to
 * Al Hilal at a point when Romano had already posted *here we go*. The measurement was worth
 * making before the fix, because it moved the blame: at that moment FotMob's own rumour
 * digest carried the Romano report, graded `High`, dated the same evening — and our stored
 * copy carried the `Goal` one from three days earlier. **FotMob was not slow. We were**, by
 * up to an hour, because the rumour sweep reads half the league every half hour.
 *
 * Reading twenty club payloads more often is the obvious fix and the wrong one: each is
 * about half a megabyte, so an hourly sweep is already ten megabytes of somebody else's
 * bandwidth. `api/data/transfers` answers the same question in **29 kB** — every completed
 * transfer in the world, newest first, fifty to a page, `?page=` for the ones behind them.
 * A tick of this costs a fortieth of one club payload, so it can run every few minutes.
 *
 * What it carries is *done deals*, not rumours: no `probability` field, because there is
 * nothing left to grade. That is exactly the half the digest is slowest at. A rumour whose
 * move has gone through stops being a rumour, and the page can say so hours before FPL flips
 * the player's flag to `u` and writes "Has joined X permanently" — which remains the
 * authoritative word, and is the one that decides whether he still scores points.
 *
 * Only departures from a Premier League club are kept. An arrival is somebody who is not in
 * the game yet, and FPL adds him to the game itself; a contract extension is not a move at
 * all.
 */

export interface Deal {
  /** The FPL element, once matched. Unmatched departures are dropped: this is an FPL page. */
  element: number;
  player: string;
  /** FPL's own short name for the club he has left, so the page can match a shirt to it. */
  fromClub: string;
  /** FotMob's own wording for the destination — it can be any club in the world. */
  toClub: string;
  /** True when he is still in the Premier League, and so still in the game. */
  staysInLeague: boolean;
  /** `on loan` or a permanent move, in FotMob's own words. */
  onLoan: boolean;
  at: string;
}

export interface TransfersEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredDeals {
  checkAfter: string;
  deals: Deal[];
}

const DEALS_KEY = "transfers:done";

/**
 * Five minutes. The wire is 29 kB, so this is under a megabyte an hour — a fifteenth of
 * what the rumour sweep already spends, for a list that is minutes old rather than one.
 */
const CHECK_MS = 5 * 60_000;

/** A move a fortnight old is not news, and by then FPL has flagged the player itself. */
const MAX_AGE_MS = 14 * 86_400_000;

const WIRE = "https://www.fotmob.com/api/data/transfers";

interface Bootstrap { elements: Element[]; teams: Array<{ id: number; short_name: string }> }

export interface WireTransfer {
  name: string;
  fromClubId: number;
  toClub: string;
  toClubId: number;
  transferDate: string;
  onLoan?: boolean;
  contractExtension?: boolean;
}

export function dealsFromWire(
  transfers: WireTransfer[],
  elements: Element[],
  teamByShort: Map<string, number>,
): Deal[] {
  const out: Deal[] = [];
  for (const entry of transfers) {
    if (entry.contractExtension) continue;
    // A departure from a Premier League club. An arrival is about somebody the game does
    // not hold yet, and a move between two clubs neither of which is in the league is
    // nothing to do with this page.
    if (!CLUBS[entry.fromClubId]) continue;
    const element = matchElement(entry.name, entry.fromClubId, elements, teamByShort);
    if (!element) continue;
    out.push({
      element,
      player: entry.name,
      fromClub: CLUBS[entry.fromClubId],
      toClub: entry.toClub,
      staysInLeague: Boolean(CLUBS[entry.toClubId]),
      onLoan: Boolean(entry.onLoan),
      at: new Date(entry.transferDate).toISOString(),
    });
  }
  return out;
}

/**
 * The stored list after a tick.
 *
 * Merged by player rather than wholesale: the wire is a window on the newest fifty moves in
 * the world, so a deal drops off it within hours simply because other clubs have been busy.
 * Falling off the wire is not the move being undone.
 */
export function mergeDeals(stored: Deal[], fresh: Deal[], now: number): Deal[] {
  const byPlayer = new Map<number, Deal>();
  for (const deal of [...stored, ...fresh]) byPlayer.set(deal.element, deal);
  return [...byPlayer.values()]
    .filter((deal) => now - Date.parse(deal.at) < MAX_AGE_MS)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function readDeals(env: TransfersEnv): Promise<StoredDeals | null> {
  return await env.TELEGRAM_STATE.get<StoredDeals>(DEALS_KEY, "json");
}

export async function updateTransfers(env: TransfersEnv, now = Date.now()): Promise<{ written: boolean; count: number }> {
  const stored = await readDeals(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, count: 0 };

  const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  }).then((response) => response.json() as Promise<Bootstrap>);
  const teamByShort = new Map(bootstrap.teams.map((team) => [team.short_name, team.id]));

  const response = await fetch(WIRE, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Farmisarja-Live/0.1)" },
    cf: { cacheEverything: true, cacheTtl: 120 },
  });
  if (!response.ok) throw new Error(`FotMob transfers ${response.status}`);
  const body = await response.json() as { transfers?: WireTransfer[] };

  const deals = mergeDeals(stored?.deals ?? [], dealsFromWire(body.transfers ?? [], bootstrap.elements, teamByShort), now);
  await env.TELEGRAM_STATE.put(DEALS_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    deals,
  } satisfies StoredDeals));
  console.log(JSON.stringify({ event: "transfers_updated", deals: deals.length }));
  return { written: true, count: deals.length };
}
