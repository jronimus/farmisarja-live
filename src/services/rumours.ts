/**
 * Transfer rumours, as the Worker collects them from FotMob.
 *
 * Every line is somebody else's reporting: two clubs, a graded probability, the outlet that
 * ran it and a link to the report. Nothing here is inferred, which is the whole point — the
 * first attempt at this question counted starts, and a player who comes off the bench every
 * week without starting told us nothing about whether he was leaving.
 */

export interface Rumour {
  id: number;
  element: number;
  player: string;
  fromClub: string;
  toClub: string;
  staysInLeague: boolean;
  strength: "imminent" | "high" | "medium" | "low";
  source: string;
  sourceUrl?: string;
  reportedAt: string;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const rumoursEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/rumours` : null;

/**
 * Who a club cannot pick, in FotMob's own words — richer than FPL's own flags, which is why
 * it is worth carrying beside them: expected returns as phrases ("Early September 2026",
 * "Back in training", "Doubtful") and suspensions marked as suspensions.
 */
export interface Absence {
  element: number | null;
  name: string;
  club: string;
  reason: string;
  expectedReturn: string;
}


/**
 * A move that has already happened.
 *
 * Off FotMob's own transfer wire rather than out of its per-club rumour digest, which is
 * what makes it fast: a done deal is on the wire within minutes and in FPL's own flags hours
 * later. It is a fact rather than a report, so unlike a rumour it is not graded and no
 * outlet is named — nobody is claiming anything, the move is done.
 *
 * What it changes on the page: a player whose rumour has gone through stops being reported
 * as a rumour. FPL is still the word that decides whether he scores points, and when it
 * catches up it says so itself in the row above.
 */
export interface Deal {
  element: number;
  player: string;
  fromClub: string;
  toClub: string;
  staysInLeague: boolean;
  onLoan: boolean;
  at: string;
}

/** All three arrive together: one endpoint, so the page makes one request for them. */
export async function loadFotmob(): Promise<{ rumours: Rumour[]; absences: Absence[]; deals: Deal[] } | null> {
  if (!rumoursEndpoint) return null;
  const response = await fetch(rumoursEndpoint);
  if (!response.ok) throw new Error(`Rumours request failed: ${response.status}`);
  const body = await response.json() as { rumours?: Rumour[]; absences?: Absence[]; deals?: Deal[] };
  return { rumours: body.rumours ?? [], absences: body.absences ?? [], deals: body.deals ?? [] };
}

/** The done deals by element, so a row can ask about the player it is drawing. */
export function dealsByElement(deals: Deal[]): Map<number, Deal> {
  return new Map(deals.map((deal) => [deal.element, deal]));
}

export async function loadRumours(): Promise<Rumour[] | null> {
  const body = await loadFotmob();
  return body ? body.rumours : null;
}

/** The absences a squad can act on, by element. Unmatched names are dropped here. */
export function absencesByElement(absences: Absence[]): Map<number, Absence> {
  const out = new Map<number, Absence>();
  for (const absence of absences) if (absence.element !== null) out.set(absence.element, absence);
  return out;
}

const RANK: Record<Rumour["strength"], number> = { imminent: 0, high: 1, medium: 2, low: 3 };

/**
 * Everything reported about one player's possible move, gathered into a line.
 *
 * A rumour is not a fact about FPL. The fact is that a player being negotiated over may not
 * be in the side on Saturday, which is why this ends up in the same list as the injuries
 * rather than in a table of its own — and why the destination is context rather than a
 * claim. "He would still be in the Premier League" said nothing worth saying: staying in
 * the league is no promise that anybody is playing this week.
 *
 * Every report is kept and every source is linked. One player collects several — Grealish
 * had five in a day, to four different clubs — and the number of outlets saying it, and
 * which outlets they are, is the reader's own way of judging it. Which is also why the
 * grading is not printed: `Imminent` against `High` is somebody's interpretation, and two
 * named reports say more than one adjective does.
 */
export interface Move {
  element: number;
  fromClub: string;
  /** Every destination reported, strongest report first. */
  destinations: string[];
  sources: Array<{ name: string; url?: string; at: string }>;
  /** Kept for ordering and for deciding whether a shirt is marked at all, never printed. */
  strongest: Rumour["strength"];
  latest: string;
}

export function movesByElement(rumours: Rumour[]): Map<number, Move> {
  const byElement = new Map<number, Rumour[]>();
  for (const rumour of rumours) byElement.set(rumour.element, [...(byElement.get(rumour.element) ?? []), rumour]);

  const moves = new Map<number, Move>();
  for (const [element, reports] of byElement) {
    const ordered = [...reports].sort((a, b) => RANK[a.strength] - RANK[b.strength] || b.reportedAt.localeCompare(a.reportedAt));
    moves.set(element, {
      element,
      fromClub: ordered[0].fromClub,
      destinations: [...new Set(ordered.map((report) => report.toClub))],
      // One outlet reporting the same move twice is one source, not two.
      sources: [...new Map(ordered.map((report) => [report.source, { name: report.source, url: report.sourceUrl, at: report.reportedAt }])).values()],
      strongest: ordered[0].strength,
      latest: ordered.map((report) => report.reportedAt).sort().at(-1) as string,
    });
  }
  return moves;
}

/**
 * The strongest live report per player.
 *
 * One player collects several: Grealish had five on one day, four of them `Low` and to four
 * different clubs. A squad wants the strongest one, not the longest list — and a shirt has
 * room for one mark.
 */
export function strongestByPlayer(rumours: Rumour[]): Map<number, Rumour> {
  const best = new Map<number, Rumour>();
  for (const rumour of rumours) {
    const held = best.get(rumour.element);
    if (!held || RANK[rumour.strength] < RANK[held.strength]
      || (RANK[rumour.strength] === RANK[held.strength] && rumour.reportedAt > held.reportedAt)) {
      best.set(rumour.element, rumour);
    }
  }
  return best;
}

/**
 * Only the ones worth marking a shirt for.
 *
 * A `Low` is a newspaper having a guess. A `Medium` is more than that and it belongs in the
 * news list, but a shirt in the table has room for one mark and no room for a degree: the
 * mark has to mean "this is likely enough to plan around", and `Imminent` and `High` are the
 * two grades that do.
 */
export function isStrong(rumour: Rumour): boolean {
  return rumour.strength === "imminent" || rumour.strength === "high";
}
