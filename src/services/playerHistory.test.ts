import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlayerHistory } from "./playerHistory";

const store = new Map<string, string>();
const matches = [
  { fixture: 1, round: 1, kickoff_time: "2026-08-21T19:00:00Z", total_points: 6 },
  { fixture: 2, round: 2, kickoff_time: "2026-08-29T14:00:00Z", total_points: 3 },
  { fixture: 3, round: 3, kickoff_time: "2026-09-05T14:00:00Z", total_points: 9 },
];
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("element-summary") ? { history: matches } : { teams: [{ id: 1, short_name: "ARS" }] })));
});
afterEach(() => vi.unstubAllGlobals());

describe("player history caching", () => {
  it("excludes the live round and makes no more requests when revisiting during it", async () => {
    const signal = new AbortController().signal;
    const first = await loadPlayerHistory(1, 2, "2026", signal);
    expect(first.history.map((match) => match.round)).toEqual([2, 1]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await loadPlayerHistory(1, 2, "2026", signal)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await loadPlayerHistory(1, 1, "2026", signal)).history.map((m) => m.round)).toEqual([1]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("refreshes only when another round is confirmed and separates seasons", async () => {
    const signal = new AbortController().signal;
    await loadPlayerHistory(1, 2, "2026", signal);
    expect((await loadPlayerHistory(1, 3, "2026", signal)).history.map((m) => m.round)).toEqual([3, 2, 1]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("through=3"), { signal });
    await loadPlayerHistory(1, 2, "2027", signal);
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it("makes no requests before the first round is confirmed", async () => {
    expect(await loadPlayerHistory(1, 0, "2026", new AbortController().signal)).toEqual({ history: [], teams: {} });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not cache failed requests and can retry", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const signal = new AbortController().signal;
    await expect(loadPlayerHistory(1, 2, "2026", signal)).rejects.toThrow();
    expect(store.size).toBe(0);
    expect((await loadPlayerHistory(1, 2, "2026", signal)).history).toHaveLength(2);
  });
  it("retains future fixtures with correct opponent, venue, difficulty and unconfirmed dates",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.includes("element-summary")?{history:matches,fixtures:[
      {id:40,event:4,kickoff_time:"2026-09-12T14:00:00Z",is_home:true,team_h:1,team_a:2,difficulty:4},
      {id:50,event:null,kickoff_time:null,is_home:false,team_h:2,team_a:1,difficulty:2},
      {id:30,event:3,kickoff_time:"2026-09-05T14:00:00Z",is_home:true,team_h:1,team_a:2,difficulty:4,finished:true},
    ]}:{teams:[{id:1,short_name:"ARS",name:"Arsenal"},{id:2,short_name:"MCI",name:"Manchester City"}]})));
    const signal=new AbortController().signal;
    const data=await loadPlayerHistory(2,3,"2026",signal);
    expect(data.fixtures).toEqual([
      {id:40,gameweek:4,kickoff:"2026-09-12T14:00:00Z",opponent:"Manchester City",venue:"H",difficulty:4},
      {id:50,gameweek:null,kickoff:null,opponent:"Manchester City",venue:"A",difficulty:2},
    ]);
    expect((await loadPlayerHistory(2,3,"2026",signal)).fixtures).toEqual(data.fixtures);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

});
