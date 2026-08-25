/**
 * The live overall rank, read off a curve the Worker builds.
 *
 * FPL's own overall rank is a pure function of total points — every manager on 87 points
 * shares rank 21 754 — so a rank is only ever a count of who stands above a total. FPL
 * publishes that count for its own stored totals, and those lag: while a gameweek runs they
 * are last week's, and even once every fixture is confirmed they still exclude every
 * autosub in the game. The Worker samples the global league, scores those squads from the
 * same live payload the feed reads, and sends the resulting curve here.
 *
 * See `worker/liveRank.ts` for how it is built and what was measured before it was.
 */

export interface RankCurve {
  gameweek: number;
  /** Entries FPL has ranked, which is what a rank is out of. */
  ranked: number;
  /** The weight of the whole sample, which the counts below are out of. */
  weight: number;
  /** Total points → the weight standing strictly above it, densest first. */
  above: Array<[number, number]>;
  scoredAt: string;
  /** How much of the sample is built, 0–1. Below 1 the curve is coarser than it will be. */
  coverage: number;
  /**
   * Every fixture is `finished` — confirmed, not merely at full time — so nothing about
   * this curve can move again. Bonus is still recalculated between the two.
   */
  settled: boolean;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/** Beside the feed on the Worker root, for the same reason: `/api` only proxies FPL. */
export const rankEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/rank` : null;

export async function loadRankCurve(gameweek: number): Promise<RankCurve | null> {
  if (!rankEndpoint) return null;
  const response = await fetch(`${rankEndpoint}?gw=${gameweek}`);
  // 404 is the ordinary answer before a sample has been built, not a failure.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Rank request failed: ${response.status}`);
  return await response.json() as RankCurve;
}

/**
 * Where a total stands.
 *
 * The curve is sorted densest first, and each row carries the weight strictly above its own
 * total — so the first row at or below ours already counts everyone ahead of us. No
 * interpolation: a rank is a count, and between two sampled totals there is nobody to
 * count.
 */
export function estimateRank(total: number, curve: RankCurve | null): number | null {
  if (!curve || !curve.weight || !curve.above.length) return null;
  const row = curve.above.find(([points]) => points <= total);
  const above = row ? row[1] : curve.weight;
  return Math.min(curve.ranked, 1 + Math.round((above / curve.weight) * curve.ranked));
}
