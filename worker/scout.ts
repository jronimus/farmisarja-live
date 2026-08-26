/**
 * OpenFPL's rating of each squad in this league.
 *
 * Somebody else's model, scoring our managers' own team sheets. `openfpl.kassem.dev` runs a
 * four-model ensemble (Ridge, XGBoost, CatBoost, MLP) over the official FPL data and its
 * `/api/scout/team-rating` route is open: give it a public entry id and a gameweek and it
 * returns a mark out of a hundred, the points it projects for that eleven against the
 * points it projects for its own, and a sentence or two about what is strong and what is
 * risky. Measured at about a third of a second a squad.
 *
 * It is an outside opinion and is labelled as one wherever it is shown, with a link to the
 * project. Nothing here is our judgement: we ask seven questions and print the answers.
 *
 * The rating is only meaningful for a squad that is actually set. Before a deadline people
 * are still transferring, so this refreshes on the same half-hour gate as everything else
 * and simply follows whatever the squads currently say.
 */

export interface SquadRating {
  entryId: number;
  teamName: string;
  managerName: string;
  gameweek: number;
  /** 0–100, and the letter OpenFPL puts on it. */
  rating: number;
  grade: string;
  /** What this eleven projects, against what the model's own eleven projects. */
  projected: number;
  aiProjected: number;
  captain: string;
  /** Its three components, out of 75 / 15 / 10 respectively. */
  components: { startingXi: number; captaincy: number; availability: number };
  differentials: number;
  strengths: string[];
  risks: string[];
}

export interface ScoutEnv {
  TELEGRAM_STATE: KVNamespace;
  FPL_LEAGUE_ID: string;
}

interface StoredScout {
  checkAfter: string;
  gameweek: number;
  ratings: SquadRating[];
  /** OpenFPL's own credit line, printed under the table it produced. */
  credits?: string;
}

const SCOUT_KEY = "scout:ratings";
const CHECK_MS = 30 * 60_000;
const OPENFPL = "https://openfpl.kassem.dev/api";

interface RatingResponse {
  entry_id: number;
  manager_name?: string;
  team_name?: string;
  gameweek: number;
  rating: number;
  grade: string;
  projected_points: number;
  ai_projected_points: number;
  captain?: string;
  components?: { starting_xi?: number; captaincy?: number; availability?: number };
  differentials?: number;
  strengths?: string[];
  risks?: string[];
  credits?: string;
}

/** OpenFPL's shape, in ours. Kept apart so the page never reads a third party's field names. */
export function toRating(body: RatingResponse): SquadRating {
  return {
    entryId: body.entry_id,
    teamName: body.team_name ?? "—",
    managerName: body.manager_name ?? "—",
    gameweek: body.gameweek,
    rating: Math.round(body.rating),
    grade: body.grade,
    projected: body.projected_points,
    aiProjected: body.ai_projected_points,
    captain: body.captain ?? "—",
    components: {
      startingXi: body.components?.starting_xi ?? 0,
      captaincy: body.components?.captaincy ?? 0,
      availability: body.components?.availability ?? 0,
    },
    differentials: body.differentials ?? 0,
    strengths: body.strengths ?? [],
    risks: body.risks ?? [],
  };
}

/** Best mark first. A tie goes to the squad projecting more points, which is the mark's own basis. */
export function rankRatings(ratings: SquadRating[]): SquadRating[] {
  return [...ratings].sort((a, b) => b.rating - a.rating || b.projected - a.projected || a.teamName.localeCompare(b.teamName));
}

export async function readScout(env: ScoutEnv): Promise<StoredScout | null> {
  return await env.TELEGRAM_STATE.get<StoredScout>(SCOUT_KEY, "json");
}

export async function updateScout(env: ScoutEnv, now = Date.now()): Promise<{ written: boolean; rated: number }> {
  const stored = await readScout(env);
  if (stored?.checkAfter && Date.parse(stored.checkAfter) > now) return { written: false, rated: 0 };

  const fpl = async <T>(path: string) => {
    const response = await fetch(`https://fantasy.premierleague.com/api${path}`, {
      headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
      cf: { cacheEverything: true, cacheTtl: 300 },
    });
    if (!response.ok) throw new Error(`FPL ${path} ${response.status}`);
    return response.json() as Promise<T>;
  };

  const bootstrap = await fpl<{ events: Array<{ id: number; deadline_time: string; is_current: boolean }> }>("/bootstrap-static/");
  /**
   * The gameweek worth rating is the one still open.
   *
   * `is_current` is the one being played or just played, and a mark out of a hundred for a
   * team sheet nobody can change any more is a post-mortem. The question this answers is
   * "how well is my side set up", which is only a question while the deadline is ahead —
   * and OpenFPL will rate a future gameweek from the squad as it stands, which is exactly
   * what a manager wants to see before he makes his transfer.
   */
  const upcoming = bootstrap.events.find((entry) => Date.parse(entry.deadline_time) > now);
  const event = upcoming ?? bootstrap.events.find((entry) => entry.is_current);
  if (!event) return { written: false, rated: 0 };

  const league = await fpl<{ standings: { results: Array<{ entry: number }> }; new_entries: { results: Array<{ entry: number }> } }>(
    `/leagues-classic/${env.FPL_LEAGUE_ID}/standings/?page_standings=1&page_new_entries=1`,
  );
  const entries = [
    ...league.standings.results.map((row) => row.entry),
    ...(league.new_entries?.results ?? []).map((row) => row.entry),
  ];

  let credits = stored?.credits;
  const results = await Promise.all([...new Set(entries)].map(async (entryId) => {
    try {
      const response = await fetch(`${OPENFPL}/scout/team-rating?entry_id=${entryId}&gameweek=${event.id}`, {
        headers: { Accept: "application/json", "User-Agent": "Farmisarja-Live/0.1" },
        cf: { cacheEverything: true, cacheTtl: 900 },
      });
      if (!response.ok) throw new Error(`OpenFPL ${entryId} ${response.status}`);
      const body = await response.json() as RatingResponse;
      if (body.credits) credits = body.credits;
      return toRating(body);
    } catch (error) {
      // One squad that cannot be rated is not a table that cannot be shown.
      console.error(JSON.stringify({ event: "scout_rating_error", entry: entryId, error: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }));

  const ratings = rankRatings(results.filter((entry): entry is SquadRating => entry !== null));
  // Nothing came back at all: keep what was stored rather than emptying the table because
  // somebody else's hobby service was restarting.
  if (!ratings.length && stored?.ratings.length) {
    await env.TELEGRAM_STATE.put(SCOUT_KEY, JSON.stringify({ ...stored, checkAfter: new Date(now + CHECK_MS).toISOString() } satisfies StoredScout));
    return { written: true, rated: stored.ratings.length };
  }

  await env.TELEGRAM_STATE.put(SCOUT_KEY, JSON.stringify({
    checkAfter: new Date(now + CHECK_MS).toISOString(),
    gameweek: event.id,
    ratings,
    credits,
  } satisfies StoredScout));
  console.log(JSON.stringify({ event: "scout_updated", gameweek: event.id, rated: ratings.length }));
  return { written: true, rated: ratings.length };
}
