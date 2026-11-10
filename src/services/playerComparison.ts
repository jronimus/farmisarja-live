import type { DashboardData, PlayerStat, SquadPlayer } from "../types";

export interface ComparisonPlayer {
  id: number; name: string; club: string; position: SquadPlayer["position"]; cost: number; photoCode?: number;
}
export interface ComparisonMetric {
  key: string; fi: string; en: string; group: "points" | "attack" | "defence" | "discipline";
  direction: "higher" | "lower"; decimals?: number;
  value: (stat: PlayerStat | undefined, player: ComparisonPlayer) => number | null;
}
const metric = (key: keyof PlayerStat, fi: string, en: string, group: ComparisonMetric["group"], direction: ComparisonMetric["direction"] = "higher", decimals = 0): ComparisonMetric => ({
  key, fi, en, group, direction, decimals, value: (stat) => stat?.[key] ?? null,
});
const per90 = (key: keyof PlayerStat, fi: string, en: string, group: ComparisonMetric["group"], direction: ComparisonMetric["direction"] = "higher"): ComparisonMetric => ({
  key: `${key}90`, fi, en, group, direction, decimals: 2,
  value: (stat) => stat && stat.minutes > 0 && stat[key] !== null && Number.isFinite(stat[key]) ? stat[key]! * 90 / stat.minutes : null,
});
export const COMPARISON_METRICS: ComparisonMetric[] = [
  metric("totalPoints", "Pisteet", "Points", "points"),
  metric("pointsPerGame", "Pisteet / ottelu", "Points / game", "points", "higher", 1),
  per90("totalPoints", "Pisteet / 90 min", "Points / 90 min", "points"),
  { key: "cost", fi: "Hinta · £m", en: "Price · £m", group: "points", direction: "lower", decimals: 1, value: (_, player) => player.cost },
  { key: "value", fi: "Pisteet / £m", en: "Points / £m", group: "points", direction: "higher", decimals: 1, value: (stat, player) => stat && player.cost > 0 ? stat.totalPoints / player.cost : null },
  metric("minutes", "Minuutit", "Minutes", "points"), metric("starts", "Avaukset", "Starts", "points"),
  metric("bonus", "Bonus", "Bonus", "points"), metric("bps", "BPS", "BPS", "points"),
  metric("goals", "Maalit", "Goals", "attack"), metric("assists", "Syötöt", "Assists", "attack"),
  metric("expectedGoals", "Odotetut maalit · xG", "Expected goals · xG", "attack", "higher", 2),
  metric("expectedAssists", "Odotetut syötöt · xA", "Expected assists · xA", "attack", "higher", 2),
  metric("expectedGoalInvolvements", "xG + xA", "xG + xA", "attack", "higher", 2),
  per90("goals", "Maalit / 90 min", "Goals / 90 min", "attack"),
  per90("assists", "Syötöt / 90 min", "Assists / 90 min", "attack"),
  per90("expectedGoalInvolvements", "xG + xA / 90 min", "xG + xA / 90 min", "attack"),
  metric("cleanSheets", "Nollapelit", "Clean sheets", "defence"),
  metric("goalsConceded", "Päästetyt maalit", "Goals conceded", "defence", "lower"),
  metric("expectedGoalsConceded", "Odotetut päästetyt · xGC", "Expected conceded · xGC", "defence", "lower", 2),
  per90("expectedGoalsConceded", "xGC / 90 min", "xGC / 90 min", "defence", "lower"),
  metric("defensiveContribution", "Puolustuspanos", "Defensive contribution", "defence"),
  metric("clearancesBlocksInterceptions", "Katkot ja blokit · CBI", "Clearances, blocks & interceptions", "defence"),
  metric("recoveries", "Riistot", "Recoveries", "defence"), metric("tackles", "Taklaukset", "Tackles", "defence"),
  metric("saves", "Torjunnat", "Saves", "defence"), metric("penaltiesSaved", "Torjutut pilkut", "Penalties saved", "defence"),
  metric("yellowCards", "Keltaiset kortit", "Yellow cards", "discipline", "lower"),
  metric("redCards", "Punaiset kortit", "Red cards", "discipline", "lower"),
  metric("ownGoals", "Omat maalit", "Own goals", "discipline", "lower"),
  metric("penaltiesMissed", "Missatut pilkut", "Penalties missed", "discipline", "lower"),
];

/** The season bootstrap and current squads are already loaded; comparison needs no fetch. */
export function comparisonPlayers(data: DashboardData): ComparisonPlayer[] {
  const players = new Map<number, ComparisonPlayer>();
  for (const player of data.prices?.players ?? []) players.set(player.id, player);
  for (const manager of data.managers) for (const player of manager.squad) players.set(player.id, player);
  for (const player of data.players ?? []) players.set(player.id, player);
  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type ComparisonTone = "best" | "worst" | "middle" | "equal" | "missing";
/** Compare displayed precision so equal-looking figures always receive the same colour. */
export function comparisonTones(values: Array<number | null>, direction: ComparisonMetric["direction"], decimals = 0): ComparisonTone[] {
  const rounded = values.map((value) => value !== null && Number.isFinite(value) ? Number(value.toFixed(decimals)) : null);
  const known = rounded.filter((value): value is number => value !== null);
  const min = Math.min(...known), max = Math.max(...known);
  return rounded.map((value) => value === null ? "missing" : known.length < 2 || min === max ? "equal" : value === (direction === "higher" ? max : min) ? "best" : value === (direction === "higher" ? min : max) ? "worst" : "middle");
}
