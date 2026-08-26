import type { PlayerFlag, PlayerNews, SquadPlayer } from "../types";

/**
 * Availability, as FPL states it and as it can be read past what FPL states.
 *
 * FPL publishes two things per player: a `status` letter and, for the doubtful, a
 * `chance_of_playing_next_round`. Its own site turns those into the coloured corner on a
 * shirt and a sentence on hover, and nothing else — no percentage on the badge itself,
 * which is the one thing a manager actually decides on. This page prints the number.
 *
 * The letters, counted against the live bootstrap on 26 Aug: `a` available (494), `i`
 * injured (55), `u` unavailable (41, which is where a player who has left the league ends
 * up), `d` doubtful (21) and `s` suspended (1). Chance is 0 for everyone in the first
 * three, and 75, 50 or 25 for a doubt.
 */

const OUT_STATUSES = new Set(["i", "u", "s"]);

/** How the shirt is marked. `none` is the 494 players nobody needs to think about. */
export function flagOf(player: {
  status?: string;
  chance?: number | null;
}): PlayerFlag {
  const status = player.status ?? "a";
  const chance = player.chance ?? null;
  // A zero chance is out however it is spelt: injured, suspended, or gone to Paris.
  if (OUT_STATUSES.has(status) || chance === 0) return { level: "out", chance: 0 };
  if (status === "d" || (chance !== null && chance < 100)) {
    // 75 is the ordinary doubt and 25 is nearly a certainty the other way, so they are not
    // painted alike even though FPL's own site paints both of them yellow.
    return { level: chance !== null && chance <= 50 ? "major" : "doubt", chance };
  }
  return { level: "none", chance: null };
}

/**
 * The flag FPL does not raise.
 *
 * A player can be perfectly fit, unflagged, and not playing: out of favour, on the way out
 * of the club, or third choice behind two fit keepers. FPL's status only ever answers "can
 * he play", never "will he" — so a manager holding him sees a clean shirt every week until
 * the transfer goes through, which is exactly the case that costs a season.
 *
 * What is available to answer it is FPL's own `starts`, against the number of games his
 * club has actually played. No start in any of them, while FPL says he is available, is not
 * a prediction and is not dressed as one: it is a count, printed as a count. It is only
 * raised for a player in the manager's own starting eleven, because a bench player who does
 * not start for his club is the ordinary state of a bench player and not news.
 */
export function benchWatch(player: {
  status?: string;
  starts?: number;
  teamGames?: number;
  starter?: boolean;
}): { starts: number; games: number } | null {
  if ((player.status ?? "a") !== "a") return null;
  if (!player.starter) return null;
  const games = player.teamGames ?? 0;
  if (games < 1 || (player.starts ?? 0) > 0) return null;
  return { starts: 0, games };
}

/**
 * The order the news page reads in: the worst news first, and within a level the players
 * the league is most exposed to.
 *
 * League owners come before global ownership because that is the whole reason this page
 * exists rather than a link to FPL's own. A 40 %-owned striker nobody here holds is a fact;
 * a 3 %-owned keeper two of these seven squads are starting is a problem.
 */
const LEVEL_RANK: Record<PlayerFlag["level"], number> = { out: 0, major: 1, doubt: 2, none: 3 };

export function newsOrder(a: PlayerNews, b: PlayerNews): number {
  return LEVEL_RANK[flagOf(a).level] - LEVEL_RANK[flagOf(b).level]
    || b.owners.length - a.owners.length
    || b.ownership - a.ownership
    || a.name.localeCompare(b.name);
}

/** Whether this row says anything at all, which is what keeps 494 players off the page. */
export function isNewsworthy(player: PlayerNews): boolean {
  return flagOf(player).level !== "none" || Boolean(player.news);
}

/** The squad-card version, which has the manager's own eleven to consider as well. */
export function squadFlag(player: SquadPlayer): { flag: PlayerFlag; bench: { starts: number; games: number } | null } {
  return { flag: flagOf(player), bench: benchWatch(player) };
}
