export interface HistoricalPick { element: number; multiplier: number }
export interface HistoricalTeam { managerId: number; picks: HistoricalPick[] }
export interface HistoricalRound { gameweek: number; points: Record<number, number>; teams: HistoricalTeam[] }
export interface FormPlayerContribution {
  id: number; points: number; captainExtra: number; rounds: number; leagueAverage: number; gain: number; averageOwners: number; differentialPoints: number;
}

export function formPlayerContributions(rounds: HistoricalRound[], managerId: number): FormPlayerContribution[] {
  const players = new Map<number, FormPlayerContribution>();
  for (const round of rounds) {
    const team = round.teams.find((item) => item.managerId === managerId);
    if (!team) continue;
    for (const pick of team.picks.filter((item) => item.multiplier > 0)) {
      const score = round.points[pick.element];
      if (score === undefined) throw new Error("Historical player points are missing");
      const owners = round.teams.filter((other) => other.picks.some((item) => item.element === pick.element)).length;
      const others = round.teams.filter((other) => other.managerId !== managerId);
      const leagueAverage = others.length ? others.reduce((sum, other) => sum + score * (other.picks.find((item) => item.element === pick.element)?.multiplier ?? 0), 0) / others.length : 0;
      const points = score * pick.multiplier;
      const row = players.get(pick.element) ?? { id: pick.element, points: 0, captainExtra: 0, rounds: 0, leagueAverage: 0, gain: 0, averageOwners: 0, differentialPoints: 0 };
      row.points += points;
      row.captainExtra += score * Math.max(0, pick.multiplier - 1);
      row.rounds += 1;
      row.leagueAverage += leagueAverage;
      row.gain += points - leagueAverage;
      row.averageOwners += owners;
      if (round.teams.length >= 4 && owners / round.teams.length <= .3) row.differentialPoints += points;
      players.set(row.id, row);
    }
  }
  return [...players.values()].map((row) => ({ ...row, averageOwners: row.averageOwners / row.rounds })).sort((a, b) => b.points - a.points || a.id - b.id);
}

const api = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "") ?? "/fpl-api";
const requests = new Map<string, Promise<unknown>>();
const batches = new Map<string, Promise<HistoricalRound[]>>();
const memory = new Map<string, { at: number; data: unknown }>();
const DAY = 86400000;
async function cached<T>(path: string, season: string): Promise<T> {
  const key = `farmisarja-form-history-v2:${season}:${path}`;
  const inMemory = memory.get(key);
  if (inMemory && Date.now() - inMemory.at < DAY) return inMemory.data as T;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved && Date.now() - saved.at < DAY) { memory.set(key, saved); return saved.data as T; }
  } catch { /* Browser storage is optional. */ }
  if (requests.has(key)) return requests.get(key) as Promise<T>;
  const pending = (async () => {
    const response = await fetch(`${api}${path}${api === "/fpl-api" ? "/" : ""}`);
    if (!response.ok) throw new Error("Historical team data unavailable");
    const body = await response.json() as { elements?: Array<{ id: number; stats: { total_points: number }; explain?: Array<{ fixture: number; stats: Array<{ identifier: string; value: number; points: number }> }> }>; picks?: HistoricalPick[] };
    // Keep only the figures used here, rather than caching the full all-player live feed.
    const data = path.endsWith("/live")
      ? { elements: body.elements?.map((player) => ({ id: player.id, stats: { total_points: player.stats.total_points }, matches: player.explain?.map(match => ({ fixture: match.fixture, minutes: match.stats.find(stat => stat.identifier === "minutes")?.value ?? 0, points: match.stats.reduce((sum, stat) => sum + stat.points, 0) })) })) }
      : { picks: body.picks?.map((pick) => ({ element: pick.element, multiplier: pick.multiplier })) };
    if (path.endsWith("/live") ? !body.elements?.length : !body.picks?.length) throw new Error("Invalid historical data");
    const saved = { at: Date.now(), data };
    memory.set(key, saved);
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* In-memory cache still prevents repeat reads. */ }
    return data as T;
  })();
  requests.set(key, pending);
  try { return await pending; } finally { requests.delete(key); }
}

/** On demand only, completed gameweeks only, three concurrent reads, 24h browser cache. */
export function loadFormHistory(weeks: number[], managerIds: number[], season: string): Promise<HistoricalRound[]> {
  const key = `${season}:${weeks.join(",")}:${managerIds.join(",")}`;
  const existing = batches.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const rounds: HistoricalRound[] = weeks.map((gameweek) => ({ gameweek, points: {}, teams: [] }));
    const jobs: Array<() => Promise<void>> = [];
    for (const round of rounds) {
      jobs.push(async () => {
        const live = await cached<{ elements: Array<{ id: number; stats: { total_points: number } }> }>(`/event/${round.gameweek}/live`, season);
        if (!Array.isArray(live.elements)) throw new Error("Invalid historical points");
        round.points = Object.fromEntries(live.elements.map((player) => [player.id, player.stats.total_points]));
      });
      for (const managerId of managerIds) jobs.push(async () => {
        const squad = await cached<{ picks: HistoricalPick[] }>(`/entry/${managerId}/event/${round.gameweek}/picks`, season);
        if (!Array.isArray(squad.picks) || !squad.picks.length) throw new Error("Historical squad missing");
        round.teams.push({ managerId, picks: squad.picks });
      });
    }
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => { while (next < jobs.length) await jobs[next++](); }));
    return rounds;
  })();
  batches.set(key, pending);
  void pending.finally(() => batches.delete(key)).catch(() => {});
  return pending;
}

/** Eight settled rounds, shared with the form cache; DGWs count as separate matches. */
export async function loadRecentPlayerMatches(through: number, season: string, kickoffs: Record<number, string> = {}) {
  const weeks = Array.from({ length: Math.min(8, through) }, (_, index) => through-index);
  const scores = new Map<number, Array<{ fixture: number; points: number }>>();
  let next = 0;
  const rounds = new Map<number, Array<{ id: number; matches?: Array<{ fixture: number; minutes: number; points: number }> }>>();
  await Promise.all(Array.from({ length: Math.min(3,weeks.length) }, async()=>{
    while(next < weeks.length) {
      const week=weeks[next++];
      const live=await cached<{ elements:Array<{id:number;matches?:Array<{fixture:number;minutes:number;points:number}>}> }>(`/event/${week}/live`,season);
      rounds.set(week,live.elements);
    }
  }));
  for(const week of weeks) for(const player of rounds.get(week) ?? []) {
    const matches=scores.get(player.id) ?? [];
    for(const match of [...(player.matches ?? [])].sort((a,b)=>b.fixture-a.fixture)) {
      if(match.minutes>0 && !matches.some(row=>row.fixture===match.fixture)) matches.push({fixture:match.fixture,points:match.points});
    }
    scores.set(player.id,matches);
  }
  return Object.fromEntries([...scores].map(([id,unsorted])=>{ const matches=[...unsorted].sort((a,b)=>(kickoffs[b.fixture]??"").localeCompare(kickoffs[a.fixture]??"")); return [id,{points:matches.slice(0,5).reduce((sum,row)=>sum+row.points,0),matches:Math.min(5,matches.length)}]; }));
}
