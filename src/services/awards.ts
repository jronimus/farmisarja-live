import type { DashboardData, ManagerRow, SquadPlayer } from "../types";

export interface Award {
  id: string;
  name: string;
  rule: string;
  value: string;
  unit: string;
  detail: string;
  team: string;
  manager: string;
  tone: "pos" | "neg";
  /** How unusual the award is. Higher wins a place on the card when there is competition. */
  rarity: number;
  /** How extreme this instance is, used to break ties within the same rarity. */
  magnitude: number;
  /** The player the award is about, so the same event cannot appear twice under two names. */
  subject?: number;
}

const MAX_TILES = 12;
const MAX_PER_MANAGER = 2;

const scoring = (manager: ManagerRow) =>
  manager.chip === "BB" ? manager.squad : manager.squad.filter((player) => player.starter);

const benchPoints = (manager: ManagerRow) =>
  manager.chip === "BB" ? 0 : manager.squad.filter((player) => !player.starter).reduce((sum, p) => sum + p.points + p.bonus, 0);

const netPoints = (manager: ManagerRow) => manager.gameweekPoints + manager.provisionalBonus - manager.hit;

const transferGain = (manager: ManagerRow) =>
  manager.transfers.reduce((sum, t) => sum + t.inPoints - t.outPoints, 0);

const played = (player: SquadPlayer) => player.state === "finished";

const captainOf = (manager: ManagerRow) => manager.squad.find((player) => player.captain);
const viceOf = (manager: ManagerRow) => manager.squad.find((player) => player.viceCaptain);

const one = (a: Award | null): Award[] => (a ? [a] : []);

/** Picks the single best row for an award, or nothing when the threshold is not met. */
function best<T>(rows: T[], score: (row: T) => number, threshold: number): { row: T; score: number } | null {
  let winner: { row: T; score: number } | null = null;
  for (const row of rows) {
    const value = score(row);
    if (value < threshold) continue;
    if (!winner || value > winner.score) winner = { row, score: value };
  }
  return winner;
}

export function buildAwards(data: DashboardData): Award[] {
  const managers = data.managers;
  if (managers.length < 2) return [];

  const awards: Award[] = [];
  const add = (a: Award) => awards.push(a);

  const owners = new Map<number, ManagerRow[]>();
  for (const manager of managers) {
    for (const player of manager.squad) {
      if (!owners.has(player.id)) owners.set(player.id, []);
      owners.get(player.id)!.push(manager);
    }
  }

  // --- always available, and deliberately the first to be pushed out ---------
  const ordered = [...managers].sort((a, b) => netPoints(b) - netPoints(a));
  const top = ordered[0];
  const bottom = ordered[ordered.length - 1];
  add({
    id: "king", name: "Kierroksen kuningas", rule: "Kierroksen paras pistemäärä",
    value: String(netPoints(top)), unit: "p", detail: "", team: top.teamName, manager: top.managerName,
    tone: "pos", rarity: 0, magnitude: netPoints(top),
  });
  add({
    id: "grim", name: "Karu kierros", rule: "Kierroksen heikoin pistemäärä",
    value: String(netPoints(bottom)), unit: "p", detail: "", team: bottom.teamName, manager: bottom.managerName,
    tone: "neg", rarity: 0, magnitude: -netPoints(bottom),
  });

  // --- ownership ------------------------------------------------------------
  for (const manager of managers) {
    const pick = best(scoring(manager).filter((p) => p.ownership > 0 && p.ownership < 8), (p) => p.points + p.bonus, 10);
    if (!pick) continue;
    add({
      id: `secret-${manager.id}`, name: "Salainen ase", rule: "Vähän omistettu pelaaja teki ison saaliin",
      value: String(pick.score), unit: "p", detail: `${pick.row.name} · ${pick.row.ownership.toFixed(1).replace(".", ",")} %`,
      team: manager.teamName, manager: manager.managerName, tone: "pos", rarity: 3, magnitude: pick.score, subject: pick.row.id,
    });
  }

  for (const [playerId, holders] of owners) {
    if (holders.length !== 1) continue;
    const manager = holders[0];
    const player = scoring(manager).find((p) => p.id === playerId);
    if (!player || player.points + player.bonus < 10) continue;
    add({
      id: `sole-${playerId}`, name: "Yksinoikeus", rule: "Liigan ainoa omistaja isolle saaliille",
      value: String(player.points + player.bonus), unit: "p", detail: player.name,
      team: manager.teamName, manager: manager.managerName, tone: "pos", rarity: 4,
      magnitude: player.points + player.bonus, subject: playerId,
    });
  }

  // --- the armband ----------------------------------------------------------
  for (const manager of managers) {
    const captain = captainOf(manager);
    const vice = viceOf(manager);
    if (!captain) continue;
    const multiplier = manager.chip === "TC" ? 3 : 2;
    const captainScore = (captain.points + captain.bonus) * multiplier;

    if (netPoints(manager) > 0 && captainScore >= 15 && captainScore / netPoints(manager) >= 0.5) {
      add({
        id: `capt-${manager.id}`, name: "Kapteenin kunnia", rule: "Kapteeni toi yli puolet pisteistä",
        value: String(captainScore), unit: "p",
        detail: `${captain.name} · ${Math.round((captainScore / netPoints(manager)) * 100)} %`,
        team: manager.teamName, manager: manager.managerName, tone: "pos", rarity: 4,
        magnitude: captainScore, subject: captain.id,
      });
    }

    const captainMissed = played(captain) && captain.minutes === 0;
    if (captainMissed && vice) {
      const viceScore = (vice.points + vice.bonus) * multiplier;
      if (played(vice) && vice.minutes === 0) {
        add({
          id: `noshow-${manager.id}`, name: "Nauha jäi kotiin", rule: "Kapteeni ei pelannut, eikä vara pelastanut",
          value: "0", unit: "p", detail: `${captain.name} · ${vice.name}`,
          team: manager.teamName, manager: manager.managerName, tone: "neg", rarity: 5, magnitude: 1, subject: captain.id,
        });
      } else if (viceScore >= 8) {
        add({
          id: `vice-${manager.id}`, name: "Varamies veti", rule: "Kapteeni ei pelannut, vara hoiti homman",
          value: String(viceScore), unit: "p", detail: vice.name,
          team: manager.teamName, manager: manager.managerName, tone: "pos", rarity: 6, magnitude: viceScore, subject: vice.id,
        });
      }
    }

    const better = best(scoring(manager).filter((p) => p.id !== captain.id), (p) => p.points + p.bonus, 10);
    if (better && better.score > (captain.points + captain.bonus) * 2 && played(captain)) {
      add({
        id: `wrong-${manager.id}`, name: "Väärä nauha", rule: "Omassa joukkueessa oli selvästi parempi valinta",
        value: String(better.score), unit: "p", detail: `${better.row.name} vs C ${captain.name}`,
        team: manager.teamName, manager: manager.managerName, tone: "neg", rarity: 3,
        magnitude: better.score, subject: better.row.id,
      });
    }
  }

  // --- the bench ------------------------------------------------------------
  const benchLeader = best(managers, benchPoints, 10);
  if (benchLeader) {
    add({
      id: "bench", name: "Penkin aarre", rule: "Eniten pisteitä jäi penkille",
      value: String(benchLeader.score), unit: "p", detail: "",
      team: benchLeader.row.teamName, manager: benchLeader.row.managerName, tone: "neg", rarity: 2, magnitude: benchLeader.score,
    });
  }
  const tidiest = managers.filter((m) => m.chip !== "BB" && m.squad.some(played)).sort((a, b) => benchPoints(a) - benchPoints(b))[0];
  if (tidiest && benchPoints(tidiest) <= 1) {
    add({
      id: "tidy", name: "Ei hukkaan", rule: "Penkille ei jäänyt käytännössä mitään",
      value: String(benchPoints(tidiest)), unit: "p", detail: "",
      team: tidiest.teamName, manager: tidiest.managerName, tone: "pos", rarity: 2, magnitude: 3 - benchPoints(tidiest),
    });
  }

  // --- money ----------------------------------------------------------------
  for (const manager of managers) {
    const dud = scoring(manager)
      .filter((p) => p.cost >= 9.5 && played(p) && p.points + p.bonus <= 2)
      .sort((a, b) => b.cost - a.cost)[0];
    if (!dud) continue;
    add({
      id: `dud-${manager.id}`, name: "Kallis kaveri", rule: "Kallis pelaaja jäi lähes nollille",
      value: String(dud.points + dud.bonus), unit: "p", detail: `${dud.name} · ${dud.cost.toFixed(1).replace(".", ",")} m`,
      team: manager.teamName, manager: manager.managerName, tone: "neg", rarity: 2, magnitude: dud.cost, subject: dud.id,
    });
  }

  const values = managers.map((m) => m.teamValue);
  if (Math.max(...values) - Math.min(...values) >= 0.5) {
    const richest = managers.reduce((a, b) => (b.teamValue > a.teamValue ? b : a));
    add({
      id: "rich", name: "Rahan puolesta", rule: "Liigan arvokkain joukkue",
      value: richest.teamValue.toFixed(1).replace(".", ","), unit: "m", detail: "",
      team: richest.teamName, manager: richest.managerName, tone: "pos", rarity: 1, magnitude: richest.teamValue,
    });
  }

  // --- transfers ------------------------------------------------------------
  const movers = managers.filter((m) => m.transfers.length > 0);
  const sharpest = best(movers, (m) => transferGain(m) - m.hit, 5);
  if (sharpest) {
    add({
      id: "trader", name: "Terävä kauppias", rule: "Siirtojen nettovaikutus paras",
      value: `+${sharpest.score}`, unit: "p",
      detail: `${sharpest.row.transfers.length} siirtoa${sharpest.row.hit ? ` · −${sharpest.row.hit} hitti` : ""}`,
      team: sharpest.row.teamName, manager: sharpest.row.managerName, tone: "pos", rarity: 3, magnitude: sharpest.score,
    });
  }
  const tangled = best(movers, (m) => -(transferGain(m) - m.hit), 5);
  if (tangled) {
    add({
      id: "tangle", name: "Siirtosolmu", rule: "Siirtojen nettovaikutus heikoin",
      value: `−${tangled.score}`, unit: "p",
      detail: `${tangled.row.transfers.length} siirtoa${tangled.row.hit ? ` · −${tangled.row.hit} hitti` : ""}`,
      team: tangled.row.teamName, manager: tangled.row.managerName, tone: "neg", rarity: 3, magnitude: tangled.score,
    });
  }
  const gambler = best(movers.filter((m) => m.hit > 0), (m) => transferGain(m) - m.hit, 1);
  if (gambler) {
    add({
      id: "gamble", name: "Kannatti ottaa", rule: "Otti hitin ja jäi silti voitolle",
      value: `+${gambler.score}`, unit: "p", detail: `−${gambler.row.hit} hittiä vastaan`,
      team: gambler.row.teamName, manager: gambler.row.managerName, tone: "pos", rarity: 4, magnitude: gambler.score,
    });
  }

  // --- chips ----------------------------------------------------------------
  const withChip = managers.filter((m) => m.chip);
  const withoutChip = managers.filter((m) => !m.chip);
  if (withChip.length > 0) {
    const chipBest = withChip.reduce((a, b) => (netPoints(b) > netPoints(a) ? b : a));
    add({
      id: "chipmaster", name: "Chippimestari", rule: "Paras pistemäärä chipin kanssa",
      value: String(netPoints(chipBest)), unit: "p", detail: chipBest.chip ?? "",
      team: chipBest.teamName, manager: chipBest.managerName, tone: "pos", rarity: 4, magnitude: netPoints(chipBest),
    });
    if (withoutChip.length > 0) {
      const bare = withoutChip.reduce((a, b) => (netPoints(b) > netPoints(a) ? b : a));
      if (netPoints(bare) > netPoints(chipBest)) {
        add({
          id: "barehands", name: "Paljain käsin", rule: "Voitti chipin pelanneen ilman chippiä",
          value: String(netPoints(bare)), unit: "p", detail: `${chipBest.chip} ${netPoints(chipBest)} p vastaan`,
          team: bare.teamName, manager: bare.managerName, tone: "pos", rarity: 5, magnitude: netPoints(bare),
        });
      }
    }
    const half = Math.ceil(managers.length / 2);
    for (const manager of withChip) {
      if (ordered.indexOf(manager) + 1 <= half) continue;
      add({
        id: `wasted-${manager.id}`, name: "Turha chippi", rule: "Pelasi chipin ja jäi alempaan puolikkaaseen",
        value: String(netPoints(manager)), unit: "p", detail: manager.chip ?? "",
        team: manager.teamName, manager: manager.managerName, tone: "neg", rarity: 5, magnitude: ordered.indexOf(manager) + 1,
      });
    }
  }

  // --- the table ------------------------------------------------------------
  const climber = best(managers, (m) => m.previousPosition - m.position, 2);
  if (climber && climber.row.previousPosition > 0) {
    add({
      id: "climb", name: "Nousukiito", rule: "Suurin nousu sijoituksissa",
      value: `+${climber.score}`, unit: "sijaa", detail: `${climber.row.previousPosition}. → ${climber.row.position}.`,
      team: climber.row.teamName, manager: climber.row.managerName, tone: "pos", rarity: 3, magnitude: climber.score,
    });
  }
  const faller = best(managers, (m) => m.position - m.previousPosition, 2);
  if (faller && faller.row.previousPosition > 0) {
    add({
      id: "fall", name: "Vapaapudotus", rule: "Suurin pudotus sijoituksissa",
      value: `−${faller.score}`, unit: "sijaa", detail: `${faller.row.previousPosition}. → ${faller.row.position}.`,
      team: faller.row.teamName, manager: faller.row.managerName, tone: "neg", rarity: 3, magnitude: faller.score,
    });
  }

  const inForm = managers.filter((m) => m.form.length >= 3);
  if (inForm.length === managers.length && managers.length > 1) {
    const average = (m: ManagerRow) => m.form.reduce((sum, v) => sum + v, 0) / m.form.length;
    const coldest = inForm.reduce((a, b) => (average(b) < average(a) ? b : a));
    add({
      id: "cold", name: "Pakkasella", rule: "Heikoin vire viideltä kierrokselta",
      value: average(coldest).toFixed(0), unit: "ka", detail: coldest.form.join(" · "),
      team: coldest.teamName, manager: coldest.managerName, tone: "neg", rarity: 2, magnitude: -average(coldest),
    });
  }

  return select(awards);
}

/**
 * One event may satisfy several rules and one manager may satisfy many, so the card
 * takes the rarest first, never repeats a player, and never lets a single manager
 * take it over. The two guaranteed awards rank last because they exist only to keep
 * the card from being empty.
 */
export function select(awards: Award[]): Award[] {
  const ranked = [...awards].sort((a, b) => (b.rarity - a.rarity) || (b.magnitude - a.magnitude));
  const usedSubjects = new Set<number>();
  const perManager = new Map<string, number>();
  const usedNames = new Set<string>();
  const chosen: Award[] = [];

  for (const award of ranked) {
    if (chosen.length >= MAX_TILES) break;
    if (award.subject !== undefined && usedSubjects.has(award.subject)) continue;
    if (usedNames.has(award.name)) continue;
    const count = perManager.get(award.team) ?? 0;
    if (count >= MAX_PER_MANAGER) continue;
    if (award.subject !== undefined) usedSubjects.add(award.subject);
    usedNames.add(award.name);
    perManager.set(award.team, count + 1);
    chosen.push(award);
  }

  return chosen;
}
