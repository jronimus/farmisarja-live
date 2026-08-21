import type { DashboardData, ManagerRow, PlayerState, SquadPlayer } from "../types";
import { bonusFromBps, nextGameweekFreeTransfers, usedChipsForHalf } from "./fplRules";

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");
const leagueId = import.meta.env.VITE_FPL_LEAGUE_ID || "200068";

async function api<T>(workerPath: string, officialPath: string): Promise<T> {
  const url = configuredApi ? `${configuredApi}${workerPath}` : `/fpl-api${officialPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FPL request failed: ${response.status} ${workerPath}`);
  return response.json() as Promise<T>;
}

interface EventData { id: number; deadline_time: string; finished: boolean; data_checked: boolean; is_current: boolean; is_next: boolean; }
interface Element { id: number; web_name: string; team: number; element_type: number; }
interface Team { id: number; short_name: string; }
interface Bootstrap { events: EventData[]; elements: Element[]; teams: Team[]; }
interface FixtureStat { identifier: string; h: Array<{ element: number; value: number }>; a: Array<{ element: number; value: number }> }
interface Fixture { id: number; event: number | null; team_h: number; team_a: number; started: boolean; finished: boolean; finished_provisional: boolean; stats?: FixtureStat[]; }
interface LiveElement { id: number; stats: { total_points: number; minutes: number; bonus: number }; explain: Array<{ fixture: number }>; }
interface LeagueStanding { entry: number; rank: number; last_rank: number; entry_name: string; player_name: string; total: number; }
interface NewEntry { entry: number; entry_name: string; player_first_name: string; player_last_name: string; }
interface LeagueResponse {
  league: { name: string };
  standings: { results: LeagueStanding[]; has_next: boolean };
  new_entries: { results: NewEntry[]; has_next: boolean };
}
interface EntryData { player_first_name: string; player_last_name: string; summary_overall_rank: number; }
interface Pick { element: number; position: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean; }
interface EventHistory { event: number; points: number; total_points: number; overall_rank: number; value: number; event_transfers: number; event_transfers_cost: number; points_on_bench: number; }
interface PicksResponse { active_chip: string | null; entry_history: EventHistory; picks: Pick[]; }
interface HistoryResponse { current: EventHistory[]; chips: Array<{ name: string; event: number }>; }
interface Transfer { element_in: number; element_out: number; event: number; time: string; }

const chipName = (name: string | null | undefined) => ({ wildcard: "WC", freehit: "FH", bboost: "BB", "3xc": "TC" }[name ?? ""]);
const positionName = (type: number): SquadPlayer["position"] => (["GK", "DEF", "MID", "FWD"] as const)[type - 1] ?? "MID";

function fixtureState(fixture: Fixture): PlayerState {
  if (fixture.finished) return "finished";
  if (fixture.started) return "live";
  return "upcoming";
}

// Bonus is only estimated while a fixture is running and its official bonus has not been published yet,
// so confirmed bonus already inside live total_points is never counted twice.
function provisionalBonusByPlayer(fixtures: Fixture[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const fixture of fixtures) {
    if (!fixture.started) continue;
    const stats = fixture.stats ?? [];
    const confirmed = stats.find((stat) => stat.identifier === "bonus");
    if (confirmed && (confirmed.h.length > 0 || confirmed.a.length > 0)) continue;
    const bps = stats.find((stat) => stat.identifier === "bps");
    if (!bps) continue;
    for (const [element, points] of bonusFromBps([...bps.h, ...bps.a])) {
      totals.set(element, (totals.get(element) ?? 0) + points);
    }
  }
  return totals;
}

function rankMovement(rows: EventHistory[]): number[] {
  return rows.map((row, index) => {
    if (index === 0) return 0;
    const previous = rows[index - 1].overall_rank;
    return row.overall_rank < previous ? 1 : row.overall_rank > previous ? -1 : 0;
  });
}

async function managerRow(
  standing: LeagueStanding,
  event: EventData,
  bootstrap: Bootstrap,
  fixtures: Fixture[],
  liveById: Map<number, LiveElement>,
  provisionalBonus: Map<number, number>,
): Promise<ManagerRow | null> {
  const id = standing.entry;
  let entry: EntryData;
  let picks: PicksResponse;
  let history: HistoryResponse;
  let transfers: Transfer[];
  try {
    [entry, picks, history, transfers] = await Promise.all([
      api<EntryData>(`/entry/${id}`, `/entry/${id}/`),
      api<PicksResponse>(`/entry/${id}/event/${event.id}/picks`, `/entry/${id}/event/${event.id}/picks/`),
      api<HistoryResponse>(`/entry/${id}/history`, `/entry/${id}/history/`),
      api<Transfer[]>(`/entry/${id}/transfers`, `/entry/${id}/transfers/`),
    ]);
  } catch {
    return null;
  }

  const elements = new Map(bootstrap.elements.map((element) => [element.id, element]));
  const teams = new Map(bootstrap.teams.map((team) => [team.id, team]));
  const eventFixtures = fixtures.filter((fixture) => fixture.event === event.id);
  const squad: SquadPlayer[] = picks.picks.map((pick) => {
    const element = elements.get(pick.element)!;
    const playerFixtures = eventFixtures.filter((fixture) => fixture.team_h === element.team || fixture.team_a === element.team);
    const firstFixture = playerFixtures[0];
    const isHome = firstFixture?.team_h === element.team;
    const opponentId = firstFixture ? (isHome ? firstFixture.team_a : firstFixture.team_h) : undefined;
    const live = liveById.get(element.id);
    const states = playerFixtures.map((fixture) => ({ state: fixtureState(fixture) }));
    const state = states.some((item) => item.state === "live") ? "live" : states.length > 0 && states.every((item) => item.state === "finished") ? "finished" : "upcoming";
    return {
      id: element.id,
      squadPosition: pick.position,
      name: element.web_name,
      club: teams.get(element.team)?.short_name ?? "UNK",
      clubCode: element.team,
      opponent: opponentId ? teams.get(opponentId)?.short_name ?? "—" : "—",
      venue: isHome ? "H" : "A",
      position: positionName(element.element_type),
      points: live?.stats.total_points ?? 0,
      // A player whose official bonus is already inside total_points must not receive an estimate on top of it.
      bonus: (live?.stats.bonus ?? 0) > 0 ? 0 : provisionalBonus.get(element.id) ?? 0,
      minutes: live?.stats.minutes ?? 0,
      state,
      fixtures: states.length ? states : undefined,
      starter: pick.position <= 11,
      captain: pick.is_captain,
      viceCaptain: pick.is_vice_captain,
    };
  });

  const activeChip = chipName(picks.active_chip);
  const usedChips = usedChipsForHalf(history.chips, event.id);
  const currentHistory = history.current.find((row) => row.event === event.id) ?? picks.entry_history;
  const earlierHistory = history.current.filter((row) => row.event < event.id);
  const formRows = history.current.slice(-5);
  const captain = squad.find((player) => player.captain);
  const currentTransfers = transfers.filter((transfer) => transfer.event === event.id).sort((a, b) => a.time.localeCompare(b.time));
  const transferRows = currentTransfers.map((transfer) => ({
    out: elements.get(transfer.element_out)?.web_name ?? "—",
    in: elements.get(transfer.element_in)?.web_name ?? "—",
    outPoints: liveById.get(transfer.element_out)?.stats.total_points ?? 0,
    inPoints: liveById.get(transfer.element_in)?.stats.total_points ?? 0,
  }));
  const previousHistory = history.current.filter((row) => row.event < event.id).at(-1);
  const hit = currentHistory.event_transfers_cost ?? 0;
  let wildcardPreviousTeamPoints: number | undefined;
  if ((activeChip === "WC" || activeChip === "FH") && event.id > 1) {
    try {
      const previousPicks = await api<PicksResponse>(`/entry/${id}/event/${event.id - 1}/picks`, `/entry/${id}/event/${event.id - 1}/picks/`);
      wildcardPreviousTeamPoints = previousPicks.picks
        .filter((pick) => pick.multiplier > 0)
        .reduce((sum, pick) => sum + (liveById.get(pick.element)?.stats.total_points ?? 0) * pick.multiplier, 0);
    } catch {
      wildcardPreviousTeamPoints = undefined;
    }
  }

  return {
    id,
    position: standing.rank,
    previousPosition: standing.last_rank,
    teamName: standing.entry_name,
    managerName: standing.player_name || `${entry.player_first_name} ${entry.player_last_name}`.trim(),
    gameweekPoints: currentHistory.points + hit,
    provisionalBonus: squad.reduce((sum, player) => sum + player.bonus * (picks.picks.find((pick) => pick.element === player.id)?.multiplier ?? 0), 0),
    totalPoints: currentHistory.total_points + hit,
    overallRank: entry.summary_overall_rank || currentHistory.overall_rank,
    previousOverallRank: previousHistory?.overall_rank ?? currentHistory.overall_rank,
    captain: captain?.name ?? "—",
    captainPoints: captain ? captain.points * Math.max(1, picks.picks.find((pick) => pick.element === captain.id)?.multiplier ?? 1) : 0,
    transfers: transferRows,
    hit,
    chip: activeChip,
    availableChips: ["WC", "FH", "BB", "TC"],
    usedChips,
    freeTransfersAfter: nextGameweekFreeTransfers(history.current, history.chips, event.id),
    wildcardPreviousTeamPoints,
    seasonTransfers: history.current.reduce((sum, row) => sum + row.event_transfers, 0),
    seasonHitPoints: history.current.reduce((sum, row) => sum + row.event_transfers_cost, 0),
    benchPointsBeforeGw: earlierHistory.reduce((sum, row) => sum + row.points_on_bench, 0),
    teamValue: currentHistory.value / 10,
    previousTeamValue: (previousHistory?.value ?? currentHistory.value) / 10,
    finished: squad.filter((player) => player.state === "finished").length,
    live: squad.filter((player) => player.state === "live").length,
    upcoming: squad.filter((player) => player.state === "upcoming").length,
    form: formRows.map((row) => row.points),
    formRankMovement: rankMovement(formRows),
    squad,
  };
}

export async function loadLiveDashboard(): Promise<DashboardData | null> {
  const [bootstrap, fixtures, league] = await Promise.all([
    api<Bootstrap>("/bootstrap-static", "/bootstrap-static/"),
    api<Fixture[]>("/fixtures", "/fixtures/"),
    api<LeagueResponse>("/league", `/leagues-classic/${leagueId}/standings/?page_standings=1&page_new_entries=1`),
  ]);
  const event = bootstrap.events.find((item) => item.is_current) ?? bootstrap.events.find((item) => item.is_next);
  if (!event) return null;
  const completedMonths = [...new Set(bootstrap.events.filter((item) => item.finished).map((item) => item.deadline_time.slice(0, 7)))];
  const rosterManagers = (): ManagerRow[] => league.new_entries.results.map((entry) => ({
      id: entry.entry,
      position: 1,
      previousPosition: 1,
      teamName: entry.entry_name,
      managerName: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
      gameweekPoints: 0,
      provisionalBonus: 0,
      totalPoints: 0,
      overallRank: 0,
      previousOverallRank: 0,
      captain: "—",
      captainPoints: 0,
      transfers: [],
      hit: 0,
      availableChips: [],
      usedChips: [],
      seasonTransfers: 0,
      seasonHitPoints: 0,
      benchPointsBeforeGw: 0,
      teamValue: 0,
      previousTeamValue: 0,
      finished: 0,
      live: 0,
      upcoming: 0,
      form: [],
      formRankMovement: [],
      squad: [],
    }));
  const deadlinePassed = Date.now() >= new Date(event.deadline_time).getTime();
  if (!league.standings.results.length && league.new_entries?.results.length && !deadlinePassed) {
    const managers = rosterManagers();
    return {
      leagueName: league.league.name,
      gameweek: event.id,
      deadline: event.deadline_time,
      updatedAt: new Date().toISOString(),
      isPreview: true,
      rosterOnly: true,
      pointsFinalized: false,
      completedMonths,
      managers,
    };
  }
  if (!league.standings.results.length && !league.new_entries?.results.length) return null;
  const pendingDashboard = (): DashboardData => ({
    leagueName: league.league.name,
    gameweek: event.id,
    deadline: event.deadline_time,
    updatedAt: new Date().toISOString(),
    isPreview: false,
    dataPending: true,
    pointsFinalized: false,
    completedMonths,
    managers: rosterManagers(),
  });
  let liveById: Map<number, LiveElement>;
  try {
    const live = await api<{ elements: LiveElement[] }>(`/event/${event.id}/live`, `/event/${event.id}/live/`);
    liveById = new Map(live.elements.map((element) => [element.id, element]));
  } catch {
    // FPL answers 5xx while it rebuilds the gameweek around the deadline. Wait instead of failing.
    return pendingDashboard();
  }
  const standings = league.standings.results.length ? league.standings.results : league.new_entries.results.map((entry) => ({
    entry: entry.entry,
    rank: 1,
    last_rank: 1,
    entry_name: entry.entry_name,
    player_name: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
    total: 0,
  }));
  const eventBonus = provisionalBonusByPlayer(fixtures.filter((fixture) => fixture.event === event.id));
  const rows = await Promise.all(standings.map((standing) => managerRow(standing, event, bootstrap, fixtures, liveById, eventBonus)));
  if (rows.some((row) => row === null)) return pendingDashboard();
  return {
    leagueName: league.league.name,
    gameweek: event.id,
    deadline: event.deadline_time,
    updatedAt: new Date().toISOString(),
    isPreview: false,
    pointsFinalized: event.data_checked,
    completedMonths,
    managers: rows.filter((row): row is ManagerRow => row !== null),
  };
}
