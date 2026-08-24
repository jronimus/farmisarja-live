import { describe, expect, it } from "vitest";
import { eventsForPlayer, isLive } from "./events";

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
      .toEqual([{ kind: "goal", value: 1 }]);
    expect(eventsForPlayer(counters({ 0: 1, 10: 6 }), counters({ 0: 2, 10: 12 })))
      .toEqual([{ kind: "goal", value: 2 }]);
    expect(eventsForPlayer(counters({ 0: 2 }), counters({ 0: 2 }))).toEqual([]);
  });

  it("treats a player it has never seen as having done nothing yet", () => {
    expect(eventsForPlayer(undefined, counters({ 3: 1 }))).toEqual([{ kind: "yellow", value: 1 }]);
  });

  it("reports the save point rather than every save", () => {
    expect(eventsForPlayer(counters({ 9: 1 }), counters({ 9: 2 }))).toEqual([]);
    expect(eventsForPlayer(counters({ 9: 2 }), counters({ 9: 3 }))).toEqual([{ kind: "save_point", value: 1 }]);
    expect(eventsForPlayer(counters({ 9: 5 }), counters({ 9: 6 }))).toEqual([{ kind: "save_point", value: 2 }]);
  });

  it("never reports a counter going backwards, which is what a bonus recalculation does", () => {
    expect(eventsForPlayer(counters({ 7: 3 }), counters({ 7: 1 }))).toEqual([]);
    expect(eventsForPlayer(counters({ 7: 1 }), counters({ 7: 3 }))).toEqual([{ kind: "bonus", value: 3 }]);
  });

  it("reports everything that changed on the same tick", () => {
    expect(eventsForPlayer(counters(), counters({ 0: 1, 1: 1, 10: 12 }), 3))
      .toEqual([{ kind: "goal", value: 1 }, { kind: "assist", value: 1 }]);
  });

  /**
   * The counter runs up several times a minute for half the pitch, so reporting every
   * increment buried the goals under it. The two points land once, at 10 for a defender
   * and 12 for anyone else.
   */
  it("reports a defensive contribution when it buys the points, not on every tackle", () => {
    expect(eventsForPlayer(counters({ 8: 6 }), counters({ 8: 7 }), 2)).toEqual([]);
    expect(eventsForPlayer(counters({ 8: 9 }), counters({ 8: 10 }), 2))
      .toEqual([{ kind: "defcon", value: 10 }]);
    // Past it, it never fires again: the points do not stack.
    expect(eventsForPlayer(counters({ 8: 10 }), counters({ 8: 14 }), 2)).toEqual([]);
  });

  it("holds a midfielder to twelve, and never scores it for a keeper", () => {
    expect(eventsForPlayer(counters({ 8: 9 }), counters({ 8: 10 }), 3)).toEqual([]);
    expect(eventsForPlayer(counters({ 8: 11 }), counters({ 8: 12 }), 3))
      .toEqual([{ kind: "defcon", value: 12 }]);
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
});
