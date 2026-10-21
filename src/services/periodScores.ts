import type { ManagerRow } from "../types";

/** Month assignment follows the gameweek deadline, including weeks spanning months. */
export function pointsForPeriod(manager: ManagerRow, period: string, currentGameweek: number): number | null {
  if (period === "total") return manager.totalPoints + manager.provisionalBonus - manager.hit;
  if (!manager.gameweekHistory) return null;
  return manager.gameweekHistory.filter((row) => row.month === period).reduce((sum, row) => sum + (
    row.gameweek === currentGameweek ? manager.gameweekPoints + manager.provisionalBonus - manager.hit : row.points - row.hit
  ), 0);
}
