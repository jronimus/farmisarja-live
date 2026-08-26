/**
 * OpenFPL's mark for each squad in this league.
 *
 * An outside model scoring our managers' team sheets for the gameweek that is still open —
 * a mark out of a hundred, the points it projects for that eleven against the points it
 * projects for its own, and its own sentences about what is strong and what is risky.
 *
 * It is somebody else's opinion and is labelled as one wherever it appears:
 * [OpenFPL Scout AI](https://github.com/elcaiseri/OpenFPL-Scout-AI). Nothing in it is our
 * judgement — the Worker asks seven questions and the page prints the answers.
 */

export interface SquadRating {
  entryId: number;
  teamName: string;
  managerName: string;
  gameweek: number;
  rating: number;
  grade: string;
  projected: number;
  aiProjected: number;
  captain: string;
  components: { startingXi: number; captaincy: number; availability: number };
  differentials: number;
  strengths: string[];
  risks: string[];
}

const configuredApi = import.meta.env.VITE_FPL_API_URL?.replace(/\/$/, "");

export const scoutEndpoint = configuredApi ? `${configuredApi.replace(/\/api$/, "")}/scout` : null;

export async function loadScout(): Promise<{ gameweek: number; ratings: Map<number, SquadRating> } | null> {
  if (!scoutEndpoint) return null;
  const response = await fetch(scoutEndpoint);
  if (!response.ok) throw new Error(`Scout request failed: ${response.status}`);
  const body = await response.json() as { gameweek?: number; ratings?: SquadRating[] };
  return {
    gameweek: body.gameweek ?? 0,
    ratings: new Map((body.ratings ?? []).map((rating) => [rating.entryId, rating])),
  };
}

/** A, B+, C− and so on, as a class so the mark can be coloured without parsing the letter. */
export function gradeTone(rating: number): "high" | "good" | "fair" | "low" {
  if (rating >= 85) return "high";
  if (rating >= 75) return "good";
  if (rating >= 60) return "fair";
  return "low";
}
