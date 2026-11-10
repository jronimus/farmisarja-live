export interface PlayerMatch {
  fixture: number; round: number; opponent_team: number; was_home: boolean; kickoff_time: string;
  team_h_score: number | null; team_a_score: number | null; total_points: number; minutes: number;
  goals_scored: number; assists: number; clean_sheets: number; goals_conceded: number; saves: number;
  bonus: number; bps: number; defensive_contribution: number; yellow_cards: number; red_cards: number;
  expected_goals: string; expected_assists: string;
}
export interface PlayerUpcomingMatch { id: number; gameweek: number | null; kickoff: string | null; opponent: string; venue: "H" | "A"; difficulty: number }
export interface PlayerHistory { history: PlayerMatch[]; teams: Record<number, string>; fixtures?: PlayerUpcomingMatch[] }
const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

/** In dev the existing Vite proxy allows testing a new read route before Worker deployment. */
export async function loadPlayerHistory(id: number, throughGameweek: number, season: string, signal: AbortSignal): Promise<PlayerHistory> {
  if (throughGameweek < 1) return { history: [], teams: {} };
  const key = `farmisarja-player-history-v2:${season}:${id}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? "null") as { through: number; data: PlayerHistory } | null;
    if (cached && cached.through >= throughGameweek && Array.isArray(cached.data?.history) && cached.data?.teams) {
      return { ...cached.data, history: cached.data.history.filter((match) => match.round <= throughGameweek) };
    }
  } catch { /* Disabled or full browser storage must not prevent reading the history. */ }
  const base = import.meta.env.DEV || !configuredApi ? "/fpl-api" : configuredApi;
  const suffix = base === "/fpl-api" ? "/" : "";
  const responses = await Promise.all([
    fetch(`${base}/element-summary/${id}${suffix}?through=${throughGameweek}`, { signal }),
    fetch(`${base}/bootstrap-static${suffix}`, { signal }),
  ]);
  if (responses.some((r) => !r.ok)) throw new Error("Player history unavailable");
  const [summary, bootstrap] = await Promise.all(responses.map((r) => r.json())) as [{ history: PlayerMatch[]; fixtures?: Array<{ id: number; event: number | null; kickoff_time: string | null; is_home: boolean; team_h: number; team_a: number; difficulty: number; finished?: boolean; started?: boolean }> }, { teams: Array<{ id: number; short_name: string; name?: string }> }];
  if (!Array.isArray(summary.history) || !Array.isArray(bootstrap.teams)) throw new Error("Invalid player history");
  const data: PlayerHistory = {
    history: [...summary.history].filter((match) => match.round <= throughGameweek).sort((a, b) => b.round - a.round || b.kickoff_time.localeCompare(a.kickoff_time)),
    teams: Object.fromEntries(bootstrap.teams.map((team) => [team.id, team.short_name])),
    fixtures: (summary.fixtures ?? []).filter(fixture=>!fixture.finished && !fixture.started).map(fixture=>({
      id:fixture.id, gameweek:fixture.event, kickoff:fixture.kickoff_time, venue:fixture.is_home?"H" as const:"A" as const,
      opponent:bootstrap.teams.find(team=>team.id===(fixture.is_home?fixture.team_a:fixture.team_h))?.name ?? bootstrap.teams.find(team=>team.id===(fixture.is_home?fixture.team_a:fixture.team_h))?.short_name ?? "—", difficulty:fixture.difficulty,
    })).sort((a,b)=>(a.kickoff??"9999").localeCompare(b.kickoff??"9999") || (a.gameweek??99)-(b.gameweek??99)),
  };
  if (!signal.aborted) {
    try { localStorage.setItem(key, JSON.stringify({ through: throughGameweek, data })); } catch { /* Storage is optional. */ }
  }
  return data;
}
