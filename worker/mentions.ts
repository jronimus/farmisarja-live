import { clubFromName } from "./articles";

/**
 * Which clubs and players a headline is about.
 *
 * A tag on an article is worth having only if it is right. A wrong one sends a reader to a
 * piece about somebody else, and this project has been burned by exactly that once already —
 * FotMob's `Eric da Silva Moreira` matched Forest's `Morato` on the strength of `da` and
 * `silva`. So the rules here are built to refuse rather than to reach.
 *
 * ### Clubs
 *
 * FPL's own names, the aliases the two sites spell differently, and the three-letter short
 * names, matched whole-word. There is almost nothing to get wrong: no two Premier League
 * clubs share a name.
 *
 * ### Players, and the three ways a name lies
 *
 * Measured against the live squad list of 614:
 *
 * - **Fourteen surnames belong to more than one player** — Wilson to three, Phillips to
 *   three, Palmer, Rice, Gomez, Martinez and James to two each. A bare `Palmer` cannot be
 *   tagged, *unless* the piece also names one of their clubs, which resolves it exactly.
 * - **Eight are ordinary English words** — White, Wood, King, Cash, Rice, Shaw, Moore,
 *   Brooks. In a Title Case headline "Best Cheap Players" they are indistinguishable from
 *   prose, so they are only taken when a club settles it too.
 * - **Fifty-five are four characters or fewer**, and the shortest are initials and noise.
 *   Three characters and under is dropped outright.
 *
 * Matching is case-sensitive on a word boundary. A surname in a headline is capitalised and
 * the same letters in the middle of a sentence usually are not, which costs nothing and
 * removes a whole class of accident.
 *
 * ### The forms a name comes in
 *
 * FPL files `M.Sangaré` and `Pedro Porro`; a headline writes `Sangare` and `Porro`. So each
 * player offers a few spellings of himself — the accents stripped, the initial dropped, the
 * last word alone — and **the ambiguity rules are applied over all of them together**. If two
 * players end up offering the same spelling, that spelling needs a club to vouch for it, the
 * same as a shared surname does.
 */

/** Ordinary English words that are also somebody's surname. A club has to vouch for these. */
const ALSO_WORDS = new Set(["Best", "Brooks", "Cash", "King", "Long", "Moore", "Rice", "Shaw", "White", "Wood", "Young"]);

export interface Squad {
  /** FPL element id. */
  id: number;
  webName: string;
  /** FPL's own short club name, so a shared surname can be settled by the club beside it. */
  club: string;
}

function has(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(text);
}

/** Every club the text names, by FPL's short name, in the order they appear in the league. */
export function clubsIn(text: string, shortByName: Map<string, string>): string[] {
  const found = new Set<string>();
  for (const [name, short] of shortByName) {
    // The full name as either site writes it, and FPL's own three letters.
    if (has(text, name) || has(text.toLowerCase(), name)) found.add(short);
    if (has(text, short)) found.add(short);
  }
  // The aliases live with the headline matcher; ask it about each capitalised run of words.
  for (const run of text.match(/\b[A-Z][\p{L}'.-]*(?:\s+(?:and\s+)?[A-Z][\p{L}'.-]*){0,3}/gu) ?? []) {
    const club = clubFromName(run, shortByName);
    if (club) found.add(club);
  }
  return [...found].sort();
}

/**
 * The spellings a player might be written as: FPL's own, without its accents, without a
 * leading initial, and the last word of a two-part name.
 */
export function formsOf(webName: string): string[] {
  const plain = webName.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const forms = new Set([webName, plain]);
  for (const form of [webName, plain]) {
    const afterInitial = /^[\p{L}]\.\s*(.+)$/u.exec(form);
    if (afterInitial) forms.add(afterInitial[1]);
    const words = form.split(/\s+/);
    if (words.length > 1) forms.add(words[words.length - 1]);
  }
  return [...forms].filter((form) => form.length > 3);
}

/**
 * Every player the text names, by FPL element id.
 *
 * A spelling several players share, or one that is also an ordinary word, is only taken when
 * the text names a club that settles it — and then only if it settles it to exactly one
 * player. Everything else is left untagged, which is the right answer when the alternative
 * is a tag pointing at the wrong man.
 */
export function playersIn(text: string, squad: Squad[], clubs: string[]): number[] {
  const byForm = new Map<string, Squad[]>();
  for (const player of squad) {
    for (const form of formsOf(player.webName)) {
      byForm.set(form, [...(byForm.get(form) ?? []), player]);
    }
  }

  const found = new Set<number>();
  for (const [form, players] of byForm) {
    if (!has(text, form)) continue;
    const unique = [...new Map(players.map((player) => [player.id, player])).values()];
    const ambiguous = unique.length > 1 || ALSO_WORDS.has(form);
    if (!ambiguous) {
      found.add(unique[0].id);
      continue;
    }
    const settled = unique.filter((player) => clubs.includes(player.club));
    if (settled.length === 1) found.add(settled[0].id);
  }
  return [...found].sort((a, b) => a - b);
}
