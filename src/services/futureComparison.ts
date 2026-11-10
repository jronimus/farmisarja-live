import type { DashboardData, ManagerRow } from "../types";
import { planningClubName } from "./planning";
export function futureTeamFixtures(data: DashboardData, manager: ManagerRow) {
  const rows = manager.squad.map((player) => ({ player, fixtures: (data.planningFixtures ?? []).filter((fixture) => fixture.home === player.club || fixture.away === player.club).sort((a, b) => a.gameweek - b.gameweek || a.kickoff.localeCompare(b.kickoff)).slice(0, 3).map((fixture) => {
    const home = fixture.home === player.club;
    const opponent = home ? fixture.away : fixture.home;
    return { gameweek: fixture.gameweek, opponent, opponentName: planningClubName(data, opponent), venue: home ? "H" : "A", difficulty: home ? fixture.homeDifficulty : fixture.awayDifficulty };
  }) }));
  const starters = rows.filter((row) => row.player.starter).flatMap((row) => row.fixtures);
  return { rows, average: starters.length ? starters.reduce((sum, fixture) => sum + fixture.difficulty, 0) / starters.length : null };
}
