import type { ManagerRow } from "../types";

/** Rank the net live season totals shown in the table; preserve FPL ordering for ties. */
export function liveLeagueStandings(managers: ManagerRow[]): ManagerRow[] {
  const net = (manager: ManagerRow) => manager.totalPoints + manager.provisionalBonus - manager.hit;
  const sorted = [...managers].sort((a, b) => net(b) - net(a) || a.position - b.position || a.id - b.id);
  const positions = new Map<number, number>();
  sorted.forEach((manager, index) => {
    const previous = sorted[index - 1];
    const tied = previous && net(previous) === net(manager) && previous.position === manager.position;
    positions.set(manager.id, tied ? positions.get(previous.id)! : index + 1);
  });
  return managers.map((manager) => ({ ...manager, position: positions.get(manager.id)! }));
}
