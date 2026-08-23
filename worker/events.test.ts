import { describe, expect, it } from "vitest";
import { eventsForPlayer, isLive } from "./events";

// goals, assists, own goals, yellow, red, pen saved, pen missed, bonus, defcon, saves, points
const counters = (over: Partial<Record<number, number>> = {}) => {
  const base = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const [index, value] of Object.entries(over)) base[Number(index)] = value as number;
  return base;
};

const fixture = (over: Partial<{ started: boolean; finished_provisional: boolean }> = {}) => ({
  id: 1, event: 1, team_h: 1, team_a: 2, team_h_score: 0, team_a_score: 0, minutes: 0,
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
    expect(eventsForPlayer(counters(), counters({ 0: 1, 1: 1, 8: 1, 10: 12 })))
      .toEqual([{ kind: "goal", value: 1 }, { kind: "assist", value: 1 }, { kind: "defcon", value: 1 }]);
  });

  it("is live while a match is running, and for half an hour after the last one", () => {
    const now = Date.parse("2026-08-23T21:00:00Z");
    expect(isLive([fixture()], undefined, now)).toBe(true);
    expect(isLive([fixture({ finished_provisional: true })], undefined, now)).toBe(false);
    expect(isLive([fixture({ finished_provisional: true })], "2026-08-23T20:45:00Z", now)).toBe(true);
    expect(isLive([fixture({ finished_provisional: true })], "2026-08-23T20:15:00Z", now)).toBe(false);
    expect(isLive([fixture({ started: false })], undefined, now)).toBe(false);
  });
});
