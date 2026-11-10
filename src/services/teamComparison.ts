import type { ManagerRow } from "../types";
import type { HistoricalRound } from "./formHistory";

export function compareTeamPeriod(left: ManagerRow, right: ManagerRow, start: number, end: number) {
  const weeks = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
  const rounds = weeks.flatMap((gameweek) => {
    const a = left.gameweekHistory?.find((row) => row.gameweek === gameweek);
    const b = right.gameweekHistory?.find((row) => row.gameweek === gameweek);
    if (!a || !b) return [];
    return [{ gameweek, left: a.points - a.hit, right: b.points - b.hit, leftHit: a.hit, rightHit: b.hit, gap: a.points - a.hit - b.points + b.hit }];
  });
  const summary = (side: "left" | "right") => {
    const points = rounds.reduce((sum, row) => sum + row[side], 0);
    const hits = rounds.reduce((sum, row) => sum + row[side === "left" ? "leftHit" : "rightHit"], 0);
    return { points, gross: points + hits, hits, average: rounds.length ? points / rounds.length : null, wins: rounds.filter((row) => side === "left" ? row.gap > 0 : row.gap < 0).length };
  };
  return { rounds, missing: weeks.length - rounds.length, left: summary("left"), right: summary("right"), draws: rounds.filter((row) => row.gap === 0).length };
}

export function compareHistoricalPlayers(rounds: HistoricalRound[], leftId: number, rightId: number) {
  const players = new Map<number, { id: number; left: number; right: number; gap: number }>();
  for (const round of rounds) {
    for (const [managerId, side] of [[leftId, "left"], [rightId, "right"]] as const) {
      const team = round.teams.find((team) => team.managerId === managerId);
      if (!team) throw new Error("Historical team missing");
      for (const pick of team.picks.filter((pick) => pick.multiplier > 0)) {
        if (!Number.isFinite(round.points[pick.element])) throw new Error("Historical player points missing");
        const player = players.get(pick.element) ?? { id: pick.element, left: 0, right: 0, gap: 0 };
        player[side] += round.points[pick.element] * pick.multiplier;
        player.gap = player.left - player.right;
        players.set(player.id, player);
      }
    }
  }
  return [...players.values()].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || b.left + b.right - a.left - a.right || a.id - b.id);
}
