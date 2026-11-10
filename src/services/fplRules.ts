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

/**
 * When the header should stop reporting a settled gameweek and start counting down the
 * next one.
 *
 * Two things had to be true at once. FPL leaves `is_current` on a finished gameweek long
 * after the football is over — on 25 Aug every GW1 fixture read `finished: true` while the
 * event still read `is_current`, so the card would have said GW 1 VAHVISTETTU for days
 * while the only thing worth counting was Friday's deadline. But handing over the moment
 * the fixtures are confirmed would mean the confirmed state is never seen at all: it would
 * appear and be replaced in the same tick.
 *
 * So the handover is `HANDOVER_HOURS` after the confirmation, and the confirmation is
 * derived rather than stored, because FPL publishes no timestamp for it. It confirms a
 * gameweek's fixtures together at **09:00 UK the morning after the last match**, which is
 * new for 2026-27 — and the model is checkable: GW1's last kick-off was 20:00 London on
 * Monday 24 Aug, this puts the confirmation at 09:00 on Tuesday, and the fixtures actually
 * flipped at 09:13. Thirteen minutes out, on a twelve-hour delay.
 *
 * The caller gates this on the fixtures really being confirmed, so the model can only ever
 * delay the handover and never bring it forward on a gameweek FPL has not finished with.
 */
export const HANDOVER_HOURS = 12;

/** 09:00 in London on a given day, whichever side of the clock change it falls. */
function londonNine(within: number): number {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(within));
  const hourIn = (ms: number) => Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", hour12: false,
  }).format(new Date(ms)));
  // BST or GMT, without a table of them: try both and keep the one that reads back as 09.
  for (const offset of [0, 1]) {
    const guess = Date.parse(`${day}T${String(9 - offset).padStart(2, "0")}:00:00Z`);
    if (hourIn(guess) === 9) return guess;
  }
  return Date.parse(`${day}T09:00:00Z`);
}

/**
 * The moment FPL confirms a gameweek: the first 09:00 UK after its last match ends. Three
 * hours are allowed for the match itself, so a late kick-off is not read as confirmed on
 * the morning it started.
 */
export function gameweekConfirmedAt(lastKickoff: string): number {
  const fullTime = Date.parse(lastKickoff) + 3 * 3_600_000;
  for (let day = 0; day <= 3; day += 1) {
    const nine = londonNine(fullTime + day * 86_400_000);
    if (nine > fullTime) return nine;
  }
  return fullTime;
}

/** The instant the header hands over to the next gameweek. */
export function gameweekHandsOverAt(lastKickoff: string): number {
  return gameweekConfirmedAt(lastKickoff) + HANDOVER_HOURS * 3_600_000;
}


/**
 * What a squad gets back for a player, in tenths of a million.
 *
 * FPL's rule: a rise is shared and a fall is not. Above the price you paid you keep half
 * the profit, rounded down to the nearest 0.1; at or below it you sell for what he is worth
 * now and take the whole loss. Everything the page says about selling prices comes out of
 * these two lines.
 *
 * Tenths and not millions, because the rounding is the rule. `(5.5 - 5.0) / 2` in floating
 * point is 0.25000000000000006, and the whole question is which side of a tenth that lands
 * on — integers cannot get it wrong.
 */
export function sellingPrice(purchase: number, price: number): number {
  if (price <= purchase) return price;
  return purchase + Math.floor((price - purchase) / 2);
}

/**
 * Whether a change would move what this squad gets back for him.
 *
 * Half of a rise is kept, so a rise only lifts the selling price every second time: at
 * 0.1 above what you paid you have banked nothing, at 0.2 you have banked 0.1. Falls are
 * not shared, but the same halving means a fall out of unbanked profit costs nothing
 * either — 0.5 above your price down to 0.4 both round to 0.2 banked. So the answer is not
 * "up costs nothing, down costs everything": it alternates, and which half of the
 * alternation a player is on is not something a squad can see anywhere in FPL.
 *
 * Both sides are computed rather than reasoned about, because the parity argument is easy
 * to get right on paper and easy to get wrong in code.
 */
export function sellingPriceMoves(purchase: number, price: number, direction: "rise" | "fall"): boolean {
  const after = sellingPrice(purchase, price + (direction === "rise" ? 1 : -1));
  return after !== sellingPrice(purchase, price);
}
