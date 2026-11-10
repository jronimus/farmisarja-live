import type { GameweekFixture, Language, SquadPlayer } from "../types";

/** Include future fixtures even before FPL has supplied an explain block for them. */
export function playerFixtureBreakdown(player: SquadPlayer, fixtures: GameweekFixture[] = []) {
  const blocks = new Map((player.pointBreakdown ?? []).map((block) => [block.fixture, block]));
  for (const fixture of fixtures) {
    if ((fixture.home === player.club || fixture.away === player.club) && !blocks.has(fixture.id)) blocks.set(fixture.id, { fixture: fixture.id, stats: [] });
  }
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  return [...blocks.values()].sort((a, b) => (byId.get(a.fixture)?.kickoff ?? "").localeCompare(byId.get(b.fixture)?.kickoff ?? ""));
}

export function fixtureHeading(fixture: GameweekFixture, language: Language) {
  const fi = language === "fi";
  const upcoming = fixture.status === "upcoming";
  const hasScore = !upcoming && fixture.homeScore !== null && fixture.awayScore !== null;
  const title = hasScore ? `${fixture.home} ${fixture.homeScore} – ${fixture.awayScore} ${fixture.away}` : `${fixture.home} – ${fixture.away}`;
  const kickoff = fixture.kickoff && Number.isFinite(Date.parse(fixture.kickoff)) ? new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", {
    weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(fixture.kickoff)) : fi ? "Aika vahvistamatta" : "Time to be confirmed";
  const status = upcoming ? kickoff : fixture.status === "live" ? "LIVE" : fixture.status === "final" ? fi ? "Vahvistettu" : "Confirmed" : fi ? "Päättynyt · alustava" : "Full time · provisional";
  return { title, status, upcoming };
}
