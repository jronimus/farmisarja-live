import type { Language } from "./types";

const copy = {
  fi: {
    live: "LIVE", preview: "ESIKATSELU", updated: "Päivitetty", position: "Sija", manager: "Joukkue / manageri",
    gwPoints: "GW-pisteet", total: "Yhteensä", captain: "Kapteeni", transfers: "Siirrot", seasonTransfers: "Siirrot yht.", chips: "Chips", teamValue: "Arvo", benchPoints: "Penkki", progress: "Pelattu",
    form: "Vire", finished: "valmis", finishedShort: "valmis", playing: "live", toPlay: "jäljellä", toPlayShort: "jäljellä", autosubs: "Aut. vaihdot", details: "Lisätiedot", on: "Päällä", off: "Pois",
    overall: "Kokonaiskilpailu", gameweek: "Kierros", month: "Kuukausi", allMonths: "Koko kausi", noTransfers: "Ei siirtoja",
    starting: "Avaus", squad: "Kokoonpano", bench: "Penkki", best: "Paras", worst: "Heikoin", provisional: "Alustava bonus",
    highlightPlayer: "Korosta pelaaja", allPlayers: "Ei korostusta", inSquads: "joukkueessa", asCaptain: "kapteenina", onBench: "penkillä", effectiveOwnership: "Tehollinen omistus", withBench: "Penkki mukaan", lastFive: "Viisi viimeistä",
    rankEstimate: "Arvioitu live-yleissija", dataPreview: "GW1-data ei ole vielä avautunut — näkymässä on esikatseludata", transfer: "siirto", transfersCount: "siirtoa", net: "netto", oldTeam: "Vanha", currentTeam: "Nykyinen", nextMatch: "Seuraava peli", fixtures: "GW-ottelut", fixturesPlayed: "pelattu", fixtureUpcoming: "Tulossa", fixtureLive: "Käynnissä", fixtureProvisional: "Alustava", fixtureFinal: "Vahvistettu",
  },
  en: {
    live: "LIVE", preview: "PREVIEW", updated: "Updated", position: "Pos", manager: "Team / manager",
    gwPoints: "GW points", total: "Total", captain: "Captain", transfers: "Transfers", seasonTransfers: "Total transf.", chips: "Chips", teamValue: "Value", benchPoints: "Bench", progress: "Progress",
    form: "Form", finished: "finished", finishedShort: "done", playing: "live", toPlay: "to play", toPlayShort: "left", autosubs: "Autosubs", details: "Details", on: "On", off: "Off",
    overall: "Overall", gameweek: "Gameweek", month: "Month", allMonths: "Full season", noTransfers: "No transfers",
    starting: "Starting XI", squad: "Squad", bench: "Bench", best: "Best", worst: "Lowest", provisional: "Provisional bonus",
    highlightPlayer: "Highlight player", allPlayers: "No highlight", inSquads: "squads", asCaptain: "as captain", onBench: "benched", effectiveOwnership: "Effective ownership", withBench: "With bench", lastFive: "Last five",
    rankEstimate: "Estimated live overall rank", dataPreview: "GW1 data is not available yet — showing preview data", transfer: "transfer", transfersCount: "transfers", net: "net", oldTeam: "Previous", currentTeam: "Current", nextMatch: "Next game", fixtures: "GW fixtures", fixturesPlayed: "played", fixtureUpcoming: "Upcoming", fixtureLive: "Live", fixtureProvisional: "Provisional", fixtureFinal: "Final",
  },
} as const;

export const translations = (language: Language) => copy[language];
