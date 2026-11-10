import { describe, expect, it } from "vitest";
import { createPlanningDemo } from "../planningDemo";
import { gameweekHandsOverAt } from "./fplRules";
import { isPlanningPeriod, planningHighlights } from "./planning";

describe("between-rounds planning", () => {
  it("uses the existing handover boundary and only confirmed data before the next deadline", () => {
    const data = createPlanningDemo();
    const boundary = gameweekHandsOverAt(data.fixtures![0].kickoff);
    expect(isPlanningPeriod(data, boundary - 1)).toBe(false);
    expect(isPlanningPeriod(data, boundary)).toBe(true);
    expect(isPlanningPeriod({ ...data, pointsFinalized: false }, Date.now())).toBe(false);
    expect(isPlanningPeriod({ ...data, nextEvent: undefined }, Date.now())).toBe(false);
    expect(isPlanningPeriod(data, Date.parse(data.nextEvent!.deadline))).toBe(false);
  });
  it("offers only eligible unowned players, real fixture ratings, and correctly scored winners", () => {
    const data = createPlanningDemo();
    const highlights = planningHighlights(data, "fi");
    const arsenal = data.planningFixtures!.filter((fixture) => fixture.home === "ARS" || fixture.away === "ARS");
    expect(new Set(arsenal.map((fixture) => fixture.home === "ARS" ? fixture.away : fixture.home)).size).toBe(6);
    expect(highlights.map((slide) => slide.id)).toEqual(expect.arrayContaining(["availability", "unowned", "fixtures", "round", "form"]));
    const held = new Set(data.managers.flatMap((manager) => manager.squad.map((player) => player.id)));
    expect(highlights.find((slide) => slide.id === "unowned")!.rows.every((row) => data.managers.filter(manager=>manager.squad.some(player=>player.id===row.playerId)).length/data.managers.length<=.3)).toBe(true);
    expect(held.size).toBeGreaterThan(0);
    const schedule = highlights.find((slide) => slide.id === "fixtures")!;
    expect(schedule.title.length).toBeGreaterThan(3);
    expect(schedule.fixtures).toHaveLength(5);
    expect(schedule.fixtures![0].gameweek).toBe(25);
    const noSchedule = planningHighlights({ ...data, planningFixtures: [] }, "fi");
    expect(noSchedule.some((slide) => slide.id === "fixtures")).toBe(false);
    const noStats = planningHighlights({ ...data, playerStats: [] }, "fi");
    expect(noStats.some((slide) => slide.id === "unowned")).toBe(false);
    const max = Math.max(...data.managers.map((manager) => manager.gameweekPoints + manager.provisionalBonus - manager.hit));
    expect(highlights.find((slide) => slide.id === "round")!.rows[0].value).toBe(String(max));
  });
  it("ranks FPL ownership per position and keeps round point leaders in one separate list", () => {
    const data = createPlanningDemo();
    const slides = planningHighlights(data, "fi");
    for (const position of ["GK", "DEF", "MID", "FWD"]) {
      const list = slides.find((slide) => slide.id === `ownership-${position}`)!;
      expect(list.rows.length).toBeLessThanOrEqual(10);
      expect(list.rows.length).toBeGreaterThan(0);
      expect(list.rows.every((row) => data.players!.find((player) => player.id === row.playerId)!.position === position)).toBe(true);
      expect(list.rows.every((row) => row.ownership !== undefined)).toBe(true);
      expect(list.rows.map((row) => row.ownership)).toEqual([...list.rows.map((row) => row.ownership)].sort((a, b) => b! - a!));
    }
    expect(slides.filter((slide) => !slide.id.startsWith("ownership-")).every((slide) => slide.rows.every((row) => row.ownership === undefined))).toBe(true);
    expect(slides.find((slide) => slide.id === "prices")?.action).toBe("prices");
  });

  it("prefers a non-elite club on the same five-match FDR and picks its season leaders",()=>{
    const data=createPlanningDemo();
    data.clubStrength={ARS:5,COV:3};
    data.planningFixtures=["ARS","COV"].flatMap(home=>Array.from({length:5},(_,i)=>({gameweek:25+i,home,away:"CHE",homeDifficulty:2,awayDifficulty:3,kickoff:`2026-12-${10+i}T12:00:00Z`})));
    const cov=data.playerStats!.filter(stat=>data.players!.find(player=>player.id===stat.id)?.club==="COV");
    const top=[...cov].sort((a,b)=>b.totalPoints-a.totalPoints)[0];
    top.form=0;
    const schedule=planningHighlights(data,"fi").find(slide=>slide.id==="fixtures")!;
    expect(schedule.club?.code).toBe("COV");
    expect(schedule.fixtures).toHaveLength(5);
    expect(schedule.rows[0].playerId).toBe(top.id);
    const differentials=planningHighlights(data,"fi").find(slide=>slide.id==="unowned")!;
    for(const row of differentials.rows) expect(row.value).toBe((data.recentPlayerMatches![row.playerId!].points/5).toFixed(1));
  });

  it("shows three ranked teams and uses actual per-round and per-match averages",()=>{
    const data=createPlanningDemo();
    const slides=planningHighlights(data,"fi");
    const round=slides.find(slide=>slide.id==="round")!, form=slides.find(slide=>slide.id==="form")!;
    expect(round.rows).toHaveLength(3);
    expect(form.rows).toHaveLength(3);
    expect(round.rows.map(row=>Number(row.value))).toEqual([...round.rows.map(row=>Number(row.value))].sort((a,b)=>b-a));
    for(const row of form.rows) {
      const manager=data.managers.find(manager=>manager.id===row.managerId)!;
      const weeks=manager.gameweekHistory!.slice(-5);
      expect(row.value).toBe((weeks.reduce((sum,week)=>sum+week.points-week.hit,0)/weeks.length).toFixed(1));
    }
    expect(form.note).toBe("Keskiarvo per kierros");
  });

});
