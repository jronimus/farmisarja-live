import { describe, expect, it } from "vitest";
import { highlightKey, selectionPoints, toggleHighlight, type HighlightSelection } from "./highlights";
import { demoData } from "../demoData";
describe("multiple highlight selection", () => {
  it("toggles individual players without clearing other selections or changing their colors", () => {
    let selected = toggleHighlight([], { kind: "player", id: 1 }, "One");
    selected = toggleHighlight(selected, { kind: "player", id: 2 }, "Two");
    const secondColor = selected[1].color;
    selected = toggleHighlight(selected, { kind: "player", id: 1 }, "One");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ color: secondColor, label: "Two" });
    selected = toggleHighlight(selected, { kind: "player", id: 3 }, "Three");
    expect(selected[0].color).toBe(secondColor);
    expect(selected[1].color).not.toBe(secondColor);
    expect(toggleHighlight(selected, null, "")).toEqual([]);
  });
  it("supports more selections than the base palette without duplicate colors", () => {
    let selected: HighlightSelection[] = [];
    for (let id = 0; id < 14; id++) selected = toggleHighlight(selected, { kind: "player", id }, String(id));
    expect(new Set(selected.map((item) => item.color)).size).toBe(14);
    expect(highlightKey({ kind: "club", club: "ARS" })).toBe("club:ARS");
  });
  it("counts live bonus and captain factors in the total while retaining raw bench points", () => {
    const captain = { ...demoData.managers[0].squad[0], id: 1, starter: true, captain: true, points: 4, bonus: 1 };
    const bench = { ...captain, id: 2, starter: false, captain: false, points: 9, bonus: 0 };
    const manager = { ...demoData.managers[0], chip: undefined, squad: [captain, bench] };
    const selected = [1, 2].map((id) => ({ highlight: { kind: "player" as const, id }, color: "blue", label: String(id) }));
    const result = selectionPoints(manager, selected, false, true);
    expect(result.total).toBe(10);
    expect(result.entries[1]).toMatchObject({ points: 0, raw: 9, benched: true });
    expect(selectionPoints({ ...manager, chip: "TC" }, selected, false, true).total).toBe(15);
    expect(selectionPoints({ ...manager, chip: "BB" }, selected, false, true).total).toBe(19);
    expect(selectionPoints(manager, selected, false, false).entries).toHaveLength(1);
  });
  it("does not count the same player twice through a player and a club selection", () => {
    const player = { ...demoData.managers[0].squad[0], id: 1, club: "ARS", starter: true, captain: false, points: 6, bonus: 0 };
    const selected: HighlightSelection[] = [{ highlight: { kind: "player", id: 1 }, color: "blue", label: "P1" }, { highlight: { kind: "club", club: "ARS" }, color: "red", label: "ARS" }];
    expect(selectionPoints({ ...demoData.managers[0], squad: [player] }, selected, false, true).total).toBe(6);
  });
});
