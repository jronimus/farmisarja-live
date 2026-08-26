import { useEffect, useMemo, useState } from "react";
import { Clock3, ExternalLink } from "lucide-react";
import { translations } from "./i18n";
import { flagOf, isNewsworthy, newsOrder } from "./services/playerNews";
import { isStrong, loadRumours, rumoursEndpoint, type Rumour } from "./services/rumours";
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

function Flag({ player }: { player: PlayerNews }) {
  const flag = flagOf(player);
  if (flag.level === "none") return <i className="news-flag flag-bench">0</i>;
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
function Rumours({ language, owners }: { language: Language; owners: Map<number, RumourOwner> }) {
  const t = translations(language);
  const [rumours, setRumours] = useState<Rumour[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [strongOnly, setStrongOnly] = useState(true);

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

  // Ours first, then the strongest, then the newest. A league squad's rumour is the only
  // one on this page anybody has to act on.
  const shown = rumours
    .filter((rumour) => !strongOnly || isStrong(rumour))
    .sort((a, b) => (owners.get(b.element)?.owners.length ?? 0) - (owners.get(a.element)?.owners.length ?? 0)
      || (a.strength === b.strength ? 0 : a.strength === "imminent" ? -1 : b.strength === "imminent" ? 1 : a.strength === "high" ? -1 : 1)
      || b.reportedAt.localeCompare(a.reportedAt));

  return <>
    <div className="topic-filters">
      <button className={strongOnly ? "active" : ""} onClick={() => setStrongOnly(true)}>{t.rumoursOnlyStrong}</button>
      <button className={strongOnly ? "" : "active"} onClick={() => setStrongOnly(false)}>{t.newsAll}</button>
    </div>

    <div className="news-list">
      {shown.map((rumour) => {
        const player = owners.get(rumour.element);
        const held = player?.owners ?? [];
        return <article className={`news-row rumour-${rumour.strength} ${held.length ? "is-held" : ""}`} key={rumour.id}>
          <span className="news-player">
            <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${player?.position === "GK" ? "optimized-gk" : "optimized"}/${(player?.club ?? rumour.fromClub).toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
            <b>{player?.name ?? rumour.player}</b>
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
  // The rumour list is about FPL elements, and the exposure it needs is the same exposure
  // the flag rows carry — so it is read off the one list rather than fetched again.
  const ownersByElement = useMemo(
    () => new Map(all.map((player) => [player.id, { name: player.name, club: player.club, position: player.position, owners: player.owners }])),
    [all],
  );

  const rows = useMemo(() => {
    const list = all.filter(isNewsworthy).filter((player) => filter === "all" || player.owners.length > 0);
    return [...list].sort(newsOrder);
  }, [all, filter]);

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
      : filter === "rumours" ? <Rumours language={language} owners={ownersByElement} />
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

          <span className="news-flag-cell"><Flag player={player} /></span>

          <span className="news-word">
            {/* FPL's own sentence, verbatim. It is the most reliable thing on this page and
                paraphrasing it would only add a second version to disagree with. */}
            <em>{player.news || t.newsNoWord}</em>
            <span className="news-meta">
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
