import type { PlayerFlag, PlayerNews } from "../types";

/**
 * Availability, as FPL states it.
 *
 * What FPL does not state — whether a fit, unflagged player is actually going to feature —
 * is not inferred here. It was, once, from his start count, and that was wrong twice over:
 * a player can come off the bench every week without starting, and last Saturday says
 * nothing about next Saturday. That question is answered by reported transfer rumours
 * instead, in `services/rumours.ts`, where every line has a source on it.
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
 * The order the news page reads in: the worst news first, and within a level the players
 * the league is most exposed to.
 *
 * League owners come before global ownership because that is the whole reason this page
 * exists rather than a link to FPL's own. A 40 %-owned striker nobody here holds is a fact;
 * a 3 %-owned keeper two of these seven squads are starting is a problem.
 */
const LEVEL_RANK: Record<PlayerFlag["level"], number> = { out: 0, major: 1, doubt: 2, none: 3 };

/**
 * `gone` is the set of players whose move has already gone through.
 *
 * They rank as `out` whatever FPL's flag says, because FPL's flag has not caught up yet —
 * that is the entire reason the transfer wire is read. Watkins was confirmed to Al Hilal and
 * sat 130th of 163 rows, below every 75 % knock, because his FPL status was still `a`. The
 * manager who owns him would never have scrolled that far.
 */
export function newsOrder(a: PlayerNews, b: PlayerNews, gone?: Set<number>): number {
  const level = (player: PlayerNews) => gone?.has(player.id) ? 0 : LEVEL_RANK[flagOf(player).level];
  return level(a) - level(b)
    || b.owners.length - a.owners.length
    || b.ownership - a.ownership
    || a.name.localeCompare(b.name);
}

/** Whether this row says anything at all, which is what keeps 494 players off the page. */
export function isNewsworthy(player: PlayerNews): boolean {
  return flagOf(player).level !== "none" || Boolean(player.news);
}


