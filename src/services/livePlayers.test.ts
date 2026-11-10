import { describe, expect, it } from "vitest";
import { demoData } from "../demoData";
import { livePlayerSelections } from "./highlights";
import { liveTeamGroups } from "./livePlayers";

describe("live FPL team grouping", () => {
  it("counts captain factors and bonus, keeps bench players visible, and skips upcoming players", () => {
    const base = demoData.managers[0].squad[0];
    const captain = { ...base, id: 901, name: "Captain", state: "live" as const, points: 4, bonus: 1, captain: true, starter: true };
    const bench = { ...captain, id: 902, name: "Bench", captain: false, starter: false, points: 8, bonus: 0 };
    const upcoming = { ...captain, id: 903, state: "upcoming" as const, captain: false };
    const managers = [{ ...demoData.managers[0], chip: "TC", squad: [captain, bench, upcoming] }, { ...demoData.managers[1], squad: [upcoming] }];
    const data = { ...demoData, managers };
    const selected = livePlayerSelections(managers);
    const groups = liveTeamGroups(data, selected, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(15);
    expect(groups[0].rows.map((row) => row.multiplier)).toEqual([3, 0]);
    expect(groups[0].rows[0].selection.color).toBe(selected.find((item) => item.label === "Captain")?.color);
    expect(liveTeamGroups({ ...data, managers: [{ ...managers[0], chip: "BB" }] }, selected, false)[0].total).toBe(18);
  });
});
