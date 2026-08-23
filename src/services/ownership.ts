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
 * The squads are read through `provisionalAutosubSquad` so the numbers agree with what
 * the table is showing: with autosubs on, a bench player who has come on counts as a
 * starter, and a vice-captain who has inherited the armband counts double.
 */
export function buildOwnership(managers: ManagerRow[], autosubs: boolean): PlayerOwnership[] {
  const total = managers.length;
  if (!total) return [];
  const byPlayer = new Map<number, PlayerOwnership & { multiplierSum: number }>();

  for (const manager of managers) {
    for (const player of provisionalAutosubSquad(manager.squad, autosubs)) {
      const multiplier = pickMultiplier(player, manager.chip);
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

/** Whether a manager holds the player, and whether he is their captain. */
export function ownershipOf(manager: ManagerRow, playerId: number | null, autosubs: boolean) {
  if (!playerId) return { owns: false, captains: false, benched: false };
  const player = provisionalAutosubSquad(manager.squad, autosubs).find((item) => item.id === playerId);
  if (!player) return { owns: false, captains: false, benched: false };
  return {
    owns: true,
    captains: Boolean(player.captain),
    benched: pickMultiplier(player, manager.chip) === 0,
  };
}
