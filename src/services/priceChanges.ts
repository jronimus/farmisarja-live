import type { PriceMarket, PriceProjection, PriceRow } from "../types";

/**
 * Price changes come from FPL itself. Since 2026-27 the bootstrap carries
 * `price_change_percent`, three `price_change_projections`, a lock time and a calibration
 * flag per player, and `game_config.settings.price_change_deadlines` for the clock. None
 * of this is modelled here and none of it should be: an own estimate can only disagree
 * with the official numbers, the same conclusion the provisional-bonus work reached.
 */

export interface PriceElement {
  id: number;
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  cost_change_start: number;
  selected_by_percent: string;
  transfers_in_event: number;
  transfers_out_event: number;
  price_change_percent: string | number;
  price_change_projections: Array<{ offset: number; projected_percent: string | number; likelihood: number }>;
  price_change_locked_until: string | null;
  price_change_calibrating: boolean;
}

const positions = ["GK", "DEF", "MID", "FWD"] as const;

/**
 * Percentage points per hour.
 *
 * FPL does not publish a rate — `price_change_hourly_rate` is a transfer count, not a
 * percentage — but two projections exactly a day apart do give one. Checked against
 * LiveFPL's own per-hour column on the same players: 1.67 against 1.76, 1.93 against
 * 2.11, 2.38 against 2.28. Close, and from the official numbers rather than a model.
 */
export function perHourFromProjections(projections: PriceProjection[]): number {
  const tomorrow = projections.find((entry) => entry.offset === 1);
  const dayAfter = projections.find((entry) => entry.offset === 2);
  if (!tomorrow || !dayAfter) return 0;
  return (dayAfter.percent - tomorrow.percent) / 24;
}

/** Hours until the progress reaches 100, or null when it is going nowhere. */
export function hoursToChange(progress: number, perHour: number): number | null {
  if (perHour === 0) return null;
  const remaining = (progress >= 0 ? 100 : -100) - progress;
  // A rate pulling the other way never gets there.
  if (Math.sign(remaining) !== Math.sign(perHour)) return null;
  return remaining / perHour;
}

export type Outlook = { offset: number; likelihood: number; direction: "rise" | "fall" } | null;

/**
 * The first of FPL's projections that reaches a price change, if any. This is what turns
 * three percentages into "rises tonight" — the same reading the official page puts in its
 * status column, done from the same numbers.
 */
export function outlookFor(row: Pick<PriceRow, "projections">): Outlook {
  const reached = [...row.projections]
    .sort((a, b) => a.offset - b.offset)
    .find((entry) => Math.abs(entry.percent) >= 100);
  if (!reached) return null;
  return { offset: reached.offset, likelihood: reached.likelihood, direction: reached.percent > 0 ? "rise" : "fall" };
}

export function buildPriceMarket(
  elements: PriceElement[],
  teams: Array<{ id: number; short_name: string; code: number }>,
  deadlines: string[],
): PriceMarket {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const players = elements.map((element): PriceRow => {
    const projections: PriceProjection[] = (element.price_change_projections ?? []).map((entry) => ({
      offset: entry.offset,
      percent: Number(entry.projected_percent),
      likelihood: entry.likelihood,
    }));
    const team = teamById.get(element.team);
    return {
      id: element.id,
      name: element.web_name,
      club: team?.short_name ?? "—",
      clubCode: team?.code ?? 0,
      position: positions[element.element_type - 1] ?? "MID",
      cost: element.now_cost / 10,
      costChangeStart: element.cost_change_start / 10,
      ownership: Number(element.selected_by_percent),
      netTransfers: element.transfers_in_event - element.transfers_out_event,
      progress: Number(element.price_change_percent),
      projections,
      perHour: perHourFromProjections(projections),
      lockedUntil: element.price_change_locked_until,
      calibrating: element.price_change_calibrating,
    };
  });
  return { deadlines, players };
}

/** The next change FPL has published, or null once its list runs out. */
export function nextPriceDeadline(market: PriceMarket | undefined, now: number): string | null {
  if (!market) return null;
  return market.deadlines.find((deadline) => new Date(deadline).getTime() > now) ?? null;
}
