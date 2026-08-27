import { describe, expect, it } from "vitest";
import { clubsIn, formsOf, playersIn, type Squad } from "./mentions";

/** FPL's own club names, which is where the matcher gets them. */
const teams = new Map(Object.entries({
  arsenal: "ARS", chelsea: "CHE", "man utd": "MUN", spurs: "TOT",
  brighton: "BHA", liverpool: "LIV", "crystal palace": "CRY", "man city": "MCI",
}));

const squad: Squad[] = [
  { id: 1, webName: "Saka", club: "ARS" },
  { id: 2, webName: "Szoboszlai", club: "LIV" },
  { id: 3, webName: "Palmer", club: "CHE" },
  // The other Palmer, which is what makes a bare "Palmer" untaggable.
  { id: 4, webName: "Palmer", club: "TOT" },
  { id: 5, webName: "White", club: "ARS" },
  { id: 6, webName: "Eze", club: "CRY" },
  // FPL files these two with an initial and with an accent; a headline writes neither.
  { id: 7, webName: "M.Sangaré", club: "BRE" },
  { id: 8, webName: "Pedro Porro", club: "TOT" },
];

describe("the clubs a headline names", () => {
  it("takes a name however either site spells it", () => {
    expect(clubsIn("Can Savinho be a good FPL buy at Spurs?", teams)).toEqual(["TOT"]);
    // Fantasy Football Scout writes Man United; FPL files Man Utd.
    expect(clubsIn("Sesko, Mount: Man United injury latest", teams)).toEqual(["MUN"]);
    expect(clubsIn("Rogers, Enzo, Welbeck: Chelsea injury latest", teams)).toEqual(["CHE"]);
  });

  it("takes FPL's own three letters", () => {
    expect(clubsIn("ARS v CHE preview", teams)).toEqual(["ARS", "CHE"]);
  });

  it("names nobody when nobody is named", () => {
    expect(clubsIn("Best cheap FPL players for a Gameweek 2 Bench Boost", teams)).toEqual([]);
  });
});

describe("the spellings a name comes in", () => {
  it("offers the accents stripped, the initial dropped and the last word alone", () => {
    expect(formsOf("M.Sangaré").sort()).toEqual(["M.Sangare", "M.Sangaré", "Sangare", "Sangaré"]);
    expect(formsOf("Pedro Porro").sort()).toEqual(["Pedro Porro", "Porro"]);
    // Nothing three letters or shorter is offered at all.
    expect(formsOf("Eze")).toEqual([]);
  });
});

describe("the players a headline names", () => {
  it("finds a name the headline spells differently from FPL", () => {
    // FPL files M.Sangaré and Pedro Porro; the headline writes Sangare and Porro, and both
    // were being missed.
    expect(playersIn("Sangare assist + Ampadu DefCons", squad, [])).toEqual([7]);
    expect(playersIn("Osula, Porro, Maddison: FPL injury updates", squad, [])).toEqual([8]);
  });

  it("takes a surname only one player has", () => {
    expect(playersIn("Szoboszlai the differential nobody owns", squad, [])).toEqual([2]);
    expect(playersIn("Bruno G, Saka, Timber: Arsenal injury latest", squad, ["ARS"])).toEqual([1]);
  });

  it("refuses a surname two players share", () => {
    // Chelsea's Palmer and Spurs' Palmer. A tag on the wrong man is worse than no tag.
    expect(playersIn("Is Palmer worth the money?", squad, [])).toEqual([]);
  });

  it("takes it when the club in the same piece settles it", () => {
    expect(playersIn("Is Palmer worth it for Chelsea?", squad, ["CHE"])).toEqual([3]);
    // Both their clubs named: still nothing, because it settles to two.
    expect(playersIn("Palmer: Chelsea and Spurs", squad, ["CHE", "TOT"])).toEqual([]);
  });

  it("refuses a surname that is also an ordinary word", () => {
    // "White" reads as a colour until a club vouches for it.
    expect(playersIn("The best white-hot picks this week", squad, [])).toEqual([]);
    expect(playersIn("White is back for Arsenal", squad, ["ARS"])).toEqual([5]);
  });

  it("drops a name of three letters or fewer", () => {
    expect(playersIn("Eze is flying", squad, ["CRY"])).toEqual([]);
  });

  it("matches whole words only, and minds the case", () => {
    expect(playersIn("Sakaguchi joins", squad, [])).toEqual([]);
    expect(playersIn("the saka of it all", squad, [])).toEqual([]);
  });
});
