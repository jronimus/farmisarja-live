import type { DashboardData, FixtureStatCategory, GameweekFixture, ManagerRow, SquadPlayer } from "./types";
import type { FeedEvent } from "./services/liveFeed";

/**
 * Demo data for `?demo=1`.
 *
 * It exists to stress the layout and to let a feature be looked at when no gameweek is
 * running, so it has to be **plausible**, not merely present. Everything below is derived
 * rather than typed in: the players are real, lifted from the 2026-27 bootstrap with their
 * own clubs, positions, prices and ownership; the squads are legal ones; and every figure
 * a manager row shows is computed from that manager's own squad.
 *
 * The columns are deliberately out of step with each other. The old set listed form in the
 * same order as the season total, so sorting by form could not be told from sorting by
 * total and the column could not be tested at all. Overall rank against total points is
 * the one pair here that moves together, because it does in the game.
 */

type PoolEntry = readonly [string, string, number, SquadPlayer["position"], number, number];

/** name, club, club code, position, price, ownership — all real. */
const playerPool: readonly PoolEntry[] = [
  ["Raya", "ARS", 1, "GK", 6.0, 37.8], ["Calafiori", "ARS", 1, "DEF", 5.5, 40.3], ["Gabriel", "ARS", 1, "DEF", 8.0, 29.6],
  ["Tzolis", "ARS", 1, "MID", 6.5, 25.4], ["Rice", "ARS", 1, "MID", 7.5, 17.9], ["Gyökeres", "ARS", 1, "FWD", 7.5, 8.5],
  ["Martinez", "AVL", 2, "GK", 5.0, 4.4], ["Cash", "AVL", 2, "DEF", 4.5, 8.7], ["A.García", "AVL", 2, "DEF", 4.0, 1.8],
  ["McGinn", "AVL", 2, "MID", 5.5, 3.2], ["Buendía", "AVL", 2, "MID", 6.0, 1.3], ["Watkins", "AVL", 2, "FWD", 8.0, 10.1],
  ["Petrović", "BOU", 3, "GK", 4.5, 3.3], ["Truffert", "BOU", 3, "DEF", 5.5, 4.4], ["Hill", "BOU", 3, "DEF", 5.5, 0.9],
  ["Rayan", "BOU", 3, "MID", 6.5, 2.8], ["Tavernier", "BOU", 3, "MID", 6.0, 1.7], ["Evanilson", "BOU", 3, "FWD", 6.0, 2.5],
  ["Kelleher", "BRE", 4, "GK", 5.0, 6.0], ["Kayode", "BRE", 4, "DEF", 4.5, 4.2], ["Ajer", "BRE", 4, "DEF", 4.5, 3.6],
  ["M.Sangaré", "BRE", 4, "MID", 5.5, 4.3], ["Schade", "BRE", 4, "MID", 6.0, 3.6], ["Thiago", "BRE", 4, "FWD", 8.0, 17.2],
  ["Verbruggen", "BHA", 5, "GK", 4.5, 21.6], ["F.Kadıoğlu", "BHA", 5, "DEF", 4.5, 2.8], ["De Cuyper", "BHA", 5, "DEF", 4.5, 2.6],
  ["Groß", "BHA", 5, "MID", 5.5, 14.1], ["Gomez", "BHA", 5, "MID", 5.0, 3.9], ["Georginio", "BHA", 5, "FWD", 5.5, 0.9],
  ["Sánchez", "CHE", 6, "GK", 5.0, 2.4], ["James", "CHE", 6, "DEF", 5.5, 10.3], ["Lacroix", "CHE", 6, "DEF", 6.0, 9.1],
  ["Rogers", "CHE", 6, "MID", 7.5, 24.3], ["Palmer", "CHE", 6, "MID", 9.5, 10.7], ["João Pedro", "CHE", 6, "FWD", 7.5, 64.0],
  ["Dovin", "COV", 7, "GK", 4.0, 1.6], ["van Ewijk", "COV", 7, "DEF", 4.0, 13.7], ["Thomas", "COV", 7, "DEF", 4.0, 8.1],
  ["Andrews", "COV", 7, "MID", 4.5, 0.7], ["Simms", "COV", 7, "FWD", 5.0, 0.9], ["Henderson", "CRY", 8, "GK", 5.0, 1.9],
  ["Muñoz", "CRY", 8, "DEF", 5.5, 9.5], ["Mitchell", "CRY", 8, "DEF", 4.5, 6.2], ["Hughes", "CRY", 8, "MID", 4.5, 11.8],
  ["Sarr", "CRY", 8, "MID", 6.5, 4.1], ["Mateta", "CRY", 8, "FWD", 6.5, 5.7], ["Pickford", "EVE", 9, "GK", 5.5, 8.3],
  ["Tarkowski", "EVE", 9, "DEF", 6.0, 8.8], ["Branthwaite", "EVE", 9, "DEF", 5.5, 1.7], ["Ndiaye", "EVE", 9, "MID", 6.0, 16.0],
  ["Dewsbury-Hall", "EVE", 9, "MID", 6.5, 3.9], ["Beto", "EVE", 9, "FWD", 5.5, 2.7], ["Leno", "FUL", 10, "GK", 4.5, 3.1],
  ["Robinson", "FUL", 10, "DEF", 4.5, 1.7], ["Bassey", "FUL", 10, "DEF", 4.5, 0.8], ["Reed", "FUL", 10, "MID", 4.5, 1.6],
  ["Iwobi", "FUL", 10, "MID", 5.5, 1.0], ["Kusi-Asare", "FUL", 10, "FWD", 4.5, 7.4], ["Phillips", "HUL", 11, "GK", 4.0, 1.6],
  ["Targett", "HUL", 11, "DEF", 4.0, 2.4], ["Egan", "HUL", 11, "DEF", 4.0, 1.7], ["Slater", "HUL", 11, "MID", 4.5, 3.3],
  ["Crooks", "HUL", 11, "MID", 4.5, 0.7], ["McBurnie", "HUL", 11, "FWD", 5.5, 1.5], ["Palmer", "IPS", 12, "GK", 4.0, 4.7],
  ["Diop", "IPS", 12, "DEF", 4.0, 18.1], ["Davis", "IPS", 12, "DEF", 4.0, 5.2], ["McAteer", "IPS", 12, "MID", 4.5, 1.4],
  ["Maeda", "IPS", 12, "MID", 5.5, 0.4], ["Walle Egeli", "IPS", 12, "FWD", 4.5, 2.3], ["Trafford", "LEE", 13, "GK", 5.0, 3.2],
  ["Rodon", "LEE", 13, "DEF", 4.5, 3.6], ["Muharemović", "LEE", 13, "DEF", 5.0, 3.4], ["Wilson", "LEE", 13, "MID", 6.5, 6.2],
  ["Ampadu", "LEE", 13, "MID", 5.5, 1.4], ["Calvert-Lewin", "LEE", 13, "FWD", 6.0, 30.6], ["A.Becker", "LIV", 14, "GK", 5.5, 3.7],
  ["Virgil", "LIV", 14, "DEF", 6.5, 19.5], ["Kerkez", "LIV", 14, "DEF", 5.5, 3.8], ["Szoboszlai", "LIV", 14, "MID", 7.0, 41.9],
  ["Wirtz", "LIV", 14, "MID", 7.5, 12.6], ["Isak", "LIV", 14, "FWD", 9.0, 17.0], ["Donnarumma", "MCI", 15, "GK", 5.5, 8.3],
  ["O'Reilly", "MCI", 15, "DEF", 6.5, 21.4], ["Guéhi", "MCI", 15, "DEF", 6.0, 17.5], ["Semenyo", "MCI", 15, "MID", 8.5, 25.9],
  ["Cherki", "MCI", 15, "MID", 7.5, 8.5], ["Haaland", "MCI", 15, "FWD", 15.5, 69.1], ["Lammens", "MUN", 16, "GK", 5.0, 16.3],
  ["Shaw", "MUN", 16, "DEF", 4.5, 20.9], ["Maguire", "MUN", 16, "DEF", 5.0, 18.0], ["B.Fernandes", "MUN", 16, "MID", 12.0, 50.9],
  ["Mbeumo", "MUN", 16, "MID", 8.0, 37.9], ["Šeško", "MUN", 16, "FWD", 7.0, 1.5], ["Pope", "NEW", 17, "GK", 5.0, 1.4],
  ["Hall", "NEW", 17, "DEF", 5.0, 3.7], ["Burn", "NEW", 17, "DEF", 5.0, 2.4], ["Barnes", "NEW", 17, "MID", 6.0, 1.1],
  ["Elanga", "NEW", 17, "MID", 6.0, 1.0], ["Wissa", "NEW", 17, "FWD", 6.0, 1.9], ["Sels", "NFO", 18, "GK", 5.0, 1.6],
  ["N.Williams", "NFO", 18, "DEF", 5.0, 9.9], ["Aina", "NFO", 18, "DEF", 4.5, 3.6], ["Gibbs-White", "NFO", 18, "MID", 8.0, 11.4],
  ["Yates", "NFO", 18, "MID", 4.5, 1.7], ["Igor Jesus", "NFO", 18, "FWD", 6.0, 4.2], ["Kinsky", "TOT", 19, "GK", 4.5, 23.8],
  ["Pedro Porro", "TOT", 19, "DEF", 5.5, 15.3], ["Van Hecke", "TOT", 19, "DEF", 5.0, 10.5], ["Tonali", "TOT", 19, "MID", 5.5, 4.2],
  ["Fernandes", "TOT", 19, "MID", 6.0, 1.9], ["Richarlison", "TOT", 19, "FWD", 6.0, 3.2], ["Roefs", "SUN", 20, "GK", 5.0, 4.3],
  ["Hume", "SUN", 20, "DEF", 4.5, 6.9], ["Ballard", "SUN", 20, "DEF", 5.0, 5.5], ["E.Le Fée", "SUN", 20, "MID", 6.0, 9.9],
  ["Xhaka", "SUN", 20, "MID", 5.5, 4.5], ["Brobbey", "SUN", 20, "FWD", 6.0, 13.9],
] as const;

/** Ten fixtures across the three states a gameweek passes through. */
const fixtureTable: ReadonlyArray<readonly [string, string, SquadPlayer["state"]]> = [
  ["NFO", "MUN", "finished"], ["IPS", "SUN", "finished"], ["CRY", "COV", "finished"],
  ["TOT", "BOU", "live"], ["MCI", "ARS", "live"], ["FUL", "CHE", "live"],
  ["NEW", "EVE", "upcoming"], ["LIV", "BHA", "upcoming"], ["AVL", "LEE", "upcoming"], ["BRE", "HUL", "upcoming"],
] as const;

const hour = 3_600_000;

const clubFixture = new Map<string, { opponent: string; venue: "H" | "A"; state: SquadPlayer["state"]; difficulty: number; kickoff: string }>();
fixtureTable.forEach(([home, away, state], index) => {
  // Two of the four to come are later today and two are on later days, so the kick-off
  // label has both of its forms to render.
  const kickoff = new Date(Date.now() + (state === "upcoming" ? (index - 6) * 26 * hour + 3 * hour : -2 * hour)).toISOString();
  clubFixture.set(home, { opponent: away, venue: "H", state, difficulty: 1 + (index % 5), kickoff });
  clubFixture.set(away, { opponent: home, venue: "A", state, difficulty: 1 + ((index + 2) % 5), kickoff });
});

/**
 * One id per footballer, not per squad slot.
 *
 * The ids used to be `seed * 1000 + index`, so the same player in two squads was two
 * different players to every piece of code that joins on an id — which is all of them.
 * Nothing could ever be shared, and the ownership column and the highlight had nothing to
 * find in a ten-manager league.
 */
const poolIds = new Map(playerPool.map((entry, index) => [entry[0] + entry[1], index + 1]));

/** A settled score has a shape: mostly ones and twos, the occasional haul. */
const SCORES = [1, 2, 2, 2, 3, 5, 6, 8, 9, 13] as const;
const hash = (value: number) => Math.abs(Math.imul(value, 2654435761)) % 1_000_003;

const squadQuota = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
/** Legal starting elevens, one goalkeeper and ten out. */
const formations = [[4, 4, 2], [3, 5, 2], [4, 3, 3], [5, 3, 2], [3, 4, 3]] as const;

/**
 * Fifteen players, two of them goalkeepers, at most three from any one club — the rules
 * the game itself enforces, so the panel is never asked to draw a squad that could not
 * exist. Managers overlap, as they do in a real league, which is what gives the ownership
 * highlight something to find.
 */
function makeSquad(seed: number): SquadPlayer[] {
  const taken: PoolEntry[] = [];
  const perClub = new Map<string, number>();
  const need: Record<string, number> = { ...squadQuota };

  // The popular players first, in as many squads as their ownership suggests. A league
  // where nobody shares a player is not a league, and the ownership highlight has nothing
  // to find in one: Haaland is in eight of the ten here, B.Fernandes in six, Calafiori in
  // four, exactly the case that column exists for.
  for (const [name, inSquads] of [["Haaland", 8], ["B.Fernandes", 6], ["Calafiori", 4], ["Szoboszlai", 3]] as const) {
    if (seed > inSquads) continue;
    const entry = playerPool.find((player) => player[0] === name)!;
    need[entry[3]] -= 1;
    perClub.set(entry[1], (perClub.get(entry[1]) ?? 0) + 1);
    taken.push(entry);
  }

  const start = hash(seed * 97) % playerPool.length;
  // Coprime with the pool size, which is 119 = 7 x 17: a stride sharing a factor with it
  // walks a fraction of the pool and the squad comes back short.
  const stride = [13, 23, 29, 31, 37][seed % 5];
  for (let step = 0; step < playerPool.length * 2 && taken.length < 15; step += 1) {
    const entry = playerPool[(start + step * stride) % playerPool.length];
    const [name, club, , position] = entry;
    if (need[position] === 0) continue;
    if ((perClub.get(club) ?? 0) >= 3) continue;
    if (taken.some((player) => player[0] === name)) continue;
    need[position] -= 1;
    perClub.set(club, (perClub.get(club) ?? 0) + 1);
    taken.push(entry);
  }

  const [defenders, midfielders, forwards] = formations[seed % formations.length];
  const line = (position: SquadPlayer["position"]) => taken.filter((entry) => entry[3] === position);
  const starters = [
    ...line("GK").slice(0, 1),
    ...line("DEF").slice(0, defenders),
    ...line("MID").slice(0, midfielders),
    ...line("FWD").slice(0, forwards),
  ];
  const bench = [line("GK")[1], ...taken.filter((entry) => entry[3] !== "GK" && !starters.includes(entry))];
  const ordered = [...starters, ...bench].filter((entry): entry is PoolEntry => Boolean(entry));
  if (ordered.length !== 15) throw new Error(`demo squad ${seed} has ${ordered.length} players`);
  // The armband goes on an outfield starter.
  const captainIndex = 1 + (hash(seed * 3) % 10);

  return ordered.map((entry, index) => {
    const [name, club, clubCode, position, cost, ownership] = entry;
    const fixture = clubFixture.get(club)!;
    // The same player scores the same for everyone, which is the other half of sharing an
    // id: two managers holding him cannot see two different numbers.
    const settled = SCORES[hash(poolIds.get(name + club)! * 31) % SCORES.length];
    return {
      id: poolIds.get(name + club)!,
      squadPosition: index + 1,
      name, club, clubCode, position, cost, ownership,
      opponent: fixture.opponent,
      venue: fixture.venue,
      difficulty: fixture.difficulty,
      kickoff: fixture.kickoff,
      points: fixture.state === "upcoming" ? 0 : fixture.state === "live" ? Math.max(1, Math.round(settled / 2)) : settled,
      bonus: 0,
      minutes: fixture.state === "finished" ? 90 : fixture.state === "live" ? 61 : 0,
      state: fixture.state,
      starter: index < 11,
      captain: index === captainIndex,
      viceCaptain: index === (captainIndex % 10) + 1,
    };
  });
}

const teamNames = [
  ["Expected Toulouse", "Joni R."], ["No Kane No Gain", "Mikko L."], ["Ctrl Alt De Ligt", "Antti K."],
  ["Tea & Busquets", "Sami P."], ["Game of Throw-Ins", "Ville H."], ["Jankon betoni", "Mikko Knuuttila"],
  ["Tussulan voittajat", "Ilpo Hed"], ["Pirkkolan Beckham", "Teemu Honkanen"], ["KERPA RULZ", "Sami Karki"],
  ["Karjarannan Hurjat", "Santeri Aijo"],
] as const;

/**
 * The season so far. Form, value, bench and transfers each rank differently from the total
 * and from each other, so every sortable column can be told apart from every other one.
 * The leader is a poor form side and the seventh is the best of them, which is the case
 * the form column exists to show.
 */
const seasonTable = [
  { total: 1843, form: 47, value: 104.2, bench: 94, transfers: 26, hits: 12, chip: "TC" as string | undefined, used: ["FH"] },
  { total: 1828, form: 71, value: 101.3, bench: 115, transfers: 31, hits: 24, chip: undefined, used: ["BB"] },
  { total: 1802, form: 39, value: 100.8, bench: 68, transfers: 22, hits: 4, chip: "BB", used: ["WC"] },
  { total: 1763, form: 63, value: 99.9, bench: 124, transfers: 35, hits: 36, chip: undefined, used: ["FH", "BB"] },
  { total: 1735, form: 52, value: 100.4, bench: 112, transfers: 29, hits: 16, chip: "WC", used: ["TC"] },
  { total: 1714, form: 44, value: 100.1, bench: 106, transfers: 24, hits: 8, chip: undefined, used: [] },
  { total: 1688, form: 68, value: 99.6, bench: 93, transfers: 19, hits: 0, chip: undefined, used: ["FH"] },
  { total: 1657, form: 41, value: 98.8, bench: 114, transfers: 27, hits: 20, chip: "FH", used: [] },
  { total: 1606, form: 58, value: 98.2, bench: 145, transfers: 34, hits: 40, chip: undefined, used: ["WC"] },
  { total: 1578, form: 36, value: 97.9, bench: 86, transfers: 17, hits: 4, chip: undefined, used: ["BB", "TC"] },
];

const formGameweeks = [19, 20, 21, 22, 23];

const managers: ManagerRow[] = seasonTable.map((season, index) => {
  const seed = index + 1;
  const squad = makeSquad(seed);
  const multiplier = season.chip === "TC" ? 3 : 2;
  const scoring = season.chip === "BB" ? squad : squad.filter((player) => player.starter);
  const captain = squad.find((player) => player.captain)!;
  // The gameweek total is what this manager's own eleven has scored, not a number typed in
  // beside it: open the squad and the arithmetic has to hold.
  const gameweekPoints = scoring.reduce((sum, player) => sum + player.points * (player.captain ? multiplier : 1), 0);
  // Five weeks scattered around the manager's own form mean, so the series and the average
  // the column shows agree with each other.
  const form = formGameweeks.map((_, week) => Math.max(18, season.form + (hash(seed * 17 + week * 5) % 23) - 11));
  const leaving = playerPool[hash(seed * 5) % playerPool.length];
  const arriving = squad[hash(seed * 11) % 11];
  return {
    id: 100 + seed,
    position: index + 1,
    previousPosition: index + 1 + ((hash(seed * 7) % 3) - 1),
    teamName: teamNames[index][0],
    managerName: teamNames[index][1],
    gameweekPoints,
    provisionalBonus: 0,
    totalPoints: season.total,
    // Rank follows the total, as it has to, spaced the way a real table is.
    overallRank: 120_000 + (9 - index) * 15_000 + (hash(seed * 13) % 40_000),
    // Equal to the total above, so demo rows read as FPL's own exact rank and the demo
    // never asks a Worker it has none of for a curve.
    rankedPoints: season.total,
    previousOverallRank: 140_000 + (9 - index) * 15_000 + (hash(seed * 19) % 40_000),
    captain: captain.name,
    captainPoints: captain.points * multiplier,
    transfers: index % 4 === 3 ? [] : [{ out: leaving[0], in: arriving.name, outPoints: hash(seed) % 6, inPoints: arriving.points }],
    hit: index % 3 === 0 ? 4 : 0,
    chip: season.chip,
    availableChips: ["WC", "FH", "BB", "TC"],
    usedChips: [...season.used],
    freeTransfersAfter: 1 + (index % 2),
    seasonTransfers: season.transfers,
    seasonHitPoints: season.hits,
    benchPointsBeforeGw: season.bench,
    teamValue: season.value,
    previousTeamValue: Math.round((season.value - ((hash(seed * 23) % 9) - 4) / 10) * 10) / 10,
    finished: squad.filter((player) => player.starter && player.state === "finished").length,
    live: squad.filter((player) => player.starter && player.state === "live").length,
    upcoming: squad.filter((player) => player.starter && player.state === "upcoming").length,
    form,
    formGameweeks,
    formRankMovement: form.map((value, week) => week === 0 ? 0 : Math.sign(value - form[week - 1])),
    squad,
  };
});

/**
 * A plausible stat breakdown per side, so the fixture modal's accordion has something real
 * to expand in `?demo=1` — the only way to see it without a live gameweek. Built from the
 * same pool the squads come from, so a name in the modal is a name the table already knows.
 */
function demoFixtureStats(home: string, away: string, index: number): FixtureStatCategory[] {
  const club = (code: string) => playerPool.filter((entry) => entry[1] === code);
  const side = (code: string, offset: number) => {
    const players = club(code);
    return players.length ? players[(index + offset) % players.length] : undefined;
  };
  const scorer = side(home, 0);
  const assister = side(home, 1);
  const secondScorer = side(away, 0);
  const cardHome = side(home, 2);
  const cardAway = side(away, 1);
  const keeperHome = club(home).find((entry) => entry[3] === "GK");
  const keeperAway = club(away).find((entry) => entry[3] === "GK");
  const defHome = side(home, 3);
  const defAway = side(away, 2);
  const categories: Array<[FixtureStatCategory["key"], FixtureStatCategory["entries"]]> = [
    ["goals", [scorer && { name: scorer[0], club: scorer[1], value: 1 }, index % 2 === 0 && secondScorer && { name: secondScorer[0], club: secondScorer[1], value: 1 }].filter((entry): entry is { name: string; club: string; value: number } => Boolean(entry))],
    ["assists", assister ? [{ name: assister[0], club: assister[1], value: 1 }] : []],
    ["bonus", [scorer && { name: scorer[0], club: scorer[1], value: 3 }, assister && { name: assister[0], club: assister[1], value: 2 }].filter((entry): entry is { name: string; club: string; value: number } => Boolean(entry))],
    ["cards", [cardHome && { name: cardHome[0], club: cardHome[1], value: 1, variant: "yellow" as const }, cardAway && { name: cardAway[0], club: cardAway[1], value: 1, variant: "yellow" as const }].filter((entry): entry is { name: string; club: string; value: number; variant: "yellow" } => Boolean(entry))],
    ["bps", [scorer, assister, defHome, defAway].filter((entry): entry is PoolEntry => Boolean(entry)).map((entry, position) => ({ name: entry[0], club: entry[1], value: 30 - position * 6 }))],
    // A defender at 11 clears his 10-CBI threshold; a midfielder or forward at 9 does not
    // clear his 12, so the demo shows both the marked and the unmarked case.
    ["defCon", [defHome, defAway].filter((entry): entry is PoolEntry => Boolean(entry)).map((entry) => ({ name: entry[0], club: entry[1], value: entry[3] === "DEF" ? 11 : 9, position: entry[3] }))],
    ["saves", [keeperHome && { name: keeperHome[0], club: keeperHome[1], value: 1 }, keeperAway && { name: keeperAway[0], club: keeperAway[1], value: 2 }].filter((entry): entry is { name: string; club: string; value: number } => Boolean(entry))],
  ];
  return categories.filter(([, entries]) => entries.length > 0).map(([key, entries]) => ({ key, entries }));
}

const demoFixtures: GameweekFixture[] = fixtureTable.map(([home, away, state], index) => ({
  id: index + 1,
  kickoff: new Date(Date.now() + (state === "upcoming" ? (index - 6) * 26 * hour + 3 * hour : -2 * hour)).toISOString(),
  home,
  away,
  homeScore: state === "upcoming" ? null : 1 + (index % 3),
  awayScore: state === "upcoming" ? null : index % 2,
  minutes: state === "finished" ? 90 : state === "live" ? 61 : 0,
  status: state === "finished" ? "final" : state === "live" ? "live" : "upcoming",
  stats: state === "upcoming" ? undefined : demoFixtureStats(home, away, index),
}));

/**
 * Demo prices are generated from the pool rather than written out: the price page needs
 * hundreds of rows to stress, and the point of `?demo=1` is a layout to measure, not a
 * market to believe. The spread is deterministic so two runs are comparable.
 */
const demoPrices = (): DashboardData["prices"] => {
  const seen = new Map<number, SquadPlayer>();
  for (const manager of managers) for (const player of manager.squad) seen.set(player.id, player);
  const players = [...seen.values()].map((player, index) => {
    const progress = ((index * 37) % 190) - 90;
    const perHourPercent = (((index * 13) % 60) - 20) / 10;
    const projection = (offset: number) => ({ offset, percent: Math.round((progress + perHourPercent * 24 * (offset + 0.5)) * 10) / 10, likelihood: progress > 0 ? 3 : -3 });
    return {
      id: player.id, name: player.name, club: player.club, clubCode: player.clubCode, position: player.position,
      cost: player.cost, costChangeStart: ((index % 5) - 2) / 10, ownership: player.ownership,
      netTransfers: (index % 7 === 0 ? -1 : 1) * ((index * 5417) % 90_000),
      progress, projections: [projection(0), projection(1), projection(2)], perHour: perHourPercent,
      lockedUntil: index % 41 === 0 ? "2026-08-28T23:00:00Z" : null, calibrating: index % 53 === 0,
    };
  });
  // Relative to now, not written out: the outlook column has five states and a fixed date
  // stops demonstrating any of them the week after it passes. Three nightly changes at
  // 02:00, and a gameweek deadline on the evening the last of them belongs to — which is
  // the shape FPL publishes.
  const night = (offset: number, hour: number) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date.toISOString();
  };
  return {
    deadlines: [night(1, 2), night(2, 2), night(3, 2)],
    gameweekDeadline: night(3, 20),
    players,
  };
};

/** The clubs written out, as the Worker sends them with a real event. */
const clubNames: Record<string, string> = {
  ARS: "Arsenal", AVL: "Aston Villa", BHA: "Brighton", BOU: "Bournemouth", BRE: "Brentford",
  CHE: "Chelsea", COV: "Coventry City", CRY: "Crystal Palace", EVE: "Everton", FUL: "Fulham",
  HUL: "Hull City", IPS: "Ipswich Town", LEE: "Leeds", LIV: "Liverpool", MCI: "Man City",
  MUN: "Man Utd", NEW: "Newcastle", NFO: "Nott'm Forest", SUN: "Sunderland", TOT: "Spurs",
};

/** A handful of events so `?demo=1` shows the ticker without a Worker behind it. */
const demoFeed = (): DashboardData["feed"] => {
  const pool = managers.flatMap((manager) => manager.squad);
  const shape: Array<[FeedEvent["kind"], number, number]> = [
    ["goal", 6, 2], ["assist", 3, 9], ["yellow", -1, 14], ["defcon", 2, 23],
    ["save_point", 1, 31], ["bonus", 1, 38], ["goal", 6, 46], ["red", -3, 57],
    ["penalty_save", 5, 64], ["assist", 3, 72],
  ];
  return shape.map(([kind, pointsDelta, minutesAgo], index) => {
    const source = pool[(index * 13) % pool.length];
    // Every third event belongs to nobody in the league, which is what a real feed looks
    // like. Only the id is fabricated; the name stays a real one.
    const player = index % 3 === 2 ? { ...source, id: 90_000 + index } : source;
    return {
      id: `demo-${index}`,
      at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      gameweek: 24, element: player.id, player: player.name, club: player.club, clubName: clubNames[player.club] ?? player.club,
      kind, value: 1, pointsDelta, points: player.points,
      // A scorer's side cannot be on nought: the line would say he scored and show that
      // nobody has.
      fixture: {
        home: player.club, away: player.opponent,
        homeScore: kind === "goal" || kind === "assist" ? 1 + (index % 3) : index % 4,
        awayScore: (index + 2) % 3,
        minutes: 90 - minutesAgo,
      },
    };
  });
};

export const demoData: DashboardData = {
  leagueName: "Farmisarja",
  gameweek: 24,
  deadline: new Date(Date.now() + 4 * 24 * hour).toISOString(),
  updatedAt: new Date().toISOString(),
  isPreview: true,
  pointsFinalized: false,
  activeMonths: ["2026-08"],
  fixtures: demoFixtures,
  managers,
  /** The game's own average over the same five gameweeks the form series covers. */
  gameweekAverages: { 19: 48, 20: 51, 21: 44, 22: 57, 23: 53 },
  prices: demoPrices(),
  feed: demoFeed(),
};
