import type { SquadPlayer } from "../types";

export interface HistoryEvent {
  event: number;
  event_transfers: number;
}

export interface ChipUse {
  name: string;
  event: number;
}

const CHIP_CODES: Record<string, string> = { wildcard: "WC", freehit: "FH", bboost: "BB", "3xc": "TC" };

export function usedChipsForHalf(chips: ChipUse[], event: number): string[] {
  const inCurrentHalf = event <= 19
    ? (chip: ChipUse) => chip.event <= 19
    : (chip: ChipUse) => chip.event >= 20;
  const used = chips.filter((chip) => chip.event <= event && inCurrentHalf(chip)).map((chip) => CHIP_CODES[chip.name]).filter(Boolean);
  if (event === 20 && chips.some((chip) => chip.name === "freehit" && chip.event === 19)) used.push("FH");
  return [...new Set(used)];
}

export function nextGameweekFreeTransfers(history: HistoryEvent[], chips: ChipUse[], event: number): number {
  if (event <= 1) return 1;
  let bank = 1;
  const chipByEvent = new Map(chips.map((chip) => [chip.event, chip.name]));
  for (const row of [...history].sort((a, b) => a.event - b.event)) {
    if (row.event < 2 || row.event > event) continue;
    const chip = chipByEvent.get(row.event);
    bank = chip === "wildcard" || chip === "freehit"
      ? bank
      : Math.min(5, Math.max(0, bank - row.event_transfers) + 1);
  }
  return bank;
}

const minimums = { DEF: 3, FWD: 1 } as const;

function unavailable(player: SquadPlayer): boolean {
  const fixtures = player.fixtures ?? [{ state: player.state }];
  return player.minutes === 0 && fixtures.length > 0 && fixtures.every((fixture) => fixture.state !== "upcoming");
}

export function provisionalAutosubSquad(squad: SquadPlayer[], enabled: boolean): SquadPlayer[] {
  const ordered = [...squad].sort((a, b) => a.squadPosition - b.squadPosition).map((player) => ({ ...player }));
  if (!enabled) return ordered;

  const active = ordered.filter((player) => player.starter);
  const missing = active.filter(unavailable);
  const bench = ordered.filter((player) => !player.starter && !unavailable(player));
  const promoted = new Set<number>();
  const removed = new Set<number>();

  const missingGoalkeeper = missing.find((player) => player.position === "GK");
  const benchGoalkeeper = bench.find((player) => player.position === "GK");
  if (missingGoalkeeper && benchGoalkeeper) {
    removed.add(missingGoalkeeper.id);
    promoted.add(benchGoalkeeper.id);
  }

  const missingOutfield = missing.filter((player) => player.position !== "GK");
  const currentOutfield = active.filter((player) => player.position !== "GK" && !removed.has(player.id));
  for (const candidate of bench.filter((player) => player.position !== "GK")) {
    const replacement = missingOutfield.find((player) => {
      if (removed.has(player.id)) return false;
      const next = currentOutfield.filter((activePlayer) => activePlayer.id !== player.id);
      next.push(candidate);
      return (Object.entries(minimums) as Array<[keyof typeof minimums, number]>).every(([position, minimum]) =>
        next.filter((activePlayer) => activePlayer.position === position).length >= minimum,
      );
    });
    if (!replacement) continue;
    removed.add(replacement.id);
    promoted.add(candidate.id);
    const index = currentOutfield.findIndex((player) => player.id === replacement.id);
    if (index >= 0) currentOutfield.splice(index, 1, candidate);
  }

  const originalCaptain = ordered.find((player) => player.captain);
  const viceCaptain = ordered.find((player) => player.viceCaptain);
  const promoteVice = originalCaptain && removed.has(originalCaptain.id) && viceCaptain && !removed.has(viceCaptain.id) && (viceCaptain.starter || promoted.has(viceCaptain.id));

  return ordered.map((player) => ({
    ...player,
    starter: player.starter ? !removed.has(player.id) : promoted.has(player.id),
    captain: promoteVice ? player.id === viceCaptain.id : player.captain,
    viceCaptain: promoteVice ? player.id === originalCaptain.id : player.viceCaptain,
  }));
}
