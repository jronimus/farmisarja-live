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
  cost: number;
  ownership: number;
  /** FPL's own 1–5 fixture difficulty, from the player's side of the tie. */
  difficulty?: number;
  /** Kick-off of the fixture this player is waiting for. */
  kickoff?: string;
  state: PlayerState;
  fixtures?: Array<{ state: PlayerState }>;
  starter: boolean;
  captain?: boolean;
  viceCaptain?: boolean;
}

export type FixtureStatus = "upcoming" | "live" | "provisional" | "final";

export interface FixtureStatEntry {
  name: string;
  club: string;
  value: number;
  /** Distinguishes the two sides of a combined category: card colour, penalty outcome. */
  variant?: "yellow" | "red" | "saved" | "missed";
  /** Only set for defCon, to check the entry's value against the threshold for his position. */
  position?: SquadPlayer["position"];
}

export type FixtureStatKey = "goals" | "ownGoals" | "assists" | "cards" | "bonus" | "bps" | "defCon" | "saves" | "penalties";

export interface FixtureStatCategory {
  key: FixtureStatKey;
  entries: FixtureStatEntry[];
}

export interface GameweekFixture {
  id: number;
  kickoff: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  minutes: number;
  status: FixtureStatus;
  /** FPL's own per-match breakdown, once the fixture has kicked off. */
  stats?: FixtureStatCategory[];
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
  /** Which gameweek each form figure belongs to, so the series can label itself. */
  formGameweeks: number[];
  formRankMovement: number[];
  squad: SquadPlayer[];
}

/** One of FPL's own projections: how far along the player is expected to be in `offset` days. */
export interface PriceProjection {
  /** 0 is tonight's change, 1 tomorrow's, 2 the one after. */
  offset: number;
  /** Can pass 100, which is the point at which the price moves. */
  percent: number;
  /** FPL's own confidence, -5…5. Negative is a fall. */
  likelihood: number;
}

export interface PriceRow {
  id: number;
  name: string;
  club: string;
  clubCode: number;
  position: SquadPlayer["position"];
  cost: number;
  /** Price movement since the season started, in millions. */
  costChangeStart: number;
  ownership: number;
  netTransfers: number;
  /** Progress toward the next change: 100 is where the price moves. Negative is a fall. */
  progress: number;
  projections: PriceProjection[];
  /** Percentage points per hour, derived from the projections a day apart. */
  perHour: number;
  lockedUntil: string | null;
  calibrating: boolean;
}

export interface PriceMarket {
  /** FPL publishes the exact change times; the countdown is not guesswork. */
  deadlines: string[];
  players: PriceRow[];
}

import type { FeedEvent } from "./services/liveFeed";

export interface DashboardData {
  leagueName: string;
  gameweek: number;
  deadline: string;
  updatedAt: string;
  isPreview: boolean;
  rosterOnly?: boolean;
  dataPending?: boolean;
  pointsFinalized: boolean;
  activeMonths: string[];
  fixtures?: GameweekFixture[];
  managers: ManagerRow[];
  /** FPL's own average score per gameweek, which is what form is measured against. */
  gameweekAverages?: Record<number, number>;
  prices?: PriceMarket;
  /** Only demo data carries its own feed; live data reads it from the Worker. */
  feed?: FeedEvent[];
}
