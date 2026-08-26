import type { PlayerStat } from "../types";

/**
 * FPL's own figures for a set of gameweeks, rather than for the season.
 *
 * The game publishes one window and one only — the season to date — so the statistics table
 * used to have a seam down the middle of it: the match statistics followed the reader's
 * gameweek picker and the FPL columns beside them did not. The Worker closes it by writing
 * down where the totals stood at the end of each gameweek; a week's figures are one snapshot
 * less the one before. See `worker/fplHistory.ts` for what that costs.
 *
 * **Only the fields that accumulate come back.** A goal count can be differenced; `form` is
 * an average over the last four fixtures and differencing it would produce a number that
 * means nothing. Those columns read "—" in a gameweek window, which is the honest answer:
 * FPL does not publish a per-gameweek form, and inventing one would be worse than an empty
 * cell.
 */

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const fplHistoryEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/fpl-stats` : null;

/**
 * FPL's own spelling against ours, for the fields that accumulate.
 *
 * The Worker stores FPL's names because they are what the API sends and what a stored
 * snapshot has to keep meaning years later. This is the one place the two vocabularies meet.
 */
const NAMES: Record<string, keyof PlayerStat> = {
  total_points: "totalPoints", minutes: "minutes", starts: "starts", goals_scored: "goals",
  assists: "assists", clean_sheets: "cleanSheets", goals_conceded: "goalsConceded",
  own_goals: "ownGoals", penalties_saved: "penaltiesSaved", penalties_missed: "penaltiesMissed",
  yellow_cards: "yellowCards", red_cards: "redCards", saves: "saves", bonus: "bonus", bps: "bps",
  influence: "influence", creativity: "creativity", threat: "threat", ict_index: "ictIndex",
  expected_goals: "expectedGoals", expected_assists: "expectedAssists",
  expected_goal_involvements: "expectedGoalInvolvements",
  expected_goals_conceded: "expectedGoalsConceded",
  defensive_contribution: "defensiveContribution",
  clearances_blocks_interceptions: "clearancesBlocksInterceptions",
  recoveries: "recoveries", tackles: "tackles", dreamteam_count: "dreamteamCount",
};

/**
 * The rest of `PlayerStat`, which has no per-gameweek answer.
 *
 * All averages, plus FPL's own single-week figure — and the difference of two averages is a
 * number that means nothing. `NaN` rather than zero, because zero is a figure and this is
 * the absence of one: the table prints "—" for anything that is not a finite number, and a
 * missing figure sorts last rather than to the bottom of the scale. The columns are marked
 * `seasonOnly` in `statColumns.ts` so the picker can say which ones these are.
 */
const NO_ANSWER = {
  eventPoints: NaN, form: NaN, pointsPerGame: NaN, valueSeason: NaN,
  transfersInEvent: NaN, transfersOutEvent: NaN,
} satisfies Partial<PlayerStat>;

/**
 * The set-piece queues are not a figure for a period, so a window does not empty them.
 *
 * Where a player stands in his club's penalty queue is a fact about now. Blanking it inside
 * a gameweek window would be answering a question nobody asked — "who took the penalties in
 * GW3" is not what the column says, and the answer to what it does say is the same in every
 * window.
 */
export function carryCurrentState(windowed: PlayerStat, season: PlayerStat | undefined): PlayerStat {
  if (!season) return windowed;
  return {
    ...windowed,
    penaltiesOrder: season.penaltiesOrder,
    cornersOrder: season.cornersOrder,
    freekicksOrder: season.freekicksOrder,
  };
}

export interface FplWindow {
  /** By element id, with the same shape the season figures have. */
  players: Map<number, PlayerStat>;
  /** The gameweeks a snapshot exists for, which is what the picker may offer. */
  gameweeks: number[];
  /** Asked for, but never written down — before the snapshots began, or across a gap. */
  unavailable: number[];
}

interface Body {
  fields?: string[];
  players?: number[][];
  gameweeks?: number[];
  unavailable?: number[];
}

function statFrom(id: number, fields: string[], values: number[]): PlayerStat {
  const stat = { id, ...NO_ANSWER } as PlayerStat;
  fields.forEach((field, index) => {
    const name = NAMES[field];
    // A field the Worker has started storing and this build does not know about is skipped,
    // not guessed at: an old page against a new snapshot should lose a column, not invent one.
    if (name) (stat as unknown as Record<string, number>)[name] = values[index];
  });
  return stat;
}

/** With no gameweeks picked this asks only which ones can be picked. */
export async function loadFplWindow(gameweeks: number[]): Promise<FplWindow | null> {
  if (!fplHistoryEndpoint) return null;
  const query = gameweeks.length ? `?gw=${gameweeks.join(",")}` : "";
  const response = await fetch(`${fplHistoryEndpoint}${query}`);
  if (!response.ok) throw new Error(`FPL history request failed: ${response.status}`);
  const body = await response.json() as Body;
  const fields = body.fields ?? [];
  return {
    players: new Map((body.players ?? []).map((row) => [row[0], statFrom(row[0], fields, row.slice(1))])),
    gameweeks: body.gameweeks ?? [],
    unavailable: body.unavailable ?? [],
  };
}
