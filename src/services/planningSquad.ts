import type { DashboardData, SquadPlayer } from "../types";

/** Preview cards show season points and the next fixture, never last GW's multiplier. */
export function planningPlayer(player: SquadPlayer, data: DashboardData) {
  const fixture = (data.planningFixtures ?? []).filter(fixture=>fixture.home===player.club || fixture.away===player.club)
    .sort((a,b)=>a.gameweek-b.gameweek || a.kickoff.localeCompare(b.kickoff))[0];
  const home=fixture?.home===player.club;
  return {
    seasonPoints:data.playerStats?.find(stat=>stat.id===player.id)?.totalPoints ?? null,
    player:{...player,captain:false,viceCaptain:false,state:"upcoming" as const,
      opponent:fixture ? home?fixture.away:fixture.home : "—", venue:home?"H" as const:"A" as const,
      difficulty:fixture ? home?fixture.homeDifficulty:fixture.awayDifficulty : undefined,
      kickoff:fixture?.kickoff },
  };
}
