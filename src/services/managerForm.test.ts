import { describe, expect, it } from "vitest";
import { demoData } from "../demoData";
import { managerFormComparison } from "./managerForm";
describe("matching form windows", () => {
  it("compares the same gameweeks and excludes incomplete histories", () => {
    const a = { ...demoData.managers[0], id: 1, formGameweeks: [4, 5], form: [50, 70] };
    const b = { ...a, id: 2, formGameweeks: [3, 4, 5], form: [100, 60, 60] };
    const c = { ...a, id: 3, formGameweeks: [5], form: [90] };
    const result = managerFormComparison(a, [a, b, c]);
    expect(result.rows.map((row) => row.total)).toEqual([120, 120]);
    expect(result.average).toBe(60);
  });
});
