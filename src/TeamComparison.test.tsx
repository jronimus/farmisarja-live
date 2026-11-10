import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TeamComparison from "./TeamComparison";
import { createPlanningDemo } from "./planningDemo";
import { demoData } from "./demoData";
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
beforeEach(() => vi.stubGlobal("document", { querySelector: () => null, body: {} }));
afterEach(() => vi.unstubAllGlobals());
describe("shared team comparison", () => {
  it("opens squads first inside a single dialog, with results in a second tab", () => {
    const html = renderToStaticMarkup(<TeamComparison data={demoData} language="fi" autosubs onClose={() => {}} onPlayer={() => {}} />);
    expect(html).toContain('id="team-squads-panel"');
    expect(html).not.toContain('id="team-squads-panel" hidden');
    expect(html).toContain('id="team-results-panel" hidden=""');
    expect(html.match(/role="dialog"/g)).toHaveLength(1);
    expect(html).toContain("Kokoonpanot");
    expect(html).toContain("Tulokset");
    expect(html).not.toContain('class="comparison-modal-footer"');
    expect(html).not.toContain("Nettopisteet sisältävät siirtomiinukset.");
  });
  it("opens results for planning and includes the fixture comparison without changing the dialog", () => {
    const html = renderToStaticMarkup(<TeamComparison data={createPlanningDemo()} language="fi" autosubs demo initialTab="results" onClose={() => {}} onPlayer={() => {}} />);
    expect(html).toContain('id="team-squads-panel" hidden=""');
    expect(html).not.toContain('id="team-results-panel" hidden');
    expect(html).toContain("Tulevat ottelut");
    expect(html).toContain("future-player-fixtures");
    expect(html).toContain("fdr-2");
  });

});
