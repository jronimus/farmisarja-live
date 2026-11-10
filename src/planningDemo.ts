import { demoData } from "./demoData";
import type { DashboardData, PlayerStat } from "./types";
import { pickMultiplier } from "./services/ownership";
import type { HistoricalRound } from "./services/formHistory";
import type { Article } from "./services/articles";

export function createPlanningDemo(now = Date.now(), stressOwners = false): DashboardData {
  const day = 86_400_000;
  const lastKickoff = new Date(now - 4 * day).toISOString();
  const held = new Set(demoData.managers.slice(0, 7).flatMap((manager) => manager.squad.map((player) => player.id)));
  const players = (demoData.players ?? []).map((player) => ({ ...player, state: "finished" as const, minutes: 90, status: "a", chance: null }));
  const unowned = players.filter((player) => !held.has(player.id)).slice(0, 3);
  const stats = players.map((player, index): PlayerStat => ({
    id: player.id, totalPoints: 35 + index % 60, eventPoints: 2 + index % 9,
    form: unowned.some((candidate) => candidate.id === player.id) ? 7.8 - unowned.findIndex((candidate) => candidate.id === player.id) * .5 : 3.5 + index % 4,
    pointsPerGame: 5.4, minutes: 900, starts: 10, goals: index % 6, assists: index % 4, cleanSheets: 3, goalsConceded: 10, ownGoals: 0,
    penaltiesSaved: 0, penaltiesMissed: 0, yellowCards: 1, redCards: 0, saves: 0, bonus: 5, bps: 90, influence: 50, creativity: 40, threat: 45,
    ictIndex: 20, expectedGoals: 3, expectedAssists: 2, expectedGoalInvolvements: 5, expectedGoalsConceded: 9, defensiveContribution: 30,
    clearancesBlocksInterceptions: 20, recoveries: 10, tackles: 10, dreamteamCount: 1, valueSeason: 9, transfersInEvent: 1000, transfersOutEvent: 200,
    penaltiesOrder: null, cornersOrder: null, freekicksOrder: null,
  }));
  const clubs = [...new Set(players.map((player) => player.club))];
  const data: DashboardData = { ...demoData, updatedAt: new Date(now).toISOString(), deadline: new Date(now - 6 * day).toISOString(),
    activeMonths: [new Date(now - 6 * day).toISOString().slice(0, 7)],
    nextEvent: { gameweek: 25, deadline: new Date(now + 5 * day).toISOString() }, pointsFinalized: true,
    fixtures: demoData.fixtures?.map((fixture) => ({ ...fixture, status: "final", minutes: 90, kickoff: lastKickoff, homeScore: fixture.homeScore ?? 2, awayScore: fixture.awayScore ?? 1 })),
    managers: demoData.managers.slice(0, 7).map((manager, index) => ({ ...manager, freeTransfersAfter: 1 + index % 5, live: 0, upcoming: 0, finished: 11,
      squad: manager.squad.map((player) => ({ ...player, state: "finished", minutes: 90 })) })),
    players, playerStats: stats, feed: [],
    playerNews: demoData.playerNews?.map((player) => ({ ...player, owners: player.owners.filter((owner) => owner.managerId <= 107) })),
    clubStrength: Object.fromEntries(clubs.map(club=>[club,["ARS","MCI"].includes(club)?5:3])),
    recentPlayerMatches: Object.fromEntries(stats.map(stat=>[stat.id,{points:Math.round(stat.form*5),matches:5}])),
    planningFixtures: [1, 2, 3, 4, 5, 6].flatMap((offset) => {
      const rotated = [clubs[0], ...clubs.slice(1 + offset), ...clubs.slice(1, 1 + offset)];
      return rotated.slice(0, 10).map((home, index) => {
        const away = rotated[rotated.length - 1 - index];
        return { gameweek: 24 + offset, home, away,
          homeDifficulty: home === "ARS" ? 2 : 2 + (index + offset) % 3, awayDifficulty: away === "ARS" ? 2 : 3,
          kickoff: new Date(now + (offset * 7 - 2) * day).toISOString() };
      });
    }),
  };
  if (stressOwners) {
    const shared=players.filter(player=>player.position==="MID").sort((a,b)=>b.ownership-a.ownership).slice(0,5);
    data.managers=data.managers.map(manager=>{let index=0;return {...manager,squad:manager.squad.map(player=>player.position==="MID"?{...shared[index++],squadPosition:player.squadPosition,starter:player.starter,captain:player.captain,viceCaptain:player.viceCaptain}:player)};});
  }
  const rounds = demoComparisonRounds(data);
  return { ...data, managers: data.managers.map((manager) => {
    const history = rounds.map((round) => {
      const team = round.teams.find((team) => team.managerId === manager.id)!;
      return { gameweek: round.gameweek, month: data.deadline.slice(0, 7), points: team.picks.reduce((sum, pick) => sum + round.points[pick.element] * pick.multiplier, 0), hit: round.gameweek === data.gameweek ? manager.hit : 0 };
    });
    return { ...manager, gameweekHistory: history, form: history.map((row) => row.points - row.hit), formGameweeks: history.map((row) => row.gameweek) };
  }) };
}

/** Isolated fake historical picks; demos never ask the live API for fake manager IDs. */
export function demoComparisonRounds(data: DashboardData): HistoricalRound[] {
  const players = new Map(data.managers.flatMap((manager) => manager.squad).map((player) => [player.id, player]));
  return Array.from({ length: 5 }, (_, index) => {
    const gameweek = data.gameweek - 4 + index;
    return { gameweek, points: Object.fromEntries([...players.values()].map((player) => [player.id, gameweek === data.gameweek ? player.points + player.bonus : (player.id * 37 + gameweek * 13) % 13])),
      teams: data.managers.map((manager) => ({ managerId: manager.id, picks: manager.squad.map((player) => ({ element: player.id, multiplier: pickMultiplier(player, gameweek === data.gameweek ? manager.chip : undefined) })) })) };
  });
}

/** Explicitly fictional headlines for the isolated planning layout demo. */
export const planningDemoArticles: Article[] = [
  { id: "planning-1", title: "GW25: tulevan kierroksen puheenaiheet", source: "Demo", published: new Date().toISOString(), url: "#/uutiset", excerpt: "" },
  { id: "planning-2", title: "Kokoonpanouutiset ja pelaajien saatavuus", source: "Demo", published: new Date(Date.now() - 3_600_000).toISOString(), url: "#/uutiset", excerpt: "" },
  { id: "planning-3", title: "Otteluohjelma avaa uusia vaihtoehtoja", source: "Demo", published: new Date(Date.now() - 2 * 3_600_000).toISOString(), url: "#/uutiset", excerpt: "" },
  { id: "planning-4", title: "Virepelaajat seuraavaa deadlinea varten", source: "Demo", published: new Date(Date.now() - 3 * 3_600_000).toISOString(), url: "#/uutiset", excerpt: "" },
];

/** A deterministic, isolated end-of-round snapshot for the archive controls. */
export function createDemoArchive(base: DashboardData, gameweek: number): DashboardData {
  const round = demoComparisonRounds(base).find(row => row.gameweek === gameweek);
  if (!round) throw new Error("Demo round unavailable");
  const managers = base.managers.map(manager => {
    const history = manager.gameweekHistory ?? [];
    const selected = history.find(row => row.gameweek === gameweek)!;
    const total = manager.totalPoints - manager.hit - history.filter(row => row.gameweek > gameweek).reduce((sum,row) => sum + row.points - row.hit,0);
    const picks = round.teams.find(team => team.managerId === manager.id)!.picks;
    return { ...manager, gameweekPoints:selected.points, hit:selected.hit, provisionalBonus:0, totalPoints:total + selected.hit,
      rankedPoints:total, overallRank:0, previousOverallRank:0, chip:gameweek === base.gameweek ? manager.chip : undefined,
      gameweekHistory:history.filter(row => row.gameweek <= gameweek), form:history.filter(row => row.gameweek <= gameweek).map(row => row.points-row.hit), formGameweeks:history.filter(row => row.gameweek <= gameweek).map(row => row.gameweek),
      transfers:gameweek === base.gameweek ? manager.transfers : [], live:0, upcoming:0,
      squad:manager.squad.map(player => ({ ...player, points:round.points[player.id] ?? 0, bonus:0, state:"finished" as const, minutes:90, starter:(picks.find(pick => pick.element === player.id)?.multiplier ?? 0)>0 })) };
  });
  const ranks = (score: (row: typeof managers[number]) => number) => new Map([...managers].sort((a,b) => score(b)-score(a)||a.id-b.id).map((row,index)=>[row.id,index+1]));
  const current = ranks(row=>row.totalPoints-row.hit), previous = ranks(row=>row.totalPoints-row.gameweekPoints);
  return { ...base, gameweek, pointsFinalized:true, nextEvent:undefined,
    deadline:new Date(Date.parse(base.deadline)-(base.gameweek-gameweek)*7*86400000).toISOString(),
    managers:managers.map(row=>({...row,position:current.get(row.id)!,previousPosition:previous.get(row.id)!})),
    players:base.players?.map(player=>({...player,points:round.points[player.id]??0,bonus:0,state:"finished",minutes:90})),
    fixtures:gameweek === base.gameweek ? base.fixtures : [], feed:[], updatedAt:base.updatedAt };
}
