import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, ExternalLink } from "lucide-react";
import { translations } from "./i18n";
import { flagOf, isNewsworthy, newsOrder } from "./services/playerNews";
import { absencesByElement, isStrong, loadFotmob, loadRumours, rumoursEndpoint, type Absence, type Rumour } from "./services/rumours";
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

type Filter = "ours" | "all" | "rumours" | "articles";

/** Anyone the league is exposed to comes first; the rest of the game is behind a filter. */
const PAGE = 40;

function Flag({ player, absence }: { player: PlayerNews; absence?: Absence }) {
  const flag = flagOf(player);
  // FotMob has him out and FPL has not said so yet. It is not FPL's percentage, so it does
  // not get FPL's colours: an exclamation in the amber that means "read this".
  if (flag.level === "none") return <i className={`news-flag ${absence ? "flag-major" : "flag-bench"}`}>{absence ? "!" : "0"}</i>;
  return <i className={`news-flag flag-${flag.level}`}>
    {flag.level === "out" ? "✕" : `${flag.chance}`}
  </i>;
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
          <Since at={article.published} language={language} />
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
type RumourSort = "strength" | "player" | "league" | "reported" | "owners";

const STRENGTH_RANK: Record<Rumour["strength"], number> = { imminent: 2, high: 1, low: 0 };

function Rumours({ language, owners, managers }: {
  language: Language;
  owners: Map<number, RumourOwner>;
  managers: Array<{ id: number; teamName: string }>;
}) {
  const t = translations(language);
  const [rumours, setRumours] = useState<Rumour[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [team, setTeam] = useState("");
  // The strongest first, because that is the order the old "strong only" button was really
  // asking for — and as a sort it costs nothing to look past it at the rest.
  const [sort, setSort] = useState<RumourSort>("strength");
  const [descending, setDescending] = useState(true);

  useEffect(() => {
    let active = true;
    loadRumours()
      .then((next) => { if (active) setRumours(next ?? []); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  if (!rumoursEndpoint || failed) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.rumoursUnavailable}</strong>
  </section>;
  if (!rumours) return <section className="data-pending" role="status">
    <Clock3 /><strong>{t.rumoursLoading}</strong>
  </section>;

  const heldBy = (rumour: Rumour) => owners.get(rumour.element)?.owners ?? [];
  const nameOf = (rumour: Rumour) => owners.get(rumour.element)?.name ?? rumour.player;

  const shown = rumours
    .filter((rumour) => !team || heldBy(rumour).some((owner) => String(owner.managerId) === team))
    .sort((a, b) => {
      const by = sort === "player" ? nameOf(a).localeCompare(nameOf(b))
        : sort === "league" ? Number(a.staysInLeague) - Number(b.staysInLeague)
        : sort === "reported" ? a.reportedAt.localeCompare(b.reportedAt)
        : sort === "owners" ? heldBy(a).length - heldBy(b).length
        : STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength];
      // Every column falls back to the same second key, so rows never shuffle at random
      // within a tie: the newest report of the same weight is the one worth reading.
      return (by || a.reportedAt.localeCompare(b.reportedAt)) * (descending ? -1 : 1);
    });

  const header = (label: string, key: RumourSort) => <button
    className={`price-sort ${sort === key ? "active" : ""}`}
    onClick={() => { if (sort === key) setDescending((value) => !value); else { setSort(key); setDescending(true); } }}
  >{label}{sort === key && (descending ? <ArrowDown /> : <ArrowUp />)}</button>;

  return <>
    <div className="news-filters-row">
      <select className="period-select" value={team} onChange={(event) => setTeam(event.target.value)} aria-label={t.allTeams}>
        <option value="">{t.allTeams}</option>
        {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.teamName}</option>)}
      </select>
      <span className="news-count">{shown.length} {t.rumoursShown}</span>
    </div>

    <div className="news-list">
      <div className="news-row news-head rumour-head">
        <span>{header(t.player, "player")}</span>
        <span>{header(t.rumourStrengthWord, "strength")}</span>
        <span>{header(t.rumourLeagueWord, "league")} {header(t.rumourReportedWord, "reported")}</span>
        <span>{header(t.leagueOwners, "owners")}</span>
      </div>
      {shown.map((rumour) => {
        const player = owners.get(rumour.element);
        const held = heldBy(rumour);
        return <article className={`news-row rumour-${rumour.strength} ${held.length ? "is-held" : ""}`} key={rumour.id}>
          <span className="news-player">
            <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${player?.position === "GK" ? "optimized-gk" : "optimized"}/${(player?.club ?? rumour.fromClub).toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
            <b>{nameOf(rumour)}</b>
            <small>{rumour.fromClub} {t.rumourTo.replace("{to}", rumour.toClub)}</small>
          </span>

          <span className="news-flag-cell">
            <i className={`news-flag strength-${rumour.strength}`}>{t.rumourStrength[rumour.strength]}</i>
          </span>

          <span className="news-word">
            <em>{rumour.staysInLeague ? t.rumourStaysInLeague : t.rumourLeavesLeague}</em>
            <span className="news-meta">
              <Since at={rumour.reportedAt} language={language} />
              {rumour.sourceUrl
                ? <a href={rumour.sourceUrl} target="_blank" rel="noopener noreferrer">{rumour.source} <ExternalLink /></a>
                : <small>{t.rumourSourceWord}: {rumour.source}</small>}
            </span>
          </span>

          <span className="news-owners">
            {held.length
              ? held.map((owner) => <b key={owner.managerId} className={owner.starter ? "starting" : ""}>
                {owner.teamName}{owner.captain ? " (C)" : ""}
              </b>)
              : <em className="quiet">{t.newsNobodyHere}</em>}
          </span>
        </article>;
      })}
      {!shown.length && <div className="price-empty">{t.rumoursNone}</div>}
    </div>

    <p className="price-disclaimer">{t.rumoursNote}</p>
  </>;
}

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
      .filter((player) => isNewsworthy(player) || absences.has(player.id))
      .filter((player) => filter === "all" || player.owners.length > 0);
    return [...list].sort(newsOrder);
  }, [all, filter, absences]);

  // These two read the Worker, not FPL, so an FPL outage is no reason to hide them.
  if (!data.playerNews && filter !== "articles" && filter !== "rumours") {
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

  const ours = all.filter(isNewsworthy).filter((player) => player.owners.length > 0).length;
  const visible = rows.slice(0, shown);

  return <section className="news-page">
    <div className="news-filters" role="group" aria-label={t.navNews}>
      {([["ours", `${t.newsOurs} (${ours})`], ["all", t.newsAll], ["rumours", t.newsRumours], ["articles", t.newsArticles]] as Array<[Filter, string]>)
        .map(([key, label]) => <button
          key={key}
          className={filter === key ? "active" : ""}
          onClick={() => { setFilter(key); setShown(PAGE); }}
        >{label}</button>)}
    </div>

    {filter === "articles" ? <Articles language={language} />
      : filter === "rumours" ? <Rumours language={language} owners={ownersByElement} managers={data.managers} />
      : <>

    <div className="news-list">
      {visible.map((player) => {
        const flag = flagOf(player);
        return <article className={`news-row level-${flag.level} ${player.owners.length ? "is-held" : ""}`} key={player.id}>
          <span className="news-player">
            <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${player.position === "GK" ? "optimized-gk" : "optimized"}/${player.club.toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
            <b>{player.name}</b>
            <small>{player.club} · {player.position} · £{player.cost.toFixed(1)}m</small>
          </span>

          <span className="news-flag-cell"><Flag player={player} absence={absences.get(player.id)} /></span>

          <span className="news-word">
            {/* FPL's own sentence, verbatim. It is the most reliable thing on this page and
                paraphrasing it would only add a second version to disagree with. */}
            <em>{player.news || (absences.get(player.id)
              ? t.absenceTitle
                .replace("{reason}", t.absenceReason[absences.get(player.id)!.reason] ?? absences.get(player.id)!.reason)
                .replace("{return}", absences.get(player.id)!.expectedReturn || "—")
              : t.newsNoWord)}</em>
            <span className="news-meta">
              {/* FPL says what is wrong; FotMob says when he is back. Both, attributed. */}
              {player.news && absences.get(player.id)?.expectedReturn
                && <small className="news-return">FotMob: {absences.get(player.id)!.expectedReturn}</small>}
              <Since at={player.newsAt} language={language} />
              {player.link && <a href={player.link} target="_blank" rel="noopener noreferrer">
                {t.newsClubWord} <ExternalLink />
              </a>}
            </span>
          </span>

          <span className="news-owners">
            {/* The half of this FPL cannot tell you. A squad starting him is a different
                problem from a squad with him on the bench, so the two are not painted alike. */}
            {player.owners.length
              ? player.owners.map((owner) => <b key={owner.managerId} className={owner.starter ? "starting" : ""}>
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
