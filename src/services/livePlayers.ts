import type { DashboardData } from "../types";
import { provisionalAutosubSquad } from "./fplRules";
import { pickMultiplier } from "./ownership";
import type { HighlightSelection } from "./highlights";

export function liveTeamGroups(data: DashboardData, selected: HighlightSelection[], autosubs: boolean) {
  const colors = new Map(selected.flatMap((item) => item.highlight.kind === "player" ? [[item.highlight.id, item] as const] : []));
  return data.managers.map((manager) => {
    const rows = provisionalAutosubSquad(manager.squad, autosubs).flatMap((player) => {
      const selection = colors.get(player.id);
      return player.state === "live" && selection ? [{ player, selection, multiplier: pickMultiplier(player, manager.chip) }] : [];
    }).sort((a, b) => (b.player.points + b.player.bonus) * b.multiplier - (a.player.points + a.player.bonus) * a.multiplier || a.player.name.localeCompare(b.player.name));
    return { manager, rows, total: rows.reduce((sum, row) => sum + (row.player.points + row.player.bonus) * row.multiplier, 0) };
  }).filter((group) => group.rows.length > 0);
}
