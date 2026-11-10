import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MatchCentre, { MatchDetails } from "./MatchCentre";
import { demoData } from "./demoData";
import type { GameweekFixture } from "./types";
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
beforeEach(() => vi.stubGlobal("document", { querySelector: () => null, body: {} }));
afterEach(() => vi.unstubAllGlobals());
const fixture: GameweekFixture = { id: 500, home: "EVE", away: "COV", homeName: "Everton", awayName: "Coventry City", homeScore: 3, awayScore: 1, kickoff: "2026-11-06T20:00:00Z", minutes: 90, status: "provisional", stats: [{ key: "bonus", entries: [{ id: 55, photoCode: 123456, name: "Barry", club: "EVE", value: 3 }] }] };
const player = { ...demoData.managers[0].squad[0], id: 55, name: "Barry", club: "EVE", photoCode: 123456 };
const data = { ...demoData, fixtures: [fixture], players: [player], managers: [{ ...demoData.managers[0], squad: [player] }] };
const render = (over: Partial<GameweekFixture> = {}, language: "fi" | "en" = "fi") => renderToStaticMarkup(<MatchDetails fixture={{ ...fixture, ...over }} data={data} language={language} autosubs={false} onClose={() => {}} onPlayer={() => {}} />);

describe("match centre", () => {
  it("offers an anchored menu trigger rather than opening a dialog on first render", () => {
    const html = renderToStaticMarkup(<MatchCentre fixtures={[fixture]} played={1} data={data} language="fi" autosubs={false} onPlayer={() => {}} />);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="dialog"');
  });
  it("shows the result, club names, published bonus and a real player portrait", () => {
    const html = render();
    expect(html).toContain("Everton");
    expect(html).toContain("Coventry City");
    expect(html).toContain("3 : 1");
    expect(html).toContain("123456.png");
    expect(html).toContain('aria-label="Barry: pelaajatiedot"');
    expect(html).toContain("Bonuspisteet");
    expect(html).toMatch(/class="match-stat-value bonus[^"]*">3<\/strong>/);
    expect(html).toContain(data.managers[0].teamName);
  });
  it("shows an upcoming kickoff without inventing a 0–0 score or live statistics", () => {
    const html = render({ status: "upcoming", homeScore: null, awayScore: null, stats: undefined });
    expect(html).toContain("VS");
    expect(html).toContain("Ottelu ei ole vielä alkanut");
    expect(html).not.toContain("0 : 0");
    expect(html).not.toContain("Mukana livebonukset");
    expect(html).not.toContain('class="match-stat-grid"');
  });
  it("distinguishes live play, confirmed results, card colour and defensive thresholds", () => {
    const stats: GameweekFixture["stats"] = [{ key: "defCon", entries: [{ name: "Defender", club: "EVE", position: "DEF", value: 10 }] }, { key: "cards", entries: [{ name: "Card", club: "COV", variant: "red", value: 1 }] }];
    const html = render({ status: "live", minutes: 64, stats }, "en");
    expect(html).toContain("LIVE · 64′");
    expect(html).toMatch(/class="match-stat-value[^"]*defcon/);
    expect(html).toContain('aria-label="Red card"');
    expect(render({ status: "final" }, "en")).toContain("Points confirmed");
  });
  it("shows distinct starter, captain, triple captain and bench ownership with live points", () => {
    const squadPlayer = { ...player, starter: true, captain: false, points: 5, bonus: 2 };
    const managers = [
      { ...data.managers[0], id: 1, teamName: "Starter team", chip: undefined, squad: [squadPlayer] },
      { ...data.managers[0], id: 2, teamName: "Captain team", chip: undefined, squad: [{ ...squadPlayer, captain: true }] },
      { ...data.managers[0], id: 3, teamName: "Triple team", chip: "TC" as const, squad: [{ ...squadPlayer, captain: true }] },
      { ...data.managers[0], id: 4, teamName: "Bench team", chip: undefined, squad: [{ ...squadPlayer, starter: false }] },
    ];
    const html = renderToStaticMarkup(<MatchDetails fixture={fixture} data={{ ...data, players: [squadPlayer], managers }} language="fi" autosubs={false} onClose={() => {}} onPlayer={() => {}} />);
    for (const role of ["starter", "captain", "triple", "bench"]) expect(html).toContain(`class="match-owner is-${role}"`);
    expect(html).toContain("Triplakapteeni");
    expect(html).toContain('aria-label="Penkillä"');
    expect(html).not.toContain(">Penkillä<");
    expect(html).toContain('aria-label="Pisteet: 7"');
    expect(html).toContain('lucide-armchair');
  });
  it("can retain the match view hidden while player details are open", () => {
    const html = renderToStaticMarkup(<MatchDetails fixture={fixture} data={data} language="fi" autosubs={false} suspended onClose={() => {}} onPlayer={() => {}} />);
    expect(html).toContain('match-details-overlay" hidden=""');
    expect(html).toContain("Everton");
  });
});
