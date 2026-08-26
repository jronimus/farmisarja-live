import { describe, expect, it } from "vitest";
import { insightsFromRows, parseCsv, seasonTotals } from "./insights";

describe("core insights", () => {
  it("reads a csv the way the exporter writes one", () => {
    const rows = parseCsv('player_id,xg,name\n251,0.42,"Smith, John"\n115,1.47,De Cuyper\n');
    expect(rows).toHaveLength(2);
    // A quoted comma is part of the name, not a column boundary.
    expect(rows[0]).toEqual({ player_id: "251", xg: "0.42", name: "Smith, John" });
    expect(rows[1].xg).toBe("1.47");
  });

  it("sums a player's matches rather than taking the last of them", () => {
    // A double gameweek is two rows for one player, and both of them count.
    const out = insightsFromRows([
      { player_id: "115", minutes_played: "90", xg: "1.47", goals: "1", total_shots: "4" },
      { player_id: "115", minutes_played: "62", xg: "0.31", goals: "0", total_shots: "2" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ element: 115, minutes: 152, goals: 1, shots: 6, appearances: 2 });
    expect(out[0].xg).toBeCloseTo(1.78, 5);
  });

  it("counts a named substitute who never came on as an absence, not an appearance", () => {
    // The dataset's own warning: minutes_played is the source of truth, and it is 0 here
    // rather than blank. Deriving minutes any other way credits him with a full match.
    const [player] = insightsFromRows([{ player_id: "251", minutes_played: "0.0", xg: "" }]);
    expect(player).toMatchObject({ element: 251, minutes: 0, appearances: 0, xg: 0 });
  });

  it("adds the gameweeks up into a season, biggest threat first", () => {
    const totals = seasonTotals({
      1: insightsFromRows([{ player_id: "1", minutes_played: "90", xg: "0.5", xa: "0.1" }]),
      2: insightsFromRows([
        { player_id: "1", minutes_played: "90", xg: "0.7", xa: "0.2" },
        { player_id: "2", minutes_played: "90", xg: "2.0", xa: "0.0" },
      ]),
    });
    expect(totals[0].element).toBe(2);
    expect(totals[1]).toMatchObject({ element: 1, minutes: 180, appearances: 2 });
    expect(totals[1].xg).toBeCloseTo(1.2, 5);
  });

  it("adds up FPL's defensive count from the parts the dataset actually fills", () => {
    // `defensive_contributions` ships empty in this dataset; the four counts behind it do
    // not, and they are what FPL adds up anyway.
    const [player] = insightsFromRows([{
      player_id: "1", minutes_played: "90",
      clearances: "5", blocks: "2", interceptions: "3", tackles_won: "1", recoveries: "7",
      defensive_contributions: "",
    }]);
    expect(player.cbit).toBe(11);
    // Recoveries are kept apart, because FPL only counts them for a midfielder or forward.
    expect(player.recoveries).toBe(7);
  });

  it("ignores a row with no player on it", () => {
    expect(insightsFromRows([{ player_id: "", minutes_played: "90" }])).toEqual([]);
  });
});
