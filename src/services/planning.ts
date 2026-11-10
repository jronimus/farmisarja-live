import type { DashboardData, Language } from "../types";
import { nightSummary, nextPriceDeadline } from "./priceChanges";
import { gameweekHandsOverAt } from "./fplRules";

export function isPlanningPeriod(data: DashboardData, now: number) {
  const latest = (data.fixtures ?? []).reduce((at, fixture) => fixture.kickoff > at ? fixture.kickoff : at, "");
  return Boolean(data.pointsFinalized && data.nextEvent && latest && now >= gameweekHandsOverAt(latest) && now < Date.parse(data.nextEvent.deadline) && !(data.fixtures ?? []).some((fixture) => fixture.status === "live"));
}
const clubNames: Record<string, string> = { ARS: "Arsenal", AVL: "Aston Villa", BHA: "Brighton", BOU: "Bournemouth", BRE: "Brentford", CHE: "Chelsea", COV: "Coventry City", CRY: "Crystal Palace", EVE: "Everton", FUL: "Fulham", HUL: "Hull City", IPS: "Ipswich Town", LEE: "Leeds United", LIV: "Liverpool", MCI: "Manchester City", MUN: "Manchester United", NEW: "Newcastle United", NFO: "Nottingham Forest", SUN: "Sunderland", TOT: "Tottenham Hotspur" };
export function planningClubName(data: DashboardData, club: string): string {
  const fixture = data.fixtures?.find((fixture) => fixture.home === club || fixture.away === club);
  return (fixture?.home === club ? fixture.homeName : fixture?.awayName) || clubNames[club] || club;
}
export interface PlanningHighlight {
  id: string; title: string; label: string; tone: "mint" | "purple" | "gold";
  compact?: boolean;
  note?: string;
  hero?: boolean;
  metric?: "points" | "ownership";
  count?: number;
  action?: "prices";
  club?: { code: string; name: string };
  fixtures?: Array<{ gameweek: number; opponent: string; opponentName: string; venue: "H" | "A"; difficulty: number }>;
  rows: Array<{ name: string; detail: string; value: string; playerId?: number; managerId?: number; ownership?: number; owners?: string[]; direction?: "rise" | "fall"; uncertain?: boolean }>;
}
export function planningHighlights(data: DashboardData, language: Language, now = Date.now()): PlanningHighlight[] {
  const fi = language === "fi";
  const result: PlanningHighlight[] = [];
  const held = new Set(data.managers.flatMap((manager) => manager.squad.map((player) => player.id)));
  const players = new Map((data.players ?? []).map((player) => [player.id, player]));
  const concerns = (data.playerNews ?? []).filter((player) => held.has(player.id) && (player.status !== "a" || (player.chance !== null && player.chance < 100))).slice(0, 10);
  if (concerns.length) result.push({ id: "availability", label: fi ? "Loukkaantumiset ja epävarmat - Farmisarja" : "Injuries and doubts - Farmisarja", title: fi ? "Saatavuustilanne" : "Availability watch", tone: "gold", rows: concerns.map((player) => ({ playerId: player.id, name: player.name, detail: player.owners.map((owner) => owner.teamName).join(" · "), value: player.chance === 0 || player.status === "s" || player.status === "u" ? fi ? "Poissa" : "Out" : player.chance !== null ? `${player.chance}%` : "?" })) });
  const stats = (data.playerStats ?? []).filter((stat) => stat.minutes >= 180 && players.has(stat.id) && (!players.get(stat.id)?.status || players.get(stat.id)?.status === "a") && (players.get(stat.id)?.chance == null || players.get(stat.id)!.chance! >= 100));
  const unowned = stats.filter(stat => {
    const recent=data.recentPlayerMatches?.[stat.id];
    const owners=data.managers.filter(manager=>manager.squad.some(player=>player.id===stat.id)).length;
    return recent?.matches === 5 && recent.points >= 20 && owners / Math.max(1,data.managers.length) <= .3;
  }).sort((a,b)=>data.recentPlayerMatches![b.id].points-data.recentPlayerMatches![a.id].points).slice(0,10);
  if (unowned.length) result.push({ id:"unowned",label:fi?"Farmisarja · Erottujat":"Farmisarja · Differentials",title:fi?"Vireessä, mutta vähän omistettuja":"In form, but little owned",note:fi?"Edelliset 5 ottelua · Keskiarvo per ottelu":"Last 5 matches · Average per match",tone:"mint",rows:unowned.map(stat=>{
    const player=players.get(stat.id)!;
    return {playerId:stat.id,name:player.name,detail:`${player.club} · £${player.cost.toFixed(1)}m`,value:(data.recentPlayerMatches![stat.id].points/5).toFixed(1)};
  }) });
  const clubs = new Set((data.planningFixtures ?? []).flatMap((fixture) => [fixture.home, fixture.away]));
  const schedules = [...clubs].flatMap((club) => {
    const fixtures = (data.planningFixtures ?? []).filter((fixture) => fixture.home === club || fixture.away === club).sort((a, b) => a.gameweek - b.gameweek || a.kickoff.localeCompare(b.kickoff)).slice(0, 5);
    if (fixtures.length < 5) return [];
    const average = fixtures.reduce((sum, fixture) => sum + (fixture.home === club ? fixture.homeDifficulty : fixture.awayDifficulty), 0) / fixtures.length;
    const candidates = (data.playerStats ?? []).filter(stat=>players.get(stat.id)?.club === club && stat.minutes > 0).sort((a,b)=>b.totalPoints-a.totalPoints).slice(0,4);
    return average <= 2.8 && candidates.length ? [{ club, fixtures, average, candidates, score:average + Math.max(0,(data.clubStrength?.[club] ?? 3)-3)*.35 }] : [];
  }).sort((a, b) => a.score - b.score || a.average-b.average);
  const schedule = schedules[0];
  if (schedule) result.push({ id: "fixtures", club: { code: schedule.club, name: planningClubName(data, schedule.club) },
    fixtures: schedule.fixtures.map((fixture) => { const home = fixture.home === schedule.club; const opponent = home ? fixture.away : fixture.home; return { gameweek: fixture.gameweek, opponent, opponentName: planningClubName(data, opponent), venue: home ? "H" : "A", difficulty: home ? fixture.homeDifficulty : fixture.awayDifficulty }; }),
    label: fi ? "Suotuisa ohjelma · Seuraavat 5 ottelua" : "Favourable run · Next 5 fixtures", title: planningClubName(data, schedule.club), tone: "mint",
    rows: schedule.candidates.map((stat) => { const player = players.get(stat.id)!; return { playerId: stat.id, name: player.name, detail: `${stat.totalPoints} ${fi ? "pistettä tällä kaudella" : "season points"}`, value: `£${player.cost.toFixed(1)}m` }; }) });

  const ownerNames = (id: number) => data.managers.filter((manager) => manager.squad.some((pick) => pick.id === id)).map((manager) => manager.teamName);
  const roundLeaders = [...players.values()].filter((player) => player.points + player.bonus > 0).sort((a, b) => b.points + b.bonus - a.points - a.bonus || a.name.localeCompare(b.name)).slice(0, 10);
  if (roundLeaders.length) result.push({ id: "leaders", label: `GW ${data.gameweek} · ${fi ? "Pisteet" : "Points"}`, title: fi ? "Kierroksen parhaat pelaajat" : "Gameweek top players", tone: "gold", compact: true, metric: "points", rows: roundLeaders.map((player) => ({ playerId: player.id, name: player.name, detail: player.club, value: String(player.points + player.bonus), owners: ownerNames(player.id) })) });
  const positionLabels = fi ? { GK: "Maalivahdit", DEF: "Puolustajat", MID: "Keskikenttä", FWD: "Hyökkääjät" } : { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    const mostOwned = [...players.values()].filter((player) => player.position === position).sort((a, b) => b.ownership - a.ownership || a.name.localeCompare(b.name)).slice(0, 10);
    if (mostOwned.length) result.push({ id: `ownership-${position}`, label: fi ? "Koko FPL · Omistetuimmat" : "Overall FPL · Most owned", title: positionLabels[position], tone: "purple", compact: true, metric: "ownership",
      rows: mostOwned.map((player) => ({ playerId: player.id, name: player.name, detail: player.club, ownership: player.ownership, value: `${player.ownership.toFixed(1)}%`, owners: ownerNames(player.id) })) });
  }
  if (data.prices && nextPriceDeadline(data.prices, now)) {
    const prices = nightSummary(data.prices, now);
    const changes = (["risers", "fallers", "maybeRisers", "maybeFallers"] as const).flatMap((group) => prices[group].map((player) => ({ player, direction: group === "risers" || group === "maybeRisers" ? "rise" as const : "fall" as const, uncertain: group.startsWith("maybe") })));
    result.push({ id: "prices", label: fi ? "Seuraava hinnanmuutos" : "Next price change", title: fi ? "Yön hintaennuste" : "Tonight’s price forecast", tone: "mint", compact: true, action: "prices", count: changes.length, rows: changes.map(({ player, direction, uncertain }) => ({ playerId: player.id, name: player.name, detail: `${player.club} · £${player.cost.toFixed(1)}m`, value: direction === "rise" ? "+0.1" : "−0.1", direction, uncertain })) });
  }
  if (data.managers.length) {
    const scores = data.managers.map((manager) => ({ manager, points: manager.gameweekPoints + manager.provisionalBonus - manager.hit }));
    result.push({ id: "round", label: "Farmisarja", title: fi ? `Kierroksen GW ${data.gameweek} parhaat` : `GW ${data.gameweek} top teams`, tone: "gold", hero:true, note:fi?"Pistettä":"Points", rows: scores.sort((a,b)=>b.points-a.points || a.manager.position-b.manager.position).slice(0,3).map(({ manager, points }) => ({ managerId: manager.id, name: manager.teamName, detail: manager.managerName, value: String(points) })) });
    const forms = data.managers.filter(manager=>manager.form.length>0).map(manager=>{
      const history=manager.gameweekHistory?.slice(-5);
      const points=history?.length?history.map(row=>row.points-row.hit):manager.form.slice(-5);
      return {manager,average:points.reduce((sum,value)=>sum+value,0)/points.length};
    }).sort((a,b)=>b.average-a.average || a.manager.position-b.manager.position);
    if(forms.length) result.push({id:"form",label:fi?"Farmisarja · Viimeiset 5 kierrosta":"Farmisarja · Last 5 gameweeks",title:fi?"Farmisarjan kuumin vire":"Farmisarja form leaders",tone:"purple",hero:true,note:fi?"Keskiarvo per kierros":"Average per gameweek",rows:forms.slice(0,3).map(({manager,average})=>({managerId:manager.id,name:manager.teamName,detail:manager.managerName,value:average.toFixed(1)}))});
  }
  return result;
}
