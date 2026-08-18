import type { DashboardData, ManagerRow, SquadPlayer } from "./types";

const names = [
  ["Raya", "ARS", 3, "GK"], ["Gabriel", "ARS", 3, "DEF"], ["Gvardiol", "MCI", 43, "DEF"],
  ["Hall", "NEW", 4, "DEF"], ["Muñoz", "CRY", 31, "DEF"], ["Salah", "LIV", 14, "MID"],
  ["Palmer", "CHE", 8, "MID"], ["Saka", "ARS", 3, "MID"], ["Rogers", "AVL", 7, "MID"],
  ["Haaland", "MCI", 43, "FWD"], ["Isak", "NEW", 4, "FWD"], ["Henderson", "CRY", 31, "GK"],
  ["Kerkez", "LIV", 14, "DEF"], ["Semenyo", "MCI", 43, "MID"], ["João Pedro", "CHE", 8, "FWD"],
] as const;

const clubFixtures: Record<string, { opponent: string; venue: "H" | "A"; state: SquadPlayer["state"] }> = {
  ARS: { opponent: "CHE", venue: "H", state: "finished" },
  AVL: { opponent: "WHU", venue: "H", state: "finished" },
  CHE: { opponent: "ARS", venue: "A", state: "finished" },
  CRY: { opponent: "EVE", venue: "H", state: "finished" },
  LIV: { opponent: "MUN", venue: "H", state: "live" },
  MCI: { opponent: "BHA", venue: "A", state: "upcoming" },
  NEW: { opponent: "TOT", venue: "A", state: "upcoming" },
};

const makeSquad = (seed: number, captainIndex: number): SquadPlayer[] => names.map((player, index) => ({
  id: seed * 100 + index,
  squadPosition: index + 1,
  name: player[0], club: player[1], clubCode: player[2], position: player[3], starter: index < 11,
  opponent: clubFixtures[player[1]].opponent,
  venue: clubFixtures[player[1]].venue,
  points: (index * 3 + seed * 2) % 11, bonus: index % 5 === seed % 5 ? (index % 3) + 1 : 0,
  minutes: clubFixtures[player[1]].state === "finished" ? 90 : clubFixtures[player[1]].state === "live" ? 45 : 0,
  state: clubFixtures[player[1]].state,
  captain: index === captainIndex, viceCaptain: index === (captainIndex + 1) % 11,
}));

const managers: Omit<ManagerRow, "squad">[] = [
  { id: 101, position: 1, previousPosition: 3, teamName: "Expected Toulouse", managerName: "Joni R.", gameweekPoints: 67, provisionalBonus: 5, totalPoints: 1842, overallRank: 128442, previousOverallRank: 151220, captain: "Salah", captainPoints: 22, transfers: [{ out: "Watkins", in: "Isak", outPoints: 2, inPoints: 10 }], hit: 0, chip: "3×C", availableChips: ["WC", "FH", "BB", "3×C"], usedChips: [], freeTransfersAfter: 1, seasonTransfers: 26, seasonHitPoints: 12, benchPointsBeforeGw: 76, teamValue: 102.7, previousTeamValue: 102.5, finished: 5, live: 3, upcoming: 3, form: [61, 48, 73, 55, 67], formRankMovement: [1, -1, 1, -1, 1] },
  { id: 102, position: 2, previousPosition: 1, teamName: "No Kane No Gain", managerName: "Mikko L.", gameweekPoints: 62, provisionalBonus: 3, totalPoints: 1829, overallRank: 155021, previousOverallRank: 143800, captain: "Haaland", captainPoints: 18, transfers: [{ out: "Saka", in: "Palmer", outPoints: 3, inPoints: 5 }, { out: "Solanke", in: "Haaland", outPoints: 1, inPoints: 12 }], hit: 4, availableChips: ["WC", "FH", "BB", "3×C"], usedChips: ["BB"], freeTransfersAfter: 1, seasonTransfers: 31, seasonHitPoints: 24, benchPointsBeforeGw: 91, teamValue: 101.3, previousTeamValue: 101.5, finished: 5, live: 3, upcoming: 3, form: [70, 57, 44, 63, 62], formRankMovement: [1, 1, -1, 1, -1] },
  { id: 103, position: 3, previousPosition: 2, teamName: "Ctrl Alt De Ligt", managerName: "Antti K.", gameweekPoints: 58, provisionalBonus: 4, totalPoints: 1798, overallRank: 221907, previousOverallRank: 214300, captain: "Saka", captainPoints: 16, transfers: [], hit: 0, chip: "BB", availableChips: ["WC", "FH", "BB", "3×C"], usedChips: ["WC"], freeTransfersAfter: 2, seasonTransfers: 22, seasonHitPoints: 4, benchPointsBeforeGw: 68, teamValue: 100.8, previousTeamValue: 100.8, finished: 5, live: 3, upcoming: 3, form: [52, 69, 50, 59, 58], formRankMovement: [-1, 1, -1, 1, -1] },
  { id: 104, position: 4, previousPosition: 5, teamName: "Tea & Busquets", managerName: "Sami P.", gameweekPoints: 54, provisionalBonus: 2, totalPoints: 1761, overallRank: 310554, previousOverallRank: 345100, captain: "Palmer", captainPoints: 14, transfers: [{ out: "Foden", in: "Saka", outPoints: 2, inPoints: 3 }], hit: 0, availableChips: ["WC", "FH", "BB", "3×C"], usedChips: ["FH", "BB"], freeTransfersAfter: 1, seasonTransfers: 35, seasonHitPoints: 36, benchPointsBeforeGw: 104, teamValue: 99.9, previousTeamValue: 100.1, finished: 5, live: 3, upcoming: 3, form: [45, 55, 64, 49, 54], formRankMovement: [-1, 1, 1, -1, 1] },
  { id: 105, position: 5, previousPosition: 4, teamName: "Game of Throw-Ins", managerName: "Ville H.", gameweekPoints: 47, provisionalBonus: 1, totalPoints: 1734, overallRank: 402118, previousOverallRank: 388600, captain: "Isak", captainPoints: 10, transfers: [], hit: 0, chip: "WC", availableChips: ["WC", "FH", "BB", "3×C"], usedChips: ["3×C"], freeTransfersAfter: 1, wildcardPreviousTeamPoints: 39, seasonTransfers: 29, seasonHitPoints: 16, benchPointsBeforeGw: 87, teamValue: 100.4, previousTeamValue: 99.8, finished: 5, live: 3, upcoming: 3, form: [60, 42, 51, 66, 47], formRankMovement: [1, -1, 1, 1, -1] },
];

export const demoData: DashboardData = {
  leagueName: "Farmisarja", gameweek: 1, deadline: "2026-08-21T17:30:00Z", updatedAt: new Date().toISOString(), isPreview: true, pointsFinalized: false, completedMonths: [],
  managers: managers.map((manager, index) => ({ ...manager, squad: makeSquad(index + 1, [5, 9, 7, 6, 10][index]) })),
};
