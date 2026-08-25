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

export type Outlook = {
  deadline: string;
  direction: "rise" | "fall";
  /** An adjacent change that is close enough to be possible too, if there is one. */
  couldBe: { deadline: string; sooner: boolean } | null;
} | null;

/**
 * How near the line counts as too near to state a night flatly, in percentage points of
 * progress at that change.
 *
 * The margin is in points and not in hours because an hour of slack is worth a different
 * distance to every player: at 0.9 an hour it is 0.9 points and at 2.4 an hour it is 2.4.
 * Points are what decides the outcome — the meter either reads 100 at 02:00 or it does
 * not — and they are the quantity the rest of this column already runs on.
 *
 * Five of them is about what the rate itself is worth over a night. It is derived from two
 * FPL projections a day apart, and against LiveFPL's own column it ran 5–10 % out (1.67
 * against 1.76, 1.93 against 2.11, 2.38 against 2.28); over the seventeen hours to a change
 * at one or two points an hour that is 1.7 to 3.4 points before any real movement in the
 * transfer flow. Five is a rate a third off over what is left of the window. Ten would be
 * a rate that had stopped being the same number.
 */
export const BORDERLINE_POINTS = 5;

/** Progress this rate lands on at a given moment, which is what a change is decided on. */
function projectedAt(row: Pick<PriceRow, "progress" | "perHour">, deadline: string, now: number): number {
  return row.progress + row.perHour * ((Date.parse(deadline) - now) / 3_600_000);
}

/**
 * Which day a change belongs to, counted from today in the reader's own zone.
 *
 * A change lands at 02:00, and 02:00 belongs to the evening before it, not to the morning
 * it technically falls in. So the day a deadline is named after is the day its own window
 * opened — the previous change, 24 hours earlier — and not its own calendar date. Read
 * naively, a change 17 hours away at 02:00 tonight came out as *huomenna* when everyone
 * reading the page would call it tonight. This is the same reckoning behind FPL's own
 * `offset` 0 meaning today, and that part of their page was right.
 *
 * Negative when the window has already opened, which is any deadline later tonight.
 */
export function daysUntilChangeDay(deadline: string, now: number): number {
  const midnight = (value: number) => {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  return Math.round((midnight(Date.parse(deadline) - 86_400_000) - midnight(now)) / 86_400_000);
}

/**
 * When this player's price actually changes: the first published deadline after the moment
 * his progress reaches 100.
 *
 * This used to read FPL's own projections and label them today/tomorrow/2 days by their
 * offset, which is what FPL's page does and it is wrong twice over. A projection offset is
 * a day from now, not a change time, so a player already past 100 was called "today" when
 * the next change is at 02:00 tomorrow; and a player the per-hour column put 22 hours away
 * was called "tomorrow" even though 22 hours from now is past tomorrow's 02:00 and his
 * change is the night after. The column now follows the same arithmetic as the column
 * beside it — progress and rate give the hour, the published deadline list gives the day —
 * so the two can no longer disagree.
 *
 * Past the end of that list there is no day to name: FPL publishes three deadlines, and a
 * rate extrapolated further than that is a guess about a time nobody has announced.
 */
export function outlookFor(
  row: Pick<PriceRow, "progress" | "perHour">,
  deadlines: string[],
  now: number,
): Outlook {
  // Already over the line: the rate no longer matters, the next deadline takes him.
  const hours = Math.abs(row.progress) >= 100 ? 0 : hoursToChange(row.progress, row.perHour);
  if (hours === null) return null;
  const crossing = now + hours * 3_600_000;
  const index = deadlines.findIndex((entry) => Date.parse(entry) > crossing);
  if (index < 0) return null;
  const deadline = deadlines[index];
  const direction = (row.progress !== 0 ? row.progress : row.perHour) > 0 ? "rise" : "fall";

  // A night stated flatly when the projection lands a point or two either side of the line
  // claims a precision the rate does not have. The change before this one may still take
  // him, or this one may not — and both are the same margin read from opposite sides.
  const earlier = index > 0 ? deadlines[index - 1] : null;
  if (earlier && Math.abs(projectedAt(row, earlier, now)) >= 100 - BORDERLINE_POINTS) {
    return { deadline, direction, couldBe: { deadline: earlier, sooner: true } };
  }
  const later = deadlines[index + 1] ?? null;
  if (later && Math.abs(projectedAt(row, deadline, now)) < 100 + BORDERLINE_POINTS) {
    return { deadline, direction, couldBe: { deadline: later, sooner: false } };
  }
  return { deadline, direction, couldBe: null };
}

export function buildPriceMarket(
  elements: PriceElement[],
  teams: Array<{ id: number; short_name: string; code: number }>,
  deadlines: string[],
  gameweekDeadline: string | null = null,
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
  return { deadlines, gameweekDeadline, players };
}

/**
 * The last change before the gameweek deadline — the far end of the week this page is
 * about. Everything past it is next week's squad, not this one's.
 *
 * FPL's published list already stops there: on 25 Aug it carried exactly the three changes
 * left before GW2's Friday deadline, the last of them at 02:00 that same Friday. The
 * gameweek deadline is still checked rather than assumed, because a list that grows past
 * it would otherwise stretch the week silently.
 */
export function lastChangeBeforeDeadline(market: PriceMarket): string | null {
  const within = market.gameweekDeadline
    ? market.deadlines.filter((entry) => Date.parse(entry) < Date.parse(market.gameweekDeadline as string))
    : market.deadlines;
  return within[within.length - 1] ?? null;
}

/**
 * Close enough to be worth saying, but not close enough to name a night.
 *
 * A player who is not reaching 100 at any published change can still be nearly there by
 * the last one before the deadline, and that is a different fact from nothing happening —
 * it is the difference between a squad that is safe until Friday and one that may not be.
 * The threshold is the same `BORDERLINE_POINTS` off the line as everything else here, so
 * the sentence only appears when the rate has to hold rather than improve.
 *
 * It is a guess and reads as one, and it is only made for a player already going the way
 * his rate pulls. One who has turned around would otherwise be projected straight through
 * zero and out the far side: 40 % falling at 2.5 an hour comes to −122 in three days, and
 * the page would announce a fall for a player whose meter is still on the way up. This is
 * the same rule `hoursToChange` applies, for the same reason.
 */
export function maybeThisWeek(
  row: Pick<PriceRow, "progress" | "perHour">,
  market: PriceMarket,
  now: number,
): "rise" | "fall" | null {
  const cutoff = lastChangeBeforeDeadline(market);
  if (!cutoff || row.perHour === 0) return null;
  const hours = (Date.parse(cutoff) - now) / 3_600_000;
  if (hours <= 0) return null;
  if (row.progress !== 0 && Math.sign(row.progress) !== Math.sign(row.perHour)) return null;
  const projected = row.progress + row.perHour * hours;
  if (Math.abs(projected) < 100 - BORDERLINE_POINTS) return null;
  return projected > 0 ? "rise" : "fall";
}

/**
 * The prediction column as a sortable value: how soon a change is, and how sure of it.
 *
 * The column means *when*, so it sorts by when — one axis, risers and fallers together.
 * Ranking it by direction was the other option and it is the same mistake the progress
 * column already refused: a header sorts its column, and this column does not say which
 * way a price moves. The filter buttons are there for that.
 *
 * A list of numbers rather than one, compared in order, because the tiers do not share a
 * scale — hours until a change and points short of the line are not the same quantity and
 * folding them into a single figure would only invent an exchange rate between them.
 *
 *  0  a named change, by the hours until it, then by how far past the line it lands
 *  1  near enough to hedge, closest to the line first
 *  2  going nowhere this week, again closest first
 *  3  calibrating, which is FPL saying it does not know yet
 *  4  locked, where there is nothing to predict at all, by when it comes free
 */
export function outlookRank(row: PriceRow, market: PriceMarket, now: number): number[] {
  if (row.lockedUntil) return [4, Date.parse(row.lockedUntil)];
  if (row.calibrating) return [3, 0];
  const outlook = outlookFor(row, market.deadlines, now);
  if (outlook) {
    const hours = (Date.parse(outlook.deadline) - now) / 3_600_000;
    // Two players changing the same night are not equally certain of it.
    return [0, hours, -(Math.abs(projectedAt(row, outlook.deadline, now)) - 100)];
  }
  const cutoff = lastChangeBeforeDeadline(market);
  const projected = cutoff ? Math.abs(projectedAt(row, cutoff, now)) : Math.abs(row.progress);
  return [maybeThisWeek(row, market, now) ? 1 : 2, -projected];
}

/** The next change FPL has published, or null once its list runs out. */
export function nextPriceDeadline(market: PriceMarket | undefined, now: number): string | null {
  if (!market) return null;
  return market.deadlines.find((deadline) => new Date(deadline).getTime() > now) ?? null;
}
