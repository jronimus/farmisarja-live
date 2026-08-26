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
  strength: "imminent" | "high" | "low";
  source: string;
  sourceUrl?: string;
  reportedAt: string;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const rumoursEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/rumours` : null;

export async function loadRumours(): Promise<Rumour[] | null> {
  if (!rumoursEndpoint) return null;
  const response = await fetch(rumoursEndpoint);
  if (!response.ok) throw new Error(`Rumours request failed: ${response.status}`);
  const body = await response.json() as { rumours?: Rumour[] };
  return body.rumours ?? [];
}

const RANK: Record<Rumour["strength"], number> = { imminent: 0, high: 1, low: 2 };

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

/** Only the ones worth marking a shirt for. A `Low` is a newspaper having a guess. */
export function isStrong(rumour: Rumour): boolean {
  return rumour.strength === "imminent" || rumour.strength === "high";
}
