import { describe, expect, it } from "vitest";
import { translateNews, translateReturn } from "./phrases";

/** Every case here is a string that was actually published, not one that was invented. */

describe("FPL's own availability sentence", () => {
  it("translates a reason and a status as two halves", () => {
    expect(translateNews("Knee injury - Unknown return date", "fi").text).toBe("Polvivamma – paluuaika ei tiedossa");
    expect(translateNews("Knock - 75% chance of playing", "fi").text).toBe("Kolhu – 75 %:n todennäköisyys pelata");
    expect(translateNews("Calf injury - Expected back 5 Sep", "fi").text).toBe("Pohjevamma – arvioitu paluu 5. syyskuuta");
    expect(translateNews("Unspecified injury - Unknown return date", "fi").text).toBe("Määrittelemätön vamma – paluuaika ei tiedossa");
  });

  it("leaves the club exactly as FPL spelt it", () => {
    expect(translateNews("Has joined Paris Saint-Germain permanently", "fi").text)
      .toBe("Siirtynyt pysyvästi seuraan Paris Saint-Germain");
    expect(translateNews("Has joined Rangers on loan for the rest of the season", "fi").text)
      .toBe("Siirtynyt lainalle seuraan Rangers kauden loppuun");
    expect(translateNews("has returned to Getafe CF", "fi").text).toBe("Palannut seuraan Getafe CF");
  });

  it("handles the one suspension in the league", () => {
    expect(translateNews("Suspended until 19 Sep", "fi").text).toBe("Pelikielto 19. syyskuuta asti");
  });

  it("keeps the original for the reader to check", () => {
    expect(translateNews("Knee injury - Unknown return date", "fi").original).toBe("Knee injury - Unknown return date");
    // Nothing was translated, so there is no second version to offer.
    expect(translateNews("Knee injury - Unknown return date", "en").original).toBeNull();
    expect(translateNews("Knee injury - Unknown return date", "en").text).toBe("Knee injury - Unknown return date");
  });

  it("prints what it was given rather than half a translation", () => {
    // A reason nobody has seen before, in a shape the pair rule matches.
    expect(translateNews("Nose injury - Some new phrase", "fi").text).toBe("Nose injury - Some new phrase");
    // A reason it does not know, with a status it does: the half it can do, it does.
    expect(translateNews("Nose injury - Unknown return date", "fi").text).toBe("Nose injury – paluuaika ei tiedossa");
    expect(translateNews("", "fi").text).toBe("");
  });
});

describe("FotMob's expected return", () => {
  it("says a third of a month the way a Finn says it", () => {
    expect(translateReturn("Early September 2026", "fi").text).toBe("syyskuun alku 2026");
    expect(translateReturn("Mid October 2026", "fi").text).toBe("lokakuun puoliväli 2026");
    expect(translateReturn("Late March 2027", "fi").text).toBe("maaliskuun loppu 2027");
  });

  it("translates the fixed phrases", () => {
    expect(translateReturn("Doubtful", "fi").text).toBe("epävarma");
    expect(translateReturn("Back in training", "fi").text).toBe("palannut harjoituksiin");
    expect(translateReturn("A few days", "fi").text).toBe("muutama päivä");
    expect(translateReturn("About a week", "fi").text).toBe("noin viikko");
    expect(translateReturn("About 1-2 weeks", "fi").text).toBe("noin 1–2 viikkoa");
    expect(translateReturn("Unknown", "fi").text).toBe("ei tiedossa");
  });

  it("reads a date", () => {
    expect(translateReturn("Expected back 14 Sep", "fi").text).toBe("arvioitu paluu 14. syyskuuta");
  });

  it("passes an unknown phrase through untouched", () => {
    expect(translateReturn("Sometime soon", "fi")).toEqual({ text: "Sometime soon", original: null });
    expect(translateReturn("Doubtful", "en")).toEqual({ text: "Doubtful", original: null });
  });
});
