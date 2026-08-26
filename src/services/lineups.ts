/**
 * Predicted line-ups and the injured-and-suspended lists, as the Worker collects them.
 *
 * The prediction is only ever shown when FotMob says it is one. It publishes an eleven for
 * every upcoming match, but for the ones further out that eleven is simply the side that
 * started last time — the Worker throws those away, so anything that arrives here with
 * `predicted` set is a genuine forecast and everything else carries no eleven at all.
 */

export interface UnavailablePlayer {
  element: number | null;
  name: string;
  club: string;
  reason: string;
  expectedReturn: string;
}

export interface FixtureLineup {
  matchId: number;
  kickoff: string;
  home: string;
  away: string;
  predicted: boolean;
  starters: number[];
  unavailable: UnavailablePlayer[];
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const lineupsEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/lineups` : null;

export async function loadLineups(): Promise<FixtureLineup[] | null> {
  if (!lineupsEndpoint) return null;
  const response = await fetch(lineupsEndpoint);
  if (!response.ok) throw new Error(`Lineups request failed: ${response.status}`);
  const body = await response.json() as { fixtures?: FixtureLineup[] };
  return body.fixtures ?? [];
}

export interface LineupWatch {
  /** Elements in a published predicted eleven, so a shirt can say "expected to start". */
  starting: Set<number>;
  /** Elements whose club has a prediction that leaves them out. This is the useful one. */
  benched: Set<number>;
  /** Elements FotMob lists as injured or suspended, with its own wording. */
  unavailable: Map<number, UnavailablePlayer>;
}

/**
 * What the shirts can be marked from.
 *
 * `benched` is the answer to the question FPL cannot answer: his club has a predicted
 * eleven, and he is not in it. It is only ever computed from a fixture FotMob has actually
 * predicted — a club with no prediction yet leaves its players out of both sets, so a shirt
 * says nothing rather than something wrong.
 */
export function watchFrom(fixtures: FixtureLineup[], clubOf: Map<number, string>): LineupWatch {
  const starting = new Set<number>();
  const predictedClubs = new Set<string>();
  const unavailable = new Map<number, UnavailablePlayer>();

  for (const fixture of fixtures) {
    for (const player of fixture.unavailable) {
      if (player.element !== null) unavailable.set(player.element, player);
    }
    if (!fixture.predicted) continue;
    predictedClubs.add(fixture.home);
    predictedClubs.add(fixture.away);
    for (const element of fixture.starters) starting.add(element);
  }

  const benched = new Set<number>();
  for (const [element, club] of clubOf) {
    // Only a club whose eleven has been predicted can leave anybody out of it, and an
    // unavailable player is already accounted for by a flag of his own.
    if (!predictedClubs.has(club) || starting.has(element) || unavailable.has(element)) continue;
    benched.add(element);
  }
  return { starting, benched, unavailable };
}
