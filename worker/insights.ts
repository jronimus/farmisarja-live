/**
 * The underlying numbers, from FPL Core Insights.
 *
 * FPL publishes what a player scored. It does not publish what he deserved to score, and
 * that difference is most of what a transfer decision turns on: a striker on four points
 * from 1.8 expected goals is unlucky, and one on twelve from 0.3 is a coin that has come up
 * heads three times.
 *
 * `olbauday/FPL-Core-Insights` is a dataset rather than a service — CSV files in a git
 * repository, rebuilt by a scheduled action three times a day (07:30, 15:30 and 23:30 UTC)
 * from official FPL data fused with per-match Opta-like statistics. Sixty-four columns per
 * player per match: expected goals and assists, expected goals on target, big chances
 * missed, touches in the box, defensive contributions, saves and goals prevented.
 *
 * **Its `player_id` is FPL's own element id**, which is the reason it is worth having at
 * all. Everything else this site reads from outside — FotMob's rumours, its line-ups — has
 * to be matched onto FPL by name, club and a tie-break, and every such match is a chance to
 * be wrong. This one joins on a number.
 *
 * The author asks for a link back to the repository in return for using it, which every
 * view built on this carries.
 */

export interface PlayerInsight {
  /** FPL's own element id; no matching involved. */
  element: number;
  minutes: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  /** Expected goals on target — how good the shots he got away actually were. */
  xgot: number;
  shots: number;
  shotsOnTarget: number;
  bigChancesMissed: number;
  chancesCreated: number;
  boxTouches: number;
  /**
   * Clearances, blocks, interceptions and tackles — the four FPL counts towards a defensive
   * contribution. The dataset ships a `defensive_contributions` column and it is empty, so
   * this is added up from the parts, which is what FPL does anyway.
   */
  cbit: number;
  /** Counted separately because FPL only adds them in for midfielders and forwards. */
  recoveries: number;
  saves: number;
  goalsConceded: number;
  /** Goalkeepers only: shots stopped against the quality of what he faced. */
  goalsPrevented: number;
  /** How many of the counted gameweeks he appeared in. */
  appearances: number;
}

export interface InsightsEnv {
  TELEGRAM_STATE: KVNamespace;
}

interface StoredInsights {
  checkAfter: string;
  /** Per gameweek, so a finished one is never fetched twice. */
  byGameweek: Record<string, PlayerInsight[]>;
  /** The last gameweek known to be still running, which is the only one worth re-reading. */
  current: number;
}

const INSIGHTS_KEY = "insights:season";
/** Three refreshes a day upstream; an hour here is well inside that and cheap. */
const CHECK_MS = 60 * 60_000;
const SEASON = "2026-2027";
const BASE = `https://raw.githubusercontent.com/olbauday/FPL-Core-Insights/main/data/${SEASON}/By%20Gameweek`;

/**
 * A tiny CSV reader.
 *
 * These files are machine-written by a Python exporter and contain no embedded newlines,
 * but they do contain quoted commas in club and player names, so quotes are honoured. A
 * dependency for this would be more code than the reader is.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((line) => line.length);
  if (!lines.length) return [];
  const cells = (line: string) => {
    const out: string[] = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
      } else if (character === "," && !quoted) { out.push(value); value = ""; } else value += character;
    }
    out.push(value);
    return out;
  };
  const header = cells(lines[0]);
  return lines.slice(1).map((line) => {
    const values = cells(line);
    return Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
  });
}

/** Blank means "did not register", which is nought and not NaN. */
const number = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One gameweek's rows, summed per player.
 *
 * A gameweek can hold two matches for a club in a double, so this adds rather than takes
 * the last row. `minutes_played` is the source of truth for minutes — the dataset's own
 * README is explicit that deriving them from the substitution timeline credits a full match
 * to players who were named and never came on.
 */
export function insightsFromRows(rows: Array<Record<string, string>>): PlayerInsight[] {
  const byElement = new Map<number, PlayerInsight>();
  for (const row of rows) {
    const element = Math.round(number(row.player_id));
    if (!element) continue;
    const minutes = number(row.minutes_played);
    const entry = byElement.get(element) ?? {
      element, minutes: 0, goals: 0, assists: 0, xg: 0, xa: 0, xgot: 0, shots: 0, shotsOnTarget: 0,
      bigChancesMissed: 0, chancesCreated: 0, boxTouches: 0, cbit: 0, recoveries: 0,
      saves: 0, goalsConceded: 0, goalsPrevented: 0, appearances: 0,
    };
    entry.minutes += minutes;
    entry.goals += number(row.goals);
    entry.assists += number(row.assists);
    entry.xg += number(row.xg);
    entry.xa += number(row.xa);
    entry.xgot += number(row.xgot);
    entry.shots += number(row.total_shots);
    entry.shotsOnTarget += number(row.shots_on_target);
    entry.bigChancesMissed += number(row.big_chances_missed);
    entry.chancesCreated += number(row.chances_created);
    entry.boxTouches += number(row.touches_opposition_box);
    entry.cbit += number(row.clearances) + number(row.blocks) + number(row.interceptions) + number(row.tackles_won);
    entry.recoveries += number(row.recoveries);
    entry.saves += number(row.saves);
    entry.goalsConceded += number(row.goals_conceded);
    entry.goalsPrevented += number(row.goals_prevented);
    if (minutes > 0) entry.appearances += 1;
    byElement.set(element, entry);
  }
  return [...byElement.values()];
}

/** The season so far, added up across the gameweeks already stored. */
export function seasonTotals(byGameweek: Record<string, PlayerInsight[]>): PlayerInsight[] {
  const total = new Map<number, PlayerInsight>();
  for (const week of Object.values(byGameweek)) {
    for (const player of week) {
      const entry = total.get(player.element);
      if (!entry) { total.set(player.element, { ...player }); continue; }
      for (const key of Object.keys(player) as Array<keyof PlayerInsight>) {
        if (key !== "element") entry[key] += player[key];
      }
    }
  }
  return [...total.values()].sort((a, b) => b.xg + b.xa - (a.xg + a.xa));
}

async function gameweekInsights(gameweek: number): Promise<PlayerInsight[] | null> {
  const response = await fetch(`${BASE}/GW${gameweek}/playermatchstats.csv`, {
    headers: { Accept: "text/csv", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 1800 },
  });
  // A gameweek that has not been played yet is simply not in the repository.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Core Insights GW${gameweek} ${response.status}`);
  return insightsFromRows(parseCsv(await response.text()));
}

export async function readInsights(env: InsightsEnv): Promise<StoredInsights | null> {
  return await env.TELEGRAM_STATE.get<StoredInsights>(INSIGHTS_KEY, "json");
}

export async function updateInsights(env: InsightsEnv, now = Date.now()): Promise<{ written: boolean; players: number }> {
  const stored = await readInsights(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, players: 0 };

  const bootstrap = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
    cf: { cacheEverything: true, cacheTtl: 300 },
  }).then((response) => response.json() as Promise<{ events: Array<{ id: number; is_current: boolean; finished: boolean }> }>);
  const current = bootstrap.events.find((event) => event.is_current)?.id ?? 1;

  /**
   * Which gameweeks to fetch.
   *
   * A finished gameweek's statistics do not change, so it is read once and kept: by May
   * that is the difference between one file a tick and thirty-eight. The current one is
   * re-read every time, and so is the one before it — a match finishing late on Monday is
   * exported on Tuesday morning, and the previous week is not final the moment the next
   * one starts.
   */
  const byGameweek = { ...(stored?.byGameweek ?? {}) };
  const wanted = new Set<number>([current, Math.max(1, current - 1)]);
  for (let gameweek = 1; gameweek <= current; gameweek += 1) {
    if (!byGameweek[gameweek]) wanted.add(gameweek);
  }

  let failed = 0;
  for (const gameweek of [...wanted].sort((a, b) => a - b)) {
    try {
      const week = await gameweekInsights(gameweek);
      if (week) byGameweek[gameweek] = week;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ event: "insights_gameweek_error", gameweek, error: error instanceof Error ? error.message : String(error) }));
    }
  }

  // Everything failed and something was stored: keep it and try again on the next gate.
  if (failed === wanted.size && stored) {
    await env.TELEGRAM_STATE.put(INSIGHTS_KEY, JSON.stringify({ ...stored, checkAfter: new Date(now + CHECK_MS).toISOString() } satisfies StoredInsights));
    return { written: true, players: 0 };
  }

  await env.TELEGRAM_STATE.put(INSIGHTS_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    byGameweek,
    current,
  } satisfies StoredInsights));
  const players = seasonTotals(byGameweek).length;
  console.log(JSON.stringify({ event: "insights_updated", gameweeks: Object.keys(byGameweek).length, players }));
  return { written: true, players };
}
