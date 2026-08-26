import type { ManagerRow, SquadPlayer } from "../types";
import { provisionalAutosubSquad } from "./fplRules";

export interface PlayerOwnership {
  id: number;
  name: string;
  club: string;
  position: SquadPlayer["position"];
  /** Squads holding the player at all, bench included. */
  owners: number;
  /** Squads where he wears the armband. */
  captains: number;
  /** Squads where he is on the bench and scoring nothing. */
  benched: number;
  /** Owned by this share of the league, 0–100. */
  ownedPercent: number;
  /** Effective ownership: the summed multiplier over the league, so it passes 100. */
  effectivePercent: number;
}

/**
 * FPL's own multiplier, which is what makes effective ownership differ from ownership: a
 * benched player scores nothing unless the bench boost is on, the captain scores twice,
 * and three times under the triple captain. A league of seven all captaining the same
 * player owns him 100% and effectively 200%.
 */
export function pickMultiplier(player: SquadPlayer, chip: ManagerRow["chip"]): number {
  if (player.captain) return chip === "TC" ? 3 : 2;
  return player.starter || chip === "BB" ? 1 : 0;
}

/**
 * Ownership across the league, ordered by effective ownership.
 *
 * With `includeBench` off the count is of the players actually on the pitch: a squad that
 * owns him but has left him on the bench drops out of the list entirely. Effective
 * ownership does not move, because a benched player was already worth nothing in it.
 *
 * The squads are read through `provisionalAutosubSquad` so the numbers agree with what
 * the table is showing: with autosubs on, a bench player who has come on counts as a
 * starter, and a vice-captain who has inherited the armband counts double.
 */
export function buildOwnership(managers: ManagerRow[], autosubs: boolean, includeBench = true): PlayerOwnership[] {
  const total = managers.length;
  if (!total) return [];
  const byPlayer = new Map<number, PlayerOwnership & { multiplierSum: number }>();

  for (const manager of managers) {
    for (const player of provisionalAutosubSquad(manager.squad, autosubs)) {
      const multiplier = pickMultiplier(player, manager.chip);
      if (!includeBench && multiplier === 0) continue;
      const entry = byPlayer.get(player.id) ?? {
        id: player.id, name: player.name, club: player.club, position: player.position,
        owners: 0, captains: 0, benched: 0, ownedPercent: 0, effectivePercent: 0, multiplierSum: 0,
      };
      entry.owners += 1;
      entry.captains += player.captain ? 1 : 0;
      entry.benched += multiplier === 0 ? 1 : 0;
      entry.multiplierSum += multiplier;
      byPlayer.set(player.id, entry);
    }
  }

  return [...byPlayer.values()]
    .map(({ multiplierSum, ...entry }) => ({
      ...entry,
      ownedPercent: (entry.owners / total) * 100,
      effectivePercent: (multiplierSum / total) * 100,
    }))
    .sort((a, b) =>
      b.effectivePercent - a.effectivePercent
      || b.owners - a.owners
      || a.name.localeCompare(b.name));
}

export interface ClubOwnership {
  club: string;
  /** Managers holding at least one of the club's players. */
  owners: number;
  /** Squad places the club takes across the league, the same player twice counted twice. */
  picks: number;
  /** Squads where the armband is on one of the club's players. */
  captains: number;
}

/**
 * The same question as `buildOwnership`, asked of a club instead of a player: how much of
 * this league is exposed to Arsenal.
 *
 * `picks` is squad places and not distinct footballers, because that is what the question
 * means — six managers holding Haaland is six places City has taken in this league, not
 * one. It is also what orders the list, so the figure the row shows is the figure it is
 * sorted by.
 */
export function buildClubOwnership(managers: ManagerRow[], autosubs: boolean, includeBench = true): ClubOwnership[] {
  const byClub = new Map<string, ClubOwnership>();
  for (const manager of managers) {
    const held = new Set<string>();
    for (const player of provisionalAutosubSquad(manager.squad, autosubs)) {
      if (!includeBench && pickMultiplier(player, manager.chip) === 0) continue;
      const entry = byClub.get(player.club) ?? { club: player.club, owners: 0, picks: 0, captains: 0 };
      entry.picks += 1;
      entry.captains += player.captain ? 1 : 0;
      // Once per manager, however many of the club's players he holds.
      if (!held.has(player.club)) { entry.owners += 1; held.add(player.club); }
      byClub.set(player.club, entry);
    }
  }
  return [...byClub.values()].sort((a, b) =>
    b.picks - a.picks
    || b.owners - a.owners
    || a.club.localeCompare(b.club));
}

/**
 * What the table highlights: one player, or one club.
 *
 * The two are the same question — which of these seven squads is exposed to this — and the
 * table paints them identically, so they are one selection and not two pieces of state
 * that could both be set at once.
 */
export type Highlight = { kind: "player"; id: number } | { kind: "club"; club: string } | null;

const nobody = { owns: false, captains: false, benched: false };

/** Whether a manager holds the highlighted player or club, and whether he captains it. */
export function ownershipOf(manager: ManagerRow, highlight: Highlight, autosubs: boolean, includeBench = true) {
  if (!highlight) return nobody;
  const squad = provisionalAutosubSquad(manager.squad, autosubs);
  const held = highlight.kind === "player"
    ? squad.filter((item) => item.id === highlight.id)
    : squad.filter((item) => item.club === highlight.club);
  const counted = includeBench ? held : held.filter((item) => pickMultiplier(item, manager.chip) !== 0);
  if (!counted.length) return nobody;
  return {
    owns: true,
    captains: counted.some((item) => item.captain),
    // A club is benched only when every one of its players here is: one on the pitch is
    // the manager being exposed to it, which is what the mark means.
    benched: counted.every((item) => pickMultiplier(item, manager.chip) === 0),
  };
}

export interface PlayerOwner {
  managerId: number;
  teamName: string;
  managerName: string;
  captain: boolean;
  benched: boolean;
  /** What this squad paid for him, in millions. Absent on demo data. */
  purchasePrice?: number;
}

/**
 * Who in the league holds each player. The price page needs the names, not just the
 * count, so this is kept apart from `buildOwnership` rather than bolted onto it.
 */
export function ownersByPlayer(managers: ManagerRow[], autosubs: boolean): Map<number, PlayerOwner[]> {
  const byPlayer = new Map<number, PlayerOwner[]>();
  for (const manager of managers) {
    for (const player of provisionalAutosubSquad(manager.squad, autosubs)) {
      const owners = byPlayer.get(player.id) ?? [];
      owners.push({
        managerId: manager.id,
        teamName: manager.teamName,
        managerName: manager.managerName,
        captain: Boolean(player.captain),
        benched: pickMultiplier(player, manager.chip) === 0,
        purchasePrice: player.purchasePrice,
      });
      byPlayer.set(player.id, owners);
    }
  }
  return byPlayer;
}
