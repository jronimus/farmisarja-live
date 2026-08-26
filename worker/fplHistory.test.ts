import { describe, expect, it } from "vitest";
import { FIELDS, difference, settledGameweek, snapshotFrom, sum } from "./fplHistory";

const element = (id: number, over: Record<string, unknown> = {}) => ({
  id, total_points: 0, minutes: 0, goals_scored: 0, expected_goals: "0.00", ...over,
});

const goals = FIELDS.indexOf("goals_scored");
const points = FIELDS.indexOf("total_points");
const xg = FIELDS.indexOf("expected_goals");

describe("snapshots of FPL's season totals", () => {
  it("reads the numbers FPL sends as strings", () => {
    const snapshot = snapshotFrom([element(1, { total_points: 12, expected_goals: "1.85" })], 1, "2026-08-26T20:00:00Z");
    expect(snapshot.rows[0][0]).toBe(1);
    expect(snapshot.rows[0][1 + points]).toBe(12);
    expect(snapshot.rows[0][1 + xg]).toBe(1.85);
    // A field FPL has not sent is a zero, not a NaN that poisons every sum after it.
    expect(snapshot.rows[0].every((value) => Number.isFinite(value))).toBe(true);
  });

  it("takes the last gameweek FPL has both finished and checked", () => {
    expect(settledGameweek([
      { id: 1, finished: true, data_checked: true },
      // Finished but not checked: the totals are still moving, so it is not a line yet.
      { id: 2, finished: true, data_checked: false },
      { id: 3, finished: false, data_checked: false },
    ])).toBe(1);
    expect(settledGameweek([{ id: 1, finished: false, data_checked: false }])).toBe(0);
  });
});

describe("one gameweek out of two snapshots", () => {
  const after = (over: Record<string, unknown>) => snapshotFrom([element(1, over)], 2, "2026-09-01T20:00:00Z");
  const before = snapshotFrom([element(1, { total_points: 12, goals_scored: 2, expected_goals: "1.85" })], 1, "2026-08-26T20:00:00Z");

  it("is the difference between them", () => {
    const week = difference(before, after({ total_points: 20, goals_scored: 3, expected_goals: "2.60" }));
    expect(week.get(1)![points]).toBe(8);
    expect(week.get(1)![goals]).toBe(1);
    // 2.60 − 1.85 in floating point is 0.7500000000000002.
    expect(week.get(1)![xg]).toBe(0.75);
  });

  it("gives the first snapshot its own figures", () => {
    // Taken in the window where nothing had been added to the totals since the gameweek
    // ended, so the totals are that gameweek's own line.
    expect(difference(null, after({ total_points: 12, goals_scored: 2 })).get(1)![points]).toBe(12);
  });

  it("clamps a correction rather than printing a negative gameweek", () => {
    // FPL does take a bonus point or an assist back off a player after the fact.
    expect(difference(before, after({ total_points: 10, goals_scored: 2 })).get(1)![points]).toBe(0);
  });

  it("treats a player who was not there before as new", () => {
    const arrived = snapshotFrom([element(9, { total_points: 6 })], 2, "2026-09-01T20:00:00Z");
    expect(difference(before, arrived).get(9)![points]).toBe(6);
    // And one who has left the game has no line for a gameweek he was not in.
    expect(difference(before, arrived).has(1)).toBe(false);
  });
});

describe("several gameweeks", () => {
  it("adds them up", () => {
    const one = new Map([[1, [3, 0.5]], [2, [1, 0.2]]]);
    const two = new Map([[1, [4, 0.25]], [3, [7, 1]]]);
    const total = sum([one, two]);
    expect(total.get(1)).toEqual([7, 0.75]);
    expect(total.get(2)).toEqual([1, 0.2]);
    expect(total.get(3)).toEqual([7, 1]);
  });

  it("does not let the source maps be mutated by the sum", () => {
    const one = new Map([[1, [3]]]);
    sum([one, new Map([[1, [4]]])]);
    expect(one.get(1)).toEqual([3]);
  });
});
