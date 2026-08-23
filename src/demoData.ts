import type { DashboardData, GameweekFixture, ManagerRow, SquadPlayer } from "./types";
import type { FeedEvent } from "./services/liveFeed";

const playerPool = [
  ["Raya", "ARS", 1, "GK"], ["Pickford", "EVE", 9, "GK"],
  ["Konsa", "AVL", 2, "DEF"], ["Dunk", "BHA", 3, "DEF"], ["Collins", "BRE", 5, "DEF"],
  ["Muñoz", "CRY", 8, "DEF"], ["Robinson", "FUL", 10, "DEF"],
  ["Palmer", "CHE", 6, "MID"], ["Ampadu", "LEE", 13, "MID"], ["Salah", "LIV", 14, "MID"],
  ["Fernandes", "MUN", 16, "MID"], ["Gibbs-White", "NFO", 18, "MID"],
  ["Semenyo", "BOU", 4, "FWD"], ["Haaland", "MCI", 15, "FWD"], ["Solanke", "TOT", 20, "FWD"],
  ["Wright", "COV", 7, "FWD"], ["Gelhardt", "HUL", 11, "FWD"], ["Greaves", "IPS", 12, "DEF"],
  ["Hall", "NEW", 17, "DEF"], ["Ballard", "SUN", 19, "DEF"],
] as const;

const clubFixtures: Record<string, { opponent: string; venue: "H" | "A"; state: SquadPlayer["state"] }> = {
  ARS: { opponent: "EVE", venue: "H", state: "finished" }, EVE: { opponent: "ARS", venue: "A", state: "finished" },
  AVL: { opponent: "BHA", venue: "H", state: "finished" }, BHA: { opponent: "AVL", venue: "A", state: "finished" },
  BRE: { opponent: "CRY", venue: "H", state: "finished" }, CRY: { opponent: "BRE", venue: "A", state: "finished" },
  FUL: { opponent: "CHE", venue: "H", state: "live" }, CHE: { opponent: "FUL", venue: "A", state: "live" },
  LEE: { opponent: "LIV", venue: "H", state: "live" }, LIV: { opponent: "LEE", venue: "A", state: "live" },
  MUN: { opponent: "NFO", venue: "H", state: "upcoming" }, NFO: { opponent: "MUN", venue: "A", state: "upcoming" },
  BOU: { opponent: "MCI", venue: "H", state: "upcoming" }, MCI: { opponent: "BOU", venue: "A", state: "upcoming" },
  TOT: { opponent: "COV", venue: "H", state: "upcoming" }, COV: { opponent: "TOT", venue: "A", state: "upcoming" },
  HUL: { opponent: "IPS", venue: "H", state: "upcoming" }, IPS: { opponent: "HUL", venue: "A", state: "upcoming" },
  NEW: { opponent: "SUN", venue: "H", state: "upcoming" }, SUN: { opponent: "NEW", venue: "A", state: "upcoming" },
};

const makeSquad = (seed: number, captainIndex: number): SquadPlayer[] => {
  const offset = ((seed - 1) * 5) % playerPool.length;
  const names = Array.from({ length: 15 }, (_, index) => playerPool[(offset + index) % playerPool.length]);
  return names.map((player, index) => ({
  id: seed * 100 + index,
  squadPosition: index + 1,
  name: player[0], club: player[1], clubCode: player[2], position: player[3], starter: index < 11,
  opponent: clubFixtures[player[1]].opponent,
  venue: clubFixtures[player[1]].venue,
  points: (index * 3 + seed * 2) % 11, bonus: index % 5 === seed % 5 ? (index % 3) + 1 : 0,
  minutes: clubFixtures[player[1]].state === "finished" ? 90 : clubFixtures[player[1]].state === "live" ? 45 : 0,
  cost: 4.5 + ((index * 7 + seed * 3) % 21) / 2,
  ownership: 1 + ((index * 13 + seed * 5) % 60),
  state: clubFixtures[player[1]].state,
  captain: index === captainIndex, viceCaptain: index === (captainIndex + 1) % 11,
  }));
};

const managers: Omit<ManagerRow, "squad">[] = [
  { id: 101, position: 1, previousPosition: 3, teamName: "Expected Toulouse", managerName: "Joni R.", gameweekPoints: 96, provisionalBonus: 5, totalPoints: 1842, overallRank: 128442, previousOverallRank: 151220, captain: "Salah", captainPoints: 22, transfers: [{ out: "Watkins", in: "Isak", outPoints: 2, inPoints: 10 }], hit: 4, chip: "TC", availableChips: ["WC", "FH", "BB", "TC"], usedChips: [], freeTransfersAfter: 1, seasonTransfers: 26, seasonHitPoints: 12, benchPointsBeforeGw: 76, teamValue: 104.2, previousTeamValue: 103.8, finished: 5, live: 3, upcoming: 3, form: [74, 72, 78, 71, 75], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [1, 1, 1, 1, 1] },
  { id: 102, position: 2, previousPosition: 1, teamName: "No Kane No Gain", managerName: "Mikko L.", gameweekPoints: 62, provisionalBonus: 3, totalPoints: 1829, overallRank: 155021, previousOverallRank: 143800, captain: "Haaland", captainPoints: 18, transfers: [{ out: "Saka", in: "Palmer", outPoints: 3, inPoints: 13 }, { out: "Solanke", in: "Haaland", outPoints: 1, inPoints: 15 }], hit: 4, availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["BB"], freeTransfersAfter: 1, seasonTransfers: 31, seasonHitPoints: 24, benchPointsBeforeGw: 91, teamValue: 101.3, previousTeamValue: 101.5, finished: 5, live: 3, upcoming: 3, form: [70, 57, 44, 63, 62], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [1, 1, -1, 1, -1] },
  { id: 103, position: 3, previousPosition: 2, teamName: "Ctrl Alt De Ligt", managerName: "Antti K.", gameweekPoints: 58, provisionalBonus: 4, totalPoints: 1798, overallRank: 221907, previousOverallRank: 214300, captain: "Saka", captainPoints: 16, transfers: [], hit: 0, chip: "BB", availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["WC"], freeTransfersAfter: 2, seasonTransfers: 22, seasonHitPoints: 4, benchPointsBeforeGw: 68, teamValue: 100.8, previousTeamValue: 100.8, finished: 5, live: 3, upcoming: 3, form: [52, 69, 50, 59, 58], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [-1, 1, -1, 1, -1] },
  { id: 104, position: 4, previousPosition: 5, teamName: "Tea & Busquets", managerName: "Sami P.", gameweekPoints: 54, provisionalBonus: 2, totalPoints: 1761, overallRank: 310554, previousOverallRank: 345100, captain: "Palmer", captainPoints: 14, transfers: [{ out: "Foden", in: "Saka", outPoints: 2, inPoints: 3 }], hit: 0, availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["FH", "BB"], freeTransfersAfter: 1, seasonTransfers: 35, seasonHitPoints: 36, benchPointsBeforeGw: 104, teamValue: 99.9, previousTeamValue: 100.1, finished: 5, live: 3, upcoming: 3, form: [45, 55, 64, 49, 54], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [-1, 1, 1, -1, 1] },
  { id: 105, position: 5, previousPosition: 4, teamName: "Game of Throw-Ins", managerName: "Ville H.", gameweekPoints: 47, provisionalBonus: 1, totalPoints: 1734, overallRank: 402118, previousOverallRank: 388600, captain: "Isak", captainPoints: 10, transfers: [], hit: 0, chip: "WC", availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["TC"], freeTransfersAfter: 1, wildcardPreviousTeamPoints: 39, seasonTransfers: 29, seasonHitPoints: 16, benchPointsBeforeGw: 87, teamValue: 100.4, previousTeamValue: 99.8, finished: 5, live: 3, upcoming: 3, form: [60, 42, 51, 66, 47], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [1, -1, 1, 1, -1] },
  { id: 106, position: 6, previousPosition: 8, teamName: "Jankon betoni", managerName: "Mikko Knuuttila", gameweekPoints: 45, provisionalBonus: 2, totalPoints: 1712, overallRank: 468330, previousOverallRank: 501200, captain: "Gabriel", captainPoints: 14, transfers: [{ out: "Rogers", in: "Semenyo", outPoints: 4, inPoints: 8 }], hit: 0, availableChips: ["WC", "FH", "BB", "TC"], usedChips: [], freeTransfersAfter: 1, seasonTransfers: 24, seasonHitPoints: 8, benchPointsBeforeGw: 81, teamValue: 100.1, previousTeamValue: 99.9, finished: 5, live: 3, upcoming: 3, form: [43, 58, 46, 62, 45], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [-1, 1, -1, 1, -1] },
  { id: 107, position: 7, previousPosition: 6, teamName: "Tussulan voittajat", managerName: "Ilpo Hed", gameweekPoints: 43, provisionalBonus: 0, totalPoints: 1688, overallRank: 533901, previousOverallRank: 520480, captain: "Palmer", captainPoints: 10, transfers: [], hit: 0, availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["FH"], freeTransfersAfter: 2, seasonTransfers: 19, seasonHitPoints: 0, benchPointsBeforeGw: 73, teamValue: 99.6, previousTeamValue: 99.7, finished: 5, live: 3, upcoming: 3, form: [51, 47, 54, 49, 43], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [1, -1, 1, -1, -1] },
  { id: 108, position: 8, previousPosition: 7, teamName: "Pirkkolan Beckham", managerName: "Teemu Honkanen", gameweekPoints: 41, provisionalBonus: 3, totalPoints: 1654, overallRank: 611245, previousOverallRank: 596700, captain: "Saka", captainPoints: 8, transfers: [{ out: "Haaland", in: "Isak", outPoints: 7, inPoints: 10 }], hit: 0, chip: "FH", availableChips: ["WC", "FH", "BB", "TC"], usedChips: [], freeTransfersAfter: 1, seasonTransfers: 27, seasonHitPoints: 20, benchPointsBeforeGw: 96, teamValue: 98.8, previousTeamValue: 99.0, finished: 5, live: 3, upcoming: 3, form: [38, 55, 43, 52, 41], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [-1, 1, -1, 1, -1] },
  { id: 109, position: 9, previousPosition: 10, teamName: "KERPA RULZ", managerName: "Sami Karki", gameweekPoints: 38, provisionalBonus: 1, totalPoints: 1609, overallRank: 704882, previousOverallRank: 749100, captain: "Haaland", captainPoints: 14, transfers: [{ out: "Muñoz", in: "Hall", outPoints: 3, inPoints: 0 }, { out: "Raya", in: "Henderson", outPoints: 2, inPoints: 5 }], hit: 4, availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["WC"], freeTransfersAfter: 1, seasonTransfers: 34, seasonHitPoints: 40, benchPointsBeforeGw: 118, teamValue: 98.2, previousTeamValue: 98.0, finished: 5, live: 3, upcoming: 3, form: [44, 36, 49, 42, 38], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [1, -1, 1, -1, 1] },
  { id: 110, position: 10, previousPosition: 9, teamName: "Karjarannan Hurjat", managerName: "Santeri Aijo", gameweekPoints: 35, provisionalBonus: 2, totalPoints: 1576, overallRank: 812407, previousOverallRank: 790310, captain: "Salah", captainPoints: 12, transfers: [], hit: 0, availableChips: ["WC", "FH", "BB", "TC"], usedChips: ["BB", "TC"], freeTransfersAfter: 3, seasonTransfers: 17, seasonHitPoints: 4, benchPointsBeforeGw: 65, teamValue: 97.9, previousTeamValue: 97.9, finished: 5, live: 3, upcoming: 3, form: [25, 28, 22, 26, 24], formGameweeks: [19, 20, 21, 22, 23], formRankMovement: [-1, -1, -1, -1, -1] },
];

// Demo fixtures cover every fixture state so the header status and the fixture menu can be reviewed.
const demoFixtures: GameweekFixture[] = [
  { id: 1, kickoff: "2026-08-21T19:00:00Z", home: "ARS", away: "COV", homeScore: 2, awayScore: 1, minutes: 90, status: "final" },
  { id: 2, kickoff: "2026-08-22T11:30:00Z", home: "HUL", away: "MUN", homeScore: 0, awayScore: 3, minutes: 90, status: "final" },
  { id: 3, kickoff: "2026-08-22T14:00:00Z", home: "EVE", away: "CRY", homeScore: 1, awayScore: 1, minutes: 90, status: "final" },
  { id: 4, kickoff: "2026-08-22T14:00:00Z", home: "IPS", away: "SUN", homeScore: 2, awayScore: 0, minutes: 90, status: "provisional" },
  { id: 5, kickoff: "2026-08-22T16:30:00Z", home: "NFO", away: "LEE", homeScore: 1, awayScore: 0, minutes: 67, status: "live" },
  { id: 6, kickoff: "2026-08-22T16:30:00Z", home: "BRE", away: "TOT", homeScore: 0, awayScore: 2, minutes: 61, status: "live" },
  { id: 7, kickoff: "2026-08-23T13:00:00Z", home: "BHA", away: "AVL", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" },
  { id: 8, kickoff: "2026-08-23T13:00:00Z", home: "MCI", away: "BOU", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" },
  { id: 9, kickoff: "2026-08-23T15:30:00Z", home: "NEW", away: "LIV", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" },
  { id: 10, kickoff: "2026-08-24T19:00:00Z", home: "FUL", away: "CHE", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" },
];

const demoManagers = managers.map((manager, index) => ({ ...manager, squad: makeSquad(index + 1, [5, 9, 7, 6, 10, 1, 6, 7, 9, 5][index]) }));

/**
 * Demo prices are generated from the demo squads rather than written out: the price page
 * needs six hundred rows to stress, and the point of `?demo=1` is a layout to measure, not
 * a market to believe. The spread is deterministic so two runs are comparable.
 */
const demoPrices = (): DashboardData["prices"] => {
  const seen = new Map<number, SquadPlayer>();
  for (const manager of demoManagers) for (const player of manager.squad) seen.set(player.id, player);
  const players = [...seen.values()].map((player, index) => {
    const progress = ((index * 37) % 190) - 90;
    const perHourPercent = (((index * 13) % 60) - 20) / 10;
    const projection = (offset: number) => ({ offset, percent: Math.round((progress + perHourPercent * 24 * (offset + 0.5)) * 10) / 10, likelihood: progress > 0 ? 3 : -3 });
    return {
      id: player.id, name: player.name, club: player.club, clubCode: player.clubCode, position: player.position,
      cost: player.cost, costChangeStart: ((index % 5) - 2) / 10, ownership: player.ownership,
      netTransfers: (index % 7 === 0 ? -1 : 1) * ((index * 5417) % 90000),
      progress, projections: [projection(0), projection(1), projection(2)], perHour: perHourPercent,
      lockedUntil: index % 41 === 0 ? "2026-08-24T23:00:00Z" : null, calibrating: index % 53 === 0,
    };
  });
  return { deadlines: ["2026-08-23T23:00:00Z", "2026-08-24T23:00:00Z"], players };
};

/** A handful of events so `?demo=1` shows the ticker moving without a Worker behind it. */
const demoFeed = (): DashboardData["feed"] => {
  // Spread across squads, and every third event belongs to nobody in the league — which is
  // what a real feed looks like, and the only way to see the unowned row rendered.
  const pool = demoManagers.flatMap((manager, managerIndex) => manager.squad.map((player) => ({ player, managerIndex })));
  const shape: Array<[FeedEvent["kind"], number, number]> = [
    ["goal", 6, 2], ["assist", 3, 9], ["yellow", -1, 14], ["defcon", 2, 23],
    ["save_point", 1, 31], ["bonus", 1, 38], ["goal", 6, 46], ["red", -3, 57],
    ["penalty_save", 5, 64], ["assist", 3, 72],
  ];
  return shape.map(([kind, pointsDelta, minutesAgo], index) => {
    const player = index % 3 === 2
      ? { ...pool[index * 7 % pool.length].player, id: 90_000 + index, name: `Unowned ${index}` }
      : pool[index * 13 % pool.length].player;
    return {
      id: `demo-${index}`,
      at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      gameweek: 1, element: player.id, player: player.name, club: player.club,
      kind, value: 1, pointsDelta, points: player.points,
      fixture: { home: player.club, away: player.opponent, homeScore: 2, awayScore: 1, minutes: 90 - minutesAgo },
    };
  });
};

export const demoData: DashboardData = {
  leagueName: "Farmisarja", gameweek: 1, deadline: "2026-08-21T17:30:00Z", updatedAt: new Date().toISOString(), isPreview: true, pointsFinalized: false, activeMonths: ["2026-08"], fixtures: demoFixtures,
  managers: demoManagers,
  prices: demoPrices(),
  feed: demoFeed(),
};
