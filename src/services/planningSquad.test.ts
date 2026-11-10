import {describe,expect,it} from "vitest";
import {createPlanningDemo} from "../planningDemo";
import {planningPlayer} from "./planningSquad";

describe("planning squad cards",()=>{
  it("uses season points without captain multipliers and the next fixture's venue and FDR",()=>{
    const data=createPlanningDemo();
    const original={...data.managers[0].squad[0],captain:true,viceCaptain:true};
    const view=planningPlayer(original,data);
    const fixture=data.planningFixtures!.filter(row=>row.home===original.club || row.away===original.club)[0];
    expect(view.seasonPoints).toBe(data.playerStats!.find(row=>row.id===original.id)!.totalPoints);
    expect(view.player.captain).toBe(false);
    expect(view.player.viceCaptain).toBe(false);
    expect(view.player.state).toBe("upcoming");
    const home=fixture.home===original.club;
    expect(view.player.opponent).toBe(home?fixture.away:fixture.home);
    expect(view.player.difficulty).toBe(home?fixture.homeDifficulty:fixture.awayDifficulty);
    expect(original.captain).toBe(true);
  });
  it("keeps missing season points and unknown future fixtures explicit",()=>{
    const data=createPlanningDemo();
    const view=planningPlayer(data.managers[0].squad[0],{...data,playerStats:[],planningFixtures:[]});
    expect(view.seasonPoints).toBeNull();
    expect(view.player.opponent).toBe("—");
    expect(view.player.kickoff).toBeUndefined();
  });
});
