import { useEffect, useMemo, useState } from "react";
import { Clock3, ExternalLink } from "lucide-react";
import { translations } from "./i18n";
import { flagOf, isNewsworthy, newsOrder } from "./services/playerNews";
import { translateNews, translateReturn } from "./services/phrases";
import { absencesByElement, dealsByElement, loadFotmob, movesByElement, type Absence, type Deal, type Move } from "./services/rumours";
import { loadLineups } from "./services/lineups";
import { articlesEndpoint, loadArticles, topicsPresent, type Article } from "./services/articles";
import type { DashboardData, Language, PlayerNews } from "./types";

/**
 * Who is not playing, and whose squad that is a problem for.
 *
 * The first half is FPL's own: a status letter, a percentage and a sentence, for the 118
 * players it currently has something to say about. The second half is this league's, and it
 * is the reason for the page — FPL's list says nothing about which of these seven squads is
 * starting the player on Saturday, and that is the only part of the sentence a reader here
 * actually acts on.
 */

type Filter = "ours" | "all" | "articles";

/** Anyone the league is exposed to comes first; the rest of the game is behind a filter. */
const PAGE = 40;

function Flag({ player, absence, move, deal }: { player: PlayerNews; absence?: Absence; move?: Move; deal?: Deal }) {
  const flag = flagOf(player);
  // He has gone. FPL will flag him itself within a day or so, and until it does this is the
  // only thing on the page that knows — so it gets the flag that means "he is not playing"
  // rather than the softer mark a reported move gets.
  if (flag.level === "none" && deal) return <i className="news-flag flag-out">✕</i>;
  // FotMob has him out and FPL has not said so yet. It is not FPL's percentage, so it does
  // not get FPL's colours: an exclamation in the amber that means "read this".
  if (flag.level === "none" && absence) return <i className="news-flag flag-major">!</i>;
  // Nobody says he cannot play; somebody says he may be leaving, which is a softer thing
  // and gets the mark a move gets everywhere else on the site.
  if (flag.level === "none" && move) return <i className="news-flag flag-move">⇄</i>;
  if (flag.level === "none") return <i className="news-flag flag-bench">0</i>;
  return <i className={`news-flag flag-${flag.level}`}>
    {flag.level === "out" ? "✕" : `${flag.chance}`}
  </i>;
}

/**
 * When an article was published, to the minute.
 *
 * The relative form is right for the availability rows below — a doubt is either fresh or
 * stale and "4 pv sitten" says which. It is wrong here. What a reader wants to know about a
 * piece on team news is whether it was written before or after the team news he has already
 * read, and "1 h sitten" hides exactly that. So this list gets a clock.
 *
 * The day is dropped once it is today's, because the date on every line would only be the
 * same date repeated. Anything older keeps it, since a feed can run a week back.
 */
function Published({ at, language }: { at: string | null; language: Language }) {
  if (!at) return null;
  const locale = language === "fi" ? "fi-FI" : "en-GB";
  const date = new Date(at);
  const clock = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === date.toDateString();
  return <small>{today ? clock : `${date.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${clock}`}</small>;
}

/** When FPL wrote it down, which is how you tell a fresh doubt from a fortnight-old one. */
function Since({ at, language }: { at: string | null; language: Language }) {
  const t = translations(language);
  if (!at) return null;
  const hours = (Date.now() - Date.parse(at)) / 3_600_000;
  if (hours < 1) return <small>{t.newsJustNow}</small>;
  if (hours < 24) return <small>{t.newsHoursAgo.replace("{n}", String(Math.round(hours)))}</small>;
  return <small>{t.newsDaysAgo.replace("{n}", String(Math.round(hours / 24)))}</small>;
}

/**
 * What people are writing, as against what FPL has published.
 *
 * Headline, source, when, the lead sentence and a link out — never the article. Two of the
 * publishers put their whole piece in the feed, and reprinting that would be taking it
 * rather than pointing at it. No images either: neither feed carries one, and fetching
 * their pages for an OG tag would be a dozen requests to hotlink somebody else's picture.
 */
function Articles({ language }: { language: Language }) {
  const t = translations(language);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [topic, setTopic] = useState<string>("");

  useEffect(() => {
    let active = true;
    loadArticles()
      .then((next) => { if (active) setArticles(next ?? []); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  if (!articlesEndpoint || failed) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.articlesUnavailable}</strong>
  </section>;
  if (!articles) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.articlesLoading}</strong>
  </section>;

  const topics = topicsPresent(articles);
  const shown = topic ? articles.filter((article) => article.topic === topic) : articles;

  return <>
    {topics.length > 1 && <div className="topic-filters" role="group" aria-label={t.articleTopics}>
      <button className={topic === "" ? "active" : ""} onClick={() => setTopic("")}>{t.newsAll}</button>
      {topics.map((entry) => <button key={entry} className={topic === entry ? "active" : ""} onClick={() => setTopic(entry)}>
        {t.topics[entry as keyof typeof t.topics] ?? entry}
      </button>)}
    </div>}

    <div className="article-list">
      {shown.map((article) => <a
        className="article-row"
        key={article.id}
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="article-head">
          <b>{article.title}</b>
          {article.topic && <i className={`article-topic topic-${article.topic}`}>{t.topics[article.topic as keyof typeof t.topics] ?? article.topic}</i>}
        </span>
        {article.excerpt && <em>{article.excerpt}</em>}
        <span className="article-meta">
          <b>{article.source}</b>
          <Published at={article.published} language={language} />
          <ExternalLink />
        </span>
      </a>)}
      {!shown.length && <div className="price-empty">{t.articlesNone}</div>}
    </div>

    <p className="price-disclaimer">{t.articlesNote}</p>
  </>;
}

export type RumourOwner = { name: string; club: string; position: string; owners: PlayerNews["owners"] };

/**
 * Who is reported to be leaving, and whose squad that is a problem for.
 *
 * Every line is somebody else's reporting: the two clubs, FotMob's own grading of how
 * likely it is, the outlet that ran it and a link to the report. Nothing on this page is
 * our inference — which is the point, because the thing this replaced was.
 */
export default function TeamNews({ data, language }: { data: DashboardData; language: Language }) {
  const t = translations(language);
  const [filter, setFilter] = useState<Filter>("ours");
  const [shown, setShown] = useState(PAGE);

  const all = data.playerNews ?? [];

  /**
   * FotMob's own unavailable list, beside FPL's flags.
   *
   * The two disagree in both directions and the disagreement is the useful part: FPL says
   * "Knee injury" and stops, FotMob says when he is expected back and marks a suspension as
   * one; and each of them lists players the other has not got round to. So a row carries
   * whichever of the two has something to say, and a player only FotMob knows about gets a
   * row of his own rather than being lost behind FPL's silence.
   */
  const [absences, setAbsences] = useState<Map<number, Absence>>(new Map());
  /**
   * Reported moves, folded into the same list rather than given a page of their own.
   *
   * A transfer rumour is not an FPL fact — the FPL fact is that a player being negotiated
   * over may not be in the side on Saturday, which is the same thing the flags above it
   * say. And "he would still be in the league" said nothing worth saying: staying in the
   * Premier League is no promise that anybody is playing this week.
   */
  const [moves, setMoves] = useState<Map<number, Move>>(new Map());
  /**
   * The moves that are no longer reports.
   *
   * This is the half the rumour digest is slowest at, and the reason the page was showing a
   * three-day-old `Goal` rumour about a move Romano had already called done. A deal is a
   * fact, so it replaces the reports rather than joining them: the outlets that guessed at
   * it have nothing left to be right or wrong about.
   */
  const [deals, setDeals] = useState<Map<number, Deal>>(new Map());
  useEffect(() => {
    let active = true;
    // The club-wide list, with the per-match one laid over it where a fixture is close
    // enough to have one: the first is a week old at worst, the second is about the side
    // that is actually about to play.
    Promise.all([loadFotmob(), loadLineups()])
      .then(([body, fixtures]) => {
        if (!active || !body) return;
        const merged = absencesByElement(body.absences);
        for (const fixture of fixtures ?? []) {
          for (const player of fixture.unavailable) {
            if (player.element !== null) merged.set(player.element, player as Absence);
          }
        }
        setAbsences(merged);
        setMoves(movesByElement(body.rumours));
        setDeals(dealsByElement(body.deals));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  // The rumour list is about FPL elements, and the exposure it needs is the same exposure
  // the flag rows carry — so it is read off the one list rather than fetched again.
  const ownersByElement = useMemo(
    () => new Map(all.map((player) => [player.id, { name: player.name, club: player.club, position: player.position, owners: player.owners }])),
    [all],
  );

  const rows = useMemo(() => {
    const list = all
      .filter((player) => isNewsworthy(player) || absences.has(player.id) || moves.has(player.id) || deals.has(player.id))
      .filter((player) => filter === "all" || player.owners.length > 0);
    // A reported move ranks under FPL's own doubts and over the players with nothing said
    // about them: it is a reason he might not play, not a statement that he cannot.
    // A completed move ranks with FPL's own doubts rather than under them: it is not a
    // reason he might not play, it is the reason he will not.
    return [...list].sort((a, b) => {
      const rank = (player: PlayerNews) => isNewsworthy(player) || absences.has(player.id) || deals.has(player.id) ? 0 : 1;
      return rank(a) - rank(b) || newsOrder(a, b);
    });
  }, [all, filter, absences, moves, deals]);

  // These two read the Worker, not FPL, so an FPL outage is no reason to hide them.
  if (!data.playerNews && filter !== "articles") {
    return <section className="news-page">
      <div className="news-filters" role="group" aria-label={t.navNews}>
        <button className="active">{t.newsOurs}</button>
        <button onClick={() => setFilter("articles")}>{t.newsArticles}</button>
      </div>
      <section className="data-pending" role="status">
        <Clock3 />
        <strong>{t.newsUnavailable}</strong>
      </section>
    </section>;
  }

  /**
   * The number on the tab, which has to be the number of rows behind it.
   *
   * It counted FPL's own flags alone and the tab lists four things — FPL's flag, FotMob's
   * absence, a reported move and a completed one — so it read "3" over a list of eleven. A
   * badge that disagrees with the list under it is worse than no badge.
   */
  const ours = all.filter((player) => player.owners.length > 0)
    .filter((player) => isNewsworthy(player) || absences.has(player.id) || moves.has(player.id) || deals.has(player.id))
    .length;
  const visible = rows.slice(0, shown);

  return <section className="news-page">
    <div className="news-filters" role="group" aria-label={t.navNews}>
      {([["ours", `${t.newsOurs} (${ours})`], ["all", t.newsAll], ["articles", t.newsArticles]] as Array<[Filter, string]>)
        .map(([key, label]) => <button
          key={key}
          className={filter === key ? "active" : ""}
          onClick={() => { setFilter(key); setShown(PAGE); }}
        >{label}</button>)}
    </div>

    {filter === "articles" ? <Articles language={language} />
      : <>

    <div className="news-list">
      {visible.map((player) => {
        const flag = flagOf(player);
        const absence = absences.get(player.id);
        const move = moves.get(player.id);
        const deal = deals.get(player.id);
        const own = player.news ? translateNews(player.news, language) : null;
        const back = absence?.expectedReturn ? translateReturn(absence.expectedReturn, language) : null;
        return <article className={`news-row level-${flag.level} ${player.owners.length ? "is-held" : ""}`} key={player.id}>
          <span className="news-player">
            <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${player.position === "GK" ? "optimized-gk" : "optimized"}/${player.club.toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
            <b>{player.name}</b>
            <small>{player.club} · {player.position} · £{player.cost.toFixed(1)}m</small>
          </span>

          <span className="news-flag-cell"><Flag player={player} absence={absence} move={move} deal={deal} /></span>

          <span className="news-word">
            {/* FPL's own sentence, verbatim. It is the most reliable thing on this page and
                paraphrasing it would only add a second version to disagree with. */}
            {/* FPL's own sentence, translated but not paraphrased: the words are its own
                judgement and only the language is ours, so the original stays on the title
                for a reader who wants to check what was actually published. */}
            <em title={own?.original ?? back?.original ?? undefined}>{own?.text || (absence
              ? t.absenceTitle
                .replace("{reason}", t.absenceReason[absence.reason] ?? absence.reason)
                .replace("{return}", translateReturn(absence.expectedReturn, language).text || "—")
              : deal
                ? (deal.onLoan ? t.hasJoinedOnLoan : t.hasJoined).replace("{to}", deal.toClub)
                : move
                  ? t.mayBeMoving
                  : t.newsNoWord)}</em>
            <span className="news-meta">
              {/* FPL says what is wrong; FotMob says when he is back. Both, attributed. */}
              {player.news && absence?.expectedReturn
                && <small className="news-return" title={back?.original ?? undefined}>FotMob: {back?.text}</small>}
              <Since at={player.newsAt} language={language} />
              {player.link && <a href={player.link} target="_blank" rel="noopener noreferrer">
                {t.newsClubWord} <ExternalLink />
              </a>}
            </span>
            {/* Every outlet that has reported it, each linked to its own report. Two named
                reports tell a reader more than one adjective does, which is why the grading
                is not printed at all: `Imminent` against `High` is an interpretation. */}
            {/* A move that has gone through says so, dated, and the reports about it are
                not printed underneath: they had a guess and the answer is now known. FPL's
                own word, when it arrives, appears in the sentence above this one. */}
            {deal && <span className="news-move is-done">
              {/* Only when the sentence above is FPL's or FotMob's about an injury. With
                  nothing else to say the word line is already this move, and printing it
                  twice on one row reads as two separate pieces of news. */}
              {(player.news || absence)
                && <em>{(deal.onLoan ? t.moveDoneOnLoan : t.moveDone).replace("{to}", deal.toClub)}</em>}
              <span className="news-sources"><small>FotMob</small><Since at={deal.at} language={language} /></span>
            </span>}
            {!deal && move && <span className="news-move">
              <em>{(player.news || absence ? t.alsoMayBeMoving : t.movingTo)
                .replace("{to}", move.destinations.join(", "))}</em>
              <span className="news-sources">
                {move.sources.map((source) => source.url
                  ? <a key={source.name} href={source.url} target="_blank" rel="noopener noreferrer">{source.name} <ExternalLink /></a>
                  : <small key={source.name}>{source.name}</small>)}
              </span>
            </span>}
          </span>

          <span className="news-owners">
            {/* The half of this FPL cannot tell you: whose squads he is in. Not whether he
                is in their eleven — that is a fact about one gameweek, and this column is
                about who holds him, where a benched player is held exactly as much as a
                starting one. The armband stays, because a doubtful captain is the one case
                where the gameweek and the ownership are the same question. */}
            {player.owners.length
              ? player.owners.map((owner) => <b key={owner.managerId}>
                {owner.teamName}{owner.captain ? " (C)" : ""}
              </b>)
              : <em className="quiet">{t.newsNobodyHere}</em>}
            <small>{player.ownership.toFixed(1)} % {t.newsGlobally}</small>
          </span>
        </article>;
      })}
      {!visible.length && <div className="price-empty">{t.newsNothing}</div>}
    </div>

    {shown < rows.length && <div className="price-foot">
      <button className="history-more" onClick={() => setShown((value) => value + PAGE)}>{t.showMore}</button>
    </div>}

    <p className="price-disclaimer">{t.newsNote}</p>
    </>}
  </section>;
}
