import type { ManagerRow, SquadPlayer } from "../types";
import { provisionalAutosubSquad } from "./fplRules";

/** Use the same effective eleven and armband as the main table. */
export function comparisonManagers(managers: ManagerRow[], autosubs: boolean): ManagerRow[] {
  return managers.map((manager) => {
    const squad = provisionalAutosubSquad(manager.squad, autosubs);
    const scoring = manager.chip === "BB" ? squad : squad.filter((player) => player.starter);
    const points = scoring.reduce((sum, player) => sum + (player.points + player.bonus)
      * (player.captain ? manager.chip === "TC" ? 3 : 2 : 1), 0);
    const gained = Math.max(0, points - manager.gameweekPoints);
    return { ...manager, squad, gameweekPoints: manager.gameweekPoints + gained, totalPoints: manager.totalPoints + gained };
  });
}

export interface ComparisonPlayer {
  player: SquadPlayer;
  picks: Map<number, SquadPlayer>;
}

/** Compare element IDs, not display names. Bench players count as owned too. */
export function compareSquads(managers: ManagerRow[], startersOnly = false): ComparisonPlayer[] {
  const rows = new Map<number, ComparisonPlayer>();
  for (const manager of managers) {
    for (const player of manager.squad) {
      if (startersOnly && !player.starter) continue;
      const row = rows.get(player.id) ?? { player, picks: new Map<number, SquadPlayer>() };
      row.picks.set(manager.id, player);
      rows.set(player.id, row);
    }
  }
  const position = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  return [...rows.values()].sort((a, b) => b.picks.size - a.picks.size
    || position[a.player.position] - position[b.player.position]
    || a.player.name.localeCompare(b.player.name, "fi"));
}
