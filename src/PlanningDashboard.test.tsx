import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlanningDashboard from "./PlanningDashboard";
import { createPlanningDemo, planningDemoArticles } from "./planningDemo";

describe("planning dashboard", () => {
  it("renders shared table content, positional leaders, and the price preview", () => {
    const data = createPlanningDemo();
    const html = renderToStaticMarkup(<PlanningDashboard data={data} language="fi" demoArticles={planningDemoArticles} onForm={() => {}} onPlayer={() => {}} onCompare={() => {}} table={<div className="league-table" />} toolbar={<div>GW 25</div>} period="total" onPeriod={() => {}} sort="position" onSort={() => {}} />);
    expect(html).toContain("GW 25");
    expect(html).toContain("Uusimmat uutiset");
    expect(html).toContain("Maalivahdit");
    expect(html).toContain("Yön hintaennuste");
    expect(html).toContain("FPL %");
    expect(html).not.toContain("GW-pisteet");
    expect(html).not.toContain("Kapteeni");
    expect(html).not.toContain("Pelattu");
    expect(html).toContain("league-table");
    expect(html).toContain("planning-carousel-clock");
    expect(data.managers).toHaveLength(7);
  });
});
