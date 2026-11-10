import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import { translations } from "./i18n";
import { groupByDay, historyEndpoint, loadPriceHistory, loggedSince, nightOf, type PriceChange } from "./services/priceHistory";
import type { PlayerOwner } from "./services/ownership";
import type { Language } from "./types";

/**
 * What the prices actually did, as against the page beside it, which is about what they
 * might do next.
 *
 * The two are deliberately the same table read twice: the same filters, the same shirt and
 * owner columns, the same left-hand identity. What changes is the middle — a prediction
 * there, a movement here — because that is the only thing that differs between the two
 * questions.
 */

/** A week at a time. Thirty-one days of nights at once is a scroll, not a page. */
const DAYS_STEP = 7;

function DayHeading({ day, language, risers, fallers }: { day: string; language: Language; risers: number; fallers: number }) {
  const t = translations(language);
  const date = new Date(`${day}T12:00:00`);
  const today = new Date();
  const dayOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((dayOf(today) - dayOf(date)) / 86_400_000);
  // The same reckoning the prediction column uses, read the other way: a change stamped at
  // 02:00 belongs to the evening the reader watched it coming.
  const relative = days === 0 ? t.historyToday : days === 1 ? t.historyYesterday : null;
  const written = new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { weekday: "short", day: "numeric", month: "numeric" }).format(date);
  return <div className="history-day">
    <b>{relative ?? written}</b>
    {relative && <small>{written}</small>}
    <span className="history-tally">
      <i className="up">▲ {risers}</i>
      <i className="down">▼ {fallers}</i>
    </span>
  </div>;
}

export default function PriceHistory({ language, owners, matches, direction }: {
  language: Language;
  owners: Map<number, PlayerOwner[]>;
  /** The page's own player filters — search, team, position, club — already applied. */
  matches: (row: { id: number; name: string; position: string; club: string }) => boolean;
  direction: "all" | "risers" | "fallers" | "locked";
}) {
  const t = translations(language);
  const [changes, setChanges] = useState<PriceChange[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [days, setDays] = useState(DAYS_STEP);

  useEffect(() => {
    let active = true;
    loadPriceHistory()
      .then((next) => { if (active) setChanges(next ?? []); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const filtered = (changes ?? []).filter((change) => {
      // The log names a player `player` and an element `element`; the filter asks for the
      // same two under the names the market table gave them.
      if (!matches({ id: change.element, name: change.player, position: change.position, club: change.club })) return false;
      // Locked is a state of the prediction column and has no meaning behind us; a change
      // that has happened is either up or down.
      if (direction === "risers" && change.to < change.from) return false;
      if (direction === "fallers" && change.to > change.from) return false;
      return true;
    });
    return groupByDay(filtered);
  }, [changes, matches, direction]);

  useEffect(() => { setDays(DAYS_STEP); }, [matches, direction]);

  if (!historyEndpoint) return <section className="data-pending" role="status">
    <Clock3 />
    <strong>{t.historyUnavailable}</strong>
  </section>;

  if (failed) return <section className="data-pending" role="status">
    <Clock3 />
    <strong>{t.historyUnavailable}</strong>
  </section>;

  if (!changes) return <section className="data-pending" role="status">
    <Clock3 />
    <strong>{t.historyLoading}</strong>
  </section>;

  const since = loggedSince(changes);
  const visible = groups.slice(0, days);

  const row = (change: PriceChange) => {
    const rising = change.to > change.from;
    const held = owners.get(change.element) ?? [];
    return <div className={`history-row ${held.length ? "is-held" : ""}`} key={change.id}>
      <span className="price-player" data-label={t.player}>
        <i className="shirt"><img className="shirt-image" src={`${import.meta.env.BASE_URL}kits/${change.position === "GK" ? "optimized-gk" : "optimized"}/${change.club.toLowerCase()}.webp?v=20260823-gk3`} alt="" /></i>
        <b>{change.player}</b>
        <small>{change.club} · {change.position}</small>
      </span>
      <span className="price-owners-cell" data-label={t.leagueOwners}>
        {held.length
          ? <span className="price-owners">{held.map((owner) => <b key={owner.managerId} title={`${owner.teamName} · ${owner.managerName}`}>{owner.teamName}</b>)}</span>
          : <span className="price-owners empty">—</span>}
      </span>
      <span className="history-move" data-label={t.priceMove}>
        <em>£{change.from.toFixed(1)}m</em>
        <ArrowRight className={rising ? "up" : "down"} />
        <b className={rising ? "up" : "down"}>£{change.to.toFixed(1)}m</b>
      </span>
      <span className="history-season" data-label={t.seasonChange}>
        <b className={change.seasonChange >= 0 ? "up" : "down"}>
          {change.seasonChange > 0 ? "+" : change.seasonChange < 0 ? "−" : ""}£{Math.abs(change.seasonChange).toFixed(1)}m
        </b>
      </span>
      <span className="price-ownership" data-label={t.ownership}>
        <b>{language === "fi" ? `${change.ownership.toFixed(1)} %` : `${change.ownership.toFixed(1)}%`}</b>
      </span>
    </div>;
  };

  return <div className="price-history">
    <div className="price-table">
      <div className="history-head">
        <span className="head-player">{t.player}</span>
        <span className="head-owners">{t.leagueOwners}</span>
        <span className="head-move">{t.priceMove}</span>
        <span className="head-season">{t.seasonChange}</span>
        <span className="head-ownership">{t.ownership}</span>
      </div>
      {visible.map((group) => <div className="history-group" key={group.day}>
        <DayHeading day={group.day} language={language} risers={group.risers.length} fallers={group.fallers.length} />
        {[...group.risers, ...group.fallers].map(row)}
      </div>)}
      {!visible.length && <div className="price-empty">{t.noChangesLogged}</div>}
    </div>

    {days < groups.length && <div className="price-foot">
      <button className="history-more" onClick={() => setDays((value) => value + DAYS_STEP)}>{t.showMoreDays}</button>
    </div>}

    {/* The log's own age, said plainly. A history that starts on the night the site began
        watching would otherwise read as a season in which nothing happened before then. */}
    <p className="price-disclaimer">
      {since
        // The night, not the stamp: the date under the table has to be the same date the
        // first heading in it carries, or the log appears to start a day after it does.
        ? t.historySince.replace("{date}", new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(`${nightOf(since)}T12:00:00`)))
        : t.historyEmpty}
    </p>
  </div>;
}
