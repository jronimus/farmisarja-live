/**
 * The bits of FotMob two features both need: which club is which, and which player is which.
 *
 * FotMob is read for two things the Premier League and FPL between them do not publish —
 * graded transfer rumours (`rumours.ts`) and predicted line-ups with the injured and
 * suspended players attached (`lineups.ts`). Both have to answer the same two questions
 * first, so they answer them here.
 *
 * It is an undocumented endpoint on somebody else's site. Everything read through it is
 * fetched gently, cached at the edge, attributed on the page, and treated as something that
 * may simply stop answering one day — in which case each feature ages its own store out and
 * the rest of the site does not notice.
 */

export interface Element { id: number; web_name: string; first_name: string; second_name: string; team: number }

/**
 * FotMob's club ids for the 2026-27 Premier League, against FPL's own short names.
 *
 * Read off FotMob's league table on 26 Aug 2026 rather than guessed. Promotion and
 * relegation move three of these every summer; an FPL club missing from the map is skipped
 * and logged rather than mismatched onto the wrong side.
 */
export const CLUBS: Record<number, string> = {
  9825: "ARS", 10252: "AVL", 8678: "BOU", 9937: "BRE", 10204: "BHA",
  8455: "CHE", 8669: "COV", 9826: "CRY", 8668: "EVE", 9879: "FUL",
  8667: "HUL", 9902: "IPS", 8463: "LEE", 8650: "LIV", 8456: "MCI",
  10260: "MUN", 10261: "NEW", 10203: "NFO", 8472: "SUN", 8586: "TOT",
};

/** Lower case, no accents, no punctuation — the only form two sites ever agree on. */
export function normalise(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Which FPL player a rumour is about, or nobody.
 *
 * The two sites do not spell anybody the same way. FotMob says `Emiliano Martínez`, FPL
 * files him as `Emiliano` / `Martínez Romero` with a web name of `Martinez`, and there is a
 * second Martínez at another club. So the club comes first — a rumour is always attached to
 * one — and inside it the match is on shared name parts.
 *
 * ### Why the best guess is not good enough
 *
 * This used to return whichever player in the club shared the most parts of the name, and
 * one shared part was enough to win. FotMob's `Eric da Silva Moreira` therefore landed on
 * Forest's Morato, whom FPL files as Felipe Rodrigues **da Silva**: one part, `silva`,
 * nobody else in the squad had it, so he won. The right answer was nobody — Eric da Silva
 * Moreira is not in FPL at all — and that is the answer this could never give.
 *
 * It matters most exactly where it is used. A transfer rumour is very often about somebody
 * FPL has never listed: a youth player, or a name from another league. Those are the cases
 * where the correct reply is silence, and a matcher that always names its best guess pins
 * the report to an innocent bystander's row on the page.
 *
 * ### So the known name has to be there, in full
 *
 * `web_name` is the name FPL knows a player by, and it is the name FotMob writes too — both
 * sites lead with what a reader would call him. Every part of it must appear in the name
 * being matched: `Martinez` inside `Emiliano Martínez`, `Enzo` inside `Enzo Fernández`,
 * `Williams` inside `Neco Williams` once the `N.` is dropped for being too short to mean
 * anything. `Morato` is not inside `Eric da Silva Moreira`, so that match is refused, and a
 * stray `silva` from the middle of a filed name can no longer carry one on its own.
 *
 * The remaining parts still count, but only to separate two players who both cleared that
 * bar — and if they clear it equally, nobody is named. `mentions.ts` reached the same rule
 * from the other direction, for article tags: refuse unless it resolves to exactly one man.
 */
export function matchElement(name: string, clubId: number, elements: Element[], teamByShort: Map<string, number>): number | null {
  const short = CLUBS[clubId];
  const team = short ? teamByShort.get(short) : undefined;
  if (!team) return null;
  const parts = new Set(normalise(name).split(" ").filter((part) => part.length >= 3));
  if (!parts.size) return null;

  let best: { id: number; score: number } | null = null;
  let tied = false;
  for (const element of elements) {
    if (element.team !== team) continue;
    const known = normalise(element.web_name).split(" ").filter((part) => part.length >= 3);
    // The name he is known by, all of it. Everything below is only ever a tie-break.
    if (!known.length || !known.every((part) => parts.has(part))) continue;

    const own = new Set([
      ...normalise(`${element.first_name} ${element.second_name}`).split(" "),
      ...known,
    ].filter((part) => part.length >= 3));
    let score = 0;
    for (const part of parts) if (own.has(part)) score += 1;

    if (!best || score > best.score) {
      best = { id: element.id, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  // Two men the name fits equally well is not a match, it is a coin toss with a reader's
  // page as the stake.
  return best && !tied ? best.id : null;
}
