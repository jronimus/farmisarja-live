import { describe, expect, it } from "vitest";
import { compareSquads, comparisonManagers } from "./squadComparison";
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
  it("compares the live eleven, restores late appearances and honours the table's autosub switch", () => {
    const squad = Array.from({ length: 15 }, (_, i) => ({ ...player, id: i + 1, squadPosition: i + 1,
      position: (i === 0 || i === 11 ? "GK" : i < 4 ? "DEF" : i < 9 || i === 12 ? "MID" : "FWD") as typeof player.position,
      starter: i < 11, state: "upcoming" as const, minutes: 0, captain: i === 8, viceCaptain: i === 9 }));
    squad[8] = { ...squad[8], state: "live" as typeof squad[number]["state"] };
    const manager = { ...base, squad };
    const effective = comparisonManagers([manager], true);
    const rows = compareSquads(effective, true);
    expect(rows.some((row) => row.player.id === 9)).toBe(false);
    expect(rows.some((row) => row.player.id === 13)).toBe(true);
    expect(rows.find((row) => row.player.id === 10)?.picks.get(base.id)?.captain).toBe(true);
    expect(manager.squad[8].starter).toBe(true);
    expect(compareSquads(comparisonManagers([manager], false), true).some((row) => row.player.id === 9)).toBe(true);
    squad[8].minutes = 1;
    const restored = compareSquads(comparisonManagers([manager], true), true);
    expect(restored.find((row) => row.player.id === 9)?.player.captain).toBe(true);
    expect(restored.some((row) => row.player.id === 13)).toBe(false);
  });
});
