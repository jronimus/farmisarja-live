import type { Language, PlayerStat, PriceRow } from "../types";
import { defensiveActions, per90, threat, type PlayerInsight } from "./insights";

/**
 * Every figure the statistics table can show, and where each of them comes from.
 *
 * There are two sources and they answer different questions, so the catalogue says which is
 * which and the table labels it. Both now follow the reader's gameweek picker: FPL publishes
 * no window but the season, so a gameweek of it is one snapshot of the totals less the one
 * before — see `services/fplHistory.ts`. What cannot be differenced is left empty rather than
 * invented: `form` is an average over the last four fixtures, and a difference of two
 * averages is a number that means nothing.
 *
 * A reader chooses which columns to show and the choice is kept, so the table is his rather
 * than ours. That is also why there are fifty of them: the cost of an unwanted column is now
 * a checkbox rather than a crowded table.
 */

export type StatSource = "fpl" | "match" | "market";

export interface StatColumn {
  key: string;
  source: StatSource;
  /** Short enough for a table head. */
  label: { fi: string; en: string };
  /** What it means, in a sentence, for the reader who has not met it before. */
  help: { fi: string; en: string };
  value: (row: StatRow) => number | null;
  /** Decimal places; 0 prints a whole number. */
  decimals?: number;
  /** Printed with a sign, and coloured by it. */
  signed?: boolean;
}

export interface StatRow {
  player: PriceRow;
  fpl?: PlayerStat;
  match?: PlayerInsight;
}

const fpl = (pick: (stat: PlayerStat) => number) => (row: StatRow) => row.fpl ? pick(row.fpl) : null;
const match = (pick: (insight: PlayerInsight) => number) => (row: StatRow) => row.match ? pick(row.match) : null;

export const STAT_COLUMNS: StatColumn[] = [
  // --- the market ------------------------------------------------------------------------
  {
    key: "cost", source: "market", decimals: 1,
    label: { fi: "Hinta", en: "Price" },
    help: { fi: "Pelaajan nykyinen hinta miljoonissa.", en: "The player's current price in millions." },
    value: (row) => row.player.cost,
  },
  {
    key: "ownership", source: "market", decimals: 1,
    label: { fi: "Omistus %", en: "Ownership %" },
    help: { fi: "Kuinka moni pelaaja koko maailmassa omistaa hänet.", en: "How much of the entire game owns him." },
    value: (row) => row.player.ownership,
  },
  {
    key: "netTransfers", source: "market", signed: true,
    label: { fi: "Nettosiirrot", en: "Net transfers" },
    help: { fi: "Tällä kierroksella sisään tulleet miinus ulos menneet siirrot.", en: "Transfers in minus transfers out this gameweek." },
    value: (row) => row.player.netTransfers,
  },
  {
    key: "progress", source: "market", decimals: 1, signed: true,
    label: { fi: "Hintaedistyminen", en: "Price progress" },
    help: { fi: "Kuinka lähellä hinnanmuutosta hän on: 100 on se piste jossa hinta liikkuu.", en: "How close he is to a price change: 100 is where the price moves." },
    value: (row) => row.player.progress,
  },
  {
    key: "costChangeStart", source: "market", decimals: 1, signed: true,
    label: { fi: "Hintamuutos", en: "Price change" },
    help: { fi: "Paljonko hinta on liikkunut kauden alusta.", en: "How far the price has moved since the season began." },
    value: (row) => row.player.costChangeStart,
  },

  // --- FPL's own season figures ------------------------------------------------------------
  {
    key: "totalPoints", source: "fpl",
    label: { fi: "Pisteet", en: "Points" },
    help: { fi: "FPL-pisteet koko kaudelta.", en: "FPL points for the whole season." },
    value: fpl((s) => s.totalPoints),
  },
  {
    key: "eventPoints", source: "fpl",
    label: { fi: "GW-pisteet", en: "GW points" },
    help: { fi: "Kuluvan kierroksen FPL-pisteet.", en: "FPL points in the current gameweek." },
    value: fpl((s) => s.eventPoints),
  },
  {
    key: "form", source: "fpl", decimals: 1,
    label: { fi: "Muoto", en: "Form" },
    help: { fi: "FPL:n oma vire: keskimääräiset pisteet viimeisiltä 30 päivältä.", en: "FPL's own form: average points over the last 30 days." },
    value: fpl((s) => s.form),
  },
  {
    key: "pointsPerGame", source: "fpl", decimals: 1,
    label: { fi: "Pisteet / ottelu", en: "Points / game" },
    help: { fi: "Keskimääräiset pisteet per ottelu, joissa on ollut mukana.", en: "Average points per match he has featured in." },
    value: fpl((s) => s.pointsPerGame),
  },
  {
    key: "fplMinutes", source: "fpl",
    label: { fi: "Minuutit", en: "Minutes" },
    help: { fi: "Pelatut minuutit koko kaudella.", en: "Minutes played this season." },
    value: fpl((s) => s.minutes),
  },
  {
    key: "starts", source: "fpl",
    label: { fi: "Avaukset", en: "Starts" },
    help: { fi: "Kuinka monta kertaa hän on ollut avauskokoonpanossa.", en: "How many times he has been in the starting eleven." },
    value: fpl((s) => s.starts),
  },
  {
    key: "fplGoals", source: "fpl",
    label: { fi: "Maalit", en: "Goals" },
    help: { fi: "Tehdyt maalit koko kaudella.", en: "Goals scored this season." },
    value: fpl((s) => s.goals),
  },
  {
    key: "fplAssists", source: "fpl",
    label: { fi: "Syötöt", en: "Assists" },
    help: { fi: "Maalisyötöt koko kaudella.", en: "Assists this season." },
    value: fpl((s) => s.assists),
  },
  {
    key: "cleanSheets", source: "fpl",
    label: { fi: "Nollapelit", en: "Clean sheets" },
    help: { fi: "Ottelut joissa joukkue ei päästänyt maalia hänen ollessaan kentällä vähintään 60 minuuttia.", en: "Matches where his side conceded nothing while he played at least 60 minutes." },
    value: fpl((s) => s.cleanSheets),
  },
  {
    key: "fplGoalsConceded", source: "fpl",
    label: { fi: "Päästetyt", en: "Conceded" },
    help: { fi: "Maalit jotka joukkue on päästänyt hänen ollessaan kentällä.", en: "Goals his side has conceded while he was on the pitch." },
    value: fpl((s) => s.goalsConceded),
  },
  {
    key: "bonus", source: "fpl",
    label: { fi: "Bonus", en: "Bonus" },
    help: { fi: "Bonuspisteet: kolme parasta per ottelu saavat 3, 2 ja 1 pistettä.", en: "Bonus points: the top three in a match get 3, 2 and 1." },
    value: fpl((s) => s.bonus),
  },
  {
    key: "bps", source: "fpl",
    label: { fi: "BPS", en: "BPS" },
    help: { fi: "Bonuspistejärjestelmän raakapisteet, joista bonukset ratkaistaan.", en: "The raw bonus points system score that decides who gets the bonus." },
    value: fpl((s) => s.bps),
  },
  {
    key: "ictIndex", source: "fpl", decimals: 1,
    label: { fi: "ICT", en: "ICT" },
    help: { fi: "FPL:n oma yhdistelmäluku vaikutuksesta, luovuudesta ja uhasta.", en: "FPL's own combined index of influence, creativity and threat." },
    value: fpl((s) => s.ictIndex),
  },
  {
    key: "influence", source: "fpl", decimals: 1,
    label: { fi: "Vaikutus", en: "Influence" },
    help: { fi: "FPL:n arvio siitä, kuinka paljon pelaaja vaikutti otteluiden lopputuloksiin.", en: "FPL's estimate of how much a player affected match outcomes." },
    value: fpl((s) => s.influence),
  },
  {
    key: "creativity", source: "fpl", decimals: 1,
    label: { fi: "Luovuus", en: "Creativity" },
    help: { fi: "FPL:n arvio maalipaikkojen luomisesta.", en: "FPL's estimate of chance creation." },
    value: fpl((s) => s.creativity),
  },
  {
    key: "threatIndex", source: "fpl", decimals: 1,
    label: { fi: "Uhka", en: "Threat" },
    help: { fi: "FPL:n arvio maalintekouhasta.", en: "FPL's estimate of goal threat." },
    value: fpl((s) => s.threat),
  },
  {
    key: "fplXg", source: "fpl", decimals: 2,
    label: { fi: "xG (FPL)", en: "xG (FPL)" },
    help: { fi: "Maaliodottama koko kaudelta FPL:n omana lukuna.", en: "Expected goals for the season, as FPL publishes it." },
    value: fpl((s) => s.expectedGoals),
  },
  {
    key: "fplXa", source: "fpl", decimals: 2,
    label: { fi: "xA (FPL)", en: "xA (FPL)" },
    help: { fi: "Syöttöodottama koko kaudelta FPL:n omana lukuna.", en: "Expected assists for the season, as FPL publishes it." },
    value: fpl((s) => s.expectedAssists),
  },
  {
    key: "fplXgc", source: "fpl", decimals: 2,
    label: { fi: "xGC", en: "xGC" },
    help: { fi: "Odotetut päästetyt maalit hänen ollessaan kentällä — pieni luku kertoo tiiviistä puolustuksesta.", en: "Expected goals conceded while he is on the pitch — a low number means a tight defence." },
    value: fpl((s) => s.expectedGoalsConceded),
  },
  {
    key: "fplDefCon", source: "fpl",
    label: { fi: "Puolustuspisteet", en: "Def. contributions" },
    help: { fi: "FPL:n oma puolustussuoritusten laskuri. Kaksi pistettä irtoaa puolustajalle 10:stä ja muille 12:sta.", en: "FPL's own defensive contribution count. Two points at 10 for a defender and 12 for anyone else." },
    value: fpl((s) => s.defensiveContribution),
  },
  {
    key: "fplCbi", source: "fpl",
    label: { fi: "Katkot", en: "CBI" },
    help: { fi: "Puskut, blokit ja katkot yhteensä.", en: "Clearances, blocks and interceptions combined." },
    value: fpl((s) => s.clearancesBlocksInterceptions),
  },
  {
    key: "fplTackles", source: "fpl",
    label: { fi: "Taklaukset", en: "Tackles" },
    help: { fi: "Onnistuneet taklaukset.", en: "Tackles won." },
    value: fpl((s) => s.tackles),
  },
  {
    key: "fplRecoveries", source: "fpl",
    label: { fi: "Riistot", en: "Recoveries" },
    help: { fi: "Pallonriistot. FPL laskee ne puolustuspisteisiin vain keskikenttä- ja hyökkääjäpelaajilla.", en: "Ball recoveries. FPL only counts them towards defensive points for midfielders and forwards." },
    value: fpl((s) => s.recoveries),
  },
  {
    key: "fplSaves", source: "fpl",
    label: { fi: "Torjunnat", en: "Saves" },
    help: { fi: "Maalivahdin torjunnat. Kolme torjuntaa on yksi piste.", en: "Goalkeeper saves. Three saves is one point." },
    value: fpl((s) => s.saves),
  },
  {
    key: "penaltiesSaved", source: "fpl",
    label: { fi: "Torjutut pilkut", en: "Pens saved" },
    help: { fi: "Torjutut rangaistuspotkut, viisi pistettä kappale.", en: "Penalties saved, five points each." },
    value: fpl((s) => s.penaltiesSaved),
  },
  {
    key: "cards", source: "fpl",
    label: { fi: "Kortit", en: "Cards" },
    help: { fi: "Keltaiset ja punaiset yhteensä.", en: "Yellow and red cards combined." },
    value: fpl((s) => s.yellowCards + s.redCards),
  },
  {
    key: "dreamteam", source: "fpl",
    label: { fi: "Kierroksen 11", en: "Dream team" },
    help: { fi: "Kuinka monta kertaa hän on päässyt kierroksen parhaaseen kokoonpanoon.", en: "How many times he has made the gameweek's best eleven." },
    value: fpl((s) => s.dreamteamCount),
  },
  {
    key: "valueSeason", source: "fpl", decimals: 1,
    label: { fi: "Pisteet / £", en: "Points / £" },
    help: { fi: "Pisteitä miljoonaa kohden — halpa pelaaja voi voittaa tässä kalliin.", en: "Points per million — where a cheap player can beat an expensive one." },
    value: fpl((s) => s.valueSeason),
  },
  {
    key: "penaltiesOrder", source: "fpl",
    label: { fi: "Pilkkujärjestys", en: "Penalty order" },
    help: { fi: "Monesko rangaistuspotkujen ottaja hän on seurassaan. 1 on ykkösvalinta.", en: "Where he stands in his club's penalty queue. 1 is the first choice." },
    value: (row) => row.fpl?.penaltiesOrder ?? null,
  },
  {
    key: "cornersOrder", source: "fpl",
    label: { fi: "Kulmajärjestys", en: "Corner order" },
    help: { fi: "Monesko kulmapotkujen ottaja hän on seurassaan.", en: "Where he stands in his club's corner queue." },
    value: (row) => row.fpl?.cornersOrder ?? null,
  },

  // --- the match statistics ---------------------------------------------------------------
  {
    key: "matchMinutes", source: "match",
    label: { fi: "Minuutit", en: "Minutes" },
    help: { fi: "Pelatut minuutit valituilla kierroksilla.", en: "Minutes played in the selected gameweeks." },
    value: match((i) => i.minutes),
  },
  {
    key: "appearances", source: "match",
    label: { fi: "Ottelut", en: "Matches" },
    help: { fi: "Ottelut joissa hän pelasi vähintään minuutin.", en: "Matches in which he played at least a minute." },
    value: match((i) => i.appearances),
  },
  {
    key: "xg", source: "match", decimals: 2,
    label: { fi: "xG", en: "xG" },
    help: { fi: "Maaliodottama: kuinka monta maalia hänen paikkansa olisivat keskimäärin tuottaneet.", en: "Expected goals: how many goals his chances would have produced on average." },
    value: match((i) => i.xg),
  },
  {
    key: "xa", source: "match", decimals: 2,
    label: { fi: "xA", en: "xA" },
    help: { fi: "Syöttöodottama: kuinka monta maalisyöttöä hänen luomansa paikat olisivat keskimäärin tuottaneet.", en: "Expected assists: how many assists the chances he created would have produced on average." },
    value: match((i) => i.xa),
  },
  {
    key: "threat", source: "match", decimals: 2,
    label: { fi: "xG + xA", en: "xG + xA" },
    help: { fi: "Maali- ja syöttöodottama yhteensä: pelaajan koko hyökkäysuhka yhtenä lukuna.", en: "Expected goals and assists together: a player's whole attacking threat as one number." },
    value: match(threat),
  },
  {
    key: "matchGoals", source: "match",
    label: { fi: "Maalit", en: "Goals" },
    help: { fi: "Maalit valituilla kierroksilla.", en: "Goals in the selected gameweeks." },
    value: match((i) => i.goals),
  },
  {
    key: "matchAssists", source: "match",
    label: { fi: "Syötöt", en: "Assists" },
    help: { fi: "Maalisyötöt valituilla kierroksilla.", en: "Assists in the selected gameweeks." },
    value: match((i) => i.assists),
  },
  {
    key: "difference", source: "match", decimals: 2, signed: true,
    label: { fi: "Yli / ali", en: "Over / under" },
    help: {
      fi: "Toteutuneet maalit ja syötöt miinus odottama. Plussalla oleva on viimeistellyt paikkansa yli odotusten, miinuksella oleva alle. Ei tuomio kummallekaan — se erottaa hyvän vireen hyvästä tuurista.",
      en: "Actual goals and assists minus what the chances were worth. Above zero he has finished better than his chances deserved, below it worse. Neither is a verdict — it separates a run of form from a run of luck.",
    },
    value: match((i) => i.goals + i.assists - threat(i)),
  },
  {
    key: "threatPer90", source: "match", decimals: 2,
    label: { fi: "xG + xA / 90", en: "xG + xA / 90" },
    help: { fi: "Hyökkäysuhka yhdeksääkymmentä minuuttia kohden — ainoa tapa verrata vaihtomiestä ja peruspelaajaa.", en: "Attacking threat per ninety minutes — the only way to compare a substitute with an ever-present." },
    value: match((i) => per90(threat(i), i.minutes)),
  },
  {
    key: "shots", source: "match",
    label: { fi: "Laukaukset", en: "Shots" },
    help: { fi: "Laukaukset yhteensä.", en: "Total shots." },
    value: match((i) => i.shots),
  },
  {
    key: "shotsOnTarget", source: "match",
    label: { fi: "Laukaukset kohti", en: "Shots on target" },
    help: { fi: "Maalia kohti menneet laukaukset.", en: "Shots on target." },
    value: match((i) => i.shotsOnTarget),
  },
  {
    key: "xgot", source: "match", decimals: 2,
    label: { fi: "xGOT", en: "xGOT" },
    help: { fi: "Maalia kohti menneiden laukausten odottama: kuinka hyviä laukaukset olivat sen jälkeen kun ne lähtivät.", en: "Expected goals on target: how good the shots were once they had been struck." },
    value: match((i) => i.xgot),
  },
  {
    key: "bigChancesMissed", source: "match",
    label: { fi: "Isot paikat hukkaan", en: "Big chances missed" },
    help: { fi: "Selvät maalipaikat jotka jäivät käyttämättä.", en: "Clear chances that went unconverted." },
    value: match((i) => i.bigChancesMissed),
  },
  {
    key: "chancesCreated", source: "match",
    label: { fi: "Luodut paikat", en: "Chances created" },
    help: { fi: "Syötöt joista syntyi laukaus.", en: "Passes that led to a shot." },
    value: match((i) => i.chancesCreated),
  },
  {
    key: "boxTouches", source: "match",
    label: { fi: "Kosketukset boksissa", en: "Touches in the box" },
    help: { fi: "Pallokosketukset vastustajan rangaistusalueella — kertoo kuinka usein hän pääsee vaarallisille paikoille.", en: "Touches in the opposition penalty area — how often he gets into dangerous positions." },
    value: match((i) => i.boxTouches),
  },
  {
    key: "matchDefensive", source: "match",
    label: { fi: "Puolustustoimet", en: "Defensive actions" },
    help: { fi: "Puskut, blokit, katkot ja taklaukset — ja keskikenttä- ja hyökkääjäpelaajilla myös riistot, kuten FPL ne laskee.", en: "Clearances, blocks, interceptions and tackles — plus recoveries for midfielders and forwards, the way FPL counts them." },
    value: (row) => row.match ? defensiveActions(row.match, row.player.position) : null,
  },
  {
    key: "matchSaves", source: "match",
    label: { fi: "Torjunnat", en: "Saves" },
    help: { fi: "Torjunnat valituilla kierroksilla.", en: "Saves in the selected gameweeks." },
    value: match((i) => i.saves),
  },
  {
    key: "goalsPrevented", source: "match", decimals: 2, signed: true,
    label: { fi: "Estetyt maalit", en: "Goals prevented" },
    help: { fi: "Maalivahdin torjuntojen arvo: paljonko vähemmän hän päästi kuin laukausten laatu olisi edellyttänyt.", en: "The value of a keeper's saves: how much less he conceded than the quality of the shots deserved." },
    value: match((i) => i.goalsPrevented),
  },
];

export const COLUMNS_BY_KEY = new Map(STAT_COLUMNS.map((column) => [column.key, column]));

/**
 * What a reader sees before he has chosen anything.
 *
 * Points and price because they are why anybody is here, expected goals and assists apart
 * because they answer different questions, and the over/under because it is the one column
 * on this page that cannot be got anywhere else.
 */
export const DEFAULT_COLUMNS = ["cost", "totalPoints", "form", "matchMinutes", "xg", "xa", "matchGoals", "matchAssists", "difference"];

export const label = (column: StatColumn, language: Language) => column.label[language];
export const help = (column: StatColumn, language: Language) => column.help[language];
