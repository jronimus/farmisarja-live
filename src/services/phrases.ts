import type { Language } from "../types";

/**
 * Two sets of English strings, on a Finnish page, turned into Finnish.
 *
 * FPL writes its own availability sentence and FotMob writes its own expected return, and
 * both leaked through verbatim because both are the most reliable thing in their row and
 * paraphrasing them would only add a second version to disagree with. That argument holds
 * for the *content*. It does not hold for the language.
 *
 * Both look like free text and neither is. The tables below were collected from the live
 * data rather than invented: 614 FPL players on 26 Aug produced 74 distinct news strings,
 * and twenty FotMob club payloads on the same day produced nineteen distinct returns. Every
 * one of them fits one of a handful of shapes.
 *
 * **Anything unmatched falls through exactly as it was written.** A translated medical phrase
 * that is wrong is worse than an English one that is right, so nothing here guesses: a
 * reason it does not know stays English, and a club name is never touched — FotMob and FPL
 * both put real club names inside these sentences, and "Paris Saint-Germain" is not a word
 * to be looked up in a table.
 *
 * Every translated string keeps the original beside it, for the `title` on the element that
 * prints it. A reader who wants to check what was actually published can.
 */

export interface Phrase {
  /** What to print. The original when nothing matched, so this is never empty. */
  text: string;
  /** The publisher's own words, or null when they are already what is being printed. */
  original: string | null;
}

const asIs = (text: string): Phrase => ({ text, original: null });

/**
 * The injuries FPL names, and the one thing that is not an injury.
 *
 * `Knock` is FPL's word for a bang that may or may not matter, and it is the only reason in
 * the list that is not "<part> injury". `Unspecified` and `Muscular` are its two ways of
 * saying it does not know which.
 */
const REASONS: Record<string, string> = {
  achilles: "akillesjänne", ankle: "nilkka", arm: "käsivarsi", back: "selkä",
  calf: "pohje", chest: "rintakehä", ear: "korva", elbow: "kyynärpää", eye: "silmä",
  foot: "jalkaterä", groin: "nivus", hamstring: "takareisi", hand: "käsi", head: "pää",
  heel: "kantapää", hip: "lonkka", illness: "sairaus", knee: "polvi", leg: "jalka",
  muscular: "lihas", neck: "niska", pelvis: "lantio", rib: "kylkiluu", shoulder: "olkapää",
  thigh: "reisi", toe: "varvas", unspecified: "määrittelemätön", wrist: "ranne",
};

const MONTHS: Record<string, string> = {
  jan: "tammikuu", feb: "helmikuu", mar: "maaliskuu", apr: "huhtikuu",
  may: "toukokuu", jun: "kesäkuu", jul: "heinäkuu", aug: "elokuu",
  sep: "syyskuu", oct: "lokakuu", nov: "marraskuu", dec: "joulukuu",
};

/** The genitive-ish form a date needs: "14. syyskuuta". */
const MONTH_PARTITIVE: Record<string, string> = {
  jan: "tammikuuta", feb: "helmikuuta", mar: "maaliskuuta", apr: "huhtikuuta",
  may: "toukokuuta", jun: "kesäkuuta", jul: "heinäkuuta", aug: "elokuuta",
  sep: "syyskuuta", oct: "lokakuuta", nov: "marraskuuta", dec: "joulukuuta",
};

/** "Early September 2026" — a third of a month, which Finnish says as alku/puoliväli/loppu. */
const THIRDS: Record<string, string> = { early: "alku", mid: "puoliväli", late: "loppu" };

/** FotMob's phrases that are one fixed string rather than a shape. */
const RETURNS: Record<string, string> = {
  "doubtful": "epävarma",
  "unknown": "ei tiedossa",
  "back in training": "palannut harjoituksiin",
  "a few days": "muutama päivä",
  "about a week": "noin viikko",
  "about 1-2 weeks": "noin 1–2 viikkoa",
  "about two weeks": "noin kaksi viikkoa",
  "out for the season": "loppukauden sivussa",
};

const DAY_MONTH = /^(\d{1,2})\s+([a-z]{3})[a-z]*$/;

/** "14 Sep" and "5 Sep" — the only date shape either publisher uses inside a sentence. */
function finnishDate(text: string): string | null {
  const match = DAY_MONTH.exec(text.trim().toLowerCase());
  if (!match) return null;
  const month = MONTH_PARTITIVE[match[2]];
  return month ? `${Number(match[1])}. ${month}` : null;
}

/**
 * FotMob's expected return.
 *
 * Two shapes and a short list of fixed phrases. The shape that matters is *Early/Mid/Late +
 * month + year*, which is mechanical, and "Expected back 14 Sep", which is a date.
 */
export function translateReturn(text: string, language: Language): Phrase {
  if (language !== "fi" || !text) return asIs(text);
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const fixed = RETURNS[lower];
  if (fixed) return { text: fixed, original: trimmed };

  const third = /^(early|mid|late)\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(lower);
  if (third) {
    const month = MONTHS[third[2].slice(0, 3)];
    if (month) {
      // "syyskuun alku", not "alku syyskuu": the month takes the genitive and the third
      // follows it, which is also how a Finn says it out loud.
      const year = third[3] ? ` ${third[3]}` : "";
      return { text: `${month.replace(/kuu$/, "kuun")} ${THIRDS[third[1]]}${year}`, original: trimmed };
    }
  }

  const back = /^(?:expected back|back)\s+(.+)$/.exec(lower);
  if (back) {
    const date = finnishDate(back[1]);
    if (date) return { text: `arvioitu paluu ${date}`, original: trimmed };
  }

  const date = finnishDate(lower);
  if (date) return { text: date, original: trimmed };

  return asIs(trimmed);
}

/**
 * FPL's own availability sentence.
 *
 * Two families. A move — *Has joined X permanently*, *Has joined X on loan for the rest of
 * the season*, *has returned to X* — where the club is left exactly as FPL spelt it. And a
 * *reason - status* pair, where both halves come out of a table and either half may fail to
 * match without spoiling the other: an unknown reason keeps its English and still gets a
 * Finnish status.
 */
export function translateNews(text: string, language: Language): Phrase {
  if (language !== "fi" || !text) return asIs(text);
  const trimmed = text.trim();

  const loan = /^has joined (.+) on loan(?: for the rest of the season)?$/i.exec(trimmed);
  if (loan) return { text: `Siirtynyt lainalle seuraan ${loan[1]} kauden loppuun`, original: trimmed };
  const joined = /^has joined (.+?) permanently$/i.exec(trimmed);
  if (joined) return { text: `Siirtynyt pysyvästi seuraan ${joined[1]}`, original: trimmed };
  const returned = /^has returned to (.+)$/i.exec(trimmed);
  if (returned) return { text: `Palannut seuraan ${returned[1]}`, original: trimmed };

  const suspended = /^suspended until (.+)$/i.exec(trimmed);
  if (suspended) {
    const date = finnishDate(suspended[1]);
    return date
      ? { text: `Pelikielto ${date} asti`, original: trimmed }
      : { text: `Pelikielto ${suspended[1]} asti`, original: trimmed };
  }

  const pair = /^(.+?)\s+-\s+(.+)$/.exec(trimmed);
  if (!pair) return asIs(trimmed);
  const reason = translateReason(pair[1]);
  const status = translateStatus(pair[2]);
  // Nothing matched on either side: printing FPL's own sentence back is better than
  // printing half a translation of it.
  if (!reason && !status) return asIs(trimmed);
  return { text: `${reason ?? pair[1]} – ${status ?? pair[2]}`, original: trimmed };
}

function translateReason(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (lower === "knock") return "Kolhu";
  const injury = /^(.+?)\s+injury$/.exec(lower);
  if (!injury) return null;
  const part = REASONS[injury[1]];
  if (!part) return null;
  // "polvivamma", one word, which is how a Finn writes it — except where the reason is an
  // adjective rather than a body part.
  if (injury[1] === "unspecified") return "Määrittelemätön vamma";
  return `${part.charAt(0).toUpperCase()}${part.slice(1)}vamma`;
}

function translateStatus(text: string): string | null {
  const lower = text.trim().toLowerCase();
  if (lower === "unknown return date") return "paluuaika ei tiedossa";
  const chance = /^(\d{1,3})\s*% chance of playing$/.exec(lower);
  if (chance) return `${chance[1]} %:n todennäköisyys pelata`;
  const back = /^expected back\s+(.+)$/.exec(lower);
  if (back) {
    const date = finnishDate(back[1]);
    if (date) return `arvioitu paluu ${date}`;
  }
  return null;
}
