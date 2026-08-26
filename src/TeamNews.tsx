import { useMemo, useState } from "react";
import { Clock3, ExternalLink } from "lucide-react";
import { translations } from "./i18n";
import { benchWatch, flagOf, isNewsworthy, newsOrder } from "./services/playerNews";
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

type Filter = "ours" | "all" | "bench";

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

export default function TeamNews({ data, language }: { data: DashboardData; language: Language }) {
  const t = translations(language);
  const [filter, setFilter] = useState<Filter>("ours");
  const [shown, setShown] = useState(PAGE);

  const all = data.playerNews ?? [];

  const rows = useMemo(() => {
    const list = filter === "bench"
      // Fit, unflagged, in somebody's eleven here, and yet not starting for his club. This
      // is the list FPL cannot produce, because FPL only answers whether he *can* play.
      ? all.filter((player) => player.owners.some((owner) => owner.starter)
        && benchWatch({ status: player.status, starts: player.starts, teamGames: player.teamGames, starter: true }))
      : all.filter(isNewsworthy).filter((player) => filter === "all" || player.owners.length > 0);
    return [...list].sort(newsOrder);
  }, [all, filter]);

  if (!data.playerNews) {
    return <section className="data-pending" role="status">
      <Clock3 />
      <strong>{t.newsUnavailable}</strong>
    </section>;
  }

  const ours = all.filter(isNewsworthy).filter((player) => player.owners.length > 0).length;
  const visible = rows.slice(0, shown);

  return <section className="news-page">
    <div className="news-filters" role="group" aria-label={t.navNews}>
      {([["ours", `${t.newsOurs} (${ours})`], ["all", t.newsAll], ["bench", t.newsBench]] as Array<[Filter, string]>)
        .map(([key, label]) => <button
          key={key}
          className={filter === key ? "active" : ""}
          onClick={() => { setFilter(key); setShown(PAGE); }}
        >{label}</button>)}
    </div>

    <div className="news-list">
      {visible.map((player) => {
        const flag = flagOf(player);
        const bench = benchWatch({ status: player.status, starts: player.starts, teamGames: player.teamGames, starter: true });
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
            <em>{player.news || (bench
              ? t.benchWatchTitle.replace("{games}", String(bench.games))
              : t.newsNoWord)}</em>
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
      {!visible.length && <div className="price-empty">{filter === "bench" ? t.newsNoBenchWatch : t.newsNothing}</div>}
    </div>

    {shown < rows.length && <div className="price-foot">
      <button className="history-more" onClick={() => setShown((value) => value + PAGE)}>{t.showMore}</button>
    </div>}

    <p className="price-disclaimer">{filter === "bench" ? t.benchWatchNote : t.newsNote}</p>
  </section>;
}
