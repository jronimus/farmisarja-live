import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlayerModal from "./PlayerModal";
import PriceSummaryModal from "./PriceSummaryModal";
import PlayerComparison from "./PlayerComparison";
import { demoData } from "./demoData";
import type { PlayerStat } from "./types";

vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
beforeEach(() => vi.stubGlobal("document", { querySelector: () => null, body: {} }));
afterEach(() => vi.unstubAllGlobals());

describe("player details and comparison entry points", () => {
  it("opens an unowned player's season modal with a compare button", () => {
    const player = { ...demoData.managers[0].squad[0], id: 999999, name: "Unowned test", captain: false };
    const data = { ...demoData, players: [player], playerStats: [{ id: player.id, totalPoints: 123 }] as PlayerStat[] };
    const html = renderToStaticMarkup(<PlayerModal data={data} selection={{ id: player.id }} language="fi" autosubs={false} onCompare={() => {}} onClose={() => {}} />);
    expect(html).toContain('id="player-modal-title">Unowned test');
    expect(html).toContain("Kauden tilastot");
    expect(html).toContain("123");
    expect(html).toContain('aria-label="Vertaa pelaajia"');
  });
  it("preserves a squad player's captain multiplier", () => {
    const manager = demoData.managers[0];
    const player = { ...manager.squad[0], points: 5, bonus: 1, captain: true };
    const data = { ...demoData, managers: [{ ...manager, chip: "TC", squad: [player] }] };
    const html = renderToStaticMarkup(<PlayerModal data={data} selection={{ id: player.id, managerId: manager.id }} language="en" autosubs={false} onCompare={() => {}} onClose={() => {}} />);
    expect(html).toContain("Triple captain");
    expect(html).toContain("<strong>18</strong>");
  });
  it("renders available round statistics without inventing missing fields or multiplying them", () => {
    const manager = demoData.managers[0];
    const player = { ...manager.squad[0], captain: true, liveStats: { bps: 26, tackles: 0, defensive_contribution: 8, expected_goals: "0.37" } };
    const data = { ...demoData, managers: [{ ...manager, chip: "TC", squad: [player] }] };
    const html = renderToStaticMarkup(<PlayerModal data={data} selection={{ id: player.id, managerId: manager.id }} language="en" autosubs={false} onCompare={() => {}} onClose={() => {}} />);
    expect(html).toContain("Gameweek match stats");
    expect(html).toContain("BPS</th><td>26</td>");
    expect(html).toContain("Tackles</th><td>0</td>");
    expect(html).toContain("Expected goals · xG</th><td>0.37</td>");
    expect(html).not.toContain("Expected assists · xA</th>");
    expect(html).toContain("summed across double gameweeks");
  });
  it("labels the defensive total and omits goalkeeper saves for outfield players", () => {
    const manager = demoData.managers[0];
    const player = { ...manager.squad[0], position: "DEF" as const, liveStats: { defensive_contribution: 12, recoveries: 5, saves: 0 } };
    const data = { ...demoData, managers: [{ ...manager, squad: [player] }] };
    const html = renderToStaticMarkup(<PlayerModal data={data} selection={{ id: player.id, managerId: manager.id }} language="en" autosubs={false} onCompare={() => {}} onClose={() => {}} />);
    expect(html).toContain("Total defensive contribution");
    expect(html).toContain("Recoveries are excluded for defenders");
    expect(html).not.toContain("Saves</th>");
  });

  it("shows every owner including the squad used to open the player", () => {
    const manager = demoData.managers[0];
    const player = { ...manager.squad[0], captain: true, state: "upcoming" as const, minutes: 0, points: 0, bonus: 0, club: "LIV", pointBreakdown: [] };
    const data = { ...demoData, fixtures: [{ id: 987, home: "CRY", away: "LIV", homeScore: null, awayScore: null, minutes: 0, status: "upcoming" as const, kickoff: "2026-11-07T15:00:00Z" }], managers: [{ ...manager, chip: undefined, squad: [player] }] };
    const html = renderToStaticMarkup(<PlayerModal data={data} selection={{ id: player.id, managerId: manager.id }} language="fi" autosubs={false} onCompare={() => {}} onClose={() => {}} />);
    expect(html).toContain(`Kenellä kaikilla on ${player.name}`);
    expect(html).toContain('player-owner-row selected');
    expect(html).toContain(manager.teamName);
    expect(html).toContain("Kapteeni");
    expect(html).toContain("CRY – LIV");
    expect(html).toContain("Ottelu ei ole vielä alkanut.");
    expect(html).not.toContain("Otteluita jäljellä");
    expect(html).not.toContain("C ×2");
    expect(html).not.toContain("CRY – – – LIV");
    expect(html).not.toContain("Alustava");
  });

  it("renders season figures for multiple players and marks absent figures as missing", () => {
    const players = demoData.managers[0].squad.slice(0, 3);
    const data = { ...demoData, players, playerStats: players.slice(0, 2).map((p, i) => ({ id: p.id, totalPoints: 100 - i * 20 })) as PlayerStat[] };
    const html = renderToStaticMarkup(<PlayerComparison data={data} language="en" ids={players.map((p) => p.id)} onIds={() => {}} onClose={() => {}} />);
    expect(html).toContain("Season statistics");
    for (const player of players) expect(html).toContain(player.name);
    expect(html).toContain('class="best"');
    expect(html).toContain('class="worst"');
    expect(html).toContain('class="missing"');
    expect(html).toContain("Full season");
  });
});

describe("night price summary empty groups", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const deadlines = ["2026-11-08T00:00:00Z", "2026-11-09T00:00:00Z"];
  it("omits empty boxes and gives a plain message when an entire side is empty", () => {
    const html = renderToStaticMarkup(<PriceSummaryModal market={{ deadlines, gameweekDeadline: null, players: [] }} owners={new Map()} language="fi" now={now} onClose={() => {}} />);
    expect(html).not.toContain('class="price-night-group ');
    expect(html).toContain("Nousijoita ei ennusteta seuraavaan hinnanmuutokseen.");
    expect(html).toContain("Laskijoita ei ennusteta seuraavaan hinnanmuutokseen.");
  });
  it("shows a nonempty category without an empty possible-risers box below it", () => {
    const player = { ...demoData.prices!.players[0], progress: 120, perHour: 1, lockedUntil: null, calibrating: false };
    const html = renderToStaticMarkup(<PriceSummaryModal market={{ deadlines, gameweekDeadline: null, players: [player] }} owners={new Map()} language="en" now={now} onClose={() => {}} />);
    expect((html.match(/class="price-night-group /g) ?? []).length).toBe(1);
    expect(html).toContain("Risers");
    expect(html).not.toContain("May rise</h3>");
    expect(html).toContain("No price falls forecast for the next change.");
  });
});
