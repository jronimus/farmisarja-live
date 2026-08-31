import { describe, expect, it } from "vitest";
import { matchElement, normalise, type Element } from "./fotmob";

/**
 * Forest as FPL actually files them, on 31 Aug 2026. The filed names are the point: nothing
 * here is invented, and `Morato` really is `Felipe` / `Rodrigues da Silva`.
 */
const forest: Element[] = [
  { id: 470, web_name: "Morato", first_name: "Felipe", second_name: "Rodrigues da Silva", team: 18 },
  { id: 474, web_name: "Jair Cunha", first_name: "Jair", second_name: "Paula da Cunha Filho", team: 18 },
  { id: 491, web_name: "Igor Jesus", first_name: "Igor Jesus", second_name: "Maciel da Cruz", team: 18 },
  { id: 469, web_name: "N.Williams", first_name: "Neco", second_name: "Williams", team: 18 },
  { id: 488, web_name: "I.Sangaré", first_name: "Ibrahim", second_name: "Sangaré", team: 18 },
  { id: 483, web_name: "Ndoye", first_name: "Dan", second_name: "Ndoye", team: 18 },
];
const teamByShort = new Map([["NFO", 18]]);
/** FotMob's own id for Forest. */
const NFO = 10203;

describe("naming the man a report is about", () => {
  it("refuses the name that started all this", () => {
    // One shared part, `silva`, out of the middle of a filed name, and it used to be enough
    // to hand this report to Morato. Eric da Silva Moreira is not in FPL at all.
    expect(matchElement("Eric da Silva Moreira", NFO, forest, teamByShort)).toBeNull();
    expect(normalise("Eric da Silva Moreira").split(" ")).toContain("silva");
  });

  it("still names him when the name he is known by is there", () => {
    expect(matchElement("Morato", NFO, forest, teamByShort)).toBe(470);
    expect(matchElement("Felipe Morato", NFO, forest, teamByShort)).toBe(470);
  });

  it("reads through an initial FPL uses and FotMob does not", () => {
    // `N.Williams` and `I.Sangaré`: the initial is too short to mean anything and is dropped.
    expect(matchElement("Neco Williams", NFO, forest, teamByShort)).toBe(469);
    expect(matchElement("Ibrahim Sangaré", NFO, forest, teamByShort)).toBe(488);
  });

  it("wants both halves of a two-part known name", () => {
    expect(matchElement("Igor Jesus", NFO, forest, teamByShort)).toBe(491);
    expect(matchElement("Jair Cunha", NFO, forest, teamByShort)).toBe(474);
    // Half of it is not him. Two Forest players are filed `da Cunha` and `da Cruz`, and this
    // is the shape of guess that used to pick one of them.
    expect(matchElement("Cunha", NFO, forest, teamByShort)).toBeNull();
  });

  it("names nobody when two men fit the name equally well", () => {
    const twins: Element[] = [
      { id: 1, web_name: "Silva", first_name: "Bernardo", second_name: "Silva", team: 18 },
      { id: 2, web_name: "Silva", first_name: "Thiago", second_name: "Silva", team: 18 },
    ];
    expect(matchElement("Silva", NFO, twins, teamByShort)).toBeNull();
    // A forename separates them, and then there is one answer rather than two.
    expect(matchElement("Thiago Silva", NFO, twins, teamByShort)).toBe(2);
  });

  it("says nothing about a club it does not know", () => {
    expect(matchElement("Morato", 999999, forest, teamByShort)).toBeNull();
  });
});
