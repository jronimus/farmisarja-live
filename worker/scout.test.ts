import { describe, expect, it } from "vitest";
import { rankRatings, toRating } from "./scout";

const body = (over: Record<string, unknown> = {}) => ({
  entry_id: 1628, team_name: "Tiksi United FC", manager_name: "Joni Ronimus", gameweek: 2,
  rating: 82.4, grade: "B+", projected_points: 51.6, ai_projected_points: 64.4,
  captain: "B.Fernandes", components: { starting_xi: 72.3, captaincy: 9.2, availability: 10 },
  differentials: 3, strengths: ["a"], risks: ["b"], ...over,
});

describe("squad ratings", () => {
  it("reads OpenFPL's shape into ours", () => {
    const rating = toRating(body());
    expect(rating).toMatchObject({
      entryId: 1628, teamName: "Tiksi United FC", gameweek: 2, grade: "B+",
      projected: 51.6, aiProjected: 64.4, captain: "B.Fernandes", differentials: 3,
    });
    // The mark is shown as a whole number, so it is rounded once here rather than in
    // three places on the page.
    expect(rating.rating).toBe(82);
    expect(rating.components).toEqual({ startingXi: 72.3, captaincy: 9.2, availability: 10 });
  });

  it("survives a response that leaves the optional halves out", () => {
    const rating = toRating({ entry_id: 1, gameweek: 2, rating: 70, grade: "C", projected_points: 40, ai_projected_points: 60 });
    expect(rating).toMatchObject({ teamName: "—", captain: "—", differentials: 0 });
    expect(rating.components).toEqual({ startingXi: 0, captaincy: 0, availability: 0 });
    expect(rating.strengths).toEqual([]);
  });

  it("ranks by the mark, and breaks a tie on the points behind it", () => {
    const ranked = rankRatings([
      toRating(body({ entry_id: 1, team_name: "A", rating: 82, projected_points: 51.6 })),
      toRating(body({ entry_id: 2, team_name: "B", rating: 82, projected_points: 51.7 })),
      toRating(body({ entry_id: 3, team_name: "C", rating: 79, projected_points: 60 })),
    ]);
    expect(ranked.map((entry) => entry.teamName)).toEqual(["B", "A", "C"]);
  });
});
