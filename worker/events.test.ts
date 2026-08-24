import { describe, expect, it } from "vitest";
import { eventsForPlayer, isLive, repairEvents } from "./events";
import type { FeedEvent } from "./events";

// goals, assists, own goals, yellow, red, pen saved, pen missed, bonus, defcon, saves, points
const counters = (over: Partial<Record<number, number>> = {}) => {
  const base = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const [index, value] of Object.entries(over)) base[Number(index)] = value as number;
  return base;
};

const fixture = (over: Partial<{ started: boolean; finished_provisional: boolean; kickoff_time: string }> = {}) => ({
  id: 1, event: 1, kickoff_time: "2026-08-23T19:00:00Z", team_h: 1, team_a: 2,
  team_h_score: 0, team_a_score: 0, minutes: 0,
  started: true, finished: false, finished_provisional: false, ...over,
});

describe("live feed", () => {
  it("reports a goal once, and reports the second as the second", () => {
    expect(eventsForPlayer(counters(), counters({ 0: 1, 10: 6 })))
      .toEqual([{ kind: "goal", value: 1, previous: 0, stat: "goals_scored" }]);
    expect(eventsForPlayer(counters({ 0: 1, 10: 6 }), counters({ 0: 2, 10: 12 })))
      .toEqual([{ kind: "goal", value: 2, previous: 1, stat: "goals_scored" }]);
    expect(eventsForPlayer(counters({ 0: 2 }), counters({ 0: 2 }))).toEqual([]);
  });

  it("treats a player it has never seen as having done nothing yet", () => {
    expect(eventsForPlayer(undefined, counters({ 3: 1 }))).toEqual([{ kind: "yellow", value: 1, previous: 0, stat: "yellow_cards" }]);
  });

  it("reports the save point rather than every save", () => {
    expect(eventsForPlayer(counters({ 9: 1 }), counters({ 9: 2 }))).toEqual([]);
    expect(eventsForPlayer(counters({ 9: 2 }), counters({ 9: 3 }))).toEqual([{ kind: "save_point", value: 1, previous: 0, stat: "saves" }]);
    expect(eventsForPlayer(counters({ 9: 5 }), counters({ 9: 6 }))).toEqual([{ kind: "save_point", value: 2, previous: 1, stat: "saves" }]);
  });

  it("never reports a counter going backwards", () => {
    // A goal coming off the board is a correction, not an event.
    expect(eventsForPlayer(counters({ 0: 2 }), counters({ 0: 1 }))).toEqual([]);
  });

  /**
   * Bonus is the exception: three, two and one go to the top three of the bonus points
   * system, and a player is promoted and demoted between those places while the match
   * runs. A bare "+2" after a bare "+3" reads as five gained, and a demotion reads as a
   * gain, so a bonus line carries the place it came from as well as the one it took.
   */
  it("reports a bonus as the move between places, in both directions", () => {
    expect(eventsForPlayer(counters({ 7: 2 }), counters({ 7: 3 })))
      .toEqual([{ kind: "bonus", value: 3, previous: 2, stat: "bonus" }]);
    expect(eventsForPlayer(counters({ 7: 3 }), counters({ 7: 2 })))
      .toEqual([{ kind: "bonus", value: 2, previous: 3, stat: "bonus" }]);
    // Losing it altogether is a move too.
    expect(eventsForPlayer(counters({ 7: 1 }), counters({ 7: 0 })))
      .toEqual([{ kind: "bonus", value: 0, previous: 1, stat: "bonus" }]);
    expect(eventsForPlayer(counters({ 7: 3 }), counters({ 7: 3 }))).toEqual([]);
  });

  it("reports everything that changed on the same tick", () => {
    expect(eventsForPlayer(counters(), counters({ 0: 1, 1: 1, 10: 12 }), 3))
      .toEqual([{ kind: "goal", value: 1, previous: 0, stat: "goals_scored" }, { kind: "assist", value: 1, previous: 0, stat: "assists" }]);
  });

  /**
   * The counter runs up several times a minute for half the pitch, so reporting every
   * increment buried the goals under it. The two points land once, at 10 for a defender
   * and 12 for anyone else.
   */
  it("reports a defensive contribution when it buys the points, not on every tackle", () => {
    expect(eventsForPlayer(counters({ 8: 6 }), counters({ 8: 7 }), 2)).toEqual([]);
    expect(eventsForPlayer(counters({ 8: 9 }), counters({ 8: 10 }), 2))
      .toEqual([{ kind: "defcon", value: 10, previous: 9, stat: "defensive_contribution" }]);
    // Past it, it never fires again: the points do not stack.
    expect(eventsForPlayer(counters({ 8: 10 }), counters({ 8: 14 }), 2)).toEqual([]);
  });

  it("holds a midfielder to twelve, and never scores it for a keeper", () => {
    expect(eventsForPlayer(counters({ 8: 9 }), counters({ 8: 10 }), 3)).toEqual([]);
    expect(eventsForPlayer(counters({ 8: 11 }), counters({ 8: 12 }), 3))
      .toEqual([{ kind: "defcon", value: 12, previous: 11, stat: "defensive_contribution" }]);
    expect(eventsForPlayer(counters({ 8: 19 }), counters({ 8: 20 }), 1)).toEqual([]);
  });

  it("is live while a match is running, and for half an hour after the last one", () => {
    const now = Date.parse("2026-08-23T21:00:00Z");
    expect(isLive([fixture()], undefined, now)).toBe(true);
    expect(isLive([fixture({ finished_provisional: true })], undefined, now)).toBe(false);
    expect(isLive([fixture({ finished_provisional: true })], "2026-08-23T20:45:00Z", now)).toBe(true);
    expect(isLive([fixture({ finished_provisional: true })], "2026-08-23T20:15:00Z", now)).toBe(false);
    expect(isLive([fixture({ started: false, kickoff_time: "2026-08-24T19:00:00Z" })], undefined, now)).toBe(false);
  });

  /** Without a baseline laid before the whistle, the first tick swallows the opening goal. */
  it("wakes shortly before a kick-off to lay the baseline", () => {
    const now = Date.parse("2026-08-23T21:00:00Z");
    const soon = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
    expect(isLive([fixture({ started: false, kickoff_time: soon(5) })], undefined, now)).toBe(true);
    expect(isLive([fixture({ started: false, kickoff_time: soon(30) })], undefined, now)).toBe(false);
  });

  /**
   * The lines written before a line carried its own worth stored the player's whole gain on
   * the tick, so a goal and the bonus beside it both read the same figure.
   */
  it("prices old lines from what FPL says each stat is worth", () => {
    const live = [{
      id: 7,
      stats: { minutes: 90, goals_scored: 1, assists: 0, own_goals: 0, yellow_cards: 0,
        red_cards: 0, penalties_saved: 0, penalties_missed: 0, bonus: 3,
        defensive_contribution: 12, saves: 0, total_points: 12 },
      explain: [{ fixture: 1, stats: [
        { identifier: "goals_scored", points: 5 },
        { identifier: "bonus", points: 3 },
        { identifier: "defensive_contribution", points: 2 },
      ] }],
    }];
    const at = (m: string) => `2026-08-24T19:${m}:00.000Z`;
    const line = (over: Partial<FeedEvent>): FeedEvent => ({
      id: "x", at: at("30"), gameweek: 1, element: 7, player: "Rogers", club: "AVL",
      clubName: "Aston Villa", kind: "goal", value: 1, pointsDelta: 12, points: 12, ...over,
    });
    const events = [
      line({ kind: "bonus", value: 3, at: at("46"), pointsDelta: 12 }),
      line({ kind: "bonus", value: 1, at: at("40"), pointsDelta: 12 }),
      line({ kind: "goal", value: 1, at: at("30"), pointsDelta: 12 }),
      line({ kind: "defcon", value: 12, at: at("30"), pointsDelta: 12 }),
    ];
    repairEvents(events, live as never);
    // The goal is worth its own five, not the twelve the player had by then.
    expect(events.find((e) => e.kind === "goal")!.pointsDelta).toBe(5);
    // Two points, whole: it lands once and is not divided by the tackles behind it.
    expect(events.find((e) => e.kind === "defcon")!.pointsDelta).toBe(2);
    // First to third place is worth one, then two more.
    const bonus = events.filter((e) => e.kind === "bonus").sort((a, b) => a.at.localeCompare(b.at));
    expect(bonus.map((e) => [e.previous, e.value, e.pointsDelta])).toEqual([[0, 1, 1], [1, 3, 2]]);
  });

  /**
   * A fall emitted nothing at all before, so two players could both stand at three bonus in
   * the log. The move cannot be read out of a log that never held it, but the place the
   * player actually holds is in the live data.
   */
  it("winds a stored bonus back to the last one reported, so the next tick reports the fall", () => {
    const live = [{
      id: 7,
      stats: { minutes: 90, goals_scored: 0, assists: 0, own_goals: 0, yellow_cards: 0,
        red_cards: 0, penalties_saved: 0, penalties_missed: 0, bonus: 2,
        defensive_contribution: 0, saves: 0, total_points: 4 },
      explain: [{ fixture: 1, stats: [{ identifier: "bonus", points: 2 }] }],
    }];
    const events: FeedEvent[] = [{
      id: "x", at: "2026-08-24T19:32:00.000Z", gameweek: 1, element: 7, player: "João Pedro",
      club: "CHE", clubName: "Chelsea", kind: "bonus", value: 3, pointsDelta: 3, points: 4,
    }];
    // bonus sits at index 7 of the watched counters.
    const snapshot = { 7: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4] };
    const points = { 7: [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4] };
    repairEvents(events, live as never, snapshot, points);
    // He was last reported at three, so that is where the diff must start from again.
    expect(snapshot[7][7]).toBe(3);
    expect(points[7][7]).toBe(3);
    // Which leaves the ordinary diff to report three going to two, worth minus one.
    expect(eventsForPlayer(snapshot[7], [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 4]))
      .toEqual([{ kind: "bonus", value: 2, previous: 3, stat: "bonus" }]);
  });
});