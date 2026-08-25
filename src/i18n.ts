import type { Language } from "./types";

const copy = {
  fi: {
    live: "LIVE", preview: "ESIKATSELU", updated: "Päivitetty", position: "Sija", manager: "Joukkue / manageri",
    gwPoints: "GW-pisteet", total: "Yhteensä", captain: "Kapteeni", transfers: "Siirrot", seasonTransfers: "Siirrot yht.", chips: "Chips", teamValue: "Arvo", benchPoints: "Penkki", progress: "Pelattu",
    form: "Vire", finished: "valmis", finishedShort: "valmis", playing: "live", toPlay: "jäljellä", toPlayShort: "jäljellä", autosubs: "Aut. vaihdot", details: "Lisätiedot", on: "Päällä", off: "Pois",
    overall: "Kokonaiskilpailu", gameweek: "Kierros", month: "Kuukausi", allMonths: "Koko kausi", noTransfers: "Ei siirtoja",
    starting: "Avaus", squad: "Kokoonpano", bench: "Penkki", best: "Paras", worst: "Heikoin", provisional: "Alustava bonus",
    highlightPlayer: "Korosta pelaaja", allPlayers: "Valitse pelaaja", inSquads: "joukkueessa", asCaptain: "kapteenina", onBench: "penkillä", effectiveOwnership: "Tehollinen omistus", startersOnly: "Vain avaus", clearPlayer: "Poista valinta", lastFive: "Viisi viimeistä",
    gameAverage: "maailman keskiarvo samoilta kierroksilta", formNote: "VIIM. 5 GW", formVersus: "vs. maailman KA samoilta kierroksilta:", feed: "TAPAHTUMAT", feedWaiting: "Odotetaan tapahtumia…", feedAll: "Kaikki tapahtumat", feedHideLowImpact: "Piilota pikkujutut", feedOnlyOurs: "Farmisarja",
    nextPriceChange: "Seuraava hintamuutos", atClock: "klo", searchPlayer: "Hae pelaajaa", allTeams: "Joukkueet", allPositions: "Pelipaikat", allClubs: "Seurat",
    risers: "Nousijat", fallers: "Laskijat", allPlayersFilter: "Kaikki", player: "Pelaaja", leagueOwners: "Omistajat", priceProgress: "Edistyminen", priceOutlook: "Ennuste", perHour: "Vauhti / h",
    ownership: "Omistus", price: "Hinta", willRise: "Nousee", willFall: "Laskee", outlookToday: "tänään", outlookTomorrow: "huomenna", outlookTwoDays: "ylihuomenna", outlookInDays: "{n} päivän päästä", couldBeSooner: "ehkä jo {day}", couldBeLater: "ehkä vasta {day}", mayRiseThisWeek: "Saattaa nousta tällä viikolla", mayFallThisWeek: "Saattaa laskea tällä viikolla", unlikelyThisWeek: "Tuskin tällä viikolla",
    priceDisclaimer: "Ennusteet on johdettu FPL:n omista siirtoluvuista ja pelaajan nykyisestä vauhdista. Ne kertovat, mihin tämä tahti johtaisi jos se pysyisi ennallaan — eivät mitä hinnoille tapahtuu. Vauhti kääntyy uutisten, rivistöjen ja otteluiden mukana, ja luvut ovat enintään viisi minuuttia vanhoja.",
    priceLocked: "Lukittu", lockedOnly: "Lukitut", priceCalibrating: "Kalibroidaan", inAbout: "noin", noPlayersMatch: "Ei osumia", playersShown: "pelaajaa", rowsPerPage: "Rivejä", previous: "Edellinen", next: "Seuraava",
    pricesUnavailable: "Hintadataa ei ole juuri nyt saatavilla", navTable: "Taulukko", navPrices: "Hinnat", priceSource: "Hintamuutosdata tulee suoraan FPL:stä.",
    rankEstimate: "Arvioitu live-yleissija", dataPreview: "GW1-data ei ole vielä avautunut — näkymässä on esikatseludata", transfer: "siirto", transfersCount: "siirtoa", net: "netto", oldTeam: "Vanha", currentTeam: "Nykyinen", nextMatch: "Seuraava peli", fixtures: "GW-ottelut", fixturesPlayed: "pelattu", fixtureUpcoming: "Tulossa", fixtureLive: "Käynnissä", fixtureProvisional: "Alustava", fixtureFinal: "Vahvistettu",
    close: "Sulje", fixtureNoStats: "Tilastot tulevat kun ottelu alkaa", statGoals: "Maalit", statOwnGoals: "Omat maalit", statAssists: "Syötöt", statCards: "Kortit", statBonus: "Bonuspisteet", statBps: "Bps", statDefCon: "Puolustuspisteet", statSaves: "Torjunnat", statPenalties: "Rangaistuspotkut",
    sortBy: "Järjestys", captainPointsLabel: "Kapteenin pisteet", defConNote: "2 pistettä: puolustajat 10:stä, muut 12:sta", defConReached: "Ylitti puolustuspisterajan", bpsNote: "Ratkaisee bonuspisteet, kolme parasta per ottelu",
  },
  en: {
    live: "LIVE", preview: "PREVIEW", updated: "Updated", position: "Pos", manager: "Team / manager",
    gwPoints: "GW points", total: "Total", captain: "Captain", transfers: "Transfers", seasonTransfers: "Total transf.", chips: "Chips", teamValue: "Value", benchPoints: "Bench", progress: "Progress",
    form: "Form", finished: "finished", finishedShort: "done", playing: "live", toPlay: "to play", toPlayShort: "left", autosubs: "Autosubs", details: "Details", on: "On", off: "Off",
    overall: "Overall", gameweek: "Gameweek", month: "Month", allMonths: "Full season", noTransfers: "No transfers",
    starting: "Starting XI", squad: "Squad", bench: "Bench", best: "Best", worst: "Lowest", provisional: "Provisional bonus",
    highlightPlayer: "Highlight player", allPlayers: "Select player", inSquads: "squads", asCaptain: "as captain", onBench: "benched", effectiveOwnership: "Effective ownership", startersOnly: "Starting XI only", clearPlayer: "Clear selection", lastFive: "Last five",
    gameAverage: "game average over the same gameweeks", formNote: "LAST 5 GW", formVersus: "vs. game average over the same gameweeks:", feed: "EVENTS", feedWaiting: "Waiting for events…", feedAll: "All events", feedHideLowImpact: "Hide low impact", feedOnlyOurs: "Farmisarja",
    nextPriceChange: "Next price change", atClock: "at", searchPlayer: "Search for player", allTeams: "Teams", allPositions: "Positions", allClubs: "Clubs",
    risers: "Risers", fallers: "Fallers", allPlayersFilter: "All", player: "Player", leagueOwners: "Owners", priceProgress: "Progress", priceOutlook: "Prediction", perHour: "Per hour",
    ownership: "Ownership", price: "Price", willRise: "Rises", willFall: "Falls", outlookToday: "today", outlookTomorrow: "tomorrow", outlookTwoDays: "in 2 days", outlookInDays: "in {n} days", couldBeSooner: "maybe already {day}", couldBeLater: "maybe not until {day}", mayRiseThisWeek: "May rise this week", mayFallThisWeek: "May fall this week", unlikelyThisWeek: "Unlikely this week",
    priceDisclaimer: "Predictions are derived from FPL's own transfer figures and each player's current rate. They show where that rate leads if it holds — not what prices will do. Rates turn with team news, line-ups and matches, and the figures are up to five minutes old.",
    priceLocked: "Locked", lockedOnly: "Locked", priceCalibrating: "Calibrating", inAbout: "in about", noPlayersMatch: "No matches", playersShown: "players", rowsPerPage: "Rows", previous: "Prev", next: "Next",
    pricesUnavailable: "Price data is not available right now", navTable: "Table", navPrices: "Prices", priceSource: "Price change data comes directly from FPL.",
    rankEstimate: "Estimated live overall rank", dataPreview: "GW1 data is not available yet — showing preview data", transfer: "transfer", transfersCount: "transfers", net: "net", oldTeam: "Previous", currentTeam: "Current", nextMatch: "Next game", fixtures: "GW fixtures", fixturesPlayed: "played", fixtureUpcoming: "Upcoming", fixtureLive: "Live", fixtureProvisional: "Provisional", fixtureFinal: "Final",
    close: "Close", fixtureNoStats: "Stats appear once the match kicks off", statGoals: "Goals", statOwnGoals: "Own goals", statAssists: "Assists", statCards: "Cards", statBonus: "Bonus points", statBps: "Bps", statDefCon: "Def. contributions", statSaves: "Saves", statPenalties: "Penalties",
    sortBy: "Sort", captainPointsLabel: "Captain points", defConNote: "2 points: defenders from 10, others from 12", defConReached: "Reached the defensive contribution threshold", bpsNote: "Decides bonus points, top three per match",
  },
} as const;

export const translations = (language: Language) => copy[language];
