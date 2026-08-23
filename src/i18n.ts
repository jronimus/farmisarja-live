import type { Language } from "./types";

const copy = {
  fi: {
    live: "LIVE", preview: "ESIKATSELU", updated: "Päivitetty", position: "Sija", manager: "Joukkue / manageri",
    gwPoints: "GW-pisteet", total: "Yhteensä", captain: "Kapteeni", transfers: "Siirrot", seasonTransfers: "Siirrot yht.", chips: "Chips", teamValue: "Arvo", benchPoints: "Penkki", progress: "Pelattu",
    form: "Vire", finished: "valmis", finishedShort: "valmis", playing: "live", toPlay: "jäljellä", toPlayShort: "jäljellä", autosubs: "Aut. vaihdot", details: "Lisätiedot", on: "Päällä", off: "Pois",
    overall: "Kokonaiskilpailu", gameweek: "Kierros", month: "Kuukausi", allMonths: "Koko kausi", noTransfers: "Ei siirtoja",
    starting: "Avaus", squad: "Kokoonpano", bench: "Penkki", best: "Paras", worst: "Heikoin", provisional: "Alustava bonus",
    highlightPlayer: "Korosta pelaaja", allPlayers: "Valitse pelaaja", inSquads: "joukkueessa", asCaptain: "kapteenina", onBench: "penkillä", effectiveOwnership: "Tehollinen omistus", startersOnly: "Vain avaus", lastFive: "Viisi viimeistä",
    feed: "TAPAHTUMAT", feedWaiting: "Odotetaan tapahtumia…", feedAll: "Kaikki tapahtumat", feedHideLowImpact: "Piilota pikkujutut", feedOnlyOurs: "Vain meidän pelaajat",
    nextPriceChange: "Seuraava hintamuutos", atClock: "klo", searchPlayer: "Hae pelaajaa", allTeams: "Kaikki joukkueet", allPositions: "Kaikki pelipaikat", allClubs: "Kaikki seurat",
    risers: "Nousijat", fallers: "Laskijat", allPlayersFilter: "Kaikki", player: "Pelaaja", leagueOwners: "Omistajat", priceProgress: "Edistyminen", priceOutlook: "Ennuste", perHour: "Vauhti / h",
    ownership: "Omistus", price: "Hinta", willRise: "Nousee", willFall: "Laskee", outlookToday: "tänään", outlookTomorrow: "huomenna", outlookTwoDays: "2 pv", noChangeAhead: "Ei muutosta näkyvissä",
    priceLocked: "Lukittu", priceCalibrating: "Kalibroidaan", inAbout: "noin", noPlayersMatch: "Ei osumia", playersShown: "pelaajaa", rowsPerPage: "Rivejä", previous: "Edellinen", next: "Seuraava",
    pricesUnavailable: "Hintadataa ei ole juuri nyt saatavilla", navTable: "Taulukko", navPrices: "Hinnat", priceSource: "Hintamuutosdata tulee suoraan FPL:stä.",
    rankEstimate: "Arvioitu live-yleissija", dataPreview: "GW1-data ei ole vielä avautunut — näkymässä on esikatseludata", transfer: "siirto", transfersCount: "siirtoa", net: "netto", oldTeam: "Vanha", currentTeam: "Nykyinen", nextMatch: "Seuraava peli", fixtures: "GW-ottelut", fixturesPlayed: "pelattu", fixtureUpcoming: "Tulossa", fixtureLive: "Käynnissä", fixtureProvisional: "Alustava", fixtureFinal: "Vahvistettu",
  },
  en: {
    live: "LIVE", preview: "PREVIEW", updated: "Updated", position: "Pos", manager: "Team / manager",
    gwPoints: "GW points", total: "Total", captain: "Captain", transfers: "Transfers", seasonTransfers: "Total transf.", chips: "Chips", teamValue: "Value", benchPoints: "Bench", progress: "Progress",
    form: "Form", finished: "finished", finishedShort: "done", playing: "live", toPlay: "to play", toPlayShort: "left", autosubs: "Autosubs", details: "Details", on: "On", off: "Off",
    overall: "Overall", gameweek: "Gameweek", month: "Month", allMonths: "Full season", noTransfers: "No transfers",
    starting: "Starting XI", squad: "Squad", bench: "Bench", best: "Best", worst: "Lowest", provisional: "Provisional bonus",
    highlightPlayer: "Highlight player", allPlayers: "Select player", inSquads: "squads", asCaptain: "as captain", onBench: "benched", effectiveOwnership: "Effective ownership", startersOnly: "Starting XI only", lastFive: "Last five",
    feed: "EVENTS", feedWaiting: "Waiting for events…", feedAll: "All events", feedHideLowImpact: "Hide low impact", feedOnlyOurs: "Only our players",
    nextPriceChange: "Next price change", atClock: "at", searchPlayer: "Search for player", allTeams: "All teams", allPositions: "All positions", allClubs: "All clubs",
    risers: "Risers", fallers: "Fallers", allPlayersFilter: "All", player: "Player", leagueOwners: "Owners", priceProgress: "Progress", priceOutlook: "Prediction", perHour: "Per hour",
    ownership: "Ownership", price: "Price", willRise: "Rises", willFall: "Falls", outlookToday: "today", outlookTomorrow: "tomorrow", outlookTwoDays: "in 2 days", noChangeAhead: "No change in sight",
    priceLocked: "Locked", priceCalibrating: "Calibrating", inAbout: "in about", noPlayersMatch: "No matches", playersShown: "players", rowsPerPage: "Rows", previous: "Prev", next: "Next",
    pricesUnavailable: "Price data is not available right now", navTable: "Table", navPrices: "Prices", priceSource: "Price change data comes directly from FPL.",
    rankEstimate: "Estimated live overall rank", dataPreview: "GW1 data is not available yet — showing preview data", transfer: "transfer", transfersCount: "transfers", net: "net", oldTeam: "Previous", currentTeam: "Current", nextMatch: "Next game", fixtures: "GW fixtures", fixturesPlayed: "played", fixtureUpcoming: "Upcoming", fixtureLive: "Live", fixtureProvisional: "Provisional", fixtureFinal: "Final",
  },
} as const;

export const translations = (language: Language) => copy[language];
