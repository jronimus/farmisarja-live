import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLiveDashboard } from "./liveDashboard";
import { createDemoArchive, createPlanningDemo } from "../planningDemo";

afterEach(() => vi.unstubAllGlobals());
describe("completed round snapshots", () => {
  it("uses the selected week's official total, rank, transfers and squad, never current entry totals", async () => {
    const events = [1,2,3].map(id=>({id,deadline_time:`2026-08-${id+10}T12:00:00Z`,finished:true,data_checked:true,is_current:id===3,is_next:false}));
    const element = {id:11,code:123,web_name:"Test",team:1,element_type:3,now_cost:70,cost_change_start:1,selected_by_percent:"50",status:"a",chance_of_playing_next_round:null,minutes:270,starts:3,form:"5",points_per_game:"5",price_change_projections:[]};
    const history = [
      {event:1,points:10,total_points:10,overall_rank:800,value:1000,event_transfers:0,event_transfers_cost:0,points_on_bench:2},
      {event:2,points:16,total_points:22,overall_rank:700,value:1005,event_transfers:2,event_transfers_cost:4,points_on_bench:3},
      {event:3,points:90,total_points:112,overall_rank:20,value:1100,event_transfers:5,event_transfers_cost:0,points_on_bench:9},
    ];
    const fetcher = vi.fn(async (url:string) => {
      let body:unknown;
      if(url.includes("bootstrap-static")) body={events,elements:[element],teams:[{id:1,short_name:"ARS",code:3},{id:2,short_name:"CHE",code:8}]};
      else if(url.includes("fixtures")) body=events.map(event=>({id:event.id,event:event.id,kickoff_time:event.deadline_time,team_h:1,team_a:2,team_h_score:1,team_a_score:0,minutes:90,started:true,finished:true,finished_provisional:true,team_h_difficulty:2,team_a_difficulty:4,stats:[]}));
      else if(url.includes("standings") || url.endsWith("/league")) body={league:{name:"Test"},standings:{results:[{entry:900001,rank:1,last_rank:1,entry_name:"Test team",player_name:"Manager",total:112}],has_next:false},new_entries:{results:[]}};
      else if(url.includes("/event/2/live")) body={elements:[{id:11,stats:{total_points:8,minutes:90,bonus:0},explain:[]}]};
      else if(url.includes("/picks")) body={active_chip:null,entry_history:history[1],picks:[{element:11,position:1,multiplier:2,is_captain:true,is_vice_captain:false}]};
      else if(url.includes("/history")) body={current:history,chips:[{name:"3xc",event:3}]};
      else if(url.includes("/transfers")) body=[{event:2,element_in:11,element_out:12,time:"2026-08-12",element_in_cost:69},{event:3,element_in:11,element_out:12,time:"2026-08-13",element_in_cost:70}];
      else body={summary_overall_rank:20,player_first_name:"Test",player_last_name:"Manager"};
      return {ok:true,json:async()=>body};
    });
    const storage=new Map<string,string>();
    vi.stubGlobal("localStorage",{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
    vi.stubGlobal("fetch",fetcher);
    const snapshot=await loadLiveDashboard(2);
    const row=snapshot!.managers[0];
    expect(snapshot!.gameweek).toBe(2);
    expect(row.totalPoints-row.hit).toBe(22);
    expect(row.gameweekPoints-row.hit).toBe(12);
    expect(row.overallRank).toBe(700);
    expect(row.seasonTransfers).toBe(2);
    expect(row.seasonHitPoints).toBe(4);
    expect(row.usedChips).not.toContain("TC");
    expect(row.gameweekHistory!.map(r=>r.gameweek)).toEqual([1,2]);
    expect(row.squad[0].purchasePrice).toBe(6.9);
    expect(row.teamValue).toBe(100.5);
    expect(row.captainPoints).toBe(16);
    const calls=fetcher.mock.calls.length;
    await loadLiveDashboard(2);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it("removes later demo rounds from the season total", () => {
    const base=createPlanningDemo();
    const old=createDemoArchive(base,22);
    for(const manager of old.managers) {
      const current=base.managers.find(row=>row.id===manager.id)!;
      const later=current.gameweekHistory!.filter(row=>row.gameweek>22).reduce((sum,row)=>sum+row.points-row.hit,0);
      expect(manager.totalPoints-manager.hit).toBe(current.totalPoints-current.hit-later);
      expect(manager.gameweekHistory!.every(row=>row.gameweek<=22)).toBe(true);
    }
  });
});
