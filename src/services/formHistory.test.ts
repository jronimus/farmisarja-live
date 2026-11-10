import { afterEach, describe, expect, it, vi } from "vitest";
import { formPlayerContributions, loadFormHistory, loadRecentPlayerMatches, type HistoricalRound } from "./formHistory";

afterEach(() => vi.unstubAllGlobals());
describe("historical form attribution", () => {
  it("uses the actual squad of each week, including sold players and captain changes", () => {
    const rounds: HistoricalRound[] = [
      { gameweek: 5, points: { 10: 8, 20: 3 }, teams: [{ managerId: 1, picks: [{ element: 10, multiplier: 2 }, { element: 20, multiplier: 0 }] }, { managerId: 2, picks: [{ element: 10, multiplier: 1 }] }] },
      { gameweek: 6, points: { 10: 12, 20: 7 }, teams: [{ managerId: 1, picks: [{ element: 20, multiplier: 3 }] }, { managerId: 2, picks: [{ element: 10, multiplier: 2 }] }] },
    ];
    const rows = formPlayerContributions(rounds, 1);
    expect(rows.find((row) => row.id === 10)).toMatchObject({ points: 16, captainExtra: 8, rounds: 1, gain: 8 });
    expect(rows.find((row) => row.id === 20)).toMatchObject({ points: 21, captainExtra: 14, rounds: 1, gain: 21 });
  });
  it("counts Bench Boost and confirmed autosubs from historical multipliers", () => {
    const rows = formPlayerContributions([{ gameweek: 5, points: { 50: 9, 60: 7 }, teams: [{ managerId: 1, picks: [{ element: 50, multiplier: 1 }, { element: 60, multiplier: 0 }] }] }], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 50, points: 9 });
  });
  it("measures rarity from that week's owners, including benched owners", () => {
    const teams = [1, 2, 3, 4, 5, 6, 7].map((managerId) => ({ managerId, picks: managerId === 1 ? [{ element: 5, multiplier: 1 }] : [] }));
    const round = { gameweek: 4, points: { 5: 12 }, teams };
    expect(formPlayerContributions([round], 1)[0]).toMatchObject({ differentialPoints: 12, averageOwners: 1, gain: 12 });
    teams[1].picks.push({ element: 5, multiplier: 0 });
    teams[2].picks.push({ element: 5, multiplier: 0 });
    expect(formPlayerContributions([round], 1)[0].differentialPoints).toBe(0);
  });
  it("does not fabricate zero when historical points are missing", () => {
    expect(() => formPlayerContributions([{ gameweek: 1, points: {}, teams: [{ managerId: 1, picks: [{ element: 9, multiplier: 1 }] }] }], 1)).toThrow();
  });
  it("reuses cached completed gameweeks instead of fetching them again", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/live") ? { elements: [{ id: 10, stats: { total_points: 8 } }] } : { picks: [{ element: 10, multiplier: 1 }] } }));
    vi.stubGlobal("fetch", fetcher);
    await loadFormHistory([5, 6], [1, 2], "test-season");
    expect(fetcher).toHaveBeenCalledTimes(6);
    await loadFormHistory([5, 6], [1, 2], "test-season");
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("counts five actual matches, including separate DGW fixtures and excluding unused players", async () => {
    vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{}});
    const fetcher=vi.fn(async(url:string)=>{
      const week=Number(url.match(/event\/(\d+)/)![1]);
      return {ok:true,json:async()=>({elements:[{id:91,stats:{total_points:12},explain:[
        {fixture:week*10,stats:[{identifier:"minutes",value:90,points:2},{identifier:"goals_scored",value:1,points:4}]},
        {fixture:week*10+1,stats:[{identifier:"minutes",value:week===2?0:30,points:week===2?0:1}]},
      ]}]})};
    });
    vi.stubGlobal("fetch",fetcher);
    const scores=await loadRecentPlayerMatches(3,"recent-match-test");
    expect(scores[91]).toEqual({matches:5,points:20});
    await loadRecentPlayerMatches(3,"recent-match-test");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("uses kickoff chronology when rescheduled fixture IDs are out of order",async()=>{
    vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{}});
    vi.stubGlobal("fetch",async()=>({ok:true,json:async()=>({elements:[{id:92,stats:{total_points:21},explain:Array.from({length:6},(_,i)=>({fixture:i+1,stats:[{identifier:"minutes",value:90,points:i+1}]}))}]})}));
    const dates=Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,`2026-10-${20-i}T12:00:00Z`]));
    const scores=await loadRecentPlayerMatches(1,"rescheduled-test",dates);
    expect(scores[92]).toEqual({matches:5,points:15});
  });

});
