import { describe, expect, it } from "vitest";
import { compareSquads } from "./squadComparison";
import { demoData } from "../demoData";

describe("squad comparison", () => {
  const base = demoData.managers[0];
  const player = base.squad[0];
  const managers = [
    { ...base, id: 1, squad: [{ ...player, id: 10, starter: true }, { ...player, id: 20, starter: false }] },
    { ...base, id: 2, squad: [{ ...player, id: 10, starter: false }, { ...player, id: 30, starter: true }] },
    { ...base, id: 3, squad: [{ ...player, id: 10, starter: true }, { ...player, id: 20, starter: true }] },
  ];
  it("counts ownership across three squads by ID even when names are identical", () => {
    const rows = compareSquads(managers);
    expect(rows.map((row) => [row.player.id, row.picks.size])).toEqual([[10, 3], [20, 2], [30, 1]]);
    expect(rows[0].picks.get(2)?.starter).toBe(false);
  });
  it("filters each manager's published starters, not the first owner's status", () => {
    const rows = compareSquads(managers, true);
    expect(rows.find((row) => row.player.id === 10)?.picks.size).toBe(2);
    expect(rows.find((row) => row.player.id === 20)?.picks.size).toBe(1);
  });
  it("does not invent players for empty squads", () => {
    expect(compareSquads([{ ...base, squad: [] }])).toEqual([]);
  });
});
