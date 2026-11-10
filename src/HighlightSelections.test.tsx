import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoData } from "./demoData";
import { fitSelectionMarks, ManagerSelectionMarks } from "./HighlightSelections";
import { livePlayerSelections, selectionPoints } from "./services/highlights";

describe("live selection demo", () => {
  it("uses the same ongoing fixtures for every shared player", () => {
    expect(demoData.isPreview).toBe(false);
    expect(Date.parse(demoData.deadline)).toBeLessThan(Date.now());
    expect(demoData.fixtures?.filter((fixture) => fixture.status === "live")).toHaveLength(3);
    const liveClubs = new Set(demoData.fixtures?.filter((fixture) => fixture.status === "live").flatMap((fixture) => [fixture.home, fixture.away]));
    for (const manager of demoData.managers) for (const player of manager.squad) {
      expect(player.state === "live").toBe(liveClubs.has(player.club));
    }
  });

  it("demonstrates individual badges and the crowded live summary", () => {
    const selected = livePlayerSelections(demoData.managers);
    const counts = demoData.managers.map((manager) => {
      const { entries, total } = selectionPoints(manager, selected, true, true);
      const html = renderToStaticMarkup(<ManagerSelectionMarks selected={selected} manager={manager} language="fi" autosubs includeBench live />);
      expect(html).toContain(`= ${total}`);
      expect(html.includes('aria-label="' + (entries.length - 3) + ' muuta valittua pelaajaa"')).toBe(entries.length > 3);
      return entries.length;
    });
    expect(counts.some((count) => count > 3)).toBe(true);
    expect(counts.some((count) => count > 0 && count <= 3)).toBe(true);
  });
});


describe("two-line score badges", () => {
  it("keeps all badges when two lines have room including the total", () => {
    expect(fitSelectionMarks([18, 18, 18, 18, 18, 18], 112, 30, 40)).toBe(6);
  });
  it("reserves room for overflow and the total with many or wide captain badges", () => {
    const count = fitSelectionMarks(Array(12).fill(36), 112, 30, 40);
    expect(count).toBe(3);
    expect(fitSelectionMarks([36, 36, 36, 36], 80, 30, 40)).toBe(2);
  });
});


describe("live score order", () => {
  it("sorts visible scores including captain multipliers and raw bench scores only in live mode", () => {
    const base = demoData.managers[0].squad[0];
    const manager = { ...demoData.managers[0], chip: undefined, squad: [
      { ...base, id: 901, name: "Low", starter: true, captain: false, points: 3, bonus: 0 },
      { ...base, id: 902, name: "Captain", starter: true, captain: true, points: 4, bonus: 0 },
      { ...base, id: 903, name: "Bench", starter: false, captain: false, points: 9, bonus: 0 },
    ] };
    const selected = manager.squad.map((player) => ({ highlight: { kind: "player" as const, id: player.id }, label: player.name, color: "red" }));
    const render = (live: boolean) => renderToStaticMarkup(<ManagerSelectionMarks selected={selected} manager={manager} language="en" autosubs={false} includeBench live={live} />);
    const live = render(true);
    expect(live.indexOf('aria-label="Bench')).toBeLessThan(live.indexOf('aria-label="Captain'));
    expect(live.indexOf('aria-label="Captain')).toBeLessThan(live.indexOf('aria-label="Low'));
    const manual = render(false);
    expect(manual.indexOf('aria-label="Low')).toBeLessThan(manual.indexOf('aria-label="Captain'));
  });
});
