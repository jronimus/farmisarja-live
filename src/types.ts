export type Language = "fi" | "en";
export type PlayerState = "finished" | "live" | "upcoming";

export interface SquadPlayer {
  id: number;
  squadPosition: number;
  name: string;
  club: string;
  clubCode: number;
  opponent: string;
  venue: "H" | "A";
  position: "GK" | "DEF" | "MID" | "FWD";
  points: number;
  bonus: number;
  minutes: number;
  state: PlayerState;
  fixtures?: Array<{ state: PlayerState }>;
  starter: boolean;
  captain?: boolean;
  viceCaptain?: boolean;
}

export interface ManagerRow {
  id: number;
  position: number;
  previousPosition: number;
  teamName: string;
  managerName: string;
  gameweekPoints: number;
  provisionalBonus: number;
  totalPoints: number;
  overallRank: number;
  previousOverallRank: number;
  captain: string;
  captainPoints: number;
  transfers: Array<{ out: string; in: string; outPoints: number; inPoints: number }>;
  hit: number;
  chip?: string;
  availableChips: string[];
  usedChips: string[];
  freeTransfersAfter?: number;
  wildcardPreviousTeamPoints?: number;
  seasonTransfers: number;
  seasonHitPoints: number;
  benchPointsBeforeGw: number;
  teamValue: number;
  previousTeamValue: number;
  finished: number;
  live: number;
  upcoming: number;
  form: number[];
  formRankMovement: number[];
  squad: SquadPlayer[];
}

export interface DashboardData {
  leagueName: string;
  gameweek: number;
  deadline: string;
  updatedAt: string;
  isPreview: boolean;
  pointsFinalized: boolean;
  completedMonths: string[];
  managers: ManagerRow[];
}
