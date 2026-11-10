import type { Highlight } from "./ownership";
import type { ManagerRow, SquadPlayer } from "../types";
import { provisionalAutosubSquad } from "./fplRules";
import { pickMultiplier } from "./ownership";
export interface HighlightSelection { highlight: NonNullable<Highlight>; color: string; label: string }
const colors = ["#2864c5", "#a34084", "#117c61", "#b75e13", "#6849ba", "#a93142", "#207e98", "#717b19"];
export const highlightKey = (highlight: NonNullable<Highlight>) => highlight.kind === "player" ? `player:${highlight.id}` : `club:${highlight.club}`;
export const highlightMatches = (highlight: NonNullable<Highlight>, player: SquadPlayer) => highlight.kind === "player" ? highlight.id === player.id : highlight.club === player.club;
export function toggleHighlight(selected: HighlightSelection[], highlight: Highlight, label: string): HighlightSelection[] {
  if (!highlight) return [];
  const key = highlightKey(highlight);
  if (selected.some((item) => highlightKey(item.highlight) === key)) return selected.filter((item) => highlightKey(item.highlight) !== key);
  let index = selected.length;
  let color = colors.find((color) => !selected.some((item) => item.color === color));
  while (!color) {
    const candidate = `hsl(${(index++ * 137.5) % 360} 60% 38%)`;
    if (!selected.some((item) => item.color === candidate)) color = candidate;
  }
  return [...selected, { highlight, label, color }];
}

export function selectionPoints(manager: ManagerRow, selected: HighlightSelection[], autosubs: boolean, includeBench: boolean) {
  const squad = provisionalAutosubSquad(manager.squad, autosubs);
  const counted = new Set<number>();
  let total = 0;
  const entries = selected.flatMap((selection) => {
    const players = squad.filter((player) => highlightMatches(selection.highlight, player) && (includeBench || pickMultiplier(player, manager.chip) > 0));
    if (!players.length) return [];
    let points = 0, raw = 0, multiplier = 0;
    for (const player of players) {
      const factor = pickMultiplier(player, manager.chip);
      const score = player.points + player.bonus;
      raw += score; points += score * factor; multiplier = Math.max(multiplier, factor);
      if (!counted.has(player.id)) { counted.add(player.id); total += score * factor; }
    }
    return [{ selection, points, raw, multiplier, benched: multiplier === 0 }];
  });
  return { entries, total };
}

export function livePlayerSelections(managers: ManagerRow[], allPlayers: SquadPlayer[] = []): HighlightSelection[] {
  const players = new Map([...allPlayers, ...managers.flatMap((manager) => manager.squad)].filter((player) => player.state === "live").map((player) => [player.id, player]));
  return [...players.values()].sort((a, b) => a.id - b.id).map((player) => ({ highlight: { kind: "player", id: player.id }, label: player.name, color: `hsl(${(player.id * 137.508) % 360} 60% 38%)` }));
}
