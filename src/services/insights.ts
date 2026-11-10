import type { PriceRow, SquadPlayer } from "../types";

/**
 * The underlying numbers, from FPL Core Insights.
 *
 * FPL publishes what a player scored; this publishes what he deserved to. The join is on
 * FPL's own element id — the dataset is built that way — so unlike everything else this
 * site reads from outside, there is no name matching and nothing to get wrong.
 *
 * Data: [FPL Core Insights](https://github.com/olbauday/FPL-Core-Insights), whose author
 * asks for a link back in return. Every view built on it carries one.
 */

export interface PlayerInsight {
  element: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  xgot: number;
  shots: number;
  shotsOnTarget: number;
  bigChancesMissed: number;
  chancesCreated: number;
  boxTouches: number;
  /** Clearances, blocks, interceptions and tackles: the four FPL counts. */
  cbit: number;
  recoveries: number;
  saves: number;
  goalsConceded: number;
  goalsPrevented: number;
  appearances: number;
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const insightsEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/insights` : null;

/**
 * The season so far, or any set of gameweeks of it.
 *
 * The same table asked over a different window: all of them is a season summary, one is a
 * match report, and three in a row is a form guide. The choice is the reader's.
 */
export async function loadInsights(gameweeks: number[] = []): Promise<{ gameweeks: number[]; players: Map<number, PlayerInsight> } | null> {
  if (!insightsEndpoint) return null;
  const response = await fetch(gameweeks.length ? `${insightsEndpoint}?gw=${gameweeks.join(",")}` : insightsEndpoint);
  if (!response.ok) throw new Error(`Insights request failed: ${response.status}`);
  const body = await response.json() as { gameweeks?: number[]; players?: PlayerInsight[] };
  return {
    gameweeks: body.gameweeks ?? [],
    players: new Map((body.players ?? []).map((player) => [player.element, player])),
  };
}

/** Expected goal involvement: the two halves of an attacker's threat, added. */
export const threat = (insight: PlayerInsight): number => insight.xg + insight.xa;

/** Per ninety, which is the only way a substitute and an ever-present can be compared. */
export function per90(value: number, minutes: number): number {
  return minutes > 0 ? (value * 90) / minutes : 0;
}

/**
 * What he returned against what the chances were worth.
 *
 * Positive is a player scoring more than his shots deserved, negative is one scoring less.
 * Neither is a verdict — a finisher can beat his expected goals for a season and a good
 * player can trail his for a month — but it is the difference between a run of form and a
 * run of luck, and FPL's own numbers cannot tell them apart.
 */
export function overPerformance(insight: PlayerInsight): number {
  return insight.goals + insight.assists - threat(insight);
}

/**
 * FPL's own defensive contribution count, from its parts.
 *
 * FPL awards two points at ten of these for a defender and twelve for anybody else, and it
 * counts clearances, blocks, interceptions and tackles for a defender, plus recoveries for
 * a midfielder or a forward. The dataset ships an empty `defensive_contributions` column,
 * so the count is assembled here from the four (or five) that are populated.
 */
export function defensiveActions(insight: PlayerInsight, position: SquadPlayer["position"]): number {
  return position === "DEF" ? insight.cbit : insight.cbit + insight.recoveries;
}

/** Which side of the ball a player is judged on. Goalkeepers are judged on neither. */
export function insightRole(position: SquadPlayer["position"] | PriceRow["position"]): "attack" | "defence" | "keeper" {
  if (position === "GK") return "keeper";
  return position === "DEF" ? "defence" : "attack";
}
