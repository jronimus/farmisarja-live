import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Ticker from "./Ticker";
import { demoData } from "./demoData";
import type { DashboardData, Language, ManagerRow } from "./types";

const benchPlayer = { ...demoData.managers[0].squad[0], id: 9001, name: "Cherki", starter: false, captain: false, viceCaptain: false, squadPosition: 12 };
const manager = { ...demoData.managers[0], teamName: "Karjarannan Hurjat", squad: [benchPlayer], chip: undefined };
const data: DashboardData = {
  ...demoData,
  managers: [manager],
  feed: [{ id: "cherki-goal", at: "2026-11-07T18:00:00Z", gameweek: 10, element: benchPlayer.id, player: "Cherki", club: "MCI", kind: "goal", value: 1, pointsDelta: 5, points: 5 }],
};
const render = (managers: ManagerRow[] = [manager], autosubs = false, language: Language = "fi") =>
  renderToStaticMarkup(<Ticker data={{ ...data, managers }} language={language} autosubs={autosubs} />);

describe("ticker bench ownership", () => {
  it("keeps the team name and marks points that stay on its bench", () => {
    const html = render();
    expect(html).toContain("Karjarannan Hurjat");
    expect(html).toContain('class="ticker-bench"');
    expect(html).toContain('aria-label="Penkillä"');
    expect(html).not.toContain(">Penkillä<");
    expect(html).toContain("ei pisteitä joukkueelle");
    expect(html).toContain("+5");
  });

  it("translates the visible marker and explanation", () => {
    const html = render([manager], false, "en");
    expect(html).toContain("Bench");
    expect(html).not.toContain(">Bench<");
    expect(html).toContain("not counted in team points");
    expect(html).not.toContain("Penkillä");
  });

  it("does not mark starters or a Bench Boost owner's points as benched", () => {
    expect(render([{ ...manager, squad: [{ ...benchPlayer, starter: true }] }])).not.toContain('class="ticker-bench"');
    expect(render([{ ...manager, chip: "BB" }], true)).not.toContain('class="ticker-bench"');
  });

  it("removes the marker when an automatic substitution brings the player in", () => {
    const squad: ManagerRow["squad"] = [
      { ...benchPlayer, id: 9002, position: "GK", starter: true, squadPosition: 1, state: "finished", fixtures: undefined, minutes: 0 },
      { ...benchPlayer, position: "GK", state: "live", fixtures: undefined, minutes: 60 },
    ];
    expect(render([{ ...manager, squad }], false)).toContain('class="ticker-bench"');
    expect(render([{ ...manager, squad }], true)).not.toContain('class="ticker-bench"');
  });
});
